# ECHO authority and source rules

## Purpose

This document defines which source wins when ECHO receives conflicting information. It is
implemented by the Phase 1 runtime contract in `apps-script/Code.gs`.

## Authority order

1. Platform safety and applicable content rules.
2. The player's explicit stop, revocation, and non-negotiable boundaries.
3. NPC boundaries, autonomy, and explicit consent.
4. Immutable project canon in `CANON`, `RULES`, and `ECHO_SYSTEM`.
5. The canonical current game state in `STATE_SNAPSHOT`.
6. Established dynamic relationship state in `RELATIONSHIP_STATE`.
7. The compiled player preference policy.
8. Open improvisation in the current scene.

A lower layer may not silently overwrite a higher layer. Conflicts must remain visible as a
`CONSISTENCY_WARNING` or a failed validation result.

## State rules

- Canonical state keys use namespaced keys such as `player.location_id` and
  `world.clock`.
- Legacy aliases are accepted only at the compatibility boundary and are normalized before a
  write. They are never emitted by the runtime context or written as new state rows.
- Duplicate canonical rows are resolved by `updated_at`, then by row number as a deterministic
  fallback. A duplicate remains a diagnostic concern; it is not silently treated as new canon.
- Unknown facts remain unknown. Preference data cannot establish an identity, location,
  relationship value, item owner, or plot fact.
- Numeric relationship values are created by played events only, never inferred from
  questionnaire answers or character style tags.
- Player inventory is the source for player-held items. A contradictory held-item field is
  surfaced as a warning instead of being displayed as fact.
- The black crystal must ultimately be represented by one explicit item-owner record. Phase 1
  derives a guarded projection from existing state; the normalized `ITEM_STATE` table is a
  later migration.

## Preference rules

All questionnaire answers remain stored in `ECHO_PREFERENCE_PROFILE`. The active
`questionnaire_answers` object is checked against the complete Q01-Q50 coverage map.

The runtime exposes:

- the raw questionnaire audit only to the authenticated full context;
- a compiled `effectivePolicy` with a source reference for every question;
- hard constraints separately from soft style preferences;
- character-specific preference data separately from player and group preferences.

A preference is not canon. It describes how the game should be presented or which open
directions are desirable; it cannot rewrite an established event.

## Delivery rules

The write path returns only delivery metadata. Narrative belongs in the committed
`SCENE_FEED` and the overlay projection. A successful transfer may be acknowledged as
`Übertragen.` only after commit and readback. A failed transfer must not invent or display a
new scene in chat.
