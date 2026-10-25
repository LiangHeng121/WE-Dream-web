/* The three treatments show the same training rule; none is a deployment mode. */
const NS = 'http://www.w3.org/2000/svg';
const ORDER = ['C', 'V', 'A', 'S'];
let count = 0;

function el(tag, attributes, parent) {
  const node = document.createElementNS(NS, tag);
  Object.entries(attributes || {}).forEach(([key, value]) => node.setAttribute(key, value));
  parent.append(node);
  return node;
}
function text(parent, value, x, y, size = 15, extra = {}) {
  const node = el('text', { x, y, 'text-anchor': 'middle', ...extra }, parent);
  node.style.cssText = `font-family:inherit;font-size:${size}px;font-weight:500;fill:${extra.fill || '#587489'};letter-spacing:-.015em;`;
  node.textContent = value;
  return node;
}
function rounded(parent, x, y, width, height, extra = {}) {
  return el('rect', { x, y, width, height, rx: 13, fill: '#ffffff', 'fill-opacity': .65, stroke: '#ffffff', 'stroke-opacity': .9, 'stroke-width': 1, ...extra }, parent);
}
const setOpacity = (node, opacity) => node.setAttribute('opacity', opacity.toFixed(3));
const clamp = value => Math.max(0, Math.min(1, value));

/** time is milliseconds; still exposes both outcomes without changing the mask. */
export function createRoutingVisual(parent, { prefix = 'wd-route', x = 0, y = 0, width = 354, height = 340, mobile = false, variant = 'pulse' } = {}) {
  const id = `${prefix}-routing-${++count}`;
  const scale = Math.min(width / 354, height / 360);
  const group = el('g', {
    class: 'wd-route-motion',
    transform: `translate(${x + (width - 354 * scale) / 2} ${y + (height - 360 * scale) / 2}) scale(${scale})`,
    'data-routing-variant': variant,
    'data-routing-probability': '0.5',
    role: 'img',
    'aria-label': 'Rows are queries, columns are keys. C is observed visual context; V and A are noisy future-video and action tokens; S is state. Each local microbatch samples future-video access with probability 0.5. Only action queries attending to future-video keys change. Both training losses remain.',
  }, parent);
  const defs = el('defs', {}, group);
  const gradients = {
    allow: ['#e4f1f6', '#dce9f1', '#e8e7f7'],
    route: ['#dcecf5', '#e7dbf4', '#f4e4ed'],
    critical: ['#e5ddf5', '#cbb7e3', '#f0daeb'],
    muted: ['#ddeaf2', '#bed0df', '#e2e8f2'],
    mask: ['#f8f8fd', '#eceaf5', '#f6eff7'],
  };
  Object.entries(gradients).forEach(([name, colors]) => {
    const gradient = el('linearGradient', { id: `${id}-${name}`, x1: '0%', y1: '0%', x2: '100%', y2: '100%' }, defs);
    colors.forEach((color, i) => el('stop', { offset: `${i * 50}%`, 'stop-color': color, 'stop-opacity': .86 }, gradient));
  });
  const header = rounded(group, 116, 0, 122, 36, { rx: 18, fill: `url(#${id}-route)` });
  text(group, 'p = 0.5', 177, 24, 20);
  text(group, 'sampled per microbatch', 177, 56, 14, { fill: '#8a9aaf' });

  const badges = el('g', { 'aria-hidden': 'true' }, group);
  const badgeY = variant === 'pulse' ? 304 : 292;
  const badgeA = el('g', { 'data-route-badge': 'access' }, badges);
  const badgeB = el('g', { 'data-route-badge': 'masked' }, badges);
  rounded(badgeA, 33, badgeY, 136, 31, { rx: 15.5, fill: `url(#${id}-critical)`, 'fill-opacity': .95, stroke: '#b397ce', 'stroke-opacity': .8 });
  rounded(badgeB, 185, badgeY, 136, 31, { rx: 15.5, fill: `url(#${id}-muted)`, 'fill-opacity': .95, stroke: '#94afc4', 'stroke-opacity': .8 });
  const badgeLabelA = text(badgeA, '50% access', 101, badgeY + 20, 14, { fill: '#765c91' });
  const badgeLabelB = text(badgeB, '50% masked', 253, badgeY + 20, 14, { fill: '#5e768b' });
  [badgeLabelA, badgeLabelB].forEach(node => { node.style.fontWeight = '600'; });
  let animate = () => {};

  if (variant === 'gate') {
    rounded(group, 25, 84, 304, 180, { rx: 26, fill: `url(#${id}-mask)`, 'fill-opacity': .35, stroke: 'none' });
    const baseline = el('path', { d: 'M78 172 H276', fill: 'none', stroke: '#c1d1df', 'stroke-width': 1.6, 'stroke-linecap': 'round' }, group);
    const source = el('g', {}, group);
    [0, 1, 2].forEach(i => rounded(source, 41 + i * 8, 143 - i * 5, 45, 48, { rx: 11, fill: `url(#${id}-allow)`, 'fill-opacity': .9 }));
    const target = el('g', {}, group);
    [0, 1, 2].forEach(i => rounded(target, 249 + i * 8, 143 - i * 5, 45, 48, { rx: 11, fill: `url(#${id}-route)`, 'fill-opacity': .9 }));
    text(group, 'Future video', 75, 225, 15);
    text(group, 'Action', 279, 225, 15);
    const gateHalo = rounded(group, 149, 129, 56, 84, { rx: 27, fill: `url(#${id}-route)`, stroke: 'none' });
    const gate = rounded(group, 159, 137, 36, 68, { rx: 18, fill: '#ffffff', 'fill-opacity': .9, stroke: '#ded7ed' });
    const gateTop = el('path', { d: 'M177 147 V164', fill: 'none', stroke: '#ab9fc3', 'stroke-width': 3, 'stroke-linecap': 'round' }, group);
    const gateBottom = el('path', { d: 'M177 180 V197', fill: 'none', stroke: '#ab9fc3', 'stroke-width': 3, 'stroke-linecap': 'round' }, group);
    const gap = el('path', { d: 'M177 164 V180', fill: 'none', stroke: '#ab9fc3', 'stroke-width': 3, 'stroke-linecap': 'round' }, group);
    const dots = Array.from({ length: 3 }, () => el('circle', { cx: 103, cy: 172, r: 4, fill: '#a5bad4', stroke: 'white', 'stroke-width': 1.5 }, group));
    text(group, 'One dependency. Two training routes.', 177, 253, 13, { fill: '#8a9aaf' });
    animate = ({ time, still }) => {
      const phase = (time % 4800) / 4800;
      const open = still ? .5 : clamp(Math.cos(phase * Math.PI * 2) * 2 + .5);
      setOpacity(gateHalo, .3 + open * .5);
      setOpacity(gap, 1 - open);
      gateTop.setAttribute('transform', `translate(0 ${-open * 7})`);
      gateBottom.setAttribute('transform', `translate(0 ${open * 7})`);
      dots.forEach((dot, i) => {
        const travel = ((time / 1300 + i / 3) % 1 + 1) % 1;
        dot.setAttribute('cx', still ? 115 + i * 62 : 103 + travel * 146);
        setOpacity(dot, still ? .35 : open * Math.sin(travel * Math.PI) * .9);
      });
      setOpacity(badgeA, still ? 1 : .45 + open * .55);
      setOpacity(badgeB, still ? 1 : 1 - open * .55);
    };
    // Keep the baseline visible; a closed gate masks access, not video generation.
    baseline.setAttribute('data-constant', 'training-video-branch');
    gate.setAttribute('data-edge', 'future-video-to-action');
  } else if (variant === 'batches') {
    const samples = [true, false, false, true, false, true];
    const batchNodes = [];
    text(group, 'Independent route samples', 177, 92, 15);
    samples.forEach((allowed, i) => {
      const px = 24 + i * 52;
      const batch = el('g', { 'data-microbatch': i + 1, 'data-future-access': String(allowed) }, group);
      rounded(batch, px, 113, 46, 65, { rx: 15, fill: `url(#${id}-${allowed ? 'allow' : 'mask'})`, 'fill-opacity': .8 });
      text(batch, `0${i + 1}`, px + 23, 137, 13, { fill: '#8a9aaf' });
      if (allowed) el('path', { d: `M${px + 14} 156 L${px + 21} 162 L${px + 32} 150`, fill: 'none', stroke: '#93adbb', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, batch);
      else el('path', { d: `M${px + 17} 161 L${px + 29} 150`, stroke: '#ad9ac0', 'stroke-width': 2, 'stroke-linecap': 'round' }, batch);
      batchNodes.push(batch);
    });
    const cursor = rounded(group, 23, 112, 48, 67, { rx: 16, fill: 'none', stroke: '#9eacc5', 'stroke-width': 1.5, 'stroke-opacity': .7 });
    const pointer = el('circle', { cx: 47, cy: 190, r: 3, fill: '#a89cc3' }, group);
    text(group, 'microbatches', 177, 213, 13, { fill: '#8a9aaf' });
    const outcome = text(group, 'future-video access', 177, 248, 17);
    animate = ({ time, still }) => {
      const index = Math.floor(time / 1600) % samples.length;
      const inside = (time % 1600) / 1600;
      const pulse = Math.sin(inside * Math.PI);
      const previous = (index + samples.length - 1) % samples.length;
      const move = clamp(inside * 4);
      const eased = move * move * (3 - 2 * move);
      const position = (time < 1600 ? 0 : previous + (index - previous) * eased) * 52;
      cursor.setAttribute('transform', `translate(${position} 0)`);
      pointer.setAttribute('cx', 47 + position);
      setOpacity(cursor, still ? 0 : .6 + .4 * pulse);
      setOpacity(pointer, still ? 0 : .7);
      batchNodes.forEach((node, i) => setOpacity(node, still || i === index ? 1 : .55));
      const value = still ? 'One route per microbatch' : samples[index] ? 'future-video access' : 'future-video masked';
      if (outcome.textContent !== value) outcome.textContent = value;
      setOpacity(badgeA, still || samples[index] ? 1 : .45);
      setOpacity(badgeB, still || !samples[index] ? 1 : .45);
    };
    text(group, 'Illustrative samples · not a fixed schedule', 177, 336, 12, { fill: '#96a3b5' });
  } else {
    const cell = 35, gap = 6, gx = 103, gy = 112;
    const grid = el('g', { 'data-attention-matrix': 'C,V,A,S' }, group);
    text(group, 'Keys', 182, 84, 12, { fill: '#8196aa' });
    text(group, 'Queries', 52, 191, 12, { fill: '#8196aa', transform: 'rotate(-90 52 191)', 'dominant-baseline': 'middle' });
    ORDER.forEach((name, i) => {
      const meaning = { C: 'Observed visual context', V: 'Noisy future-video tokens', A: 'Noisy action tokens', S: 'State tokens' }[name];
      const column = text(group, name, gx + i * (cell + gap) + cell / 2, gy - 8, 16, { fill: '#7289a2' });
      const row = text(group, name, gx - 17, gy + i * (cell + gap) + cell / 2 + 5, 16, { fill: '#7289a2' });
      [column, row].forEach(node => { el('title', {}, node).textContent = meaning; });
    });
    let routed, halo, slash;
    ORDER.forEach((query, row) => ORDER.forEach((key, column) => {
      const switched = query === 'A' && key === 'V';
      const visible = row === 0 ? column === 0 : row === 1 ? true : row === 2 ? column !== 1 : column === 3;
      const cx = gx + column * (cell + gap), cy = gy + row * (cell + gap);
      if (switched) halo = rounded(grid, cx - 5, cy - 5, cell + 10, cell + 10, { rx: 13, fill: `url(#${id}-critical)`, stroke: 'none' });
      const node = rounded(grid, cx, cy, cell, cell, { rx: 9, fill: switched ? `url(#${id}-critical)` : visible ? `url(#${id}-allow)` : '#ffffff', 'fill-opacity': visible || switched ? .95 : .5, stroke: switched ? '#b397ce' : '#ffffff', 'stroke-opacity': .86, 'data-query': query, 'data-key': key, 'data-visible': visible ? 'true' : 'false', ...(switched ? { 'data-routed-cell': 'true' } : {}) });
      if (switched) {
        routed = node;
        slash = el('path', { d: `M${cx + 10} ${cy + 21} L${cx + 21} ${cy + 10}`, stroke: '#8da0b3', 'stroke-width': 1.5, 'stroke-linecap': 'round' }, grid);
      }
    }));
    text(group, 'Future video → action', 177, 291, 16);
    text(group, 'C context · V video · A action · S state', 177, 356, 12, { fill: '#8295aa' });
    animate = ({ time, still }) => {
      // Hold each sampled route clearly, with a short smooth change between them.
      const light = still ? .5 : clamp(.5 + 2 * Math.cos(time / 4000 * Math.PI * 2));
      setOpacity(halo, still ? .45 : .08 + light * .82);
      routed.setAttribute('fill-opacity', String(.08 + light * .92));
      routed.setAttribute('stroke-width', String(1 + light * .8));
      routed.setAttribute('stroke', light >= .5 ? '#b397ce' : '#b4c2d0');
      routed.setAttribute('data-visible', still ? 'sampled' : light >= .5 ? 'true' : 'false');
      setOpacity(slash, still ? .5 : (1 - light) * .88);
      // Fade each entire badge, including its text, with the routed cell.
      setOpacity(badgeA, still ? 1 : .28 + light * .72);
      setOpacity(badgeB, still ? 1 : 1 - light * .72);
      badgeA.setAttribute('data-active', still ? 'sampled' : String(light >= .5));
      badgeB.setAttribute('data-active', still ? 'sampled' : String(light < .5));
    };
  }

  if (mobile) {
    group.querySelectorAll('text').forEach(node => {
      const size = parseFloat(node.style.fontSize);
      node.style.fontSize = `${size < 16 ? size + 3 : size * 1.12}px`;
    });
  }
  let destroyed = false;
  function render({ time = 0, still = false, active = true } = {}) {
    if (destroyed) return;
    // The parent owns frame scheduling, visibility and reduced-motion handling.
    animate({ time: active ? time : 0, still: still || !active });
    group.setAttribute('data-motion-state', still || !active ? 'still' : 'running');
  }
  render({ still: true });
  return { render, destroy() { destroyed = true; group.remove(); } };
}
