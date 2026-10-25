import { videoFullyBuffered } from './video-warm.js?v=v32';
import { METHOD_STEPS, createMethodDiagram } from './method-diagram.js?v=v32';

// One clock owns the entire diagram. Offscreen/hidden time is never accumulated.
export function createMethodClock(steps, reduced = false) {
  const state = { index: 0, time: 0, paused: reduced };
  const total = steps.reduce((sum, item) => sum + item.duration, 0);
  function select(index) {
    state.index = Math.max(0, Math.min(steps.length - 1, index));
    state.time = 0;
  }
  function seek(fraction) {
    let time = Math.max(0, Math.min(1, fraction)) * total;
    let index = 0;
    while (index < steps.length - 1 && time >= steps[index].duration) time -= steps[index++].duration;
    state.index = index; state.time = time;
  }
  function advance(dt) {
    if (state.paused || !Number.isFinite(dt) || dt <= 0) return false;
    const previous = state.index;
    state.time += Math.min(dt, 100);
    while (state.time >= steps[state.index].duration) {
      state.time -= steps[state.index].duration;
      state.index = (state.index + 1) % steps.length;
    }
    return state.index !== previous;
  }
  function progress() { return (steps.slice(0, state.index).reduce((s, x) => s + x.duration, 0) + state.time) / total; }
  return { state, select, seek, advance, progress };
}

export function createMethodVideoController(video, { mayPlay, shouldSuspend, signal } = {}) {
  let saved = null, restoring = false, disposed = false;
  function suspend() {
    if (!video.getAttribute('src') || videoFullyBuffered(video)) return;
    if (!saved) saved = { time: Number.isFinite(video.currentTime) ? video.currentTime : 0, rate: video.playbackRate || 1 };
    restoring = false;
    video.pause(); video.removeAttribute('src'); video.preload = 'none'; video.load();
  }
  function sync() {
    if (disposed) return;
    if (!mayPlay()) {
      video.pause();
      if (shouldSuspend()) suspend();
      return;
    }
    if (!video.getAttribute('src')) {
      video.preload = 'auto'; video.src = video.dataset.src; video.load();
    }
    if (saved) {
      if (video.readyState < 1) return;
      const end = Number.isFinite(video.duration) ? Math.max(0, video.duration - .05) : saved.time;
      const target = Math.min(saved.time, end);
      if (!restoring) {
        restoring = true; video.playbackRate = saved.rate;
        if (Math.abs(video.currentTime - target) > .05) {
          try { video.currentTime = target; } catch { restoring = false; return; }
        }
      }
      if (video.seeking || video.readyState < 2 || Math.abs(video.currentTime - target) > .1) return;
      saved = null; restoring = false;
    }
    if (!video.paused) return;
    video.play().then(() => { if (disposed || !mayPlay()) video.pause(); }).catch(() => {});
  }
  function destroy() {
    if (disposed) return;
    disposed = true; saved = null;
    video.pause();
    if (video.getAttribute('src')) { video.removeAttribute('src'); video.load(); }
    for (const event of ['loadedmetadata', 'loadeddata', 'canplay', 'seeked']) video.removeEventListener(event, sync);
    video.removeEventListener('play', guard);
    signal?.removeEventListener('abort', destroy);
  }
  const guard = () => { if (disposed || !mayPlay()) video.pause(); };
  for (const event of ['loadedmetadata', 'loadeddata', 'canplay', 'seeked']) video.addEventListener(event, sync);
  video.addEventListener('play', guard);
  signal?.addEventListener('abort', destroy, { once: true });
  if (signal?.aborted) destroy();
  return { sync, destroy };
}

export function mountMethodFigure(root) {
  if (!root) return;
  const abort = new AbortController(), { signal } = abort;
  const motionQuery = matchMedia('(prefers-reduced-motion: reduce)');
  const clock = createMethodClock(METHOD_STEPS, motionQuery.matches);
  let inView = false, destroyed = false, frame = 0, last = 0, drawn = 0, routeOverride = null;
  root.classList.add('method-explorer', 'method-story');
  root.innerHTML = `
    <div class="mf-story-top">
      <div class="mf-story-copy"><span class="mf-story-category">THE LEARNING JOURNEY</span><h3 id="mf-chapter-title"></h3><p class="mf-story-caption"></p></div>
      <div class="mf-story-controls"><button class="mf-play" type="button" aria-label="Pause method animation"><span aria-hidden="true">Ⅱ</span></button><button class="mf-replay" type="button" aria-label="Replay the method walkthrough"><span aria-hidden="true">↺</span></button></div>
    </div>
    <div class="mf-viewport" role="tabpanel" id="mf-stage" aria-labelledby="mf-tab-pretrain">
      <div class="mf-diagram"></div>
      <div class="mf-execution" hidden><div class="mf-film-frame"><video muted loop playsinline preload="none" data-src="assets/media/hd1080/1puOhktSpme4E-M6At185A0rK9V-ax5ez.mp4" poster="assets/media/curated/1puOhktSpme4E-M6At185A0rK9V-ax5ez.jpg?v=v32" aria-label="WE-Dream executing a whole-body clothes collection task"></video></div><span>Whole-body execution</span></div>
    </div>
    <div class="mf-understage"><div class="mf-route-controls" role="group" aria-label="Compare the two training attention routes" hidden><span>Training route</span><button type="button" data-route="joint" aria-pressed="true">Joint</button><button type="button" data-route="action" aria-pressed="false">Action-only</button></div><p class="mf-stage-note"></p></div>
    <div class="mf-chapters" role="tablist" aria-label="Explore the WE-Dream method">${METHOD_STEPS.map((step,i)=>`<button type="button" role="tab" id="mf-tab-${step.key}" data-chapter="${i}" aria-controls="mf-stage" aria-selected="${i===0}" tabindex="${i===0?0:-1}"><span class="mf-chapter-index">0${i+1}</span><span class="mf-chapter-label">${step.label}</span><span class="mf-chapter-track" aria-hidden="true"><i></i></span></button>`).join('')}</div>
    <div class="mf-story-footer"><span class="mf-story-position" aria-hidden="true">01 / 04</span><input class="mf-story-scrub" type="range" min="0" max="1000" value="0" aria-label="Method walkthrough progress"><a href="assets/paper.pdf#page=3" target="_blank" rel="noopener">Method in the paper ↗</a></div>`;
  const viewport = root.querySelector('.mf-viewport');
  const diagram = createMethodDiagram(root.querySelector('.mf-diagram'));
  const tabs = [...root.querySelectorAll('[data-chapter]')];
  const play = root.querySelector('.mf-play'), scrub = root.querySelector('.mf-story-scrub');
  const execution = root.querySelector('.mf-execution');
  const videos = [...root.querySelectorAll('.mf-execution video')];
  const on = (target,event,fn) => target.addEventListener(event,fn,{signal});
  const notes = ['Visual transitions become action targets.', 'One pretrained backbone. One humanoid policy.', 'Used in both training stages · both prediction losses stay active.', '24 actions per chunk · replan every 12'];
  function videoVisible(video) {
    const r=video.getBoundingClientRect();
    return r.width>0 && r.height>0 && Math.min(r.bottom,innerHeight)-Math.max(r.top,0)>r.height*.25;
  }
  const mayPlay = video => !destroyed && inView && clock.state.index===3 && !clock.state.paused && !motionQuery.matches && !document.hidden && videoVisible(video);
  const controllers=videos.map(video=>createMethodVideoController(video,{mayPlay:()=>mayPlay(video),shouldSuspend:()=>document.hidden||!inView||clock.state.index!==3||!videoVisible(video),signal}));
  function render() {
    const {index,time}=clock.state;
    const route = index === 3 ? 'action' : (routeOverride || (time < METHOD_STEPS[index].duration*.52 ? 'joint' : 'action'));
    diagram.render({step:index,time,route,still:motionQuery.matches});
    root.dataset.methodRoute=route;
    root.style.setProperty('--chapter-progress',String(Math.min(1,time/METHOD_STEPS[index].duration)));
    scrub.value=String(Math.round(clock.progress()*1000));
    root.querySelectorAll('[data-route]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.route===route)));
  }
  function updateChapter() {
    const {index}=clock.state, step=METHOD_STEPS[index];
    root.dataset.methodStep=step.key;
    root.querySelector('#mf-chapter-title').textContent=step.title;
    root.querySelector('.mf-story-caption').textContent=step.caption;
    root.querySelector('.mf-stage-note').textContent=notes[index];
    root.querySelector('.mf-story-position').textContent=`0${index+1} / 04`;
    root.querySelector('.mf-route-controls').hidden=index!==2;
    execution.hidden=index!==3;
    viewport.setAttribute('aria-labelledby',`mf-tab-${step.key}`);
    scrub.setAttribute('aria-valuetext',`${index+1} of 4: ${step.label}`);
    tabs.forEach((button,i)=>{button.setAttribute('aria-selected',String(i===index));button.tabIndex=i===index?0:-1;button.classList.toggle('is-past',i<index);});
    controllers.forEach(controller=>controller.sync());
  }
  function syncControls() {
    play.disabled=motionQuery.matches;
    play.setAttribute('aria-label',motionQuery.matches?'Reduced motion enabled':clock.state.paused?'Play method animation':'Pause method animation');
    play.innerHTML=`<span aria-hidden="true">${clock.state.paused?'▷':'Ⅱ'}</span>`;
    root.dataset.methodMotion=clock.state.paused||motionQuery.matches?'paused':'playing';
  }
  function tick(now) {
    frame=0;
    if (destroyed||!inView||document.hidden||clock.state.paused||motionQuery.matches) {last=0;return;}
    const dt=last?now-last:0;last=now;
    if(clock.advance(dt)){routeOverride=null;updateChapter();}
    if(now-drawn>=1000/30){render();drawn=now;}
    frame=requestAnimationFrame(tick);
  }
  function sync() {
    if(destroyed)return;
    syncControls();
    controllers.forEach(controller=>controller.sync());
    if(!inView||document.hidden||clock.state.paused||motionQuery.matches){cancelAnimationFrame(frame);frame=0;last=0;}
    else if(!frame){last=0;frame=requestAnimationFrame(tick);}
  }
  function selectChapter(index) {
    clock.select(index);
    // A paused chapter jump should still reveal its complete diagram.
    if(clock.state.paused&&!motionQuery.matches)clock.state.time=METHOD_STEPS[index].duration*.72;
    routeOverride=null;updateChapter();render();sync();
  }
  tabs.forEach((button,i)=>on(button,'click',()=>selectChapter(i)));
  on(root.querySelector('.mf-chapters'),'keydown',event=>{
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
    const current=tabs.indexOf(event.target);if(current<0)return;
    event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?tabs.length-1:(current+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;
    selectChapter(next);tabs[next].focus({preventScroll:true});
  });
  on(play,'click',()=>{clock.state.paused=!clock.state.paused;sync();});
  on(root.querySelector('.mf-replay'),'click',()=>{clock.state.paused=motionQuery.matches;selectChapter(0);});
  on(scrub,'input',()=>{clock.state.paused=true;routeOverride=null;clock.seek(Number(scrub.value)/1000);updateChapter();render();sync();});
  root.querySelectorAll('[data-route]').forEach(button=>on(button,'click',()=>{routeOverride=button.dataset.route;render();}));
  on(document,'visibilitychange',sync);
  on(motionQuery,'change',()=>{clock.state.paused=motionQuery.matches;render();sync();});
  on(window,'resize',()=>{diagram.resize();render();sync();});
  on(window,'scroll',()=>{if(inView&&clock.state.index===3)controllers.forEach(controller=>controller.sync());});
  let observer;
  if('IntersectionObserver' in window){observer=new IntersectionObserver(entries=>{inView=entries[0].isIntersecting&&entries[0].intersectionRatio>=.12;sync();},{threshold:[0,.12,.25]});observer.observe(viewport);}
  else inView=true;
  updateChapter();render();sync();
  return {selectStage(key){const i=METHOD_STEPS.findIndex(s=>s.key===key);if(i>=0)selectChapter(i);},destroy(){destroyed=true;abort.abort();observer?.disconnect();cancelAnimationFrame(frame);controllers.forEach(c=>c.destroy());diagram.destroy();root.replaceChildren();root.classList.remove('method-explorer','method-story');}};
}
