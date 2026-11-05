# External anime auto-next

Approved scenario: the user chose on 2026-11-05 to keep JustPlayer, advance only at actual file completion, preserve dubbing/source, stop on Back, and return to episode selection when the next episode is unavailable.

Approaches: the internal Lampa player already has auto-next but would replace the accepted Android playback path. A narrow YummyAnime source change can reuse its existing episode list and resolver while attaching a native timeline callback. Use the latter, as chosen by the user. Sending a static Android playlist is insufficient: most subsequent episodes still contain iframe URLs requiring resolution.

Implementation calls: add a small independently testable native session module to the YummyAnime fork. It owns a single-item native playlist and one completion callback; it reuses local progress APIs and the existing stream resolver. The existing Anime Progress extension remains available for rollback but passes through launches that already carry a timeline. No JustPlayer change is needed.

Only the native completion sentinel (100 percent, zero time/duration) advances; leaving near the end does not. Duplicate or stale callbacks and navigation during handoff cannot start another episode. Honor the existing YummyAnime auto-next toggle. Automatic resolution failure stays on the selected title rather than switching voices/providers or opening an iframe. No countdown overlay or other persistent UI is added.

Acceptance: real GX1 external playback advances to the next available episode in the same voice/source; Back does not advance; the last episode and resolution failure return to the episode picker; progress survives restart. Validate missing metadata, disabled auto-next, duplicate completion and stale callbacks with automated tests. Preserve source/build notes and a rollback URL; no PC service is required at runtime.
