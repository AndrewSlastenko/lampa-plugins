# Fast source selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans task by task.

**Goal:** Select actual available BWA streams using voice-first preferences and resume the same viewing choice.

**Architecture:** An optional ES5 UMD extension owns ranking and a bounded asynchronous scanner, then decorates BWA lifecycle/playback methods. Existing BWA rendering and launch paths remain authoritative. The series bridge saves actual auto-next coordinates.

**Tech Stack:** JavaScript, Node test runner, Lampa/BWA API, Android ADB verification.

**Spec:** ../specs/2026-11-05-source-auto.md

## Global Constraints

- PC-independent, no dependencies, no subscriptions, no persisted stream URLs.
- Fast scan maximum three free providers; per-source 5 seconds, total 12 seconds; full scan maximum 30 seconds.
- Saved exact source/voice is sticky; manual controls and activity departure invalidate pending selection.
- Preserve the existing JustPlayer and series bridge contracts.

## Review Focus

- Stale callbacks after manual selection or navigation must not launch playback.
- Paid/hidden/unavailable providers and original-language voices cannot win automatically.
- Missing saved voice must not silently change to another voice.
- Native auto-next must update the actual resume episode, not revert to the clicked one.
- Provider quality labels and duplicate studio aliases must rank without mistaking provider names for voices.

### Task 1: Ranking and bounded scanner

**Files:** source-auto.js, test/source-auto.test.js

- [x] Write failing tests for voice tiers, resolutions, missing/unsafe candidates, sticky voice, exact episode arguments, timeouts, cancellation and cache expiry. Run `node --test test/source-auto.test.js`; expect RED.
- [x] Implement pure ranking and scanner using BWA_API.resolve. Run focused tests and `node --test "test/*.test.js"`; expect GREEN. Commit.

### Task 2: BWA integration and native resume

**Files:** source-auto.js, series-native.js, test/source-auto.test.js, test/series-native.test.js

- [x] Write failing lifecycle tests for initial choice, episode-specific rescan, manual override, missing saved voice and native next resume. Run focused tests; expect RED.
- [x] Implement component decorator, settings and rescan action, preserving original BWA launch paths. Run full suite and syntax checks; expect GREEN. Commit.

### Task 3: Review, publish and device verification

**Files:** README.md, index.html if appropriate, project memory outside public repository

- [x] Obtain one fresh-context review; resolve material findings with RED/GREEN regressions.
- [x] Publish on the already authorized GitHub Pages site. Verify public bytes and install through normal Lampa extensions UI.
- [x] Verify initial scan, actual launch, return/resume, manual override and cancellation on RockTek. Record observed limits, keep history.
- [x] Update memory, run final tests, inspect git worktrees and chat attachments, remove only task-owned temporary resources.


## Completion evidence

122 JavaScript checks, source review with regression fixes, public-byte equality, Lampa extension200/Working, real source scan/episode resume/manual voice UI checks. Playback scan keeps the list intact. During actual next-episode validation a separate pre-existing static-player ownership race was reproduced and fixed in JustPlayer Home AFR.8 (674 JVMchecks, ARMv7 build, fresh focused review, actual failing/passing handoff log). Memory records precise acceptance limits and final restored viewing choice.
