# WE-Dream

Research website for **WE-Dream: Generalizable Humanoid World-Action Models with Latent-Action Pretraining and Routed Attention**.

Website: https://liangheng121.github.io/WE-Dream-web/

## Deployment

This repository contains the buildless research website. GitHub Pages publishes from the root of `main`; `.nojekyll` bypasses Jekyll. All local links work at the `/WE-Dream-web/` project path.

## Release 38

- Restore the v35 blue/lavender attention matrix treatment, retaining all16 entries and the single p=0.5 routed cell. Use consistent C/V/A/S labels and both unchanged training objectives.
- Correct the LAM output to32D latent action; distinguish visual context/instruction/state conditioning from the internal token streams. Deployment explicitly receives observations, instruction and robot state.
- Selected glass snowflake moves gently at the upper-left corner of Frozen LAM. It shares the existing visibility/reduced-motion scheduling.
- Hero/video files and playback remain unchanged. The source-derived first-frame atlas integrity checks pass before and after packaging.

## Release 37

- Restore the embedded first-frame wall atlas. A broad version-string replacement had changed one base64 character inside the WebP, producing visible corruption while videos were still loading.
- Publication now validates the source and final packaged atlas against all40 source first frames. Regression coverage reproduces the decodable-but-corrupt WebP and verifies URL-only cache versioning.
- All40 native preview videos verified by complete decoding, manifest SHA and public byte comparisons. Playback, wall layout, selection, zoom and Method remain unchanged.

## Release 36

- Numbered section names now lead each section, with smaller descriptive subtitles.
- Method uses a compact connected input row; redundant training, weight-transfer and action-sum annotations are removed. Frozen LAM has a vector snowflake.
- Attention uses the paper's C / Ṽ / Ã / S notation, enabled checks and blank masks; only the routed cell pulses in pale orange.
- Human mosaic is half EgoDex and half EgoVerse. Robot mosaic uses four calmer active head-camera segments, selected from measured camera motion and visual review without retiming or stabilization.
- Existing wall/gallery playback, selections and the1080 deployment video remain unchanged.

## Release 35

- Both Method training inputs are four-clip first-person mosaics, precomposed into two streams to keep decoding bounded.
- Routed attention softly animates its sole changing A-query/V-key dependency. Three live presentation proposals are available at `method-motion-options.html`: breathing cell, flowing gate and microbatch samples. These are visual alternatives, not deployment modes.
- The80D action uses pale translucent rounded gradients. Hands and neck point straight to execution; only the64D body command passes through SONIC.
- A native1080 Method-only rendition suppresses high-frequency aliasing at mini-player scale, with an inset frame that preserves16:9. Original demonstrations and other runtime modules are unchanged.

## Release 34

- Method now uses existing first-person human and robot videos. The complete architecture remains fixed; highlighting does not restart playback.
- Both 50% training attention routes are visible together, with only the action-query / future-video-key cell changing and both losses retained. There is one action-only deployment path, without a route selector.
- One 80D robot action is shown as Neck 2 + Hands 14 + SONIC body 64. Neck/hands use direct targets; the 64D body component goes through SONIC. A 24-action chunk is shown separately.
- Desktop and 390px mobile layouts, media lifecycle, scientific content and asset references verified. Other runtime modules, demo selection and video bytes are unchanged.

## Release 33

- Method is a complete fixed architecture: both learning stages, shared routed attention and action-only deployment are always visible. Part selection changes emphasis only; hover/focus previews return to the pinned selection.
- Removed chapter timing, autoplay, scrubbing and scene rearrangement. Simplified labels and routed connections through clear gaps; lower-level dimensions and control details remain in the paper.
- Both training losses remain active in either route. Deployment retains its execution video and observed context. Responsive layout and video visibility guards were verified.
- Hero, media, datasets, galleries, results and long-horizon behavior retain the previous implementation.

## Release 32

- Replaced the paper-image Method panel with an original animated SVG walkthrough: latent-action pretraining, robot post-training, routed attention and action-only deployment. A shared backbone stays in view while inputs, outputs and attention paths change.
- Four chapter controls, a scrubber, pause/replay and manual route comparison explain the method. Both training routes retain both losses; deployment retains observed context and predicts only actions.
- Desktop and mobile layouts, motion reduction and offscreen pausing are supported. The deployment video remains scoped to the deployment chapter.
- Existing wall, gallery, dataset, result and streaming behavior are unchanged.

## Release 31

- Patch 2: resolve relative HLS fragment addresses when looking up absolute prefetch cache keys, with actual vendored playlist-parser regression and cache-hit diagnostics. This removes duplicate first-fragment downloads on GitHub Pages.

- Patch 1: accept HTTP gzip transfer length while checking the decoded fragment length and SHA256; this restores startup-cache reuse on GitHub Pages.

- All 40 wall HD streams have a 0.5-second first fragment, preserving 1920 × 1080, 24 fps and existing timelines. Startup media totals 5.87 MB instead of 11.35 MB (48.25% smaller).
- A bounded byte cache preloads exact SHA256-verified startup fragments, prioritizes the selected clip, and reuses in-flight bytes. Sites serves these tiny assets on its own origin. This does not create 40 HD decoders or preload 40 full movies.
- Fixed a real hls.js loader-contract error that caused network requests to fail and fall back to native MP4. Neighbor HD preparation no longer waits for complete low-resolution files when foreground playback is buffered safely.
- No pause, poster mask or extra restart was added. Existing media-clock and submitted-frame checks govern continuous HD handoff.
- All 40 selections passed local browser checks with HLS and 1080p; 19 lifecycle/stream regression suites passed. Cache-warm local timing is not a guarantee for cold public networks.

## Release 29

- Fix delayed HLS handoff when a moving preview outruns a paused HD buffer. Missing-buffer requests now look ahead using observed first-data latency, with at most two bounded window requests; cached targets retain their fast path.
- The preview keeps playing continuously. HD still requires the submitted-frame PTS check, the existing 120ms clock tolerance, and cancellation/source-boundary guards before becoming visible.
- Controlled browser comparison with 3-second latency on every HD request reproduced the old low-quality wait beyond 20 seconds. The reported white-bear and drawer clips completed handoff in about 8.2 seconds with the repair, with about 4ms media-clock difference. These are intentionally adverse test conditions, not public-site latency promises.
- Fifteen hero/stream suites passed, including an exact old/new delayed-fragment comparison and independent review. Media encoding, cold native transport, wall arrangement, labels and styling remain unchanged.

## Release 28

- Selecting a still-loading HLS preview immediately promotes the existing request to foreground buffering. It no longer finishes under the one-fragment background policy before starting active loading.
- Temporary HD preparation failures and exhausted frame checks receive at most two selection-scoped recovery attempts. Switching away cancels recovery; hidden tabs defer it. The moving preview stays visible until the original submitted-frame timestamp check succeeds.
- A controlled browser test returned HTTP 503 for the first selected HD request. The page retried after 800 ms and recovered to 1920 × 1080 without another click. This verifies temporary failure recovery, not a universal startup-time guarantee.
- Category bubbles are larger and placed inside the prompt box at the upper left. Blue, lavender and mint remain matched to the corresponding sections; no leading dot.
- All 14 hero/stream regression suites passed, with independent review. The 40-video selection, order, media encoding and camera transitions are unchanged.

## Release 27

- The 40-window opening wall now contains 21 in-domain, all 15 L1 and all 4 L2 demonstrations. All nine in-domain task types remain represented, with two or three clips each.
- Selection and placement use a reproducible random seed. The five background-generalization clips occupy separate rows and are spaced apart; the other clips are interleaved.
- A small category bubble at the upper-left corner of the focused prompt identifies In Domain (blue), L1 Generalization (lavender) or L2 Generalization (mint). The same palette is used by the corresponding gallery entry links, headings and video labels.
- New lightweight wall previews and first-frame posters come from the existing trimmed HD media. Full 1080p files, the v26 handoff, camera transitions and galleries are unchanged.

## Release 26

- HD handoff now checks the actual submitted video-frame timestamp. The moving preview covers the HD layer until the matching frame is confirmed, preventing a clock-only switch from exposing an old or unpainted surface. Source changes and seeks invalidate older frame evidence.
- Warm HD starts from zero after camera settlement only when that first frame is confirmed. Missing frames retain the preview; cancellation and retry bounds prevent stale selections or endless retries. Older browsers have a documented playback/paint fallback.
- All 57 HLS playlists and fMP4 initialization prefixes are bundled (about 15 KB gzip of metadata, no video samples). This removes two serial requests before a media fragment. Actual video ranges, foreground buffering limits and native MP4 fallback are unchanged.
- The user-reported cabinet/flower clip was checked with consecutive browser screenshots. In a controlled cold load with 1.2-second HD request latency it reached 1080p in 1.79 seconds; the actual frame was confirmed before handoff. A warmed selection started HD from zero about 9 ms after camera settlement. These are samples, not a guarantee for every device, network or cache state.
- Twelve hero regression scripts, the original stream checks, new bootstrap checks and independent review passed. The packaging preflight verifies embedded initialization metadata against the published media.
- Media remains 1920 × 1080 H.264, 24 fps, CRF29. HLS uses the same encoded packets. Existing layout, camera movement, rounded cards, prompts and other website interactions are retained.
- Git identity is now associated with LiangHeng121 for new commits. Previously published commit history has not been rewritten.

`release.json` records the content version. Add `?mediaDebug=1` to inspect event-based playback diagnostics. Third-party component and source attribution remains alongside the website assets.
