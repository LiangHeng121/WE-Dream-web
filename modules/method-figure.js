import { videoFullyBuffered } from './video-warm.js?v=v29.1';

// Original Figure 2 regions are the visual source of truth. These overlays
// highlight existing modules, rather than replacing the architecture.
const FIGURES = {
  overview: 'assets/figures/method-overview.png',
  latent: 'assets/figures/method-human.png',
  robot: 'assets/figures/method-robot.png',
  backbone: 'assets/figures/method-backbone.png',
  control: 'assets/figures/method-control-path.png',
};
const MEDIA = {
  execution: {
    src: 'assets/media/hd1080/1puOhktSpme4E-M6At185A0rK9V-ax5ez.mp4',
    poster: 'assets/media/curated/1puOhktSpme4E-M6At185A0rK9V-ax5ez.jpg?v=v29.1',
    label: 'Policy execution',
    source: 'https://drive.google.com/file/d/1puOhktSpme4E-M6At185A0rK9V-ax5ez/view',
    alt: 'A WE-Dream humanoid rollout collecting a yellow shirt into a laundry basket.',
  },
};

// Paper pp. 3–5, Fig. 2 and Sections III-C/III-F: mixed routing is a
// training mechanism; the deployed system uses action-only inference + RTC.
const DETAILS = {
  latent: { panel: 'latent', label: 'Latent-action pretraining', title: 'Transfer interaction knowledge from human video.', text: 'A frozen latent action model encodes consecutive frames into 32D transition codes. These targets supervise action prediction alongside video, capturing interaction semantics without prescribing human hand kinematics.', facts: ['Frozen LAM', '32D visual-transition codes'] },
  transfer: { panel: 'latent', label: 'Transferring the pretrained model', title: 'Adapt the interface while reusing the backbone.', text: 'Robot post-training transfers the pretrained backbone and adapts the action and state interfaces to 80D humanoid commands and 45D states. A single policy is then jointly trained on nine household task families.', facts: ['Pretrained shared backbone', 'One humanoid policy'] },
  routing: { panel: 'routing', label: 'Routed attention', title: 'Retain video learning for action-only control.', text: 'Routed attention varies action queries’ access to noisy future-video tokens during training. Both routes retain video and action supervision; the deployed policy can then omit future-video generation.', facts: ['Mixed routing · p = 0.5', 'Both training losses retained'] },
  backbone: { panel: 'routing', label: 'Shared world–action backbone', title: 'Couple visual prediction and action learning.', text: 'Separate video, action and state encoders feed a shared DiT. Language and reference-image embeddings provide cross-attention conditioning, connecting visual dynamics and action prediction within one model.', facts: ['Shared DiT', 'Language + image conditioning'] },
  context: { panel: 'routing', label: 'Block-causal attention', title: 'Ground actions in observed history.', text: 'Clean past observations remain visible. Video, action and state align within the current temporal block, while later blocks are masked. Action queries always retain observed context.', facts: ['Clean visual history', 'Aligned temporal blocks'] },
  objectives: { panel: 'routing', label: 'Training objectives', title: 'Learn world dynamics and actions together.', text: 'The video head and action decoder predict separate flow velocities. Video and action losses have equal weight in both pretraining and robot post-training, including both sampled attention routes.', facts: ['Video flow matching', 'Action flow matching'] },
  control: { panel: 'control', label: 'Action-only deployment', title: 'Keep moving while the model predicts.', text: 'Deployment omits future-video denoising and reuses cached observation keys and values. Real-time chunking predicts 24 actions and replans every 12, overlapping prediction and execution for a continuous 30 Hz action stream.', facts: ['No future-video denoising', '24 actions · replan every 12'] },
  execution: { panel: 'execution', label: 'Whole-body execution', title: 'Turn compact commands into coordinated motion.', text: 'Hand and neck targets execute directly. SONIC converts the 64D latent body command into body joint targets, supporting continuous whole-body execution.', facts: ['Direct hand + neck targets', 'SONIC body controller'] },
};
function film(key, label = MEDIA[key].label) {
  const media = MEDIA[key];
  return `<figure class="mf-film"><div class="mf-film-frame"><video muted loop playsinline preload="none" data-src="${media.src}" poster="${media.poster}" aria-label="${media.alt}"></video></div><figcaption><a href="${media.source}" target="_blank" rel="noopener">${label} ↗</a></figcaption></figure>`;
}
const STAGES = [
  { key: 'latent', number: '01', label: 'Latent-action pretraining' },
  { key: 'routing', number: '02', label: 'Routed attention' },
  { key: 'control', number: '03', label: 'Action-only deployment' },
];

// Keep the one deployment film's existing playback policy while releasing
// incomplete network requests when the film leaves the viewport. Restoration
// waits for metadata and the saved seek before it may resume playback.
export function createMethodVideoController(video, { mayPlay, shouldSuspend, signal } = {}) {
  let saved = null, restoring = false, disposed = false;
  function suspend() {
    if (!video.getAttribute('src') || videoFullyBuffered(video)) return;
    if (!saved) saved = { time: Number.isFinite(video.currentTime) ? video.currentTime : 0, rate: video.playbackRate || 1 };
    restoring = false;
    video.pause(); video.removeAttribute('src'); video.preload = 'none'; video.load();
  }
  function sync() {
    if (disposed) return;
    if (!mayPlay()) {
      video.pause();
      if (shouldSuspend()) suspend();
      return;
    }
    if (!video.getAttribute('src')) {
      video.preload = 'auto'; video.src = video.dataset.src; video.load();
    }
    if (saved) {
      if (video.readyState < 1) return;
      const end = Number.isFinite(video.duration) ? Math.max(0, video.duration - .05) : saved.time;
      const target = Math.min(saved.time, end);
      if (!restoring) {
        restoring = true; video.playbackRate = saved.rate;
        if (Math.abs(video.currentTime - target) > .05) {
          try { video.currentTime = target; } catch { restoring = false; return; }
        }
      }
      if (video.seeking || video.readyState < 2 || Math.abs(video.currentTime - target) > .1) return;
      saved = null; restoring = false;
    }
    if (!video.paused) return;
    video.play().then(() => { if (disposed || !mayPlay()) video.pause(); }).catch(() => {});
  }
  function destroy() {
    if (disposed) return;
    disposed = true; saved = null;
    video.pause();
    if (video.getAttribute('src')) { video.removeAttribute('src'); video.load(); }
    for (const event of ['loadedmetadata', 'loadeddata', 'canplay', 'seeked']) video.removeEventListener(event, sync);
    video.removeEventListener('play', guard);
    signal?.removeEventListener('abort', destroy);
  }
  const guard = () => { if (disposed || !mayPlay()) video.pause(); };
  for (const event of ['loadedmetadata', 'loadeddata', 'canplay', 'seeked']) video.addEventListener(event, sync);
  video.addEventListener('play', guard);
  signal?.addEventListener('abort', destroy, { once: true });
  if (signal?.aborted) destroy();
  return { sync, destroy };
}

export function mountMethodFigure(root) {
  if (!root) return;
  const motionQuery = matchMedia('(prefers-reduced-motion: reduce)');
  let paused = motionQuery.matches;
  let inView = false, destroyed = false;
  const abort = new AbortController(), { signal } = abort;
  root.classList.add('method-explorer');
  root.innerHTML = `
    <div class="mf-toolbar"><div class="mf-tools"><button type="button" class="mf-motion" aria-pressed="${!paused}">${paused ? 'Play motion' : 'Pause motion'}</button><button type="button" class="mf-expand">Original figure ↗</button></div></div>
    <div class="mf-tabs" role="group" aria-label="Explore the three method contributions">${STAGES.map(stage => `<button type="button" data-stage="${stage.key}" aria-pressed="false"><span class="mf-nav-number">${stage.number}</span><span>${stage.label}</span><span class="mf-nav-dot" aria-hidden="true"></span></button>`).join('')}</div>
    <div class="mf-scene">
      <p class="mf-mobile-hint">Swipe across the architecture <span aria-hidden="true">→</span></p>
      <div class="mf-board" tabindex="0" role="region" aria-label="Unified WE-Dream architecture; scroll horizontally on small screens">
        <div class="mf-architecture">
          <section class="mf-panel mf-latent" data-panel="latent" aria-label="Pretraining and post-training">
            <div class="mf-training-figures">
              <button type="button" class="mf-training-figure" data-part="latent" aria-label="Explore pretraining"><img loading="lazy" decoding="async" data-src="${FIGURES.latent}" width="1149" height="702" alt="Pretraining: original Figure 2a, with consecutive human frames, frozen LAM and 32D latent actions."></button>
              <span class="mf-transfer-arrow" aria-hidden="true">↓</span>
              <button type="button" class="mf-training-figure" data-part="transfer" aria-label="Explore post-training"><img loading="lazy" decoding="async" data-src="${FIGURES.robot}" width="1149" height="743" alt="Post-training: original Figure 2b, adapting the pretrained model to robot video, 80D commands and 45D states."></button>
            </div>
          </section>
          <section class="mf-panel mf-model" data-panel="routing">
            <div class="mf-model-wrap"><div class="mf-paper-model"><img loading="lazy" decoding="async" data-src="${FIGURES.backbone}" width="1645" height="1551" alt="Original Figure 2c: modality encoders, block-causal shared DiT, routed attention and video/action training losses.">
              <button type="button" class="mf-region mf-region-encoders" data-part="backbone" aria-label="Explore modality encoders and conditioning"></button>
              <button type="button" class="mf-region mf-region-context" data-part="context" aria-label="Explore block-causal attention"></button>
              <button type="button" class="mf-region mf-region-routing" data-part="routing" aria-label="Explore routed attention during training"></button>
              <button type="button" class="mf-region mf-region-objectives" data-part="objectives" aria-label="Explore video and action training losses"></button>
              <span class="mf-signal mf-signal-context" aria-hidden="true"></span><span class="mf-signal mf-signal-action" aria-hidden="true"></span><span class="mf-signal mf-signal-future" aria-hidden="true"></span>
            </div></div>
          </section>
          <section class="mf-panel mf-output" data-panel="control">
            <button type="button" class="mf-controller" data-part="execution" aria-label="Explore the original paper's command decomposition and SONIC controller"><img loading="lazy" decoding="async" data-src="${FIGURES.control}" width="925" height="898" alt="Original Figure 2d: 80D commands split into 14D hand targets, 2D neck targets and 64D latent body commands; SONIC generates body joint targets for a continuous 30 Hz action stream."></button>
            <div class="mf-execution" data-panel="execution">${film('execution')}</div>
          </section>
        </div>
      </div>
    </div>
    <div class="mf-detail" aria-live="polite"><div class="mf-detail-heading"><span class="mf-detail-number" aria-hidden="true"></span><div><p class="mf-kicker"></p><h3></h3></div></div><div class="mf-detail-body"><p class="mf-description"></p><div class="mf-facts"></div></div></div>
    <div class="mf-footnote"><a href="assets/paper.pdf#page=3" target="_blank" rel="noopener">Figure 2 · Sections III-C–F ↗</a></div>
    <dialog class="mf-dialog" aria-label="Original WE-Dream architecture"><form method="dialog"><p>WE-Dream · Figure 2</p><button type="submit" aria-label="Close original figure">Close ×</button></form><div class="mf-dialog-image"><img loading="lazy" decoding="async" data-src="${FIGURES.overview}" width="4108" height="1572" alt="Original full-resolution WE-Dream architecture from Figure 2."></div><p>Training uses mixed routing. The deployed policy uses action-only inference with real-time chunking.</p></dialog>`;
  const scene = root.querySelector('.mf-scene'), board = root.querySelector('.mf-board');
  const videos = [...root.querySelectorAll('.mf-execution video')], dialog = root.querySelector('dialog');
  const motionButton = root.querySelector('.mf-motion');
  const on = (target, event, callback) => target.addEventListener(event, callback, { signal });
  function videoVisible(video) {
    const rect = video.getBoundingClientRect(), clip = board.getBoundingClientRect();
    const width = Math.max(0, Math.min(rect.right, clip.right, innerWidth) - Math.max(rect.left, clip.left, 0));
    const height = Math.max(0, Math.min(rect.bottom, clip.bottom, innerHeight) - Math.max(rect.top, clip.top, 0));
    return rect.width > 0 && rect.height > 0 && width * height >= rect.width * rect.height * .25;
  }
  function mayPlay(video) { return !destroyed && inView && !paused && !document.hidden && !dialog.open && video.isConnected && videoVisible(video); }
  const videoControllers=videos.map(video=>createMethodVideoController(video,{mayPlay:()=>mayPlay(video),shouldSuspend:()=>document.hidden||!inView||!videoVisible(video),signal}));
  function syncMotion() {
    if (destroyed) return;
    scene.classList.toggle('is-paused', !inView || paused || document.hidden || dialog.open);
    motionButton.textContent = paused ? 'Play motion' : 'Pause motion';
    motionButton.setAttribute('aria-pressed', String(!paused));
    videoControllers.forEach(controller=>controller.sync());
  }
  function selectPart(key, animate = true) {
    if (!DETAILS[key] || destroyed) return;
    const detail = DETAILS[key];
    const stageKey = detail.panel === 'execution' ? 'control' : detail.panel;
    scene.dataset.selectedStage = stageKey;
    const selectedPart = key === 'control' ? 'execution' : key;
    scene.dataset.selectedPart = selectedPart;
    root.querySelectorAll('.mf-tabs [data-stage]').forEach(button => {
      const active = button.dataset.stage === stageKey;
      button.classList.toggle('is-selected', active);
      button.setAttribute('aria-pressed', String(active));
    });
    root.querySelectorAll('[data-part]').forEach(button => { const active = button.dataset.part === selectedPart; button.classList.toggle('is-selected', active); button.setAttribute('aria-pressed', String(active)); });
    const stage = STAGES.find(item => item.key === stageKey);
    root.querySelector('.mf-kicker').textContent = detail.label;
    root.querySelector('.mf-detail').dataset.stage = stageKey;
    root.querySelector('.mf-detail-number').textContent = stage.number;
    root.querySelector('.mf-detail h3').textContent = detail.title;
    root.querySelector('.mf-description').textContent = detail.text;
    root.querySelector('.mf-facts').replaceChildren(...detail.facts.map(fact => { const span = document.createElement('span'); span.textContent = fact; return span; }));
    if (animate && !paused && !motionQuery.matches) root.querySelector('.mf-detail').animate?.([{ opacity: .4 }, { opacity: 1 }], { duration: 250 });
  }
  function selectStage(key) {
    selectPart(key);
    const target = root.querySelector(`[data-panel="${key}"]`)?.closest('.mf-panel');
    if (!target || board.scrollWidth <= board.clientWidth + 2) return;
    const rect = target.getBoundingClientRect(), viewport = board.getBoundingClientRect();
    board.scrollBy({ left: rect.left - viewport.left - (board.clientWidth - rect.width) / 2, behavior: motionQuery.matches || paused ? 'instant' : 'smooth' });
  }
  const stageButtons = [...root.querySelectorAll('.mf-tabs [data-stage]')];
  stageButtons.forEach(button => on(button, 'click', () => selectStage(button.dataset.stage)));
  on(root.querySelector('.mf-tabs'), 'keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const current = stageButtons.indexOf(event.target);
    if (current < 0) return;
    event.preventDefault();
    const index = event.key === 'Home' ? 0 : event.key === 'End' ? stageButtons.length - 1 : (current + (event.key === 'ArrowRight' ? 1 : -1) + stageButtons.length) % stageButtons.length;
    selectStage(stageButtons[index].dataset.stage);
    stageButtons[index].focus({ preventScroll: true });
  });
  root.querySelectorAll('[data-part]').forEach(button => on(button, 'click', () => selectPart(button.dataset.part)));
  let scrollFrame = 0;
  on(board, 'scroll', () => { if (!scrollFrame) scrollFrame = requestAnimationFrame(() => { scrollFrame = 0; syncMotion(); }); });
  on(window, 'resize', syncMotion);
  on(motionButton, 'click', () => { paused = !paused; syncMotion(); });
  on(root.querySelector('.mf-expand'), 'click', () => { const image=dialog.querySelector('img');if(!image.src)image.src=image.dataset.src;dialog.showModal(); syncMotion(); });
  on(dialog, 'close', syncMotion); on(dialog, 'click', event => { if (event.target === dialog) dialog.close(); });
  on(document, 'visibilitychange', syncMotion);
  on(motionQuery, 'change', event => { paused = event.matches; syncMotion(); });
  // Mounting the interaction shell must not eagerly download all paper crops
  // while a visitor jumps past this section to the demonstration player.
  const figures = [...scene.querySelectorAll('img[data-src]')];
  const loadFigures = () => figures.forEach(image => { if (!image.getAttribute('src')) image.src = image.dataset.src; });
  let observer, figureObserver, figureTimer;
  if ('IntersectionObserver' in window) {
    figureObserver = new IntersectionObserver(entries => {
      clearTimeout(figureTimer);
      if (!destroyed && entries.some(entry => entry.isIntersecting)) {
        // A smooth anchor jump passes through this section briefly. Keep its
        // large paper crops out of the requested destination's network queue.
        figureTimer = setTimeout(() => { if (!destroyed) { loadFigures(); figureObserver.disconnect(); } }, 220);
      }
    }, { rootMargin: '100px 0px' });
    figureObserver.observe(scene);
    observer = new IntersectionObserver(entries => {
      if (destroyed) return;
      entries.forEach(entry => { if (entry.target === scene) inView = entry.isIntersecting; });
      syncMotion();
    }, { threshold: [0, .12, .25, .5] });
    observer.observe(scene); videos.forEach(video => observer.observe(video));
  } else { inView = true; loadFigures(); }
  selectPart('routing', false); syncMotion();
  return { selectStage: selectPart, destroy() { destroyed = true; abort.abort(); observer?.disconnect(); figureObserver?.disconnect(); clearTimeout(figureTimer); cancelAnimationFrame(scrollFrame); videoControllers.forEach(controller=>controller.destroy()); if (dialog.open) dialog.close(); root.replaceChildren(); root.classList.remove('method-explorer'); } };
}
