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
        }
    },
    methods: {
        isEmpty: function (obj) {
            for (var key in obj) {
                if (obj.hasOwnProperty(key))
                    return false;
            }
            return true;
        },
        intensityAverage(parameters) {
            avVal = 0.0;
            avInputs = 0;
            for (i = 0; i < parameters.length; i++) {
                if (parameters[i].fadeWithIntensity == true) {
                    avInputs += 1;
                    if (app.blind == true) {
                        avVal += parameters[i].blindValues[app.socketID];
                    } else {
                        avVal += parameters[i].liveValue;
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
            for (i = 0; i < app.fixtures[fixtureIndex].parameters.length; i++) {
                ready = true;
                parameterLiveValue = app.fixtures[fixtureIndex].parameters[i].liveValue;
                parameterLiveInputs = 1.0;
                parameterBlindValue = app.fixtures[fixtureIndex].parameters[i].blindValues[app.socketID];
                parameterBlindInputs = 1.0;
                if (app.selectedFixtures.length > 1) {
                    for (fi = 1; fi < app.selectedFixtures.length; fi++) {
                        fixtureTwoIndex = app.fixtures.findIndex(x => x.i === app.selectedFixtures[fi]);
                        readyTwo = false;
                        for (pi = 0; pi < app.fixtures[fixtureTwoIndex].parameters.length; pi++) {
                            if (app.fixtures[fixtureIndex].parameters[i].coarse == app.fixtures[fixtureTwoIndex].parameters[pi].coarse && app.fixtures[fixtureIndex].parameters[i].fine == app.fixtures[fixtureTwoIndex].parameters[pi].fine && app.fixtures[fixtureIndex].parameters[i].type == app.fixtures[fixtureTwoIndex].parameters[pi].type && app.fixtures[fixtureIndex].parameters[i].fadeWithIntensity == app.fixtures[fixtureTwoIndex].parameters[pi].fadeWithIntensity && app.fixtures[fixtureIndex].parameters[i].home == app.fixtures[fixtureTwoIndex].parameters[pi].home) {
                                readyTwo = true;
                                parameterLiveInputs += 1;
                                parameterLiveValue += app.fixtures[fixtureTwoIndex].parameters[pi].liveValue;
                                parameterBlindInputs += 1;
                                parameterBlindValue += app.fixtures[fixtureTwoIndex].parameters[pi].blindValues[app.socketID];
                            }
                        }
                        if (readyTwo == false) {
                            ready = false;
                        }
                    }
                }
                if (ready == true) {
                    app.fixtureParameters.push(app.fixtures[fixtureIndex].parameters[i]);
                    app.fixtureParameters[app.fixtureParameters.length - 1].liveValue = parameterLiveValue / parameterLiveInputs;
                    app.fixtureParameters[app.fixtureParameters.length - 1].blindValues[app.socketID] = parameterBlindValue / parameterBlindInputs;
                }
            }
            app.tab = "fixtureParameters";
        },
        editFixtureParameters: function () {
            message = {
                "msgType": "editFixtureParameters",
                "fixtures": app.selectedFixtures,
                "parameters": app.fixtureParameters
            }
            socket.send(JSON.stringify(message))
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
                            app.groupSettingsFixtures.push({ id: app.groups[i].fixtures[g], name: app.fixtures.find(x => x.i === app.groups[i].fixtures[g]).name });
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
            app, tab
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
    } else if (msg["msgType"] == "socketID") {
        app.socketID = msg["socketID"];
    } else if (msg["msgType"] == "moveFixture") {
        item = app.fixtures.find(x => x.i === msg["i"]);
        item.x = msg["x"];
        item.y = msg["y"];
    } else if (msg["msgType"] == "resizeFixture") {
        item = app.fixtures.find(x => x.i === msg["i"]);
        item.w = msg["w"];
        item.h = msg["h"];
    } else if (msg["msgType"] == "fixtureProfiles") {
        app.fixtureProfiles = msg["profiles"];
    } else if (msg["msgType"] == "addFixtureResponse") {
        app.fixtures.push(msg["fixture"]);
    }
});