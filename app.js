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
        var closeTime = new Date($(changesets[c]).attr("closed_at"));
        if (closeTime < lastUpdate) {
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

var server = app.listen(process.env.PORT || 3000, function () {
  var port = server.address().port;
});

module.exports = app;
