# Method-only illustrative videos — v35

These assets are dedicated small-window illustrations for the WE-Dream Method diagram. Existing full dataset episodes, main demonstration videos, and their original files are unchanged.

## Human pretraining mosaic

Four independently looping EgoDex publisher examples, in reading order: cloth arrangement, emptying a box, turning a Rubik's cube, pouring. Authors: Ryan Hoque, Peide Huang, David J. Yoon, Mouli Sivapurapu, Jian Zhang / Apple.

Source: https://github.com/apple-aiml-research/ml-egodex — dataset terms CC BY-NC-ND, separate from the repository code license. Existing source/conversion provenance: `../datasets/egodex/SOURCE_AND_LICENSE.md`.

This is a 20-second 1280×720 2×2 collage made from the existing website encodings. Each 640×360 cell plays at the original speed. Short source clips loop; a longer clip or loop is cut at the collage boundary. These are publisher illustrations, not asserted to be the exact WE-Dream training samples.

## Robot post-training mosaic

Four independently looping G1 SONIC head-camera recordings: pick/place (episode 175), pushing a chair (312), gathering clothes (137), storing a bottle in a drawer (426).

Publisher: hliang / WE-Dream. Dataset: https://www.modelscope.cn/datasets/hliang/g1_sonic_lerobot_0917_neckclean_merged . Revision `4d39ebb25c950f04d9e5883681819d26170659f4`; Apache-2.0. Existing license and source provenance: `../datasets/g1-pov/LICENSE.txt` and `../datasets/g1-pov/SOURCE_AND_LICENSE.md`.

This is a 20-second 1280×720 2×2 collage of the existing head-trimmed web deliveries. Each cell fits the native 672×384 source within 640×360, preserving aspect ratio and real-time speed. The source is not native 1080p. The public 0917 snapshot is not asserted to be the paper's exact training-set revision or an evaluation rollout. This collage is not synchronized or paired with the deployment demonstration.

## Deployment small-window rendition

`deployment-prefilter1080.mp4` derives from the project's original gray-shirt collection recording (`1_gray_right_trun_around.MP4`, Drive ID `1puOhktSpme4E-M6At185A0rK9V-ax5ez`). It retains native 1920×1080 dimensions, every source frame (698), 30000/1001 FPS, and the complete 23.29-second sequence. There is no resizing, upscaling, spatial crop, retiming, or temporal smoothing.

A modest spatial lowpass (Gaussian sigma 1.6, three steps) reduces sampling aliases when a native 1080p video is rendered roughly six times smaller. CRF23 H.264/yuv420p, one-second keyframes and faststart are used. This intentionally softens subpixel fine detail in the small Method illustration. It does not replace main demo videos.

Every JPEG is the first decoded frame of its matching new MP4, without a seek. Detailed per-source SHA-256 values, encoding commands, dimensions and frame-count checks are recorded in `docs/website-research/method-v35/media-build.json` in the development repository.

Processing reference: [FFmpeg gblur filter](https://ffmpeg.org/ffmpeg-filters.html#gblur), applied once in the Method-only deployment encoding as `gblur=sigma=1.6:steps=3`. Browser playback remains a normal HTML video element.
