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
        fixtureProfileManufacturers: [],
        fixtureProfileModes: [],
        fixtureProfiles: [],
        showFixtureProfilesOptions: false
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
            $("#addDeviceModal").modal('hide');
        },
        selectFixtureProfileManufacturer: function (manufacturer) {
            app.fixtureProfileModes = [];
            app.selectedProfileManufacturer = manufacturer;
            app.selectedProfile = '';
            app.selectedProfileMode = '';
            socket.emit('getFixtureProfiles', app.selectedProfileManufacturer);
        },
        selectFixtureProfile: function (profile) {
            app.fixtureProfileModes = [];
            app.selectedProfile = profile;
            app.selectedProfileMode = '';
            socket.emit('getFixtureProfileModes', {"manufacturer": app.selectedProfileManufacturer, "profile": app.selectedProfile});
        },
        selectFixtureProfileMode: function (mode) {
            app.selectedProfileMode = mode;
        },
        getFixtureProfileManufacturers: function () {
            socket.emit('getFixtureProfileManufacturers');
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
