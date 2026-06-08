# Contributing

Contributions are always welcome, no matter how large or small!

We want this community to be friendly and respectful to each other. Please follow it in all your interactions with the project. Before contributing, please read the [code of conduct](./CODE_OF_CONDUCT.md).

## Development workflow

This project is a [Bun](https://bun.sh) workspace monorepo. It contains:

- The library package in the root directory.
- An example app in the `example/` directory.

To get started, install [Node.js](https://nodejs.org/) (see [`.nvmrc`](./.nvmrc)) and [Bun](https://bun.sh/docs/installation) (see [`.bun-version`](./.bun-version)).

Install dependencies from the repository root:

```sh
bun install
```

The [example app](/example/) demonstrates usage of the library. You need to run it to test any changes you make.

The example app depends on the local library via `file:..`, so JavaScript changes are picked up by Metro without rebuilding the library. Native code changes require rebuilding the example app.

If you want to use Android Studio or Xcode to edit native code, open `example/android` or `example/ios/StepCounterExample.xcworkspace`. Library source files appear under `Pods > Development Pods > @blife/rn-step-counter` in Xcode and under `@blife/rn-step-counter` in Android Studio.

Run commands from the repository root:

```sh
bun run example:start     # Metro for the example app (--reset-cache)
bun run example:android   # Run the example on Android
bun run example:ios       # Run the example on the iOS simulator
bun run example clean     # Clean example caches
bun run example postclean # Reinstall iOS pods after cleaning
bun run example build:android
bun run example build:ios
```

To confirm the example app runs with the New Architecture, check Metro logs for output similar to:

```sh
Running "StepCounterExample" with {"fabric":true,"initialProps":{"concurrentRoot":true},"rootTag":1}
```

Note the `"fabric":true` and `"concurrentRoot":true` properties.

Validate TypeScript:

```sh
bun run typecheck
```

Lint and format with [Trunk](https://trunk.io/):

```sh
trunk check
trunk fmt
```

Run unit tests:

```sh
bun run test
```

### Publishing to npm

We use [release-it](https://github.com/release-it/release-it) for version bumps, changelog updates, tags, and npm publish.

```sh
bunx release-it
```

### Scripts

Common root scripts:

- `bun install`: install workspace dependencies.
- `bun run prepare`: build distributable artifacts into `lib/`.
- `bun run typecheck`: type-check with TypeScript.
- `bun run test`: run Jest unit tests.
- `bun run clean`: remove generated build outputs.
- `bun run example:start`: start Metro for the example app.
- `bun run example:android` / `bun run example:ios`: run the example app.
- `trunk check` / `trunk fmt`: lint and format.

### Sending a pull request

> **Working on your first pull request?** You can learn how from this _free_ series: [How to Contribute to an Open Source Project on GitHub](https://app.egghead.io/playlists/how-to-contribute-to-an-open-source-project-on-github).

When you're sending a pull request:

- Prefer small pull requests focused on one change.
- Verify that linters and tests are passing.
- Review the documentation to make sure it looks good.
- Follow the pull request template when opening a pull request.
- For pull requests that change the API or implementation, discuss with maintainers first by opening an issue.
