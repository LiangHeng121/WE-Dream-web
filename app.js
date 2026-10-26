import { mountHeroWall } from './modules/hero-wall.js?v=v38';
import { createStreamVideo } from './modules/stream-video.js?v=v38';
import { createDemoDeck } from './modules/demo-deck.js?v=v38';
import { createStagePlayer } from './modules/stage-player.js?v=v38';
import { createSkillMix } from './modules/skill-mix.js?v=v38';
import { seekVideo } from './modules/video-seek.js?v=v38';
import { createVideoWarmScheduler, monitorVideoPlayback } from './modules/video-warm.js?v=v38';
import { mountScrollReveal } from './modules/scroll-reveal.js?v=v38';
const mountMethodFigure = root => import('./modules/method-figure.js?v=v38').then(m=>m.mountMethodFigure(root));
const mountDatasetFilms = root => import('./modules/dataset-films.js?v=v38').then(m=>m.mountDatasetFilms(root));
const mountResultsExplorer = root => import('./modules/results-explorer.js?v=v38').then(m=>m.mountResultsExplorer(root));

const $ = (selector, root = document) => root.querySelector(selector);
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const clock = seconds => `${Math.floor((seconds || 0) / 60)}:${String(Math.floor((seconds || 0) % 60)).padStart(2, '0')}`;
const html = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const getJSON = path => fetch(path).then(r => { if(!r.ok) throw new Error(`${path}: ${r.status}`); return r.json(); });
let manifest;
let chapters;
let skillMedia;
const galleries=[];
const mediaDebug=new URLSearchParams(location.search).get('mediaDebug')==='1';
const scrollReveal=mountScrollReveal();

function canWarmNearGallery() {
  return !galleries.some(gallery=>gallery.visible);
}
function syncGalleryWarmPriority() {
  const foreground=!canWarmNearGallery();
  for(const gallery of galleries){
    if(gallery.visible)continue;
    if(foreground)gallery.stopNearWarm();
    else gallery.resumeNearWarm();
  }
}

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

function mountGallery(root, groups, {label, badge, level, single = false, long = false, stages = false} = {}) {
  root.dataset.mountAt=performance.now().toFixed(1);
  let groupIndex=0, activeItem=null, activeCard=null, activePlayer=null, visible=false, stageController=null;
  const players=[];
  const playerCache=new Map(), groupDecks=new Map(), transitioning=new Set();
  let deck, currentGroup=null, groupRevision=0, groupAnimations=[], near=false, groupSelection=Promise.resolve(), inMotion=false, previewPlayer=null;
  const warmer=createVideoWarmScheduler({isProtected:player=>visible&&!document.hidden&&(player===activePlayer||transitioning.has(player))});
  const constrained=Boolean(navigator.connection?.saveData||/^(slow-)?2g$/.test(navigator.connection?.effectiveType||''));
  const isL1=root.id==='l1-gallery', l1Tasks=isL1?buildL1TaskGroups(groups):[];
  const thumbnail=clip=>manifest.videos[clip?.id]?.thumb||clip?.poster||manifest.videos[clip?.id]?.poster||'';
  root.classList.toggle('long-layout',long);
  root.classList.toggle('composition-layout',stages&&!long);
  const navigation=groups.map((g,i)=>{
    const attributes=isL1?`aria-expanded="${i===0}" aria-controls="${root.id}-tasks-${i}"`:`role="tab" aria-selected="${i===0}" aria-controls="${root.id}-content"`;
    const tab=`<button class="task-tab" type="button" ${attributes} tabindex="${isL1||i===0?0:-1}" id="${root.id}-tab-${i}"><span class="task-index">${String(i+1).padStart(2,'0')}</span><img src="${html(thumbnail(g.clips[0]))}" alt="" loading="lazy" fetchpriority="low" decoding="async"><span class="task-name">${html(g.label)}${long?'<small>Dedicated demonstrations</small>':''}</span><span class="task-arrow" aria-hidden="true">${isL1?(i===0?'−':'+'):'↗'}</span></button>`;
    if(!isL1)return tab;
    const children=l1Tasks[i].map((task,j)=>`<button type="button" class="l1-task-row" data-l1-condition="${i}" data-l1-task="${j}" aria-controls="${root.id}-content"><img src="${html(thumbnail(task.clips[0]))}" alt="" loading="lazy" fetchpriority="low" decoding="async"><span class="l1-task-text"><span class="l1-task-name">${html(task.label)}</span><span class="l1-task-meta">${task.clips.length} demos</span></span><span class="l1-task-progress" aria-hidden="true"></span></button>`).join('');
    return `<div class="l1-condition"><div class="l1-condition-heading">${tab}</div><div class="l1-subtasks" id="${root.id}-tasks-${i}" role="group" aria-labelledby="${root.id}-tab-${i}" ${i===0?'':'hidden'}>${children}</div></div>`;
  }).join('');
  const caption='<div class="gallery-caption"><div><p class="caption-label">PROMPT</p><h3 class="caption-title"></h3><p class="caption-copy"></p></div></div>';
  const taskPaging=groups.length>4&&!long?'<div class="task-paging"><button type="button" class="task-page-prev" aria-label="Scroll to previous tasks">↑</button><button type="button" class="task-page-next" aria-label="Scroll to more tasks">↓</button></div>':'';
  root.innerHTML=`<div class="gallery-shell"><div class="gallery-main" id="${root.id}-content" role="${isL1?'region':'tabpanel'}" aria-labelledby="${root.id}-tab-0"><div class="deck-host"></div>${caption}${!long&&!stages?'<div class="stage-host"></div>':''}</div><aside class="gallery-aside"><div class="gallery-nav-heading"><span>${long?'TWO EXTENDED ROUTINES':stages?'UNSEEN COMPOSITIONS':'CHOOSE A '+(isL1?'CONDITION':'TASK')}</span><span>${String(groups.length).padStart(2,'0')}</span></div><div class="task-rail ${long?'long-tabs':''} ${groups.length>4?'task-rail-scroll':''}" role="${isL1?'group':'tablist'}" aria-label="${html(label)}" ${isL1?'':'aria-orientation="vertical"'}>${navigation}</div>${taskPaging}${long||stages?'<div class="stage-host"></div>':''}</aside></div>`;
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
    if(playerCache.has(item.id))return playerCache.get(item.id).frame;
    const media=manifest.videos[item.id]||{};
    const frame=document.createElement('div');frame.className='demo-card-inner';
    frame.innerHTML=`<video class="demo-video" muted loop playsinline preload="none" aria-label="${html(item.title)} — complete demonstration"></video><iframe class="drive-video" title="${html(item.title)} — original demonstration" allow="autoplay; fullscreen" allowfullscreen hidden></iframe><span class="video-tag${long?'':' wall-level-badge'}"${level?` data-level="${level}"`:''}>${html(badge)}${long?' · FULL SEQUENCE':''}</span><div class="video-controls" data-deck-no-drag><button class="play-button" type="button" aria-label="Play video">▶</button><span class="video-time">0:00 / ${clock(media.duration||item.duration)}</span><div class="video-progress"><input class="video-seek" type="range" min="0" max="100" step="0.1" value="0" aria-label="Video progress" disabled></div><button class="speed-button" type="button" aria-label="Playback speed 1 times">1×</button><button class="fullscreen-button" type="button" aria-label="Enter fullscreen">⛶</button></div><div class="video-error" hidden><p>This video could not load.</p><a href="${html(item.sourceUrl)}" target="_blank" rel="noopener">Watch the full original ↗</a></div>`;
    const video=$('video',frame),remote=$('iframe',frame),play=$('.play-button',frame),seek=$('.video-seek',frame),time=$('.video-time',frame);
    video.dataset.clipId=item.id;
    const poster=(media.ready||media.poster_ready?media.poster:item.poster)||'';
    let loaded=false,userPaused=false,speed=1,wantPlay=false,seekTicket=0,resumeAt=0;
    const stream=createStreamVideo(video,{src:media.src,hlsSrc:media.hls_src,canPlay:()=>player.canResume()});
    const player={item,frame,video,remote,
      isBoundedPreview:()=>stream.isStreaming,
      showPoster(){if(poster&&video.getAttribute('poster')!==poster)video.poster=poster;},
      load(preload='metadata'){
        const m=manifest.videos[item.id]||{};
        if(m.ready){
          remote.hidden=true;remote.removeAttribute('src');video.hidden=false;$('.video-controls',frame).hidden=false;
          if(visible)this.showPoster();
          if(!loaded)loaded=true;
          stream.load();
        }else{video.hidden=true;$('.video-controls',frame).hidden=true;remote.hidden=false;if(!remote.src)remote.src=`https://drive.google.com/file/d/${encodeURIComponent(item.id)}/preview`;}
      },
      warm(options){this.load();return loaded?stream.warm(options):undefined;},
      relax(){if(loaded&&!this.canResume())stream.stop();},
      suspend(){
        if(!loaded||this.canResume())return;
        stream.stop();
        if(mediaDebug)video.dataset.suspendedAt=performance.now().toFixed(1);
      },
      play(){this.load('auto');wantPlay=loaded&&!document.hidden&&!userPaused&&!reduced.matches;if(wantPlay){playback.requestPlay();guardedPlay();}},
      pause(){wantPlay=false;video.pause();if(!warmer.isPreparing(this))this.relax();if(!remote.hidden){remote.removeAttribute('src');remote.hidden=true;}},
      dispose(){this.pause();stream.destroy();},
      resetUserPause(){userPaused=false;wantPlay=true;},
      canResume(){return wantPlay&&!userPaused&&visible&&!document.hidden&&(activePlayer===this||transitioning.has(this));}
    };
    const playback=monitorVideoPlayback(video,{enabled:mediaDebug,isWanted:()=>player.canResume()});
    async function guardedPlay(){if(!player.canResume())return;const ready=await stream.start();if(!ready||!player.canResume())return;video.play().then(()=>{if(!player.canResume())video.pause();}).catch(()=>{});}
    video.addEventListener('streamfallback',()=>{if(player.canResume())guardedPlay();});
    const update=()=>{play.textContent=video.paused?'▶':'Ⅱ';play.setAttribute('aria-label',video.paused?'Play video':'Pause video');};
    function toggle(){player.load();userPaused=!video.paused;wantPlay=!userPaused;if(wantPlay){playback.requestPlay();guardedPlay();}else{video.pause();stream.stop();}}
    play.addEventListener('click',toggle);video.addEventListener('click',toggle);
    video.addEventListener('play',()=>{if(!player.canResume())video.pause();update();});video.addEventListener('pause',update);
    video.addEventListener('loadeddata',()=>{
      if(!video.dataset.firstDataAt){const at=performance.now().toFixed(1);video.dataset.firstDataAt=at;if(!root.dataset.firstDataAt)root.dataset.firstDataAt=at;}
      // A native stream can finish after warm() timed out. Only the still-current
      // primary may resume its neighbor queue; never an old hovered target.
      if(player===activePlayer&&visible&&!document.hidden&&!warmer.priorityPlayer)warmNeighbors(Math.max(0,deck.getActiveIndex()));
    });
    video.addEventListener('playing',()=>{
      if(!player.canResume()){video.pause();return;}
      frame.removeAttribute('aria-busy');play.removeAttribute('title');$('.video-error',frame).hidden=true;
      if(!video.dataset.firstPlayingAt){const at=performance.now().toFixed(1);video.dataset.firstPlayingAt=at;if(!root.dataset.firstPlayingAt)root.dataset.firstPlayingAt=at;}
    });
    const updateTime=()=>{
      const duration=Number.isFinite(video.duration)&&video.duration>0?video.duration:media.duration||item.duration;
      seek.disabled=!(Number.isFinite(video.duration)&&video.duration>0);
      if(!seek.matches(':active'))seek.value=duration?video.currentTime/duration*100:0;
      time.textContent=`${clock(video.currentTime)} / ${clock(duration)}`;
    };
    video.addEventListener('loadedmetadata',()=>{if(resumeAt>0){try{video.currentTime=resumeAt;}catch{}resumeAt=0;}updateTime();});
    video.addEventListener('durationchange',updateTime);video.addEventListener('timeupdate',updateTime);video.addEventListener('emptied',updateTime);
    video.addEventListener('waiting',()=>{if(player.canResume()){frame.setAttribute('aria-busy','true');play.title='Buffering…';}});
    video.addEventListener('pause',()=>{frame.removeAttribute('aria-busy');play.removeAttribute('title');});
    video.addEventListener('error',()=>{if(loaded)$('.video-error',frame).hidden=false;});
    seek.addEventListener('input',async()=>{
      if(!Number.isFinite(video.duration))return;
      const ticket=++seekTicket;playback.requestSeek();
      const reached=await seekVideo(video,Number(seek.value)/100*video.duration);
      if(reached&&ticket===seekTicket&&player.canResume())guardedPlay();
    });
    $('.speed-button',frame).addEventListener('click',e=>{speed=speed===1?2:speed===2?.5:1;video.playbackRate=speed;e.currentTarget.textContent=`${speed}×`;e.currentTarget.setAttribute('aria-label',`Playback speed ${speed} times`);});
    $('.fullscreen-button',frame).addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else if(frame.requestFullscreen)await frame.requestFullscreen();else video.webkitEnterFullscreen?.();}catch{}});
    const full=$('.fullscreen-button',frame);if(!frame.requestFullscreen&&!video.webkitEnterFullscreen)full.hidden=true;
    frame.addEventListener('fullscreenchange',()=>{full.setAttribute('aria-label',document.fullscreenElement===frame?'Exit fullscreen':'Enter fullscreen');});
    players.push(player);playerCache.set(item.id,player);return frame;
  }
  function onActive(index,{item,card}) {
    players.forEach(p=>{if(p.item.id!==item.id&&!transitioning.has(p))p.pause();});stageController?.destroy();stageController=null;
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
    if(long&&chapters.clips[item.id]){
      // Chapter controls can mount with posters; playback gets bandwidth once visible.
      if(visible)activePlayer.load();
      const stagePlayer=activePlayer;
      stageController=createStagePlayer(stageRoot,chapters.clips[item.id],stagePlayer.video,{requestPlay:()=>{stagePlayer.resetUserPause();stagePlayer.play();},canPlay:()=>stagePlayer.canResume()});
    }else if(stages&&chapters.clips[item.id]){stageController=createSkillMix(stageRoot,chapters.clips[item.id],skillMedia);}
    else stageRoot.replaceChildren();
    if(visible)activePlayer.play();
    if(visible)warmNeighbors(index);
  }
  const deckHost=$('.deck-host',root);
  deckHost.classList.add('gallery-deck-stack');
  function motion(moving,{index}={}) {
    inMotion=moving;
    if(moving&&visible){
      if(activePlayer)transitioning.add(activePlayer);
      const item=currentGroup?.items[index],target=item&&playerCache.get(item.id);
      if(target){transitioning.add(target);target.play();}
    }
    if(!moving){
      transitioning.clear();
      players.forEach(p=>{if(p!==activePlayer){p.pause();if(!warmer.isPreparing(p))p.suspend();}});
      if(visible)activePlayer?.play();
    }
  }
  function navigationIntent(index,{item,reason}) {
    const target=playerCache.get(item.id);
    if(!target)return;
    const ready=prioritizePlayer(target,{navigation:true});
    if(visible&&inMotion){
      transitioning.clear();players.forEach(p=>{if(p!==activePlayer&&p!==target)p.pause();});
      if(activePlayer)transitioning.add(activePlayer);
      transitioning.add(target);
      target.play();
    }
    return ready;
  }
  function warmNeighbors(index,{force=false,neighbors=true}={}) {
    if((!visible&&!force)||!currentGroup||document.hidden)return Promise.resolve();
    // A section approaching the viewport must not borrow bandwidth from an
    // already visible demo elsewhere. Explicit navigation uses prioritize().
    if(!visible&&!canWarmNearGallery())return Promise.resolve();
    const record=currentGroup,clips=record.items,primary=playerCache.get(clips[index]?.id);
    if(!primary)return Promise.resolve();
    if(visible)for(const i of [index-1,index,index+1])playerCache.get(clips[i]?.id)?.showPoster();
    // A recent explicit hover/click outranks incidental observer/resize work.
    if(warmer.priorityPlayer&&warmer.priorityPlayer!==primary)return warmer.pending;
    const adjacent=constrained||!neighbors?[]:[previewPlayer,...[index+1,index-1].map(i=>playerCache.get(clips[i]?.id))].filter(player=>player&&player!==primary);
    return warmer.sequence(primary,adjacent,{isCurrent:()=>currentGroup===record&&activePlayer===primary&&(visible||force)&&(visible||canWarmNearGallery())&&!document.hidden});
  }
  function previewPlayerIntent(player){
    if(!player||player===activePlayer||!visible||constrained||inMotion||document.hidden||warmer.priorityPlayer)return;
    // A hovered task can belong to another cached group. Keep it as the one
    // speculative target instead of cancelling its first frame on completion.
    previewPlayer=player;
    warmNeighbors(Math.max(0,deck.getActiveIndex()));
  }
  function previewNavigation(index,{item}){
    previewPlayerIntent(playerCache.get(item.id));
  }
  function prioritizePlayer(player,{navigation=false}={}){
    if(!player||document.hidden)return;
    player.showPoster();
    if(navigation)previewPlayer=null;
    const preparing=warmer.prioritize(player,{isCurrent:()=>!document.hidden});
    const generation=warmer.generation;
    const resumeNeighbors=()=>{
      // Completed explicit preparation returns its budget to the visible deck.
      // A stale completion cannot replace newer hover or observer work, and a
      // navigation still entering another card must retain its own transition.
      if(generation!==warmer.generation||warmer.pending||!visible||document.hidden)return;
      if(navigation&&player!==activePlayer)return;
      warmNeighbors(Math.max(0,deck.getActiveIndex()));
    };
    Promise.resolve(preparing).then(resumeNeighbors,resumeNeighbors);
    // Give the clicked player its own wait so unrelated prefetch cancellation
    // cannot abort that preparation. Deck motion runs independently of it.
    return navigation?player.warm():preparing;
  }
  function getGroup(index) {
    if(groupDecks.has(index))return groupDecks.get(index);
    const host=document.createElement('div');host.className='gallery-group-deck';
    host.hidden=true;host.inert=true;host.setAttribute('aria-hidden','true');deckHost.append(host);
    const record={host,items:single?groups.flatMap(g=>g.clips):groups[index].clips,deck:null};
    groupDecks.set(index,record);
    record.deck=createDemoDeck(host,{items:record.items,renderCard,label,
      onActiveChange:(i,detail)=>{if(currentGroup===record)onActive(i,detail);},
      onNavigationIntent:(i,detail)=>currentGroup===record?navigationIntent(i,detail):undefined,
      onNavigationPreview:(i,detail)=>currentGroup===record?previewNavigation(i,detail):undefined,
      onMotionChange:(moving,detail)=>{if(currentGroup===record)motion(moving,detail);}
    });
    return record;
  }
  function activateGroup(record){
    if(currentGroup!==record)inMotion=false;
    currentGroup=record;deck=record.deck;
    record.host.hidden=false;record.host.inert=false;record.host.setAttribute('aria-hidden','false');
    deck.refresh();
    const index=Math.max(0,deck.getActiveIndex());
    onActive(index,{item:record.items[index],card:deck.getActiveCard()});
  }
  activateGroup(getGroup(0));
  function finishGroups(){
    groupAnimations.forEach(animation=>animation.cancel());groupAnimations=[];
    for(const record of groupDecks.values())if(record!==currentGroup){record.host.hidden=true;record.host.inert=true;record.host.setAttribute('aria-hidden','true');}
    if(currentGroup){currentGroup.host.inert=false;currentGroup.host.setAttribute('aria-hidden','false');}
    if(!inMotion)motion(false);
  }
  function selectGroup(index,{initialIndex}={}){
    if(single){deck.goTo(index);return Promise.resolve();}
    if(index===groupIndex&&(initialIndex===undefined||currentGroup===groupDecks.get(index)))return groupSelection;
    groupSelection=changeGroup(index,{initialIndex});return groupSelection;
  }
  async function changeGroup(index,{initialIndex}={}){
    const ticket=++groupRevision,previousIndex=groupIndex;
    finishGroups();
    const previous=currentGroup,target=getGroup(index);
    syncTabs(index);syncL1Tasks(0);deckHost.setAttribute('aria-busy','true');
    const nextIndex=initialIndex??Math.max(0,target.deck.getActiveIndex());
    // Card motion responds immediately; the bounded stream prepares alongside it.
    prioritizePlayer(playerCache.get(target.items[nextIndex].id),{navigation:true});
    if(ticket!==groupRevision)return;
    if(initialIndex!==undefined&&target!==currentGroup)target.deck.goTo(initialIndex,{behavior:'instant',reason:'task-group-prepare'});
    deckHost.removeAttribute('aria-busy');
    transitioning.clear();
    if(activePlayer)transitioning.add(activePlayer);
    activateGroup(target);
    if(previous===target){finishGroups();return;}
    previous.host.inert=true;previous.host.setAttribute('aria-hidden','true');
    if(!reduced.matches){
      const direction=index>previousIndex?1:-1;
      const timing={duration:480,easing:'cubic-bezier(.22,.68,.18,1)',fill:'both'};
      groupAnimations=[
        previous.host.animate([{transform:'translate3d(0,0,0)',opacity:1},{transform:`translate3d(${-direction*100}%,0,0)`,opacity:.65}],timing),
        target.host.animate([{transform:`translate3d(${direction*100}%,0,0)`,opacity:.65},{transform:'translate3d(0,0,0)',opacity:1}],timing)
      ];
      await Promise.allSettled(groupAnimations.map(animation=>animation.finished));
    }
    if(ticket===groupRevision)finishGroups();
  }
  tabs.forEach((t,i)=>{
    t.addEventListener('click',()=>selectGroup(i));
    const prime=()=>{if(!visible||constrained||inMotion)return;const record=getGroup(single?0:i),clip=record.items[single?i:Math.max(0,record.deck.getActiveIndex())];previewPlayerIntent(playerCache.get(clip.id));};
    t.addEventListener('pointerenter',prime);t.addEventListener('focus',prime);
  });
  l1Rows.forEach(row=>{
    const prime=()=>{if(!visible||constrained||inMotion)return;const condition=Number(row.dataset.l1Condition),task=l1Tasks[condition][Number(row.dataset.l1Task)],record=getGroup(condition);previewPlayerIntent(playerCache.get(record.items[task.indices[0]].id));};
    row.addEventListener('pointerenter',prime);row.addEventListener('focus',prime);
  });
  l1Rows.forEach(row=>row.addEventListener('click',async()=>{
    const condition=Number(row.dataset.l1Condition),task=l1Tasks[condition][Number(row.dataset.l1Task)];
    const selection=selectGroup(condition,{initialIndex:task.indices[0]}),ticket=groupRevision;
    await selection;
    if(ticket!==groupRevision||condition!==groupIndex||currentGroup!==groupDecks.get(condition))return;
    if(deck.getActiveIndex()!==task.indices[0])deck.goTo(task.indices[0],{reason:'task-group'});
  }));
  $('.task-rail',root).addEventListener('keydown',e=>{
    if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(e.key))return;
    const current=tabs.indexOf(document.activeElement);if(current<0)return;e.preventDefault();
    const index=e.key==='Home'?0:e.key==='End'?tabs.length-1:(current+(['ArrowRight','ArrowDown'].includes(e.key)?1:-1)+tabs.length)%tabs.length;
    selectGroup(index);tabs[index].focus({preventScroll:true});
  });
  new IntersectionObserver(([entry])=>{const wasNear=near;near=entry.isIntersecting;if(near&&!visible){warmNeighbors(Math.max(0,deck.getActiveIndex()),{force:true,neighbors:false});}else if(!near&&wasNear&&!visible){warmer.cancel();players.forEach(p=>p.suspend());}},{rootMargin:'450px 0px',threshold:0}).observe(deckHost);
  new IntersectionObserver(([entry])=>{const wasVisible=visible;visible=entry.isIntersecting;if(wasVisible!==visible)syncGalleryWarmPriority();if(visible){warmNeighbors(Math.max(0,deck.getActiveIndex()));activePlayer?.play();}else{players.forEach(p=>p.pause());if(wasVisible){if(near)warmNeighbors(Math.max(0,deck.getActiveIndex()),{force:true,neighbors:false});else{warmer.cancel();players.forEach(p=>p.suspend());}}}},{threshold:.15}).observe(deckHost);
  document.addEventListener('visibilitychange',()=>{if(document.hidden){warmer.cancel();players.forEach(p=>{p.pause();p.suspend();});}else{syncGalleryWarmPriority();if(visible)warmNeighbors(Math.max(0,deck.getActiveIndex()));if(visible)activePlayer?.play();}});
  const gallery={
    refresh(){if(visible)activePlayer?.play();},
    prepare(){if(!root.dataset.prepareAt)root.dataset.prepareAt=performance.now().toFixed(1);return prioritizePlayer(activePlayer);},
    stopNearWarm(){
      if(visible||warmer.priorityPlayer)return;
      warmer.cancel();players.forEach(player=>{player.pause();player.suspend();});
    },
    resumeNearWarm(){if(near&&!visible&&!document.hidden)warmNeighbors(Math.max(0,deck.getActiveIndex()),{force:true,neighbors:false});},
    get visible(){return visible&&!document.hidden;},
    get deck(){return deck;}
  };galleries.push(gallery);return gallery;
}

// Hold only explicit anchor navigation while lazy content above it settles.
// Ordinary scroll and carousel gestures never create a navigation hold.
function createAnchorStabilizer(){
  const mounting=new Set();
  let pending=null,timer=null,lastScrollAt=-Infinity;
  const now=()=>performance.now();
  const cancel=()=>{pending=null;clearTimeout(timer);timer=null;};
  const affectsTarget=host=>pending&&(pending.target.contains(host)||host.getBoundingClientRect().top<=pending.target.getBoundingClientRect().top);
  function check(){
    timer=null;
    if(!pending)return;
    const time=now(),state=pending,target=state.target;
    if(!target.isConnected||time-state.started>=5000){cancel();return;}
    const absolute=target.getBoundingClientRect().top+window.scrollY;
    if(Math.abs(absolute-state.position)>1){state.position=absolute;state.changed=time;}
    // Leave the browser's original smooth anchor transition intact. Once it
    // settles, follow only layout movement using non-animated corrections.
    const settled=time-lastScrollAt>=120&&time-state.started>=120;
    if(settled){
      const max=Math.max(0,document.documentElement.scrollHeight-window.innerHeight);
      const desired=Math.min(max,Math.max(0,absolute-state.offset));
      if(Math.abs(window.scrollY-desired)>1){window.scrollTo({top:desired,behavior:'instant'});state.changed=time;}
      const host=target.querySelector('.gallery-root,[id$="-root"]');
      const ready=!host||host.classList.contains('is-mounted');
      if(ready&&![...mounting].some(affectsTarget)&&time-state.changed>=350){cancel();return;}
    }
    timer=setTimeout(check,80);
  }
  function begin(hash){
    cancel();
    let id;try{id=decodeURIComponent(hash.slice(1));}catch{return;}
    const target=document.getElementById(id);if(!target)return;
    const offset=(parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop)||0)+(parseFloat(getComputedStyle(target).scrollMarginTop)||0);
    pending={target,started:now(),changed:now(),position:target.getBoundingClientRect().top+window.scrollY,offset};
    timer=setTimeout(check,80);
  }
  window.addEventListener('scroll',()=>{if(pending)lastScrollAt=now();},{passive:true});
  for(const event of ['wheel','touchstart','pointerdown'])document.addEventListener(event,cancel,{passive:true,capture:true});
  document.addEventListener('keydown',event=>{if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','PageUp','PageDown','Home','End',' ','Escape'].includes(event.key))cancel();},{capture:true});
  document.addEventListener('click',event=>{
    const link=event.target.closest?.('a[href^="#"]');
    if(!link||event.defaultPrevented||event.button>0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
    begin(link.getAttribute('href'));
  });
  return {begin,cancel,
    mounting(host){mounting.add(host);if(affectsTarget(host))pending.changed=now();},
    mounted(host){mounting.delete(host);if(affectsTarget(host))pending.changed=now();}
  };
}
const anchorNavigation=createAnchorStabilizer();
if(location.hash)anchorNavigation.begin(location.hash);

function mountNear(host,mount,{margin=650}={}){
  let runPromise=null,observer;
  const run=()=>{if(!runPromise){observer?.disconnect();host.dataset.mountRequestedAt=performance.now().toFixed(1);anchorNavigation.mounting(host);runPromise=Promise.resolve().then(mount).then(value=>{host.classList.add('is-mounted');scrollReveal.refresh();return value;}).catch(error=>console.error('Section failed to load',host.id,error)).finally(()=>anchorNavigation.mounted(host));}return runPromise;};
  if(!('IntersectionObserver' in window)){run();return run;}
  observer=new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting))run();},{rootMargin:`${margin}px 0px`,threshold:0});
  observer.observe(host);
  // Direct section links must not depend on the previous sections being mounted.
  const target=location.hash?document.getElementById(location.hash.slice(1)):null;
  if(target?.contains(host))run();
  return run;
}
async function boot(){
  // Start the wall before the lower-page data and gallery DOM work.
  const hero=mountHeroWall($('.hero')).catch(error=>console.error('hero',error));
  // Independent sections must not wait for the unrelated evaluation manifests.
  mountNear($('#method-root'),()=>mountMethodFigure($('#method-root')));
  const datasetMount=mountNear($('#dataset-root'),()=>mountDatasetFilms($('#dataset-root')),{margin:1200});
  document.querySelectorAll('a[href="#dataset"]').forEach(link=>{
    for(const event of ['pointerenter','focus','click'])link.addEventListener(event,()=>datasetMount().then(dataset=>dataset?.prepare?.({intent:event==='click'})));
  });
  mountNear($('#results-root'),()=>mountResultsExplorer($('#results-root')));
  const chapterData=getJSON('data/chapters.json?v=v38').then(data=>{chapters=data;});
  const skillData=getJSON('data/skill-media.json?preview=v54&v=v38').then(data=>{skillMedia=data;});
  const [content,media]=await Promise.all([getJSON('data/content.json?v=v38'),getJSON('assets/media/manifest.json?v=v38')]);
  manifest=media;
  const galleryMounts=new Map([
    ['#in-domain',mountNear($('#id-gallery'),()=>mountGallery($('#id-gallery'),content.groups.id,{label:'In-distribution tasks',badge:'In-distribution',level:'id'}))],
    ['#level-one',mountNear($('#l1-gallery'),()=>mountGallery($('#l1-gallery'),content.groups.l1,{label:'L1 seen-task generalization',badge:'L1 Generalization',level:'l1'}))],
    ['#level-two',mountNear($('#l2-gallery'),()=>Promise.all([chapterData,skillData]).then(()=>mountGallery($('#l2-gallery'),content.groups.l2,{label:'L2 compositional generalization',badge:'L2 Generalization',level:'l2',single:true,stages:true})))],
    ['#long-horizon',mountNear($('#long-gallery'),()=>chapterData.then(()=>mountGallery($('#long-gallery'),content.longHorizon.map(c=>({label:c.title,clips:[c]})),{label:'Long-horizon routines',badge:'LONG HORIZON',single:true,long:true,stages:true})))]
  ]);
  for(const [hash,run] of galleryMounts){
    document.querySelectorAll(`a[href="${hash}"]`).forEach(link=>{
      const prepare=()=>{run().then(gallery=>gallery?.prepare());};
      for(const event of ['pointerenter','focus','click'])link.addEventListener(event,prepare);
    });
  }
  scrollReveal.refresh();
  if(content.project.authors.length){const a=$('#authors');a.textContent=content.project.authors.join(' · ');a.hidden=false;a.parentElement.hidden=false;}
  await hero;
}
const menu=$('.menu-toggle'),mobile=$('#mobile-nav');
menu.addEventListener('click',()=>{const opened=menu.getAttribute('aria-expanded')==='true';menu.setAttribute('aria-expanded',String(!opened));menu.setAttribute('aria-label',opened?'Open navigation':'Close navigation');mobile.hidden=opened;});
mobile.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>{mobile.hidden=true;menu.setAttribute('aria-expanded','false');menu.setAttribute('aria-label','Open navigation');}));
boot().catch(error=>{console.error(error);$('#load-error').hidden=false;});
