# Configuration

You can find the system configuration in the `settings.json` file.

## device

The platform that the user is running on.

Options:

- `linux` - Linux 64bit
- `win` - Windows 64bit
- `macos` - macOS 64bit
- `rpi` - Raspberry Pi

Reboot required after change.

## url

The IP address of the web server that runs the control page. This is also used as the ArtNet and sACN output IPs.

Reboot required after change.

## port

The IP port of the web server that runs the control page.

Reboot required after change.

## defaultUpTime

The default up time used for new cues.

## defaultDownTime

The default down time used for cues.

## defaultPresetMode

TODO

## desktop

The platform Tonalite is running on.

Options:

- `true` - Tonalite is running in desktop mode
- `false` - Tonalite is running in embeded mode (used for the touchscreen model)
  
Reboot required after change.

## udmx

Whether or not to output to uDMX.

Options:

- `true` - Enables uDMX-Artnet
- `false` - disables uDMX-Artnet

Reboot required after change.

## automark

Whether or not to use automark while transitioning cues.

Options:

- `true` - Enables automark
- `false` - disables automark

## displayEffectsRealtime

TODO

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