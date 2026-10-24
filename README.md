# WE-Dream

Research website for **WE-Dream: Generalizable Humanoid World-Action Models with Latent-Action Pretraining and Routed Attention**.

Website: https://liangheng121.github.io/WE-Dream-web/

## Deployment

This repository contains the buildless v16 website: HTML, CSS, JavaScript, data, figures, and lightweight opening-wall previews. Complete high-quality videos are delivered on demand from the `media-v16` GitHub Release. No package installation or compilation is required.

GitHub Pages publishes from the root of `main`. The `.nojekyll` file preserves the static files without a Jekyll build. Push an updated static release to `main` to publish subsequent changes.

All local links are relative so the site works at the `/WE-Dream-web/` project path. The external dataset examples retain their original publisher URLs and source credits.

## Release 16

- Native 1920 × 1080 demonstrations and skill excerpts, retaining source frame timing (~29.97 fps). H.264 CRF18 is high-quality lossy encoding, not mathematical lossless.
- 63 videos verified by full decode and source/output frame counts; MP4 faststart and short GOPs support progressive playback and seeking.
- Current first-frame priority, sequential neighbor prewarming, persistent players, and continuous subpixel carousel motion with a single rounded clipping layer.
- The opening zoom starts on moving center previews instead of waiting for all 40 downloads. Focused windows prepare HD before moving and keep the outgoing video playing through the transition.
- Lower sections initialize near the viewport or on navigation intent; offscreen players relax preload hints.
- 36 numbered in-domain demonstrations and 15 numbered L1 demonstrations.
- Four existing L2 compositions and two long-horizon routines retained.
- A 40-video opening wall, with 8 columns and 5 rows on desktop.
- Reviewed idle heads trimmed in website copies; original recordings remain unchanged.
- Skill excerpts and chapter timestamps updated to match the selected videos.

`release.json` records the published content version. Third-party component and source attribution remains alongside the website assets.
