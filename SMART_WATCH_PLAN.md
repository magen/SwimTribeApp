# Smartwatch Integration Plan (Apple Watch first)

## Goals
- Capture Apple Watch data first; UI/insights come after we trust the data.
- Start with iOS/iPhone companion using HealthKit (watch syncs data there by default).
- Keep paths open for a watchOS app + live streaming later via WatchConnectivity.

## Data scope (v0)
- Workouts (swim + other workouts), duration, energy burned, distance, route where available.
- Heart rate (resting + during workout), HRV, VO2 max if available.
- Swim specifics: strokes, SWOLF, pool length, water type, pace splits.
- Steps and activity rings (for context), calories, stand/move/exercise minutes.

## Milestones
1) **Discovery & setup**
   - Confirm which metrics exist on Apple Watch + HealthKit for swim.
   - Enable HealthKit capability in the iOS target; add usage strings.
   - Choose library: `@kingstinct/react-native-healthkit` or `react-native-health` (active, supports workouts + anchored queries).

2) **Permissions & ingestion prototype**
   - Build a hidden/QA-only screen to request HealthKit permissions and show granted status.
   - Implement anchored queries for workouts and heart rate; persist last anchor/token to avoid re-reads.
   - Add background delivery where possible (HKObserver + HKAnchored queries) to pull new samples.

3) **Data pipeline & storage**
   - Define minimal data model (workout header + samples + metadata) and local store (SQLite/AsyncStorage/Realm based on existing stack).
   - Normalize units (meters, seconds, kcal) and time zones; record device/source to know if data came from watch vs phone.
   - Add lightweight logging for ingestion failures and missing permissions.

4) **Validation pass**
   - Capture test workouts (pool + open water) on real devices; compare values against Apple Fitness.
   - Create a debug export (JSON) to inspect raw payloads before building UI.
   - Document known gaps (e.g., SWOLF availability varies by device/os).

5) **Watch app / live data (optional next)**
   - If live metrics are required, add a watchOS target with WorkoutKit/HealthKit capture and stream via `WCSession`.
   - Sync offline batches from watch to phone when connectivity returns; reconcile with HealthKit to avoid duplicates.

6) **Compliance & QA**
   - Ensure privacy copy for health data, secure storage, and opt-out handling.
   - Manual QA matrix: device models, pool vs open water, airplane mode/low battery, permissions revoked, background fetch.

## Deliverables for v0
- **HealthKit enablement**
  - Add HealthKit capability/entitlements to iOS target.
  - Add usage strings in `Info.plist` (read/write health data, workouts, heart rate, activity).
  - Decide and install HealthKit bridge library; document version and setup steps.
- **Permissions + QA screen**
  - Hidden screen to request/read permission status for workout, heart rate, HRV, VO2 max, activity rings, swim metrics.
  - Display per-scope status and troubleshooting guidance if denied/restricted.
  - Log permission outcomes for debugging (no PII).
- **Ingestion service (background-capable)**
  - Anchored queries for workouts and heart rate; persist anchor tokens.
  - HKObserver subscriptions for push-style updates; fallback periodic pull if unavailable.
  - Unit normalization (meters, seconds, kcal, bpm); include source device and metadata (pool length, location type, strokes, SWOLF when present).
  - Idempotent writes (dedupe by UUID/source + time range).
- **Local storage + schema**
  - Schema for workout header (type, start/end, duration, calories, distance, location type, pool length, device).
  - Samples table/collection for heart rate and pace splits; metadata for swim specifics.
  - Lightweight ingestion logs/errors; toggle to enable verbose logging for QA builds.
- **Debug export + tooling**
  - Button to export recent ingested payloads to JSON for manual inspection.
  - Redaction of identifiers/user names; clear instructions for QA to share logs.
- **Validation notes**
  - Test matrix runs recorded (device/os/pool vs open water/airplane mode/background).
  - Comparison notes vs Apple Fitness values (distance, duration, HR, splits) and identified gaps.
- **Next-step recommendations**
  - Findings on data quality to inform UI/insights priorities.
  - Callouts for watchOS app/live streaming needs and estimated effort.

## Execution steps for v0 (small, sequential)
1) Pick HealthKit bridge (`@kingstinct/react-native-healthkit` or `react-native-health`); document rationale and version pin. **Done — use `@kingstinct/react-native-healthkit` (TS-first, active, anchored/observer support).**
2) Enable HealthKit capability in Xcode target; commit entitlements file. **Done — added `com.apple.developer.healthkit` to iOS entitlements.**
3) Add `Info.plist` usage strings for health read/write, workouts, heart rate, activity. **Done — added HealthKit read/write usage descriptions.**
4) Add/verify React Native linking for the chosen HealthKit library (pod install, iOS build sanity check). **Done — installed `@kingstinct/react-native-healthkit`, added NitroModules pod, and ran `pod install`.**
5) Create a hidden QA screen entry point (dev-only) reachable from a known gesture/menu. **Done — long-press hotspot in App.tsx opens QA screen (dev only).**
6) On the QA screen, render permission statuses for workout, heart rate, HRV, VO2 max, activity rings, swim metrics. **Done — statuses shown with read-only markers + read request state.**
7) Implement permission request flows with clear error states (denied/restricted guidance). **Done — one-tap Request All wired; errors surfaced; link to Health app.**
8) Scaffold ingestion service: structure + config for anchored queries and storing anchors (e.g., AsyncStorage).
9) Implement anchored queries for workouts (headers + metadata) and heart rate samples; persist anchors.
10) Add HKObserver/background delivery registration; fallback to periodic pull when unavailable.
11) Normalize units (meters/seconds/kcal/bpm) and capture source/device info plus swim metadata (pool length, location type, strokes, SWOLF if present).
12) Add idempotent write logic (dedupe by UUID/source/time range).
13) Define local schema/tables/collections for workouts and samples; implement writes.
14) Add lightweight ingestion logging with a debug toggle (QA builds only).
15) Add debug export button on QA screen to emit recent payloads/logs to JSON with redaction.
16) Run manual validation sessions (pool + open water); record results vs Apple Fitness; update validation notes.
17) Summarize findings + gaps; list recommendations for UI/next iteration (watchOS/live streaming decision).
