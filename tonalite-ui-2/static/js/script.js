var socket = io('http://' + document.domain + ':' + location.port);
var app = new Vue({
    el: '#app',
    data: {
        currentView: 'fixtures',
        desktop: false,
        fixtures: [],
        groups: [],
        cues: [],
        presets: [],
        cuePlaying: false,
        currentCue: "",
        blackout: false,
        grandmaster: 100,
        fixtureProfiles: [],
        startDMXAddress: 1,
        newFixtureCreationCount: 1,
        fixtureProfilesSearch: "",
        fixtureParameters: [],
        currentFixture: {}
    },
    computed: {
        filteredFixtureProfilesList() {
            return this.fixtureProfiles.filter(profile => {
                return (profile[2] + " " + profile[0] + " " + profile[1]).toLowerCase().includes(this.fixtureProfilesSearch.toLowerCase());
            });
        }
    },
    methods: {
        launchFullScreen: function () {
            var element = document.documentElement;
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
        ifMobile: function () {
            return isMobile.any;
        },
        resetShow: function () {
            bootbox.confirm("Are you sure you want a new show? This will reset everything.", function (result) {
                if (result === true) {
                    socket.emit("resetShow");
                }
            });
        },
        resetPresets: function () {
            bootbox.confirm("Are you sure you want to reset the presets?", function (result) {
                if (result === true) {
                    socket.emit("resetPresets");
                    app.currentView = "presets";
                }
            });
        },
        resetFixtures: function () {
            bootbox.confirm("Are you sure you want to reset all fixture parameter values?", function (result) {
                if (result === true) {
                    socket.emit("resetFixtures");
                }
            });
        },
        resetGroups: function () {
            bootbox.confirm("Are you sure you want to reset all group parameter values?", function (result) {
                if (result === true) {
                    socket.emit("resetGroups");
                }
            });
        },
        recordCue: function () {
            if (app.cuePlaying == false) {
                socket.emit("recordCue");
            }
        },
        nextCue: function () {
            socket.emit("nextCue");
        },
        lastCue: function () {
            socket.emit("lastCue");
        },
        stopCue: function () {
            socket.emit("stopCue");
        },
        recordPreset: function () {
            socket.emit("recordPreset");
        },
        toggleBlackout: function () {
            socket.emit("toggleBlackout");
        },
        updateFirmware: function () {
            socket.emit("updateFirmware");
        },
        importFixturesFromUSB: function () {
            socket.emit("importFixturesFromUSB");
        },
        changeGrandMasterValue: function () {
            socket.emit("changeGrandmasterValue", app.grandmaster);
        },
        getFixtureProfiles: function () {
            socket.emit("getFixtureProfiles");
            app.newFixtureCreationCount = 1;
            app.startDMXAddress = 1;
            app.fixtureProfilesSearch = "";
            $('#fixtureProfilesModal').modal("show");
        },
        addFixture: function (fixture, dcid) {
            socket.emit("addFixture", { fixtureName: fixture, dcid: dcid, startDMXAddress: $('#newFixtureStartDMXAddress').val(), creationCount: $('#newFixtureCreationCount').val() });
            $('#fixtureProfilesModal').modal("hide");
        },
        getFixtureParameters: function (fixtureID) {
            socket.emit("getFixtureParameters", fixtureID);
            app.currentView = "fixtureParameters";
        }
    }
});

socket.on('connect', function () {
    app.currentView = 'fixtures';
    app.fixtures = [];
    app.groups = [];
    app.cues = [];
    app.presets = [];
    app.currentCue = "";
    app.cuePlaying = false;
    app.desktop = false;
    app.blackout = false;
    app.grandmaster = 100;
    app.fixtureProfiles = [];
    app.startDMXAddress = 1;
    app.newFixtureCreationCount = 1;
    app.fixtureProfilesSearch = "";
    app.fixtureParameters = [];
    app.currentFixture = {};
});

socket.on('fixtures', function (msg) {
    app.fixtures = msg;
});

socket.on('groups', function (msg) {
    app.groups = msg;
});

socket.on('cues', function (msg) {
    app.cues = msg;
});

socket.on('presets', function (msg) {
    app.presets = msg;
});

socket.on('cueActionBtn', function (msg) {
    app.cuePlaying = msg;
});

socket.on('currentCue', function (msg) {
    app.currentCue = msg;
});

socket.on('blackout', function (msg) {
    app.blackout = msg;
});

socket.on('grandmaster', function (msg) {
    app.grandmaster = msg;
});

socket.on('meta', function (msg) {
    app.desktop = msg.desktop;
});

socket.on('fixtureProfiles', function (msg) {
    app.fixtureProfiles = msg[0];
    app.startDMXAddress = msg[1];
});

socket.on('fixtureParameters', function (msg) {
    app.currentFixture = msg;
});