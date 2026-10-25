/* Original WE-Dream overview. One permanent architecture, with focusable regions. */
export const METHOD_PARTS = [
  { key: 'pretrain', label: 'Latent-action pretraining', title: 'Learn from human video.', caption: 'A frozen latent action model turns visual transitions into targets for joint video and action learning.' },
  { key: 'posttrain', label: 'Robot post-training', title: 'Adapt to humanoid control.', caption: 'Transfer the pretrained weights and jointly optimize the model on robot demonstrations.' },
  { key: 'routing', label: 'Routed attention', title: 'Two routes. Shared weights.', caption: 'Both training stages share this model. Only actions’ access to future video changes; both losses remain.' },
  { key: 'deploy', label: 'Action-only deployment', title: 'Predict while the robot moves.', caption: 'Use observed context to predict action chunks, overlapping prediction and execution.' },
];

const NS = 'http://www.w3.org/2000/svg';
const PALETTE = ['#a290c5', '#78a9c3', '#929cc6', '#72ae9e'];
let instance = 0;
function el(tag, attrs, parent) {
  const node = document.createElementNS(NS, tag);
  Object.entries(attrs || {}).forEach(([key, value]) => node.setAttribute(key, value));
  parent?.append(node);
  return node;
}
function text(parent, value, x, y, attrs = {}) {
  const node = el('text', { x, y, ...attrs }, parent);
  node.textContent = value;
  return node;
}
function shape(parent, x, y, width, height, attrs = {}) {
  return el('rect', { x, y, width, height, rx: 15, class: 'wd-node', ...attrs }, parent);
}
function frame(parent, x, y, human, scale = 1) {
  const g = el('g', { transform: `translate(${x} ${y}) scale(${scale})` }, parent);
  el('rect', { width: 84, height: 56, rx: 12, fill: '#f7fafb', stroke: '#cadbe3' }, g);
  el('path', { d: 'M9 42 H75', fill: 'none', stroke: '#c4d8e1', 'stroke-width': 2 }, g);
  el('ellipse', { cx: 62, cy: 39, rx: 12, ry: 4, fill: '#dfefe8', stroke: '#b2d0c3' }, g);
  const object = el('rect', { x: 37, y: 31, width: 12, height: 10, rx: 3, fill: '#b7acd6' }, g);
  const arm = el('g', {}, g);
  el('path', { d: human ? 'M15 10 Q21 18 25 20 Q32 21 38 27' : 'M15 11 L24 22 L38 24 L41 30', fill: 'none', stroke: human ? '#b7a0c9' : '#83acc3', 'stroke-width': 6, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, arm);
  if (human) el('path', { d: 'M37 26 Q40 25 42 29 L46 32 M40 29 L42 34 M37 28 L38 34 M35 26 L34 31', fill: 'none', stroke: '#b7a0c9', 'stroke-width': 2.2, 'stroke-linecap': 'round' }, arm);
  else {
    el('circle', { cx: 24, cy: 22, r: 4, fill: '#f7fbfd', stroke: '#83acc3', 'stroke-width': 2 }, arm);
    el('path', { d: 'M37 29 L37 34 M44 28 L45 33', fill: 'none', stroke: '#6b8fa5', 'stroke-width': 2, 'stroke-linecap': 'round' }, arm);
  }
  return { arm, object };
}

function geometry(mobile) {
  return mobile ? {
    viewBox: [0, 0, 600, 1970],
    parts: [
      { x: 20, y: 20, w: 560, h: 270 },
      { x: 20, y: 326, w: 560, h: 270 },
      { x: 20, y: 652, w: 560, h: 580 },
      { x: 20, y: 1288, w: 560, h: 662 },
    ],
    video: { x: 50, y: 1654, width: 500, height: 281.25 },
  } : {
    viewBox: [0, 0, 1200, 660],
    parts: [
      { x: 18, y: 22, w: 310, h: 270 },
      { x: 18, y: 316, w: 310, h: 322 },
      { x: 374, y: 22, w: 380, h: 616 },
      { x: 800, y: 22, w: 382, h: 616 },
    ],
    video: { x: 824, y: 430, width: 334, height: 187.875 },
  };
}

export function createMethodDiagram(host, { onFocus } = {}) {
  const prefix = `wd-overview-${++instance}`;
  const svg = el('svg', { class: 'wd-diagram', role: 'group', 'aria-label': 'WE-Dream complete architecture: human pretraining, robot post-training, shared routed attention, and action-only deployment.', preserveAspectRatio: 'xMidYMid meet' }, host);
  svg.style.cssText = 'display:block;width:100%;height:auto;overflow:visible;';
  const defs = el('defs', {}, svg);
  PALETTE.forEach((tint, i) => {
    const gradient = el('linearGradient', { id: `${prefix}-panel-${i}`, x1: '0%', y1: '0%', x2: '100%', y2: '100%' }, defs);
    el('stop', { offset: '0%', 'stop-color': '#ffffff', 'stop-opacity': '.92' }, gradient);
    el('stop', { offset: '100%', 'stop-color': ['#eee8f8', '#e8f3f9', '#eaedf9', '#e5f3ee'][i], 'stop-opacity': '.78' }, gradient);
    const marker = el('marker', { id: `${prefix}-arrow-${i}`, markerWidth: 7, markerHeight: 7, refX: 6, refY: 3.5, orient: 'auto', markerUnits: 'userSpaceOnUse' }, defs);
    el('path', { d: 'M0 0 L7 3.5 L0 7', fill: 'none', stroke: tint, 'stroke-width': 1.35, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, marker);
  });
  const style = el('style', {}, svg);
  style.textContent = `
    .wd-diagram text{font-family:inherit;fill:#4d6c80;font-size:18px;font-weight:500;letter-spacing:-.02em}
    .wd-diagram .wd-part{cursor:pointer;transition:opacity .28s ease}
    .wd-diagram .wd-part:focus{outline:none}
    .wd-diagram .wd-part:focus-visible .wd-panel{stroke-width:2.5;stroke:#86a9bd}
    .wd-diagram .wd-panel{stroke:#d8e1ed;stroke-width:1;transition:stroke .28s,stroke-width .28s}
    .wd-diagram .wd-part-number{font-size:13px;letter-spacing:.14em;fill:#8d9fb0}
    .wd-diagram .wd-part-title{font-size:20px;font-weight:600}
    .wd-diagram .wd-small{font-size:14px;fill:#8b9ead;font-weight:400;letter-spacing:0}
    .wd-diagram .wd-core-title{font-size:20px;font-weight:600}
    .wd-diagram .wd-token-label{font-size:17px;fill:#7892a5;font-weight:400}
    .wd-diagram .wd-node{fill:#fcfdff;fill-opacity:.9;stroke:#d1deea;stroke-width:1.2}
    .wd-diagram .wd-wire{fill:none;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round}
    .wd-diagram .wd-flow-dot{stroke:#fff;stroke-width:1.5}
    .wd-diagram[data-mobile="true"] text{font-size:23px}
    .wd-diagram[data-mobile="true"] .wd-part-title{font-size:25px}
    .wd-diagram[data-mobile="true"] .wd-core-title{font-size:25px}
    .wd-diagram[data-mobile="true"] .wd-part-number{font-size:16px}
    .wd-diagram[data-mobile="true"] .wd-small{font-size:19px}
    .wd-diagram[data-mobile="true"] .wd-token-label{font-size:22px}
    @media(prefers-reduced-motion:reduce){.wd-diagram .wd-part,.wd-diagram .wd-panel{transition:none}}
  `;
  let content, parts = [], flows = [], frames = [], tokenRows = [], chunkCells = [], gate, routePath, routeStatus;
  let mobile = window.matchMedia('(max-width: 760px)').matches;
  let layout = geometry(mobile);
  let last = { focus: null, time: 0, route: 'joint', still: false };
  let destroyed = false;
  let previousFocus = Symbol();
  let previousRoute = null;

  function path(parent, d, part, { id, gated = false, opacity = .65, owners = [part] } = {}) {
    const g = el('g', { 'aria-hidden': 'true', ...(id ? { 'data-link': id } : {}) }, parent);
    const line = el('path', { d, class: 'wd-wire', stroke: PALETTE[part], 'stroke-opacity': opacity, 'marker-end': `url(#${prefix}-arrow-${part})` }, g);
    const dot = el('circle', { r: mobile ? 3.3 : 2.8, fill: PALETTE[part], class: 'wd-flow-dot' }, g);
    flows.push({ g, line, dot, part, owners, gated, length: null });
    return line;
  }
  function panel(index) {
    const p = layout.parts[index];
    const g = el('g', { class: 'wd-part', 'data-part': METHOD_PARTS[index].key, transform: `translate(${p.x} ${p.y})`, role: 'button', tabindex: 0, 'aria-label': `Focus ${METHOD_PARTS[index].label}` }, content);
    const bg = shape(g, 0, 0, p.w, p.h, { class: 'wd-panel', rx: 24, fill: `url(#${prefix}-panel-${index})` });
    text(g, `0${index + 1}`, 24, mobile ? 32 : 27, { class: 'wd-part-number' });
    text(g, METHOD_PARTS[index].label, 24, mobile ? 65 : 54, { class: 'wd-part-title' });
    g.addEventListener('click', () => onFocus?.(index));
    g.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onFocus?.(index); }
    });
    parts.push({ g, bg });
    return g;
  }
  function boxLabel(parent, id, x, y, w, h, title, sub = '', attrs = {}) {
    const g = el('g', { 'data-node': id }, parent);
    const rect = shape(g, x, y, w, h, attrs);
    text(g, title, x + w / 2, y + h / 2 + (sub ? -2 : 6), { 'text-anchor': 'middle' });
    if (sub) text(g, sub, x + w / 2, y + h / 2 + (mobile ? 24 : 19), { class: 'wd-small', 'text-anchor': 'middle' });
    return { g, rect };
  }
  function sourceFrames(parent, human, x, y, scale, part, gap = 12) {
    frames.push({ ...frame(parent, x, y, human, scale), part, offset: 0 });
    frames.push({ ...frame(parent, x + (84 + gap) * scale, y, human, scale), part, offset: 1 });
  }

  function drawPretrain() {
    const g = panel(0);
    if (mobile) {
      text(g, 'Human video', 119, 104, { 'text-anchor': 'middle', class: 'wd-token-label' });
      sourceFrames(g, true, 26, 124, 1.02, 0, 10);
      boxLabel(g, 'lam', 233, 127, 135, 65, 'Frozen', 'LAM', { 'stroke-dasharray': '4 4' });
      boxLabel(g, 'latent-targets', 397, 127, 135, 65, 'Latent', 'actions', { fill: '#f6f1fa', stroke: '#d4c5e2' });
      path(g, 'M215 159 H232', 0, { id: 'human-to-lam' });
      path(g, 'M369 159 H396', 0, { id: 'lam-to-latent' });
    } else {
      text(g, 'Human video', 155, 91, { 'text-anchor': 'middle', class: 'wd-token-label' });
      sourceFrames(g, true, 49, 106, 1.1, 0, 12);
      boxLabel(g, 'lam', 24, 192, 134, 51, 'Frozen LAM', '', { 'stroke-dasharray': '4 4' });
      boxLabel(g, 'latent-targets', 181, 192, 105, 51, 'Latent', 'actions', { fill: '#f6f1fa', stroke: '#d4c5e2' });
      path(g, 'M155 168 V175 Q155 182 148 182 H98 Q91 182 91 189', 0, { id: 'human-to-lam' });
      path(g, 'M159 217.5 H179', 0, { id: 'lam-to-latent' });
    }
  }
  function drawPosttrain() {
    const g = panel(1);
    if (mobile) {
      text(g, 'Robot demonstrations', 150, 104, { 'text-anchor': 'middle', class: 'wd-token-label' });
      sourceFrames(g, false, 45, 124, 1.15, 1, 10);
      boxLabel(g, 'robot-targets', 337, 127, 195, 65, 'Robot actions', '', { fill: '#eff6fa' });
      path(g, 'M260 159 H334', 1, { id: 'robot-to-action' });
      text(g, 'Adapt pretrained weights', 280, 235, { 'text-anchor': 'middle', class: 'wd-small' });
    } else {
      text(g, 'Robot demonstrations', 155, 100, { 'text-anchor': 'middle', class: 'wd-token-label' });
      sourceFrames(g, false, 49, 116, 1.1, 1, 12);
      boxLabel(g, 'robot-targets', 61, 207, 188, 52, 'Robot actions', '', { fill: '#eff6fa' });
      path(g, 'M155 180 V204', 1, { id: 'robot-to-action' });
      text(g, 'Adapt pretrained weights', 155, 292, { 'text-anchor': 'middle', class: 'wd-small' });
    }
  }
  function drawCore() {
    const g = panel(2);
    const core = mobile ? { x: 30, y: 110, w: 500, h: 300 } : { x: 24, y: 116, w: 332, h: 308 };
    text(g, 'Shared by both training stages', layout.parts[2].w / 2, mobile ? 94 : 83, { class: 'wd-small', 'text-anchor': 'middle' });
    const coreG = el('g', { 'data-node': 'core' }, g);
    shape(coreG, core.x + 3, core.y + 5, core.w, core.h, { fill: '#b8c7dd', 'fill-opacity': '.14', stroke: 'none', rx: 20 });
    shape(coreG, core.x, core.y, core.w, core.h, { fill: '#f6f8fd', stroke: '#c6d3e5', rx: 20 });
    text(coreG, 'Shared world–action model', layout.parts[2].w / 2, core.y + (mobile ? 37 : 35), { class: 'wd-core-title', 'text-anchor': 'middle' });
    const startX = mobile ? 65 : 51;
    const firstY = mobile ? 195 : 190;
    const rowGap = mobile ? 67 : 67;
    const cellWidth = mobile ? 37 : 23;
    const cellGap = mobile ? 9 : 5;
    const tokenWidth = cellWidth * 8 + cellGap * 7;
    ['Clean context', 'Noisy future video', 'Noisy actions'].forEach((title, i) => {
      const row = el('g', { 'data-token-row': ['context', 'video', 'action'][i], 'data-node': ['context', 'future', 'actions'][i] }, coreG);
      const y = firstY + i * rowGap;
      text(row, title, startX, y, { class: 'wd-token-label' });
      const cells = Array.from({ length: 8 }, (_, j) => el('rect', { x: startX + j * (cellWidth + cellGap), y: y + 12, width: cellWidth, height: mobile ? 23 : 20, rx: 5, fill: i === 2 ? '#c1afd9' : '#a9ccdc', 'fill-opacity': '.68', stroke: i === 2 ? '#b09bc9' : '#9abdd0', 'stroke-opacity': '.55' }, row));
      tokenRows.push({ cells, part: 2 });
    });
    const firstCY = firstY + (mobile ? 23.5 : 22);
    const videoCY = firstCY + rowGap;
    const actionCY = videoCY + rowGap;
    const right = startX + tokenWidth;
    const bracket = mobile ? 490 : 337;
    const left = mobile ? 45 : 36;
    path(coreG, `M${startX - 3} ${firstCY} H${left + 7} Q${left} ${firstCY} ${left} ${firstCY + 7} V${actionCY - 7} Q${left} ${actionCY} ${left + 7} ${actionCY} H${startX - 4}`, 2, { id: 'context-to-action', opacity: .4 });
    routePath = path(coreG, `M${right + 3} ${videoCY} H${bracket - 7} Q${bracket} ${videoCY} ${bracket} ${videoCY + 7} V${actionCY - 7} Q${bracket} ${actionCY} ${bracket - 7} ${actionCY} H${right + 4}`, 2, { id: 'future-to-action', gated: true, opacity: .9 });
    gate = el('g', { transform: `translate(${bracket} ${(videoCY + actionCY) / 2})`, 'data-node': 'route-gate' }, coreG);
    el('circle', { r: mobile ? 11 : 9, fill: '#f6f4fa', stroke: '#b7a1ca', 'stroke-width': 1.2 }, gate);
    el('path', { d: 'M-3.5 -3.5 L3.5 3.5 M3.5 -3.5 L-3.5 3.5', stroke: '#ac94c3', 'stroke-width': 1.7, 'stroke-linecap': 'round' }, gate);
    routeStatus = text(coreG, 'Future → action enabled', layout.parts[2].w / 2, core.y + core.h - 14, { class: 'wd-small', 'text-anchor': 'middle', 'data-node': 'route-status' });
    const outputY = mobile ? 468 : 482;
    const width = mobile ? 238 : 154;
    const leftX = mobile ? 30 : 24;
    const rightX = mobile ? 292 : 202;
    const midX = layout.parts[2].w / 2;
    const junctionY = mobile ? 442 : 457;
    const lMid = leftX + width / 2, rMid = rightX + width / 2;
    path(g, `M${midX} ${core.y + core.h + 1} V${junctionY - 6} Q${midX} ${junctionY} ${midX - 6} ${junctionY} H${lMid + 6} Q${lMid} ${junctionY} ${lMid} ${junctionY + 6} V${outputY - 3}`, 2, { id: 'video-prediction' });
    path(g, `M${midX} ${core.y + core.h + 1} V${junctionY - 6} Q${midX} ${junctionY} ${midX + 6} ${junctionY} H${rMid - 6} Q${rMid} ${junctionY} ${rMid} ${junctionY + 6} V${outputY - 3}`, 2, { id: 'action-prediction' });
    boxLabel(g, 'videoLoss', leftX, outputY, width, 72, 'Video prediction', '+ video loss', { fill: '#f1f7fa' });
    boxLabel(g, 'actionLoss', rightX, outputY, width, 72, 'Action prediction', '+ action loss', { fill: '#f4eff9' });
  }
  function drawDeployment() {
    const g = panel(3);
    const x = mobile ? 55 : 24, w = mobile ? 450 : 334;
    const observationY = mobile ? 103 : 100;
    const policyY = mobile ? 198 : 213;
    const chunkY = mobile ? 300 : 326;
    const center = layout.parts[3].w / 2;
    boxLabel(g, 'cached-context', x, observationY, w, 57, 'Cached observations', '', { fill: '#f3f8f7', stroke: '#c9dfd7' });
    boxLabel(g, 'action-only-policy', x, policyY, w, 70, 'Action-only prediction', 'No future-video generation', { fill: '#edf6f2', stroke: '#bdd8cd' });
    path(g, `M${center} ${observationY + 59} V${policyY - 3}`, 3, { id: 'observation-to-policy' });
    path(g, `M${center} ${policyY + 72} V${chunkY - 3}`, 3, { id: 'policy-to-chunks' });
    const chunk = el('g', { 'data-node': 'chunk' }, g);
    text(chunk, 'Action chunks', center, chunkY + (mobile ? 18 : 16), { 'text-anchor': 'middle', class: 'wd-token-label' });
    const cellsWidth = mobile ? 342 : 248;
    const cellW = (cellsWidth - 3 * 23) / 24;
    const cellX = center - cellsWidth / 2;
    chunkCells = Array.from({ length: 24 }, (_, i) => el('rect', { x: cellX + i * (cellW + 3), y: chunkY + 29, width: cellW, height: mobile ? 17 : 14, rx: 2.5, fill: '#93c1ae', 'fill-opacity': '.65' }, chunk));
    const videoTop = layout.video.y - layout.parts[3].y;
    path(g, `M${center} ${chunkY + (mobile ? 49 : 47)} V${videoTop - 4}`, 3, { id: 'chunks-to-execution' });
    shape(g, layout.video.x - layout.parts[3].x, videoTop, layout.video.width, layout.video.height, { rx: 16, fill: '#e5eee9', stroke: '#d0e0d8', 'data-node': 'execution-slot' });
  }
  function drawConnections() {
    const wires = el('g', { 'data-node': 'architecture-connections', 'aria-hidden': 'true' }, content);
    if (mobile) {
      // A single left gutter joins the two training inputs to the shared model.
      path(wires, 'M20 171 H13 Q6 171 6 178 V482', 0, { id: 'pretrain-to-model', owners: [0, 2], opacity: .4 });
      path(wires, 'M20 485 H7', 1, { id: 'posttrain-to-model', owners: [1, 2], opacity: .4 });
      path(wires, 'M6 485 V835 Q6 843 14 843 H18', 2, { id: 'training-to-model', owners: [0, 1, 2], opacity: .4 });
      path(wires, 'M300 1234 V1283', 3, { id: 'model-to-deployment', owners: [2, 3], opacity: .5 });
    } else {
      path(wires, 'M305 239.5 H371', 0, { id: 'pretrain-to-model', owners: [0, 2] });
      path(wires, 'M268 549 H343 Q351 549 351 541 V427 Q351 419 359 419 H371', 1, { id: 'posttrain-to-model', owners: [1, 2] });
      path(wires, 'M733 270 H821', 3, { id: 'model-to-deployment', owners: [2, 3] });
    }
  }

  function build() {
    content?.remove();
    parts = []; flows = []; frames = []; tokenRows = []; chunkCells = [];
    previousFocus = Symbol(); previousRoute = null;
    layout = geometry(mobile);
    svg.setAttribute('viewBox', layout.viewBox.join(' '));
    svg.dataset.mobile = String(mobile);
    content = el('g', {}, svg);
    drawPretrain(); drawPosttrain(); drawCore(); drawDeployment(); drawConnections();
  }
  function render({ focus = null, time = 0, route = 'joint', still = false } = {}) {
    if (destroyed) return;
    if (![0, 1, 2, 3].includes(focus)) focus = null;
    route = route === 'action' ? 'action' : 'joint';
    last = { focus, time, route, still };
    svg.dataset.focus = focus === null ? 'overview' : METHOD_PARTS[focus].key;
    if (focus !== previousFocus) {
      parts.forEach(({ g, bg }, i) => {
        const active = focus === null || focus === i;
        g.style.opacity = active ? '1' : '.68';
        g.setAttribute('aria-pressed', String(focus === i));
        bg.style.stroke = focus === i ? PALETTE[i] : '#d8e1ed';
        bg.style.strokeWidth = focus === i ? '1.7' : '1';
      });
      previousFocus = focus;
    }
    if (route !== previousRoute) {
      const actionOnly = route === 'action';
      gate.style.opacity = actionOnly ? '1' : '0';
      routePath.setAttribute('stroke-dasharray', actionOnly ? '3 5' : 'none');
      routePath.setAttribute('stroke-opacity', actionOnly ? '.28' : '.9');
      routeStatus.textContent = actionOnly ? 'Future → action blocked' : 'Future → action enabled';
      svg.dataset.route = route;
      previousRoute = route;
    }
    flows.forEach((flow, i) => {
      const active = focus === null || flow.owners.includes(focus);
      flow.g.style.opacity = active ? '1' : '.46';
      const moving = active && !still && !(flow.gated && route === 'action');
      flow.dot.style.opacity = moving ? '.85' : '0';
      if (!moving) return;
      flow.length ??= flow.line.getTotalLength();
      const progress = ((time / (2500 + i % 4 * 260) + i * .17) % 1 + 1) % 1;
      const point = flow.line.getPointAtLength(flow.length * progress);
      flow.dot.setAttribute('cx', point.x);
      flow.dot.setAttribute('cy', point.y);
    });
    frames.forEach(item => {
      const active = focus === null || focus === item.part;
      const motion = active && !still ? (Math.sin(time / 1400 + item.offset) + 1) / 2 : .4;
      item.arm.setAttribute('transform', `translate(${motion * 5} ${motion * -1.5})`);
      item.object.setAttribute('transform', `translate(${motion * 3} 0)`);
    });
    tokenRows.forEach(row => row.cells.forEach((cell, i) => {
      const active = !still && (focus === null || focus === row.part);
      const brightness = active ? .57 + .19 * (Math.sin(time / 650 - i * .55) + 1) / 2 : .68;
      cell.setAttribute('fill-opacity', brightness.toFixed(3));
    }));
    const cursor = still ? 12 : Math.floor(((time / 70) % 24 + 24) % 24);
    chunkCells.forEach((cell, i) => cell.setAttribute('fill-opacity', focus === null || focus === 3 ? (i <= cursor ? '.86' : '.32') : '.62'));
  }
  function resize() {
    if (destroyed) return;
    const next = window.matchMedia('(max-width: 760px)').matches;
    if (next !== mobile) { mobile = next; build(); render(last); }
    return layout;
  }
  build();
  render(last);
  return { render, resize, getLayout: () => layout, destroy() { destroyed = true; svg.remove(); } };
}
