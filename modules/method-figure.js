import { videoFullyBuffered } from './video-warm.js?v=v35';
import { METHOD_PARTS, createMethodDiagram } from './method-diagram.js?v=v35';

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
  let selected = null, preview;
  let inView = false, destroyed = false, frame = 0, last = 0, drawn = 0, time = 0;
  const focus = () => preview === undefined ? selected : preview;
  const overview = 'Two training stages. A 50/50 attention route during training. One action-only policy at deployment.';
  root.classList.add('method-explorer', 'method-overview');
  root.innerHTML = `
    <div class="mf-parts" role="group" aria-label="Highlight a part of the method">
      <button class="mf-overview-button" type="button" data-focus="all" aria-pressed="true">Full method</button>
      ${METHOD_PARTS.map((part,i)=>`<button type="button" data-focus="${i}" aria-pressed="false"><span class="mf-part-index">0${i+1}</span><span>${part.label}</span></button>`).join('')}
    </div>
    <div class="mf-viewport">
      <div class="mf-diagram"></div>
      <div class="mf-method-film" data-method-film="human" data-part="0"><div class="mf-film-frame"><video muted loop playsinline preload="none" data-src="assets/media/method-v35/human-pretraining-mosaic.mp4" poster="assets/media/method-v35/human-pretraining-mosaic.jpg?v=v35" aria-label="Four human egocentric demonstrations in a video mosaic"></video></div></div>
      <div class="mf-method-film" data-method-film="robot" data-part="1"><div class="mf-film-frame"><video muted loop playsinline preload="none" data-src="assets/media/method-v35/robot-posttraining-mosaic.mp4" poster="assets/media/method-v35/robot-posttraining-mosaic.jpg?v=v35" aria-label="Four robot demonstrations from the G1 head camera in a video mosaic"></video></div></div>
      <div class="mf-method-film" data-method-film="execution" data-part="3"><div class="mf-film-frame"><video muted loop playsinline preload="none" data-src="assets/media/method-v35/deployment-prefilter1080.mp4" poster="assets/media/method-v35/deployment-prefilter1080.jpg?v=v35" aria-label="WE-Dream executing a whole-body clothes collection task"></video></div></div>
    </div>
    <div class="mf-overview-footer"><p class="mf-focus-caption"></p></div>`;
  const viewport = root.querySelector('.mf-viewport');
  const buttons = [...root.querySelectorAll('[data-focus]')];
  const films = [...root.querySelectorAll('[data-method-film]')];
  const on = (target,event,fn) => target.addEventListener(event,fn,{signal});
  const diagram = createMethodDiagram(root.querySelector('.mf-diagram'), {onFocus:index=>selectPart(index)});
  function videoVisible(video) {
    const r=video.getBoundingClientRect();
    return r.width>0 && r.height>0 && Math.min(r.bottom,innerHeight)-Math.max(r.top,0)>r.height*.25;
  }
  const controllers = films.map(film => {
    const video = film.querySelector('video');
    return createMethodVideoController(video, {
      mayPlay: () => !destroyed && inView && !motionQuery.matches && !document.hidden && videoVisible(video),
      shouldSuspend: () => document.hidden || !inView || !videoVisible(video), signal,
    });
  });
  const syncVideos = () => controllers.forEach(controller => controller.sync());
  function positionVideos() {
    const layout=diagram.getLayout(), [,,w,h]=layout.viewBox;
    films.forEach(film => {
      const box=layout.videos[film.dataset.methodFilm];
      film.style.left=`${box.x/w*100}%`;film.style.top=`${box.y/h*100}%`;
      film.style.width=`${box.width/w*100}%`;film.style.height=`${box.height/h*100}%`;
    });
  }
  function render() {
    const active=focus();
    root.dataset.methodFocus=active===null?'all':METHOD_PARTS[active].key;
    diagram.render({focus:active,time,still:motionQuery.matches});
  }
  function updateFocus() {
    const active=focus();
    buttons.forEach(button=>{
      const index=button.dataset.focus==='all'?null:Number(button.dataset.focus);
      button.setAttribute('aria-pressed',String(index===selected));
      button.classList.toggle('is-active',index===active);
    });
    films.forEach(film => film.classList.toggle('is-muted',active!==null && active!==Number(film.dataset.part)));
    root.querySelector('.mf-focus-caption').textContent=active===null?overview:METHOD_PARTS[active].caption;
    render();syncVideos();
  }
  function selectPart(index) {
    if(index!==null&&(!Number.isInteger(index)||index<0||index>=METHOD_PARTS.length))return;
    selected=index;preview=undefined;updateFocus();
  }
  buttons.forEach(button=>{
    const index=button.dataset.focus==='all'?null:Number(button.dataset.focus);
    on(button,'click',()=>selectPart(index));
    on(button,'pointerenter',event=>{if(event.pointerType!=='touch'){preview=index;updateFocus();}});
    on(button,'focus',()=>{preview=index;updateFocus();});
  });
  const parts=root.querySelector('.mf-parts');
  on(parts,'pointerleave',()=>{preview=undefined;updateFocus();});
  on(parts,'focusout',event=>{if(!parts.contains(event.relatedTarget)){preview=undefined;updateFocus();}});
  on(parts,'keydown',event=>{
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
    const index=buttons.indexOf(event.target);if(index<0)return;
    event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowRight'?1:-1)+buttons.length)%buttons.length;
    buttons[next].focus({preventScroll:true});
  });
  function tick(now) {
    frame=0;if(destroyed||!inView||document.hidden||motionQuery.matches){last=0;return;}
    time+=last?Math.min(100,now-last):0;last=now;
    if(now-drawn>=1000/30){render();drawn=now;}
    frame=requestAnimationFrame(tick);
  }
  function sync() {
    if(destroyed)return;
    syncVideos();
    if(!inView||document.hidden||motionQuery.matches){cancelAnimationFrame(frame);frame=0;last=0;}
    else if(!frame){last=0;frame=requestAnimationFrame(tick);}
  }
  on(document,'visibilitychange',sync);
  on(motionQuery,'change',()=>{render();sync();});
  on(window,'resize',()=>{diagram.resize();positionVideos();render();sync();});
  on(window,'scroll',()=>{if(inView)syncVideos();});
  let observer;
  if('IntersectionObserver' in window){observer=new IntersectionObserver(entries=>{inView=entries[0].isIntersecting;sync();},{threshold:0});observer.observe(viewport);}
  else inView=true;
  positionVideos();updateFocus();sync();
  return {selectStage(key){if(key==='all'){selectPart(null);return;}const i=METHOD_PARTS.findIndex(s=>s.key===key);if(i>=0)selectPart(i);},destroy(){destroyed=true;abort.abort();observer?.disconnect();cancelAnimationFrame(frame);controllers.forEach(controller=>controller.destroy());diagram.destroy();root.replaceChildren();root.classList.remove('method-explorer','method-overview');}};
}
