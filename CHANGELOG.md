# Changelog

## [2.0.0] - 2026-11-10

### Breaking / Behavioral Changes

- **Android `AndroidManifest.xml` & Gradle toolchain:** Removed `android.permission.BODY_SENSORS_BACKGROUND` and the deprecated `package` attribute, changed `android.hardware.sensor.accelerometer` to `android:required="false"`, and upgraded the Android library build target to Java 17 / Kotlin 2.1.
- **Android `CounterType` runtime values:** Standardized Android `counterType` payloads to `"STEP_COUNTER"` and `"ACCELEROMETER"` (matching the exported TypeScript `CounterType` union instead of `"Step Counter"` / `"Accelerometer"`).
- **Android persistent session baselines & initial seed event:** `StepCounterService` now persists hardware baselines per `startDate` (with `BOOT_COUNT` reboot continuity) so calling `startStepCounterUpdate(startOfToday())` across app restarts continues accumulating from the day's baseline and recovers steps counted by `TYPE_STEP_COUNTER` while the process was stopped. Both Android sensor services now emit an initial seed `stepCounterUpdate` immediately upon `startStepCounterUpdate`, matching iOS.
- **`isStepCountingSupported()` on Android:** No longer emits a spurious `StepCounter.stepDetected` event during read-only permission checks, and reports `ACTIVITY_RECOGNITION` permission accurately on Android 10+ (API 29+) devices with hardware `TYPE_STEP_COUNTER`.

### Added

- Optional `authorizationStatus` (`"notDetermined"` | `"restricted"` | `"denied"` | `"authorized"` | `"unknown"`) on `isStepCountingSupported()` and `StepsSensorInfoIOS`, allowing apps to distinguish never-prompted vs denied Core Motion permission states.
- Typed `wakeUpSensor` and `additionalInfoSupported` fields on `StepsSensorInfoAndroid`.

### Fixed

- **Android sensor clock-domain skew & dynamic upgrade:** `SensorListenService` handles OEM sensor HALs that report `SensorEvent.timestamp` in `CLOCK_MONOTONIC` instead of `CLOCK_BOOTTIME` without freezing `endDate`, guarantees monotonic `endDate` progression across accepted step updates, and automatically upgrades from `AccelerometerService` to `StepCounterService` once `ACTIVITY_RECOGNITION` is granted.
- **`createStepCountFilter` accuracy & sensor transition safety:** Fused `CMPedometer` updates and Android hardware `STEP_COUNTER` batches bypass synthetic cadence burst rejection, `ACCELEROMETER` keeps burst filtering active all day, filter state (`ignoredSteps`, `ignoredDistance`) resets cleanly when `counterType` or `startDate` changes, and `calories` rebases alongside `steps`.
- **Lazy `NativeEventEmitter` initialization:** Deferred `new NativeEventEmitter(...)` creation until an event listener is registered so importing pure utilities (`createStepCountFilter`, `parseStepData`, constants) never crashes when the native module is unlinked or mocked.
- **iOS `CMPedometer` concurrency, range safety & lifecycle cleanup:** Added session generation guards in `StepCounter.mm` so stale seed queries cannot emit updates or errors after `stopStepCounterUpdate()`, clamped all future `from` timestamps to `now`, avoided unprotected reads of `_sessionStartDate`, replaced `NSNull` placeholders, serialized `NSError` payloads for Bridgeless/New Architecture, and implemented `invalidate()` teardown on both iOS and Android.

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
