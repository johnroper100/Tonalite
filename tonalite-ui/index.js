var express = require('express');
var app = express();
var http = require('http').createServer(app);
const io = require('socket.io')(http);
const fs = require('fs');

require.extensions['.jlib'] = require.extensions['.json'];

artnet = require('artnet')({ sendAll: true });

fixtures = [];

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

function generateID() {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
};

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
                            modes.push({ "mode": fixture.personalities[p].modeName, "file": files[f] });
                        }
                    }
                }
            }
            socket.emit('fixtureProfileModes', modes);
        });
    });

    socket.on('addDevice', function (msg) {
        var fixtureFile = require(process.cwd() + "/fixtures/" + msg.file);
        var startAddress = parseInt(msg.address);
        let p = 0; const pMax = fixtureFile.personalities.length; for (; p < pMax; p++) {
            if (fixtureFile.personalities[p].modelName == msg.profile && fixtureFile.personalities[p].modeName == msg.mode && fixtureFile.personalities[p].manufacturerName == msg.manufacturer) {
                let i = 0; const iMax = parseInt(msg.count); for (; i < iMax; i++) {
                    var fixture = JSON.parse(JSON.stringify(fixtureFile.personalities[p]));
                    fixture.i = generateID();
                    fixture.x = parseInt(fixtures.length % 14);
                    fixture.y = parseInt(fixtures.length / 14);
                    fixture.w = 1;
                    fixture.h = 1;
                    fixture.name = fixture.modelName;
                    fixture.address = startAddress;
                    startAddress += fixture.maxOffset + 1 + parseInt(msg.offset);
                    fixture.universe = parseInt(msg.universe);
                    fixtures.push(fixture);
                }
            }
        }
        io.emit('fixtures', fixtures);
    });

    socket.on('fixtureItemMoved', function (msg) {
        var fixture = fixtures[fixtures.map(el => el.i).indexOf(msg.id)];
        fixture.x = msg.x;
        fixture.y = msg.y;
        socket.broadcast.emit('fixtures', fixtures);
    });
});