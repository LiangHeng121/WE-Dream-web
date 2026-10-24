// First-entry rhythm inspired by SIMPLE's section reveals.
// Animate stable module shells, keeping their existing layout and interactions.
export function mountScrollReveal(root = document) {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  if (!('IntersectionObserver' in window)) return { refresh() {} };
  const registered = new WeakSet();
  const pending = new Set();
  const running = new Map();
  const groups = [
    ['.section-heading', 0],
    ['#method-root', 100],
    ['#dataset-root .df-toolbar', 0],
    ['#dataset-root .df-composition', 60],
    ['#dataset-root .df-feature', 180],
    ['.gallery-main', 40],
    ['.gallery-aside', 160],
    ['#results-root', 100],
    ['.demo-chapter .eyebrow', 0],
    ['.demo-chapter h2', 60],
    ['.demo-chapter .wrap > p:not(.eyebrow)', 120],
    ['.chapter-links', 180],
    ['.resources-inner > div', 0],
    ['.resources-inner > .paper-card', 120]
  ];

  function finish(element) {
    clearTimeout(running.get(element));
    running.delete(element);
    element.dataset.scrollReveal = 'done';
  }
  function reveal(element, immediate = false) {
    pending.delete(element);
    observer.unobserve(element);
    if (immediate || reduced.matches) { finish(element); return; }
    element.dataset.scrollReveal = 'entering';
    // Release temporary compositing even if transitionend is not dispatched.
    running.set(element, setTimeout(() => finish(element), 1100));
  }
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (entry.isIntersecting && pending.has(entry.target)) reveal(entry.target);
    }
  }, { threshold: 0, rootMargin: '0px 0px -8% 0px' });

  function refresh() {
    for (const [selector, delay] of groups) {
      for (const element of root.querySelectorAll(selector)) {
        if (registered.has(element) || !element.hasChildNodes()) continue;
        registered.add(element);
        element.style.setProperty('--reveal-delay', `${delay}ms`);
        // Content already passed during asynchronous loading stays visible.
        if (reduced.matches || element.getBoundingClientRect().bottom <= 0) {
          finish(element);
        } else {
          element.dataset.scrollReveal = 'pending';
          pending.add(element);
          observer.observe(element);
        }
      }
    }
  }
  root.addEventListener('transitionend', event => {
    if (event.propertyName === 'opacity' && running.has(event.target)) finish(event.target);
  });
  root.addEventListener('focusin', event => {
    const element = event.target.closest('[data-scroll-reveal]');
    if (element && (pending.has(element) || running.has(element))) reveal(element, true);
  });
  reduced.addEventListener('change', () => {
    if (!reduced.matches) return;
    for (const element of [...pending, ...running.keys()]) reveal(element, true);
  });
  refresh();
  return { refresh };
}
