var testLayout = [
    { "x": 0, "y": 0, "w": 1, "h": 1, "i": "0", "name": "Martin Mac 360", "universe": 0, "coarse": 1, channels: ["hi"]},
    { "x": 1, "y": 0, "w": 1, "h": 1, "i": "1", "name": "Martin Mac 360", "universe": 0, "coarse": 2, channels: ["hi"]},
    { "x": 2, "y": 0, "w": 1, "h": 1, "i": "2", "name": "Martin Mac 360", "universe": 0, "coarse": 3, channels: ["hi"]},
    { "x": 3, "y": 0, "w": 1, "h": 1, "i": "3", "name": "Martin Mac 360", "universe": 0, "coarse": 4, channels: ["hi"]},
    { "x": 4, "y": 0, "w": 1, "h": 1, "i": "4", "name": "Martin Mac 360", "universe": 0, "coarse": 5, channels: ["hi"]},
    { "x": 5, "y": 0, "w": 1, "h": 1, "i": "5", "name": "Martin Mac 360", "universe": 0, "coarse": 6, channels: ["hi"]}
];
var app = new Vue({
    el: '#app',
    data: {
        currentTab: 'fixtures',
        fixturesDisplay: 'fixtures',
        fixtures: testLayout,
        selectedFixtures: [],
        selectedGroups: [],
        layoutMode: false,
        cues: [],
        groups: [
            {"name": "Test group", "i": "0"},
            {"name": "Test group", "i": "1"},
            {"name": "Test group", "i": "2"}
        ],
        presets: []
    },
    methods: {
        selectFixture: function (fixtureID) {
            if (app.layoutMode == false) {
                if (app.selectedFixtures.indexOf(fixtureID) >= 0) {
                    app.selectedFixtures.splice(app.selectedFixtures.indexOf(fixtureID), 1);
                } else {
                    app.selectedFixtures.push(fixtureID);
                }
            }
        },
        selectGroup: function (groupID) {
                if (app.selectedGroups.indexOf(groupID) >= 0) {
                    app.selectedGroups.splice(app.selectedGroups.indexOf(groupID), 1);
                } else {
                    app.selectedGroups.push(groupID);
                }
        },
        setLayoutMode: function (value) {
            app.layoutMode = value;
            app.deselectAllFixtures();
        },
        deselectAllFixtures: function () {
            app.selectedFixtures = [];
        }
    }
});
