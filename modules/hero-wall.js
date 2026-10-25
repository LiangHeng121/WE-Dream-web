import { seekVideo } from './video-seek.js?v=v37';
import { createStreamVideo } from './stream-video.js?v=v37';
import { createWallStartPrefetch } from './wall-start-prefetch.js?v=v37';
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

export async function restoreWallVideo(video, saved, { signal, isCurrent = () => true } = {}) {
  if (!await waitWallHdFrame(video, { signal, metadataOnly: true })) return false;
  if (signal?.aborted || !isCurrent() || !video.getAttribute('src')) return false;
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

export function wallNeighborOrder(index, direction, columns, count, hover = -1) {
  return [...new Set([hover, ...[direction, 'right', 'left', 'down', 'up'].map(value => wallNeighborIndex(index, value, columns, count))])]
    .filter(value => value >= 0 && value < count && value !== index);
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

// Keep the lightweight video visible while the HD decoder catches its clock.
// A decoded seek alone is insufficient: wait for a frame actually presented
// by the playing HD element before exposing it over the moving preview.
export function waitWallPresentedFrame(video, { signal, timeout = 1800 } = {}) {
  if (signal?.aborted) return Promise.resolve(false);
  return new Promise(resolve => {
    let callback, timer, settled = false;
    const finish = value => {
      if (settled) return; settled = true; clearTimeout(timer);
      if (callback !== undefined) video.cancelVideoFrameCallback?.(callback);
      signal?.removeEventListener('abort', abort); video.removeEventListener('timeupdate', fallback);
      resolve(value);
    };
    const abort = () => finish(false);
    const fallback = () => { if (!video.paused && video.readyState >= 2 && !video.seeking) finish(true); };
    signal?.addEventListener('abort', abort, { once: true });
    timer = setTimeout(() => finish(false), timeout);
    if (video.requestVideoFrameCallback) {
      const presented = () => {
        if (!video.paused && video.readyState >= 2 && !video.seeking && !video.error) finish(true);
        else if (!settled) callback = video.requestVideoFrameCallback(presented);
      };
      callback = video.requestVideoFrameCallback(presented);
    }
    else video.addEventListener('timeupdate', fallback);
  });
}

// A completed seek and real playing event establish decoder/clock readiness.
// The separate submitted-frame PTS gate still verifies the pixels before reveal;
// callbacks collected during the paused seek can satisfy it without waiting
// for another playing callback from an occluded video surface.
export function waitWallDecodedPlayback(video, { signal, timeout = 1800 } = {}) {
  if (signal?.aborted || video.error) return Promise.resolve(false);
  return new Promise(resolve => {
    let timer, settled = false, playing = false;
    const finish = value => {
      if (settled) return; settled = true; clearTimeout(timer);
      for (const [event, handler] of events) video.removeEventListener(event, handler);
      signal?.removeEventListener('abort', failed); resolve(value);
    };
    const check = () => { if (playing && !video.paused && video.readyState >= 2 && !video.seeking && !video.error) finish(true); };
    const began = () => { playing = true; check(); };
    const paused = () => { playing = false; };
    const failed = () => finish(false);
    const events = [['playing', began], ['pause', paused], ['waiting', paused], ['loadeddata', check], ['canplay', check], ['seeked', check], ['error', failed]];
    for (const [event, handler] of events) video.addEventListener(event, handler);
    signal?.addEventListener('abort', failed, { once: true });
    timer = setTimeout(failed, timeout);
  });
}

// Record compositor frame PTS continuously, including the paused seek frame.
// The media clock/playing event alone cannot prove which pixels the HD layer owns.
export function trackWallFrames(video, { signal, onFrame = () => {}, now = () => performance.now() } = {}) {
  let callback = null, stopped = false, latest = null, sequence = 0, generation = 0;
  const supported = typeof video.requestVideoFrameCallback === 'function';
  const queue = () => {
    if (!supported || stopped) return;
    const expectedGeneration = generation;
    callback = video.requestVideoFrameCallback((at, metadata) => {
      if (stopped || signal?.aborted || expectedGeneration !== generation) return;
      if (Number.isFinite(metadata.mediaTime)) {
        latest = { mediaTime: metadata.mediaTime, at: Number.isFinite(at) ? at : now(),
          expectedDisplayTime: metadata.expectedDisplayTime, sequence: ++sequence, generation };
        onFrame(latest);
      }
      queue();
    });
  };
  const invalidate = () => {
    latest = null; generation++;
    if (callback !== null) video.cancelVideoFrameCallback?.(callback);
    queue();
  };
  const stop = () => {
    if (stopped) return; stopped = true;
    if (callback !== null) video.cancelVideoFrameCallback?.(callback);
    for (const event of ['emptied', 'loadstart', 'seeking']) video.removeEventListener?.(event, invalidate);
    signal?.removeEventListener('abort', stop);
  };
  for (const event of ['emptied', 'loadstart', 'seeking']) video.addEventListener?.(event, invalidate);
  signal?.addEventListener('abort', stop, { once: true });
  if (signal?.aborted) stop(); else queue();
  return { supported, get latest() { return latest; }, setOnFrame(listener) { onFrame = listener; }, stop };
}

// Older engines without rVFC get a clearly weaker visible-surface fallback:
// a real post-playing timeupdate and two paint opportunities, never just a timer.
export function waitWallVisibleFallback(video, { signal, isCurrent = () => true, timeout = 1200,
  requestFrame = globalThis.requestAnimationFrame, cancelFrame = globalThis.cancelAnimationFrame } = {}) {
  if (signal?.aborted || typeof requestFrame !== 'function') return Promise.resolve(false);
  return new Promise(resolve => {
    let timer, paint = null, painting = false, settled = false;
    const valid = () => !signal?.aborted && isCurrent() && !video.paused && video.readyState >= 2 && !video.seeking && !video.error;
    const finish = value => {
      if (settled) return; settled = true; clearTimeout(timer);
      if (paint !== null) cancelFrame?.(paint);
      video.removeEventListener('timeupdate', progressed); video.removeEventListener('error', failed); signal?.removeEventListener('abort', failed);
      resolve(value);
    };
    const failed = () => finish(false);
    const progressed = () => {
      if (painting || !valid()) return;
      painting = true;
      paint = requestFrame(() => {
        if (!valid()) { finish(false); return; }
        paint = requestFrame(() => finish(valid()));
      });
    };
    video.addEventListener('timeupdate', progressed); video.addEventListener('error', failed);
    signal?.addEventListener('abort', failed, { once: true }); timer = setTimeout(failed, timeout);
  });
}

export async function alignWallHandoff(video, preview, {
  signal, sourceStart = 0, isCurrent = () => true, start = () => video.play(), pause = () => video.pause(),
  timeout = 7000, now = () => performance.now(), onState = () => {}, requestBuffer = null, bufferLookahead = 0, frameTracker = null
} = {}) {
  const deadline = now() + timeout;
  const current = () => !signal?.aborted && isCurrent() && now() < deadline;
  const frames = frameTracker || trackWallFrames(video, { signal, now });
  const waitUntil = (check, until = deadline) => new Promise(resolve => {
    let timer, settled = false;
    const finish = value => { if (settled) return; settled = true; clearTimeout(timer); signal?.removeEventListener('abort', aborted); resolve(value); };
    const aborted = () => finish(null);
    const poll = () => {
      if (!current() || now() >= until) { finish(null); return; }
      const value = check();
      if (value) finish(value); else timer = setTimeout(poll, 16);
    };
    signal?.addEventListener('abort', aborted, { once: true }); poll();
  });
  const buffered = (time, ahead) => {
    for (let i = 0; i < (video.buffered?.length || 0); i++) {
      const start = video.buffered.start(i);
      const initialOffset = i === 0 && time - sourceStart <= .15 && start - time <= .15;
      if ((start <= time || initialOffset) && video.buffered.end(i) >= time + ahead) return true;
    }
    return false;
  };
  let lead = .12, seeks = 0, stationary = false, bufferRequests = 0, pendingBuffer = null;
  let bufferDelay = Math.max(0, Math.min(6, Number(bufferLookahead) || 0));
  let observedTime = preview.currentTime, movedAt = now(), previewCycle = 0;
  const observe = () => {
    const time = preview.currentTime;
    if (time < observedTime - .1) previewCycle++;
    if (Math.abs(time - observedTime) > .015) { observedTime = time; movedAt = now(); }
    return { time, stalled: preview.paused || now() - movedAt >= 180 };
  };
  try {
  await pause();
  for (let attempt = 0; attempt < 3 && current(); attempt++) {
    onState('waiting-buffer', { seeks, lead });
    const anchor = await waitUntil(() => {
      const sample = observe(), time = sample.time;
      stationary = sample.stalled;
      const end = Math.min(Number.isFinite(preview.duration) ? preview.duration : Infinity, video.duration - sourceStart);
      // Do not choose a rendezvous across the preview's loop boundary. Its
      // next loop supplies a fresh zero-based clock without a large seek.
      if (!stationary && time + lead + .2 >= end) return null;
      const target = sourceStart + time + (stationary ? 0 : lead);
      if (requestBuffer && !buffered(target, .2)) {
        // The paused HLS window cannot catch a preview moving faster than its
        // fragments arrive. Ask for a future window using first-data latency;
        // if that window still arrives late, measure it and correct once.
        // Already-buffered targets never enter this path or pay its lookahead.
        let arrivedEnd = 0;
        if (pendingBuffer) for (let i = 0; i < video.buffered.length; i++) {
          if (video.buffered.start(i) <= pendingBuffer.target && video.buffered.end(i) > pendingBuffer.target + .04) {
            arrivedEnd = video.buffered.end(i); break;
          }
        }
        if (arrivedEnd && pendingBuffer.delay === null) {
          pendingBuffer.delay = Math.max(0, (now() - pendingBuffer.at) / 1000);
          bufferDelay = Math.max(bufferDelay, pendingBuffer.delay);
        }
        const missed = pendingBuffer && ((arrivedEnd && target + .2 > arrivedEnd) || previewCycle > pendingBuffer.cycle);
        const needsWindow = pendingBuffer ? missed : Math.abs(target - video.currentTime) > 4;
        if (bufferRequests < 2 && needsWindow) {
          const ahead = stationary ? 0 : Math.min(6, Math.max(.35, bufferDelay + .35));
          // Clamp inside this source's action/loop boundary. A loop wrap can
          // use the remaining request, but never raises the two-request cap.
          const windowTarget = Math.min(sourceStart + end - .25, target + ahead);
          pendingBuffer = { target: windowTarget, at: now(), delay: null, cycle: previewCycle };
          bufferRequests++; seeks++;
          requestBuffer(windowTarget);
          onState('buffer-positioning', { seeks, lead, target: windowTarget, bufferRequests, bufferLead: ahead });
          return null;
        }
      }
      return buffered(target, Math.min(.2, Math.max(0, end - time - (stationary ? 0 : lead)))) ? { target, previewTime: time, stationary } : null;
    });
    if (!anchor) return false;
    await pause();
    if (!current()) return false;
    const seekAt = now();
    const initialOffset = anchor.stationary && anchor.target - sourceStart <= .15 && video.currentTime - anchor.target >= 0 && video.currentTime - anchor.target <= .12;
    if (!initialOffset && Math.abs(video.currentTime - anchor.target) > .015) { seeks++; video.currentTime = anchor.target; }
    onState('seeking', { seeks, lead, target: anchor.target });
    if (!await waitUntil(() => video.readyState >= 2 && !video.seeking)) return false;
    const seekSeconds = (now() - seekAt) / 1000;
    lead = Math.max(.12, Math.min(1.5, seekSeconds + .08));
    onState('waiting-preview', { seeks, lead, seekMs: seekSeconds * 1000, target: anchor.target });
    const anchorTime = anchor.target - sourceStart;
    // A slower-than-predicted decode may miss the first rendezvous. Measure
    // that latency and choose a later buffered point once, rather than seek
    // repeatedly to the preview's already-obsolete position.
    const sample = observe();
    if (sample.time < anchor.previewTime - .1 || sample.time > anchorTime + .08) continue;
    const reached = await waitUntil(() => {
      const next = observe();
      if (next.time < anchor.previewTime - .1) return 'looped';
      if (next.time >= anchorTime - .008) return 'reached';
      return next.stalled ? 'stalled' : null;
    });
    if (!reached) return false;
    // A preview can emit playing while its media clock remains at zero. Seek
    // its stationary frame on the next pass; never wait for an unreachable point.
    if (reached !== 'reached' || preview.currentTime > anchorTime + .08) continue;
    onState('presenting', { seeks, lead, target: anchor.target });
    const playingAbort = new AbortController(), abortPlaying = () => playingAbort.abort();
    signal?.addEventListener('abort', abortPlaying, { once: true });
    const playback = waitWallDecodedPlayback(video, { signal: playingAbort.signal, timeout: Math.max(1, Math.min(1800, deadline - now())) });
    let started;
    try { started = Promise.resolve(start()).then(() => true, () => false); } catch { started = Promise.resolve(false); }
    // A rejected/hung play cannot strand the gate. The real media event wins
    // independently of a browser's play-promise scheduling, with a hard deadline.
    const playing = await Promise.race([playback, started.then(ok => ok ? playback : false)]);
    signal?.removeEventListener('abort', abortPlaying); playingAbort.abort();
    if (!playing || !current()) return false;
    const drift = video.currentTime - sourceStart - preview.currentTime;
    if (Math.abs(drift) <= .12) {
      onState('waiting-surface', { seeks, target: anchor.target });
      let proof;
      if (frames.supported) {
        proof = await waitUntil(() => {
          const frame = frames.latest;
          if (!frame || video.paused || video.readyState < 2 || video.seeking || video.error) return null;
          const target = sourceStart + preview.currentTime;
          return Math.abs(frame.mediaTime - target) <= .12 && Math.abs(video.currentTime - target) <= .12 ? frame : null;
        }, Math.min(deadline, now() + 1800));
      } else {
        proof = await waitWallVisibleFallback(video, { signal, isCurrent: current, timeout: Math.max(1, Math.min(1200, deadline - now())) });
      }
      if (!proof || !current()) { if (!signal?.aborted && isCurrent()) onState('frame-timeout', { seeks }); return false; }
      const frameProof = frames.supported ? 'submitted-frame-pts' : 'visible-playing-fallback';
      onState('aligned', { seeks, drift: video.currentTime - sourceStart - preview.currentTime, stationary: anchor.stationary,
        frameProof, frameTime: frames.supported ? proof.mediaTime : null });
      return true;
    }
    await pause();
    lead = Math.min(1.5, Math.max(lead, Math.abs(drift) + .08));
  }
  return false;
  } finally { if (!frameTracker) frames.stop(); }
}

export async function mountHeroWall(root) {
  root.dataset.wallRevealState = 'loading-data';
  root.dataset.wallMountedAt = performance.now().toFixed(1);
  const wallData = fetch('assets/media/wall-units.json?v=v37').then(r => { if (!r.ok) throw Error('Wall media unavailable'); return r.json(); });
  // Instructions are needed when a visitor explores a tile, not before the
  // first frame. A slower content request must not block the opening wall.
  const contentData = fetch('data/content.json?v=v37').then(r => { if (!r.ok) throw Error('Demo instructions unavailable'); return r.json(); }).catch(error => { console.warn('[WE-Dream video wall]', error.message); return null; });
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
  let preferredDirection = 'right', hoveredPreview = -1, warmPreviewIndex = -1, neighborHdIntent = null;
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
  const startPrefetch = createWallStartPrefetch(units.map(unit => unit.item), {
    onChange: stats => {
      root.dataset.wallStartupCached = String(stats.ready);
      root.dataset.wallStartupBytes = String(stats.bytes);
      root.dataset.wallStartupRequests = String(stats.running);
    },
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
        const restore = saved ? restoreWallVideo(unit.video, saved, { signal, isCurrent: () => unit.suspendedPreview === saved }).then(restored => {
          if (!restored || signal.aborted) return;
          if (unit.suspendedPreview === saved) unit.suspendedPreview = null;
          unit.resuming = false; schedulePlayback();
        }) : Promise.resolve();
        await Promise.all([transfer, restore]);
      } catch (error) {
        if (!signal.aborted) { unit.warmResetReady = false; unit.warmResetFailed = true; }
        throw error;
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
    return finished.then(() => {
      if (revision === cameraMoveRevision) root.dataset.wallCameraAnimationDoneAt = performance.now().toFixed(1);
      settle();
      if (revision === cameraMoveRevision) root.dataset.wallCameraSettledAt = performance.now().toFixed(1);
    });
  }
  function moveFocus(direction) {
    if (!exploring || focused < 0) return;
    const from = focusCoordinator.pendingIndex >= 0 ? focusCoordinator.pendingIndex : focused;
    const next = wallNeighborIndex(from, direction, wallColumns(), units.length);
    if (next < 0) return;
    preferredDirection = direction;
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
    schedulePlayback();
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
    if (focusedHd?.handingOff || focusedHd?.handoffTimer || focusedHd?.firstFrameVerifying) {
      if (focusedHd.firstFrameVerifying) focusedHd.resumeFirstFrame = true;
      focusedHd.firstFrameVerifying = false;
      focusedHd.handoffRevision = (focusedHd.handoffRevision || 0) + 1;
      clearTimeout(focusedHd.handoffTimer); focusedHd.handoffTimer = null;
      focusedHd.handingOff = false; focusedHd.handoffPlaying = false; focusedHd.playbackReady = false; focusedHd.selection = null;
      focusedHd.video.hidden = true; focusedHd.video.classList.remove('is-ready');
    }
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
    const retained = keep instanceof Set ? keep : new Set(keep ? [keep] : []);
    const cancelled = [];
    units.forEach(unit => {
      if (retained.has(unit)) return;
      unit.warmResetAbort?.abort(); unit.warmResetAbort = null;
      playbackController.sync(unit.video, false);
      if (wallVideoFullyBuffered(unit.video)) return;
      const saved = suspendWallVideo(unit.video);
      if (saved) unit.suspendedPreview ||= saved;
      unit.resuming = false; cancelled.push(unit);
    });
    loadQueue.invalidate(cancelled);
  }
  function neighborPreviewSafe() {
    const hd = focusedHd;
    return focused >= 0 && Boolean(focusStart?.handedOff && hd?.ready && hd.playbackReady && !hd.starved && !hd.video.paused && units[focused].video.readyState >= 2 &&
      (wallVideoFullyBuffered(hd.video) || wallBufferedAhead(hd.video) >= 3));
  }
  function prepareNeighborPreview(index) {
    const unit = units[index], video = unit.video;
    if (unit.warmResetAbort || unit.warmResetFailed || video.error || video.readyState < 1) return;
    if (unit.warmResetReady && video.readyState >= 2 && !video.seeking && Math.abs(video.currentTime) <= .05) return;
    const abort = unit.warmResetAbort = new AbortController();
    unit.suspendedPreview = null;
    const current = () => !abort.signal.aborted && focused !== index && warmPreviewIndex === index;
    restoreWallVideo(video, { time: 0, rate: 1 }, { signal: abort.signal, isCurrent: current }).then(ready => {
      if (!current()) return;
      unit.warmResetReady = ready; unit.warmResetFailed = !ready;
      if (ready) {
        video.dataset.warmResetReadyAt = performance.now().toFixed(1);
        video.dataset.warmResetTime = video.currentTime.toFixed(3);
        root.dataset.wallPreviewWarmReady = String(index);
        root.dataset.wallPreviewWarmReadyAt = performance.now().toFixed(1);
      }
    }).finally(() => {
      if (unit.warmResetAbort === abort) { unit.warmResetAbort = null; schedulePlayback(); }
    });
  }
  function cancelNeighborHd(intent, state = 'failed', reason = state) {
    if (!intent) return;
    clearTimeout(intent.timer); intent.timer = null; intent.state = state; intent.reason = reason;
    if (preparedHd?.index === intent.index && preparedHd.index !== focused && !preparedHd.ready) discardPrepared();
    if (neighborHdIntent === intent) { root.dataset.wallHdWarmState = state; root.dataset.wallHdWarmReason = reason; }
  }
  function neighborHdPlan(candidates, safe) {
    safe = safe && !cameraMoving && focusCoordinator.pendingIndex < 0;
    const target = candidates[0] ?? -1;
    if (neighborHdIntent && (neighborHdIntent.selection !== focusStart || neighborHdIntent.index !== target)) {
      const previous = neighborHdIntent;
      cancelNeighborHd(previous, 'obsolete', 'intent-changed');
      if (preparedHd?.index === previous.index && preparedHd.index !== focused) discardPrepared();
      neighborHdIntent = null;
    }
    if (target < 0) return null;
    const intent = neighborHdIntent ||= { selection: focusStart, index: target, state: 'idle', reason: '', timer: null };
    if (!safe && intent.state === 'loading') cancelNeighborHd(intent, 'failed', document.hidden ? 'document-hidden' : !visible ? 'offscreen' : 'foreground-unsafe');
    if (!units[target].item.full_hls_src && intent.state === 'idle') { intent.state = 'failed'; intent.reason = 'no-playlist'; }
    root.dataset.wallHdWarmTarget = String(intent.index); root.dataset.wallHdWarmState = intent.state; root.dataset.wallHdWarmReason = intent.reason;
    // Once current HD is safely buffered, the next HD first frame matters more
    // than downloading an entire low-resolution action. Warm just one decoder.
    return { intent, reserve: safe && (intent.state === 'loading' || intent.state === 'idle'),
      dispatch: safe && intent.state === 'idle' };
  }
  function prepareNeighborHd(intent) {
    if (!intent || intent !== neighborHdIntent || intent.state !== 'idle') return;
    intent.state = 'loading'; intent.reason = '';
    const current = () => neighborHdIntent === intent && focusStart === intent.selection && focused !== intent.index;
    root.dataset.wallHdWarmTarget = String(intent.index);
    root.dataset.wallHdWarmState = 'loading';
    root.dataset.wallHdWarmReason = ''; root.dataset.wallHdWarmStartedAt = performance.now().toFixed(1);
    intent.timer = setTimeout(() => {
      if (!current() || intent.state !== 'loading') return;
      cancelNeighborHd(intent, 'failed', 'deadline-4000ms'); schedulePlayback();
    }, 4000);
    Promise.resolve().then(() => current() && intent.state === 'loading' ? prepareHd(intent.index) : null).then(hd => {
      if (!current() || intent.state !== 'loading') return;
      intent.state = hd?.ready && !hd.abort.signal.aborted ? 'ready' : 'failed';
      intent.reason = intent.state === 'ready' ? '' : 'prepare-failed';
      root.dataset.wallHdWarmState = intent.state;
      if (intent.state === 'ready') root.dataset.wallHdWarmReadyAt = performance.now().toFixed(1);
    }, () => { if (current() && intent.state === 'loading') { intent.state = 'failed'; intent.reason = 'prepare-rejected'; } }).finally(() => {
      clearTimeout(intent.timer); intent.timer = null;
      if (current()) { root.dataset.wallHdWarmState = intent.state; root.dataset.wallHdWarmReason = intent.reason; schedulePlayback(); }
    });
  }
  // A transient preparation/frame failure must not leave a selected preview
  // permanently low-resolution. Give that selection two bounded recoveries;
  // keep the existing decoder/PTS gate when available, and cancel on selection
  // changes. Background tabs defer work until visible instead of doing I/O.
  function scheduleHdRecovery(index, reason) {
    const selection = focusStart;
    if (!selection || focused !== index || selection.abort.signal.aborted || selection.handedOff || selection.hdRecoveryTimer || selection.hdRecoveryResume) return;
    const attempt = (selection.hdRecoveryAttempts || 0) + 1;
    if (attempt > 2) { root.dataset.wallHdRecoveryState = 'exhausted'; return; }
    selection.hdRecoveryAttempts = attempt;
    root.dataset.wallHdRecoveryState = 'scheduled';
    root.dataset.wallHdRecoveryReason = reason;
    root.dataset.wallHdRecoveryAttempt = String(attempt);
    const run = () => {
      selection.hdRecoveryTimer = null;
      if (focusStart !== selection || focused !== index || selection.abort.signal.aborted || selection.handedOff) return;
      if (!visible || document.hidden) { selection.hdRecoveryResume = run; root.dataset.wallHdRecoveryState = 'background'; return; }
      selection.hdRecoveryResume = null;
      // Genuine new media progress may already have resumed the handoff.
      if (focusedHd?.handingOff || focusedHd?.firstFrameVerifying || preparedHd?.index === index) return;
      root.dataset.wallHdRecoveryState = 'retrying';
      if (focusedHd?.index === index && focusedHd.ready && !focusedHd.abort.signal.aborted) {
        focusedHd.handoffAttempts = 0; focusedHd.selection = null;
        activateHd(focusedHd);
      } else if (!focusedHd) prepareHd(index);
    };
    selection.hdRecoveryTimer = setTimeout(run, attempt === 1 ? 800 : 2000);
    selection.abort.signal.addEventListener('abort', () => {
      clearTimeout(selection.hdRecoveryTimer); selection.hdRecoveryTimer = null; selection.hdRecoveryResume = null;
    }, { once: true });
  }
  function playback(reset = false) {
    const active = (!paused || (exploring && focused >= 0)) && visible && !document.hidden;
    if ((!visible || document.hidden) && !networkSuspended) suspendNetwork();
    if (visible && !document.hidden && networkSuspended) {
      networkSuspended = false; root.dataset.wallNetworkState = 'visible';
    }
    if (active && focusStart?.previewReady && focusStart.cameraReady && !focusStart.previewReleased && (!focusedHd?.ready || focusedHd.firstFramePending)) {
      focusStart.previewReleased = focusStart.released = true;
      clearTimeout(focusStart.timer); camera.removeAttribute('aria-busy');
      const preview = units[focused].video; preview.hidden = false;
      root.dataset.wallPreviewReleasedAt = performance.now().toFixed(1);
      root.dataset.wallPreviewStartTime = preview.currentTime.toFixed(3);
      root.dataset.wallFocusedQuality = `${preview.videoWidth}x${preview.videoHeight}`;
    }
    // Retain the selected lightweight decoder even after HD takes over. A
    // later direction reversal can then rewind cached bytes instead of reload.
    const previewUnit = active && focused >= 0 && focusStart ? units[focused] : null;
    const safeNeighbor = previewUnit && neighborPreviewSafe();
    startPrefetch.sync({ visible: active, ready: exploring || revealState === 'held', focused, safe: Boolean(safeNeighbor) });
    const candidates = focused >= 0 && focusStart ? wallNeighborOrder(focused, preferredDirection, wallColumns(), units.length, hoveredPreview) : [];
    const hdPlan = neighborHdPlan(candidates, Boolean(safeNeighbor));
    warmPreviewIndex = safeNeighbor && !hdPlan?.reserve ? candidates.find(index => {
      const unit = units[index];
      return !unit.warmResetFailed && (!wallVideoFullyBuffered(unit.video) || !unit.warmResetReady || Math.abs(unit.video.currentTime) > .05 || unit.video.seeking);
    }) ?? -1 : -1;
    if (warmPreviewIndex >= 0) {
      units[warmPreviewIndex].suspendedPreview = null;
      if (preparedHd && preparedHd.index !== focused && !preparedHd.ready) discardPrepared();
    }
    const allowed = previewUnit ? new Set([previewUnit, ...(warmPreviewIndex >= 0 ? [units[warmPreviewIndex]] : [])]) : null;
    if (!active || focused >= 0) suspendPreviews(allowed);
    // At most selected + one unfinished native preview can download. The next
    // neighbor starts only after the previous clip is fully cached and at zero.
    loadQueue.setActive(active && (focused < 0 || Boolean(previewUnit)), allowed);
    if (warmPreviewIndex >= 0) prepareNeighborPreview(warmPreviewIndex);
    if (hdPlan?.dispatch) prepareNeighborHd(hdPlan.intent);
    root.dataset.wallPreviewWarmTarget = String(warmPreviewIndex);
    if (reset) loadQueue.retry();
    root.classList.toggle('motion-paused', !active);
    root.dataset.wallIntent = paused && focused < 0 ? 'reduced-motion' : document.hidden ? 'background' : !visible ? 'offscreen' : focused >= 0 ? 'focused' : 'all-playing';
    units.forEach(({ video, returning }, i) => {
      const selectedPreview = i === focused && focusStart?.previewReleased && !focusStart.handedOff;
      const wanted = active && Boolean(video.getAttribute('src')) && !units[i].resuming && !returning && (focused < 0 || selectedPreview);
      playbackController.sync(video, wanted, { reset });
    });
    if (active && focusStart?.hdRecoveryResume) focusStart.hdRecoveryResume();
    if (active && focusedHd?.resumeFirstFrame) {
      const hd = focusedHd; hd.resumeFirstFrame = false; hd.selection = null; activateHd(hd);
    }
    if (focusedHd) playbackController.sync(focusedHd.video, active && focusedHd.ready && (focusedHd.playbackReady || (focusedHd.handingOff && focusedHd.handoffPlaying)) && !focusedHd.loopSeeking, { reset });
    for (const frame of retiredFrames) playbackController.sync(frame.video, active && frame.ready && frame.playbackReady && !frame.loopSeeking, { reset });
    if (active && !focusedHd && preparedHd?.index === focused && preparedHd.ready) activateHd(preparedHd);
    if (active && focusedHd?.ready && focusStart?.previewReleased && !focusStart.handedOff && !focusedHd.handingOff && !focusedHd.handoffTimer && focusedHd.selection !== focusStart) activateHd(focusedHd);
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
    clearTimeout(hd.handoffTimer); hd.handoffRevision = (hd.handoffRevision || 0) + 1;
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
    if (hd.surfaceSelection !== selection) { hd.surfaceSelection = selection; delete hd.video.dataset.wallSurfaceFrames; }
    hd.frames ||= trackWallFrames(hd.video, { signal: hd.abort.signal });
    hd.frames.setOnFrame(frame => {
      if (focusedHd !== hd || (focusStart?.handedOff && !hd.firstFramePending) || !visible || document.hidden) return;
      const samples = selection.surfaceFrames ||= [];
      samples.push({ at: Number(performance.now().toFixed(1)), mediaTime: Number(frame.mediaTime.toFixed(4)), generation: frame.generation,
        paused: hd.video.paused, seeking: hd.video.seeking, readyState: hd.video.readyState });
      if (samples.length > 8) samples.shift();
      hd.video.dataset.wallSurfaceFrames = JSON.stringify(samples);
      if (hd.firstFramePending && (!focusStart?.previewReleased || focusStart.handedOff) && Math.abs(frame.mediaTime - (hd.resume?.time ?? sourceStart(units[hd.index]))) <= .12) {
        hd.firstFramePending = false; hd.selection = null; activateHd(hd); return;
      }
      if (hd.selection !== focusStart || (hd.handoffAttempts || 0) < 3) return;
      if (frame.sequence > (hd.handoffExhaustedFrame || 0)) {
        hd.handoffAttempts = 0; hd.selection = null; root.dataset.wallHandoffState = 'frame-resumed'; schedulePlayback();
      }
    });
    hd.selection = selection; hd.playbackReady = false;
    if (hd.video.dataset.hdLoadedDataAt) root.dataset.wallHdLoadedDataAt = hd.video.dataset.hdLoadedDataAt;
    hd.video.hidden = false;
    if (selection?.previewReleased && !selection.handedOff) {
      hd.firstFramePending = false; hd.handingOff = true; hd.handoffPlaying = false; hd.handoffFrameTimedOut = false;
      if (hd.handoffAttemptSelection !== selection) { hd.handoffAttemptSelection = selection; hd.handoffAttempts = 0; }
      hd.handoffAttempts++;
      const preview = units[hd.index].video;
      const revision = hd.handoffRevision = (hd.handoffRevision || 0) + 1;
      const current = () => !hd.abort.signal.aborted && hd.handoffRevision === revision && focusStart === selection && focusedHd === hd && focused === hd.index && visible && !document.hidden;
      const retry = () => {
        if (!current()) return;
        hd.handingOff = false; hd.handoffPlaying = false; hd.playbackReady = false;
        hd.video.classList.remove('is-ready');
        if (hd.handoffFrameTimedOut) hd.handoffAttempts = 3;
        hd.selection = hd.handoffAttempts >= 3 ? selection : null;
        if (hd.handoffAttempts >= 3) {
          hd.handoffExhaustedEnd = Math.max(0, ...Array.from({ length: hd.video.buffered?.length || 0 }, (_, i) => hd.video.buffered.end(i)));
          hd.handoffExhaustedReady = hd.video.readyState;
          hd.handoffExhaustedFrame = hd.frames.latest?.sequence || 0;
        }
        root.dataset.wallHandoffState = hd.handoffAttempts >= 3 ? 'preview-exhausted' : 'preview';
        // Preserve the same decoder/source while more bytes arrive. There is
        // only one retry timer; leaving or changing selection invalidates it.
        clearTimeout(hd.handoffTimer);
        hd.handoffTimer = hd.handoffAttempts >= 3 ? null : setTimeout(() => {
          hd.handoffTimer = null;
          if (current()) activateHd(hd);
        }, 600);
        if (hd.handoffAttempts >= 3) scheduleHdRecovery(hd.index, hd.handoffFrameTimedOut ? 'frame-timeout' : 'handoff-exhausted');
        playback();
      };
      root.dataset.wallHandoffState = 'aligning';
      hd.stream.start().then(started => started && current() && alignWallHandoff(hd.video, preview, {
        signal: hd.abort.signal, sourceStart: sourceStart(units[hd.index]), isCurrent: current,
        requestBuffer: hd.stream.isStreaming ? target => { hd.video.currentTime = target; } : null,
        bufferLookahead: Math.max(0, (Number(hd.video.dataset.hdLoadedDataAt) - hd.loadStartedAt) / 1000) || 0,
        frameTracker: hd.frames,
        pause: () => { hd.handoffPlaying = false; playback(); },
        start: () => { hd.handoffPlaying = true; playback(); },
        onState: (phase, details) => {
          if (!current()) return;
          if (phase === 'frame-timeout') hd.handoffFrameTimedOut = true;
          if (details.frameProof) hd.handoffFrameProof = details.frameProof;
          if (details.frameTime !== undefined) hd.handoffFrameTime = details.frameTime;
          const trace = selection.handoffTrace ||= [];
          trace.push({ phase, at: Number(performance.now().toFixed(1)), preview: Number(preview.currentTime.toFixed(3)), hd: Number(hd.video.currentTime.toFixed(3)),
            previewPaused: preview.paused, hdPaused: hd.video.paused, seeking: hd.video.seeking, readyState: hd.video.readyState,
            ...(details.seekMs !== undefined ? { seekMs: Number(details.seekMs.toFixed(1)) } : {}),
            ...(details.target !== undefined ? { target: Number(details.target.toFixed(3)) } : {}),
            ...(details.bufferRequests !== undefined ? { bufferRequests: details.bufferRequests, bufferLead: Number(details.bufferLead.toFixed(3)) } : {}),
            ...(details.frameTime !== undefined ? { frameTime: details.frameTime, frameProof: details.frameProof } : {}) });
          if (trace.length > 32) trace.shift();
          root.dataset.wallHandoffTrace = JSON.stringify(trace);
          root.dataset.wallHandoffPhase = phase;
          root.dataset.wallHandoffSeekCount = String(details.seeks);
          if (details.seekMs !== undefined) root.dataset.wallHandoffSeekMs = details.seekMs.toFixed(1);
          if (details.lead !== undefined) root.dataset.wallHandoffLead = details.lead.toFixed(3);
          if (details.target !== undefined) root.dataset.wallHandoffTarget = details.target.toFixed(3);
        }
      })).then(async aligned => {
        if (!current()) return;
        if (!aligned) { retry(); return; }
        hd.playbackReady = true;
        root.dataset.wallHandoffDecodedPlayingAt = performance.now().toFixed(1);
        root.dataset.wallHandoffFrameProof = hd.handoffFrameProof || 'unknown';
        if (hd.handoffFrameTime !== undefined) root.dataset.wallHandoffFrameTime = String(hd.handoffFrameTime);
        const previewAtFade = preview.currentTime, hdAtFade = hd.video.currentTime;
        getComputedStyle(hd.video).opacity; hd.video.classList.add('is-ready');
        await waitWallVisualTransitions(hd.video, 'opacity');
        if (!current()) return;
        if (hd.video.paused || hd.video.readyState < 2 || hd.video.seeking || hd.video.error) { retry(); return; }
        const finalDrift = hd.video.currentTime - sourceStart(units[hd.index]) - preview.currentTime;
        const stationaryTakeover = Math.abs(preview.currentTime - previewAtFade) <= .03 &&
          hd.video.currentTime >= hdAtFade && Math.abs(hdAtFade - sourceStart(units[hd.index]) - previewAtFade) <= .12;
        root.dataset.wallHandoffFadeDelta = finalDrift.toFixed(3);
        // A stalled preview may legitimately stay on the frame that HD has
        // begun playing from. Otherwise a drift during the fade must realign.
        if (Math.abs(finalDrift) > .12 && !stationaryTakeover) { retry(); return; }
        selection.handedOff = true; hd.handingOff = false; hd.handoffPlaying = false; preview.hidden = true;
        root.dataset.wallHandoffState = 'hd';
        root.dataset.wallHandoffAt = performance.now().toFixed(1);
        root.dataset.wallHandoffPreviewTime = preview.currentTime.toFixed(3);
        root.dataset.wallHandoffHdTime = hd.video.currentTime.toFixed(3);
        root.dataset.wallHandoffDelta = (hd.video.currentTime - sourceStart(units[hd.index]) - preview.currentTime).toFixed(3);
        root.dataset.wallFocusedQuality = `${hd.video.videoWidth}x${hd.video.videoHeight}`;
        playback();
      }).catch(retry);
      playback(); return;
    }
    // A warm or retained decoder may still own an older surface after its
    // zero seek. Keep the exact first-frame cover until that zero PTS has been
    // submitted; if it is not ready by camera settlement, release the preview.
    const firstRevision = hd.handoffRevision = (hd.handoffRevision || 0) + 1;
    const firstCurrent = () => !hd.abort.signal.aborted && hd.handoffRevision === firstRevision && focusStart === selection && focusedHd === hd && focused === hd.index && (!selection?.previewReleased || selection.handedOff);
    hd.firstFrameVerifying = !hd.frames.supported;
    Promise.resolve(cameraTransition).then(async () => {
      if (!firstCurrent()) return;
      const target = hd.resume?.time ?? sourceStart(units[hd.index]);
      const current = () => firstCurrent() && visible && !document.hidden;
      let first = hd.frames.latest;
      if (!hd.frames.supported) {
        // Older engines still have a usable path when the tiny preview fails.
        // Start only after the camera, beneath the cover, then require actual
        // media progress and paint opportunities. This is not claimed as PTS proof.
        const playing = waitWallDecodedPlayback(hd.video, { signal: hd.abort.signal });
        hd.handingOff = hd.handoffPlaying = true; playback();
        const painted = await playing && await waitWallVisibleFallback(hd.video, { signal: hd.abort.signal, isCurrent: current });
        if (!current()) return;
        if (!painted) {
          hd.firstFrameVerifying = false; hd.handingOff = hd.handoffPlaying = false; hd.firstFramePending = true; hd.selection = null; playback(); return;
        }
        first = { mediaTime: hd.video.currentTime };
      }
      if (!first || (hd.frames.supported && (Math.abs(first.mediaTime - target) > .12 || Math.abs(hd.video.currentTime - target) > .12)) || hd.video.seeking || hd.video.readyState < 2 || hd.video.error) {
        hd.firstFramePending = true; hd.selection = null; playback(); return;
      }
      getComputedStyle(hd.video).opacity; hd.video.classList.add('is-ready');
      await waitWallVisualTransitions(hd.video, 'opacity');
      if (!firstCurrent()) return;
      if ((hd.frames.supported && hd.frames.latest?.generation !== first.generation) || hd.video.seeking || hd.video.readyState < 2 || hd.video.error) {
        hd.video.classList.remove('is-ready'); hd.firstFramePending = true; hd.selection = null; playback(); return;
      }
      root.dataset.wallHdFadeSettledAt = performance.now().toFixed(1);
      hd.firstFrameVerifying = false; hd.firstFramePending = false; hd.handingOff = hd.handoffPlaying = false; hd.playbackReady = true;
      if (selection) selection.handedOff = true;
      if (selection) { selection.released = true; clearTimeout(selection.timer); }
      camera.removeAttribute('aria-busy');
      root.dataset.wallHandoffFrameProof = hd.frames.supported ? 'submitted-first-frame-pts' : 'visible-playing-fallback';
      if (hd.frames.supported) root.dataset.wallHandoffFrameTime = String(first.mediaTime);
      root.dataset.wallFocusedQuality = `${hd.video.videoWidth}x${hd.video.videoHeight}`;
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
      // Cold clicks and warmed selections share the same HLS media URL and
      // controller. Playlists/init bytes are bundled by the stream adapter;
      // native MP4 is reserved for missing playlists, capability/fatal errors,
      // or the shared foreground startup-stall policy.
      src: unit.item.full_src, hlsSrc: unit.item.full_hls_src, startupTimeout: 2500,
      canPlay: () => !signal.aborted && visible && !document.hidden &&
        // Native MP4 cannot be bounded. Unsupported/fatal hover preparation
        // therefore waits for a real focus click instead of downloading it.
        (hd.stream?.mode !== 'native' || focused === hd.index || retiredFrames.has(hd)) &&
        (hd.preparing || hd.aligning || hd.loopSeeking || (foreground() && (!paused || (exploring && focused === hd.index))))
    });
    hdStreams.set(video, hd.stream);
    video.addEventListener('play', () => { if (foreground()) hd.stream.start(); }, { signal });
    video.addEventListener('pause', () => {
      // Paused first-frame presentation is intentional until the visual gate
      // releases. Native stop() would discard that freshly decoded MP4.
      if (!hd.preparing && !hd.aligning && !hd.loopSeeking && !(foreground() && !hd.playbackReady)) hd.stream.stop();
    }, { signal });
    video.addEventListener('loadeddata', () => { if (foreground() && hd.ready) playback(); }, { signal });
    video.addEventListener('waiting', () => { hd.starved = true; if (foreground()) schedulePlayback(); }, { signal });
    video.addEventListener('playing', () => { hd.starved = false; if (foreground()) schedulePlayback(); }, { signal });
    for (const event of ['progress', 'timeupdate', 'canplay']) video.addEventListener(event, () => {
      if (focusedHd !== hd) return;
      // Exhaustion stops polling, not recovery. Only genuinely new bytes or a
      // stronger decoder readiness state can re-arm this same retained source.
      if (hd.handoffAttempts >= 3 && hd.selection === focusStart && !focusStart?.handedOff) {
        const end = Math.max(0, ...Array.from({ length: video.buffered?.length || 0 }, (_, i) => video.buffered.end(i)));
        if (end > hd.handoffExhaustedEnd + .1 || video.readyState > hd.handoffExhaustedReady) {
          hd.handoffAttempts = 0; hd.selection = null;
          root.dataset.wallHandoffState = 'buffer-resumed';
        }
      }
      schedulePlayback();
    }, { signal });
    video.addEventListener('streamfallback', () => {
      if (focused !== hd.index) hd.abort.abort();
      else if (foreground() && hd.ready) playback();
    }, { signal });
  }
  function primeHd(index) {
    clearTimeout(hoverTimer);
    startPrefetch.prime(index);
    if (focused >= 0) {
      if (index === focused) return;
      hoveredPreview = index;
      // A fresh explicit intent can retry a failed warm; background progress
      // alone never restarts a failed optional request on every timeupdate.
      if (neighborHdIntent?.index === index && neighborHdIntent.state === 'failed') neighborHdIntent = null;
      playback(); return;
    }
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
    if (preparedHd?.index === index) {
      if (focused === index) {
        // Explicit selection promotes even a pending library/manifest request.
        // start() sets foreground intent before awaiting initialization, so its
        // first fragment cannot remain speculative or be cancelled and reloaded.
        preparedHd.stream.start().catch(() => false);
        root.dataset.wallHdPromotedAt = performance.now().toFixed(1);
      }
      return preparedHd.promise;
    }
    discardPrepared();
    const unit = units[index], video = document.createElement('video');
    const hd = { video, index, loadStartedAt: performance.now(), transport: unit.item.full_hls_src ? 'hls' : 'native', ready: false, preparing: true, aligning: false, loopSeeking: false, playbackReady: false, abort: new AbortController(), promise: null, resume }; preparedHd = hd;
    video.className = 'wall-hd'; video.muted = true; video.defaultMuted = true; video.playsInline = true; video.preload = 'auto';
    video.dataset.clipId = unit.item.id; video.setAttribute('muted', ''); video.setAttribute('playsinline', '');
    video.setAttribute('aria-hidden', 'true');
    video.addEventListener('loadeddata', () => {
      const time = performance.now().toFixed(1);
      video.dataset.hdLoadedDataAt = video.dataset.firstDataAt = time;
      if (focused === index) root.dataset.wallHdLoadedDataAt = time;
    }, { once: true, signal: hd.abort.signal });
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
    video.addEventListener('error', () => {
      if (focusedHd === hd) { clearHd(); scheduleHdRecovery(index, 'media-error'); playback(); }
    }, { once: true });
    // Only the enlarged HD source changes transport; the 40-tile camera and
    // outgoing-frame animation keep their existing geometry and lifecycle.
    hd.frames = trackWallFrames(video, { signal: hd.abort.signal });
    unit.frame.append(video); connectHdStream(hd, unit);
    hd.promise = (async () => {
      // Start the foreground budget before library initialization as well as
      // media I/O. Optional hover preparation still has no foreground timer.
      const initialized = focused === index ? await hd.stream.start() : await hd.stream.load();
      if (!initialized || hd.abort.signal.aborted) return null;
      if (!hd.stream.isStreaming && focused !== index) return null;
      if (focused !== index) {
        // Only one media fragment is speculative. Calling start()/alignHd()
        // here would fill the foreground 4–6 second buffer while still hovering.
        if (!await hd.stream.warm({ signal: hd.abort.signal })) {
          // A hover may become the explicit selection while its first segment
          // is in flight. Its optional timeout/fatal fallback must then recover
          // as foreground I/O instead of leaving this selection at preview quality.
          if (focused !== index || hd.abort.signal.aborted || !await hd.stream.start()) return null;
          if (!await waitWallHdFrame(video, { signal: hd.abort.signal, metadataOnly: true }) || !await alignHd(hd)) return null;
        } else if (!await waitWallHdFrame(video, { signal: hd.abort.signal })) return null;
      } else {
        const available = await waitWallHdFrame(video, { signal: hd.abort.signal, metadataOnly: true });
        if (!available) return null;
        const ready = resume ? await restoreWallVideo(video, resume, { signal: hd.abort.signal }) : await alignHd(hd);
        if (!ready) return null;
      }
      if (hd.abort.signal.aborted) return null;
      hd.ready = true; hd.preparing = false;
      video.dataset.hdPreparedAt = performance.now().toFixed(1);
      // A slow request may complete after the bounded preview fallback. Upgrade
      // only that still-focused tile, never a stale selection.
      if (focused === index && !focusedHd && visible && !document.hidden) activateHd(hd);
      else if (focusedHd !== hd && !retiredFrames.has(hd)) hd.stream.stop();
      return hd;
    })().catch(() => null).then(ready => {
      hd.preparing = false;
      if (!ready && preparedHd === hd) {
        const recover = focused === index && !hd.abort.signal.aborted;
        preparedHd = null; disposeHd(hd);
        if (recover) scheduleHdRecovery(index, 'prepare-failed');
      }
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
      // Missing decoded data calls for waiting, not a seek to the same time.
      // A redundant zero seek can restart HLS or trigger native full-file fallback.
      if (Math.abs(video.currentTime - time) > .12) {
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
    const header = document.createElement('span'); header.className = 'wall-prompt-header';
    const meta = document.createElement('span'); meta.className = 'wall-prompt-meta';
    const level = String(clip?.level || unit.item.level || '').trim().toLowerCase();
    const category = { id: ['id', 'In Domain'], 'in domain': ['id', 'In Domain'], l1: ['l1', 'L1 Generalization'], l2: ['l2', 'L2 Generalization'] }[level];
    if (category) {
      const badge = document.createElement('span'); badge.className = 'wall-level-badge';
      badge.dataset.level = category[0]; badge.textContent = category[1]; header.append(badge);
    }
    const label = document.createElement('span'); label.className = 'wall-prompt-label'; label.textContent = 'PROMPT'; meta.append(label);
    if (clip?.promptStatus === 'provisional') {
      const draft = document.createElement('span'); draft.className = 'wall-prompt-draft'; draft.textContent = 'Draft'; meta.append(draft);
    }
    header.append(meta); focusLabel.append(header);
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
    clearTimeout(focusStart?.timer); focusStart?.abort?.abort(); focusStart = null; camera.removeAttribute('aria-busy');
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
    startPrefetch.prime(index, { foreground: true });
    if (index === focused && preparedHd?.index !== index) discardPrepared();
    return focusCoordinator.go(index);
  }
  function prepareFocusPreview(selection) {
    const unit = units[selection.index], video = unit.video;
    unit.warmResetAbort?.abort(); unit.warmResetAbort = null;
    root.dataset.wallPreviewWarmHit = String(Boolean(unit.warmResetReady && video.readyState >= 2 && !video.seeking && Math.abs(video.currentTime) <= .05));
    if (unit.warmResetFailed) { loadQueue.setActive(false); loadQueue.retry(); }
    unit.warmResetReady = false; unit.warmResetFailed = false;
    unit.suspendedPreview = null; unit.resuming = false; unit.returning = false;
    video.addEventListener('playing', () => {
      if (focusStart !== selection || !selection.previewReleased || selection.previewFirstPlayAt) return;
      selection.previewFirstPlayAt = performance.now().toFixed(1);
      root.dataset.wallPreviewFirstPlayAt = selection.previewFirstPlayAt;
      root.dataset.wallPreviewFirstPlayTime = video.currentTime.toFixed(3);
    }, { signal: selection.abort.signal });
    restoreWallVideo(video, { time: 0, rate: 1 }, { signal: selection.abort.signal }).then(async ready => {
      if (!ready || focusStart !== selection) return;
      selection.previewReady = true;
      root.dataset.wallPreviewResetReadyAt = performance.now().toFixed(1);
      await cameraTransition;
      if (focusStart !== selection || selection.abort.signal.aborted || focused !== selection.index) return;
      selection.cameraReady = true;
      playback();
    });
  }
  function commitFocus(index, hd) {
    const previous = focused, moveKeyboardFocus = camera.contains(document.activeElement);
    cameraMoveRevision += 1;
    clearTimeout(focusStart?.timer); focusStart?.abort?.abort();
    const selection = focusStart = { index, released: false, timedOut: false, previewReleased: false, handedOff: false, abort: new AbortController() };
    root.dataset.wallFocusSelectedAt = performance.now().toFixed(1);
    root.dataset.wallFocusTargetStart = sourceStart(units[index]).toFixed(3);
    for (const key of ['wallCameraAnimationDoneAt', 'wallCameraSettledAt', 'wallHdFadeSettledAt', 'wallFocusPlaybackReleasedAt', 'wallFocusPlaybackStartTime', 'wallFocusFirstPlayAt', 'wallFocusFirstPlayTime']) delete root.dataset[key];
    for (const key of ['wallPreviewReleasedAt', 'wallPreviewStartTime', 'wallPreviewFirstPlayAt', 'wallPreviewFirstPlayTime', 'wallPreviewResetReadyAt', 'wallPreviewWarmHit', 'wallHdLoadedDataAt', 'wallHandoffState', 'wallHandoffTrace', 'wallHandoffPhase', 'wallHandoffSeekCount', 'wallHandoffSeekMs', 'wallHandoffLead', 'wallHandoffTarget', 'wallHandoffFadeDelta', 'wallHandoffPresentedAt', 'wallHandoffDecodedPlayingAt', 'wallHandoffFrameProof', 'wallHandoffFrameTime', 'wallHandoffAt', 'wallHandoffPreviewTime', 'wallHandoffHdTime', 'wallHandoffDelta', 'wallHdRecoveryState', 'wallHdRecoveryReason', 'wallHdRecoveryAttempt', 'wallHdPromotedAt']) delete root.dataset[key];
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
    hoveredPreview = -1; warmPreviewIndex = -1;
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
    prepareFocusPreview(selection);
    if (hd?.ready) {
      // A -> B -> A may reuse the decoder, but a new selection always starts
      // at the beginning rather than inheriting the retained outgoing clock.
      clearTimeout(hd.handoffTimer); hd.handoffTimer = null;
      hd.handoffRevision = (hd.handoffRevision || 0) + 1; hd.handingOff = false; hd.handoffPlaying = false;
      hd.preparing = true; hd.playbackReady = false; hd.firstFramePending = false; hd.firstFrameVerifying = hd.resumeFirstFrame = false; hd.resume = null;
      playbackController.sync(hd.video, false);
      hd.video.hidden = true; hd.video.classList.remove('is-ready');
      hd.ready = hd.playbackReady = false; hd.selection = null;
      if (preparedHd !== hd) discardPrepared();
      preparedHd = hd;
      hd.promise = alignHd(hd).catch(() => null).then(ready => {
        hd.preparing = false;
        if (ready && focusStart === selection && focused === index) activateHd(hd);
        else if (!ready && preparedHd === hd) {
          const recover = !hd.abort.signal.aborted && focusStart === selection && focused === index;
          preparedHd = null; disposeHd(hd);
          if (recover) scheduleHdRecovery(index, 'retained-prepare-failed');
        }
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
    clearTimeout(focusStart?.timer); focusStart?.abort?.abort(); focusStart = null;
    loadQueue.destroy(); startPrefetch.destroy();
    units.forEach(unit => unit.firstFrame.destroy());
    clearTimeout(revealTimer);
    frameStates.forEach(state => state.stop());
  });
  playback();
}
