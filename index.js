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
const rgbHex = require('rgb-hex');

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
    blackoutEnabled: true,
    interfaceMode: 'normal',
    artnetIP: null, // ArtNet output IP
    artnetHost: '255.255.255.255', // Artnet network host
    sacnIP: null, // sACN output IP
    sacnPriority: 100 // sACN device priority
}

var STARTED = false;

const FPS = 40;

const VERSION = "2.0.0 Beta 8";

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
var colorPalettes = JSON.parse(JSON.stringify(require(process.cwd() + "/colorPalettes.json")));;
var positionPalettes = [];
var currentCue = "";
var cueProgress = 0;
var lastCue = "";
var currentCueID = "";
var blackout = false;
var grandmaster = 100;
var currentShowName = "Show";
var undo = {};
var redo = {};

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
            packet.setPriority(SETTINGS.sacnPriority);
            slotsData = packet.getSlotsData();
            channels = new Array(1024).fill(0);
            cp = cp;

            artnet = require('artnet')({ iface: SETTINGS.artnetIP, host: SETTINGS.artnetHost, sendAll: true });

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

            // Output DMX frames FPS times a second
            setInterval(dmxLoop, (1000 / FPS));
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

function saveUndoRedo(r) {
    if (r == false) {
        undo = JSON.parse(JSON.stringify({ fixtures: fixtures, cues: cues, groups: groups, sequences: sequences, colorPalettes: colorPalettes, positionPalettes: positionPalettes, presets: presets }));
    } else {
        redo = JSON.parse(JSON.stringify({ fixtures: fixtures, cues: cues, groups: groups, sequences: sequences, colorPalettes: colorPalettes, positionPalettes: positionPalettes, presets: presets }));
    }
}

function isEmpty(obj) {
    for (var key in obj) {
        if (obj.hasOwnProperty(key))
            return false;
    }
    return true;
}

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
            fs.readdir(drive.mountpoints[0].path + "/fixtures", (err, files) => {
                files.forEach(file => {
                    fs.copyFile(drive.mountpoints[0].path + "/fixtures/" + file, process.cwd() + "/fixtures/" + file, (err) => {
                        if (err) {
                            logError(err)
                        } else {
                            importComplete = true;
                        };
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
                filepath = drive.mountpoints[0].path + "/" + showName + "_" + moment().format('YYYY-MM-DDTHH-mm-ss') + ".tonalite";
                fs.exists(filepath, function (exists) {
                    if (exists) {
                        io.emit('message', { type: "error", content: "A show file with that name already exists!" });
                    } else {
                        fs.writeFile(filepath, JSON.stringify({ fixtures: fixtures, cues: cues, groups: groups, sequences: sequences, colorPalettes: colorPalettes, positionPalettes: positionPalettes, tonaliteVersion: VERSION, lastSaved: moment().format() }), (err) => {
                            if (err) {
                                logError(err);
                                done = false;
                                io.emit('message', { type: "error", content: "The current show could not be saved onto a USB drive. Is there one connected?" });
                            } else {
                                done = true;
                                io.emit('message', { type: "info", content: "The show '" + showName + "_" + moment().format('YYYY-MM-DDTHH-mm-ss') + ".tonalite' was successfully saved to the connected USB drive!" });
                            };
                        });
                    }
                });
            }
        }
    });
    return callback(done);
};

function logError(msg) {
    fs.writeFileSync('error-' + new Date() + '.error', msg, (err) => {
        if (err) {
            console.log("wierd: " + err);
            console.log("error: " + msg);
        }
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
    parameters.sort((a, b) => (a.coarse > b.coarse) ? 1 : -1);
    return parameters;
};

function cleanFixtures() {
    var newFixtures = JSON.parse(JSON.stringify(fixtures));
    var valMax = 0;
    let f = 0; const fMax = newFixtures.length; for (; f < fMax; f++) {
        delete newFixtures[f].effects;
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
            if (newFixtures[f].parameters[p].fadeWithIntensity == true || newFixtures[f].parameters[p].type == 1) {
                if (newFixtures[f].parameters[p].displayValue > valMax) {
                    valMax = newFixtures[f].parameters[p].displayValue;
                }
            }
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
        }
        newFixtures[f].intensityDisplay = valMax;
        valMax = 0;
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
        delete newFixture.parameters[p].max;
        delete newFixture.parameters[p].min;
    }
    return newFixture;
};

function cleanFixtureForPreset(fixture) {
    var newFixture = JSON.parse(JSON.stringify(fixture));
    delete newFixture.modelName;
    delete newFixture.shortName;
    delete newFixture.manufacturerName;
    delete newFixture.hasLockedParameters;
    delete newFixture.hasActiveEffects;
    delete newFixture.dcid;
    delete newFixture.colortable;
    delete newFixture.swapPanTilt;
    delete newFixture.hasIntensity;
    delete newFixture.maxOffset;
    delete newFixture.modeName;
    newFixture.effects = cleanEffectsForCue(newFixture.effects);
    let p = 0; const pMax = newFixture.parameters.length; for (; p < pMax; p++) {
        delete newFixture.parameters[p].displayValue;
        delete newFixture.parameters[p].home;
        delete newFixture.parameters[p].locked;
        delete newFixture.parameters[p].ranges;
        delete newFixture.parameters[p].highlight;
        delete newFixture.parameters[p].snap;
        delete newFixture.parameters[p].size;
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
    let s = 0; const sMax = sequences.length; for (; s < sMax; s++) {
        if (sequences[s].active == true) {
            let i = 0; const iMax = sequences[s].ids.length; for (; i < iMax; i++) {
                newFixtures.splice(newFixtures.map(el => el.id).indexOf(sequences[s].ids[i]), 1);
            }
        }
    }
    return newFixtures;
};

function cleanFixturesForSequence() {
    var newFixtures = [];
    let f = 0; const fMax = fixtures.length; for (; f < fMax; f++) {
        newFixtures.push(cleanFixtureForCue(fixtures[f]));
    }
    return newFixtures;
};

function cleanFixturesForPreset(ids) {
    var newFixtures = [];
    let f = 0; const fMax = fixtures.length; for (; f < fMax; f++) {
        if (ids.some(e => e === fixtures[f].id)) {
            newFixtures.push(cleanFixtureForPreset(fixtures[f]));
        }
    }
    return newFixtures;
};

function cleanGroupsForCue() {
    var newGroups = JSON.parse(JSON.stringify(groups));
    let g = 0; const gMax = newGroups.length; for (; g < gMax; g++) {
        delete newGroups[g].name;
        delete newGroups[g].parameters;
        delete newGroups[g].parameterTypes;
        delete newGroups[g].hasActiveEffects;
        delete newGroups[g].hasLockedParameters;
    }
    return newGroups;
};

function getFixtureIDs() {
    var ids = [];
    let f = 0; const fMax = fixtures.length; for (; f < fMax; f++) {
        ids.push(fixtures[f].id);
    }
    return ids;
};

function cleanSequencesForCue() {
    var newSequences = [];
    let s = 0; const sMax = sequences.length; for (; s < sMax; s++) {
        newSequences.push(cleanSequenceForCue(sequences[s]));
    }
    return newSequences;
};

function cleanGroups() {
    var newGroups = JSON.parse(JSON.stringify(groups));
    let g = 0; const gMax = newGroups.length; for (; g < gMax; g++) {
        delete newGroups[g].ids;
        delete newGroups[g].parameters;
        delete newGroups[g].parameterTypes;
        delete newGroups[g].effects;
    }
    return newGroups;
};

function cleanCues() {
    var newCues = JSON.parse(JSON.stringify(cues));
    let c = 0; const cMax = newCues.length; for (; c < cMax; c++) {
        delete newCues[c].upTime;
        delete newCues[c].downTime;
        delete newCues[c].downStep;
        delete newCues[c].upStep;
        delete newCues[c].following;
        delete newCues[c].follow;
        delete newCues[c].fixtures;
        delete newCues[c].sequences;
        delete newCues[c].groups;
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
        delete newPresets[p].fixtures;
        delete newPresets[p].mode;
        delete newPresets[p].ids;
    }
    return newPresets;
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

function getSequenceFixtures(sequenceID) {
    var sequence = sequences[sequences.map(el => el.id).indexOf(sequenceID)];
    var fixtureStarts = [];
    var fixture = null;
    let i = 0; const iMax = sequence.ids.length; for (; i < iMax; i++) {
        fixture = fixtures[fixtures.map(el => el.id).indexOf(sequence.ids[i])];
        fixtureStarts.push({ name: fixture.name, address: fixture.startDMXAddress, id: fixture.id });
    }
    return fixtureStarts;
};

function getPresetFixtures(presetID) {
    var preset = presets[presets.map(el => el.id).indexOf(presetID)];
    var fixtureStarts = [];
    var fixture = null;
    var changed = false;
    let i = 0; const iMax = preset.ids.length; for (; i < iMax; i++) {
        fixture = preset.fixtures[preset.fixtures.map(el => el.id).indexOf(preset.ids[i])];
        if (fixtures.some(e => e.id === fixture.id) == false) {
            changed = true;
        }
        fixtureStarts.push({ name: fixture.name, address: fixture.startDMXAddress, id: fixture.id, patchChanged: changed });
        changed = false;
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
                invert = false;
                if (fixtures[f].parameters[p].invert == true) {
                    invert = true;
                }
                if (blackout === false) {
                    if (invert == true) {
                        channels[((fixtures[f].startDMXAddress - 1) + fixtures[f].parameters[p].coarse) + (512 * fixtures[f].dmxUniverse)] = cppaddon.reverseNumber(((fixtures[f].parameters[p].value >> 8) / 100.0) * grandmaster, 0, 255);
                        if (fixtures[f].parameters[p].fine != null) {
                            channels[((fixtures[f].startDMXAddress - 1) + fixtures[f].parameters[p].fine) + (512 * fixtures[f].dmxUniverse)] = cppaddon.reverseNumber(((fixtures[f].parameters[p].value & 0xff) / 100.0) * grandmaster, 0, 255);
                        }
                    } else {
                        channels[((fixtures[f].startDMXAddress - 1) + fixtures[f].parameters[p].coarse) + (512 * fixtures[f].dmxUniverse)] = ((fixtures[f].parameters[p].value >> 8) / 100.0) * grandmaster;
                        if (fixtures[f].parameters[p].fine != null) {
                            channels[((fixtures[f].startDMXAddress - 1) + fixtures[f].parameters[p].fine) + (512 * fixtures[f].dmxUniverse)] = ((fixtures[f].parameters[p].value & 0xff) / 100.0) * grandmaster;
                        }
                    }
                } else {
                    if (invert == true) {
                        channels[((fixtures[f].startDMXAddress - 1) + fixtures[f].parameters[p].coarse) + (512 * fixtures[f].dmxUniverse)] = (fixtures[f].parameters[p].max >> 8);
                        if (fixtures[f].parameters[p].fine != null) {
                            channels[((fixtures[f].startDMXAddress - 1) + fixtures[f].parameters[p].fine) + (512 * fixtures[f].dmxUniverse)] = (fixtures[f].parameters[p].max & 0xff);
                        }
                    } else {
                        channels[((fixtures[f].startDMXAddress - 1) + fixtures[f].parameters[p].coarse) + (512 * fixtures[f].dmxUniverse)] = (fixtures[f].parameters[p].min >> 8);
                        if (fixtures[f].parameters[p].fine != null) {
                            channels[((fixtures[f].startDMXAddress - 1) + fixtures[f].parameters[p].fine) + (512 * fixtures[f].dmxUniverse)] = (fixtures[f].parameters[p].min & 0xff);
                        }
                    }
                }
            } else {
                invert = false;
                if (fixtures[f].parameters[p].type == 2 && (fixtures[f].invertPan == true || fixtures[f].invertTilt == true)) {
                    if (fixtures[f].parameters[p].name == "Pan" && fixtures[f].invertPan == true) {
                        if (fixtures[f].parameters[p].invert == false) {
                            invert = true;
                        }
                    } else if (fixtures[f].parameters[p].name == "Tilt" && fixtures[f].invertTilt == true) {
                        if (fixtures[f].parameters[p].invert == false) {
                            invert = true;
                        }
                    }
                } else {
                    if (fixtures[f].parameters[p].name == "Pan" && fixtures[f].invertPan == false) {
                        if (fixtures[f].parameters[p].invert == true) {
                            invert = true;
                        }
                    } else if (fixtures[f].parameters[p].name == "Tilt" && fixtures[f].invertTilt == false) {
                        if (fixtures[f].parameters[p].invert == true) {
                            invert = true;
                        }
                    } else {
                        if (fixtures[f].parameters[p].invert == true) {
                            invert = true;
                        }
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

function calculatePresetChannels(preset) {
    var invert = null;
    var tempvalue = null;
    var tempvalue2 = null;
    let f = 0; const fMax = preset.fixtures.length; for (; f < fMax; f++) {
        let p = 0; const pMax = preset.fixtures[f].parameters.length; for (; p < pMax; p++) {
            if (preset.fixtures[f].parameters[p].fadeWithIntensity == true || preset.fixtures[f].parameters[p].type == 1 || preset.fixtures[f].parameters[p].type == 5) {
                invert = false;
                if (preset.fixtures[f].parameters[p].invert == true) {
                    invert = true;
                }
                if (preset.mode == 'ltp') {
                    if (invert == true) {
                        channels[((preset.fixtures[f].startDMXAddress - 1) + preset.fixtures[f].parameters[p].coarse) + (512 * preset.fixtures[f].dmxUniverse)] = cppaddon.reverseNumber(((preset.fixtures[f].parameters[p].value >> 8) / 100.0) * preset.intensity, 0, 255);
                        if (preset.fixtures[f].parameters[p].fine != null) {
                            channels[((preset.fixtures[f].startDMXAddress - 1) + preset.fixtures[f].parameters[p].fine) + (512 * preset.fixtures[f].dmxUniverse)] = cppaddon.reverseNumber(((preset.fixtures[f].parameters[p].value & 0xff) / 100.0) * preset.intensity, 0, 255);
                        }
                    } else {
                        channels[((preset.fixtures[f].startDMXAddress - 1) + preset.fixtures[f].parameters[p].coarse) + (512 * preset.fixtures[f].dmxUniverse)] = ((preset.fixtures[f].parameters[p].value >> 8) / 100.0) * preset.intensity;
                        if (preset.fixtures[f].parameters[p].fine != null) {
                            channels[((preset.fixtures[f].startDMXAddress - 1) + preset.fixtures[f].parameters[p].fine) + (512 * preset.fixtures[f].dmxUniverse)] = ((preset.fixtures[f].parameters[p].value & 0xff) / 100.0) * preset.intensity;
                        }
                    }
                } else if (preset.mode == 'htp') {
                    if (invert == true) {
                        tempvalue = cppaddon.reverseNumber(((preset.fixtures[f].parameters[p].value >> 8) / 100.0) * preset.intensity, 0, 255);
                        tempvalue2 = cppaddon.reverseNumber(((preset.fixtures[f].parameters[p].value & 0xff) / 100.0) * preset.intensity, 0, 255);
                        // may cause issues with 16bit (doesn't check if 16 bit is bigger or not)
                        if (tempvalue < channels[((preset.fixtures[f].startDMXAddress - 1) + preset.fixtures[f].parameters[p].coarse) + (512 * preset.fixtures[f].dmxUniverse)]) {
                            channels[((preset.fixtures[f].startDMXAddress - 1) + preset.fixtures[f].parameters[p].coarse) + (512 * preset.fixtures[f].dmxUniverse)] = tempvalue;
                            if (preset.fixtures[f].parameters[p].fine != null) {
                                channels[((preset.fixtures[f].startDMXAddress - 1) + preset.fixtures[f].parameters[p].fine) + (512 * preset.fixtures[f].dmxUniverse)] = tempvalue2;
                            }
                        }
                    } else {
                        tempvalue = ((preset.fixtures[f].parameters[p].value >> 8) / 100.0) * preset.intensity;
                        tempvalue2 = ((preset.fixtures[f].parameters[p].value & 0xff) / 100.0) * preset.intensity;
                        // may cause issues with 16bit (doesn't check if 16 bit is bigger or not)
                        if (tempvalue > channels[((preset.fixtures[f].startDMXAddress - 1) + preset.fixtures[f].parameters[p].coarse) + (512 * preset.fixtures[f].dmxUniverse)]) {
                            channels[((preset.fixtures[f].startDMXAddress - 1) + preset.fixtures[f].parameters[p].coarse) + (512 * preset.fixtures[f].dmxUniverse)] = tempvalue;
                            if (preset.fixtures[f].parameters[p].fine != null) {
                                channels[((preset.fixtures[f].startDMXAddress - 1) + preset.fixtures[f].parameters[p].fine) + (512 * preset.fixtures[f].dmxUniverse)] = tempvalue2;
                            }
                        }
                    }
                }
            } else {
                invert = false;
                if (preset.fixtures[f].parameters[p].type == 2 && (preset.fixtures[f].invertPan == true || preset.fixtures[f].invertTilt == true)) {
                    if (preset.fixtures[f].parameters[p].name == "Pan" && preset.fixtures[f].invertPan == true) {
                        if (fixtures[f].parameters[p].invert == false) {
                            invert = true;
                        }
                    } else if (preset.fixtures[f].parameters[p].name == "Tilt" && preset.fixtures[f].invertTilt == true) {
                        if (fixtures[f].parameters[p].invert == false) {
                            invert = true;
                        }
                    }
                } else {
                    if (preset.fixtures[f].parameters[p].name == "Pan" && preset.fixtures[f].invertPan == false) {
                        if (preset.fixtures[f].parameters[p].invert == true) {
                            invert = true;
                        }
                    } else if (preset.fixtures[f].parameters[p].name == "Tilt" && preset.fixtures[f].invertTilt == false) {
                        if (preset.fixtures[f].parameters[p].invert == true) {
                            invert = true;
                        }
                    } else {
                        if (preset.fixtures[f].parameters[p].invert == true) {
                            invert = true;
                        }
                    }
                }
                if (invert == true) {
                    channels[((preset.fixtures[f].startDMXAddress - 1) + preset.fixtures[f].parameters[p].coarse) + (512 * preset.fixtures[f].dmxUniverse)] = (cppaddon.reverseNumber(preset.fixtures[f].parameters[p].value, 0, 65535) >> 8);
                    if (preset.fixtures[f].parameters[p].fine != null) {
                        channels[((preset.fixtures[f].startDMXAddress - 1) + preset.fixtures[f].parameters[p].fine) + (512 * preset.fixtures[f].dmxUniverse)] = (cppaddon.reverseNumber(preset.fixtures[f].parameters[p].value, 0, 65535) & 0xff);
                    }
                } else {
                    channels[((preset.fixtures[f].startDMXAddress - 1) + preset.fixtures[f].parameters[p].coarse) + (512 * preset.fixtures[f].dmxUniverse)] = (preset.fixtures[f].parameters[p].value >> 8);
                    if (preset.fixtures[f].parameters[p].fine != null) {
                        channels[((preset.fixtures[f].startDMXAddress - 1) + preset.fixtures[f].parameters[p].fine) + (512 * preset.fixtures[f].dmxUniverse)] = (preset.fixtures[f].parameters[p].value & 0xff);
                    }
                }
            }
        }
    }
};

// Set the cue's output channel values to the correct values from the fixtures. This is basically saving the cue.
function calculateCue(cue, includeIntensityColor, includePosition, includeBeam, ids) {
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
            if (startFixture.parameters[c].locked === false && ids.indexOf(startFixture.id) >= 0) {
                startParameter = startFixture.parameters[c].value;
                endParameter = cue.fixtures[f].parameters[c].value;
                // If the end parameter is greater than the start parameter, the value is going in, and is going out if less
                if (endParameter >= startParameter) {
                    // Make sure that the step does not dip below 0 (finished)
                    if (cue.upStep >= 0) {
                        if ((startFixture.parameters[c].fadeWithIntensity == true || startFixture.parameters[c].type == 1) && includeIntensityColor == true) {
                            invert = false;
                            if (startFixture.parameters[c].invert == true) {
                                invert = true;
                            }
                            if (blackout === false) {
                                if (invert == true) {
                                    outputChannels[((startFixture.startDMXAddress - 1) + startFixture.parameters[c].coarse) + (512 * startFixture.dmxUniverse)] = cppaddon.reverseNumber((((endParameter + (((startParameter - endParameter) / (cue.upTime * FPS)) * cue.upStep)) >> 8) / 100.0) * grandmaster, 0, 255);
                                    if (startFixture.parameters[c].fine != null) {
                                        outputChannels[((startFixture.startDMXAddress - 1) + startFixture.parameters[c].fine) + (512 * startFixture.dmxUniverse)] = cppaddon.reverseNumber((((endParameter + (((startParameter - endParameter) / (cue.upTime * FPS)) * cue.upStep)) & 0xff) / 100.0) * grandmaster, 0, 255);
                                    }
                                } else {
                                    outputChannels[((startFixture.startDMXAddress - 1) + startFixture.parameters[c].coarse) + (512 * startFixture.dmxUniverse)] = (((endParameter + (((startParameter - endParameter) / (cue.upTime * FPS)) * cue.upStep)) >> 8) / 100.0) * grandmaster;
                                    if (startFixture.parameters[c].fine != null) {
                                        outputChannels[((startFixture.startDMXAddress - 1) + startFixture.parameters[c].fine) + (512 * startFixture.dmxUniverse)] = (((endParameter + (((startParameter - endParameter) / (cue.upTime * FPS)) * cue.upStep)) & 0xff) / 100.0) * grandmaster;
                                    }
                                }
                            } else {
                                if (invert == true) {
                                    outputChannels[((startFixture.startDMXAddress - 1) + startFixture.parameters[c].coarse) + (512 * startFixture.dmxUniverse)] = (startFixture.parameters[c].max >> 8);
                                    if (startFixture.parameters[c].fine != null) {
                                        outputChannels[((startFixture.startDMXAddress - 1) + startFixture.parameters[c].fine) + (512 * startFixture.dmxUniverse)] = (startFixture.parameters[c].max & 0xff);
                                    }
                                } else {
                                    outputChannels[((startFixture.startDMXAddress - 1) + startFixture.parameters[c].coarse) + (512 * startFixture.dmxUniverse)] = (startFixture.parameters[c].min >> 8);
                                    if (startFixture.parameters[c].fine != null) {
                                        outputChannels[((startFixture.startDMXAddress - 1) + startFixture.parameters[c].fine) + (512 * startFixture.dmxUniverse)] = (startFixture.parameters[c].min & 0xff);
                                    }
                                }
                            }
                        } else if ((startFixture.parameters[c].type == 2 && includePosition == true) || (startFixture.parameters[c].type == 4 && includeBeam == true) || (startFixture.parameters[c].type == 5 && includeIntensityColor == true)) {
                            invert = false;
                            if (startFixture.parameters[c].type == 2 && (startFixture.invertPan == true || startFixture.invertTilt == true)) {
                                if (startFixture.parameters[c].name == "Pan" && startFixture.invertPan == true) {
                                    if (startFixture.parameters[c].invert == false) {
                                        invert = true;
                                    }
                                } else if (startFixture.parameters[c].name == "Tilt" && startFixture.invertTilt == true) {
                                    if (startFixture.parameters[c].invert == false) {
                                        invert = true;
                                    }
                                }
                            } else {
                                if (startFixture.parameters[c].name == "Pan" && startFixture.invertPan == false) {
                                    if (startFixture.parameters[c].invert == true) {
                                        invert = true;
                                    }
                                } else if (startFixture.parameters[c].name == "Tilt" && startFixture.invertTilt == false) {
                                    if (startFixture.parameters[c].invert == true) {
                                        invert = true;
                                    }
                                } else {
                                    if (startFixture.parameters[c].invert == true) {
                                        invert = true;
                                    }
                                }
                            }
                            if (invert == true) {
                                outputChannels[((startFixture.startDMXAddress - 1) + startFixture.parameters[c].coarse) + (512 * startFixture.dmxUniverse)] = (cppaddon.reverseNumber((endParameter + (((startParameter - endParameter) / (cue.upTime * FPS)) * cue.upStep)), 0, 65535) >> 8);
                                if (startFixture.parameters[c].fine != null) {
                                    outputChannels[((startFixture.startDMXAddress - 1) + startFixture.parameters[c].fine) + (512 * startFixture.dmxUniverse)] = (cppaddon.reverseNumber((endParameter + (((startParameter - endParameter) / (cue.upTime * FPS)) * cue.upStep)), 0, 65535) & 0xff);
                                }
                            } else {
                                outputChannels[((startFixture.startDMXAddress - 1) + startFixture.parameters[c].coarse) + (512 * startFixture.dmxUniverse)] = ((endParameter + (((startParameter - endParameter) / (cue.upTime * FPS)) * cue.upStep)) >> 8);
                                if (startFixture.parameters[c].fine != null) {
                                    outputChannels[((startFixture.startDMXAddress - 1) + startFixture.parameters[c].fine) + (512 * startFixture.dmxUniverse)] = ((endParameter + (((startParameter - endParameter) / (cue.upTime * FPS)) * cue.upStep)) & 0xff);
                                }
                            }
                        }
                        fixtures[fixtures.map(el => el.id).indexOf(cue.fixtures[f].id)].parameters[c].displayValue = cppaddon.mapRange(endParameter + (((startParameter - endParameter) / (cue.upTime * FPS)) * cue.upStep), startFixture.parameters[c].min, startFixture.parameters[c].max, 0, 100);
                    }
                } else {
                    // Make sure that the step does not dip below 0 (finished)
                    if (cue.downStep >= 0) {
                        if ((startFixture.parameters[c].fadeWithIntensity == true || startFixture.parameters[c].type == 1) && cue.includeIntensityColor == true) {
                            invert = false;
                            if (startFixture.parameters[c].invert == true) {
                                invert = true;
                            }
                            if (blackout === false) {
                                if (invert == true) {
                                    outputChannels[((startFixture.startDMXAddress - 1) + startFixture.parameters[c].coarse) + (512 * startFixture.dmxUniverse)] = cppaddon.reverseNumber((((endParameter + (((startParameter - endParameter) / (cue.downTime * FPS)) * cue.downStep)) >> 8) / 100.0) * grandmaster, 0, 255);
                                    if (startFixture.parameters[c].fine != null) {
                                        outputChannels[((startFixture.startDMXAddress - 1) + startFixture.parameters[c].fine) + (512 * startFixture.dmxUniverse)] = cppaddon.reverseNumber((((endParameter + (((startParameter - endParameter) / (cue.downTime * FPS)) * cue.downStep)) & 0xff) / 100.0) * grandmaster, 0, 255);
                                    }
                                } else {
                                    outputChannels[((startFixture.startDMXAddress - 1) + startFixture.parameters[c].coarse) + (512 * startFixture.dmxUniverse)] = (((endParameter + (((startParameter - endParameter) / (cue.downTime * FPS)) * cue.downStep)) >> 8) / 100.0) * grandmaster;
                                    if (startFixture.parameters[c].fine != null) {
                                        outputChannels[((startFixture.startDMXAddress - 1) + startFixture.parameters[c].fine) + (512 * startFixture.dmxUniverse)] = (((endParameter + (((startParameter - endParameter) / (cue.downTime * FPS)) * cue.downStep)) & 0xff) / 100.0) * grandmaster;
                                    }
                                }
                            } else {
                                if (invert == true) {
                                    outputChannels[((startFixture.startDMXAddress - 1) + startFixture.parameters[c].coarse) + (512 * startFixture.dmxUniverse)] = (startFixture.parameters[c].max >> 8);
                                    if (startFixture.parameters[c].fine != null) {
                                        outputChannels[((startFixture.startDMXAddress - 1) + startFixture.parameters[c].fine) + (512 * startFixture.dmxUniverse)] = (startFixture.parameters[c].max & 0xff);
                                    }
                                } else {
                                    outputChannels[((startFixture.startDMXAddress - 1) + startFixture.parameters[c].coarse) + (512 * startFixture.dmxUniverse)] = (startFixture.parameters[c].min >> 8);
                                    if (startFixture.parameters[c].fine != null) {
                                        outputChannels[((startFixture.startDMXAddress - 1) + startFixture.parameters[c].fine) + (512 * startFixture.dmxUniverse)] = (startFixture.parameters[c].min & 0xff);
                                    }
                                }
                            }
                        } else if ((startFixture.parameters[c].type == 2 && includePosition == true) || (startFixture.parameters[c].type == 4 && includeBeam == true) || (startFixture.parameters[c].type == 5 && includeIntensityColor == true)) {
                            invert = false;
                            if (startFixture.parameters[c].type == 2 && (startFixture.invertPan == true || startFixture.invertTilt == true)) {
                                if (startFixture.parameters[c].name == "Pan" && startFixture.invertPan == true) {
                                    if (startFixture.parameters[c].invert == false) {
                                        invert = true;
                                    }
                                } else if (startFixture.parameters[c].name == "Tilt" && startFixture.invertTilt == true) {
                                    if (startFixture.parameters[c].invert == false) {
                                        invert = true;
                                    }
                                }
                            } else {
                                if (startFixture.parameters[c].name == "Pan" && startFixture.invertPan == false) {
                                    if (startFixture.parameters[c].invert == true) {
                                        invert = true;
                                    }
                                } else if (startFixture.parameters[c].name == "Tilt" && startFixture.invertTilt == false) {
                                    if (startFixture.parameters[c].invert == true) {
                                        invert = true;
                                    }
                                } else {
                                    if (startFixture.parameters[c].invert == true) {
                                        invert = true;
                                    }
                                }
                            }
                            if (invert == true) {
                                outputChannels[((startFixture.startDMXAddress - 1) + startFixture.parameters[c].coarse) + (512 * startFixture.dmxUniverse)] = (cppaddon.reverseNumber((endParameter + (((startParameter - endParameter) / (cue.downTime * FPS)) * cue.downStep)), 0, 65535) >> 8);
                                if (startFixture.parameters[c].fine != null) {
                                    outputChannels[((startFixture.startDMXAddress - 1) + startFixture.parameters[c].fine) + (512 * startFixture.dmxUniverse)] = (cppaddon.reverseNumber((endParameter + (((startParameter - endParameter) / (cue.downTime * FPS)) * cue.downStep)), 0, 65535) & 0xff);
                                }
                            } else {
                                outputChannels[((startFixture.startDMXAddress - 1) + startFixture.parameters[c].coarse) + (512 * startFixture.dmxUniverse)] = ((endParameter + (((startParameter - endParameter) / (cue.downTime * FPS)) * cue.downStep)) >> 8);
                                if (startFixture.parameters[c].fine != null) {
                                    outputChannels[((startFixture.startDMXAddress - 1) + startFixture.parameters[c].fine) + (512 * startFixture.dmxUniverse)] = ((endParameter + (((startParameter - endParameter) / (cue.downTime * FPS)) * cue.downStep)) & 0xff);
                                }
                            }
                        }
                        fixtures[fixtures.map(el => el.id).indexOf(cue.fixtures[f].id)].parameters[c].displayValue = cppaddon.mapRange(endParameter + (((startParameter - endParameter) / (cue.downTime * FPS)) * cue.downStep), startFixture.parameters[c].min, startFixture.parameters[c].max, 0, 100);
                    }
                }
            } else {
                startParameter = startFixture.parameters[c].value;
                invert = false;
                if (startFixture.parameters[c].type == 2 && (startFixture.invertPan == true || startFixture.invertTilt == true)) {
                    if (startFixture.parameters[c].name == "Pan" && startFixture.invertPan == true) {
                        if (startFixture.parameters[c].invert == false) {
                            invert = true;
                        }
                    } else if (startFixture.parameters[c].name == "Tilt" && startFixture.invertTilt == true) {
                        if (startFixture.parameters[c].invert == false) {
                            invert = true;
                        }
                    }
                } else {
                    if (startFixture.parameters[c].name == "Pan" && startFixture.invertPan == false) {
                        if (startFixture.parameters[c].invert == true) {
                            invert = true;
                        }
                    } else if (startFixture.parameters[c].name == "Tilt" && startFixture.invertTilt == false) {
                        if (startFixture.parameters[c].invert == true) {
                            invert = true;
                        }
                    } else {
                        if (startFixture.parameters[c].invert == true) {
                            invert = true;
                        }
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
    return outputChannels;
};

function calculateStack() {
    // If there is a running cue
    var somethingRunning = false;
    var sequencesChanged = false;
    if (currentCue != "") {
        // Get the current cue
        cue = cues[cues.map(el => el.id).indexOf(currentCue)];
        channels = calculateCue(cue, cue.includeIntensityColor, cue.includePosition, cue.includeBeam, getFixtureIDs());
        let s = 0; const sMax = cue.sequences.length; for (; s < sMax; s++) {
            startSequence = sequences[sequences.map(el => el.id).indexOf(cue.sequences[s].id)];
            if (startSequence.active == false && cue.sequences[s].active == true) {
                startSequence.active = cue.sequences[s].active;
                if (startSequence.steps.length > 0) {
                    startSequence.currentStep = startSequence.steps[0].id;
                    startSequence.currentStepID = startSequence.steps[0].id;
                    startSequence.steps[0].active = true;
                    8
                }
                sequencesChanged = true;
            } else if (startSequence.active == true && cue.sequences[s].active == false) {
                startSequence.active = cue.sequences[s].active;
                startSequence.currentStep = "";
                startSequence.currentStepID = "";
                let st = 0; const stMax = startSequence.steps.length; for (; st < stMax; st++) {
                    startSequence.steps[st].active = false;
                }
                sequencesChanged = true;
            }
        }
        cue.upStep -= 1;
        cue.downStep -= 1;
        cueProgress += 1;
        // Check if the cue needs to be followed by another cue
        if (cue.upStep < 0 && cue.downStep < 0) {
            if (cue.follow != -1) {
                cue.active = false;
                if (cue.following === false) {
                    cue.upStep = cue.follow * FPS;
                    cue.downStep = cue.follow * FPS;
                    cue.following = true;
                } else {
                    cue.upStep = cue.upTime * FPS;
                    cue.downStep = cue.downTime * FPS;
                    cue.following = false;
                    if (cues.map(el => el.id).indexOf(currentCue) === cues.length - 1) {
                        cueProgress = 0;
                        currentCue = cues[0].id;
                    } else {
                        cueProgress = 0;
                        currentCue = cues[cues.map(el => el.id).indexOf(currentCue) + 1].id;
                    }
                    lastCue = currentCue;
                    cues[cues.map(el => el.id).indexOf(currentCue)].active = true;
                    currentCueID = currentCue;
                }
            } else {
                currentCue = "";
                cue.upStep = cue.upTime * FPS;
                cue.downStep = cue.downTime * FPS;
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
                        startFixtureParameters[c].displayValue = cppaddon.mapRange(cue.fixtures[f].parameters[c].value, startFixtureParameters[c].min, startFixtureParameters[c].max, 0, 100);
                    }
                }
            }
            if (SETTINGS.automark === true) {
                if (cues.map(el => el.id).indexOf(lastCue) + 1 === cues.length) {
                    var nextCue = cues[0];
                } else {
                    var nextCue = cues[cues.map(el => el.id).indexOf(lastCue) + 1];
                }
                var valNum = 0;
                var valNumAvg = 0;
                f = 0; const fMax1 = nextCue.fixtures.length; for (; f < fMax1; f++) {
                    startFixtureParameters = fixtures[fixtures.map(el => el.id).indexOf(nextCue.fixtures[f].id)].parameters;
                    nextCueFixtureParameters = nextCue.fixtures[f].parameters;
                    if (fixtures[fixtures.map(el => el.id).indexOf(nextCue.fixtures[f].id)].hasIntensity == true && startFixtureParameters.some(e => e.fadeWithIntensity === true) == false) {
                        if (startFixtureParameters[startFixtureParameters.map(el => el.type).indexOf(1)].value === 0) {
                            c = 0; const cMax1 = startFixtureParameters.length; for (; c < cMax1; c++) {
                                if (startFixtureParameters[c].locked === false && startFixtureParameters[c].type != 1 && startFixtureParameters[c].fadeWithIntensity == false) {
                                    startFixtureParameters[c].value = nextCueFixtureParameters[c].value;
                                    startFixtureParameters[c].displayValue = cppaddon.mapRange(nextCueFixtureParameters[c].value, startFixtureParameters[c].min, startFixtureParameters[c].max, 0, 100);
                                }
                            }
                        }
                    } else if (startFixtureParameters.some(e => e.fadeWithIntensity === true)) {
                        c = 0; const cMax1 = startFixtureParameters.length; for (; c < cMax1; c++) {
                            if (startFixtureParameters[c].fadeWithIntensity == true || startFixtureParameters[c].type == 1) {
                                valNumAvg += startFixtureParameters[c].value;
                                valNum += 1;
                            }
                        }
                        if (valNumAvg / valNum <= 0.0) {
                            c = 0; const cMax1 = startFixtureParameters.length; for (; c < cMax1; c++) {
                                if (startFixtureParameters[c].locked === false && startFixtureParameters[c].type != 1 && startFixtureParameters[c].fadeWithIntensity == false) {
                                    startFixtureParameters[c].value = nextCueFixtureParameters[c].value;
                                    startFixtureParameters[c].displayValue = cppaddon.mapRange(nextCueFixtureParameters[c].value, startFixtureParameters[c].min, startFixtureParameters[c].max, 0, 100);
                                }
                            }
                        }
                    }
                }
            }
            io.emit('activeCue', currentCueID);
            io.emit('cues', cleanCues());
        }
        somethingRunning = true;
        if (cue.upTime > cue.downTime) {
            io.emit('cueProgress', Math.round((cueProgress / ((cue.upTime * FPS) + 1)) * 10) / 10);
        } else {
            io.emit('cueProgress', Math.round((cueProgress / ((cue.downTime * FPS) + 1)) * 10) / 10);
        }
    }
    let s = 0; const sMax = sequences.length; for (; s < sMax; s++) {
        if (sequences[s].active == true) {
            sequence = sequences[sequences.map(el => el.id).indexOf(sequences[s].id)];
            if (sequence.currentStep != "") {
                step = sequence.steps[sequence.steps.map(el => el.id).indexOf(sequence.currentStep)];
                channels = calculateCue(step, sequence.includeIntensityColor, sequence.includePosition, sequence.includeBeam, sequence.ids);
                step.upStep -= 1;
                step.downStep -= 1;
                // Check if the sequence step needs to be followed by another step
                if (step.upStep < 0 && step.downStep < 0) {
                    step.active = false;
                    if (step.following === false) {
                        step.upStep = step.follow * FPS;
                        step.downStep = step.follow * FPS;
                        step.following = true;
                    } else {
                        step.upStep = step.upTime * FPS;
                        step.downStep = step.downTime * FPS;
                        step.following = false;
                        if (sequence.steps.map(el => el.id).indexOf(sequence.currentStep) === sequence.steps.length - 1) {
                            sequence.currentStep = sequence.steps[0].id;
                        } else {
                            sequence.currentStep = sequence.steps[sequence.steps.map(el => el.id).indexOf(sequence.currentStep) + 1].id;
                        }
                        sequence.lastStep = sequence.currentStep;
                        sequence.steps[sequence.steps.map(el => el.id).indexOf(sequence.currentStep)].active = true;
                        sequence.currentStepID = sequence.currentStep;
                    }
                    sequencesChanged = true;
                    var startFixtureParameters = null;
                    // Set the fixture's display and real values to the correct values from the cue
                    let f = 0; const fMax = step.fixtures.length; for (; f < fMax; f++) {
                        if (sequence.ids.indexOf(step.fixtures[f].id) >= 0) {
                            startFixtureParameters = fixtures[fixtures.map(el => el.id).indexOf(step.fixtures[f].id)].parameters;
                            let c = 0; const cMax = step.fixtures[f].parameters.length; for (; c < cMax; c++) {
                                if (startFixtureParameters[c].locked === false) {
                                    startFixtureParameters[c].value = step.fixtures[f].parameters[c].value;
                                    startFixtureParameters[c].displayValue = cppaddon.mapRange(step.fixtures[f].parameters[c].value, startFixtureParameters[c].min, startFixtureParameters[c].max, 0, 100);
                                }
                            }
                        }
                    }
                    if (SETTINGS.automark === true) {
                        if (sequence.steps.map(el => el.id).indexOf(sequence.lastCue) + 1 === sequence.steps.length) {
                            var nextCue = sequence.steps[0];
                        } else {
                            var nextCue = sequence.steps[sequence.steps.map(el => el.id).indexOf(sequence.lastCue) + 1];
                        }
                        var valNum = 0;
                        var valNumAvg = 0;
                        f = 0; const fMax1 = nextCue.fixtures.length; for (; f < fMax1; f++) {
                            if (sequence.ids.indexOf(nextCue.fixtures[f].id) >= 0) {
                                startFixtureParameters = fixtures[fixtures.map(el => el.id).indexOf(nextCue.fixtures[f].id)].parameters;
                                nextCueFixtureParameters = nextCue.fixtures[f].parameters;
                                if (fixtures[fixtures.map(el => el.id).indexOf(nextCue.fixtures[f].id)].hasIntensity == true) {
                                    if (startFixtureParameters[startFixtureParameters.map(el => el.type).indexOf(1)].value === 0) {
                                        c = 0; const cMax1 = nextCueFixtureParameters.length; for (; c < cMax1; c++) {
                                            if (startFixtureParameters[c].locked === false && startFixtureParameters[c].type != 1 && startFixtureParameters[c].fadeWithIntensity == false) {
                                                startFixtureParameters[c].value = nextCueFixtureParameters[c].value;
                                                startFixtureParameters[c].displayValue = cppaddon.mapRange(nextCueFixtureParameters[c].value, startFixtureParameters[c].min, startFixtureParameters[c].max, 0, 100);
                                            }
                                        }
                                    }
                                } else if (startFixtureParameters.some(e => e.fadeWithIntensity === true) == true) {
                                    c = 0; const cMax1 = startFixtureParameters.length; for (; c < cMax1; c++) {
                                        if (startFixtureParameters[c].fadeWithIntensity == true || startFixtureParameters[c].type == 1) {
                                            valNumAvg += startFixtureParameters[c].value;
                                            valNum += 1;
                                        }
                                    }
                                    if (valNumAvg / valNum <= 0.0) {
                                        c = 0; const cMax1 = startFixtureParameters.length; for (; c < cMax1; c++) {
                                            if (startFixtureParameters[c].locked === false && startFixtureParameters[c].type != 1 && startFixtureParameters[c].fadeWithIntensity == false) {
                                                startFixtureParameters[c].value = nextCueFixtureParameters[c].value;
                                                startFixtureParameters[c].displayValue = cppaddon.mapRange(nextCueFixtureParameters[c].value, startFixtureParameters[c].min, startFixtureParameters[c].max, 0, 100);
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
                somethingRunning = true;
            }
        }
    }
    if (blackout === false) {
        var effectChanIndex = null;
        var effectValue = null;
        var invert = null;
        var paramWorked = false;
        var red = null;
        var green = null;
        var blue = null;
        var white = null;
        var amber = null;
        let f = 0; const fMax = fixtures.length; for (; f < fMax; f++) {
            let e = 0; const eMax = fixtures[f].effects.length; for (; e < eMax; e++) {
                if (fixtures[f].effects[e].active == true) {
                    let p = 0; const pMax = fixtures[f].parameters.length; for (; p < pMax; p++) {
                        if (fixtures[f].parameters[p].locked === false) {
                            effectChanIndex = fixtures[f].effects[e].parameterNames.findIndex(function (element) { return element == fixtures[f].parameters[p].name });
                            paramWorked = false;
                            if (effectChanIndex > -1 && (fixtures[f].effects[e].type != "Color" || (fixtures[f].effects[e].type == "Color" && fixtures[f].colortable == "3874B444-A11E-47D9-8295-04556EAEBEA7"))) {
                                paramWorked = true;
                                effectValue = fixtures[f].effects[e].steps[fixtures[f].effects[e].step][effectChanIndex];
                            } else if (fixtures[f].effects[e].type == "Color" && (fixtures[f].colortable == "77A82F8A-9B24-4C3F-98FC-B6A29FB1AAE6" || fixtures[f].colortable == "77597794-7BFF-46A3-878B-906D3780E6C9")) {
                                // RGBW
                                paramWorked = true;
                                red = fixtures[f].effects[e].steps[fixtures[f].effects[e].step][0];
                                green = fixtures[f].effects[e].steps[fixtures[f].effects[e].step][1];
                                blue = fixtures[f].effects[e].steps[fixtures[f].effects[e].step][2];
                                white = Math.min(red, green, blue);
                                if (fixtures[f].parameters[p].name === "Red") {
                                    effectValue = red - white;
                                } else if (fixtures[f].parameters[p].name === "Green") {
                                    effectValue = green - white;
                                } else if (fixtures[f].parameters[p].name === "Blue") {
                                    effectValue = blue - white;
                                } else if (fixtures[f].parameters[p].name === "White") {
                                    effectValue = white;
                                } else {
                                    effectValue = cppaddon.mapRange(fixtures[f].parameters[p].value, fixtures[f].parameters[p].min, fixtures[f].parameters[p].max, 0, 255);
                                }
                            } else if (fixtures[f].effects[e].type == "Color" && fixtures[f].colortable == "D3E71EC8-3406-4572-A64C-52A38649C795") {
                                // RGBA
                                paramWorked = true;
                                red = fixtures[f].effects[e].steps[fixtures[f].effects[e].step][0];
                                green = fixtures[f].effects[e].steps[fixtures[f].effects[e].step][1];
                                blue = fixtures[f].effects[e].steps[fixtures[f].effects[e].step][2];
                                amber = cppaddon.getAFromRGB(red, green, blue);
                                if (fixtures[f].parameters[p].name === "Red") {
                                    effectValue = red - amber;
                                } else if (fixtures[f].parameters[p].name === "Green") {
                                    effectValue = green - amber / 2;
                                } else if (fixtures[f].parameters[p].name === "Blue") {
                                    effectValue = blue;
                                } else if (fixtures[f].parameters[p].name === "Amber") {
                                    effectValue = amber;
                                } else {
                                    effectValue = cppaddon.mapRange(fixtures[f].parameters[p].value, fixtures[f].parameters[p].min, fixtures[f].parameters[p].max, 0, 255);
                                }
                            } else if (fixtures[f].effects[e].type == "Color" && fixtures[f].colortable == "C7A1FB0A-AA23-468F-9060-AC1625155DE8") {
                                // RGBAW
                                paramWorked = true;
                                red = fixtures[f].effects[e].steps[fixtures[f].effects[e].step][0];
                                green = fixtures[f].effects[e].steps[fixtures[f].effects[e].step][1];
                                blue = fixtures[f].effects[e].steps[fixtures[f].effects[e].step][2];
                                white = Math.min(red, green, blue);
                                amber = cppaddon.getAFromRGB(red, green, blue);
                                if (fixtures[f].parameters[p].name === "Red") {
                                    effectValue = red - white - amber;
                                } else if (fixtures[f].parameters[p].name === "Green") {
                                    effectValue = green - white - amber / 2;
                                } else if (fixtures[f].parameters[p].name === "Blue") {
                                    effectValue = blue - white;
                                } else if (fixtures[f].parameters[p].name === "Amber") {
                                    effectValue = amber;
                                } else if (fixtures[f].parameters[p].name === "White") {
                                    effectValue = white;
                                } else {
                                    effectValue = cppaddon.mapRange(fixtures[f].parameters[p].value, fixtures[f].parameters[p].min, fixtures[f].parameters[p].max, 0, 255);
                                }
                            } else if (fixtures[f].effects[e].type == "Color" && fixtures[f].colortable == "EF4970BA-2536-4725-9B0F-B2D7A021E139") {
                                // CMY
                                paramWorked = true;
                                red = fixtures[f].effects[e].steps[fixtures[f].effects[e].step][0];
                                green = fixtures[f].effects[e].steps[fixtures[f].effects[e].step][1];
                                blue = fixtures[f].effects[e].steps[fixtures[f].effects[e].step][2];
                                if (fixtures[f].parameters[p].name === "Cyan") {
                                    effectValue = 255 - red;
                                } else if (fixtures[f].parameters[p].name === "Magenta") {
                                    effectValue = 255 - green;
                                } else if (fixtures[f].parameters[p].name === "Yellow") {
                                    effectValue = 255 - blue;
                                } else {
                                    effectValue = cppaddon.mapRange(fixtures[f].parameters[p].value, fixtures[f].parameters[p].min, fixtures[f].parameters[p].max, 0, 255);
                                }
                            }
                            if (paramWorked === true) {
                                if (fixtures[f].effects[e].resolution == 8) {
                                    effectValue = cppaddon.mapRange(effectValue, 0, 255, fixtures[f].parameters[p].min, fixtures[f].parameters[p].max);
                                } else {
                                    effectValue = effectValue + 32766;
                                }
                                effectValue = (effectValue * fixtures[f].effects[e].depth) + ((fixtures[f].parameters[p].value >> 8) * (1 - fixtures[f].effects[e].depth));
                                if (SETTINGS.displayEffectsRealtime === true) {
                                    fixtures[f].parameters[p].displayValue = cppaddon.mapRange(effectValue, fixtures[f].parameters[p].min, fixtures[f].parameters[p].max, 0, 100);
                                    if (SETTINGS.displayEffectsRealtime === true) {
                                        somethingRunning = true;
                                    }
                                }
                                if (fixtures[f].parameters[p].fadeWithIntensity == true || fixtures[f].parameters[p].type == 1) {
                                    effectValue = (effectValue / 100.0) * grandmaster;
                                }
                                invert = false;
                                if (fixtures[f].parameters[p].type == 2 && (fixtures[f].invertPan == true || fixtures[f].invertTilt == true)) {
                                    if (fixtures[f].parameters[p].name == "Pan" && fixtures[f].invertPan == true) {
                                        if (fixtures[f].parameters[p].invert == false) {
                                            invert = true;
                                        }
                                    } else if (fixtures[f].parameters[p].name == "Tilt" && fixtures[f].invertTilt == true) {
                                        if (fixtures[f].parameters[p].invert == false) {
                                            invert = true;
                                        }
                                    }
                                } else {
                                    if (fixtures[f].parameters[p].name == "Pan" && fixtures[f].invertPan == false) {
                                        if (fixtures[f].parameters[p].invert == true) {
                                            invert = true;
                                        }
                                    } else if (fixtures[f].parameters[p].name == "Tilt" && fixtures[f].invertTilt == false) {
                                        if (fixtures[f].parameters[p].invert == true) {
                                            invert = true;
                                        }
                                    } else {
                                        if (fixtures[f].parameters[p].invert == true) {
                                            invert = true;
                                        }
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
                }
                if (fixtures[f].effects[e].step + Math.floor(fixtures[f].effects[e].speed) >= fixtures[f].effects[e].steps.length - 1) {
                    fixtures[f].effects[e].step = 0;
                } else {
                    fixtures[f].effects[e].step = fixtures[f].effects[e].step + Math.floor(fixtures[f].effects[e].speed);
                }
            }
        }
    }
    if (somethingRunning === true) {
        io.emit('fixtures', { fixtures: cleanFixtures(), target: true });
    }
    if (sequencesChanged === true) {
        io.emit('sequences', { sequences: cleanSequences(), target: true });
    }
    let p = 0; const pMax = presets.length; for (; p < pMax; p++) {
        if (presets[p].active) {
            calculatePresetChannels(presets[p]);
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
function resetFixtures(removeEffects) {
    let f = 0; const fMax = fixtures.length; for (; f < fMax; f++) {
        if (removeEffects == true) {
            fixtures[f].effects = [];
        }
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

function resetFixturesIntensity() {
    let f = 0; const fMax = fixtures.length; for (; f < fMax; f++) {
        let c = 0; const cMax = fixtures[f].parameters.length; for (; c < cMax; c++) {
            if (fixtures[f].parameters[c].locked != true) {
                if (fixtures[f].parameters[c].type == 1 || fixtures[f].parameters[c].fadeWithIntensity == true) {
                    fixtures[f].parameters[c].value = fixtures[f].parameters[c].home;
                    fixtures[f].parameters[c].displayValue = cppaddon.mapRange(fixtures[f].parameters[c].value, fixtures[f].parameters[c].min, fixtures[f].parameters[c].max, 0, 100);
                }
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
            groups[g].hasActiveEffects = checkFixtureActiveEffects(groups[g].effects);
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
        currentShowName = show.showName;
        colorPalettes = show.colorPalettes;
        positionPalettes = show.positionPalettes;
        lastCue = "";
        currentCue = "";
        cueProgress = 0;
        currentCueID = "";
        var changed = false;
        let p = 0; const pMax = presets.length; for (; p < pMax; p++) {
            let i = 0; const iMax = presets[p].ids.length; for (; i < iMax; i++) {
                if (fixtures.some(e => e.id === presets[p].ids[i]) == false) {
                    changed = true;
                }
            }
            if (changed == false) {
                presets[p].patchChanged = false;
            } else {
                presets[p].patchChanged = true;
            }
            changed = false;
        }
        io.emit('fixtures', { fixtures: cleanFixtures(), target: true });
        io.emit('activeCue', currentCueID);
        io.emit('cues', cleanCues());
        io.emit('sequences', { sequences: cleanSequences(), target: true });
        io.emit('groups', { groups: cleanGroups(), target: true });
        io.emit('presets', cleanPresets());
        io.emit('cueActionBtn', false);
        io.emit('cueProgress', cueProgress);
        savePresets();
    });
};

// Save the fixtures, cues, and groups of the show to file
function saveShow() {
    fs.writeFile(process.cwd() + "/show.json", JSON.stringify({ fixtures: fixtures, cues: cues, groups: groups, sequences: sequences, colorPalettes: colorPalettes, positionPalettes: positionPalettes, tonaliteVersion: VERSION, lastSaved: moment().format(), showName: currentShowName }), (err) => {
        if (err) {
            logError(err);
            return false;
        };
    });
    return true;
};

// Load the presets from file
function openPresets() {
    fs.exists(process.cwd() + '/presets.json', function (exists) {
        if (exists == false) {
            savePresets();
        }
        fs.readFile(process.cwd() + '/presets.json', (err, data) => {
            if (err) logError(err);
            presets = JSON.parse(data);
            openShow();
        });
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
    res.download(process.cwd() + '/show.json', currentShowName + "_" + moment().format('YYYY-MM-DDTHH-mm-ss') + '.tonalite', { headers: { 'Content-Disposition': 'attachment', 'Content-Type': 'application/octet-stream' } });
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
            openPresets();
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
    openPresets();
});

io.on('connection', function (socket) {
    socket.emit('fixtures', { fixtures: cleanFixtures(), target: true });
    socket.emit('cues', cleanCues());
    socket.emit('sequences', { sequences: cleanSequences(), target: true });
    socket.emit('groups', { groups: cleanGroups(), target: true });
    socket.emit('presets', cleanPresets());
    socket.emit('blackout', blackout);
    socket.emit('grandmaster', grandmaster);
    socket.emit('activeCue', currentCueID);
    socket.emit('palettes', { colorPalettes: colorPalettes, positionPalettes: positionPalettes });
    if (currentCueID != "") {
        if (cues[cues.map(el => el.id).indexOf(currentCueID)].upTime > cues[cues.map(el => el.id).indexOf(currentCueID)].downTime) {
            socket.emit('cueProgress', Math.round((cueProgress / ((cues[cues.map(el => el.id).indexOf(currentCueID)].upTime * FPS) + 1)) * 10) / 10);
        } else {
            socket.emit('cueProgress', Math.round((cueProgress / ((cues[cues.map(el => el.id).indexOf(currentCueID)].downTime * FPS) + 1)) * 10) / 10);
        }
    } else {
        socket.emit('cueProgress', 0);
    };

    QRCode.toDataURL(`http://${SETTINGS.url}:${SETTINGS.port}`, function (err, url) {
        socket.emit('meta', { settings: SETTINGS, desktop: SETTINGS.desktop, version: VERSION, qrcode: url, url: `http://${SETTINGS.url}:${SETTINGS.port}` });
    });


    if (currentCue === "") {
        socket.emit('cueActionBtn', false);
    } else {
        socket.emit('cueActionBtn', true);
    }

    socket.on('undo', function () {
        if (isEmpty(undo) === false) {
            saveUndoRedo(true);
            fixtures = undo.fixtures;
            cues = undo.cues;
            groups = undo.groups;
            sequences = undo.sequences;
            colorPalettes = undo.colorPalettes;
            positionPalettes = undo.positionPalettes;
            presets = undo.presets;
            io.emit('fixtures', { fixtures: cleanFixtures(), target: true });
            io.emit('cues', cleanCues());
            io.emit('sequences', { sequences: cleanSequences(), target: true });
            io.emit('groups', { groups: cleanGroups(), target: true });
            io.emit('presets', cleanPresets());
            io.emit('palettes', { colorPalettes: colorPalettes, positionPalettes: positionPalettes });
            saveShow();
        }
    });

    socket.on('redo', function () {
        if (isEmpty(redo) === false) {
            saveUndoRedo(false);
            fixtures = redo.fixtures;
            cues = redo.cues;
            groups = redo.groups;
            sequences = redo.sequences;
            colorPalettes = redo.colorPalettes;
            positionPalettes = redo.positionPalettes;
            presets = undo.presets;
            io.emit('fixtures', { fixtures: cleanFixtures(), target: true });
            io.emit('cues', cleanCues());
            io.emit('sequences', { sequences: cleanSequences(), target: true });
            io.emit('groups', { groups: cleanGroups(), target: true });
            io.emit('presets', cleanPresets());
            io.emit('palettes', { colorPalettes: colorPalettes, positionPalettes: positionPalettes });
            saveShow();
        }
    });

    socket.on('openShowFromUSB', function (data) {
        saveUndoRedo(false);
        fs.copyFile(data.path + '/' + data.file, process.cwd() + '/show.json', function (err) {
            if (err) {
                logError(err);
                socket.emit('message', { type: "error", content: "The show could not be opened!" });
            } else {
                openPresets();
                io.emit('message', { type: "info", content: "The show has been opened!" });
            }
        });
    });

    socket.on('resetShow', function () {
        saveUndoRedo(false);
        resetFixtures(true);
        cues = [];
        groups = [];
        sequences = [];
        colorPalettes = JSON.parse(JSON.stringify(require(process.cwd() + "/colorPalettes.json")));
        positionPalettes = [];
        currentCue = "";
        currentCueID = "";
        lastCue = "";
        cueProgress = 0;
        currentShowName = "Show";
        io.emit('fixtures', { fixtures: cleanFixtures(), target: true });
        io.emit('activeCue', currentCueID);
        io.emit('cues', cleanCues());
        io.emit('groups', { groups: cleanGroups(), target: true });
        io.emit('cueActionBtn', false);
        io.emit('sequences', { sequences: cleanSequences(), target: true });
        io.emit('resetView', { type: 'show', eid: "" });
        io.emit('palettes', { colorPalettes: colorPalettes, positionPalettes: positionPalettes });
        io.emit('cueProgress', cueProgress);
        io.emit('message', { type: "info", content: "A new show has been created!" });
        saveShow();
    });

    socket.on('resetShowAndPatch', function () {
        saveUndoRedo(false);
        fixtures = [];
        cues = [];
        groups = [];
        sequences = [];
        colorPalettes = JSON.parse(JSON.stringify(require(process.cwd() + "/colorPalettes.json")));
        positionPalettes = [];
        currentCue = "";
        cueProgress = 0;
        currentCueID = "";
        lastCue = "";
        currentShowName = "Show";
        let p = 0; const pMax = presets.length; for (; p < pMax; p++) {
            presets[p].patchChanged = true;
        }
        io.emit('fixtures', { fixtures: cleanFixtures(), target: true });
        io.emit('activeCue', currentCueID);
        io.emit('cues', cleanCues());
        io.emit('presets', cleanPresets());
        io.emit('sequences', { sequences: cleanSequences(), target: true });
        io.emit('groups', { groups: cleanGroups(), target: true });
        io.emit('cueActionBtn', false);
        io.emit('palettes', { colorPalettes: colorPalettes, positionPalettes: positionPalettes });
        io.emit('resetView', { type: 'show', eid: "" });
        io.emit('cueProgress', cueProgress);
        io.emit('message', { type: "info", content: "A new show has been created!" });
        saveShow();
        savePresets();
    });

    socket.on('resetPresets', function () {
        saveUndoRedo(false);
        presets = [];
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
            var fixturesList = {};
            var fixture = null;
            var push = false;
            files.forEach(file => {
                fixture = require(process.cwd() + "/fixtures/" + file);
                fixture.personalities.forEach(function (personality) {
                    push = false;
                    if (SETTINGS.interfaceMode == 'dimmer') {
                        if (personality.modelName.indexOf("Dimmer") >= 0) {
                            push = true;
                        }
                    } else {
                        push = true;
                    }
                    if (push == true) {
                        if (personality.manufacturerName in fixturesList == false) {
                            fixturesList[personality.manufacturerName] = {};
                        }
                        if (personality.modelName in fixturesList[personality.manufacturerName] == false) {
                            fixturesList[personality.manufacturerName][personality.modelName] = [];
                        }
                        fixturesList[personality.manufacturerName][personality.modelName].push({ modeName: personality.modeName, file: file, dcid: personality.dcid });
                    }
                });
            });
            socket.emit('fixtureProfiles', [fixturesList, startDMXAddress]);
        });
    });

    socket.on('useFixtureColorPalette', function (msg) {
        if (fixtures.length != 0) {
            if (fixtures.some(e => e.id === msg.id)) {
                saveUndoRedo(false);
                var fixture = fixtures[fixtures.map(el => el.id).indexOf(msg.id)];
                var palette = colorPalettes[msg.pid];
                var param = null;
                if (fixture.colortable == "3874B444-A11E-47D9-8295-04556EAEBEA7") {
                    // RGB
                    let c = 0; const cMax = palette.parameters.length; for (; c < cMax; c++) {
                        param = fixture.parameters[fixture.parameters.map(el => el.name).indexOf(palette.parameters[c].name)];
                        param.value = cppaddon.mapRange(palette.parameters[c].value, 0, 255, param.min, param.max);
                        param.displayValue = cppaddon.mapRange(param.value, param.min, param.max, 0, 100);
                    }
                } else if (fixture.colortable == "77A82F8A-9B24-4C3F-98FC-B6A29FB1AAE6" || fixture.colortable == "77597794-7BFF-46A3-878B-906D3780E6C9") {
                    // RGBW
                    w = Math.min(palette.parameters[0].value, palette.parameters[1].value, palette.parameters[2].value);
                    let c = 0; const cMax = palette.parameters.length; for (; c < cMax; c++) {
                        param = fixture.parameters[fixture.parameters.map(el => el.name).indexOf(palette.parameters[c].name)];
                        param.value = cppaddon.mapRange(palette.parameters[c].value - w, 0, 255, param.min, param.max);
                        param.displayValue = cppaddon.mapRange(param.value, param.min, param.max, 0, 100);
                    }
                    param = fixture.parameters[fixture.parameters.map(el => el.name).indexOf("White")];
                    param.value = cppaddon.mapRange(w, 0, 255, param.min, param.max);
                    param.displayValue = cppaddon.mapRange(param.value, param.min, param.max, 0, 100);
                } else if (fixture.colortable == "D3E71EC8-3406-4572-A64C-52A38649C795") {
                    // RGBA
                    a = cppaddon.getAFromRGB(palette.parameters[0].value, palette.parameters[1].value, palette.parameters[2].value);
                    let c = 0; const cMax = palette.parameters.length; for (; c < cMax; c++) {
                        param = fixture.parameters[fixture.parameters.map(el => el.name).indexOf(palette.parameters[c].name)];
                        if (param.name == "Red") {
                            param.value = cppaddon.mapRange(palette.parameters[c].value - a, 0, 255, param.min, param.max);
                        } else if (param.name == "Green") {
                            param.value = cppaddon.mapRange(palette.parameters[c].value - a / 2, 0, 255, param.min, param.max);
                        } else if (param.name == "Blue") {
                            param.value = cppaddon.mapRange(palette.parameters[c].value, 0, 255, param.min, param.max);
                        }
                        param.displayValue = cppaddon.mapRange(param.value, param.min, param.max, 0, 100);
                    }
                    param = fixture.parameters[fixture.parameters.map(el => el.name).indexOf("Amber")];
                    param.value = cppaddon.mapRange(a, 0, 255, param.min, param.max);
                    param.displayValue = cppaddon.mapRange(param.value, param.min, param.max, 0, 100);
                } else if (fixture.colortable == "C7A1FB0A-AA23-468F-9060-AC1625155DE8") {
                    // RGBAW
                    w = Math.min(palette.parameters[0].value, palette.parameters[1].value, palette.parameters[2].value);
                    a = cppaddon.getAFromRGB(palette.parameters[0].value, palette.parameters[1].value, palette.parameters[2].value);
                    let c = 0; const cMax = palette.parameters.length; for (; c < cMax; c++) {
                        param = fixture.parameters[fixture.parameters.map(el => el.name).indexOf(palette.parameters[c].name)];
                        if (param.name == "Red") {
                            param.value = cppaddon.mapRange(palette.parameters[c].value - w - a, 0, 255, param.min, param.max);
                        } else if (param.name == "Green") {
                            param.value = cppaddon.mapRange(palette.parameters[c].value - w - a / 2, 0, 255, param.min, param.max);
                        } else if (param.name == "Blue") {
                            param.value = cppaddon.mapRange(palette.parameters[c].value - w, 0, 255, param.min, param.max);
                        }
                        param.displayValue = cppaddon.mapRange(param.value, param.min, param.max, 0, 100);
                    }
                    param = fixture.parameters[fixture.parameters.map(el => el.name).indexOf("Amber")];
                    param.value = cppaddon.mapRange(a, 0, 255, param.min, param.max);
                    param.displayValue = cppaddon.mapRange(param.value, param.min, param.max, 0, 100);

                    param = fixture.parameters[fixture.parameters.map(el => el.name).indexOf("White")];
                    param.value = cppaddon.mapRange(w, 0, 255, param.min, param.max);
                    param.displayValue = cppaddon.mapRange(param.value, param.min, param.max, 0, 100);
                } else if (fixture.colortable == "EF4970BA-2536-4725-9B0F-B2D7A021E139") {
                    // CMY
                    let c = 0; const cMax = palette.parameters.length; for (; c < cMax; c++) {
                        if (palette.parameters[c].name == "Red") {
                            param = fixture.parameters[fixture.parameters.map(el => el.name).indexOf("Cyan")];
                        } else if (palette.parameters[c].name == "Green") {
                            param = fixture.parameters[fixture.parameters.map(el => el.name).indexOf("Magenta")];
                        } else if (palette.parameters[c].name == "Blue") {
                            param = fixture.parameters[fixture.parameters.map(el => el.name).indexOf("Yellow")];
                        }
                        param.value = cppaddon.mapRange(255 - palette.parameters[c].value, 0, 255, param.min, param.max);
                        param.displayValue = cppaddon.mapRange(param.value, param.min, param.max, 0, 100);
                    }
                } else {
                    // Just try insert RGB
                    let c = 0; const cMax = palette.parameters.length; for (; c < cMax; c++) {
                        param = fixture.parameters[fixture.parameters.map(el => el.name).indexOf(palette.parameters[c].name)];
                        if (param != null) {
                            param.value = cppaddon.mapRange(palette.parameters[c].value, 0, 255, param.min, param.max);
                            param.displayValue = cppaddon.mapRange(param.value, param.min, param.max, 0, 100);
                        }
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

    socket.on('useFixturePositionPalette', function (msg) {
        if (fixtures.length != 0) {
            if (fixtures.some(e => e.id === msg.id)) {
                saveUndoRedo(false);
                var fixture = fixtures[fixtures.map(el => el.id).indexOf(msg.id)];
                var palette = positionPalettes[msg.pid];
                var param = null;
                let c = 0; const cMax = palette.parameters.length; for (; c < cMax; c++) {
                    param = fixture.parameters[fixture.parameters.map(el => el.name).indexOf(palette.parameters[c].name)];
                    if (param != null) {
                        param.value = palette.parameters[c].value;
                        param.displayValue = cppaddon.mapRange(param.value, param.min, param.max, 0, 100);
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

    socket.on('useGroupPositionPalette', function (msg) {
        if (fixtures.length > 0) {
            if (groups.length > 0) {
                if (groups.some(e => e.id === msg.id)) {
                    saveUndoRedo(false);
                    var group = groups[groups.map(el => el.id).indexOf(msg.id)];
                    var palette = positionPalettes[msg.pid];
                    var param = null;
                    let c = 0; const cMax = palette.parameters.length; for (; c < cMax; c++) {
                        param = group.parameters[group.parameters.map(el => el.name).indexOf(palette.parameters[c].name)];
                        if (param != null) {
                            param.value = palette.parameters[c].value;
                            param.displayValue = cppaddon.mapRange(param.value, param.min, param.max, 0, 100);
                            setFixtureGroupValues(group, param);
                        }
                    }
                    io.emit('groups', { groups: cleanGroups(), target: true });
                    io.emit('fixtures', { fixtures: cleanFixtures(), target: true });
                } else {
                    socket.emit('message', { type: "error", content: "This group doesn't exist!" });
                }
            } else {
                socket.emit('message', { type: "error", content: "No groups exist!" });
            }
        } else {
            socket.emit('message', { type: "error", content: "No fixtures exist!" });
        }
    });

    function blendColors(baseColor, inR, inG, inB, blend) {
        var base = baseColor;
        var mr = inR * blend + base[0] * (1 - blend);
        var mg = inG * blend + base[1] * (1 - blend);
        var mb = inB * blend + base[2] * (1 - blend);
        base[0] = mr * 255.0;
        base[1] = mg * 255.0;
        base[2] = mb * 255.0;
        return base;
    }
    socket.on('addColorPalette', function (msg) {
        saveUndoRedo(false);
        if (msg.type == 'fixture') {
            var fixture = fixtures[fixtures.map(el => el.id).indexOf(msg.id)];
            var red = fixture.parameters[fixture.parameters.map(el => el.name).indexOf("Red")];
            var green = fixture.parameters[fixture.parameters.map(el => el.name).indexOf("Green")];
            var blue = fixture.parameters[fixture.parameters.map(el => el.name).indexOf("Blue")];
            var white = fixture.parameters[fixture.parameters.map(el => el.name).indexOf("White")];
            var amber = fixture.parameters[fixture.parameters.map(el => el.name).indexOf("Amber")];
            var lime = fixture.parameters[fixture.parameters.map(el => el.name).indexOf("Lime")];
            var indigo = fixture.parameters[fixture.parameters.map(el => el.name).indexOf("Indigo")];
            var cyan = fixture.parameters[fixture.parameters.map(el => el.name).indexOf("Cyan")];
            var magenta = fixture.parameters[fixture.parameters.map(el => el.name).indexOf("Magenta")];
            var yellow = fixture.parameters[fixture.parameters.map(el => el.name).indexOf("Yellow")];
        }
        var finalColor = [255, 255, 255];
        if (red != null && green != null && blue != null) {
            finalColor[0] = cppaddon.mapRange(red.value, 0, 65535, 0, 255);
            finalColor[1] = cppaddon.mapRange(green.value, 0, 65535, 0, 255);
            finalColor[2] = cppaddon.mapRange(blue.value, 0, 65535, 0, 255);
        }
        if (cyan != null && magenta != null && yellow != null) {
            finalColor[0] = cppaddon.mapRange(cyan.value, 0, 65535, 0, 255);
            finalColor[1] = cppaddon.mapRange(magenta.value, 0, 65535, 0, 255);
            finalColor[2] = cppaddon.mapRange(yellow.value, 0, 65535, 0, 255);
        }
        console.log("rgb" + finalColor);
        if (white != null) {
            finalColor = blendColors(finalColor, 255 / 255.0, 255 / 255.0, 255 / 255.0, cppaddon.mapRange(white.value, 0, 65535, 0, 255) / 255.0);
            console.log("white" + finalColor);
        }
        if (amber != null) {
            finalColor = blendColors(finalColor, 255 / 255.0, 126 / 255.0, 0 / 255.0, cppaddon.mapRange(amber.value, 0, 65535, 0, 255) / 255.0);
            console.log("amber" + finalColor);
        }
        if (lime != null) {
            finalColor = blendColors(finalColor, 173 / 255.0, 255 / 255.0, 47 / 255.0, cppaddon.mapRange(lime.value, 0, 65535, 0, 255) / 255.0);
            console.log("lime" + finalColor);
        }
        if (indigo != null) {
            finalColor = blendColors(finalColor, 75 / 255.0, 0 / 255.0, 130 / 255.0, cppaddon.mapRange(indigo.value, 0, 65535, 0, 255) / 255.0);
            console.log("indigo" + finalColor);
        }
        console.log(finalColor);
        var palette = {
            color: "#" + rgbHex(finalColor[0], finalColor[1], finalColor[2]),
            name: msg.name,
            parameters: [
                {
                    name: "Red",
                    value: finalColor[0]
                },
                {
                    name: "Green",
                    value: finalColor[1]
                },
                {
                    name: "Blue",
                    value: finalColor[2]
                }
            ]
        }
        colorPalettes.push(palette);
        io.emit('palettes', { colorPalettes: colorPalettes, positionPalettes: positionPalettes });
        saveShow();
    });

    socket.on('addPositionPalette', function (msg) {
        saveUndoRedo(false);
        if (msg.type == 'fixture') {
            var fixture = fixtures[fixtures.map(el => el.id).indexOf(msg.id)];
            var pan = fixture.parameters[fixture.parameters.map(el => el.name).indexOf("Pan")];
            var tilt = fixture.parameters[fixture.parameters.map(el => el.name).indexOf("Tilt")];
        } else if (msg.type == 'group') {
            var group = groups[groups.map(el => el.id).indexOf(msg.id)];
            var pan = group.parameters[group.parameters.map(el => el.name).indexOf("Pan")];
            var tilt = group.parameters[group.parameters.map(el => el.name).indexOf("Tilt")];
        }
        if (pan == null) {
            pan = 0;
        } else {
            pan = pan.value;
        }
        if (tilt == null) {
            tilt = 0;
        } else {
            tilt = tilt.value;
        }
        var palette = {
            name: msg.name,
            parameters: [
                {
                    name: "Pan",
                    value: pan
                },
                {
                    name: "Tilt",
                    value: tilt
                }
            ]
        }
        positionPalettes.push(palette);
        io.emit('palettes', { colorPalettes: colorPalettes, positionPalettes: positionPalettes });
        saveShow();
    });

    socket.on('removePositionPalette', function (msg) {
        saveUndoRedo(false);
        positionPalettes.splice(msg.pid, 1);
        socket.emit('message', { type: "info", content: "Position palette has been removed!" });
        io.emit('palettes', { colorPalettes: colorPalettes, positionPalettes: positionPalettes });
        saveShow();
    });

    socket.on('removeColorPalette', function (msg) {
        saveUndoRedo(false);
        colorPalettes.splice(msg.pid, 1);
        socket.emit('message', { type: "info", content: "Color palette has been removed!" });
        io.emit('palettes', { colorPalettes: colorPalettes, positionPalettes: positionPalettes });
        saveShow();
    });

    socket.on('getFixtureEffects', function (fixtureid) {
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
                    effect.type = "Position";
                } else if (JSON.stringify(effect.parameterNames).indexOf("Parameter") >= 0) {
                    effect.type = "Parameter";
                }
                effectsList.push({ name: effect.name, type: effect.type, file: file });
            });
            socket.emit('fixtureEffects', { fixtureID: fixtureid, effects: effectsList });
        });
    });

    socket.on('getShowsFromUSB', function () {
        getShowsFromUSB(function (result) {
            if (!result) {
                console.log("Error getting shows from USB");
            }
        });
    });

    socket.on('addFixture', function (msg) {
        saveUndoRedo(false);
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
            let i = 0; const iMax = parseInt(msg.creationCount); for (; i < iMax; i++) {
                // Add a fixture using the fixture spec file in the fixtures folder
                fixture = require(process.cwd() + "/fixtures/" + msg.fixtureName);
                fixture = fixture.personalities[fixture.personalities.map(el => el.dcid).indexOf(msg.dcid)];
                fixture.startDMXAddress = startDMXAddress;
                fixture.dmxUniverse = parseInt(msg.universe);
                fixture.hasLockedParameters = false;
                fixture.hasActiveEffects = false;
                fixture.name = fixture.modelName;
                fixture.effects = [];
                fixture.parameterTypes = [];
                fixture.invertPan = false;
                fixture.invertTilt = false;
                fixture.swapPanTilt = false;

                let c = 0; const cMax = fixture.parameters.length; for (; c < cMax; c++) {
                    fixture.parameters[c].value = fixture.parameters[c].home;
                    fixture.parameters[c].max = 65535;
                    fixture.parameters[c].min = 0;
                    fixture.parameters[c].displayValue = cppaddon.mapRange(fixture.parameters[c].home, fixture.parameters[c].min, fixture.parameters[c].max, 0, 100);
                    fixture.parameters[c].locked = false;
                    fixture.parameters[c].id = generateID();
                    if (fixture.parameters[c].type == 2) {
                        fixture.parameterTypes.push("Position");
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
                saveUndoRedo(false);
                let c = 0; const cMax = cues.length; for (; c < cMax; c++) {
                    if (cues[c].fixtures.some(e => e.id === fixtureID)) {
                        cues[c].fixtures.splice(cues[c].fixtures.map(el => el.id).indexOf(fixtureID), 1);
                        if (cues[c].fixtures.length == 0) {
                            cues.splice(cues.map(el => el.id).indexOf(cues[c].id), 1);
                        }
                    }
                }
                let p = 0; const pMax = presets.length; for (; p < pMax; p++) {
                    if (presets[p].ids.some(e => e === fixtureID)) {
                        presets[p].patchChanged = true;
                    }
                }
                var sequence = null;
                let s = 0; const sMax = sequences.length; for (; s < sMax; s++) {
                    sequence = sequences[s];
                    if (sequence.ids.some(e => e === fixtureID)) {
                        sequence.ids.splice(sequence.ids.map(el => el).indexOf(fixtureID), 1);
                        let st = 0; const stMax = sequence.steps.length; for (; st < stMax; st++) {
                            if (sequence.steps[st].fixtures.some(e => e.id === fixtureID)) {
                                sequence.steps[st].fixtures.splice(sequence.steps[st].fixtures.map(el => el.id).indexOf(fixtureID), 1);
                                if (sequence.steps[st].fixtures.length == 0) {
                                    sequence.steps.splice(sequence.steps.map(el => el.id).indexOf(sequence.steps[st].id), 1);
                                }
                            }
                        }
                    }
                    if (sequence.ids.length == 0) {
                        sequences.splice(sequences.map(el => el.id).indexOf(sequence.id), 1);
                        io.emit('resetView', { type: 'sequences', eid: sequence.id });
                    }
                }
                let g = 0; const gMax = groups.length; for (; g < gMax; g++) {
                    if (groups[g].ids.some(e => e === fixtureID)) {
                        groups[g].ids.splice(groups[g].ids.map(el => el).indexOf(fixtureID), 1);
                        groups[g].parameters = generateGroupParameters(groups[g]);
                        groups[g].parameterTypes = [];
                        let c = 0; const cMax = groups[g].parameters.length; for (; c < cMax; c++) {
                            if (groups[g].parameters[c].type == 2) {
                                groups[g].parameterTypes.push("Position");
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
                io.emit('presets', cleanPresets());
                io.emit('groups', { groups: cleanGroups(), target: true });
                io.emit('sequences', { sequences: cleanSequences(), target: true });
                saveShow();
                savePresets();
            } else {
                socket.emit('message', { type: "error", content: "This fixture does not exist!" });
            }
        } else {
            socket.emit('message', { type: "error", content: "No fixtures exist!" });
        }
    });

    socket.on('removeFixtureEffect', function (msg) {
        if (fixtures.length != 0) {
            if (fixtures.some(e => e.id === msg.fixtureID)) {
                saveUndoRedo(false);
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
                fixture = fixtures[fixtures.map(el => el.id).indexOf(msg.fixtureID)];
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

    socket.on('getFixtureEffectSettings', function (msg) {
        if (fixtures.length != 0) {
            if (fixtures.some(e => e.id === msg.fixtureID)) {
                var fixture = fixtures[fixtures.map(el => el.id).indexOf(msg.fixtureID)];
                if (fixture.effects.some(e => e.id === msg.effectID)) {
                    socket.emit('fixtureEffectSettings', { fixtureID: fixture.id, effect: fixture.effects[fixture.effects.map(el => el.id).indexOf(msg.effectID)] });
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

    socket.on('editFixtureEffectSettings', function (msg) {
        if (fixtures.length != 0) {
            if (fixtures.some(e => e.id === msg.fixtureID)) {
                var fixture = fixtures[fixtures.map(el => el.id).indexOf(msg.fixtureID)];
                if (fixture.effects.some(e => e.id === msg.effectID)) {
                    var effect = fixture.effects[fixture.effects.map(el => el.id).indexOf(msg.effectID)];
                    effect.name = msg.name;
                    if (isNaN(parseFloat(msg.depth)) == false) {
                        effect.depth = parseFloat(msg.depth);
                    }
                    if (isNaN(parseInt(msg.speed)) == false) {
                        effect.speed = parseInt(msg.speed);
                    }
                    socket.broadcast.emit('fixtureEffectSettings', { fixtureID: fixture.id, effect: fixture.effects[fixture.effects.map(el => el.id).indexOf(msg.effectID)] });
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

    socket.on('addFixtureEffect', function (msg) {
        if (fixtures.length != 0) {
            if (fixtures.some(e => e.id === msg.fixtureID)) {
                saveUndoRedo(false);
                var fixture = fixtures[fixtures.map(el => el.id).indexOf(msg.fixtureID)];
                var effect = JSON.parse(JSON.stringify(require(process.cwd() + "/effects/" + msg.effectFile).effectTable));
                effect.active = true;
                effect.step = 0;
                effect.depth = 1.0;
                effect.speed = 1;
                effect.speedIndex = 0;
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
                    effect.type = "Position";
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
                io.emit('fixtures', { fixtures: cleanFixtures(), target: true });
                socket.emit('message', { type: "info", content: "Effect has been added to fixture!" });
                saveShow();
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
                if (isNaN(parseInt(msg.dmxUniverse)) == false) {
                    fixture.dmxUniverse = parseInt(msg.dmxUniverse);
                }
                if (isNaN(parseInt(msg.startDMXAddress)) == false) {
                    fixture.startDMXAddress = parseInt(msg.startDMXAddress);
                }
                if (fixture.startDMXAddress > 512) {
                    fixture.startDMXAddress = 512;
                }
                if (fixture.startDMXAddress < 1) {
                    fixture.startDMXAddress = 1;
                }
                if (fixture.dmxUniverse > 1) {
                    fixture.dmxUniverse = 1;
                }
                if (fixture.dmxUniverse < 0) {
                    fixture.dmxUniverse = 0;
                }
                io.emit('fixtures', { fixtures: cleanFixtures(), target: true });
                saveShow();
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
            saveUndoRedo(false);
            resetFixtures(false);
            currentCue = "";
            io.emit('cueActionBtn', false);
            io.emit('activeCue', currentCueID);
            io.emit('fixtures', { fixtures: cleanFixtures(), target: true });
            socket.emit('message', { type: "info", content: "Fixture values have been reset!" });
            saveShow();
        } else {
            socket.emit('message', { type: "error", content: "No fixtures exist!" });
        }
    });

    socket.on('resetFixturesIntensity', function () {
        if (fixtures.length != 0) {
            saveUndoRedo(false);
            resetFixturesIntensity();
            currentCue = "";
            io.emit('cueActionBtn', false);
            io.emit('activeCue', currentCueID);
            io.emit('fixtures', { fixtures: cleanFixtures(), target: true });
            socket.emit('message', { type: "info", content: "Fixture values have been reset!" });
            //saveShow();
        } else {
            socket.emit('message', { type: "error", content: "No fixtures exist!" });
        }
    });

    socket.on('resetFixture', function (fixtureID) {
        if (fixtures.length != 0) {
            if (fixtures.some(e => e.id === fixtureID)) {
                saveUndoRedo(false);
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
                //saveShow();
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
                if (fixture.parameters.some(e => e.id === msg.pid)) {
                    var parameter = fixture.parameters[fixture.parameters.map(el => el.id).indexOf(msg.pid)];
                    parameter.value = parseInt(msg.value);
                    parameter.displayValue = cppaddon.mapRange(parameter.value, parameter.min, parameter.max, 0, 100);
                    socket.broadcast.emit('fixtures', { fixtures: cleanFixtures(), target: true });
                    socket.emit('fixtures', { fixtures: cleanFixtures(), target: false });
                } else {
                    socket.emit('message', { type: "error", content: "This parameter does not exist!" });
                }
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
                if (fixture.parameters.some(e => e.id === msg.pid)) {
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
                    socket.emit('message', { type: "error", content: "This parameter does not exist!" });
                }
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
                if (fixture.parameters.some(e => e.id === msg.pid)) {
                    var parameter = fixture.parameters[fixture.parameters.map(el => el.id).indexOf(msg.pid)];
                    var range = parameter.ranges[msg.rid];
                    fixture.parameters[fixture.parameters.map(el => el.id).indexOf(msg.pid)].value = cppaddon.mapRange(range.default, 0, 255, parameter.min, parameter.max);
                    fixture.parameters[fixture.parameters.map(el => el.id).indexOf(msg.pid)].displayValue = cppaddon.mapRange(fixture.parameters[fixture.parameters.map(el => el.id).indexOf(msg.pid)].value, fixture.parameters[fixture.parameters.map(el => el.id).indexOf(msg.pid)].min, fixture.parameters[fixture.parameters.map(el => el.id).indexOf(msg.pid)].max, 0, 100);;
                    io.emit('fixtures', { fixtures: cleanFixtures(), target: true });
                } else {
                    socket.emit('message', { type: "error", content: "This parameter does not exist!" });
                }
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
                    if (group.parameters.some(e => e.id === msg.pid)) {
                        var parameter = group.parameters[group.parameters.map(el => el.id).indexOf(msg.pid)];
                        var range = parameter.ranges[msg.rid];
                        group.parameters[group.parameters.map(el => el.id).indexOf(msg.pid)].value = cppaddon.mapRange(range.default, 0, 255, parameter.min, parameter.max);
                        group.parameters[group.parameters.map(el => el.id).indexOf(msg.pid)].displayValue = cppaddon.mapRange(group.parameters[group.parameters.map(el => el.id).indexOf(msg.pid)].value, group.parameters[group.parameters.map(el => el.id).indexOf(msg.pid)].min, group.parameters[group.parameters.map(el => el.id).indexOf(msg.pid)].max, 0, 100);;
                        setFixtureGroupValues(group, parameter);
                        io.emit('groups', { groups: cleanGroups(), target: true });
                        io.emit('fixtures', { fixtures: cleanFixtures(), target: true });
                    } else {
                        socket.emit('message', { type: "error", content: "This parameter does not exist!" });
                    }
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

    socket.on('recordCue', function () {
        if (fixtures.length != 0) {
            saveUndoRedo(false);
            var newCue = {
                id: generateID(),
                name: "Cue " + (cues.length + 1),
                upTime: SETTINGS.defaultUpTime,
                downTime: SETTINGS.defaultDownTime,
                follow: -1,
                upStep: SETTINGS.defaultUpTime * FPS,
                downStep: SETTINGS.defaultDownTime * FPS,
                active: false,
                following: false,
                fixtures: cleanFixturesForCue(),
                sequences: cleanSequencesForCue(),
                groups: cleanGroupsForCue(),
                includeIntensityColor: true,
                includePosition: true,
                includeBeam: true
            };
            cues.push(newCue);
            currentCue = "";
            if (lastCue != "") {
                cues[cues.map(el => el.id).indexOf(lastCue)].upStep = cues[cues.map(el => el.id).indexOf(lastCue)].upTime * FPS;
                cues[cues.map(el => el.id).indexOf(lastCue)].downStep = cues[cues.map(el => el.id).indexOf(lastCue)].downTime * FPS;
                cues[cues.map(el => el.id).indexOf(lastCue)].active = false;
                cues[cues.map(el => el.id).indexOf(lastCue)].following = false;
            }
            lastCue = newCue.id;
            currentCueID = lastCue;
            if (newCue.upTime > newCue.downTime) {
                cueProgress = ((newCue.upTime * FPS) + 1);
                io.emit('cueProgress', Math.round((cueProgress / ((newCue.upTime * FPS) + 1)) * 10) / 10);
            } else {
                cueProgress = ((newCue.downTime * FPS) + 1);
                io.emit('cueProgress', Math.round((cueProgress / ((newCue.downTime * FPS) + 1)) * 10) / 10);
            }
            io.emit('activeCue', currentCueID);
            io.emit('cueActionBtn', false);
            io.emit('cues', cleanCues());
            saveShow();
        } else {
            socket.emit('message', { type: "error", content: "No fixtures exist!" });
        }
    });

    socket.on('updateCue', function (cueID) {
        if (cues.length != 0) {
            if (cues.some(e => e.id === cueID)) {
                saveUndoRedo(false);
                var cue = cues[cues.map(el => el.id).indexOf(cueID)];
                cue.fixtures = cleanFixturesForCue();
                cue.sequences = cleanSequencesForCue();
                cue.groups = cleanGroupsForCue();
                currentCue = "";
                if (lastCue != "") {
                    cues[cues.map(el => el.id).indexOf(lastCue)].upStep = cues[cues.map(el => el.id).indexOf(lastCue)].upTime * FPS;
                    cues[cues.map(el => el.id).indexOf(lastCue)].downStep = cues[cues.map(el => el.id).indexOf(lastCue)].downTime * FPS;
                    cues[cues.map(el => el.id).indexOf(lastCue)].active = false;
                    cues[cues.map(el => el.id).indexOf(lastCue)].following = false;
                }
                lastCue = cue.id;
                cues[cues.map(el => el.id).indexOf(lastCue)].active = false;
                currentCueID = lastCue;
                if (cue.upTime > cue.downTime) {
                    cueProgress = ((cue.upTime * FPS) + 1);
                    io.emit('cueProgress', Math.round((cueProgress / ((cue.upTime * FPS) + 1)) * 10) / 10);
                } else {
                    cueProgress = ((cue.downTime * FPS) + 1);
                    io.emit('cueProgress', Math.round((cueProgress / ((cue.downTime * FPS) + 1)) * 10) / 10);
                }
                io.emit('activeCue', currentCueID);
                io.emit('cues', cleanCues());
                io.emit('cueActionBtn', false);
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
                saveUndoRedo(false);
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
                saveUndoRedo(false);
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
                if (parseFloat(msg.upTime) == cue.upTime && parseFloat(msg.downTime) == cue.downTime) {
                    changed = false;
                }
                cue.name = msg.name;
                cue.includeIntensityColor = msg.includeIntensityColor;
                cue.includePosition = msg.includePosition;
                cue.includeBeam = msg.includeBeam;
                if (isNaN(parseFloat(msg.upTime)) == false) {
                    cue.upTime = parseFloat(msg.upTime);
                }
                if (isNaN(parseFloat(msg.downTime)) == false) {
                    cue.downTime = parseFloat(msg.downTime);
                }
                if (cue.upTime == 0) {
                    cue.upTime = 0.001;
                }
                if (cue.downTime == 0) {
                    cue.downTime = 0.001;
                }
                if (isNaN(parseFloat(msg.follow)) == false) {
                    if (msg.follow < -1) {
                        cue.follow = -1;
                    } else {
                        cue.follow = parseFloat(msg.follow);
                    }
                }
                if (changed == true) {
                    cue.upStep = cue.upTime * FPS;
                    cue.downStep = cue.downTime * FPS;
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
                saveUndoRedo(false);
                cues.splice(cues.map(el => el.id).indexOf(cueID), 1);
                if (currentCue == cueID || lastCue == cueID) {
                    lastCue = "";
                    cueProgress = 0;
                    io.emit('cueProgress', cueProgress);
                    currentCueID = lastCue;
                    currentCue = lastCue;
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
                cues[cues.map(el => el.id).indexOf(lastCue)].upStep = cues[cues.map(el => el.id).indexOf(lastCue)].upTime * FPS;
                cues[cues.map(el => el.id).indexOf(lastCue)].downStep = cues[cues.map(el => el.id).indexOf(lastCue)].downTime * FPS;
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
            cueProgress = 0;
            io.emit('cueProgress', cueProgress);
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
                cues[cues.map(el => el.id).indexOf(lastCue)].upStep = cues[cues.map(el => el.id).indexOf(lastCue)].upTime * FPS;
                cues[cues.map(el => el.id).indexOf(lastCue)].downStep = cues[cues.map(el => el.id).indexOf(lastCue)].downTime * FPS;
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
            cueProgress = 0;
            io.emit('cueProgress', cueProgress);
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
            cues[cues.map(el => el.id).indexOf(lastCue)].upStep = cues[cues.map(el => el.id).indexOf(lastCue)].upTime * FPS;
            cues[cues.map(el => el.id).indexOf(lastCue)].downStep = cues[cues.map(el => el.id).indexOf(lastCue)].downTime * FPS;
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
            if (cues.some(e => e.id === cueID)) {
                if (lastCue != "") {
                    cues[cues.map(el => el.id).indexOf(lastCue)].upStep = cues[cues.map(el => el.id).indexOf(lastCue)].upTime * FPS;
                    cues[cues.map(el => el.id).indexOf(lastCue)].downStep = cues[cues.map(el => el.id).indexOf(lastCue)].downTime * FPS;
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
                cueProgress = 0;
                io.emit('cueProgress', cueProgress);
                currentCue = lastCue;
                cues[cues.map(el => el.id).indexOf(lastCue)].active = true;
                currentCueID = lastCue;
                io.emit('activeCue', currentCueID);
                io.emit('cues', cleanCues());
                io.emit('cueActionBtn', true);
            } else {
                socket.emit('message', { type: "error", content: "This cue doesn't exist!" });
            }
        } else {
            socket.emit('message', { type: "error", content: "No cues exist!" });
        }
    });

    socket.on('gotoCueInstant', function (cueID) {
        if (cues.length != 0) {
            if (cues.some(e => e.id === cueID)) {
                if (lastCue != "") {
                    cues[cues.map(el => el.id).indexOf(lastCue)].upStep = cues[cues.map(el => el.id).indexOf(lastCue)].upTime * FPS;
                    cues[cues.map(el => el.id).indexOf(lastCue)].downStep = cues[cues.map(el => el.id).indexOf(lastCue)].downTime * FPS;
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
                cueProgress = 0;
                io.emit('cueProgress', cueProgress);
                currentCue = lastCue;
                cues[cues.map(el => el.id).indexOf(lastCue)].upStep = 0;
                cues[cues.map(el => el.id).indexOf(lastCue)].downStep = 0;
                cues[cues.map(el => el.id).indexOf(lastCue)].active = true;
                currentCueID = lastCue;
                io.emit('activeCue', currentCueID);
                io.emit('cues', cleanCues());
                io.emit('cueActionBtn', true);
            } else {
                socket.emit('message', { type: "error", content: "This cue doesn't exist!" });
            }
        } else {
            socket.emit('message', { type: "error", content: "No cues exist!" });
        }
    });

    socket.on('moveCueUp', function (cueID) {
        if (cues.length != 0) {
            if (cues.some(e => e.id === cueID)) {
                saveUndoRedo(false);
                moveArrayItem(cues, cues.map(el => el.id).indexOf(cueID), cues.map(el => el.id).indexOf(cueID) - 1);
                io.emit('activeCue', currentCueID);
                io.emit('cues', cleanCues());
                socket.emit('message', { type: "info", content: "Cue moved up." });
                saveShow();
            } else {
                socket.emit('message', { type: "error", content: "This cue doesn't exist!" });
            }
        } else {
            socket.emit('message', { type: "error", content: "No cues exist!" });
        }
    });

    socket.on('moveCueDown', function (cueID) {
        if (cues.length != 0) {
            if (cues.some(e => e.id === cueID)) {
                saveUndoRedo(false);
                moveArrayItem(cues, cues.map(el => el.id).indexOf(cueID), cues.map(el => el.id).indexOf(cueID) + 1);
                io.emit('activeCue', currentCueID);
                io.emit('cues', cleanCues());
                socket.emit('message', { type: "info", content: "Cue moved down." });
                saveShow();
            } else {
                socket.emit('message', { type: "error", content: "This cue doesn't exist!" });
            }
        } else {
            socket.emit('message', { type: "error", content: "No cues exist!" });
        }
    });

    socket.on('addSequence', function (fixtureIDs) {
        if (fixtures.length != 0) {
            saveUndoRedo(false);
            var newSequence = {
                id: generateID(),
                name: "Sequence " + (sequences.length + 1),
                active: false,
                steps: [],
                ids: fixtureIDs,
                includeIntensityColor: true,
                includePosition: true,
                includeBeam: true,
                currentStep: "",
                currentStepID: "",
                lastStep: ""
            };
            sequences.push(newSequence);
            io.emit('sequences', { sequences: cleanSequences(), target: true });
            saveShow();
        } else {
            socket.emit('message', { type: "error", content: "No fixtures exist!" });
        }
    });

    socket.on('recordSequenceStep', function (sequenceID) {
        if (fixtures.length != 0) {
            if (sequences.some(e => e.id === sequenceID)) {
                saveUndoRedo(false);
                var sequence = sequences[sequences.map(el => el.id).indexOf(sequenceID)];
                var newStep = {
                    id: generateID(),
                    upTime: SETTINGS.defaultUpTime,
                    downTime: SETTINGS.defaultDownTime,
                    follow: 0,
                    upStep: SETTINGS.defaultUpTime * FPS,
                    downStep: SETTINGS.defaultDownTime * FPS,
                    active: false,
                    following: false,
                    fixtures: cleanFixturesForSequence()
                };
                sequence.steps.push(newStep);
                io.emit('sequences', { sequences: cleanSequences(), target: true });
                saveShow();
            } else {
                socket.emit('message', { type: "error", content: "This sequence doesn't exist!" });
            }
        } else {
            socket.emit('message', { type: "error", content: "No fixtures exist!" });
        }
    });

    socket.on('addFixturesToSequence', function (msg) {
        if (fixtures.length > 0) {
            if (sequences.length > 0) {
                if (msg.fixtures.length > 0) {
                    if (sequences.some(e => e.id === msg.id)) {
                        saveUndoRedo(false);
                        var sequence = sequences[sequences.map(el => el.id).indexOf(msg.id)];
                        let f = 0; const fMax = msg.fixtures.length; for (; f < fMax; f++) {
                            if (sequence.ids.some(e => e === msg.fixtures[f]) == false) {
                                sequence.ids.push(msg.fixtures[f]);
                            }
                        }
                        let s = 0; const sMax = sequence.steps.length; for (; s < sMax; s++) {
                            let fi = 0; const fiMax = fixtures.length; for (; fi < fiMax; fi++) {
                                if (msg.fixtures.some(e => e === fixtures[fi].id)) {
                                    sequence.steps[s].fixtures.push(cleanFixtureForCue(fixtures[fi]));
                                }
                            }
                        }
                        io.emit('sequences', { sequences: cleanSequences(), target: true });
                        saveShow();
                    } else {
                        socket.emit('message', { type: "error", content: "This sequence doesn't exist!" });
                    }
                } else {
                    socket.emit('message', { type: "error", content: "No fixtures selected!" });
                }
            } else {
                socket.emit('message', { type: "error", content: "No sequences exist!" });
            }
        } else {
            socket.emit('message', { type: "error", content: "No fixtures exist!" });
        }
    });

    socket.on('addGroup', function (fixtureIDs) {
        if (fixtures.length > 0) {
            if (fixtureIDs.length > 0) {
                saveUndoRedo(false);
                var newGroup = {
                    id: generateID(),
                    name: "Group " + (groups.length + 1),
                    ids: fixtureIDs,
                    parameters: [],
                    parameterTypes: [],
                    effects: [],
                    hasActiveEffects: false,
                    hasLockedParameters: false
                };
                newGroup.parameters = generateGroupParameters(newGroup);
                newGroup.parameterTypes = [];
                let c = 0; const cMax = newGroup.parameters.length; for (; c < cMax; c++) {
                    if (newGroup.parameters[c].type == 2) {
                        newGroup.parameterTypes.push("Position");
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
        } else {
            socket.emit('message', { type: "error", content: "No fixtures exist!" });
        }
    });

    socket.on('addFixturesToGroup', function (msg) {
        if (fixtures.length > 0) {
            if (groups.length > 0) {
                if (msg.fixtures.length > 0) {
                    if (groups.some(e => e.id === msg.id)) {
                        saveUndoRedo(false);
                        var group = groups[groups.map(el => el.id).indexOf(msg.id)];
                        let f = 0; const fMax = msg.fixtures.length; for (; f < fMax; f++) {
                            if (group.ids.some(e => e === msg.fixtures[f]) == false) {
                                group.ids.push(msg.fixtures[f]);
                            }
                        }
                        group.parameters = generateGroupParameters(group);
                        group.parameterTypes = [];
                        let c = 0; const cMax = group.parameters.length; for (; c < cMax; c++) {
                            if (group.parameters[c].type == 2) {
                                group.parameterTypes.push("Position");
                            } else if (group.parameters[c].type == 5) {
                                group.parameterTypes.push("Color");
                            } else if (group.parameters[c].type == 4) {
                                group.parameterTypes.push("Parameter");
                            } else if (group.parameters[c].type == 1) {
                                group.parameterTypes.push("Intensity");
                            }
                        }
                        io.emit('groups', { groups: cleanGroups(), target: true });
                        saveShow();
                    } else {
                        socket.emit('message', { type: "error", content: "This group doesn't exist!" });
                    }
                } else {
                    socket.emit('message', { type: "error", content: "No fixtures selected!" });
                }
            } else {
                socket.emit('message', { type: "error", content: "No groups exist!" });
            }
        } else {
            socket.emit('message', { type: "error", content: "No fixtures exist!" });
        }
    });

    socket.on('getGroupParameters', function (groupID) {
        if (groups.length != 0) {
            if (groups.some(e => e.id === groupID)) {
                var group = groups[groups.map(el => el.id).indexOf(groupID)];
                var fixture = null;
                var valAvg = null;
                var valAvgCount = null;
                var shouldLock = false;
                group.hasLockedParameters = false;
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
                    group.parameters[c].displayValue = cppaddon.mapRange(group.parameters[c].value, group.parameters[c].min, group.parameters[c].max, 0, 100);
                    group.parameters[c].locked = shouldLock;
                    if (group.parameters[c].locked) {
                        group.hasLockedParameters = true;
                        io.emit('groups', { groups: cleanGroups(), target: false });
                    }
                    shouldLock = false;
                }
                socket.emit('groupParameters', group);
                socket.emit('palettes', { colorPalettes: colorPalettes, positionPalettes: positionPalettes });
            } else {
                socket.emit('message', { type: "error", content: "This group doesn't exist!" });
            }
        } else {
            socket.emit('message', { type: "error", content: "No groups exist!" });
        }

    });

    socket.on('getSequenceParameters', function (sequenceID) {
        if (sequences.length != 0) {
            if (sequences.some(e => e.id === sequenceID)) {
                socket.emit('sequenceParameters', sequences[sequences.map(el => el.id).indexOf(sequenceID)]);
            } else {
                socket.emit('message', { type: "error", content: "This sequence doesn't exist!" });
            }
        } else {
            socket.emit('message', { type: "error", content: "No sequences exist!" });
        }

    });

    socket.on('changeGroupParameterValue', function (msg) {
        if (fixtures.length > 0) {
            if (groups.length > 0) {
                if (groups.some(e => e.id === msg.id)) {
                    var group = groups[groups.map(el => el.id).indexOf(msg.id)];
                    if (group.parameters.some(e => e.id === msg.pid)) {
                        var parameter = group.parameters[group.parameters.map(el => el.id).indexOf(msg.pid)];
                        parameter.value = parseInt(msg.value);
                        parameter.displayValue = cppaddon.mapRange(parameter.value, parameter.min, parameter.max, 0, 100);
                        setFixtureGroupValues(group, parameter);
                        socket.broadcast.emit('groups', { groups: cleanGroups(), target: true });
                        socket.emit('groups', { groups: cleanGroups(), target: false });
                        io.emit('fixtures', { fixtures: cleanFixtures(), target: true });
                    } else {
                        socket.emit('message', { type: "error", content: "This parameter doesn't exist!" });
                    }
                } else {
                    socket.emit('message', { type: "error", content: "This group doesn't exist!" });
                }
            } else {
                socket.emit('message', { type: "error", content: "No groups exist!" });
            }
        } else {
            socket.emit('message', { type: "error", content: "No fixtures exist!" });
        }
    });

    socket.on('changeGroupParameterLock', function (msg) {
        if (fixtures.length > 0) {
            if (groups.length > 0) {
                if (groups.some(e => e.id === msg.id)) {
                    var group = groups[groups.map(el => el.id).indexOf(msg.id)];
                    if (group.parameters.some(e => e.id === msg.pid)) {
                        var parameter = group.parameters[group.parameters.map(el => el.id).indexOf(msg.pid)];
                        parameter.locked = !parameter.locked;
                        group.hasLockedParameters = false;
                        let c = 0; const cMax = group.parameters.length; for (; c < cMax; c++) {
                            if (group.parameters[c].locked) {
                                group.hasLockedParameters = true;
                            }
                        }
                        setFixtureGroupValues(group, parameter);
                        io.emit('groups', { groups: cleanGroups(), target: true });
                        io.emit('fixtures', { fixtures: cleanFixtures(), target: true });
                    } else {
                        socket.emit('message', { type: "error", content: "This parameter doesn't exist!" });
                    }
                } else {
                    socket.emit('message', { type: "error", content: "This group doesn't exist!" });
                }
            } else {
                socket.emit('message', { type: "error", content: "No groups exist!" });
            }
        } else {
            socket.emit('message', { type: "error", content: "No fixtures exist!" });
        }
    });

    socket.on('getGroupFixtures', function (groupID) {
        if (groups.length != 0) {
            if (groups.some(e => e.id === groupID)) {
                socket.emit('groupFixtures', getGroupFixtures(groupID));
            } else {
                socket.emit('message', { type: "error", content: "This group doesn't exist!" });
            }
        } else {
            socket.emit('message', { type: "error", content: "No groups exist!" });
        }
    });

    socket.on('getSequenceFixtures', function (sequenceID) {
        if (sequences.length != 0) {
            if (sequences.some(e => e.id === sequenceID)) {
                socket.emit('sequenceFixtures', getSequenceFixtures(sequenceID));
            } else {
                socket.emit('message', { type: "error", content: "This sequence doesn't exist!" });
            }
        } else {
            socket.emit('message', { type: "error", content: "No sequences exist!" });
        }
    });

    socket.on('editGroupSettings', function (msg) {
        if (groups.length != 0) {
            if (groups.some(e => e.id === msg.id)) {
                var group = groups[groups.map(el => el.id).indexOf(msg.id)];
                group.name = msg.name;
                io.emit('groups', { groups: cleanGroups(), target: true });
                saveShow();
            } else {
                socket.emit('message', { type: "error", content: "This group doesn't exist!" });
            }
        } else {
            socket.emit('message', { type: "error", content: "No groups exist!" });
        }
    });

    socket.on('editSequenceSettings', function (msg) {
        if (sequences.length != 0) {
            if (sequences.some(e => e.id === msg.id)) {
                var sequence = sequences[sequences.map(el => el.id).indexOf(msg.id)];
                sequence.name = msg.name;
                if (sequence.active == false && msg.active == true) {
                    sequence.active = msg.active;
                    if (sequence.steps.length > 0) {
                        sequence.currentStep = sequence.steps[0].id;
                        sequence.currentStepID = sequence.steps[0].id;
                        sequence.steps[0].active = true;
                    }
                } else if (sequence.active == true && msg.active == false) {
                    sequence.active = msg.active;
                    sequence.currentStep = "";
                    sequence.currentStepID = "";
                    let s = 0; const sMax = sequence.steps.length; for (; s < sMax; s++) {
                        sequence.steps[s].active = false;
                    }
                }
                sequence.includeIntensityColor = msg.includeIntensityColor;
                sequence.includePosition = msg.includePosition;
                sequence.includeBeam = msg.includeBeam;
                io.emit('sequences', { sequences: cleanSequences(), target: true });
                saveShow();
            } else {
                socket.emit('message', { type: "error", content: "This sequence doesn't exist!" });
            }
        } else {
            socket.emit('message', { type: "error", content: "No sequences exist!" });
        }
    });

    socket.on('editSequenceStepSettings', function (msg) {
        if (sequences.length != 0) {
            if (sequences.some(e => e.id === msg.sequence)) {
                var sequence = sequences[sequences.map(el => el.id).indexOf(msg.sequence)];
                if (sequence.steps.some(e => e.id === msg.step)) {
                    var step = sequence.steps[sequence.steps.map(el => el.id).indexOf(msg.step)];
                    var changed = true;
                    if (parseFloat(msg.upTime) == step.upTime && parseFloat(msg.downTime) == step.downTime) {
                        changed = false;
                    }
                    if (isNaN(parseFloat(msg.upTime)) == false) {
                        step.upTime = parseFloat(msg.upTime);
                    }
                    if (isNaN(parseFloat(msg.downTime)) == false) {
                        step.downTime = parseFloat(msg.downTime);
                    }
                    if (step.upTime == 0) {
                        step.upTime = 0.001;
                    }
                    if (step.downTime == 0) {
                        step.downTime = 0.001;
                    }
                    if (isNaN(parseFloat(msg.follow)) == false) {
                        if (msg.follow < -1) {
                            step.follow = -1;
                        } else {
                            step.follow = parseFloat(msg.follow);
                        }
                    }
                    if (changed == true) {
                        step.upStep = step.upTime * FPS;
                        step.downStep = step.downTime * FPS;
                    }
                    io.emit('sequences', { sequences: cleanSequences(), target: true });
                    saveShow();
                } else {
                    socket.emit('message', { type: "error", content: "This step doesn't exist!" });
                }
            } else {
                socket.emit('message', { type: "error", content: "This sequence doesn't exist!" });
            }
        } else {
            socket.emit('message', { type: "error", content: "No sequences exist!" });
        }
    });

    socket.on('removeGroup', function (groupID) {
        if (groups.length != 0) {
            if (groups.some(e => e.id === groupID)) {
                saveUndoRedo(false);
                let c = 0; const cMax = cues.length; for (; c < cMax; c++) {
                    if (cues[c].groups.some(e => e.id === groupID)) {
                        cues[c].groups.splice(cues[c].groups.map(el => el.id).indexOf(groupID), 1);
                    }
                }
                groups.splice(groups.map(el => el.id).indexOf(groupID), 1);
                socket.emit('message', { type: "info", content: "Group has been removed!" });
                io.emit('resetView', { type: 'groups', eid: groupID });
                io.emit('groups', { groups: cleanGroups(), target: true });
                saveShow();
            } else {
                socket.emit('message', { type: "error", content: "This group doesn't exist!" });
            }
        } else {
            socket.emit('message', { type: "error", content: "No groups exist!" });
        }
    });

    socket.on('removeSequence', function (sequenceID) {
        if (sequences.length != 0) {
            if (sequences.some(e => e.id === sequenceID)) {
                saveUndoRedo(false);
                let c = 0; const cMax = cues.length; for (; c < cMax; c++) {
                    if (cues[c].sequences.some(e => e.id === sequenceID)) {
                        cues[c].sequences.splice(cues[c].sequences.map(el => el.id).indexOf(sequenceID), 1);
                    }
                }
                sequences.splice(sequences.map(el => el.id).indexOf(sequenceID), 1);
                socket.emit('message', { type: "info", content: "Sequence has been removed!" });
                io.emit('resetView', { type: 'sequences', eid: sequenceID });
                io.emit('sequences', { sequences: cleanSequences(), target: true });
                saveShow();
            } else {
                socket.emit('message', { type: "error", content: "This sequence doesn't exist!" });
            }
        } else {
            socket.emit('message', { type: "error", content: "No sequences exist!" });
        }
    });

    socket.on('resetGroup', function (groupID) {
        if (groups.length != 0) {
            if (groups.some(e => e.id === groupID)) {
                saveUndoRedo(false);
                var group = groups[groups.map(el => el.id).indexOf(groupID)];
                group.hasActiveEffects = false;
                let c = 0; const cMax = group.parameters.length; for (; c < cMax; c++) {
                    group.parameters[c].value = group.parameters[c].home;
                    group.parameters[c].displayValue = cppaddon.mapRange(group.parameters[c].value, group.parameters[c].min, group.parameters[c].max, 0, 100);
                    setFixtureGroupValues(group, group.parameters[c]);
                }
                io.emit('groups', { groups: cleanGroups(), target: true });
                io.emit('fixtures', { fixtures: cleanFixtures(), target: false });
                socket.emit('message', { type: "info", content: "Group parameters reset!" });
                //saveShow();
            } else {
                socket.emit('message', { type: "error", content: "This group doesn't exist!" });
            }
        } else {
            socket.emit('message', { type: "error", content: "No groups exist!" });
        }
    });

    socket.on('removeGroupFixture', function (msg) {
        if (groups.length != 0) {
            if (groups.some(e => e.id === msg.group)) {
                saveUndoRedo(false);
                var group = groups[groups.map(el => el.id).indexOf(msg.group)];
                if (group.ids.some(e => e === msg.fixture)) {
                    group.ids.splice(group.ids.map(el => el).indexOf(msg.fixture), 1);
                    group.parameters = generateGroupParameters(group);
                    group.parameterTypes = [];
                    let c = 0; const cMax = group.parameters.length; for (; c < cMax; c++) {
                        if (group.parameters[c].type == 2) {
                            group.parameterTypes.push("Position");
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
                    let c = 0; const cMax = cues.length; for (; c < cMax; c++) {
                        if (cues[c].groups.some(e => e.id === msg.group)) {
                            cues[c].groups.splice(cues[c].groups.map(el => el.id).indexOf(msg.group), 1);
                        }
                    }
                    groups.splice(groups.map(el => el.id).indexOf(group.id), 1);
                    socket.emit('message', { type: "info", content: "Group has been removed!" });
                    io.emit('resetView', { type: 'groups', eid: group.id });
                }
                io.emit('groups', { groups: cleanGroups(), target: true });
                socket.emit('message', { type: "info", content: "Fixture removed from group!" });
                saveShow();
            } else {
                socket.emit('message', { type: "error", content: "This group doesn't exist!" });
            }
        } else {
            socket.emit('message', { type: "error", content: "No groups exist!" });
        }
    });

    socket.on('removeSequenceFixture', function (msg) {
        if (sequences.length != 0) {
            if (sequences.some(e => e.id === msg.sequence)) {
                saveUndoRedo(false);
                var sequence = sequences[sequences.map(el => el.id).indexOf(msg.sequence)];
                if (sequence.ids.some(e => e === msg.fixture)) {
                    sequence.ids.splice(sequence.ids.map(el => el).indexOf(msg.fixture), 1);
                }
                if (sequence.ids.length == 0) {
                    let c = 0; const cMax = cues.length; for (; c < cMax; c++) {
                        if (cues[c].sequences.some(e => e.id === msg.sequence)) {
                            cues[c].sequences.splice(cues[c].sequences.map(el => el.id).indexOf(msg.sequence), 1);
                        }
                    }
                    sequences.splice(sequences.map(el => el.id).indexOf(sequence.id), 1);
                    socket.emit('message', { type: "info", content: "Sequence has been removed!" });
                    io.emit('resetView', { type: 'sequences', eid: sequence.id });
                }
                io.emit('sequences', { sequences: cleanSequences(), target: true });
                socket.emit('message', { type: "info", content: "Fixture removed from sequence!" });
                saveShow();
            } else {
                socket.emit('message', { type: "error", content: "This sequence doesn't exist!" });
            }
        } else {
            socket.emit('message', { type: "error", content: "No sequences exist!" });
        }
    });

    socket.on('removeSequenceStep', function (msg) {
        if (sequences.length != 0) {
            if (sequences.some(e => e.id === msg.sequence)) {
                var sequence = sequences[sequences.map(el => el.id).indexOf(msg.sequence)];
                if (sequence.steps.some(e => e.id === msg.step)) {
                    saveUndoRedo(false);
                    sequence.steps.splice(sequence.steps.map(el => el.id).indexOf(msg.step), 1);
                }
                io.emit('sequences', { sequences: cleanSequences(), target: true });
                socket.emit('message', { type: "info", content: "Step removed from sequence!" });
                saveShow();
            } else {
                socket.emit('message', { type: "error", content: "This sequence doesn't exist!" });
            }
        } else {
            socket.emit('message', { type: "error", content: "No sequences exist!" });
        }
    });

    socket.on('updateSequenceStep', function (msg) {
        if (sequences.length != 0) {
            if (sequences.some(e => e.id === msg.sequence)) {
                var sequence = sequences[sequences.map(el => el.id).indexOf(msg.sequence)];
                if (sequence.steps.some(e => e.id === msg.step)) {
                    saveUndoRedo(false);
                    var step = sequence.steps[sequence.steps.map(el => el.id).indexOf(msg.step)];
                    step.fixtures = cleanFixturesForSequence();
                }
                io.emit('sequences', { sequences: cleanSequences(), target: true });
                socket.emit('message', { type: "info", content: "Step updated!" });
                saveShow();
            } else {
                socket.emit('message', { type: "error", content: "This sequence doesn't exist!" });
            }
        } else {
            socket.emit('message', { type: "error", content: "No sequences exist!" });
        }
    });

    socket.on('resetGroups', function () {
        if (groups.length != 0) {
            saveUndoRedo(false);
            resetGroups();
            io.emit('fixtures', { fixtures: cleanFixtures(), target: true });
            socket.emit('message', { type: "info", content: "Group values have been reset!" });
            //saveShow();
        } else {
            socket.emit('message', { type: "error", content: "No groups exist!" });
        }
    });

    socket.on('recordPreset', function (list) {
        if (fixtures.length != 0) {
            saveUndoRedo(false);
            var newPreset = {
                id: generateID(),
                name: "Preset " + (presets.length + 1),
                active: false,
                ids: list,
                intensity: 0,
                displayAsDimmer: false,
                patchChanged: false,
                mode: SETTINGS.defaultPresetMode,
                fixtures: cleanFixturesForPreset(list)
            };
            presets.push(newPreset);
            io.emit('presets', cleanPresets());
            socket.emit('message', { type: "info", content: "The preset has been recorded!" });
            savePresets();
        } else {
            socket.emit('message', { type: "error", content: "No fixtures exist!" });
        }
    });

    socket.on('addFixturesToPreset', function (msg) {
        if (fixtures.length > 0) {
            if (presets.length > 0) {
                if (msg.fixtures.length > 0) {
                    if (presets.some(e => e.id === msg.id)) {
                        saveUndoRedo(false);
                        var preset = presets[presets.map(el => el.id).indexOf(msg.id)];
                        let f = 0; const fMax = msg.fixtures.length; for (; f < fMax; f++) {
                            if (preset.ids.some(e => e === msg.fixtures[f]) == false) {
                                preset.ids.push(msg.fixtures[f]);
                            }
                        }
                        let fi = 0; const fiMax = fixtures.length; for (; fi < fiMax; fi++) {
                            if (msg.fixtures.some(e => e === fixtures[fi].id)) {
                                preset.fixtures.push(cleanFixtureForPreset(fixtures[fi]));
                            }
                        }
                        io.emit('presets', cleanPresets());
                        savePresets();
                    } else {
                        socket.emit('message', { type: "error", content: "This preset doesn't exist!" });
                    }
                } else {
                    socket.emit('message', { type: "error", content: "No fixtures selected!" });
                }
            } else {
                socket.emit('message', { type: "error", content: "No presets exist!" });
            }
        } else {
            socket.emit('message', { type: "error", content: "No fixtures exist!" });
        }
    });

    socket.on('updatePreset', function (presetID) {
        if (presets.length != 0) {
            if (presets.some(e => e.id === presetID)) {
                saveUndoRedo(false);
                var preset = presets[presets.map(el => el.id).indexOf(presetID)];
                let i = preset.ids.length;
                while (i--) {
                    if (fixtures.some(e => e.id === preset.ids[i]) == false) {
                        preset.fixtures.splice(preset.fixtures.map(el => el).indexOf(preset.ids[i]), 1);
                    }
                    if (fixtures.some(e => e.id === preset.ids[i]) == false) {
                        preset.ids.splice(preset.ids.map(el => el).indexOf(preset.ids[i]), 1);
                    }
                }
                if (preset.ids.length > 0) {
                    preset.fixtures = cleanFixturesForPreset(preset.ids);
                    preset.patchChanged = false;
                    socket.emit('message', { type: "info", content: "Preset parameters have been updated!" });
                } else {
                    presets.splice(presets.map(el => el.id).indexOf(preset.id), 1);
                    socket.emit('message', { type: "info", content: "Preset has been removed!" });
                    io.emit('resetView', { type: 'presets', eid: preset.id });
                }
                io.emit('presets', cleanPresets());
                savePresets();
            } else {
                socket.emit('message', { type: "error", content: "This preset doesn't exist!" });
            }
        } else {
            socket.emit('message', { type: "error", content: "No presets exist!" });
        }
    });

    socket.on('getPresetSettings', function (presetID) {
        if (presets.length != 0) {
            if (presets.some(e => e.id === presetID)) {
                socket.emit('presetSettings', presets[presets.map(el => el.id).indexOf(presetID)]);
            } else {
                socket.emit('message', { type: "error", content: "This preset doesn't exist!" });
            }
        } else {
            socket.emit('message', { type: "error", content: "No presets exist!" });
        }
    });

    socket.on('editPresetSettings', function (msg) {
        if (presets.length != 0) {
            if (presets.some(e => e.id === msg.id)) {
                var preset = presets[presets.map(el => el.id).indexOf(msg.id)];
                preset.name = msg.name;
                preset.displayAsDimmer = msg.displayAsDimmer;
                preset.mode = msg.mode;
                if (isNaN(parseInt(msg.intensity)) == false) {
                    var intensity = parseInt(msg.intensity);
                    if (intensity > 0) {
                        preset.active = true;
                    } else {
                        preset.active = false;
                    }
                    preset.intensity = intensity;
                }
                io.emit('presets', cleanPresets());
                savePresets();
            } else {
                socket.emit('message', { type: "error", content: "This preset doesn't exist!" });
            }
        } else {
            socket.emit('message', { type: "error", content: "No presets exist!" });
        }
    });

    socket.on('getPresetFixtures', function (presetID) {
        if (presets.length != 0) {
            if (presets.some(e => e.id === presetID)) {
                socket.emit('presetFixtures', getPresetFixtures(presetID));
            } else {
                socket.emit('message', { type: "error", content: "This preset doesn't exist!" });
            }
        } else {
            socket.emit('message', { type: "error", content: "No presets exist!" });
        }
    });

    socket.on('removePreset', function (presetID) {
        if (presets.length != 0) {
            if (presets.some(e => e.id === presetID)) {
                saveUndoRedo(false);
                presets.splice(presets.map(el => el.id).indexOf(presetID), 1);
                socket.emit('message', { type: "info", content: "Preset has been removed!" });
                io.emit('resetView', { type: 'presets', eid: presetID });
                io.emit('presets', cleanPresets());
                savePresets();
            } else {
                socket.emit('message', { type: "error", content: "This preset doesn't exist!" });
            }
        } else {
            socket.emit('message', { type: "error", content: "No presets exist!" });
        }
    });

    socket.on('removePresetFixture', function (msg) {
        if (presets.length != 0) {
            if (presets.some(e => e.id === msg.preset)) {
                saveUndoRedo(false);
                var preset = presets[presets.map(el => el.id).indexOf(msg.preset)];
                if (preset.fixtures.some(e => e === msg.fixture)) {
                    preset.fixtures.splice(preset.fixtures.map(el => el).indexOf(msg.fixture), 1);
                }
                if (preset.ids.some(e => e === msg.fixture)) {
                    preset.ids.splice(preset.ids.map(el => el).indexOf(msg.fixture), 1);
                }
                if (preset.ids.length == 0) {
                    presets.splice(presets.map(el => el.id).indexOf(preset.id), 1);
                    socket.emit('message', { type: "info", content: "Preset has been removed!" });
                    io.emit('resetView', { type: 'presets', eid: preset.id });
                } else {
                    var changed = false;
                    let i = 0; const iMax = preset.ids.length; for (; i < iMax; i++) {
                        if (fixtures.some(e => e.id === preset.ids[i]) == false) {
                            changed = true;
                        }
                    }
                    if (changed == false) {
                        preset.patchChanged = false;
                    } else {
                        preset.patchChanged = true;
                    }
                }
                io.emit('presets', cleanPresets());
                socket.emit('message', { type: "info", content: "Fixture removed from preset!" });
                savePresets();
            } else {
                socket.emit('message', { type: "error", content: "This preset doesn't exist!" });
            }
        } else {
            socket.emit('message', { type: "error", content: "No sequences exist!" });
        }
    });

    socket.on('changePresetActive', function (presetID) {
        if (presets.length != 0) {
            if (presets.some(e => e.id === presetID)) {
                var preset = presets[presets.map(el => el.id).indexOf(presetID)];
                preset.active = !preset.active;
                if (preset.active == true) {
                    preset.intensity = 100;
                } else {
                    preset.intensity = 0;
                }
                socket.emit('presetSettings', preset);
                io.emit('presets', cleanPresets());
                savePresets();
            } else {
                socket.emit('message', { type: "error", content: "This preset doesn't exist!" });
            }
        } else {
            socket.emit('message', { type: "error", content: "No presets exist!" });
        }
    });

    socket.on('changePresetIntensity', function (msg) {
        if (presets.length != 0) {
            if (presets.some(e => e.id === msg.presetID)) {
                var preset = presets[presets.map(el => el.id).indexOf(msg.presetID)];
                preset.intensity = parseInt(msg.intensity);
                if (preset.intensity == 0) {
                    preset.active = false;
                } else {
                    preset.active = true;
                }
                socket.broadcast.emit('presets', cleanPresets());
            } else {
                socket.emit('message', { type: "error", content: "This preset doesn't exist!" });
            }
        } else {
            socket.emit('message', { type: "error", content: "No presets exist!" });
        }
    });

    socket.on('toggleBlackout', function () {
        if (SETTINGS.blackoutEnabled == true) {
            blackout = !blackout;
        } else {
            blackout = false;
        }
        io.emit('blackout', blackout);
    });

    socket.on('changeGrandmasterValue', function (value) {
        grandmaster = parseInt(value);
        socket.broadcast.emit('grandmaster', grandmaster);
    });

    socket.on('getShowInfo', function () {
        var info = {
            fixtures: fixtures.length,
            cues: cues.length,
            sequences: sequences.length,
            groups: groups.length,
            showName: currentShowName,
            showLength: 0
        };
        let c = 0; const cMax = cues.length; for (; c < cMax; c++) {
            if (cues[c].upTime > cues[c].downTime) {
                info.showLength += cues[c].upTime;
            } else {
                info.showLength += cues[c].downTime;
            }
            if (cues[c].follow > 0) {
                info.showLength += cues[c].follow;
            }
        }
        info.showLength = Math.round(info.showLength);
        socket.emit('showInfo', info);
    });

    socket.on('editSettings', function (msg) {
        if (isNaN(parseFloat(msg.defaultUpTime)) == false) {
            SETTINGS.defaultUpTime = parseFloat(msg.defaultUpTime);
        }
        if (isNaN(parseFloat(msg.defaultDownTime)) == false) {
            SETTINGS.defaultDownTime = parseFloat(msg.defaultDownTime);
        }
        if (isNaN(parseInt(msg.sacnPriority)) == false) {
            SETTINGS.sacnPriority = parseInt(msg.sacnPriority);
            if (SETTINGS.sacnPriority < 1) {
                SETTINGS.sacnPriority = 1;
            } else if (SETTINGS.sacnPriority > 200) {
                SETTINGS.sacnPriority = 200;
            }
        }
        SETTINGS.defaultPresetMode = msg.defaultPresetMode;
        SETTINGS.interfaceMode = msg.interfaceMode;
        SETTINGS.udmx = msg.udmx;
        SETTINGS.automark = msg.automark;
        SETTINGS.blackoutEnabled = msg.blackoutEnabled;
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

    socket.on('editShowName', function (msg) {
        currentShowName = msg;
        saveShow();
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

    socket.on('saveShowToUSB', function () {
        saveShowToUSB(currentShowName, function (result) {
            if (!result) {
                socket.emit('message', { type: "error", content: "The show could not be saved! Is a USB connected?" });
            }
        });
    });
});
