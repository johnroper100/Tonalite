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
        activeCue: "",
        blackout: false,
        grandmaster: 100,
        fixtureProfiles: [],
        startDMXAddress: 1,
        newFixtureCreationCount: 1,
        fixtureProfilesSearch: "",
        currentCue: {},
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
        mapRange: function (num, inMin, inMax, outMin, outMax) {
            return (num - inMin) * (outMax - outMin) / (inMax - inMin) + outMin;
        },
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
        },
        getCueSettings: function (cueID) {
            socket.emit("getCueSettings", cueID);
        },
        changeFixtureParameterValue: function (parameter, index) {
            socket.emit("changeFixtureParameterValue", { id: app.currentFixture.id, pid: index, value: parameter.value })
        },
        changeFixtureParameterLock: function (index) {
            socket.emit("changeFixtureParameterLock", { id: app.currentFixture.id, pid: index })
        },
        useParameterRange: function (pid, rid) {
            socket.emit('useParameterRange', { id: app.currentFixture.id, pid: pid, rid: rid });
        },
        useFixtureChip: function (pid) {
            socket.emit('useFixtureChip', { id: app.currentFixture.id, pid: pid });
        },
        changeFixtureEffectState: function (eid) {
            socket.emit('changeFixtureEffectState', { id: app.currentFixture.id, effectid: eid })
        },
        resetFixture: function () {
            bootbox.confirm("Are you sure you want to reset this fixture's parameter values?", function (result) {
                if (result === true) {
                    socket.emit('resetFixture', app.currentFixture.id);
                }
            });
        },
        editFixtureSettings: function () {
            socket.emit('editFixtureSettings', { id: app.currentFixture.id, shortName: app.currentFixture.shortName, name: app.currentFixture.name, startDMXAddress: app.currentFixture.startDMXAddress });
        },
        editCueSettings: function () {
            socket.emit('editCueSettings', { id: app.currentCue.id, upTime: app.currentCue.upTime, downTime: app.currentCue.downTime, name: app.currentCue.name, follow: app.currentCue.follow });
        },
        removeFixture: function () {
            bootbox.confirm("Are you sure you want to delete this fixture?", function (result) {
                if (result === true) {
                    app.currentView = 'fixtures';
                    socket.emit('removeFixture', app.currentFixture.id);
                }
            });
        },
        removeCue: function () {
            bootbox.confirm("Are you sure you want to delete this cue?", function (result) {
                if (result === true) {
                    app.currentView = 'cues';
                    socket.emit('removeCue', app.currentCue.id);
                }
            });
        },
        gotoCue: function() {
            socket.emit('gotoCue', app.currentCue.id);
        }
    }
});

socket.on('connect', function () {
    app.currentView = 'fixtures';
    app.fixtures = [];
    app.groups = [];
    app.cues = [];
    app.presets = [];
    app.activeCue = "";
    app.cuePlaying = false;
    app.desktop = false;
    app.blackout = false;
    app.grandmaster = 100;
    app.fixtureProfiles = [];
    app.startDMXAddress = 1;
    app.newFixtureCreationCount = 1;
    app.fixtureProfilesSearch = "";
    app.currentCue = {};
    app.currentFixture = {};
});

socket.on('fixtures', function (msg) {
    app.fixtures = msg;
    if ((app.currentView == 'fixtureParameters' || app.currentView == 'fixtureSettings') && app.currentFixture != {}) {
        app.getFixtureParameters(app.currentFixture.id);
    }
});

socket.on('groups', function (msg) {
    app.groups = msg;
});

socket.on('cues', function (msg) {
    app.cues = msg;
    if (app.currentView == 'cueSettings' && app.currentCue != {}) {
        app.getCueSettings(app.currentCue.id);
    }
});

socket.on('presets', function (msg) {
    app.presets = msg;
});

socket.on('cueActionBtn', function (msg) {
    app.cuePlaying = msg;
});

socket.on('activeCue', function (msg) {
    app.activeCue = msg;
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
    if (app.currentView != "fixtureSettings") {
        app.currentView = "fixtureParameters";
    }
});

socket.on('cueSettings', function (msg) {
    app.currentCue = msg;
    app.currentView = "cueSettings";
});

socket.on('resetView', function (msg) {
    if (msg.type == 'fixtures') {
        if (app.currentFixture.id == msg.eid) {
            app.currentView = 'fixtures';
            app.currentFixture = {};
        }
    } else if (msg.type == 'cues') {
        if (app.currentCue.id == msg.eid) {
            app.currentView = 'cues';
            app.currentCue = {};
        }
    }
});