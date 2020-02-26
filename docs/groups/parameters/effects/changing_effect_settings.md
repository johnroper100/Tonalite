# Changing Effect Settings

You can change various settings of an effect.
You can access an effect's setting page by clicking the `Settings` button on the effects's display row on a groups's parameters page.

![Effects settings page](../../../images/effect_settings.png)

## Top Bar

### Back

Go back to the groups's parameters.

### Delete

Remove the effect from the show. You will be prompted to make sure you want to do this.

## Inputs

### Name

The full name of the effect. This can be any length needed to be descriptive.

### Speed

A multiplier for the speed of the effect.

### Depth

How much this effect affects the group's fixtures that it is applied to. Depth is in a range of `0.0` to `1.0` where `0.0` is the least effect, and `1.0` means that this effect completely overrides the values from the group. If depth is between `0.0` and `1.0`, the values of the effect and the values of the group are mixed. This is useful when used on position effects to scale the shape produced to fit your stage.

### Fan

How much this effect is spread out over the group's fixtures. The higher this value is, the more the effect is spread out. When the value is `0` all the lights in the group will share the same values. The order of the lights in the group affects the ordering of the effect when using fan.