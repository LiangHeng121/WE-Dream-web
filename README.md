# WE-Dream

Research website for **WE-Dream: Generalizable Humanoid World-Action Models with Latent-Action Pretraining and Routed Attention**.

Website: https://liangheng121.github.io/WE-Dream-web/

## Deployment

This repository contains the buildless v17 website: HTML, CSS, JavaScript, data, figures, opening-wall previews, and complete 1080p demonstrations. GitHub Pages publishes from the root of `main`; `.nojekyll` bypasses Jekyll. All local links work at the `/WE-Dream-web/` project path.

## Release 17

- 1080p resolution and continuous playback take priority. All 57 full demonstrations and 6 skill excerpts use 1920 × 1080 H.264, 24 fps, CRF29, and MP4 faststart. Lossy bitrate is intentional; the 63 files total 358 MB, versus 2.19 GB in v16.
- The current clip buffers before one neighbor is prefetched. Leaving a section cancels unfinished downloads across galleries, dataset mosaics, the method execution video, and skill excerpts; fully cached clips and playback positions are preserved.
- The opening wall cancels unfinished offscreen requests and resumes on return without replaying the zoom.
- Video duration remains visible before metadata arrives. Code and data URLs are versioned together so cached v16 manifests cannot select the old high-bitrate media.
- Existing continuous carousel motion, rounded clipping, selected videos, prompts, L2 compositions, chapter controls, and page layout are retained.
- 36 numbered in-domain and 15 numbered L1 demonstrations; four L2 compositions and two long-horizon routines. The opening wall has 40 videos in 8 columns and 5 rows.
- Trimmed website copies preserve the reviewed motion starts; original recordings remain unchanged. Dataset examples retain publisher URLs and source credits.

`release.json` records the content version. Add `?mediaDebug=1` to inspect event-based playback diagnostics on each player. Third-party component and source attribution remains alongside the website assets.
