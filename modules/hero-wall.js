import { seekVideo } from './video-seek.js';
/* Fullscreen title / video layering adapted from ViTacFormerPage (CC BY-SA 4.0).
 * The single reveal, independent action loops, and focus camera are WE-Dream additions.
 * See vendor/ and docs/website-research/SOURCE_REUSE.md for provenance. */
// Each visible activation gets at most three automatic attempts. Browser pause /
// buffering events can recover, but user Pause and background tabs always win.
export function createWallPlaybackController({ onChange = () => {}, onWarning = () => {} } = {}) {
  const states = new Map();
  let destroyed = false;
  function status(state, value) {
    state.status = value; state.video.dataset.playback = value;
    state.video.dataset.playAttempts = String(state.attempts); onChange();
  }
  function later(state, delay = 500) {
    clearTimeout(state.retry);
    if (!state.wanted || state.blocked || state.video.error || state.attempts >= 3 || destroyed) return;
    state.retry = setTimeout(() => attempt(state), delay);
  }
  function failure(state, error) {
    if (!state.wanted || destroyed) return;
    const name = error?.name || 'PlaybackError';
    if (name === 'NotAllowedError') state.blocked = true;
    status(state, state.blocked ? 'blocked' : state.video.error || name === 'NotSupportedError' ? 'error' : state.attempts >= 3 ? 'retry-needed' : 'waiting');
    if (name !== 'AbortError' && state.warning !== name) {
      state.warning = name; onWarning(state.video, name);
    }
    if (name !== 'NotSupportedError') later(state);
  }
  function attempt(state) {
    if (destroyed || !state.wanted || state.pending) return;
    if (state.video.error) { status(state, 'error'); return; }
    if (state.blocked) { status(state, 'blocked'); return; }
    if (!state.video.paused && state.video.readyState >= 2) { status(state, 'playing'); return; }
    if (state.attempts >= 3) { status(state, 'retry-needed'); return; }
    state.attempts += 1;
    const pending = {}; state.pending = pending; status(state, 'loading');
    pending.timer = setTimeout(() => {
      if (state.pending !== pending) return;
      state.pending = null;
      if (state.wanted) { status(state, state.attempts >= 3 ? 'retry-needed' : 'waiting'); later(state, 1000); }
    }, 10000);
    let promise;
    try { promise = state.video.play(); } catch (error) { promise = Promise.reject(error); }
    Promise.resolve(promise).then(() => {
      if (destroyed || !state.wanted || !state.video.isConnected) { state.video.pause(); return; }
      if (state.pending === pending) { state.warning = null; status(state, 'playing'); }
    }, error => { if (state.pending === pending) failure(state, error); }).finally(() => {
      clearTimeout(pending.timer);
      if (state.pending === pending) state.pending = null;
    });
  }
  function get(video) {
    if (states.has(video)) return states.get(video);
    const state = { video, wanted: false, attempts: 0, blocked: false, pending: null, retry: null, status: 'paused', abort: new AbortController() };
    states.set(video, state);
    const on = (event, listener) => video.addEventListener(event, listener, { signal: state.abort.signal });
    on('canplay', () => { if (state.wanted) attempt(state); });
    on('loadeddata', () => { if (state.wanted) attempt(state); });
    on('playing', () => { if (!state.wanted || destroyed) video.pause(); else status(state, 'playing'); });
    on('pause', () => { status(state, state.wanted ? state.attempts >= 3 ? 'retry-needed' : 'waiting' : 'paused'); if (state.wanted) later(state, 150); });
    on('waiting', () => { if (state.wanted) status(state, 'buffering'); });
    on('stalled', () => { if (state.wanted) { status(state, 'buffering'); later(state); } });
    on('error', () => { status(state, 'error'); onWarning(video, `MediaError ${video.error?.code || ''}`); });
    return state;
  }
  return {
    sync(video, wanted, { reset = false } = {}) {
      const state = get(video);
      const activated = wanted && !state.wanted;
      state.wanted = wanted;
      if (activated || reset) { state.attempts = 0; state.warning = null; }
      if (reset) state.blocked = false;
      if (reset && video.error) video.load();
      if (!wanted) {
        clearTimeout(state.retry); video.pause(); status(state, 'paused');
      } else attempt(state);
    },
    remove(video) {
      const state = states.get(video); if (!state) return;
      state.wanted = false; state.abort.abort(); clearTimeout(state.retry); clearTimeout(state.pending?.timer);
      video.pause(); states.delete(video);
    },
    destroy() { destroyed = true; for (const video of states.keys()) this.remove(video); }
  };
}

// A play promise / currentTime does not prove that a frame reached the screen.
// The reveal uses presented-frame observations, plus enough data for the whole
// five-second move. A fully buffered looping file also covers a loop boundary.
export function wallBufferedAhead(video) {
  const { buffered, currentTime, duration } = video;
  for (let i = 0; i < buffered.length; i += 1) {
    const start = buffered.start(i), end = buffered.end(i);
    if (start <= currentTime + .05 && end >= currentTime) {
      if (video.loop && start <= .05 && Number.isFinite(duration) && end >= duration - .1) return Infinity;
      return Math.max(0, end - currentTime);
    }
  }
  return 0;
}

export function wallRevealReadiness(samples, { active, now, bufferSeconds = 5.5 } = {}) {
  const visible = samples.filter(sample => sample.visible);
  const frameReady = visible.filter(sample => !sample.paused && !sample.error && sample.advances >= 2 && now - sample.lastFrameAt < 1000).length;
  const bufferReady = samples.filter(sample => !sample.error && sample.bufferedAhead >= bufferSeconds).length;
  return { ready: Boolean(active && visible.length && frameReady === visible.length && bufferReady === samples.length), frameReady, visible: visible.length, bufferReady, total: samples.length };
}

// Spatial neighbors follow the rendered grid; its edges never wrap to another row.
export function wallNeighborIndex(index, direction, columns, count) {
  if (!Number.isInteger(index) || index < 0 || index >= count || !Number.isInteger(columns) || columns < 1) return -1;
  if (direction === 'left') return index % columns > 0 ? index - 1 : -1;
  if (direction === 'right') return index % columns < columns - 1 && index + 1 < count ? index + 1 : -1;
  if (direction === 'up') return index >= columns ? index - columns : -1;
  if (direction === 'down') return index + columns < count ? index + columns : -1;
  return -1;
}

export async function mountHeroWall(root) {
  root.dataset.wallRevealState = 'loading-data';
  const [data, content] = await Promise.all([
    fetch('assets/media/wall-units.json').then(r => { if (!r.ok) throw Error('Wall media unavailable'); return r.json(); }),
    fetch('data/content.json').then(r => { if (!r.ok) throw Error('Demo instructions unavailable'); return r.json(); })
  ]);
  const clips = [...Object.values(content.groups).flatMap(groups => groups.flatMap(group => group.clips)), ...content.longHorizon];
  const prompts = new Map(clips.map(clip => [clip.id, clip]));
  const camera = root.querySelector('.wall-camera');
  const desktopColumns = Number.isInteger(data.columns) && data.columns > 0 ? data.columns : 8;
  const mobileColumns = 4;
  camera.style.setProperty('--wall-columns', desktopColumns);
  camera.style.setProperty('--wall-rows', Math.ceil(data.source_ids.length / desktopColumns));
  camera.style.setProperty('--wall-mobile-rows', Math.ceil(data.source_ids.length / mobileColumns));
  camera.setAttribute('aria-label', `${data.source_ids.length} complete robot demonstrations`);
  const wallCountLabel = root.querySelector('.hero-index');
  if (wallCountLabel) wallCountLabel.textContent = `${data.source_ids.length} COMPLETE DEMOS · ONE WORLD–ACTION MODEL`;
  const drift = root.querySelector('.wall-drift');
  const heroContent = root.querySelector('.hero-content');
  const toggle = root.querySelector('#motion-toggle');
  const explore = root.querySelector('#wall-explore');
  const back = root.querySelector('#wall-back');
  const focusLabel = root.querySelector('.wall-focus-label');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const inViewport = () => { const box = root.getBoundingClientRect(); return box.bottom > 0 && box.top < innerHeight && box.right > 0 && box.left < innerWidth; };
  let paused = reduced.matches, manualPlaybackChoice = false, visible = inViewport(), exploring = false, focused = -1, focusedHd = null;
  let cameraMoveRevision = 0;
  const retiredFrames = new Set();
  const playbackNotice = document.createElement('button');
  playbackNotice.type = 'button'; playbackNotice.className = 'wall-playback-notice'; playbackNotice.hidden = true;
  playbackNotice.textContent = 'Some previews could not play. Retry motion';
  playbackNotice.addEventListener('click', () => { manualPlaybackChoice = true; paused = false; playback(true); });
  root.append(playbackNotice);
  const playbackController = createWallPlaybackController({
    onChange: () => {
      const videos = [...camera.querySelectorAll('video')];
      root.dataset.wallPlaying = String(videos.filter(video => !video.paused && video.dataset.playback === 'playing').length);
      const issues = videos.filter(video => ['blocked', 'error', 'retry-needed'].includes(video.dataset.playback)).length;
      root.dataset.wallIssues = String(issues); playbackNotice.hidden = issues === 0;
    },
    onWarning: (video, reason) => {
      console.warn('[WE-Dream video wall]', video.dataset.clipId, reason);
      root.dispatchEvent(new CustomEvent('wallplaybackissue', { detail: { id: video.dataset.clipId, reason } }));
    }
  });
  camera.inert = true; camera.setAttribute('aria-hidden', 'true');
  focusLabel.setAttribute('aria-live', 'polite');
  const units = data.source_ids.map((id, index) => {
    const item = data.videos[id];
    const tile = document.createElement('button');
    tile.className = 'wall-tile'; tile.type = 'button'; tile.tabIndex = -1;
    tile.setAttribute('aria-label', `Explore demonstration ${index + 1}: ${prompts.get(id)?.taskLabel || item.task}`);
    const video = document.createElement('video');
    video.muted = true; video.defaultMuted = true; video.loop = true; video.playsInline = true; video.preload = 'auto';
    video.dataset.clipId = id; video.setAttribute('muted', ''); video.setAttribute('playsinline', '');
    video.poster = item.poster || ''; video.src = item.src;
    video.setAttribute('aria-hidden', 'true');
    const frame = document.createElement('div'); frame.className = 'wall-video-frame';
    frame.append(video); tile.append(frame); camera.append(tile);
    tile.addEventListener('click', () => focus(index));
    return { tile, video, item, frame };
  });
  // The controls stay fixed while the original wall camera moves as a whole.
  const focusNavigation = document.createElement('div');
  focusNavigation.className = 'wall-focus-navigation'; focusNavigation.hidden = true; focusNavigation.tabIndex = -1;
  focusNavigation.setAttribute('role', 'group');
  if (!camera.id) camera.id = 'hero-wall-camera';
  const directionNames = { left: 'left', right: 'right', up: 'above', down: 'below' };
  const navigationButtons = Object.fromEntries(Object.entries(directionNames).map(([direction, name]) => {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'wall-focus-arrow'; button.dataset.wallDirection = direction;
    button.setAttribute('aria-label', `View the demonstration ${name}`); button.setAttribute('aria-controls', camera.id);
    button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m14 6-6 6 6 6"/></svg>';
    button.addEventListener('click', () => moveFocus(direction));
    focusNavigation.append(button); return [direction, button];
  }));
  root.append(focusNavigation);
  function wallColumns() {
    const firstTop = units[0]?.tile.offsetTop;
    const nextRow = units.findIndex(({ tile }, i) => i > 0 && Math.abs(tile.offsetTop - firstTop) > 1);
    return nextRow > 0 ? nextRow : root.clientWidth <= 760 ? mobileColumns : desktopColumns;
  }
  function focusGeometry() {
    const tile = units[focused].tile;
    const scale = Math.min(root.clientWidth * .91 / tile.offsetWidth, root.clientHeight * (root.clientWidth <= 760 ? .49 : .61) / (tile.offsetWidth * 9 / 16));
    const videoWidth = Math.min(tile.offsetWidth, tile.offsetHeight * 16 / 9);
    return { tile, scale, videoWidth, frameWidth: videoWidth * scale };
  }
  function layoutFocus() {
    if (focused < 0) return;
    const { tile, scale, videoWidth } = focusGeometry();
    const tileX = tile.offsetLeft + tile.offsetWidth / 2, tileY = tile.offsetTop + tile.offsetHeight / 2;
    camera.style.setProperty('--focus-scale', scale);
    camera.style.setProperty('--focus-x', `${(camera.clientWidth / 2 - tileX) * scale}px`);
    camera.style.setProperty('--focus-y', `${(camera.clientHeight / 2 - tileY) * scale - root.clientHeight * .04}px`);
    camera.style.setProperty('--wall-video-width', `${videoWidth}px`);
    camera.style.setProperty('--wall-video-height', `${videoWidth * 9 / 16}px`);
    camera.style.setProperty('--wall-video-radius', `${(root.clientWidth <= 760 ? 20 : 24) / scale}px`);
    positionNavigation();
  }
  function positionNavigation() {
    if (focused < 0) return;
    const width = root.clientWidth, height = root.clientHeight, { frameWidth } = focusGeometry();
    const frameHeight = frameWidth * 9 / 16, centerX = width / 2, centerY = height * .46;
    const box = root.getBoundingClientRect(), promptBox = focusLabel.getBoundingClientRect();
    const headerBottom = document.querySelector('#site-header')?.getBoundingClientRect().bottom || box.top;
    const margin = 30, clamp = (value, min, max) => Math.max(min, Math.min(value, Math.max(min, max)));
    const safeTop = clamp(headerBottom - box.top + margin, margin, height - margin);
    const positions = {
      left: [clamp(centerX - frameWidth / 2 - margin, margin, width - margin), centerY],
      right: [clamp(centerX + frameWidth / 2 + margin, margin, width - margin), centerY],
      up: [centerX, clamp(centerY - frameHeight / 2 - margin, safeTop, height - margin)],
      down: [centerX, clamp(promptBox.bottom - box.top + margin, safeTop, height - margin)]
    };
    Object.entries(navigationButtons).forEach(([direction, button]) => {
      const next = wallNeighborIndex(focused, direction, wallColumns(), units.length);
      button.disabled = next < 0;
      button.setAttribute('aria-label', next < 0 ? `No demonstration ${directionNames[direction]}` : `View demonstration ${next + 1} of ${units.length}, ${directionNames[direction]}`);
      button.style.setProperty('--wall-nav-x', `${positions[direction][0]}px`);
      button.style.setProperty('--wall-nav-y', `${positions[direction][1]}px`);
    });
    focusNavigation.setAttribute('aria-label', `Demonstration ${focused + 1} of ${units.length}. Navigate with the arrow keys.`);
    focusNavigation.hidden = false;
  }
  function releaseHdVideo(video) {
    video.pause(); video.removeAttribute('src'); video.load(); video.remove();
  }
  function clearRetiredFrames(index = null) {
    for (const frame of retiredFrames) {
      if (index !== null && frame.index !== index) continue;
      releaseHdVideo(frame.video); retiredFrames.delete(frame);
    }
  }
  function watchCameraMove() {
    const revision = ++cameraMoveRevision;
    const settle = () => {
      if (revision !== cameraMoveRevision) return;
      clearRetiredFrames(); units.forEach(({ tile }) => tile.classList.remove('was-focused'));
      root.classList.remove('wall-focus-moving');
    };
    const animations = camera.getAnimations().filter(animation => animation.transitionProperty === 'transform');
    if (animations.length) Promise.allSettled(animations.map(animation => animation.finished)).then(settle);
    else settle();
  }
  function moveFocus(direction) {
    if (!exploring || focused < 0) return;
    const next = wallNeighborIndex(focused, direction, wallColumns(), units.length);
    if (next < 0) return;
    const activeControl = document.activeElement;
    focus(next);
    if (focusNavigation.contains(activeControl) && activeControl.disabled) focusNavigation.focus({ preventScroll: true });
  }
  const frameStates = units.map(({ video }) => {
    const state = { count: 0, advances: 0, mediaTime: null, lastFrameAt: -Infinity };
    const record = (mediaTime, count, now) => {
      if (state.mediaTime !== null && mediaTime !== state.mediaTime) state.advances += 1;
      if (state.mediaTime === null || mediaTime !== state.mediaTime) state.lastFrameAt = now;
      state.count = count; state.mediaTime = mediaTime;
      video.dataset.frameCount = String(count); video.dataset.frameMediaTime = mediaTime.toFixed(3);
      video.dataset.lastFrameAt = state.lastFrameAt.toFixed(1);
    };
    if ('requestVideoFrameCallback' in video) {
      video.dataset.frameSource = 'presented-frame-callback';
      const frame = (now, metadata) => {
        if (!video.isConnected) return;
        record(metadata.mediaTime, state.count + 1, now);
        video.requestVideoFrameCallback(frame);
      };
      video.requestVideoFrameCallback(frame);
    } else {
      // Older browsers expose decode counters instead. Never substitute the
      // playback clock alone: it can advance while a poster is still visible.
      video.dataset.frameSource = 'decoded-frame-counter';
      state.sample = now => {
        const quality = video.getVideoPlaybackQuality?.();
        const count = quality ? quality.totalVideoFrames - quality.droppedVideoFrames : video.webkitDecodedFrameCount || 0;
        if (count > state.count) record(video.currentTime, count, now);
      };
      video.addEventListener('timeupdate', () => state.sample(performance.now()));
    }
    return state;
  });
  let revealState = 'warming', revealTimer = null, revealStartCounts = null;
  const diagnostics = root.wallRevealDiagnostics = { version: 1, clock: 'performance.now', duration: 5000, state: revealState, samples: [] };
  root.dataset.wallRevealState = revealState;
  function frameDeltas() { return frameStates.map((state, i) => state.count - (revealStartCounts?.[i] || 0)); }
  function finishReveal(reason = 'completed') {
    if (revealState === 'held') return;
    revealState = 'held'; clearTimeout(revealTimer); revealTimer = null;
    root.classList.add('wall-revealed'); root.classList.remove('wall-revealing');
    root.dataset.wallRevealState = 'held'; root.dataset.wallRevealReason = reason;
    root.dataset.wallRevealEndedAt = performance.now().toFixed(1);
    diagnostics.state = 'held'; diagnostics.reason = reason; diagnostics.endedAt = performance.now();
    root.dataset.wallRevealSamples = JSON.stringify(diagnostics.samples);
    if (revealStartCounts) {
      diagnostics.finalFrameDeltas = frameDeltas();
      root.dataset.wallRevealFrameDeltas = JSON.stringify(diagnostics.finalFrameDeltas);
    }
  }
  drift.addEventListener('animationend', event => {
    if (event.target === drift && event.animationName === 'wall-reveal') finishReveal();
  });
  function checkReveal() {
    clearTimeout(revealTimer); revealTimer = null;
    if (!root.isConnected || revealState === 'held') return;
    const now = performance.now(), active = !paused && visible && !document.hidden;
    const heroBox = root.getBoundingClientRect();
    const samples = units.map(({ tile, video }, i) => {
      const state = frameStates[i]; state.sample?.(now);
      const box = tile.getBoundingClientRect();
      // Initial zoom clips outer windows. Those windows must be buffered, but
      // requiring their compositor callbacks would deadlock on some browsers.
      const width = Math.min(box.right, heroBox.right, innerWidth) - Math.max(box.left, heroBox.left, 0);
      const height = Math.min(box.bottom, heroBox.bottom, innerHeight) - Math.max(box.top, heroBox.top, 0);
      return { ...state, visible: width > 4 && height > 4, paused: video.paused, error: video.error, bufferedAhead: wallBufferedAhead(video) };
    });
    const gate = wallRevealReadiness(samples, { active, now });
    diagnostics.gate = gate;
    root.dataset.wallGateFrames = `${gate.frameReady}/${gate.visible}`;
    root.dataset.wallGateBuffered = `${gate.bufferReady}/${gate.total}`;
    root.dataset.wallFrameMoving = String(samples.filter(sample => now - sample.lastFrameAt < 1000).length);
    if (revealState === 'warming' && gate.ready) {
      revealState = 'running'; revealStartCounts = frameStates.map(state => state.count);
      diagnostics.startedAt = now; diagnostics.startCounts = [...revealStartCounts];
      diagnostics.initialVisible = samples.flatMap((sample, i) => sample.visible ? [i] : []);
      root.dataset.wallRevealStartedAt = now.toFixed(1);
      root.dataset.wallRevealStartCounts = JSON.stringify(revealStartCounts);
      root.dataset.wallRevealInitialVisible = JSON.stringify(diagnostics.initialVisible);
      root.classList.add('wall-revealing');
    }
    diagnostics.state = revealState;
    root.dataset.wallRevealState = active ? revealState : `${revealState}-paused`;
    if (revealState === 'running') {
      const deltas = frameDeltas();
      root.dataset.wallRevealFrameDeltas = JSON.stringify(deltas);
      // Bounded evidence of frame progress during the move, not just after it.
      diagnostics.samples.push({ at: now, active, elapsed: now - diagnostics.startedAt, visible: samples.flatMap((sample, i) => sample.visible ? [i] : []), frames: frameStates.map(state => state.count), mediaTimes: frameStates.map(state => state.mediaTime), lastFrameAges: frameStates.map(state => Number.isFinite(state.lastFrameAt) ? Math.round(now - state.lastFrameAt) : null) });
      if (diagnostics.samples.length > 100) diagnostics.samples.shift();
    }
    // Brief decoder stalls are measured, not turned into camera-stop jitter.
    // Explicit Pause, offscreen, and background still pause both via playback().
    revealTimer = setTimeout(checkReveal, active ? 200 : 750);
  }
  if (reduced.matches) finishReveal('reduced-motion');
  const sourceStart = unit => Number(unit.item.trim_start || 0);
  const sourceEnd = unit => Number(unit.item.trim_end || unit.item.source_duration || unit.item.duration);
  function playback(reset = false) {
    const active = !paused && visible && !document.hidden;
    root.classList.toggle('motion-paused', !active);
    root.dataset.wallIntent = paused ? (manualPlaybackChoice ? 'user-paused' : 'reduced-motion') : document.hidden ? 'background' : !visible ? 'offscreen' : focused >= 0 ? 'focused' : 'all-playing';
    toggle.innerHTML = `<span aria-hidden="true">${paused ? '▶' : 'Ⅱ'}</span> ${paused ? 'Play motion' : 'Pause motion'}`;
    toggle.setAttribute('aria-label', paused ? 'Play background motion' : 'Pause background motion');
    units.forEach(({ video, returning }, i) => {
      const wanted = active && !returning && (focused < 0 || focused === i) && !((focusedHd?.ready || focusedHd?.aligning) && focusedHd.index === i);
      playbackController.sync(video, wanted, { reset });
    });
    if (focusedHd) playbackController.sync(focusedHd.video, active && focusedHd.ready && !focusedHd.loopSeeking, { reset });
    checkReveal();
  }
  function clearHd({ keepFrame = false } = {}) {
    if (!focusedHd) return;
    const { video, index, ready, abort } = focusedHd;
    abort.abort();
    if (ready) {
      const unit = units[index]; unit.returning = true;
      // trim_start is the lightweight-to-delivered-HD offset, never raw source time.
      const time = Math.max(0, Math.min(video.currentTime - sourceStart(unit), Math.max(0, unit.video.duration - .05)));
      seekVideo(unit.video, time).finally(() => { unit.returning = false; playback(); });
    }
    focusedHd = null; playbackController.remove(video);
    if (keepFrame && ready) return { video, index };
    releaseHdVideo(video);
  }
  function loadHd(index) {
    if (focusedHd?.index === index || !units[index].item.full_src) return;
    clearHd();
    const unit = units[index], video = document.createElement('video');
    const hd = { video, index, ready: false, aligning: false, loopSeeking: false, abort: new AbortController() }; focusedHd = hd;
    video.className = 'wall-hd'; video.muted = true; video.defaultMuted = true; video.playsInline = true; video.preload = 'auto';
    video.dataset.clipId = unit.item.id; video.setAttribute('muted', ''); video.setAttribute('playsinline', '');
    video.setAttribute('aria-hidden', 'true');
    const reveal = () => { if (focusedHd !== hd) return; hd.ready = true; hd.aligning = false; video.classList.add('is-ready'); playback(); };
    video.addEventListener('loadedmetadata', async () => {
      if (focusedHd !== hd) return;
      // Prepare HD while the lightweight action keeps moving. The static host may
      // need to fetch a full Blob before a seek is possible; never freeze for that.
      const sourceTime = () => Math.min(sourceStart(unit) + unit.video.currentTime, sourceEnd(unit) - .05, Math.max(0, video.duration - .05));
      const prepared = await seekVideo(video, sourceTime(), { signal: hd.abort.signal });
      if (focusedHd !== hd) return;
      if (!prepared) { clearHd(); playback(); return; }
      hd.aligning = true; playback();
      const reached = await seekVideo(video, sourceTime(), { signal: hd.abort.signal });
      if (focusedHd !== hd) return;
      if (reached) reveal(); else { clearHd(); playback(); }
    }, { once: true });
    const loopAction = async () => {
      if (focusedHd !== hd || !hd.ready || hd.loopSeeking || video.currentTime < sourceEnd(unit) - .08) return;
      hd.loopSeeking = true; playback();
      const reached = await seekVideo(video, sourceStart(unit), { signal: hd.abort.signal });
      if (focusedHd !== hd) return;
      hd.loopSeeking = false;
      if (reached) playback(); else { clearHd(); playback(); }
    };
    video.addEventListener('timeupdate', loopAction);
    video.addEventListener('ended', loopAction);
    video.addEventListener('error', () => { if (focusedHd === hd) { clearHd(); playback(); } }, { once: true });
    unit.frame.append(video); video.src = unit.item.full_src;
  }
  function showPrompt(unit) {
    const clip = prompts.get(unit.item.id), text = clip?.promptExact || clip?.prompt_exact || clip?.promptDisplay;
    focusLabel.replaceChildren();
    const label = document.createElement('span'); label.className = 'wall-prompt-label'; label.textContent = 'PROMPT'; focusLabel.append(label);
    if (clip?.promptStatus === 'provisional') {
      const draft = document.createElement('span'); draft.className = 'wall-prompt-draft'; draft.textContent = 'Draft'; focusLabel.append(draft);
    }
    const quote = document.createElement('span'); quote.className = 'wall-prompt-text';
    quote.textContent = text ? `“${text}”` : 'Instruction unavailable'; focusLabel.append(quote);
  }
  function resetCamera() {
    const restoreBackFocus = focusNavigation.contains(document.activeElement);
    cameraMoveRevision += 1; clearRetiredFrames(); clearHd();
    camera.style.removeProperty('--focus-x'); camera.style.removeProperty('--focus-y');
    camera.style.removeProperty('--focus-scale'); focused = -1;
    root.classList.remove('wall-focused', 'wall-focus-moving'); focusNavigation.hidden = true;
    focusLabel.textContent = 'Choose a window to explore its action and instruction.';
    units.forEach(({ tile }) => { tile.classList.remove('is-focused', 'was-focused'); tile.tabIndex = 0; tile.inert = false; tile.removeAttribute('aria-hidden'); });
    back.textContent = 'Back to title ↗'; playback();
    if (restoreBackFocus) back.focus({ preventScroll: true });
  }
  function focus(index) {
    if (index === focused || !units[index]?.tile.offsetWidth) return;
    const previous = focused, moveKeyboardFocus = camera.contains(document.activeElement);
    cameraMoveRevision += 1;
    if (previous >= 0) {
      units[previous].tile.classList.add('was-focused');
      const frame = clearHd({ keepFrame: true }); if (frame) retiredFrames.add(frame);
    }
    // A rapid reversal must reveal the current preview, not an older retained HD.
    clearRetiredFrames(index);
    focused = index;
    root.classList.add('wall-focused'); root.classList.toggle('wall-focus-moving', previous >= 0);
    units.forEach(({ tile }, i) => {
      tile.classList.toggle('is-focused', i === index); if (i === index) tile.classList.remove('was-focused');
      tile.tabIndex = i === index ? 0 : -1; tile.inert = i !== index; tile.setAttribute('aria-hidden', String(i !== index));
    });
    showPrompt(units[index]); layoutFocus();
    if (moveKeyboardFocus) units[index].tile.focus({ preventScroll: true });
    back.textContent = `← All ${units.length} windows`; loadHd(index); playback(); watchCameraMove();
  }
  explore.addEventListener('click', () => {
    finishReveal('explore'); exploring = true; camera.inert = false; camera.removeAttribute('aria-hidden'); root.classList.add('wall-exploring'); heroContent.inert = true; heroContent.setAttribute('aria-hidden', 'true');
    resetCamera();
    back.hidden = false; back.focus({ preventScroll: true });
  });
  back.addEventListener('click', () => {
    if (focused >= 0) return resetCamera();
    exploring = false; camera.inert = true; camera.setAttribute('aria-hidden', 'true'); root.classList.remove('wall-exploring'); back.hidden = true; heroContent.inert = false; heroContent.removeAttribute('aria-hidden');
    units.forEach(({ tile }) => tile.tabIndex = -1); explore.focus({ preventScroll: true });
  });
  root.addEventListener('keydown', e => {
    if (e.key === 'Escape' && exploring) { back.click(); return; }
    const direction = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' }[e.key];
    if (!direction || !exploring || focused < 0 || e.altKey || e.ctrlKey || e.metaKey || e.target.isContentEditable || e.target.closest('input, textarea, select')) return;
    e.preventDefault(); e.stopPropagation(); moveFocus(direction);
  }, { capture: true });
  toggle.addEventListener('click', () => { manualPlaybackChoice = true; paused = !paused; playback(!paused); });
  // Observe the hero, never an individual transformed tile. Geometric fallback
  // avoids pausing a partially visible hero on delayed intersection delivery.
  new IntersectionObserver(([entry]) => { visible = entry.isIntersecting || inViewport(); playback(); }, { threshold: 0 }).observe(root);
  document.addEventListener('visibilitychange', () => { visible = inViewport(); playback(); });
  reduced.addEventListener('change', () => {
    if (reduced.matches) finishReveal('reduced-motion');
    if (!manualPlaybackChoice) paused = reduced.matches;
    playback();
  });
  window.addEventListener('resize', () => { if (focused >= 0) { layoutFocus(); watchCameraMove(); } });
  playback();
}
