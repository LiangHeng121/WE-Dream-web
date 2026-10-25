/* Independent SVG duration explorer, inspired by WB-WAM's linked corpus donut.
 * Source, calculation and media provenance: docs/website-research/DATASET_REBUILD_SOURCES.md. */
import { seekVideo } from './video-seek.js?v=v33';
const instances = new WeakMap();
let serial = 0;
const ns = 'http://www.w3.org/2000/svg';
const format = value => Math.round(value).toLocaleString('en-US');
const clock = value => `${Math.floor((value || 0) / 60)}:${String(Math.floor((value || 0) % 60)).padStart(2, '0')}`;
const shortNames = { 'pick-place': 'Pick & place', chair: 'Push a chair', pillow: 'Arrange a pillow', clothes: 'Collect clothes', rubbish: 'Dispose of rubbish', shoes: 'Retrieve shoes', sweep: 'Sweep a table', cabinet: 'Cabinet retrieval', drawer: 'Drawer storage' };
const svgNode = (tag, attrs, text) => {
  const node = document.createElementNS(ns, tag);
  Object.entries(attrs || {}).forEach(([key, value]) => node.setAttribute(key, value));
  if (text !== undefined) node.textContent = text;
  return node;
};
const element = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};
function segment(start, end) {
  const point = (radius, angle) => `${160 + radius * Math.cos(angle)},${160 + radius * Math.sin(angle)}`;
  const large = end - start > Math.PI ? 1 : 0;
  return `M${point(138, start)} A138,138 0 ${large} 1 ${point(138, end)} L${point(98, end)} A98,98 0 ${large} 0 ${point(98, start)} Z`;
}

export function datasetVideoFullyBuffered(video) {
  if (!Number.isFinite(video.duration) || video.duration <= 0 || video.readyState < 2) return false;
  let end = 0;
  for (let i = 0; i < video.buffered.length; i++) {
    if (video.buffered.start(i) > end + .05) return false;
    end = Math.max(end, video.buffered.end(i));
  }
  return end >= video.duration - .05;
}

// Restoration uses the native buffered/range pipeline; it must not start a
// complete-file Blob fetch that keeps running after this section is hidden.
export async function restoreDatasetVideo(video, saved, { signal, timeout = 12000 } = {}) {
  const wait = predicate => {
    if (signal?.aborted || video.error) return Promise.resolve(false);
    if (predicate()) return Promise.resolve(true);
    return new Promise(resolve => {
      let timer;
      const finish = value => {
        clearTimeout(timer);
        for (const event of ['loadedmetadata', 'loadeddata', 'canplay', 'seeked']) video.removeEventListener(event, check);
        video.removeEventListener('error', failed); signal?.removeEventListener('abort', failed);
        resolve(value);
      };
      const check = () => { if (predicate()) finish(true); };
      const failed = () => finish(false);
      for (const event of ['loadedmetadata', 'loadeddata', 'canplay', 'seeked']) video.addEventListener(event, check);
      video.addEventListener('error', failed); signal?.addEventListener('abort', failed, { once: true });
      timer = setTimeout(failed, timeout); check();
    });
  };
  if (!await wait(() => video.readyState >= 1) || signal?.aborted || !video.getAttribute('src')) return false;
  video.playbackRate = saved.rate;
  const target = Math.max(0, Math.min(saved.time, Math.max(0, video.duration - .05)));
  if (Math.abs(video.currentTime - target) > .05) video.currentTime = target;
  return wait(() => video.readyState >= 2 && !video.seeking);
}

export async function mountDatasetFilms(root) {
  if (!root) return null;
  root.dataset.mountStartedAt = performance.now().toFixed(1);
  instances.get(root)?.destroy();
  const read = async path => {
    const response = await fetch(new URL(path, document.baseURI));
    if (!response.ok) throw new Error('Dataset information could not be loaded.');
    return response.json();
  };
  const [media, distribution] = await Promise.all([read('data/dataset-media.json?v=v33'), read('data/dataset-distribution.json?v=v33')]);
  const prefix = `dataset-explorer-${++serial}`, abort = new AbortController();
  const on = (node, type, handler, signal = abort.signal) => node.addEventListener(type, handler, { signal });
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let mode = 'pretraining', scale = '10k', sourceId = 'egodex', selected = 'egodex', destroyed = false;
  let allPaused = reduced.matches, tiles = [], graphItems = [], graphTotal = 0;
  const prewarmMargin = 600, prewarmCount = 1;
  const inViewport = (margin = 0) => { const box = root.getBoundingClientRect(); return box.height > 0 && box.width > 0 && box.bottom > -margin && box.top < innerHeight + margin && box.right > 0 && box.left < innerWidth; };
  let sectionVisible = inViewport(), sectionNear = inViewport(prewarmMargin);
  let navigationWarmUntil = 0, navigationWarmTimer = null;
  let loadQueue = [];
  let activeGroupKey = null, cachedGroup = null, gridEntered = false;
  let visibleReady = false, visibleDwellTimer = null;
  const loadingTiles = new Set();
  root.classList.add('dataset-films');
  root.innerHTML = `<div class="df-toolbar"><div class="df-mode-tabs" role="tablist" aria-label="Training stage">
      <button type="button" role="tab" id="${prefix}-pre" data-mode="pretraining" aria-controls="${prefix}-panel">Pretraining</button>
      <button type="button" role="tab" id="${prefix}-post" data-mode="posttraining" aria-controls="${prefix}-panel">Post-training</button>
    </div><button type="button" class="df-play-all">Pause videos</button></div>
    <div class="df-workspace" id="${prefix}-panel" role="tabpanel" aria-labelledby="${prefix}-pre">
      <div class="df-composition"><div class="df-composition-copy">
        <div class="df-composition-head"><div><p class="df-eyebrow"></p><h3 class="df-total"></h3></div><div class="df-scales" role="group" aria-label="Pretraining data scale"></div></div>
        <p class="df-distribution-scope"></p></div><div class="df-donut"></div><div class="df-legend" role="group" aria-label="Choose a dataset source"></div>
      </div>
      <div class="df-feature"><div class="df-feature-heading"><h3 class="df-feature-title"></h3><p class="df-feature-note" hidden></p></div><div class="df-grid" aria-label="Dataset videos"></div></div>
      <details class="df-sources"><summary>Sources &amp; details</summary><div class="df-source-content"></div></details>
    </div><p class="df-announcement" aria-live="polite" aria-atomic="true"></p>`;
  const $ = selector => root.querySelector(selector);
  const sourceURL = (clip, source) => clip.source_page_url || source.source_url || clip.source_url;
  const liveTiles = () => tiles.filter(tile => !tile.abort.signal.aborted);
  const wantsPlayback = tile => !destroyed && tiles.includes(tile) && !tile.abort.signal.aborted && sectionVisible && tile.visible && !allPaused && !tile.paused && !document.hidden && !tile.seeking && !tile.restoring;
  function safePlay(tile) {
    if (wantsPlayback(tile) && tile.video.readyState >= 2) {
      tile.video.play().then(() => {
        if (!wantsPlayback(tile)) tile.video.pause();
        updatePlayback(tile);
      }).catch(() => updatePlayback(tile));
    }
  }
  function updatePlayback(tile) {
    const paused = tile.video.paused;
    tile.play.textContent = paused ? '▶' : 'Ⅱ';
    tile.play.setAttribute('aria-label', `${paused ? 'Play' : 'Pause'} ${tile.title}`);
    tile.card.classList.toggle('is-playing', !paused);
  }
  function updateGlobalControl() {
    $('.df-play-all').textContent = allPaused ? 'Play videos' : 'Pause videos';
    $('.df-play-all').setAttribute('aria-label', `${allPaused ? 'Play' : 'Pause'} all dataset videos`);
  }
  function graphRows() {
    if (mode === 'posttraining') return distribution.posttraining.items.map(item => ({ ...item, value: item.frames }));
    const setting = distribution.pretraining.scales.find(item => item.id === scale);
    return distribution.pretraining.sources.filter(item => setting.hours[item.id] > 0).map(item => ({ ...item, value: setting.hours[item.id] }));
  }
  const amount = item => mode === 'pretraining' ? `≈${format(item.value)} h` : `${(item.seconds / 60).toFixed(1)} min`;
  function highlight(id) {
    const item = graphItems.find(row => row.id === id);
    $('.df-donut-value').textContent = item ? `${(item.value / graphTotal * 100).toFixed(1)}%` : mode === 'pretraining' ? `${graphItems.length} sources` : `${distribution.posttraining.hours.toFixed(3)} h`;
    $('.df-donut-label').textContent = item ? amount(item) : mode === 'pretraining' ? 'human video' : '0917 snapshot';
    root.querySelectorAll('.df-slice').forEach(node => node.classList.toggle('is-highlighted', node.dataset.compositionId === id));
  }
  function refreshSelection() {
    const tabStop = selected || graphItems[0]?.id;
    root.querySelectorAll('[data-composition-id]').forEach(node => {
      node.setAttribute('aria-pressed', String(node.dataset.compositionId === selected));
      node.tabIndex = node.dataset.compositionId === tabStop ? 0 : -1;
    });
    tiles.forEach(tile => tile.card.classList.toggle('is-selected', mode === 'posttraining' && tile.id === selected));
    highlight(selected);
  }
  function selectItem(id, focusCard = false) {
    selected = id;
    if (mode === 'pretraining' && sourceId !== id) {
      sourceId = id; buildTiles(); buildSources();
    }
    refreshSelection();
    const tile = tiles.find(item => item.id === id);
    if (mode === 'posttraining' && tile && focusCard) {
      tile.card.focus({ preventScroll: true });
      const bounds = tile.card.getBoundingClientRect();
      if (bounds.top < 80 || bounds.bottom > window.innerHeight) tile.card.scrollIntoView({ behavior: reduced.matches ? 'instant' : 'smooth', block: 'center' });
    }
    $('.df-announcement').textContent = mode === 'pretraining' ? `${media.pretraining.sources.find(source => source.id === sourceId).name}. ${tiles.length} independent preview videos shown.` : `${tile?.title || id} highlighted. All robot videos remain visible.`;
  }
  function buildGraph() {
    graphItems = graphRows(); graphTotal = graphItems.reduce((sum, item) => sum + item.value, 0);
    if (!graphItems.some(item => item.id === selected)) {
      selected = mode === 'pretraining' ? graphItems[0].id : null;
      if (mode === 'pretraining') sourceId = selected;
    }
    const chart = svgNode('svg', { viewBox: '0 0 320 320', role: 'group', 'aria-label': `${mode === 'pretraining' ? 'Approximate paper pretraining' : 'Public 0917 snapshot'} duration shares. Select a slice to ${mode === 'pretraining' ? 'show the source mosaic' : 'highlight a robot video'}.` });
    const defs = svgNode('defs'); chart.append(defs);
    chart.append(svgNode('circle', { cx: 160, cy: 160, r: 80, class: 'df-donut-core' }));
    const center = svgNode('g', { 'aria-hidden': 'true' });
    center.append(svgNode('text', { x: 160, y: 155, 'text-anchor': 'middle', class: 'df-donut-value' }, ''), svgNode('text', { x: 160, y: 182, 'text-anchor': 'middle', class: 'df-donut-label' }, ''));
    chart.append(center);
    const legend = $('.df-legend'); legend.replaceChildren();
    let angle = -Math.PI / 2;
    graphItems.forEach(item => {
      const gradientId = `${prefix}-${mode}-${item.id}`;
      const gradient = svgNode('linearGradient', { id: gradientId, x1: '0%', y1: '0%', x2: '100%', y2: '100%' });
      gradient.append(svgNode('stop', { offset: '0%', 'stop-color': item.color, 'stop-opacity': '.7' }), svgNode('stop', { offset: '100%', 'stop-color': item.color })); defs.append(gradient);
      const next = angle + item.value / graphTotal * Math.PI * 2, mid = (angle + next) / 2;
      const label = `${item.label}, ${(item.value / graphTotal * 100).toFixed(1)} percent of duration, ${amount(item)}. ${mode === 'pretraining' ? 'Show source mosaic.' : 'Highlight video.'}`;
      const group = svgNode('g', { class: 'df-slice', role: 'button', tabindex: '-1', 'data-composition-id': item.id, 'aria-label': label });
      group.style.setProperty('--slice-x', `${Math.cos(mid) * 5}px`); group.style.setProperty('--slice-y', `${Math.sin(mid) * 5}px`);
      group.append(svgNode('path', { d: segment(angle, next), fill: `url(#${gradientId})` })); chart.append(group); angle = next;
      const button = element('button', 'df-legend-item'); button.type = 'button'; button.dataset.compositionId = item.id;
      button.style.setProperty('--source-color', item.color); button.setAttribute('aria-label', label);
      const dot = element('i'); dot.setAttribute('aria-hidden', 'true');
      button.append(dot, element('span', '', shortNames[item.id] || item.label));
      if (mode === 'pretraining') button.append(element('span', 'df-legend-amount', amount(item)));
      legend.append(button);
    });
    $('.df-donut').replaceChildren(chart); refreshSelection();
  }
  function ensurePoster(tile) {
    if (!tile.posterSrc || tile.posterAssigned) return;
    tile.video.poster = tile.posterSrc; tile.posterAssigned = true;
    tile.video.dataset.posterAssignedAt = performance.now().toFixed(1);
  }
  function updateVisibleReadiness(active) {
    const gridVisible = active && sectionVisible && liveTiles().some(tile => tile.visible);
    if (!gridVisible) {
      clearTimeout(visibleDwellTimer); visibleDwellTimer = null; visibleReady = false;
    } else if (performance.now() < navigationWarmUntil) {
      clearTimeout(visibleDwellTimer); visibleDwellTimer = null; visibleReady = true;
    } else if (!visibleReady && visibleDwellTimer === null) {
      visibleDwellTimer = setTimeout(() => {
        visibleDwellTimer = null;
        if (destroyed) return;
        visibleReady = true; syncVisibility();
      }, 150);
    }
  }
  function eligibleTile(tile) {
    if (inViewport() && gridEntered) return tile.visible && (visibleReady || tiles[0] === tile);
    return tiles.slice(0, prewarmCount).includes(tile) || (inViewport() && tile.visible);
  }
  function loadTile(tile, { retry = false } = {}) {
    if (retry) tile.retryBlocked = false;
    if (tile.loaded || tile.retryBlocked || tile.abort.signal.aborted || destroyed) return;
    if (tile.queued) { pumpLoads(); return; }
    tile.queued = true; loadQueue.push(tile); pumpLoads();
  }
  function pumpLoads() {
    if (destroyed || document.hidden || (!inViewport(prewarmMargin) && performance.now() >= navigationWarmUntil)) return;
    loadQueue = loadQueue.filter(tile => !tile.abort.signal.aborted && !tile.retryBlocked);
    loadQueue.sort((a, b) => Number(b.visible) - Number(a.visible));
    while (loadingTiles.size < 3 && loadQueue.length) {
      const next = loadQueue.findIndex(eligibleTile);
      if (next < 0) break;
      const [tile] = loadQueue.splice(next, 1); tile.queued = false;
      ensurePoster(tile);
      tile.loaded = true; tile.loading.hidden = false; loadingTiles.add(tile);
      const request = { abort: new AbortController(), finishing: false, complete: false, bufferedEnd: 0 }; tile.loadRequest = request;
      tile.restoring = Boolean(tile.resume);
      for (const event of ['loadeddata', 'canplay']) on(tile.video, event, () => finishTileLoad(tile, request), request.abort.signal);
      on(tile.video, 'error', () => failTile(tile, request), request.abort.signal);
      for (const event of ['progress', 'canplaythrough', 'durationchange']) on(tile.video, event, () => checkTileBuffer(tile, request), request.abort.signal);
      tile.video.preload = 'auto';
      tile.video.src = tile.clip.preview?.src || tile.clip.src; tile.video.load();
      tile.video.dataset.sourceAssignedAt = performance.now().toFixed(1);
      if (!root.dataset.firstSourceAssignedAt) root.dataset.firstSourceAssignedAt = tile.video.dataset.sourceAssignedAt;
      armLoadTimeout(tile, request);
    }
  }
  function armLoadTimeout(tile, request) {
    if (request !== tile.loadRequest || request.abort.signal.aborted || request.complete) return;
    clearTimeout(tile.timer);
    tile.timer = setTimeout(() => failTile(tile, request), 30000);
  }
  function checkTileBuffer(tile, request) {
    if (request !== tile.loadRequest || request.abort.signal.aborted || request.complete) return;
    if (datasetVideoFullyBuffered(tile.video)) {
      request.complete = true; releaseLoad(tile); return;
    }
    const ranges = tile.video.buffered, end = ranges.length ? ranges.end(ranges.length - 1) : 0;
    if (end > request.bufferedEnd + .05) {
      request.bufferedEnd = end; armLoadTimeout(tile, request);
    }
  }
  async function finishTileLoad(tile, request) {
    if (request !== tile.loadRequest || request.abort.signal.aborted || request.finishing || tile.video.readyState < 2) return;
    request.finishing = true;
    if (!tile.video.dataset.firstDataAt) tile.video.dataset.firstDataAt = performance.now().toFixed(1);
    if (!root.dataset.firstDataAt) root.dataset.firstDataAt = tile.video.dataset.firstDataAt;
    const saved = tile.resume;
    if (saved) {
      const restored = await restoreDatasetVideo(tile.video, saved, { signal: request.abort.signal });
      if (request !== tile.loadRequest || request.abort.signal.aborted) return;
      if (restored && tile.resume === saved) tile.resume = null;
    }
    tile.restoring = false;
    tile.loading.hidden = true; tile.error.hidden = true; tile.seek.disabled = false; safePlay(tile);
    // A decoded frame can play immediately, but still owns its transfer slot.
    checkTileBuffer(tile, request);
  }
  function releaseLoad(tile) {
    clearTimeout(tile.timer);
    if (loadingTiles.delete(tile)) pumpLoads();
  }
  function failTile(tile, request) {
    if (tile.abort.signal.aborted || request !== tile.loadRequest || request.abort.signal.aborted) return;
    cancelTileRequest(tile);
    tile.retryBlocked = true; tile.error.hidden = false;
    updatePlayback(tile); pumpLoads();
  }
  function cancelTileRequest(tile) {
    tile.video.pause();
    tile.seekNumber += 1; tile.seekAbort?.abort(); tile.seeking = false;
    if (tile.video.getAttribute('src')) tile.resume ||= { time: Number.isFinite(tile.video.currentTime) ? tile.video.currentTime : 0, rate: tile.video.playbackRate || 1 };
    tile.loadRequest?.abort.abort(); tile.loadRequest = null;
    clearTimeout(tile.timer); loadingTiles.delete(tile);
    loadQueue = loadQueue.filter(queued => queued !== tile);
    tile.loaded = false; tile.queued = false; tile.restoring = false;
    tile.loading.hidden = true; tile.seek.disabled = true;
    if (tile.video.getAttribute('src')) { tile.video.removeAttribute('src'); tile.video.preload = 'none'; tile.video.load(); }
  }
  function suspendTile(tile) {
    if (datasetVideoFullyBuffered(tile.video)) {
      tile.video.pause(); tile.seekNumber += 1; tile.seekAbort?.abort(); tile.seeking = false;
      clearTimeout(tile.timer); loadingTiles.delete(tile); return;
    }
    cancelTileRequest(tile);
  }
  function syncVisibility() {
    sectionVisible = inViewport();
    sectionNear = inViewport(prewarmMargin);
    if (!sectionVisible) gridEntered = false;
    if (sectionVisible && !root.dataset.firstVisibleAt) root.dataset.firstVisibleAt = performance.now().toFixed(1);
    if (document.hidden) { navigationWarmUntil = 0; clearTimeout(navigationWarmTimer); }
    const active = (sectionNear || performance.now() < navigationWarmUntil) && !document.hidden;
    updateVisibleReadiness(active);
    const wasSuspended = root.dataset.mediaNetworkState === 'suspended';
    root.dataset.mediaNetworkState = active ? sectionVisible ? 'visible' : 'prewarming' : 'suspended';
    if (!active) {
      loadQueue = [];
      liveTiles().forEach(suspendTile);
    } else {
      const eligible = new Set(liveTiles().filter(eligibleTile));
      liveTiles().filter(tile => !eligible.has(tile)).forEach(suspendTile);
      liveTiles().forEach(tile => {
        if (eligible.has(tile)) { ensurePoster(tile); loadTile(tile, { retry: wasSuspended }); }
        if (sectionVisible) safePlay(tile); else tile.video.pause();
      });
      pumpLoads();
    }
  }
  const sectionObserver = new IntersectionObserver(syncVisibility, { threshold: 0 });
  sectionObserver.observe(root);
  const approachObserver = new IntersectionObserver(syncVisibility, { rootMargin: `${prewarmMargin}px 0px`, threshold: 0 });
  approachObserver.observe(root);
  const playObserver = new IntersectionObserver(entries => { entries.forEach(entry => {
    const tile = tiles.find(item => item.stage === entry.target); if (!tile) return;
    const wasVisible = tile.visible;
    tile.visible = entry.isIntersecting && entry.intersectionRatio >= .1;
    if (tile.visible) { gridEntered = true; if (!wasVisible) tile.retryBlocked = false; }
    if (tile.visible && !tile.video.dataset.firstVisibleAt) tile.video.dataset.firstVisibleAt = performance.now().toFixed(1);
  }); syncVisibility(); }, { threshold: [0, .1] });
  function disposeTiles(group) {
    group.forEach(tile => { tile.abort.abort(); tile.loadRequest?.abort.abort(); tile.seekAbort?.abort(); clearTimeout(tile.timer); tile.video.pause(); tile.video.removeAttribute('src'); tile.video.load(); });
  }
  function clearTiles({ cache = false } = {}) {
    playObserver.disconnect();
    clearTimeout(visibleDwellTimer); visibleDwellTimer = null; visibleReady = false;
    loadQueue = []; loadingTiles.clear();
    if (cache && tiles.length && tiles.every(tile => datasetVideoFullyBuffered(tile.video) && !tile.restoring && !tile.seeking)) {
      if (cachedGroup) disposeTiles(cachedGroup.tiles);
      tiles.forEach(tile => { tile.video.pause(); tile.visible = false; tile.queued = false; tile.loadRequest?.abort.abort(); tile.loadRequest = null; clearTimeout(tile.timer); });
      cachedGroup = { key: activeGroupKey, tiles };
    } else disposeTiles(tiles);
    tiles = []; gridEntered = false; $('.df-grid').replaceChildren();
  }
  function restoreGroup(key) {
    const saved = cachedGroup?.key === key ? cachedGroup : null;
    if (saved) cachedGroup = null;
    clearTiles({ cache: true }); activeGroupKey = key;
    if (!saved) return false;
    tiles = saved.tiles;
    tiles.forEach(tile => {
      // Browsers may evict decoded media while its complete source is cached.
      if (!datasetVideoFullyBuffered(tile.video)) cancelTileRequest(tile);
      $('.df-grid').append(tile.card); playObserver.observe(tile.stage);
    });
    return true;
  }
  function createTile(id, source, clip, title, color) {
    const card = element('article', 'df-card'); card.tabIndex = -1; card.dataset.cardId = id;
    card.setAttribute('aria-labelledby', `${prefix}-card-${id}`); card.style.setProperty('--card-color', color);
    card.innerHTML = `<div class="df-stage"><video class="df-video" muted playsinline loop preload="none"></video>
      <div class="df-loading" hidden aria-label="Loading video"><span class="df-loader" aria-hidden="true"></span></div>
      <div class="df-error" hidden><a target="_blank" rel="noopener noreferrer">View source ↗</a></div>
      <div class="df-video-controls"><button class="df-play" type="button">▶</button><input class="df-seek" type="range" min="0" max="1000" step="1" value="0" disabled><button class="df-fullscreen" type="button">⛶</button></div>
    </div><div class="df-card-caption"><h4 id="${prefix}-card-${id}"></h4></div>`;
    card.querySelector('h4').textContent = title;
    if (mode === 'pretraining') card.querySelector('.df-card-caption').classList.add('df-sr-only');
    const tile = { id, title, source, clip, card, stage: card.querySelector('.df-stage'), video: card.querySelector('video'), play: card.querySelector('.df-play'), seek: card.querySelector('.df-seek'), loading: card.querySelector('.df-loading'), error: card.querySelector('.df-error'), abort: new AbortController(), loaded: false, queued: false, visible: false, near: false, paused: false, seeking: false, seekNumber: 0, timer: 0 };
    tile.video.dataset.clipId = id;
    tile.video.muted = true;
    tile.video.setAttribute('aria-label', clip.media_kind === 'explicit_placeholder_from_other_dataset' ? `${title}, temporary preview from EgoVerse` : `${title}, ${mode === 'pretraining' ? 'human' : 'robot'} first-person dataset video`);
    tile.posterSrc = clip.preview?.poster || clip.poster;
    tile.seek.setAttribute('aria-label', `Seek ${title}`); tile.error.querySelector('a').href = sourceURL(clip, source);
    const fullscreen = card.querySelector('.df-fullscreen'); fullscreen.setAttribute('aria-label', `Show ${title} fullscreen`);
    on(tile.video, 'play', () => updatePlayback(tile), tile.abort.signal);
    on(tile.video, 'playing', () => {
      if (!wantsPlayback(tile)) tile.video.pause();
      else {
        if (!tile.video.dataset.firstPlayingAt) tile.video.dataset.firstPlayingAt = performance.now().toFixed(1);
        if (!root.dataset.firstPlayingAt) root.dataset.firstPlayingAt = tile.video.dataset.firstPlayingAt;
      }
      updatePlayback(tile);
    }, tile.abort.signal);
    on(tile.video, 'pause', () => updatePlayback(tile), tile.abort.signal);
    on(tile.video, 'click', () => tile.card.classList.toggle('has-controls'), tile.abort.signal);
    on(tile.video, 'timeupdate', () => {
      if (!tile.seeking && !tile.seek.matches(':active')) tile.seek.value = Number.isFinite(tile.video.duration) ? tile.video.currentTime / tile.video.duration * 1000 : 0;
      tile.seek.setAttribute('aria-valuetext', `${clock(tile.video.currentTime)} of ${clock(tile.video.duration || clip.duration)}`);
    }, tile.abort.signal);
    on(tile.play, 'click', () => {
      if (!tile.video.paused) { tile.paused = true; tile.video.pause(); }
      else {
        tile.paused = false;
        if (allPaused) { liveTiles().forEach(other => { other.paused = other !== tile; }); allPaused = false; updateGlobalControl(); }
        loadTile(tile, { retry: true }); safePlay(tile);
      }
      updatePlayback(tile);
    }, tile.abort.signal);
    on(tile.seek, 'input', async () => {
      if (!Number.isFinite(tile.video.duration)) return;
      const ticket = ++tile.seekNumber; tile.seeking = true;
      tile.seekAbort?.abort(); tile.seekAbort = new AbortController();
      const ok = await seekVideo(tile.video, Number(tile.seek.value) / 1000 * tile.video.duration, { signal: tile.seekAbort.signal });
      if (ticket !== tile.seekNumber || tile.abort.signal.aborted) return;
      tile.seeking = false;
      if (!ok) $('.df-announcement').textContent = `Seeking ${title} is unavailable. Open the original source in Sources & details.`;
      safePlay(tile);
    }, tile.abort.signal);
    on(fullscreen, 'click', () => {
      if (tile.stage.requestFullscreen) tile.stage.requestFullscreen().catch(() => {});
      else tile.video.webkitEnterFullscreen?.();
    }, tile.abort.signal);
    updatePlayback(tile); tiles.push(tile); $('.df-grid').append(card);
    playObserver.observe(tile.stage);
  }
  function buildTiles() {
    const restored = restoreGroup(mode === 'pretraining' ? `pretraining:${sourceId}` : 'posttraining');
    if (mode === 'pretraining') {
      const source = media.pretraining.sources.find(item => item.id === sourceId);
      const item = distribution.pretraining.sources.find(row => row.id === source.id);
      if (!restored) source.clips.filter(clip => clip.mosaic_preview !== false).slice(0, 9).forEach(clip => createTile(clip.id, source, clip, clip.label || clip.title, item.color));
      $('.df-feature-title').textContent = source.name;
      $('.df-feature-note').hidden = source.id !== 'egowe';
      $('.df-feature-note').textContent = source.id === 'egowe' ? 'Temporary preview · EgoVerse footage' : '';
    }
    else {
      const source = media.posttraining.sources[0];
      if (!restored) distribution.posttraining.items.forEach(item => createTile(item.id, source, source.clips.find(clip => clip.id === item.clip_id), shortNames[item.id] || item.label, item.color));
      $('.df-feature-title').textContent = 'Robot first-person demonstrations';
      $('.df-feature-note').hidden = true;
    }
    $('.df-grid').dataset.count = tiles.length;
    $('.df-grid').setAttribute('aria-label', mode === 'pretraining' ? `${$('.df-feature-title').textContent}, ${tiles.length} independent preview videos` : 'Nine first-person robot training videos');
    refreshSelection();
  }
  function buildSources() {
    const content = $('.df-source-content'); content.replaceChildren();
    content.append(element('p', 'df-provenance-note', mode === 'pretraining' ? distribution.pretraining.note : `${distribution.posttraining.note} Duration shares use ${format(distribution.posttraining.frames)} frames at ${distribution.posttraining.fps} FPS; the snapshot contains ${distribution.posttraining.instructions} instructions across ${distribution.posttraining.families} task families.`));
    if (mode === 'posttraining') {
      const paragraph = element('p', '', 'The nine videos are complete first-person head-camera training segments from the public repository. H.264 web delivery preserves dimensions, frame rate and timing, with no cuts or crops. ');
      const link = element('a', '', 'ModelScope dataset ↗'); link.href = distribution.posttraining.source_url; link.target = '_blank'; link.rel = 'noopener noreferrer'; paragraph.append(link); content.append(paragraph);
      content.append(element('p', 'df-revision', `Apache-2.0 · Snapshot revision ${distribution.posttraining.revision}`));
    }
    const list = element('div', 'df-source-list');
    if (mode === 'pretraining' && tiles.length) {
      const source = tiles[0].source;
      content.append(element('p', '', `${source.description} ${source.attribution} ${source.license}`));
      content.append(element('p', '', 'These independent publisher examples illustrate the data source; they are not asserted to be the exact samples used in WE-Dream training.'));
      if (source.id === 'egowe') content.append(element('p', 'df-placeholder-note', 'Temporary preview: all videos in this mosaic are distinct EgoVerse episodes, not EgoWE footage.'));
    }
    tiles.forEach(tile => {
      const item = element('div', 'df-source-entry'); item.append(element('h5', '', tile.title));
      if (mode === 'pretraining') {
        item.append(element('p', '', tile.clip.description || tile.clip.label));
        item.append(element('p', 'df-episode', tile.clip.archive_member || `Episode ${tile.clip.episode_id}`));
      } else {
        item.append(element('p', '', `“${tile.clip.prompt_exact}”`));
        item.append(element('p', 'df-episode', `Episode ${tile.clip.episode_index} · task ${tile.clip.task_index} · ${clock(tile.clip.duration)}. Instruction joined to this episode in repository metadata.`));
      }
      const link = element('a', '', mode === 'pretraining' ? 'Original source ↗' : 'Original dataset ↗'); link.href = sourceURL(tile.clip, tile.source); link.target = '_blank'; link.rel = 'noopener noreferrer'; item.append(link); list.append(item);
    });
    content.append(list);
  }
  function renderComposition() {
    const pre = mode === 'pretraining';
    $('.df-eyebrow').textContent = pre ? 'Human pretraining · paper' : 'Robot training · paper';
    $('.df-total').textContent = pre ? `≈${scale} hours` : `${distribution.posttraining.paper_hours.toFixed(2)} hours`;
    $('.df-distribution-scope').textContent = pre ? 'Video duration by source' : 'Chart: public 0917 snapshot, a different dataset version';
    $('.df-legend').setAttribute('aria-label', pre ? 'Choose a human-video source' : 'Highlight a robot task family');
    $('.df-scales').hidden = !pre; $('.df-scales').replaceChildren();
    if (pre) distribution.pretraining.scales.forEach(item => {
      const button = element('button', '', item.label); button.type = 'button'; button.dataset.scale = item.id;
      button.setAttribute('aria-label', `${item.label}-hour nominal pretraining setting`); button.setAttribute('aria-pressed', String(item.id === scale)); $('.df-scales').append(button);
    });
    buildGraph();
  }
  function renderMode() {
    const pre = mode === 'pretraining'; root.dataset.mode = mode; selected = pre ? sourceId : null;
    root.querySelectorAll('[data-mode]').forEach(button => { const active = button.dataset.mode === mode; button.setAttribute('aria-selected', String(active)); button.tabIndex = active ? 0 : -1; });
    $('.df-workspace').setAttribute('aria-labelledby', `${prefix}-${pre ? 'pre' : 'post'}`);
    renderComposition(); buildTiles(); buildSources(); updateGlobalControl();
  }
  on(root, 'click', event => {
    const item = event.target.closest('[data-composition-id]');
    if (item) { selectItem(item.dataset.compositionId, true); return; }
    const button = event.target.closest('button'); if (!button) return;
    if (button.dataset.mode && button.dataset.mode !== mode) { mode = button.dataset.mode; renderMode(); }
    else if (button.dataset.scale && button.dataset.scale !== scale) {
      const previousSource = sourceId; scale = button.dataset.scale; renderComposition();
      if (sourceId !== previousSource) { buildTiles(); buildSources(); }
      $('.df-scales').querySelector('[aria-pressed=true]')?.focus({ preventScroll: true });
    }
    else if (button.matches('.df-play-all')) {
      allPaused = !allPaused;
      liveTiles().forEach(tile => { tile.paused = allPaused; if (allPaused) tile.video.pause(); else { loadTile(tile, { retry: true }); safePlay(tile); } }); updateGlobalControl();
    }
  });
  on(root, 'keydown', event => {
    const composition = event.target.closest('[data-composition-id]');
    if (composition && event.target.namespaceURI === ns && ['Enter', ' '].includes(event.key)) { event.preventDefault(); selectItem(composition.dataset.compositionId, true); return; }
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
    if (composition) {
      event.preventDefault(); const ids = graphItems.map(item => item.id), index = ids.indexOf(composition.dataset.compositionId);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? ids.length - 1 : (index + (['ArrowRight', 'ArrowDown'].includes(event.key) ? 1 : -1) + ids.length) % ids.length;
      selectItem(ids[next]); const container = composition.namespaceURI === ns ? $('.df-donut') : $('.df-legend'); container.querySelector(`[data-composition-id="${ids[next]}"]`)?.focus({ preventScroll: true });
    } else if (event.target.matches('[role=tab]')) {
      event.preventDefault(); const next = event.key === 'Home' ? 'pretraining' : event.key === 'End' ? 'posttraining' : mode === 'pretraining' ? 'posttraining' : 'pretraining';
      root.querySelector(`[data-mode="${next}"]`).click(); root.querySelector(`[data-mode="${next}"]`).focus();
    }
  });
  on(root, 'pointerover', event => { const node = event.target.closest('[data-composition-id]'); if (node && event.pointerType !== 'touch') highlight(node.dataset.compositionId); });
  on(root, 'pointerout', event => { if (event.target.closest('[data-composition-id]') && !event.relatedTarget?.closest?.('[data-composition-id]')) highlight(selected); });
  on(root, 'focusin', event => { const node = event.target.closest('[data-composition-id]'); if (node) highlight(node.dataset.compositionId); });
  on(root, 'focusout', event => { if (event.target.closest('[data-composition-id]')) highlight(selected); });
  on(document, 'visibilitychange', syncVisibility);
  on(reduced, 'change', () => { if (reduced.matches) { allPaused = true; liveTiles().forEach(tile => tile.video.pause()); updateGlobalControl(); } });
  renderMode();
  root.dataset.mountReadyAt = performance.now().toFixed(1);
  const controller = {
    prepare() {
      if (destroyed || document.hidden) return;
      navigationWarmUntil = performance.now() + 6000;
      clearTimeout(navigationWarmTimer);
      navigationWarmTimer = setTimeout(() => { navigationWarmUntil = 0; syncVisibility(); }, 6000);
      syncVisibility();
    },
    destroy() { destroyed = true; abort.abort(); clearTimeout(navigationWarmTimer); sectionObserver.disconnect(); approachObserver.disconnect(); clearTiles(); if (cachedGroup) disposeTiles(cachedGroup.tiles); cachedGroup = null; root.replaceChildren(); instances.delete(root); }
  };
  instances.set(root, controller); return controller;
}
