/* Original WE-Dream overview: a fixed architecture, not a sequence of slides. */
import { createRoutingVisual } from './method-routing.js?v=v37';
export const METHOD_PARTS = [
  { key: 'pretrain', label: 'Latent-action pretraining', title: 'Learn actions from human video.', caption: 'A frozen latent action model extracts 32D visual-transition targets from human first-person video.' },
  { key: 'posttrain', label: 'Robot post-training', title: 'Adapt the pretrained model to robot control.', caption: 'Transfer model weights and jointly learn from robot demonstrations, states, and 80D action targets.' },
  { key: 'routing', label: 'Routed attention', title: 'Train with and without future-video access.', caption: 'Sample the two attention routes with equal probability per local microbatch, retaining video and action losses in both training stages.' },
  { key: 'deploy', label: 'Action-only deployment', title: 'Execute without future-video generation.', caption: 'The same trained weights predict action chunks. Neck and hands use direct targets; the body command goes through SONIC.' },
];

const NS = 'http://www.w3.org/2000/svg';
const COLORS = ['#a291c5', '#7eaac3', '#929dc4', '#76ac9e'];
const ACTION_COLORS = ['#c4ddeb', '#d5c9e7', '#c2ddd0'];
let instances = 0;
function element(tag, attributes, parent) {
  const node = document.createElementNS(NS, tag);
  Object.entries(attributes || {}).forEach(([key, value]) => node.setAttribute(key, value));
  parent?.append(node);
  return node;
}
function label(parent, value, x, y, attributes = {}) {
  const node = element('text', { x, y, ...attributes }, parent);
  node.textContent = value;
  return node;
}
function rect(parent, x, y, width, height, attributes = {}) {
  return element('rect', { x, y, width, height, rx: 14, class: 'wd-node', 'fill-opacity': .94, fill: '#fcfdff', stroke: '#d1deea', 'stroke-width': 1.2, ...attributes }, parent);
}
function geometry(mobile) {
  return mobile ? {
    viewBox: [0, 0, 600, 3010],
    parts: [
      { x: 20, y: 20, w: 560, h: 470 },
      { x: 20, y: 550, w: 560, h: 530 },
      { x: 20, y: 1140, w: 560, h: 820 },
      { x: 20, y: 2020, w: 560, h: 966 },
    ],
    videos: {
      human: { x: 60, y: 115, width: 480, height: 270 },
      robot: { x: 60, y: 645, width: 480, height: 270 },
      execution: { x: 50, y: 2685, width: 500, height: 281.25 },
    },
  } : {
    viewBox: [0, 0, 1320, 800],
    parts: [
      { x: 20, y: 25, w: 330, h: 320 },
      { x: 20, y: 405, w: 330, h: 370 },
      { x: 400, y: 25, w: 430, h: 750 },
      { x: 880, y: 25, w: 420, h: 750 },
    ],
    videos: {
      human: { x: 44, y: 108, width: 282, height: 158.625 },
      robot: { x: 44, y: 488, width: 282, height: 158.625 },
      execution: { x: 904, y: 565, width: 372, height: 209.25 },
    },
  };
}

export function createMethodDiagram(host, { onFocus, routeVariant = 'pulse' } = {}) {
  const prefix = `wd-method-${++instances}`;
  const svg = element('svg', { class: 'wd-diagram', role: 'group', 'aria-label': 'Complete WE-Dream method: human pretraining, robot post-training, mixed training attention, and action-only deployment.', preserveAspectRatio: 'xMidYMid meet' }, host);
  svg.style.cssText = 'display:block;width:100%;height:auto;overflow:visible;';
  const defs = element('defs', {}, svg);
  COLORS.forEach((color, index) => {
    const gradient = element('linearGradient', { id: `${prefix}-panel-${index}`, x1: '0%', y1: '0%', x2: '100%', y2: '100%' }, defs);
    element('stop', { offset: '0%', 'stop-color': '#ffffff', 'stop-opacity': '.96' }, gradient);
    element('stop', { offset: '100%', 'stop-color': ['#f0ebf8', '#eaf4fa', '#edf0f9', '#eaf5ef'][index], 'stop-opacity': '.86' }, gradient);
    const arrow = element('marker', { id: `${prefix}-arrow-${index}`, markerWidth: 7, markerHeight: 7, refX: 6, refY: 3.5, orient: 'auto', markerUnits: 'userSpaceOnUse' }, defs);
    element('path', { d: 'M0 0 L7 3.5 L0 7', fill: 'none', stroke: color, 'stroke-width': 1.4, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, arrow);
  });
  ACTION_COLORS.forEach((color, index) => {
    const gradient = element('linearGradient', { id: `${prefix}-action-glass-${index}`, x1: '0%', y1: '0%', x2: '100%', y2: '100%' }, defs);
    element('stop', { offset: '0%', 'stop-color': '#ffffff', 'stop-opacity': '.95' }, gradient);
    element('stop', { offset: '42%', 'stop-color': color, 'stop-opacity': '.28' }, gradient);
    element('stop', { offset: '100%', 'stop-color': color, 'stop-opacity': '.72' }, gradient);
  });
  const style = element('style', {}, svg);
  style.textContent = `
    .wd-diagram text{font-family:inherit;fill:#4f6c80;font-size:18px;font-weight:500;letter-spacing:-.02em}
    .wd-diagram .wd-part{cursor:pointer;transition:opacity .28s ease}
    .wd-diagram .wd-part:focus{outline:none}
    .wd-diagram .wd-part:focus-visible .wd-panel{stroke:#81a9bf;stroke-width:2.4}
    .wd-diagram .wd-panel{stroke:#dce4ed;stroke-width:1;transition:stroke .28s ease,stroke-width .28s ease}
    .wd-diagram .wd-part-number{font-size:13px;letter-spacing:.13em;fill:#92a3b1}
    .wd-diagram .wd-part-title{font-size:20px;font-weight:600}
    .wd-diagram .wd-small{font-size:14px;fill:#8399aa;font-weight:400;letter-spacing:0}
    .wd-diagram .wd-quiet{font-size:13px;fill:#92a3b1;font-weight:400;letter-spacing:0}
    .wd-diagram .wd-core-title{font-size:24px;font-weight:600}
    .wd-diagram .wd-vector-title{font-size:17px;font-weight:500}
    .wd-diagram .wd-component{font-size:16px}
    .wd-diagram .wd-wire{fill:none;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round}
    .wd-diagram .wd-flow-dot{stroke:white;stroke-width:1.5}
    .wd-diagram[data-mobile="true"] text{font-size:24px}
    .wd-diagram[data-mobile="true"] .wd-part-title{font-size:26px}
    .wd-diagram[data-mobile="true"] .wd-part-number{font-size:16px}
    .wd-diagram[data-mobile="true"] .wd-small{font-size:20px}
    .wd-diagram[data-mobile="true"] .wd-quiet{font-size:18px}
    .wd-diagram[data-mobile="true"] .wd-core-title{font-size:30px}
    .wd-diagram[data-mobile="true"] .wd-vector-title{font-size:23px}
    .wd-diagram[data-mobile="true"] .wd-component{font-size:22px}
    @media(prefers-reduced-motion:reduce){.wd-diagram .wd-part,.wd-diagram .wd-panel{transition:none}}
  `;
  let mobile = window.matchMedia('(max-width: 760px)').matches;
  let layout = geometry(mobile);
  let root, parts = [], flows = [], chunkCells = [], routingVisual = null;
  let last = { focus: null, time: 0, still: false };
  let previousFocus = Symbol();
  let destroyed = false;

  function panel(index) {
    const p = layout.parts[index];
    const group = element('g', { class: 'wd-part', 'data-part': METHOD_PARTS[index].key, role: 'button', tabindex: 0, 'aria-label': `Focus ${METHOD_PARTS[index].label}` }, root);
    const background = rect(group, p.x, p.y, p.w, p.h, { class: 'wd-panel', rx: 23, fill: `url(#${prefix}-panel-${index})` });
    label(group, `0${index + 1}${index === 2 ? ' / TRAINING' : index === 3 ? ' / DEPLOYMENT' : ''}`, p.x + 24, p.y + (mobile ? 32 : 27), { class: 'wd-part-number' });
    label(group, METHOD_PARTS[index].label, p.x + 24, p.y + (mobile ? 66 : 55), { class: 'wd-part-title' });
    group.addEventListener('click', () => onFocus?.(index));
    group.addEventListener('keydown', event => { if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); onFocus?.(index); } });
    parts.push({ group, background });
    return group;
  }
  function wire(parent, d, part, { id, owners = [part], opacity = .7, animate = true } = {}) {
    const group = element('g', { 'aria-hidden': 'true', ...(id ? { 'data-link': id } : {}) }, parent);
    const path = element('path', { d, class: 'wd-wire', stroke: COLORS[part], 'stroke-opacity': opacity, 'marker-end': `url(#${prefix}-arrow-${part})` }, group);
    const dot = element('circle', { r: mobile ? 3.1 : 2.7, class: 'wd-flow-dot', fill: COLORS[part] }, group);
    flows.push({ group, path, dot, owners, animate, length: null });
    return path;
  }
  function box(parent, id, x, y, width, height, title, sub = '', attributes = {}) {
    const group = element('g', { 'data-node': id }, parent);
    rect(group, x, y, width, height, attributes);
    label(group, title, x + width / 2, y + height / 2 + (sub ? -2 : 6), { 'text-anchor': 'middle' });
    if (sub) label(group, sub, x + width / 2, y + height / 2 + (mobile ? 25 : 19), { class: 'wd-small', 'text-anchor': 'middle' });
    return group;
  }
  function videoSlot(parent, name) {
    const slot = layout.videos[name];
    rect(parent, slot.x, slot.y, slot.width, slot.height, { 'data-node': `${name}-video`, fill: '#e8edf0', stroke: '#dce5eb', rx: 15 });
  }
  function actionVector(parent, id, x, y, width, height) {
    const group = element('g', { 'data-node': id, 'data-dimension': '80' }, parent);
    // One shared enclosure preserves vector identity; its components are light,
    // connected capsules rather than three unrelated output boxes.
    rect(group, x + 1, y + 3, width - 2, height, { rx: 20, fill: '#b9c9d7', 'fill-opacity': .08, stroke: 'none' });
    rect(group, x, y, width, height, { rx: 20, fill: '#ffffff', 'fill-opacity': .34, stroke: '#ccdbe5', 'stroke-opacity': .74, 'stroke-width': 1 });
    const pad = mobile ? 6 : 4;
    const gap = mobile ? 6 : 4;
    const innerWidth = width - pad * 2 - gap * 2;
    const fractions = [.20, .25, .55];
    const names = ['Neck', 'Hands', 'SONIC token'];
    const dimensions = [2, 14, 64];
    let offset = x + pad;
    const centers = [];
    fractions.forEach((fraction, i) => {
      const w = innerWidth * fraction;
      const center = offset + w / 2;
      centers.push(center);
      rect(group, offset, y + pad, w, height - pad * 2, {
        rx: mobile ? 18 : 15,
        fill: `url(#${prefix}-action-glass-${i})`, 'fill-opacity': 1,
        stroke: ACTION_COLORS[i], 'stroke-opacity': .8, 'stroke-width': 1,
        'data-action-component': ['neck', 'hands', 'body'][i], 'data-dimension': dimensions[i],
      });
      label(group, names[i], center, y + height / 2 - 3, { class: 'wd-component', 'text-anchor': 'middle' });
      label(group, `${dimensions[i]}D`, center, y + height / 2 + (mobile ? 24 : 18), { class: 'wd-small', 'text-anchor': 'middle' });
      offset += w + gap;
    });
    return { direct: (centers[0] + centers[1]) / 2, sonic: centers[2] };
  }

  function drawPretrain() {
    const g = panel(0);
    videoSlot(g, 'human');
    const lam = mobile ? { x: 60, y: 416, w: 205, h: 54 } : { x: 44, y: 285, w: 124, h: 44 };
    const target = mobile ? { x: 330, y: 416, w: 210, h: 54 } : { x: 188, y: 285, w: 138, h: 44 };
    const frozen = box(g, 'lam', lam.x, lam.y, lam.w, lam.h, 'Frozen LAM', '', { 'stroke-dasharray': '4 4' });
    const frozenLabel = frozen.querySelector('text');
    frozenLabel.setAttribute('x', lam.x + lam.w / 2 + (mobile ? 10 : 7));
    frozenLabel.style.fontSize = mobile ? '22px' : '16px';
    const snowflake = element('g', { transform: `translate(${lam.x + (mobile ? 22 : 14)} ${lam.y + lam.h / 2})`, 'aria-hidden': 'true', stroke: '#88b1cd', 'stroke-width': mobile ? 1.8 : 1.25, 'stroke-linecap': 'round', fill: 'none' }, frozen);
    for (let i = 0; i < 6; i++) element('path', { d: mobile ? 'M0 0 V-9 M0-6 L-3-4 M0-6 L3-4' : 'M0 0 V-6 M0-4 L-2-2.5 M0-4 L2-2.5', transform: `rotate(${i * 60})` }, snowflake);
    box(g, 'latent-targets', target.x, target.y, target.w, target.h, '32D latent', 'targets', { fill: '#f5eff9', stroke: '#d4c5e1' });
    const center = mobile ? 300 : 185;
    const end = layout.videos.human.y + layout.videos.human.height;
    const lamCenter = lam.x + lam.w / 2;
    const turnY = lam.y - 11;
    wire(g, `M${center} ${end + 1} V${turnY - 5} Q${center} ${turnY} ${center - 5} ${turnY} H${lamCenter + 5} Q${lamCenter} ${turnY} ${lamCenter} ${turnY + 5} V${lam.y - 3}`, 0, { id: 'human-to-lam' });
    wire(g, `M${lam.x + lam.w + 1} ${lam.y + lam.h / 2} H${target.x - 3}`, 0, { id: 'lam-to-latent' });
  }
  function drawPosttrain() {
    const g = panel(1);
    videoSlot(g, 'robot');
    const x = mobile ? 60 : 44, y = mobile ? 970 : 692, width = mobile ? 480 : 282;
    label(g, 'Robot action', x, y - (mobile ? 20 : 14), { class: 'wd-vector-title' });
    actionVector(g, 'robot-targets', x, y, width, mobile ? 70 : 54);
  }
  function drawTraining() {
    const g = panel(2);
    const model = mobile ? { x: 50, y: 1337, w: 500, h: 443 } : { x: 424, y: 201, w: 382, h: 420 };
    const center = model.x + model.w / 2;
    const inputY = mobile ? 1245 : 122, inputH = mobile ? 56 : 42;
    box(g, 'training-input', model.x, inputY, model.w, inputH, 'Video · language · state', '', { fill: '#f7f9fc', stroke: '#d2deeb' });
    wire(g, `M${center} ${inputY + inputH + 2} V${model.y - 3}`, 2, { id: 'inputs-to-model' });
    const core = element('g', { 'data-node': 'core' }, g);
    rect(core, model.x + 3, model.y + 5, model.w, model.h, { fill: '#b8c7df', 'fill-opacity': '.13', stroke: 'none', rx: 21 });
    rect(core, model.x, model.y, model.w, model.h, { fill: '#f6f8fc', stroke: '#cbd7e7', rx: 21 });
    label(core, 'Shared DiT', center, model.y + (mobile ? 42 : 39), { class: 'wd-core-title', 'text-anchor': 'middle' });
    const routingBox = mobile
      ? { x: 60, y: 1390, width: 480, height: 365 }
      : { x: 438, y: 260, width: 354, height: 340 };
    routingVisual = createRoutingVisual(core, { prefix, ...routingBox, mobile, variant: routeVariant });
    const outputY = mobile ? 1840 : 666;
    const outputW = mobile ? 236 : 182;
    const leftX = mobile ? 50 : 424, rightX = mobile ? 314 : 624;
    const junctionY = mobile ? 1810 : 644;
    const leftCenter = leftX + outputW / 2, rightCenter = rightX + outputW / 2;
    wire(g, `M${center} ${model.y + model.h + 1} V${junctionY - 6} Q${center} ${junctionY} ${center - 6} ${junctionY} H${leftCenter + 6} Q${leftCenter} ${junctionY} ${leftCenter} ${junctionY + 6} V${outputY - 3}`, 2, { id: 'video-prediction' });
    wire(g, `M${center} ${model.y + model.h + 1} V${junctionY - 6} Q${center} ${junctionY} ${center + 6} ${junctionY} H${rightCenter - 6} Q${rightCenter} ${junctionY} ${rightCenter} ${junctionY + 6} V${outputY - 3}`, 2, { id: 'action-prediction' });
    box(g, 'videoLoss', leftX, outputY, outputW, mobile ? 80 : 64, 'Video prediction', '+ video loss', { fill: '#f1f7fa' });
    box(g, 'actionLoss', rightX, outputY, outputW, mobile ? 80 : 64, 'Action prediction', '+ action loss', { fill: '#f6f1fa' });
  }
  function drawDeployment() {
    const g = panel(3);
    const x = mobile ? 60 : 904, width = mobile ? 480 : 372, center = x + width / 2;
    const observationY = mobile ? 2120 : 122;
    const policyY = mobile ? 2220 : 197;
    box(g, 'observed-context', x, observationY, width, mobile ? 60 : 42, 'Camera · language · state', '', { fill: '#f4f8f6', stroke: '#d2e2d9' });
    box(g, 'action-only-policy', x, policyY, width, mobile ? 76 : 62, 'Action-only prediction', 'Future video omitted', { fill: '#edf6f1', stroke: '#bfd9cb' });
    wire(g, `M${center} ${observationY + (mobile ? 62 : 44)} V${policyY - 3}`, 3, { id: 'context-to-policy' });
    const chunkY = mobile ? 2340 : 296;
    wire(g, `M${center} ${policyY + (mobile ? 78 : 64)} V${chunkY - (mobile ? 27 : 24)}`, 3, { id: 'policy-to-chunk' });
    const chunk = element('g', { 'data-node': 'chunk', 'data-actions': '24' }, g);
    label(chunk, '24-action chunk', center, chunkY, { class: 'wd-vector-title', 'text-anchor': 'middle' });
    const chunkWidth = mobile ? 438 : 330;
    const gap = mobile ? 4 : 3;
    const cellW = (chunkWidth - gap * 23) / 24;
    for (let i = 0; i < 24; i++) {
      const cell = element('g', { 'data-action-step': i + 1 }, chunk);
      const cx = center - chunkWidth / 2 + i * (cellW + gap);
      const cy = chunkY + (mobile ? 19 : 15);
      ACTION_COLORS.forEach((color, j) => element('rect', { x: cx, y: cy + j * (mobile ? 7 : 6), width: cellW, height: mobile ? 6 : 5, rx: 1.7, fill: `url(#${prefix}-action-glass-${j})` }, cell));
      chunkCells.push(cell);
    }
    const vectorY = mobile ? 2440 : 371;
    label(g, 'Each action token · 80D', x, vectorY - (mobile ? 17 : 14), { class: 'wd-vector-title' });
    actionVector(g, 'deployment-action', x, vectorY, width, mobile ? 72 : 58);
    wire(g, `M${center} ${chunkY + (mobile ? 43 : 35)} V${vectorY - 5}`, 3, { id: 'chunk-to-vector' });
    const controlsY = mobile ? 2560 : 472;
    const controlsH = mobile ? 60 : 48;
    const controlsW = mobile ? 226 : 176;
    const sonicX = mobile ? 314 : 1100;
    const directCenter = x + controlsW / 2, sonicCenter = sonicX + controlsW / 2;
    const bottom = vectorY + (mobile ? 72 : 58);
    wire(g, `M${sonicCenter} ${bottom + 1} V${controlsY - 3}`, 3, { id: 'body-to-sonic' });
    box(g, 'sonic-control', sonicX, controlsY, controlsW, controlsH, 'SONIC controller', 'Body joints', { fill: '#eff7f2' });
    const video = layout.videos.execution;
    wire(g, `M${directCenter} ${bottom + 1} V${video.y - 4}`, 3, { id: 'direct-to-execution' });
    wire(g, `M${sonicCenter} ${controlsY + controlsH + 1} V${video.y - 4}`, 3, { id: 'sonic-to-execution' });
    label(g, '30 Hz continuous control', center, video.y - (mobile ? 15 : 10), { class: 'wd-quiet', 'text-anchor': 'middle' });
    videoSlot(g, 'execution');
  }
  function drawConnections() {
    const g = element('g', { 'data-node': 'architecture-connections', 'aria-hidden': 'true' }, root);
    const pre = layout.parts[0], post = layout.parts[1];
    const transferX = pre.x + pre.w / 2;
    wire(g, `M${transferX} ${pre.y + pre.h + 3} V${post.y - 5}`, 1, { id: 'pretrained-weights', owners: [0, 1], opacity: .6 });
    label(g, 'Pretrained weights', transferX + 16, (pre.y + pre.h + post.y) / 2 + 4, { class: 'wd-quiet' });
    if (mobile) {
      wire(g, 'M542 443 H570 Q588 443 588 461 V1470 Q588 1482 576 1482 H553', 0, { id: 'latent-to-model', owners: [0, 2], opacity: .42 });
      wire(g, 'M542 1005 H566 Q588 1005 588 1027 V1482', 1, { id: 'robot-to-model', owners: [1, 2], opacity: .42 });
      wire(g, 'M300 1963 V2015', 3, { id: 'trained-model-to-deployment', owners: [2, 3], opacity: .6 });
    } else {
      wire(g, 'M328 307 H421', 0, { id: 'latent-to-model', owners: [0, 2] });
      wire(g, 'M328 719 H367 Q375 719 375 711 V593 Q375 585 383 585 H421', 1, { id: 'robot-to-model', owners: [1, 2] });
      wire(g, 'M809 228 H901', 3, { id: 'trained-model-to-deployment', owners: [2, 3] });
    }
  }
  function build() {
    routingVisual?.destroy();
    routingVisual = null;
    root?.remove();
    parts = []; flows = []; chunkCells = [];
    previousFocus = Symbol();
    layout = geometry(mobile);
    svg.setAttribute('viewBox', layout.viewBox.join(' '));
    svg.dataset.mobile = String(mobile);
    root = element('g', {}, svg);
    drawPretrain(); drawPosttrain(); drawTraining(); drawDeployment(); drawConnections();
  }
  function render({ focus = null, time = 0, still = false } = {}) {
    if (destroyed) return;
    if (![0, 1, 2, 3].includes(focus)) focus = null;
    last = { focus, time, still };
    svg.dataset.focus = focus === null ? 'overview' : METHOD_PARTS[focus].key;
    if (focus !== previousFocus) {
      parts.forEach(({ group, background }, i) => {
        group.style.opacity = focus === null || focus === i ? '1' : '.71';
        group.setAttribute('aria-pressed', String(focus === i));
        background.style.stroke = focus === i ? COLORS[i] : '#dce4ed';
        background.style.strokeWidth = focus === i ? '1.8' : '1';
      });
      previousFocus = focus;
    }
    flows.forEach((flow, i) => {
      const active = focus === null || flow.owners.includes(focus);
      flow.group.style.opacity = active ? '1' : '.5';
      const moving = active && !still && flow.animate;
      flow.dot.style.opacity = moving ? '.8' : '0';
      if (!moving) return;
      flow.length ??= flow.path.getTotalLength();
      const progress = ((time / (2700 + i % 4 * 280) + i * .17) % 1 + 1) % 1;
      const point = flow.path.getPointAtLength(flow.length * progress);
      flow.dot.setAttribute('cx', point.x);
      flow.dot.setAttribute('cy', point.y);
    });
    routingVisual?.render({ time, still, active: focus === null || focus === 2 });
    const cursor = still ? 12 : Math.floor(((time / 100) % 24 + 24) % 24);
    chunkCells.forEach((cell, i) => cell.style.opacity = focus === null || focus === 3 ? (i <= cursor ? '1' : '.48') : '.8');
  }
  function resize() {
    if (destroyed) return;
    const next = window.matchMedia('(max-width: 760px)').matches;
    if (next !== mobile) { mobile = next; build(); render(last); }
    return layout;
  }
  build();
  render(last);
  return { render, resize, getLayout: () => layout, destroy() { destroyed = true; routingVisual?.destroy(); root?.remove(); svg.remove(); } };
}
