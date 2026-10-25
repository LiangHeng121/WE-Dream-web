// hls.js owns demuxing, MediaSource and its rolling buffer. This adapter only
// owns request intent: one-fragment speculation versus foreground playback.
// API: https://github.com/video-dev/hls.js/blob/v1.6.19/docs/API.md
import { createStreamBootstrapLoader } from './stream-bootstrap.js?v=v36';

let libraryPromise;
const loadLibrary = () => libraryPromise ||= import('../vendor/hls.js/hls.light.mjs');
const PLAY_BUFFER = { maxBufferLength: 4, maxMaxBufferLength: 6, maxBufferSize: 1000000 };
const position = video => Number.isFinite(video.currentTime) ? video.currentTime : 0;
function bufferedAt(video, time = position(video)) {
  for (let i = 0; i < (video.buffered?.length || 0); i++) {
    // Copied H.264 B-frames can place the first presented sample at +83ms.
    // Tolerate that initial timestamp only, never gaps later in the timeline.
    const initialOffset = i === 0 && time <= .15 && video.buffered.start(i) <= .15;
    if ((video.buffered.start(i) <= time + .05 || initialOffset) && video.buffered.end(i) > time + .05) return true;
  }
  return false;
}
function complete(video) {
  return Number.isFinite(video.duration) && video.duration > 0 && video.buffered?.length === 1 && video.buffered.start(0) <= .05 && video.buffered.end(0) >= video.duration - .1;
}

/**
 * load(): initialize the HLS manifest, without fetching media fragments.
 * warm({signal}): append one fragment, then stop I/O; resolves true/false.
 * start(): enable a rolling 4–6s buffer. Never calls video.play().
 * stop(): abort I/O, retaining HLS buffers. Never calls video.pause().
 * destroy(): release this controller and its source.
 *
 * Native fallback intentionally has no speculative download: warm returns
 * false; only start assigns the original MP4. On fallback the owner should
 * retry its guarded video.play() on loadeddata or the streamfallback event.
 * startupTimeout optionally checks foreground startup for stalled media I/O.
 * Growing media bytes get 1.5s progress windows, up to 8s before decoded data;
 * speculation never starts that budget. Zero preserves the default policy.
 * loadHls is an injectable loader for deterministic lifecycle tests.
 */
export function createStreamVideo(video, { src, hlsSrc, canPlay = () => true, loadHls = loadLibrary, warmTimeout = 12000, startupTimeout = 0 } = {}) {
  let destroyed = false, requested = false, intent = 'idle', mode = hlsSrc ? 'pending' : 'native';
  let state = 'idle', reason = hlsSrc ? '' : 'no-playlist', hls = null, initializing = null;
  let manifestReady = false, loading = false, nativeResume = null;
  let startupTimer = null, startupBegan = 0, startupProgress = null, firstDecoded = false;
  const waiters = new Set(), initializationWaiters = new Set(), events = new AbortController();
  function status(next) {
    state = next;
    video.dataset.streamMode = mode;
    video.dataset.streamState = state;
    video.dataset.streamFallback = reason;
  }
  function settleWarm(ready) { for (const waiter of [...waiters]) waiter.finish(ready); }
  function cancelStartup() { clearTimeout(startupTimer); startupTimer = null; startupProgress = null; }
  function settleInitialization(ready) { for (const finish of [...initializationWaiters]) finish(ready); }
  function awaitInitialization(promise) {
    if (!(startupTimeout > 0)) return promise;
    // An optional startup fallback must unblock the owner even when the shared
    // library import never settles. A late import cannot recreate the old HLS.
    return new Promise(resolve => {
      const finish = ready => { if (initializationWaiters.delete(finish)) resolve(ready); };
      initializationWaiters.add(finish); promise.then(finish, () => finish(false));
    });
  }
  function beginStartup() {
    if (video.readyState >= 2) firstDecoded = true;
    if (!(startupTimeout > 0) || firstDecoded || mode === 'native' || startupTimer !== null) return;
    const mediaProgress = () => {
      // The public in-flight fragment exposes the loader's live stats, including
      // XHR byte progress before FRAG_LOADED. Metadata/init bytes do not count.
      // Custom loaders without these stats retain the initial bounded fallback.
      try {
        const frag = hls?.inFlightFragments?.main?.frag, stats = frag?.stats;
        return frag && frag.sn !== 'initSegment' && Number.isFinite(stats?.loaded)
          ? { stats, loaded: stats.loaded } : null;
      } catch { return null; }
    };
    startupBegan = performance.now(); startupProgress = mediaProgress();
    const deadline = Math.max(startupTimeout, 8000);
    const check = () => {
      startupTimer = null;
      if (destroyed || !requested || intent !== 'playing' || !canPlay() || firstDecoded || video.readyState >= 2) return;
      const progress = mediaProgress(), elapsed = performance.now() - startupBegan;
      const growing = progress?.loaded > 0 && (progress.stats !== startupProgress?.stats || progress.loaded > startupProgress.loaded);
      startupProgress = progress;
      if (growing && elapsed < deadline) {
        startupTimer = setTimeout(check, Math.min(1500, deadline - elapsed)); return;
      }
      fallback('startup-timeout');
    };
    startupTimer = setTimeout(check, startupTimeout);
  }
  function releaseHls() {
    const old = hls; hls = null; manifestReady = false; loading = false;
    if (old) { old.stopLoad(); old.destroy(); }
  }
  function nativeStart() {
    if (destroyed || intent !== 'playing' || !canPlay()) return false;
    if (video.getAttribute('src') !== src) { video.preload = 'auto'; video.src = src; }
    else video.preload = 'auto';
    status('native-loading');
    return true;
  }
  function fallback(why) {
    if (destroyed || mode === 'native') return;
    cancelStartup();
    nativeResume = { time: position(video), rate: video.playbackRate || 1 };
    releaseHls(); mode = 'native'; reason = why;
    settleWarm(false);
    status('native-idle');
    if (intent === 'playing' && canPlay()) nativeStart();
    settleInitialization(true);
    const event = new Event('streamfallback');
    Object.defineProperty(event, 'detail', { value: { reason, src } });
    video.dispatchEvent(event);
  }
  function drive({ seek = false } = {}) {
    if (destroyed || !requested) return;
    if (mode === 'native') { if (intent === 'playing') nativeStart(); return; }
    if (!hls || !manifestReady || intent === 'idle') return;
    if (intent === 'playing' && !canPlay()) { hls.stopLoad(); loading = false; status('stopped'); return; }
    const warming = intent === 'warming';
    // A tiny speculative target prevents hls.js's internal FRAG_BUFFERED
    // handler from scheduling fragment two before our listener can stopLoad.
    Object.assign(hls.config, warming ? { ...PLAY_BUFFER, maxBufferLength: .05, maxMaxBufferLength: .05 } : PLAY_BUFFER);
    if (!loading || seek) {
      loading = true;
      hls.startLoad(position(video));
    }
    status(warming ? 'warming' : 'streaming');
  }
  async function ensure() {
    if (destroyed || !requested) return false;
    if (mode === 'native') return true;
    if (hls) return true;
    if (initializing) return awaitInitialization(initializing);
    initializing = (async () => {
      try {
        const module = await loadHls(), Hls = module.default || module;
        if (destroyed || !requested) return false;
        if (mode === 'native') return true;
        if (!Hls.isSupported()) { fallback('mse-unsupported'); return true; }
        const bootstrapLoader = createStreamBootstrapLoader(Hls);
        const instance = new Hls({ ...PLAY_BUFFER, autoStartLoad: false, backBufferLength: 6, lowLatencyMode: false, startLevel: 0, capLevelToPlayerSize: false, testBandwidth: false, ...(bootstrapLoader ? { loader: bootstrapLoader } : {}) });
        hls = instance; mode = 'hls'; status('loading-manifest');
        const current = () => !destroyed && hls === instance;
        instance.on(Hls.Events.MANIFEST_PARSED, () => {
          if (!current()) return;
          manifestReady = true; status('ready'); drive();
        });
        instance.on(Hls.Events.FRAG_BUFFERED, (_event, data) => {
          if (!current() || data?.frag?.sn === 'initSegment') return;
          if (intent === 'playing') { settleWarm(true); return; }
          if (intent !== 'warming') return;
          // A media fragment is now appended, not merely downloaded. Stopping
          // retains its SourceBuffer, including rapid A -> B -> A navigation.
          instance.stopLoad(); loading = false; intent = 'idle';
          status('warmed'); settleWarm(true);
        });
        if (Hls.Events.FRAG_LOADED) instance.on(Hls.Events.FRAG_LOADED, (_event, data) => {
          if (!current() || data?.frag?.sn !== 0 || !new URLSearchParams(location.search).has('mediaDebug')) return;
          video.dataset.streamStartupCache = data.frag.stats?.startupCache || 'miss';
          video.dataset.streamStartupRequest = data.frag.url;
        });
        instance.on(Hls.Events.ERROR, (_event, data) => {
          if (current() && data?.error && new URLSearchParams(location.search).has('mediaDebug')) {
            video.dataset.streamError = String(data.error.stack || data.error.message || data.error).slice(0, 1800);
          }
          if (!current() || !data?.fatal) return;
          fallback(`hls-${data.type || 'error'}:${data.details || 'fatal'}`);
        });
        instance.attachMedia(video);
        instance.loadSource(hlsSrc);
        return true;
      } catch {
        if (!destroyed && requested) fallback('library-unavailable');
        return !destroyed && requested && mode === 'native';
      }
    })().finally(() => { initializing = null; });
    return awaitInitialization(initializing);
  }
  async function load() {
    if (destroyed) return false;
    requested = true;
    return ensure();
  }
  function warm({ signal } = {}) {
    if (destroyed || signal?.aborted || mode === 'native') return Promise.resolve(false);
    if (bufferedAt(video)) return Promise.resolve(true);
    requested = true;
    if (intent !== 'playing') intent = 'warming';
    let waiter;
    const result = new Promise(resolve => {
      waiter = { finish(ready) {
        if (!waiters.delete(waiter)) return;
        clearTimeout(timer); signal?.removeEventListener('abort', aborted); resolve(ready);
      } };
      const aborted = () => {
        waiter.finish(false);
        if (!waiters.size && intent === 'warming') stop();
      };
      const timer = setTimeout(aborted, warmTimeout);
      waiters.add(waiter); signal?.addEventListener('abort', aborted, { once: true });
      if (signal?.aborted) aborted();
    });
    ensure().then(ready => {
      // This initialization may have been stopped and superseded. It owns
      // only this caller's wait, never a later warm request on the same video.
      if (!ready || mode === 'native') waiter.finish(false);
      else drive();
    });
    return result;
  }
  async function start() {
    if (destroyed || !canPlay()) return false;
    requested = true; intent = 'playing';
    beginStartup();
    const ready = await ensure();
    if (!ready || destroyed || !requested || intent !== 'playing' || !canPlay()) return false;
    drive(); return true;
  }
  function stop() {
    requested = false; intent = 'idle';
    cancelStartup(); settleInitialization(false);
    settleWarm(false);
    if (hls) {
      hls.stopLoad(); loading = false;
      // stopLoad can abort the initial manifest itself. No buffer exists yet;
      // recreate that unparsed instance on resume so it cannot remain stuck.
      if (!manifestReady) releaseHls();
    } else if (mode === 'native' && video.getAttribute('src') === src && !complete(video)) {
      nativeResume = { time: position(video), rate: video.playbackRate || 1 };
      video.removeAttribute('src'); video.preload = 'none'; video.load();
    }
    if (!destroyed) status('stopped');
  }
  video.addEventListener('seeking', () => {
    if (destroyed || intent !== 'playing' || !canPlay()) return;
    // Covers manual seeks and native loop wrap after old fragments are evicted.
    drive({ seek: true });
  }, { signal: events.signal });
  video.addEventListener('loadedmetadata', () => {
    if (destroyed || mode !== 'native' || !nativeResume) return;
    const saved = nativeResume; nativeResume = null;
    video.playbackRate = saved.rate;
    if (saved.time > 0) video.currentTime = Math.max(0, Math.min(saved.time, video.duration - .05));
  }, { signal: events.signal });
  video.addEventListener('loadeddata', () => {
    if (video.readyState >= 2) { firstDecoded = true; cancelStartup(); }
    if (mode === 'native' && !destroyed) status(intent === 'playing' ? 'native-ready' : 'stopped');
  }, { signal: events.signal });
  status('idle');
  return {
    load, warm, start, stop,
    destroy() {
      if (destroyed) return;
      stop(); destroyed = true; events.abort(); releaseHls();
      if (video.getAttribute('src')) { video.removeAttribute('src'); video.load(); }
      status('destroyed');
    },
    get isStreaming() { return mode === 'hls'; },
    get state() { return state; },
    get mode() { return mode; }
  };
}
