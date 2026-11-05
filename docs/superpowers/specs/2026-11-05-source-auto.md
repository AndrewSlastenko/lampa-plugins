# Fast source selection (approved in chat 2026-11-05)

Use the saved source, exact voice and season/episode when continuing. For a new title, check a bounded set of free BWA sources for the requested episode, rank voices before resolution, and retain manual selection. This runs on the TV box with the PC off.

Voice tiers: HDrezka Studio / TVShows / Red Head Sound equally preferred; then Кубик в Кубе; then LostFilm / NewStudio / AlexFilm. Within a tier prefer 4K, then 2K, FullHD and lower known resolutions. Unknown or original-language tracks require manual selection; do not pretend a provider name is a Russian voice. No subscription is purchased or account requirement bypassed.

Fast scan checks up to three free providers, with per-provider and overall deadlines. A separate full scan action may check the remaining free providers. Results are cached briefly in memory; stream URLs are never persisted. Existence of an episode stream is a preflight check, not a guarantee that every CDN or decoder works. Failed scans leave manual source selection available. Never silently substitute a saved voice. Manual changes and leaving the activity cancel stale work.

Integrate through BWA_API.resolve and documented-by-inspection component methods; do not redistribute or fork the obfuscated upstream plugin. Keep the existing BWA UI and JustPlayer startup, skips, progress and next episode. Persist actual native auto-next episode in BWA resume storage. A settings switch disables automatic selection. All UI remains remote-control accessible.
