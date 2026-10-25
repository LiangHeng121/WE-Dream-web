/* The three treatments show the same training rule; none is a deployment mode. */
const NS = 'http://www.w3.org/2000/svg';
const ORDER = ['C', 'V', 'A', 'S'];
const SYMBOLS = { C: 'C', V: 'V\u0303', A: 'A\u0303', S: 'S' };
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
  const scale = Math.min(width / 354, height / 340);
  const group = el('g', {
    class: 'wd-route-motion',
    transform: `translate(${x + (width - 354 * scale) / 2} ${y + (height - 340 * scale) / 2}) scale(${scale})`,
    'data-routing-variant': variant,
    'data-routing-probability': '0.5',
    role: 'img',
    'aria-label': 'Training attention, with rows as queries and columns as keys. C is past visual context; V tilde is noisy future video; A tilde is noisy action; S is state. Only action queries attending to future-video keys are sampled with probability 0.5. Checkmarks mean enabled attention; blank cells are masked.',
  }, parent);
  const defs = el('defs', {}, group);
  const gradients = {
    allow: ['#e4f1f6', '#dce9f1', '#e8e7f7'],
    route: ['#dcecf5', '#e7dbf4', '#f4e4ed'],
    enabled: ['#edeafb', '#e0def6', '#e8e7f8'],
    critical: ['#fff0db', '#f9d8b5', '#fae4d3'],
    mask: ['#f8f8fd', '#eceaf5', '#f6eff7'],
  };
  Object.entries(gradients).forEach(([name, colors]) => {
    const gradient = el('linearGradient', { id: `${id}-${name}`, x1: '0%', y1: '0%', x2: '100%', y2: '100%' }, defs);
    colors.forEach((color, i) => el('stop', { offset: `${i * 50}%`, 'stop-color': color, 'stop-opacity': .86 }, gradient));
  });
  const header = rounded(group, 116, 0, 122, 36, { rx: 18, fill: `url(#${id}-route)` });
  text(group, 'p = 0.5', 177, 24, 20);
  text(group, 'sampled per training microbatch', 177, 56, 13, { fill: '#8a9aaf' });

  const badges = el('g', { 'aria-hidden': 'true' }, group);
  const badgeA = rounded(badges, 33, 285, 136, 31, { rx: 15.5, fill: `url(#${id}-allow)` });
  const badgeB = rounded(badges, 185, 285, 136, 31, { rx: 15.5, fill: `url(#${id}-mask)` });
  text(badges, '50% access', 101, 305, 14);
  text(badges, '50% masked', 253, 305, 14, { fill: '#8b7c9b' });
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
    const cell = 35, gap = 5, gx = 103, gy = 96;
    const grid = el('g', { 'data-attention-matrix': 'C,V~,A~,S' }, group);
    text(group, 'Keys', 181, 75, 12, { fill: '#96a3b5' });
    text(group, 'Queries', 60, 174, 12, { fill: '#96a3b5', transform: 'rotate(-90 60 174)' });
    ORDER.forEach((name, i) => {
      text(group, SYMBOLS[name], gx + i * (cell + gap) + cell / 2, gy - 8, 15, { fill: '#6e829e' });
      text(group, SYMBOLS[name], gx - 17, gy + i * (cell + gap) + cell / 2 + 5, 15, { fill: '#6e829e' });
    });
    let routed, halo, routedCheck;
    ORDER.forEach((query, row) => ORDER.forEach((key, column) => {
      const switched = query === 'A' && key === 'V';
      const visible = row === 0 ? column === 0 : row === 1 ? true : row === 2 ? column !== 1 : column === 3;
      const cx = gx + column * (cell + gap), cy = gy + row * (cell + gap);
      if (switched) halo = rounded(grid, cx - 5, cy - 5, cell + 10, cell + 10, { rx: 13, fill: `url(#${id}-critical)`, stroke: 'none' });
      // The paper marks the single routed A-query / V-key edge in orange.
      // All other enabled entries remain fixed and masked entries stay blank.
      if (switched) rounded(grid, cx, cy, cell, cell, { rx: 9, fill: '#ffffff', 'fill-opacity': 1, stroke: 'none' });
      const node = rounded(grid, cx, cy, cell, cell, { rx: 9, fill: switched ? `url(#${id}-critical)` : visible ? `url(#${id}-enabled)` : '#ffffff', 'fill-opacity': visible || switched ? .95 : .85, stroke: switched ? '#dda46d' : '#d8deeb', 'stroke-opacity': switched ? .9 : .55, 'data-query': query, 'data-key': key, 'data-visible': visible ? 'true' : 'false', ...(switched ? { 'data-routed-cell': 'true' } : {}) });
      let check;
      if (visible || switched) check = el('path', { d: `M${cx + 10} ${cy + 18} L${cx + 15} ${cy + 23} L${cx + 25} ${cy + 12}`, fill: 'none', stroke: switched ? '#a56f43' : '#7389aa', 'stroke-width': 1.8, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' }, grid);
      if (switched) {
        routed = node;
        routedCheck = check;
      }
    }));
    text(group, 'A\u0303 → V\u0303 routed dependency', 177, 269, 14, { fill: '#9a7a60' });
    // Keep notation close to the matrix instead of using an unrelated input list.
    badges.setAttribute('transform', 'translate(0 -9)');
    badgeA.setAttribute('x', '28');
    badgeA.setAttribute('width', '143');
    badgeB.setAttribute('x', '183');
    badgeB.setAttribute('width', '143');
    text(group, 'C past visual context · S state', 177, 321, 11.5, { fill: '#8b99ae' });
    text(group, 'V\u0303 noisy future video · A\u0303 noisy action', 177, 337, 11.5, { fill: '#8b99ae' });
    animate = ({ time, still }) => {
      const light = still ? .5 : .5 + .5 * Math.cos(time / 4000 * Math.PI * 2);
      setOpacity(halo, still ? .25 : .04 + light * .5);
      routed.setAttribute('fill-opacity', String(light * .95));
      routed.setAttribute('stroke-width', String(1 + light * .4));
      routed.setAttribute('data-visible', still ? 'sampled' : light >= .5 ? 'true' : 'false');
      setOpacity(routedCheck, still ? .55 : clamp((light - .25) / .5));
      setOpacity(badgeA, still ? 1 : .45 + light * .55);
      setOpacity(badgeB, still ? 1 : 1 - light * .55);
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
