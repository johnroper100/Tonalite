var socket = io('http://' + document.domain + ':' + location.port);
var currentTab = "fixtures";
document.getElementById("fixturesTab").click();
var backupFixtures = [];
var app = new Vue({
    el: '#app',
    data: {
        fixtures: [],
        fixtureParameters: [],
        groups: [],
        presets: [],
        cues: [],
        showFiles: [],
        fixtureProfiles: [],
        fixtureEffects: [],
        effectFixture: "",
        usbPath: "",
        desktop: false,
        version: "2.0.0 Beta 5",
        qrcode: "",
        appURL: "",
        currentCue: "",
        blackout: false,
        startDMXAddress: 1,
        newFixtureCreationCount: 1,
        grandmaster: 0.0
    },
    methods: {
        changePresetActive: function (presetID) {
            socket.emit('changePresetActive', presetID);
        },
        viewPresetSettings: function (presetID) {
            socket.emit('getPresetSettings', presetID);
        },
        viewFixtureParameters: function (fixtureID) {
            socket.emit('getFixtureParameters', fixtureID);
        },
        viewGroupParameters: function (groupID) {
            socket.emit('getGroupParameters', groupID);
        },
        viewCueSettings: function (cueID) {
            socket.emit('getCueSettings', cueID);
        },
        lockedFixtureParameters: function (locked) {
            if (locked === true)
                return "<i class=\"ml-1 far fa-lock-alt fa-sm\"></i>";
            return "";
        },
        activeFixtureEffects: function (active) {
            if (active === true)
                return "<i class=\"ml-1 far fa-hurricane fa-sm\"></i>";
            return "";
        },
        openShowFromUSB: function (showFile) {
            socket.emit('openShowFromUSB', [showFile, app.usbPath]);
            $('#showFilesModal').modal("hide");
        },
        ifMobile: function () {
            return isMobile.any;
        },
        addFixture: function (fixture, dcid) {
            socket.emit('addFixture', { fixtureName: fixture, dcid: dcid, startDMXAddress: $('#newFixtureStartDMXAddress').val(), creationCount: $('#newFixtureCreationCount').val() });
            $('#fixtureProfilesModal').modal("hide");
        },
        addEffect: function (effectFile) {
            socket.emit('addEffect', { effectFile: effectFile, fixtureID: app.effectFixture, parameterName: $('#fixtureEffectParametersList').val() });
            $('#fixtureAddEffectsModal').modal("hide");
        },
        upperCase: function (str) {
            return str.toUpperCase().replace(/-/g, " ");
        },
        titleCase: function (str) {
            return str.toLowerCase().split(' ').map(function (word) {
                return (word.charAt(0).toUpperCase() + word.slice(1));
            }).join(' ');
        },
        updateGrandmasterValue: function () {
            socket.emit('changeGrandmasterValue', app.grandmaster);
        },
        updatePresetIntensity: function () {
            socket.emit('changePresetIntensity', { presetID: $("#presetIntensityInput").prop('presetID'), intensity: $("#presetIntensityInput").val() });
        },
        toggleBlackout: function () {
            socket.emit('toggleBlackout');
        },
        recordPreset: function () {
            socket.emit('recordPreset');
        },
        closeSettings: function () {
            socket.emit('closeSettings');
            $('#openSettingsModal').modal("hide");
        }
    }
});

Mousetrap.bind('r', function () { recordCue(); });
Mousetrap.bind('end', function () { stopCue(); });
Mousetrap.bind('right', function () { nextCue(); });
Mousetrap.bind('left', function () { lastCue(); });
Mousetrap.bind('ctrl+n', function () { resetShow(); return false; });
Mousetrap.bind('shift+a', function () { addFixtureModal(); return false; });
Mousetrap.bind('ctrl+s', function () { window.location = "/showFile"; return false; });

function launchFullScreen(element) {
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

socket.on('message', function (msg) {
    $("#alertText").text(msg.content);
    $("#alert").addClass("show");
    $("#alert").fadeTo(1000, 500).slideUp(500, function () {
        $("#alert").removeClass('show');
        $("#alert").removeClass('alert-info');
        $("#alert").removeClass('alert-danger');
    });
    if (msg.type == "info") {
        $("#alert").addClass("alert-info");
    } else {
        $("#alert").addClass("alert-danger");
    }
});

socket.on('blackout', function (msg) {
    app.blackout = msg;
});

socket.on('grandmaster', function (value) {
    app.grandmaster = value;
});

socket.on('currentCue', function (value) {
    app.currentCue = value;
});

socket.on('fixtures', function (fixtures) {
    backupFixtures = fixtures;
    if (currentTab === "fixtures") {
        app.fixtures = fixtures;
    }
});

socket.on('fixtureProfiles', function (profiles) {
    app.newFixtureCreationCount = 1;
    app.startDMXAddress = profiles[1];
    app.fixtureProfiles = profiles[0];
    $('#searchFixtureProfiles').val("");
    searchFixtureProfiles();
    $('#fixtureProfilesModal').modal("show");
});

socket.on('fixtureEffects', function (effects) {
    app.fixtureEffects = effects[1];
    app.effectFixture = effects[0];
    $('#fixtureAddEffectsModal').modal("show");
});

socket.on('shows', function (shows) {
    app.showFiles = shows[0];
    app.usbPath = shows[1];
    $('#showFilesModal').modal("show");
});

socket.on('fixtureParameters', function (msg) {
    app.fixtureParameters = msg.parameters;
    openTab('fixtureParametersPage');
    $("#fixtureParameters").empty();
    $("#fixtureParametersName").text(msg.name + " (" + msg.startDMXAddress + ")");
    $("#fixtureSettingsBtn").off().on("click", function () { viewFixtureSettings(msg.id); });
    $("#fixtureAddEffectBtn").off().on("click", function () { getEffects(msg.id); });
    $("#fixtureResetBtn").off().on("click", function () { resetFixture(msg.id); });
    var c = 0; const cMax = msg.parameters.length; for (; c < cMax; c++) {
        chanString = "";
        if (msg.parameters[c].locked) {
            chanString += "<button class=\"btn btn-info\" onclick=\"updateFixtureParameterLock(this, '" + msg.id + "', " + c + ")\"><i class=\"far fa-lock-alt fa-sm\"></i></button>";
        } else {
            chanString += "<button class=\"btn btn-info\" onclick=\"updateFixtureParameterLock(this, '" + msg.id + "', " + c + ")\"><i class=\"far fa-lock-open-alt fa-sm \"></i></button>";
        }
        chanString += "<label class=\"ml-2\" ";
        chanString += "for=\"" + msg.parameters[c].type + "\">" + msg.parameters[c].name + ":</label><input type=\"range\" class=\"custom-range\" id=\"" + msg.parameters[c].type + "\" max=\"" + msg.parameters[c].max + "\" min=\"" + msg.parameters[c].min + "\" value=\"" + msg.parameters[c].value + "\" oninput=\"updateFixtureParameterValue(this, '" + msg.id + "', " + c + ")\">";
        $("#fixtureParameters").append(chanString);
    }

    if (msg.chips.length != 0) {
        var div = "<div class=\"fixtureChips\"><h5>Fixture Chips:</h5>";

        var ch = 0; const chMax = msg.chips.length; for (; ch < chMax; ch++) {
            div += "<div class=\"fixtureChip d-inline-block mr-2\" style=\"background-color: " + msg.chips[ch].color + "\" onclick=\"useFixtureChip(this, '" + msg.id + "', " + ch + ")\"></div>";
        }
        div += "</div>";
        $("#fixtureParameters").append(div);
    }

    if (msg.effects.length != 0) {
        var div = "<div class=\"fixtureEffects\"><h5>Fixture Effects:</h5><ul class=\"list-group\">";
        var e = msg.effects.length - 1; const eMax = 0; for (; e >= eMax; e--) {
            var icon = "";
            if (msg.effects[e].type == "Color") {
                icon = "fa-palette";
            } else if (msg.effects[e].type == "Shape") {
                icon = "fa-running";
            } else if (msg.effects[e].type == "Intensity") {
                icon = "fa-lightbulb";
            } else if (msg.effects[e].type == "Parameter") {
                icon = "fa-cog";
            }
            if (msg.effects[e].active == true) {
                div += "<li class=\"list-group-item fixtureEffect\"><i class=\"mr-1 far " + icon + "\"></i>" + msg.effects[e].name + "<button class=\"float-right btn btn-sm btn-primary d-inline-block\" onclick=\"viewEffectSettings(this, '" + msg.id + "', '" + msg.effects[e].id + "')\">Settings</button><button class=\"float-right btn btn-sm btn-success d-inline-block mr-1\" onclick=\"changeFixtureEffectState(this, '" + msg.id + "', '" + msg.effects[e].id + "')\">Deactivate</button></li>";
            } else {
                div += "<li class=\"list-group-item fixtureEffect\"><i class=\"mr-1 far " + icon + "\"></i>" + msg.effects[e].name + "<button class=\"float-right btn btn-sm btn-primary d-inline-block\" onclick=\"viewEffectSettings(this, '" + msg.id + "', '" + msg.effects[e].id + "')\">Settings</button><button class=\"float-right btn btn-sm btn-warning d-inline-block mr-1\" onclick=\"changeFixtureEffectState(this, '" + msg.id + "', '" + msg.effects[e].id + "')\">Activate</button></li>";
            }
        }
        div += "</ul></div>";
        $("#fixtureParameters").append(div);
    }
});

socket.on('fixtureSettings', function (fixture) {
    openTab('fixtureSettingsPage');
    $("#fixtureParametersBackBtn").off().on("click", function () { app.viewFixtureParameters(fixture.id); });
    $("#fixtureDeleteBtn").off().on("click", function () { removeFixture(fixture.id); });
    $("#fixtureSaveBtn").off().on("click", function () { saveFixtureSettings(fixture.id); });
    $("#fixtureNameInput").val(fixture.name);
    $("#fixtureShortNameInput").val(fixture.shortName);
    $("#fixtureDMXAddressInput").val(fixture.startDMXAddress);
});

socket.on('effectSettings', function (msg) {
    openTab('effectSettingsPage');
    $("#fixtureParametersEffectBackBtn").off().on("click", function () { app.viewFixtureParameters(msg.fixtureID); });
    $("#effectDeleteBtn").off().on("click", function () { removeEffect(msg.fixtureID, msg.effect.id); });
    $("#effectSaveBtn").off().on("click", function () { saveEffectSettings(msg.fixtureID, msg.effect.id); });
    $("#effectNameInput").val(msg.effect.name);
    $("#effectDepthInput").val(msg.effect.depth);
    $("#effectFanInput").val(msg.effect.fan);
});

socket.on('cues', function (cues) {
    app.cues = cues;
});

socket.on('presets', function (presets) {
    app.presets = presets;
});

socket.on('presetSettings', function (preset) {
    openTab('presetSettingsPage');
    $("#presetDeleteBtn").off().on("click", function () { removePreset(preset.id); });
    $("#presetSaveBtn").off().on("click", function () { savePresetSettings(preset.id); });
    $("#presetActiveBtn").off().on("click", function () { app.changePresetActive(preset.id); });
    $("#presetNameInput").val(preset.name);
    $("#presetIntensityInput").val(preset.intensity);
    if (preset.active) {
        $("#presetActiveBtn").html("Deactivate");
    } else {
        $("#presetActiveBtn").html("Activate");
    }
    $("#displayPresetAsDimmer").prop('checked', preset.displayAsDimmer);
    $("#presetIntensityInput").prop('presetID', preset.id);
});

socket.on('cueSettings', function (cue) {
    openTab('cueSettingsPage');
    $("#cueDeleteBtn").off().on("click", function () { removeCue(cue.id); });
    $("#cueSaveBtn").off().on("click", function () { saveCueSettings(cue.id); });
    $("#gotoCueBtn").off().on("click", function () { gotoCue(cue.id); });
    $("#cueUpdateBtn").off().on("click", function () { updateCue(cue.id); });
    $("#cueCloneEndBtn").off().on("click", function () { cloneCueEnd(cue.id); });
    $("#cueCloneNextBtn").off().on("click", function () { cloneCueNext(cue.id); });
    $("#moveCueUpBtn").off().on("click", function () { moveCueUp(cue.id); });
    $("#moveCueDownBtn").off().on("click", function () { moveCueDown(cue.id); });
    $("#cueNameInput").val(cue.name);
    $("#cueUpTimeInput").val(cue.upTime);
    $("#cueDownTimeInput").val(cue.downTime);
    $("#cueFollowInput").val(cue.follow);
});

socket.on('cueActionBtn', function (btnMode) {
    $("#cueActionBtn").empty();
    if (btnMode == false) {
        $("#cueActionBtn").off().on("click", function () { recordCue(); });
        $("#cueActionBtn").append("Record");
    } else {
        $("#cueActionBtn").off().on("click", function () { stopCue(); });
        $("#cueActionBtn").append("Stop");
    }
});

socket.on('groups', function (groups) {
    app.groups = groups;
});

socket.on('groupSettings', function (msg) {
    openTab('groupSettingsPage');
    $("#groupParametersBackBtn").off().on("click", function () { app.viewGroupParameters(msg.group.id); });
    $("#groupDeleteBtn").off().on("click", function () { removeGroup(msg.group.id); });
    $("#groupSaveBtn").off().on("click", function () { saveGroupSettings(msg.group.id); });
    $("#groupNameInput").val(msg.group.name);
    $("#groupFixtures").empty();
    let f = 0; const fMax = msg.groupFixtures.length; for (; f < fMax; f++) {
        $("#groupFixtures").append(msg.groupFixtures[f][0] + " (" + msg.groupFixtures[f][1] + ")");
        if (msg.groupFixtures.length > 1) {
            $("#groupFixtures").append(" <button class=\"btn btn-danger btn-sm mb-1\" onclick=\"removeGroupFixture('" + msg.group.id + "','" + msg.groupFixtures[f][2] + "')\"><i class=\"far fa-sm fa-trash-alt\"></i></button><br>");
        }
    }
});

socket.on('groupParameters', function (msg) {
    openTab('groupParametersPage');
    $("#groupParameters").empty();
    $("#groupParametersName").text(msg.name);
    $("#groupSettingsBtn").off().on("click", function () { viewGroupSettings(msg.id); });
    $("#groupResetBtn").off().on("click", function () { resetGroup(msg.id); });
    let c = 0; const cMax = msg.parameters.length; for (; c < cMax; c++) {
        $("#groupParameters").append("<label class=\"ml-2\" for=\"" + msg.parameters[c].type + "\">" + msg.parameters[c].name + ":</label><input type=\"range\" class=\"custom-range\" id=\"groupChan" + c + "\" max=\"" + msg.parameters[c].max + "\" min=\"" + msg.parameters[c].min + "\" value=\"" + msg.parameters[c].value + "\" oninput=\"updateGroupParameterValue(this, '" + msg.id + "', " + c + ")\">");
    }
});

socket.on('settings', function (settings) {
    $("#defaultUpTime").val(settings.defaultUpTime);
    $("#defaultDownTime").val(settings.defaultDownTime);
    $("#useUDMX").prop('checked', settings.udmx);
    $("#useAutomark").prop('checked', settings.automark);
    $("#sacnIP").val(settings.sacnIP);
    $("#artnetIP").val(settings.artnetIP);
    $('#openSettingsModal').modal("show");
});

socket.on('meta', function (metadata) {
    app.desktop = metadata.desktop;
    app.version = metadata.version;
    app.qrcode = metadata.qrcode;
    app.appURL = metadata.url;
});

socket.on('connect', function () {
    $('#serverDisconnectedModal').modal("hide");
});

socket.on('connect_error', function () {
    $('#serverDisconnectedModal').modal("show");
});

function resetFixtures() {
    bootbox.confirm("Are you sure you want to reset all fixture parameter values?", function (result) {
        if (result === true) {
            socket.emit('resetFixtures');
        }
    });
};

function resetFixture(fixtureID) {
    bootbox.confirm("Are you sure you want to reset this fixture's parameter values?", function (result) {
        if (result === true) {
            socket.emit('resetFixture', fixtureID);
        }
    });
};

function addFixtureModal() {
    socket.emit('getFixtureProfiles');
}

function getShowModal() {
    socket.emit('getShowsFromUSB');
}

function openFixtureDefinitionModal() {
    $('#openFixtureDefinitionModal').modal("show");
}

function viewFixtureSettings(fixtureID) {
    socket.emit('getFixtureSettings', fixtureID);
}

function viewEffectSettings(self, fixtureID, effectID) {
    socket.emit('getEffectSettings', { fixtureID: fixtureID, effectID: effectID });
}

function getEffects(fixtureID) {
    socket.emit('getEffects', fixtureID);
}

function updateFixtureParameterValue(self, fixtureID, parameterID) {
    socket.emit('changeFixtureParameterValue', { id: fixtureID, pid: parameterID, value: self.value });
}

function updateFixtureParameterLock(self, fixtureID, parameterID) {
    socket.emit('changeFixtureParameterLock', { id: fixtureID, pid: parameterID });
}

function useFixtureChip(self, fixtureID, chipID) {
    socket.emit('useFixtureChip', { id: fixtureID, pid: chipID });
}

function changeFixtureEffectState(self, fixtureID, effectID) {
    socket.emit('changeFixtureEffectState', { id: fixtureID, effectid: effectID });
}

function removeFixture(fixtureID) {
    bootbox.confirm("Are you sure you want to delete this fixture?", function (result) {
        if (result === true) {
            socket.emit('removeFixture', fixtureID);
            openTab('fixtures');
        }
    });
}

function removeEffect(fixtureID, effectID) {
    bootbox.confirm("Are you sure you want to delete this effect?", function (result) {
        if (result === true) {
            socket.emit('removeEffect', { fixtureID: fixtureID, effectID: effectID });
            app.viewFixtureParameters(fixtureID);
        }
    });
}

function saveFixtureSettings(fixtureID) {
    socket.emit('editFixtureSettings', { id: fixtureID, name: $("#fixtureNameInput").val(), shortName: $("#fixtureShortNameInput").val(), startDMXAddress: $("#fixtureDMXAddressInput").val() });
}

function saveEffectSettings(fixtureID, effectID) {
    socket.emit('editEffectSettings', { fixtureID: fixtureID, effectID: effectID, name: $("#effectNameInput").val(), depth: $("#effectDepthInput").val(), fan: $("#effectFanInput").val() });
}

function removeCue(cueID) {
    bootbox.confirm("Are you sure you want to delete this cue?", function (result) {
        if (result === true) {
            socket.emit('removeCue', cueID);
            openTab('cues');
        }
    });
}

function saveCueSettings(cueID) {
    socket.emit('editCueSettings', { id: cueID, name: $("#cueNameInput").val(), upTime: $("#cueUpTimeInput").val(), downTime: $("#cueDownTimeInput").val(), follow: $("#cueFollowInput").val() });
}

function recordCue() {
    socket.emit('recordCue');
}

function nextCue() {
    socket.emit('nextCue');
}

function lastCue() {
    socket.emit('lastCue');
}

function stopCue() {
    socket.emit('stopCue');
}

function gotoCue(cueID) {
    socket.emit('gotoCue', cueID);
}

function updateCue(cueID) {
    socket.emit('updateCue', cueID);
}

function cloneCueEnd(cueID) {
    socket.emit('cloneCueEnd', cueID);
}

function cloneCueNext(cueID) {
    socket.emit('cloneCueNext', cueID);
}

function moveCueUp(cueID) {
    socket.emit('moveCueUp', cueID);
}

function moveCueDown(cueID) {
    socket.emit('moveCueDown', cueID);
}

function removePreset(presetID) {
    bootbox.confirm("Are you sure you want to delete this preset?", function (result) {
        if (result === true) {
            socket.emit('removePreset', presetID);
            openTab('presets');
        }
    });
}

function viewPresetSettings(presetID) {
    socket.emit('getPresetSettings', presetID);
}

function savePresetSettings(presetID) {
    socket.emit('editPresetSettings', { id: presetID, name: $("#presetNameInput").val(), displayAsDimmer: $("#displayPresetAsDimmer").prop('checked') });
}

function resetGroup(groupID) {
    bootbox.confirm("Are you sure you want to reset this group's parameter values?", function (result) {
        if (result === true) {
            socket.emit('resetGroup', groupID);
        }
    });
};

function resetGroups() {
    bootbox.confirm("Are you sure you want to reset all group parameter values?", function (result) {
        if (result === true) {
            socket.emit('resetGroups');
        }
    });
};

function addGroupModal() {
    $('#groupFixtureIDs').multiselect('deselectAll');
    $('#addGroupModal').modal("show");
}

function updateGroupParameterValue(self, groupID, parameterID) {
    socket.emit('changeGroupParameterValue', { id: groupID, pid: parameterID, value: self.value });
}

function removeGroup(groupID) {
    bootbox.confirm("Are you sure you want to delete this group?", function (result) {
        if (result === true) {
            socket.emit('removeGroup', groupID);
            openTab('groups');
        }
    });
}

function saveGroupSettings(groupID) {
    socket.emit('editGroupSettings', { id: groupID, name: $("#groupNameInput").val(), fixtureIDs: $("#groupFixtureIDsInput").val() });
}

function addGroup() {
    socket.emit('addGroup', $("#groupFixtureIDs").val());
    document.getElementById("groupFixtureIDs").selectedIndex = "-1";
    $('#addGroupModal').modal("hide");
}

function viewGroupSettings(groupID) {
    socket.emit('getGroupSettings', groupID);
}

function openShowFileModal() {
    $('#openShowModal').modal("show");
}

function openAboutModal() {
    $('#openAboutModal').modal("show");
}

function openSettingsModal() {
    socket.emit('getSettings');
    $('#openSettingsModal').modal("show");
}

function removeGroupFixture(groupID, fixtureID) {
    bootbox.confirm("Are you sure you want to remove this fixture from this group?", function (result) {
        if (result === true) {
            socket.emit('removeGroupFixture', { group: groupID, fixture: fixtureID });
        }
    });
}

function resetShow() {
    bootbox.confirm("Are you sure you want a new show? This will reset everything.", function (result) {
        if (result === true) {
            socket.emit('resetShow');
            openTab('fixtures');
        }
    });
}

function resetPresets() {
    bootbox.confirm("Are you sure you want to reset the presets?", function (result) {
        if (result === true) {
            socket.emit('resetPresets');
            openTab('presets');
        }
    });
}

function updateFixtureProfiles() {
    bootbox.confirm("Are you sure you want to update your show's fixture profiles? You should save the current show first. This will probably cause a blackout", function (result) {
        if (result === true) {
            socket.emit('updateFixtureProfiles');
            openTab('fixtures');
        }
    });
}

function saveSettingsBackground() {
    socket.emit('saveSettings', { defaultUpTime: $("#defaultUpTime").val(), defaultDownTime: $("#defaultDownTime").val(), udmx: $("#useUDMX").prop('checked'), automark: $("#useAutomark").prop('checked'), sacnIP: $("#sacnIP").val(), artnetIP: $("#artnetIP").val() });
}

function updateFirmware() {
    socket.emit('updateFirmware');
}

function saveShowToUSB() {
    bootbox.prompt("Show Name: ", function (result) {
        if (result.trim() != "") {
            socket.emit('saveShowToUSB', result);
        } else {
            bootbox.alert("You must enter a show name!");
        }
    });
}

function shutdown() {
    socket.emit('shutdown');
}

function reboot() {
    socket.emit('reboot');
}

function closeAlert() {
    $("#alert").removeClass("show");
    if ($("#alert").hasClass("alert-info")) {
        $("#alert").removeClass("alert-info")
    } else {
        $("#alert").removeClass("alert-danger")
    }
}

function openTab(tabName) {
    // Declare all variables
    var i, tabcontent, tablinks;

    // Get all elements with class="tabcontent" and hide them
    tabcontent = document.getElementsByClassName("tabcontent");
    for (i = 0; i < tabcontent.length; i++) {
        tabcontent[i].style.display = "none";
    }

    if (document.getElementsByClassName("tabitem-" + tabName)[0]) {
        // Get all elements with class="tablinks" and remove the class "active"
        tablinks = document.getElementsByClassName("tabitem");
        for (i = 0; i < tablinks.length; i++) {
            tablinks[i].classList.remove("active");
        }
    }

    // Show the current tab, and add an "active" class to the button that opened the tab
    document.getElementById(tabName).style.display = "block";
    currentTab = tabName;
    if (currentTab == "fixtures") {
        app.fixtures = backupFixtures;
    }

    if (document.getElementsByClassName("tabitem-" + tabName)[0]) {
        document.getElementsByClassName("tabitem-" + tabName)[0].classList.add("active");
    }

    closeAlert();
    if (tabName == 'groups') {
        $('#groupFixtureIDs').multiselect('rebuild');
    }
}

function searchFixtureProfiles() {
    var input, filter, ul, li, a, i, txtValue;
    input = document.getElementById('searchFixtureProfiles');
    filter = input.value.toUpperCase();
    ul = document.getElementById("fixtureProfilesList");
    li = ul.getElementsByTagName('li');

    // Loop through all list items, and hide those who don't match the search query
    for (i = 0; i < li.length; i++) {
        a = li[i];
        txtValue = a.textContent || a.innerText;
        if (txtValue.toUpperCase().indexOf(filter) > -1) {
            li[i].style.display = "";
        } else {
            li[i].style.display = "none";
        }
    }
}

$('.custom-file-input').change(function () {
    var fileName = $(this).val().split('\\').pop();
    $(this).next('.custom-file-label').html(fileName);
});
