# WE-Dream

Research website for **WE-Dream: Generalizable Humanoid World-Action Models with Latent-Action Pretraining and Routed Attention**.

Website: https://liangheng121.github.io/WE-Dream-web/

## Deployment

This repository contains the buildless v23 website. GitHub Pages publishes from the root of `main`; `.nojekyll` bypasses Jekyll. All local links work at the `/WE-Dream-web/` project path.

## Release 23

- Selecting an Explore wall tile resets its cached preview to the beginning. Playback starts after the enlargement settles, independently of HD readiness.
- The 1080p player loads in parallel and aligns to the current preview time. It fades in only after an aligned frame is actually presented; the preview keeps playing throughout preparation. Temporary handoff failures retain the decoder and retry without stopping the preview.
- Cold selected HD uses the existing faststart MP4 directly. Already decoded speculative HLS is reused. Hover preparation loads only one fragment. Rapid direction changes, returning to a prior tile, and leaving or hiding the page cancel stale handoffs.
- In a browser test with HD deliberately delayed by 3 seconds, the cached preview started about 0.76 seconds after selection, from the beginning; the subsequent HD handoff differed by 24 ms. These are test observations, not network-independent guarantees.
- Media quality is unchanged: all 57 full demonstrations and 6 skill excerpts remain 1920 × 1080 H.264, 24 fps, CRF29, with MP4 faststart. HLS copies the same encoded packets without further loss.
- The 40-tile opening wall uses an embedded first-frame poster atlas. All 139 loading posters come from the first frame of their delivered video. Existing layout, rounded cards, prompts, directional motion, galleries, dataset mosaics, and skill interactions are retained.
- The page includes 36 numbered in-domain and 15 numbered L1 demonstrations, four L2 compositions and two long-horizon routines. Original recordings remain unchanged. Dataset examples retain publisher URLs and source credits.

`release.json` records the content version. Add `?mediaDebug=1` to inspect event-based playback diagnostics. Third-party component and source attribution remains alongside the website assets.
