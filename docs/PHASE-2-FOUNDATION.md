# Phase 2: workbook authority and resumable state

Phase 2 keeps the private workbook as ECHO's only source of truth. GitHub contains the
secret-free Apps-Script implementation, migration logic, validation rules and public
technical documentation; it does not contain live canon, player state, scenes, secrets or
private IDs.

## Workbook authority

The runtime reads the confirmed creative and rule layers from the existing workbook tabs:

- `CANON`, `DECISIONS`, `RULES`, `ECHO_SYSTEM`
- `WORLD`, `TIMELINE`, `CHARACTERS`, `SPECIES`, `FACTIONS`
- `RELATIONSHIPS`, `FLAGS`, `PLAYER_EXPERIENCE`, `GAME_DESIGN`, `UI_DESIGN`
- `STATE_SNAPSHOT`, `EVENT_LOG`, `SCENE_FEED`, `RELATIONSHIP_STATE`, `THREADS`
- `ECHO_PREFERENCE_PROFILE` and `ECHO_CHARACTER_PROFILES`

Only rows marked `LOCKED` are treated as confirmed creative truth. Open questions and
active threads remain explicitly unresolved. Preferences describe presentation and open
directions; they do not create facts or numerical relationship values.

`getEchoAuthoritativeContext_` compiles these sources into the protected runtime context.
The gateway exposes that context and a fingerprint before a turn. The processor reads the
workbook again before committing, so a stale or incomplete client context cannot become the
new state of record.

## Technical projections added by migration

The code can create these workbook tabs when `setupEchoSchema()` or the first processor run
performs the migration:

- `TURN_TRANSACTIONS`: resumable transaction journal and recovery state.
- `SCENE_REVISIONS`: append-only revision audit for scenes and corrections.
- `ITEM_STATE`: normalized item ownership projection.
- `GROUP_MEMBERS`: dynamic group membership projection.

These are projections of played events, not hard-coded story content. Existing rows in the
Foundation Build are preserved. `migrateEchoPhase2()` can seed `ITEM_STATE` from the
legacy player inventory without changing canon or rewriting the event history.

## Turn transaction

A turn is prepared and then applied through idempotent stages:

`PREPARED → APPLYING → COMMITTED`

If a write fails after preparation, the journal becomes `RECOVERY_REQUIRED`; the processor
can retry the same event without creating a second event or scene. Inbox rows are marked
`PROCESSING` while claimed and remain `RECOVERY_REQUIRED` until the transaction finishes.
A successful chat acknowledgement is valid only after the transaction and readback complete.

## Scene revisions

A correction never edits the old narrative row. It appends a new `SCENE_FEED` revision with
a stable `scene_id`, a new `revision_id`, a revision number and a pointer to the replaced
feed row. `SCENE_REVISIONS` records the reason and source event. The overlay selects the
latest revision while the original remains auditable.

## Boundary

This phase changes code and defines workbook migrations only. It does not edit the live
workbook or deploy Apps Script from GitHub. After review, the private project owner can copy
the exact `apps-script/Code.gs`, run `setupEchoSchema()`, run `migrateEchoPhase2()` once,
and then redeploy.
