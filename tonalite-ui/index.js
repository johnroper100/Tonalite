var testLayout = [
    { "x": 0, "y": 0, "w": 1, "h": 1, "i": "0"},
    { "x": 1, "y": 0, "w": 1, "h": 1, "i": "1"},
    { "x": 2, "y": 0, "w": 1, "h": 1, "i": "2"},
    { "x": 3, "y": 0, "w": 1, "h": 1, "i": "3"},
    { "x": 4, "y": 0, "w": 1, "h": 1, "i": "4"},
    { "x": 5, "y": 0, "w": 1, "h": 1, "i": "5"}
];
var app = new Vue({
    el: '#app',
    data: {
        currentTab: 'fixtures',
        fixturesDisplay: 'fixtures',
        fixtures: testLayout,
        selectedFixtures: [],
        layoutMode: false,
        cues: []
    },
    methods: {
        selectFixture: function (fixture) {
            if (app.layoutMode == false) {
                if (app.selectedFixtures.indexOf(fixture.i) >= 0) {
                    app.selectedFixtures.splice(app.selectedFixtures.indexOf(fixture.i), 1);
                } else {
                    app.selectedFixtures.push(fixture.i);
                }
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
