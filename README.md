# WE-Dream

Research website for **WE-Dream: Generalizable Humanoid World-Action Models with Latent-Action Pretraining and Routed Attention**.

Website: https://liangheng121.github.io/WE-Dream-web/

## Deployment

This repository contains the buildless v22 website: HTML, CSS, JavaScript, data, figures, opening-wall previews, and complete 1080p demonstrations. GitHub Pages publishes from the root of `main`; `.nojekyll` bypasses Jekyll. All local links work at the `/WE-Dream-web/` project path.

## Release 22

- Focused wall preparation no longer seeks to zero when already at the beginning: it waits for the decoded frame directly, avoiding a native full-file fallback and redundant HLS restarts. All hidden preview requests stop while the selected 1080p clip loads. Initial focus motion is 0.65 s and HD fade 0.12 s; playback still starts only after the clear frame and motion are ready.

- Explore wall starts every newly selected 1080p clip from its first frame only after the clear HD frame, camera transition, and fade are ready. Rapid directional changes cancel stale playback starts; returning from an offscreen section preserves the current selection’s progress.
- Removed the extra hero eyebrow, demonstration counter, method tagline strip, and Pause motion control. Added an original gradient W ribbon favicon with a small star. Existing layout, rounded corners, and wall navigation are retained.

- 1080p resolution and continuous playback take priority. All 57 full demonstrations and 6 skill excerpts use 1920 × 1080 H.264, 24 fps, CRF29, and MP4 faststart. Lossy bitrate is intentional; the 63 files total 358 MB, versus 2.19 GB in v16.
- The opening wall paints all 40 first-frame tiles directly from initial HTML before scripts or video downloads; each video takes over after a decoded frame is presented. One embedded WebP atlas replaces the separate 40-poster request queue.
- All 139 loading posters come from frame zero of the exact delivered video; wall previews use their own frames. All 57 full-video HLS first frames match the MP4 sources. Poster cache keys are updated without changing video URLs.
- Scripts and styles are bundled into one entry each to reduce page-start network round trips. Explicit section navigation stays aligned while lazy content above it mounts; manual scrolling immediately cancels this short correction.
- Full demonstrations use HLS with a bounded rolling buffer and one first-fragment neighbor preview; the original MP4 remains a fallback. Existing H.264 video packets are copied, without another lossy encode.
- Only visible galleries may prefetch while a foreground gallery is active. Offscreen posters are deferred; sidebar thumbnails and WOFF2 fonts reduce non-video traffic.
- The current clip buffers before one neighbor is prefetched. Leaving a section cancels unfinished downloads across galleries, dataset mosaics, the method execution video, and skill excerpts; fully cached clips and playback positions are preserved.
- The opening wall cancels unfinished offscreen requests and resumes on return without replaying the zoom.
- Video duration remains visible before metadata arrives. Code and data URLs are versioned together so cached v16 manifests cannot select the old high-bitrate media.
- Existing continuous carousel motion, rounded clipping, selected videos, prompts, L2 compositions, chapter controls, and page layout are retained.
- 36 numbered in-domain and 15 numbered L1 demonstrations; four L2 compositions and two long-horizon routines. The opening wall has 40 videos in 8 columns and 5 rows.
- Trimmed website copies preserve the reviewed motion starts; original recordings remain unchanged. Dataset examples retain publisher URLs and source credits.

`release.json` records the content version. Add `?mediaDebug=1` to inspect event-based playback diagnostics on each player. Third-party component and source attribution remains alongside the website assets.
