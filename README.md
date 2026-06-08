# @blife/rn-step-counter

[![npm version](https://img.shields.io/npm/v/@blife/rn-step-counter.svg)](https://www.npmjs.com/package/@blife/rn-step-counter)
[![npm downloads](https://img.shields.io/npm/dm/@blife/rn-step-counter.svg)](https://www.npmjs.com/package/@blife/rn-step-counter)
[![license](https://img.shields.io/github/license/bonnmh/rn-step-counter)](https://github.com/bonnmh/rn-step-counter/blob/main/LICENSE)

A React Native TurboModule for live step counting on iOS and Android.

- **npm:** [@blife/rn-step-counter](https://www.npmjs.com/package/@blife/rn-step-counter)
- **Source:** [github.com/bonnmh/rn-step-counter](https://github.com/bonnmh/rn-step-counter)

## Features

- **iOS** — Core Motion (`CMPedometer`) with floors ascended/descended when available
- **Android** — Hardware step counter (`TYPE_STEP_COUNTER`) with accelerometer fallback
- **New Architecture** — TurboModule / Fabric (required)
- **Live updates** — Event-based API with start/stop lifecycle
- **Historical query (iOS)** — `queryPedometerDataBetweenDates()` for cumulative steps in a date range
- **Native events** — Optional listeners for errors, sensor metadata, and step detection
- **Optional filtering** — `createStepCountFilter()` reduces false positives from rapid motion
- **Utilities** — `parseStepData()` for display-friendly formatting

## Requirements

| | |
|---|---|
| React Native | `>= 0.71.0` |
| Architecture | New Architecture (TurboModules) |
| Expo | Not supported in Expo Go (native module) |
| Autolinking | React Native 0.60+ |

## Installation

```bash
npm install @blife/rn-step-counter
```

```bash
yarn add @blife/rn-step-counter
# or
pnpm add @blife/rn-step-counter
# or
bun add @blife/rn-step-counter
```

Rebuild the native app after installing:

```bash
# iOS
cd ios && pod install && cd ..

# Android / iOS
npx react-native run-android
npx react-native run-ios
```

## Platform setup

### Android

Add permissions and sensor features to your app manifest if they are not already present:

```xml
<uses-permission android:name="android.permission.ACTIVITY_RECOGNITION" />

<uses-feature
  android:name="android.hardware.sensor.stepcounter"
  android:required="false" />
<uses-feature
  android:name="android.hardware.sensor.accelerometer"
  android:required="true" />
```

Request runtime permission before starting updates. The library reports permission status via `isStepCountingSupported()`.

### iOS

Add a motion usage description to your app's `Info.plist`:

```xml
<key>NSMotionUsageDescription</key>
<string>This app uses motion data to count your steps.</string>
```

## Quick start

```tsx
import { useEffect, useState } from "react";
import {
  createStepCountFilter,
  isStepCountingSupported,
  parseStepData,
  startStepCounterUpdate,
  stopStepCounterUpdate,
} from "@blife/rn-step-counter";

export function StepCounterScreen() {
  const [steps, setSteps] = useState(0);

  useEffect(() => {
    let active = true;

    (async () => {
      const { supported, granted } = await isStepCountingSupported();
      if (!active || !supported || !granted) {
        return;
      }

      const filter = createStepCountFilter();

      startStepCounterUpdate(new Date(), (data) => {
        const filtered = filter(data);
        if (!filtered) {
          return;
        }
        setSteps(filtered.steps);
      });
    })();

    return () => {
      active = false;
      stopStepCounterUpdate();
    };
  }, []);

  return null; // render your UI, e.g. parseStepData(...)
}
```

See the full example app: [`example/src/App.tsx`](./example/src/App.tsx).

## API

### `isStepCountingSupported()`

Returns `Promise<{ supported: boolean; granted: boolean; working?: boolean }>`.

- `supported` — device can count steps (hardware sensor or fallback)
- `granted` — required motion/activity permission has been granted
- `working` — Android only: whether the native sensor service is currently active

### `queryPedometerDataBetweenDates(start, end)` (iOS only)

Queries cumulative step data for the given range using Core Motion. Returns `Promise<StepCountData>`.

Apple retains roughly seven days of pedometer history; older ranges may return partial data. Does not interfere with an active live session. On Android, throws `UnavailabilityError`.

```tsx
import { queryPedometerDataBetweenDates } from "@blife/rn-step-counter";

const start = new Date();
start.setHours(0, 0, 0, 0);
const today = await queryPedometerDataBetweenDates(start, new Date());
```

### `startStepCounterUpdate(start, callback)`

Starts native step updates from `start` (JavaScript `Date`) and invokes `callback` with `StepCountData` on each event.

Returns an `EventSubscription`. Call `stopStepCounterUpdate()` to stop.

### `stopStepCounterUpdate()`

Stops the active native session and removes the library's event subscription.

### `isSensorWorking()`

Returns `true` when this library has an active subscription from `startStepCounterUpdate`. This reflects the JS-managed session, not Android's native `working` flag.

### Event listeners

Subscribe to native events with the helpers below. Each returns an `EventSubscription`.

```tsx
import {
  addStepCounterErrorListener,
  addStepsSensorInfoListener,
  addStepDetectedListener,
} from "@blife/rn-step-counter";

const errorSub = addStepCounterErrorListener((error) => {
  console.warn(error.message);
});
errorSub.remove();
```

- `addStepCounterErrorListener` — `StepCounter.errorOccurred` (iOS Core Motion errors)
- `addStepsSensorInfoListener` — `StepCounter.stepsSensorInfo` (capability metadata; fired from `isStepCountingSupported` on iOS and when the Android sensor starts)
- `addStepDetectedListener` — `StepCounter.stepDetected` (motion detection signal)

### `createStepCountFilter(options?)`

Returns a stateful filter function. Drops bursts that exceed the configured cadence (default: 250 ms per step) and rebases cumulative counts so ignored steps are not applied later.

### `parseStepData(data)`

Formats raw `StepCountData` for display (steps, distance, time range, estimated calories, daily goal progress).

### `StepCountData`

| Field | Type | Description |
|-------|------|-------------|
| `steps` | `number` | Step count for the interval |
| `startDate` | `number` | Interval start (Unix ms) |
| `endDate` | `number` | Interval end (Unix ms) |
| `distance` | `number` | Distance in meters |
| `counterType` | `CounterType` | `"CMPedometer"` · `"STEP_COUNTER"` · `"ACCELEROMETER"` |
| `floorsAscended` | `number?` | iOS only |
| `floorsDescended` | `number?` | iOS only |
| `calories` | `number?` | Estimated calories when provided by native |

## Development

```bash
bun install
bun run prepare
bun run test
bun run example:start   # Metro
bun run example:ios     # or example:android
```

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the full workflow.

## Changelog

See [CHANGELOG.md](./CHANGELOG.md).

## License

[MIT](./LICENSE)
