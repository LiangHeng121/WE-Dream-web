import { streamStartCache } from './stream-start-cache.js?v=v33';
import { streamStartRequest } from './stream-bootstrap.js?v=v33';

// Prefetch compressed startup bytes, never forty video elements. The local
// prefix files are also packaged by Sites, avoiding a second-origin round trip.
export function createWallStartPrefetch(items, {
  baseUrl = document.baseURI, cache = streamStartCache, requestFor = streamStartRequest,
  onChange = () => {},
} = {}) {
  const requests = items.map(item => {
    if (!item.full_hls_src || !item.start_src || !item.start_sha256) return null;
    const request = requestFor(new URL(item.full_hls_src, baseUrl).href);
    if (!request || request.start !== item.start_range?.start || request.end !== item.start_range?.end) return null;
    return { ...request, sourceUrl: new URL(item.start_src, baseUrl).href, sha256: item.start_sha256 };
  });
  let queued = false, destroyed = false, active = undefined, enabled = false;
  cache.setEnabled(false);
  const report = () => onChange(cache.stats());
  function select(index) {
    const request = requests[index];
    const key = request ? index : null;
    const cacheKey = request ? JSON.stringify([request.url, request.start, request.end]) : null;
    if (active === key && cache.stats().activeKey === cacheKey) return;
    active = key;
    cache.setActive(request?.url ?? null, request);
  }
  function enqueue(index, priority = 'background') {
    const request = requests[index];
    if (!request || destroyed) return;
    void cache.preload(request.url, request, {
      priority, sourceUrl: request.sourceUrl, sha256: request.sha256,
    }).then(report);
  }
  return {
    prime(index, { foreground = false } = {}) {
      if (destroyed || !enabled) return;
      if (foreground) select(index);
      enqueue(index, foreground ? 'selected' : 'background');
      report();
    },
    sync({ visible, ready, focused = -1, safe = false }) {
      if (destroyed) return;
      const next = Boolean(visible && ready);
      // Choose the protected request before resuming any speculative work.
      select(focused >= 0 && !safe ? focused : -1);
      if (enabled !== next) { enabled = next; cache.setEnabled(next); }
      if (enabled && !queued) {
        queued = true;
        if (focused >= 0) enqueue(focused, 'selected');
        requests.forEach((_request, index) => enqueue(index));
      }
      report();
    },
    destroy() { destroyed = true; cache.setEnabled(false); },
  };
}
