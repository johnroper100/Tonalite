const app = require('express')();
const express = require('express');
const favicon = require('serve-favicon');
const compression = require('compression');
const http = require('http').Server(app);
const io = require('socket.io')(http);
const fs = require('fs');
const moment = require('moment');
const fileUpload = require('express-fileupload');
const { spawn } = require('child_process');
const drivelist = require('drivelist');
const unzipper = require('unzipper');
require('sanic.js').changeMyWorld();
const cppaddon = require('./build/Release/cppaddon.node');
const QRCode = require('qrcode');

/*
Features:
- Get Fixtures - Done - Done UI
- Get Fixture Profiles - Done - Done UI
- Add Fixture - Done - Done UI
- Remove Fixture - Done - Done UI
- Get Fixture Settings - Done - Done UI
- Edit Fixture Settings - Done - Done UI
- Get Fixture Parameters - Done - Done UI
- Change Fixture Parameter Value - Done - Done UI
- Parameter Lock - Done - Done UI
- Reset Fixtures - Done - Done UI
- Get Cues - Done - Done UI
- Record Cue - Done - Done UI
- Get Cue Settings - Done - Done UI
- Update Cue - Done - Done UI
- Edit Cue Settings - Done - Done UI
- Clone Cue Last - Done - Done UI
- Clone Cue Next - Done - Done UI
- Move Cue Up - Done - Done UI
- Move Cue Down - Done - Done UI
- Remove Cue - Done - Done UI
- Go To Next Cue - Done - Done UI
- Go To Last Cue - Done - Done UI
- Go To Specific Cue - Done - Done UI
- Stop Running Cue - Done - Done UI
- Get Groups - Done - Done UI
- Add Group - Done - Done UI
- Get Group Parameters - Done - Done UI
- Change Group Parameter Value - Done - Done UI
- Get Group Settings - Done - Done UI
- Edit Group Settings - Done - Done UI
- Remove Group - Done - Done UI
- Reset Group - Done - Done UI
- Reset Groups - Done - Done UI
- Remove Group Fixture - Done - Done UI
- Save Show - Done - Done UI
- Open Show From File - Done - Done UI
- Save Show To File - Done - Done UI
- Save Show To USB - Done - Done UI
- Import Fixture Definition From File - Done - Done UI
- View Docs - Done - Done UI
- View Settings - Done - Done UI
- Save Settings - Done - Done UI
- Update Firmware - Done - Done UI
- View Presets - Done - Done UI
- Record Preset - Done - Done UI
- Edit Preset - Done - Done UI
- Activate/Deactivate Preset - Done UI
- Remove Preset - Done - Done UI
- Preset Kiosk Page - Done - Done UI
- Grandmaster - Done - Done UI
- Blackout - Done - Done UI
- Auto Mark - Done - Done UI
- Fine Control - Done - Done UI
- Reset Presets - Done - Done UI
*/

var SETTINGS = {
    device: "linux", // linux, rpi, win, macos
    url: "localhost", // http web UI location
    port: 3000,
    defaultUpTime: 3,
    defaultDownTime: 3,
    defaultPresetMode: 'ltp',
    desktop: true, // desktop vs embeded
    udmx: false,
    automark: true,
    displayEffectsRealtime: true,
    interfaceMode: 'normal',
    artnetIP: null, // ArtNet output IP
    artnetHost: '255.255.255.255', // Artnet network host
    sacnIP: null // sACN output IP
}

var STARTED = false;

const VERSION = "2.0.0 Beta 6";

fs.exists(process.cwd() + '/settings.json', function (exists) {
    if (exists == false) {
        saveSettings();
    }
    openSettings();
});

var fixtures = [];
var cues = [];
var sequences = [];
var groups = [];
var presets = [];
var currentCue = "";
var lastCue = "";
var currentCueID = "";
var blackout = false;
var grandmaster = 100;

// Set up dmx variables for integrations used later on
var e131 = null;
var client = null;
var packet = null;
var slotsData = null;
var channels = null;
var artnet = null;
var cp = null;

require.extensions['.jlib'] = require.extensions['.json'];

// Load the Tonalite settings from file
function openSettings() {
    fs.readFile(process.cwd() + '/settings.json', function (err, data) {
        if (err) logError(err);
        var settings = JSON.parse(data);
        SETTINGS = settings;

        if (STARTED == false) {
            STARTED = true;

            e131 = require('e131');
            client = new e131.Client(SETTINGS.sacnIP);
            packet = client.createPacket(512);
            slotsData = packet.getSlotsData();
            //channels = slotsData;
            channels = new Array(1024).fill(0);
            cp = cp;

            artnet = require('artnet')({ iface: SETTINGS.artnetIP, host: SETTINGS.artnetHost, sendAll: true });

            fs.exists(process.cwd() + '/presets.json', function (exists) {
                if (exists == true) {
                    openPresets();
                }
            });

            http.listen(SETTINGS.port, SETTINGS.url, function () {
                var msg = "Desktop";
                if (SETTINGS.desktop === false)
                    msg = "Embeded";
                console.log(`Tonalite ${msg} v${VERSION} - DMX Lighting Control System`);
                console.log(`The web UI can be found at http://${SETTINGS.url}:${SETTINGS.port}`);
            });

            if (SETTINGS.udmx == true) {
                if (SETTINGS.device === "linux") {
                    cp = spawn(process.cwd() + '/uDMXArtnet/uDMXArtnet_minimal_64');
                } else if (SETTINGS.device === "rpi") {
                    cp = spawn(process.cwd() + '/uDMXArtnet/uDMXArtnet_PI_minimal_32', ['-i', '192.168.4.1']);
                } else if (SETTINGS.device === "win") {
                    cp = spawn(process.cwd() + '/uDMXArtnet/uDMXArtnet_Minimal.exe');
                } else {
                    console.log("Selected platform not supported by uDMX, falling back to ArtNet.");
                }
            }

            // Output DMX frames 40 times a second
            setInterval(dmxLoop, 25);
        }
    });
}

// Save the Tonalite settings to a file
function saveSettings() {
    fs.writeFile(process.cwd() + "/settings.json", JSON.stringify(SETTINGS, null, 4), (err) => {
        if (err) {
            logError(err);
            return false;
        };
    });
    return true;
};

async function updateFirmware(callback) {
    var uploadComplete = false;
    var drives = await drivelist.list();
    drives.forEach((drive) => {
        if (drive.enumerator == 'USBSTOR' || drive.isUSB === true) {
            fs.exists(drive.mountpoints[0].path + "/tonalite.zip", function (exists) {
                if (exists) {
                    fs.createReadStream(drive.mountpoints[0].path + "/tonalite.zip").pipe(unzipper.Extract({ path: process.cwd() }));
                    uploadComplete = true;
                    return callback(uploadComplete);
                }
            });
        }
    });
    return callback(uploadComplete);
};

async function getShowsFromUSB(callback) {
    var showsList = null;
    var done = false;
    var drives = await drivelist.list();
    drives.forEach((drive) => {
        if (done == false) {
            if (drive.enumerator == 'USBSTOR' || drive.isUSB === true) {
                fs.readdir(drive.mountpoints[0].path, (err, files) => {
                    showsList = [];
                    files.forEach(file => {
                        if (file.slice(-8) === "tonalite") {
                            showsList.push(file);
                        }
                    });
                    done = true;
                    io.emit('shows', { shows: showsList, drive: drive.mountpoints[0].path });
                    return callback({ shows: showsList, drive: drive.mountpoints[0].path });
                });
            }
        }
    });
    if (showsList == null) {
        io.emit('message', { type: "error", content: "Shows could not be read of of a USB drive. Is there one connected?" });
    }
};

async function importFixtures(callback) {
    var importComplete = false;

    var drives = await drivelist.list();
    drives.forEach((drive) => {
        if (drive.enumerator == 'USBSTOR' || drive.isUSB === true) {
            fs.readdir(drive.mountpoints[0].path, (err, files) => {
                files.forEach(file => {
                    fs.copyFile(drive.mountpoints[0].path + "/" + file, process.cwd() + "/fixtures/" + file, (err) => {
                        if (err) logError(err);
                        importComplete = true;
                    });
                });
            });

            fs.exists(drive.mountpoints[0].path + "/fixtures.zip", function (exists) {
                if (exists) {
                    fs.createReadStream(drive.mountpoints[0].path + "/fixtures.zip").pipe(unzipper.Extract({ path: process.cwd() }));
                    importComplete = true;
                }
            });
        }
    });
    return callback(importComplete);
};

async function saveShowToUSB(showName, callback) {
    var drives = await drivelist.list();
    var done = false;
    var filepath = null;
    drives.forEach((drive) => {
        if (done == false) {
            if (drive.enumerator == 'USBSTOR' || drive.isUSB === true) {
                filepath = drive.mountpoints[0].path + "/" + showName + ".tonalite";
                fs.exists(filepath, function (exists) {
                    if (exists) {
                        io.emit('message', { type: "error", content: "A show file with that name already exists!" });
                    } else {
                        fs.writeFile(filepath, JSON.stringify([fixtures, cues, groups]), (err) => {
                            if (err) {
                                logError(err);
                                done = false;
                                socket.emit('message', { type: "error", content: "The current show could not be saved onto a USB drive. Is there one connected?" });
                            };
                            done = true;
                            io.emit('message', { type: "info", content: "The current show was successfully saved to the connected USB drive!" });
                        });
                    }
                });
            }
        }
    });
    return callback(done);
};

function logError(msg) {
    var datetime = new Date();
    fs.appendFile('error-' + datetime + '.txt', msg, (err) => {
        if (err) logError(err);
    });
};

function moveArrayItem(arr, old_index, new_index) {
    while (old_index < 0) {
        old_index += arr.length;
    }
    while (new_index < 0) {
        new_index += arr.length;
    }
    if (new_index >= arr.length) {
        var k = new_index - arr.length;
        while ((k--) + 1) {
            arr.push(undefined);
        }
    }
    arr.splice(new_index, 0, arr.splice(old_index, 1)[0]);
    return arr;
};

function generateID() {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
};

function generateGroupParameters(newGroup) {
    var parameterCats = [];
    var parameters = [];
    var fixture = null;
    var newParameter = null;
    let i = 0; const iMax = newGroup.ids.length; for (; i < iMax; i++) {
        fixture = fixtures[fixtures.map(el => el.id).indexOf(newGroup.ids[i])];
        let c = 0; const cMax = fixture.parameters.length; for (; c < cMax; c++) {
            newParameter = JSON.parse(JSON.stringify(fixture.parameters[c]));
            newParameter.id = generateID();
            if (!parameterCats.includes(newParameter.name + ":" + newParameter.type)) {
                newParameter.value = newParameter.home;
                parameters.push(newParameter);
                parameterCats.push(newParameter.name + ":" + newParameter.type);
            }
        }
    }
    return parameters;
};

function cleanFixtures() {
    var newFixtures = JSON.parse(JSON.stringify(fixtures));
    let f = 0; const fMax = newFixtures.length; for (; f < fMax; f++) {
        delete newFixtures[f].effects;
        delete newFixtures[f].chips;
        delete newFixtures[f].parameterTypes;
        delete newFixtures[f].dmxUniverse;
        delete newFixtures[f].dcid;
        delete newFixtures[f].manufacturerName;
        delete newFixtures[f].maxOffset;
        delete newFixtures[f].modelName;
        delete newFixtures[f].modeName;
        delete newFixtures[f].invertPan;
        delete newFixtures[f].invertTilt;
        delete newFixtures[f].swapPanTilt;
        let p = 0; const pMax = newFixtures[f].parameters.length; for (; p < pMax; p++) {
            delete newFixtures[f].parameters[p].home;
            delete newFixtures[f].parameters[p].coarse;
            delete newFixtures[f].parameters[p].ranges;
            delete newFixtures[f].parameters[p].fadeWithIntensity;
            delete newFixtures[f].parameters[p].fine;
            delete newFixtures[f].parameters[p].highlight;
            delete newFixtures[f].parameters[p].invert;
            delete newFixtures[f].parameters[p].name;
            delete newFixtures[f].parameters[p].size;
            delete newFixtures[f].parameters[p].snap;
            delete newFixtures[f].parameters[p].value;
            delete newFixtures[f].parameters[p].max;
            delete newFixtures[f].parameters[p].min;
            delete newFixtures[f].parameters[p].locked;
            delete newFixtures[f].parameters[p].id;
            if (newFixtures[f].parameters[p].type != 1) {
                delete newFixtures[f].parameters[p].type;
                delete newFixtures[f].parameters[p].displayValue;
            }
        }
    }
    return newFixtures;
};

function cleanFixture(fixture) {
    var newFixture = JSON.parse(JSON.stringify(fixture));
    newFixture.effects = cleanEffects(newFixture.effects);
    return newFixture;
}

function cleanFixtureForCue(fixture) {
    var newFixture = JSON.parse(JSON.stringify(fixture));
    delete newFixture.name;
    delete newFixture.modelName;
    delete newFixture.shortName;
    delete newFixture.manufacturerName;
    delete newFixture.hasLockedParameters;
    delete newFixture.hasActiveEffects;
    delete newFixture.chips;
    delete newFixture.dcid;
    delete newFixture.colortable;
    delete newFixture.startDMXAddress;
    delete newFixture.invertPan;
    delete newFixture.invertTilt;
    delete newFixture.swapPanTilt;
    delete newFixture.hasIntensity;
    delete newFixture.maxOffset;
    delete newFixture.modeName;
    delete newFixture.dmxUniverse;
    delete newFixture.parameterTypes;
    newFixture.effects = cleanEffectsForCue(newFixture.effects);
    let p = 0; const pMax = newFixture.parameters.length; for (; p < pMax; p++) {
        delete newFixture.parameters[p].displayValue;
        delete newFixture.parameters[p].home;
        delete newFixture.parameters[p].locked;
        delete newFixture.parameters[p].ranges;
        delete newFixture.parameters[p].highlight;
        delete newFixture.parameters[p].snap;
        delete newFixture.parameters[p].size;
        delete newFixture.parameters[p].coarse;
        delete newFixture.parameters[p].fine;
        delete newFixture.parameters[p].fadeWithIntensity;
        delete newFixture.parameters[p].invert;
        delete newFixture.parameters[p].name;
    }
    return newFixture;
};

function cleanSequenceForCue(sequence) {
    var newSequence = JSON.parse(JSON.stringify(sequence));
    delete newSequence.name;
    delete newSequence.steps;
    delete newSequence.ids;
    delete newSequence.includeIntensityColor;
    delete newSequence.includePosition;
    delete newSequence.includeBeam;
    return newSequence;
};

function cleanEffect(effect) {
    var newEffect = JSON.parse(JSON.stringify(effect));
    delete newEffect.steps;
    delete newEffect.valueCount;
    delete newEffect.absolute;
    delete newEffect.resolution;
    delete newEffect.parameterNames;
    delete newEffect.step;
    delete newEffect.speed;
    delete newEffect.index;
    delete newEffect.depth;
    delete newEffect.chroma;
    delete newEffect.fan;
    delete newEffect.aspect;
    delete newEffect.rotation;
    return newEffect;
};

function cleanEffects(ineffects) {
    var newEffects = JSON.parse(JSON.stringify(ineffects));
    let e = 0; const eMax = newEffects.length; for (; e < eMax; e++) {
        newEffects[e] = cleanEffect(newEffects[e]);
    }
    return newEffects;
};

function cleanEffectForCue(effect) {
    var newEffect = JSON.parse(JSON.stringify(effect));
    delete newEffect.steps;
    delete newEffect.valueCount;
    delete newEffect.absolute;
    delete newEffect.resolution;
    delete newEffect.parameterNames;
    delete newEffect.step;
    delete newEffect.type;
    delete newEffect.name;
    return newEffect;
};

function cleanEffectsForCue(ineffects) {
    var newEffects = JSON.parse(JSON.stringify(ineffects));
    let e = 0; const eMax = newEffects.length; for (; e < eMax; e++) {
        newEffects[e] = cleanEffectForCue(newEffects[e]);
    }
    return newEffects;
};

function cleanFixturesForCue() {
    var newFixtures = [];
    let f = 0; const fMax = fixtures.length; for (; f < fMax; f++) {
        newFixtures.push(cleanFixtureForCue(fixtures[f]));
    }
    return newFixtures;
};

function cleanSequencesForCue() {
    var newSequences = [];
    let s = 0; const sMax = sequences.length; for (; s < sMax; s++) {
        newSequences.push(cleanSequenceForCue(sequences[s]));
    }
    return newSequences;
};

function cleanFixturesForSequence(fixtureIDs) {
    var newFixtures = [];
    let f = 0; const fMax = fixtures.length; for (; f < fMax; f++) {
        if (fixtureIDs.indexOf(fixtures[f].id) >= 0)
            newFixtures.push(cleanFixtureForCue(fixtures[f]));
    }
    return newFixtures;
};

function cleanGroups() {
    var newGroups = JSON.parse(JSON.stringify(groups));
    let g = 0; const gMax = newGroups.length; for (; g < gMax; g++) {
        delete newGroups[g].ids;
        delete newGroups[g].parameters;
        delete newGroups[g].parameterTypes;
    }
    return newGroups;
};

function cleanCues() {
    var newCues = JSON.parse(JSON.stringify(cues));
    let c = 0; const cMax = newCues.length; for (; c < cMax; c++) {
        delete newCues[c].upStep;
        delete newCues[c].downStep;
        delete newCues[c].following;
        delete newCues[c].fixtures;
        delete newCues[c].includeIntensityColor;
        delete newCues[c].includePosition;
        delete newCues[c].includeBeam;
    }
    return newCues;
};

function cleanSequences() {
    var newSequences = JSON.parse(JSON.stringify(sequences));
    let s = 0; const sMax = newSequences.length; for (; s < sMax; s++) {
        delete newSequences[s].steps;
        delete newSequences[s].includeIntensityColor;
        delete newSequences[s].includePosition;
        delete newSequences[s].includeBeam;
        delete newSequences[s].ids;
    }
    return newSequences;
};

function cleanPresets() {
    var newPresets = JSON.parse(JSON.stringify(presets));
    let p = 0; const pMax = newPresets.length; for (; p < pMax; p++) {
        delete newPresets[p].parameters;
        delete newPresets[p].mode;
    }
    return newPresets;
};

function cleanPreset(preset) {
    var newPreset = JSON.parse(JSON.stringify(preset));
    delete newPresets[p].parameters;
    return newPreset;
};

function getGroupFixtures(groupID) {
    var group = groups[groups.map(el => el.id).indexOf(groupID)];
    var fixtureStarts = [];
    var fixture = null;
    let i = 0; const iMax = group.ids.length; for (; i < iMax; i++) {
        fixture = fixtures[fixtures.map(el => el.id).indexOf(group.ids[i])];
        fixtureStarts.push({ name: fixture.name, address: fixture.startDMXAddress, id: fixture.id });
    }
    return fixtureStarts;
};

function checkFixtureActiveEffects(effects) {
    let e = 0; const eMax = effects.length; for (; e < eMax; e++) {
        if (effects[e].active == true) {
            return true;
        }
    }
}

// Set the output channel values to those of the current fixture values
function calculateChannels() {
    var invert = null;
    let f = 0; const fMax = fixtures.length; for (; f < fMax; f++) {
        let p = 0; const pMax = fixtures[f].parameters.length; for (; p < pMax; p++) {
            if (fixtures[f].parameters[p].fadeWithIntensity == true || fixtures[f].parameters[p].type == 1) {
                if (blackout === false) {
                    channels[((fixtures[f].startDMXAddress - 1) + fixtures[f].parameters[p].coarse) + (512 * fixtures[f].dmxUniverse)] = ((fixtures[f].parameters[p].value >> 8) / 100.0) * grandmaster;
                    if (fixtures[f].parameters[p].fine != null) {
                        channels[((fixtures[f].startDMXAddress - 1) + fixtures[f].parameters[p].fine) + (512 * fixtures[f].dmxUniverse)] = ((fixtures[f].parameters[p].value & 0xff) / 100.0) * grandmaster;
                    }
                } else {
                    channels[((fixtures[f].startDMXAddress - 1) + fixtures[f].parameters[p].coarse) + (512 * fixtures[f].dmxUniverse)] = (fixtures[f].parameters[p].min >> 8);
                    if (fixtures[f].parameters[p].fine != null) {
                        channels[((fixtures[f].startDMXAddress - 1) + fixtures[f].parameters[p].fine) + (512 * fixtures[f].dmxUniverse)] = (fixtures[f].parameters[p].min & 0xff);
                    }
                }
            } else {
                invert = false;
                if (fixtures[f].parameters[p].type == 2 && (fixtures[f].invertPan == true || fixtures[f].invertTilt == true)) {
                    if (fixtures[f].parameters[p].name == "Pan" && fixtures[f].invertPan == true) {
                        invert = true;
                    } else if (fixtures[f].parameters[p].name == "Tilt" && fixtures[f].invertTilt == true) {
                        invert = true;
                    }
                }
                if (invert == true) {
                    channels[((fixtures[f].startDMXAddress - 1) + fixtures[f].parameters[p].coarse) + (512 * fixtures[f].dmxUniverse)] = (cppaddon.reverseNumber(fixtures[f].parameters[p].value, 0, 65535) >> 8);
                    if (fixtures[f].parameters[p].fine != null) {
                        channels[((fixtures[f].startDMXAddress - 1) + fixtures[f].parameters[p].fine) + (512 * fixtures[f].dmxUniverse)] = (cppaddon.reverseNumber(fixtures[f].parameters[p].value, 0, 65535) & 0xff);
                    }
                } else {
                    channels[((fixtures[f].startDMXAddress - 1) + fixtures[f].parameters[p].coarse) + (512 * fixtures[f].dmxUniverse)] = (fixtures[f].parameters[p].value >> 8);
                    if (fixtures[f].parameters[p].fine != null) {
                        channels[((fixtures[f].startDMXAddress - 1) + fixtures[f].parameters[p].fine) + (512 * fixtures[f].dmxUniverse)] = (fixtures[f].parameters[p].value & 0xff);
                    }
                }
            }
        }
    }
};

function calculateChannelsList() {
    var chans = [];
    var invert = null;
    let f = 0; const fMax = fixtures.length; for (; f < fMax; f++) {
        let p = 0; const pMax = fixtures[f].parameters.length; for (; p < pMax; p++) {
            invert = false;
            if (fixtures[f].parameters[p].type == 2 && (fixtures[f].invertPan == true || fixtures[f].invertTilt == true)) {
                if (fixtures[f].parameters[p].name == "Pan" && fixtures[f].invertPan == true) {
                    invert = true;
                } else if (fixtures[f].parameters[p].name == "Tilt" && fixtures[f].invertTilt == true) {
                    invert = true;
                }
            }
            if (invert == true) {
                chans[((fixtures[f].startDMXAddress - 1) + fixtures[f].parameters[p].coarse) + (512 * fixtures[f].dmxUniverse)] = (cppaddon.reverseNumber(fixtures[f].parameters[p].value, 0, 65535) >> 8);
                if (fixtures[f].parameters[p].fine != null) {
                    chans[((fixtures[f].startDMXAddress - 1) + fixtures[f].parameters[p].fine) + (512 * fixtures[f].dmxUniverse)] = (cppaddon.reverseNumber(fixtures[f].parameters[p].value, 0, 65535) & 0xff);
                }
            } else {
                chans[((fixtures[f].startDMXAddress - 1) + fixtures[f].parameters[p].coarse) + (512 * fixtures[f].dmxUniverse)] = (fixtures[f].parameters[p].value >> 8);
                if (fixtures[f].parameters[p].fine != null) {
                    chans[((fixtures[f].startDMXAddress - 1) + fixtures[f].parameters[p].fine) + (512 * fixtures[f].dmxUniverse)] = (fixtures[f].parameters[p].value & 0xff);
                }
            }
        }
    }
    return chans;
};

// Set the cue's output channel values to the correct values from the fixtures. This is basically saving the cue.
function calculateCue(cue, includeIntensityColor, includePosition, includeBeam, sequence) {
    var outputChannels = new Array(1024).fill(0);
    var startFixture = null;
    var startParameter = null;
    var endParameter = null;
    var invert = null;
    let f = 0; const fMax = cue.fixtures.length; for (; f < fMax; f++) {
        startFixture = fixtures[fixtures.map(el => el.id).indexOf(cue.fixtures[f].id)];
        let e = 0; const eMax = cue.fixtures[f].effects.length; for (; e < eMax; e++) {
            if (startFixture.effects[e].id == cue.fixtures[f].effects[e].id) {
                startFixture.effects[e].fan = cue.fixtures[f].effects[e].fan;
                if (cue.fixtures[f].effects[e].active != startFixture.effects[e].active) {
                    startFixture.effects[e].step = 0;
                    startFixture.effects[e].index = 0;
                }
                startFixture.effects[e].depth = cue.fixtures[f].effects[e].depth;
                startFixture.effects[e].speed = cue.fixtures[f].effects[e].speed;
                startFixture.effects[e].chroma = cue.fixtures[f].effects[e].chroma;
                startFixture.effects[e].aspect = cue.fixtures[f].effects[e].aspect;
                startFixture.effects[e].rotation = cue.fixtures[f].effects[e].rotation;
                startFixture.effects[e].active = cue.fixtures[f].effects[e].active;
            }
        }
        startFixture.hasActiveEffects = checkFixtureActiveEffects(startFixture.effects);
        let c = 0; const cMax = cue.fixtures[f].parameters.length; for (; c < cMax; c++) {
            if (startFixture.parameters[c].locked === false) {
                startParameter = startFixture.parameters[c].value;
                endParameter = cue.fixtures[f].parameters[c].value;
                // If the end parameter is greater than the start parameter, the value is going in, and is going out if less
                if (endParameter >= startParameter) {
                    // Make sure that the step does not dip below 0 (finished)
                    if (cue.upStep >= 0) {
                        if ((startFixture.parameters[c].fadeWithIntensity == true || startFixture.parameters[c].type == 1) && includeIntensityColor == true) {
                            if (blackout === false) {
                                outputChannels[((startFixture.startDMXAddress - 1) + startFixture.parameters[c].coarse) + (512 * startFixture.dmxUniverse)] = (((endParameter + (((startParameter - endParameter) / (cue.upTime * 40)) * cue.upStep)) >> 8) / 100.0) * grandmaster;
                                if (startFixture.parameters[c].fine != null) {
                                    outputChannels[((startFixture.startDMXAddress - 1) + startFixture.parameters[c].fine) + (512 * startFixture.dmxUniverse)] = (((endParameter + (((startParameter - endParameter) / (cue.upTime * 40)) * cue.upStep)) & 0xff) / 100.0) * grandmaster;
                                }
                            } else {
                                outputChannels[((startFixture.startDMXAddress - 1) + startFixture.parameters[c].coarse) + (512 * startFixture.dmxUniverse)] = (startFixture.parameters[c].min >> 8);
                                if (startFixture.parameters[c].fine != null) {
                                    outputChannels[((startFixture.startDMXAddress - 1) + startFixture.parameters[c].fine) + (512 * startFixture.dmxUniverse)] = (startFixture.parameters[c].min & 0xff);
                                }
                            }
                        } else if ((startFixture.parameters[c].type == 2 && includePosition == true) || (startFixture.parameters[c].type == 4 && includeBeam == true) || (startFixture.parameters[c].type == 5 && includeIntensityColor == true)) {
                            invert = false;
                            if (startFixture.parameters[c].type == 2 && (startFixture.invertPan == true || startFixture.invertTilt == true)) {
                                if (startFixture.parameters[c].name == "Pan" && startFixture.invertPan == true) {
                                    invert = true;
                                } else if (startFixture.parameters[c].name == "Tilt" && startFixture.invertTilt == true) {
                                    invert = true;
                                }
                            }
                            if (invert == true) {
                                outputChannels[((startFixture.startDMXAddress - 1) + startFixture.parameters[c].coarse) + (512 * startFixture.dmxUniverse)] = (cppaddon.reverseNumber((endParameter + (((startParameter - endParameter) / (cue.upTime * 40)) * cue.upStep)), 0, 65535) >> 8);
                                if (startFixture.parameters[c].fine != null) {
                                    outputChannels[((startFixture.startDMXAddress - 1) + startFixture.parameters[c].fine) + (512 * startFixture.dmxUniverse)] = (cppaddon.reverseNumber((endParameter + (((startParameter - endParameter) / (cue.upTime * 40)) * cue.upStep)), 0, 65535) & 0xff);
                                }
                            } else {
                                outputChannels[((startFixture.startDMXAddress - 1) + startFixture.parameters[c].coarse) + (512 * startFixture.dmxUniverse)] = ((endParameter + (((startParameter - endParameter) / (cue.upTime * 40)) * cue.upStep)) >> 8);
                                if (startFixture.parameters[c].fine != null) {
                                    outputChannels[((startFixture.startDMXAddress - 1) + startFixture.parameters[c].fine) + (512 * startFixture.dmxUniverse)] = ((endParameter + (((startParameter - endParameter) / (cue.upTime * 40)) * cue.upStep)) & 0xff);
                                }
                            }
                        }
                        fixtures[fixtures.map(el => el.id).indexOf(cue.fixtures[f].id)].parameters[c].displayValue = cppaddon.mapRange(endParameter + (((startParameter - endParameter) / (cue.upTime * 40)) * cue.upStep), startFixture.parameters[c].min, startFixture.parameters[c].max, 0, 100);
                    }
                } else {
                    // Make sure that the step does not dip below 0 (finished)
                    if (cue.downStep >= 0) {
                        if ((startFixture.parameters[c].fadeWithIntensity == true || startFixture.parameters[c].type == 1) && cue.includeIntensityColor == true) {
                            if (blackout === false) {
                                outputChannels[((startFixture.startDMXAddress - 1) + startFixture.parameters[c].coarse) + (512 * startFixture.dmxUniverse)] = (((endParameter + (((startParameter - endParameter) / (cue.downTime * 40)) * cue.downStep)) >> 8) / 100.0) * grandmaster;
                                if (startFixture.parameters[c].fine != null) {
                                    outputChannels[((startFixture.startDMXAddress - 1) + startFixture.parameters[c].fine) + (512 * startFixture.dmxUniverse)] = (((endParameter + (((startParameter - endParameter) / (cue.downTime * 40)) * cue.downStep)) & 0xff) / 100.0) * grandmaster;
                                }
                            } else {
                                outputChannels[((startFixture.startDMXAddress - 1) + startFixture.parameters[c].coarse) + (512 * startFixture.dmxUniverse)] = (startFixture.parameters[c].min >> 8);
                                if (startFixture.parameters[c].fine != null) {
                                    outputChannels[((startFixture.startDMXAddress - 1) + startFixture.parameters[c].fine) + (512 * startFixture.dmxUniverse)] = (startFixture.parameters[c].min & 0xff);
                                }
                            }
                        } else if ((startFixture.parameters[c].type == 2 && includePosition == true) || (startFixture.parameters[c].type == 4 && includeBeam == true) || (startFixture.parameters[c].type == 5 && includeIntensityColor == true)) {
                            invert = false;
                            if (startFixture.parameters[c].type == 2 && (startFixture.invertPan == true || startFixture.invertTilt == true)) {
                                if (startFixture.parameters[c].name == "Pan" && startFixture.invertPan == true) {
                                    invert = true;
                                } else if (startFixture.parameters[c].name == "Tilt" && startFixture.invertTilt == true) {
                                    invert = true;
                                }
                            }
                            if (invert == true) {
                                outputChannels[((startFixture.startDMXAddress - 1) + startFixture.parameters[c].coarse) + (512 * startFixture.dmxUniverse)] = (cppaddon.reverseNumber((endParameter + (((startParameter - endParameter) / (cue.downTime * 40)) * cue.downStep)), 0, 65535) >> 8);
                                if (startFixture.parameters[c].fine != null) {
                                    outputChannels[((startFixture.startDMXAddress - 1) + startFixture.parameters[c].fine) + (512 * startFixture.dmxUniverse)] = (cppaddon.reverseNumber((endParameter + (((startParameter - endParameter) / (cue.downTime * 40)) * cue.downStep)), 0, 65535) & 0xff);
                                }
                            } else {
                                outputChannels[((startFixture.startDMXAddress - 1) + startFixture.parameters[c].coarse) + (512 * startFixture.dmxUniverse)] = ((endParameter + (((startParameter - endParameter) / (cue.downTime * 40)) * cue.downStep)) >> 8);
                                if (startFixture.parameters[c].fine != null) {
                                    outputChannels[((startFixture.startDMXAddress - 1) + startFixture.parameters[c].fine) + (512 * startFixture.dmxUniverse)] = ((endParameter + (((startParameter - endParameter) / (cue.downTime * 40)) * cue.downStep)) & 0xff);
                                }
                            }
                        }
                        fixtures[fixtures.map(el => el.id).indexOf(cue.fixtures[f].id)].parameters[c].displayValue = cppaddon.mapRange(endParameter + (((startParameter - endParameter) / (cue.downTime * 40)) * cue.downStep), startFixture.parameters[c].min, startFixture.parameters[c].max, 0, 100);
                    }
                }
            } else {
                startParameter = startFixture.parameters[c].value;
                invert = false;
                if (startFixture.parameters[c].type == 2 && (startFixture.invertPan == true || startFixture.invertTilt == true)) {
                    if (startFixture.parameters[c].name == "Pan" && startFixture.invertPan == true) {
                        invert = true;
                    } else if (startFixture.parameters[c].name == "Tilt" && startFixture.invertTilt == true) {
                        invert = true;
                    }
                }
                if (invert == true) {
                    outputChannels[((startFixture.startDMXAddress - 1) + startFixture.parameters[c].coarse) + (512 * startFixture.dmxUniverse)] = (cppaddon.reverseNumber(startParameter, 0, 65535) >> 8);
                    if (startFixture.parameters[c].fine != null) {
                        outputChannels[((startFixture.startDMXAddress - 1) + startFixture.parameters[c].fine) + (512 * startFixture.dmxUniverse)] = (cppaddon.reverseNumber(startParameter, 0, 65535) & 0xff);
                    }
                } else {
                    outputChannels[((startFixture.startDMXAddress - 1) + startFixture.parameters[c].coarse) + (512 * startFixture.dmxUniverse)] = (startParameter >> 8);
                    if (startFixture.parameters[c].fine != null) {
                        outputChannels[((startFixture.startDMXAddress - 1) + startFixture.parameters[c].fine) + (512 * startFixture.dmxUniverse)] = (startParameter & 0xff);
                    }
                }

            }
        }
    }
    let s = 0; const sMax = cue.sequences.length; for (; s < sMax; s++) {
        startSequence = sequences[sequences.map(el => el.id).indexOf(cue.sequences[s].id)];
        startSequence.active = cue.sequences[s].active;
    }
    return outputChannels;
};

function calculateStack() {
    // If there is a running cue
    if (currentCue != "") {
        // Get the current cue
        cue = cues[cues.map(el => el.id).indexOf(currentCue)];
        channels = calculateCue(cue, cue.includeIntensityColor, cue.includePosition, cue.includeBeam, false);
        cue.upStep -= 1;
        cue.downStep -= 1;
        // Check if the cue needs to be followed by another cue
        if (cue.upStep < 0 && cue.downStep < 0) {
            if (cue.follow != -1) {
                cue.active = false;
                if (cue.following === false) {
                    cue.upStep = cue.follow * 40;
                    cue.downStep = cue.follow * 40;
                    cue.following = true;
                } else {
                    cue.upStep = cue.upTime * 40;
                    cue.downStep = cue.downTime * 40;
                    cue.following = false;
                    if (cues.map(el => el.id).indexOf(currentCue) === cues.length - 1) {
                        currentCue = cues[0].id;
                    } else {
                        currentCue = cues[cues.map(el => el.id).indexOf(currentCue) + 1].id;
                    }
                    lastCue = currentCue;
                    cues[cues.map(el => el.id).indexOf(currentCue)].active = true;
                    currentCueID = currentCue;
                }
            } else {
                currentCue = "";
                cue.upStep = cue.upTime * 40;
                cue.downStep = cue.downTime * 40;
                cue.active = false;
                io.emit('cueActionBtn', false);
            }
            var startFixtureParameters = null;
            // Set the fixture's display and real values to the correct values from the cue
            let f = 0; const fMax = cue.fixtures.length; for (; f < fMax; f++) {
                startFixtureParameters = fixtures[fixtures.map(el => el.id).indexOf(cue.fixtures[f].id)].parameters;
                let c = 0; const cMax = cue.fixtures[f].parameters.length; for (; c < cMax; c++) {
                    if (startFixtureParameters[c].locked === false) {
                        startFixtureParameters[c].value = cue.fixtures[f].parameters[c].value;
                        startFixtureParameters[c].displayValue = cppaddon.mapRange(cue.fixtures[f].parameters[c].value, cue.fixtures[f].parameters[c].min, cue.fixtures[f].parameters[c].max, 0, 100);
                    }
                }
            }

            if (SETTINGS.automark === true) {
                if (cues.map(el => el.id).indexOf(lastCue) + 1 === cues.length) {
                    var nextCue = cues[0];
                } else {
                    var nextCue = cues[cues.map(el => el.id).indexOf(lastCue) + 1];
                }
                f = 0; const fMax1 = nextCue.fixtures.length; for (; f < fMax1; f++) {
                    startFixtureParameters = fixtures[fixtures.map(el => el.id).indexOf(nextCue.fixtures[f].id)].parameters;
                    nextCueFixtureParameters = nextCue.fixtures[f].parameters;
                    if (fixtures[fixtures.map(el => el.id).indexOf(nextCue.fixtures[f].id)].hasIntensity == true) {
                        if (startFixtureParameters[startFixtureParameters.map(el => el.type).indexOf(1)].value === 0 && nextCueFixtureParameters[nextCueFixtureParameters.map(el => el.type).indexOf(1)].value > 0) {
                            c = 0; const cMax1 = nextCueFixtureParameters.length; for (; c < cMax1; c++) {
                                if (startFixtureParameters[c].locked === false && startFixtureParameters[c].type != 1) {
                                    startFixtureParameters[c].value = nextCueFixtureParameters[c].value;
                                    startFixtureParameters[c].displayValue = cppaddon.mapRange(nextCueFixtureParameters[c].value, nextCueFixtureParameters[c].min, nextCueFixtureParameters[c].max, 0, 100);
                                }
                            }
                        }
                    }
                }
            }
            io.emit('activeCue', currentCueID);
            io.emit('cues', cleanCues());
            io.emit('sequences', cleanSequences());
        }
        io.emit('fixtures', { fixtures: cleanFixtures(), target: true });
    }
    if (blackout === false) {
        var displayChanged = false;
        var effectChanIndex = null;
        var effectValue = null;
        var invert = null;
        let f = 0; const fMax = fixtures.length; for (; f < fMax; f++) {
            let e = 0; const eMax = fixtures[f].effects.length; for (; e < eMax; e++) {
                if (fixtures[f].effects[e].active == true) {
                    let p = 0; const pMax = fixtures[f].parameters.length; for (; p < pMax; p++) {
                        if (fixtures[f].parameters[p].locked === false) {
                            effectChanIndex = fixtures[f].effects[e].parameterNames.findIndex(function (element) { return element == fixtures[f].parameters[p].name });
                            if (effectChanIndex > -1) {
                                effectValue = fixtures[f].effects[e].steps[fixtures[f].effects[e].step][effectChanIndex];
                                if (fixtures[f].effects[e].resolution == 8) {
                                    effectValue = cppaddon.mapRange(effectValue, 0, 255, fixtures[f].parameters[p].min, fixtures[f].parameters[p].max);
                                } else {
                                    effectValue = effectValue + 32766;
                                }
                                effectValue = (effectValue * fixtures[f].effects[e].depth) + ((fixtures[f].parameters[p].value >> 8) * (1 - fixtures[f].effects[e].depth));
                                if (fixtures[f].parameters[p].type == 1) {
                                    if (SETTINGS.displayEffectsRealtime === true) {
                                        fixtures[f].parameters[p].displayValue = cppaddon.mapRange(effectValue, fixtures[f].parameters[p].min, fixtures[f].parameters[p].max, 0, 100);
                                        displayChanged = true;
                                    }
                                }
                                if (fixtures[f].parameters[p].fadeWithIntensity == true || fixtures[f].parameters[p].type == 1) {
                                    effectValue = (effectValue / 100.0) * grandmaster;
                                }
                                invert = false;
                                if (fixtures[f].parameters[p].type == 2 && (fixtures[f].invertPan == true || fixtures[f].invertTilt == true)) {
                                    if (fixtures[f].parameters[p].name == "Pan" && fixtures[f].invertPan == true) {
                                        invert = true;
                                    } else if (fixtures[f].parameters[p].name == "Tilt" && fixtures[f].invertTilt == true) {
                                        invert = true;
                                    }
                                }

                                if (fixtures[f].effects[e].resolution == 16) {
                                    if (invert == true) {
                                        channels[((fixtures[f].startDMXAddress - 1) + fixtures[f].parameters[p].coarse) + (512 * fixtures[f].dmxUniverse)] = (cppaddon.reverseNumber(effectValue, 0, 65535) >> 8);
                                        if (fixtures[f].parameters[p].fine != null) {
                                            channels[((fixtures[f].startDMXAddress - 1) + fixtures[f].parameters[p].fine) + (512 * fixtures[f].dmxUniverse)] = (cppaddon.reverseNumber(effectValue, 0, 65535) & 0xff);
                                        }
                                    } else {
                                        channels[((fixtures[f].startDMXAddress - 1) + fixtures[f].parameters[p].coarse) + (512 * fixtures[f].dmxUniverse)] = (effectValue >> 8);
                                        if (fixtures[f].parameters[p].fine != null) {
                                            channels[((fixtures[f].startDMXAddress - 1) + fixtures[f].parameters[p].fine) + (512 * fixtures[f].dmxUniverse)] = (effectValue & 0xff);
                                        }
                                    }

                                } else if (fixtures[f].effects[e].resolution == 8) {
                                    if (invert == true) {
                                        channels[((fixtures[f].startDMXAddress - 1) + fixtures[f].parameters[p].coarse) + (512 * fixtures[f].dmxUniverse)] = cppaddon.reverseNumber(effectValue, 0, 255);
                                    } else {
                                        channels[((fixtures[f].startDMXAddress - 1) + fixtures[f].parameters[p].coarse) + (512 * fixtures[f].dmxUniverse)] = effectValue;
                                    }
                                }
                            }

                        }
                    }
                    if (fixtures[f].effects[e].step + Math.floor(fixtures[f].effects[e].speed * fixtures[f].effects[e].index) >= fixtures[f].effects[e].steps.length - 1) {
                        fixtures[f].effects[e].step = 0;
                        fixtures[f].effects[e].index = 0;
                    } else {
                        fixtures[f].effects[e].step = fixtures[f].effects[e].step + Math.floor(fixtures[f].effects[e].speed * fixtures[f].effects[e].index);
                        fixtures[f].effects[e].index++;
                    }
                }
            }
        }
        if (SETTINGS.displayEffectsRealtime === true) {
            if (displayChanged === true) {
                io.emit('fixtures', { fixtures: cleanFixtures(), target: true });
            }
        }
    }
    // Allow presets to overide everything else for channels if they are set to ltp
    var tempvalue = null;
    let p = 0; const pMax = presets.length; for (; p < pMax; p++) {
        if (presets[p].active) {
            let c = 0; const cMax = presets[p].parameters.length; for (; c < cMax; c++) {
                if (presets[p].parameters[c] != null) {
                    if (presets[p].mode == 'ltp') {
                        channels[c] = (presets[p].parameters[c] / 100.0) * presets[p].intensity;
                    } else if (presets[p].mode == 'htp') {
                        tempvalue = (presets[p].parameters[c] / 100.0) * presets[p].intensity;
                        if (tempvalue > channels[c]) {
                            channels[c] = tempvalue;
                        }
                    }
                }
            }
        }
    }
};

// Set the fixture values for each group equal to the group's parameter value
function setFixtureGroupValues(group, parameter) {
    let i = 0; const iMax = group.ids.length; for (; i < iMax; i++) {
        var fixture = fixtures[fixtures.map(el => el.id).indexOf(group.ids[i])];
        fixture.hasLockedParameters = false;
        let c = 0; const cMax = fixture.parameters.length; for (; c < cMax; c++) {
            if (fixture.parameters[c].name === parameter.name && fixture.parameters[c].type === parameter.type) {
                fixture.parameters[c].locked = parameter.locked;
                if (fixture.parameters[c].locked != true) {
                    fixture.parameters[c].value = parameter.value;
                    fixture.parameters[c].displayValue = cppaddon.mapRange(fixture.parameters[c].value, fixture.parameters[c].min, fixture.parameters[c].max, 0, 100);
                }
            }
            if (fixture.parameters[c].locked) {
                fixture.hasLockedParameters = true;
            }
        }
    }
};

// Reset the parameter values for each fixture
function resetFixtures() {
    let f = 0; const fMax = fixtures.length; for (; f < fMax; f++) {
        let c = 0; const cMax = fixtures[f].parameters.length; for (; c < cMax; c++) {
            if (fixtures[f].parameters[c].locked != true) {
                fixtures[f].parameters[c].value = fixtures[f].parameters[c].home;
                fixtures[f].parameters[c].displayValue = cppaddon.mapRange(fixtures[f].parameters[c].value, fixtures[f].parameters[c].min, fixtures[f].parameters[c].max, 0, 100);
            }
        }
        let e = 0; const eMax = fixtures[f].effects.length; for (; e < eMax; e++) {
            fixtures[f].effects[e].active = false;
        }
        fixtures[f].hasActiveEffects = checkFixtureActiveEffects(fixtures[f].effects);
    }
};

// Reset the parameter values for each group
function resetGroups() {
    let g = 0; const gMax = groups.length; for (; g < gMax; g++) {
        let c = 0; const cMax = groups[g].parameters.length; for (; c < cMax; c++) {
            groups[g].parameters[c].value = groups[g].parameters[c].home;
            groups[g].parameters[c].displayValue = cppaddon.mapRange(groups[g].parameters[c].value, groups[g].parameters[c].min, groups[g].parameters[c].max, 0, 100);
            setFixtureGroupValues(groups[g], groups[g].parameters[c]);
        }
    }
};

// This is the output dmx loop. It gathers the parameter and calculates what the output values should be.
function dmxLoop() {
    // Reset DMX values
    let c = 0; const cMax = channels.length; for (; c < cMax; c++) {
        channels[c] = 0;
    }
    calculateChannels();
    calculateStack();
    var u1 = channels.slice(0, 512);
    var u2 = channels.slice(512, 1024);
    packet.setUniverse(0x01);
    slotsData = u1;
    client.send(packet);
    packet.setUniverse(0x02);
    slotsData = u2;
    client.send(packet);
    artnet.set(0, 1, u1);
    artnet.set(1, 1, u2);
};

// Load the fixtures, cues, and groups from file
function openShow(file = "show.json") {
    fs.readFile(process.cwd() + '/' + file, (err, data) => {
        if (err) logError(err);
        let show = JSON.parse(data);
        fixtures = show.fixtures;
        cues = show.cues;
        groups = show.groups;
        sequences = show.sequences;
        io.emit('fixtures', { fixtures: cleanFixtures(), target: true });
        io.emit('activeCue', currentCueID);
        io.emit('cues', cleanCues());
        io.emit('sequences', cleanSequences());
        io.emit('groups', { groups: cleanGroups(), target: true });
    });
};

// Save the fixtures, cues, and groups of the show to file
function saveShow() {
    fs.writeFile(process.cwd() + "/show.json", JSON.stringify({ fixtures: fixtures, cues: cues, groups: groups, sequences: sequences, tonaliteVersion: VERSION, lastSaved: moment().format() }), (err) => {
        if (err) {
            logError(err);
            return false;
        };
    });
    return true;
};

// Load the presets from file
function openPresets() {
    fs.readFile(process.cwd() + '/presets.json', (err, data) => {
        if (err) logError(err);
        presets = JSON.parse(data);
        io.emit('presets', cleanPresets());
    });
};

// Save the presets to file
function savePresets() {
    fs.writeFile(process.cwd() + "/presets.json", JSON.stringify(presets), (err) => {
        if (err) {
            logError(err);
            return false;
        };
    });
    return true;
};

app.use('/static', express.static(__dirname + '/static'));
app.use('/docs', express.static(__dirname + '/docs/dist'));

app.use(fileUpload());
app.use(compression());
app.use(favicon(__dirname + '/static/img/favicon.ico'));

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

// Upload Show File
app.post('/showFile', (req, res) => {
    if (Object.keys(req.files).length == 0) {
        return res.status(400).send('No files were uploaded.');
    }
    let showFile = req.files.showFile;
    if (showFile.name.includes(".tonalite")) {
        showFile.mv(process.cwd() + '/show.json', function (err) {
            if (err)
                return res.status(500).send(err);
            openShow();
            res.redirect('/');
        });
    } else {
        io.emit('message', { type: "error", content: "The file was not a tonalite show file!" });
    }
});

app.post('/importFixtureDefinition', (req, res) => {
    if (Object.keys(req.files).length == 0) {
        return res.status(400).send('No files were uploaded.');
    }
    let fixtureDefinition = req.files.fixtureDefinition;

    if (fixtureDefinition.mimetype == "application/json" || fixtureDefinition.mimetype == "application/x-wine-extension-jlib") {
        fixtureDefinition.mv(process.cwd() + '/fixtures/' + req.files.fixtureDefinition.name, function (err) {
            if (err)
                return res.status(500).send(err);
            res.redirect('/');
            io.emit('message', { type: "info", content: "The fixture profile has been imported!" });
        });
    } else {
        io.emit('message', { type: "error", content: "The fixture profile was not a json file!" });
    }
});

fs.exists(process.cwd() + '/show.json', function (exists) {
    if (exists == false) {
        saveShow();
    }
    openShow();
});

io.on('connection', function (socket) {
    socket.emit('currentCue', currentCueID);
    socket.emit('fixtures', { fixtures: cleanFixtures(), target: true });
    socket.emit('cues', cleanCues());
    socket.emit('sequences', cleanSequences());
    socket.emit('groups', { groups: cleanGroups(), target: true });
    socket.emit('presets', cleanPresets());
    socket.emit('blackout', blackout);
    socket.emit('grandmaster', grandmaster);

    QRCode.toDataURL(`http://${SETTINGS.url}:${SETTINGS.port}`, function (err, url) {
        socket.emit('meta', { settings: SETTINGS, desktop: SETTINGS.desktop, version: VERSION, qrcode: url, url: `http://${SETTINGS.url}:${SETTINGS.port}` });
    });


    if (currentCue === "") {
        socket.emit('cueActionBtn', false);
    } else {
        socket.emit('cueActionBtn', true);
    }

    socket.on('openShowFromUSB', function (data) {
        fs.copyFile(data.path + '/' + data.file, process.cwd() + '/show.json', function (err) {
            if (err) {
                logError(err);
                socket.emit('message', { type: "error", content: "The show could not be opened!" });
            } else {
                openShow();
                io.emit('message', { type: "info", content: "The show has been opened!" });
            }
        });
    });

    socket.on('resetShow', function () {
        resetFixtures();
        cues = [];
        groups = [];
        sequences = [];
        currentCue = "";
        lastCue = "";
        io.emit('fixtures', { fixtures: cleanFixtures(), target: true });
        io.emit('activeCue', currentCueID);
        io.emit('cues', cleanCues());
        io.emit('groups', { groups: cleanGroups(), target: true });
        io.emit('cueActionBtn', false);
        io.emit('sequences', cleanSequences());
        io.emit('resetView', { type: 'show', eid: "" });
        io.emit('message', { type: "info", content: "A new show has been created!" });
        saveShow();
    });

    socket.on('resetShowAndPatch', function () {
        fixtures = [];
        cues = [];
        groups = [];
        sequences = [];
        currentCue = "";
        lastCue = "";
        io.emit('fixtures', { fixtures: cleanFixtures(), target: true });
        io.emit('activeCue', currentCueID);
        io.emit('cues', cleanCues());
        io.emit('sequences', cleanSequences());
        io.emit('groups', { groups: cleanGroups(), target: true });
        io.emit('cueActionBtn', false);
        io.emit('resetView', { type: 'show', eid: "" });
        io.emit('message', { type: "info", content: "A new show has been created!" });
        saveShow();
    });

    socket.on('resetPresets', function () {
        presets = [];
        socket.emit('presets', cleanPresets());
        io.emit('presets', cleanPresets());
        io.emit('message', { type: "info", content: "The presets have been cleared!" });
        savePresets();
    });

    socket.on('getFixtureProfiles', function () {
        var startDMXAddress = 1;

        let f = 0; const fMax = fixtures.length; for (; f < fMax; f++) {
            startDMXAddress += fixtures[f].maxOffset + 1;
        }
        fs.readdir(process.cwd() + "/fixtures", (err, files) => {
            var fixturesList = [];
            var fixture = null;
            files.forEach(file => {
                fixture = require(process.cwd() + "/fixtures/" + file);
                fixture.personalities.forEach(function (personality) {
                    fixturesList.push([personality.modelName, personality.modeName, personality.manufacturerName, file, personality.dcid]);
                });
            });
            socket.emit('fixtureProfiles', [fixturesList, startDMXAddress]);
        });
    });

    socket.on('getEffects', function (fixtureid) {
        fs.readdir(process.cwd() + "/effects", (err, files) => {
            var effectsList = [];
            var effect = null;
            files.forEach(file => {
                effect = require(process.cwd() + "/effects/" + file).effectTable;
                if (JSON.stringify(effect.parameterNames).indexOf("Red") >= 0 || JSON.stringify(effect.parameterNames).indexOf("Green") >= 0 || JSON.stringify(effect.parameterNames).indexOf("Blue") >= 0) {
                    effect.type = "Color";
                } else if (JSON.stringify(effect.parameterNames).indexOf("Intensity") >= 0) {
                    effect.type = "Intensity";
                } else if (JSON.stringify(effect.parameterNames).indexOf("Pan") >= 0 || JSON.stringify(effect.parameterNames).indexOf("Tilt") >= 0) {
                    effect.type = "Shape";
                } else if (JSON.stringify(effect.parameterNames).indexOf("Parameter") >= 0) {
                    effect.type = "Parameter";
                }
                effectsList.push({ name: effect.name, type: effect.type, file: file });
            });
            socket.emit('fixtureEffects', { fixtureID: fixtureid, effects: effectsList });
        });
    });

    socket.on('getShowsFromUSB', function () {
        if (SETTINGS.desktop === false) {
            getShowsFromUSB();
        } else {
            socket.emit('message', { type: "error", content: "The console is currently in desktop mode!" });
        }
    });

    socket.on('addFixture', function (msg) {
        var startDMXAddress = parseInt(msg.startDMXAddress);
        let f = 0; const fMax = fixtures.length; for (; f < fMax; f++) {
            if (fixtures[f].startDMXAddress == startDMXAddress) {
                startDMXAddress = null;
            }
            if (startDMXAddress >= fixtures[f].startDMXAddress && startDMXAddress < parseInt(fixtures[f].startDMXAddress) + parseInt(fixtures[f].maxOffset + 1)) {
                startDMXAddress = null;
            }
        }
        if (startDMXAddress) {
            var fixture = null;
            var color = null;
            let i = 0; const iMax = parseInt(msg.creationCount); for (; i < iMax; i++) {
                // Add a fixture using the fixture spec file in the fixtures folder
                fixture = require(process.cwd() + "/fixtures/" + msg.fixtureName);
                fixture = fixture.personalities[fixture.personalities.map(el => el.dcid).indexOf(msg.dcid)];
                fixture.startDMXAddress = startDMXAddress;
                fixture.dmxUniverse = parseInt(msg.universe);
                fixture.hasLockedParameters = false;
                fixture.hasActiveEffects = false;
                fixture.name = fixture.modelName;
                fixture.chips = [];
                fixture.effects = [];
                fixture.parameterTypes = [];
                fixture.invertPan = false;
                fixture.invertTilt = false;
                fixture.swapPanTilt = false;

                if (fixture.colortable == "3874B444-A11E-47D9-8295-04556EAEBEA7") {
                    // RGB
                    colortable = JSON.parse(JSON.stringify(require(process.cwd() + "/chips.json")));
                    let col = 0; const colMax = colortable.length; for (; col < colMax; col++) {
                        color = { color: colortable[col].color, parameters: [] };

                        color.parameters.push({ name: "Red", value: colortable[col].parameters[0] });
                        color.parameters.push({ name: "Green", value: colortable[col].parameters[1] });
                        color.parameters.push({ name: "Blue", value: colortable[col].parameters[2] });

                        fixture.chips.push(color);
                    }
                } else if (fixture.colortable == "77A82F8A-9B24-4C3F-98FC-B6A29FB1AAE6") {
                    // RGBW
                    colortable = JSON.parse(JSON.stringify(require(process.cwd() + "/chips.json")));
                    let col = 0; const colMax = colortable.length; for (; col < colMax; col++) {
                        color = { color: colortable[col].color, parameters: [] };

                        w = Math.min(colortable[col].parameters[0], colortable[col].parameters[1], colortable[col].parameters[2]);

                        color.parameters.push({ name: "Red", value: colortable[col].parameters[0] - w });
                        color.parameters.push({ name: "Green", value: colortable[col].parameters[1] - w });
                        color.parameters.push({ name: "Blue", value: colortable[col].parameters[2] - w });
                        color.parameters.push({ name: "White", value: w });

                        fixture.chips.push(color);
                    }
                } else if (fixture.colortable == "D3E71EC8-3406-4572-A64C-52A38649C795") {
                    // RGBA
                    colortable = JSON.parse(JSON.stringify(require(process.cwd() + "/chips.json")));
                    let col = 0; const colMax = colortable.length; for (; col < colMax; col++) {
                        color = { color: colortable[col].color, parameters: [] };

                        w = Math.min(colortable[col].parameters[0], colortable[col].parameters[1], colortable[col].parameters[2]);
                        a = cppaddon.getAFromRGB(colortable[col].parameters[0], colortable[col].parameters[1], colortable[col].parameters[2]);

                        color.parameters.push({ name: "Red", value: colortable[col].parameters[0] - a });
                        color.parameters.push({ name: "Green", value: colortable[col].parameters[1] - a / 2 });
                        color.parameters.push({ name: "Blue", value: colortable[col].parameters[2] });
                        color.parameters.push({ name: "Amber", value: a });

                        fixture.chips.push(color);
                    }
                } else if (fixture.colortable == "C7A1FB0A-AA23-468F-9060-AC1625155DE8") {
                    // RGBAW
                    colortable = JSON.parse(JSON.stringify(require(process.cwd() + "/chips.json")));
                    let col = 0; const colMax = colortable.length; for (; col < colMax; col++) {
                        color = { color: colortable[col].color, parameters: [] };

                        w = Math.min(colortable[col].parameters[0], colortable[col].parameters[1], colortable[col].parameters[2]);
                        a = cppaddon.getAFromRGB(colortable[col].parameters[0], colortable[col].parameters[1], colortable[col].parameters[2]);

                        color.parameters.push({ name: "Red", value: colortable[col].parameters[0] - w - a });
                        color.parameters.push({ name: "Green", value: colortable[col].parameters[1] - w - a / 2 });
                        color.parameters.push({ name: "Blue", value: colortable[col].parameters[2] - w });
                        color.parameters.push({ name: "Amber", value: a });
                        color.parameters.push({ name: "White", value: w });

                        fixture.chips.push(color);
                    }
                } else if (fixture.colortable == "EF4970BA-2536-4725-9B0F-B2D7A021E139") {
                    // CMY
                    colortable = JSON.parse(JSON.stringify(require(process.cwd() + "/chips.json")));
                    let col = 0; const colMax = colortable.length; for (; col < colMax; col++) {
                        color = { color: colortable[col].color, parameters: [] };

                        color.parameters.push({ name: "Cyan", value: 100 - colortable[col].parameters[0] });
                        color.parameters.push({ name: "Magenta", value: 100 - colortable[col].parameters[1] });
                        color.parameters.push({ name: "Yellow", value: 100 - colortable[col].parameters[2] });

                        fixture.chips.push(color);
                    }
                } /*else if (fixture.colortable == "B074A2D3-0C40-45A7-844A-7C2721E0B267") {
                    // HSI
                    colortable = JSON.parse(JSON.stringify(require(process.cwd() + "/chips.json")));
                    let col = 0; const colMax = colortable.length; for (; col < colMax; col++) {
                        color = { color: colortable[col].color, parameters: [] };

                        r = colortable[col].parameters[0];
                        g = colortable[col].parameters[1];
                        b = colortable[col].parameters[2];

                        r = cppaddon.mapRange(r, 0, 100, 0, 1);
                        g = cppaddon.mapRange(g, 0, 100, 0, 1);
                        b = cppaddon.mapRange(b, 0, 100, 0, 1);
                        i = (r + g + b) / 3.0;

                        rn = r / (r + g + b);
                        gn = g / (r + g + b);
                        bn = b / (r + g + b);

                        h = Math.acos((0.5 * ((rn - gn) + (rn - bn))) / (Math.sqrt((rn - gn) * (rn - gn) + (rn - bn) * (gn - bn))));
                        if(b > g)
                        {
                            h = 2 * Math.PI - h;	
                        }

                        s = 1 - 3 * Math.min(rn, Math.min(gn, bn));

                        color.parameters.push({ name: "Hue", value: h });
                        color.parameters.push({ name: "Saturation", value: s });
                        color.parameters.push({ name: "Intensity", value: i });

                        fixture.chips.push(color);
                    }
                }*/
                let c = 0; const cMax = fixture.parameters.length; for (; c < cMax; c++) {
                    fixture.parameters[c].value = fixture.parameters[c].home;
                    fixture.parameters[c].max = 65535;
                    fixture.parameters[c].min = 0;
                    fixture.parameters[c].displayValue = cppaddon.mapRange(fixture.parameters[c].home, fixture.parameters[c].min, fixture.parameters[c].max, 0, 100);
                    fixture.parameters[c].locked = false;
                    fixture.parameters[c].id = generateID();
                    if (fixture.parameters[c].type == 2) {
                        fixture.parameterTypes.push("Shape");
                    } else if (fixture.parameters[c].type == 5) {
                        fixture.parameterTypes.push("Color");
                    } else if (fixture.parameters[c].type == 4) {
                        fixture.parameterTypes.push("Parameter");
                    } else if (fixture.parameters[c].type == 1) {
                        fixture.parameterTypes.push("Intensity");
                    }
                }
                fixture.parameters.sort((a, b) => (a.coarse > b.coarse) ? 1 : -1)
                fixture.shortName = fixture.name.split(" ")[0];
                // Assign a random id for easy access to this fixture
                fixture.id = generateID();
                fixtures.push(JSON.parse(JSON.stringify(fixture)));
                let cc = 0; const ccMax = cues.length; for (; cc < ccMax; cc++) {
                    cues[cc].fixtures.push(cleanFixtureForCue(fixture));
                }
                startDMXAddress += fixture.maxOffset + 1;
                delete require.cache[require.resolve(process.cwd() + "/fixtures/" + msg.fixtureName)]
            }
            io.emit('fixtures', { fixtures: cleanFixtures(), target: true });
            saveShow();
        } else {
            socket.emit('message', { type: "error", content: "A fixture with this starting DMX address already exists!" });
        }
    });

    socket.on('removeFixture', function (fixtureID) {
        if (fixtures.length != 0) {
            if (fixtures.some(e => e.id === fixtureID)) {
                let c = 0; const cMax = cues.length; for (; c < cMax; c++) {
                    if (cues[c].fixtures.some(e => e.id === fixtureID)) {
                        cues[c].fixtures.splice(cues[c].fixtures.map(el => el.id).indexOf(fixtureID), 1);
                        if (cues[c].fixtures.length == 0) {
                            cues.splice(cues.map(el => el.id).indexOf(cues[c].id), 1);
                        }
                    }
                }
                let g = 0; const gMax = groups.length; for (; g < gMax; g++) {
                    if (groups[g].ids.some(e => e === fixtureID)) {
                        groups[g].ids.splice(groups[g].ids.map(el => el).indexOf(fixtureID), 1);
                        groups[g].parameters = generateGroupParameters(groups[g]);
                        groups[g].parameterTypes = [];
                        let c = 0; const cMax = groups[g].parameters.length; for (; c < cMax; c++) {
                            if (groups[g].parameters[c].type == 2) {
                                groups[g].parameterTypes.push("Shape");
                            } else if (groups[g].parameters[c].type == 5) {
                                groups[g].parameterTypes.push("Color");
                            } else if (groups[g].parameters[c].type == 4) {
                                groups[g].parameterTypes.push("Parameter");
                            } else if (groups[g].parameters[c].type == 1) {
                                groups[g].parameterTypes.push("Intensity");
                            }
                        }
                    }
                    if (groups[g].ids.length == 0) {
                        gtid = groups[g].id;
                        groups.splice(g, 1);
                        socket.emit('message', { type: "info", content: "Group has been removed!" });
                        io.emit('resetView', { type: 'groups', eid: gtid });
                    }
                }
                var fixture = fixtures[fixtures.map(el => el.id).indexOf(fixtureID)];
                // check on this
                let cc = 0; const ccMax = fixture.parameters.length; for (; cc < ccMax; cc++) {
                    fixture.parameters[cc][((fixture.startDMXAddress - 1) + fixture.parameters[cc].coarse) + (512 * fixture.dmxUniverse)] = 0;
                }
                fixtures.splice(fixtures.map(el => el.id).indexOf(fixtureID), 1);
                socket.emit('message', { type: "info", content: "Fixture has been removed!" });
                io.emit('resetView', { type: 'fixtures', eid: fixtureID });
                io.emit('fixtures', { fixtures: cleanFixtures(), target: true });
                io.emit('activeCue', currentCueID);
                io.emit('cues', cleanCues());
                io.emit('groups', { groups: cleanGroups(), target: true });
                saveShow();
            } else {
                socket.emit('message', { type: "error", content: "This fixture does not exist!" });
            }
        } else {
            socket.emit('message', { type: "error", content: "No fixtures exist!" });
        }
    });

    socket.on('removeEffect', function (msg) {
        if (fixtures.length != 0) {
            if (fixtures.some(e => e.id === msg.fixtureID)) {
                var fixture = null;
                let c = 0; const cMax = cues.length; for (; c < cMax; c++) {
                    if (cues[c].fixtures.some(e => e.id === msg.fixtureID)) {
                        fixture = cues[c].fixtures[cues[c].fixtures.map(el => el.id).indexOf(msg.fixtureID)];
                        if (fixture.effects.some(e => e.id === msg.effectID)) {
                            fixture.effects.splice(fixture.effects.map(el => el.id).indexOf(msg.effectID), 1);
                        } else {
                            socket.emit('message', { type: "error", content: "This effect does not exist!" });
                            break;
                        }
                    }
                }
                var fixture = fixtures[fixtures.map(el => el.id).indexOf(msg.fixtureID)];
                if (fixture.effects.some(e => e.id === msg.effectID)) {
                    fixture.effects.splice(fixture.effects.map(el => el.id).indexOf(msg.effectID), 1);
                    fixture.hasActiveEffects = checkFixtureActiveEffects(fixture.effects);
                    let p = 0; const pMax = fixture.parameters.length; for (; p < pMax; p++) {
                        fixture.parameters[p].displayValue = cppaddon.mapRange(fixture.parameters[p].value, fixture.parameters[p].min, fixture.parameters[p].max, 0, 100);
                    }
                    io.emit('fixtures', { fixtures: cleanFixtures(), target: true });
                    io.emit('resetView', { type: 'effect', eid: msg.effectID });
                    socket.emit('message', { type: "info", content: "Fixture effect has been removed!" });
                    saveShow();
                } else {
                    socket.emit('message', { type: "error", content: "This effect does not exist!" });
                }
            } else {
                socket.emit('message', { type: "error", content: "This fixture does not exist!" });
            }
        } else {
            socket.emit('message', { type: "error", content: "No fixtures exist!" });
        }
    });

    socket.on('getEffectSettings', function (msg) {
        if (fixtures.length != 0) {
            if (fixtures.some(e => e.id === msg.fixtureID)) {
                var fixture = fixtures[fixtures.map(el => el.id).indexOf(msg.fixtureID)];
                if (fixture.effects.some(e => e.id === msg.effectID)) {
                    socket.emit('effectSettings', { fixtureID: fixture.id, effect: fixture.effects[fixture.effects.map(el => el.id).indexOf(msg.effectID)] });
                } else {
                    socket.emit('message', { type: "error", content: "This effect does not exist!" });
                }
            } else {
                socket.emit('message', { type: "error", content: "This fixture does not exist!" });
            }
        } else {
            socket.emit('message', { type: "error", content: "No fixtures exist!" });
        }
    });

    socket.on('editFixtureSettings', function (msg) {
        if (fixtures.length != 0) {
            if (fixtures.some(e => e.id === msg.id)) {
                var fixture = fixtures[fixtures.map(el => el.id).indexOf(msg.id)];
                if (msg.shortName == "" || msg.shortName == fixture.name.split(" ")[0]) {
                    fixture.shortName = msg.name.split(" ")[0];
                } else {
                    fixture.shortName = msg.shortName;
                }
                fixture.name = msg.name;
                fixture.invertPan = msg.invertPan;
                fixture.invertTilt = msg.invertTilt;
                fixture.swapPanTilt = msg.swapPanTilt;
                fixture.dmxUniverse = parseInt(msg.dmxUniverse);
                fixture.startDMXAddress = parseInt(msg.startDMXAddress);
                io.emit('fixtures', { fixtures: cleanFixtures(), target: true });
                saveShow();
            } else {
                socket.emit('message', { type: "error", content: "This fixture does not exist!" });
            }
        } else {
            socket.emit('message', { type: "error", content: "No fixtures exist!" });
        }
    });

    socket.on('editEffectSettings', function (msg) {
        if (fixtures.length != 0) {
            if (fixtures.some(e => e.id === msg.fixtureID)) {
                var fixture = fixtures[fixtures.map(el => el.id).indexOf(msg.fixtureID)];
                if (fixture.effects.some(e => e.id === msg.effectID)) {
                    var effect = fixture.effects[fixture.effects.map(el => el.id).indexOf(msg.effectID)];
                    effect.name = msg.name;
                    effect.depth = parseFloat(msg.depth);
                    effect.speed = parseFloat(msg.speed);
                    socket.broadcast.emit('effectSettings', { fixtureID: fixture.id, effect: fixture.effects[fixture.effects.map(el => el.id).indexOf(msg.effectID)] });
                    io.emit('fixtures', { fixtures: cleanFixtures(), target: true });
                    saveShow();
                } else {
                    socket.emit('message', { type: "error", content: "This effect does not exist!" });
                }
            } else {
                socket.emit('message', { type: "error", content: "This fixture does not exist!" });
            }
        } else {
            socket.emit('message', { type: "error", content: "No fixtures exist!" });
        }
    });

    socket.on('getFixtureParameters', function (fixtureID) {
        if (fixtures.length != 0) {
            if (fixtures.some(e => e.id === fixtureID)) {
                socket.emit('fixtureParameters', cleanFixture(fixtures[fixtures.map(el => el.id).indexOf(fixtureID)]));
            } else {
                socket.emit('message', { type: "error", content: "This fixture does not exist!" });
            }
        } else {
            socket.emit('message', { type: "error", content: "No fixtures exist!" });
        }
    });

    socket.on('resetFixtures', function () {
        if (fixtures.length != 0) {
            resetFixtures();
            currentCue = "";
            currentCueID = "";
            io.emit('activeCue', currentCueID);
            io.emit('fixtures', { fixtures: cleanFixtures(), target: true });
            socket.emit('message', { type: "info", content: "Fixture values have been reset!" });
            saveShow();
        } else {
            socket.emit('message', { type: "error", content: "No fixtures exist!" });
        }
    });

    socket.on('resetFixture', function (fixtureID) {
        if (fixtures.length != 0) {
            if (fixtures.some(e => e.id === fixtureID)) {
                var fixture = fixtures[fixtures.map(el => el.id).indexOf(fixtureID)];
                let c = 0; const cMax = fixture.parameters.length; for (; c < cMax; c++) {
                    if (fixture.parameters[c].locked != true) {
                        fixture.parameters[c].value = fixture.parameters[c].home;
                        fixture.parameters[c].displayValue = cppaddon.mapRange(fixture.parameters[c].value, fixture.parameters[c].min, fixture.parameters[c].max, 0, 100);
                    }
                }
                let e = 0; const eMax = fixture.effects.length; for (; e < eMax; e++) {
                    fixture.effects[e].active = false;
                }
                fixture.hasActiveEffects = false;
                io.emit('fixtures', { fixtures: cleanFixtures(), target: true });
                socket.emit('message', { type: "info", content: "Fixture values reset!" });
                saveShow();
            } else {
                socket.emit('message', { type: "error", content: "This fixture does not exist!" });
            }
        } else {
            socket.emit('message', { type: "error", content: "No fixtures exist!" });
        }
    });

    socket.on('changeFixtureParameterValue', function (msg) {
        if (fixtures.length != 0) {
            if (fixtures.some(e => e.id === msg.id)) {
                var fixture = fixtures[fixtures.map(el => el.id).indexOf(msg.id)];
                var parameter = fixture.parameters[fixture.parameters.map(el => el.id).indexOf(msg.pid)];
                parameter.value = parseInt(msg.value);
                parameter.displayValue = cppaddon.mapRange(parameter.value, parameter.min, parameter.max, 0, 100);
                socket.broadcast.emit('fixtures', { fixtures: cleanFixtures(), target: true });
                socket.emit('fixtures', { fixtures: cleanFixtures(), target: false });
            } else {
                socket.emit('message', { type: "error", content: "This fixture does not exist!" });
            }
        } else {
            socket.emit('message', { type: "error", content: "No fixtures exist!" });
        }
    });

    socket.on('changeFixtureParameterLock', function (msg) {
        if (fixtures.length != 0) {
            if (fixtures.some(e => e.id === msg.id)) {
                var fixture = fixtures[fixtures.map(el => el.id).indexOf(msg.id)];
                var parameter = fixture.parameters[fixture.parameters.map(el => el.id).indexOf(msg.pid)];
                parameter.locked = !parameter.locked;
                fixture.hasLockedParameters = false;
                let c = 0; const cMax = fixture.parameters.length; for (; c < cMax; c++) {
                    if (fixture.parameters[c].locked) {
                        fixture.hasLockedParameters = true;
                    }
                }
                io.emit('fixtures', { fixtures: cleanFixtures(), target: true });
            } else {
                socket.emit('message', { type: "error", content: "This fixture does not exist!" });
            }
        } else {
            socket.emit('message', { type: "error", content: "No fixtures exist!" });
        }
    });

    socket.on('useFixtureChip', function (msg) {
        if (fixtures.length != 0) {
            if (fixtures.some(e => e.id === msg.id)) {
                var fixture = fixtures[fixtures.map(el => el.id).indexOf(msg.id)];
                var chip = fixture.chips[msg.pid];
                let c = 0; const cMax = chip.parameters.length; for (; c < cMax; c++) {
                    fixture.parameters[fixture.parameters.map(el => el.name).indexOf(chip.parameters[c].name)].value = (fixture.parameters[fixture.parameters.map(el => el.name).indexOf(chip.parameters[c].name)].max / 100.0) * chip.parameters[c].value;
                    fixture.parameters[fixture.parameters.map(el => el.name).indexOf(chip.parameters[c].name)].displayValue = chip.parameters[c].value;
                }
                io.emit('fixtures', { fixtures: cleanFixtures(), target: true });
            } else {
                socket.emit('message', { type: "error", content: "This fixture does not exist!" });
            }
        } else {
            socket.emit('message', { type: "error", content: "No fixtures exist!" });
        }
    });

    socket.on('useFixtureParameterRange', function (msg) {
        if (fixtures.length != 0) {
            if (fixtures.some(e => e.id === msg.id)) {
                var fixture = fixtures[fixtures.map(el => el.id).indexOf(msg.id)];
                var parameter = fixture.parameters[fixture.parameters.map(el => el.id).indexOf(msg.pid)];
                var range = parameter.ranges[msg.rid];
                fixture.parameters[fixture.parameters.map(el => el.id).indexOf(msg.pid)].value = cppaddon.mapRange(range.default, 0, 255, parameter.min, parameter.max);
                fixture.parameters[fixture.parameters.map(el => el.id).indexOf(msg.pid)].displayValue = cppaddon.mapRange(fixture.parameters[fixture.parameters.map(el => el.id).indexOf(msg.pid)].value, fixture.parameters[fixture.parameters.map(el => el.id).indexOf(msg.pid)].min, fixture.parameters[fixture.parameters.map(el => el.id).indexOf(msg.pid)].max, 0, 100);;
                io.emit('fixtures', { fixtures: cleanFixtures(), target: true });
            } else {
                socket.emit('message', { type: "error", content: "This fixture does not exist!" });
            }
        } else {
            socket.emit('message', { type: "error", content: "No fixtures exist!" });
        }
    });

    socket.on('useGroupParameterRange', function (msg) {
        if (fixtures.length != 0) {
            if (groups.length != 0) {
                if (groups.some(e => e.id === msg.id)) {
                    var group = groups[groups.map(el => el.id).indexOf(msg.id)];
                    var parameter = group.parameters[group.parameters.map(el => el.id).indexOf(msg.pid)];
                    var range = parameter.ranges[msg.rid];
                    group.parameters[group.parameters.map(el => el.id).indexOf(msg.pid)].value = cppaddon.mapRange(range.default, 0, 255, parameter.min, parameter.max);
                    group.parameters[group.parameters.map(el => el.id).indexOf(msg.pid)].displayValue = cppaddon.mapRange(group.parameters[group.parameters.map(el => el.id).indexOf(msg.pid)].value, group.parameters[group.parameters.map(el => el.id).indexOf(msg.pid)].min, group.parameters[group.parameters.map(el => el.id).indexOf(msg.pid)].max, 0, 100);;
                    setFixtureGroupValues(group, parameter);
                    io.emit('groups', { groups: cleanGroups(), target: true });
                    io.emit('fixtures', { fixtures: cleanFixtures(), target: true });
                } else {
                    socket.emit('message', { type: "error", content: "This group does not exist!" });
                }
            } else {
                socket.emit('message', { type: "error", content: "No groups exist!" });
            }
        } else {
            socket.emit('message', { type: "error", content: "No fixtures exist!" });
        }
    });

    socket.on('changeFixtureEffectState', function (msg) {
        if (fixtures.length != 0) {
            if (fixtures.some(e => e.id === msg.id)) {
                var fixture = fixtures[fixtures.map(el => el.id).indexOf(msg.id)];
                if (fixture.effects.some(e => e.id === msg.effectid)) {
                    var effect = fixture.effects[fixture.effects.map(el => el.id).indexOf(msg.effectid)];
                    effect.step = 0;
                    effect.active = !effect.active;
                    fixture.hasActiveEffects = checkFixtureActiveEffects(fixture.effects);
                    if (effect.active == false) {
                        let p = 0; const pMax = fixture.parameters.length; for (; p < pMax; p++) {
                            fixture.parameters[p].displayValue = cppaddon.mapRange(fixture.parameters[p].value, fixture.parameters[p].min, fixture.parameters[p].max, 0, 100);
                        }
                    }
                    io.emit('fixtures', { fixtures: cleanFixtures(), target: true });
                    saveShow();
                } else {
                    socket.emit('message', { type: "error", content: "This effect does not exist!" });
                }
            } else {
                socket.emit('message', { type: "error", content: "This fixture does not exist!" });
            }
        } else {
            socket.emit('message', { type: "error", content: "No fixtures exist!" });
        }
    });

    socket.on('addEffect', function (msg) {
        if (fixtures.length != 0) {
            if (fixtures.some(e => e.id === msg.fixtureID)) {
                var fixture = fixtures[fixtures.map(el => el.id).indexOf(msg.fixtureID)];
                var effect = JSON.parse(JSON.stringify(require(process.cwd() + "/effects/" + msg.effectFile).effectTable));
                effect.active = true;
                effect.step = 0;
                effect.depth = 1.0;
                effect.speed = 0.5;
                effect.index = 0;
                effect.chroma = 1;
                effect.fan = 0;
                effect.aspect = 1;
                effect.rotation = 0;
                effect.id = generateID();
                if (JSON.stringify(effect.parameterNames) == JSON.stringify(["Red", "Green", "Blue"])) {
                    effect.type = "Color";
                } else if (JSON.stringify(effect.parameterNames) == JSON.stringify(["Intensity"])) {
                    effect.type = "Intensity";
                } else if (JSON.stringify(effect.parameterNames) == JSON.stringify(["Pan", "Tilt"])) {
                    effect.type = "Shape";
                } else if (JSON.stringify(effect.parameterNames) == JSON.stringify(["Parameter"])) {
                    effect.parameterNames = [msg.parameterName];
                    effect.type = "Parameter";
                    effect.name = effect.name + " (" + msg.parameterName + ")";
                }
                fixture.effects.push(effect);
                var topush = null;
                let cc = 0; const ccMax = cues.length; for (; cc < ccMax; cc++) {
                    let f = 0; const fMax = cues[cc].fixtures.length; for (; f < fMax; f++) {
                        if (cues[cc].fixtures[f].id == fixture.id) {
                            topush = cleanEffectForCue(effect);
                            topush.active = false;
                            cues[cc].fixtures[f].effects.push(topush);
                        }
                    }
                }
                fixture.hasActiveEffects = true;
                saveShow();
                socket.emit('message', { type: "info", content: "Effect has been added to fixture!" });
                io.emit('fixtures', { fixtures: cleanFixtures(), target: true });
            } else {
                socket.emit('message', { type: "error", content: "This fixture does not exist!" });
            }
        } else {
            socket.emit('message', { type: "error", content: "No fixtures exist!" });
        }
    });

    socket.on('recordCue', function () {
        if (fixtures.length != 0) {
            var newCue = {
                id: generateID(),
                name: "Cue " + (cues.length + 1),
                upTime: SETTINGS.defaultUpTime,
                downTime: SETTINGS.defaultDownTime,
                follow: -1,
                upStep: SETTINGS.defaultUpTime * 40,
                downStep: SETTINGS.defaultDownTime * 40,
                active: false,
                following: false,
                fixtures: cleanFixturesForCue(),
                sequences: cleanSequencesForCue(),
                includeIntensityColor: true,
                includePosition: true,
                includeBeam: true
            };
            cues.push(newCue);
            io.emit('activeCue', currentCueID);
            io.emit('cues', cleanCues());
            saveShow();
        } else {
            socket.emit('message', { type: "error", content: "No fixtures exist!" });
        }
    });

    socket.on('updateCue', function (cueID) {
        if (cues.length != 0) {
            if (cues.some(e => e.id === cueID)) {
                var cue = cues[cues.map(el => el.id).indexOf(cueID)];
                cue.fixtures = cleanFixturesForCue();
                cue.sequences = cleanSequencesForCue();
                io.emit('activeCue', currentCueID);
                io.emit('cues', cleanCues());
                socket.emit('message', { type: "info", content: "Cue parameters have been updated!" });
                saveShow();
            } else {
                socket.emit('message', { type: "error", content: "This cue does not exist!" });
            }
        } else {
            socket.emit('message', { type: "error", content: "No cues exist!" });
        }
    });

    socket.on('cloneCueEnd', function (cueID) {
        if (cues.length != 0) {
            if (cues.some(e => e.id === cueID)) {
                var newCue = JSON.parse(JSON.stringify(cues[cues.map(el => el.id).indexOf(cueID)]));
                newCue.id = generateID();
                cues.push(newCue);
                io.emit('activeCue', currentCueID);
                io.emit('cues', cleanCues());
                socket.emit('message', { type: "info", content: "Cue has been cloned!" });
                saveShow();
            } else {
                socket.emit('message', { type: "error", content: "This cue does not exist!" });
            }
        } else {
            socket.emit('message', { type: "error", content: "No cues exist!" });
        }
    });

    socket.on('cloneCueNext', function (cueID) {
        if (cues.length != 0) {
            if (cues.some(e => e.id === cueID)) {
                var newCue = JSON.parse(JSON.stringify(cues[cues.map(el => el.id).indexOf(cueID)]));
                newCue.id = generateID();
                cues.push(newCue);
                moveArrayItem(cues, cues.map(el => el.id).indexOf(newCue.id), cues.map(el => el.id).indexOf(cueID) + 1);
                io.emit('activeCue', currentCueID);
                io.emit('cues', cleanCues());
                socket.emit('message', { type: "info", content: "Cue has been cloned!" });
                saveShow();
            } else {
                socket.emit('message', { type: "error", content: "This cue does not exist!" });
            }
        } else {
            socket.emit('message', { type: "error", content: "No cues exist!" });
        }
    });

    socket.on('getCueSettings', function (cueID) {
        if (cues.length != 0) {
            if (cues.some(e => e.id === cueID)) {
                socket.emit('cueSettings', cues[cues.map(el => el.id).indexOf(cueID)]);
            } else {
                socket.emit('message', { type: "error", content: "This cue does not exist!" });
            }
        } else {
            socket.emit('message', { type: "error", content: "No cues exist!" });
        }
    });

    socket.on('editCueSettings', function (msg) {
        if (cues.length != 0) {
            if (cues.some(e => e.id === msg.id)) {
                var cue = cues[cues.map(el => el.id).indexOf(msg.id)];
                var changed = true;
                if (parseInt(msg.upTime) == cue.upTime && parseInt(msg.downTime) == cue.downTime) {
                    changed = false;
                }
                cue.name = msg.name;
                cue.includeIntensityColor = msg.includeIntensityColor;
                cue.includePosition = msg.includePosition;
                cue.includeBeam = msg.includeBeam;
                cue.upTime = parseInt(msg.upTime);
                cue.downTime = parseInt(msg.downTime);
                if (cue.upTime == 0) {
                    cue.upTime = 0.001;
                }
                if (cue.downTime == 0) {
                    cue.downTime = 0.001;
                }
                if (msg.follow < -1) {
                    cue.follow = -1;
                } else {
                    cue.follow = msg.follow;
                }
                if (cue.follow === 0) {
                    cue.follow = 0.001;
                }
                if (changed == true) {
                    cue.upStep = cue.upTime * 40;
                    cue.downStep = cue.downTime * 40;
                }
                io.emit('activeCue', currentCueID);
                io.emit('cues', cleanCues());
                saveShow();
            } else {
                socket.emit('message', { type: "error", content: "This cue does not exist!" });
            }
        } else {
            socket.emit('message', { type: "error", content: "No cues exist!" });
        }
    });

    socket.on('removeCue', function (cueID) {
        if (cues.length != 0) {
            if (cues.some(e => e.id === cueID)) {
                cues.splice(cues.map(el => el.id).indexOf(cueID), 1);
                if (currentCue == cueID || lastCue == cueID) {
                    lastCue = "";
                    currentCue = lastCue;
                    io.emit('cueActionBtn', false);
                }
                io.emit('resetView', { type: 'cues', eid: cueID });
                socket.emit('message', { type: "info", content: "Cue has been removed!" });
                io.emit('activeCue', currentCueID);
                io.emit('cues', cleanCues());
                saveShow();
            } else {
                socket.emit('message', { type: "error", content: "This cue does not exist!" });
            }
        } else {
            socket.emit('message', { type: "error", content: "No cues exist!" });
        }
    });

    socket.on('nextCue', function () {
        if (cues.length != 0) {
            if (cues.some(e => e.id === lastCue)) {
                cues[cues.map(el => el.id).indexOf(lastCue)].upStep = cues[cues.map(el => el.id).indexOf(lastCue)].upTime * 40;
                cues[cues.map(el => el.id).indexOf(lastCue)].downStep = cues[cues.map(el => el.id).indexOf(lastCue)].downTime * 40;
                cues[cues.map(el => el.id).indexOf(lastCue)].active = false;
                cues[cues.map(el => el.id).indexOf(lastCue)].following = false;
                if (cues.map(el => el.id).indexOf(lastCue) == cues.length - 1) {
                    lastCue = cues[0].id;
                } else {
                    lastCue = cues[cues.map(el => el.id).indexOf(lastCue) + 1].id;
                }
            } else {
                lastCue = cues[0].id;
            }
            var fixtureParameters = null;
            let f = 0; const fMax = fixtures.length; for (; f < fMax; f++) {
                fixtureParameters = fixtures[fixtures.map(el => el.id).indexOf(fixtures[f].id)].parameters;
                let c = 0; const cMax = fixtures[f].parameters.length; for (; c < cMax; c++) {
                    if (fixtureParameters[c].locked === false) {
                        fixtureParameters[c].value = cppaddon.mapRange(fixtureParameters[c].displayValue, 0, 100, fixtureParameters[c].min, fixtureParameters[c].max);
                    }
                }
            }
            currentCue = lastCue;
            cues[cues.map(el => el.id).indexOf(lastCue)].active = true;
            currentCueID = lastCue;
            io.emit('activeCue', currentCueID);
            io.emit('cues', cleanCues());
            io.emit('cueActionBtn', true);
        } else {
            socket.emit('message', { type: "error", content: "No cues exist!" });
        }
    });

    socket.on('lastCue', function () {
        if (cues.length != 0) {
            if (lastCue != "") {
                cues[cues.map(el => el.id).indexOf(lastCue)].upStep = cues[cues.map(el => el.id).indexOf(lastCue)].upTime * 40;
                cues[cues.map(el => el.id).indexOf(lastCue)].downStep = cues[cues.map(el => el.id).indexOf(lastCue)].downTime * 40;
                cues[cues.map(el => el.id).indexOf(lastCue)].active = false;
                cues[cues.map(el => el.id).indexOf(lastCue)].following = false;
                if (cues.map(el => el.id).indexOf(lastCue) == 0) {
                    lastCue = cues[cues.length - 1].id;
                } else {
                    lastCue = cues[cues.map(el => el.id).indexOf(lastCue) - 1].id;
                }
            } else {
                lastCue = cues[cues.length - 1].id;
            }
            var fixtureParameters = null;
            let f = 0; const fMax = fixtures.length; for (; f < fMax; f++) {
                fixtureParameters = fixtures[fixtures.map(el => el.id).indexOf(fixtures[f].id)].parameters;
                let c = 0; const cMax = fixtures[f].parameters.length; for (; c < cMax; c++) {
                    if (fixtureParameters[c].locked === false) {
                        fixtureParameters[c].value = cppaddon.mapRange(fixtureParameters[c].displayValue, 0, 100, fixtureParameters[c].min, fixtureParameters[c].max);
                    }
                }
            }
            currentCue = lastCue;
            cues[cues.map(el => el.id).indexOf(lastCue)].active = true;
            currentCueID = lastCue;
            io.emit('activeCue', currentCueID);
            io.emit('cues', cleanCues());
            io.emit('cueActionBtn', true);
        } else {
            socket.emit('message', { type: "error", content: "No cues exist!" });
        }
    });

    socket.on('stopCue', function () {
        if (cues.length != 0) {
            var fixtureParameters = null;
            let f = 0; const fMax = fixtures.length; for (; f < fMax; f++) {
                fixtureParameters = fixtures[f].parameters;
                let c = 0; const cMax = fixtureParameters.length; for (; c < cMax; c++) {
                    if (fixtureParameters[c].locked === false) {
                        fixtureParameters[c].value = cppaddon.mapRange(fixtureParameters[c].displayValue, 0, 100, fixtureParameters[c].min, fixtureParameters[c].max);
                    }
                }
            }
            currentCue = "";
            cues[cues.map(el => el.id).indexOf(lastCue)].upStep = cues[cues.map(el => el.id).indexOf(lastCue)].upTime * 40;
            cues[cues.map(el => el.id).indexOf(lastCue)].downStep = cues[cues.map(el => el.id).indexOf(lastCue)].downTime * 40;
            cues[cues.map(el => el.id).indexOf(lastCue)].active = false;
            cues[cues.map(el => el.id).indexOf(lastCue)].following = false;
            io.emit('activeCue', currentCueID);
            io.emit('cues', cleanCues());
            io.emit('cueActionBtn', false);
        } else {
            socket.emit('message', { type: "error", content: "No cues exist!" });
        }
    });

    socket.on('gotoCue', function (cueID) {
        if (cues.length != 0) {
            if (lastCue != "") {
                cues[cues.map(el => el.id).indexOf(lastCue)].upStep = cues[cues.map(el => el.id).indexOf(lastCue)].upTime * 40;
                cues[cues.map(el => el.id).indexOf(lastCue)].downStep = cues[cues.map(el => el.id).indexOf(lastCue)].downTime * 40;
                cues[cues.map(el => el.id).indexOf(lastCue)].active = false;
                cues[cues.map(el => el.id).indexOf(lastCue)].following = false;
            }
            var fixtureParameters = null;
            let f = 0; const fMax = fixtures.length; for (; f < fMax; f++) {
                fixtureParameters = fixtures[fixtures.map(el => el.id).indexOf(fixtures[f].id)].parameters;
                let c = 0; const cMax = fixtures[f].parameters.length; for (; c < cMax; c++) {
                    if (fixtureParameters[c].locked === false) {
                        fixtureParameters[c].value = cppaddon.mapRange(fixtureParameters[c].displayValue, 0, 100, fixtureParameters[c].min, fixtureParameters[c].max);
                    }
                }
            }
            lastCue = cues[cues.map(el => el.id).indexOf(cueID)].id;
            currentCue = lastCue;
            cues[cues.map(el => el.id).indexOf(lastCue)].active = true;
            currentCueID = lastCue;
            io.emit('activeCue', currentCueID);
            io.emit('cues', cleanCues());
            io.emit('cueActionBtn', true);
        } else {
            socket.emit('message', { type: "error", content: "No cues exist!" });
        }
    });

    socket.on('moveCueUp', function (cueID) {
        if (cues.length != 0) {
            moveArrayItem(cues, cues.map(el => el.id).indexOf(cueID), cues.map(el => el.id).indexOf(cueID) - 1);
            io.emit('activeCue', currentCueID);
            io.emit('cues', cleanCues());
            socket.emit('message', { type: "info", content: "Cue moved up." });
            saveShow();
        } else {
            socket.emit('message', { type: "error", content: "No cues exist!" });
        }
    });

    socket.on('moveCueDown', function (cueID) {
        if (cues.length != 0) {
            moveArrayItem(cues, cues.map(el => el.id).indexOf(cueID), cues.map(el => el.id).indexOf(cueID) + 1);
            io.emit('activeCue', currentCueID);
            io.emit('cues', cleanCues());
            socket.emit('message', { type: "info", content: "Cue moved down." });
            saveShow();
        } else {
            socket.emit('message', { type: "error", content: "No cues exist!" });
        }
    });

    socket.on('addSequence', function (fixtureIDs) {
        if (fixtures.length != 0) {
            var newSequence = {
                id: generateID(),
                name: "Sequence " + (sequences.length + 1),
                active: false,
                steps: [],
                ids: fixtureIDs,
                includeIntensityColor: true,
                includePosition: true,
                includeBeam: true
            };
            sequences.push(newSequence);
            io.emit('sequences', cleanSequences());
            saveShow();
        } else {
            socket.emit('message', { type: "error", content: "No fixtures exist!" });
        }
    });

    socket.on('recordSequenceStep', function (sequenceID) {
        if (fixtures.length != 0) {
            var sequence = sequences[sequences.map(el => el.id).indexOf(sequenceID)];
            var newStep = {
                id: generateID(),
                name: "Step " + (sequence.steps.length + 1),
                upTime: SETTINGS.defaultUpTime,
                downTime: SETTINGS.defaultDownTime,
                follow: -1,
                upStep: SETTINGS.defaultUpTime * 40,
                downStep: SETTINGS.defaultDownTime * 40,
                active: false,
                following: false,
                fixtures: cleanFixturesForSequence(sequence.ids)
            };
            sequence.steps.push(newStep);
            io.emit('sequences', cleanSequences());
            saveShow();
        } else {
            socket.emit('message', { type: "error", content: "No fixtures exist!" });
        }
    });

    socket.on('addGroup', function (fixtureIDs) {
        if (fixtureIDs.length > 0) {
            var newGroup = {
                id: generateID(),
                name: "Group " + (groups.length + 1),
                ids: fixtureIDs,
                parameters: [],
                parameterTypes: []
            };
            newGroup.parameters = generateGroupParameters(newGroup);
            newGroup.parameterTypes = [];
            let c = 0; const cMax = newGroup.parameters.length; for (; c < cMax; c++) {
                if (newGroup.parameters[c].type == 2) {
                    newGroup.parameterTypes.push("Shape");
                } else if (newGroup.parameters[c].type == 5) {
                    newGroup.parameterTypes.push("Color");
                } else if (newGroup.parameters[c].type == 4) {
                    newGroup.parameterTypes.push("Parameter");
                } else if (newGroup.parameters[c].type == 1) {
                    newGroup.parameterTypes.push("Intensity");
                }
            }
            groups.push(newGroup);
            io.emit('groups', { groups: cleanGroups(), target: true });
            saveShow();
        } else {
            socket.emit('message', { type: "error", content: "No fixtures selected!" });
        }
    });

    socket.on('getGroupParameters', function (groupID) {
        if (groups.length != 0) {
            var group = groups[groups.map(el => el.id).indexOf(groupID)];
            var fixture = null;
            var valAvg = null;
            var valAvgCount = null;
            var shouldLock = false;
            let c = 0; const cMax = group.parameters.length; for (; c < cMax; c++) {
                valAvg = 0;
                valAvgCount = 0;
                let i = 0; const iMax = group.ids.length; for (; i < iMax; i++) {
                    fixture = fixtures[fixtures.map(el => el.id).indexOf(group.ids[i])];
                    let fc = 0; const fcMax = fixture.parameters.length; for (; fc < fcMax; fc++) {
                        if (fixture.parameters[fc].name === group.parameters[c].name && fixture.parameters[fc].type === group.parameters[c].type) {
                            valAvg = valAvg + fixture.parameters[fc].value;
                            valAvgCount++;
                            if (fixture.parameters[fc].locked == true) {
                                shouldLock = true;
                            }
                        }
                    }
                }
                group.parameters[c].value = valAvg / valAvgCount;
                group.parameters[c].locked = shouldLock;
                shouldLock = false;
            }
            socket.emit('groupParameters', group);
        } else {
            socket.emit('message', { type: "error", content: "No groups exist!" });
        }

    });

    socket.on('changeGroupParameterValue', function (msg) {
        if (fixtures.length != 0 && groups.length != 0) {
            var group = groups[groups.map(el => el.id).indexOf(msg.id)];
            var parameter = group.parameters[group.parameters.map(el => el.id).indexOf(msg.pid)];
            parameter.value = parseInt(msg.value);
            parameter.displayValue = cppaddon.mapRange(parameter.value, parameter.min, parameter.max, 0, 100);
            setFixtureGroupValues(group, parameter);
            socket.broadcast.emit('groups', { groups: cleanGroups(), target: true });
            socket.emit('groups', { groups: cleanGroups(), target: false });
            io.emit('fixtures', { fixtures: cleanFixtures(), target: true });
        } else {
            socket.emit('message', { type: "error", content: "No fixtures and/or groups exist!" });
        }
    });

    socket.on('changeGroupParameterLock', function (msg) {
        if (fixtures.length != 0 && groups.length != 0) {
            if (groups.some(e => e.id === msg.id)) {
                var group = groups[groups.map(el => el.id).indexOf(msg.id)];
                var parameter = group.parameters[group.parameters.map(el => el.id).indexOf(msg.pid)];
                parameter.locked = !parameter.locked;
                setFixtureGroupValues(group, parameter);
                io.emit('groups', { groups: cleanGroups(), target: true });
                io.emit('fixtures', { fixtures: cleanFixtures(), target: true });
            }
        } else {
            socket.emit('message', { type: "error", content: "No fixtures and/or groups exist!" });
        }
    });

    socket.on('getGroupFixtures', function (groupID) {
        if (groups.length != 0) {
            socket.emit('groupFixtures', getGroupFixtures(groupID));
        } else {
            socket.emit('message', { type: "error", content: "No groups exist!" });
        }
    });

    socket.on('editGroupSettings', function (msg) {
        if (groups.length != 0) {
            var group = groups[groups.map(el => el.id).indexOf(msg.id)];
            group.name = msg.name;
            io.emit('groups', { groups: cleanGroups(), target: true });
            saveShow();
        } else {
            socket.emit('message', { type: "error", content: "No groups exist!" });
        }
    });

    socket.on('removeGroup', function (groupID) {
        if (groups.length != 0) {
            groups.splice(groups.map(el => el.id).indexOf(groupID), 1);
            socket.emit('message', { type: "info", content: "Group has been removed!" });
            io.emit('resetView', { type: 'groups', eid: groupID });
            io.emit('groups', { groups: cleanGroups(), target: true });
            saveShow();
        } else {
            socket.emit('message', { type: "error", content: "No groups exist!" });
        }
    });

    socket.on('resetGroup', function (groupID) {
        if (groups.length != 0) {
            var group = groups[groups.map(el => el.id).indexOf(groupID)];
            let c = 0; const cMax = group.parameters.length; for (; c < cMax; c++) {
                group.parameters[c].value = group.parameters[c].home;
                group.parameters[c].displayValue = cppaddon.mapRange(group.parameters[c].value, group.parameters[c].min, group.parameters[c].max, 0, 100);
                setFixtureGroupValues(group, group.parameters[c]);
            }
            io.emit('groups', { groups: cleanGroups(), target: true });
            io.emit('fixtures', { fixtures: cleanFixtures(), target: false });
            socket.emit('message', { type: "info", content: "Group parameters reset!" });
            saveShow();
        } else {
            socket.emit('message', { type: "error", content: "No groups exist!" });
        }
    });

    socket.on('removeGroupFixture', function (msg) {
        if (groups.length != 0) {
            var group = groups[groups.map(el => el.id).indexOf(msg.group)];
            if (group.ids.some(e => e === msg.fixture)) {
                group.ids.splice(group.ids.map(el => el).indexOf(msg.fixture), 1);
                group.parameters = generateGroupParameters(group);
                group.parameterTypes = [];
                let c = 0; const cMax = group.parameters.length; for (; c < cMax; c++) {
                    if (group.parameters[c].type == 2) {
                        group.parameterTypes.push("Shape");
                    } else if (group.parameters[c].type == 5) {
                        group.parameterTypes.push("Color");
                    } else if (group.parameters[c].type == 4) {
                        group.parameterTypes.push("Parameter");
                    } else if (group.parameters[c].type == 1) {
                        group.parameterTypes.push("Intensity");
                    }
                }
            }
            if (group.ids.length == 0) {
                groups.splice(groups.map(el => el.id).indexOf(group.id), 1);
                socket.emit('message', { type: "info", content: "Group has been removed!" });
                io.emit('resetView', { type: 'groups', eid: group.id });
            }
            io.emit('groups', { groups: cleanGroups(), target: true });
            socket.emit('message', { type: "info", content: "Fixture removed from group!" });
            saveShow();
        } else {
            socket.emit('message', { type: "error", content: "No groups exist!" });
        }
    });

    socket.on('resetGroups', function () {
        if (groups.length != 0) {
            resetGroups();
            io.emit('fixtures', { fixtures: cleanFixtures(), target: true });
            socket.emit('message', { type: "info", content: "Group values have been reset!" });
            saveShow();
        } else {
            socket.emit('message', { type: "error", content: "No groups exist!" });
        }
    });

    socket.on('recordPreset', function () {
        if (fixtures.length != 0) {
            var newPreset = {
                id: generateID(),
                name: "Preset " + (presets.length + 1),
                active: false,
                intensity: 0,
                displayAsDimmer: false,
                patchChanged: false,
                mode: SETTINGS.defaultPresetMode,
                parameters: JSON.parse(JSON.stringify(calculateChannelsList()))
            };
            presets.push(newPreset);
            io.emit('presets', cleanPresets());
            savePresets();
            socket.emit('message', { type: "info", content: "The preset has been recorded!" });
        } else {
            socket.emit('message', { type: "error", content: "No fixtures exist!" });
        }
    });

    socket.on('updatePreset', function (presetID) {
        if (presets.length != 0) {
            var preset = presets[presets.map(el => el.id).indexOf(presetID)];
            preset.parameters = JSON.parse(JSON.stringify(calculateChannelsList()));
            io.emit('presets', cleanPresets());
            socket.emit('message', { type: "info", content: "Preset parameters have been updated!" });
            savePresets();
        } else {
            socket.emit('message', { type: "error", content: "No presets exist!" });
        }
    });

    socket.on('getPresetSettings', function (presetID) {
        if (presets.length != 0) {
            socket.emit('presetSettings', presets[presets.map(el => el.id).indexOf(presetID)]);
        } else {
            socket.emit('message', { type: "error", content: "No presets exist!" });
        }
    });

    socket.on('editPresetSettings', function (msg) {
        if (presets.length != 0) {
            var preset = presets[presets.map(el => el.id).indexOf(msg.id)];
            preset.name = msg.name;
            preset.displayAsDimmer = msg.displayAsDimmer;
            preset.mode = msg.mode;
            var intensity = parseInt(msg.intensity);
            if (intensity > 0) {
                preset.active = true;
            } else {
                preset.active = false;
            }
            preset.intensity = intensity;
            io.emit('presets', cleanPresets());
            savePresets();
        } else {
            socket.emit('message', { type: "error", content: "No presets exist!" });
        }
    });

    socket.on('removePreset', function (presetID) {
        if (presets.length != 0) {
            presets.splice(presets.map(el => el.id).indexOf(presetID), 1);
            socket.emit('message', { type: "info", content: "Preset has been removed!" });
            io.emit('resetView', { type: 'presets', eid: presetID });
            io.emit('presets', cleanPresets());
            savePresets();
        } else {
            socket.emit('message', { type: "error", content: "No presets exist!" });
        }
    });

    socket.on('changePresetActive', function (presetID) {
        if (presets.length != 0) {
            var preset = presets[presets.map(el => el.id).indexOf(presetID)];
            preset.active = !preset.active;
            if (preset.active == true) {
                preset.intensity = 100;
            } else {
                preset.intensity = 0;
            }
            socket.emit('presetSettings', preset);
            io.emit('presets', cleanPresets());
        } else {
            socket.emit('message', { type: "error", content: "No presets exist!" });
        }
    });

    socket.on('changePresetIntensity', function (msg) {
        if (presets.length != 0) {
            var preset = presets[presets.map(el => el.id).indexOf(msg.presetID)];
            preset.intensity = parseInt(msg.intensity);
            if (preset.intensity == 0) {
                preset.active = false;
            } else {
                preset.active = true;
            }
            socket.broadcast.emit('presets', cleanPresets());
        } else {
            socket.emit('message', { type: "error", content: "No presets exist!" });
        }
    });

    socket.on('toggleBlackout', function () {
        blackout = !blackout;
        io.emit('blackout', blackout);
    });

    socket.on('changeGrandmasterValue', function (value) {
        grandmaster = parseInt(value);
        socket.broadcast.emit('grandmaster', grandmaster);
    });

    socket.on('saveSettings', function (msg) {
        SETTINGS.defaultUpTime = parseInt(msg.defaultUpTime);
        SETTINGS.defaultDownTime = parseInt(msg.defaultDownTime);
        SETTINGS.defaultPresetMode = msg.defaultPresetMode;
        SETTINGS.udmx = msg.udmx;
        SETTINGS.automark = msg.automark;
        SETTINGS.displayEffectsRealtime = msg.displayEffectsRealtime;
        if (msg.artnetIP != "") {
            SETTINGS.artnetIP = msg.artnetIP;
        } else {
            SETTINGS.artnetIP = null;
        }
        if (msg.artnetHost != "") {
            SETTINGS.artnetHost = msg.artnetHost;
        } else {
            SETTINGS.artnetIP = "255.255.255.255";
        }
        if (msg.sacnIP != "") {
            SETTINGS.sacnIP = msg.sacnIP;
        } else {
            SETTINGS.sacnIP = null;
        }
        if (saveSettings() == false) {
            socket.emit('message', { type: "error", content: "The Tonalite settings file could not be saved on disk." });
        } else {
            QRCode.toDataURL(`http://${SETTINGS.url}:${SETTINGS.port}`, function (err, url) {
                socket.emit('meta', { settings: SETTINGS, desktop: SETTINGS.desktop, version: VERSION, qrcode: url, url: `http://${SETTINGS.url}:${SETTINGS.port}` });
            });
        }
    });

    socket.on('updateFirmware', function () {
        updateFirmware(function (result) {
            if (result) {
                socket.emit('message', { type: "info", content: "The Tonalite firmware has been updated. Please reboot the server." });
            } else {
                socket.emit('message', { type: "info", content: "The Tonalite firmware could not be updated. Is a USB connected?" });
            }
        });
    });

    socket.on('importFixturesFromUSB', function () {
        importFixtures(function (result) {
            if (result) {
                socket.emit('message', { type: "info", content: "The fixture profiles have been imported from USB!" });
            } else {
                socket.emit('message', { type: "error", content: "The fixture profiles could not be imported! Is a USB connected?" });
            }
        });
    });

    socket.on('saveShowToUSB', function (showName) {
        saveShowToUSB(showName, function (result) {
            if (!result) {
                socket.emit('message', { type: "error", content: "The show could not be saved! Is a USB connected?" });
            }
        });
    });
});
