var socket = io('http://' + document.domain + ':' + location.port);
var app = new Vue({
    el: '#app',
    data: {
        desktop: true,
        storedShowFiles: ["testingshowhi"]
    },
    methods: {
        ifMobile: function () {
            return isMobile.any;
        },
        newShow: function() {
            socket.emit('newShow');
        }
    }
})