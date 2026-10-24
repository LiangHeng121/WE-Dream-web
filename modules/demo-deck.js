/**
 * WE-Dream demo deck, adapted from the Psi0 website carousel.
 * Copyright © 2026 PSI Lab. All rights reserved.
 * Upstream: physical-superintelligence-lab/Psi0, website branch,
 * c2a96a365def9409064449f2b37aa7e2efded781, DemosSection.astro.
 * Reuse basis and original source: ../vendor/psi0/NOTICE.md.
 *
 * Retains upstream centerCardInReel / updateReelInsets / setActiveCard
 * geometry and native scroll-snap/drag interaction. Adds a reusable API,
 * keyboard controls, cleanup, reduced motion and external video ownership.
 */

const mountedDecks = new WeakMap();
let nextDeckId = 0;
const interactiveSelector = 'a, input, select, textarea, summary, video[controls], [contenteditable="true"], [data-deck-no-drag]';

function element(tag, className, text) {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function isInteractive(target) {
  return Boolean(target.closest(interactiveSelector) || target.closest('button:not(.demo-deck-preview)'));
}

/**
 * @param {HTMLElement} root An empty host owned by the deck.
 * @param {object} options
 * @param {Array} options.items
 * @param {function} options.renderCard (item, index) => HTMLElement. Player ownership stays with the caller.
 * @param {function} options.onActiveChange (index, { item, card, previousIndex, reason }) => void.
 * @param {function} options.onNavigationIntent (index, { item, card, reason }) => void | Promise. A promise gates programmatic motion until a frame is prepared.
 * @param {function} options.onMotionChange (moving, { index, reason }) => void. Old players may keep playing until moving becomes false.
 * @returns {{setItems:Function,goTo:Function,prev:Function,next:Function,getActiveIndex:Function,getActiveCard:Function,refresh:Function,destroy:Function}}
 */
export function createDemoDeck(root, options = {}) {
  if (!(root instanceof HTMLElement)) throw new TypeError('createDemoDeck expects an HTMLElement.');
  mountedDecks.get(root)?.destroy();
  const controller = new AbortController();
  const { signal } = controller;
  const id = `demo-deck-${++nextDeckId}`;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const label = options.label || 'Demonstration videos';
  let items = [];
  let cards = [];
  let activeIndex = -1;
  let pendingIndex = null;
  let scrollFrame = 0;
  let layoutFrame = 0;
  let settleTimer = 0;
  let pointer = null;
  let suppressClickUntil = 0;
  let reason = 'init';
  let disposed = false;
  let itemRevision = 0;
  let navigationTicket = 0;
  let animationFrame = 0;
  let waitingForMedia = false;
  let moving = false;
  let geometry = [];
  let lastDragIntent = -1;
  let ignoreScrollUntil = 0;

  root.classList.add('demo-deck');
  root.setAttribute('role', 'region');
  root.setAttribute('aria-roledescription', 'carousel');
  root.setAttribute('aria-label', label);

  const frame = element('div', 'demo-deck-frame');
  const reel = element('div', 'demo-deck-reel');
  reel.id = `${id}-reel`;
  reel.tabIndex = 0;
  reel.setAttribute('aria-label', `${label}. Use Left and Right arrow keys to change video.`);
  const previous = element('button', 'demo-deck-nav demo-deck-nav-prev', '‹');
  const next = element('button', 'demo-deck-nav demo-deck-nav-next', '›');
  for (const [button, name] of [[previous, 'Previous video'], [next, 'Next video']]) {
    button.type = 'button';
    button.setAttribute('aria-label', name);
    button.setAttribute('aria-controls', reel.id);
  }
  const footer = element('div', 'demo-deck-footer');
  const hint = element('span', 'demo-deck-hint', 'Drag or use the arrows to explore');
  hint.setAttribute('aria-hidden', 'true');
  const status = element('span', 'demo-deck-status');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  status.setAttribute('aria-atomic', 'true');
  footer.append(hint, status);
  frame.append(reel, previous, next);
  root.replaceChildren(frame, footer);

  function clampIndex(index) {
    return Math.max(0, Math.min(items.length - 1, Number.isFinite(Number(index)) ? Math.round(Number(index)) : 0));
  }

  function setMotion(value, index = pendingIndex ?? activeIndex) {
    if (moving === value) return;
    moving = value;
    reel.dataset.moving = String(value);
    options.onMotionChange?.(value, { index, reason });
  }

  function clearNavigation({ releaseControl = true } = {}) {
    navigationTicket++;
    cancelAnimationFrame(animationFrame);
    animationFrame = 0;
    clearTimeout(settleTimer);
    waitingForMedia = false;
    root.removeAttribute('aria-busy');
    if (releaseControl) reel.dataset.controlled = 'false';
  }

  function measureCards() {
    geometry = cards.map(card => ({ center: card.offsetLeft + card.offsetWidth / 2, width: card.offsetWidth }));
  }

  // Psi0's center geometry, measured before animation rather than on every frame.
  function centeredPosition(index) {
    return Math.max(0, Math.min(reel.scrollWidth - reel.clientWidth, geometry[index].center - reel.clientWidth / 2));
  }

  function updateVisuals() {
    if (!geometry.length || !reel.clientWidth) return;
    const center = reel.scrollLeft + reel.clientWidth / 2;
    geometry.forEach((entry, index) => {
      const stride = geometry[index + 1]?.center - entry.center || entry.center - geometry[index - 1]?.center || entry.width;
      const distance = Math.min(2, Math.abs(entry.center - center) / Math.max(stride, 1));
      const local = distance <= 1 ? distance : distance - 1;
      const progress = local * local * (3 - 2 * local);
      const scale = distance <= 1 ? 1 - .06 * progress : .94 - .03 * progress;
      const opacity = distance <= 1 ? 1 - .32 * progress : .68 - .23 * progress;
      const value = `${scale.toFixed(4)},${opacity.toFixed(4)}`;
      const card = cards[index];
      if (card._deckVisual === value) return;
      card._deckVisual = value;
      card.style.setProperty('--demo-deck-scale', scale.toFixed(4));
      card.style.setProperty('--demo-deck-opacity', opacity.toFixed(4));
    });
  }

  // Adapted from Psi0: equal edge insets also center the first and last card.
  // Resolve card width in pixels first, avoiding percentage/padding feedback.
  function updateReelInsets() {
    if (!cards.length || reel.clientWidth === 0) return;
    const css = getComputedStyle(root);
    const ratio = Number.parseFloat(css.getPropertyValue('--demo-deck-card-ratio')) || 0.72;
    const maximum = Number.parseFloat(css.getPropertyValue('--demo-deck-card-max')) || 850;
    const width = Math.min(reel.clientWidth * ratio, maximum);
    reel.style.setProperty('--demo-deck-card-width', `${width}px`);
    const inset = Math.max((reel.clientWidth - cards[0].offsetWidth) / 2, 0);
    reel.style.setProperty('--demo-deck-edge-inset', `${inset}px`);
    measureCards();
  }

  function closestIndex() {
    if (!cards.length) return -1;
    const reelCenter = reel.scrollLeft + reel.clientWidth / 2;
    let closest = 0;
    let closestDistance = Number.POSITIVE_INFINITY;
    geometry.forEach((entry, index) => {
      const distance = Math.abs(entry.center - reelCenter);
      if (distance < closestDistance) {
        closestDistance = distance;
        closest = index;
      }
    });
    return closest;
  }

  // Adapted from Psi0 setActiveCard. Video play/pause belongs to the caller.
  function setActiveCard(index, changeReason = reason) {
    if (index < 0 || !cards[index] || index === activeIndex) return;
    const previousIndex = activeIndex;
    activeIndex = index;
    cards.forEach((card, cardIndex) => {
      const active = cardIndex === index;
      const delta = Math.abs(cardIndex - index);
      card.dataset.active = String(active);
      card.dataset.near = String(delta === 1);
      card.dataset.far = String(delta > 1);
      const content = card.firstElementChild;
      content.inert = !active;
      content.setAttribute('aria-hidden', String(!active));
      card.lastElementChild.hidden = active;
    });
    reel.dataset.activeIndex = String(index);
    previous.disabled = index === 0;
    next.disabled = index === cards.length - 1;
    status.textContent = `${String(index + 1).padStart(2, '0')} / ${String(cards.length).padStart(2, '0')}`;
    if (previousIndex !== index) {
      options.onActiveChange?.(index, { item: items[index], card: cards[index], previousIndex, reason: changeReason });
    }
  }

  function scheduleActive() {
    if (scrollFrame || disposed) return;
    scrollFrame = requestAnimationFrame(() => {
      scrollFrame = 0;
      if (reel.clientWidth > 0) {
        updateVisuals();
        setActiveCard(closestIndex());
      }
    });
  }

  function settle() {
    clearTimeout(settleTimer);
    if (disposed || animationFrame || waitingForMedia || pointer?.dragging) return;
    updateVisuals();
    if (reel.clientWidth > 0) setActiveCard(closestIndex());
    pendingIndex = null;
    reel.dataset.controlled = 'false';
    setMotion(false, activeIndex);
  }

  function goTo(index, { behavior = 'smooth', reason: requestedReason = 'api' } = {}) {
    if (disposed || !cards.length) return;
    cancelAnimationFrame(layoutFrame);
    layoutFrame = 0;
    clearNavigation({ releaseControl: false });
    if (moving) {
      updateVisuals();
      setActiveCard(closestIndex());
      setMotion(false, activeIndex);
    }
    reason = requestedReason;
    pendingIndex = clampIndex(index);
    const targetIndex = pendingIndex;
    const ticket = navigationTicket;
    reel.dataset.controlled = 'true';
    const begin = () => {
      if (disposed || ticket !== navigationTicket) return;
      waitingForMedia = false;
      root.removeAttribute('aria-busy');
      if (reel.clientWidth === 0) {
        setActiveCard(targetIndex, reason);
        pendingIndex = null;
        reel.dataset.controlled = 'false';
        return;
      }
      updateReelInsets();
      const start = reel.scrollLeft;
      const target = centeredPosition(targetIndex);
      const distance = target - start;
      if (reducedMotion.matches || behavior !== 'smooth' || Math.abs(distance) < .5) {
        ignoreScrollUntil = performance.now() + 80;
        reel.scrollLeft = target;
        updateVisuals();
        setActiveCard(targetIndex, reason);
        settle();
        return;
      }
      const stride = geometry[targetIndex].width || reel.clientWidth;
      const duration = Math.max(240, Math.min(520, 480 * Math.sqrt(Math.abs(distance) / stride)));
      const started = performance.now();
      setMotion(true, targetIndex);
      const animate = now => {
        if (disposed || ticket !== navigationTicket) return;
        const progress = Math.min(1, (now - started) / duration);
        const eased = 1 - Math.pow(1 - progress, 3);
        reel.scrollLeft = start + distance * eased;
        updateVisuals();
        setActiveCard(closestIndex());
        if (progress < 1) animationFrame = requestAnimationFrame(animate);
        else {
          animationFrame = 0;
          ignoreScrollUntil = now + 80;
          settle();
        }
      };
      animationFrame = requestAnimationFrame(animate);
    }
    let preparation;
    try { preparation = options.onNavigationIntent?.(targetIndex, { item: items[targetIndex], card: cards[targetIndex], reason }); }
    catch { /* A media preparation failure must not disable navigation. */ }
    if (preparation && typeof preparation.then === 'function') {
      waitingForMedia = true;
      root.setAttribute('aria-busy', 'true');
      Promise.resolve(preparation).then(begin, begin);
    } else begin();
  }

  function step(direction, changeReason) {
    const current = pendingIndex ?? Math.max(activeIndex, 0);
    goTo(current + direction, { reason: changeReason });
  }

  function refresh() {
    if (disposed) return;
    const selected = clampIndex(pendingIndex ?? Math.max(activeIndex, 0));
    clearNavigation();
    setMotion(false, activeIndex);
    cancelAnimationFrame(layoutFrame);
    layoutFrame = requestAnimationFrame(() => {
      layoutFrame = 0;
      if (reel.clientWidth === 0 || !cards.length) return;
      const index = selected;
      updateReelInsets();
      ignoreScrollUntil = performance.now() + 80;
      reel.scrollLeft = centeredPosition(index);
      updateVisuals();
      setActiveCard(index, reason);
      pendingIndex = null;
    });
  }

  function setItems(nextItems, { index = 0 } = {}) {
    if (disposed) return;
    if (!Array.isArray(nextItems)) throw new TypeError('Demo deck items must be an array.');
    clearNavigation();
    setMotion(false, activeIndex);
    cancelAnimationFrame(layoutFrame);
    cancelAnimationFrame(scrollFrame);
    scrollFrame = 0;
    const oldPointerId = pointer?.id;
    pointer = null;
    if (oldPointerId !== undefined && reel.hasPointerCapture(oldPointerId)) reel.releasePointerCapture(oldPointerId);
    reel.dataset.dragging = 'false';
    const revision = ++itemRevision;
    geometry = [];
    lastDragIntent = -1;
    items = nextItems.slice();
    activeIndex = -1;
    pendingIndex = items.length ? clampIndex(index) : null;
    reason = 'items';
    cards = items.map((item, cardIndex) => {
      const card = element('article', 'demo-deck-card');
      card.dataset.index = String(cardIndex);
      card.dataset.active = 'false';
      card.setAttribute('role', 'group');
      card.setAttribute('aria-roledescription', 'slide');
      card.setAttribute('aria-label', `${cardIndex + 1} of ${items.length}`);
      const content = element('div', 'demo-deck-content');
      const rendered = options.renderCard?.(item, cardIndex);
      if (rendered instanceof HTMLElement) content.append(rendered);
      else content.append(element('div', 'demo-deck-default-card', item.title || item.label || `Demonstration ${cardIndex + 1}`));
      content.inert = true;
      content.setAttribute('aria-hidden', 'true');
      const preview = element('button', 'demo-deck-preview');
      preview.type = 'button';
      preview.tabIndex = -1;
      preview.setAttribute('aria-label', `View ${item.title || item.label || `video ${cardIndex + 1}`}`);
      card.append(content, preview);
      return card;
    });
    reel.replaceChildren(...cards);
    previous.disabled = next.disabled = !cards.length;
    previous.hidden = next.hidden = cards.length < 2;
    hint.hidden = cards.length < 2;
    status.textContent = cards.length ? '' : 'No demonstrations';
    reel.tabIndex = cards.length ? 0 : -1;
    const initial = pendingIndex;
    queueMicrotask(() => {
      if (!disposed && revision === itemRevision && initial !== null) setActiveCard(initial, 'items');
    });
    refresh();
  }

  previous.addEventListener('click', () => step(-1, 'button'), { signal });
  next.addEventListener('click', () => step(1, 'button'), { signal });
  reel.addEventListener('scroll', () => {
    if (animationFrame || waitingForMedia) return;
    if (!moving && performance.now() > ignoreScrollUntil) setMotion(true);
    scheduleActive();
    clearTimeout(settleTimer);
    settleTimer = setTimeout(settle, 150);
  }, { passive: true, signal });
  reel.addEventListener('scrollend', settle, { signal });
  reel.addEventListener('wheel', event => {
    if (!event.deltaX && !event.shiftKey) return;
    clearNavigation();
    reason = 'wheel';
    pendingIndex = null;
    ignoreScrollUntil = 0;
    setMotion(true, activeIndex);
    settleTimer = setTimeout(settle, 150);
  }, { passive: true, signal });
  reel.addEventListener('keydown', event => {
    if (isInteractive(event.target) || !cards.length) return;
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    if (event.key === 'Home') goTo(0, { reason: 'keyboard' });
    else if (event.key === 'End') goTo(cards.length - 1, { reason: 'keyboard' });
    else step(event.key === 'ArrowRight' ? 1 : -1, 'keyboard');
  }, { signal });
  reel.addEventListener('click', event => {
    if (performance.now() < suppressClickUntil) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    const preview = event.target.closest('.demo-deck-preview');
    if (preview) goTo(Number(preview.parentElement.dataset.index), { reason: 'preview' });
  }, { capture: true, signal });

  // Psi0's pointer drag adapted to preserve vertical page scrolling and controls.
  reel.addEventListener('pointerdown', event => {
    if (event.button !== 0 || !event.isPrimary || isInteractive(event.target) || cards.length < 2) return;
    if (animationFrame || waitingForMedia) {
      clearNavigation({ releaseControl: false });
      setMotion(false, activeIndex);
      pendingIndex = null;
    }
    pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, left: reel.scrollLeft, dragging: false };
    lastDragIntent = -1;
  }, { signal });
  reel.addEventListener('pointermove', event => {
    if (!pointer || pointer.id !== event.pointerId) return;
    const deltaX = event.clientX - pointer.x;
    const deltaY = event.clientY - pointer.y;
    if (!pointer.dragging) {
      if (Math.abs(deltaY) > 8 && Math.abs(deltaY) > Math.abs(deltaX)) {
        pointer = null;
        settle();
        return;
      }
      if (Math.abs(deltaX) < 6) return;
      pointer.dragging = true;
      pendingIndex = null;
      reason = 'drag';
      reel.dataset.dragging = 'true';
      reel.dataset.controlled = 'false';
      reel.setPointerCapture(event.pointerId);
      setMotion(true, activeIndex);
    }
    if (event.cancelable) event.preventDefault();
    reel.scrollLeft = pointer.left - deltaX;
    const nearby = closestIndex();
    const intent = clampIndex(nearby + (deltaX < 0 ? 1 : -1));
    if (intent !== lastDragIntent) {
      lastDragIntent = intent;
      try {
        Promise.resolve(options.onNavigationIntent?.(intent, { item: items[intent], card: cards[intent], reason: 'drag' })).catch(() => {});
      } catch { /* Dragging remains available if preparation fails. */ }
    }
  }, { signal });
  function endDrag(event) {
    if (!pointer || pointer.id !== event.pointerId) return;
    const dragged = pointer.dragging;
    pointer = null;
    if (dragged) reel.dataset.controlled = 'true';
    reel.dataset.dragging = 'false';
    if (reel.hasPointerCapture(event.pointerId)) reel.releasePointerCapture(event.pointerId);
    if (dragged) {
      suppressClickUntil = performance.now() + 350;
      goTo(closestIndex(), { reason: 'drag' });
    } else settle();
  }
  window.addEventListener('pointerup', endDrag, { signal });
  window.addEventListener('pointercancel', endDrag, { signal });
  reel.addEventListener('lostpointercapture', endDrag, { signal });
  reel.addEventListener('dragstart', event => event.preventDefault(), { signal });

  const resizeObserver = new ResizeObserver(refresh);
  resizeObserver.observe(reel);
  reducedMotion.addEventListener('change', refresh, { signal });

  const api = {
    setItems,
    goTo,
    prev: () => step(-1, 'api'),
    next: () => step(1, 'api'),
    getActiveIndex: () => activeIndex,
    getActiveCard: () => cards[activeIndex] || null,
    refresh,
    destroy() {
      if (disposed) return;
      clearNavigation();
      setMotion(false, activeIndex);
      const oldPointerId = pointer?.id;
      pointer = null;
      if (oldPointerId !== undefined && reel.hasPointerCapture(oldPointerId)) reel.releasePointerCapture(oldPointerId);
      disposed = true;
      controller.abort();
      resizeObserver.disconnect();
      clearTimeout(settleTimer);
      cancelAnimationFrame(scrollFrame);
      cancelAnimationFrame(layoutFrame);
      mountedDecks.delete(root);
      root.replaceChildren();
      root.classList.remove('demo-deck');
      root.removeAttribute('role');
      root.removeAttribute('aria-roledescription');
      root.removeAttribute('aria-label');
    },
  };
  mountedDecks.set(root, api);
  setItems(options.items || [], { index: options.initialIndex || 0 });
  return api;
}

export const mountDemoDeck = createDemoDeck;
