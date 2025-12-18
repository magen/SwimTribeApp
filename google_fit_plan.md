**Goal**
- Add Google Fit (Android) data ingestion with feature and UX parity to our existing HealthKit path: request workout/HR permissions, ingest swim workouts with distance/energy/stroke counts, support background/on-change delivery, and persist anchors for incremental sync.

**Scope & Deliverables**
- Library + platform setup for Google Fit (scopes, OAuth config, manifest tweaks) using a maintained RN bridge (candidate: `react-native-google-fit`).
- New `src/googlefit` module mirroring `src/healthkit` shapes: init/auth helpers, anchored fetches for workouts + heart rate, background/observer wiring, and anchor persistence (AsyncStorage).
- UI/flow parity: prompt after login (Android only), QA screen parity for permissions/logs, error handling for unsupported devices.
- Wiring to existing ingestion/confirmation flows so swim completions get enriched with Fit metrics just like HealthKit.
- QA checklist + manual test cases on a physical Android device with real Google Fit data.

**Plan**
- Foundation
  - Decide on bridge package and pin version; confirm it exposes Sessions, History, Sensors/Recording APIs and background listeners.
  - Generate/confirm OAuth client for Android (SHA-1 + package name) and request Fitness scopes: activity, heart rate, location if needed for swim distance.
  - Add Gradle/manifest/config updates (Fitness permissions, play-services-fitness dependency if required).
- Data model & storage
  - Define anchor model for Fit: use dataset sync tokens or latest endTime per data type (workouts, heart rate), stored in AsyncStorage (`@googlefit/anchors`).
  - Map Fit types to our downstream shape: swim sessions -> workouts with totalDistance (m), totalEnergyBurned (kcal when available, otherwise leave null), stroke counts; heart rate as bpm samples.
  - Normalize units to match HealthKit usage (meters, kcal, count/min).
- Service layer (`src/googlefit`)
  - `initGoogleFit` / `requestWorkoutPermissions` to request scopes and ensure Google account selection.
  - `runAnchoredFetches` to pull Sessions (activityType=SWIMMING) and Heart Rate datasets since the last anchor; update anchors and return aggregated payload.
  - On-demand sync (app launch/foreground) instead of background listeners; rely on anchored fetch when app is opened.
  - Shared logging utilities and error surfacing similar to `healthkit/service.ts`.
- App integration
  - Hook Android login/ready flow to request Fit permissions (guard iOS).
  - Add QA/Dev screen mirroring HealthKit QA: show permission status, latest anchors, last ingestion logs, manual sync button.
  - Integrate ingestion output into the same pipeline that enriches training completions and backend sync.
- Testing & rollout
  - Manual QA on physical Android with swim + HR data: permission prompts, initial ingest, incremental sync (anchor advance), denial/rehardening flows.
  - Log/analytics checkpoints to monitor failures (auth errors, missing scopes, on-demand fetch failures).
  - Fallback behavior when Fit unavailable (no Google account, Play Services missing).

**Decisions**
- Calorie estimates: leave null when Fit does not provide them; do not derive.
- Metrics scope: ship workouts + heart rate first; defer VO2Max/HRV.
- Background: skip listeners/headless tasks; run anchored sync on app launch/foreground only.
