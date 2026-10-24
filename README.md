# WE-Dream

Research website for **WE-Dream: Generalizable Humanoid World-Action Models with Latent-Action Pretraining and Routed Attention**.

Website: https://liangheng121.github.io/WE-Dream-web/

## Deployment

This repository contains the complete, buildless v15 website: HTML, CSS, JavaScript, data, figures, and the reviewed website video copies. No package installation or compilation is required.

GitHub Pages publishes from the root of `main`. The `.nojekyll` file preserves the static files without a Jekyll build. Push an updated static release to `main` to publish subsequent changes.

All local links are relative so the site works at the `/WE-Dream-web/` project path. The external dataset examples retain their original publisher URLs and source credits.

## Release 15

- Native 1920 × 1080 full demonstrations and skill excerpts, encoded from the original recordings.
- Neighbor prewarming, persistent players, and synchronized carousel motion.
- Bounded loading for the opening wall; lower sections initialize as they approach the viewport.
- 36 numbered in-domain demonstrations and 15 numbered L1 demonstrations.
- Four existing L2 compositions and two long-horizon routines retained.
- A 40-video opening wall, with 8 columns and 5 rows on desktop.
- Reviewed idle heads trimmed in website copies; original recordings remain unchanged.
- Skill excerpts and chapter timestamps updated to match the selected videos.

`release.json` records the published content version. Third-party component and source attribution remains alongside the website assets.
