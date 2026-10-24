/* Some static hosts ignore Range requests. Keep normal streaming playback, but
 * use a cached complete Blob for seeking when the server exposes no seek range. */
const jobs = new WeakMap();
const buffers = new Map();

function wait(promise, signal) {
  return new Promise((resolve,reject) => {
    const finish=(error,value)=>{clearTimeout(timer);signal.removeEventListener('abort',aborted);error?reject(error):resolve(value);};
    const aborted=()=>finish(new DOMException('Aborted','AbortError'));
    const timer=setTimeout(()=>finish(new Error('Video loading timed out.')),30000);
    if(signal.aborted)return aborted();
    signal.addEventListener('abort',aborted,{once:true});
    promise.then(value=>finish(null,value),finish);
  });
}

function event(video, name, signal) {
  return new Promise((resolve, reject) => {
    const finish = error => {
      clearTimeout(timer);
      video.removeEventListener(name, ready);
      video.removeEventListener('error', failed);
      signal.removeEventListener('abort', aborted);
      error ? reject(error) : resolve();
    };
    const ready = () => finish();
    const failed = () => finish(new Error('Video could not load.'));
    const aborted = () => finish(new DOMException('Aborted', 'AbortError'));
    const timer = setTimeout(()=>finish(new Error('Video loading timed out.')),30000);
    if (signal.aborted) return aborted();
    video.addEventListener(name, ready, {once:true});
    video.addEventListener('error', failed, {once:true});
    signal.addEventListener('abort', aborted, {once:true});
  });
}

async function buffer(source) {
  if (!buffers.has(source)) {
    const entry = {};
    const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),30000);
    entry.promise = fetch(source,{signal:abort.signal}).then(response => {
      if (!response.ok) throw new Error('Video could not load.');
      return response.blob();
    }).then(blob => {
      entry.url = URL.createObjectURL(blob);
      for (const [key, value] of buffers) {
        if (buffers.size <= 24) break;
        if (key !== source && value.url && ![...document.querySelectorAll('video')].some(v => v.getAttribute('src') === value.url)) {
          URL.revokeObjectURL(value.url); buffers.delete(key);
        }
      }
      return entry.url;
    }).catch(error => { buffers.delete(source); throw error; }).finally(()=>clearTimeout(timer));
    buffers.set(source, entry);
  }
  return buffers.get(source).promise;
}

export async function seekVideo(video, seconds, {signal: parentSignal} = {}) {
  jobs.get(video)?.abort();
  const job = new AbortController(), {signal} = job;
  jobs.set(video, job);
  const abort = () => job.abort();
  parentSignal?.addEventListener('abort', abort, {once:true});
  if (parentSignal?.aborted) job.abort();
  let source = video.getAttribute('src');
  const original = source;
  let rate = video.playbackRate;
  const valid = () => !signal.aborted && video.isConnected && video.getAttribute('src') === source;
  try {
    if (!source || !valid()) return false;
    if (!video.readyState) await event(video, 'loadedmetadata', signal);
    if (!valid()) return false;
    const target = Math.max(0, Math.min(seconds, Math.max(0, video.duration - .02)));
    const canSeek = [...Array(video.seekable.length)].some((_, i) => video.seekable.end(i) > .05 && target >= video.seekable.start(i) && target <= video.seekable.end(i));
    const url = new URL(source, document.baseURI);
    if (!canSeek && url.origin === location.origin && /^https?:$/.test(url.protocol)) {
      const local = await wait(buffer(url.href),signal);
      if (!valid()) return false;
      rate = video.playbackRate;
      video.pause(); source = local; video.src = local;
      await event(video, 'loadedmetadata', signal);
      if (!valid()) return false;
      video.playbackRate = rate;
    }
    video.currentTime = target;
    if (video.seeking) await event(video, 'seeked', signal);
    return valid() && Math.abs(video.currentTime - target) < .5;
  } catch {
    if(valid() && source !== original && jobs.get(video) === job) {video.src=original;video.playbackRate=rate;}
    return false;
  } finally {
    parentSignal?.removeEventListener('abort', abort);
    if (jobs.get(video) === job) jobs.delete(video);
  }
}
