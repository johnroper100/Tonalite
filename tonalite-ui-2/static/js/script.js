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
        currentCue: ""
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