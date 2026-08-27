# Phase 3A: Canonical scene and dialogue runtime

Phase 3A makes the scene payload explicit and deterministic. The private ECHO workbook
remains the only source of canon, rules, preferences, relationships, group membership and
current state. GitHub contains only the implementation and its tests.

## Scene contract

Every new scene is normalized into `scene_blocks_json`. A block contains:

- `type`: `heading`, `prose`, `dialogue`, `action`, `sensory`, `system`,
  `change`, `status` or `prompt`.
- `text`: the visible text.
- optional `speaker`, `character_id`, `tone` and `emphasis`.

Common legacy names such as `narrative`, `dialog`, `stage_direction`,
`system_message`, `consequence` and `next_action` are normalized to the canonical types.

Blocks marked `HIDDEN`, `INTERNAL` or `SECRET` are rejected before they can enter
`SCENE_FEED`. A legacy scene without blocks is preserved and projected as one prose block
from its existing `narrative_text`.

## Rendering

The overlay receives the normalized blocks and the contract version. The text projection
renders dialogue with the speaker, and keeps SYSTEM, changes and status visibly separated.
The original narrative and scene rows are not rewritten.

## Interfaces

- `GET?action=scene-contract` returns the public contract.
- Gateway operation `scene-contract` returns the same contract.
- Runtime context includes `scene_contract`.
- `SCENE_FEED.scene_contract_version` records the version used for each new scene.

## Boundary

Phase 3A does not invent canon, alter existing history or write private creative content to
GitHub. Later Phase 3 slices will add structured resolution results, visible SYSTEM blocks,
NPC reactions and relationship/group projections on top of this contract.
