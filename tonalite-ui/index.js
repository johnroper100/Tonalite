var testLayout = [
    { "x": 0, "y": 0, "w": 1, "h": 1, "i": "0", "name": "Martin Mac 360", "mode": "Mode 1", "universe": 0, "coarse": 1, channels: ["hi"] },
    { "x": 1, "y": 0, "w": 1, "h": 1, "i": "1", "name": "Martin Mac 360", "mode": "Mode 1", "universe": 0, "coarse": 2, channels: ["hi"] },
    { "x": 2, "y": 0, "w": 1, "h": 1, "i": "2", "name": "Martin Mac 360", "mode": "Mode 1", "universe": 0, "coarse": 3, channels: ["hi"] },
    { "x": 3, "y": 0, "w": 1, "h": 1, "i": "3", "name": "Martin Mac 360", "mode": "Mode 1", "universe": 0, "coarse": 4, channels: ["hi"] },
    { "x": 4, "y": 0, "w": 1, "h": 1, "i": "4", "name": "Martin Mac 360", "mode": "Mode 1", "universe": 0, "coarse": 5, channels: ["hi"] },
    { "x": 5, "y": 0, "w": 1, "h": 1, "i": "5", "name": "Martin Mac 360", "mode": "Mode 1", "universe": 0, "coarse": 6, channels: ["hi"] }
];
var app = new Vue({
    el: '#app',
    data: {
        currentTab: 'fixtures',
        fixturesDisplay: 'fixtures',
        layoutMode: false,
        fixtures: testLayout,
        groups: [
            { "name": "Test group", "i": "0" },
            { "name": "Test group", "i": "1" },
            { "name": "Test group", "i": "2" }
        ],
        cues: [
            {"name": "Cue 1", "i": "0"},
            {"name": "Cue 2", "i": "1"}
        ],
        presets: [
            {"name": "Preset 1", "i": "0", "active": false},
            {"name": "Preset 2", "i": "1", "active": true}
        ],
        selectedFixtures: [],
        selectedPatchedFixtures: [],
        selectedGroups: [],
        selectedCues: [],
        selectedPresets: []
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
        }
    }
});
