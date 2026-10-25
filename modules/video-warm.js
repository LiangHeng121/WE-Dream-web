// Wait for a decoded first frame without starting an offscreen player.
// Metadata alone does not mean the incoming card can display a video frame.
export function warmVideo(video, timeout = 1200, { signal } = {}) {
  if (video.readyState >= 2 || video.error || signal?.aborted) return;
  video.preload = 'auto';
  // Each caller owns its wait. Cancelling an obsolete prefetch must not cancel
  // a newer navigation waiting on the same native video request.
  return new Promise(resolve => {
    let timer;
    const finish = () => {
      clearTimeout(timer);
      for (const event of ['loadeddata', 'canplay', 'playing']) video.removeEventListener(event, onReady);
      video.removeEventListener('error', finish);
      signal?.removeEventListener('abort', finish);
      resolve();
    };
    const onReady = () => { if (video.readyState >= 2) finish(); };
    for (const event of ['loadeddata', 'canplay', 'playing']) video.addEventListener(event, onReady);
    video.addEventListener('error', finish, { once: true });
    signal?.addEventListener('abort', finish, { once: true });
    timer = setTimeout(finish, timeout);
    if (video.readyState >= 2 || video.error || signal?.aborted) finish();
  });
}

export function videoBufferedAhead(video) {
  const at = Number(video.currentTime) || 0, ranges = video.buffered;
  if (!ranges) return 0;
  for (let i = 0; i < ranges.length; i++) {
    if (ranges.start(i) <= at + .05 && ranges.end(i) > at) return ranges.end(i) - at;
  }
  return 0;
}

export function videoFullyBuffered(video) {
  const ranges = video.buffered, duration = video.duration;
  // Require the entire clip, including its next loop. A few decoded frames or
  // canplaythrough are browser predictions, not a bandwidth budget.
  return Number.isFinite(duration) && duration > 0 && ranges?.length === 1 && ranges.start(0) <= .05 && ranges.end(0) >= duration - .1;
}

function waitForFullBuffer(video, { signal } = {}) {
  if (videoFullyBuffered(video) || video.error || signal?.aborted) return;
  return new Promise(resolve => {
    const events = ['progress', 'loadeddata', 'canplay', 'timeupdate', 'durationchange'];
    const finish = () => {
      events.forEach(event => video.removeEventListener(event, check));
      video.removeEventListener('error', finish);
      signal?.removeEventListener('abort', finish);
      resolve();
    };
    const check = () => { if (videoFullyBuffered(video) || video.error || signal?.aborted) finish(); };
    events.forEach(event => video.addEventListener(event, check));
    video.addEventListener('error', finish, { once: true });
    signal?.addEventListener('abort', finish, { once: true });
    check();
  });
}

// Speculative requests only start once the current clip is completely cached.
// Native preload="metadata" cannot cancel an existing auto download. Obsolete
// unfinished requests therefore use the player's explicit suspend operation.
export function createVideoWarmScheduler({ isProtected = () => false } = {}) {
  let revision = 0, controller = null, job = null;
  const touched = new Set(), owned = new Set();
  const relax = player => { if (!isProtected(player)) player.relax?.(); };
  function cancel(keep) {
    revision += 1; controller?.abort(); controller = null;
    owned.forEach(player => {
      if (player === keep || isProtected(player)) return;
      if (player.suspend) player.suspend(); else player.relax?.();
      owned.delete(player);
    });
    touched.clear(); job = null;
  }
  function start(primary, neighbors, { isCurrent = () => true, priority = false } = {}) {
    const next = neighbors.filter(player => player && player !== primary).slice(0, 1);
    if (!priority && job && !job.priority && job.primary === primary && job.neighbor === next[0]) return job.promise;
    cancel(primary);
    if (!primary) return Promise.resolve();
    const ticket = revision, abort = controller = new AbortController();
    const valid = () => ticket === revision && !abort.signal.aborted && isCurrent();
    const task = { primary, neighbor: next[0], priority, promise: null };
    job = task;
    task.promise = Promise.resolve().then(async () => {
      if (!valid()) return;
      touched.add(primary); owned.add(primary); await primary.warm({ signal: abort.signal });
      if (!valid() || primary.video.readyState < 2 || primary.video.error || !next.length) return;
      await waitForFullBuffer(primary.video, { signal: abort.signal });
      if (!valid() || !videoFullyBuffered(primary.video)) return;
      const neighbor = next[0];
      touched.add(neighbor); owned.add(neighbor); await neighbor.warm({ signal: abort.signal });
      if (!valid()) return;
      // Own this one background request until it finishes, so navigation can
      // actually cancel it; never release two concurrent speculative streams.
      await waitForFullBuffer(neighbor.video, { signal: abort.signal });
      if (!valid()) return;
      relax(neighbor); touched.delete(neighbor); owned.delete(neighbor);
    }).finally(() => {
      if (ticket !== revision) return;
      touched.forEach(relax); touched.clear(); controller = null; job = null;
    });
    return task.promise;
  }
  return {
    sequence(primary, neighbors = [], options) { return start(primary, neighbors, options); },
    prioritize(primary, options = {}) {
      if (job?.priority && job.primary === primary) return job.promise;
      return start(primary, [], { ...options, priority: true });
    },
    cancel,
    isPreparing(player) { return touched.has(player) || job?.primary === player; },
    get generation() { return revision; },
    get priorityPlayer() { return job?.priority ? job.primary : null; },
    get pending() { return job?.promise; }
  };
}

// Event-based diagnostics for complete playback, not just the first frame.
// Enabled only by ?mediaDebug=1; no animation-frame loop or network probe.
export function monitorVideoPlayback(video, { enabled = false, isWanted = () => true, now = () => performance.now() } = {}) {
  if (!enabled) return { requestPlay() {}, requestSeek() {} };
  const stats = { playRequests: 0, firstPlayingMs: null, waitingCount: 0, waitingMs: 0, stalledCount: 0, playedSeconds: 0, loops: 0 };
  let requestedAt = null, waitingAt = null, lastTime = null, lastSnapshot = -Infinity, state = 'idle', explicitSeek = false;
  const closeWait = () => { if (waitingAt !== null) { stats.waitingMs += now() - waitingAt; waitingAt = null; } };
  function snapshot() {
    const quality = video.getVideoPlaybackQuality?.();
    video.dataset.playbackState = state;
    video.dataset.playbackStats = JSON.stringify({ ...stats,
      waitingMs: Math.round(stats.waitingMs + (waitingAt === null ? 0 : now() - waitingAt)),
      playedSeconds: Number(stats.playedSeconds.toFixed(2)), currentTime: Number((video.currentTime || 0).toFixed(2)),
      duration: Number.isFinite(video.duration) ? video.duration : null,
      bufferedAhead: Number(videoBufferedAhead(video).toFixed(2)), fullyBuffered: videoFullyBuffered(video),
      readyState: video.readyState, networkState: video.networkState,
      droppedFrames: quality?.droppedVideoFrames ?? null, totalFrames: quality?.totalVideoFrames ?? null
    });
    lastSnapshot = now();
  }
  video.addEventListener('playing', () => {
    if (!isWanted()) return;
    closeWait(); state = 'playing'; lastTime = video.currentTime;
    if (stats.firstPlayingMs === null && requestedAt !== null) stats.firstPlayingMs = Math.round(now() - requestedAt);
    snapshot();
  });
  video.addEventListener('waiting', () => {
    if (!isWanted() || video.seeking) return;
    if (waitingAt === null && stats.firstPlayingMs !== null) { waitingAt = now(); stats.waitingCount++; }
    state = stats.firstPlayingMs === null ? 'loading' : 'buffering'; snapshot();
  });
  video.addEventListener('stalled', () => { if (isWanted()) { stats.stalledCount++; snapshot(); } });
  video.addEventListener('pause', () => { closeWait(); state = 'paused'; lastTime = null; snapshot(); });
  video.addEventListener('seeking', () => {
    // Native loop wraps emit seeking before the next timeupdate/playing. Count
    // that end-to-start transition before resetting the sampled media time.
    if (!explicitSeek && video.loop && isWanted() && !video.paused && Number.isFinite(video.duration) && lastTime !== null && lastTime >= video.duration - .75 && video.currentTime < .1) stats.loops++;
    explicitSeek = false; closeWait(); lastTime = null;
  });
  video.addEventListener('error', () => { closeWait(); state = 'error'; snapshot(); });
  video.addEventListener('timeupdate', () => {
    const at = video.currentTime;
    if (!video.paused && !video.seeking && isWanted()) {
      if (lastTime !== null) {
        const delta = at - lastTime;
        if (delta >= 0 && delta < 2) stats.playedSeconds += delta;
        else if (delta < -1 && Number.isFinite(video.duration) && lastTime > video.duration - 2) stats.loops++;
      }
      lastTime = at;
    }
    if (now() - lastSnapshot >= 1000) snapshot();
  });
  for (const event of ['progress', 'loadedmetadata', 'suspend', 'emptied']) video.addEventListener(event, () => { if (now() - lastSnapshot >= 1000) snapshot(); });
  return { requestPlay() { stats.playRequests++; if (requestedAt === null) requestedAt = now(); if (video.readyState < 3) state = 'loading'; snapshot(); }, requestSeek() { explicitSeek = true; lastTime = null; } };
}
