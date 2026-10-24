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

// One gallery prepares its primary frame before borrowing bandwidth for any
// neighbors. An explicit target supersedes that sequence without clearing src,
// discarding buffers, or changing playback state. preload is only a hint.
export function createVideoWarmScheduler({ isProtected = () => false } = {}) {
  let revision = 0, controller = null, job = null;
  const touched = new Set();
  const relax = player => { if (!isProtected(player)) player.relax?.(); };
  function cancel() {
    revision += 1; controller?.abort(); controller = null;
    touched.forEach(relax); touched.clear(); job = null;
  }
  function start(primary, neighbors, { isCurrent = () => true, priority = false } = {}) {
    cancel();
    if (!primary) return Promise.resolve();
    const ticket = revision, abort = controller = new AbortController();
    const valid = () => ticket === revision && !abort.signal.aborted && isCurrent();
    const task = { primary, priority, promise: null };
    job = task;
    task.promise = Promise.resolve().then(async () => {
      if (!valid()) return;
      touched.add(primary); await primary.warm({ signal: abort.signal });
      // warm() has a bounded wait. Its timeout is not evidence of a decoded
      // frame, so a stalled primary must not release neighbor downloads.
      if (!valid() || primary.video.readyState < 2 || primary.video.error) return;
      for (const neighbor of neighbors) {
        if (!neighbor || neighbor === primary || !valid()) continue;
        touched.add(neighbor); await neighbor.warm({ signal: abort.signal });
        // A superseding task now owns preload decisions for this same video.
        if (!valid()) return;
        relax(neighbor); touched.delete(neighbor);
      }
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
