const socket = new WebSocket("ws://" + location.host);

var app = new Vue({
    el: '#app',
    components: {
        Multiselect: window.VueMultiselect.default
    },
    data: {
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
        fixtureParameters: function () {
            message = {
                "msgType": "fixtureParameters",
                "fixtures": app.selectedFixtures
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
            app.fixturesTab = "groups";
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
        } else {
            app.fixtures = [];
            app.selectedGroups = [];
        }
    } else if (msg["msgType"] == "groups") {
        if (msg["groups"] != null) {
            app.groups = msg["groups"];
            if (app.tab == "groupSettings") {
                app.viewGroupSettings();
            }
        } else {
            app.groups = [];
            app.selectedGroups = [];
            if (app.tab == "groupSettings") {
                app.tab = "fixtures";
                app.fixturesTab = "groups";
            }
        }
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