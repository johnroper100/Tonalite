# Changing Cue Settings

You can access the settings for a cue by clicking on it in the list on the `Cues` > `Cues` sub-tab.

![Cue settings](../images/cue_settings.png)

## Top Bar

### Go

Transition to this specific cue.

### Delete

Remove this cue from the show. You will be prompted to make sure that you want to do this.

### Clone To End

Duplicate this cue and place it at the end of the cue list. The new cloned cue will have the same settings and fixture values as the cue that is being cloned.

### Clone To Next

Make a duplicate of this cue and place it after this cue in the cue list. The new cloned cue will have the same settings and fixture values as the cue that is being cloned.

### Update Parameters

Update this cue to use the current values of the show's fixture parameters.

### Move Up In Stack

Move this cue forward in the cue list.

### Move Down In Stack

Move this cue backward in the cue list.

## Inputs

### Name

The name of the cue. You can use this to describe when the cue should be run.

### Up Time

The time it takes for fixture values to change between cues if they are increasing.

### Down Time

The time it takes for fixture values to change between cues if they are decreasing.

### Follow

If this is set to a value greater than `-1`, once the cue has been run, the cue following it will be run after the time specified here (in seconds).

### Include Intensitity/Color

Allow this cue to control the intensity and color parameters of fixtures.

### Include Position

Allow this cue to control the position parameters of fixtures.

### Include Beam

Allow this cue to control the beam parameters of fixtures.