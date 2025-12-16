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

## Execution plan (combined)
1) Pick HealthKit bridge and pin version. **Done — `@kingstinct/react-native-healthkit` (TS-first, active, anchored/observer support).**
2) Enable HealthKit capability; add usage strings. **Done — entitlements + Info.plist usage.**
3) Link libraries (Pods/codegen) and confirm build. **Done — NitroModules + pod install.**
4) QA entry: hidden dev-only menu to access debug tools. **Done — long-press hotspot opens QA.**
5) Permissions UI: render statuses for workout/HR/HRV/VO2/rings/swim + request flows. **Done — statuses, Request All, link to Health app.**
6) Ingestion scaffold: anchored queries + anchor storage. **Done — workouts/HR anchored fetch with persisted anchors.**
7) Background delivery: HKObserver wiring (workouts/HR); fallback poller TBD. **Done (observer) — add poller if needed.**
8) Health debug screen scaffold (reachable from QA); starts empty. **Done — Health debug screen accessible from QA.**
9) Heart-rate display: show recent HR samples (value/time/source) via anchored fetch on Health screen. **Done — HR list wired on Health screen.**
10) Swim summary: most recent swim workout with distance/duration/strokes/SWOLF/source on Health screen. **Done — swim stats shown on Health screen with pace/SWOLF/pool info.**
11) Refresh controls: manual refresh + “reset anchors” on Health screen (reuse anchors). **Done — refresh + reset anchors on Health screen.**
12) Normalize units and enrich workouts (pace, energy, pool length/location type; capture source/device). **Done — Health screen now normalizes distance/time/energy/pace, pool/location, device/source.**
13) Training program linking: propose matches (same date ± small time window + activity type), mark as “optional match,” require user confirmation before marking as matched. **In progress — QA-only matcher on Health screen with optional matches and confirmations.**
14) Idempotent writes + schema: define local storage (workout headers, samples, metadata) and dedupe by UUID/source/time.
15) Logging/export: debug toggle for ingestion logs and JSON export (QA scope).
16) Validation: run pool/open-water sessions; compare vs Apple Fitness; record gaps.
17) Summary/recommendations for next iteration (watchOS/live streaming decision).

### Training plan linking (QA-first, incremental)
13a) Add a QA-only dummy training plan on the Health screen (e.g., current week entries with activity + date/time). **Done — dummy plan seeded.**  
13b) Implement `matchWorkoutsToPlan(workouts, plan)` using same date and a small time window + activity type; output “optional match” (not auto-confirmed). **Done — matcher runs locally with optional matches.**  
13c) Add a “Match plan” button on the Health screen to run the matcher and show Matches/Optional/Missing; user can confirm an optional match to mark it as matched. **Done — UI supports manual confirm.**  
13d) Wire to real plan after login by swapping the dummy plan source for live plan data; keep matcher/display and confirmation flow the same. **In progress — Health screen accepts plan overrides/confirm callbacks; needs real plan feed + dashboard trigger.**  
13e) When confirmed, send the match upstream and enrich training_completions with HealthKit stats (distance/duration/HR/energy) for that session. **Pending — hook confirmations to backend.**
13f) Dashboard trigger: after login and plan load, fetch recent workouts (anchored), run matcher locally, and surface a banner/modal for optional matches; user approves per-match before confirming. **Pending — implement in app shell/dashboard.**
13g) Data flow: send trainings from server to app; perform matching locally; only send confirmed matches/stats back to server. **Pending — wiring to backend.**

### New user-facing matching flow (replace QA screen)
- **Permission on launch**: after login, prompt for HealthKit workouts (skip HR for now). Block the flow if denied; show CTA to enable.
- **Auto refresh**: once permission is granted, automatically run anchored fetch for workouts and update anchors.
- **Plan intake**: receive last-7-days trainings from the web app and store as plan entries.
- **Match trigger**: when both workouts and plan entries are present, run the matcher; only proceed if candidates exist.
- **Modal UI**: if candidates exist, open a modal (user-facing screen) showing per-training match details (title, scheduled time, matched workout time, distance/duration deltas, device/source). Allow dismiss.
- **Actions**: Confirm (mark match + send confirmation/stats upstream), or dismiss/ignore for now. Optionally provide “Reset/Retry matching” to re-run after a new fetch.
- **Resilience**: add logs for permission result, fetch status, match start/end, modal open/close; handle empty states (no permission → CTA, no workouts/plan → wait/retry).
