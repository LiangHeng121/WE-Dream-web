import catalogue from './stream-bootstrap-data.js?v=v31.1';
import { streamStartCache } from './stream-start-cache.js?v=v31.1';

// Immutable playlists/init boxes are bundled. A known, exact first-fragment
// request may join the shared byte cache; all other requests/retries retain
// hls.js's original loader contract.
// https://github.com/video-dev/hls.js/blob/v1.6.19/docs/API.md#loader
const loaders = new WeakMap();

export function streamStartRequest(hlsUrl) {
  let url;
  try { url = new URL(hlsUrl); } catch { return null; }
  const match = url.pathname.match(/(?:^|\/)assets\/media\/stream1080\/([A-Za-z0-9_-]+)\/index\.m3u8$/);
  const entry = match && Object.prototype.hasOwnProperty.call(catalogue, match[1]) && catalogue[match[1]];
  if (!entry) return null;
  const lines = entry.manifest.split(/\r?\n/).map(line => line.trim());
  const first = lines.findIndex(line => line.startsWith('#EXTINF:'));
  if (first < 0) return null;
  let range = null;
  for (let i = first + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('#EXTINF:')) return null;
    if (line.startsWith('#EXT-X-BYTERANGE:')) range = /^#EXT-X-BYTERANGE:(\d+)@(\d+)$/.exec(line);
    if (!line || line.startsWith('#')) continue;
    if (!range) return null;
    const start = Number(range[2]);
    const end = start + Number(range[1]);
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end <= start) return null;
    try { return { url: new URL(line, url).href, start, end }; } catch { return null; }
  }
  return null;
}

function cachedResponse(context) {
  let path;
  try { path = new URL(context.url, 'https://bootstrap.invalid/').pathname; }
  catch { return null; }
  const match = path.match(/(?:^|\/)assets\/media\/stream1080\/([A-Za-z0-9_-]+)\/(index\.m3u8|stream\.mp4)$/);
  const entry = match && Object.prototype.hasOwnProperty.call(catalogue, match[1]) && catalogue[match[1]];
  if (!entry) return null;
  if (match[2] === 'index.m3u8' && context.responseType !== 'arraybuffer'
      && context.rangeStart == null && context.rangeEnd == null) {
    return { data: entry.manifest, bytes: entry.manifest.length, code: 200 };
  }
  // HLS rangeEnd is exclusive. Never answer even an overlapping media range
  // from this prefix, nor a full stream.mp4 request.
  if (match[2] !== entry.initFile || context.responseType !== 'arraybuffer'
      || context.rangeStart !== entry.initStart || context.rangeEnd !== entry.initEnd
      || (context.frag && context.frag.sn !== 'initSegment')) return null;
  try {
    const binary = atob(entry.init);
    if (binary.length !== entry.initEnd - entry.initStart) return null;
    // A fresh buffer may be transferred by the demux worker without detaching
    // another player's initialization data.
    const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
    return { data: bytes.buffer, bytes: bytes.byteLength, code: 206 };
  } catch { return null; }
}

export function createStreamBootstrapLoader(Hls) {
  const DefaultLoader = Hls.DefaultConfig?.loader;
  if (typeof DefaultLoader !== 'function') return null;
  if (loaders.has(DefaultLoader)) return loaders.get(DefaultLoader);
  class StreamBootstrapLoader extends DefaultLoader {
    load(context, config, callbacks) {
      // hls.js creates one loader per request. Keep mode changes safe as well
      // if an adapter reuses it: an old cached completion must never swallow
      // abort() for a subsequent real network request.
      if (this.bootstrap && !this.bootstrap.done) this.abort();
      this.bootstrap = null;
      if (this.networkPending) super.abort();
      if (this.requestWasUsed) {
        Object.assign(this.stats, { aborted: false, loaded: 0, total: 0, retry: 0, chunkCount: 0, bwEstimate: 0 });
        for (const timing of ['loading', 'parsing', 'buffering']) {
          for (const key of Object.keys(this.stats[timing])) this.stats[timing][key] = 0;
        }
      }
      this.requestWasUsed = true;
      this.context = context;
      const pending = this.bootstrap = { context, callbacks, done: false, cancelled: false, controller: new AbortController() };
      const stats = this.stats;
      stats.loading.start = performance.now();
      stats.aborted = false;
      const active = () => this.bootstrap === pending && !pending.cancelled && !pending.done;
      const delegate = () => {
        if (!active()) return;
        this.bootstrap = null;
        pending.done = true;
        this.networkPending = true;
        const delegated = { ...callbacks };
        for (const event of ['onSuccess', 'onError', 'onTimeout', 'onAbort']) {
          delegated[event] = (...args) => { this.networkPending = false; callbacks[event]?.(...args); };
        }
        // Both vendored FetchLoader and XhrLoader reject an already-started
        // stats object. Shared-cache timing belongs to its own attempted fetch;
        // the delegated request must initialize a fresh network interval.
        Object.assign(stats.loading, { start: 0, first: 0, end: 0 });
        Object.assign(stats, { aborted: false, loaded: 0, total: 0, chunkCount: 0 });
        return super.load(context, config, delegated);
      };
      const complete = response => {
        if (!active()) return;
        if (!response) { delegate(); return; }
        stats.loading.end = Math.max(performance.now(), stats.loading.start);
        if (!stats.loading.first) stats.loading.first = stats.loading.end;
        stats.loaded = stats.total = response.bytes;
        stats.chunkCount = 1;
        callbacks.onProgress?.(stats, context, response.data, null);
        if (!active()) return;
        pending.done = true;
        callbacks.onSuccess({ url: context.url, data: response.data, code: response.code }, stats, context, null);
      };
      const response = cachedResponse(context);
      if (response) {
        // Async delivery preserves stop/destroy between load and completion.
        queueMicrotask(() => complete(response));
        return;
      }
      const shared = streamStartCache.acquire(context, {
        signal: pending.controller.signal,
        onProgress: progress => {
          if (!active()) return;
          // The foreground stall watchdog reads these live byte counts. HLS's
          // demux progress callback receives the complete fragment only once.
          stats.loaded = progress.loaded;
          stats.total = progress.total;
          if (progress.loaded && !stats.loading.first) {
            stats.loading.first = Math.max(stats.loading.start, progress.firstByteAt || performance.now());
          }
        },
      });
      if (shared == null) return delegate();
      Promise.resolve(shared).then(complete, () => complete(null));
    }
    abort() {
      const pending = this.bootstrap;
      if (!pending) return super.abort();
      if (pending.done || pending.cancelled) return;
      pending.cancelled = true;
      pending.controller.abort();
      this.stats.aborted = true;
      pending.callbacks.onAbort?.(this.stats, pending.context, null);
    }
    destroy() {
      if (this.bootstrap) {
        this.bootstrap.cancelled = true;
        this.bootstrap.controller.abort();
      }
      this.bootstrap = null;
      this.networkPending = false;
      super.destroy();
    }
  }
  loaders.set(DefaultLoader, StreamBootstrapLoader);
  return StreamBootstrapLoader;
}
