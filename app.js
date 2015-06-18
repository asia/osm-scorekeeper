var express = require('express');
var bodyParser = require('body-parser');
var compression = require('compression');
var $ = require('cheerio');
var request = require('request');
var parseString = require('xml2js').parseString;

var app = express();
app.set('views', __dirname + '/views');
app.set('view engine', 'jade');
app.use(express['static'](__dirname + '/static'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(compression());

app.get('/', function(req, res) {
  res.render('index');
});

app.get('/userUpdate', function(req, res) {
  var lastUpdate = req.query.lastUpdate;
  var name = req.query.name;

  if (!lastUpdate || isNaN(lastUpdate * 1) || !name) {
    res.json({
      error: 'bad request',
      name: name,
      lastUpdate: lastUpdate
    });
  } else {
    // provided right params for changeset request
    lastUpdate = new Date(lastUpdate * 1);
    request("http://api.openstreetmap.org/api/0.6/changesets?display_name=" + name, function(err, resp, body) {
      if (err) {
        throw err;
      }

      var changesetIDs = [];
      var changesets = $(body).find('changeset');
      for (var c = 0; c < changesets.length; c++) {
        var closeTime = $(changesets[c]).attr("closed_at");
        if (closeTime && ((new Date(closeTime)) < lastUpdate)) {
          break;
        }
        changesetIDs.push($(changesets[c]).attr("id"));
      }

      // res.json(changesetIDs);
      var changes = {
        create: [],
        modify: [],
        "delete": []
      };
      var measureChanges = function(index) {
        if (index >= changesetIDs.length) {
          return res.json(changes);
        }

        var id = changesetIDs[index];
        request("http://api.openstreetmap.org/api/0.6/changeset/" + id + "/download", function(err, resp, body) {
          if (err) {
            throw err;
          }
          parseString(body, function (err, result) {
            if (err) {
              throw err;
            }
            if (result.osmChange.create) {
              changes.create = changes.create.concat( result.osmChange.create );
            }
            if (result.osmChange.modify) {
              changes.modify = changes.modify.concat( result.osmChange.modify );
            }
            if (result.osmChange["delete"]) {
              changes["delete"] = changes["delete"].concat( result.osmChange["delete"] );
            }
            measureChanges(index + 1);
          });
        });
      };
      measureChanges(0);
    });
  }
});

app.get('/taskUpdate', function(req, res) {
  var projects = req.query.projects.split(',');
  var taskSrc = req.query.taskSrc || 'hotosm.org';
  var userCounts = {};

  var processProject = function(i) {
    if (i >= projects.length) {
      return res.json(userCounts);
    }
    request("http://tasks." + taskSrc + "/project/" + projects[i] + "/tasks.json", function(err, resp, body) {
      if (err) {
        throw err;
      }
      var squares = JSON.parse(body).features;
      var processSquare = function(f) {
        if (f >= squares.length) {
          return processProject(i + 1);
        }
        request({
          url: "http://tasks." + taskSrc + "/project/" + projects[i] + "/task/" + squares[f].id,
          headers: {
            'X-Requested-With': 'XMLHttpRequest'
          }
        }, function (err, resp, body) {
          if (err) {
            throw err;
          }
          var finished = body.indexOf("Marked as done");
          if (finished > -1) {
            var invalidated = body.indexOf("Invalidated");
            if (invalidated === -1 || invalidated > finished) {
              var username = body.split("Marked as done</b> by ")[1].split("</span>")[0];
              if (userCounts[username]) {
                userCounts[username]++;
              } else {
                userCounts[username] = 1;
              }
            }
          }
          processSquare(f + 1);
        });
      };
      try {
        processSquare(0);
      } catch(e) {
        return res.json(userCounts);
      }
    });
  };
  processProject(0);
});

var server = app.listen(process.env.PORT || 3000, function () {
  var port = server.address().port;
});

module.exports = app;
