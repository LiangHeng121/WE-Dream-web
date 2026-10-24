# EgoDex source examples

Authors: Ryan Hoque, Peide Huang, David J. Yoon, Mouli Sivapurapu, and Jian Zhang (Apple).

Source paper: [EgoDex: Learning Dexterous Manipulation from Large-Scale Egocentric Video](https://arxiv.org/abs/2505.11709).

Official repository and dataset terms: https://github.com/apple-aiml-research/ml-egodex#license. The official README states that the dataset is available under CC BY-NC-ND terms. The repository code license is separate.

Archive: https://ml-site.cdn-apple.com/datasets/egodex/test.zip

The nine selected complete recordings come from these archive members:
- `test/fold_stack_unstack_unfold_cloths/3.mp4`
- `test/open_close_insert_remove_box/2.mp4`
- `test/use_rubiks_cube/21.mp4`
- `test/pour/16.mp4`
- `test/zip_unzip_bag/21.mp4`
- `test/screw_unscrew_bottle_cap/24.mp4`
- `test/lock_unlock_key/7.mp4`
- `test/paint_clean_brush/14.mp4`
- `test/fold_unfold_paper_basic/4.mp4`

These publisher examples illustrate the dataset, and are not claimed to be the exact samples used in WE-Dream training. The original MPEG-4 Part 2 codec did not play in Chromium. The MP4s are technically converted to H.264/yuv420p for browser compatibility, retaining complete duration, frame rate and frame order. The original four 1080p deliveries also preserve source resolution; the lighter mosaic files reduce spatial resolution as stated below. No editorial cuts, cropping or speed changes were applied. JPEG posters are technically resized frames for video navigation. Original-source hashes, rendered-file hashes, exact durations and conversion records are in `website/data/dataset-media.json`.

For the nine-cell mosaic, `mosaic/` contains 640×360 H.264/yuv420p technical previews at the original 30 FPS, with complete duration and frame order. Only spatial resolution and encoding change; there are no cuts, crops or timing changes. The four previously delivered 1080p assets remain intact for existing references. Mosaic preview hashes and source hashes are separate in `dataset-media.json`.
