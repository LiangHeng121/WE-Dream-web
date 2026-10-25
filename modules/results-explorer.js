const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pct=value=>Number(value).toFixed(1).replace(/\.0$/,'');
export async function mountResultsExplorer(root) {
  if (!root) return;
  root.classList.add('results-explorer');
  root.innerHTML='<p class="rx-loading">Loading the complete results…</p>';
  let data;
  try {const response=await fetch('data/results-detail.json?v=v26');if(!response.ok)throw new Error('Results unavailable');data=await response.json();}
  catch {root.innerHTML='<p class="rx-loading">Read the complete results in the <a href="assets/paper.pdf#page=6" target="_blank" rel="noopener">paper ↗</a>.</p>';return;}
  let study='baselines',level='id',metric='sr',task='overall',view='chart',selected=null;
  const studies=data.studies.filter(s=>['baselines','objective','scaling'].includes(s.key));
  const idScore=key=>data.records.find(r=>r.method===key&&r.level==='id')?.overall.sr??-1;
  const byIdSuccess=records=>[...records].sort((a,b)=>idScore(b.method)-idScore(a.method));
  const methods=Object.fromEntries(data.methods.map(m=>[m.key,m]));
  const getStudy=()=>data.studies.find(s=>s.key===study);
  const getLevel=()=>data.levels.find(l=>l.key===level);
  const getRecords=()=>getStudy().methods.map(key=>data.records.find(r=>r.method===key&&r.level===level)).filter(Boolean);
  const valueFor=r=>task==='overall'?r.overall[metric]:r.tasks[task]?.[metric];
  const labelFor=r=>getStudy().labels?.[r.method]||methods[r.method].label;
  root.innerHTML=`<div class="rx-topline"><p class="rx-kicker">EXPERIMENTS, OPEN TO EXPLORATION</p><a class="rx-source-link" href="assets/paper.pdf#page=6" target="_blank" rel="noopener">Paper results ↗</a></div>
  <div class="rx-studies" role="group" aria-label="Experiment">${studies.map(s=>`<button type="button" data-study="${s.key}">${esc(s.label)}</button>`).join('')}</div>
  <div class="rx-heading"><h3></h3><p></p></div>
  <div class="rx-controls"><div class="rx-levels" role="group" aria-label="Evaluation setting">${data.levels.map(l=>`<button type="button" data-level="${l.key}">${esc(l.short)}</button>`).join('')}</div><div class="rx-metrics" role="group" aria-label="Metric"><button type="button" data-metric="sr">Success</button><button type="button" data-metric="progress">Progress</button></div><label class="rx-select-label">Task<select class="rx-task" aria-label="Task or condition"></select></label><div class="rx-views" role="group" aria-label="Chart or table"><button type="button" data-view="chart" aria-label="Show chart">Chart</button><button type="button" data-view="table" aria-label="Show complete task table">All tasks</button></div></div>
  <div class="rx-plot-header"><p class="rx-context"></p><span class="rx-sort-note">Ordered by in-domain success ↓</span></div>
  <div class="rx-visual"></div><div class="rx-detail" aria-live="polite"></div>
  <div class="rx-foot"><p class="rx-definition"></p><p class="rx-source"></p></div>`;
  const visual=root.querySelector('.rx-visual');
  function detail(record) {
    selected=record.method;const model=methods[record.method],values=task==='overall'?record.overall:record.tasks[task];
    const item=task==='overall'?'All tasks':getLevel().tasks.find(t=>t.key===task)?.label;
    const trialData=task==='overall'?[]:values?.trials||[];
    const sourcePage=metric==='progress'?13:study==='routing'?8:record.source.paperPage;
    root.querySelector('.rx-detail').innerHTML=`<div class="rx-detail-top"><strong>${esc(labelFor(record))}</strong><span>${esc(item)} · ${values.n} trials</span><span><b>${pct(values.sr)}%</b> success</span><span><b>${pct(values.progress)}%</b> progress</span><a href="assets/paper.pdf#page=${sourcePage}" target="_blank" rel="noopener">Paper p. ${sourcePage} ↗</a></div>${trialData.length?`<div class="rx-trials"><span>Trials</span>${trialData.map(t=>`<span tabindex="0" class="rx-trial ${t.success?'is-success':'is-failure'}" title="Trial ${t.trial}: ${t.success?'success':'incomplete'} · ${pct(t.progress)}% progress" aria-label="Trial ${t.trial}: ${t.success?'success':'incomplete'}, ${pct(t.progress)} percent progress">${t.trial}</span>`).join('')}<small>Filled = completed task</small></div>`:''}`;
    root.querySelectorAll('.rx-bar').forEach(el=>el.classList.toggle('is-selected',el.dataset.method===selected));
  }
  function renderBars(records) {
    records=byIdSuccess(records);
    visual.innerHTML=`<div class="rx-axis"><span></span><div><span>0</span><span>25</span><span>50</span><span>75</span><span>100%</span></div><span></span></div><div class="rx-bars">${records.map(r=>{
      const model=methods[r.method],value=valueFor(r),n=task==='overall'?r.overall.n:10;
      return `<button type="button" class="rx-bar ${model.ours?'is-ours':''}" data-method="${r.method}" title="${esc(labelFor(r))}: ${pct(value)}% ${data.metrics[metric].label.toLowerCase()}, N = ${n}"><span class="rx-model"><span>${esc(labelFor(r))}</span><small>${esc(model.family)}</small></span><span class="rx-track"><span class="rx-fill" style="--value:${value}%"></span></span><strong>${pct(value)}<small>%</small></strong></button>`;
    }).join('')}</div>`;
    visual.querySelectorAll('.rx-bar').forEach(el=>el.addEventListener('click',()=>detail(records.find(r=>r.method===el.dataset.method))));
    const active=records.find(r=>r.method===selected)||records.find(r=>r.method==='we-dream-10k')||records.at(-1);if(active)detail(active);
  }
  function renderTable(records) {
    records=byIdSuccess(records);
    const tasks=getLevel().tasks;
    visual.innerHTML=`<div class="rx-table-wrap" tabindex="0" role="region" aria-label="All task results, scroll horizontally"><table><thead><tr><th scope="col">Model</th>${tasks.map(t=>`<th scope="col"><span>${esc(t.label)}</span>${level==='l1'?`<small>${esc(t.group)}</small>`:''}</th>`).join('')}<th scope="col">Overall</th></tr></thead><tbody>${records.map(r=>`<tr class="${methods[r.method].ours?'is-ours':''}"><th scope="row">${esc(labelFor(r))}</th>${tasks.map(t=>{const v=r.tasks[t.key]?.[metric];return `<td><button type="button" data-method="${r.method}" data-task="${t.key}" style="--tint:${Math.max(.025,v/100*.22)}" title="${esc(t.label)} · ${pct(v)}% ${data.metrics[metric].label.toLowerCase()} · 10 trials">${pct(v)}</button></td>`;}).join('')}<td class="rx-overall">${pct(r.overall[metric])}</td></tr>`).join('')}</tbody></table></div><p class="rx-table-hint">Values are percentages. Select a cell to inspect its task.</p>`;
    visual.querySelectorAll('button[data-task]').forEach(el=>el.addEventListener('click',()=>{task=el.dataset.task;root.querySelector('.rx-task').value=task;detail(records.find(r=>r.method===el.dataset.method));}));
    const active=records.find(r=>r.method===selected)||records.at(-1);if(active)detail(active);
  }
  function renderScaling(records) {
    const vals=records.map(valueFor),hours=getStudy().hours;
    const width=900,height=290,left=65,right=40,top=37,bottom=47;
    const x=i=>left+(hours[i]-hours[0])/(hours.at(-1)-hours[0])*(width-left-right),y=v=>top+(100-v)/100*(height-top-bottom);
    const points=vals.map((v,i)=>`${x(i)},${y(v)}`).join(' ');
    visual.innerHTML=`<div class="rx-line-plot"><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Performance by human-video pretraining scale.">${[0,25,50,75,100].map(v=>`<line class="rx-gridline" x1="${left}" y1="${y(v)}" x2="${width-right}" y2="${y(v)}"/><text class="rx-y-label" x="${left-12}" y="${y(v)+4}" text-anchor="end">${v}%</text>`).join('')}<polygon class="rx-area" points="${left},${height-bottom} ${points} ${width-right},${height-bottom}"/><polyline class="rx-line" points="${points}"/>${vals.map((v,i)=>`<g class="rx-point" tabindex="0" role="button" data-index="${i}" aria-label="${hours[i]/1000}k hours: ${pct(v)}%"><circle class="rx-point-ring" cx="${x(i)}" cy="${y(v)}" r="11"/><circle class="rx-point-core" cx="${x(i)}" cy="${y(v)}" r="5"/><text class="rx-point-value" x="${x(i)}" y="${y(v)-18}" text-anchor="middle">${pct(v)}%</text><text class="rx-x-label" x="${x(i)}" y="${height-15}" text-anchor="middle">${hours[i]/1000}k hours</text></g>`).join('')}</svg></div>`;
    visual.querySelectorAll('[data-index]').forEach(el=>{const show=()=>detail(records[Number(el.dataset.index)]);el.addEventListener('click',show);el.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();show();}});});detail(records.at(-1));
  }
  function render() {
    const s=getStudy();if(!s.levels.includes(level))level=s.levels[0];
    const l=getLevel();if(task!=='overall'&&!l.tasks.some(t=>t.key===task))task='overall';
    root.querySelectorAll('[data-study]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.study===study)));
    root.querySelector('.rx-heading h3').textContent=s.title;root.querySelector('.rx-heading p').textContent=s.description;
    root.querySelectorAll('[data-level]').forEach(b=>{b.disabled=!s.levels.includes(b.dataset.level);b.setAttribute('aria-pressed',String(b.dataset.level===level));});
    root.querySelectorAll('[data-metric]').forEach(b=>{b.setAttribute('aria-pressed',String(b.dataset.metric===metric));});
    root.querySelectorAll('[data-view]').forEach(b=>{b.setAttribute('aria-pressed',String(b.dataset.view===view));});
    const taskSelect=root.querySelector('.rx-task');taskSelect.innerHTML='<option value="overall">Overall</option>'+l.tasks.map(t=>`<option value="${t.key}">${esc(t.label)}${level==='l1'?' · '+esc(t.group):''}</option>`).join('');taskSelect.value=task;taskSelect.disabled=view==='table';
    const records=getRecords();const count=records.length;
    root.querySelector('.rx-context').textContent=view==='table'?`${l.label} · 10 trials per task · N = ${l.n} per model · ${count} models`:`${l.label} · ${task==='overall'?l.n:10} trials per model · ${count} models`;
    root.querySelector('.rx-sort-note').hidden=study==='scaling'&&view==='chart';
    if(study==='scaling'&&view==='chart')renderScaling(records);else if(view==='table')renderTable(records);else renderBars(records);
    root.querySelector('.rx-definition').textContent=`${data.metrics[metric].label}: ${data.metrics[metric].definition} ${data.aggregation}`;
    const page=metric==='progress'?13:study==='routing'?8:level!=='id'?7:study==='objective'?5:6;
    const label=metric==='progress'?'Appendix tables':study==='routing'?'Table II':level!=='id'?'Figure 8':study==='objective'?'Figure 5':study==='scaling'?'Figure 6':'Table I';
    root.querySelector('.rx-source').innerHTML=`<a href="assets/paper.pdf#page=${page}" target="_blank" rel="noopener">${study==='all'?'Paper · reported results':`${label} · paper p. ${page}`} ↗</a>${study==='baselines'&&level!=='id'?'<span>Four external baselines evaluated in this setting.</span>':''}${study==='scaling'?'<span>Nominal data scales; the public/in-house source mix changes with scale.</span>':''}`;
  }
  root.querySelectorAll('[data-study]').forEach(b=>b.addEventListener('click',()=>{study=b.dataset.study;task='overall';selected=null;render();}));
  root.querySelectorAll('[data-level]').forEach(b=>b.addEventListener('click',()=>{level=b.dataset.level;task='overall';selected=null;render();}));
  root.querySelectorAll('[data-metric]').forEach(b=>b.addEventListener('click',()=>{metric=b.dataset.metric;render();}));
  root.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>{view=b.dataset.view;task='overall';render();}));
  root.querySelector('.rx-task').addEventListener('change',e=>{task=e.target.value;render();});
  render();
  return {selectStudy:key=>{if(studies.some(s=>s.key===key)){study=key;render();}},destroy:()=>root.replaceChildren()};
}
