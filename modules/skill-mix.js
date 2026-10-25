// Loose overlapping cards show the reviewed skill excerpts. Full task demos
// stay in the main gallery; every card retains its original skill provenance.
import { videoFullyBuffered } from './video-warm.js?v=18';

let skillMixSerial = 0;
const clock = seconds => `${Math.floor((seconds || 0) / 60)}:${String(Math.floor((seconds || 0) % 60)).padStart(2, '0')}`;

// Recheck intent after a late play promise AND on browser playback events.
// Each media-readiness event may retry; no background retry loop is created.
export function createSkillPlayback(video, wanted, changed = () => {}) {
  let pending = false, destroyed = false, abortRetried = false;
  const abort = new AbortController(), { signal } = abort;
  const allowed = () => !destroyed && video.isConnected && wanted();
  function sync() {
    if (!allowed()) { abortRetried = false; video.pause(); changed(); return; }
    if (pending || !video.paused) { changed(); return; }
    pending = true;
    let attempt;
    try { attempt = video.play(); } catch (error) { attempt = Promise.reject(error); }
    let interrupted = false;
    Promise.resolve(attempt).then(() => { if (!allowed()) video.pause(); }, error => { interrupted = error?.name === 'AbortError'; }).finally(() => {
      pending = false; changed();
      // A fast leave/re-enter can abort the old request after the new intent is
      // already active. Recover once; autoplay denial never creates a loop.
      if (interrupted && !abortRetried && allowed()) { abortRetried = true; sync(); }
    });
    changed();
  }
  for (const event of ['play', 'playing']) video.addEventListener(event, () => { if (!allowed()) video.pause(); changed(); }, { signal });
  for (const event of ['pause', 'waiting', 'error']) video.addEventListener(event, changed, { signal });
  for (const event of ['loadeddata', 'canplay']) video.addEventListener(event, sync, { signal });
  return { sync, destroy() { destroyed = true; abort.abort(); video.pause(); } };
}

// Visibility owns network suspension separately from play/pause or hover intent.
// A partially downloaded offscreen excerpt should not compete with the main demo.
export function createSkillMediaVisibility(video, source) {
  const abort = new AbortController(), { signal } = abort;
  let resumeAt = 0, resumeRate = 1, restorePending = false;
  function restore() {
    if (signal.aborted || !restorePending || !video.getAttribute('src') || video.readyState < 1) return;
    try {
      video.currentTime = Number.isFinite(video.duration) ? Math.min(resumeAt, video.duration) : resumeAt;
      video.playbackRate = resumeRate;
      restorePending = false;
    } catch { /* Retry when decoded data makes the saved position seekable. */ }
  }
  video.addEventListener('loadedmetadata', restore, { signal });
  video.addEventListener('loadeddata', restore, { signal });
  return {
    sync(onScreen, selected) {
      if (signal.aborted) return;
      if (!onScreen) {
        video.pause();
        if (!video.getAttribute('src') || videoFullyBuffered(video)) return;
        // Repeated leave/enter before metadata arrives must not overwrite the
        // saved position with load()'s temporary zero time or default rate.
        if (!restorePending) {
          resumeAt = Number.isFinite(video.currentTime) ? video.currentTime : 0;
          resumeRate = video.playbackRate;
        }
        restorePending = true;
        video.preload = 'none'; video.removeAttribute('src'); video.load();
      } else if (selected && !video.getAttribute('src')) {
        video.preload = 'metadata'; video.src = source;
        restore();
      }
    },
    destroy() { abort.abort(); }
  };
}

export function createSkillMix(root, chapter, media) {
  const abort = new AbortController(), { signal } = abort, reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const skills = [...new Map(chapter.stages.flatMap(stage => stage.skills).map(skill => [skill.key, skill])).values()];
  const prefix = `skill-mix-${++skillMixSerial}`, floatingMode = matchMedia('(min-width: 761px) and (hover: hover) and (pointer: fine)');
  let active = skills.length - 1, expanded = false, visible = false, userPaused = false, manualPlay = false, swipe = null, suppressClickUntil = 0;
  root.classList.add('skill-mix'); root.style.setProperty('--skill-count', skills.length); root.dataset.floatingMode = String(floatingMode.matches);
  root.innerHTML = '<div class="skill-mix-heading"><span class="caption-label">LEARNED SKILLS</span><span class="skill-position"></span></div><div class="skill-stack" role="group" aria-label="Overlapping learned skill videos"></div><div class="skill-float" hidden></div><p class="skill-announcement" aria-live="polite"></p>';
  const stack = root.querySelector('.skill-stack'), floating = root.querySelector('.skill-float');
  let layoutFrame = 0, revealAnimation = null;
  function inViewport() { const rect = records[active].frame.getBoundingClientRect(); return rect.bottom > 0 && rect.top < innerHeight && rect.right > 0 && rect.left < innerWidth; }
  function allowed(index) { return !signal.aborted && index === active && visible && !document.hidden && !userPaused && (!reduced.matches || manualPlay); }
  function enlarged() { return floatingMode.matches && expanded; }
  function wanted(index) { return allowed(index) && !enlarged(); }
  function wantedLarge(index) { return allowed(index) && enlarged(); }
  const records = skills.map((skill, index) => {
    const excerpt = media.clips[skill.key];
    if (!excerpt) throw new Error(`Missing reviewed skill excerpt: ${skill.key}`);
    const [label, source] = skill.label.split(' · from ');
    const sourceTask = source ? source.charAt(0).toUpperCase() + source.slice(1) : 'Learned task';
    const card = document.createElement('article'); card.className = 'skill-card'; card.id = `${prefix}-card-${index}`;
    card.style.setProperty('--card-index', index);
    card.style.setProperty('--card-tilt', `${(skills.length === 2 ? [-7, 6] : [-8, 7, -5])[index]}deg`);
    card.style.setProperty('--card-x', `${(skills.length === 2 ? [-13, 17] : [-15, 22, -10])[index]}px`);
    card.style.setProperty('--card-z', skills.length - index);
    card.dataset.skill = skill.key; card.dataset.sourceClipId = excerpt.clip_id;
    card.innerHTML = '<div class="skill-card-frame"><span class="skill-card-badge" aria-hidden="true"></span><div class="skill-preview-controls"><button type="button" class="skill-play" aria-label="Pause skill preview">Ⅱ</button><span class="skill-time"></span><progress class="skill-progress" max="1" value="0" aria-hidden="true"></progress></div><p class="skill-error" hidden>Preview unavailable. Select another skill.</p></div><button type="button" class="skill-card-select"><span class="skill-name"></span><span class="skill-card-arrow" aria-hidden="true">↗</span></button>';
    const frame = card.querySelector('.skill-card-frame'), button = card.querySelector('.skill-card-select'), play = card.querySelector('.skill-play');
    button.id = `${prefix}-choice-${index}`;
    button.setAttribute('aria-controls', card.id); button.setAttribute('aria-label', `${label}${source ? `, from ${source}` : ''}`);
    card.querySelector('.skill-card-badge').textContent = sourceTask;
    card.querySelector('.skill-name').textContent = label;
    const video = document.createElement('video'); video.muted = true; video.defaultMuted = true; video.playsInline = true; video.loop = true; video.preload = 'none'; video.poster = excerpt.poster; video.draggable = false;
    video.setAttribute('muted', ''); video.setAttribute('playsinline', ''); video.setAttribute('aria-label', `Skill excerpt: ${label}`); video.dataset.skill = skill.key;
    frame.prepend(video); stack.append(card);
    const largeCard = document.createElement('div'); largeCard.className = 'skill-large-card'; largeCard.hidden = true;
    largeCard.innerHTML = '<div class="skill-large-frame"><span class="skill-card-badge" aria-hidden="true"></span><div class="skill-preview-controls"><button type="button" class="skill-play" aria-label="Pause skill preview">Ⅱ</button><span class="skill-time"></span><progress class="skill-progress" max="1" value="0" aria-hidden="true"></progress></div><p class="skill-error" hidden>Preview unavailable.</p></div><div class="skill-large-caption"><span class="skill-name"></span></div>';
    largeCard.querySelector('.skill-card-badge').textContent = sourceTask;
    largeCard.querySelector('.skill-name').textContent = label;
    const largeVideo = video.cloneNode(false), largePlay = largeCard.querySelector('.skill-play');
    largeVideo.muted = true; largeVideo.defaultMuted = true; largeVideo.preload = 'none'; largeVideo.setAttribute('aria-label', `Enlarged skill excerpt: ${label}`);
    largeCard.querySelector('.skill-large-frame').prepend(largeVideo); floating.append(largeCard);
    const mediaVisibility = createSkillMediaVisibility(video, excerpt.src), largeMediaVisibility = createSkillMediaVisibility(largeVideo, excerpt.src);
    const record = { skill, excerpt, label, source, card, frame, video, button, play, largeCard, largeVideo, largePlay, mediaVisibility, largeMediaVisibility, controller: null, largeController: null };
    record.controller = createSkillPlayback(video, () => wanted(index), () => { if (!signal.aborted && active === index) updateControls(); });
    record.largeController = createSkillPlayback(largeVideo, () => wantedLarge(index), () => { if (!signal.aborted && active === index) updateControls(); });
    card.addEventListener('pointerenter', event => { if (event.pointerType === 'mouse' && floatingMode.matches) select(index); }, { signal });
    card.addEventListener('click', event => { if (performance.now() >= suppressClickUntil && !event.target.closest('.skill-play')) select(index); }, { signal });
    button.addEventListener('focus', () => select(index), { signal });
    play.addEventListener('click', event => { event.stopPropagation(); toggle(); }, { signal });
    largePlay.addEventListener('click', toggle, { signal });
    largeVideo.addEventListener('click', toggle, { signal });
    largeVideo.addEventListener('timeupdate', () => { if (active === index) updateControls(); }, { signal });
    largeVideo.addEventListener('loadedmetadata', () => { if (active === index) updateControls(); }, { signal });
    video.addEventListener('timeupdate', () => { if (active === index) updateControls(); }, { signal });
    video.addEventListener('loadedmetadata', () => { if (active === index) updateControls(); }, { signal });
    return record;
  });
  function updateControls() {
    if (signal.aborted || !records.length) return;
    const record = records[active], playing = allowed(active);
    for (const [surface, video, play] of [[record.card, record.video, record.play], [record.largeCard, record.largeVideo, record.largePlay]]) {
      play.textContent = playing ? 'Ⅱ' : '▶'; play.setAttribute('aria-label', playing ? 'Pause skill preview' : 'Play skill preview');
      surface.querySelector('.skill-time').textContent = `${clock(video.currentTime)} / ${clock(Number.isFinite(video.duration) ? video.duration : record.excerpt.duration)}`;
      surface.querySelector('.skill-progress').value = Number.isFinite(video.duration) && video.duration > 0 ? video.currentTime / video.duration : 0;
      surface.querySelector('.skill-error').hidden = !video.error;
    }
    const video = enlarged() ? record.largeVideo : record.video;
    root.dataset.playback = video.error ? 'error' : playing ? video.paused ? 'loading' : 'playing' : userPaused ? 'user-paused' : document.hidden ? 'background' : !visible ? 'offscreen' : 'reduced-motion';
  }
  function update() {
    if (signal.aborted) return;
    const showLarge = enlarged(); floating.hidden = !showLarge;
    records.forEach(({ largeCard, controller, largeController, mediaVisibility, largeMediaVisibility }, index) => {
      largeCard.hidden = !(showLarge && index === active);
      const onScreen = visible && !document.hidden;
      mediaVisibility.sync(onScreen, index === active && !showLarge);
      largeMediaVisibility.sync(onScreen, index === active && showLarge);
      controller.sync(); largeController.sync();
    });
    if (showLarge) positionFloating();
    updateControls();
  }
  function positionFloating() {
    if (!enlarged() || signal.aborted) return;
    const rootBox = root.getBoundingClientRect(), cardBox = records[active].card.getBoundingClientRect();
    const sectionBox = root.closest('.gallery-section')?.getBoundingClientRect();
    const minTop = Math.max(12, (sectionBox?.top || -Infinity) + 4), maxBottom = Math.min(innerHeight - 12, (sectionBox?.bottom || Infinity) - 4);
    const availableHeight = maxBottom - minTop;
    if (availableHeight <= 180) { collapse(); return; }
    let width = Math.min(records[active].card.offsetWidth * 1.75, innerWidth - 32);
    floating.style.width = `${width}px`;
    // Use layout height, not the temporary zoom animation's transformed bounds.
    let height = floating.offsetHeight;
    // Cap both viewport and section bounds: the gallery section clips overflow.
    if (height > availableHeight) {
      width = Math.min(width, (availableHeight - 61) * 16 / 9);
      floating.style.width = `${width}px`; height = floating.offsetHeight;
    }
    const right = rootBox.left + Math.min(108, rootBox.width * .34);
    const left = Math.max(16, Math.min(right - width, innerWidth - width - 16));
    const top = Math.max(minTop, Math.min(cardBox.top + cardBox.height / 2 - height / 2, maxBottom - height));
    floating.style.left = `${left - rootBox.left}px`; floating.style.top = `${top - rootBox.top}px`;
    root.dataset.previewWidth = width.toFixed(1); root.dataset.previewRatio = (width / records[active].card.offsetWidth).toFixed(2);
  }
  function schedulePosition() {
    if (!enlarged() || layoutFrame) return;
    layoutFrame = requestAnimationFrame(() => { layoutFrame = 0; positionFloating(); });
  }
  function collapse() { if (expanded && !signal.aborted) select(active, false, false); }

  function select(index, focus = false, expand = true) {
    if (signal.aborted || !records[index]) return;
    const previous = active, wasExpanded = expanded;
    active = index; expanded = expand;
    const record = records[index];
    root.dataset.activeSkill = record.skill.key; root.dataset.expanded = String(expanded); root.dataset.sourceClipId = record.excerpt.clip_id;
    root.dataset.sourceStart = String(record.excerpt.source_start); root.dataset.sourceEnd = String(record.excerpt.source_end);
    root.querySelector('.skill-position').textContent = `${String(index + 1).padStart(2, '0')} / ${String(records.length).padStart(2, '0')}`;
    root.querySelector('.skill-announcement').textContent = `${record.label}${record.source ? `, from ${record.source}` : ''}`;
    records.forEach(({ card, button, play, video }, i) => {
      card.dataset.active = String(i === index); card.dataset.expanded = String(i === index && expanded);
      button.setAttribute('aria-pressed', String(i === index)); button.tabIndex = i === index ? 0 : -1;
      // Neighboring photos stay above farther photos so each retains an exposed
      // image area. Positions do not depend on hover or selection.
      card.style.setProperty('--card-z', floatingMode.matches ? i + 1 : records.length - Math.abs(i - index));
      play.tabIndex = i === index ? 0 : -1; play.disabled = i !== index; video.setAttribute('aria-hidden', String(i !== index));
    });
    if (focus) record.button.focus({ preventScroll: true });
    visible = inViewport(); update();
    if (!expanded) revealAnimation?.cancel();
    else if (enlarged() && (previous !== active || !wasExpanded) && !reduced.matches) {
      revealAnimation?.cancel();
      const from = record.card.getBoundingClientRect(), to = floating.getBoundingClientRect();
      const x = from.left + from.width / 2 - to.left - to.width / 2, y = from.top + from.height / 2 - to.top - to.height / 2;
      revealAnimation = floating.animate([
        { transform: `translate(${x}px,${y}px) scale(${record.card.offsetWidth / to.width})`, opacity: .8 },
        { transform: 'translate(0,0) scale(1)', opacity: 1 }
      ], { duration: 250, easing: 'cubic-bezier(.2,.75,.2,1)' });
    }
  }
  function toggle() {
    visible = inViewport();
    if (allowed(active)) userPaused = true;
    else { userPaused = false; manualPlay = true; }
    update();
  }
  root.addEventListener('keydown', event => {
    if (event.key === 'Escape' && expanded) { event.preventDefault(); collapse(); records[active].play.focus({ preventScroll: true }); return; }
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const index = event.key === 'Home' ? 0 : event.key === 'End' ? records.length - 1 : (active + (['ArrowRight', 'ArrowDown'].includes(event.key) ? 1 : -1) + records.length) % records.length;
    select(index, true);
  }, { signal });
  stack.addEventListener('pointerdown', event => {
    if (event.pointerType !== 'mouse' && !event.target.closest('button')) swipe = { x: event.clientX, y: event.clientY };
  }, { signal });
  stack.addEventListener('pointerup', event => {
    if (!swipe) return;
    const dx = event.clientX - swipe.x, dy = event.clientY - swipe.y; swipe = null;
    if (Math.abs(dx) < 45 || Math.abs(dx) < Math.abs(dy) * 1.3) return;
    suppressClickUntil = performance.now() + 400;
    select((active + (dx < 0 ? 1 : -1) + records.length) % records.length);
  }, { signal });
  stack.addEventListener('pointercancel', () => { swipe = null; }, { signal });
  const observer = new IntersectionObserver(() => { visible = inViewport(); if (!visible && expanded) collapse(); else update(); }, { threshold: 0 });
  records.forEach(({ frame }) => observer.observe(frame));
  root.addEventListener('pointerleave', event => { if (event.pointerType === 'mouse' && floatingMode.matches) collapse(); }, { signal });
  root.addEventListener('focusout', event => { if (!root.contains(event.relatedTarget) && !root.matches(':hover')) collapse(); }, { signal });
  window.addEventListener('scroll', schedulePosition, { passive: true, signal });
  window.addEventListener('resize', schedulePosition, { signal });
  floatingMode.addEventListener('change', () => { root.dataset.floatingMode = String(floatingMode.matches); select(active, false, false); }, { signal });
  document.addEventListener('visibilitychange', () => { if (document.hidden) collapse(); update(); }, { signal });
  reduced.addEventListener('change', () => { if (reduced.matches) manualPlay = false; update(); }, { signal });
  // Start scattered; mouse hover, keyboard, or touch can open a clear preview.
  // Original hit areas never move when the desktop floating preview opens.
  visible = inViewport(); select(active, false, false);
  return { destroy() { abort.abort(); cancelAnimationFrame(layoutFrame); revealAnimation?.cancel(); observer.disconnect(); records.forEach(({ video, controller, largeVideo, largeController, mediaVisibility, largeMediaVisibility }) => { mediaVisibility.destroy(); largeMediaVisibility.destroy(); controller.destroy(); largeController.destroy(); for (const media of [video, largeVideo]) { media.removeAttribute('src'); media.load(); } }); root.replaceChildren(); root.classList.remove('skill-mix'); root.style.removeProperty('--skill-count'); } };
}
