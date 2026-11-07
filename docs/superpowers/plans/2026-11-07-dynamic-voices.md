# Dynamic Voice Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Match voice spelling variants and offer actual source/voice/quality choices when preferred voices are missing.

**Architecture:** Keep the existing single-file browser plugin. Preserve original provider groups for handoff; introduce conservative name comparison independently of preferences and candidate collection. Extend the scanner and existing Lampa Select flow.

**Tech Stack:** Existing JavaScript UMD, Node test runner, BWA API, Lampa Select.

**Spec:** `docs/superpowers/specs/2026-11-07-dynamic-voice-selection-design.md`

## Global Constraints

- Existing source exclusions, cancellation, fast/full budgets and sticky healthy selection remain.
- Actual provider/raw/quality/URL stay together; no fuzzy edit-distance or generic-name cross-source merge.
- Preferred studios rank choices but do not filter the discovered list.

## Review Focus

- Empty canonical names or generic Russian labels cannot prove cross-source identity.
- Ambiguous same-source aliases must not replace an exact choice.
- A manual unknown voice must keep its best quality and own provider raw.
- A late fallback-menu click after navigation must not change stored selection or launch playback.
- Cache reuse must preserve fallback choices without allowing a hidden provider.

## Task 1 Voice identity and dynamic candidates

Files: `source-auto.js`, `test/source-auto.test.js`.
Interfaces: export `voiceKey(value)`; `candidates(result)` keeps all valid named groups; `choose(list, preferred)` restores a same-source exact/unique canonical choice, then a unique cross-source canonical choice, otherwise ranks only familiar studio tiers. Generic keys never match across sources.

- [x] Add failing tests for TV3/ТВ-3, numbering/language wrappers, preserved embedded digits, generic/ambiguous labels, all unknown candidates retained and excluded from automatic defaults.
- [x] Run `node --test test/source-auto.test.js` and observe the expected failures.
- [x] Implement conservative normalization, dynamic collection and preference-aware matching; preserve exact selected groups and rank quality inside an eligible voice.
- [x] Run the source-auto suite and commit the independently tested identity policy.

## Task 2 Scanner and fallback choice integration

Files: `source-auto.js`, `test/source-auto.test.js`, `README.md`.
Interfaces: scanner returns all discovered alternatives and `needsChoice` when no automatic choice exists; saved healthy source wins, missing source may fall back to the same canonical voice; manual group quality selection bypasses automatic studio preference eligibility.

- [x] Add failing scanner/UI tests for cross-source aliases, unknown-only fallback, chooser source/raw/quality preservation, generic ambiguity, stale menu callbacks, and cached/hidden providers.
- [x] Run targeted tests and observe expected failures.
- [x] Extend scanner and menu flow, including initial-list and full-search fallback; guard menu callbacks with generation/activity checks; update version to0.1.4 and README.
- [x] Run `node --test test/*.test.js`, syntax/diff checks, then independent whole-change review.
- [x] Fix material review findings with RED/GREEN tests; commit, merge/publish the plugin and compare public bytes.
- [x] Cold-reload Lampa on GX1; verify TV-3 selection with source/quality, pause the player, record actual evidence and check worktree cleanup.

## Completion evidence

- 139 plugin tests pass; JavaScript syntax and diff checks pass.
- SOL Medium review findings fixed with failing/passing regressions: generic identities, provider raw persistence, duplicate movie groups, direct manual voice-card override.
- Published runtime commit `4df757c165a98c0e078a35fee96ba827c2ad47f3`; both public plugin files match local bytes.
- Cold-reloaded GX1 Lampa: Mentalist S1E7 TV-3 launches; full search displays actual TV-3, Universal Russia and original options from VeoVeo and VideoDB at 1080p. TV-3 selected from this list.
- Native player .9 remains installed. Intermittent picture corruption after intro skip remains unconfirmed.
- No disposable Git worktrees created; primary checkouts retained.
