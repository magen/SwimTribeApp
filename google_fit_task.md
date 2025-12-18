## Task: Add Google Fit ingestion (parity with HealthKit)

**Owner**: _(assign)_  
**Status**: In progress  
**Target**: _(set target date)_

### Outcomes
- Android users can grant Google Fit access (workouts + heart rate) and see swim workouts/HR ingested on app launch/foreground.
- Swim completions are enriched with Fit metrics (distance, stroke count, energy when provided, HR samples) in the same pipeline as HealthKit.

### Work Items
- [ ] Choose/pin Google Fit bridge (`react-native-google-fit`) and add Gradle/manifest/scopes/OAuth client (SHA-1 + package name). _Using `react-native-google-fit@0.22.1`; need Android wiring + OAuth client._
- [x] Implement `src/googlefit` module: anchors storage, permission helpers, anchored fetch for swim sessions + HR, on-demand sync (no background listeners), logging/error surfacing.
- [ ] Wire Android login/ready flow to request Fit permissions (guard iOS); add QA/Dev screen mirroring HealthKit QA for anchors/logs/manual sync. _Android QA screen added (`GoogleFitQAScreen`); still need flow wiring._
- [ ] Connect ingestion output to existing completion/back-end sync path; ensure calories null when absent; normalize units to meters/kcal/count/min.
- [ ] Manual QA on physical Android: first-time auth, initial ingest, incremental sync advancing anchors, denial/rehardening, Fit unavailable cases.

### Notes
- Background listeners intentionally skipped; run anchored sync on app launch/foreground only.
- Calories: leave null if Fit does not supply for swims; no derivation.
- Scope: workouts + heart rate first; defer VO2Max/HRV.
