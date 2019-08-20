var app = new Vue({
    el: '#app',
    data: {
        currentTab: 'fixtures',
        fixturesDisplay: 'fixtures',
        fixtures: [{ name: "hi", selected: false, id: "123" }],
        selectedFixtures: []
    },
    methods: {
        selectFixture: function (fixtureID) {
            if (app.fixtures[app.fixtures.map(el => el.id).indexOf(fixtureID)].selected == false) {
                app.selectedFixtures.push(fixtureID);
            } else {
                app.selectedFixtures.splice(app.selectedFixtures.indexOf(fixtureID), 1);
            }
            app.fixtures[app.fixtures.map(el => el.id).indexOf(fixtureID)].selected = !app.fixtures[app.fixtures.map(el => el.id).indexOf(fixtureID)].selected;
        }
    }
});
