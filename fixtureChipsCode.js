if (fixture.colortable == "3874B444-A11E-47D9-8295-04556EAEBEA7") {
    // RGB
    colortable = JSON.parse(JSON.stringify(require(process.cwd() + "/chips.json")));
    let col = 0; const colMax = colortable.length; for (; col < colMax; col++) {
        color = { color: colortable[col].color, parameters: [] };

        color.parameters.push({ name: "Red", value: colortable[col].parameters[0] });
        color.parameters.push({ name: "Green", value: colortable[col].parameters[1] });
        color.parameters.push({ name: "Blue", value: colortable[col].parameters[2] });

        fixture.chips.push(color);
    }
} else if (fixture.colortable == "77A82F8A-9B24-4C3F-98FC-B6A29FB1AAE6") {
    // RGBW
    colortable = JSON.parse(JSON.stringify(require(process.cwd() + "/chips.json")));
    let col = 0; const colMax = colortable.length; for (; col < colMax; col++) {
        color = { color: colortable[col].color, parameters: [] };

        w = Math.min(colortable[col].parameters[0], colortable[col].parameters[1], colortable[col].parameters[2]);

        color.parameters.push({ name: "Red", value: colortable[col].parameters[0] - w });
        color.parameters.push({ name: "Green", value: colortable[col].parameters[1] - w });
        color.parameters.push({ name: "Blue", value: colortable[col].parameters[2] - w });
        color.parameters.push({ name: "White", value: w });

        fixture.chips.push(color);
    }
} else if (fixture.colortable == "D3E71EC8-3406-4572-A64C-52A38649C795") {
    // RGBA
    colortable = JSON.parse(JSON.stringify(require(process.cwd() + "/chips.json")));
    let col = 0; const colMax = colortable.length; for (; col < colMax; col++) {
        color = { color: colortable[col].color, parameters: [] };

        w = Math.min(colortable[col].parameters[0], colortable[col].parameters[1], colortable[col].parameters[2]);
        a = cppaddon.getAFromRGB(colortable[col].parameters[0], colortable[col].parameters[1], colortable[col].parameters[2]);

        color.parameters.push({ name: "Red", value: colortable[col].parameters[0] - a });
        color.parameters.push({ name: "Green", value: colortable[col].parameters[1] - a / 2 });
        color.parameters.push({ name: "Blue", value: colortable[col].parameters[2] });
        color.parameters.push({ name: "Amber", value: a });

        fixture.chips.push(color);
    }
} else if (fixture.colortable == "C7A1FB0A-AA23-468F-9060-AC1625155DE8") {
    // RGBAW
    colortable = JSON.parse(JSON.stringify(require(process.cwd() + "/chips.json")));
    let col = 0; const colMax = colortable.length; for (; col < colMax; col++) {
        color = { color: colortable[col].color, parameters: [] };

        w = Math.min(colortable[col].parameters[0], colortable[col].parameters[1], colortable[col].parameters[2]);
        a = cppaddon.getAFromRGB(colortable[col].parameters[0], colortable[col].parameters[1], colortable[col].parameters[2]);

        color.parameters.push({ name: "Red", value: colortable[col].parameters[0] - w - a });
        color.parameters.push({ name: "Green", value: colortable[col].parameters[1] - w - a / 2 });
        color.parameters.push({ name: "Blue", value: colortable[col].parameters[2] - w });
        color.parameters.push({ name: "Amber", value: a });
        color.parameters.push({ name: "White", value: w });

        fixture.chips.push(color);
    }
} else if (fixture.colortable == "EF4970BA-2536-4725-9B0F-B2D7A021E139") {
    // CMY
    colortable = JSON.parse(JSON.stringify(require(process.cwd() + "/chips.json")));
    let col = 0; const colMax = colortable.length; for (; col < colMax; col++) {
        color = { color: colortable[col].color, parameters: [] };

        color.parameters.push({ name: "Cyan", value: 100 - colortable[col].parameters[0] });
        color.parameters.push({ name: "Magenta", value: 100 - colortable[col].parameters[1] });
        color.parameters.push({ name: "Yellow", value: 100 - colortable[col].parameters[2] });

        fixture.chips.push(color);
    }
} /*else if (fixture.colortable == "B074A2D3-0C40-45A7-844A-7C2721E0B267") {
    // HSI
    colortable = JSON.parse(JSON.stringify(require(process.cwd() + "/chips.json")));
    let col = 0; const colMax = colortable.length; for (; col < colMax; col++) {
        color = { color: colortable[col].color, parameters: [] };

        r = colortable[col].parameters[0];
        g = colortable[col].parameters[1];
        b = colortable[col].parameters[2];

        r = cppaddon.mapRange(r, 0, 100, 0, 1);
        g = cppaddon.mapRange(g, 0, 100, 0, 1);
        b = cppaddon.mapRange(b, 0, 100, 0, 1);
        i = (r + g + b) / 3.0;

        rn = r / (r + g + b);
        gn = g / (r + g + b);
        bn = b / (r + g + b);

        h = Math.acos((0.5 * ((rn - gn) + (rn - bn))) / (Math.sqrt((rn - gn) * (rn - gn) + (rn - bn) * (gn - bn))));
        if(b > g)
        {
            h = 2 * Math.PI - h;	
        }

        s = 1 - 3 * Math.min(rn, Math.min(gn, bn));

        color.parameters.push({ name: "Hue", value: h });
        color.parameters.push({ name: "Saturation", value: s });
        color.parameters.push({ name: "Intensity", value: i });

        fixture.chips.push(color);
    }
}*/

socket.on('useFixtureColorPalette', function (msg) {
    if (fixtures.length != 0) {
        if (fixtures.some(e => e.id === msg.id)) {
            var fixture = fixtures[fixtures.map(el => el.id).indexOf(msg.id)];
            var chip = fixture.chips[msg.pid];
            let c = 0; const cMax = chip.parameters.length; for (; c < cMax; c++) {
                fixture.parameters[fixture.parameters.map(el => el.name).indexOf(chip.parameters[c].name)].value = (fixture.parameters[fixture.parameters.map(el => el.name).indexOf(chip.parameters[c].name)].max / 100.0) * chip.parameters[c].value;
                fixture.parameters[fixture.parameters.map(el => el.name).indexOf(chip.parameters[c].name)].displayValue = chip.parameters[c].value;
            }
            io.emit('fixtures', { fixtures: cleanFixtures(), target: true });
        } else {
            socket.emit('message', { type: "error", content: "This fixture does not exist!" });
        }
    } else {
        socket.emit('message', { type: "error", content: "No fixtures exist!" });
    }
});