# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

`@blife/rn-step-counter` is a React Native **TurboModule library** that tracks step counts using native device sensors. It uses the **New Architecture** (Fabric/TurboModules) and is built with `react-native-builder-bob`.

- iOS: Uses `CMPedometer` (CoreMotion) and `SOMotionDetecter`
- Android: Uses the hardware step counter sensor (API 19+) with accelerometer fallback

## Monorepo Structure

This is a Bun workspace monorepo:

- **Root** — library source, native modules, build configuration
- **`example/`** — standalone React Native app that demonstrates and tests the library

The example app links the local library via `file:..`. Native code changes require a full rebuild of the example app.

## Commands

All commands are run from the root directory unless noted.

### Development

```sh
bun install                 # Install dependencies for all workspaces
bun run prepare             # Build the library (runs bob build → outputs to lib/)
bun run typecheck           # TypeScript type check (tsc --noEmit)
trunk check                 # Lint with Trunk (prettier, ktlint, swiftformat, etc.)
trunk fmt                   # Auto-fix lint issues
bun run test                # Run unit tests
bun run test -- src/__tests__/index.test.ts  # Run a single test file
```

### Example App

```sh
bun run example:start       # Start Metro bundler
bun run example:android     # Run on Android device/emulator
bun run example:ios         # Run on iOS simulator
bun run example build:android  # Build Android APK (arm64-v8a, no daemon)
bun run example build:ios      # Build iOS in Debug mode
```

### Clean Build Artifacts

```sh
bun run clean               # Remove android/build, example/android/build, example/android/app/build, example/ios/build, lib/
```

### iOS Setup (after native changes)

```sh
cd example && bun run pods
```

### Release

```sh
bunx release-it             # Bump version, generate CHANGELOG, commit/tag/push, publish to npm and GitHub
```

Config in `.release-it.json`. Uses `@release-it/conventional-changelog` with conventional commits preset. Runs `bun run prepare` after version bump automatically.

## Architecture

### JavaScript Layer (`src/`)

- **`src/NativeStepCounter.ts`** — TurboModule spec definition. Defines the `Spec` interface registered as `"StepCounter"` via `TurboModuleRegistry.getEnforcing`. Exports `StepCountData` type and constants (`NAME`, `VERSION`, `eventName`).
- **`src/index.tsx`** — Public API. Wraps the native module with a `NativeEventEmitter`, exposes:
  - `isStepCountingSupported()` → Promise with `{ supported, granted }`
  - `startStepCounterUpdate(start, callback)` → returns `EventSubscription`
  - `stopStepCounterUpdate()` → removes all listeners and stops native updates
  - `parseStepData(data)` → transforms raw `StepCountData` into human-readable `ParsedStepCountData`
  - `isSensorWorking` — boolean based on active listener count
- **`src/packageMeta.ts`** — Package name and repository URL used in linking error messages.

### Native Layer

**iOS (`ios/`)**:

- `StepCounter.h / .mm` — Main Objective-C module. Implements `isStepCountingSupported`, `startStepCounterUpdate`, `stopStepCounterUpdate`. Uses `CMPedometer` for step data and `SOMotionDetecter` for motion detection. Emits `StepCounter.stepCounterUpdate` events.
- `SOMotionDetecter.h / .m` — Motion detection helper used by the iOS module.
- New Architecture support via `#ifdef RCT_NEW_ARCH_ENABLED` guard with `NativeStepCounterSpecJSI`.

**Android (`android/src/main/java/com/stepcounter/`)**:

- `StepCounterModule.kt` — Extends `NativeStepCounterSpec`. Selects sensor service based on device capability (prefers hardware step counter, falls back to accelerometer). Requires `ACTIVITY_RECOGNITION` permission.
- `StepCounterPackage.kt` — Standard RN package registration.
- `services/SensorListenService.kt` — Abstract base for sensor services; registers with `SensorManager` and emits events via `RCTDeviceEventEmitter`.
- `services/StepCounterService.kt` — Uses `TYPE_STEP_COUNTER` hardware sensor (API 19+).
- `services/AccelerometerService.kt` — Fallback for devices without hardware step counter; processes raw accelerometer data.
- `utils/AndroidVersionHelper.kt` — API level compatibility checks.
- `utils/SensorFusionMath.kt` — Vector math utilities for accelerometer-based step detection.
- Min SDK: 24, Target/Compile SDK: 36, Kotlin 2.0.21.

### Build System

- **`react-native-builder-bob`** — Builds library to `lib/` in two targets: ESM module (`lib/module/`) and TypeScript declarations (`lib/typescript/`).
- **Codegen** — Configured via `codegenConfig` in `package.json` (name: `StepCounterSpec`, type: `modules`, Java package: `com.stepcounter`).
- **Trunk** — Manages linting (prettier, ktlint, swiftformat, shellcheck, markdownlint, yamllint, actionlint). Run via `trunk` CLI, not via package scripts.
- **Bun** — Package manager with hoisted `node_modules` (`bunfig.toml`) for Jest and React Native tooling compatibility.

## Testing

Jest is configured in `jest.config.js` (preset: `react-native`). `jest.setup.ts` mocks `TurboModuleRegistry.getEnforcing` globally, returning stubs for all native methods. Tests live under `src/__tests__/` and `example/src/__tests__/`.

The `jest-config` package is used in `jest.config.js` for default `moduleFileExtensions`. `modulePathIgnorePatterns` excludes `example/node_modules` and `lib/`.

## Compatibility

- **New Architecture** (TurboModule/Fabric) is **required**.
- **Not supported**: Expo Go, Expo managed workflow, React Native < 0.68.

## Key Conventions

- **Node version**: v22.20.0 (see `.nvmrc`)
- **Package manager**: Bun (see `.bun-version`)
- TypeScript strict mode is enabled with `noUnusedLocals`, `noUnusedParameters`, `noUncheckedIndexedAccess`.
- Event name constant: `"StepCounter.stepCounterUpdate"` (defined in `NativeStepCounter.ts`).
- **Timestamp flow**: JS passes `Date.getTime() / 1000` (seconds) to native via `startStepCounterUpdate`. Native returns `startDate`/`endDate` in `StepCountData` as Unix timestamps in **milliseconds**.
- `parseStepData` assumes a daily goal of 10,000 steps and calculates calories as `steps * 0.045 kCal`.

## Editing Native Code

- **Xcode**: Open `example/ios/StepCounterExample.xcworkspace`. Library files are under `Pods > Development Pods > @blife/rn-step-counter`.
- **Android Studio**: Open `example/android`. Library files appear under `@blife/rn-step-counter`.
- After any native change, rebuild the example app (`bun run example:android` or `bun run example:ios`).
