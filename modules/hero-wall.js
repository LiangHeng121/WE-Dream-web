import { seekVideo } from './video-seek.js?v=v21';
import { createStreamVideo } from './stream-video.js?v=v21';
/* Fullscreen title / video layering adapted from ViTacFormerPage (CC BY-SA 4.0).
 * The single reveal, independent action loops, and focus camera are WE-Dream additions.
 * See vendor/ and docs/website-research/SOURCE_REUSE.md for provenance. */
// Each visible activation gets at most three automatic attempts. Browser pause /
// buffering events can recover, but user Pause and background tabs always win.
export function createWallPlaybackController({ onChange = () => {}, onWarning = () => {} } = {}) {
  const states = new Map();
  let destroyed = false;
  function status(state, value) {
    if (state.status === value && state.video.dataset.playAttempts === String(state.attempts)) return;
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

// First frames play immediately, but a network slot belongs to that native
// request until the complete loop is buffered or its source is cancelled.
export function createWallLoadQueue(items, { load, concurrency = 8, onChange = () => {}, onError = () => {} } = {}) {
  const entries = items.map((item, index) => ({ item, index, state: 'queued' }));
  let active = false, destroyed = false, loading = 0, eligible = null;
  const snapshot = () => ({ loading, ready: entries.filter(entry => entry.state === 'ready').length, total: entries.length });
  function pump() {
    if (!active || destroyed) return;
    for (const entry of entries) {
      if (loading >= concurrency) break;
      if (entry.state !== 'queued' || (eligible && !eligible.has(entry.item))) continue;
      entry.state = 'loading'; loading += 1;
      const attempt = { controller: new AbortController() }; entry.attempt = attempt;
      Promise.resolve().then(() => {
        if (entry.attempt !== attempt || attempt.controller.signal.aborted) throw new DOMException('Preview loading cancelled', 'AbortError');
        return load(entry.item, attempt.controller.signal);
      }).then(() => {
        if (entry.attempt !== attempt) return;
        entry.state = 'ready';
      }, error => {
        if (entry.attempt !== attempt) return;
        entry.state = 'error';
        if (!destroyed) onError(entry.item, error);
      }).finally(() => {
        if (entry.attempt !== attempt) return;
        entry.attempt = null;
        loading -= 1;
        if (!destroyed) { onChange(snapshot()); pump(); }
      });
    }
    onChange(snapshot());
  }
  return {
    setActive(value, allowed = null) { active = value; eligible = allowed; pump(); },
    prioritize(item) {
      const index = entries.findIndex(entry => entry.item === item);
      if (index > 0) entries.unshift(...entries.splice(index, 1));
      pump();
    },
    retry() { for (const entry of entries) if (entry.state === 'error') entry.state = 'queued'; pump(); },
    invalidate(items) {
      const invalid = new Set(items);
      for (const entry of entries) {
        if (!invalid.has(entry.item)) continue;
        const attempt = entry.attempt;
        if (attempt) { entry.attempt = null; loading -= 1; }
        entry.state = 'queued'; attempt?.controller.abort();
      }
      onChange(snapshot()); pump();
    },
    snapshot,
    destroy() {
      destroyed = true; active = false;
      for (const entry of entries) { entry.attempt?.controller.abort(); entry.attempt = null; }
      loading = 0;
    }
  };
}

// Preserve the static first-frame layer until this particular media element
// has submitted its decoded frame. Reset on source cancellation, never on pause.
export function bindWallFirstFrame(video) {
  let callback = null, generation = 0, shown = false;
  const hasFrameCallback = typeof video.requestVideoFrameCallback === 'function';
  function clear() {
    generation += 1; shown = false;
    if (callback !== null) video.cancelVideoFrameCallback?.(callback);
    callback = null; video.classList.remove('is-presented');
  }
  function ready() {
    if (shown || callback !== null || video.readyState < 2 || video.error || !video.getAttribute('src')) return;
    const ticket = generation;
    const reveal = () => {
      if (ticket !== generation) return;
      callback = null;
      if (video.readyState < 2 || video.error || !video.getAttribute('src')) return;
      shown = true; video.classList.add('is-presented');
    };
    if (hasFrameCallback) callback = video.requestVideoFrameCallback(reveal);
    else reveal(); // loadeddata is the best available decoded-frame signal.
  }
  const events = [['loadeddata', ready], ['playing', ready], ['loadstart', clear], ['emptied', clear], ['abort', clear], ['error', clear]];
  events.forEach(([event, handler]) => video.addEventListener(event, handler));
  ready();
  return { destroy() { clear(); events.forEach(([event, handler]) => video.removeEventListener(event, handler)); } };
}

// Pausing a media element does not cancel its network request. Keep a completely
// buffered loop; otherwise save its position before load() aborts native I/O.
export function wallVideoFullyBuffered(video) {
  if (!Number.isFinite(video.duration) || video.duration <= 0 || video.readyState < 2) return false;
  let end = 0;
  for (let i = 0; i < video.buffered.length; i += 1) {
    if (video.buffered.start(i) > end + .05) return false;
    end = Math.max(end, video.buffered.end(i));
  }
  return end >= video.duration - .05;
}

export function suspendWallVideo(video) {
  if (!video.getAttribute('src') || wallVideoFullyBuffered(video)) return null;
  const saved = { time: Number.isFinite(video.currentTime) ? video.currentTime : 0, rate: video.playbackRate || 1 };
  video.pause(); video.removeAttribute('src'); video.preload = 'none'; video.load();
  return saved;
}

export async function restoreWallVideo(video, saved, { signal } = {}) {
  if (!await waitWallHdFrame(video, { signal, metadataOnly: true })) return false;
  if (signal?.aborted || !video.getAttribute('src')) return false;
  video.playbackRate = saved.rate;
  const target = Math.max(0, Math.min(saved.time, Math.max(0, video.duration - .05)));
  if (Math.abs(video.currentTime - target) > .05) video.currentTime = target;
  return waitWallHdFrame(video, { signal });
}

// Let the native media pipeline decode the faststart MP4 as bytes arrive. Fetch
// + blob() delays even the first frame until the complete action is downloaded.
// Playback does not wait for this promise. It tracks the lifetime of incomplete
// native I/O, so the next preview cannot borrow the same network slot early.
export function loadWallPreview(video, src, { signal, onAssigned = () => {}, timeout = 15000 } = {}) {
  if (signal?.aborted) return Promise.reject(new DOMException('Preview loading cancelled', 'AbortError'));
  if (video.getAttribute('src') === src && wallVideoFullyBuffered(video) && !video.error) return Promise.resolve('ready');
  return new Promise((resolve, reject) => {
    let timer, settled = false, progress = '';
    const events = ['loadedmetadata', 'durationchange', 'loadeddata', 'canplay', 'canplaythrough', 'playing', 'progress', 'timeupdate'];
    const clean = () => {
      clearTimeout(timer);
      for (const event of events) video.removeEventListener(event, ready);
      video.removeEventListener('error', failed); signal?.removeEventListener('abort', aborted);
    };
    const settle = (value, error) => {
      if (settled) return;
      settled = true; clean();
      if (error) {
        // Releasing a slot never leaves its failed native request running.
        if (video.getAttribute('src') === src) { video.pause(); video.removeAttribute('src'); video.preload = 'none'; video.load(); }
        reject(error);
      } else resolve(value);
    };
    const stalled = () => settle(null, new Error('Wall preview made no buffer progress'));
    const ready = () => {
      if (wallVideoFullyBuffered(video)) { settle('ready'); return; }
      const ranges = video.buffered;
      const next = `${Math.min(video.readyState, 2)}:${Array.from({ length: ranges?.length || 0 }, (_, i) => `${ranges.start(i)}-${ranges.end(i)}`).join(',')}`;
      if (next !== progress) { progress = next; clearTimeout(timer); timer = setTimeout(stalled, timeout); }
    };
    const failed = () => settle(null, new Error(`Wall preview MediaError ${video.error?.code || ''}`));
    const aborted = () => settle(null, new DOMException('Preview loading cancelled', 'AbortError'));
    for (const event of events) video.addEventListener(event, ready);
    video.addEventListener('error', failed); signal?.addEventListener('abort', aborted, { once: true });
    video.preload = 'auto'; video.dataset.loadMode = 'native-progressive';
    if (video.getAttribute('src') !== src) video.src = src;
    else if (video.error) video.load();
    onAssigned(); ready();
  });
}

// A play promise / currentTime does not prove that a frame reached the screen.
// Only the first center windows need to be moving to begin the reveal; outer
// windows progressively join without becoming a 40-file startup barrier.
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

export function wallRevealReadiness(samples, { active, now, warmingFor = 0, bufferSeconds = .35, initialWindows = 4, progressiveAfter = 1600, giveUpAfter = 4000 } = {}) {
  const visible = samples.filter(sample => sample.visible);
  const moving = visible.filter(sample => !sample.paused && !sample.error && sample.advances >= 2 && now - sample.lastFrameAt < 800);
  const frameReady = moving.length;
  const prepared = moving.filter(sample => sample.bufferedAhead >= bufferSeconds).length;
  const target = Math.min(initialWindows, visible.length);
  const bufferReady = samples.filter(sample => !sample.error && sample.bufferedAhead >= bufferSeconds).length;
  const mode = target > 0 && prepared >= target ? 'center-ready' : warmingFor >= progressiveAfter && frameReady > 0 ? 'progressive' : 'waiting';
  const ready = Boolean(active && visible.length && mode !== 'waiting');
  // When no playable frames arrive, settle to the whole wall instead of either
  // waiting forever or animating static posters as if the videos were playing.
  const skip = Boolean(active && !ready && warmingFor >= giveUpAfter);
  return { ready, skip, mode, target, prepared, frameReady, visible: visible.length, bufferReady, total: samples.length };
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

// Camera motion follows input immediately. Full-resolution preparation happens
// alongside it; a late frame can upgrade only the still-current selection.
export function createWallFocusCoordinator({ current, prepare, commit, peek = () => null, onReady = () => {}, onPending = () => {} }) {
  let revision = 0, pendingIndex = -1, pendingPromise = null;
  function cancel() {
    revision += 1;
    pendingIndex = -1; pendingPromise = null; onPending(-1);
  }
  return {
    go(index) {
      if (index === pendingIndex) return pendingPromise;
      if (index === current()) { cancel(); return Promise.resolve(false); }
      cancel();
      const ticket = revision; pendingIndex = index; onPending(index);
      const committed = Promise.resolve(true); pendingPromise = committed;
      // A ready retained decoder must be handed to commit before it cleans up
      // outgoing frames, particularly on a rapid A -> B -> A reversal.
      commit(index, peek(index));
      Promise.resolve().then(() => ticket === revision ? prepare(index) : null).then(media => {
        if (ticket !== revision) return;
        pendingIndex = -1; pendingPromise = null; onPending(-1);
        if (media && current() === index) onReady(index, media);
      }, () => {
        if (ticket !== revision) return;
        pendingIndex = -1; pendingPromise = null; onPending(-1);
      });
      return committed;
    },
    cancel,
    get pendingIndex() { return pendingIndex; }
  };
}

export function waitWallHdFrame(video, { signal, metadataOnly = false, timeout = 12000 } = {}) {
  const ready = () => video.readyState >= (metadataOnly ? 1 : 2) && (metadataOnly || !video.seeking);
  if (signal?.aborted || video.error) return Promise.resolve(false);
  if (ready()) return Promise.resolve(true);
  return new Promise(resolve => {
    let timer;
    const finish = value => {
      clearTimeout(timer);
      for (const event of ['loadedmetadata', 'loadeddata', 'canplay', 'seeked']) video.removeEventListener(event, check);
      video.removeEventListener('error', failed); signal?.removeEventListener('abort', failed);
      resolve(value);
    };
    const check = () => { if (ready()) finish(true); };
    const failed = () => finish(false);
    for (const event of ['loadedmetadata', 'loadeddata', 'canplay', 'seeked']) video.addEventListener(event, check);
    video.addEventListener('error', failed); signal?.addEventListener('abort', failed, { once: true });
    timer = setTimeout(failed, timeout); check();
  });
}

// CSS transitions are authoritative: media may be decoded before the camera
// or the high-resolution fade has finished. Reduced-motion yields no animation.
export async function waitWallVisualTransitions(element, property) {
  await Promise.resolve();
  const animations = element.getAnimations?.().filter(animation => animation.transitionProperty === property) || [];
  await Promise.allSettled(animations.map(animation => animation.finished));
}

export async function mountHeroWall(root) {
  root.dataset.wallRevealState = 'loading-data';
  root.dataset.wallMountedAt = performance.now().toFixed(1);
  const wallData = fetch('assets/media/wall-units.json?v=v21').then(r => { if (!r.ok) throw Error('Wall media unavailable'); return r.json(); });
  // Instructions are needed when a visitor explores a tile, not before the
  // first frame. A slower content request must not block the opening wall.
  const contentData = fetch('data/content.json?v=v21').then(r => { if (!r.ok) throw Error('Demo instructions unavailable'); return r.json(); }).catch(error => { console.warn('[WE-Dream video wall]', error.message); return null; });
  const data = await wallData;
  const prompts = new Map();
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
  const explore = root.querySelector('#wall-explore');
  const back = root.querySelector('#wall-back');
  const focusLabel = root.querySelector('.wall-focus-label');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const inViewport = () => { const box = root.getBoundingClientRect(); return box.bottom > 0 && box.top < innerHeight && box.right > 0 && box.left < innerWidth; };
  let paused = reduced.matches, manualPlaybackChoice = false, visible = inViewport(), exploring = false, focused = -1, focusedHd = null, preparedHd = null;
  let networkSuspended = false, resumeFocusedHd = null;
  let cameraMoveRevision = 0, cameraMoving = false, hoverTimer = null;
  let cameraTransition = Promise.resolve(), focusStart = null;
  const retiredFrames = new Set();
  const hdStreams = new WeakMap();
  const playbackNotice = document.createElement('button');
  playbackNotice.type = 'button'; playbackNotice.className = 'wall-playback-notice'; playbackNotice.hidden = true;
  playbackNotice.textContent = 'Some previews could not play. Retry motion';
  playbackNotice.addEventListener('click', () => { manualPlaybackChoice = true; paused = false; playback(true); });
  root.append(playbackNotice);
  let playbackStatusFrame = null;
  function updatePlaybackStatus() {
    if (playbackStatusFrame !== null) return;
    playbackStatusFrame = requestAnimationFrame(() => {
      playbackStatusFrame = null;
      const videos = [...camera.querySelectorAll('video')];
      root.dataset.wallPlaying = String(videos.filter(video => !video.paused && video.dataset.playback === 'playing').length);
      const issues = videos.filter(video => ['blocked', 'error', 'retry-needed'].includes(video.dataset.playback)).length;
      root.dataset.wallIssues = String(issues); playbackNotice.hidden = issues === 0;
    });
  }
  const playbackController = createWallPlaybackController({
    onChange: updatePlaybackStatus,
    onWarning: (video, reason) => {
      console.warn('[WE-Dream video wall]', video.dataset.clipId, reason);
      root.dispatchEvent(new CustomEvent('wallplaybackissue', { detail: { id: video.dataset.clipId, reason } }));
    }
  });
  camera.inert = true; camera.setAttribute('aria-hidden', 'true');
  focusLabel.setAttribute('aria-live', 'polite');
  const shells = new Map([...camera.querySelectorAll('.wall-tile[data-wall-id]')].map(tile => [tile.dataset.wallId, tile]));
  const units = data.source_ids.map((id, index) => {
    const item = data.videos[id];
    const tile = shells.get(id) || document.createElement('button');
    tile.className = 'wall-tile'; tile.type = 'button'; tile.tabIndex = -1; tile.dataset.wallId = id;
    tile.setAttribute('aria-label', `Explore demonstration ${index + 1}: ${prompts.get(id)?.taskLabel || item.task}`);
    const video = document.createElement('video'); video.className = 'wall-preview';
    video.muted = true; video.defaultMuted = true; video.loop = true; video.playsInline = true; video.preload = 'none';
    video.dataset.clipId = id; video.setAttribute('muted', ''); video.setAttribute('playsinline', '');
    video.dataset.source = item.src;
    video.setAttribute('aria-hidden', 'true');
    video.addEventListener('loadeddata', () => {
      if (video.dataset.firstDataAt) return;
      const at = performance.now().toFixed(1);
      video.dataset.firstDataAt = at;
      if (!root.dataset.wallFirstDataAt) root.dataset.wallFirstDataAt = at;
      root.dataset.wallLoaded = `${units.filter(({ video: preview }) => preview.readyState >= 2).length}/${units.length}`;
    });
    const frame = tile.querySelector('.wall-video-frame') || document.createElement('div'); frame.className = 'wall-video-frame';
    // Adopt the initial HTML without removing its already painted SVG layer.
    const firstFrame = bindWallFirstFrame(video);
    frame.append(video); if (!frame.parentNode) tile.append(frame); if (!tile.parentNode) camera.append(tile);
    tile.addEventListener('click', () => focus(index));
    tile.addEventListener('pointerenter', () => primeHd(index));
    tile.addEventListener('pointerleave', () => clearTimeout(hoverTimer));
    tile.addEventListener('focus', () => primeHd(index));
    return { tile, video, item, frame, firstFrame };
  });
  contentData.then(content => {
    if (!content || !root.isConnected) return;
    const clips = [...Object.values(content.groups).flatMap(groups => groups.flatMap(group => group.clips)), ...content.longHorizon];
    clips.forEach(clip => prompts.set(clip.id, clip));
    units.forEach(({ tile, item }, index) => tile.setAttribute('aria-label', `Explore demonstration ${index + 1}: ${prompts.get(item.id)?.taskLabel || item.task}`));
    if (focused >= 0) showPrompt(units[focused]);
  });
  // Start with the windows exposed by the initial crop. The source order and
  // rendered 8-by-5 layout stay unchanged; only network dispatch is reordered.
  const columns = root.clientWidth <= 760 ? mobileColumns : desktopColumns;
  const rows = Math.ceil(units.length / columns);
  const loadOrder = [...units].sort((a, b) => {
    const distance = unit => {
      const index = units.indexOf(unit);
      return Math.hypot((index % columns + .5) / columns - .5, (Math.floor(index / columns) + .5) / rows - .5);
    };
    return distance(a) - distance(b);
  });
  let queuedPlaybackFrame = null;
  function schedulePlayback() {
    if (queuedPlaybackFrame !== null) return;
    queuedPlaybackFrame = requestAnimationFrame(() => { queuedPlaybackFrame = null; if (root.isConnected) playback(); });
  }
  const loadQueue = createWallLoadQueue(loadOrder, {
    async load(unit, signal) {
      const saved = unit.suspendedPreview;
      unit.resuming = Boolean(saved);
      try {
        const transfer = loadWallPreview(unit.video, unit.item.src, { signal, onAssigned: schedulePlayback });
        const restore = saved ? restoreWallVideo(unit.video, saved, { signal }).then(restored => {
          if (!restored || signal.aborted) return;
          if (unit.suspendedPreview === saved) unit.suspendedPreview = null;
          unit.resuming = false; schedulePlayback();
        }) : Promise.resolve();
        await Promise.all([transfer, restore]);
      } finally {
        if (!signal.aborted) { unit.resuming = false; schedulePlayback(); }
      }
    },
    onChange({ loading, total }) {
      root.dataset.wallLoading = String(loading);
      root.dataset.wallLoaded = `${units.filter(({ video }) => video.readyState >= 2).length}/${total}`;
      root.dataset.wallSourcesAssigned = String(units.filter(({ video }) => video.getAttribute('src')).length);
    }
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
    const prime = () => {
      const next = wallNeighborIndex(focused, direction, wallColumns(), units.length);
      if (next >= 0) primeHd(next);
    };
    button.addEventListener('pointerenter', prime); button.addEventListener('focus', prime);
    button.addEventListener('pointerleave', () => clearTimeout(hoverTimer));
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
    hdStreams.get(video)?.destroy(); hdStreams.delete(video);
    video.pause(); video.removeAttribute('src'); video.load(); video.remove();
  }
  function clearRetiredFrames(index = null) {
    for (const frame of retiredFrames) {
      if (index !== null && frame.index !== index) continue;
      retiredFrames.delete(frame); disposeHd(frame, { syncPreview: true });
    }
  }
  function watchCameraMove() {
    const revision = ++cameraMoveRevision;
    cameraMoving = true;
    const settle = () => {
      if (revision !== cameraMoveRevision) return;
      clearRetiredFrames(); units.forEach(({ tile }) => tile.classList.remove('was-focused'));
      root.classList.remove('wall-focus-moving'); cameraMoving = false;
    };
    const animations = camera.getAnimations().filter(animation => animation.transitionProperty === 'transform');
    const finished = animations.length ? Promise.allSettled(animations.map(animation => animation.finished)) : Promise.resolve();
    return finished.then(() => { settle(); if (revision === cameraMoveRevision) root.dataset.wallCameraSettledAt = performance.now().toFixed(1); });
  }
  function moveFocus(direction) {
    if (!exploring || focused < 0) return;
    const from = focusCoordinator.pendingIndex >= 0 ? focusCoordinator.pendingIndex : focused;
    const next = wallNeighborIndex(from, direction, wallColumns(), units.length);
    if (next < 0) return;
    const activeControl = document.activeElement;
    focus(next).then(() => {
      if (focusNavigation.contains(activeControl) && activeControl.disabled) focusNavigation.focus({ preventScroll: true });
    });
  }
  const frameStates = units.map(({ video }) => {
    const state = { count: 0, advances: 0, mediaTime: null, lastFrameAt: -Infinity };
    const record = (mediaTime, count, now) => {
      if (state.mediaTime === null) {
        video.dataset.firstFrameAt = now.toFixed(1);
        if (!root.dataset.wallFirstFrameAt) root.dataset.wallFirstFrameAt = now.toFixed(1);
      }
      if (state.mediaTime !== null && mediaTime !== state.mediaTime) state.advances += 1;
      if (state.mediaTime === null || mediaTime !== state.mediaTime) state.lastFrameAt = now;
      state.count = count; state.mediaTime = mediaTime;
    };
    if ('requestVideoFrameCallback' in video) {
      video.dataset.frameSource = 'presented-frame-callback';
      const frame = (now, metadata) => {
        if (!video.isConnected) return;
        record(metadata.mediaTime, state.count + 1, now);
        state.callback = video.requestVideoFrameCallback(frame);
      };
      state.callback = video.requestVideoFrameCallback(frame);
      state.stop = () => video.cancelVideoFrameCallback(state.callback);
    } else {
      // Older browsers expose decode counters instead. Never substitute the
      // playback clock alone: it can advance while a poster is still visible.
      video.dataset.frameSource = 'decoded-frame-counter';
      state.sample = now => {
        const quality = video.getVideoPlaybackQuality?.();
        const count = quality ? quality.totalVideoFrames - quality.droppedVideoFrames : video.webkitDecodedFrameCount || 0;
        if (count > state.count) record(video.currentTime, count, now);
      };
      const sample = () => state.sample(performance.now());
      video.addEventListener('timeupdate', sample);
      state.stop = () => video.removeEventListener('timeupdate', sample);
    }
    return state;
  });
  let revealState = 'warming', revealTimer = null, revealStartCounts = null, warmingElapsed = 0, warmingSince = null;
  const detailedDiagnostics = new URLSearchParams(location.search).has('mediaDebug');
  const diagnostics = root.wallRevealDiagnostics = { version: 2, clock: 'performance.now', duration: 5000, state: revealState, samples: [] };
  function publishFrameSnapshot() {
    frameStates.forEach((state, i) => {
      const video = units[i].video;
      video.dataset.frameCount = String(state.count);
      video.dataset.frameMediaTime = state.mediaTime === null ? '' : state.mediaTime.toFixed(3);
      video.dataset.lastFrameAt = state.lastFrameAt.toFixed(1);
    });
  }
  // QA can request a snapshot without taxing every rendered frame. Normal
  // visitors incur no diagnostic DOM writes while 40 videos are running.
  diagnostics.snapshot = () => { publishFrameSnapshot(); return frameStates.map(({ count, advances, mediaTime, lastFrameAt }) => ({ count, advances, mediaTime, lastFrameAt })); };
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
    publishFrameSnapshot();
    frameStates.forEach(state => state.stop());
  }
  drift.addEventListener('animationend', event => {
    if (event.target === drift && event.animationName === 'wall-reveal') finishReveal();
  });
  function checkReveal() {
    clearTimeout(revealTimer); revealTimer = null;
    if (!root.isConnected || revealState === 'held') return;
    const now = performance.now(), active = !paused && visible && !document.hidden;
    if (revealState === 'warming') {
      if (active && warmingSince === null) warmingSince = now;
      if (!active && warmingSince !== null) { warmingElapsed += now - warmingSince; warmingSince = null; }
    }
    if (revealState === 'running' && !detailedDiagnostics) {
      root.dataset.wallRevealState = active ? revealState : `${revealState}-paused`;
      return;
    }
    const heroBox = root.getBoundingClientRect();
    const samples = units.map(({ tile, video }, i) => {
      const state = frameStates[i]; state.sample?.(now);
      const box = tile.getBoundingClientRect();
      // Initial zoom clips outer windows. Their delayed network/decoder work
      // must not hold the already-playing center of the wall still.
      const width = Math.min(box.right, heroBox.right, innerWidth) - Math.max(box.left, heroBox.left, 0);
      const height = Math.min(box.bottom, heroBox.bottom, innerHeight) - Math.max(box.top, heroBox.top, 0);
      return { ...state, visible: width > 4 && height > 4, paused: video.paused, error: video.error, bufferedAhead: wallBufferedAhead(video) };
    });
    const warmingFor = warmingElapsed + (warmingSince === null ? 0 : now - warmingSince);
    const gate = wallRevealReadiness(samples, { active, now, warmingFor });
    diagnostics.gate = gate;
    root.dataset.wallGateFrames = `${gate.frameReady}/${gate.visible}`;
    root.dataset.wallGateBuffered = `${gate.bufferReady}/${gate.total}`;
    root.dataset.wallFrameMoving = String(samples.filter(sample => now - sample.lastFrameAt < 1000).length);
    if (revealState === 'warming') root.dataset.wallRevealWarmupMs = warmingFor.toFixed(1);
    if (revealState === 'warming' && gate.skip) { finishReveal('preview-unavailable'); return; }
    if (revealState === 'warming' && gate.ready) {
      revealState = 'running'; revealStartCounts = frameStates.map(state => state.count);
      root.dataset.wallRevealGateMode = gate.mode;
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
      if (detailedDiagnostics) publishFrameSnapshot();
      // Bounded evidence of frame progress during the move, not just after it.
      diagnostics.samples.push({ at: now, active, elapsed: now - diagnostics.startedAt, visible: samples.flatMap((sample, i) => sample.visible ? [i] : []), frames: frameStates.map(state => state.count), mediaTimes: frameStates.map(state => state.mediaTime), lastFrameAges: frameStates.map(state => Number.isFinite(state.lastFrameAt) ? Math.round(now - state.lastFrameAt) : null) });
      if (diagnostics.samples.length > 100) diagnostics.samples.shift();
    }
    // Brief decoder stalls are measured, not turned into camera-stop jitter.
    // Explicit Pause, offscreen, and background still pause both via playback().
    revealTimer = setTimeout(checkReveal, active ? revealState === 'warming' ? 80 : 200 : 750);
  }
  if (reduced.matches) finishReveal('reduced-motion');
  const sourceStart = unit => Number(unit.item.trim_start || 0);
  const sourceEnd = unit => Number(unit.item.trim_end || unit.item.source_duration || unit.item.duration);
  function suspendNetwork() {
    // Visibility also suspends HD; explicit Pause/focus only reclaim previews.
    networkSuspended = true; loadQueue.setActive(false);
    focusCoordinator.cancel(); clearTimeout(hoverTimer);
    suspendPreviews();
    if (preparedHd?.ready && preparedHd.stream?.isStreaming) preparedHd.stream.stop();
    else if (preparedHd && !wallVideoFullyBuffered(preparedHd.video)) {
      if (preparedHd.index === focused && !focusedHd) {
        const unit = units[focused];
        resumeFocusedHd = preparedHd.resume || { index: focused, time: sourceStart(unit), rate: preparedHd.video.playbackRate };
      }
      discardPrepared();
    }
    if (focusedHd?.stream?.isStreaming) focusedHd.stream.stop();
    else if (focusedHd && !wallVideoFullyBuffered(focusedHd.video)) {
      const hd = focusedHd; focusedHd = null;
      resumeFocusedHd = { index: hd.index, time: hd.video.currentTime, rate: hd.video.playbackRate };
      disposeHd(hd);
    }
    // These frames are only retained for the on-screen camera transition.
    for (const hd of retiredFrames) { retiredFrames.delete(hd); disposeHd(hd); }
    root.dataset.wallNetworkState = 'suspended';
  }
  function suspendPreviews(keep = null) {
    loadQueue.setActive(false);
    const cancelled = [];
    units.forEach(unit => {
      if (unit === keep) return;
      playbackController.sync(unit.video, false);
      if (wallVideoFullyBuffered(unit.video)) return;
      const saved = suspendWallVideo(unit.video);
      if (saved) unit.suspendedPreview ||= saved;
      unit.resuming = false; cancelled.push(unit);
    });
    loadQueue.invalidate(cancelled);
  }
  function playback(reset = false) {
    const active = (!paused || (exploring && focused >= 0)) && visible && !document.hidden;
    if ((!visible || document.hidden) && !networkSuspended) suspendNetwork();
    if (visible && !document.hidden && networkSuspended) {
      networkSuspended = false; root.dataset.wallNetworkState = 'visible';
    }
    if (!active || focused >= 0) suspendPreviews(active ? units[focused] : null);
    loadQueue.setActive(active, focused >= 0 ? new Set([units[focused]]) : null);
    if (reset) loadQueue.retry();
    root.classList.toggle('motion-paused', !active);
    root.dataset.wallIntent = paused && focused < 0 ? 'reduced-motion' : document.hidden ? 'background' : !visible ? 'offscreen' : focused >= 0 ? 'focused' : 'all-playing';
    units.forEach(({ video, returning }, i) => {
      const wanted = active && Boolean(video.getAttribute('src')) && !units[i].resuming && !returning && focused < 0 && !((focusedHd?.ready || focusedHd?.aligning) && focusedHd.index === i);
      playbackController.sync(video, wanted, { reset });
    });
    if (focusedHd) playbackController.sync(focusedHd.video, active && focusedHd.ready && focusedHd.playbackReady && !focusedHd.loopSeeking, { reset });
    for (const frame of retiredFrames) playbackController.sync(frame.video, active && frame.ready && frame.playbackReady && !frame.loopSeeking, { reset });
    if (active && !focusedHd && preparedHd?.index === focused && preparedHd.ready) activateHd(preparedHd);
    if (active && exploring && focused >= 0 && !focusedHd && (!preparedHd || preparedHd.index !== focused)) {
      const saved = resumeFocusedHd?.index === focused ? resumeFocusedHd : null;
      resumeFocusedHd = null;
      // Resume the same focused tile; this never changes the camera or replay
      // state of the initial zoom. Background hover targets are not restored.
      if (saved) prepareHd(focused, { resume: saved });
    }
    checkReveal();
  }
  function disposeHd(hd, { syncPreview = false } = {}) {
    const { video, index, ready, abort } = hd;
    abort.abort(); playbackController.remove(video);
    if (syncPreview && ready) {
      const unit = units[index]; unit.returning = true;
      // trim_start is the lightweight-to-delivered-HD offset, never raw source time.
      const time = Math.max(0, Math.min(video.currentTime - sourceStart(unit), Math.max(0, unit.video.duration - .05)));
      seekVideo(unit.video, time).finally(() => { unit.returning = false; playback(); });
    }
    releaseHdVideo(video);
  }
  function clearHd({ keepFrame = false } = {}) {
    if (!focusedHd) return;
    const hd = focusedHd; focusedHd = null;
    // Keep the outgoing decoder and playback controller alive throughout the
    // camera move. Releasing it here used to leave a frozen frame sliding out.
    if (keepFrame && hd.ready) return hd;
    disposeHd(hd, { syncPreview: true });
  }
  function discardPrepared() {
    if (!preparedHd) return;
    const hd = preparedHd; preparedHd = null;
    if (hd !== focusedHd && !retiredFrames.has(hd)) disposeHd(hd);
  }
  function activateHd(hd) {
    if (!hd?.ready || hd.abort.signal.aborted || focused !== hd.index || !visible || document.hidden) return;
    if (focusedHd === hd && hd.selection === focusStart) return;
    if (preparedHd === hd) preparedHd = null;
    retiredFrames.delete(hd); focusedHd = hd;
    const selection = focusStart;
    hd.selection = selection; hd.playbackReady = false;
    hd.video.hidden = false;
    // Flush the zero-opacity state before raising it, including a retained
    // decoder that has just been rewound for a new selection.
    getComputedStyle(hd.video).opacity;
    hd.video.classList.add('is-ready');
    root.dataset.wallFocusedQuality = `${hd.video.videoWidth}x${hd.video.videoHeight}`;
    const fade = waitWallVisualTransitions(hd.video, 'opacity').then(() => {
      if (focusStart === selection && focusedHd === hd) root.dataset.wallHdFadeSettledAt = performance.now().toFixed(1);
    });
    Promise.all([cameraTransition, fade]).then(() => {
      if (hd.abort.signal.aborted || focusStart !== selection || focusedHd !== hd || focused !== hd.index) return;
      hd.playbackReady = true;
      if (selection) { selection.released = true; clearTimeout(selection.timer); }
      camera.removeAttribute('aria-busy');
      root.dataset.wallFocusPlaybackReleasedAt = performance.now().toFixed(1);
      root.dataset.wallFocusPlaybackStartTime = hd.video.currentTime.toFixed(3);
      playback();
    });
    hd.stream?.start().then(() => {
      if (!hd.abort.signal.aborted && (focusedHd === hd || retiredFrames.has(hd))) playback();
    });
    playback();
  }
  function connectHdStream(hd, unit) {
    const { video } = hd, { signal } = hd.abort;
    const foreground = () => focusedHd === hd || retiredFrames.has(hd);
    hd.stream = createStreamVideo(video, {
      src: unit.item.full_src, hlsSrc: unit.item.full_hls_src,
      canPlay: () => !signal.aborted && visible && !document.hidden &&
        // Native MP4 cannot be bounded. Unsupported/fatal hover preparation
        // therefore waits for a real focus click instead of downloading it.
        (hd.stream?.mode !== 'native' || focused === hd.index) &&
        (hd.preparing || hd.aligning || hd.loopSeeking || (foreground() && (!paused || (exploring && focused === hd.index))))
    });
    hdStreams.set(video, hd.stream);
    video.addEventListener('play', () => { if (foreground()) hd.stream.start(); }, { signal });
    video.addEventListener('pause', () => {
      if (!hd.preparing && !hd.aligning && !hd.loopSeeking) hd.stream.stop();
    }, { signal });
    video.addEventListener('loadeddata', () => { if (foreground() && hd.ready) playback(); }, { signal });
    video.addEventListener('streamfallback', () => {
      if (focused !== hd.index) hd.abort.abort();
      else if (foreground() && hd.ready) playback();
    }, { signal });
  }
  function primeHd(index) {
    clearTimeout(hoverTimer);
    if (!exploring || paused || !visible || document.hidden || cameraMoving || focusCoordinator.pendingIndex >= 0 || (focused >= 0 && !focusedHd?.ready)) return;
    hoverTimer = setTimeout(() => {
      if (exploring && visible && !cameraMoving && focusCoordinator.pendingIndex < 0 && !document.hidden) prepareHd(index);
    }, 120);
  }
  function prepareHd(index, { resume = null } = {}) {
    if (!visible || document.hidden) return Promise.resolve(null);
    if (focusedHd?.index === index && focusedHd.ready) {
      if (preparedHd !== focusedHd) discardPrepared();
      return Promise.resolve(focusedHd);
    }
    const retained = [...retiredFrames].find(frame => frame.index === index && frame.ready);
    if (retained) { discardPrepared(); return Promise.resolve(retained); }
    if (!units[index]?.item.full_src) return Promise.resolve(null);
    if (preparedHd?.index === index) return preparedHd.promise;
    discardPrepared();
    const unit = units[index], video = document.createElement('video');
    const hd = { video, index, ready: false, preparing: true, aligning: false, loopSeeking: false, playbackReady: false, abort: new AbortController(), promise: null, resume }; preparedHd = hd;
    video.className = 'wall-hd'; video.muted = true; video.defaultMuted = true; video.playsInline = true; video.preload = 'auto';
    video.dataset.clipId = unit.item.id; video.setAttribute('muted', ''); video.setAttribute('playsinline', '');
    video.setAttribute('aria-hidden', 'true');
    const loopAction = async () => {
      if (!visible || document.hidden || (focusedHd !== hd && !retiredFrames.has(hd)) || !hd.ready || hd.loopSeeking || video.currentTime < sourceEnd(unit) - .08) return;
      hd.loopSeeking = true; playback();
      await hd.stream.start();
      const reached = await seekVideo(video, sourceStart(unit), { signal: hd.abort.signal });
      if (focusedHd !== hd && !retiredFrames.has(hd)) return;
      hd.loopSeeking = false;
      if (reached) playback(); else if (focusedHd === hd) { clearHd(); playback(); }
    };
    video.addEventListener('playing', () => {
      if (focusedHd === hd && focusStart && !focusStart.firstPlayAt) {
        focusStart.firstPlayAt = performance.now().toFixed(1);
        root.dataset.wallFocusFirstPlayAt = focusStart.firstPlayAt;
        root.dataset.wallFocusFirstPlayTime = video.currentTime.toFixed(3);
      }
    });
    video.addEventListener('timeupdate', loopAction);
    video.addEventListener('ended', loopAction);
    video.addEventListener('error', () => { if (focusedHd === hd) { clearHd(); playback(); } }, { once: true });
    // Only the enlarged HD source changes transport; the 40-tile camera and
    // outgoing-frame animation keep their existing geometry and lifecycle.
    unit.frame.append(video); connectHdStream(hd, unit);
    hd.promise = (async () => {
      if (!await hd.stream.load() || hd.abort.signal.aborted) return null;
      if (!hd.stream.isStreaming && focused !== index) return null;
      if (!await hd.stream.start()) return null;
      const available = await waitWallHdFrame(video, { signal: hd.abort.signal, metadataOnly: true });
      if (!available) return null;
      const ready = resume ? await restoreWallVideo(video, resume, { signal: hd.abort.signal }) : await alignHd(hd);
      if (!ready) return null;
      hd.ready = true; hd.preparing = false;
      video.dataset.firstDataAt = performance.now().toFixed(1);
      // A slow request may complete after the bounded preview fallback. Upgrade
      // only that still-focused tile, never a stale selection.
      if (focused === index && !focusedHd && visible && !document.hidden) activateHd(hd);
      else if (focusedHd !== hd && !retiredFrames.has(hd)) hd.stream.stop();
      return hd;
    })().catch(() => null).then(ready => {
      hd.preparing = false;
      if (!ready && preparedHd === hd) { preparedHd = null; disposeHd(hd); }
      return ready;
    });
    return hd.promise;
  }
  async function alignHd(hd) {
    if (!hd || hd.abort.signal.aborted) return null;
    const { video, index } = hd, unit = units[index];
    hd.aligning = true;
    try {
      if (!await hd.stream.start()) return null;
      const time = Math.max(0, Math.min(sourceStart(unit), sourceEnd(unit) - .05, video.duration - .05));
      if (Math.abs(video.currentTime - time) > .12 || video.readyState < 2) {
        if (!await seekVideo(video, time, { signal: hd.abort.signal })) return null;
      }
      if (!await waitWallHdFrame(video, { signal: hd.abort.signal })) return null;
      hd.ready = true; return hd;
    } finally {
      hd.aligning = false;
      if (!hd.preparing && focusedHd !== hd && !retiredFrames.has(hd)) hd.stream.stop();
    }
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
  const focusCoordinator = createWallFocusCoordinator({
    current: () => focused,
    peek(index) {
      const retained = [...retiredFrames].find(hd => hd.index === index && hd.ready && !hd.abort.signal.aborted);
      if (retained) return retained;
      if (preparedHd?.index !== index || !preparedHd.ready || preparedHd.abort.signal.aborted || preparedHd.video.seeking) return null;
      const time = sourceStart(units[index]);
      return Math.abs(preparedHd.video.currentTime - time) <= .12 ? preparedHd : null;
    },
    prepare: index => prepareHd(index),
    commit: commitFocus,
    onReady(index, hd) { if (focused === index && focusedHd !== hd) activateHd(hd); },
    onPending(index) {
      root.dataset.wallFocusPending = String(index);
      if (index >= 0) {
        root.dataset.wallFocusPrepareAt = performance.now().toFixed(1);
        camera.setAttribute('aria-busy', 'true');
      } else if (!focusStart || focusStart.released || focusStart.timedOut) camera.removeAttribute('aria-busy');
    }
  });
  function resetCamera() {
    const restoreBackFocus = focusNavigation.contains(document.activeElement);
    focusCoordinator.cancel(); clearTimeout(hoverTimer); discardPrepared();
    resumeFocusedHd = null;
    clearTimeout(focusStart?.timer); focusStart = null; camera.removeAttribute('aria-busy');
    cameraMoveRevision += 1; cameraMoving = false; clearRetiredFrames(); clearHd();
    camera.style.removeProperty('--focus-x'); camera.style.removeProperty('--focus-y');
    camera.style.removeProperty('--focus-scale'); focused = -1;
    root.classList.remove('wall-focused', 'wall-focus-moving'); focusNavigation.hidden = true;
    focusLabel.textContent = 'Choose a window to explore its action and instruction.';
    units.forEach(({ tile, video }) => { video.hidden = false; tile.classList.remove('is-focused', 'was-focused'); tile.tabIndex = 0; tile.inert = false; tile.removeAttribute('aria-hidden'); });
    back.textContent = 'Back to title ↗'; playback();
    if (restoreBackFocus) back.focus({ preventScroll: true });
  }
  function focus(index) {
    if (!exploring || !units[index]?.tile.offsetWidth) return Promise.resolve(false);
    clearTimeout(hoverTimer);
    if (index === focused && preparedHd?.index !== index) discardPrepared();
    return focusCoordinator.go(index);
  }
  function commitFocus(index, hd) {
    const previous = focused, moveKeyboardFocus = camera.contains(document.activeElement);
    cameraMoveRevision += 1;
    clearTimeout(focusStart?.timer);
    const selection = focusStart = { index, released: false, timedOut: false };
    root.dataset.wallFocusSelectedAt = performance.now().toFixed(1);
    root.dataset.wallFocusTargetStart = sourceStart(units[index]).toFixed(3);
    for (const key of ['wallCameraSettledAt', 'wallHdFadeSettledAt', 'wallFocusPlaybackReleasedAt', 'wallFocusPlaybackStartTime', 'wallFocusFirstPlayAt', 'wallFocusFirstPlayTime']) delete root.dataset[key];
    camera.setAttribute('aria-busy', 'true');
    selection.timer = setTimeout(() => {
      if (focusStart !== selection || selection.released) return;
      selection.timedOut = true; camera.removeAttribute('aria-busy');
    }, 12000);
    // A rapid reversal can reuse the still-playing outgoing HQ decoder.
    if (hd) retiredFrames.delete(hd);
    if (previous >= 0) {
      units[previous].tile.classList.add('was-focused');
      const frame = clearHd({ keepFrame: true }); if (frame) retiredFrames.add(frame);
    }
    // A rapid reversal must reveal the current preview, not an older retained HD.
    clearRetiredFrames(index);
    focused = index;
    loadQueue.prioritize(units[index]);
    root.classList.add('wall-focused'); root.classList.toggle('wall-focus-moving', previous >= 0);
    units.forEach(({ tile, video }, i) => {
      // The exact first-frame atlas stays visible while the selected HD loads.
      video.hidden = i === index;
      if (i === index) playbackController.sync(video, false);
      tile.classList.toggle('is-focused', i === index); if (i === index) tile.classList.remove('was-focused');
      tile.tabIndex = i === index ? 0 : -1; tile.inert = i !== index; tile.setAttribute('aria-hidden', String(i !== index));
    });
    root.dataset.wallFocusUsedHd = String(Boolean(focusedHd?.ready));
    root.dataset.wallFocusCommittedAt = performance.now().toFixed(1);
    // Only the previous camera position needs an outgoing HQ decoder. Older
    // moves cannot accumulate a growing collection during rapid arrow input.
    while (retiredFrames.size > 1) {
      const oldest = retiredFrames.values().next().value;
      retiredFrames.delete(oldest); disposeHd(oldest, { syncPreview: true });
      units[oldest.index].tile.classList.remove('was-focused');
    }
    showPrompt(units[index]); layoutFocus();
    if (moveKeyboardFocus) units[index].tile.focus({ preventScroll: true });
    back.textContent = `← All ${units.length} windows`;
    cameraTransition = watchCameraMove();
    if (hd?.ready) {
      // A -> B -> A may reuse the decoder, but a new selection always starts
      // at the beginning rather than inheriting the retained outgoing clock.
      playbackController.sync(hd.video, false);
      hd.video.hidden = true; hd.video.classList.remove('is-ready');
      hd.ready = hd.playbackReady = false; hd.selection = null;
      if (preparedHd !== hd) discardPrepared();
      preparedHd = hd;
      hd.promise = alignHd(hd).catch(() => null).then(ready => {
        if (ready && focusStart === selection && focused === index) activateHd(hd);
        else if (!ready && preparedHd === hd) { preparedHd = null; disposeHd(hd); }
        return ready;
      });
    }
    playback();
  }
  explore.addEventListener('click', () => {
    finishReveal('explore'); exploring = true; camera.inert = false; camera.removeAttribute('aria-hidden'); root.classList.add('wall-exploring'); heroContent.inert = true; heroContent.setAttribute('aria-hidden', 'true');
    resetCamera();
    back.hidden = false; back.focus({ preventScroll: true });
  });
  back.addEventListener('click', () => {
    if (focused >= 0) return resetCamera();
    focusCoordinator.cancel(); clearTimeout(hoverTimer); discardPrepared();
    exploring = false; camera.inert = true; camera.setAttribute('aria-hidden', 'true'); root.classList.remove('wall-exploring'); back.hidden = true; heroContent.inert = false; heroContent.removeAttribute('aria-hidden');
    units.forEach(({ tile }) => tile.tabIndex = -1); explore.focus({ preventScroll: true });
  });
  root.addEventListener('keydown', e => {
    if (e.key === 'Escape' && exploring) { back.click(); return; }
    const direction = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' }[e.key];
    if (!direction || !exploring || focused < 0 || e.altKey || e.ctrlKey || e.metaKey || e.target.isContentEditable || e.target.closest('input, textarea, select')) return;
    e.preventDefault(); e.stopPropagation(); moveFocus(direction);
  }, { capture: true });
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
  window.addEventListener('pagehide', event => {
    // A bfcache entry may be restored with the same DOM. Cancel startup work
    // only when this page is actually discarded.
    if (event.persisted) return;
    focusCoordinator.cancel(); clearTimeout(hoverTimer); discardPrepared();
    clearTimeout(focusStart?.timer); focusStart = null;
    loadQueue.destroy();
    units.forEach(unit => unit.firstFrame.destroy());
    clearTimeout(revealTimer);
    frameStates.forEach(state => state.stop());
  });
  playback();
}
