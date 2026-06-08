# Changelog

## [1.0.1] - 2026-06-07

### Fixed

- Repository and homepage metadata now point to `https://github.com/bonnmh/rn-step-counter`.
- Example app resolves the local workspace package reliably in Metro.

## [1.0.0] - 2026-06-06

### Features

- React Native TurboModule for step counting on Android (hardware step counter + accelerometer fallback) and iOS (Core Motion).
- Public API: `isStepCountingSupported`, `startStepCounterUpdate`, `stopStepCounterUpdate`, `createStepCountFilter`, `parseStepData`.
- Example app with permission handling and live step UI.
