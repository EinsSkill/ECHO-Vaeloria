# Phase 3B – Resolution Runtime

Phase 3B adds a small, explicit resolution contract to the consolidated Apps Script backend. It keeps the technical handling deterministic while leaving canon, preferences, current state and narrative content in the private ECHO workbook.

## Resolution modes

Every new turn can carry a `resolution` object:

- `ROLL`: requires a check name, difficulty (DC/SG) and an already supplied d20 result. The modifier is optional and defaults to zero.
- `NO_ROLL`: requires `explicit_no_roll: true` and a reason. Dice, totals and difficulty fields are rejected.
- `NO_CHECK`: records that no uncertain or mechanically relevant check was needed and requires a reason when explicitly supplied.

A missing resolution remains backward-compatible: it is normalized to `NO_CHECK` with the technical reason `Keine Probe erforderlich.`

## Validation

The backend validates:

- d20 values from 1 through 20;
- integer modifiers from -50 through 50;
- difficulty values from 1 through 40;
- that `total` equals `d20 + modifier`, when a caller supplies a total;
- that a supplied outcome matches the roll;
- natural 20 as a critical success and natural 1 as a critical failure;
- explicit confirmation before a caller can bypass a roll.

The backend does not invent a die result. The narrative/runtime caller supplies the structured resolution, and Apps Script validates and persists it.

## Visible scene output

Each new scene receives one canonical `system` scene block containing the resolution. It is inserted before change, status or next-action blocks, so the mechanic remains visible next to the narrative. Existing generated resolution blocks are replaced rather than duplicated.

Corrections preserve the existing correction flow and do not add a second resolution line to the corrected scene.

## Workbook persistence

The backend ensures these technical columns exist:

- `EVENT_LOG.resolution_json`
- `EVENT_LOG.resolution_mode`
- `EVENT_LOG.resolution_outcome`
- `SCENE_FEED.resolution_json`

The workbook remains the source of truth. This change does not write to the live workbook, alter private canon, migrate current play data or deploy the web app.

## Public contract access

The technical contract is available through:

- `GET?action=resolution-contract`
- the gateway operation `resolution-contract`
- the runtime context as `resolution_contract`
- the scene contract response as `resolution_contract`

After merging, copy the updated `apps-script/Code.gs` into the private Apps Script project, run `setupEchoSchema()` once to add any missing columns, and deploy a new web-app version.
