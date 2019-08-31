var express = require('express');
var app = express();
var http = require('http').createServer(app);
const io = require('socket.io')(http);
const fs = require('fs');

require.extensions['.jlib'] = require.extensions['.json'];

artnet = require('artnet')({ sendAll: true });

fixtures = [{ "x": 0, "y": 0, "w": 1, "h": 1, "i": "5", "name": "Martin Mac 360", "mode": "Mode 1", "universe": 0, "coarse": 6, channels: ["hi"] }];

http.listen(3000, function () {
    console.log(`Tonalite DMX Lighting Control System`);
});

app.use('/static', express.static(__dirname + '/static'));
app.use('/docs', express.static(__dirname + '/docs/dist'));

app.get('/', function (req, res) {
    res.sendFile(__dirname + '/index.html');
});

app.get('/presets', function (req, res) {
    res.sendFile(__dirname + '/presets.html');
});

app.get('/open-source-licenses', function (req, res) {
    res.sendFile(__dirname + '/open-source-licenses.txt');
});

app.get('/showFile', function (req, res) {
    res.download(process.cwd() + '/show.json', moment().format() + '.tonalite', { headers: { 'Content-Disposition': 'attachment', 'Content-Type': 'application/octet-stream' } });
});

io.on('connection', function (socket) {
    socket.emit('fixtures', fixtures);

    socket.on('getFixtureProfileManufacturers', function () {
        fs.readdir(process.cwd() + "/fixtures", (err, files) => {
            var manufacturers = [];
            let f = 0; const fMax = files.length; for (; f < fMax; f++) {
                var fixture = require(process.cwd() + "/fixtures/" + files[f]);
                let p = 0; const pMax = fixture.personalities.length; for (; p < pMax; p++) {
                    if (manufacturers.indexOf(fixture.personalities[p].manufacturerName) < 0) {
                        manufacturers.push(fixture.personalities[p].manufacturerName);
                    }
                }
            }
            socket.emit('fixtureProfilesManufacturers', manufacturers);
        });
    });

    socket.on('getFixtureProfiles', function (manufacturer) {
        fs.readdir(process.cwd() + "/fixtures", (err, files) => {
            var profiles = [];
            let f = 0; const fMax = files.length; for (; f < fMax; f++) {
                var fixture = require(process.cwd() + "/fixtures/" + files[f]);
                let p = 0; const pMax = fixture.personalities.length; for (; p < pMax; p++) {
                    if (fixture.personalities[p].manufacturerName == manufacturer) {
                        if (profiles.indexOf(fixture.personalities[p].modelName) < 0) {
                            profiles.push(fixture.personalities[p].modelName);
                        }
                    }
                }
            }
            socket.emit('fixtureProfiles', profiles);
        });
    });

    socket.on('getFixtureProfileModes', function (msg) {
        fs.readdir(process.cwd() + "/fixtures", (err, files) => {
            var modes = [];
            let f = 0; const fMax = files.length; for (; f < fMax; f++) {
                var fixture = require(process.cwd() + "/fixtures/" + files[f]);
                let p = 0; const pMax = fixture.personalities.length; for (; p < pMax; p++) {
                    if (fixture.personalities[p].manufacturerName == msg.manufacturer && fixture.personalities[p].modelName == msg.profile) {
                        if (modes.indexOf(fixture.personalities[p].modeName) < 0) {
                            modes.push(fixture.personalities[p].modeName);
                        }
                    }
                }
            }
            socket.emit('fixtureProfileModes', modes);
        });
    });
});