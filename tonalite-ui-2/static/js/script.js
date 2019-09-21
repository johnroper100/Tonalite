var socket = io('http://' + document.domain + ':' + location.port);
var app = new Vue({
    el: '#app',
    data: {
        currentView: 'fixtures',
        embeded: false,
        fixtures: [],
        groups: [],
        cues: [],
        presets: [],
        cuePlaying: false,
        currentCue: "",
        blackout: false
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
            socket.emit("recordCue");
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
        }
    }
});

socket.on('connect', function () {
    app.currentTab = 'fixtures';
    app.fixtures = [];
    app.groups = [];
    app.cues = [];
    app.presets = [];
    app.currentCue = "";
    app.cuePlaying = false;
    app.embeded = false;
    app.blackout = false;
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