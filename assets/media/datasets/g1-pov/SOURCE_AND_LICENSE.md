# G1 SONIC head-camera training examples

Source: [hliang/g1_sonic_lerobot_0917_neckclean_merged on ModelScope](https://www.modelscope.cn/datasets/hliang/g1_sonic_lerobot_0917_neckclean_merged).

- Publisher: hliang / WE-Dream project.
- Repository revision: `4d39ebb25c950f04d9e5883681819d26170659f4`.
- License: Apache-2.0, explicitly declared by the repository README. The complete license text is provided in [LICENSE.txt](LICENSE.txt).
- Archive: `g1_sonic_lerobot_0917_neckclean_merged.zip`; the publisher's SHA-256 is `3aa7c768757da2128de66c3a720db73855587cadc89f8833350c9e9c15a47eb1`.
- Camera: `observation.images.head`, 672 × 384 RGB, 30 FPS, H.264. The embodiment mapping identifies head-camera frames from the original `color/` stream.
- The nine delivered MP4 files are web encodings of original archive episode segments, made with libx264 slow CRF 29, yuv420p and faststart. On 2026-10-24, only each episode's initial pre-action lead-in was removed so visible hand/arm action starts within 0.5 s. All subsequent frames through the original ending remain in order, at 672 × 384 and 30 FPS; no spatial crop or speed change. Encoding is lossy, so delivered bytes and decoded pixels differ from the originals. The already-silent recordings remain silent. JPEG posters are extracted at delivery time 0.3 s.
- Original MP4 total: 26,760,483 bytes. Current delivered MP4 total: 10,361,308 bytes (9.881 MiB). Source and delivery byte counts and SHA-256 values are separately recorded in `data/dataset-media.json`. All nine delivered files passed full decoding, exact retained-frame-count checks, and first/final retained-frame comparison with the unmodified originals. Review evidence is in `docs/website-research/curation-20261024/dataset-audit/` in the development repository.
- Episode segments can be parts of original demonstrations. These previews are not presented as nine independent complete demonstrations, evaluation trials, or demonstrations from the exact paper training-set revision.
- The public 0917 archive contains 563 segments / 547,327 frames / 5.0678426 h and restores 85 segments to an earlier set. The paper reports 4.02 h; the website labels this distribution as a separate repository snapshot.

| File | Archive episode | Task index | Original frames | Head removed (s) | Delivered frames |
|---|---:|---:|---:|---:|---:|
| g1-pov-pick-place.mp4 | 175 | 15 | 617 | 1.2 | 581 |
| g1-pov-chair.mp4 | 312 | 46 | 793 | 0.6 | 775 |
| g1-pov-pillow.mp4 | 130 | 23 | 1,944 | 1.7 | 1,893 |
| g1-pov-clothes.mp4 | 137 | 38 | 954 | 2.0 | 894 |
| g1-pov-rubbish.mp4 | 351 | 4 | 783 | 0.7 | 762 |
| g1-pov-shoes.mp4 | 538 | 0 | 1,090 | 0.5 | 1,075 |
| g1-pov-sweep.mp4 | 213 | 28 | 1,229 | 0.3 | 1,220 |
| g1-pov-cabinet.mp4 | 92 | 52 | 1,409 | 0.5 | 1,394 |
| g1-pov-drawer.mp4 | 426 | 29 | 1,567 | 0.8 | 1,543 |

Members use `g1_sonic_lerobot_0917_neckclean_merged/videos/chunk-000/observation.images.head/episode_XXXXXX.mp4` (six-digit episode index). Exact task strings and source-member paths are retained in `data/dataset-media.json`. Source metadata and verification evidence are retained in the development repository under `docs/website-research/dataset-source/`.
