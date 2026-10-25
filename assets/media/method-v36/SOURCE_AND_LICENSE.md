# Method training mosaics, revision36

These two illustrations reuse existing public dataset examples. They are Method-only derived media: no full dataset player, original demo, video-wall selection, or other original file is changed.

## Human mosaic — exactly two EgoDex + two EgoVerse scenes

| Tile | Source | Sequence | Source excerpt |
|---|---|---|---|
| Top left | EgoDex | Fold/unfold cloth |0.0–8.5s of the existing dataset illustration |
| Top right | EgoDex | Open/close a cardboard box |0.0–8.5s of the existing dataset illustration |
| Bottom left | EgoVerse | Pack green peppers |0.0–8.5s |
| Bottom right | EgoVerse | Iron clothes |5.0–13.5s |

EgoDex: Apple authors, official [repository](https://github.com/apple-aiml-research/ml-egodex) and public test archive. Exact archive members and hashes are retained in the development record `docs/website-research/method-v36/media-build.json`; existing EgoDex license notices remain at `../datasets/egodex/`.

EgoVerse: consortium, official [dataset browser](https://egoverse-research-workbench.vercel.app/). Pepper episode `2025-05-08-02-34-44-740246`; ironing episode source URL and identifier are retained in `media-build.json` and existing `data/dataset-media.json`. The source browser supplies no explicit reuse license for these human episodes; none is inferred. These are attributed publisher illustrations, not asserted to be exact WE-Dream training examples.

## Robot mosaic — calmer active head-camera excerpts

Source: hliang / WE-Dream, [G1 SONIC 0917 neck-clean merged dataset](https://www.modelscope.cn/datasets/hliang/g1_sonic_lerobot_0917_neckclean_merged), revision `4d39ebb25c950f04d9e5883681819d26170659f4`, Apache-2.0. Full license remains at `../datasets/g1-pov/LICENSE.txt`.

| Tile | Task | Archive episode | Original excerpt | Relative to website dataset excerpt |
|---|---|---|---|---|
| Top left | Manipulate a drawer |426 |13.8–25.8s |13.0–25.0s |
| Top right | Sweep a table |213 |13.8–25.8s |13.5–25.5s |
| Bottom left | Move a pillow |130 |22.2–34.2s |20.5–32.5s |
| Bottom right | Push a chair |312 |12.1–24.1s |11.5–23.5s |

All source MP4 hashes are checked against the previous original-archive verification before encoding. Sources are `observation.images.head` at native672×384,30FPS; the mosaic is1280×720, not a claim of native1080p robot dataset footage. This is a public0917 snapshot, not asserted to be the exact paper training-set revision.

Selection used global camera-motion screening across all nine existing examples, followed by contact-sheet review for visible real hand/object activity. No stabilization, frozen frame, interpolation, crop, or speed manipulation was applied. The four clips are quieter active subsegments, not complete task demonstrations.

## Delivery

Both files use H.264,30FPS, yuv420p,1-second GOP, silent tracks, faststart. Each source is fitted into a640×360 cell without crop, preserving aspect ratio; the head-camera inputs have subtle vertical matte. Human duration8.5s/255frames; robot duration12s/360frames. No tile loops independently or repeats inside its composite. The browser loops the complete composite. Each JPEG poster is frame0 of its matching new MP4.

Full decode, frame counts, input/output hashes, source URLs, timestamps, and exact commands are in `docs/website-research/method-v36/media-build.json`. Motion-screening methodology and comparisons are in `robot-camera-motion.json` and `MEDIA_SELECTION.md` in the development repository.
