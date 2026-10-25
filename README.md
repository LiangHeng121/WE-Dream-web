# WE-Dream

Research website for **WE-Dream: Generalizable Humanoid World-Action Models with Latent-Action Pretraining and Routed Attention**.

Website: https://liangheng121.github.io/WE-Dream-web/

## Deployment

This repository contains the buildless v25 website. GitHub Pages publishes from the root of `main`; `.nojekyll` bypasses Jekyll. All local links work at the `/WE-Dream-web/` project path.

## Release 25

- The selected preview still begins at zero after the camera settles. HD prepares one buffered future timestamp, then joins the preview when it reaches that timestamp instead of repeatedly chasing a moving playback clock.
- Promotion requires a decoded target frame, actual playback and clock alignment. The matched HD frame replaces the preview without a separate opacity transition; camera movement and rounded corners are unchanged.
- One probable next HD video can prewarm a bounded HLS fragment after foreground playback and lightweight previews are safely buffered. Deadline, cancellation and failure recovery prevent speculative downloads from monopolizing the connection.
- Under the same controlled 1.2-second HD request delay and 512 KiB/s delivery, demonstration 23 reached HD in 2.26 seconds versus 4.15 seconds in v24. Final demonstrations 15 and 23 aligned in one seek with 10 ms and 6 ms clock differences. These are controlled samples, not a guarantee for every network or cache state.
- Eleven hero regression scripts and stream checks passed, with independent targeted review of playback, buffering, retries and rapid cancellation.
- Media encoding remains unchanged: 57 full demonstrations and 6 skill excerpts at 1920 × 1080 H.264, 24 fps, CRF29, with MP4 faststart. HLS uses the same encoded packets without further loss.
- Existing layout, camera motion, rounded cards, first-frame poster atlas, prompts, dataset mosaics and skill interactions are retained. Original recordings remain unchanged.

`release.json` records the content version. Add `?mediaDebug=1` to inspect event-based playback diagnostics. Third-party component and source attribution remains alongside the website assets.
