var activeLayer, startTime;
var layers = [];
var teams = [];
var seenIDs = [];

// customizable for your hackathon

// source of task manager
var taskSrc = "teachosm.org";

// projects in Task Manager
var projects = [33];

// tags e.g. amenity = school add { "amenity": [ "school" ] }
var targetTags = {
  "amenity": [
    "school",
    "hospital",
    "park"
  ],
  "building": [
    "yes",
    "ger"
  ]
};

// prevent double-counting by adding OSM IDs to the existing count
function filterIDs(changesets) {
  var filterChangesets = function(changeset, type) {
    var items = changeset[type] || [];
    for (var n = items.length - 1; n >= 0; n--) {
      var id = type + ":" + items[n].$.id;
      if ((items[n].$.id * 1 <= 0) || (seenIDs.indexOf(id) > -1)) {
        items.splice(n, 1);
      } else {
        seenIDs.push(id);
      }
    }
  };

  for (var c = 0; c < changesets.length; c++) {
    filterChangesets(changesets[c], "node");
    filterChangesets(changesets[c], "way");
    filterChangesets(changesets[c], "relation");
  }
}

// get the current visible team (for adding users)
function getIndex() {
  var slides = $(".owl-item");
  for (var i = 0; i < slides.length; i++) {
    if ($(slides[i]).hasClass("active")) {
      return i;
    }
  }
}

// draw a lat-lng node on the map for this team
function mapNode(node, color, index) {
  if (!index) {
    index = getIndex();
  }
  var lat = node.$.lat * 1;
  var lon = node.$.lon * 1;
  if (!isNaN(lat) && !isNaN(lon)) {
    var circleOpts = { color: color, fillColor: color, radius: 3 };
    L.circleMarker(L.latLng(lat, lon), circleOpts).addTo(layers[index]);
  }
}

// given created, modified, or deleted items, add items to the appropriate counter
function updateCount(list, color, index) {
  var counter = 0;
  for (var c = 0; c < list.length; c++) {
    counter += (list[c].relation || []).length;
    counter += (list[c].way || []).length;

    // only count nodes if they were tagged (not part of a way)
    // map nodes in ways to illustrate them, but only 1/4 to simplify circles and things
    var nodeCount = 0;
    list[c].node = list[c].node || [];
    for(var n = 0; n < list[c].node.length; n++) {
      if (list[c].node[n].tag) {
        counter++;
      } else if (Math.random() > 0.75) {
        mapNode(list[c].node[n], color, index);
      }
    }
  }
  return counter;
}

// given an array of nodes, ways, or relations - look for target tags
function findTags(list, index) {
  var teamPage = $($(".item")[index]);
  for (var n = 0; n < list.length; n++) {
    var tags = list[n].tag;
    if (!tags) {
      continue;
    }
    for (var t = 0; t < tags.length; t++) {
      var key = tags[t].$.k;
      var value = tags[t].$.v;
      if (targetTags[key] && targetTags[key].indexOf(value) > -1) {
        // target tag found, register to team
        var newTag = false;
        if (!teams[index].tagCounts[key]) {
          newTag = true;
          teams[index].tagCounts[key] = {};
        }
        if (!teams[index].tagCounts[key][value]) {
          newTag = true;
          teams[index].tagCounts[key][value] = 0;
        }
        teams[index].tagCounts[key][value]++;

        // add the new tag to the UI
        if (newTag) {
          teamPage.find(".tags").append(
            $("<li>")
              .text(key + ": " + value)
              .addClass(key + value)
              .append(
                $("<span>").addClass("smallnum")
              )
          );
        }

        // update count
        teamPage.find(".tags ." + key + value + " .smallnum").text(teams[index].tagCounts[key][value]);
      }
    }
  }
}

// given a list of changesets, split it up into nodes, ways, and relations
// then find target tags
function countTags(list, index) {
  for (var c = 0; c < list.length; c++) {
    list[c].node = list[c].node || [];
    findTags(list[c].node, index);

    list[c].way = list[c].way || [];
    findTags(list[c].way, index);

    list[c].relation = list[c].relation || [];
    findTags(list[c].relation, index);
  }
}

// update the stats for this team
function refreshTeam(index) {
  var teamCounts = teams[index].counts;
  var updateTime = (new Date()) * 1;

  var teamPage = $($(".item")[index]);
  teamPage.find(".users").html("");

  var processUser = function(data) {
    // prevent double-counting
    filterIDs(data.create);
    filterIDs(data.modify);
    filterIDs(data["delete"]);

    // count tags
    countTags(data.create, index);
    countTags(data.modify, index);
    countTags(data["delete"], index);

    // count items
    teamCounts[0] += updateCount(data.create, "#0f0", index);
    teamPage.find(".created .number").text(teamCounts[0]);

    teamCounts[1] += updateCount(data.modify, "#00f", index);
    teamPage.find(".modified .number").text(teamCounts[1]);

    teamCounts[2] += updateCount(data["delete"], "#f00", index);
    teamPage.find(".deleted .number").text(teamCounts[2]);
  };

  for (var i = 0; i < teams[index].users.length; i++) {
    var user = teams[index].users[i];
    teamPage.find(".users").append($("<li>" + user.name + "</li>"));

    if (updateTime < user.lastUpdate + (2 * 60 * 1000)) {
      // don't over-update me
      continue;
    }
    $.getJSON("/userUpdate?name=" + user.name + "&lastUpdate=" + user.lastUpdate, processUser);
    // set for next update
    teams[index].users[i].lastUpdate = updateTime;
  }
}

// create a new team
function addTeam(teamName) {
  var layer = L.layerGroup();
  layers.push(layer);
  if (!activeLayer) {
    activeLayer = layer;
    layer.addTo(map);
  }

  $($(".item")[teams.length]).find('.team-name').text(teamName);

  teams.push({
    name: teamName,
    users: [],
    counts: [0, 0, 0],
    tagCounts: {}
  });
}

// add a user to the current team (or index)
function addUser(username, index) {
  if (!index) {
    index = getIndex();
  }
  if (username) {
    for (var u = 0; u < teams[index].users.length; u++) {
      if (teams[index].users[u].name === username) {
        return;
      }
    }
    teams[index].users.push({
      name: username,
      lastUpdate: startTime
    });
    refreshTeam(index);
  }
}

// gets a URL parameter
function gup(name) {
  var url = window.location.href;
  name = name.replace(/[\[]/,"\\\[").replace(/[\]]/,"\\\]");
  var regexS = "[\\?&]"+name+"=([^&#]*)";
  var regex = new RegExp( regexS );
  var results = regex.exec( url );
  return results === null ? null : results[1];
}

// initialize
$(function() {
  // Leaflet map
  map = L.map('map').setView([47.9214, 106.912], 13);
  map.attributionControl.setPrefix('');
  L.tileLayer('http://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);

  // Owl Carousel for switching between teams
  var owl = $('.owl-carousel').owlCarousel({
    loop: false,
    nav: true,
    items: 1
  });
  owl.on('changed.owl.carousel', function(e) {
    var index = e.page.index;
    refreshTeam(index);
    map.removeLayer(activeLayer);
    activeLayer = layers[index];
    activeLayer.addTo(map);
  });

  // without a team and user list, initialize that
  if (!gup("teams")) {
    addTeam("1");
  }

  // measure from start of the hackathon
  startTime = 1 * gup("start");
  // demo easy!
  if (gup("demo")) {
    startTime = 1433372507005;
    addUser("mapmeld");

    // sample second team
    addTeam("world");
    addUser("zorque", 1);
  }
  if (!startTime || isNaN(startTime)) {
    startTime = (1 * new Date()) - 24 * 60 * 60 * 1000;
    window.location = "?start=" + startTime;
    return;
  }

  // adding a new user by OSM username
  $(".add-user").click(function() {
    var username = $(".user-name").val();
    $(".user-name").val("");
    addUser(username);
  });

  // adding a new team
  $(".add-team").click(function() {
    var teamName = $("input.team-name").val();
    $("input.team-name").val("");
    addTeam(teamName);
  });

  // refreshing tiles
  $(".refresh-tiles").click(function() {
    $.getJSON("/taskUpdate?projects=" + projects.join(",") + "&taskSrc=" + taskSrc, function(data) {
      $(".completed .number").text("0");
      for (var user in data) {
        if(data.hasOwnProperty(user)) {
          var foundUser = false;
          for (var t = 0; t < teams.length; t++) {
            for (var u = 0; u < teams[t].users.length; u++) {
              var tuser = teams[t].users[u];
              if (tuser.name === user) {
                var currentCount = $($(".item")[t]).find(".completed .number").text() * 1;
                $($(".item")[t]).find(".completed .number").text(data[user] * 1 + currentCount);
                foundUser = true;
                break;
              }
            }
            if (foundUser) {
              break;
            }
          }
        }
      }
    });
  });
});
