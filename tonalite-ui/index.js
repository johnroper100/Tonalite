var express = require('express');
var app = express();
var http = require('http').createServer(app);
const io = require('socket.io')(http);
const fs = require('fs');

require.extensions['.jlib'] = require.extensions['.json'];

artnet = require('artnet')({ iface: null, host: "255.255.255.255", sendAll: true });

channels = [];

fixtures = [];
groups = [];

http.listen(3000, "192.168.0.118", function () {
    console.log(`Tonalite DMX Lighting Control System`);
});

app.use('/static', express.static(__dirname + '/static'));

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

function mapRange(num, inMin, inMax, outMin, outMax) {
    return (num - inMin) * (outMax - outMin) / (inMax - inMin) + outMin;
}

function dmxLoop() {
    let f = 0; const fMax = fixtures.length; for (; f < fMax; f++) {
        var fixture = fixtures[f];
        let p = 0; const pMax = fixture.parameters.length; for (; p < pMax; p++) {
            var parameter = fixture.parameters[p];
            artnet.set(fixture.universe - 1, fixture.address + parameter.coarse, parameter.value >> 8);
            if (parameter.fine != null) {
                artnet.set(fixture.universe - 1, fixture.address + parameter.fine, parameter.value & 0xff);
            }
        }
    }
}
setInterval(dmxLoop, 25);

io.on('connection', function (socket) {
    socket.emit('fixtures', fixtures);
    socket.emit('groups', groups);

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

    socket.on('addFixture', function (msg) {
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

                    let c = 0; const cMax = fixture.parameters.length; for (; c < cMax; c++) {
                        fixture.parameters[c].value = fixture.parameters[c].home;
                        fixture.parameters[c].displayValue = fixture.parameters[c].home;
                        fixture.parameters[c].locked = false;
                    }
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

    socket.on('duplicateFixtures', function (fixtureIDs) {
        let id = 0; const idMax = fixtureIDs.length; for (; id < idMax; id++) {
            var originalFixture = fixtures[fixtures.map(el => el.i).indexOf(fixtureIDs[id])];
            var newFixture = JSON.parse(JSON.stringify(originalFixture));
            newFixture.i = generateID();
            newFixture.x = parseInt(fixtures.length % 14);
            newFixture.y = parseInt(fixtures.length / 14);
            fixtures.push(newFixture);
        }
        io.emit('fixtures', fixtures);
    });

    socket.on('deleteFixtures', function (fixtureIDs) {
        let id = 0; const idMax = fixtureIDs.length; for (; id < idMax; id++) {
            if (fixtures.some(e => e.i === fixtureIDs[id])) {
                fixtures.splice(fixtures.map(el => el.i).indexOf(fixtureIDs[id]), 1);
                let g = groups.length - 1; const gMax = 0; for (; gMax <= g; g--) {
                    var group = groups[g];
                    let fid = 0; const fidMax = group.fixtures.length; for (; fid < fidMax; fid++) {
                        if (group.fixtures[fid] == fixtureIDs[id]) {
                            group.fixtures.splice(fid, 1);
                        }
                    }
                    if (group.fixtures.length == 0) {
                        groups.splice(g, 1);
                    }
                }
            }
        }
        io.emit('fixtures', fixtures);
        io.emit('groups', groups);
    });

    socket.on('groupFixtures', function (fixtureIDs) {
        var newGroup = { "i": generateID(), "name": "New Group", "fixtures": [] };
        let id = 0; const idMax = fixtureIDs.length; for (; id < idMax; id++) {
            if (fixtures.some(e => e.i === fixtureIDs[id])) {
                if (newGroup.fixtures.indexOf(fixtureIDs[id]) < 0) {
                    newGroup.fixtures.push(fixtureIDs[id]);
                }
            }
        }
        if (newGroup.fixtures.length > 0) {
            groups.push(newGroup);
        }
        io.emit('groups', groups);
    });

    socket.on('groupGroups', function (groupIDs) {
        var newGroup = { "i": generateID(), "name": "New Group", "fixtures": [] };
        let id = 0; const idMax = groupIDs.length; for (; id < idMax; id++) {
            if (groups.some(e => e.i === groupIDs[id])) {
                var group = groups[groups.map(el => el.i).indexOf(groupIDs[id])];
                let fid = 0; const fidMax = group.fixtures.length; for (; fid < fidMax; fid++) {
                    if (fixtures.some(e => e.i === group.fixtures[fid])) {
                        if (newGroup.fixtures.indexOf(group.fixtures[fid]) < 0) {
                            newGroup.fixtures.push(group.fixtures[fid]);
                        }
                    }
                }
            }
        }
        if (newGroup.fixtures.length > 0) {
            groups.push(newGroup);
        }
        io.emit('groups', groups);
    });

    socket.on('deleteGroups', function (groupIDs) {
        let id = 0; const idMax = groupIDs.length; for (; id < idMax; id++) {
            if (groups.some(e => e.i === groupIDs[id])) {
                groups.splice(groups.map(el => el.i).indexOf(groupIDs[id]), 1);
            }
        }
        io.emit('groups', groups);
    });

    socket.on('updateFixtureParameterValue', function (msg) {
        let id = 0; const idMax = msg.fixtures.length; for (; id < idMax; id++) {
            var fixture = fixtures[fixtures.map(el => el.i).indexOf(msg.fixtures[id])];
            let p = 0; const pMax = fixture.parameters.length; for (; p < pMax; p++) {
                var parameter = fixture.parameters[p];
                if (parameter.name == msg.paramName && parameter.type == msg.paramType) {
                    parameter.value = parseInt(msg.paramValue);
                    parameter.displayValue = parameter.value;
                }
            }
        }
        socket.broadcast.emit('fixtures', fixtures);
    });

    socket.on('resetFixtures', function () {
        let f = 0; const fMax = fixtures.length; for (; f < fMax; f++) {
            var fixture = fixtures[f];
            let p = 0; const pMax = fixture.parameters.length; for (; p < pMax; p++) {
                var parameter = fixture.parameters[p];
                parameter.value = parameter.home;
                parameter.displayValue = parameter.value;
            }
        }
        io.emit('fixtures', fixtures);
    });

    socket.on('resetSelectedFixtures', function (fixtureIDs) {
        let id = 0; const idMax = fixtureIDs.length; for (; id < idMax; id++) {
            var fixture = fixtures[fixtures.map(el => el.i).indexOf(fixtureIDs[id])];
            let p = 0; const pMax = fixture.parameters.length; for (; p < pMax; p++) {
                var parameter = fixture.parameters[p];
                parameter.value = parameter.home;
                parameter.displayValue = parameter.value;
            }
        }
        io.emit('fixtures', fixtures);
    });
});
