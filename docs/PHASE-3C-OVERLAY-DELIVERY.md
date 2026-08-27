# Phase 3C – Overlay Delivery and Commit Readback

Phase 3C makes the boundary between chat delivery and overlay presentation explicit. The private ECHO workbook remains the sole source of canon, preferences, relationships, current state and narrative content. GitHub contains only technical implementation and tests.

## Complete scene payload

The read-only overlay state now exposes a stable delivery payload for the current scene:

- scene/feed/event/revision identifiers;
- the complete formatted text as `narrativeText`, `formattedText` and the legacy `text` alias;
- normalized visible `blocks` in their authored order;
- normalized `resolution`;
- status, scene type, location, mood, content metadata and available actions.

The block payload is authoritative for rendering. The text aliases exist for older overlay clients and are derived from the same visible blocks; they are not a second story source.

Chronicle entries carry the same block/text/resolution shape, so opening an earlier entry does not collapse dialogue, changes or SYSTEM information into an incomplete raw string.

## Commit readback

A submitted turn receives a delivery status derived from the private `TURN_INBOX` row:

- `PENDING`, `PROCESSING` or recovery states do not produce a chat acknowledgement;
- `ERROR` produces no acknowledgement and exposes only the technical error code;
- `COMMITTED` without a `ui_feed_id` is treated as an incomplete readback;
- only `COMMITTED` with a `ui_feed_id` produces the short chat response `Übertragen.` and marks the overlay as ready.

The readback never returns the complete narrative to the chat channel. The narrative destination remains the overlay.

## Interfaces

- `GET?action=state` returns the overlay state.
- `GET?action=overlay-contract` returns the public overlay contract.
- Gateway operation `overlay-contract` returns the same contract.
- `status` returns the turn delivery state without copying scene prose into the chat response.
- Runtime context includes `overlay_contract` and the existing scene/resolution contracts.

## Compatibility and safety

Existing overlay clients keep the previous `currentScene.text`, `currentScene.blocks` and top-level fields. New clients should render `currentScene.blocks` first and use `formattedText` only as a fallback.

The backend does not invent narrative content, die results or player actions. Existing corrections remain revision-based and the overlay remains read-only.

This phase does not edit the live workbook or deploy the Apps Script project. After merging, copy the consolidated `apps-script/Code.gs` into the private Apps Script project and deploy a new web-app version. No new migration is required beyond the schema setup already completed in Phase 3B.
