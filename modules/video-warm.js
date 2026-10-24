// Wait for a decoded first frame without starting an offscreen player.
// Metadata alone does not mean the incoming card can display a video frame.
const pending = new WeakMap();

export function warmVideo(video, timeout = 1200) {
  if (video.readyState >= 2 || video.error) return;
  if (pending.has(video)) return pending.get(video);
  video.preload = 'auto';
  const ready = new Promise(resolve => {
    let timer;
    const finish = () => {
      clearTimeout(timer);
      video.removeEventListener('loadeddata', finish);
      video.removeEventListener('error', finish);
      resolve();
    };
    video.addEventListener('loadeddata', finish, { once: true });
    video.addEventListener('error', finish, { once: true });
    timer = setTimeout(finish, timeout);
    if (video.readyState >= 2 || video.error) finish();
  }).finally(() => pending.delete(video));
  pending.set(video, ready);
  return ready;
}
