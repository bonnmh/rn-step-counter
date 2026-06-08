# Changelog

## [1.1.1] - 2026-06-08

### Changed

- Republished on npm; identical to 1.1.0 (no API or native changes).

## [1.1.0] - 2026-06-08

### Added

- `queryPedometerDataBetweenDates(start, end)` — iOS Core Motion range query (additive; live session unchanged).
- `addStepCounterErrorListener`, `addStepsSensorInfoListener`, and `addStepDetectedListener` for native events.
- `isSensorWorking()` — reports whether the library has an active live subscription.
- Optional `calories` on `StepCountData` and optional `working` on `isStepCountingSupported()` (Android).

## [1.0.2] - 2026-06-08

### Changed

- Expanded npm keywords for step counter, pedometer, and Core Motion discoverability.
- README links to npm and GitHub; added community and Stack Overflow templates.

## [1.0.1] - 2026-06-07

### Fixed

- Repository and homepage metadata now point to `https://github.com/bonnmh/rn-step-counter`.
- Example app resolves the local workspace package reliably in Metro.

## [1.0.0] - 2026-06-06

### Features

- React Native TurboModule for step counting on Android (hardware step counter + accelerometer fallback) and iOS (Core Motion).
- Public API: `isStepCountingSupported`, `startStepCounterUpdate`, `stopStepCounterUpdate`, `createStepCountFilter`, `parseStepData`.
- Example app with permission handling and live step UI.
