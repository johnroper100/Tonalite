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
        fixtureProfileCreationAddress: 1,
        fixtureProfileCreationAddressOffset: 0,
        editingFixtureParameters: false,
        selectedFixturesParameters: []
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
        closeAddFixtureModal: function () {
            $("#addFixtureModal").modal('hide');
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
            app.fixtureProfileCreationAddressOffset = 0;
            app.selectedProfileFile = '';
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
        addFixture: function () {
            socket.emit('addFixture', { "manufacturer": app.selectedProfileManufacturer, "profile": app.selectedProfile, "mode": app.selectedProfileMode, "file": app.selectedProfileFile, "count": app.fixtureProfileCreationCount, "universe": app.fixtureProfileCreationUniverse, "address": app.fixtureProfileCreationAddress, "offset": app.fixtureProfileCreationAddressOffset })
            app.closeAddFixtureModal();
        },
        fixtureItemMoved: function (fixture) {
            socket.emit('fixtureItemMoved', { "id": fixture.i, "x": fixture.x, "y": fixture.y });
        },
        duplicateSelectedPatchedFixtures: function () {
            if (app.selectedPatchedFixtures.length > 0) {
                socket.emit('duplicateFixtures', app.selectedPatchedFixtures);
            }
        },
        deleteSelectedPatchedFixtures: function () {
            if (app.selectedPatchedFixtures.length > 0) {
                socket.emit('deleteFixtures', app.selectedPatchedFixtures);
            }
        },
        groupSelectedFixtures: function () {
            if (app.selectedFixtures.length > 0) {
                socket.emit('groupFixtures', app.selectedFixtures);
            }
        },
        groupSelectedGroups: function () {
            if (app.selectedGroups.length > 0) {
                socket.emit('groupGroups', app.selectedGroups);
            }
        },
        deleteSelectedGroups: function () {
            if (app.selectedGroups.length > 0) {
                socket.emit('deleteGroups', app.selectedGroups);
            }
        },
        updateSelectedFixturesParameters: function () {
            var parameterCats = [];
            app.selectedFixturesParameters = [];
            let i = 0; const iMax = app.selectedFixtures.length; for (; i < iMax; i++) {
                var fixture = app.fixtures[app.fixtures.map(el => el.i).indexOf(app.selectedFixtures[i])];
                let p = 0; const pMax = fixture.parameters.length; for (; p < pMax; p++) {
                    var newParameter = JSON.parse(JSON.stringify(fixture.parameters[p]));
                    if (!parameterCats.includes(newParameter.name + ":" + newParameter.type)) {
                        newParameter.value = newParameter.home;
                        app.selectedFixturesParameters.push(newParameter);
                        parameterCats.push(newParameter.name + ":" + newParameter.type);
                    }
                }
            }
        },
        openFixtureParameters: function () {
            if (app.selectedFixtures.length > 0) {
                app.updateSelectedFixturesParameters();
                app.editingFixtureParameters = true;
            }
        }
    }
});

socket.on('fixtures', function (msg) {
    app.fixtures = msg;
    if (app.editingFixtureParameters == true) {
        app.updateSelectedFixturesParameters();
    }
});

socket.on('groups', function (msg) {
    app.groups = msg;
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
