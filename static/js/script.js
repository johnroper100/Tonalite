var socket = io('http://' + document.domain + ':' + location.port);
var store;

Vue.use(VueTouchKeyboard);
var app = new Vue({
    el: '#app',
    data: {
        currentView: 'fixtures',
        fixtureParametersTab: 'all',
        cuesTab: 'cues',
        desktop: false,
        showInfo: {},
        fixtures: [],
        groups: [],
        cues: [],
        sequences: [],
        colorPalettes: [],
        positionPalettes: [],
        presets: [],
        cuePlaying: false,
        activeCue: "",
        blackout: false,
        grandmaster: 100,
        fixtureProfiles: {},
        effectProfiles: [],
        startDMXAddress: 1,
        newFixtureCreationCount: 1,
        newFixtureUniverse: 0,
        fixtureProfilesSearch: "",
        currentCue: {},
        currentSequence: {},
        currentPreset: {},
        currentFixture: {},
        version: "",
        currentEffect: {},
        addGroupSelected: [],
        addSequenceSelected: [],
        addPresetSelected: [],
        currentGroup: {},
        currentGroupFixtures: {},
        currentPresetFixtures: {},
        currentSequenceFixtures: {},
        usbData: [],
        usbPath: "",
        settings: {},
        qrcode: "",
        url: "",
        fixtureProfilesManufacturer: "",
        fixtureProfilesModel: "",
        settingsModalTab: "ui",
        addPaletteName: "",
        removePositionPalette: false,
        removeColorPalette: false,
        keyboardVisible: false,
        keyboardLayout: "normal",
        keyboardInput: null,
        keyboardOptions: {
            useKbEvents: true,
            preventClickEvent: true
        },
        cueProgress: 0,
        midiEnabled: false,
        selectedMIDIInput: "",
        midiInputDevice: null,
        midiInputDevices: [],
        midiCommands: [],
        showMIDIControlInput: false,
        midiLearn: false,
        midiPatchParamToControl: "",
        midiPatchParamNumber: 1,
        midiPatchMustBeOnParamPage: true,
        midiPatchMessageType: "",
        midiPatchMessageNote: 61,
        midiPatchMessageControl: 0,
        midiPatchMessageChannel: 1,
        midiPatchMessageVelocity: 127,
        midiPatchUseVelocity: false
    },
    components: {
        Multiselect: window.VueMultiselect.default
    },
    computed: {
        filteredFixtureProfilesList() {
            if (this.isEmpty(this.fixtureProfiles) == false) {
                if (app.fixtureProfilesManufacturer != "") {
                    if (app.fixtureProfilesModel != "") {
                        return {
                            'objs': this.fixtureProfiles[app.fixtureProfilesManufacturer][app.fixtureProfilesModel].filter(profile => {
                                return profile.modeName.toLowerCase().includes(this.fixtureProfilesSearch.toLowerCase());
                            }), 'type': 'modes'
                        };
                    } else {
                        var keys = Object.keys(this.fixtureProfiles[app.fixtureProfilesManufacturer]);
                        return {
                            'objs': keys.filter(profile => {
                                return profile.toLowerCase().includes(this.fixtureProfilesSearch.toLowerCase());
                            }), 'type': 'models'
                        };
                    }
                } else {
                    var keys = Object.keys(this.fixtureProfiles);
                    return {
                        'objs': keys.filter(profile => {
                            return profile.toLowerCase().includes(this.fixtureProfilesSearch.toLowerCase());
                        }), 'type': 'manufacturers'
                    };
                }
            } else {
                return { 'objs': [], 'type': 'manufacturers' };
            }
        }
    },
    methods: {
        generateID: function () {
            return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
        },
        keyboardAccept: function (text) {
            app.hideKeyboard();
        },
        showKeyboard: function (e) {
            if (app.settings.desktop == false && isMobile.any == false) {
                app.keyboardInput = e.target;
                app.keyboardLayout = e.target.dataset.layout;
                app.keyboardVisible = true;
            }
        },
        hideKeyboard: function () {
            app.keyboardVisible = false;
        },
        setFixtureProfilesSelection: function (obj, type) {
            if (type == 'manufacturers') {
                app.fixtureProfilesManufacturer = obj;
            } else if (type == 'models') {
                app.fixtureProfilesModel = obj;
            }
            app.fixtureProfilesSearch = "";
        },
        clearFixtureProfilesSelection: function (type) {
            if (type == 'manufacturers') {
                app.fixtureProfilesManufacturer = "";
                app.fixtureProfilesModel = "";
            } else if (type == 'models') {
                app.fixtureProfilesModel = "";
            }
            app.fixtureProfilesSearch = "";
        },
        isEmpty: function (obj) {
            for (var key in obj) {
                if (obj.hasOwnProperty(key))
                    return false;
            }
            return true;
        },
        mapRange: function (num, inMin, inMax, outMin, outMax) {
            return (num - inMin) * (outMax - outMin) / (inMax - inMin) + outMin;
        },
        launchFullScreen: function () {
            var element = document.documentElement;
            if (element.requestFullScreen) {
                element.requestFullScreen();
            } else if (element.mozRequestFullScreen) {
                element.mozRequestFullScreen();
            } else if (element.webkitRequestFullScreen) {
                element.webkitRequestFullScreen();
            } else if (element.msRequestFullScreen) {
                element.msRequestFullScreen();
            } else {
                element.webkitEnterFullScreen();
            }
        },
        ifMobile: function () {
            return isMobile.any;
        },
        resetShow: function () {
            bootbox.confirm("Are you sure you want a new show? This will reset everything.", function (result) {
                if (result === true) {
                    socket.emit("resetShow");
                }
            });
        },
        resetShowAndPatch: function () {
            bootbox.confirm("Are you sure you want a new show? This will reset everything (including the patch).", function (result) {
                if (result === true) {
                    socket.emit("resetShowAndPatch");
                }
            });
        },
        resetPresets: function () {
            bootbox.confirm("Are you sure you want to reset the presets?", function (result) {
                if (result === true) {
                    socket.emit("resetPresets");
                    app.currentView = "presets";
                }
            });
        },
        resetFixtures: function () {
            bootbox.confirm("Are you sure you want to reset all fixture parameter values?", function (result) {
                if (result === true) {
                    socket.emit("resetFixtures");
                }
            });
        },
        resetFixturesIntensity: function () {
            bootbox.confirm("Are you sure you want to reset all fixture intensity values?", function (result) {
                if (result === true) {
                    socket.emit("resetFixturesIntensity");
                }
            });
        },
        resetGroups: function () {
            bootbox.confirm("Are you sure you want to reset all group parameter values?", function (result) {
                if (result === true) {
                    socket.emit("resetGroups");
                }
            });
        },
        recordCue: function () {
            if (app.cuePlaying == false) {
                socket.emit("recordCue");
            }
        },
        recordSequenceStep: function () {
            socket.emit("recordSequenceStep", app.currentSequence.id);
        },
        nextCue: function () {
            socket.emit("nextCue");
        },
        lastCue: function () {
            socket.emit("lastCue");
        },
        stopCue: function () {
            socket.emit("stopCue");
        },
        recordPreset: function () {
            var list = [];
            let f = 0; const fMax = app.addPresetSelected.length; for (; f < fMax; f++) {
                list.push(app.addPresetSelected[f].id);
            }
            socket.emit('recordPreset', list);
            app.addPresetSelected = [];
            $('#addPresetModal').modal("hide");
        },
        addFixturesToPreset: function () {
            var list = [];
            let f = 0; const fMax = app.addPresetSelected.length; for (; f < fMax; f++) {
                list.push(app.addPresetSelected[f].id);
            }
            socket.emit('addFixturesToPreset', { id: app.currentPreset.id, fixtures: list });
            app.addPresetSelected = [];
            $('#addFixturesToPresetModal').modal("hide");
        },
        addFixturesToSequence: function () {
            var list = [];
            let f = 0; const fMax = app.addSequenceSelected.length; for (; f < fMax; f++) {
                list.push(app.addSequenceSelected[f].id);
            }
            socket.emit('addFixturesToSequence', { id: app.currentSequence.id, fixtures: list });
            app.addSequenceSelected = [];
            $('#addFixturesToSequenceModal').modal("hide");
        },
        toggleBlackout: function () {
            socket.emit("toggleBlackout");
        },
        updateFirmware: function () {
            socket.emit("updateFirmware");
        },
        importFixturesFromUSB: function () {
            socket.emit("importFixturesFromUSB");
        },
        changeGrandMasterValue: function () {
            socket.emit("changeGrandmasterValue", app.grandmaster);
        },
        getFixtureProfiles: function () {
            socket.emit("getFixtureProfiles");
            app.newFixtureCreationCount = 1;
            app.newFixtureUniverse = 0;
            app.fixtureProfilesSearch = "";
            app.fixtureProfilesManufacturer = "";
            app.fixtureProfilesModel = "";
            $('#fixtureProfilesModal').modal('show');
        },
        addFixture: function (fixture, dcid) {
            socket.emit("addFixture", { fixtureName: fixture, dcid: dcid, startDMXAddress: app.startDMXAddress, creationCount: app.newFixtureCreationCount, universe: app.newFixtureUniverse });
            app.fixtureProfilesManufacturer = "";
            app.fixtureProfilesModel = "";
            $('#fixtureProfilesModal').modal("hide");
            //app.fixtureProfiles = {}; // maybe re-enable to save browser memory
        },
        getFixtureParameters: function (fixtureID, resetTab) {
            socket.emit("getFixtureParameters", fixtureID);
            if (resetTab == true) {
                app.fixtureParametersTab = 'all';
            }
        },
        getGroupParameters: function (groupID, resetTab) {
            socket.emit("getGroupParameters", groupID);
            if (resetTab == true) {
                app.fixtureParametersTab = 'all';
            }
        },
        getSequenceParameters: function (sequenceID) {
            socket.emit("getSequenceParameters", sequenceID);
        },
        getGroupFixtures: function (groupID) {
            socket.emit("getGroupFixtures", groupID);
        },
        getPresetFixtures: function (presetID) {
            socket.emit("getPresetFixtures", presetID);
        },
        getSequenceFixtures: function (sequenceID) {
            socket.emit("getSequenceFixtures", sequenceID);
        },
        getCueSettings: function (cueID) {
            socket.emit("getCueSettings", cueID);
        },
        getPresetSettings: function (presetID) {
            app.getPresetFixtures(presetID);
            socket.emit("getPresetSettings", presetID);
        },
        changeFixtureParameterValue: function (parameter) {
            socket.emit("changeFixtureParameterValue", { id: app.currentFixture.id, pid: parameter.id, value: parameter.value })
            parameter.displayValue = parseInt(app.mapRange(parameter.value, parameter.min, parameter.max, 0, 100));
        },
        changeFixtureIntensityValue: function (id, value) {
            socket.emit("changeFixtureIntensityValue", { id: id, value: value })
        },
        changeGroupParameterValue: function (parameter) {
            socket.emit("changeGroupParameterValue", { id: app.currentGroup.id, pid: parameter.id, value: parameter.value })
            parameter.displayValue = parseInt(app.mapRange(parameter.value, parameter.min, parameter.max, 0, 100));
        },
        changeFixtureParameterLock: function (param) {
            socket.emit("changeFixtureParameterLock", { id: app.currentFixture.id, pid: param.id })
        },
        useFixtureParameterRange: function (param, rid) {
            socket.emit('useFixtureParameterRange', { id: app.currentFixture.id, pid: param.id, rid: rid });
        },
        useGroupParameterRange: function (param, rid) {
            if (param.locked == false) {
                socket.emit('useGroupParameterRange', { id: app.currentGroup.id, pid: param.id, rid: rid });
            }
        },
        changeGroupParameterLock: function (param) {
            socket.emit("changeGroupParameterLock", { id: app.currentGroup.id, pid: param.id })
        },
        useFixtureColorPalette: function (pid) {
            if (app.removeColorPalette == false) {
                socket.emit('useColorPalette', { id: app.currentFixture.id, pid: pid, type: 'fixture', colorType: 'palette' });
            } else {
                bootbox.confirm("Are you sure you want to remove this color palette?", function (result) {
                    if (result === true) {
                        socket.emit('removeColorPalette', { pid: pid });
                    }
                    app.removeColorPalette = false;
                });
            }
        },
        useFixturePositionPalette: function (pid) {
            if (app.removePositionPalette == false) {
                socket.emit('usePositionPalette', { id: app.currentFixture.id, pid: pid, type: 'fixture' });
            } else {
                bootbox.confirm("Are you sure you want to remove this position palette?", function (result) {
                    if (result === true) {
                        socket.emit('removePositionPalette', { pid: pid });
                    }
                    app.removePositionPalette = false;
                });
            }
        },
        useGroupColorPalette: function (pid) {
            if (app.removeColorPalette == false) {
                socket.emit('useColorPalette', { id: app.currentGroup.id, pid: pid, type: 'group', colorType: 'palette' });
            } else {
                bootbox.confirm("Are you sure you want to remove this color palette?", function (result) {
                    if (result === true) {
                        socket.emit('removeColorPalette', { pid: pid });
                    }
                    app.removeColorPalette = false;
                });
            }
        },
        useGroupPositionPalette: function (pid) {
            if (app.removePositionPalette == false) {
                socket.emit('usePositionPalette', { id: app.currentGroup.id, pid: pid, type: 'group' });
            } else {
                bootbox.confirm("Are you sure you want to remove this position palette?", function (result) {
                    if (result === true) {
                        socket.emit('removePositionPalette', { pid: pid });
                    }
                    app.removePositionPalette = false;
                });
            }
        },
        changeFixtureEffectState: function (eid) {
            socket.emit('changeFixtureEffectState', { id: app.currentFixture.id, effectid: eid })
        },
        resetFixture: function () {
            bootbox.confirm("Are you sure you want to reset this fixture's parameter values?", function (result) {
                if (result === true) {
                    socket.emit('resetFixture', app.currentFixture.id);
                }
            });
        },
        resetGroup: function () {
            bootbox.confirm("Are you sure you want to reset this group's parameter values?", function (result) {
                if (result === true) {
                    socket.emit('resetGroup', app.currentGroup.id);
                }
            });
        },
        editFixtureSettings: function () {
            if (app.currentFixture.name != "" && app.currentFixture.shortName != "" && isNaN(parseFloat(app.currentFixture.startDMXAddress)) == false && isNaN(parseFloat(app.currentFixture.dmxUniverse)) == false) {
                socket.emit('editFixtureSettings', { id: app.currentFixture.id, shortName: app.currentFixture.shortName, name: app.currentFixture.name, startDMXAddress: app.currentFixture.startDMXAddress, dmxUniverse: app.currentFixture.dmxUniverse, invertPan: app.currentFixture.invertPan, invertTilt: app.currentFixture.invertTilt, swapPanTilt: app.currentFixture.swapPanTilt });
            }
        },
        editFixtureEffectSettings: function () {
            if (app.currentEffect.name != "" && isNaN(parseFloat(app.currentEffect.depth)) == false && isNaN(parseFloat(app.currentEffect.speed)) == false) {
                socket.emit('editFixtureEffectSettings', { fixtureID: app.currentFixture.id, effectID: app.currentEffect.id, name: app.currentEffect.name, depth: app.currentEffect.depth, speed: app.currentEffect.speed });
            }
        },
        editCueSettings: function () {
            if (isNaN(parseFloat(app.currentCue.upTime)) == false && isNaN(parseFloat(app.currentCue.downTime)) == false && isNaN(parseFloat(app.currentCue.follow)) == false && app.currentCue.name != "") {
                socket.emit('editCueSettings', { id: app.currentCue.id, upTime: app.currentCue.upTime, downTime: app.currentCue.downTime, name: app.currentCue.name, follow: app.currentCue.follow, includeIntensityColor: app.currentCue.includeIntensityColor, includePosition: app.currentCue.includePosition, includeBeam: app.currentCue.includeBeam });
            }
        },
        editPresetSettings: function () {
            if (app.currentPreset.name != "") {
                socket.emit('editPresetSettings', { id: app.currentPreset.id, name: app.currentPreset.name, displayAsDimmer: app.currentPreset.displayAsDimmer, intensity: app.currentPreset.intensity, mode: app.currentPreset.mode });
            }
        },
        updatePreset: function () {
            bootbox.confirm("Are you sure you want to update this preset? It may remove the preset if the fixtures it stores doen't exist in the patch.", function (result) {
                if (result === true) {
                    socket.emit('updatePreset', app.currentPreset.id);
                }
            });
        },
        editGroupSettings: function () {
            if (app.currentGroup.name != "") {
                socket.emit('editGroupSettings', { id: app.currentGroup.id, name: app.currentGroup.name });
            }
        },
        editSequenceSettings: function () {
            if (app.currentSequence.name != "") {
                socket.emit('editSequenceSettings', { id: app.currentSequence.id, name: app.currentSequence.name, active: app.currentSequence.active, includeIntensityColor: app.currentSequence.includeIntensityColor, includePosition: app.currentSequence.includePosition, includeBeam: app.currentSequence.includeBeam });
            }
        },
        editSequenceStepSettings: function (step) {
            if (isNaN(parseFloat(step.upTime)) == false && isNaN(parseFloat(step.downTime)) == false && isNaN(parseFloat(step.follow)) == false) {
                socket.emit('editSequenceStepSettings', { sequence: app.currentSequence.id, step: step.id, upTime: step.upTime, downTime: step.downTime, follow: step.follow });
            }
        },
        removeFixture: function () {
            bootbox.confirm("Are you sure you want to delete this fixture?", function (result) {
                if (result === true) {
                    app.currentView = 'fixtures';
                    socket.emit('removeFixture', app.currentFixture.id);
                }
            });
        },
        removeCue: function () {
            bootbox.confirm("Are you sure you want to delete this cue?", function (result) {
                if (result === true) {
                    app.currentView = 'cues';
                    socket.emit('removeCue', app.currentCue.id);
                }
            });
        },
        gotoCue: function () {
            socket.emit('gotoCue', app.currentCue.id);
        },
        gotoCueInstant: function () {
            socket.emit('gotoCueInstant', app.currentCue.id);
        },
        gotoSpecificCue: function (index) {
            if (app.cues.length - 1 >= index) {
                socket.emit('gotoCue', app.cues[index].id);
            }
        },
        moveCueUp: function () {
            socket.emit('moveCueUp', app.currentCue.id);
        },
        moveCueDown: function () {
            socket.emit('moveCueDown', app.currentCue.id);
        },
        cloneCueNext: function () {
            socket.emit('cloneCueNext', app.currentCue.id);
        },
        cloneCueEnd: function () {
            socket.emit('cloneCueEnd', app.currentCue.id);
        },
        updateCue: function () {
            bootbox.confirm("Are you sure you want to update this cue?", function (result) {
                if (result === true) {
                    socket.emit('updateCue', app.currentCue.id);
                }
            });
        },
        getFixtureEffects: function () {
            socket.emit('getFixtureEffects', app.currentFixture.id);
            $('#fixtureAddEffectsModal').modal('show');
        },
        addFixtureEffect: function (file, type) {
            var paramName = "";
            if (type == 'Parameter') {
                paramName = $("#fixtureEffectParametersList").val()
            }
            socket.emit('addFixtureEffect', { fixtureID: app.currentFixture.id, effectFile: file, parameterName: paramName });
            $('#fixtureAddEffectsModal').modal("hide");
        },
        getFixtureEffectSettings: function (effectID) {
            socket.emit('getFixtureEffectSettings', { fixtureID: app.currentFixture.id, effectID: effectID });
            app.currentView = 'fixtureEffectSettings';
        },
        removeFixtureEffect: function () {
            bootbox.confirm("Are you sure you want to delete this effect?", function (result) {
                if (result === true) {
                    app.currentView = 'fixtureParameters';
                    socket.emit('removeFixtureEffect', { fixtureID: app.currentFixture.id, effectID: app.currentEffect.id });
                }
            });
        },
        setParameterValue(param, value, type) {
            if (param.locked == false) {
                param.value = value;
            }
            if (type == 'fixture') {
                app.changeFixtureParameterValue(param);
            } else if (type == 'group') {
                if (param.locked == false) {
                    app.changeGroupParameterValue(param);
                }
            }
        },
        changePresetActive() {
            socket.emit('changePresetActive', app.currentPreset.id);
        },
        removePreset: function () {
            bootbox.confirm("Are you sure you want to delete this preset?", function (result) {
                if (result === true) {
                    app.currentView = 'presets';
                    socket.emit('removePreset', app.currentPreset.id);
                }
            });
        },
        getParameterTabType: function (param) {
            if (app.fixtureParametersTab == 'position') {
                if (param.type == 2) {
                    return true;
                }
            } else if (app.fixtureParametersTab == 'color') {
                if (param.type == 5) {
                    return true;
                }
            } else if (app.fixtureParametersTab == 'beam') {
                if (param.type == 4) {
                    return true;
                }
            } else if (app.fixtureParametersTab == 'all') {
                return true;
            }
            return false;
        },
        addGroupModal: function () {
            app.addGroupSelected = [];
            $('#addGroupModal').modal('show');
        },
        addFixturesToGroupModal: function () {
            app.addGroupSelected = [];
            $('#addFixturesToGroupModal').modal('show');
        },
        addSequenceModal: function () {
            app.addSequenceSelected = [];
            $('#addSequenceModal').modal('show');
        },
        addPresetModal: function () {
            app.addPresetSelected = [];
            $('#addPresetModal').modal('show');
        },
        addFixturesToPresetModal: function () {
            app.addPresetSelected = [];
            $('#addFixturesToPresetModal').modal('show');
        },
        addFixturesToSequenceModal: function () {
            app.addSequenceSelected = [];
            $('#addFixturesToSequenceModal').modal('show');
        },
        addPositionPaletteModal: function () {
            if (app.removePositionPalette == false) {
                app.addPaletteName = "";
                $('#addPositionPaletteModal').modal('show');
            }
        },
        addColorPaletteModal: function () {
            if (app.removeColorPalette == false) {
                app.addPaletteName = "";
                $('#addColorPaletteModal').modal('show');
            }
        },
        addGroup: function () {
            var list = [];
            let f = 0; const fMax = app.addGroupSelected.length; for (; f < fMax; f++) {
                list.push(app.addGroupSelected[f].id);
            }
            socket.emit('addGroup', list);
            app.addGroupSelected = [];
            $('#addGroupModal').modal("hide");
        },
        addFixturesToGroup: function () {
            var list = [];
            let f = 0; const fMax = app.addGroupSelected.length; for (; f < fMax; f++) {
                list.push(app.addGroupSelected[f].id);
            }
            socket.emit('addFixturesToGroup', { id: app.currentGroup.id, fixtures: list });
            app.addGroupSelected = [];
            $('#addFixturesToGroupModal').modal("hide");
        },
        addSequence: function () {
            var list = [];
            let f = 0; const fMax = app.addSequenceSelected.length; for (; f < fMax; f++) {
                list.push(app.addSequenceSelected[f].id);
            }
            socket.emit('addSequence', list);
            app.addSequenceSelected = [];
            $('#addSequenceModal').modal("hide");
        },
        addPositionPalette: function () {
            if (app.currentView == 'fixtureParameters' && app.isEmpty(app.currentFixture) == false) {
                socket.emit('addPositionPalette', { type: 'fixture', id: app.currentFixture.id, name: app.addPaletteName });
            }
            if (app.currentView == 'groupParameters' && app.isEmpty(app.currentGroup) == false) {
                socket.emit('addPositionPalette', { type: 'group', id: app.currentGroup.id, name: app.addPaletteName });
            }
            app.addPaletteName = "";
            $('#addPositionPaletteModal').modal("hide");
        },
        addColorPalette: function () {
            if (app.currentView == 'fixtureParameters' && app.isEmpty(app.currentFixture) == false) {
                socket.emit('addColorPalette', { type: 'fixture', id: app.currentFixture.id, name: app.addPaletteName });
            }
            app.addPaletteName = "";
            $('#addColorPaletteModal').modal("hide");
        },
        getGroupSettings: function () {
            app.getGroupFixtures(app.currentGroup.id);
            app.currentView = 'groupSettings';
        },
        getSequenceSettings: function () {
            app.getSequenceFixtures(app.currentSequence.id);
            app.currentView = 'sequenceSettings';
        },
        removeGroup: function () {
            bootbox.confirm("Are you sure you want to delete this group?", function (result) {
                if (result === true) {
                    app.currentView = 'groups';
                    socket.emit('removeGroup', app.currentGroup.id);
                }
            });
        },
        removeSequence: function () {
            bootbox.confirm("Are you sure you want to delete this sequence?", function (result) {
                if (result === true) {
                    app.currentView = 'cues';
                    app.cuesTab = 'sequences';
                    socket.emit('removeSequence', app.currentSequence.id);
                }
            });
        },
        removeGroupFixture: function (fixtureID) {
            bootbox.confirm("Are you sure you want remove this fixture from the group?", function (result) {
                if (result === true) {
                    socket.emit('removeGroupFixture', { group: app.currentGroup.id, fixture: fixtureID });
                }
            });
        },
        removePresetFixture: function (fixtureID) {
            bootbox.confirm("Are you sure you want remove this fixture from the preset?", function (result) {
                if (result === true) {
                    socket.emit('removePresetFixture', { preset: app.currentPreset.id, fixture: fixtureID });
                }
            });
        },
        removeSequenceFixture: function (fixtureID) {
            bootbox.confirm("Are you sure you want remove this fixture from the sequence?", function (result) {
                if (result === true) {
                    socket.emit('removeSequenceFixture', { sequence: app.currentSequence.id, fixture: fixtureID });
                }
            });
        },
        removeSequenceStep: function (stepID) {
            bootbox.confirm("Are you sure you want remove this step from the sequence?", function (result) {
                if (result === true) {
                    socket.emit('removeSequenceStep', { sequence: app.currentSequence.id, step: stepID });
                }
            });
        },
        updateSequenceStep: function (stepID) {
            bootbox.confirm("Are you sure you want to update this step in the sequence?", function (result) {
                if (result === true) {
                    socket.emit('updateSequenceStep', { sequence: app.currentSequence.id, step: stepID });
                }
            });
        },
        getShowsFromUSB: function () {
            socket.emit('getShowsFromUSB');
        },
        openShowFromUSB: function (file) {
            socket.emit('openShowFromUSB', { file: file, path: app.usbPath });
            $('#showFilesModal').modal("hide");
        },
        saveShowToUSB: function () {
            socket.emit('saveShowToUSB');
        },
        calculateParamName: function (param, flipPanTilt) {
            if (param.type == 2 && param.name == "Pan" && flipPanTilt == true) {
                return "Tilt";
            } else if (param.type == 2 && param.name == "Tilt" && flipPanTilt == true) {
                return "Pan";
            } else {
                return param.name;
            }
        },
        editSettings: function () {
            socket.emit('editSettings', { defaultUpTime: app.settings.defaultUpTime, defaultDownTime: app.settings.defaultDownTime, defaultPresetMode: app.settings.defaultPresetMode, udmx: app.settings.udmx, automark: app.settings.automark, displayEffectsRealtime: app.settings.displayEffectsRealtime, artnetIP: app.settings.artnetIP, artnetHost: app.settings.artnetHost, sacnIP: app.settings.sacnIP, interfaceMode: app.settings.interfaceMode, blackoutEnabled: app.settings.blackoutEnabled, sacnPriority: app.settings.sacnPriority });
        },
        getShowInfo: function () {
            socket.emit('getShowInfo');
        },
        customMultiselectLabel({ name, startDMXAddress }) {
            return `${name} (${startDMXAddress})`
        },
        editShowName: function () {
            if (app.showInfo.showName != "") {
                socket.emit('editShowName', app.showInfo.showName);
            }
        },
        undo: function () {
            socket.emit('undo');
        },
        redo: function () {
            socket.emit('redo');
        },
        exportErrorLogsToUSB: function () {
            socket.emit('exportErrorLogsToUSB');
        },
        shutdown: function () {
            bootbox.confirm("Are you sure you want to shutdown the console?", function (result) {
                if (result === true) {
                    socket.emit('shutdown');
                }
            });
        },
        onColorChange: function (color, changes) {
            if (app.currentView == 'fixtureParameters') {
                socket.emit('useColorPalette', { id: app.currentFixture.id, color: color.rgb, type: 'fixture', colorType: 'wheel' });
            } else if (app.currentView == 'groupParameters') {
                socket.emit('useColorPalette', { id: app.currentGroup.id, color: color.rgb, type: 'group', colorType: 'wheel' });
            }
        },
        onJoystickChange: function (x, y) {
            if (app.currentView == 'fixtureParameters') {
                socket.emit('usePositionJoystick', { id: app.currentFixture.id, type: 'fixture', x: x, y: y });
            } else if (app.currentView == 'groupParameters') {
                socket.emit('usePositionJoystick', { id: app.currentGroup.id, type: 'group', x: x, y: y });
            }
        },
        patchMIDIControlFromLearn: function (e) {
            app.midiPatchMessageType = e.type;
            app.midiPatchMessageChannel = e.channel;
            if (e.type == "controlchange") {
                app.midiPatchMessageControl = e.controller.number;
            } else {
                app.midiPatchMessageNote = e.note.number;
                app.midiPatchMessageVelocity = e.rawVelocity;
            }
        },
        patchMIDIControl: function () {
            if (app.midiPatchParamToControl != "") {
                if (app.midiPatchMessageType == "controlchange") {
                    app.midiCommands.push({ id: app.generateID, command: app.midiPatchParamToControl, number: app.midiPatchParamNumber, mustBeOnParamPage: app.midiPatchMustBeOnParamPage, type: app.midiPatchMessageType, channel: app.midiPatchMessageChannel, note: null, control: app.midiPatchMessageControl, velocity: null, useVelocity: null });
                } else {
                    app.midiCommands.push({ id: app.generateID, command: app.midiPatchParamToControl, number: app.midiPatchParamNumber, mustBeOnParamPage: app.midiPatchMustBeOnParamPage, type: app.midiPatchMessageType, channel: app.midiPatchMessageChannel, control: null, note: app.midiPatchMessageNote, velocity: app.midiPatchMessageVelocity, useVelocity: app.midiPatchUseVelocity });
                }
                store.set('midiCommands', JSON.stringify(app.midiCommands));
            }
        },
        removeMIDICommand: function (id) {
            if (app.midiCommands.length != 0) {
                if (app.midiCommands.some(e => e.id === id)) {
                    app.midiCommands.splice(app.midiCommands.map(el => el.id).indexOf(id), 1);
                    store.set('midiCommands', JSON.stringify(app.midiCommands));
                }
            }
        },
        doMIDIAction: function (e) {
            var commands = [];
            if (e.type == 'controlchange') {
                commands = app.midiCommands.filter(c => c.type == e.type && c.channel == e.channel && c.control == e.controller.number);
            } else {
                commands = app.midiCommands.filter(c => c.type == e.type && c.channel == e.channel && c.note == e.note.number);
            }
            let p = 0; const pMax = commands.length; for (; p < pMax; p++) {
                if ((commands[p].useVelocity == true && commands[p].velocity == e.rawVelocity) || commands[p].useVelocity == false || commands[p].useVelocity == null) {
                    if (commands[p].command == 'nextCue') {
                        app.nextCue();
                    } else if (commands[p].command == 'lastCue') {
                        app.lastCue();
                    } else if (commands[p].command == 'stopCue') {
                        app.stopCue();
                    } else if (commands[p].command == 'recordCue') {
                        app.recordCue();
                    } else if (commands[p].command == 'toggleBlackout') {
                        app.toggleBlackout();
                    } else if (commands[p].command == 'resetFixturesIntensity') {
                        app.resetFixturesIntensity();
                    } else if (commands[p].command == 'resetFixtures') {
                        app.resetFixtures();
                    } else if (commands[p].command == 'resetGroups') {
                        app.resetGroups();
                    } else if (commands[p].command == 'resetFixture') {
                        if (app.currentView == "fixtureParameters" && app.currentFixture != {}) {
                            app.resetFixture();
                        }
                    } else if (commands[p].command == 'resetGroup') {
                        if (app.currentView == "groupParameters" && app.currentGrou != {}) {
                            app.resetGroup();
                        }
                    } else if (commands[p].command == 'shutdown') {
                        app.shutdown();
                    } else if (commands[p].command == 'grandmaster') {
                        if (e.type == 'controlchange') {
                            app.grandmaster = app.mapRange(e.value, 0, 127, 0, 100);
                            app.changeGrandMasterValue();
                        }
                    } else if (commands[p].command == 'fixtureIntensity') {
                        if (e.type == 'controlchange') {
                            if (app.fixtures.length >= commands[0].number) {
                                var fixture = app.fixtures[commands[0].number - 1];
                                if (commands[0].mustBeOnParamPage == true && app.currentView == "fixtures") {
                                    app.changeFixtureIntensityValue(fixture.id, app.mapRange(e.value, 0, 127, 0, 65535));
                                } else if (commands[0].mustBeOnParamPage == false) {
                                    app.changeFixtureIntensityValue(fixture.id, app.mapRange(e.value, 0, 127, 0, 65535));
                                }
                            }
                        }
                    } else if (commands[p].command == 'fixtureParameter') {
                        if (e.type == 'controlchange') {
                            if (app.currentFixture != {} && app.currentFixture != null) {
                                if (app.currentFixture.parameters.length >= commands[0].number) {
                                    var param = app.currentFixture.parameters[commands[0].number - 1];
                                    if (commands[0].mustBeOnParamPage == true && app.currentView == "fixtureParameters") {
                                        param.value = app.mapRange(e.value, 0, 127, 0, 65535);
                                        app.changeFixtureParameterValue(param);
                                    } else if (commands[0].mustBeOnParamPage == false) {
                                        param.value = app.mapRange(e.value, 0, 127, 0, 65535);
                                        app.changeFixtureParameterValue(param);
                                    }
                                }
                            }
                        }
                    } else if (commands[p].command == 'fixtureParameterLock') {
                        if (app.currentFixture != {} && app.currentFixture != null) {
                            if (app.currentFixture.parameters.length >= commands[0].number) {
                                var param = app.currentFixture.parameters[commands[0].number - 1];
                                if (commands[0].mustBeOnParamPage == true && app.currentView == "fixtureParameters") {
                                    app.changeFixtureParameterLock(param);
                                } else if (commands[0].mustBeOnParamPage == false) {
                                    app.changeFixtureParameterLock(param);
                                }
                            }
                        }
                    }
                }
            }
        },
        setMIDIInput: function () {
            if (app.selectedMIDIInput != "") {
                store.set('selectedMIDIInput', app.selectedMIDIInput);
                app.midiInputDevice = WebMidi.getInputByName(app.selectedMIDIInput);
                if (app.midiInputDevice != null && app.midiInputDevice != false) {
                    app.midiInputDevice.addListener('noteon', "all", function (e) {
                        if (app.midiLearn == true) {
                            app.midiLearn = false;
                            app.patchMIDIControlFromLearn(e);
                        } else {
                            app.doMIDIAction(e);
                        }
                    });
                    app.midiInputDevice.addListener('noteoff', "all", function (e) {
                        if (app.midiLearn == true) {
                            app.midiLearn = false;
                            app.patchMIDIControlFromLearn(e);
                        } else {
                            app.doMIDIAction(e);
                        }
                    });
                    app.midiInputDevice.addListener('controlchange', "all", function (e) {
                        if (app.midiLearn == true) {
                            app.midiLearn = false;
                            app.patchMIDIControlFromLearn(e);
                        } else {
                            app.doMIDIAction(e);
                        }
                    });
                }
            }
        }
    }
});
Mousetrap.bind('r', function (e) {
    if (e.preventDefault) {
        e.preventDefault();
    } else {
        // internet explorer
        e.returnValue = false;
    }
    app.recordCue();
});
Mousetrap.bind('end', function (e) {
    if (e.preventDefault) {
        e.preventDefault();
    } else {
        // internet explorer
        e.returnValue = false;
    }
    app.stopCue();
});
Mousetrap.bind('home', function (e) {
    if (e.preventDefault) {
        e.preventDefault();
    } else {
        // internet explorer
        e.returnValue = false;
    }
    app.gotoSpecificCue(0);
});
Mousetrap.bind('pageup', function (e) {
    if (e.preventDefault) {
        e.preventDefault();
    } else {
        // internet explorer
        e.returnValue = false;
    }
    app.nextCue();
});
Mousetrap.bind('pagedown', function (e) {
    if (e.preventDefault) {
        e.preventDefault();
    } else {
        // internet explorer
        e.returnValue = false;
    }
    app.lastCue();
});
Mousetrap.bind('ctrl+alt+n', function (e) {
    if (e.preventDefault) {
        e.preventDefault();
    } else {
        // internet explorer
        e.returnValue = false;
    }
    app.resetShow();
});
Mousetrap.bind('shift+a', function (e) {
    if (e.preventDefault) {
        e.preventDefault();
    } else {
        // internet explorer
        e.returnValue = false;
    }
    app.currentView = 'fixtures';
    app.getFixtureProfiles();
});
Mousetrap.bind('ctrl+s', function (e) {
    if (e.preventDefault) {
        e.preventDefault();
    } else {
        // internet explorer
        e.returnValue = false;
    }
    window.location = "/showFile";
});
Mousetrap.bind('right', function (e) {
    if (e.preventDefault) {
        e.preventDefault();
    } else {
        // internet explorer
        e.returnValue = false;
    }
    if (app.currentView == 'fixtures' || app.currentView == 'fixtureParameters' || app.currentView == 'fixtureSettings') {
        app.currentView = 'cues';
        app.cuesTab = 'cues';
    } else if ((app.currentView == 'cues' || app.currentView == 'cueSettings') && app.cuesTab == 'cues') {
        app.cuesTab = 'sequences';
        if (app.currentView == 'cueSettings') {
            app.currentView = 'cues';
        }
    } else if ((app.currentView == 'cues' || app.currentView == 'sequencParameters' || app.currentView == 'sequenceSettings') && app.cuesTab == 'sequences') {
        app.cuesTab = 'cues';
        app.currentView = 'groups';
    } else if (app.currentView == 'groups' || app.currentView == 'groupParameters' || app.currentView == 'groupSettings') {
        app.currentView = 'presets';
    } else if (app.currentView == 'presets' || app.currentView == 'presetSettings') {
        app.currentView = 'fixtures';
    }
});
Mousetrap.bind('left', function (e) {
    if (e.preventDefault) {
        e.preventDefault();
    } else {
        // internet explorer
        e.returnValue = false;
    }
    if (app.currentView == 'fixtures' || app.currentView == 'fixtureParameters' || app.currentView == 'fixtureSettings') {
        app.currentView = 'presets';
    } else if (app.currentView == 'cues' && app.cuesTab == 'cues') {
        app.currentView = 'fixtures';
    } else if (app.currentView == 'cues' && app.cuesTab == 'sequences') {
        app.cuesTab = 'cues';
    } else if (app.currentView == 'groups' || app.currentView == 'groupParameters' || app.currentView == 'groupSettings') {
        app.currentView = 'cues';
        app.cuesTab = 'sequences';
    } else if (app.currentView == 'presets' || app.currentView == 'presetSettings') {
        app.currentView = 'groups';
    }
});
Mousetrap.bind('ctrl+z', function (e) {
    if (e.preventDefault) {
        e.preventDefault();
    } else {
        // internet explorer
        e.returnValue = false;
    }
    app.undo();
});
Mousetrap.bind('ctrl+y', function (e) {
    if (e.preventDefault) {
        e.preventDefault();
    } else {
        // internet explorer
        e.returnValue = false;
    }
    app.redo();
});

WebMidi.enable(function (err) {
    if (err) {
        console.log("WebMidi could not be enabled.", err);
    } else {
        app.midiEnabled = true;
        app.midiInputDevices = WebMidi.inputs;
        app.selectedMIDIInput = WebMidi.inputs[0].name;
        store = new Persist.Store('Tonalite');
        var midiInput = store.get('selectedMIDIInput');
        if (midiInput != null && midiInput != "") {
            app.selectedMIDIInput = midiInput;
            app.setMIDIInput();
        }
        var cmds = store.get('midiCommands');
        if (cmds != null && cmds != "") {
            app.midiCommands = JSON.parse(cmds);
        }
    }
});

var colorPicker = new iro.ColorPicker('#color-picker-container', {
    display: 'inline-block'
});
colorPicker.on('color:change', app.onColorChange);

var joystick = new VirtualJoystick({
    container: document.getElementById('joystick-container'),
    mouseSupport: true,
    limitStickTravel: true,
    stationaryBase: true,
    baseX: 225,
    baseY: 200,
    stickRadius: 200
});

var timer;
document.getElementById("joystick-container").addEventListener("mousedown", function () {
    if (joystick._pressed == true) {
        timer = setInterval(function () {
            app.onJoystickChange(joystick.deltaX(), joystick.deltaY());
        }, 100);
    }
});

document.getElementById("joystick-container").addEventListener("mouseup", function () {
    if (timer) clearInterval(timer)
});

document.getElementById("joystick-container").addEventListener("touchstart", function () {
    if (joystick._pressed == true) {
        timer = setInterval(function () {
            app.onJoystickChange(joystick.deltaX(), joystick.deltaY());
        }, 100);
    }
});

document.getElementById("joystick-container").addEventListener("touchend", function () {
    if (timer) clearInterval(timer)
});

socket.on('connect', function () {
    app.currentView = 'fixtures';
    app.fixtureProfiles = {};
    app.fixtureParametersTab = 'all';
    app.cuesTab = 'cues';
    app.settingsModalTab = "ui";
    app.addGroupSelected = [];
    app.addPresetSelected = [];
    app.addSequenceSelected = [];
    app.startDMXAddress = 1;
    app.newFixtureCreationCount = 1;
    app.newFixtureUniverse = 0;
    app.fixtureProfilesSearch = "";
    app.currentCue = {};
    app.currentSequence = {};
    app.currentPreset = {};
    app.currentFixture = {};
    app.version = "";
    app.effectProfiles = [];
    app.currentEffect = {};
    app.currentGroup = {};
    app.currentGroupFixtures = {};
    app.currentPresetFixtures = {};
    app.currentSequenceFixtures = {};
    app.usbData = [];
    app.usbPath = "";
    app.settings = {};
    app.qrcode = "";
    app.desktop = false;
    app.removePositionPalette = false;
    app.removeColorPalette = false;
    app.version = "";
    app.url = "";
    app.fixtureProfilesManufacturer = "";
    app.fixtureProfilesModel = "";
    app.keyboardVisible = false;
    app.cueProgress = 0;
    $('#openFixtureDefinitionModal').modal("hide");
    $('#openShowModal').modal("hide");
    $('#addGroupModal').modal("hide");
    $('#addFixturesToGroupModal').modal("hide");
    $('#addFixturesToPresetModal').modal("hide");
    $('#addFixturesToSequenceModal').modal("hide");
    $('#fixtureAddEffectsModal').modal("hide");
    $('#fixtureProfilesModal').modal("hide");
    $('#showFilesModal').modal("hide");
    $('#showInfoModal').modal("hide");
    $('#addSequenceModal').modal("hide");
    $('#serverDisconnectedModal').modal("hide");
    $('#colorWheelModal').modal("hide");
    $('#joystickModal').modal("hide");
    socket.emit("getFixtureProfiles");
});

socket.on('connect_error', function () {
    app.keyboardVisible = false;
    $('#openFixtureDefinitionModal').modal("hide");
    $('#openShowModal').modal("hide");
    $('#addGroupModal').modal("hide");
    $('#addFixturesToGroupModal').modal("hide");
    $('#addFixturesToPresetModal').modal("hide");
    $('#addFixturesToSequenceModal').modal("hide");
    $('#fixtureAddEffectsModal').modal("hide");
    $('#fixtureProfilesModal').modal("hide");
    $('#showFilesModal').modal("hide");
    $('#showInfoModal').modal("hide");
    $('#addSequenceModal').modal("hide");
    $('#colorWheelModal').modal("hide");
    $('#joystickModal').modal("hide");
    $('#serverDisconnectedModal').modal('show');
});

socket.on('palettes', function (msg) {
    app.colorPalettes = msg.colorPalettes;
    app.positionPalettes = msg.positionPalettes;
});

socket.on('cueProgress', function (msg) {
    app.cueProgress = msg;
});

socket.on('shows', function (msg) {
    app.usbData = msg.shows;
    app.usbPath = msg.drive;
    $('#showFilesModal').modal('show');
});

socket.on('showInfo', function (msg) {
    app.showInfo = msg;
    $('#showInfoModal').modal('show');
});

socket.on('fixtures', function (msg) {
    app.fixtures = msg.fixtures;
    if (msg.target == true) {
        if ((app.currentView == 'fixtureParameters' || app.currentView == 'fixtureSettings' || app.currentView == 'fixtureEffectSettings') && app.currentFixture != {}) {
            app.getFixtureParameters(app.currentFixture.id, false);
        }
    }
});

socket.on('groups', function (msg) {
    app.groups = msg.groups;
    if (msg.target == true) {
        if ((app.currentView == 'groupParameters' || app.currentView == 'groupSettings') && app.currentGroup != {}) {
            app.getGroupParameters(app.currentGroup.id, false);
            if (app.currentView == 'groupSettings') {
                app.getGroupFixtures(app.currentGroup.id);
            }
        }
    }
});

socket.on('cues', function (msg) {
    app.cues = msg;
    if (app.currentView == 'cueSettings' && app.currentCue != {}) {
        app.getCueSettings(app.currentCue.id);
    }
});

socket.on('sequences', function (msg) {
    app.sequences = msg.sequences;
    if (msg.target == true) {
        if ((app.currentView == 'sequenceParameters' || app.currentView == 'sequenceSettings') && app.currentSequence != {}) {
            app.getSequenceParameters(app.currentSequence.id, false);
            if (app.currentView == 'sequenceSettings') {
                app.getSequenceFixtures(app.currentSequence.id);
            }
        }
    }
});

socket.on('presets', function (msg) {
    app.presets = msg;
    if (app.currentView == 'presetSettings' && app.currentPreset != {}) {
        app.getPresetSettings(app.currentPreset.id);
    }
});

socket.on('cueActionBtn', function (msg) {
    app.cuePlaying = msg;
});

socket.on('activeCue', function (msg) {
    app.activeCue = msg;
});

socket.on('blackout', function (msg) {
    app.blackout = msg;
});

socket.on('grandmaster', function (msg) {
    app.grandmaster = msg;
});

socket.on('meta', function (msg) {
    app.desktop = msg.desktop;
    app.version = msg.version;
    app.qrcode = msg.qrcode;
    app.settings = msg.settings;
    app.url = msg.url;
});

socket.on('fixtureProfiles', function (msg) {
    app.fixtureProfiles = msg[0];
    app.startDMXAddress = msg[1];
});

socket.on('fixtureParameters', function (msg) {
    app.currentFixture = msg;
    if (app.currentView != "fixtureSettings" && app.currentView != "fixtureEffectSettings") {
        app.currentView = "fixtureParameters";
        app.removePositionPalette = false;
        app.removeColorPalette = false;
    }
});

socket.on('groupParameters', function (msg) {
    app.currentGroup = msg;
    if (app.currentView != "groupSettings") {
        app.currentView = "groupParameters";
    }
});

socket.on('sequenceParameters', function (msg) {
    app.currentSequence = msg;
    if (app.currentView != "sequenceSettings") {
        app.currentView = "sequenceParameters";
    }
});

socket.on('groupFixtures', function (msg) {
    app.currentGroupFixtures = msg;
});

socket.on('presetFixtures', function (msg) {
    app.currentPresetFixtures = msg;
});

socket.on('sequenceFixtures', function (msg) {
    app.currentSequenceFixtures = msg;
});

socket.on('cueSettings', function (msg) {
    app.currentCue = msg;
    app.currentView = "cueSettings";
});

socket.on('presetSettings', function (msg) {
    app.currentPreset = msg;
    app.currentView = "presetSettings";
});

socket.on('resetView', function (msg) {
    if (msg.type == 'fixtures') {
        if (app.currentFixture.id == msg.eid) {
            app.currentView = 'fixtures';
            app.currentFixture = {};
            $('#colorWheelModal').modal("hide");
            $('#joystickModal').modal("hide");
        }
    } else if (msg.type == 'effect') {
        if (app.currentEffect.id == msg.eid) {
            app.currentView = 'fixtureParameters';
            app.fixtureParametersTab = 'all';
            app.currentEffect = {};
        }
    } else if (msg.type == 'cues') {
        if (app.currentCue.id == msg.eid) {
            app.currentView = 'cues';
            app.cuesTab = 'cues';
            app.currentCue = {};
        }
    } else if (msg.type == 'sequences') {
        if (app.currentSequence.id == msg.eid) {
            app.currentView = 'cues';
            app.cuesTab = 'sequences';
            app.currentSequence = {};
        }
    } else if (msg.type == 'presets') {
        if (app.currentPreset.id == msg.eid) {
            app.currentView = 'presets';
            app.currentPreset = {};
            app.currentPresetFixtures = {};
        }
    } else if (msg.type == 'show') {
        app.currentView = 'fixtures';
        app.currentCue = {};
        app.currentFixture = {};
        app.currentEffect = {};
        app.currentPreset = {};
        app.addGroupSelected = [];
        app.addSequenceSelected = [];
        app.addPresetSelected = [];
        $('#colorWheelModal').modal("hide");
        $('#joystickModal').modal("hide");
    } else if (msg.type == 'groups') {
        if (app.currentGroup.id == msg.eid) {
            app.currentView = 'groups';
            app.currentGroup = {};
            app.currentGroupFixtures = {};
            $('#colorWheelModal').modal("hide");
            $('#joystickModal').modal("hide");
        }
    }
});

socket.on('fixtureEffects', function (msg) {
    if (msg.fixtureID == app.currentFixture.id) {
        app.effectProfiles = msg.effects;
    }
});

socket.on('fixtureEffectSettings', function (msg) {
    if (msg.fixtureID == app.currentFixture.id) {
        app.currentEffect = msg.effect;
        app.currentView = "fixtureEffectSettings";
    }
});

socket.on('message', function (msg) {
    $("#alertText").text(msg.content);
    $("#alert").addClass("show");
    if (msg.type == "info") {
        $("#alert").addClass("alert-info");
    } else {
        $("#alert").addClass("alert-danger");
    }
    $("#alert").fadeTo(1000, 500).slideUp(500, function () {
        $("#alert").removeClass('show');
        $("#alert").removeClass('alert-info');
        $("#alert").removeClass('alert-danger');
    });

});

$('.custom-file-input').change(function () {
    let fileName = $(this).val().split('\\').pop();
    $(this).next('.custom-file-label').html(fileName);
});