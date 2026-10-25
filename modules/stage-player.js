import { seekVideo } from './video-seek.js?v=v24';
const clock = t => `${Math.floor(t/60)}:${String(Math.floor(t%60)).padStart(2,'0')}`;
// Long-horizon navigation only. Skill composition has its own visual explorer.
export function createStagePlayer(root, chapter, video, {requestPlay=()=>{},canPlay=()=>!document.hidden}={}) {
  const abort=new AbortController(),{signal}=abort;
  let current=-1,pending=0;
  root.classList.add('stage-explorer');
  const heading=document.createElement('div');heading.className='stage-heading';heading.innerHTML='<span>FOLLOW THE ROUTINE</span><span>Jump to a moment ↗</span>';
  const strip=document.createElement('div');strip.className='stage-strip';strip.setAttribute('aria-label',`${chapter.title} stages`);
  root.replaceChildren(heading,strip);
  const buttons=chapter.stages.map((stage,index)=>{
    const button=document.createElement('button');button.type='button';button.className='stage-step';
    button.setAttribute('aria-label',`Jump to ${stage.label} at ${clock(stage.start)}`);
    const number=document.createElement('span');number.className='stage-number';number.textContent=String(index+1).padStart(2,'0');
    const label=document.createElement('span');label.className='stage-step-label';label.textContent=stage.label;
    const time=document.createElement('span');time.className='stage-marker';time.textContent=clock(stage.start);
    button.append(number,label,time);strip.append(button);
    button.addEventListener('click',async()=>{
      requestPlay();const ticket=++pending;select(index);strip.setAttribute('aria-busy','true');
      const reached=await seekVideo(video,stage.start,{signal});
      if(signal.aborted||ticket!==pending)return;
      pending=0;strip.removeAttribute('aria-busy');
      if(reached){if(canPlay())video.play().catch(()=>{});select(index);}else update();
    },{signal});return button;
  });
  function select(index){current=index;buttons.forEach((b,i)=>{b.setAttribute('aria-current',String(i===index));b.style.setProperty('--stage-progress',i<index?'100%':'0%');});}
  function update(){if(pending)return;const time=video.currentTime,index=Math.max(0,chapter.stages.findLastIndex(s=>time>=s.start));if(index!==current)select(index);const stage=chapter.stages[index];buttons[index].style.setProperty('--stage-progress',`${Math.min(100,Math.max(0,(time-stage.start)/(stage.end-stage.start)*100))}%`);}
  video.addEventListener('timeupdate',update,{signal});video.addEventListener('seeked',update,{signal});update();
  return{destroy(){abort.abort();root.replaceChildren();}};
}
