// Keep only the exact first media fragment of each wall clip. This cache shares
// bytes, not video elements/decoders, and never answers a different byte range.
export function createStreamStartCache({
  fetchImpl = (...args) => globalThis.fetch(...args),
  maxBytes = 16 * 1024 * 1024,
  concurrency = 2,
  backgroundTimeoutMs = 5000,
  selectedTimeoutMs = 8000,
  setTimeoutImpl = (...args) => globalThis.setTimeout(...args),
  clearTimeoutImpl = timer => globalThis.clearTimeout(timer),
  now = () => performance.now(),
  digestImpl = data => globalThis.crypto.subtle.digest('SHA-256', data),
} = {}) {
  const jobs = new Map();
  const running = new Set();
  let storedBytes = 0;
  let reservedBytes = 0;
  let activeKey = null;
  let sequence = 0;
  let destroyed = false;
  let enabled = true;

  function identify(url, bounds) {
    const start = bounds?.start;
    const end = bounds?.end;
    if (typeof url !== 'string' || !url || !Number.isSafeInteger(start)
        || !Number.isSafeInteger(end) || start < 0 || end <= start || end - start > maxBytes) return null;
    // Do not remove query strings or normalize paths: the fetch and the HLS
    // request must address exactly the same version of exactly the same bytes.
    return { key: JSON.stringify([url, start, end]), url, start, end, bytes: end - start };
  }

  function detachedSource(sourceUrl, sha256) {
    if (sourceUrl == null) return { sourceUrl: null, sha256: null };
    if (typeof sourceUrl !== 'string' || !sourceUrl || typeof sha256 !== 'string'
        || !/^[a-f0-9]{64}$/i.test(sha256)) return null;
    try {
      const parsed = new URL(sourceUrl, globalThis.location?.href);
      if (!['http:', 'https:'].includes(parsed.protocol)
          || (globalThis.location?.origin && parsed.origin !== globalThis.location.origin)) return null;
      return { sourceUrl: parsed.href, sha256: sha256.toLowerCase() };
    } catch { return null; }
  }

  function notify(job) {
    const progress = { loaded: job.loaded, total: job.bytes, startedAt: job.startedAt, firstByteAt: job.firstByteAt };
    for (const listener of job.listeners) {
      try { listener(progress); } catch { /* A detached consumer cannot break another player's fetch. */ }
    }
  }

  function evictFor(bytes) {
    if (storedBytes + reservedBytes + bytes <= maxBytes) return true;
    const oldest = [...jobs.values()].filter(job => job.state === 'ready' && job.key !== activeKey)
      .sort((a, b) => a.used - b.used);
    for (const job of oldest) {
      jobs.delete(job.key);
      storedBytes -= job.bytes;
      if (storedBytes + reservedBytes + bytes <= maxBytes) return true;
    }
    return false;
  }

  function cancelRun(job, requeue) {
    const run = job.run;
    if (!run) return;
    job.run = null;
    clearTimeoutImpl(run.timer);
    running.delete(job);
    reservedBytes -= job.bytes;
    run.controller.abort();
    job.state = requeue ? 'queued' : 'failed';
    job.loaded = 0;
    if (!requeue) {
      jobs.delete(job.key);
      job.resolve(null);
    }
  }

  function scheduleTimeout(job) {
    const run = job.run;
    if (!run) return;
    clearTimeoutImpl(run.timer);
    const budget = job.priority === 'selected' ? selectedTimeoutMs : backgroundTimeoutMs;
    run.timer = setTimeoutImpl(() => {
      if (job.run !== run) return;
      cancelRun(job, false);
      pump();
    }, Math.max(0, budget - (now() - job.startedAt)));
  }

  async function fetchJob(job, run) {
    try {
      const response = await fetchImpl(job.sourceUrl || job.url, {
        // The same-origin detached fragment avoids depending on an external
        // host exposing Content-Range through CORS. Its checksum proves that it
        // still answers exactly the original HLS URL and byte-range cache key.
        ...(job.sourceUrl ? {} : { headers: { Range: `bytes=${job.start}-${job.end - 1}` } }),
        signal: run.controller.signal,
        credentials: 'same-origin',
        priority: job.priority === 'selected' ? 'high' : 'low',
      });
      if (job.run !== run) {
        await response.body?.cancel?.();
        return;
      }
      const contentRange = response.headers?.get?.('Content-Range');
      const match = /^bytes (\d+)-(\d+)\/(\d+|\*)$/i.exec(contentRange || '');
      const lengthHeader = response.headers?.get?.('Content-Length');
      const exactRange = match && Number(match[1]) === job.start && Number(match[2]) === job.end - 1
        && (match[3] === '*' || Number(match[3]) >= job.end);
      if ((job.sourceUrl ? response.status !== 200 : response.status !== 206 || !exactRange)
          || (lengthHeader != null && Number(lengthHeader) !== job.bytes)) {
        // A host that ignores Range may return the whole movie. Cancel it at
        // headers instead of accidentally prefetching forty complete movies.
        await response.body?.cancel?.();
        throw new Error('Unexpected media byte range');
      }
      const data = new Uint8Array(job.bytes);
      if (response.body?.getReader) {
        const reader = response.body.getReader();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (job.run !== run) { await reader.cancel(); return; }
            if (done) break;
            if (!(value instanceof Uint8Array) || job.loaded + value.byteLength > job.bytes) {
              await reader.cancel();
              throw new Error('Media range exceeded the requested size');
            }
            if (value.byteLength && job.loaded === 0) job.firstByteAt = now();
            data.set(value, job.loaded);
            job.loaded += value.byteLength;
            notify(job);
          }
        } finally { reader.releaseLock(); }
      } else {
        // arrayBuffer() would allocate an unbounded body before we can check
        // its size. Unsupported responses should use the ordinary HLS loader.
        await response.body?.cancel?.();
        throw new Error('Media fragment requires a bounded readable body');
      }
      if (job.loaded !== job.bytes) throw new Error('Incomplete media byte range');
      if (job.run !== run) return;
      if (job.sourceUrl) {
        const hash = new Uint8Array(await digestImpl(data));
        if (job.run !== run) return;
        const actual = [...hash].map(value => value.toString(16).padStart(2, '0')).join('');
        if (actual !== job.sha256) throw new Error('Detached media fragment checksum mismatch');
      }
      job.data = data.buffer;
      job.endedAt = now();
      job.used = ++sequence;
      job.state = 'ready';
      storedBytes += job.bytes;
      job.resolve(job);
    } catch {
      if (job.run !== run) return;
      job.state = 'failed';
      jobs.delete(job.key);
      job.resolve(null);
    } finally {
      if (job.run === run) {
        job.run = null;
        clearTimeoutImpl(run.timer);
        running.delete(job);
        reservedBytes -= job.bytes;
        pump();
      }
    }
  }

  function pump() {
    if (destroyed || !enabled) return;
    const queue = [...jobs.values()].filter(job => job.state === 'queued'
      && (activeKey == null || job.key === activeKey))
      .sort((a, b) => Number(b.priority === 'selected') - Number(a.priority === 'selected') || a.order - b.order);
    for (const job of queue) {
      if (running.size >= Math.max(1, concurrency)) break;
      if (!evictFor(job.bytes)) continue;
      job.state = 'fetching';
      job.loaded = 0;
      job.startedAt = now();
      job.firstByteAt = 0;
      const run = job.run = { controller: new AbortController(), timer: null };
      running.add(job);
      reservedBytes += job.bytes;
      scheduleTimeout(job);
      void fetchJob(job, run);
    }
  }

  function promote(job) {
    activeKey = job.key;
    job.priority = 'selected';
    if (job.run) scheduleTimeout(job);
    // Acquiring a prefetched request must not wait behind the two speculative
    // downloads. Keep the same selected flight and release all other slots.
    for (const other of [...running]) {
      if (other !== job) {
        other.priority = 'background';
        cancelRun(other, true);
      }
    }
    pump();
  }

  function preload(url, bounds, { priority = 'background', sourceUrl = null, sha256 = null } = {}) {
    const identity = identify(url, bounds);
    const source = detachedSource(sourceUrl, sha256);
    if (!identity || !source || destroyed) return Promise.resolve(null);
    let job = jobs.get(identity.key);
    if (!job) {
      let resolve;
      const promise = new Promise(done => { resolve = done; });
      job = { ...identity, ...source, promise, resolve, priority, state: 'queued', run: null,
        loaded: 0, startedAt: 0, firstByteAt: 0, listeners: new Set(), consumers: new Set(), order: ++sequence, used: sequence };
      jobs.set(job.key, job);
    }
    if (priority === 'selected') promote(job);
    else pump();
    return job.promise.then(entry => entry && ({ url: entry.url, start: entry.start, end: entry.end, bytes: entry.bytes }));
  }

  function acquire(context, { signal, onProgress } = {}) {
    if (context?.responseType !== 'arraybuffer' || context?.frag?.sn === 'initSegment') return null;
    const identity = identify(context.url, { start: context.rangeStart, end: context.rangeEnd });
    const job = identity && jobs.get(identity.key);
    if (!job || destroyed) return null;
    // The cache's speculative network policy belongs to the wall. Other
    // galleries use this same HLS loader and must not wait on a paused wall
    // queue when it is offscreen. Already-verified bytes remain reusable.
    if (!enabled && job.state !== 'ready') return null;
    if (signal?.aborted) return Promise.resolve(null);
    const fromCache = job.state === 'ready';
    job.used = ++sequence;
    if (!fromCache) promote(job);
    return new Promise(resolve => {
      let finished = false;
      const listener = progress => { if (!finished) onProgress?.(progress); };
      const complete = entry => {
        if (finished) return;
        finished = true;
        job.listeners.delete(listener);
        job.consumers.delete(release);
        signal?.removeEventListener('abort', aborted);
        resolve(!destroyed && entry ? { url: entry.url, code: 206, bytes: entry.bytes, data: entry.data.slice(0), fromCache,
          loading: { start: entry.startedAt, first: entry.firstByteAt, end: entry.endedAt } } : null);
      };
      const aborted = () => complete(null);
      const release = () => complete(null);
      job.consumers.add(release);
      signal?.addEventListener('abort', aborted, { once: true });
      if (signal?.aborted) { aborted(); return; }
      if (onProgress) {
        job.listeners.add(listener);
        try { listener({ loaded: job.loaded, total: job.bytes, startedAt: job.startedAt, firstByteAt: job.firstByteAt }); }
        catch { /* Optional diagnostics must not affect delivery. */ }
      }
      job.promise.then(complete);
    });
  }

  function setActive(url = null, bounds = null) {
    activeKey = url == null ? null : identify(url, bounds)?.key ?? null;
    for (const job of jobs.values()) {
      job.priority = job.key === activeKey ? 'selected' : 'background';
      if (activeKey != null && job.key !== activeKey && job.run) cancelRun(job, true);
      else if (job.run) scheduleTimeout(job);
    }
    pump();
  }

  function setEnabled(value) {
    enabled = Boolean(value);
    if (!enabled) {
      // Retain each promise and its exact range while the page is hidden;
      // resuming never leaves an old aborted request owning a network slot.
      for (const job of [...running]) cancelRun(job, true);
      // The prefetch promise stays queued, but an attached HLS consumer must
      // be free to use its ordinary loader. Wall consumers have already been
      // aborted by suspendNetwork; visible lower galleries can continue.
      for (const job of jobs.values()) {
        if (job.state !== 'ready') for (const release of [...job.consumers]) release();
      }
    } else pump();
  }

  function destroy() {
    destroyed = true;
    for (const job of jobs.values()) {
      for (const release of [...job.consumers]) release();
      if (job.run) cancelRun(job, false);
      else if (job.state !== 'ready') job.resolve(null);
    }
    jobs.clear();
    storedBytes = 0;
    reservedBytes = 0;
  }

  return { preload, acquire, setActive, setEnabled, destroy,
    stats: () => ({ bytes: storedBytes, reservedBytes, running: running.size,
      ready: [...jobs.values()].filter(job => job.state === 'ready').length,
      queued: [...jobs.values()].filter(job => job.state === 'queued').length, activeKey, enabled }) };
}

export const streamStartCache = createStreamStartCache();
