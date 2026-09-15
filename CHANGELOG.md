# Changelog

## [1.3.0] - 2026-09-15

### Fixed

- iOS live `startStepCounterUpdate` now emits **cumulative** `steps` from `sessionStartDate`, matching `distance` and `queryPedometerDataBetweenDates`. Previously `steps` was a delta from a session-start baseline, so apps that `Math.max` live events against today's stored total never updated the ring.
- `createStepCountFilter` no longer treats fused CMPedometer batches as bursts when the batch window (`startDate`→`endDate`) is long enough for the new steps. Add `enabled: false` to skip cadence filtering.

## [1.2.1](https://github.com/bonnmh/rn-step-counter/compare/v1.2.0...v1.2.1) (2026-08-12)

### Features

* ✨ add release workflow and scripts for automated versioning ([88012d8](https://github.com/bonnmh/rn-step-counter/commit/88012d84a88b3b5f169f34e83d09f8872d332fc8))

### Bug Fixes

* ♻️ use correct CMPedometer event update APIs on iOS ([2171f4a](https://github.com/bonnmh/rn-step-counter/commit/2171f4ac4e19330f316b783a85a7587db8355232))

## [1.2.0] - 2026-06-12

### Added

- iOS `StepCountData` optional fields: `currentPaceSecPerM`, `averageActivePaceSecPerM`, `currentCadenceStepsPerSec` (from `CMPedometerData` when available).
- `addPedometerEventListener` — subscribe to `StepCounter.pedometerEvent` pause/resume events via `CMPedometer.startEventUpdates`.
- `pedometerEventName` constant and `PedometerEvent` / `PedometerEventType` types.
- `StepsSensorInfoIOS.pedometerEventTracking` capability flag.

### Fixed

- iOS live `startStepCounterUpdate` no longer emits `StepCounter.stepDetected` on each batch update. `stepDetected` remains a per-motion pulse from `SOMotionDetecter` via the native `startStepsDetection` path only.
- iOS pedometer pause/resume events use Core Motion `startEventUpdates` during live sessions (`startStepCounterUpdate` / `stopStepCounterUpdate`). There is no accelerometer fallback for pedometer events.

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
