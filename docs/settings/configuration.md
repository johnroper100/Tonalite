# Configuration

You can find the system configuration in the `settings.json` file.

## serverIP

The IP address of the webserver that runs the control page. This is also used as the ArtNet and sACN output IPs.

When this is set to `localhost`, the server will automatically use the local ip of the computer it is running on.

Default: `localhost`

Reboot required after change.

## serverPort

The IP port of the webserver that runs the control page.

Default: `3000`

Reboot required after change.

## defaultUpTime

The default up time used for new cues and sequence steps.

Default: `3000`

## defaultDownTime

The default down time used for new cues and sequence steps.

Default: `3000`

## defaultPresetMode

The default mode used for new presets.

Options:

- `ltp` - Latest Takes Precedence
- `htp` - Highest Takes Precedence

Default: `ltp`

## desktop

The platform Tonalite is running on.

Options:

- `true` - Tonalite is running in desktop mode
- `false` - Tonalite is running in embedded mode (used for the touchscreen model)

Default: `true`
  
Reboot required after change.

## openBrowserOnStart

Open a browser to the web UI automatically on start. This only runs when `device` is set to `desktop`.

Options:

- `true` - The browser will be opened automatically on start
- `false` - The browser will not be opened

Default: `true`

## udmx

Whether or not to output to uDMX.

Options:

- `true` - Enables uDMX-Artnet
- `false` - disables uDMX-Artnet

Default: `false`

Reboot required after change.

## automark

Whether or not to use automark while transitioning cues.

Options:

- `true` - Enables automark
- `false` - Disables automark

Default: `true`

## displayEffectsRealtime

Display effect values in the UI as they run while active. This can slow down the interface.

Default: `true`

## interfaceMode

Allows you to choose to see all controls or only those needed for an all-dimmer rig.

Options:

- `normal` - Displays all available controls in the UI
- `dimmer` - Only displays controls needed for dimmers

Default: `normal`

## artnetIP

The IP on which to output ArtNet data.

Default: `null`

When the value is `null`, ArtNet will choose where to output automatically.

Reboot required after change.

## artnetHost

The host IP mask on which to output ArtNet data.

Default: `255.255.255.255`

Reboot required after change.

## sacnIP

The IP on which to output sACN data.

Default: `null`

When the value is `null`, sACN will choose where to output automatically.

Reboot required after change.

## sacnPriority

The device priority for the sACN output.

Default: `100`

The device priotity can be in a range from `1` to `200`.

Reboot required after change.