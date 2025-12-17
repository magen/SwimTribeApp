# Smartwatch Completion Update Plan

Goal: When the web app receives `MATCH_CONFIRMED` from the native app, update the latest `training_completions` row for that `training_id` (planId) and `user_id` with smartwatch metrics.

## Steps
- Add Supabase helper `src/lib/supabase/updateTrainingCompletionFromWatch.ts`:
  - Query latest completion id: `select('id').eq('training_id', trainingId).eq('user_id', userId).order('completed_at', { ascending: false }).limit(1)`.
  - Update that id with:
    - `updated_from_smartwatch: true`
    - `energy_kcal`
    - `stroke_count`
    - `watch_distance_meters`
    - `swolf_approx`
    - `watch_duration_seconds`
    - `workout_idx`
  - Handle errors; if none found, log/skip.

- Add `NativeMessageBridge` in `src/App.tsx`:
  - Use `useAppContext` to set mobile flag; `useAuth` for `profile.id` (userId).
  - Listen to `message` on window/document.
  - On `FCM_TOKEN`: store token (existing behavior).
  - On `APP_CONTEXT`: set `isMobileApp` and localStorage.
  - On `MATCH_CONFIRMED`:
    - Extract `trainingId = payload.planId`, `userId = profile.id`.
    - Map fields: `energy_kcal = payload.energyKcal`, `stroke_count = payload.strokeCount`, `watch_distance_meters = payload.distanceMeters`, `swolf_approx = payload.swolfApprox`, `watch_duration_seconds = payload.durationSeconds`, `workout_idx = payload.workoutIdx`.
    - Call `updateTrainingCompletionFromWatch(trainingId, userId, fields)`.
    - Log success/error (optional toast).
  - Cleanup listeners on unmount.
  - Render `<NativeMessageBridge onFcmToken={setFcmToken} />` inside `AuthProvider` (before `GroupProvider`).

- Remove the old MATCH_CONFIRMED log-only effect in `src/App.tsx` (bridge replaces it).

## Assumptions
- Columns exist: `updated_from_smartwatch`, `energy_kcal`, `stroke_count`, `watch_distance_meters`, `swolf_approx`, `watch_duration_seconds`, `workout_idx`.
- Native payload already includes `planId` (training_programs.id), `workoutIdx`, distance, duration, energy, strokeCount, swolfApprox.
- When multiple completions exist for the same training/user, update the most recent (`completed_at` DESC).

## Quick Test
In browser console:
```js
window.postMessage(JSON.stringify({
  type: 'MATCH_CONFIRMED',
  payload: {
    planId: '<training_programs.id>',
    workoutIdx: 0,
    distanceMeters: 1200,
    durationSeconds: 1800,
    energyKcal: 400,
    strokeCount: 600,
    swolfApprox: 120
  }
}));
```
Then verify the latest `training_completions` row for that `training_id`/`user_id` is updated in Supabase with the smartwatch fields and `updated_from_smartwatch = true`.
