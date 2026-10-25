import catalogue from './stream-bootstrap-data.js?v=v26';

// hls.js's public loader contract keeps network retries and media Range requests
// in its original loader. Only immutable playlists/init boxes are bundled here.
// https://github.com/video-dev/hls.js/blob/v1.6.19/docs/API.md#loader
const loaders = new WeakMap();

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
      const response = cachedResponse(context);
      if (!response) {
        this.networkPending = true;
        const delegated = { ...callbacks };
        for (const event of ['onSuccess', 'onError', 'onTimeout', 'onAbort']) {
          delegated[event] = (...args) => { this.networkPending = false; callbacks[event]?.(...args); };
        }
        return super.load(context, config, delegated);
      }
      this.context = context;
      const pending = this.bootstrap = { context, callbacks, done: false, cancelled: false };
      const stats = this.stats;
      stats.loading.start = performance.now();
      stats.aborted = false;
      // Async delivery preserves the original loader lifecycle: stop/destroy
      // between load() and its completion must suppress this response.
      queueMicrotask(() => {
        if (this.bootstrap !== pending || pending.cancelled) return;
        stats.loading.first = stats.loading.end = Math.max(performance.now(), stats.loading.start);
        stats.loaded = stats.total = response.bytes;
        stats.chunkCount = 1;
        callbacks.onProgress?.(stats, context, response.data, null);
        if (this.bootstrap !== pending || pending.cancelled) return;
        pending.done = true;
        callbacks.onSuccess({ url: context.url, data: response.data, code: response.code }, stats, context, null);
      });
    }
    abort() {
      const pending = this.bootstrap;
      if (!pending) return super.abort();
      if (pending.done || pending.cancelled) return;
      pending.cancelled = true;
      this.stats.aborted = true;
      pending.callbacks.onAbort?.(this.stats, pending.context, null);
    }
    destroy() {
      if (this.bootstrap) this.bootstrap.cancelled = true;
      this.bootstrap = null;
      this.networkPending = false;
      super.destroy();
    }
  }
  loaders.set(DefaultLoader, StreamBootstrapLoader);
  return StreamBootstrapLoader;
}
