/* Daily choices persist per learner; observing models never grants extra points. */
window.FufuDailyPlan = (() => {
  const modes = ['story','quiz','explore'];
  const modelPages = ['solar','globe','moon','lunar','engineering','transport','jurassic'];
  const labels = {
    story:{title:'读个故事，发现新世界',unit:'篇',goal:1,button:'翻开今日故事 →'},
    quiz:{title:'做几道题，学会小本领',unit:'题',goal:3,button:'开始今日练习 →'},
    explore:{title:'转转模型，发现新本领',unit:'个',goal:2,button:'去探索模型 →'}
  };
  let profile=null,available=0,busy=false,timer=null,visit=null,version=0;
  function render(next, count=available) {
    profile=next;available=count;
    const plan=profile?.daily_plan;
    if(!plan)return;
    const kind=plan.kind, info=labels[kind];
    if(!info)return;
    const goal=kind==='quiz'?Math.min(info.goal,available):info.goal;
    const done=Math.min(goal,Number(plan.progress[kind]||0));
    const title=document.querySelector('#dailyPlanTitle'),message=document.querySelector('#dailyPlanMessage');
    title.textContent=info.title;
    document.querySelector('#dailyProgressLabel').textContent=`${done} / ${goal} ${info.unit}`;
    document.querySelector('#dailyProgressBar').style.width=goal?`${Math.round(done/goal*100)}%`:'0%';
    message.textContent=goal && done>=goal?'今天的小目标完成啦！也可以换一种方式，继续发现。':
      kind==='story'?(plan.story?`一起读《${plan.story.title}》，读完可以领取阅读积分。`:'故事都读过啦，可以去图书馆重温，或换一个小目标。'):
      kind==='explore'?'选两个不同的模型，转一转或试试动作；每个认真观察一会儿。':
      goal?`完成 ${goal} 道适合你的练习，答错也可以听提示再试。`:'这个年级的练习正在准备中，可以换成读故事或看模型。';
    const button=document.querySelector('#startDailyTask');
    button.textContent=done>=goal && goal?'再去看看 →':info.button;
    button.disabled=busy || (kind==='quiz'&&!goal);
    document.querySelectorAll('[data-daily-kind]').forEach(b=>{
      b.setAttribute('aria-pressed',String(b.dataset.dailyKind===kind));b.disabled=busy;
    });
  }
  async function change(kind) {
    if(busy||!profile||!modes.includes(kind))return;
    busy=true;render(profile);
    const token=version, learner=profile.id;
    try {
      const plan=await api('/daily-plan',{method:'POST',body:JSON.stringify({kind})});
      if(token===version && profile?.id===learner){profile.daily_plan=plan;render(profile);}
    } catch(error){if(token===version)toast(error.message);}
    finally{if(token===version){busy=false;if(profile)render(profile);}}
  }
  async function start() {
    if(busy||!profile)return;
    const kind=profile.daily_plan?.kind;
    if(kind==='quiz')return beginDailyQuest();
    if(kind==='explore'){navigate('explore');toast('选两个模型，转一转或试试动作，观察进度会自动记录。');return;}
    if(kind==='story'){
      if(profile.daily_plan.story)return openStory(profile.daily_plan.story.id);
      navigate('library');
    }
  }
  function stopVisit(){clearInterval(timer);timer=null;visit=null;}
  async function onNavigate(page) {
    stopVisit();
    if(page==='home'){refreshProfile().catch(()=>{});return;}
    if(!profile||!modelPages.includes(page))return;
    if(profile.daily_plan?.models.includes(page))return;
    const current={page,learner:profile.id,token:version,elapsed:0,touched:false};visit=current;
    try {
      await api('/daily-plan/model',{method:'POST',body:JSON.stringify({model:page,action:'begin'})});
      if(visit!==current)return;
      timer=setInterval(async()=>{
        if(visit!==current || current.token!==version || profile?.id!==current.learner){stopVisit();return;}
        const active=document.querySelector(`#page-${page}.active`);
        const canvas=active?.querySelector('canvas:not([aria-hidden="true"])');
        if(document.hidden || !canvas)return;
        const box=canvas.getBoundingClientRect();
        if(!box.width || !box.height || box.bottom<=0 || box.top>=innerHeight)return;
        current.elapsed++;
        if(current.elapsed<12 || !current.touched)return;
        clearInterval(timer);timer=null;
        try{
          const plan=await api('/daily-plan/model',{method:'POST',body:JSON.stringify({model:page,action:'complete'})});
          if(current.token!==version || profile?.id!==current.learner)return;
          const was=profile.daily_plan?.models.includes(page);
          profile.daily_plan=plan;render(profile);
          if(!was && plan.kind==='explore')toast(`已观察 ${Math.min(2,plan.progress.explore)} / 2 个模型，回首页可以查看。`);
        }catch(error){if(visit===current){stopVisit();toast(error.message+'，重新进入模型后可以再试。');}}
      },1000);
    }catch(_){if(visit===current)stopVisit();}
  }
  function touch(event){
    if(!visit)return;
    const active=event.target?.closest?.(`#page-${visit.page}.active`);
    if(active && !event.target.closest('.lab-back,[data-page="home"]'))visit.touched=true;
  }
  document.addEventListener('pointerdown',touch,{passive:true});
  document.addEventListener('keydown',touch);
  window.addEventListener('fufu-auth-changed',()=>{version++;stopVisit();profile=null;busy=false;});
  document.querySelectorAll('[data-daily-kind]').forEach(button=>button.addEventListener('click',()=>change(button.dataset.dailyKind)));
  return {render,start,onNavigate};
})();
