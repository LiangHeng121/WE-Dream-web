# Website source credits and notices

This directory preserves upstream source, attribution and permission records for the WE-Dream project website. Research data, model weights, papers and demonstration videos are separate from these website-template notices.

## Psi0 demonstration carousel

Copyright © 2026 PSI Lab. All rights reserved.

The WE-Dream demonstration reel adapts the actual [Psi0 website](https://psi-lab.ai/Psi0/) implementation from the [Psi0 repository's website branch](https://github.com/physical-superintelligence-lab/Psi0/tree/c2a96a365def9409064449f2b37aa7e2efded781).

The branch has no standalone SPDX license. Its [README adoption instructions](psi0/README.upstream.md) and [project-page adoption guide](psi0/ADOPTION.upstream.md) expressly describe reuse for other research teams. These are preserved as the basis for this project adaptation; the separate model repository's license is not claimed to apply to the website branch.

- [Full source/permission notice](psi0/NOTICE.md)
- [Original carousel component](psi0/DemosSection.upstream.astro)
- [Original page CSS](psi0/project-page.upstream.css)
- Adapted files: `modules/demo-deck.js` and `modules/demo-deck.css`.

Changes include a buildless JavaScript module, player-integration callbacks, responsive geometry, keyboard navigation, reduced-motion handling, inactive-content focus management and cleanup. The original native scrolling, centering and neighboring-card transition approach is retained.

## ViTacFormer background presentation

The full-height background-video presentation adapts the [ViTacFormer project page](https://roboverseorg.github.io/ViTacFormerPage/) ([source revision](https://github.com/RoboVerseOrg/ViTacFormerPage/tree/685c8db990e631f2aff539a28315bad79138d06f)). The upstream website footer licenses its template under [Creative Commons Attribution-ShareAlike 4.0 International](https://creativecommons.org/licenses/by-sa/4.0/). The adapted ViTacFormer template material is made available under the same license.

The source's earlier template credits are retained: SkillBlender, [UMI on Legs](https://umi-on-legs.github.io/), [RoboPoint](https://robo-point.github.io/), [NeRFies](https://nerfies.github.io/), and [Scaling Up Distilling Down](https://www.cs.columbia.edu/~huy/scalingup/). In particular, the upstream footer asks that adaptations link back to NeRFies.

- [Full attribution notice](vitacformer/NOTICE.md)
- [CC BY-SA 4.0 license text](vitacformer/LICENSE-CC-BY-SA-4.0.txt)
- [Original page HTML, archived as text](vitacformer/index.upstream.html.txt)
- [Original publication CSS](vitacformer/index.upstream.css)

The source uses a precomposed background video. WE-Dream's independent full-length video mosaic, tile focus/zoom controls and project content are identified additions. No ViTacFormer research videos are redistributed as WE-Dream demonstrations.

## Other visual references

[WB-WAM](https://wb-wam.github.io/) and [Tactile Force Survey](https://jingliangli.com/tactile-force-survey/) informed the research-page presentation. WB-WAM's current repository did not provide a general website reuse license, so its site code/media are not included here. An icon-specific license is not treated as a license for that entire site.

Retrieved and verified: 2026-10-19. The development repository's `docs/website-research/SOURCE_REUSE.md` records exact upstream functions, revisions, adaptations and integration details.

## Method presentation references (v32)

The native method walkthrough independently implements presentation patterns studied in [Dream-1](https://dreamlabs.ai/research/dream-1/assets/wam.html) (SVG information flow and token reveal) and [FIBER](https://fiberaa.github.io/) (chapter navigation and continuous scene changes). Their research claims and artwork are not used as WE-Dream content. No website-source license was found for these references; no upstream animation code is redistributed in the site. The implementation is original, and its technical content follows WE-Dream Figure 2 and Sections III-B–F. Detailed source inspection and provenance are retained in the development repository under `docs/website-research/method-v32/references/`.
