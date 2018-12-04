# Configuration

You can find the system configuration in the `settings.json` file.

## device

The platform that the user is running on.

Options:

- `linux` - Linux 64bit
- `win` - Windows 64bit
- `macos` - macOS 64bit
- `rpi` - Raspberry Pi

Restart required after change.

## url

The IP address of the web server that runs the control page. This is also used as the ArtNet and sACN output IPs.

Restart required after change.

## port

The IP port of the web server that runs the control page.

Restart required after change.

## defaultUpTime

The default up time used for new cues.

## defaultDownTime

The default down time used for cues.

## desktop

The platform Tonalite is running on.

Options:

- `true` - Tonalite is running in desktop mode
- `false` - Tonalite is running in embeded mode (used for the touchscreen model)
  
Restart required after change.

## udmx

Whether or not to output to uDMX.

Options:

- `true` - Enables uDMX-Artnet
- `false` - disables uDMX-Artnet

Restart required after change.

## artnetIP

The IP on which to output ArtNet data.

Default: `null`

When the value is `null`, ArtNet will choose where to output automatically.

## sacnIP

The IP on which to output sACN data.

Default: `null`

When the value is `null`, sACN will choose where to output automatically.