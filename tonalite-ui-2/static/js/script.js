var socket = io('http://' + document.domain + ':' + location.port);
var app = new Vue({
    el: '#app',
    data: {
        currentTab: 'fixtures',
        fixtures: []
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
        }
    }
});

socket.on('connect', function () {
    app.currentTab = 'fixtures';
    app.fixtures = [];
});

socket.on('fixtures', function (msg) {
    app.fixtures = msg;
});