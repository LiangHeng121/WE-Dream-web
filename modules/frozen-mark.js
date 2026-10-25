/** Animated, rounded snowflakes for the TOP-LEFT corner of Frozen LAM.
 * x/y are top-left coordinates; size is SVG user units; time is milliseconds.
 * Owns no RAF, listeners, CSS, or external resources. render({still:true})
 * freezes motion in a legible neutral pose. destroy removes only this marker.
 */
let markerSequence = 0;
const NS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs, parent) => {
  const node = document.createElementNS(NS, tag);
  Object.entries(attrs || {}).forEach(([key, value]) => node.setAttribute(key, value));
  parent?.append(node); return node;
};
const set = (node, attrs) => Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
const VARIANTS = {
  softSnowflake: { width: 6, branch: 'M0 0V-21 M0-11 L-8-18 M0-11 L8-18', colors: ['#b0ddf0','#5d9ac4','#9298ce'], wobble: 7, period: 1.5 },
  glassSnowflake: { width: 4.6, branch: 'M0 0V-22 M0-12 L-8-19 M0-12 L8-19', colors: ['#b7e6f2','#5798bf','#8b96cb'], wobble: 3, period: 1.1 },
  playfulSnowflake: { width: 6.8, branch: 'M0 0V-20 M0-10 L-8-17 M0-10 L8-17', colors: ['#a8d9ed','#619cc8','#a196d2'], wobble: 10, period: 1.8 },
};

export function createFrozenMark(parent, { x = -10, y = -14, size = 32, variant = 'softSnowflake' } = {}) {
  if (!parent || parent.namespaceURI !== NS) throw new TypeError('createFrozenMark requires an SVG parent');
  const kind = Object.hasOwn(VARIANTS, variant) ? variant : 'softSnowflake';
  const spec = VARIANTS[kind];
  const id = `frozen-mark-${++markerSequence}`;
  const root = el('g', { class: 'frozen-mark', 'data-variant': kind, 'aria-hidden': 'true', transform: `translate(${x} ${y}) scale(${size / 64})` }, parent);
  const defs = el('defs', {}, root);
  const grad = el('linearGradient', { id: `${id}-ice`, x1: '5%', y1: '0%', x2: '90%', y2: '100%', gradientUnits: 'objectBoundingBox' }, defs);
  spec.colors.forEach((color, index) => el('stop', { offset: `${index*50}%`, 'stop-color': color }, grad));
  const glintGrad = el('radialGradient', { id: `${id}-shine` }, defs);
  el('stop', { offset: '0%', 'stop-color': '#ffffff', 'stop-opacity': .95 }, glintGrad);
  el('stop', { offset: '100%', 'stop-color': '#ffffff', 'stop-opacity': 0 }, glintGrad);
  const drift = el('g', {}, root);
  const turn = el('g', { transform: 'translate(32 32)' }, drift);
  const layers = [
    { stroke: '#88a8c5', width: spec.width+2.2, opacity: .13, transform: 'translate(0 1.7)' },
    { stroke: '#ffffff', width: spec.width+2.4, opacity: .94 },
    { stroke: `url(#${id}-ice)`, width: spec.width, opacity: kind==='glassSnowflake'?.84:1 },
  ];
  layers.forEach(layer => {
    const g = el('g', { fill: 'none', stroke: layer.stroke, 'stroke-width': layer.width, opacity: layer.opacity, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', transform: layer.transform || '' }, turn);
    for(let i=0;i<6;i++) el('path', { d: spec.branch, transform: `rotate(${i*60})` }, g);
  });
  const highlights = el('g', { fill:'none', stroke:'#effbff', 'stroke-width': kind==='glassSnowflake'?1.5:1.9, opacity:.56, 'stroke-linecap':'round', transform:'translate(-.7 -.8)' }, turn);
  for(let i=0;i<6;i++) el('path', { d:'M0-6 V-18 M0-12 L-5-16', transform:`rotate(${i*60})` }, highlights);
  el('circle', { cx:0, cy:0, r:kind==='playfulSnowflake'?5:4.3, fill:'#a8cde5', stroke:'#eff9ff', 'stroke-width':1.2 }, turn);
  el('circle', { cx:-1, cy:-1.3, r:2, fill:'#ffffff', opacity:.55 }, turn);
  const gloss = el('circle', { cx:27, cy:20, r:10, fill:`url(#${id}-shine)`, opacity:.42 }, drift);
  const sparkles = [[54,16,1.9],[8,39,1.5],[48,55,1.25]].map(([cx,cy,r]) => el('circle',{cx,cy,r,fill:'#81b3d4',opacity:.55},root));
  let destroyed = false;
  function render({ time=0, still=false }={}) {
    if(destroyed)return;
    const t=still?0:(Number.isFinite(time)?time:0)/1000;
    const wave=still?0:Math.sin(t*spec.period);
    const bounce=still?0:Math.sin(t*spec.period+.4)*(kind==='playfulSnowflake'?1.4:.65);
    set(drift,{transform:`translate(0 ${bounce})`});
    set(turn,{transform:`translate(32 32) rotate(${wave*spec.wobble})`});
    set(gloss,{cx:still?27:26+Math.sin(t*.8)*12,cy:still?20:22+Math.cos(t*.8)*10,opacity:still?.38:.3+(Math.sin(t*1.6)+1)*.18});
    sparkles.forEach((node,i)=>{const w=still?0:Math.sin(t*1.5+i*1.9);set(node,{transform:`translate(${w*.8} ${-w*1.2})`,opacity:.38+(w+1)*.16});});
  }
  render({still:true});
  return {node:root,render,destroy(){if(!destroyed){destroyed=true;root.remove();}}};
}
