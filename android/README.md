# Android sensors

Reference notes for the sensor types used by this library.

- [Motion sensors (Android Developers)](https://developer.android.com/guide/topics/sensors/sensors_motion)
- [Sensor types (AOSP)](https://source.android.com/docs/core/interaction/sensors/sensor-types)

## TYPE_ACCELEROMETER

| Index | Description |
|-------|-------------|
| `values[0]` | Acceleration on the X axis, including gravity (m/s²) |
| `values[1]` | Acceleration on the Y axis, including gravity (m/s²) |
| `values[2]` | Acceleration on the Z axis, including gravity (m/s²) |

Used by the accelerometer fallback when `TYPE_STEP_COUNTER` is unavailable.

## TYPE_STEP_COUNTER

| Index | Description |
|-------|-------------|
| `values[0]` | Steps since last reboot while the sensor was active |

This is the preferred Android data source. The module converts cumulative counter readings into session step counts.

## TYPE_STEP_DETECTOR

Not used directly by this library. Step detection is handled in software when falling back to the accelerometer.

## TYPE_SIGNIFICANT_MOTION

Not used by this library.

## Other sensor types

The sections below are retained as general Android sensor reference material and are not required for integration.

### TYPE_ACCELEROMETER_UNCALIBRATED

Six-axis uncalibrated accelerometer values (m/s²).

### TYPE_GRAVITY

Gravity vector on X, Y, and Z axes (m/s²).

### TYPE_GYROSCOPE / TYPE_GYROSCOPE_UNCALIBRATED

Rotation rate around X, Y, and Z axes (rad/s).

### TYPE_LINEAR_ACCELERATION

Device acceleration with gravity removed (m/s²).

### TYPE_ROTATION_VECTOR

Rotation vector components used for orientation fusion.
