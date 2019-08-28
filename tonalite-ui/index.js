var testLayout = [
    { "x": 0, "y": 0, "w": 1, "h": 1, "i": "0", "selected": false },
    { "x": 1, "y": 0, "w": 1, "h": 1, "i": "1", "selected": false },
    { "x": 2, "y": 0, "w": 1, "h": 1, "i": "2", "selected": false },
    { "x": 3, "y": 0, "w": 1, "h": 1, "i": "3", "selected": false },
    { "x": 4, "y": 0, "w": 1, "h": 1, "i": "4", "selected": false },
    { "x": 5, "y": 0, "w": 1, "h": 1, "i": "5", "selected": false }
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
                fixture.selected = !fixture.selected;
                if (fixture.selected == true) {
                    app.selectedFixtures.push(fixture.i);
                } else {
                    app.selectedFixtures.splice(app.selectedFixtures.indexOf(fixture.i), 1);
                }
            }
        },
        setLayoutMode: function (value) {
            app.layoutMode = value;
            app.deselectAllFixtures();
        },
        deselectAllFixtures: function () {
            app.selectedFixtures = [];
            let f = 0; const fMax = app.fixtures.length; for (; f < fMax; f++) {
                app.fixtures[f].selected = false;
            }
        }
    }
});
