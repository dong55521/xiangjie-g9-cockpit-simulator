import { CabinScene } from './scene.js';
import { createInitialState, executeCommand, performAction, performActions, TEST_SCENARIOS } from './engine.js';
import { CAPABILITIES, CATEGORIES, VEHICLE_PROFILE } from './catalog.js';
import { VoiceIO } from './speech.js';
import { paintVehicleScreen, SCREEN_PAGES, SCREEN_PAGE_LABELS } from './screen-ui.js';
import { ScreenSession } from './screen-session.js';
import { LatestRequest, createLiveMap, validRoute } from './services.js';

const $=s=>document.querySelector(s), esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const names={driver:'主驾',passenger:'副驾',rearLeft:'二排左侧',rearRight:'二排右侧',thirdLeft:'三排左侧',thirdRight:'三排右侧'};
const domainLabels={window:'车窗',door:'车门',seat:'座椅',temperature:'温度',fan:'风量',climate:'空调',reading:'阅读灯',ambient:'氛围灯',rearScreen:'后排屏',shade:'遮阳帘',fragrance:'香氛',oxygen:'制氧机',media:'媒体',scene:'情景模式',childLock:'儿童锁',chargePort:'充电口盖'};
const statusLabels={reply:'助手回复',info:'理解完成',loading:'正在理解',success:'执行成功',clarify:'需要确认',blocked:'条件不满足',unsupported:'暂不支持',error:'执行失败',cancelled:'已取消'};
const evidenceLabels={official:'G9 公开功能',adapted:'功能改编演示',design:'原型设计'};
const categoryForDomain={window:'window',door:'window',shade:'window',seat:'seat',temperature:'climate',fan:'climate',climate:'climate',reading:'lighting',ambient:'lighting',rearScreen:'display',media:'display',scene:'scene',fragrance:'other',oxygen:'other',childLock:'other',chargePort:'other'};
const paths={cube:'M12 2 3 7v10l9 5 9-5V7zM3 7l9 5 9-5M12 12v10',mic:'M9 5a3 3 0 0 1 6 0v7a3 3 0 0 1-6 0zM6 10v2a6 6 0 0 0 12 0v-2M12 18v4m-4 0h8',arrow:'M4 12h16m-6-6 6 6-6 6',play:'m9 5 11 7-11 7z',book:'M3 4h6l3 3 3-3h6v15h-6l-3 2-3-2H3zM12 7v14',test:'M8 2h8M9 2v7L3 19a2 2 0 0 0 2 3h14a2 2 0 0 0 2-3L15 9V2M7 15h10',reset:'M3 11a9 9 0 1 1 2 7M3 4v7h7',speaker:'M3 9h4l5-4v14l-5-4H3zM16 8c3 3 3 5 0 8m3-11c5 5 5 9 0 14',mute:'M3 9h4l5-4v14l-5-4H3zM16 9l5 6m0-6-5 6',chevron:'m9 5 7 7-7 7',expand:'M3 9V3h6m6 0h6v6M3 15v6h6m6 0h6v-6',eye:'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0',download:'M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4',close:'m5 5 14 14M5 19 19 5',check:'m4 12 5 5L20 6',window:'M4 4h16v16H4zM4 13h16',seat:'M8 3v9c0 3 2 5 5 5h6M5 14v7h14M7 4 5 12',climate:'M12 2v20M3.3 7l17.4 10M3.3 17 20.7 7M9 4l3 3 3-3M9 20l3-3 3 3',lighting:'M8 16h8M9 20h6M8 16c0-3-3-3-3-7a7 7 0 0 1 14 0c0 4-3 4-3 7',display:'M3 4h18v13H3zM8 21h8m-4-4v4',scene:'m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5z',other:'M4 5h16M4 12h16M4 19h16M8 2v6m8 1v6M8 16v6',info:'M12 11v6m0-11v1M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',clock:'M12 6v6l4 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',location:'M12 22s8-8 8-14a8 8 0 0 0-16 0c0 6 8 14 8 14M15 8a3 3 0 1 1-6 0 3 3 0 0 1 6 0'};
const icon=(name,size=20)=>`<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name]||paths.cube}"/></svg>`;
let state=createInitialState(),context={},mode='explore',category='climate',selection={target:'driver',domain:'temperature'},panel='controls',view='showcase',xray=false,trim='olive',mood='day',screenPage='home',history=[],lastReceipt=null,lessonIndex=0,lessonSuccess=new Set(),testResults=[],suiteRunning=false;
let cabin=null,voice=null,toastTimer=null,exportURL=null;
const screenSession=new ScreenSession(SCREEN_PAGES);
let screenFeedbackTimer=null,screenRegions=[];
const assistantRequest=new LatestRequest(),mapRequest=new LatestRequest();
let serviceStatus={deepseek:{configured:false},amap:{configured:false}},assistantMode='local',aiVerified=false,mapVerified=false,mapServiceError=false;
screenSession.ui.liveMap=createLiveMap();
const lessonDefs=[{title:'让后排屏幕展开',text:'先体验一个清晰可见的动作。说出指令后，观察顶棚的娱乐屏。',query:'打开后排娱乐屏',domain:'rearScreen',target:'rearLeft'}, {title:'找到你的温度',text:'指定座位，观察空调面板数值与座舱气流。数值范围是本原型的演示配置。',query:'副驾空调调到22度',domain:'temperature',target:'passenger'}, {title:'让自然光进来',text:'说出目标车窗，观察玻璃升降。语音和手动控制共用同一个状态。',query:'打开左后车窗',domain:'window',target:'rearLeft'}, {title:'听懂“再低一点”',text:'先执行“副驾空调调到22度”，再说“再低一点”，检验上下文有没有保留。',query:'再低一点',setupQuery:'副驾空调调到22度',domain:'temperature',target:'passenger'}, {title:'进入小憩时光',text:'在驻车状态进入小憩，观察座椅与遮阳联动。具体联动参数属于原型设计。',query:'开启小憩模式',domain:'scene',target:'driver'}];

$('#app').innerHTML=`
<header class="topbar"><a class="brand" href="#" aria-label="G9座舱实验室首页"><span class="brand-symbol">${icon('cube',25)}</span><span>G9 <b>座舱实验室</b><small>小艺功能探索 · 三维交互仿真</small></span></a>
<nav class="mode-switch" aria-label="体验模式"><button class="active" data-mode="explore">${icon('cube',16)}自由探索</button><button data-action="screen-focus">${icon('display',16)}车机交互</button><button data-mode="learn">${icon('book',16)}跟随学习</button><button data-mode="test">${icon('test',16)}模拟测试</button></nav>
<div class="header-actions"><span class="sim-badge"><i></i>车辆仿真</span><button class="icon-button" data-action="about" aria-label="项目说明">${icon('info')}</button><button class="icon-button" data-action="reset" aria-label="重置座舱">${icon('reset')}</button></div></header>
<main class="workspace">
<section class="experience">
<div class="experience-heading"><div><span class="eyebrow">享界 G9 · 座舱沉浸体验</span><h1>走进座舱，<span>看见细节。</span></h1></div><div class="profile"><span>享界 G9 · 六座纯电高配参考</span><small>原创示意模型 · 公开功能参考</small></div></div>
<div class="stage-shell">
  <div id="scene" role="img" aria-label="可旋转的六座三维座舱，拖动旋转、滚轮缩放、点击部件查看控制"><div class="loading"><div class="loading-orbit"></div>正在构建你的座舱</div></div>
  <div class="stage-top"><div id="state-chips" class="state-chips"></div><div class="stage-utilities"><button data-action="mood" class="stage-icon mood-button" aria-label="切换夜间氛围" title="切换日间/夜间氛围">◐</button><button data-action="fullscreen" class="stage-icon" aria-label="全屏座舱">${icon('expand',17)}</button></div></div>
  <div id="part-label" class="part-label"></div><div class="exterior-angles" hidden aria-label="外观角度"><button data-exterior-angle="front" class="active">车头</button><button data-exterior-angle="side">侧面</button><button data-exterior-angle="rear">车尾</button></div>
  <div class="screen-pages" hidden aria-label="大屏页面">${[['home','桌面'],['map','导航'],['vehicle','车辆'],['climate','空调']].map(([id,label])=>`<button data-screen-page="${id}" aria-label="大屏${label}" class="${id==='home'?'active':''}">${label}</button>`).join('')}<button data-action="screen-focus" class="screen-enlarge">放大操作 ${icon('expand',12)}</button></div>
  <div class="stage-bottom"><div class="view-switch" aria-label="座舱视角">${[['exterior','外观'],['showcase','前舱'],['driver','主驾'],['passenger','副驾'],['display','大屏'],['rear','二排'],['seat','座椅'],['overview','全景']].map(([id,label])=>`<button data-view="${id}" class="${id==='showcase'?'active':''}">${label}</button>`).join('')}</div><button data-action="xray" class="xray" aria-pressed="false">${icon('eye',16)}剖视</button></div>
  <div class="finish-picker" aria-label="内饰配色"><span>内饰配色</span>${[['olive','橄榄灰','#bdb5a3'],['saddle','雅丹棕','#946442'],['blue','云沙蓝','#aebfc4']].map(([id,label,color])=>`<button data-trim="${id}" aria-label="${label}内饰" title="${label} · 近似配色" style="--finish:${color}" class="${id==='olive'?'active':''}"><i></i></button>`).join('')}</div><span class="scene-hint">拖动环视 · 滚轮调整视野 · 点选部件</span>
  <div id="lesson-overlay"></div>
</div>
<section class="voice-dock" aria-label="语音控制台"><div class="assistant-line"><div class="assistant-avatar"><span></span><span></span><span></span></div><div class="assistant-copy"><strong id="assistant-title">你好，欢迎来到座舱。</strong><p id="assistant-message">试试说“打开后排娱乐屏”，看它为你展开。</p></div><button class="icon-button" data-action="mute" aria-label="关闭语音播报" title="语音播报">${icon('speaker',18)}</button></div>
<form id="command-form" class="command-form"><button type="button" id="mic-button" class="mic-button" data-action="mic" aria-label="开始语音输入">${icon('mic',22)}<span id="mic-label">点击说话</span></button><input id="command-input" autocomplete="off" aria-label="输入车辆控制指令" placeholder="也可以输入指令，如：副驾空调调到22度"><button type="submit" class="send-button" aria-label="执行指令">${icon('arrow',21)}</button></form>
<div class="voice-footer"><div class="suggestions"><button data-query="打开后排娱乐屏">打开后排屏</button><button data-query="打开左后车窗">打开左后车窗</button><button data-query="开启小憩模式">开启小憩</button></div><div class="service-controls"><select id="assistant-mode" aria-label="指令理解方式"><option value="local">本地规则</option><option value="deepseek" disabled>DeepSeek（深度求索）</option></select><span id="voice-availability">正在检查服务配置</span></div></div><div id="confirmation"></div></section>
<div class="footnote"><span><i></i>车内外一体 · 语音与触控共享状态</span><button data-action="about">功能依据与仿真说明 ${icon('chevron',12)}</button></div>
</section>
<aside class="inspector"><div class="inspector-heading"><div><span class="eyebrow">座舱控制中心</span><h2 id="panel-title">探索小艺能力</h2></div><span class="count-pill" id="capability-count"></span></div>
<div class="panel-tabs" role="tablist"><button class="active" data-panel="controls">操作与学习</button><button data-panel="history">执行记录 <span id="history-count">0</span></button></div>
<div id="inspector-body"></div></aside>
</main>
<div id="toast" role="status"></div><dialog id="about-dialog"><button class="dialog-close icon-button" data-action="close-dialog" aria-label="关闭">${icon('close')}</button><div class="eyebrow">关于这个作品</div><h2>让语音功能，变得看得见。</h2><p>参考享界 G9 六座纯电高配座舱，探索小艺公开语音功能与可执行条件。三维模型为原创示意，不是原厂工程模型。</p><div class="about-grid"><div><b>真实输入</b><span>浏览器麦克风识别与语音合成；可用性取决于浏览器及权限。</span></div><div><b>指令理解</b><span id="about-services">本地规则可离线使用；配置服务端后，可调用 DeepSeek 理解和高德地点服务。未连接原生小艺。</span></div><div><b>模拟执行</b><span>车门、车窗、座椅等动作只作用于网页模型。</span></div><div><b>证据分层</b><span>公开功能、改编演示、原型设计分别标识，测试结果仅代表本模拟器。</span></div></div><p>选装制氧机默认关闭，可在模拟测试中启用；所有状态均可重置。</p><div class="source-links"><a href="https://pano.autohome.com.cn/car/ext/78660?_ahrotate=1" target="_blank" rel="noopener">汽车之家外观参考 ↗</a><a href="https://pano.autohome.com.cn/car/pano/78136?_ahrotate=1" target="_blank" rel="noopener">汽车之家内饰参考 ↗</a><a href="https://hima.auto/xiangjie/service/" target="_blank" rel="noopener">G9 官方使用说明书 ↗</a><a href="./docs/evidence.md" target="_blank" rel="noopener">项目证据与适用边界 ↗</a></div></dialog><dialog id="export-dialog"><button class="dialog-close icon-button" data-action="close-export" aria-label="关闭报告">${icon('close')}</button><div class="eyebrow">模拟验证报告</div><h2 id="export-title">导出报告</h2><p>只包含本次模拟指令、状态和结果。可以复制内容或下载保存。</p><textarea id="export-data" aria-label="报告内容" readonly spellcheck="false"></textarea><div class="report-actions"><button class="primary-button" data-action="copy-report">复制报告</button><a id="export-download" class="primary-button">下载文件</a></div></dialog>`;

document.body.insertAdjacentHTML('beforeend',`<dialog id="screen-dialog" aria-label="车机交互体验">
  <header class="screen-dialog-header"><div><span class="eyebrow">G9 · 车机交互</span><h2 id="screen-title">桌面</h2></div><nav aria-label="车机快速入口">${[['home','桌面'],['apps','应用'],['settings','设置'],['vehicle','车辆'],['climate','空调'],['map','导航']].map(([id,label])=>`<button data-screen-page="${id}" aria-label="进入${label}">${label}</button>`).join('')}</nav><button data-action="screen-close" class="screen-return">返回座舱 ${icon('close',16)}</button></header>
  <div class="screen-context"><span id="screen-breadcrumb">桌面</span><span>本地交互演示 · 与三维车辆同步</span></div>
  <form id="screen-search-form" class="screen-search-form" hidden><label for="screen-search" id="screen-search-label">搜索地点</label><input id="screen-city" maxlength="20" aria-label="搜索城市" value="杭州" placeholder="城市"><input id="screen-search" maxlength="64" placeholder="试试：公园、美术馆、营地" autocomplete="off"><button type="submit">搜索</button><span id="screen-map-source">虚构地点，未连接导航服务</span></form>
  <div class="screen-scroll"><div class="screen-surface"><canvas id="screen-canvas" width="1920" height="864" aria-label="车机当前页面"></canvas><div id="screen-hotspots" role="group" aria-label="车机屏幕控件"></div></div></div><p class="screen-pan-hint">← 左右滑动查看完整大屏 · 横屏操作更舒适 →</p>
  <footer class="screen-dialog-footer"><div class="screen-receipt" role="status"><i></i><span id="screen-feedback">选择卡片或应用，进入二级页面。</span></div><form id="screen-command-form"><button type="button" data-action="mic" aria-label="车机语音输入">${icon('mic',19)}</button><input id="screen-command-input" maxlength="200" placeholder="小艺，副驾空调调到22度" aria-label="车机语音文字指令" autocomplete="off"><button type="submit" aria-label="发送车机指令">${icon('arrow',19)}</button></form></footer>
</dialog>`);

function screenControlLabel(region){
  if(region.label)return region.label;
  if(region.page)return `打开${SCREEN_PAGE_LABELS[region.page]||region.page}`;
  if(region.command)return region.command==='确认'?'确认执行':region.command;
  if(region.ui?.type==='back')return '返回上一级';
  if(region.action){const a=region.action;return `${names[a.target]||'全车'}${domainLabels[a.domain]||'控制'} ${a.value??({open:'开启',close:'关闭',toggle:'切换',play:'播放',pause:'暂停'}[a.operation]||'调节')}`;}
  return '调整屏幕选项';
}
function renderScreenFocus(){
  if(!$('#screen-dialog').open)return;
  const canvas=$('#screen-canvas'), ui=screenSession.ui;
  const result=paintVehicleScreen(canvas,'navigation',state,{page:screenSession.page,time:'20:26',theme:'dark',ui});
  screenRegions=result.hitRegions||[];
  $('#screen-title').textContent=SCREEN_PAGE_LABELS[screenSession.page]||'车机';
  $('#screen-breadcrumb').textContent=screenSession.history.map(p=>SCREEN_PAGE_LABELS[p]||p).join(' / ');
  $('#screen-search-form').hidden=screenSession.page!=='map-search';
  if(document.activeElement!==$('#screen-search'))$('#screen-search').value=ui.navQuery||'';
  if(document.activeElement!==$('#screen-city'))$('#screen-city').value=ui.liveMap?.city||'杭州';
  $('#screen-city').hidden=!ui.liveMap?.enabled;
  $('#screen-search-label').textContent=ui.liveMap?.enabled?'搜索高德地点':'搜索演示地点';
  $('#screen-search').placeholder=ui.liveMap?.enabled?'试试：西湖、博物馆、充电站':'试试：公园、美术馆、营地';
  $('#screen-map-source').textContent=ui.liveMap?.enabled?'高德地点/路线 · 示意底图 · 杭州东站为演示起点，未定位':'虚构地点，未连接导航服务';
  const focusID=document.activeElement?.dataset?.screenHit;
  const actionable=screenRegions.filter(r=>r.page||r.action||r.command||r.ui||r.range);
  $('#screen-hotspots').innerHTML=screenRegions.filter(r=>actionable.includes(r)||r.blocking).map(r=>{
    if(r.blocking)return `<span class="screen-click-blocker" aria-hidden="true" style="left:${r.x/canvas.width*100}%;top:${r.y/canvas.height*100}%;width:${r.width/canvas.width*100}%;height:${r.height/canvas.height*100}%"></span>`;
    const common=`data-screen-hit="${esc(r.id)}" aria-label="${esc(screenControlLabel(r))}" title="${esc(screenControlLabel(r))}" style="left:${r.x/canvas.width*100}%;top:${r.y/canvas.height*100}%;width:${r.width/canvas.width*100}%;height:${r.height/canvas.height*100}%"`;
    return r.range?`<input type="range" ${common} min="${r.range.min}" max="${r.range.max}" step="${r.range.step??1}" value="${r.range.value}">`:`<button type="button" ${common}></button>`;
  }).join('');
  if(focusID)Array.from($('#screen-hotspots').children).find(n=>n.dataset.screenHit===focusID)?.focus({preventScroll:true});
  const mapFeedback=screenSession.page.startsWith('map')&&ui.liveMap?.enabled?ui.liveMap.message:'';
  const feedbackText=ui.feedback?.message||mapFeedback||'选择卡片或应用，进入二级页面。';
  $('#screen-feedback').textContent=feedbackText;
  $('.screen-receipt').dataset.status=ui.feedback?.status||(mapFeedback?ui.liveMap.status:'idle');
  $('#screen-canvas').style.filter=`brightness(${.45+(ui.brightness??80)/100*.69})`;
  $('#screen-canvas').setAttribute('aria-label',`${SCREEN_PAGE_LABELS[screenSession.page]||'车机'}，${feedbackText}`);
  document.querySelectorAll('[data-screen-page]').forEach(n=>{n.classList.toggle('active',n.dataset.screenPage===screenSession.page);n.disabled=ui.feedback?.status==='clarify';});
}
function syncScreen(){screenPage=screenSession.page;cabin?.setScreenUI(screenSession.ui);cabin?.setScreenPage(screenPage,false);renderScreenFocus();document.querySelectorAll('[data-screen-page]').forEach(n=>{n.classList.toggle('active',n.dataset.screenPage===screenPage);n.disabled=screenSession.ui.feedback?.status==='clarify';});}
function navigateScreen(page){cancelAssistantForChange();screenSession.navigate(page);syncScreen();}
function applyScreenUI(event){
  cancelAssistantForChange();
  if(screenSession.ui.feedback?.status==='clarify')return;
  if(event?.type==='search-map'){searchMap();return;}
  if(event?.type==='select-poi'){selectMapPOI(event.id);return;}
  if(event?.type==='select-route'){
    const map=screenSession.ui.liveMap;if(!map?.enabled||map.status!=='ready'||!validRoute(map.routes[event.index]))return;
    screenSession.ui={...screenSession.ui,routeActive:false,liveMap:{...map,routeIndex:event.index}};syncScreen();return;
  }
  if(event?.key==='routeActive'&&event.value&&screenSession.ui.liveMap?.enabled){const map=screenSession.ui.liveMap;if(map.status!=='ready'||!validRoute(map.routes[map.routeIndex]))return;}
  if(screenSession.dispatch(event))syncScreen();
  if(event?.type==='set'&&event.key==='navQuery'&&!$('#screen-dialog').open){navigateScreen('map-search');openScreenFocus();$('#screen-search').focus();}
}
function activateScreenRegion(region){
  if(!region)return;
  if(region.ui)applyScreenUI(region.ui);
  if(region.page)navigateScreen(region.page);
  if(region.action)runAction(region.action);
  if(region.command)runQuery(region.command,'touch');
  if(region.id==='search-input')$('#screen-search').focus();
}
function setScreenFeedback(receipt){
  clearTimeout(screenFeedbackTimer);screenSession.setFeedback({...receipt,title:statusLabels[receipt.status]||'处理结果'});
  if(receipt.status!=='clarify')screenFeedbackTimer=setTimeout(()=>{screenSession.setFeedback(null);syncScreen();},5200);
}
function openScreenFocus(){view='display';cabin?.setView(view);xray=false;refresh();if(!$('#screen-dialog').open)$('#screen-dialog').showModal();renderScreenFocus();}
$('#screen-command-form').addEventListener('submit',event=>{event.preventDefault();runQuery($('#screen-command-input').value);});
$('#screen-search-form').addEventListener('submit',event=>{event.preventDefault();const query=$('#screen-search').value.trim(),city=$('#screen-city').value.trim();applyScreenUI({type:'set',key:'navQuery',value:query});if(screenSession.ui.liveMap?.enabled)searchMap(query,city);});
$('#screen-hotspots').addEventListener('change',event=>{
  const r=screenRegions.find(r=>r.id===event.target.dataset.screenHit);if(!r?.range)return;
  const value=Number(event.target.value);
  if(r.range.key)applyScreenUI({type:'set',key:r.range.key,value});
  else if(r.range.action)runAction({...r.range.action,value});
});
$('#screen-dialog').addEventListener('cancel',event=>{if(screenSession.ui.feedback?.status==='clarify'){event.preventDefault();runQuery('取消','touch');}});

function toast(text){$('#toast').textContent=text;$('#toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),3800);}
function setAssistant(title,message,kind='idle'){$('#assistant-title').textContent=title;$('#assistant-message').textContent=message;$('.voice-dock').dataset.phase=kind;}
function options(selected,all=true){return Object.entries(names).filter(([key])=>all||!key.startsWith('third')).map(([key,label])=>`<option value="${key}" ${selected===key?'selected':''}>${label}</option>`).join('');}
function merge(a,b){for(const [k,v] of Object.entries(b||{})){if(v&&typeof v==='object'&&!Array.isArray(v))a[k]=merge(a[k]||{},v);else a[k]=v;}return a;}
function refresh(){
  $('#state-chips').innerHTML=`<span class="gear-chip">${esc(state.gear)}</span><span>${state.speed} <small>千米/时</small></span><span class="battery-chip"><i style="--level:${state.battery}%"></i>${state.battery}%</span>${state.scene!=='normal'?`<span class="scene-state">${({rest:'小憩',cinema:'影院',camp:'露营'})[state.scene]||esc(state.scene)}</span>`:''}`;
  $('#part-label').innerHTML=`<i></i><span>${['window','door','seat','temperature','reading'].includes(selection.domain)?names[selection.target]||'全舱':'全舱'} · ${domainLabels[selection.domain]||'座舱'}</span>`;
  $('#capability-count').textContent=`${CAPABILITIES.length} 项探索`;
  $('#history-count').textContent=history.length;
  document.querySelectorAll('[data-mode]').forEach(n=>n.classList.toggle('active',n.dataset.mode===mode));
  document.querySelectorAll('[data-panel]').forEach(n=>n.classList.toggle('active',n.dataset.panel===panel));
  document.querySelectorAll('[data-view]').forEach(n=>n.classList.toggle('active',n.dataset.view===view));
  document.querySelectorAll('[data-trim]').forEach(n=>n.classList.toggle('active',n.dataset.trim===trim));
  $('[data-action=xray]').classList.toggle('active',xray);$('[data-action=xray]').setAttribute('aria-pressed',String(xray));
  $('[data-action=xray]').hidden=view==='exterior';
  $('.finish-picker').hidden=view==='display';
  $('.screen-pages').hidden=view!=='display';
  document.querySelectorAll('[data-screen-page]').forEach(n=>n.classList.toggle('active',n.dataset.screenPage===screenPage));
  $('.exterior-angles').hidden=view!=='exterior';
  $('#part-label').hidden=view==='exterior'||view==='display';
  $('.scene-hint').textContent=['showcase','driver','passenger','rear','display'].includes(view)?'拖动环视 · 滚轮调整视野 · 点选部件':'拖动旋转 · 滚轮缩放 · 点选部件';
  $('#panel-title').textContent=mode==='test'?'模拟测试台':mode==='learn'?'从一句话开始':'探索小艺能力';
  $('#inspector-body').innerHTML=panel==='history'?historyPanel():mode==='test'?testPanel():controlPanel();
  renderLesson();
  cabin?.update(state,selection);
  syncScreen();
  $('#confirmation').innerHTML=lastReceipt?.status==='clarify'?`<div class="confirm-row"><span>${esc(lastReceipt.message)}</span>${context.pending?.kind==='target'||/哪个|哪一|哪.*座|哪个位置/.test(lastReceipt.message)?`<button data-query="主驾">主驾</button><button data-query="副驾">副驾</button>`:`<button class="primary-mini" data-query="确认">确认执行</button>`}<button data-query="取消">取消</button></div>`:'';
}
function rangeControl(label,domain,operation,value,min,max,step=1,unit='',target=selection.target){return `<label class="range-row"><span>${label}<b>${value}${unit}</b></span><input type="range" min="${min}" max="${max}" step="${step}" value="${value}" data-control-domain="${domain}" data-control-operation="${operation}" data-control-target="${target}" aria-label="${label}"></label>`;}
function actionButton(label,domain,operation,value,target=selection.target,active=false){return `<button class="control-button ${active?'on':''}" data-control='${esc(JSON.stringify({domain,operation,target,value}))}'>${label}</button>`;}
function controlPanel(){
  const cats=CATEGORIES.length?CATEGORIES:[{id:'climate',label:'空调'},{id:'seat',label:'座椅'},{id:'window',label:'门窗'},{id:'lighting',label:'灯光'},{id:'display',label:'屏幕'},{id:'scene',label:'场景'},{id:'other',label:'更多'}];
  const items=CAPABILITIES.filter(c=>c.category===category);
  const cat=cats.find(c=>c.id===category)||cats[0];
  const seat=state.seats[selection.target]||state.seats.driver;
  let controls='';
  if(category==='climate')controls=`<div class="climate-number">${state.climate[selection.target]??state.climate.driver}<span>°C</span><small>${names[selection.target]}温度</small></div><div class="control-grid">${actionButton('降低一度','temperature','set',(state.climate[selection.target]??24)-1)}${actionButton('升高一度','temperature','set',(state.climate[selection.target]??24)+1)}${actionButton(state.climate.power?'关闭空调':'开启空调','climate',state.climate.power?'close':'open',!state.climate.power)}${actionButton(state.fragrance?'关闭香氛':'开启香氛','fragrance',state.fragrance?'close':'open',!state.fragrance,'driver',state.fragrance)}</div>${rangeControl('风量','fan','set',state.climate.fan,1,7,1,'档')}`;
  if(category==='window')controls=`${rangeControl('车窗开度','window','set',state.windows[selection.target]??0,0,100,10,'%')}<div class="control-grid">${actionButton('完全打开','window','open',100)}${actionButton('关闭车窗','window','close',0)}${actionButton('打开车门','door','open',true)}${actionButton('关闭车门','door','close',false)}</div>${rangeControl('遮阳帘开度','shade','set',state.shade,0,100,10,'%','driver')}`;
  if(category==='seat')controls=`${rangeControl('座椅前后','seat','move',seat.position,-1,1,.1,'')}${rangeControl('靠背倾斜','seat','recline',seat.recline,0,1,.1,'')}<div class="control-grid">${actionButton(seat.heat?'关闭加热':'开启加热','seat','heat',seat.heat?0:1)}${actionButton(seat.vent?'关闭通风':'开启通风','seat','vent',seat.vent?0:1)}${actionButton(seat.massage?'停止按摩':'开启按摩','seat','massage',!seat.massage)}${actionButton('坐姿复位','seat','move',0)}</div>`;
  if(category==='lighting')controls=`<div class="control-grid">${actionButton(state.lights.reading[selection.target]?'关闭阅读灯':'打开阅读灯','reading',state.lights.reading[selection.target]?'close':'open',!state.lights.reading[selection.target])}${actionButton(state.lights.ambient?'关闭氛围灯':'打开氛围灯','ambient',state.lights.ambient?'close':'open',!state.lights.ambient)}</div><div class="color-swatches">${[['#b3cda4','森绿'],['#55b4ef','冰蓝'],['#e5aa70','暖橙'],['#b899e6','柔紫'],['#e8b3c9','浅粉']].map(([color,label])=>`<button style="--swatch:${color}" aria-label="${label}氛围灯" title="${label}" data-control='${esc(JSON.stringify({domain:'ambient',operation:'color',value:color}))}'><i></i>${label}</button>`).join('')}</div>`;
  if(category==='display')controls=`<div class="display-preview ${state.rearScreen?'on':''}"><span>${state.rearScreen?'后排屏已展开':'后排屏已收起'}</span></div><div class="control-grid">${actionButton('展开屏幕','rearScreen','open',true,'rearLeft')}${actionButton('收起屏幕','rearScreen','close',false,'rearLeft')}${actionButton(state.media.playing?'暂停播放':'播放音乐','media',state.media.playing?'pause':'play',!state.media.playing,'driver')}</div>${rangeControl('媒体音量','media','volume',state.media.volume,0,100,5,'%','driver')}`;
  if(category==='scene')controls=`<div class="scene-cards">${[['rest','小憩时光','座椅舒展 · 遮阳联动'],['cinema','车内影院','屏幕展开 · 氛围调整'],['camp','露营休息','驻车供能 · 保持舒适'],['normal','恢复日常','退出场景 · 恢复原状态']].map(([id,title,sub])=>`<button data-control='${esc(JSON.stringify({domain:'scene',operation:id==='normal'?'stop':'start',value:id}))}' class="${state.scene===id?'on':''}">${icon('scene',19)}<span><b>${title}</b><small>${sub}</small></span>${icon('chevron',15)}</button>`).join('')}</div>`;
  if(category==='other')controls=`<div class="control-grid">${actionButton(state.fragrance?'关闭香氛':'开启香氛','fragrance',state.fragrance?'close':'open',!state.fragrance,'driver')}${actionButton(state.oxygen?'关闭制氧':'开启制氧','oxygen',state.oxygen?'close':'open',!state.oxygen,'driver')}${actionButton(state.childLock?'关闭儿童锁':'开启儿童锁','childLock','set',!state.childLock,'rearLeft')}${actionButton(state.chargePort?'关闭充电盖':'打开充电盖','chargePort',state.chargePort?'close':'open',!state.chargePort,'driver')}</div><p class="micro-note">制氧机按选装设备处理，可在模拟测试中启用。操作均作用于虚拟座舱。</p>`;
  return `${mode==='learn'?`<div class="learn-progress"><span>学习进度</span><b>${lessonSuccess.size} / ${lessonDefs.length}</b><div><i style="width:${lessonSuccess.size/lessonDefs.length*100}%"></i></div></div>`:''}<div class="categories">${cats.map(c=>`<button data-category="${c.id}" class="${c.id===category?'active':''}">${icon(c.id,18)}<span>${esc(c.label)}</span></button>`).join('')}</div><div class="section-title"><h3>${esc(cat?.label||'控制')}</h3><select id="control-target" aria-label="控制座位">${options(selection.target,category==='seat'||category==='lighting')}</select></div><div class="controls-block">${controls}</div><div class="capability-heading"><h3>可以这样说</h3><span>${items.length} 项</span></div><div class="capability-list">${items.map(c=>`<article class="capability-card"><div><strong>${esc(c.title)}</strong><span class="evidence ${c.evidence}">${evidenceLabels[c.evidence]||'待核实'}</span></div><button class="query-example" data-query="${esc(c.example)}">“${esc(c.example)}”${icon('arrow',15)}</button><details><summary>了解功能与条件</summary><p>${esc(c.description)}</p>${c.conditions?.length?`<ul>${c.conditions.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:''}<p>${esc(c.why||'')}</p>${c.sourceUrl?`<a href="${esc(c.sourceUrl)}" target="_blank" rel="noopener">公开来源${c.sourcePages?.length?' · 第'+c.sourcePages.join('、')+'页':''} ↗</a>`:''}</details></article>`).join('')||'<p class="micro-note">点击座舱部件可查看相关控制。</p>'}</div>`;
}
function historyPanel(){return `<div class="history-toolbar"><span>本次体验 · ${history.length} 条</span><button data-action="export-history">${icon('download',15)}导出</button></div>${history.length?[...history].reverse().map((r,i)=>`<details class="receipt-card" ${i===0?'open':''}><summary><span class="receipt-dot ${r.status}"></span><span><b>${esc(r.query)}</b><small>${esc(r.time)} · ${r.provider==='deepseek'?'DeepSeek 理解 · ':r.provider==='local'?'本地规则 · ':''}${r.input==='voice'?'麦克风输入':r.input==='touch'?'手动控制':'文字输入'}</small></span><em class="${r.status}">${statusLabels[r.status]||r.status}</em></summary><p>${esc(r.message)}</p><ol class="trace-steps">${(r.steps||[]).map(s=>`<li class="${esc(s.status)}"><span>${esc(s.label)}</span><small>${esc(s.detail||'')}</small></li>`).join('')}</ol><div class="receipt-foot">车辆仿真 · ${evidenceLabels[r.evidence]||'原型执行记录'}</div></details>`).join(''):`<div class="empty-state">${icon('clock',38)}<h3>每次交互，都留下依据。</h3><p>执行一句指令后，可在这里查看理解、条件检查与状态变化。</p></div>`}`;}
function testPanel(){
  return `<div class="test-intro"><span class="eyebrow">先改变条件，再观察结果</span><p>测试对象是本地解析与模拟控制，不代表原生小艺或实车测试。切换设备配置会重置座舱动作。</p></div><div class="test-env"><label>发话位置<select id="env-speaker"><option value="unknown" ${state.speaker==='unknown'?'selected':''}>未识别音区</option>${options(state.speaker)}</select></label><label>挡位<select id="env-gear">${['P','D','R','N'].map(v=>`<option ${state.gear===v?'selected':''}>${v}</option>`).join('')}</select></label><label>车速<input id="env-speed" type="number" min="0" max="180" value="${state.speed}"></label><label>电量 %<input id="env-battery" type="number" min="0" max="100" value="${state.battery}"></label><label class="wide">执行环境<select id="env-fault"><option value="">正常</option><option value="offline" ${state.fault==='offline'?'selected':''}>语音服务离线（模拟）</option><option value="execution" ${state.fault==='execution'?'selected':''}>部件执行失败（模拟）</option></select></label></div><div class="feature-toggles">${[['electricDoors','电动车门'],['rearScreen','后排娱乐屏'],['oxygen','选装制氧机']].map(([id,name])=>`<label><span>${name}</span><input type="checkbox" data-feature="${id}" ${state.capabilities[id]?'checked':''}><i></i></label>`).join('')}</div><div class="test-actions"><button class="primary-button" data-action="run-suite" ${suiteRunning?'disabled':''}>${icon('play',15)}${suiteRunning?'正在验证…':'运行测试集'}</button><button class="icon-button" data-action="export-tests" aria-label="导出测试结果">${icon('download')}</button></div><div class="test-summary">${testResults.length?`<b>${testResults.filter(x=>x.pass).length}/${testResults.length}</b> 条通过 · ${testResults.filter(x=>!x.pass).length} 条未通过`:`${TEST_SCENARIOS.length} 个可重复场景`}</div><div class="test-list">${TEST_SCENARIOS.map(t=>{const r=testResults.find(x=>x.id===t.id);return `<button data-test="${esc(t.id)}"><span class="test-check ${r?(r.pass?'passed':'failed'):''}">${r?(r.pass?'✓':'!'):icon('test',14)}</span><span><b>${esc(t.name)}</b><small>${esc(t.description||t.query)}</small></span>${icon('chevron',14)}</button>`;}).join('')}</div>`;
}
function renderLesson(){
  if(mode!=='learn'){$('#lesson-overlay').innerHTML='';return;}
  const l=lessonDefs[lessonIndex];
  $('#lesson-overlay').innerHTML=`<div class="lesson-card"><span class="eyebrow">第 ${lessonIndex+1} 课 / 共 ${lessonDefs.length} 课</span><h3>${l.title}</h3><p>${l.text}</p><div><button class="lesson-run" data-action="lesson-run">${icon('play',14)}试一试</button><button data-action="lesson-next">${lessonSuccess.has(lessonIndex)?'已完成，下一课':'下一课'} ${icon('arrow',14)}</button></div></div>`;
}
function applyReceipt(receipt,query,input='text'){
  assistantRequest.cancel();
  state=receipt.state||state;context=receipt.context||{...context,pending:receipt.pending};
  if(receipt.pending!==undefined)context.pending=receipt.pending;
  lastReceipt=receipt;
  setScreenFeedback(receipt);
  if(receipt.target&&names[receipt.target])selection.target=receipt.target;
  const action=receipt.actions?.[receipt.actions.length-1];
  if(action?.domain){selection.domain=action.domain;category=categoryForDomain[action.domain]||category;}
  const recorded={...receipt,state:undefined,query,input,time:new Date().toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',second:'2-digit'})};
  history.push(recorded);if(history.length>100)history.shift();
  const lessonReached=[()=>state.rearScreen,()=>state.climate.passenger===22,()=>state.windows.rearLeft===100,()=>state.climate.passenger===21,()=>state.scene==='rest'];
  if(mode==='learn'&&receipt.status==='success'&&action?.domain===lessonDefs[lessonIndex].domain&&lessonReached[lessonIndex]())lessonSuccess.add(lessonIndex);
  setAssistant(receipt.intent?.endsWith('.query')?'当前状态':statusLabels[receipt.status]||'处理结果',receipt.message,receipt.status);
  refresh();cabin?.setSelection(selection.target,selection.domain);voice?.speak(receipt.message);
}
function serviceMessage(status,message,provider='deepseek'){
  return {status,message,provider,actions:[],context:{...context,pending:null},pending:null,steps:[{label:provider==='deepseek'?'DeepSeek 理解':'高德服务',detail:message,status}],evidence:'design'};
}
function renderServiceStatus(){
  const modelText=assistantMode==='deepseek'?`DeepSeek · ${aiVerified?'已验证调用':'已配置，待调用'}`:'本地规则';
  const mapText=mapServiceError?'高德连接异常':mapVerified?'高德已验证':serviceStatus.amap.configured?'高德已配置':'地图演示';
  $('#voice-availability').textContent=`${modelText} · ${mapText}`;
  $('#about-services').textContent=`${modelText}；${mapText}。车辆动作始终在本地模拟，未接原生小艺。麦克风能力取决于浏览器权限。`;
}
async function loadServices(){
  try{const response=await fetch('/api/status');if(!response.ok)throw new Error();const data=await response.json();serviceStatus={deepseek:data.deepseek||{},amap:data.amap||{}};}catch{serviceStatus={deepseek:{configured:false},amap:{configured:false}};}
  assistantMode=serviceStatus.deepseek.configured?'deepseek':'local';
  $('#assistant-mode').querySelector('[value="deepseek"]').disabled=!serviceStatus.deepseek.configured;
  $('#assistant-mode').value=assistantMode;
  screenSession.ui={...screenSession.ui,liveMap:createLiveMap(Boolean(serviceStatus.amap.configured))};
  renderServiceStatus();syncScreen();
}
async function searchMap(keywords,city){
  cancelAssistantForChange();
  if(screenSession.ui.feedback?.status==='clarify')return;
  const old=screenSession.ui.liveMap;if(!old?.enabled)return;
  const query=String(keywords??$('#screen-search').value??screenSession.ui.navQuery).trim();
  const searchCity=String(city??$('#screen-city').value??old.city).trim()||'杭州';
  if(!query||query.length>64){toast('请输入 1 到 64 字的地点关键词。');return;}
  screenSession.ui={...screenSession.ui,navQuery:query,navDestination:null,routeActive:false,liveMap:{...old,city:searchCity,status:'loading',message:'正在向高德查询地点…',pois:[],selectedPoi:null,routes:[]}};
  navigateScreen('map-search');syncScreen();
  try{const data=await mapRequest.run('/api/maps/search',{keywords:query,city:searchCity});if(!data)return;
    screenSession.ui={...screenSession.ui,liveMap:{...screenSession.ui.liveMap,status:'ready',message:data.pois.length?'请选择目的地，起点为杭州东站（演示）':'未找到地点，请调整关键词或城市。',pois:data.pois}};mapVerified=true;mapServiceError=false;renderServiceStatus();
  }catch(error){mapServiceError=true;renderServiceStatus();screenSession.ui={...screenSession.ui,liveMap:{...screenSession.ui.liveMap,status:'error',message:error.message}};}
  syncScreen();return {ok:screenSession.ui.liveMap.status==='ready',message:screenSession.ui.liveMap.message};
}
async function selectMapPOI(id){
  const map=screenSession.ui.liveMap,poi=map?.pois.find(p=>p.id===id);if(!poi)return;
  screenSession.ui={...screenSession.ui,navDestination:poi.name,routeActive:false,liveMap:{...map,selectedPoi:poi,routeIndex:0,routes:[],status:'loading',message:'正在向高德规划驾车路线…'}};syncScreen();
  try{const data=await mapRequest.run('/api/maps/route',{origin:map.origin.location,destination:poi.location});if(!data)return;
    screenSession.ui={...screenSession.ui,liveMap:{...screenSession.ui.liveMap,status:data.routes.length?'ready':'error',message:data.routes.length?'高德路线已返回；当前为静态预览，未开启实车导航。':'高德没有返回可用路线。',routes:data.routes}};mapVerified=true;mapServiceError=false;renderServiceStatus();
  }catch(error){mapServiceError=true;renderServiceStatus();screenSession.ui={...screenSession.ui,liveMap:{...screenSession.ui.liveMap,status:'error',message:error.message}};}
  syncScreen();
}
async function runQuery(query,input='text'){
  query=String(query||'').trim();if(!query)return;
  if(query.length>200){toast('请把指令控制在200字以内。');return;}
  assistantRequest.cancel();voice?.stop();$('#command-input').value=query;
  const controlReply=/^(确认|确定|是的|好的|好|执行|取消|不用了|算了|停止执行)[。！!？?]*$/.test(query);
  // 确认与目标补充仍走本地上下文，模型不能替用户完成确认。
  if(assistantMode==='local'||input==='touch'||controlReply||context.pending||state.fault){
    try{const receipt=executeCommand(query,state,context);applyReceipt({...receipt,provider:'local'},query,input);}catch{setAssistant('这次没有执行','控制逻辑出现异常，车辆状态未确认，请重试。','error');}return;
  }
  setAssistant('DeepSeek 正在理解','正在理解这句话，车辆尚未执行。','listening');
  setScreenFeedback({status:'loading',message:'DeepSeek 正在理解，车辆尚未执行。'});syncScreen();
  try{
    const plan=await assistantRequest.run('/api/assistant',{query,state,context});if(!plan)return;
    aiVerified=true;renderServiceStatus();
    if(plan.kind==='vehicle'){
      const result=performActions(plan.actions,state,context);result.provider='deepseek';result.model=plan.model;
      result.steps.unshift({label:'DeepSeek 理解',detail:`${plan.model} 生成 ${plan.actions.length} 个动作；以下由本地模拟器检查和执行`,status:'success'});
      applyReceipt(result,query,input);
    }else if(plan.kind==='navigation'){
      applyReceipt(serviceMessage('info','已识别地点需求，正在查询高德；请在结果中选择目的地。'),query,input);
      if(!screenSession.ui.liveMap?.enabled){applyReceipt(serviceMessage('unsupported','高德服务尚未配置，无法查询真实地点。'),query,input);return;}
      openScreenFocus();const ticket=assistantRequest.sequence;const result=await searchMap(plan.navigation.keywords,plan.navigation.city);
      if(result&&ticket===assistantRequest.sequence)applyReceipt(serviceMessage(result.ok?'info':'error',result.message,'amap'),query,input);
    }else applyReceipt(serviceMessage('reply',plan.message),query,input);
  }catch(error){applyReceipt(serviceMessage('error',`未执行车辆操作：${error.message}`),query,input);}
}
function runAction(action){
  assistantRequest.cancel();voice?.stop();
  try{applyReceipt(performAction(action,state,context),`${names[action.target]||'全舱'} · ${domainLabels[action.domain]||action.domain} · ${action.operation==='close'?'关闭':action.operation==='open'?'开启':action.value??'调节'}`,'touch');}catch(e){toast('操作未完成，请重试。');console.error(e);}
}
function cancelAssistantForChange(){if(assistantRequest.controller){assistantRequest.cancel();setAssistant('上条理解已取消','操作条件已变化，请重新发出指令。','cancelled');setScreenFeedback({status:'cancelled',message:'操作条件已变化，上条理解已取消。'});}}
function setSelection({target,domain}){cancelAssistantForChange();if(target&&names[target])context.selectedTarget=target;selection={target:target||selection.target,domain:domain||selection.domain};category=({window:'window',door:'window',shade:'window',seat:'seat',temperature:'climate',fan:'climate',climate:'climate',reading:'lighting',ambient:'lighting',rearScreen:'display',media:'display',scene:'scene',fragrance:'other',oxygen:'other'})[selection.domain]||category;panel='controls';refresh();cabin?.setSelection(selection.target,selection.domain);}
function reset(){assistantRequest.cancel();mapRequest.cancel();voice?.stop();state=createInitialState();context={};lastReceipt=null;clearTimeout(screenFeedbackTimer);screenSession.reset();screenSession.ui.liveMap=createLiveMap(Boolean(serviceStatus.amap.configured));category='climate';selection={target:'driver',domain:'temperature'};view='showcase';cabin?.clearSelection();cabin?.setView(view);screenPage='home';cabin?.resetScreenPages();xray=false;setAssistant('座舱已恢复初始状态','你可以开始新一轮体验，之前的执行记录已保留。');refresh();}
function exportJSON(data,name){
  if(exportURL)URL.revokeObjectURL(exportURL);
  const content=JSON.stringify(data,null,2);
  exportURL=URL.createObjectURL(new Blob([content],{type:'application/json'}));
  $('#export-title').textContent=name.replace('.json','');$('#export-data').value=content;
  $('#export-download').href=exportURL;$('#export-download').download=name;$('#export-dialog').showModal();
}
function checkExpectation(result,expect={}){if(expect.status&&result.status!==expect.status)return false;if(expect.path){let actual=(expect.path.startsWith('state.')?result:result.state);for(const k of expect.path.split('.'))actual=actual?.[k];if(JSON.stringify(actual)!==JSON.stringify(expect.value))return false;}return true;}
function runScenario(t,visual=false){let s=merge(createInitialState(),structuredClone(t.setup||{})),c={},result;const turns=t.turns||[t.query];let pass=true;for(const turn of turns){const query=typeof turn==='string'?turn:turn.query||turn.text;result=executeCommand(query,s,c);s=result.state;c=result.context||{};if(typeof turn==='object'&&turn.expect)pass=pass&&checkExpectation(result,turn.expect);}pass=pass&&checkExpectation(result,t.expect);if(visual){assistantRequest.cancel();state=s;context=c;lastReceipt=result;setScreenFeedback(result);selection={target:names[result.target]?result.target:'driver',domain:result.actions?.at(-1)?.domain||'temperature'};setAssistant(`${pass?'符合':'不符合'}测试预期`,result.message,result.status);refresh();}return {id:t.id,name:t.name,pass,status:result?.status,expected:t.expect,message:result?.message,before:t.setup,after:s,steps:result?.steps,at:new Date().toISOString()};}
async function runSuite(){if(suiteRunning)return;suiteRunning=true;testResults=[];refresh();for(const t of TEST_SCENARIOS){try{testResults.push(runScenario(t));}catch(e){testResults.push({id:t.id,name:t.name,pass:false,message:e.message});}refresh();await new Promise(r=>setTimeout(r,35));}suiteRunning=false;refresh();toast(`模拟测试完成：${testResults.filter(r=>r.pass).length}/${testResults.length} 条通过`);}

$('#command-form').addEventListener('submit',e=>{e.preventDefault();runQuery($('#command-input').value);});
document.addEventListener('click',e=>{
 const n=e.target.closest('button,a.brand');if(!n)return;
 if(n.matches('a.brand')){e.preventDefault();mode='explore';panel='controls';refresh();return;}
 if(n.dataset.mode){mode=n.dataset.mode;panel='controls';if(mode==='learn'){lessonIndex=0;selectLesson();}refresh();return;}
 if(n.dataset.category){category=n.dataset.category;selection.domain=({window:'window',seat:'seat',climate:'temperature',lighting:'reading',display:'rearScreen',scene:'scene',other:'fragrance'})[category]||'seat';if(selection.target.startsWith('third')&&['window','climate'].includes(category))selection.target='driver';refresh();cabin?.setSelection(selection.target,selection.domain);return;}
 if(n.dataset.panel){panel=n.dataset.panel;refresh();return;}
 if(n.dataset.screenPage){navigateScreen(n.dataset.screenPage);return;}
 if(n.dataset.screenHit){activateScreenRegion(screenRegions.find(r=>r.id===n.dataset.screenHit));return;}
 if(n.dataset.exteriorAngle){cabin?.setExteriorAngle(n.dataset.exteriorAngle);document.querySelectorAll('[data-exterior-angle]').forEach(b=>b.classList.toggle('active',b===n));return;}
 if(n.dataset.view){view=n.dataset.view;if(view==='exterior')document.querySelectorAll('[data-exterior-angle]').forEach(b=>b.classList.toggle('active',b.dataset.exteriorAngle==='front'));cabin?.setView(view);xray=cabin?.xray??false;refresh();return;}
 if(n.dataset.trim){trim=n.dataset.trim;cabin?.setTrim(trim);refresh();return;}
 if(n.dataset.query){runQuery(n.dataset.query);return;}
 if(n.dataset.control){runAction(JSON.parse(n.dataset.control));return;}
 if(n.dataset.test){if(suiteRunning)return;const t=TEST_SCENARIOS.find(x=>x.id===n.dataset.test);if(t){try{const r=runScenario(t,true);testResults=testResults.filter(x=>x.id!==t.id);testResults.push(r);refresh();}catch(e){toast(e.message);}}return;}
 switch(n.dataset.action){
 case 'screen-focus':openScreenFocus();break;
 case 'screen-close':$('#screen-dialog').close();break;
 case 'mic':if(voice.listening)voice.stop();else voice.start();break;
 case 'mute':{const muted=voice.toggleMute();n.innerHTML=icon(muted?'mute':'speaker',18);n.setAttribute('aria-label',muted?'开启语音播报':'关闭语音播报');toast(muted?'语音播报已关闭':'语音播报已开启');break;}
 case 'reset':reset();break;
 case 'about':$('#about-dialog').showModal();break;
 case 'close-dialog':$('#about-dialog').close();break;
 case 'close-export':$('#export-dialog').close();break;
 case 'copy-report':navigator.clipboard?.writeText($('#export-data').value).then(()=>toast('报告已复制')).catch(()=>{ $('#export-data').select();toast('请按复制快捷键复制报告。');});break;
 case 'mood':mood=mood==='day'?'night':'day';cabin?.setMood(mood);n.setAttribute('aria-label',mood==='day'?'切换夜间氛围':'切换日间氛围');n.classList.toggle('active',mood==='night');break;
 case 'xray':xray=!xray;cabin?.setXray(xray);n.classList.toggle('active',xray);n.setAttribute('aria-pressed',String(xray));break;
 case 'fullscreen':{const p=document.fullscreenElement?document.exitFullscreen():$('.stage-shell').requestFullscreen?.();p?.catch(()=>toast('当前浏览器未允许全屏。'));break;}
 case 'export-history':exportJSON({project:'G9座舱实验室',boundary:'理解来源见各条记录；车辆为本地仿真，非原生小艺或实车结果',records:history},'G9-交互记录.json');break;
 case 'export-tests':if(!testResults.length)toast('请先运行测试集。');else exportJSON({boundary:'仅验证本地模拟器；不包含真实语音识别和车辆执行',results:testResults},'G9-模拟测试结果.json');break;
 case 'run-suite':runSuite();break;
 case 'lesson-run':{const l=lessonDefs[lessonIndex];if(l.setupQuery)runQuery(l.setupQuery,'touch');runQuery(l.query,'touch');break;}
 case 'lesson-next':lessonIndex=(lessonIndex+1)%lessonDefs.length;selectLesson();refresh();break;
 }
});
function selectLesson(){const l=lessonDefs[lessonIndex];setSelection({target:l.target,domain:l.domain});view=l.domain==='rearScreen'?'rear':'overview';cabin?.setView(view);xray=cabin?.xray??true;}
document.addEventListener('input',e=>{if(['env-speed','env-battery'].includes(e.target.id)){cancelAssistantForChange();const key=e.target.id.slice(4),value=Number(e.target.value);if(e.target.value!==''&&Number.isFinite(value))state={...state,[key]:Math.max(0,Math.min(key==='speed'?180:100,value))};}if(e.target.matches('input[type="range"][data-control-domain]')){const b=e.target.previousElementSibling?.querySelector('b');if(b)b.textContent=e.target.value;}});
document.addEventListener('change',e=>{
 const n=e.target;
 if(n.id==='assistant-mode'){assistantRequest.cancel();assistantMode=n.value;renderServiceStatus();setAssistant('理解方式已切换',assistantMode==='deepseek'?'下一条指令将发送至 DeepSeek 理解；车辆动作仍为本地模拟。':'下一条指令使用本地规则理解。');return;}
 if(n.id==='control-target'){setSelection({target:n.value,domain:selection.domain});return;}
 if(n.dataset.controlDomain){runAction({domain:n.dataset.controlDomain,operation:n.dataset.controlOperation,target:n.dataset.controlTarget,value:Number(n.value)});return;}
 if(n.dataset.feature){assistantRequest.cancel();const environment={gear:state.gear,speed:state.speed,battery:state.battery,speaker:state.speaker,fault:state.fault,capabilities:{...state.capabilities,[n.dataset.feature]:n.checked}};state={...createInitialState(),...environment};context={};lastReceipt=null;clearTimeout(screenFeedbackTimer);screenSession.setFeedback(null);voice?.stop();setAssistant('设备配置已更新','座舱动作已重置，可以开始测试新的设备配置。');refresh();return;}
 if(n.id.startsWith('env-')){cancelAssistantForChange();const key=n.id.slice(4);if(key==='speed'||key==='battery'){const number=Number(n.value);if(!Number.isFinite(number))return;state={...state,[key]:Math.max(0,Math.min(key==='speed'?180:100,number))};}else state={...state,[key]:n.value||null};refresh();}
});
voice=new VoiceIO({onStatus:(status,text)=>{$('#mic-label').textContent=status==='listening'?'正在聆听':'点击说话';$('#mic-button').classList.toggle('listening',status==='listening');$('#mic-button').setAttribute('aria-label',status==='listening'?'停止语音输入':'开始语音输入');if(status==='listening')setAssistant('我在，请说','试试说出座位和你想做的操作。','listening');},onTranscript:text=>{$('#command-input').value=text;$('#assistant-message').textContent=text||'正在聆听…';},onResult:text=>runQuery(text,'voice'),onError:message=>{setAssistant('语音输入提示',message,'error');toast(message);}});
renderServiceStatus();loadServices();
refresh();
try{cabin=new CabinScene($('#scene'),{onSelect:setSelection,onScreenAction:runAction,onScreenPage:navigateScreen,onScreenUI:applyScreenUI,onScreenCommand:query=>runQuery(query,'touch'),onReady:()=>{$('.loading')?.remove();}});cabin.update(state,selection);cabin.setXray(xray);syncScreen();$('.loading')?.remove();}catch(e){console.error(e);$('#scene').innerHTML=`<div class="scene-error">${icon('cube',44)}<h2>三维画面暂未启动</h2><p>请使用支持硬件加速的现代浏览器打开。语音、触控与测试功能仍可使用。</p><small>${esc(e.message)}</small></div>`;}
// 只暴露只读快照，方便本地验收；任何操作仍经过统一执行器。
window.__G9_LAB__={getState:()=>structuredClone(state),getHistory:()=>structuredClone(history),getTestResults:()=>structuredClone(testResults),getContext:()=>structuredClone(context)};
window.addEventListener('pagehide',()=>{assistantRequest.cancel();mapRequest.cancel();voice.dispose();cabin?.dispose();});
