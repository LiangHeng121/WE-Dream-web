# WE-Dream

Research website for **WE-Dream: Generalizable Humanoid World-Action Models with Latent-Action Pretraining and Routed Attention**.

Website: https://liangheng121.github.io/WE-Dream-web/

## Deployment

This repository contains the buildless v24 website. GitHub Pages publishes from the root of `main`; `.nojekyll` bypasses Jekyll. All local links work at the `/WE-Dream-web/` project path.

## Release 24

- Explore wall keeps the current lightweight preview after HD takes over, so later replay does not discard an already buffered beginning.
- Once the active HD has at least 3 seconds of safe buffer, neighboring previews are warmed sequentially and positioned at zero. Recent navigation direction and hover intent take priority. At most the current preview and one unfinished neighbor may download at once.
- Downloads outside that budget are cancelled. Fully cached previews stay available; unfinished requests are released when the wall leaves view or the tab is hidden. Failed neighbors do not block later candidates, and an explicit selection can retry a failed preview.
- Every new selection still starts from zero after the camera settles. HD aligns to the moving preview and fades in after an actual presented frame; preview playback continues during alignment.
- Under a controlled slow preview server (800 ms response latency, 32 KiB/s delivery), a cold rightward switch in v23 first played after 4.17 s. In v24, a neighbor with only its first 2.9 seconds buffered started at zero in 0.59 s, about 5 ms after the camera settled. These samples demonstrate the cache path, not a guarantee for never-loaded media or every network.
- Eleven hero regression scripts and independent targeted review passed, covering partial buffers, request bounds, failed requests, rapid reversal, visibility and HD handoff.
- Media encoding remains unchanged: 57 full demonstrations and 6 skill excerpts at 1920 × 1080 H.264, 24 fps, CRF29, with MP4 faststart. HLS uses the same encoded packets without further loss.
- Existing layout, camera motion, rounded cards, first-frame poster atlas, prompts, dataset mosaics and skill interactions are retained. Original recordings remain unchanged.

`release.json` records the content version. Add `?mediaDebug=1` to inspect event-based playback diagnostics. Third-party component and source attribution remains alongside the website assets.
