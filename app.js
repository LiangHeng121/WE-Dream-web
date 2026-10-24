import { mountHeroWall } from './modules/hero-wall.js';
import { createDemoDeck } from './modules/demo-deck.js';
import { createStagePlayer } from './modules/stage-player.js';
import { createSkillMix } from './modules/skill-mix.js';
import { seekVideo } from './modules/video-seek.js';
import { mountScrollReveal } from './modules/scroll-reveal.js';
const mountMethodFigure = root => import('./modules/method-figure.js').then(m=>m.mountMethodFigure(root));
const mountDatasetFilms = root => import('./modules/dataset-films.js').then(m=>m.mountDatasetFilms(root));
const mountResultsExplorer = root => import('./modules/results-explorer.js').then(m=>m.mountResultsExplorer(root));

const $ = (selector, root = document) => root.querySelector(selector);
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const clock = seconds => `${Math.floor((seconds || 0) / 60)}:${String(Math.floor((seconds || 0) % 60)).padStart(2, '0')}`;
const html = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const getJSON = path => fetch(path).then(r => { if(!r.ok) throw new Error(`${path}: ${r.status}`); return r.json(); });
let manifest;
let chapters;
let skillMedia;
const galleries=[];
const scrollReveal=mountScrollReveal();

function buildL1TaskGroups(groups) {
  const labels={position_cloth:'Clothes',position_chair:'Chairs',object_pillow:'Pillows & soft objects',object_shoe:'Shoes',background_pnp:'Pick & place',background_rubbish:'Rubbish disposal'};
  return groups.map(group=>{
    const tasks=new Map();
    group.clips.forEach((clip,index)=>{
      const key=clip.task||clip.sourceTaskKey||clip.taskLabel;
      if(!tasks.has(key))tasks.set(key,{key,label:labels[key]||clip.taskLabel||clip.title,indices:[],clips:[]});
      tasks.get(key).indices.push(index);tasks.get(key).clips.push(clip);
    });
    return [...tasks.values()];
  });
}

function mountGallery(root, groups, {label, badge, single = false, long = false, stages = false} = {}) {
  let groupIndex=0, activeItem=null, activeCard=null, activePlayer=null, visible=false, stageController=null;
  let players=[];
  const isL1=root.id==='l1-gallery', l1Tasks=isL1?buildL1TaskGroups(groups):[];
  root.classList.toggle('long-layout',long);
  root.classList.toggle('composition-layout',stages&&!long);
  const navigation=groups.map((g,i)=>{
    const attributes=isL1?`aria-expanded="${i===0}" aria-controls="${root.id}-tasks-${i}"`:`role="tab" aria-selected="${i===0}" aria-controls="${root.id}-content"`;
    const tab=`<button class="task-tab" type="button" ${attributes} tabindex="${isL1||i===0?0:-1}" id="${root.id}-tab-${i}"><span class="task-index">${String(i+1).padStart(2,'0')}</span><img src="${html(g.clips[0]?.poster||manifest.videos[g.clips[0]?.id]?.poster||'')}" alt="" loading="lazy"><span class="task-name">${html(g.label)}${long?'<small>Dedicated demonstrations</small>':''}</span><span class="task-arrow" aria-hidden="true">${isL1?(i===0?'−':'+'):'↗'}</span></button>`;
    if(!isL1)return tab;
    const children=l1Tasks[i].map((task,j)=>`<button type="button" class="l1-task-row" data-l1-condition="${i}" data-l1-task="${j}" aria-controls="${root.id}-content"><img src="${html(task.clips[0]?.poster||manifest.videos[task.clips[0]?.id]?.poster||'')}" alt="" loading="lazy"><span class="l1-task-text"><span class="l1-task-name">${html(task.label)}</span><span class="l1-task-meta">${task.clips.length} demos</span></span><span class="l1-task-progress" aria-hidden="true"></span></button>`).join('');
    return `<div class="l1-condition"><div class="l1-condition-heading">${tab}</div><div class="l1-subtasks" id="${root.id}-tasks-${i}" role="group" aria-labelledby="${root.id}-tab-${i}" ${i===0?'':'hidden'}>${children}</div></div>`;
  }).join('');
  const caption='<div class="gallery-caption"><div><p class="caption-label">PROMPT</p><h3 class="caption-title"></h3><p class="caption-copy"></p></div><a class="original-video-link" target="_blank" rel="noopener" aria-label="Open the original video">Original ↗</a></div>';
  const taskPaging=groups.length>4&&!long?'<div class="task-paging"><span>Browse tasks</span><button type="button" class="task-page-prev" aria-label="Scroll to previous tasks">↑</button><button type="button" class="task-page-next" aria-label="Scroll to more tasks">↓</button></div>':'';
  root.innerHTML=`<div class="gallery-shell"><div class="gallery-main" id="${root.id}-content" role="${isL1?'region':'tabpanel'}" aria-labelledby="${root.id}-tab-0"><div class="deck-host"></div>${caption}${!long&&!stages?'<div class="stage-host"></div>':''}</div><aside class="gallery-aside"><div class="gallery-nav-heading"><span>${long?'TWO EXTENDED ROUTINES':stages?'UNSEEN COMPOSITIONS':'CHOOSE A '+(isL1?'CONDITION':'SKILL')}</span><span>${String(groups.length).padStart(2,'0')}</span></div><div class="task-rail ${long?'long-tabs':''} ${groups.length>4?'task-rail-scroll':''}" role="${isL1?'group':'tablist'}" aria-label="${html(label)}" ${isL1?'':'aria-orientation="vertical"'}>${navigation}</div>${taskPaging}${long||stages?'<div class="stage-host"></div>':''}</aside></div>`;
  const tabs=[...root.querySelectorAll('.task-tab')], panel=$('.gallery-main',root), stageRoot=$('.stage-host',root),rail=$('.task-rail',root);
  const l1Panels=[...root.querySelectorAll('.l1-subtasks')],l1Rows=[...root.querySelectorAll('.l1-task-row')];
  const previousTasks=$('.task-page-prev',root),nextTasks=$('.task-page-next',root);
  function railState(){const horizontal=getComputedStyle(rail).flexDirection==='row';return{horizontal,position:horizontal?rail.scrollLeft:rail.scrollTop,size:horizontal?rail.clientWidth:rail.clientHeight,total:horizontal?rail.scrollWidth:rail.scrollHeight};}
  function updateTaskPaging(){const r=railState();if(!isL1)rail.setAttribute('aria-orientation',r.horizontal?'horizontal':'vertical');if(!previousTasks)return;previousTasks.disabled=r.position<2;nextTasks.disabled=r.position+r.size>=r.total-2;previousTasks.textContent=r.horizontal?'←':'↑';nextTasks.textContent=r.horizontal?'→':'↓';}
  function pageTasks(direction){const r=railState();rail.scrollBy({[r.horizontal?'left':'top']:direction*r.size*.85,behavior:reduced.matches?'instant':'smooth'});}
  previousTasks?.addEventListener('click',()=>pageTasks(-1));nextTasks?.addEventListener('click',()=>pageTasks(1));rail.addEventListener('scroll',updateTaskPaging,{passive:true});new ResizeObserver(()=>syncTabs(groupIndex)).observe(rail);updateTaskPaging();
  function syncTabs(index) {
    groupIndex=index;
    tabs.forEach((t,i)=>{
      if(isL1){t.setAttribute('aria-expanded',String(i===index));$('.task-arrow',t).textContent=i===index?'−':'+';t.tabIndex=0;}
      else{t.setAttribute('aria-selected',String(i===index));t.tabIndex=i===index?0:-1;}
    });
    if(isL1)l1Panels.forEach((p,i)=>{p.hidden=i!==index;});
    panel.setAttribute('aria-labelledby',`${root.id}-tab-${index}`);
    if(isL1)return;
    const tab=tabs[index],tr=tab.getBoundingClientRect(),rr=rail.getBoundingClientRect(),r=railState();
    // Keep selection visible within the sidebar without moving the page.
    if(r.horizontal)rail.scrollBy({left:tr.left-rr.left-(rail.clientWidth-tr.width)/2,behavior:reduced.matches?'instant':'smooth'});
    else if(tr.top<rr.top||tr.bottom>rr.bottom)rail.scrollBy({top:tr.top-rr.top-(rail.clientHeight-tr.height)/2,behavior:reduced.matches?'instant':'smooth'});
    updateTaskPaging();
  }
  function syncL1Tasks(index) {
    if(!isL1)return;
    l1Rows.forEach(row=>{
      const condition=Number(row.dataset.l1Condition),task=l1Tasks[condition][Number(row.dataset.l1Task)];
      const within=condition===groupIndex?task.indices.indexOf(index):-1,active=within>=0;
      row.classList.toggle('is-active',active);
      if(active)row.setAttribute('aria-current','true');else row.removeAttribute('aria-current');
      $('.l1-task-progress',row).textContent=active?`${String(within+1).padStart(2,'0')}/${String(task.clips.length).padStart(2,'0')}`:'↗';
      row.setAttribute('aria-label',`${task.label}, ${task.clips.length} demonstrations${active?`, showing ${within+1} of ${task.clips.length}`:''}. Show the first demonstration.`);
    });
  }
  function renderCard(item) {
    const media=manifest.videos[item.id]||{};
    const frame=document.createElement('div');frame.className='demo-card-inner';
    frame.innerHTML=`<video class="demo-video" muted loop playsinline preload="none" aria-label="${html(item.title)} — complete demonstration"></video><iframe class="drive-video" title="${html(item.title)} — original demonstration" allow="autoplay; fullscreen" allowfullscreen hidden></iframe><span class="video-tag">${html(badge)} · FULL SEQUENCE</span><div class="video-controls" data-deck-no-drag><button class="play-button" type="button" aria-label="Play video">▶</button><span class="video-time">0:00 / ${clock(media.duration||item.duration)}</span><div class="video-progress"><input class="video-seek" type="range" min="0" max="100" step="0.1" value="0" aria-label="Video progress" disabled></div><button class="speed-button" type="button" aria-label="Playback speed 1 times">1×</button><button class="fullscreen-button" type="button" aria-label="Enter fullscreen">⛶</button></div><div class="video-error" hidden><p>This video could not load.</p><a href="${html(item.sourceUrl)}" target="_blank" rel="noopener">Watch the full original ↗</a></div>`;
    const video=$('video',frame),remote=$('iframe',frame),play=$('.play-button',frame),seek=$('.video-seek',frame),time=$('.video-time',frame);
    if(media.ready||media.poster_ready) video.poster=media.poster;
    else if(item.poster) video.poster=item.poster;
    let loaded=false,userPaused=false,speed=1,wantPlay=false,seekTicket=0;
    const player={item,frame,video,remote,
      load(){
        const m=manifest.videos[item.id]||{};
        if(m.ready){
          remote.hidden=true;remote.removeAttribute('src');video.hidden=false;$('.video-controls',frame).hidden=false;
          if(!loaded){video.src=m.src;video.preload='metadata';if(m.poster)video.poster=m.poster;loaded=true;}
        }else{video.hidden=true;$('.video-controls',frame).hidden=true;remote.hidden=false;if(!remote.src)remote.src=`https://drive.google.com/file/d/${encodeURIComponent(item.id)}/preview`;}
      },
      play(){this.load();wantPlay=loaded&&!document.hidden&&!userPaused&&!reduced.matches;if(wantPlay)guardedPlay();},
      pause(){wantPlay=false;video.pause();if(!remote.hidden){remote.removeAttribute('src');remote.hidden=true;}},
      dispose(){this.pause();video.removeAttribute('src');video.load();},
      resetUserPause(){userPaused=false;wantPlay=true;},
      canResume(){return wantPlay&&!userPaused&&visible&&!document.hidden&&activePlayer===this;}
    };
    function guardedPlay(){if(!player.canResume())return;video.play().then(()=>{if(!player.canResume())video.pause();}).catch(()=>{});}
    const update=()=>{play.textContent=video.paused?'▶':'Ⅱ';play.setAttribute('aria-label',video.paused?'Play video':'Pause video');};
    function toggle(){player.load();userPaused=!video.paused;wantPlay=!userPaused;if(wantPlay)guardedPlay();else video.pause();}
    play.addEventListener('click',toggle);video.addEventListener('click',toggle);
    video.addEventListener('play',()=>{if(!player.canResume())video.pause();update();});video.addEventListener('pause',update);
    video.addEventListener('loadedmetadata',()=>{seek.disabled=false;time.textContent=`${clock(video.currentTime)} / ${clock(video.duration)}`;});
    video.addEventListener('timeupdate',()=>{if(!seek.matches(':active'))seek.value=video.duration?video.currentTime/video.duration*100:0;time.textContent=`${clock(video.currentTime)} / ${clock(video.duration)}`;});
    video.addEventListener('error',()=>{if(loaded)$('.video-error',frame).hidden=false;});
    seek.addEventListener('input',async()=>{
      if(!Number.isFinite(video.duration))return;
      const ticket=++seekTicket;
      const reached=await seekVideo(video,Number(seek.value)/100*video.duration);
      if(reached&&ticket===seekTicket&&player.canResume())guardedPlay();
    });
    $('.speed-button',frame).addEventListener('click',e=>{speed=speed===1?2:speed===2?.5:1;video.playbackRate=speed;e.currentTarget.textContent=`${speed}×`;e.currentTarget.setAttribute('aria-label',`Playback speed ${speed} times`);});
    $('.fullscreen-button',frame).addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else if(frame.requestFullscreen)await frame.requestFullscreen();else video.webkitEnterFullscreen?.();}catch{}});
    const full=$('.fullscreen-button',frame);if(!frame.requestFullscreen&&!video.webkitEnterFullscreen)full.hidden=true;
    frame.addEventListener('fullscreenchange',()=>{full.setAttribute('aria-label',document.fullscreenElement===frame?'Exit fullscreen':'Enter fullscreen');});
    players.push(player);return frame;
  }
  function onActive(index,{item,card}) {
    players.forEach(p=>p.pause());stageController?.destroy();stageController=null;
    activeItem=item;activeCard=card;activePlayer=players.find(p=>p.item.id===item.id);
    if(single)syncTabs(index);
    syncL1Tasks(index);
    $('.caption-label',root).textContent='PROMPT';
    $('.caption-title',root).textContent=item.title;
    const prompt=item.promptExact||item.prompt_exact||item.promptDisplay;
    $('.caption-copy',root).textContent=prompt?`“${prompt}”`:'Exact instruction pending confirmation.';
    $('.caption-copy',root).classList.toggle('prompt-pending',!prompt);
    if(item.promptStatus==='provisional'){
      const draft=document.createElement('span');draft.className='prompt-draft';draft.textContent='Draft';draft.title='Provisional instruction; replace with the recorded prompt when available.';$('.caption-copy',root).append(draft);
    }
    $('.original-video-link',root).href=item.sourceUrl;
    if(long&&chapters.clips[item.id]){
      // Stage seeking needs metadata, even when playback awaits intersection.
      activePlayer.load();
      const stagePlayer=activePlayer;
      stageController=createStagePlayer(stageRoot,chapters.clips[item.id],stagePlayer.video,{requestPlay:()=>stagePlayer.resetUserPause(),canPlay:()=>stagePlayer.canResume()});
    }else if(stages&&chapters.clips[item.id]){stageController=createSkillMix(stageRoot,chapters.clips[item.id],skillMedia);}
    else stageRoot.replaceChildren();
    if(visible)activePlayer.play();
  }
  const deck=createDemoDeck($('.deck-host',root),{items:single?groups.flatMap(g=>g.clips):groups[0].clips,renderCard,onActiveChange:onActive,label});
  function selectGroup(index){
    if(single){deck.goTo(index);return;}
    if(index===groupIndex)return;
    players.forEach(p=>p.dispose());players=[];stageController?.destroy();stageController=null;
    syncTabs(index);syncL1Tasks(0);deck.setItems(groups[index].clips);
    if(isL1&&!reduced.matches)l1Panels[index].animate([{opacity:.3,transform:'translateY(-4px)'},{opacity:1,transform:'translateY(0)'}],{duration:240,easing:'ease-out'});
    if(!reduced.matches) $('.deck-host',root).animate([{opacity:.35,transform:'translateY(6px)'},{opacity:1,transform:'translateY(0)'}],{duration:350});
  }
  tabs.forEach((t,i)=>t.addEventListener('click',()=>selectGroup(i)));
  l1Rows.forEach(row=>row.addEventListener('click',()=>{
    const condition=Number(row.dataset.l1Condition),task=l1Tasks[condition][Number(row.dataset.l1Task)];
    if(condition!==groupIndex)selectGroup(condition);
    deck.goTo(task.indices[0],{reason:'task-group'});
  }));
  $('.task-rail',root).addEventListener('keydown',e=>{
    if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(e.key))return;
    const current=tabs.indexOf(document.activeElement);if(current<0)return;e.preventDefault();
    const index=e.key==='Home'?0:e.key==='End'?tabs.length-1:(current+(['ArrowRight','ArrowDown'].includes(e.key)?1:-1)+tabs.length)%tabs.length;
    selectGroup(index);tabs[index].focus({preventScroll:true});
  });
  new IntersectionObserver(([entry])=>{visible=entry.isIntersecting;if(visible)activePlayer?.play();else players.forEach(p=>p.pause());},{threshold:.15}).observe($('.deck-host',root));
  document.addEventListener('visibilitychange',()=>{if(document.hidden)players.forEach(p=>p.pause());else if(visible)activePlayer?.play();});
  const gallery={refresh(){if(visible)activePlayer?.play();},deck};galleries.push(gallery);return gallery;
}

async function boot(){
  const [content,media,chapterData,skillData]=await Promise.all([getJSON('data/content.json'),getJSON('assets/media/manifest.json'),getJSON('data/chapters.json'),getJSON('data/skill-media.json')]);
  manifest=media;chapters=chapterData;skillMedia=skillData;
  mountGallery($('#id-gallery'),content.groups.id,{label:'In-domain tasks',badge:'IN-DOMAIN'});
  mountGallery($('#l1-gallery'),content.groups.l1,{label:'L1 generalization',badge:'L1 · GENERALIZATION'});
  mountGallery($('#l2-gallery'),content.groups.l2,{label:'L2 skill compositions',badge:'L2 · COMPOSITION',single:true,stages:true});
  mountGallery($('#long-gallery'),content.longHorizon.map(c=>({label:c.title,clips:[c]})),{label:'Long-horizon routines',badge:'LONG HORIZON',single:true,long:true,stages:true});
  scrollReveal.refresh();
  if(content.project.authors.length){const a=$('#authors');a.textContent=content.project.authors.join(' · ');a.hidden=false;}
  const results=await Promise.allSettled([mountHeroWall($('.hero')),mountMethodFigure($('#method-root')),mountDatasetFilms($('#dataset-root')),mountResultsExplorer($('#results-root'))].map(work=>Promise.resolve(work).then(value=>{scrollReveal.refresh();return value;})));
  results.forEach((result,i)=>{if(result.status==='rejected'){const name=['hero','method','dataset','results'][i];console.error(name,result.reason);const host=$(['.hero','#method-root','#dataset-root','#results-root'][i]);if(i>0){const message=document.createElement('p');message.className='module-error';message.textContent='This section could not load. Please refresh the page.';host.append(message);}}});
}
const menu=$('.menu-toggle'),mobile=$('#mobile-nav');
menu.addEventListener('click',()=>{const opened=menu.getAttribute('aria-expanded')==='true';menu.setAttribute('aria-expanded',String(!opened));menu.setAttribute('aria-label',opened?'Open navigation':'Close navigation');mobile.hidden=opened;});
mobile.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>{mobile.hidden=true;menu.setAttribute('aria-expanded','false');menu.setAttribute('aria-label','Open navigation');}));
boot().catch(error=>{console.error(error);$('#load-error').hidden=false;});
