const socket = new WebSocket("ws://" + location.host);

var app = new Vue({
    el: '#app',
    components: {
        Multiselect: window.VueMultiselect.default
    },
    data: {
        socketID: "",
        blind: false,
        fixtureProfiles: {},
        fixtureProfilesManufacturer: "",
        fixtureProfilesModel: "",
        fixtureProfilesSearch: "",
        fixtureProfileUniverse: 1,
        fixtureProfileAddress: 1,
        fixtureProfileNumber: 1,
        fixturesTab: 'fixturesList',
        fixtureGridLayout: false,
        fixtures: [],
        selectedFixtures: [],
        fixtureParameters: [],
        groups: [],
        selectedGroups: [],
        groupSettingsName: "",
        groupSettingsFixtures: [],
        groupSettingsFixturesChanged: false,
        cues: [],
        selectedCues: [],
        currentCue: "",
        cuePlaying: false,
        tab: "fixtures"
    },
    computed: {
        filteredFixtureProfilesList() {
            if (this.isEmpty(this.fixtureProfiles) == false) {
                if (app.fixtureProfilesManufacturer != "") {
                    if (app.fixtureProfilesModel != "") {
                        var keys = Object.values(this.fixtureProfiles[app.fixtureProfilesManufacturer][app.fixtureProfilesModel]);
                        return {
                            'objs': keys.filter(profile => {
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
        },
        fixtureIds() {
            ids = [];
            for (i = 0; i < app.fixtures.length; i++) {
                ids.push({ id: app.fixtures[i].i, name: app.fixtures[i].name });
            }
            return ids;
        },
        currentCueName() {
            if (this.currentCue != "") {
                currentCue = this.cues.find(x => x.i === this.currentCue);
                if (currentCue != undefined) {
                    return currentCue.name;
                }
            }
            return "No Cue";
        },
        currentCueProgress() {
            if (this.currentCue != "") {
                currentCue = this.cues.find(x => x.i === this.currentCue);
                if (currentCue != undefined) {
                    return currentCue.displayProgress;
                }
            }
            return 0.0;
        }
    },
    methods: {
        uploadTest: function () {
            var file = document.getElementById('uploadInput').files[0];
            var reader = new FileReader();
            reader.onload = function (e) {
                message = {
                    "msgType": "updateFirmware",
                    "data": reader.result.split(',')[1]
                }
                socket.send(JSON.stringify(message));
            }
            reader.readAsDataURL(file);
        },
        goFullscreen: function () {
            if (screenfull.isEnabled) {
                screenfull.request();
            }
        },
        isEmpty: function (obj) {
            for (var key in obj) {
                if (obj.hasOwnProperty(key))
                    return false;
            }
            return true;
        },
        intensityAverage: function (parameters) {
            avVal = 0.0;
            avInputs = 0;
            for (i = 0; i < parameters.length; i++) {
                if (parameters[i].fadeWithIntensity == true || parameters[i].type == 1) {
                    avInputs += 1;
                    if (app.blind == true) {
                        avVal += parameters[i].blindManualValues[app.socketID].outputValue;
                    } else {
                        avVal += parameters[i].value.outputValue;
                    }
                }
            }
            if (avInputs == 0) {
                return 0.0;
            }
            number = avVal / avInputs;
            return Math.round(number * 10) / 10;
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
        selectFixture: function (fixtureID) {
            if (app.fixtureGridLayout == false) {
                if (app.selectedFixtures.indexOf(fixtureID) >= 0) {
                    app.selectedFixtures.splice(app.selectedFixtures.indexOf(fixtureID), 1);
                } else {
                    app.selectedFixtures.push(fixtureID);
                }
            }
        },
        moveFixture: function (fixtureID, x, y) {
            message = {
                "msgType": "moveFixture",
                "i": fixtureID,
                "x": parseInt(x),
                "y": parseInt(y)
            }
            socket.send(JSON.stringify(message));
        },
        resizeFixture: function (fixtureID, h, w, hp, wp) {
            message = {
                "msgType": "resizeFixture",
                "i": fixtureID,
                "h": parseInt(h),
                "w": parseInt(w)
            }
            socket.send(JSON.stringify(message));
        },
        getFixtureProfiles: function () {
            socket.send(JSON.stringify({ "msgType": "getFixtureProfiles" }));
            app.fixtureProfilesManufacturer = "";
            app.fixtureProfilesModel = "";
            app.fixtureProfilesSearch = "";
            app.fixtureProfileUniverse = 1;
            app.fixtureProfileAddress = 1;
            app.fixtureProfileNumber = 1;
            $('#fixtureModal').modal('show');
        },
        addFixture: function (dcid, file, custom) {
            message = {
                "msgType": "addFixture",
                "number": parseInt(app.fixtureProfileNumber),
                "address": parseInt(app.fixtureProfileAddress),
                "universe": parseInt(app.fixtureProfileUniverse),
                "dcid": dcid,
                "file": file,
                "custom": parseInt(custom)
            }
            socket.send(JSON.stringify(message));
            $('#fixtureModal').modal('hide');
        },
        removeFixtures: function () {
            message = {
                "msgType": "removeFixtures",
                "fixtures": app.selectedFixtures
            }
            socket.send(JSON.stringify(message));
            app.selectedFixtures = [];
        },
        viewGroupFixtureParameters: function () {
            app.selectedFixtures = []; // fill with group fixtures;
            app.viewFixtureParameters();
        },
        viewFixtureParameters: function () {
            app.fixtureParameters = [];
            fixtureIndex = app.fixtures.findIndex(x => x.i === app.selectedFixtures[0]);
            while (fixtureIndex == -1 && app.selectedFixtures.length > 0) {
                app.selectedFixtures.splice(0, 1);
                fixtureIndex = app.fixtures.findIndex(x => x.i === app.selectedFixtures[0]);
            }
            if (fixtureIndex != -1 && app.selectedFixtures.length > 0) {
                for (i = 0; i < app.fixtures[fixtureIndex].parameters.length; i++) {
                    ready = true;
                    if (app.fixtures[fixtureIndex].parameters[i].value.manualInput == 1) {
                        parameterDisplayValue = app.fixtures[fixtureIndex].parameters[i].value.manualValue;
                    } else {
                        parameterDisplayValue = app.fixtures[fixtureIndex].parameters[i].value.outputValue;
                    }
                    if (app.fixtures[fixtureIndex].parameters[i].blindManualValues[app.socketID].manualInput == 1) {
                        parameterBlindValue = app.fixtures[fixtureIndex].parameters[i].blindManualValues[app.socketID].manualValue;
                    } else {
                        parameterBlindValue = app.fixtures[fixtureIndex].parameters[i].blindManualValues[app.socketID].outputValue;
                    }
                    parameterLiveInputs = 1.0;
                    parameterBlindInputs = 1.0;
                    if (app.selectedFixtures.length > 1) {
                        for (fi = 1; fi < app.selectedFixtures.length; fi++) {
                            fixtureTwoIndex = app.fixtures.findIndex(x => x.i === app.selectedFixtures[fi]);
                            if (fixtureTwoIndex != -1) {
                                readyTwo = false;
                                for (pi = 0; pi < app.fixtures[fixtureTwoIndex].parameters.length; pi++) {
                                    if (app.fixtures[fixtureIndex].parameters[i].size == app.fixtures[fixtureTwoIndex].parameters[pi].size && app.fixtures[fixtureIndex].parameters[i].type == app.fixtures[fixtureTwoIndex].parameters[pi].type && app.fixtures[fixtureIndex].parameters[i].fadeWithIntensity == app.fixtures[fixtureTwoIndex].parameters[pi].fadeWithIntensity && app.fixtures[fixtureIndex].parameters[i].name == app.fixtures[fixtureTwoIndex].parameters[pi].name) {
                                        readyTwo = true;
                                        parameterLiveInputs += 1;
                                        if (app.fixtures[fixtureIndex].parameters[i].value.manualInput == 1) {
                                            parameterDisplayValue += app.fixtures[fixtureTwoIndex].parameters[pi].value.manualValue;
                                        } else {
                                            parameterDisplayValue += app.fixtures[fixtureTwoIndex].parameters[pi].value.outputValue;
                                        }
                                        parameterBlindInputs += 1;
                                        if (app.fixtures[fixtureIndex].parameters[i].blindManualValues[app.socketID].manualInput == 1) {
                                            parameterBlindValue += app.fixtures[fixtureTwoIndex].parameters[pi].blindManualValues[app.socketID].manualValue;
                                        } else {
                                            parameterBlindValue += app.fixtures[fixtureTwoIndex].parameters[pi].blindManualValues[app.socketID].outputValue;
                                        }
                                    }
                                }
                                if (readyTwo == false) {
                                    ready = false;
                                }
                            }
                        }
                    }
                    if (ready == true) {
                        app.fixtureParameters.push(app.fixtures[fixtureIndex].parameters[i]);
                        app.fixtureParameters[app.fixtureParameters.length - 1].value.outputValue = parameterDisplayValue / parameterLiveInputs;
                        app.fixtureParameters[app.fixtureParameters.length - 1].blindManualValues[app.socketID].outputValue = parameterBlindValue / parameterBlindInputs;
                    }
                }
            }
            app.tab = "fixtureParameters";
        },
        editFixtureParameters: function (parameter) {
            message = {
                "msgType": "editFixtureParameters",
                "fixtures": app.selectedFixtures,
                "parameter": parameter,
                "blind": app.blind
            }
            socket.send(JSON.stringify(message));
        },
        sneak: function () {
            message = {
                "msgType": "sneak",
                "blind": app.blind
            }
            socket.send(JSON.stringify(message));
        },
        groupFixtures: function () {
            message = {
                "msgType": "groupFixtures",
                "fixtures": app.selectedFixtures
            }
            socket.send(JSON.stringify(message));
            app.selectedFixtures = [];
            app.fixturesTab = "groups";
        },
        selectGroup: function (groupID) {
            if (app.selectedGroups.indexOf(groupID) >= 0) {
                app.selectedGroups.splice(app.selectedGroups.indexOf(groupID), 1);
            } else {
                app.selectedGroups.push(groupID);
            }
        },
        removeGroups: function () {
            message = {
                "msgType": "removeGroups",
                "groups": app.selectedGroups
            }
            socket.send(JSON.stringify(message));
            app.selectedGroups = [];
            app.tab = "fixtures";
        },
        viewGroupSettings: function () {
            app.groupSettingsName = "";
            app.groupSettingsFixtures = [];
            app.groupSettingsFixturesChanged = false;

            for (i = 0; i < app.groups.length; i++) {
                if (app.selectedGroups.includes(app.groups[i].i)) {
                    if (app.groupSettingsName == "" || app.groupSettingsName == app.groups[i].name) {
                        app.groupSettingsName = app.groups[i].name;
                    } else {
                        app.groupSettingsName = "Multiple";
                    }
                    for (g = 0; g < app.groups[i].fixtures.length; g++) {
                        if (app.groupSettingsFixtures.includes(app.groups[i].fixtures[g]) == false) {
                            foundFixture = app.fixtures.find(x => x.i === app.groups[i].fixtures[g]);
                            if (foundFixture != undefined) {
                                app.groupSettingsFixtures.push({ id: app.groups[i].fixtures[g], name: foundFixture.name });
                            }
                        }
                    }
                }
            }
            app.tab = "groupSettings";
        },
        editGroupsFixtures(value, id) {
            app.groupSettingsFixturesChanged = true;
            app.editGroups();
        },
        editGroups: function () {
            message = {
                "msgType": "editGroups",
                "groups": app.selectedGroups,
                "name": app.groupSettingsName,
                "fixtures": app.groupSettingsFixtures,
                "fixturesChanged": app.groupSettingsFixturesChanged
            }
            socket.send(JSON.stringify(message));
        },
        recordCue: function () {
            message = {
                "msgType": "recordCue",
                "blind": app.blind
            }
            socket.send(JSON.stringify(message));
        },
        nextCue: function () {
            message = {
                "msgType": "nextCue"
            }
            socket.send(JSON.stringify(message));
        },
        lastCue: function () {
            message = {
                "msgType": "lastCue"
            }
            socket.send(JSON.stringify(message));
        },
        rdmSearch: function () {
            socket.send(JSON.stringify({ "msgType": "rdmSearch" }));
        },
        saveShow: function () {
            socket.send(JSON.stringify({ "msgType": "saveShow" }));
        }
    }
});

socket.addEventListener('message', function (event) {
    msg = JSON.parse(event.data);
    if (msg["msgType"] == "fixtures") {
        if (msg["fixtures"] != null) {
            app.fixtures = msg["fixtures"];
            // update selected fixtures if fixtures has been removed
            if (app.tab == "fixtureParameters") {
                app.viewFixtureParameters();
            }
        } else {
            app.fixtures = [];
            app.selectedFixtures = [];
            if (app.tab == "fixtureParameters") {
                app.tab = "fixtures";
            }
        }
    } else if (msg["msgType"] == "groups") {
        if (msg["groups"] != null) {
            app.groups = msg["groups"];
            // update selected groups if group has been removed
            if (app.tab == "groupSettings") {
                app.viewGroupSettings();
            }
        } else {
            app.groups = [];
            app.selectedGroups = [];
            if (app.tab == "groupSettings") {
                app.tab = "fixtures";
            }
        }
    } else if (msg["msgType"] == "cues") {
        if (msg["cues"] != null) {
            app.cues = msg["cues"];
            // update selected cues if cue has been removed
        } else {
            app.cues = [];
            app.selectedCues = [];
        }
    } else if (msg["msgType"] == "socketID") {
        app.socketID = msg["socketID"];
    } else if (msg["msgType"] == "currentCue") {
        app.currentCue = msg["currentCue"];
        app.cuePlaying = msg["cuePlaying"];
    } else if (msg["msgType"] == "moveFixture") {
        item = app.fixtures.find(x => x.i === msg["i"]);
        if (item != undefined) {
            item.x = msg["x"];
            item.y = msg["y"];
        }
    } else if (msg["msgType"] == "resizeFixture") {
        item = app.fixtures.find(x => x.i === msg["i"]);
        if (item != undefined) {
            item.w = msg["w"];
            item.h = msg["h"];
        }
    } else if (msg["msgType"] == "fixtureProfiles") {
        app.fixtureProfiles = msg["profiles"];
    }
});