# External Anime Auto-next Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans in this chat. Execute inline under the user's existing instruction to proceed; do not request repeated approval of the accepted scenario.

**Goal:** Advance external Android anime playback reliably while preserving JustPlayer, voice, source and history.

**Architecture:** A YummyAnime native session module attaches timeline callbacks before Android launch. It reuses YummyAnime's private playback context, resolver and local history APIs. Native playlists contain one item to prevent double advancement.

**Tech Stack:** Plain JavaScript, Node test runner/VM, official Android Lampa wrapper, JustPlayer Home AFR, ADB.

**Spec:** ../specs/2026-11-05-anime-native-next-design.md

## Global Constraints

Keep JustPlayer and existing history. Advance only at actual completion. Keep dubbing/source. Back stops playback. Missing next episode or failed resolution returns to episode selection. No PC runtime dependency or new persistent overlay.

## Review Focus

Stale/duplicate results; user exit near the end; navigation while a resolver request is pending; same episode on different voices; unexpected native completion without known duration.

### Task 1: Native playback session

Files: fork src/ui-native-playback.js; tests/native-playback.test.js; src/ui.js; src/ui-playback-menu.js; build.js.

Interface: create(deps).prepare(context,current) -> item with timeline. Dependencies update progress, current context/navigation identity, enabled flag, and advance(context) reusing the existing resolver.

- [x] Write behavior tests for completion vs Back, disabled toggle, duplicate/stale results, history/timeline consistency, preserved native payload and single-item playlist.
- [x] Run tests and retain expected RED output.
- [x] Implement the module and integrate it into Android launch; preserve external target during auto-advance and reject unavailable streams without changing provider.
- [x] Run the new tests and full upstream suite; rebuild bundle and syntax-check it. Expected: all pass; existing Lampa plugin tests remain green.
- [x] Commit source, tests and build notes.

### Task 2: Device acceptance and delivery

- [x] Back up current Lampa state and original plugin URL; expose the candidate temporarily for testing.
- [x] Use normal Lampa UI to test actual completion into another episode, Back, history and last-episode handling; inspect native playback and UI state. Record any source availability limitation honestly.
- [x] Review the complete change with a fresh reviewer and fix important findings with regression tests.
- [x] Publish accepted source/bundle using the user's GitHub hosting, switch the installed URL, cold restart and repeat a completion/exit check.
- [x] Update project memory/plan, preserve rollback, remove temporary server/forwards/test payloads, and inspect worktrees/artifacts.

## Acceptance record

124 Yummy tests,60 collection tests and independent reviews passed. Actual Android completion returns via Timeline.update; the native playlist preserves a per-launch numeric identity, separately from durable episode/voice progress. Permanent Pages bytes verified. GX12→3 and final9→10 passed, same voice/source/JustPlayer; Back stopped. Last-episode and failed-source return are behavior-tested, not separately played to EOF on the box. Home AFR .5 opening/ending countdown and orphan-UP cancellation passed. New native storage export is rejected by the wrapper; the prior independent96-key backup is retained, fresh full backup remains open. Local diagnostics record test history changes; no user history was cleared.
