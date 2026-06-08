# Example App

This directory contains the React Native example app for `@blife/rn-step-counter`.

From the repository root:

```sh
bun run example:start     # Metro (--reset-cache)
bun run example:android   # Android
bun run example:ios       # iOS simulator (default: iPhone 17 Pro)
```

From this directory:

```sh
bun run start
bun run android
bun run ios
```

## iOS setup

Install CocoaPods dependencies when cloning or after native dependency changes:

```sh
bun run pods
```

For physical devices, open `ios/StepCounterExample.xcworkspace` in Xcode, select your signing team, then run `bun run ios:device`.

## Other scripts

```sh
bun run clean       # Clean Android/Metro/Watchman caches
bun run postclean   # Reinstall iOS pods after cleaning
bun run build:android
bun run build:ios
```

The example depends on the local library through `"@blife/rn-step-counter": "file:.."`.
