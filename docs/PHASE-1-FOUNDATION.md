# Phase 1 foundation

Phase 1 establishes one reliable truth path before the larger turn and performance rewrite.

## Included

- Removed the hard-coded historical scene and all historical scene-ID exceptions from
  `apps-script/Code.gs`.
- Added typed scene-block support through optional `scene_blocks_json`. Existing scenes still
  fall back to their stored `narrative_text`.
- Made normal state and overlay reads side-effect free. Processing is no longer triggered by
  a `state` GET.
- Preserved native spreadsheet numbers and dates instead of locale-formatted display strings.
- Added canonical state-key normalization and ignored legacy aliases when building the runtime
  snapshot.
- Added deterministic newest-row selection using `updated_at` with a row-number fallback.
- Added guarded item ownership projection so a player-held item is not displayed when it is not
  in the player's inventory. Contradictions are returned as `CONSISTENCY_WARNING`.
- Replaced the legacy fast-gateway key list with canonical runtime keys and typed snapshot
  values.
- Added a compiled preference policy and a complete Q01-Q50 coverage map.
- Added preference coverage to diagnostics and the full runtime context.
- Added a build fingerprint and state/policy versions to health, overlay, and gateway output.
- Added a GitHub Actions syntax and coverage check.

## Questionnaire guarantee

The 50 answers are not copied into canon or hard-coded into scene prose. They remain player
preferences and are compiled on every context read:

`PREF-026.questionnaire_answers`
-> `validatePreferenceCoverage_`
-> `compileEffectivePreferencePolicy_`
-> `effectivePolicy`

Every mapped question has:

- a stable question ID;
- a target policy destination;
- an enforcement level (`HARD`, `SOFT`, or `PROJECTION`);
- an application condition;
- a source reference back to `PREF-026`.

CI fails when the code no longer contains exactly Q01 through Q50 or when a legacy runtime
alias is reintroduced.

## Deliberate limits

Phase 1 does not yet perform the transactional commit rewrite, append-only scene revisions,
full group-member lifecycle, or the normalized `ITEM_STATE` migration. Those are Phase 2
changes and must build on this foundation.

## Deployment boundary

All source changes are made in Git. No live spreadsheet cell is edited by Phase 1. After the
branch is reviewed and merged, the owner of the Apps Script deployment can deploy the exact
Git version and run the explicit schema setup function when the new scene-block column is
desired.
