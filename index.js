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
    desktop: false, // desktop vs embeded
    udmx: false,
    automark: true,
    displayEffectsRealtime: true,
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
            channels = slotsData;
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
    let i = 0; const iMax = newGroup.ids.length; for (; i < iMax; i++) {
        var fixture = fixtures[fixtures.map(el => el.id).indexOf(newGroup.ids[i])];
        let c = 0; const cMax = fixture.parameters.length; for (; c < cMax; c++) {
            var newParameter = JSON.parse(JSON.stringify(fixture.parameters[c]));
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
        delete newFixtures.effects;
        delete newFixtures.chips;
        let p = 0; const pMax = newFixtures[f].parameters.length; for (; p < pMax; p++) {
            delete newFixtures[f].parameters[p].home;
            delete newFixtures[f].parameters[p].coarse;
            newFixtures[f].parameters[p].displayValue = Math.round(newFixtures[f].parameters[p].displayValue);
        }
    }
    return newFixtures;
};

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
    newFixture.effects = cleanEffectsForCue(newFixture.effects);
    let p = 0; const pMax = newFixture.parameters.length; for (; p < pMax; p++) {
        delete newFixture.parameters[p].name;
        delete newFixture.parameters[p].displayValue;
        delete newFixture.parameters[p].home;
        delete newFixture.parameters[p].locked;
        delete newFixture.parameters[p].ranges;
        delete newFixture.parameters[p].highlight;
        delete newFixture.parameters[p].snap;
        delete newFixture.parameters[p].size;
    }
    return newFixture;
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
    return newFixtures;
};

function cleanGroups() {
    var newGroups = JSON.parse(JSON.stringify(groups));
    let g = 0; const gMax = newGroups.length; for (; g < gMax; g++) {
        delete newGroups[g].ids;
        let p = 0; const pMax = newGroups[g].parameters.length; for (; p < pMax; p++) {
            delete newGroups[g].parameters[p].max;
            delete newGroups[g].parameters[p].min;
            delete newGroups[g].parameters[p].home;
            delete newGroups[g].parameters[p].coarse;
        }
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
    }
    return newCues;
};

function cleanPresets() {
    var newPresets = JSON.parse(JSON.stringify(presets));
    let p = 0; const pMax = newPresets.length; for (; p < pMax; p++) {
        delete newPresets[p].parameters;
    }
    return newPresets;
};

function getGroupFixtures(groupID) {
    var group = groups[groups.map(el => el.id).indexOf(groupID)];
    var fixtureStarts = [];
    let i = 0; const iMax = group.ids.length; for (; i < iMax; i++) {
        var fixture = fixtures[fixtures.map(el => el.id).indexOf(group.ids[i])];
        fixtureStarts.push([fixture.name, fixture.startDMXAddress, fixture.id]);
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
    let f = 0; const fMax = fixtures.length; for (; f < fMax; f++) {
        let p = 0; const pMax = fixtures[f].parameters.length; for (; p < pMax; p++) {
            if (fixtures[f].parameters[p].fadeWithIntensity == true || fixtures[f].parameters[p].type == 1) {
                if (blackout === false) {
                    channels[(fixtures[f].startDMXAddress - 1) + fixtures[f].parameters[p].coarse] = ((fixtures[f].parameters[p].value >> 8) / 100.0) * grandmaster;
                    if (fixtures[f].parameters[p].fine != null) {
                        channels[(fixtures[f].startDMXAddress - 1) + fixtures[f].parameters[p].fine] = ((fixtures[f].parameters[p].value & 0xff) / 100.0) * grandmaster;
                    }
                } else {
                    channels[(fixtures[f].startDMXAddress - 1) + fixtures[f].parameters[p].coarse] = (fixtures[f].parameters[p].min >> 8);
                    if (fixtures[f].parameters[p].fine != null) {
                        channels[(fixtures[f].startDMXAddress - 1) + fixtures[f].parameters[p].fine] = (fixtures[f].parameters[p].min & 0xff);
                    }
                }
            } else {
                channels[(fixtures[f].startDMXAddress - 1) + fixtures[f].parameters[p].coarse] = (fixtures[f].parameters[p].value >> 8);
                if (fixtures[f].parameters[p].fine != null) {
                    channels[(fixtures[f].startDMXAddress - 1) + fixtures[f].parameters[p].fine] = (fixtures[f].parameters[p].value & 0xff);
                }
            }
        }
    }
};

function calculateChannelsList() {
    var chans = [];
    let f = 0; const fMax = fixtures.length; for (; f < fMax; f++) {
        let p = 0; const pMax = fixtures[f].parameters.length; for (; p < pMax; p++) {
            chans[(fixtures[f].startDMXAddress - 1) + fixtures[f].parameters[p].coarse] = (fixtures[f].parameters[p].value >> 8);
            if (fixtures[f].parameters[p].fine != null) {
                chans[(fixtures[f].startDMXAddress - 1) + fixtures[f].parameters[p].fine] = (fixtures[f].parameters[p].value & 0xff);
            }
        }
    }
    return chans;
};

// Set the cue's output channel values to the correct values from the fixtures. This is basically saving the cue.
function calculateCue(cue) {
    var outputChannels = new Array(512).fill(0);
    let f = 0; const fMax = cue.fixtures.length; for (; f < fMax; f++) {
        var startFixture = fixtures[fixtures.map(el => el.id).indexOf(cue.fixtures[f].id)];
        let e = 0; const eMax = cue.fixtures[f].effects.length; for (; e < eMax; e++) {
            if (startFixture.effects[e].id == cue.fixtures[f].effects[e].id) {
                startFixture.effects[e].fan = cue.fixtures[f].effects[e].fan;
                if (cue.fixtures[f].effects[e].active != startFixture.effects[e].active) {
                    startFixture.effects[e].step = startFixture.effects[e].fan;
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
                var startParameter = startFixture.parameters[c].value;
                var endParameter = cue.fixtures[f].parameters[c].value;
                // If the end parameter is greater than the start parameter, the value is going in, out is going out if less
                if (endParameter >= startParameter) {
                    // Make sure that the step does not dip below 0 (finished)
                    if (cue.upStep >= 0) {
                        if (cue.fixtures[f].parameters[c].fadeWithIntensity == true || cue.fixtures[f].parameters[c].type == 1) {
                            if (blackout === false) {
                                outputChannels[(cue.fixtures[f].startDMXAddress - 1) + cue.fixtures[f].parameters[c].coarse] = (((endParameter + (((startParameter - endParameter) / (cue.upTime * 40)) * cue.upStep)) >> 8) / 100.0) * grandmaster;
                                if (cue.fixtures[f].parameters[c].fine != null) {
                                    outputChannels[(cue.fixtures[f].startDMXAddress - 1) + cue.fixtures[f].parameters[c].fine] = (((endParameter + (((startParameter - endParameter) / (cue.upTime * 40)) * cue.upStep)) & 0xff) / 100.0) * grandmaster;
                                }
                            } else {
                                outputChannels[(cue.fixtures[f].startDMXAddress - 1) + cue.fixtures[f].parameters[c].coarse] = (startFixture.parameters[c].min >> 8);
                                if (cue.fixtures[f].parameters[c].fine != null) {
                                    outputChannels[(cue.fixtures[f].startDMXAddress - 1) + cue.fixtures[f].parameters[c].fine] = (startFixture.parameters[c].min & 0xff);
                                }
                            }
                        } else {
                            outputChannels[(cue.fixtures[f].startDMXAddress - 1) + cue.fixtures[f].parameters[c].coarse] = ((endParameter + (((startParameter - endParameter) / (cue.upTime * 40)) * cue.upStep)) >> 8);
                            if (cue.fixtures[f].parameters[c].fine != null) {
                                outputChannels[(cue.fixtures[f].startDMXAddress - 1) + cue.fixtures[f].parameters[c].fine] = ((endParameter + (((startParameter - endParameter) / (cue.upTime * 40)) * cue.upStep)) & 0xff);
                            }
                        }
                        fixtures[fixtures.map(el => el.id).indexOf(cue.fixtures[f].id)].parameters[c].displayValue = cppaddon.mapRange(cue.fixtures[f].parameters[c].value + (((startFixture.parameters[c].value - cue.fixtures[f].parameters[c].value) / (cue.upTime * 40)) * cue.upStep), cue.fixtures[f].parameters[c].min, cue.fixtures[f].parameters[c].max, 0, 100);
                    }
                } else {
                    // Make sure that the step does not dip below 0 (finished)
                    if (cue.downStep >= 0) {
                        if (cue.fixtures[f].parameters[c].fadeWithIntensity == true || cue.fixtures[f].parameters[c].type == 1) {
                            if (blackout === false) {
                                outputChannels[(cue.fixtures[f].startDMXAddress - 1) + cue.fixtures[f].parameters[c].coarse] = (((endParameter + (((startParameter - endParameter) / (cue.downTime * 40)) * cue.downStep)) >> 8) / 100.0) * grandmaster;
                                if (cue.fixtures[f].parameters[c].fine != null) {
                                    outputChannels[(cue.fixtures[f].startDMXAddress - 1) + cue.fixtures[f].parameters[c].fine] = (((endParameter + (((startParameter - endParameter) / (cue.downTime * 40)) * cue.downStep)) & 0xff) / 100.0) * grandmaster;
                                }
                            } else {
                                outputChannels[(cue.fixtures[f].startDMXAddress - 1) + cue.fixtures[f].parameters[c].coarse] = (startFixture.parameters[c].min >> 8);
                                if (cue.fixtures[f].parameters[c].fine != null) {
                                    outputChannels[(cue.fixtures[f].startDMXAddress - 1) + cue.fixtures[f].parameters[c].fine] = (startFixture.parameters[c].min & 0xff);
                                }
                            }
                        } else {
                            outputChannels[(cue.fixtures[f].startDMXAddress - 1) + cue.fixtures[f].parameters[c].coarse] = ((endParameter + (((startParameter - endParameter) / (cue.downTime * 40)) * cue.downStep)) >> 8);
                            if (cue.fixtures[f].parameters[c].fine != null) {
                                outputChannels[(cue.fixtures[f].startDMXAddress - 1) + cue.fixtures[f].parameters[c].fine] = ((endParameter + (((startParameter - endParameter) / (cue.downTime * 40)) * cue.downStep)) & 0xff);
                            }
                        }
                        fixtures[fixtures.map(el => el.id).indexOf(cue.fixtures[f].id)].parameters[c].displayValue = cppaddon.mapRange(cue.fixtures[f].parameters[c].value + (((startFixture.parameters[c].value - cue.fixtures[f].parameters[c].value) / (cue.downTime * 40)) * cue.downStep), cue.fixtures[f].parameters[c].min, cue.fixtures[f].parameters[c].max, 0, 100);
                    }
                }
            } else {
                var startParameter = startFixture.parameters[c].value;
                outputChannels[(cue.fixtures[f].startDMXAddress - 1) + cue.fixtures[f].parameters[c].coarse] = (startParameter >> 8);
                if (cue.fixtures[f].parameters[c].fine != null) {
                    outputChannels[(cue.fixtures[f].startDMXAddress - 1) + cue.fixtures[f].parameters[c].fine] = (startParameter & 0xff);
                }
            }
        }
    }
    return outputChannels;
};

function calculateStack() {
    // If there is a running cue
    if (currentCue != "") {
        // Get the current cue
        cue = cues[cues.map(el => el.id).indexOf(currentCue)];
        channels = calculateCue(cue);
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
            // Set the fixture's display and real values to the correct values from the cue
            let f = 0; const fMax = cue.fixtures.length; for (; f < fMax; f++) {
                var startFixtureParameters = fixtures[fixtures.map(el => el.id).indexOf(cue.fixtures[f].id)].parameters;
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
        }
        io.emit('fixtures', cleanFixtures());
    }
    if (blackout === false) {
        var displayChanged = false;
        let f = 0; const fMax = fixtures.length; for (; f < fMax; f++) {
            let e = 0; const eMax = fixtures[f].effects.length; for (; e < eMax; e++) {
                if (fixtures[f].effects[e].active == true) {
                    let p = 0; const pMax = fixtures[f].parameters.length; for (; p < pMax; p++) {
                        if (fixtures[f].parameters[p].locked === false) {
                            var effectChanIndex = fixtures[f].effects[e].parameterNames.findIndex(function (element) { return element == fixtures[f].parameters[p].name });
                            if (effectChanIndex > -1) {
                                var effectValue = fixtures[f].effects[e].steps[fixtures[f].effects[e].step][effectChanIndex];
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
                                if (fixtures[f].effects[e].resolution == 16) {
                                    channels[(fixtures[f].startDMXAddress - 1) + fixtures[f].parameters[p].coarse] = (effectValue >> 8);
                                    //channels[(fixtures[f].startDMXAddress - 1) + fixtures[f].parameters[p].coarse] = fixtures[f].effects[e].steps[fixtures[f].effects[e].step][effectChanIndex];
                                    if (fixtures[f].parameters[p].fine != null) {
                                        channels[(fixtures[f].startDMXAddress - 1) + fixtures[f].parameters[p].fine] = (effectValue & 0xff);
                                    }
                                } else if (fixtures[f].effects[e].resolution == 8) {
                                    channels[(fixtures[f].startDMXAddress - 1) + fixtures[f].parameters[p].coarse] = effectValue;
                                }
                            }

                        }
                    }
                    if (fixtures[f].effects[e].step + fixtures[f].effects[e].speed >= fixtures[f].effects[e].steps.length - 1) {
                        fixtures[f].effects[e].step = fixtures[f].effects[e].fan;
                    } else {
                        fixtures[f].effects[e].step = fixtures[f].effects[e].step + fixtures[f].effects[e].speed;
                    }
                }
            }
        }
        if (SETTINGS.displayEffectsRealtime === true) {
            if (displayChanged === true) {
                io.emit('fixtures', cleanFixtures());
            }
        }
    }
    // Allow presets to overide everything else for channels in which they have higher values
    let p = 0; const pMax = presets.length; for (; p < pMax; p++) {
        if (presets[p].active) {
            let c = 0; const cMax = presets[p].parameters.length; for (; c < cMax; c++) {
                if (presets[p].parameters[c] != null) {
                    var tempvalue = (presets[p].parameters[c] / 100.0) * presets[p].intensity;
                    if (tempvalue > channels[c]) {
                        channels[c] = tempvalue;
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
        let c = 0; const cMax = fixture.parameters.length; for (; c < cMax; c++) {
            if (fixture.parameters[c].name === parameter.name && fixture.parameters[c].type === parameter.type) {
                if (fixture.parameters[c].locked != true) {
                    fixture.parameters[c].value = parameter.value;
                    fixture.parameters[c].displayValue = cppaddon.mapRange(fixture.parameters[c].value, fixture.parameters[c].min, fixture.parameters[c].max, 0, 100);
                }
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
    slotsData = channels;
    client.send(packet);
    artnet.set(channels);
};

// Load the fixtures, cues, and groups from file
function openShow(file = "show.json") {
    fs.readFile(process.cwd() + '/' + file, (err, data) => {
        if (err) logError(err);
        let show = JSON.parse(data);
        fixtures = show[0];
        cues = show[1];
        groups = show[2];
        io.emit('fixtures', cleanFixtures());
        io.emit('activeCue', currentCueID);
        io.emit('cues', cleanCues());
        io.emit('groups', cleanGroups());
    });
};

// Save the fixtures, cues, and groups of the show to file
function saveShow() {
    fs.writeFile(process.cwd() + "/show.json", JSON.stringify([fixtures, cues, groups]), (err) => {
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
app.use('/v2/static', express.static(__dirname + '/tonalite-ui-2/static'));
app.use('/docs', express.static(__dirname + '/docs/dist'));

app.use(fileUpload());
app.use(compression());
app.use(favicon(__dirname + '/static/img/favicon.ico'));

app.get('/', function (req, res) {
    res.sendFile(__dirname + '/index.html');
});

app.get('/v2', function (req, res) {
    res.sendFile(__dirname + '/tonalite-ui-2/index.html');
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

    showFile.mv(process.cwd() + '/show.json', function (err) {
        if (err)
            return res.status(500).send(err);
        openShow();
        res.redirect('/');
    });
});

app.post('/importFixtureDefinition', (req, res) => {
    if (Object.keys(req.files).length == 0) {
        return res.status(400).send('No files were uploaded.');
    }
    let fixtureDefinition = req.files.fixtureDefinition;

    if (fixtureDefinition.mimetype == "application/json") {
        fixtureDefinition.mv(process.cwd() + '/fixtures/' + req.files.fixtureDefinition.name, function (err) {
            if (err)
                return res.status(500).send(err);
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
    socket.emit('fixtures', cleanFixtures());
    socket.emit('cues', cleanCues());
    socket.emit('groups', cleanGroups());
    socket.emit('presets', cleanPresets());
    socket.emit('blackout', blackout);
    socket.emit('grandmaster', grandmaster);

    QRCode.toDataURL(`http://${SETTINGS.url}:${SETTINGS.port}`, function (err, url) {
        socket.emit('meta', { desktop: SETTINGS.desktop, version: VERSION, qrcode: url, url: `http://${SETTINGS.url}:${SETTINGS.port}` });
    });


    if (currentCue === "") {
        socket.emit('cueActionBtn', false);
    } else {
        socket.emit('cueActionBtn', true);
    }

    socket.on('openShowFromUSB', function (data) {
        fs.copyFile(data[1] + '/' + data[0], process.cwd() + '/show.json', function (err) {
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
        fixtures = [];
        cues = [];
        groups = [];
        currentCue = "";
        lastCue = "";
        io.emit('fixtures', cleanFixtures());
        io.emit('activeCue', currentCueID);
        io.emit('cues', cleanCues());
        io.emit('groups', cleanGroups());
        io.emit('cueActionBtn', false);
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
            files.forEach(file => {
                var fixture = require(process.cwd() + "/fixtures/" + file);
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
            files.forEach(file => {
                var effect = require(process.cwd() + "/effects/" + file).effectTable;
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
            drivelist.list((error, drives) => {
                var done = false;
                if (error) {
                    logError(error);
                }
                drives.forEach((drive) => {
                    if (done == false) {
                        if (drive.enumerator == 'USBSTOR' || drive.isUSB === true) {
                            fs.readdir(drive.mountpoints[0].path, (err, files) => {
                                var showsList = [];
                                files.forEach(file => {
                                    if (file.slice(-8) === "tonalite") {
                                        showsList.push(file);
                                    }
                                });
                                socket.emit('shows', [showsList, drive.mountpoints[0].path]);
                            });
                            done = true;
                        }
                    }
                });
                if (done == false) {
                    socket.emit('message', { type: "error", content: "Shows could not be read of of a USB drive. Is there one connected?" });
                }
            });
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
            let i = 0; const iMax = parseInt(msg.creationCount); for (; i < iMax; i++) {
                // Add a fixture using the fixture spec file in the fixtures folder
                var fixture = require(process.cwd() + "/fixtures/" + msg.fixtureName);
                fixture = fixture.personalities[fixture.personalities.map(el => el.dcid).indexOf(msg.dcid)];
                fixture.startDMXAddress = startDMXAddress;
                fixture.dmxUniverse = 0;
                fixture.hasLockedParameters = false;
                fixture.hasActiveEffects = false;
                fixture.name = fixture.modelName;
                fixture.chips = [];
                fixture.effects = [];
                fixture.parameterTypes = [];

                if (fixture.colortable == "3874B444-A11E-47D9-8295-04556EAEBEA7") {
                    // RGB
                    colortable = JSON.parse(JSON.stringify(require(process.cwd() + "/chips/rgb.json")));
                    let col = 0; const colMax = colortable.length; for (; col < colMax; col++) {
                        var color = { color: colortable[col].color, parameters: [] };

                        color.parameters.push({ name: "Red", value: colortable[col].parameters[0] });
                        color.parameters.push({ name: "Green", value: colortable[col].parameters[1] });
                        color.parameters.push({ name: "Blue", value: colortable[col].parameters[2] });

                        fixture.chips.push(color);
                    }
                } else if (fixture.colortable == "77A82F8A-9B24-4C3F-98FC-B6A29FB1AAE6") {
                    // RGBW
                    colortable = JSON.parse(JSON.stringify(require(process.cwd() + "/chips/rgb.json")));
                    let col = 0; const colMax = colortable.length; for (; col < colMax; col++) {
                        var color = { color: colortable[col].color, parameters: [] };

                        w = Math.min(colortable[col].parameters[0], colortable[col].parameters[1], colortable[col].parameters[2]);

                        color.parameters.push({ name: "Red", value: colortable[col].parameters[0] - w });
                        color.parameters.push({ name: "Green", value: colortable[col].parameters[1] - w });
                        color.parameters.push({ name: "Blue", value: colortable[col].parameters[2] - w });
                        color.parameters.push({ name: "White", value: w });

                        fixture.chips.push(color);
                    }
                } else if (fixture.colortable == "D3E71EC8-3406-4572-A64C-52A38649C795") {
                    // RGBA
                    colortable = JSON.parse(JSON.stringify(require(process.cwd() + "/chips/rgb.json")));
                    let col = 0; const colMax = colortable.length; for (; col < colMax; col++) {
                        var color = { color: colortable[col].color, parameters: [] };

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
                    colortable = JSON.parse(JSON.stringify(require(process.cwd() + "/chips/rgb.json")));
                    let col = 0; const colMax = colortable.length; for (; col < colMax; col++) {
                        var color = { color: colortable[col].color, parameters: [] };

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
                    colortable = JSON.parse(JSON.stringify(require(process.cwd() + "/chips/rgb.json")));
                    let col = 0; const colMax = colortable.length; for (; col < colMax; col++) {
                        var color = { color: colortable[col].color, parameters: [] };

                        color.parameters.push({ name: "Cyan", value: 100 - colortable[col].parameters[0] });
                        color.parameters.push({ name: "Magenta", value: 100 - colortable[col].parameters[1] });
                        color.parameters.push({ name: "Yellow", value: 100 - colortable[col].parameters[2] });

                        fixture.chips.push(color);
                    }
                }
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
            io.emit('fixtures', cleanFixtures());
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
                    }
                }
                var fixture = fixtures[fixtures.map(el => el.id).indexOf(fixtureID)];
                let cc = 0; const ccMax = fixture.parameters.length; for (; cc < ccMax; cc++) {
                    fixture.parameters[cc][(fixture.startDMXAddress - 1) + fixture.parameters[cc].coarse] = 0;
                }
                fixtures.splice(fixtures.map(el => el.id).indexOf(fixtureID), 1);
                socket.emit('message', { type: "info", content: "Fixture has been removed!" });
                io.emit('resetView', { type: 'fixtures', eid: fixtureID });
                io.emit('fixtures', cleanFixtures());
                io.emit('activeCue', currentCueID);
                io.emit('cues', cleanCues());
                saveShow();
            }
        } else {
            socket.emit('message', { type: "error", content: "No fixtures exist!" });
        }
    });

    socket.on('removeEffect', function (msg) {
        if (fixtures.length != 0) {
            if (fixtures.some(e => e.id === msg.fixtureID)) {
                let c = 0; const cMax = cues.length; for (; c < cMax; c++) {
                    if (cues[c].fixtures.some(e => e.id === msg.fixtureID)) {
                        var fixture = cues[c].fixtures[cues[c].fixtures.map(el => el.id).indexOf(msg.fixtureID)];
                        if (fixture.effects.some(e => e.id === msg.effectID)) {
                            fixture.effects.splice(fixture.effects.map(el => el.id).indexOf(msg.effectID), 1);
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
                    io.emit('fixtures', cleanFixtures());
                    io.emit('resetView', { type: 'effect', eid: msg.effectID });
                    socket.emit('message', { type: "info", content: "Fixture effect has been removed!" });
                    saveShow();
                }
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
                }
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
                fixture.startDMXAddress = parseInt(msg.startDMXAddress);
                socket.emit('message', { type: "info", content: "Fixture settings have been updated!" });
                io.emit('fixtures', cleanFixtures());
                saveShow();
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
                    effect.fan = parseInt(msg.fan);
                    socket.broadcast.emit('effectSettings', { fixtureID: fixture.id, effect: fixture.effects[fixture.effects.map(el => el.id).indexOf(msg.effectID)] });
                    socket.emit('message', { type: "info", content: "Effect settings have been updated!" });
                    io.emit('fixtures', cleanFixtures());
                    saveShow();
                }
            }
        } else {
            socket.emit('message', { type: "error", content: "No fixtures exist!" });
        }
    });

    socket.on('getFixtureParameters', function (fixtureID) {
        if (fixtures.length != 0) {
            if (fixtures.some(e => e.id === fixtureID)) {
                socket.emit('fixtureParameters', fixtures[fixtures.map(el => el.id).indexOf(fixtureID)]);
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
            io.emit('fixtures', cleanFixtures());
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
                io.emit('fixtures', cleanFixtures());
                socket.emit('message', { type: "info", content: "Fixture values reset!" });
                saveShow();
            }
        } else {
            socket.emit('message', { type: "error", content: "No fixtures exist!" });
        }
    });

    socket.on('changeFixtureParameterValue', function (msg) {
        if (fixtures.length != 0) {
            if (fixtures.some(e => e.id === msg.id)) {
                var fixture = fixtures[fixtures.map(el => el.id).indexOf(msg.id)];
                var parameter = fixture.parameters[msg.pid];
                parameter.value = parseInt(msg.value);
                parameter.displayValue = cppaddon.mapRange(parameter.value, parameter.min, parameter.max, 0, 100);
                io.emit('fixtures', cleanFixtures());
            }
        } else {
            socket.emit('message', { type: "error", content: "No fixtures exist!" });
        }
    });

    socket.on('changeFixtureParameterLock', function (msg) {
        if (fixtures.length != 0) {
            if (fixtures.some(e => e.id === msg.id)) {
                var fixture = fixtures[fixtures.map(el => el.id).indexOf(msg.id)];
                var parameter = fixture.parameters[msg.pid];
                parameter.locked = !parameter.locked;
                fixture.hasLockedParameters = false;
                let c = 0; const cMax = fixture.parameters.length; for (; c < cMax; c++) {
                    if (fixture.parameters[c].locked) {
                        fixture.hasLockedParameters = true;
                    }
                }
                io.emit('fixtures', cleanFixtures());
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
                io.emit('fixtures', cleanFixtures());
            }
        } else {
            socket.emit('message', { type: "error", content: "No fixtures exist!" });
        }
    });

    socket.on('useParameterRange', function (msg) {
        if (fixtures.length != 0) {
            if (fixtures.some(e => e.id === msg.id)) {
                var fixture = fixtures[fixtures.map(el => el.id).indexOf(msg.id)];
                var parameter = fixture.parameters[msg.pid];
                var range = parameter.ranges[msg.rid];
                fixture.parameters[msg.pid].value = cppaddon.mapRange(range.default, 0, 255, parameter.min, parameter.max);
                fixture.parameters[msg.pid].displayValue = cppaddon.mapRange(fixture.parameters[msg.pid].value, fixture.parameters[msg.pid].min, fixture.parameters[msg.pid].max, 0, 100);;
                io.emit('fixtures', cleanFixtures());
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
                    effect.step = effect.fan;
                    effect.active = !effect.active;
                    fixture.hasActiveEffects = checkFixtureActiveEffects(fixture.effects);
                    if (effect.active == false) {
                        let p = 0; const pMax = fixture.parameters.length; for (; p < pMax; p++) {
                            fixture.parameters[p].displayValue = cppaddon.mapRange(fixture.parameters[p].value, fixture.parameters[p].min, fixture.parameters[p].max, 0, 100);
                        }
                    }
                    io.emit('fixtures', cleanFixtures());
                    saveShow();
                }
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
                effect.speed = 1;
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
                let cc = 0; const ccMax = cues.length; for (; cc < ccMax; cc++) {
                    let f = 0; const fMax = cues[cc].fixtures.length; for (; f < fMax; f++) {
                        if (cues[cc].fixtures[f].id == fixture.id) {
                            var topush = cleanEffectForCue(effect);
                            topush.active = false;
                            cues[cc].fixtures[f].effects.push(topush);
                        }
                    }
                }
                fixture.hasActiveEffects = true;
                saveShow();
                socket.emit('message', { type: "info", content: "Effect has been added to fixture!" });
                io.emit('fixtures', cleanFixtures());
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
                fixtures: cleanFixturesForCue()
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
                io.emit('activeCue', currentCueID);
                io.emit('cues', cleanCues());
                socket.emit('message', { type: "info", content: "Cue parameters have been updated!" });
                saveShow();
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
            }
        } else {
            socket.emit('message', { type: "error", content: "No cues exist!" });
        }
    });

    socket.on('getCueSettings', function (cueID) {
        if (cues.length != 0) {
            if (cues.some(e => e.id === cueID)) {
                socket.emit('cueSettings', cues[cues.map(el => el.id).indexOf(cueID)]);
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
                socket.emit('message', { type: "info", content: "Cue settings have been updated!" });
                io.emit('activeCue', currentCueID);
                io.emit('cues', cleanCues());
                saveShow();
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
            let f = 0; const fMax = fixtures.length; for (; f < fMax; f++) {
                var fixtureParameters = fixtures[fixtures.map(el => el.id).indexOf(fixtures[f].id)].parameters;
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
            let f = 0; const fMax = fixtures.length; for (; f < fMax; f++) {
                var fixtureParameters = fixtures[fixtures.map(el => el.id).indexOf(fixtures[f].id)].parameters;
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
            let f = 0; const fMax = fixtures.length; for (; f < fMax; f++) {
                var fixtureParameters = fixtures[fixtures.map(el => el.id).indexOf(fixtures[f].id)].parameters;
                let c = 0; const cMax = fixtures[f].parameters.length; for (; c < cMax; c++) {
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
            let f = 0; const fMax = fixtures.length; for (; f < fMax; f++) {
                var fixtureParameters = fixtures[fixtures.map(el => el.id).indexOf(fixtures[f].id)].parameters;
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

    socket.on('addGroup', function (fixtureIDs) {
        if (fixtureIDs.length > 0) {
            var newGroup = {
                id: generateID(),
                name: "Group " + (groups.length + 1),
                ids: fixtureIDs,
                parameters: []
            };
            newGroup.parameters = generateGroupParameters(newGroup);
            groups.push(newGroup);
            io.emit('groups', cleanGroups());
            saveShow();
        } else {
            socket.emit('message', { type: "error", content: "No fixtures selected!" });
        }
    });

    socket.on('getGroupParameters', function (groupID) {
        if (groups.length != 0) {
            var group = groups[groups.map(el => el.id).indexOf(groupID)];
            let c = 0; const cMax = group.parameters.length; for (; c < cMax; c++) {
                var valAvg = 0;
                var valAvgCount = 0;
                let i = 0; const iMax = group.ids.length; for (; i < iMax; i++) {
                    var fixture = fixtures[fixtures.map(el => el.id).indexOf(group.ids[i])];
                    let fc = 0; const fcMax = fixture.parameters.length; for (; fc < fcMax; fc++) {
                        if (fixture.parameters[fc].name === group.parameters[c].name && fixture.parameters[fc].type === group.parameters[c].type) {
                            valAvg = valAvg + fixture.parameters[fc].value;
                            valAvgCount++;
                        }
                    }
                }
                group.parameters[c].value = valAvg / valAvgCount;
            }
            socket.emit('groupParameters', { id: group.id, name: group.name, parameters: group.parameters });
        } else {
            socket.emit('message', { type: "error", content: "No groups exist!" });
        }
    });

    socket.on('changeGroupParameterValue', function (msg) {
        if (fixtures.length != 0 && groups.length != 0) {
            var group = groups[groups.map(el => el.id).indexOf(msg.id)];
            var parameter = group.parameters[msg.pid];
            parameter.value = parseInt(msg.value);
            parameter.displayValue = cppaddon.mapRange(parameter.value, parameter.min, parameter.max, 0, 100);
            setFixtureGroupValues(group, parameter);
            io.emit('fixtures', cleanFixtures());
        } else {
            socket.emit('message', { type: "error", content: "No fixtures and/or groups exist!" });
        }
    });

    socket.on('getGroupSettings', function (groupID) {
        if (groups.length != 0) {
            socket.emit('groupSettings', { group: groups[groups.map(el => el.id).indexOf(groupID)], groupFixtures: getGroupFixtures(groupID) });
        } else {
            socket.emit('message', { type: "error", content: "No groups exist!" });
        }
    });

    socket.on('editGroupSettings', function (msg) {
        if (groups.length != 0) {
            var group = groups[groups.map(el => el.id).indexOf(msg.id)];
            group.name = msg.name;
            socket.emit('groupSettings', { group: group, groupFixtures: getGroupFixtures(group.id) });
            socket.emit('message', { type: "info", content: "Group settings have been updated!" });
            io.emit('groups', cleanGroups());
            saveShow();
        } else {
            socket.emit('message', { type: "error", content: "No groups exist!" });
        }
    });

    socket.on('removeGroup', function (groupID) {
        if (groups.length != 0) {
            groups.splice(groups.map(el => el.id).indexOf(groupID), 1);
            socket.emit('message', { type: "info", content: "Group has been removed!" });
            io.emit('groups', cleanGroups());
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
            socket.emit('groupParameters', { id: group.id, name: group.name, parameters: group.parameters });
            io.emit('fixtures', cleanFixtures());
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
            }
            socket.emit('groupSettings', { group: group, groupFixtures: getGroupFixtures(group.id) });
            socket.emit('message', { type: "info", content: "Fixture removed from group!" });
            saveShow();
        } else {
            socket.emit('message', { type: "error", content: "No groups exist!" });
        }
    });

    socket.on('resetGroups', function () {
        if (groups.length != 0) {
            resetGroups();
            io.emit('fixtures', cleanFixtures());
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
            preset.fixtures = JSON.parse(JSON.stringify(fixtures));
            socket.emit('presetSettings', preset);
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
            socket.emit('presetSettings', preset);
            socket.emit('message', { type: "info", content: "Preset settings have been updated!" });
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
            socket.emit('presets', cleanPresets());
            io.emit('presets', cleanPresets());
        } else {
            socket.emit('message', { type: "error", content: "No presets exist!" });
        }
    });

    socket.on('changePresetIntensity', function (settings) {
        if (presets.length != 0) {
            var preset = presets[presets.map(el => el.id).indexOf(settings.presetID)];
            var intensity = parseInt(settings.intensity);
            if (intensity > 0) {
                preset.active = true;
            } else {
                preset.active = false;
            }
            preset.intensity = intensity;
            socket.emit('presetSettings', preset);
            socket.emit('presets', cleanPresets());
            io.emit('presets', cleanPresets());
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

    socket.on('getSettings', function () {
        socket.emit('settings', SETTINGS);
    });

    socket.on('closeSettings', function () {
        if (saveSettings()) {
            socket.emit('message', { type: "info", content: "The Tonalite settings have been saved! Reboot if you changed the IP or uDMX settings." });
        } else {
            socket.emit('message', { type: "error", content: "The Tonalite settings file could not be saved on disk." });
        }
    });

    socket.on('saveSettings', function (msg) {
        SETTINGS.defaultUpTime = parseInt(msg.defaultUpTime);
        SETTINGS.defaultDownTime = parseInt(msg.defaultDownTime);
        SETTINGS.udmx = msg.udmx;
        SETTINGS.automark = msg.automark;
        if (msg.artnetIP != "") {
            SETTINGS.artnetIP = msg.artnetIP;
        } else {
            SETTINGS.artnetIP = null;
        }
        if (msg.sacnIP != "") {
            SETTINGS.sacnIP = msg.sacnIP;
        } else {
            SETTINGS.sacnIP = null;
        }
        if (saveSettings() == false) {
            socket.emit('message', { type: "error", content: "The Tonalite settings file could not be saved on disk." });
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

    socket.on('updateFixtureProfiles', function () {
        fs.readdir(process.cwd() + "/fixtures", (err, files) => {
            files.forEach(file => {
                var fixtureProfile = require(process.cwd() + "/fixtures/" + file);
                fixtures.forEach(function (fixture) {
                    if (fixture.dcid == fixtureProfile.dcid) {
                        fixture.manufacturerName = fixtureProfile.manufacturerName;
                        fixture.maxOffset = fixtureProfile.maxOffset;
                        fixture.parameters = fixtureProfile.parameters;
                        let c = 0; const cMax = fixture.parameters.length; for (; c < cMax; c++) {
                            fixture.parameters[c].value = fixture.parameters[c].home;
                            fixture.parameters[c].displayValue = cppaddon.mapRange(fixture.parameters[c].home, fixture.parameters[c].min, fixture.parameters[c].max, 0, 100);
                        }
                    }
                });
            });
        });
        groups.forEach(function (group) {
            group.parameters = [];
            var parameterCats = [];
            group.ids.forEach(function (fixtureID) {
                var fixture = fixtures[fixtures.map(el => el.id).indexOf(fixtureID)];
                fixture.parameters.forEach(function (parameter) {
                    var newParameter = JSON.parse(JSON.stringify(parameter));
                    if (!parameterCats.includes(newParameter.name + ":" + newParameter.type)) {
                        newParameter.value = newParameter.home;
                        group.parameters.push(newParameter);
                        parameterCats.push(newParameter.name + ":" + newParameter.type);
                    }
                });
            });
        });
        saveShow();
    });

    socket.on('shutdown', function () {
        if (SETTINGS.desktop === true) {
            if (SETTINGS.udmx === true) {
                cp.kill();
            }
            process.exit();
        }
    });

    socket.on('reboot', function () {
        var cp = spawn('reboot');
    });

    socket.on('saveShowToUSB', function (showName) {
        drivelist.list((error, drives) => {
            var done = false;
            if (error) {
                logError(error);
            }

            drives.forEach((drive) => {
                if (done == false) {
                    if (drive.enumerator == 'USBSTOR' || drive.isUSB === true) {
                        var filepath = drive.mountpoints[0].path + "/" + showName + ".tonalite";
                        fs.exists(filepath, function (exists) {
                            if (exists) {
                                socket.emit('message', { type: "error", content: "A show file with that name already exists!" });
                            } else {
                                fs.writeFile(filepath, JSON.stringify([fixtures, cues, groups]), (err) => {
                                    if (err) {
                                        logError(err);
                                        done = false;
                                        socket.emit('message', { type: "error", content: "The current show could not be saved onto a USB drive. Is there one connected?" });
                                    };
                                    socket.emit('message', { type: "info", content: "The current show was successfully saved to the connected USB drive!" });
                                });
                            }
                        });
                    }
                }
            });
        });
    });
});
