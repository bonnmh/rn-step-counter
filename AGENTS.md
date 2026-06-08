# Repository Guidelines

## Project Structure & Module Organization

- `src/`: TypeScript bridge and public API (`NativeStepCounter.ts`, `index.tsx`).
- `android/src/main/`: Android native module and manifest.
- `ios/`: iOS native implementation (`StepCounter.mm`, `SOMotionDetecter.*`).
- `example/`: React Native workspace for manual integration testing.
- `lib/`: Generated build output from `bob build` (treat as generated artifacts).
- `.github/`: CI workflows, issue templates, and PR template.
- `documents/`: Generated API documentation.

## Build, Test, and Development Commands

- `bun install`: Install root and workspace dependencies.
- `bun run typecheck`: Run TypeScript checks for the library package.
- `bun run prepare`: Build distributable artifacts into `lib/`.
- `bun run clean`: Remove generated build outputs from root and example apps.
- `bun run example:start`: Start Metro for the example app (with `--reset-cache`).
- `bun run example:android` / `bun run example:ios`: Run example app on device/simulator.
- `bun run example clean`: Clean Android/Metro/Watchman caches in the example app.
- `bun run example postclean`: Reinstall iOS Pods in `example/ios` after cleaning.
- `bun run example build:android`: Run CI-aligned Android build for the example app.
- `bun run example build:ios`: Run Debug iOS build for the example app.
- `trunk check`: Run configured lint/security checks from `.trunk/trunk.yaml`.
- `trunk fmt`: Apply formatter fixes supported by Trunk.

## Coding Style & Naming Conventions

- Use 2-space indentation, LF endings, UTF-8 (`.editorconfig`).
- Prettier rules (`.prettierrc.mjs`): `semi: true`, `singleQuote: false`, `printWidth: 100`.
- Naming:
  - `PascalCase` for types/interfaces/classes.
  - `camelCase` for functions/variables.
  - `UPPER_SNAKE_CASE` for exported constants.
- Keep cross-platform JS/TS API changes in `src/`; keep platform behavior in `android/` and `ios/`.

## Testing Guidelines

- Jest is configured via `jest.config.js` (`react-native` preset) and `jest.setup.ts`.
- Add tests as `*.test.ts` / `*.test.tsx` (prefer colocated tests or `src/__tests__/`).
- Run unit tests with `bun run test`.
- For native changes, validate behavior in `example/` on affected platforms (Android/iOS).

## Commit & Pull Request Guidelines

- Follow the observed Conventional Commit + gitmoji format:
  - `feat: ✨ ...`, `fix: ♻️ ...`, `docs: 📝 ...`, `chore: 🔨 ...`.
- Keep commits focused and reference related issues where applicable.
- Use `.github/PULL_REQUEST_TEMPLATE.md`:
  - Fill summary, change list, related issue, and test steps.
  - Mark change type and checklist items.
  - Include screenshots/GIFs for UI-visible changes.
- Discuss API or breaking changes in an issue before opening a large PR.
