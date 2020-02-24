var socket = io('http://' + document.domain + ':' + location.port);

var app = new Vue({
    el: '#app',
    data: {
        presets: [],
        grandmaster: 0.0,
        desktop: false,
        disablePresets: false
    },
    methods: {
        changePresetActive: function (presetID) {
            if (app.disablePresets == false) {
                socket.emit('changePresetActive', presetID);
            }

        },
        changeGrandmasterValue: function () {
            if (app.disablePresets == false) {
                socket.emit('changeGrandmasterValue', app.grandmaster);
            }
        },
        updatePresetIntensity: function (preset) {
            if (app.disablePresets == false) {
                socket.emit('changePresetIntensity', { presetID: preset.id, intensity: preset.intensity });
            }
        },
        resetFixtures: function () {
            if (app.disablePresets == false) {
                bootbox.confirm("Are you sure you want to reset all fixture parameter values?", function (result) {
                    if (result === true) {
                        socket.emit('resetFixtures');
                    }
                });
            }
        }
    }
});

socket.on('connect', function () {
    $('#serverDisconnectedModal').modal("hide");
});

socket.on('connect_error', function () {
    $('#serverDisconnectedModal').modal("show");
});

socket.on('meta', function (metadata) {
    app.desktop = metadata.desktop;
    app.disablePresets = metadata.disablePresets;
});

socket.on('grandmaster', function (value) {
    app.grandmaster = value;
});

socket.on('presets', function (presets) {
    app.presets = presets;
});