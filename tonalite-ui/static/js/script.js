var socket = io('http://' + document.domain + ':' + location.port);
var app = new Vue({
    el: '#app',
    data: {
        currentTab: 'fixtures',
        fixturesDisplay: 'fixtures',
        layoutMode: false,
        fixtures: [],
        groups: [],
        cues: [],
        presets: [],
        selectedFixtures: [],
        selectedPatchedFixtures: [],
        selectedGroups: [],
        selectedCues: [],
        selectedPresets: [],
        selectedProfile: '',
        selectedProfileManufacturer: '',
        selectedProfileMode: '',
        selectedProfileFile: '',
        fixtureProfileManufacturers: [],
        fixtureProfileModes: [],
        fixtureProfiles: [],
        showFixtureProfilesOptions: false,
        fixtureProfileCreationCount: 1,
        fixtureProfileCreationUniverse: 1,
        fixtureProfileCreationAddress: 1
    },
    methods: {
        setLayoutMode: function (value) {
            app.layoutMode = value;
            app.deselectAllFixtures();
        },
        launchFullScreen: function () {
            element = document.documentElement;
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
        selectFixture: function (fixtureID) {
            if (app.layoutMode == false) {
                if (app.selectedFixtures.indexOf(fixtureID) >= 0) {
                    app.selectedFixtures.splice(app.selectedFixtures.indexOf(fixtureID), 1);
                } else {
                    app.selectedFixtures.push(fixtureID);
                }
            }
        },
        selectPatchedFixture: function (fixtureID) {
            if (app.selectedPatchedFixtures.indexOf(fixtureID) >= 0) {
                app.selectedPatchedFixtures.splice(app.selectedPatchedFixtures.indexOf(fixtureID), 1);
            } else {
                app.selectedPatchedFixtures.push(fixtureID);
            }
        },
        selectGroup: function (groupID) {
            if (app.selectedGroups.indexOf(groupID) >= 0) {
                app.selectedGroups.splice(app.selectedGroups.indexOf(groupID), 1);
            } else {
                app.selectedGroups.push(groupID);
            }
        },
        selectCue: function (cueID) {
            if (app.selectedCues.indexOf(cueID) >= 0) {
                app.selectedCues.splice(app.selectedCues.indexOf(cueID), 1);
            } else {
                app.selectedCues.push(cueID);
            }
        },
        selectPreset: function (presetID) {
            if (app.selectedPresets.indexOf(presetID) >= 0) {
                app.selectedPresets.splice(app.selectedPresets.indexOf(presetID), 1);
            } else {
                app.selectedPresets.push(presetID);
            }
        },
        deselectAllFixtures: function () {
            app.selectedFixtures = [];
        },
        deselectAllPatchedFixtures: function () {
            app.selectedPatchedFixtures = [];
        },
        deselectAllGroups: function () {
            app.selectedGroups = [];
        },
        deselectAllCues: function () {
            app.selectedCues = [];
        },
        deselectAllPresets: function () {
            app.selectedPresets = [];
        },
        closeAddDeviceModal: function () {
            app.selectedProfile = '';
            app.selectedProfileManufacturer = '';
            app.selectedProfileMode = '';
            app.fixtureProfileManufacturers = [];
            app.fixtureProfileModes = [];
            app.fixtureProfiles = [];
            app.showFixtureProfilesOptions = false;
            app.fixtureProfileCreationAddress = 1;
            app.fixtureProfileCreationCount = 1;
            app.fixtureProfileCreationUniverse = 1;
            app.selectedProfileFile = '';
            $("#addDeviceModal").modal('hide');
        },
        selectFixtureProfileManufacturer: function (manufacturer) {
            app.fixtureProfileModes = [];
            app.selectedProfileManufacturer = manufacturer;
            app.selectedProfile = '';
            app.selectedProfileMode = '';
            app.selectedProfileFile = '';
            socket.emit('getFixtureProfiles', app.selectedProfileManufacturer);
        },
        selectFixtureProfile: function (profile) {
            app.fixtureProfileModes = [];
            app.selectedProfile = profile;
            app.selectedProfileMode = '';
            app.selectedProfileFile = '';
            socket.emit('getFixtureProfileModes', { "manufacturer": app.selectedProfileManufacturer, "profile": app.selectedProfile });
        },
        selectFixtureProfileMode: function (mode) {
            app.selectedProfileMode = mode.mode;
            app.selectedProfileFile = mode.file;
        },
        getFixtureProfileManufacturers: function () {
            socket.emit('getFixtureProfileManufacturers');
        },
        addDevice: function () {
            socket.emit('addDevice', { "manufacturer": app.selectedProfileManufacturer, "profile": app.selectedProfile, "mode": app.selectedProfileMode, "file": app.selectedProfileFile, "count": app.fixtureProfileCreationCount, "universe": app.fixtureProfileCreationUniverse, "address": app.fixtureProfileCreationAddress })
            app.closeAddDeviceModal();
        },
        fixtureItemMoved: function (fixture) {
            socket.emit('fixtureItemMoved', { "id": fixture.i, "x": fixture.x, "y": fixture.y });
        }
    }
});

socket.on('fixtures', function (msg) {
    app.fixtures = msg;
});

socket.on('fixtureProfilesManufacturers', function (msg) {
    app.fixtureProfileManufacturers = msg;
});

socket.on('fixtureProfiles', function (msg) {
    app.fixtureProfiles = msg;
});

socket.on('fixtureProfileModes', function (msg) {
    app.fixtureProfileModes = msg;
});
