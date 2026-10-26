const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pct = value => Number(value).toFixed(1).replace(/\.0$/, '');
const VISIBLE_STUDIES = ['baselines', 'objective', 'scaling'];

export async function mountResultsExplorer(root) {
  if (!root) return;
  root.classList.add('results-explorer');
  root.innerHTML = '<p class="rx-loading">Loading results…</p>';
  let data;
  try {
    const response = await fetch('data/results-detail.json?copy=v59&v=v38');
    if (!response.ok) throw new Error('Results unavailable');
    data = await response.json();
  } catch {
    root.innerHTML = '<p class="rx-loading">Results could not be loaded. Please refresh the page.</p>';
    return;
  }
  const studies = data.studies.filter(s => VISIBLE_STUDIES.includes(s.key));
  const methods = Object.fromEntries(data.methods.map(m => [m.key, m]));
  const lookup = new Map(data.records.map(r => [`${r.method}:${r.level}`, r]));
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const abort = new AbortController(), { signal } = abort;
  let study = 'baselines', level = 'id', metric = 'sr', task = 'overall';
  let chartKind = '', lineFrame = 0, lineValues = null, destroyed = false;
  const getStudy = () => studies.find(s => s.key === study);
  const getLevel = () => data.levels.find(l => l.key === level);
  const records = () => {
    const keys = getStudy().methods;
    // Keep the same ID-success ranking across levels, metrics and task selections.
    const idScore = key => lookup.get(`${key}:id`)?.overall.sr ?? -1;
    const order = study === 'scaling' ? keys : [...keys].sort((a, b) => idScore(b) - idScore(a));
    return order.map(k => lookup.get(`${k}:${level}`)).filter(Boolean);
  };
  const valueFor = r => task === 'overall' ? r.overall[metric] : r.tasks[task]?.[metric];
  const labelFor = r => getStudy().labels?.[r.method] || methods[r.method].label;
  root.innerHTML = `
    <div class="rx-studies" role="group" aria-label="Experiment">${studies.map(s => `<button type="button" data-study="${s.key}">${esc(s.label)}</button>`).join('')}</div>
    <div class="rx-heading"><h3></h3><p></p></div>
    <div class="rx-overview-head"><span class="rx-summary-model"></span><div class="rx-metrics" role="group" aria-label="Metric"><button type="button" data-metric="sr">Success rate</button><button type="button" data-metric="progress">Task progress</button></div></div>
    <div class="rx-level-cards" role="group" aria-label="Choose an evaluation setting">${data.levels.map(l => `<button type="button" class="rx-level-card" data-level="${l.key}" aria-pressed="false"><span class="rx-level-code">${esc(l.short)}</span><span class="rx-level-name">${esc(l.label)}</span><strong><span class="rx-level-value"></span><small>%</small></strong></button>`).join('')}</div>
    <div class="rx-toolbar"><div class="rx-chart-label"><span></span><button type="button" class="rx-reset" hidden>Overall ↗</button></div></div>
    <div class="rx-chart"></div>
    <details class="rx-per-task"><summary>Per-task results</summary><div class="rx-table-wrap" tabindex="0" role="region" aria-label="Per-task results; scroll horizontally for more tasks"></div><div class="rx-task-detail" aria-live="polite" hidden></div></details>
    <div class="rx-foot"><p class="rx-definition"></p></div>`;
  const chart = root.querySelector('.rx-chart');
  const table = root.querySelector('.rx-table-wrap');
  const detail = root.querySelector('.rx-task-detail');
  const barNodes = new Map();

  function renderBars(list) {
    cancelAnimationFrame(lineFrame); lineValues = null;
    if (chartKind !== 'bars') {
      chartKind = 'bars'; barNodes.clear();
      chart.innerHTML = '<div class="rx-axis" aria-hidden="true"><span></span><div><span>0</span><span>25</span><span>50</span><span>75</span><span>100%</span></div><span></span></div><div class="rx-bars"></div>';
    }
    const host = chart.querySelector('.rx-bars'), keep = new Set(list.map(r => r.method));
    for (const [key, node] of barNodes) if (!keep.has(key)) { node.remove(); barNodes.delete(key); }
    for (const r of list) {
      let row = barNodes.get(r.method);
      if (!row) {
        row = document.createElement('div'); row.className = 'rx-bar'; row.dataset.method = r.method;
        row.innerHTML = '<span class="rx-model"><span class="rx-model-name"></span><small class="rx-family"></small></span><span class="rx-track"><span class="rx-fill"></span></span><strong></strong>';
        barNodes.set(r.method, row);
      }
      row.classList.toggle('is-ours', methods[r.method].ours);
      row.querySelector('.rx-model-name').textContent = labelFor(r);
      const family = row.querySelector('.rx-family');
      family.hidden = study !== 'baselines' || methods[r.method].ours;
      family.textContent = methods[r.method].family;
      family.title = { WAM: 'World-Action Model', VLA: 'Vision-Language-Action Model' }[methods[r.method].family] || methods[r.method].family;
      const value = valueFor(r), available = Number.isFinite(value);
      row.querySelector('.rx-fill').style.width = `${available ? value : 0}%`;
      row.querySelector('strong').innerHTML = available ? `${pct(value)}<small>%</small>` : '—';
      row.setAttribute('aria-label', `${labelFor(r)}: ${available ? `${pct(value)}% ${data.metrics[metric].label.toLowerCase()}` : 'not evaluated'}`);
      host.append(row);
    }
  }

  function renderScaling(list, animate = true) {
    const hours = getStudy().hours, next = list.map(valueFor);
    if (chartKind !== 'scaling') {
      chartKind = 'scaling'; barNodes.clear(); lineValues = null;
      chart.innerHTML = `<div class="rx-line-plot"><svg role="img" aria-label="${esc(data.metrics[metric].label)} by human-video pretraining hours"><g class="rx-grid">${[0, 25, 50, 75, 100].map(v => `<line class="rx-gridline" data-value="${v}"/><text class="rx-y-label" data-value="${v}" text-anchor="end">${v}%</text>`).join('')}</g><polygon class="rx-area"/><polyline class="rx-line"/>${hours.map((h, i) => `<g class="rx-point" tabindex="0" data-index="${i}"><title></title><circle class="rx-point-ring" r="11"/><circle class="rx-point-core" r="5"/><text class="rx-point-value" text-anchor="middle"/><text class="rx-x-label" text-anchor="middle">${h / 1000}k hours</text></g>`).join('')}</svg></div>`;
    }
    cancelAnimationFrame(lineFrame);
    const width = Math.max(280, chart.clientWidth), height = width < 520 ? 255 : 290;
    const left = 46, right = 35, top = 35, bottom = 40;
    const x = i => left + (hours[i] - hours[0]) / (hours.at(-1) - hours[0]) * (width - left - right);
    const y = v => top + (100 - v) / 100 * (height - top - bottom);
    const svg = chart.querySelector('svg');
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.setAttribute('aria-label', `${data.metrics[metric].label} by human-video pretraining hours`);
    svg.querySelectorAll('.rx-gridline').forEach(el => { const yy = y(Number(el.dataset.value)); el.setAttribute('x1', left); el.setAttribute('x2', width - right); el.setAttribute('y1', yy); el.setAttribute('y2', yy); });
    svg.querySelectorAll('.rx-y-label').forEach(el => { el.setAttribute('x', left - 10); el.setAttribute('y', y(Number(el.dataset.value)) + 4); });
    const points = [...svg.querySelectorAll('.rx-point')];
    points.forEach((el, i) => {
      const text = `${hours[i] / 1000}k hours: ${pct(next[i])}% ${data.metrics[metric].label.toLowerCase()}`;
      el.setAttribute('aria-label', text); el.querySelector('title').textContent = text;
      el.querySelector('.rx-point-value').textContent = `${pct(next[i])}%`;
      const label = el.querySelector('.rx-x-label'); label.setAttribute('x', x(i)); label.setAttribute('y', height - 10);
    });
    const paint = values => {
      lineValues = [...values];
      const positions = values.map((v, i) => `${x(i)},${y(v)}`).join(' ');
      svg.querySelector('.rx-line').setAttribute('points', positions);
      svg.querySelector('.rx-area').setAttribute('points', `${left},${height - bottom} ${positions} ${width - right},${height - bottom}`);
      points.forEach((el, i) => {
        el.querySelectorAll('circle').forEach(c => { c.setAttribute('cx', x(i)); c.setAttribute('cy', y(values[i])); });
        const label = el.querySelector('.rx-point-value'); label.setAttribute('x', x(i)); label.setAttribute('y', y(values[i]) - 18);
      });
    };
    if (!animate || reduced.matches || !lineValues) { paint(next); return; }
    const from = [...lineValues], start = performance.now();
    const step = now => {
      if (destroyed) return;
      const fraction = Math.min(1, (now - start) / 420), ease = 1 - (1 - fraction) ** 3;
      paint(next.map((v, i) => from[i] + (v - from[i]) * ease));
      if (fraction < 1) lineFrame = requestAnimationFrame(step);
    };
    lineFrame = requestAnimationFrame(step);
  }

  function renderTable(list) {
    const tasks = getLevel().tasks;
    table.innerHTML = `<table><thead><tr><th scope="col">Model</th>${tasks.map(t => `<th scope="col">${esc(t.label)}${level === 'l1' ? `<small>${esc(t.group)}</small>` : ''}</th>`).join('')}<th scope="col">Overall</th></tr></thead><tbody>${list.map(r => `<tr class="${methods[r.method].ours ? 'is-ours' : ''}"><th scope="row">${esc(labelFor(r))}</th>${tasks.map(t => {
      const v = r.tasks[t.key]?.[metric];
      return `<td>${Number.isFinite(v) ? `<button type="button" data-method="${r.method}" data-task="${t.key}" style="--tint:${.035 + v / 100 * .2}" aria-label="Compare ${esc(t.label)}: ${esc(labelFor(r))}, ${pct(v)}% ${data.metrics[metric].label.toLowerCase()}">${pct(v)}<span class="rx-cell-unit">%</span></button>` : '—'}</td>`;
    }).join('')}<td class="rx-overall">${pct(r.overall[metric])}%</td></tr>`).join('')}</tbody></table>`;
    detail.hidden = true;
  }

  function showTaskDetail(record) {
    const values = record.tasks[task], item = getLevel().tasks.find(t => t.key === task);
    detail.hidden = false;
    detail.innerHTML = `<div class="rx-detail-top"><strong>${esc(labelFor(record))}</strong><span>${esc(item.label)}</span><span><b>${pct(values.sr)}%</b> success rate</span><span><b>${pct(values.progress)}%</b> task progress</span></div>${values.trials?.length ? `<div class="rx-trials" aria-label="Individual trials">${values.trials.map(t => `<span tabindex="0" class="rx-trial ${t.success ? 'is-success' : 'is-failure'}" title="Trial ${t.trial}: ${t.success ? 'success' : 'incomplete'} · ${pct(t.progress)}% task progress" aria-label="Trial ${t.trial}: ${t.success ? 'success' : 'incomplete'}, ${pct(t.progress)} percent task progress">${t.trial}</span>`).join('')}</div>` : ''}`;
  }

  function render(rebuildTable = true) {
    const s = getStudy(), l = getLevel(), list = records();
    root.dataset.level = level; root.dataset.study = study;
    const summaryKey = study === 'objective' ? 'latent-2k' : 'we-dream-10k';
    root.querySelector('.rx-summary-model').textContent = methods[summaryKey].label;
    root.querySelectorAll('.rx-level-card').forEach(b => {
      const result = lookup.get(`${summaryKey}:${b.dataset.level}`).overall[metric];
      b.querySelector('.rx-level-value').textContent = pct(result);
      b.setAttribute('aria-pressed', String(b.dataset.level === level));
      b.setAttribute('aria-label', `Show ${data.levels.find(l => l.key === b.dataset.level).label}: ${methods[summaryKey].label}, ${pct(result)}% ${data.metrics[metric].label.toLowerCase()}`);
    });
    root.querySelectorAll('[data-study]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.study === study)));
    root.querySelectorAll('[data-metric]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.metric === metric)));
    root.querySelector('.rx-heading h3').textContent = s.title;
    root.querySelector('.rx-heading p').textContent = s.description;
    root.querySelector('.rx-chart-label > span').textContent = task === 'overall' ? l.label : l.tasks.find(t => t.key === task).label;
    root.querySelector('.rx-reset').hidden = task === 'overall';
    if (study === 'scaling') renderScaling(list); else renderBars(list);
    if (rebuildTable) renderTable(list);
    const definition = metric === 'sr' ? 'Success rate measures fully completed trials.' : 'Task progress is the average fraction of task stages completed.';
    const unit = level === 'l1' ? 'condition' : level === 'l2' ? 'task composition' : 'task';
    const protocol = task === 'overall'
      ? `Each model is evaluated 10 times per ${unit} (${l.tasks.length} ${unit}s in total).`
      : `Each model is evaluated 10 times for this ${unit}.`;
    root.querySelector('.rx-definition').textContent = `${protocol} ${definition}`;
  }
  root.querySelectorAll('[data-level]').forEach(b => b.addEventListener('click', () => { level = b.dataset.level; task = 'overall'; render(); }, { signal }));
  root.querySelectorAll('[data-study]').forEach(b => b.addEventListener('click', () => { study = b.dataset.study; task = 'overall'; render(); }, { signal }));
  root.querySelectorAll('[data-metric]').forEach(b => b.addEventListener('click', () => { metric = b.dataset.metric; render(); }, { signal }));
  root.querySelector('.rx-reset').addEventListener('click', () => { task = 'overall'; render(); }, { signal });
  table.addEventListener('click', event => {
    const cell = event.target.closest('button[data-task]'); if (!cell) return;
    task = cell.dataset.task; render(false);
    table.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b === cell)));
    showTaskDetail(lookup.get(`${cell.dataset.method}:${level}`));
  }, { signal });
  let lastWidth = 0;
  const resize = new ResizeObserver(() => {
    const width = Math.round(chart.clientWidth);
    if (width === lastWidth) return; lastWidth = width;
    if (chartKind === 'scaling') renderScaling(records(), false);
  });
  resize.observe(chart);
  reduced.addEventListener('change', () => { if (chartKind === 'scaling') renderScaling(records(), false); }, { signal });
  render();
  return {
    selectStudy(key) { if (studies.some(s => s.key === key)) { study = key; task = 'overall'; render(); } },
    destroy() { destroyed = true; abort.abort(); resize.disconnect(); cancelAnimationFrame(lineFrame); root.replaceChildren(); }
  };
}
