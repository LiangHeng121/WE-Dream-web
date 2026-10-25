/* Original WE-Dream SVG explanation. Source-paper semantics; no third-party artwork. */
export const METHOD_STEPS = [
  { key: 'pretrain', label: 'Latent-action pretraining', title: 'Learn actions from human video.', caption: 'A frozen latent action model supplies transition targets. Video and latent actions train the same world–action backbone.', duration: 9000 },
  { key: 'posttrain', label: 'Robot post-training', title: 'Keep the backbone. Adapt the interfaces.', caption: 'Robot post-training introduces 45D states and 80D commands while retaining both video and action learning.', duration: 9000 },
  { key: 'routing', label: 'Routed attention', title: 'Learn with two attention routes.', caption: 'In both training stages, clean context stays visible to action queries. Only access to noisy future video changes; both losses remain.', duration: 9000 },
  { key: 'deploy', label: 'Action-only deployment', title: 'Predict actions. Keep the robot moving.', caption: 'Generate action chunks from observed context, overlapping prediction and execution for continuous control.', duration: 9000 },
];

const NS = 'http://www.w3.org/2000/svg';
const clamp = x => Math.max(0, Math.min(1, x));
const smooth = x => { const p = clamp(x); return p * p * (3 - 2 * p); };
const lerp = (a, b, p) => a + (b - a) * p;
const at = (time, start, duration = 850) => smooth((time - start) / duration);
const color = { blue: '#7bacc5', purple: '#a292cb', mint: '#73b6a5', ink: '#496b82', muted: '#8095a7' };
let diagramCount = 0;

function svgElement(tag, attrs, parent) {
  const el = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attrs || {})) el.setAttribute(key, String(value));
  parent?.append(el);
  return el;
}
function label(parent, value, attrs = {}) {
  const el = svgElement('text', { class: 'wd-label', 'text-anchor': 'middle', ...attrs }, parent);
  el.textContent = value;
  return el;
}
const box = (x, y, w, h, opacity = 1) => ({ x, y, w, h, opacity });
const hidden = (x, y, w = 200, h = 80) => box(x, y, w, h, 0);

function layouts(mobile) {
  if (mobile) return [
    { source: box(28, 30, 230, 100), lam: box(320, 45, 250, 70), targets: box(320, 155, 250, 70), context: box(28, 155, 230, 95), instruction: box(28, 270, 230, 48), state: hidden(320, 45, 250, 70), core: box(90, 325, 420, 270), future: box(28, 625, 250, 78), actions: box(325, 635, 250, 65), videoLoss: box(28, 730, 250, 30), actionLoss: box(325, 730, 250, 30), noisy: hidden(325, 50), chunk: hidden(150, 500), direct: hidden(28, 640), sonic: hidden(320, 640), status: hidden(150, 735), routeNote: hidden(90, 550) },
    { source: box(28, 30, 230, 100), lam: hidden(320, 45, 250, 70), targets: box(320, 155, 250, 70), context: box(28, 155, 230, 95), instruction: box(28, 270, 230, 48), state: box(320, 45, 250, 70), core: box(90, 325, 420, 270), future: box(28, 625, 250, 78), actions: box(325, 635, 250, 65), videoLoss: box(28, 730, 250, 30), actionLoss: box(325, 730, 250, 30), noisy: hidden(325, 50), chunk: hidden(150, 500), direct: hidden(28, 640), sonic: hidden(320, 640), status: hidden(150, 735), routeNote: hidden(90, 550) },
    { source: hidden(28, 30, 230, 100), lam: hidden(320, 45, 250, 70), targets: hidden(320, 155, 250, 70), context: box(28, 40, 250, 100), instruction: box(28, 165, 250, 48), state: hidden(320, 45, 250, 70), core: box(90, 270, 420, 270), future: box(28, 625, 250, 78), actions: box(325, 635, 250, 65), videoLoss: box(28, 730, 250, 30), actionLoss: box(325, 730, 250, 30), noisy: box(325, 55, 250, 95), chunk: hidden(150, 500), direct: hidden(28, 640), sonic: hidden(320, 640), status: hidden(150, 735), routeNote: box(80, 550, 440, 45) },
    { source: hidden(28, 30, 230, 100), lam: hidden(320, 45, 250, 70), targets: hidden(320, 155, 250, 70), context: box(28, 40, 250, 100), instruction: box(325, 50, 250, 48), state: box(325, 125, 250, 65), core: box(90, 240, 420, 205), future: hidden(28, 625, 250, 78), actions: hidden(325, 635, 250, 65), videoLoss: hidden(28, 730, 250, 30), actionLoss: hidden(325, 730, 250, 30), noisy: hidden(325, 55, 250, 95), chunk: box(150, 495, 300, 85), direct: box(28, 635, 260, 72), sonic: box(320, 635, 250, 72), status: box(50, 740, 500, 30), routeNote: hidden(80, 550, 440, 45) },
  ];
  return [
    { source: box(25, 35, 205, 115), lam: box(255, 65, 145, 75), targets: box(245, 195, 165, 70), context: box(25, 225, 200, 100), instruction: box(25, 365, 200, 46), state: hidden(255, 65, 145, 75), core: box(450, 95, 320, 285), future: box(850, 85, 300, 100), actions: box(850, 275, 300, 65), videoLoss: box(850, 210, 300, 30), actionLoss: box(850, 370, 300, 30), noisy: hidden(25, 255), chunk: hidden(635, 65), direct: hidden(635, 225), sonic: hidden(635, 335), status: hidden(640, 420), routeNote: hidden(450, 400) },
    { source: box(25, 35, 205, 115), lam: hidden(255, 65, 145, 75), targets: box(245, 195, 165, 70), context: box(25, 225, 200, 100), instruction: box(25, 365, 200, 46), state: box(255, 65, 145, 75), core: box(450, 95, 320, 285), future: box(850, 85, 300, 100), actions: box(850, 275, 300, 65), videoLoss: box(850, 210, 300, 30), actionLoss: box(850, 370, 300, 30), noisy: hidden(25, 255), chunk: hidden(635, 65), direct: hidden(635, 225), sonic: hidden(635, 335), status: hidden(640, 420), routeNote: hidden(450, 400) },
    { source: hidden(25, 35, 205, 115), lam: hidden(255, 65, 145, 75), targets: hidden(245, 195, 165, 70), context: box(40, 85, 250, 100), instruction: box(40, 215, 250, 46), state: hidden(255, 65, 145, 75), core: box(410, 75, 380, 300), future: box(880, 85, 285, 100), actions: box(880, 275, 285, 65), videoLoss: box(880, 210, 285, 30), actionLoss: box(880, 370, 285, 30), noisy: box(40, 305, 250, 95), chunk: hidden(635, 65), direct: hidden(635, 225), sonic: hidden(635, 335), status: hidden(640, 420), routeNote: box(410, 400, 380, 40) },
    { source: hidden(25, 35, 205, 115), lam: hidden(255, 65, 145, 75), targets: hidden(245, 195, 165, 70), context: box(25, 85, 210, 100), instruction: box(25, 230, 210, 46), state: box(25, 315, 210, 65), core: box(285, 105, 310, 255), future: hidden(850, 85, 300, 100), actions: hidden(850, 275, 300, 65), videoLoss: hidden(850, 210, 300, 30), actionLoss: hidden(850, 370, 300, 30), noisy: hidden(25, 255), chunk: box(650, 55, 245, 90), direct: box(650, 215, 245, 65), sonic: box(650, 325, 245, 65), status: box(625, 422, 520, 28), routeNote: hidden(450, 400) },
  ];
}

function miniFrame(parent, kind = 'human') {
  const g = svgElement('g', { class: 'wd-frame' }, parent);
  svgElement('rect', { width: 84, height: 56, rx: 12, fill: '#eef5f8', stroke: '#c0d5e0' }, g);
  svgElement('path', { d: 'M9 40 H75', fill: 'none', stroke: '#b8d0dc', 'stroke-width': 2 }, g);
  svgElement('ellipse', { cx: 61, cy: 38, rx: 12, ry: 4, fill: '#d4ebe3', stroke: '#99c4b4' }, g);
  const object = svgElement('rect', { x: 35, y: 30, width: 12, height: 10, rx: 3, fill: '#b4a9da' }, g);
  const arm = svgElement('g', {}, g);
  const limb = svgElement('path', { d: 'M15 11 L24 22 L38 24 L41 30', fill: 'none', stroke: kind === 'human' ? '#b69ac9' : '#84acc5', 'stroke-width': 6, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, arm);
  const gripper = svgElement('path', { d: 'M37 29 L37 34 M44 28 L45 33', fill: 'none', stroke: '#6b8fa5', 'stroke-width': 2, 'stroke-linecap': 'round' }, arm);
  const joint = svgElement('circle', { cx: 24, cy: 22, r: 4, fill: '#f5fafc', stroke: '#7da7bf', 'stroke-width': 2 }, arm);
  const hand = svgElement('path', { d: 'M37 26 Q40 25 42 29 L46 32 M40 29 L42 34 M37 28 L38 34 M35 26 L34 31', fill: 'none', stroke: '#b69ac9', 'stroke-width': 2.2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, arm);
  return { g, arm, object, limb, gripper, joint, hand };
}

export function createMethodDiagram(host) {
  const svg = svgElement('svg', { class: 'wd-diagram', viewBox: '0 0 1200 460', role: 'img', 'aria-label': 'WE-Dream learning and deployment diagram', preserveAspectRatio: 'xMidYMid meet' }, host);
  svg.style.cssText = 'display:block;width:100%;height:auto;overflow:visible;';
  const prefix = `wd-${++diagramCount}`;
  const defs = svgElement('defs', {}, svg);
  for (const [name, start, end] of [['panel', '#fafbff', '#e6edf7'], ['blue', '#e2f0f6', '#9fc8da'], ['purple', '#e8e0f4', '#b3a0d1']]) {
    const gradient = svgElement('linearGradient', { id: `${prefix}-${name}`, x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
    svgElement('stop', { offset: 0, 'stop-color': start }, gradient);
    svgElement('stop', { offset: 1, 'stop-color': end }, gradient);
  }
  const style = svgElement('style', {}, svg);
  style.textContent = '.wd-diagram text{font-family:inherit;fill:#496b82;font-size:20px;font-weight:500;letter-spacing:-.02em}.wd-diagram .wd-small{font-size:18px;fill:#8095a7;font-weight:400}.wd-diagram .wd-title{font-size:24px;font-weight:600}.wd-diagram .wd-emphasis{fill:#6486a8}.wd-diagram[data-mobile="true"] text{font-size:22px}.wd-diagram[data-mobile="true"] .wd-small{font-size:22px}.wd-diagram[data-mobile="true"] .wd-title{font-size:26px}.wd-diagram .wd-panel{fill:#eef3fa;fill-opacity:.78;stroke:#bfcde3;stroke-width:1.5}.wd-diagram .wd-node{fill:#f7fbfd;fill-opacity:.9;stroke:#bdd3e0;stroke-width:1.4}.wd-diagram .wd-wire{fill:none;stroke:#aac5d5;stroke-width:1.4;stroke-opacity:.45}.wd-diagram .wd-pulse{fill:none;stroke-width:2.5;stroke-linecap:round}.wd-diagram .wd-flow-dot{stroke:#fff;stroke-width:1.5}.wd-diagram .wd-token{stroke-width:1.15}.wd-diagram .wd-loss{fill:#739e90}.wd-diagram .wd-frozen{fill:#a08bbf;}';
  const wiresLayer = svgElement('g', { 'aria-hidden': 'true' }, svg);
  const nodesLayer = svgElement('g', {}, svg);
  const nodes = {};
  const wires = new Map();
  const mobileQuery = window.matchMedia('(max-width: 760px)');
  let mobile = mobileQuery.matches;
  let stageLayouts = layouts(mobile);
  let previousStep = -1;
  let currentBoxes = null;
  let fromBoxes = null;
  let last = { step: 0, time: 0, route: 'joint', still: true };
  let dead = false;

  function node(id, type, primary = '', secondary = '') {
    const g = svgElement('g', { 'data-node': id }, nodesLayer);
    const record = { g, type, frames: [] };
    if (type === 'pill') {
      record.shadow = svgElement('rect', { y: 4, fill: '#a9bfd4', 'fill-opacity': .13, rx: 14 }, g);
      record.rect = svgElement('rect', { class: 'wd-node', rx: 14 }, g);
    }
    record.title = label(g, primary, { class: type === 'loss' ? 'wd-small wd-loss' : 'wd-label' });
    record.sub = label(g, secondary, { class: 'wd-small' });
    if (type === 'frames') {
      record.frames = [miniFrame(g, id === 'source' ? 'human' : 'robot'), miniFrame(g, id === 'source' ? 'human' : 'robot')];
      record.title.setAttribute('text-anchor', 'middle');
    }
    if (type === 'wave') record.wave = svgElement('path', { fill: 'none', stroke: color.purple, 'stroke-width': 2.5, 'stroke-linecap': 'round', pathLength: 1 }, g);
    nodes[id] = record;
    return record;
  }
  node('source', 'frames', 'Human video');
  node('lam', 'pill', 'Frozen LAM');
  node('targets', 'pill', '32D targets', 'latent actions');
  node('context', 'frames', 'Observed video');
  node('instruction', 'pill', 'Language instruction');
  node('state', 'pill', '45D state', 'robot interface');
  node('future', 'frames', 'Future video');
  node('actions', 'pill', 'Latent actions', 'flow prediction');
  node('videoLoss', 'loss', 'Video loss');
  node('actionLoss', 'loss', 'Action loss');
  node('noisy', 'frames', 'Noisy future video');
  node('chunk', 'pill', '24-action chunk', '80D · replan every 12');
  nodes.chunk.cells = Array.from({length:24},()=>svgElement('rect',{rx:2,fill:'#80b5a7'},nodes.chunk.g));
  nodes.chunk.replan = svgElement('path',{'stroke':'#7297ac','stroke-width':1.2,'stroke-dasharray':'2 3'},nodes.chunk.g);
  node('direct', 'pill', '14D hands + 2D neck', 'Direct commands');
  node('sonic', 'pill', '64D body → SONIC', 'Body joint targets');
  node('status', 'text', '30 Hz continuous action stream');
  node('routeNote', 'text', 'Both training losses remain');

  const core = svgElement('g', { 'data-node': 'core' }, nodesLayer);
  const coreDepth = svgElement('rect', { x: 5, y: 7, rx: 26, fill: '#b3c1d8', 'fill-opacity': .25, stroke: '#c6d3e4', 'stroke-width': 1 }, core);
  const coreRect = svgElement('rect', { class: 'wd-panel', rx: 26 }, core);
  coreRect.style.fill = `url(#${prefix}-panel)`;
  const coreTitle = label(core, 'Shared world–action DiT', { class: 'wd-title' });
  const coreRule = svgElement('path', { fill: 'none', stroke: '#c8d4e7', 'stroke-width': 1 }, core);
  const rows = ['context', 'video', 'action'].map((kind, r) => {
    const g = svgElement('g', { 'data-token-row': kind }, core);
    const title = label(g, ['Clean context', 'Video tokens', 'Action tokens'][r], { class: 'wd-small', 'text-anchor': 'start' });
    const cells = Array.from({ length: 8 }, (_, i) => svgElement('rect', { class: 'wd-token', rx: 5, stroke: r === 2 ? '#9a89c0' : '#91b5c9', fill: `url(#${prefix}-${r === 2 ? 'purple' : 'blue'})` }, g));
    return { g, title, cells };
  });
  const contextRoute = svgElement('path', { fill: 'none', stroke: color.blue, 'stroke-width': 1.6, opacity: .8 }, core);
  const videoRoute = svgElement('path', { fill: 'none', stroke: color.purple, 'stroke-width': 2.4 }, core);
  const routeGate = svgElement('g', {}, core);
  svgElement('circle', { r: 10, fill: '#f5f4fb', stroke: '#b29bc9', 'stroke-width': 1.5 }, routeGate);
  svgElement('path', { d: 'M-4 -4 L4 4 M4 -4 L-4 4', stroke: '#a08bbf', 'stroke-width': 2, 'stroke-linecap': 'round' }, routeGate);
  nodes.core = { g: core, type: 'core' };

  function setNode(record, b, time, complete, step) {
    record.g.setAttribute('transform', `translate(${b.x.toFixed(2)} ${b.y.toFixed(2)})`);
    record.g.style.opacity = b.opacity.toFixed(3);
    record.g.style.visibility = b.opacity < .01 ? 'hidden' : 'visible';
    if (record.type === 'core') return;
    const { title, sub } = record;
    title.setAttribute('x', b.w / 2);
    sub.setAttribute('x', b.w / 2);
    if (record.rect) {
      record.rect.setAttribute('width', b.w);
      record.rect.setAttribute('height', b.h);
      record.shadow.setAttribute('width', b.w);
      record.shadow.setAttribute('height', b.h);
      const hasSub = !!sub.textContent;
      title.setAttribute('y', hasSub ? b.h / 2 - 4 : b.h / 2 + 7);
      sub.setAttribute('y', b.h / 2 + (mobile ? 23 : 21));
      if(record === nodes.chunk){
        title.setAttribute('y',25);sub.setAttribute('y',48);
        const gap=3, width=(b.w-40-gap*23)/24;
        const action=complete?12:Math.floor((time%800)/800*24);
        record.cells.forEach((cell,i)=>{cell.setAttribute('x',20+i*(width+gap));cell.setAttribute('y',65);cell.setAttribute('width',width);cell.setAttribute('height',9);cell.setAttribute('fill-opacity',i<=action?.95:.2);});
        record.replan.setAttribute('d',`M${b.w/2} 58 V82`);
      }
    } else if (record.type === 'frames') {
      title.setAttribute('y', 0);
      sub.setAttribute('y', b.h);
      const scale = Math.min(1.17, (b.w - 22) / 180);
      record.frames.forEach((f, i) => {
        const x = b.w / 2 + (i ? 8 : -92) * scale;
        f.g.setAttribute('transform', `translate(${x} 18) scale(${scale})`);
        const motion = complete ? .6 : at(time, 500 + i * 420, 2400);
        f.arm.setAttribute('transform', `translate(${motion * (i ? 9 : 3)} ${motion * -2})`);
        f.object.setAttribute('transform', `translate(${motion * (i ? 15 : 4)} 0)`);
        const human = step === 0;
        f.limb.setAttribute('d', human ? 'M15 10 Q21 18 25 20 Q32 21 38 26' : 'M15 11 L24 22 L38 24 L41 30');
        f.limb.setAttribute('stroke', human ? '#b69ac9' : '#84acc5');
        f.hand.style.opacity = human ? 1 : 0;
        f.gripper.style.opacity = human ? 0 : 1;
        f.joint.style.opacity = human ? 0 : 1;
        f.g.style.opacity = record === nodes.noisy ? (i ? .45 : .65) : (.7 + i * .3);
      });
    } else {
      title.setAttribute('y', 21);
      sub.setAttribute('y', 45);
    }
    if (record === nodes.lam) record.rect.setAttribute('stroke-dasharray', '4 4');
    if (record === nodes.targets || record === nodes.actions) { record.rect.style.fill = '#f1edf8'; record.rect.style.stroke = '#c9bade'; }
    if (record === nodes.direct || record === nodes.sonic || record === nodes.chunk) { record.rect.style.fill = '#eff8f5'; record.rect.style.stroke = '#afcec2'; }
  }

  function drawCore(b, step, time, still, route) {
    const deployment = step === 3;
    coreRect.setAttribute('width', b.w);
    coreRect.setAttribute('height', b.h);
    coreDepth.setAttribute('width', b.w);
    coreDepth.setAttribute('height', b.h);
    coreTitle.setAttribute('x', b.w / 2);
    coreTitle.setAttribute('y', mobile ? 39 : 38);
    coreTitle.textContent = mobile ? 'Shared world–action DiT' : 'Shared DiT';
    coreRule.setAttribute('d', `M22 56 H${b.w - 22}`);
    const rowY = deployment ? [79, 123, b.h - 65] : mobile ? [83, 143, 203] : [78, 78 + (b.h - 105) / 3, 78 + 2 * (b.h - 105) / 3];
    const cellWidth = Math.min(mobile ? 28 : 23, (b.w - 94) / 8);
    const cellGap = (b.w - 84 - cellWidth * 8) / 7;
    rows.forEach((row, r) => {
      row.g.setAttribute('transform', `translate(24 ${rowY[r]})`);
      row.g.style.opacity = deployment && r === 1 ? 0 : 1;
      row.title.setAttribute('x', 0);
      row.title.setAttribute('y', 0);
      row.title.textContent = r === 0 ? (deployment ? 'Cached observations' : 'Clean context') : r === 1 ? (step === 2 ? 'Noisy future tokens' : 'Video tokens') : step === 0 ? 'Latent-action tokens' : step === 2 ? 'Action queries' : 'Action tokens';
      row.cells.forEach((cell, i) => {
        const progress = still || r === 0 ? 1 : at(time, 1800 + i * 170 + (r === 2 ? 0 : 80), 1500);
        cell.setAttribute('x', i * (cellWidth + cellGap));
        cell.setAttribute('y', mobile ? 12 : 10);
        cell.setAttribute('width', cellWidth);
        cell.setAttribute('height', mobile ? 23 : 20);
        cell.setAttribute('fill-opacity', .14 + progress * .78);
        cell.setAttribute('stroke-dasharray', progress < .4 ? '2 3' : 'none');
      });
    });
    const cy = rowY[0] + 21, vy = rowY[1] + 21, ay = rowY[2] + 21;
    contextRoute.setAttribute('d', `M${b.w - 37} ${cy} H${b.w - 16} V${ay} H${b.w - 34}`);
    contextRoute.style.opacity = step === 2 ? 1 : .32;
    videoRoute.setAttribute('d', `M${b.w - 47} ${vy} H${b.w - 29} V${ay - 7} H${b.w - 39}`);
    videoRoute.style.opacity = deployment ? 0 : step !== 2 || route === 'joint' ? .85 : .13;
    videoRoute.setAttribute('stroke-dasharray', step === 2 && route === 'action' ? '3 5' : 'none');
    routeGate.setAttribute('transform', `translate(${b.w - 29} ${(vy + ay) / 2})`);
    routeGate.style.opacity = step === 2 && route === 'action' ? 1 : 0;
  }

  function endpoint(b, edge, fraction = .5) {
    if (edge === 'left') return [b.x, b.y + b.h * fraction];
    if (edge === 'right') return [b.x + b.w, b.y + b.h * fraction];
    if (edge === 'top') return [b.x + b.w * fraction, b.y];
    return [b.x + b.w * fraction, b.y + b.h];
  }
  function pathBetween(a, b, vertical) {
    if (vertical) { const middle = (a[1] + b[1]) / 2; return `M${a} C${a[0]} ${middle} ${b[0]} ${middle} ${b}`; }
    const middle = (a[0] + b[0]) / 2;
    return `M${a} C${middle} ${a[1]} ${middle} ${b[1]} ${b}`;
  }
  function connection(id, start, end, time, delay, tint = color.blue, vertical = false, still = false) {
    let item = wires.get(id);
    if (!item) {
      const g = svgElement('g', { 'data-connection': id }, wiresLayer);
      const base = svgElement('path', { class: 'wd-wire' }, g);
      const pulse = svgElement('path', { class: 'wd-pulse', pathLength: 1, 'stroke-dasharray': 1 }, g);
      const dot = svgElement('circle', { class: 'wd-flow-dot', r: 4 }, g);
      item = { g, base, pulse, dot, d: '', length: 0 };
      wires.set(id, item);
    }
    item.g.style.opacity = 1;
    const d = id === 'body-control' && !mobile
      ? `M${start} C${start[0]-48} ${start[1]} ${end[0]-48} ${end[1]} ${end}`
      : pathBetween(start, end, vertical);
    if (d !== item.d) {
      item.d = d;
      item.base.setAttribute('d', d);
      item.pulse.setAttribute('d', d);
      item.length = item.base.getTotalLength();
    }
    const progress = still ? 1 : at(time, delay, 1450);
    item.pulse.setAttribute('stroke', tint);
    item.pulse.setAttribute('stroke-dashoffset', 1 - progress);
    item.pulse.style.opacity = still ? .55 : .78;
    const running = !still && time > delay && time < delay + 4800;
    const phase = ((Math.max(0, time - delay) / 1800) % 1);
    item.dot.style.opacity = running ? Math.sin(phase * Math.PI).toFixed(3) : 0;
    if (running) {
      const point = item.base.getPointAtLength(phase * item.length);
      item.dot.setAttribute('cx', point.x);
      item.dot.setAttribute('cy', point.y);
      item.dot.setAttribute('fill', tint);
    }
  }

  function drawConnections(b, step, time, still) {
    wires.forEach(item => { item.g.style.opacity = 0; });
    const join = (id, from, to, opts = {}) => connection(id,
      endpoint(b[from], opts.a || (mobile ? 'bottom' : 'right'), opts.af ?? .5),
      endpoint(b[to], opts.b || (mobile ? 'top' : 'left'), opts.bf ?? .5),
      time, opts.delay ?? 600, opts.tint || color.blue, opts.vertical ?? mobile, still);
    if (step === 0) {
      join('human-to-lam', 'source', 'lam', { a: 'right', b: 'left', vertical: false, delay: 100 });
      join('lam-to-targets', 'lam', 'targets', { a: 'bottom', b: 'top', vertical: true, delay: 750, tint: color.purple });
    }
    if (step < 2) {
      join('target-supervision', 'targets', 'core', { bf: mobile ? .77 : .8, delay: 1350, tint: color.purple });
      if (step === 1) join('robot-state', 'state', 'core', { bf: mobile ? .83 : .28, delay: 900 });
    }
    join('observed-context', 'context', 'core', { bf: mobile ? .2 : .33, delay: 450 });
    join('language-conditioning', 'instruction', 'core', { bf: mobile ? .38 : .46, delay: 1100 });
    if (step === 2) join('noisy-future', 'noisy', 'core', { bf: mobile ? .8 : .57, delay: 800, tint: color.purple });
    if (step < 3) {
      join('video-output', 'core', 'future', { af: mobile ? .25 : .55, delay: 2800 });
      join('action-output', 'core', 'actions', { af: mobile ? .78 : .8, delay: 2800, tint: color.purple });
      join('video-objective', 'future', 'videoLoss', { a: 'bottom', b: 'top', vertical: true, delay: 4400, tint: color.mint });
      join('action-objective', 'actions', 'actionLoss', { a: 'bottom', b: 'top', vertical: true, delay: 4400, tint: color.mint });
    } else {
      join('deployment-state', 'state', 'core', { bf: mobile ? .8 : .76, delay: 850 });
      join('action-chunk', 'core', 'chunk', { af: mobile ? .5 : .74, bf: mobile ? .5 : .55, delay: 2200, tint: color.mint });
      join('direct-control', 'chunk', 'direct', { a: 'bottom', b: 'top', af: mobile ? .3 : .25, vertical: true, delay: 3600, tint: color.mint });
      if (mobile) join('body-control', 'chunk', 'sonic', { a: 'bottom', b: 'top', af: .75, vertical: true, delay: 3600, tint: color.mint });
      else connection('body-control', endpoint(b.chunk, 'left', .8), endpoint(b.sonic, 'left', .5), time, 3600, color.mint, true, still);
    }
  }

  function render(input = last) {
    if (dead) return;
    const step = Math.max(0, Math.min(3, Number(input.step) || 0));
    const time = Math.max(0, Number(input.time) || 0);
    const still = !!input.still;
    const route = input.route === 'action' ? 'action' : 'joint';
    last = { step, time, route, still };
    if (step !== previousStep) {
      fromBoxes = currentBoxes ? Object.fromEntries(Object.entries(currentBoxes).map(([key, value]) => [key, { ...value }])) : null;
      previousStep = step;
    }
    const target = stageLayouts[step];
    const transition = still || !fromBoxes ? 1 : smooth(time / 700);
    if (still) fromBoxes = null;
    currentBoxes = {};
    for (const [key, next] of Object.entries(target)) {
      const previous = fromBoxes?.[key] || next;
      currentBoxes[key] = Object.fromEntries(Object.keys(next).map(prop => [prop, lerp(previous[prop], next[prop], transition)]));
    }
    svg.dataset.step = METHOD_STEPS[step].key;
    svg.dataset.mobile = String(mobile);
    svg.setAttribute('aria-label', `${METHOD_STEPS[step].title} ${METHOD_STEPS[step].caption}`);
    nodes.source.title.textContent = step === 0 ? 'Human video' : 'Robot video';
    nodes.targets.title.textContent = step === 0 ? '32D targets' : '80D targets';
    nodes.targets.sub.textContent = step === 0 ? 'latent actions' : 'robot actions';
    nodes.actions.title.textContent = step === 0 ? 'Latent actions' : step === 2 ? 'Action prediction' : '80D robot actions';
    nodes.instruction.title.textContent = mobile ? 'Instruction' : 'Language instruction';
    nodes.context.title.textContent = step === 2 ? 'Clean observations' : 'Observed video';
    nodes.routeNote.title.textContent = route === 'action' ? 'Future-video access blocked' : 'Future-video access enabled';
    nodes.routeNote.sub.textContent = '';
    for (const [key, record] of Object.entries(nodes)) setNode(record, currentBoxes[key], time, still, step);
    drawCore(currentBoxes.core, step, time, still, route);
    drawConnections(currentBoxes, step, time, still);
  }

  function resize() {
    if (dead) return;
    const nextMobile = mobileQuery.matches;
    if (mobile !== nextMobile || !currentBoxes) {
      mobile = nextMobile;
      stageLayouts = layouts(mobile);
      fromBoxes = null;
      currentBoxes = null;
      previousStep = -1;
    }
    svg.setAttribute('viewBox', mobile ? '0 0 600 780' : '0 0 1200 460');
    render(last);
  }
  resize();
  return { render, resize, destroy() { dead = true; wires.clear(); svg.remove(); } };
}
