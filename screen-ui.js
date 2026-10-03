/**
 * 原创 Canvas 车机界面重绘。参照公开 G9 使用说明书 G9OM26C1 的布局，
 * 不包含官方屏幕图片、地图瓦片、商标图标或真实应用内容。
 * 资料：21 仪表，34 中控桌面，44 副驾，48 后排娱乐，108 空调，289 导航。
 * 车辆页依据 41–42 页的 3D 百变空间说明改编，非已核验的原界面复刻。
 */
export const SCREEN_PAGE_LABELS = Object.freeze({home:'桌面',apps:'应用中心',control:'控制中心',settings:'设置',vehicle:'车辆控制',doors:'门窗',seats:'座椅',lights:'灯光',climate:'前排空调','climate-rear':'后排空调',air:'空气管理',media:'音乐',sound:'声音',map:'地图','map-search':'搜索地点','map-route':'路线预览',scenes:'情景模式',display:'显示',connection:'连接',about:'关于'});
export const SCREEN_PAGES = Object.freeze(Object.keys(SCREEN_PAGE_LABELS));
export const SCREEN_SOURCES = Object.freeze({
  instrument:[21],home:[34],apps:[38],control:[41],settings:[36,122],vehicle:[41,42],doors:[82,83,90],seats:[95,97,98,99,101],lights:[122],climate:[108],'climate-rear':[111],air:[112,113],media:[302],sound:[307],map:[289],'map-search':[292],'map-route':[290,292,293],scenes:[326,327,328],display:[315],connection:[311,312,313],about:[313,317],passenger:[44],rear:[48],
});
const UI_DEFAULTS={seatTarget:'driver',doorTarget:'driver',brightness:80,textSize:'standard',soundPreset:'balanced',navDestination:null,navQuery:'',routePreference:'recommended',routeActive:false,bluetooth:false,wifi:false,ambientBrightness:70,airMode:'balanced',networkDevice:null,bluetoothDevice:null,wifiNetwork:null,mediaTrack:0,feedback:null,liveMap:null};
const TARGET_LABELS={driver:'主驾',passenger:'副驾',rearLeft:'二排左',rearRight:'二排右',thirdLeft:'三排左',thirdRight:'三排右',all:'全车',front:'前排',rear:'后排'};
const DOMAIN_LABELS={door:'车门',window:'车窗',seat:'座椅',temperature:'温度',fan:'风量',climate:'空调',reading:'阅读灯',ambient:'氛围灯',fragrance:'香氛',oxygen:'制氧',media:'媒体',scene:'情景模式',childLock:'儿童锁',chargePort:'充电口盖',rearScreen:'后排屏',shade:'遮阳帘'};
const OP_LABELS={open:'开启',close:'关闭',toggle:'切换',set:'设置',color:'颜色',move:'位置',recline:'靠背',heat:'加热',vent:'通风',massage:'按摩',play:'播放',pause:'暂停',volume:'音量',start:'进入',stop:'退出'};
const W = 1600, H = 720;
const FONT = '"PingFang SC", "Microsoft YaHei", system-ui, sans-serif';
const C = { white:'#edf2f6', text:'#dee5ed', muted:'#a0adb9', line:'#9facb8', panel:'#333e50', blue:'#aecafa', cyan:'#98dadd' };
const number = (value, fallback) => typeof value === 'number' && Number.isFinite(value) ? value : fallback;
const limit = (value,min,max) => Math.min(max,Math.max(min,value));

/**
 * 只绘制，不修改 canvas 尺寸、state 或纹理。
 * 返回 hitRegions：画布像素坐标；每项携带 page 或既有引擎 action，由宿主执行。
 * 未连接的天气、导航内容显示占位或明确的模拟标识，不假造实时数据。
 */
export function paintVehicleScreen(canvas, type, state, {page='home',time='20:26',theme='dark',ui:inputUI={}}={}) {
  const c = canvas.getContext('2d');
  if (!c || !canvas.width || !canvas.height) return {page,sourcePages:[],simulated:true,hitRegions:[]};
  const s = state || {}, active = SCREEN_PAGES.includes(page) ? page : 'home';
  const hits = [], sx = canvas.width/W, sy = canvas.height/H,ui={...UI_DEFAULTS,...inputUI};
  const addHit = (id,x,y,width,height,payload={}) => {
    const action=payload.action;
    const base=payload.label|| (payload.page?`打开${SCREEN_PAGE_LABELS[payload.page]}`:action?`${TARGET_LABELS[action.target]||''}${DOMAIN_LABELS[action.domain]}${OP_LABELS[action.operation]||''}${action.value==null?'':typeof action.value==='boolean'?(action.value?'开启':'关闭'):action.value}`:payload.command||'界面选项');
    let label=base,n=2;while(hits.some(h=>h.label===label))label=`${base}（${n++}）`;
    let key=id,nid=2;while(hits.some(h=>h.id===key))key=`${id}-${nid++}`;
    hits.push({id:key,x:x*sx,y:y*sy,width:width*sx,height:height*sy,...payload,label});
  };
  const env = { c, s, ui, type, page:active, time:String(time), theme, hit:addHit,clearHits:()=>{hits.length=0;} };
  c.save();c.setTransform(sx,0,0,sy,0,0);c.clearRect(0,0,W,H);c.lineCap='round';c.lineJoin='round';
  if (type==='instrument') instrument(env);
  else if(type==='rear'&&active==='home') rear(env);
  else if(type==='passenger'&&active==='home') { wallpaper(c); status(env,true); passenger(env); dock(env,true); }
  else {
    if(active==='map') mapPage(env);
    else if(active==='climate'||active==='climate-rear') climateDetail(env);
    else if(active==='home') {wallpaper(c);status(env);home(env);}
    else ({apps:appsPage,control:controlPage,settings:settingsPage,vehicle:vehicleDetail,doors:doorsPage,seats:seatsPage,lights:lightsPage,air:airPage,media:mediaPage,sound:soundPage,'map-search':searchPage,'map-route':routePage,scenes:scenesPage,display:displayPage,connection:connectionPage,about:aboutPage}[active]||settingsPage)(env);
    dock(env);
  }
  if(type!=='instrument')feedbackOverlay(env);
  c.restore();
  const sourceKey=type==='instrument'?'instrument':active==='home'&&['rear','passenger'].includes(type)?type:active;
  return {page:active,sourcePages:[...SCREEN_SOURCES[sourceKey]],simulated:true,evidence:['home','climate','climate-rear','lights','map'].includes(active)||type==='instrument'?'reference-layout':'adapted',hitRegions:hits};
}
function rr(c,x,y,w,h,r,fill,stroke) {c.beginPath();c.roundRect(x,y,w,h,r);if(fill){c.fillStyle=fill;c.fill();}if(stroke){c.strokeStyle=stroke;c.stroke();}}
function text(c,value,x,y,size=22,color=C.text,weight=400,align='left') {c.font=`${weight} ${size}px ${FONT}`;c.fillStyle=color;c.textAlign=align;c.textBaseline='middle';c.fillText(String(value),x,y);}
function line(c,points,color=C.line,width=2) {c.strokeStyle=color;c.lineWidth=width;c.beginPath();points.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.stroke();}
function circle(c,x,y,r,fill,stroke,width=2) {c.beginPath();c.arc(x,y,r,0,Math.PI*2);if(fill){c.fillStyle=fill;c.fill();}if(stroke){c.strokeStyle=stroke;c.lineWidth=width;c.stroke();}}
function gradient(c,x,y,w,h,a,b) {const g=c.createLinearGradient(x,y,x+w,y+h);g.addColorStop(0,a);g.addColorStop(1,b);return g;}
function card(c,x,y,w,h,top='#526387',bottom='#26324a') {rr(c,x,y,w,h,28,gradient(c,x,y,w,h,top,bottom));c.lineWidth=1;rr(c,x+.5,y+.5,w-1,h-1,27,null,'#b9cbe329');}
function icon(c,name,x,y,size=32,color=C.white) {
  c.save();c.translate(x,y);c.scale(size/32,size/32);c.strokeStyle=color;c.fillStyle=color;c.lineWidth=2;c.lineCap='round';c.lineJoin='round';
  const p=(points,w=2)=>line(c,points,color,w);
  if(name==='home'){circle(c,0,0,11,null,color,3);}
  else if(name==='apps'){for(const a of [-1,1])for(const b of [-1,1])rr(c,a*8-5,b*8-5,10,10,3,color);}
  else if(name==='fan'){for(let i=0;i<4;i++){c.save();c.rotate(i*Math.PI/2);c.beginPath();c.ellipse(6,-5,4.6,8,.6,0,Math.PI*2);c.fill();c.restore();}circle(c,0,0,3,color);}
  else if(name==='car'){c.beginPath();c.moveTo(-12,5);c.lineTo(-10,-4);c.lineTo(-6,-10);c.lineTo(6,-10);c.lineTo(10,-4);c.lineTo(12,5);c.closePath();c.stroke();p([[-10,-3],[10,-3]]);rr(c,-12,2,24,9,3,null,color);rr(c,-10,10,4,4,1,color);rr(c,6,10,4,4,1,color);p([[-8,6],[-5,6]]);p([[5,6],[8,6]]);}
  else if(name==='nav'){c.beginPath();c.moveTo(0,-13);c.lineTo(12,12);c.lineTo(0,7);c.lineTo(-12,12);c.closePath();c.stroke();p([[0,-6],[0,3]]);}
  else if(name==='seat'){p([[-6,-13],[-5,2],[0,7],[12,7]],4);p([[-9,8],[-8,12],[9,12]],3);rr(c,-8,-15,8,6,2,color);}
  else if(name==='music'){p([[1,7],[1,-10],[11,-12],[11,5]],3);circle(c,-3,8,5,color);circle(c,7,6,5,color);}
  else if(name==='play'){c.beginPath();c.moveTo(-7,-10);c.lineTo(10,0);c.lineTo(-7,10);c.closePath();c.fill();}
  else if(name==='pause'){rr(c,-8,-10,5,20,1,color);rr(c,3,-10,5,20,1,color);}
  else if(name==='power'){c.beginPath();c.arc(0,1,11,-Math.PI*.36,Math.PI*1.36);c.stroke();p([[0,-14],[0,-1]],3);}
  else if(name==='volume'){c.beginPath();c.moveTo(-12,-4);c.lineTo(-7,-4);c.lineTo(-1,-10);c.lineTo(-1,10);c.lineTo(-7,4);c.lineTo(-12,4);c.closePath();c.stroke();for(const r of [7,12]){c.beginPath();c.arc(0,0,r,-.72,.72);c.stroke();}}
  else if(name==='heat'){for(const x of [-8,0,8]){c.beginPath();c.moveTo(x,11);c.bezierCurveTo(x-7,1,x+7,-1,x,-11);c.stroke();}}
  else if(name==='sun'){circle(c,0,0,6,null,color);for(let i=0;i<8;i++){const a=i*Math.PI/4;p([[Math.cos(a)*10,Math.sin(a)*10],[Math.cos(a)*14,Math.sin(a)*14]]);}}
  else if(name==='search'){circle(c,-3,-3,8,null,color);p([[3,3],[12,12]],3);}
  else if(name==='defrost'){c.beginPath();c.moveTo(-13,10);c.lineTo(-10,-8);c.quadraticCurveTo(0,-13,10,-8);c.lineTo(13,10);c.closePath();c.stroke();for(const x of [-6,0,6])p([[x,7],[x,-4],[x-2,-1]]);}
  else if(name==='lock'){rr(c,-9,-1,18,14,3,null,color);c.beginPath();c.arc(0,-2,6,Math.PI,0);c.stroke();p([[0,4],[0,8]]);}
  else if(name==='window'){rr(c,-12,-10,24,19,3,null,color);p([[-12,4],[12,4]]);}
  else if(name==='settings'){circle(c,0,0,8,null,color);circle(c,0,0,3,null,color);for(let i=0;i<8;i++){const a=i*Math.PI/4;p([[Math.cos(a)*9,Math.sin(a)*9],[Math.cos(a)*13,Math.sin(a)*13]],4);}}
  else if(name==='bluetooth'){p([[-6,-7],[6,6],[0,12],[0,-12],[6,-6],[-6,7]]);}
  else if(name==='battery'){rr(c,-13,-7,24,14,3,null,color);rr(c,12,-3,3,6,1,color);rr(c,-10,-4,14,8,1,color);}
  else if(name==='signal'){for(let i=0;i<4;i++)rr(c,-10+i*6,9-i*5,3,4+i*5,1,color);}
  else if(name==='link'){rr(c,-13,-9,17,12,3,null,color);rr(c,-3,-1,17,12,3,null,color);}
  else if(name==='chevron'){p([[-3,-6],[3,0],[-3,6]]);}
  else if(name==='leaf'){c.beginPath();c.moveTo(-9,9);c.quadraticCurveTo(-14,-10,11,-12);c.quadraticCurveTo(15,10,-9,9);c.stroke();p([[-9,9],[5,-5]]);}
  else if(name==='minus'){p([[-8,0],[8,0]],2.5);}
  else if(name==='plus'){p([[-8,0],[8,0]],2.5);p([[0,-8],[0,8]],2.5);}
  else if(name==='phone'){rr(c,-7,-13,14,26,4,null,color);p([[-2,8],[2,8]]);}
  else {circle(c,0,0,10,null,color);}
  c.restore();
}
function wallpaper(c) {
  c.fillStyle=gradient(c,0,0,W,H,'#0d1820','#090b10');c.fillRect(0,0,W,H);
  const glow=c.createRadialGradient(940,245,30,940,260,800);glow.addColorStop(0,'#9aa7b568');glow.addColorStop(.38,'#7786983c');glow.addColorStop(1,'#1b202500');c.fillStyle=glow;c.fillRect(0,0,W,H);
  c.save();c.filter='blur(18px)';c.fillStyle=gradient(c,250,200,900,350,'#131c25','#8e99a755');c.beginPath();c.moveTo(-100,126);c.bezierCurveTo(470,395,945,6,1710,234);c.bezierCurveTo(1160,66,700,620,-100,416);c.closePath();c.fill();
  c.fillStyle=gradient(c,400,300,950,400,'#090c10','#6c78804d');c.beginPath();c.moveTo(-60,403);c.bezierCurveTo(500,718,970,158,1670,458);c.lineTo(1650,800);c.lineTo(-80,800);c.closePath();c.fill();c.restore();
  const edge=c.createLinearGradient(0,0,0,H);edge.addColorStop(0,'#00000000');edge.addColorStop(.6,'#00000000');edge.addColorStop(1,'#05080ba8');c.fillStyle=edge;c.fillRect(0,0,W,H);
}
function status(env,passenger=false) {
  const {c,s,time}=env;
  rr(c,0,0,W,48,0,'#20303d9c');circle(c,31,24,12,'#b4ac90');text(c,time,58,25,19);
  if(!passenger){icon(c,'battery',156,25,22);text(c,`${number(s.battery,82)}%`,176,25,17,C.muted);}
  icon(c,'link',W-249,25,21,C.muted);icon(c,'bluetooth',W-205,25,19,C.muted);icon(c,'signal',W-166,25,20,C.muted);
  text(c,'界面模拟',W-36,25,17,'#b7c4d0',400,'right');
  env.hit('status-control',0,0,1230,48,{page:'control',label:'打开控制中心'});env.hit('status-connection',1230,0,220,48,{page:'connection',label:'打开连接设置'});
}
function button(env,id,x,y,w,h,label,{name,action,page,ui,command,active=false,disabled=false,reason,ariaLabel}={}) {
  const {c}=env;rr(c,x,y,w,h,Math.min(18,h/2),disabled?'#ffffff08':active?'#dceafa':'#ffffff13');
  const color=disabled?'#697783':active?'#243447':C.text;
  if(name)icon(c,name,x+w/2,y+h/2,25,color);else text(c,label,x+w/2,y+h/2,20,color,500,'center');
  if(action||page||ui||command||disabled)env.hit(id,x,y,w,h,{...(action&&!disabled?{action}:{}),...(page&&!disabled?{page}:{}),...(ui&&!disabled?{ui}:{}),...(command?{command}:{}),...(disabled?{disabled:true,reason}:{}),label:ariaLabel||label||undefined});
}
function tempControl(env,target,x,y,width=174) {
  const value=number(env.s.climate?.[target],24),{c}=env;
  rr(c,x,y+6,36,38,10,'#18232bf2');icon(c,'minus',x+18,y+25,18,C.text);
  text(c,`${value.toFixed(1)}°`,x+width/2,y+25,28,C.white,400,'center');icon(c,'plus',x+width-18,y+25,18,C.text);
  env.hit(`temperature-${target}-down`,x,y,40,50,{action:{domain:'temperature',target,operation:'set',value:limit(value-1,16,30)}});
  env.hit(`temperature-${target}-up`,x+width-40,y,40,50,{action:{domain:'temperature',target,operation:'set',value:limit(value+1,16,30)}});
  env.hit(`temperature-${target}-page`,x+40,y,width-80,50,{page:'climate'});
}
function dock(env,passenger=false) {
  const {c,s,page}=env;rr(c,0,656,W,64,0,'#14242df0');line(c,[[0,656],[W,656]],'#859da64a',1);
  icon(c,'seat',67,688,29);env.hit('dock-seat-driver',33,659,67,59,{page:'seats',ui:{type:'set',key:'seatTarget',value:'driver'},label:'主驾座椅设置'});tempControl(env,'driver',100,662,176);
  const items=[['vehicle','car'],['apps','apps'],['map','nav'],['media','music'],['home','home'],['climate','fan'],['lights','sun'],['air','leaf'],['sound','volume']];
  items.forEach(([id,name],i)=>{
    const x=350+i*90,isPage=SCREEN_PAGES.includes(id),active=isPage&&page===id;
    if(active&&!passenger)rr(c,x-29,663,58,48,14,'#ffffff1c');icon(c,name,x,688,id==='home'?39:30,active&&!passenger?'#e8f2ff':C.text);
    if(isPage)env.hit(`dock-${id}`,x-36,659,72,59,{page:id});
    else if(id==='apps')env.hit('dock-apps',x-36,659,72,59,{page:'home'});
    else if(id==='media')env.hit('dock-media',x-36,659,72,59,{action:{domain:'media',operation:s.media?.playing?'pause':'play'}});
    else if(id==='ambient')env.hit('dock-ambient',x-36,659,72,59,{action:{domain:'ambient',operation:'toggle'}});
  });
  tempControl(env,'passenger',1240,662,176);icon(c,'seat',1454,688,29);icon(c,'power',1533,688,26,s.climate?.power===false?C.muted:C.text);
  env.hit('dock-seat-passenger',1420,659,66,59,{page:'seats',ui:{type:'set',key:'seatTarget',value:'passenger'},label:'副驾座椅设置'});
  env.hit('dock-power',1490,659,90,59,{action:{domain:'climate',operation:'toggle'}});
}
function seatSilhouette(c,x,y,scale=1,color='#b6cbdc') {
  c.save();c.translate(x,y);c.scale(scale,scale);
  rr(c,-23,-69,46,42,13,gradient(c,-23,-69,46,42,color,'#71849b'));rr(c,-31,-24,62,90,20,gradient(c,-31,-24,62,90,color,'#687c95'));
  c.beginPath();c.moveTo(-30,40);c.quadraticCurveTo(-63,56,-55,88);c.quadraticCurveTo(0,103,57,84);c.lineTo(35,57);c.closePath();c.fillStyle=gradient(c,-40,50,80,50,color,'#596f8b');c.fill();
  line(c,[[-15,-8],[-19,39],[0,48],[22,39],[17,-7]],'#ebf4fb55',1);c.restore();
}
function seatCard(env,x,y,w,h,target='driver',comfort=false) {
  const {c,s}=env,seat=s.seats?.[target]||{};card(c,x,y,w,h,comfort?'#397b89':'#526c9d',comfort?'#234d63':'#263954');
  text(c,`${target==='driver'?'主驾':'副驾'}${comfort?'舒适度':'坐姿'}`,x+18,y+28,21,C.white,600);
  text(c,comfort?(seat.heat?'加热已开启':seat.vent?'通风已开启':'舒适调节'):'座椅控制',x+18,y+56,16,'#d4e3f0');
  seatSilhouette(c,x+w*.65,y+h*.49,.76,comfort?'#acdbe0':'#c5d7ea');
  env.hit(`seat-card-${target}`,x,y,w,h-68,{page:'seats',ui:setUI('seatTarget',target),label:`打开${TARGET_LABELS[target]}座椅详情`});
  ['heat','vent','massage'].forEach((operation,i)=>{
    const value=operation==='massage'?!seat.massage:((number(seat[operation],0)+1)%4),active=Boolean(seat[operation]);
    button(env,`${target}-${operation}`,x+12+i*(w-24)/3,y+h-63,(w-34)/3,47,'',{name:operation==='heat'?'heat':operation==='vent'?'fan':'seat',active,action:{domain:'seat',target,operation,value}});
  });
}
function topCar(c,x,y,scale=1,s={}) {
  c.save();c.translate(x,y);c.scale(scale,scale);
  const shadow=c.createRadialGradient(0,12,10,0,12,95);shadow.addColorStop(0,'#00000070');shadow.addColorStop(1,'#00000000');c.fillStyle=shadow;c.fillRect(-110,-125,220,260);
  rr(c,-39,-90,78,182,25,gradient(c,-39,-90,78,180,'#b8c3cc','#71808d'),'#d7e1e9');rr(c,-28,-54,56,103,13,'#182936');rr(c,-25,-29,50,58,8,'#40525e');
  line(c,[[-30,-56],[30,-56]],'#d5e1e8',2);line(c,[[-28,50],[28,50]],'#c6d2d9',2);for(const side of [-1,1]){rr(c,side<0?-47:38,-58,9,40,3,'#121922');rr(c,side<0?-47:38,36,9,38,3,'#121922');}
  [['driver',-1,-30],['passenger',1,-30],['rearLeft',-1,28],['rearRight',1,28]].forEach(([id,side,yy])=>{if(s.doors?.[id])line(c,[[side*38,yy-20],[side*72,yy],[side*43,yy+21]],'#cbe5fc',4);});
  c.restore();
}
function home(env) {
  const {c,s,time}=env;text(c,time,W/2,188,139,'#eff6fc',600,'center');
  const y=354,h=223;card(c,72,y,438,h,'#4f5986','#303854');
  c.save();c.globalAlpha=.48;carSide(c,345,y+105,.67,'#899bb5');c.restore();text(c,'车灯控制',94,y+28,23,C.white,600);text(c,'氛围灯',97,y+81,18,C.muted);
  ['关闭','开启','阅读灯'].forEach((label,i)=>button(env,`home-light-${i}`,92+i*132,y+152,118,55,label,{active:i===1&&s.lights?.ambient,action:i===2?{domain:'reading',target:'driver',operation:'toggle'}:{domain:'ambient',operation:i?'open':'close'}}));
  seatCard(env,536,y,204,h,'driver');
  card(c,766,y,204,h,'#4c5e89','#283c61');text(c,'车门控制',783,y+27,21,C.white,600);topCar(c,869,y+122,.70,s);
  [['driver',784,y+54],['passenger',913,y+54],['rearLeft',784,y+160],['rearRight',913,y+160]].forEach(([target,x,yy])=>button(env,`home-door-${target}`,x,yy,42,42,s.doors?.[target]?'关':'开',{active:Boolean(s.doors?.[target]),action:{domain:'door',target,operation:s.doors?.[target]?'close':'open'}}));
  appFolder(env,996,y,238,h);
  appIcon(env,'设置','car',1300,y+56,'#64748d',{page:'settings'});appIcon(env,'音乐','music',1442,y+56,'#6392e8',{page:'media'});
  appIcon(env,'导航','nav',1300,y+169,'#669178',{page:'map'});appIcon(env,'空调','fan',1442,y+169,'#788597',{page:'climate'});
  pageDots(c,612);text(c,'车灯控制',291,603,17,C.muted,400,'center');text(c,'主驾坐姿',638,603,17,C.muted,400,'center');text(c,'车门控制',868,603,17,C.muted,400,'center');
  env.hit('home-lights-detail',72,y,438,77,{page:'lights',label:'打开灯光详情'});env.hit('home-doors-detail',813,y+90,109,111,{page:'doors',label:'打开门窗详情'});
}
function appIcon(env,label,name,x,y,color,payload,size=67) {
  rr(env.c,x-size/2,y-size/2,size,size,19,gradient(env.c,x,y,size,size,color,'#293f6680'));icon(env.c,name,x,y,size*.57);text(env.c,label,x,y+size/2+21,18,C.text,400,'center');
  if(payload)env.hit(`app-${label}-${x}`,x-size/2,y-size/2,size,size+34,payload);
}
function appFolder(env,x,y,w,h) {
  rr(env.c,x,y,w,h,27,'#202a3699');const names=['apps','music','play','phone','nav','car','sun','seat','settings'];const colors=['#4b8eaa','#667cd0','#bf8448','#50816b','#668e87','#708093','#658da8','#797c93','#8a7681'];
  names.forEach((name,i)=>{const xx=x+43+(i%3)*76,yy=y+43+Math.floor(i/3)*66;rr(env.c,xx-25,yy-25,50,50,13,colors[i]);icon(env.c,name,xx,yy,29);const page=['apps','media','media','connection','map','vehicle','lights','seats','settings'][i];env.hit(`folder-${i}`,xx-25,yy-25,50,50,{page,label:`应用：${SCREEN_PAGE_LABELS[page]}`});});
}
function pageDots(c,y) {rr(c,786,y,18,6,3,'#e0ebf5');circle(c,815,y+3,3,'#91a2b3');}
function mediaCard(env,x,y,w,h) {
  card(env.c,x,y,w,h,'#42617b','#233847');icon(env.c,'music',x+52,y+49,48,'#b9cede');text(env.c,'音乐',x+88,y+32,22,C.white,600);text(env.c,env.s.media?.playing?'正在播放 · 模拟音频':'当前没有播放内容',x+23,y+h*.57,21,C.text);
  const buttonY=y+h-47;icon(env.c,'chevron',x+47,buttonY,23,C.muted);icon(env.c,env.s.media?.playing?'pause':'play',x+w/2,buttonY,29);icon(env.c,'chevron',x+w-47,buttonY,23,C.muted);
  env.hit('media-play-pause',x+w/2-32,buttonY-26,64,52,{action:{domain:'media',operation:env.s.media?.playing?'pause':'play'}});
  env.hit('media-card-detail',x,y,w,h-83,{page:'media',label:'打开音乐播放器'});const index=limit(Math.round(number(env.ui.mediaTrack,0)),0,2);env.hit('media-card-prev',x+21,buttonY-26,52,52,{ui:setUI('mediaTrack',(index+2)%3),label:'上一首演示曲目'});env.hit('media-card-next',x+w-73,buttonY-26,52,52,{ui:setUI('mediaTrack',(index+1)%3),label:'下一首演示曲目'});
}
function passenger(env) {
  const {c}=env;const y=353,h=225;mediaCard(env,73,y,437,h);seatCard(env,536,y,204,h,'passenger');seatCard(env,766,y,204,h,'passenger',true);
  card(c,996,y,206,h,'#5188cd','#345894');icon(c,'sun',1161,y+34,27,'#f6d773');text(c,'天气',1016,y+29,20,C.white);text(c,'--°',1016,y+91,64,C.white,500);text(c,'天气未连接',1016,y+164,19,C.text);text(c,'演示界面',1016,y+197,16,'#c4d6eb');appFolder(env,1230,y,281,h);pageDots(c,612);
}
function mapPage(env) {
  if(env.ui.liveMap?.enabled===true)return liveMapPage(env);
  const {c,s,theme}=env,light=theme==='light';c.fillStyle=light?'#e4e4df':'#25282a';c.fillRect(0,0,W,H);
  // 本地矢量模拟地块与道路，不使用地图服务或真实位置。
  for(let row=0;row<7;row++)for(let col=0;col<10;col++){const x=col*166-35+(row%2)*16,y=row*112-20;rr(c,x+12,y+12,128,78,7,light?'#d5d8d1':((row+col)%6===0?'#2b3630':'#2a2d2f'));}
  c.save();c.lineCap='round';const roads=[[[60,-30],[300,180],[465,380],[590,690]],[[480,-30],[569,220],[707,425],[925,720]],[[1010,-30],[948,180],[1100,335],[1175,710]],[[1450,-30],[1300,240],[1312,435],[1510,710]],[[0,120],[290,155],[600,103],[925,134],[1600,235]],[[0,326],[320,306],[630,340],[980,301],[1600,418]],[[0,551],[376,514],[750,559],[1140,519],[1600,590]],[[208,-30],[116,219],[176,459],[65,690]]];
  roads.forEach((p,i)=>{line(c,p,light?'#c4c8c4':'#15191c',i%3===0?17:10);line(c,p,light?'#f9faf6':'#3a4044',i%3===0?9:4);});
  line(c,[[762,-30],[784,113],[765,278],[815,460],[782,710]],light?'#bad5db':'#344b52',32);line(c,[[721,-20],[744,175],[729,288],[775,472],[754,710]],light?'#f5f3e5':'#575b59',12);c.restore();
  [['环城北路',845,114],['滨河路',816,450],['科创大道',380,328],['中心公园',1180,198],['青石街',213,519]].forEach(([t,x,y])=>text(c,t,x,y,18,light?'#89918e':'#818a8b'));
  rr(c,35,31,360,151,24,light?'#fffffff2':'#41474ded');rr(c,54,50,247,43,20,light?'#eef0ed':'#62676b');icon(c,'search',79,72,20);text(c,'搜索目的地',99,73,20,light?'#535b60':C.white);text(c,'收藏',345,72,18,light?'#596064':C.text,400,'center');
  text(c,'家',83,125,21,light?'#535b60':C.text);text(c,'点击设置',118,125,17,C.muted);text(c,'公司',231,125,21,light?'#535b60':C.text);text(c,'点击设置',281,125,17,C.muted);
  text(c,'模拟地图 · 未连接导航服务',42,213,20,light?'#6c777a':'#aab5bb');
  circle(c,1532,68,30,light?'#ffffff':'#41484c');text(c,'北',1532,70,23,light?'#3a4246':C.white,500,'center');line(c,[[1532,37],[1527,47],[1537,47]],'#bb625c',2);
  circle(c,776,505,29,'#f1f4f6');icon(c,'nav',776,505,36,'#5287da');
  rr(c,35,582,469,57,18,light?'#ffffffec':'#434a50e8');[['设置','settings'],['路况','signal'],['充电站','battery'],['更多','apps'],['回自车','nav']].forEach(([t,name],i)=>{icon(c,name,82+i*93,603,23,light?'#647278':C.text);text(c,t,82+i*93,628,14,light?'#647278':C.text,400,'center');});
  rr(c,1477,540,90,92,18,'#46535c');icon(c,'car',1522,578,36);text(c,`${number(s.battery,82)}%`,1522,613,15,C.text,400,'center');mapInteractions(env);
}
function carSide(c,x,y,scale=1,color='#b8c0c5') {
  // 参考已核验的侧视图与统一外观模型，原创近似：平车顶、直腰线、近垂直尾部。
  c.save();c.translate(x,y);c.scale(scale,scale);
  c.beginPath();c.ellipse(4,59,199,8,0,0,Math.PI*2);c.fillStyle='#00000035';c.fill();
  // 车身底缘直接绕开轮拱，避免以轮胎覆盖一整块侧板。
  c.fillStyle=gradient(c,-195,-92,401,128,'#e0e5e5',color);c.beginPath();c.moveTo(-194,22);c.lineTo(-196,-18);c.quadraticCurveTo(-195,-39,-181,-44);c.lineTo(-71,-51);c.lineTo(-27,-88);c.quadraticCurveTo(-21,-92,-8,-92);c.lineTo(151,-92);c.quadraticCurveTo(169,-92,180,-85);c.lineTo(191,-79);c.lineTo(198,-45);c.lineTo(199,23);c.quadraticCurveTo(196,32,181,32);c.lineTo(164,31);c.lineTo(164,19);c.bezierCurveTo(164,-6,149,-23,125,-23);c.bezierCurveTo(101,-23,85,-6,85,19);c.lineTo(85,32);c.lineTo(-82,32);c.lineTo(-82,19);c.bezierCurveTo(-82,-6,-99,-23,-122,-23);c.bezierCurveTo(-146,-23,-162,-6,-162,19);c.lineTo(-162,30);c.lineTo(-180,30);c.quadraticCurveTo(-191,29,-194,22);c.closePath();c.fill();
  // 水平车顶和长侧窗；银色 D 柱后仍留有直立的深色尾窗饰面。
  c.fillStyle=gradient(c,-70,-82,244,41,'#5e737f','#162b38');c.beginPath();c.moveTo(-68,-50);c.lineTo(-23,-83);c.lineTo(154,-83);c.quadraticCurveTo(167,-83,172,-76);c.lineTo(184,-51);c.closePath();c.fill();
  line(c,[[-19,-85],[154,-85],[177,-80]],'#e7efef',2.2);line(c,[[-62,-47],[187,-47]],'#e2eaea',2.2);
  line(c,[[22,-83],[21,-49]],'#172631',7);line(c,[[80,-83],[79,-49]],'#172631',3.6);
  c.fillStyle='#d1d9dc';c.beginPath();c.moveTo(135,-84);c.lineTo(149,-84);c.lineTo(155,-49);c.lineTo(139,-49);c.closePath();c.fill();
  c.fillStyle='#253640';c.beginPath();c.moveTo(153,-84);c.lineTo(177,-80);c.lineTo(190,-50);c.lineTo(157,-50);c.closePath();c.fill();
  line(c,[[-14,-96],[132,-96]],'#57656d',3);line(c,[[-20,-92],[-14,-96]],'#88979b',2);line(c,[[132,-96],[141,-91]],'#88979b',2);
  // 直腰线、内凹门板与贴合侧裙。
  line(c,[[-181,-43],[-70,-47],[193,-47]],'#f0f6f4',2.2);line(c,[[-182,-39],[-68,-42],[192,-42]],'#667982',1.1);
  c.fillStyle=gradient(c,-79,-31,163,58,'#adc0c43b','#3e596080');c.beginPath();c.moveTo(-78,-30);c.lineTo(89,-30);c.lineTo(80,23);c.lineTo(-80,23);c.closePath();c.fill();
  rr(c,-77,16,159,15,4,gradient(c,-77,16,159,15,'#e4e9e9','#8b9fa4'));line(c,[[-78,31],[80,31]],'#455b63',2);line(c,[[-81,37],[82,37]],'#253a43',5);
  line(c,[[-72,-44],[-80,25]],'#526a748c',.8);line(c,[[23,-43],[22,32]],'#526a748c',.8);line(c,[[116,-43],[113,-25]],'#526a748c',.8);
  for(const xx of [1,94]){rr(c,xx-9,-35,21,4,1.5,'#dce4e4','#71858c');line(c,[[xx-5,-34],[xx+8,-34]],'#5b707a',.8);}
  // 轮眉带有完整弧线；密集细辐与统一外观的轮毂风格一致。
  for(const xx of [-122,125]){c.beginPath();c.moveTo(xx-39,28);c.lineTo(xx-39,18);c.bezierCurveTo(xx-39,-7,xx-22,-23,xx,-23);c.bezierCurveTo(xx+22,-23,xx+39,-7,xx+39,18);c.lineTo(xx+39,28);c.strokeStyle='#65777d';c.lineWidth=5;c.stroke();circle(c,xx,23,34,'#14212a');circle(c,xx,23,29,'#263641','#65757b',1);circle(c,xx,23,24,'#9babb1','#e5ecec',1.3);circle(c,xx,23,21,'#33454f');for(let i=0;i<20;i++){const a=i*Math.PI/10;line(c,[[xx+Math.cos(a)*6,23+Math.sin(a)*6],[xx+Math.cos(a)*22,23+Math.sin(a)*22]],'#d5dfe0',1.25);}circle(c,xx,23,6,'#b6c4c9','#70848e',1);}
  // 近直立灯组、前翼子板装饰、后视镜及尾部外挂箱的浅侧视厚度。
  rr(c,-193,-38,12,37,3,'#4b5e68');rr(c,-193,-42,30,4,1.5,'#e9f6f6');for(const yy of [-28,-17,-6])circle(c,-186,yy,2.6,'#d4e4e8');rr(c,190,-40,4,37,1.5,'#b66967');rr(c,197,-54,8,41,4,'#526570');
  rr(c,-92,-34,18,5,1,'#dce8e8');line(c,[[-85,-31],[-80,-28]],'#557079',1.4);line(c,[[-55,-48],[-46,-38]],'#263943',4);rr(c,-63,-56,22,11,3,'#4c6571','#b3c5ca');
  c.restore();
}

function vehiclePage(env) {
  const {c,s}=env;c.fillStyle=gradient(c,0,0,W,H,'#27323e','#111923');c.fillRect(0,0,W,H);status(env);text(c,'3D 百变空间',53,100,32,C.white,600);text(c,'车辆控制 · 布局改编',53,140,18,C.muted);
  rr(c,42,188,235,427,24,'#ffffff09');[['车门','car'],['车窗','window'],['座椅','seat'],['氛围灯','sun'],['儿童锁','lock']].forEach(([label,name],i)=>{if(i===0)rr(c,53,203+i*79,213,64,18,'#71869e42');icon(c,name,85,235+i*79,28);text(c,label,122,235+i*79,23);});
  const glow=c.createRadialGradient(917,348,60,917,370,460);glow.addColorStop(0,'#8498a02d');glow.addColorStop(1,'#8498a000');c.fillStyle=glow;c.fillRect(300,80,1300,500);
  carSide(c,934,340,2.05,'#c0c6c5');text(c,'车辆模型与控制状态均为模拟',952,494,19,C.muted,400,'center');
  const doorTargets=['driver','passenger','rearLeft','rearRight'],labels=['主驾门','副驾门','左后门','右后门'];doorTargets.forEach((target,i)=>button(env,`vehicle-door-${target}`,356+i*286,533,264,63,`${labels[i]} · ${s.doors?.[target]?'关闭':'打开'}`,{action:{domain:'door',target,operation:s.doors?.[target]?'close':'open'},active:Boolean(s.doors?.[target])}));
  [['window','全车车窗',343],['ambient','氛围灯',608],['childLock','儿童锁',873],['chargePort','充电口盖',1138]].forEach(([domain,label,x])=>button(env,`vehicle-${domain}`,x,93,231,48,label,{active:domain==='ambient'?Boolean(s.lights?.ambient):Boolean(s[domain]),action:domain==='window'?{domain,target:'all',operation:Object.values(s.windows||{}).some(v=>v>0)?'close':'open'}:{domain,operation:'toggle'}}));
}
function drawCabin(c) {
  // 原创二维座舱示意，保留参考页的贯通屏、方向盘及中岛关系。
  c.save();c.translate(800,369);const ambient=c.createRadialGradient(0,0,50,0,0,550);ambient.addColorStop(0,'#5b6a7154');ambient.addColorStop(1,'#12171d00');c.fillStyle=ambient;c.fillRect(-650,-230,1300,400);
  c.fillStyle='#21292f';c.beginPath();c.moveTo(-520,-157);c.lineTo(520,-157);c.lineTo(554,65);c.quadraticCurveTo(477,99,185,91);c.lineTo(146,209);c.lineTo(-147,209);c.lineTo(-178,92);c.quadraticCurveTo(-488,87,-556,63);c.closePath();c.fill();
  rr(c,-519,-120,1038,172,41,gradient(c,-500,-100,1000,180,'#626a6d','#2d393e'));rr(c,-492,-105,984,137,22,'#080d12');rr(c,-490,-103,55,132,18,'#3a454a');rr(c,435,-103,55,132,18,'#3a454a');
  for(const x of [-463,462]){rr(c,x-11,-82,22,85,7,'#151e24');line(c,[[x,-72],[x,-4]],'#8b9496',4);}
  rr(c,-94,56,188,18,6,'#737b7e');for(let i=0;i<5;i++)rr(c,-86+i*35,61,29,8,2,'#bac1c2');rr(c,-114,85,228,48,13,'#485457');rr(c,-100,93,90,30,9,'#141d24');rr(c,10,93,90,30,9,'#141d24');
  c.fillStyle='#38454b';c.beginPath();c.moveTo(-130,140);c.lineTo(130,140);c.lineTo(182,296);c.lineTo(-182,296);c.closePath();c.fill();line(c,[[0,153],[0,239]],'#78858b',3);
  circle(c,-348,-23,126,'#00000021');circle(c,-348,-23,110,null,'#78838a',15);circle(c,-348,-23,48,'#667178','#939b9d',2);line(c,[[-441,-27],[-394,-17]],'#818b90',19);line(c,[[-303,-17],[-256,-27]],'#818b90',19);line(c,[[-390,13],[-376,61],[-320,61],[-307,13]],'#7a858b',13);
  c.restore();
}
function climatePage(env) {
  const {c,s}=env;c.fillStyle=gradient(c,0,0,W,H,'#0b1016','#19212b');c.fillRect(0,0,W,H);drawCabin(c);
  text(c,'前排',691,62,23,C.white,600,'center');text(c,'后排',908,62,23,C.muted,400,'center');line(c,[[671,88],[711,88]],C.white,3);
  rr(c,47,40,141,52,26,'#ffffff12');icon(c,'car',71,66,22,C.muted);text(c,'PM2.5',98,58,15,C.muted);text(c,'内 --',98,78,14,C.muted);
  button(env,'climate-fragrance',1390,40,153,52,'香氛',{active:Boolean(s.fragrance),action:{domain:'fragrance',operation:'toggle'}});
  for(const [target,x]of[['driver',108],['passenger',1492]]){
    const value=number(s.climate?.[target],24);text(c,`${value.toFixed(1)}°`,x,309,49,s.climate?.power===false?'#76818a':C.white,400,'center');text(c,target==='driver'?'主驾':'副驾',x,356,18,C.muted,400,'center');
    button(env,`climate-${target}-minus`,x-74,400,60,46,'',{name:'minus',action:{domain:'temperature',target,operation:'set',value:limit(value-1,16,30)}});
    button(env,`climate-${target}-plus`,x+14,400,60,46,'',{name:'plus',action:{domain:'temperature',target,operation:'set',value:limit(value+1,16,30)}});
  }
  if(s.climate?.power!==false){for(const x of [520,653,948,1080]){const g=c.createLinearGradient(x,335,x,484);g.addColorStop(0,'#88b7d484');g.addColorStop(1,'#88b7d400');c.strokeStyle=g;c.lineWidth=4;c.beginPath();c.moveTo(x,330);c.bezierCurveTo(x-15,368,x+27,410,x+8,480);c.stroke();}}
  const fan=number(s.climate?.fan,2);button(env,'climate-fan-down',238,539,61,46,'',{name:'minus',action:{domain:'fan',operation:'set',value:Math.max(0,fan-1)}});rr(c,304,539,182,46,23,'#ffffff14');icon(c,'fan',354,562,23);text(c,String(fan),401,562,24,C.white);button(env,'climate-fan-up',491,539,61,46,'',{name:'plus',action:{domain:'fan',operation:'set',value:Math.min(7,fan+1)}});
  text(c,'风量',160,562,21,C.text);button(env,'climate-power',657,539,286,49,s.climate?.power===false?'开启空调':'关闭空调',{action:{domain:'climate',operation:'toggle'},active:s.climate?.power!==false});
  button(env,'climate-sync',1133,539,286,49,'同步前排温度',{action:{domain:'temperature',target:'front',operation:'set',value:number(s.climate?.driver,24)}});
  ['吹面','吹脚','除雾'].forEach((t,i)=>{icon(c,i===2?'defrost':'seat',285+i*108,616,21,'#697783');text(c,t,315+i*108,616,17,'#697783');env.hit(`climate-airflow-${i}`,267+i*108,598,99,37,{disabled:true,reason:'未连接送风方向控制',label:`${t}（仅示意）`});});text(c,'风向 / A/C 仅示意',794,616,18,C.muted,400,'center');text(c,'舒适座舱',1032,616,20,C.muted);text(c,'界面模拟',1514,616,17,C.muted,400,'right');
}
function instrument(env) {
  const {c,s,time}=env;c.fillStyle=gradient(c,0,0,W,H,'#171d25','#222a34');c.fillRect(0,0,W,H);
  const road=c.createLinearGradient(0,310,0,H);road.addColorStop(0,'#1e2731');road.addColorStop(1,'#0a1019');c.fillStyle=road;c.beginPath();c.moveTo(690,325);c.lineTo(910,325);c.lineTo(1270,H);c.lineTo(326,H);c.closePath();c.fill();
  for(const lane of [-2,-1,1,2]){const top=800+lane*31,bottom=800+lane*192;c.setLineDash([32,28]);line(c,[[top,333],[bottom,H]],'#879aa476',3);c.setLineDash([]);}line(c,[[774,346],[670,H]],'#ae993c',3);line(c,[[788,346],[690,H]],'#ae993c',3);
  text(c,'READY',355,53,23,'#85ce67',600);text(c,time,709,54,25,C.text);rr(c,779,30,45,46,10,'#71808a54');text(c,s.gear||'P',801,54,31,C.white,500,'center');text(c,'--°C',877,54,23,C.muted);icon(c,'car',969,54,25,C.muted);
  text(c,String(number(s.speed,0)),800,180,116,C.white,600,'center');text(c,'km/h',800,258,22,C.muted,400,'center');
  icon(c,'nav',164,401,48,C.white);text(c,'暂无导航路线',215,386,37,C.white,500);text(c,'模拟车态',215,435,23,C.muted);
  rr(c,1274,299,172,170,20,'#576678');icon(c,'music',1360,386,73,C.white);text(c,s.media?.playing?'模拟音频播放中':'当前没有播放内容',1360,510,25,C.text,400,'center');
  icon(c,'battery',69,671,30,C.muted);rr(c,110,661,61,22,5,null,'#96a6af');rr(c,114,665,53*number(s.battery,82)/100,14,3,'#6ab68b');text(c,`${number(s.battery,82)}%`,190,674,23,C.text);text(c,'-- km',292,674,20,C.muted);
  text(c,'-- % PWR',1200,674,19,C.muted,400,'right');rr(c,1220,670,172,7,3,'#84919a40');text(c,'界面模拟',1530,674,17,C.muted,400,'right');
}
function rear(env) {
  const {c}=env;c.fillStyle=gradient(c,0,0,W,H,'#091426','#293846');c.fillRect(0,0,W,H);
  let seed=4723;const random=()=>{seed=(seed*16807)%2147483647;return (seed-1)/2147483646;};
  for(let i=0;i<620;i++){const x=random()*W,y=random()*390,r=.3+random()*1.7;circle(c,x,y,r,`rgba(213,229,248,${.22+random()*.65})`);}
  for(let layer=0;layer<4;layer++){c.fillStyle=['#243c50','#1b3143','#182938','#101f2e'][layer];c.beginPath();c.moveTo(0,540);for(let i=0;i<=15;i++){const x=i*W/15,y=380+layer*61+Math.sin(i*1.91+layer)*32+Math.sin(i*.57)*26;c.lineTo(x,y);}c.lineTo(W,H);c.lineTo(0,H);c.closePath();c.fill();}
  mediaCard(env,607,366,235,213);card(c,880,366,235,213,'#3b5e97','#2d4776');icon(c,'sun',1078,395,27,'#efd992');text(c,'天气',903,397,22,C.white);text(c,'--°',903,452,60,C.white,500);text(c,'天气未连接',903,523,20,C.text);text(c,'演示界面',903,554,16,C.muted);
  rr(c,454,622,702,80,29,'#b0c3d450');const names=['apps','settings','play','music','car','sun'];names.forEach((name,i)=>{const x=517+i*111;rr(c,x-30,634,60,56,16,['#52b7cb','#9778c4','#b8854c','#667be0','#73808d','#5f9bcd'][i]);icon(c,name,x,662,33);if(name==='music'||name==='play')env.hit(`rear-${name}`,x-30,634,60,56,{action:{domain:'media',operation:env.s.media?.playing?'pause':'play'}});});
  text(c,'界面模拟',1557,38,18,C.muted,400,'right');pageDots(c,599);
}

// 二级页面：纯绘图与意图描述。状态变更、历史和反馈由宿主控制器统一处理。
const setUI=(key,value)=>({type:'set',key,value});
const seats=['driver','passenger','rearLeft','rearRight','thirdLeft','thirdRight'];
const doors=seats.slice(0,4);
const tracks=['城市漫游','日落回声','静谧山谷'];
const destinations=[{name:'东湖公园',kind:'城市公园',distance:'8.6',minutes:18},{name:'中央美术馆',kind:'艺术空间',distance:'5.2',minutes:13},{name:'湖畔营地',kind:'郊外营地',distance:'22.4',minutes:36}];
function note(c,value,x,y,width=1000,size=19,color=C.muted){let lineText='',row=0,lineWidth=0;for(const ch of String(value)){const charWidth=ch.charCodeAt(0)>255?size:size*.58;if(lineText&&lineWidth+charWidth>width){text(c,lineText,x,y+row*29,size,color);lineText=ch;lineWidth=charWidth;row++;}else{lineText+=ch;lineWidth+=charWidth;}}if(lineText)text(c,lineText,x,y+row*29,size,color);}
function pageFrame(env,{sidebar=false,subtitle='参考公开功能组织 · 界面布局改编'}={}){
  const {c,page}=env;c.fillStyle=gradient(c,0,0,W,H,'#1b2530','#101820');c.fillRect(0,0,W,H);status(env);
  button(env,'page-back',32,66,86,51,'返回',{ui:{type:'back'},ariaLabel:'返回上一页'});text(c,SCREEN_PAGE_LABELS[page],146,90,31,C.white,600);text(c,subtitle,146,126,16,C.muted);
  if(sidebar){rr(c,30,158,267,473,24,'#ffffff05');const pages=['vehicle','doors','seats','lights','climate','sound','display','connection'];pages.forEach((p,i)=>button(env,`side-${p}`,43,169+i*54,240,46,SCREEN_PAGE_LABELS[p],{page:p,active:p===page,ariaLabel:`分类：${SCREEN_PAGE_LABELS[p]}`}));}
}
function panel(c,x,y,w,h){rr(c,x,y,w,h,24,'#ffffff08');}
function rowLabel(c,label,value,x,y,w){text(c,label,x,y,23,C.white,500);if(value!=null)text(c,value,x+w,y,20,C.muted,400,'right');}
function tile(env,id,x,y,w,h,title,detail,name,payload){panel(env.c,x,y,w,h);icon(env.c,name,x+34,y+35,29,C.blue);text(env.c,title,x+61,y+36,24,C.white,500);if(detail)text(env.c,detail,x+24,y+h-31,18,C.muted);env.hit(id,x,y,w,h,{...payload,label:title});}
function segmented(env,id,x,y,w,values,current,makePayload,labelPrefix){const gap=9,bw=(w-gap*(values.length-1))/values.length;values.forEach(([value,label],i)=>button(env,`${id}-${value}`,x+i*(bw+gap),y,bw,49,label,{active:current===value,...makePayload(value),ariaLabel:`${labelPrefix||(id==='seat-target'?'选择座位':id==='door-target'?'选择车门':id==='sound-preset'?'选择音效':'选择')}：${label}`}));}
function level(env,id,x,y,w,value,{min=0,max=100,step=10,rangeStep=1,action,uiKey,label='调节'}={}){
  button(env,`${id}-minus`,x,y,52,45,'',{name:'minus',ariaLabel:`降低${label}`,...(action?{action:{...action,value:limit(value-step,min,max)}}:{ui:setUI(uiKey,limit(value-step,min,max))})});
  const start=x+76,rail=w-152;rr(env.c,start,y+19,rail,7,4,'#ffffff20');rr(env.c,start,y+19,Math.max(1,rail*(value-min)/(max-min)),7,4,'#b7ccee');circle(env.c,start+rail*(value-min)/(max-min),y+22,9,'#e8f0f8');
  env.hit(`${id}-range`,start-8,y+2,rail+16,40,{range:{min,max,step:rangeStep,value,...(action?{action}:{key:uiKey})},label:`调节${label}`});
  button(env,`${id}-plus`,x+w-52,y,52,45,'',{name:'plus',ariaLabel:`提高${label}`,...(action?{action:{...action,value:limit(value+step,min,max)}}:{ui:setUI(uiKey,limit(value+step,min,max))})});
}
function appsPage(env){pageFrame(env,{subtitle:'常用应用与功能入口'});const entries=[['settings','settings'],['vehicle','car'],['doors','window'],['seats','seat'],['lights','sun'],['climate','fan'],['air','leaf'],['media','music'],['sound','volume'],['map','nav'],['scenes','home'],['display','sun'],['connection','link'],['about','car'],['control','apps']];entries.forEach(([page,name],i)=>tile(env,`apps-${page}`,56+(i%5)*302,174+Math.floor(i/5)*145,276,122,SCREEN_PAGE_LABELS[page],'点击进入',name,{page}));}
function controlPage(env){pageFrame(env,{subtitle:'常用快捷开关 · 点击后由模拟车辆回执确认'});const {s}=env;const items=[['climate','空调',s.climate?.power,'fan'],['ambient','氛围灯',s.lights?.ambient,'sun'],['childLock','儿童锁',s.childLock,'lock'],['rearScreen','后排娱乐屏',s.rearScreen,'play'],['fragrance','香氛',s.fragrance,'leaf'],['shade','遮阳帘',s.shade>0,'window']];items.forEach(([domain,label,on,name],i)=>tile(env,`control-${domain}`,54+(i%3)*507,176+Math.floor(i/3)*142,480,118,label,on?'已开启':'已关闭',name,{action:domain==='shade'?{domain,operation:on?'close':'open'}:{domain,operation:'toggle'}}));tile(env,'control-settings',54,490,480,113,'前往设置','车辆、声音、显示与连接','settings',{page:'settings'});tile(env,'control-scenes',561,490,480,113,'情景模式','影院、小憩、露营','home',{page:'scenes'});tile(env,'control-doors',1068,490,480,113,'门窗控制','车门、车窗与充电口','car',{page:'doors'});}
function settingsPage(env){pageFrame(env,{sidebar:true,subtitle:'依据手册设置路径组织，完整侧栏顺序为原型设计'});const items=[['vehicle','车辆控制','门窗、座椅与情景','car'],['lights','灯光','颜色、亮度与阅读灯','sun'],['sound','声音','媒体音量与模拟音效','volume'],['display','显示','亮度与字号预览','sun'],['connection','连接','蓝牙与网络界面模拟','link'],['about','关于','来源、版本与能力边界','settings']];items.forEach(([page,title,detail,name],i)=>tile(env,`settings-${page}`,333+(i%2)*614,173+Math.floor(i/2)*149,582,122,title,detail,name,{page}));}
function vehicleDetail(env){pageFrame(env,{sidebar:true,subtitle:'3D 百变空间 · 车辆控制入口'});const {c,s}=env;carSide(c,934,318,1.72,'#bac5ce');text(c,`${s.gear||'P'} 挡   ${number(s.speed,0)} km/h   电量 ${number(s.battery,82)}%`,937,434,23,C.text,400,'center');[['doors','门窗','开关与开度','car'],['seats','座椅','姿态与舒适功能','seat'],['lights','灯光','氛围灯与照明','sun'],['scenes','情景','一组联动控制','home']].forEach(([page,title,detail,name],i)=>tile(env,`vehicle-${page}`,335+i*306,487,279,116,title,detail,name,{page}));}
function doorsPage(env){pageFrame(env,{sidebar:true,subtitle:'门窗动作执行前会检查模拟车态；开门需确认'});const {c,s,ui}=env,target=doors.includes(ui.doorTarget)?ui.doorTarget:'driver',isOpen=Boolean(s.doors?.[target]),opening=number(s.windows?.[target],0);segmented(env,'door-target',335,173,1200,doors.map(t=>[t,TARGET_LABELS[t]]),target,v=>({ui:setUI('doorTarget',v)}));topCar(c,561,408,1.56,s);text(c,TARGET_LABELS[target],559,599,24,C.white,600,'center');panel(c,795,245,737,379);rowLabel(c,'电动车门',isOpen?'已打开':'已关闭',825,282,675);button(env,'door-open',825,315,322,53,'打开车门',{action:{domain:'door',target,operation:'open'},disabled:s.capabilities?.electricDoors===false,reason:'演示配置未启用电动车门'});button(env,'door-close',1163,315,339,53,'关闭车门',{action:{domain:'door',target,operation:'close'}});rowLabel(c,'车窗开度',`${opening}%`,825,410,675);segmented(env,'window-position',825,446,677,[0,25,50,75,100].map(v=>[v,v===0?'关闭':`${v}%`]),opening,v=>({action:{domain:'window',target,operation:'set',value:v}}),`${TARGET_LABELS[target]}车窗开度`);button(env,'doors-childlock',825,548,322,51,`儿童锁：${s.childLock?'已开':'已关'}`,{active:s.childLock,action:{domain:'childLock',operation:'toggle'}});button(env,'doors-chargeport',1163,548,339,51,`充电口盖：${s.chargePort?'关闭':'打开'}`,{action:{domain:'chargePort',operation:'toggle'}});}
function seatsPage(env){pageFrame(env,{sidebar:true,subtitle:'保留六座基线；第三排仅开放资料已确认的加热'});const {c,s,ui}=env,target=seats.includes(ui.seatTarget)?ui.seatTarget:'driver',seat=s.seats?.[target]||{},third=target.startsWith('third');segmented(env,'seat-target',335,173,1200,seats.map(t=>[t,TARGET_LABELS[t]]),target,v=>({ui:setUI('seatTarget',v)}));panel(c,335,246,413,373);seatSilhouette(c,545,408,1.78,'#c1c9c9');text(c,TARGET_LABELS[target],544,578,26,C.white,500,'center');panel(c,774,246,760,373);text(c,'座椅舒适度',803,277,25,C.white,600);for(const [operation,label,index]of[['heat','加热',0],['vent','通风',1]]){text(c,label,806,325+index*71,22,C.text);segmented(env,`seat-${operation}`,894,300+index*71,607,[0,1,2,3].map(v=>[v,v===0?'关闭':`${v} 挡`]),number(seat[operation],0),v=>({action:{domain:'seat',target,operation,value:v},disabled:third&&operation==='vent',reason:'手册未确认第三排通风，本演示不开放'}),`${TARGET_LABELS[target]}${label}`);}button(env,'seat-massage',805,444,321,49,seat.massage?'关闭按摩':'开启按摩',{active:Boolean(seat.massage),action:{domain:'seat',target,operation:'massage',value:!seat.massage},disabled:third,reason:'手册未确认第三排按摩，本演示不开放'});button(env,'seat-reading',1144,444,358,49,`阅读灯：${s.lights?.reading?.[target]?'已开':'已关'}`,{action:{domain:'reading',target,operation:'toggle'},active:Boolean(s.lights?.reading?.[target])});text(c,'座椅前后',806,539,19,C.muted);button(env,'seat-forward',921,516,118,43,'向前',{action:{domain:'seat',target,operation:'move',value:limit(number(seat.position,0)+.2,-1,1)}});button(env,'seat-backward',1051,516,118,43,'向后',{action:{domain:'seat',target,operation:'move',value:limit(number(seat.position,0)-.2,-1,1)}});button(env,'seat-upright',1184,516,151,43,'靠背立起',{action:{domain:'seat',target,operation:'recline',value:0}});button(env,'seat-recline',1348,516,153,43,'靠背后仰',{action:{domain:'seat',target,operation:'recline',value:limit(number(seat.recline,0)+.2,0,1)}});text(c,'姿态调节仅在模拟停车 P 挡时执行',806,593,18,C.muted);}
function lightsPage(env){pageFrame(env,{sidebar:true,subtitle:'车内灯光 · 参考手册主题、自定义和亮度布局'});const {c,s,ui}=env;button(env,'lights-toggle',1301,75,231,47,s.lights?.ambient?'关闭氛围灯':'开启氛围灯',{active:s.lights?.ambient,action:{domain:'ambient',operation:'toggle'}});c.save();c.translate(412,107);c.scale(.66,.66);drawCabin(c);c.restore();const colors=[['#b3cda4','静谧青绿'],['#8cb5f5','澄澈蓝'],['#e6b08b','暖夕霞'],['#d6a6df','暮色紫']];colors.forEach(([value,label],i)=>{const x=337+i*300;card(c,x,419,277,106,value,'#202c3b');text(c,label,x+24,451,23,C.white,500);button(env,`light-color-${i}`,x+156,470,102,36,s.lights?.color===value?'已选择':'选择',{active:s.lights?.color===value,action:{domain:'ambient',operation:'color',value},ariaLabel:`氛围灯颜色：${label}`});});rowLabel(c,'模拟灯光强度',`${number(ui.ambientBrightness,70)}%`,343,568,340);level(env,'ambient-brightness',735,550,795,number(ui.ambientBrightness,70),{uiKey:'ambientBrightness',label:'氛围灯强度'});}
function climateDetail(env){if(env.page==='climate')climatePage(env);else{const {c,s}=env;c.fillStyle=gradient(c,0,0,W,H,'#0d131b','#182430');c.fillRect(0,0,W,H);seatSilhouette(c,605,356,1.72,'#56656c');seatSilhouette(c,994,356,1.72,'#56656c');rr(c,739,420,121,157,18,'#34444d');for(const[target,x]of[['rearLeft',108],['rearRight',1492]]){const value=number(s.climate?.[target],24);text(c,`${value.toFixed(1)}°`,x,309,49,C.white,400,'center');text(c,TARGET_LABELS[target],x,356,19,C.muted,400,'center');button(env,`rear-${target}-minus`,x-74,400,60,46,'',{name:'minus',action:{domain:'temperature',target,operation:'set',value:limit(value-1,16,30)}});button(env,`rear-${target}-plus`,x+14,400,60,46,'',{name:'plus',action:{domain:'temperature',target,operation:'set',value:limit(value+1,16,30)}});}text(c,'风量',410,567,23,C.text);level(env,'rear-fan',490,543,620,number(s.climate?.fan,2),{min:0,max:7,step:1,action:{domain:'fan',operation:'set'},label:'后排风量'});text(c,'本原型前后排共用风量与空调总开关',800,611,17,C.muted,400,'center');}
  const {c}=env;rr(c,570,31,460,81,22,'#141c24');button(env,'climate-front-tab',584,43,204,50,'前排',{page:'climate',active:env.page==='climate'});button(env,'climate-rear-tab',813,43,204,50,'后排',{page:'climate-rear',active:env.page==='climate-rear'});button(env,'climate-back',230,40,101,49,'返回',{ui:{type:'back'}});button(env,'climate-air',1129,40,198,49,'空气管理',{page:'air'});}
function airPage(env){pageFrame(env,{sidebar:true,subtitle:'香氛和制氧按配置控制；空气模式仅为界面选项'});const {c,s,ui}=env;tile(env,'air-fragrance',336,179,584,170,'香氛',s.fragrance?'模拟开启':'模拟关闭','leaf',{action:{domain:'fragrance',operation:'toggle'}});tile(env,'air-oxygen',947,179,584,170,'制氧',s.capabilities?.oxygen?(s.oxygen?'模拟开启':'模拟关闭'):'当前演示配置未启用','fan',s.capabilities?.oxygen?{action:{domain:'oxygen',operation:'toggle'}}:{disabled:true,reason:'未配置制氧设备'});panel(c,336,375,1195,242);text(c,'空气模式（界面模拟）',361,409,26,C.white,500);segmented(env,'air-mode',361,449,1147,[['balanced','舒适'],['fresh','新风'],['recirculate','内循环']],ui.airMode,value=>({ui:setUI('airMode',value)}));note(c,'该模式只改变演示选项；没有接入空气传感器、PM2.5 或真实送风控制。',363,549,1100);button(env,'air-climate',1156,565,350,36,'返回空调',{page:'climate'});}
function mediaPage(env){pageFrame(env,{subtitle:'媒体播控 · 原创演示曲目，无网络音源或真实音频输出'});const {c,s,ui}=env,index=limit(Math.round(number(ui.mediaTrack,0)),0,2);card(c,61,177,429,440,'#53687b','#233544');circle(c,275,359,117,'#14232e','#8197a7',2);circle(c,275,359,86,null,'#334d60',2);circle(c,275,359,48,'#9aa5a7');icon(c,'music',275,359,45,'#22333b');text(c,tracks[index],275,531,31,C.white,500,'center');text(c,'原创标题 · 模拟播放信息',275,578,18,C.muted,400,'center');text(c,s.media?.playing?'播放状态：进行中':'播放状态：已暂停',552,205,29,C.white,600);for(let i=0;i<3;i++)button(env,`media-track-${i}`,552,256+i*80,969,61,`${String(i+1).padStart(2,'0')}     ${tracks[i]}     ·     演示曲目`,{active:index===i,ui:setUI('mediaTrack',i),ariaLabel:`选择演示曲目：${tracks[i]}`});button(env,'media-prev',552,513,177,52,'上一首',{ui:setUI('mediaTrack',(index+2)%3)});button(env,'media-toggle',750,513,367,52,s.media?.playing?'暂停':'播放',{action:{domain:'media',operation:s.media?.playing?'pause':'play'},active:Boolean(s.media?.playing)});button(env,'media-next',1138,513,177,52,'下一首',{ui:setUI('mediaTrack',(index+1)%3)});button(env,'media-sound',1336,513,185,52,'声音设置',{page:'sound'});text(c,`音量 ${number(s.media?.volume,35)}%`,552,605,22,C.text);level(env,'media-volume',750,582,773,number(s.media?.volume,35),{action:{domain:'media',operation:'volume'},label:'媒体音量'});}
function soundPage(env){pageFrame(env,{sidebar:true,subtitle:'音量同步模拟车辆；音效只改变界面选项，不代表真实调音'});const {c,s,ui}=env;panel(c,335,174,1198,150);rowLabel(c,'媒体音量',`${number(s.media?.volume,35)}%`,361,210,1146);level(env,'sound-volume',362,255,1144,number(s.media?.volume,35),{action:{domain:'media',operation:'volume'},label:'媒体音量'});panel(c,335,351,1198,263);text(c,'音效模式（界面模拟）',360,389,25,C.white,600);segmented(env,'sound-preset',360,425,1147,[['balanced','均衡'],['vocal','人声'],['surround','环绕'],['bass','低音']],ui.soundPreset,v=>({ui:setUI('soundPreset',v)}));const levels={balanced:[.4,.4,.4,.4,.4,.4,.4],vocal:[.26,.33,.55,.8,.66,.42,.28],surround:[.62,.43,.62,.37,.61,.44,.6],bass:[.92,.81,.64,.41,.33,.29,.24]}[ui.soundPreset]||[.4,.4,.4,.4,.4,.4,.4];levels.forEach((n,i)=>{rr(c,397+i*157,516,112,7,3,'#ffffff15');rr(c,397+i*157,516-n*23,112,7+n*23,3,'#abc4d7');});text(c,'仅作音效选项预览；没有加载真实声场或均衡器算法',361,577,19,C.muted);}
function searchPage(env){if(env.ui.liveMap?.enabled===true)return liveSearchPage(env);pageFrame(env,{subtitle:'模拟地点搜索 · 下列地点为虚构演示数据'});const {c,ui}=env,query=String(ui.navQuery||'').trim();rr(c,55,172,1269,66,20,'#ffffff11');icon(c,'search',91,205,29,C.muted);text(c,query||'输入或选择：东湖公园 / 中央美术馆 / 湖畔营地',128,205,25,query?C.white:C.muted);env.hit('search-input',55,172,1269,66,{ui:setUI('navQuery',String(ui.navQuery||'')),label:'搜索模拟目的地'});button(env,'search-clear',1348,172,197,66,'清空',{ui:setUI('navQuery','')});const results=destinations.filter(p=>!query||p.name.includes(query)||p.kind.includes(query));results.forEach((p,i)=>{const y=271+i*115;tile(env,`search-result-${i}`,55,y,1490,94,p.name,`${p.kind} · 虚构地点 · ${p.distance} 公里（模拟）`,'nav',{ui:setUI('navDestination',p.name),page:'map-route',label:`查看${p.name}的模拟路线`});});if(!results.length){text(c,'没有匹配的演示地点',800,383,35,C.white,500,'center');text(c,'可以搜索“公园”“美术馆”“营地”，或清空查看全部',800,436,22,C.muted,400,'center');}}
function routePage(env){if(env.ui.liveMap?.enabled===true)return liveRoutePage(env);mapPage({...env,hit:()=>{},ui:{...env.ui,routeActive:false}});const {c,ui}=env,p=destinations.find(item=>item.name===ui.navDestination);rr(c,26,21,566,617,26,'#202d39f5');button(env,'route-back',48,42,102,46,'返回',{ui:{type:'back'}});text(c,'路线预览',174,67,29,C.white,600);text(c,p?.name||'尚未选择目的地',57,145,34,C.white,600);text(c,'虚构地点 · 里程与耗时均为演示数据',57,191,18,C.muted);if(!p){button(env,'route-search',58,279,498,69,'选择模拟目的地',{page:'map-search'});return;}const choices=[['recommended','推荐路线',p.minutes,p.distance],['fastest','用时较少',Math.max(5,p.minutes-3),(Number(p.distance)+1.4).toFixed(1)],['shortest','距离较短',p.minutes+4,Math.max(1,Number(p.distance)-1.2).toFixed(1)]];choices.forEach(([v,label,min,km],i)=>{const y=237+i*91;button(env,`route-choice-${v}`,58,y,498,73,`${label}     ${min} 分钟    ${km} 公里`,{active:ui.routePreference===v,ui:setUI('routePreference',v)});});button(env,'route-start',58,537,498,69,ui.routeActive?'结束路线演示':'开始路线演示',{active:!ui.routeActive,ui:setUI('routeActive',!ui.routeActive),page:'map'});drawSimulatedRoute(c,ui.routePreference);text(c,p.name,1299,193,23,C.white,500,'center');}
// 高德仅供应地点与路线数据；此处只读接口结果，不执行网络请求或伪造定位。
const liveShort=(value,max=42)=>{const v=String(value??'');return v.length>max?v.slice(0,max-1)+'…':v;};
const liveCoordinate=p=>Array.isArray(p)&&p.length>=2&&Number.isFinite(p[0])&&Number.isFinite(p[1])&&Math.abs(p[0])<=180&&Math.abs(p[1])<=90;
function liveRouteValid(route){return route&&Number.isFinite(route.distanceMeters)&&route.distanceMeters>0&&Number.isFinite(route.durationSeconds)&&route.durationSeconds>0&&Array.isArray(route.polyline)&&route.polyline.length>=2&&route.polyline.every(liveCoordinate);}
function liveCurrentRoute(live){if(live.status!=='ready')return null;const index=Number.isInteger(live.routeIndex)?live.routeIndex:0;return liveRouteValid(live.routes?.[index])?live.routes[index]:null;}
function liveDistance(meters){return meters<1000?`${Math.round(meters)} 米`:`${(meters/1000).toFixed(1)} 公里`;}
function liveDuration(seconds){if(seconds<60)return `${Math.ceil(seconds)} 秒`;const minutes=Math.ceil(seconds/60);return minutes>=60?`${Math.floor(minutes/60)} 小时 ${minutes%60} 分钟`:`${minutes} 分钟`;}
function liveMapBase(env){
  const {c,ui}=env,live=ui.liveMap,route=liveCurrentRoute(live);c.fillStyle=gradient(c,0,0,W,H,'#1d2b32','#17232d');c.fillRect(0,0,W,H);
  // 中性方格用于方位示意，不绘道路瓦片、道路名或虚构街区。
  for(let x=605;x<1560;x+=100)line(c,[[x,90],[x,564]],'#748d9920',1);for(let y=110;y<590;y+=74)line(c,[[588,y],[1546,y]],'#748d9920',1);
  text(c,'高德地点/路线 · 示意底图 · 演示起点，未定位',1065,610,20,'#b7cad4',400,'center');
  text(c,'北 ↑',1515,66,20,C.muted,500,'center');
  if(route){
    const raw=route.polyline,meanLatitude=raw.reduce((sum,p)=>sum+p[1],0)/raw.length;const longitudeScale=Math.max(.05,Math.cos(meanLatitude*Math.PI/180));
    let previous=raw[0][0];const coords=raw.map(([lng,lat])=>{let unwrapped=lng;while(unwrapped-previous>180)unwrapped-=360;while(unwrapped-previous< -180)unwrapped+=360;previous=unwrapped;return[unwrapped*longitudeScale,-lat];});
    let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;for(const [x,y]of coords){minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);}
    const box={x:665,y:137,width:790,height:360},scale=Math.min(box.width/Math.max(maxX-minX,.00001),box.height/Math.max(maxY-minY,.00001));
    const points=coords.map(([x,y])=>[box.x+box.width/2+(x-(minX+maxX)/2)*scale,box.y+box.height/2+(y-(minY+maxY)/2)*scale]);
    line(c,points,'#173f61',15);line(c,points,'#86c3ff',7);
    const first=points[0],last=points[points.length-1];circle(c,...first,12,'#e2f5ed','#437463',3);circle(c,...last,12,'#aacefa','#224f79',3);
    text(c,'演示起点',first[0],first[1]+29,16,C.white,500,'center');text(c,'目的地',last[0],last[1]-28,16,C.white,500,'center');
  }else {icon(c,'nav',1068,306,83,'#648799');text(c,live.status==='loading'?'正在请求高德数据':live.status==='error'?'高德数据请求失败':'路线数据尚未载入',1068,383,26,C.muted,500,'center');}
}
function liveSearchPage(env){
  const {c,ui}=env,live=ui.liveMap,query=String(ui.navQuery||''),loading=live.status==='loading';
  pageFrame(env,{subtitle:`高德地点搜索 · 城市：${liveShort(live.city||'未指定',18)} · 未定位`});
  rr(c,55,172,1070,66,20,'#ffffff11');icon(c,'search',91,205,29,C.muted);text(c,liveShort(query||'输入地点名称，向高德搜索',40),128,205,25,query?C.white:C.muted);env.hit('search-input',55,172,1070,66,{ui:setUI('navQuery',query),label:'搜索高德目的地'});
  button(env,'search-submit',1145,172,180,66,loading?'搜索中':'搜索高德',{ui:{type:'search-map'},disabled:loading,reason:'正在请求高德地点'});button(env,'search-clear',1348,172,197,66,'清空',{ui:setUI('navQuery','')});
  if(live.status==='error'){
    text(c,'高德地点或路线请求失败',800,331,30,C.white,600,'center');note(c,liveShort(live.message||'接口未返回可用数据，请检查配置后重试。',150),238,398,1125,22,C.muted);button(env,'live-search-retry',622,512,357,61,'重试高德搜索',{ui:{type:'search-map'}});return;
  }
  if(loading){text(c,'正在向高德请求地点 / 路线，请稍候',800,386,28,C.white,500,'center');text(c,'显示结果前不会使用本地虚构地点代替',800,438,20,C.muted,400,'center');return;}
  if(live.status!=='ready'){text(c,'输入关键词后搜索真实地点',800,377,30,C.white,500,'center');text(c,'已启用高德数据模式；是否可用以接口回执为准',800,435,21,C.muted,400,'center');return;}
  const pois=Array.isArray(live.pois)?live.pois:[],visible=pois.slice(0,5);text(c,pois.length?`高德返回 ${pois.length} 个地点${pois.length>5?' · 显示前 5 项，请细化关键词':''}`:'高德未返回匹配地点',59,270,20,C.muted);
  if(!visible.length){text(c,'可修改关键词或城市后重新搜索',800,401,28,C.white,500,'center');return;}
  visible.forEach((poi,i)=>{const y=290+i*65,valid=typeof poi.id==='string'&&poi.id.length>0&&liveCoordinate(poi.location);rr(c,55,y,1490,57,13,'#ffffff08');icon(c,'nav',83,y+27,24,valid?C.blue:C.muted);text(c,liveShort(poi.name||'未命名地点',45),111,y+20,22,C.white,500);text(c,liveShort([poi.city,poi.address].filter(Boolean).join(' · ')||'高德未提供地址',85),111,y+43,16,C.muted);icon(c,'chevron',1511,y+29,21,C.muted);env.hit(`live-poi-${i}`,55,y,1490,57,valid?{ui:{type:'select-poi',id:poi.id},page:'map-route',label:`查看${liveShort(poi.name||'未命名地点',36)}的高德路线`}:{disabled:true,reason:'该地点缺少有效编号或坐标',label:`地点不可规划：${liveShort(poi.name||'未命名地点',36)}`});});
}
function liveRoutePage(env){
  const {c,ui}=env,live=ui.liveMap,current=liveCurrentRoute(live),poi=live.selectedPoi;liveMapBase(env);rr(c,26,21,566,617,26,'#202d39');
  button(env,'route-back',48,42,102,46,'返回',{ui:{type:'back'}});text(c,'高德路线',174,67,29,C.white,600);text(c,liveShort(poi?.name||'尚未选择地点',17),57,139,30,C.white,600);text(c,`起点：${liveShort(live.origin?.name||'未指定演示起点',28)}`,57,181,17,C.muted);text(c,'展示接口路线，未获取车辆真实位置',57,213,18,C.muted);
  if(live.status==='loading'){text(c,'正在请求高德路线…',57,319,27,C.white,500);note(c,'等待接口返回，暂不可开始路线展示。',57,376,490,20);return;}
  if(live.status==='error'){text(c,'路线请求失败',57,293,28,C.white,600);note(c,liveShort(live.message||'接口未返回可用路线，请重新搜索后再试。',130),57,349,480,20);button(env,'live-route-retry',58,537,498,62,'重试高德搜索',{ui:{type:'search-map'},page:'map-search'});return;}
  const routes=Array.isArray(live.routes)?live.routes:[];
  if(!current){text(c,poi?'没有可展示的高德路线':'请先搜索并选择地点',57,315,26,C.white,500);note(c,poi?'路线需包含有效时距与轨迹；不会代替为固定模拟路线。':'选择高德地点后，将从演示起点请求驾车路线。',57,373,480,20);button(env,'route-search',58,529,498,69,'搜索高德地点',{page:'map-search'});return;}
  routes.slice(0,3).forEach((route,index)=>{const valid=liveRouteValid(route),y=247+index*81;button(env,`live-route-choice-${index}`,58,y,498,66,valid?`路线 ${index+1}   ${liveDuration(route.durationSeconds)}   ${liveDistance(route.distanceMeters)}`:`路线 ${index+1} 数据不完整`,{active:index===live.routeIndex,ui:{type:'select-route',index},disabled:!valid,reason:'路线缺少有效时距或轨迹',ariaLabel:valid?`高德路线 ${index+1}：${liveDuration(route.durationSeconds)}，${liveDistance(route.distanceMeters)}`:`高德路线 ${index+1} 不可用`});});
  button(env,'route-start',58,537,498,69,ui.routeActive?'结束路线展示':'开始路线展示',{active:!ui.routeActive,ui:setUI('routeActive',!ui.routeActive),page:'map'});
}
function liveMapPage(env){
  const {c,ui}=env,live=ui.liveMap,route=liveCurrentRoute(live);liveMapBase(env);rr(c,35,31,504,466,25,'#25394b');
  env.hit('live-map-panel',35,31,504,466,{blocking:true,label:'高德数据与路线状态'});text(c,'高德地点与路线',60,74,28,C.white,600);text(c,`城市：${liveShort(live.city||'未指定',17)}`,60,120,20,C.muted);
  if(live.status==='error'){text(c,'请求失败',60,179,29,C.white,600);note(c,liveShort(live.message||'没有收到可用高德数据，请重试。',110),60,232,448,21,C.text);button(env,'live-map-retry',60,401,453,61,'重试高德搜索',{ui:{type:'search-map'},page:'map-search'});}
  else if(live.status==='loading'){text(c,'正在请求数据…',60,191,29,C.white,500);note(c,'请等待高德接口回执；当前不会绘制旧路线。',60,250,448,21);}
  else if(route){text(c,liveShort(live.selectedPoi?.name||'所选目的地',18),60,182,27,C.white,600);text(c,`${liveDuration(route.durationSeconds)} · ${liveDistance(route.distanceMeters)}`,60,232,26,C.white,500);text(c,ui.routeActive?'路线展示进行中':'高德已返回路线',60,284,20,C.muted);note(c,'时距来自高德接口。仅展示路线，不提供实车导航。',60,326,448,19);button(env,'map-route-detail',60,406,215,56,'路线详情',{page:'map-route'});button(env,'map-route-end',291,406,222,56,ui.routeActive?'结束展示':'开始展示',{ui:setUI('routeActive',!ui.routeActive)});}
  else {text(c,live.status==='ready'?'地点数据已返回':'尚未请求地点',60,190,29,C.white,500);note(c,live.status==='ready'?'打开搜索结果，选择地点后规划路线。':'搜索地点以验证接口；启用数据模式不表示已连接成功。',60,248,448,21);button(env,'live-map-search',60,401,453,61,'搜索高德地点',{page:'map-search'});}
  button(env,'live-map-new-search',35,536,504,63,'搜索目的地',{page:'map-search'});
}
function drawSimulatedRoute(c,preference){
  const paths={recommended:[[776,505],[767,371],[944,296],[1046,213],[1308,228]],fastest:[[776,505],[950,517],[1122,506],[1097,335],[1298,240],[1308,228]],shortest:[[776,505],[942,393],[1067,340],[1216,309],[1308,228]]};
  const points=paths[preference]||paths.recommended;line(c,points,'#214365',15);line(c,points,'#85b5ed',8);circle(c,1308,228,15,'#cde0f2');
}
function mapInteractions(env){const {c,ui}=env;env.hit('map-search-field',35,31,360,151,{page:'map-search',label:'搜索目的地与查看收藏'});for(const[id,x,label,page]of[['settings',35,'导航路线设置','map-route'],['traffic',128,'路况（未接入）',null],['charge',221,'充电站（未接入）',null],['more',314,'更多导航功能','map-search'],['locate',407,'返回模拟自车位置','map']])env.hit(`map-${id}`,x,582,93,57,page?{page,label}:{disabled:true,reason:'未接入地图服务',label});env.hit('map-compass',1502,38,60,60,{disabled:true,reason:'固定示意地图视角',label:'地图朝向（示意固定）'});env.hit('map-car-card',1477,540,90,92,{page:'vehicle',label:'查看模拟车辆状态'});if(ui.routeActive&&ui.navDestination){drawSimulatedRoute(c,ui.routePreference);rr(c,35,31,431,227,25,'#25394b');env.hit('map-navigation-block',35,31,431,227,{blocking:true,label:'模拟导航信息'});text(c,'路线演示进行中',58,67,26,C.white,600);text(c,String(ui.navDestination),58,113,29,C.white);text(c,`${{recommended:'推荐',fastest:'用时较少',shortest:'距离较短'}[ui.routePreference]||'推荐'}模拟路径 · 不提供实车导航`,58,155,17,C.muted);button(env,'map-route-detail',57,190,181,46,'路线详情',{page:'map-route'});button(env,'map-route-end',253,190,186,46,'结束演示',{ui:setUI('routeActive',false)});}}
function scenesPage(env){pageFrame(env,{subtitle:'组合动作由本地引擎执行；进入前检查停车、配置和电量'});const {c,s}=env,entries=[['cinema','影院模式','展开后排屏，调整灯光和影音','play'],['rest','小憩模式','调整前排姿态与舒适环境','seat'],['camp','露营模式','调整座舱灯光与空气环境','leaf']];entries.forEach(([value,title,detail,name],i)=>{const x=56+i*507;card(c,x,179,480,354,['#425b79','#5d647d','#486c6b'][i],'#23313e');icon(c,name,x+240,281,77,'#c6dbe3');text(c,title,x+240,370,34,C.white,600,'center');text(c,detail,x+240,419,20,C.text,400,'center');button(env,`scene-${value}`,x+29,463,422,48,s.scene===value?'退出当前模式':'开启模式',{active:s.scene===value,action:s.scene===value?{domain:'scene',operation:'stop'}:{domain:'scene',operation:'start',value},disabled:value==='cinema'&&s.capabilities?.rearScreen===false,reason:'影院模式需要后排娱乐屏'});});text(c,`当前：${s.scene==='normal'?'正常模式':entries.find(e=>e[0]===s.scene)?.[1]||'未知模式'}`,59,579,25,C.text);text(c,'退出后恢复进入前保存的模拟状态；不同情景互斥',501,579,20,C.muted);button(env,'scene-exit',1271,552,265,55,'恢复正常模式',{action:{domain:'scene',operation:'stop'}});}
function displayPage(env){pageFrame(env,{sidebar:true,subtitle:'显示偏好作用于本原型；不改变实车屏幕设置'});const {c,ui}=env,brightness=limit(number(ui.brightness,80),10,100);panel(c,335,176,1199,150);rowLabel(c,'屏幕亮度',`${brightness}%`,361,211,1146);level(env,'display-brightness',361,259,1147,brightness,{min:10,max:100,step:10,uiKey:'brightness',label:'屏幕亮度'});panel(c,335,353,1199,264);text(c,'字号',360,392,27,C.white,600);segmented(env,'text-size',807,368,699,[['standard','标准'],['large','大字']],ui.textSize,v=>({ui:setUI('textSize',v)}));rr(c,361,446,1145,111,19,'#151e28');text(c,'让旅途更清晰，让操作更从容',388,501,ui.textSize==='large'?36:26,C.white);text(c,'字号预览；整体界面由宿主按偏好呈现',362,588,17,C.muted);}
function connectionPage(env){pageFrame(env,{sidebar:true,subtitle:'仅模拟连接流程，不读取设备，不调用系统蓝牙或无线网络'});const {c,ui}=env;for(const [key,title,name,index]of[['bluetooth','蓝牙','演示手机',0],['wifi','无线网络','座舱演示网络',1]]){const x=335+index*612;panel(c,x,174,585,442);text(c,title,x+25,214,29,C.white,600);button(env,`${key}-toggle`,x+351,192,207,48,ui[key]?'已开启':'已关闭',{active:ui[key],ui:setUI(key,!ui[key]),ariaLabel:`${ui[key]?'关闭':'开启'}${title}（模拟）`});text(c,ui[key]?'可用演示设备':'开启后显示演示设备',x+25,287,22,C.muted);if(ui[key]){rr(c,x+23,326,539,151,20,'#ffffff08');icon(c,key==='bluetooth'?'phone':'signal',x+54,365,32,C.blue);text(c,name,x+85,365,26,C.white,500);text(c,ui[key==='bluetooth'?'bluetoothDevice':'wifiNetwork']===name?'模拟已连接':'模拟设备 · 不扫描真实环境',x+85,407,18,C.muted);button(env,`${key}-device`,x+269,499,292,56,ui[key==='bluetooth'?'bluetoothDevice':'wifiNetwork']===name?'断开模拟连接':'连接演示设备',{ui:setUI(key==='bluetooth'?'bluetoothDevice':'wifiNetwork',ui[key==='bluetooth'?'bluetoothDevice':'wifiNetwork']===name?null:name)});}else text(c,'未扫描任何真实设备',x+25,370,20,C.muted);}}
function aboutPage(env){pageFrame(env,{sidebar:true,subtitle:'关于本项目与资料范围'});const {c,ui}=env;panel(c,335,173,1197,442);text(c,'G9 座舱实验室',365,222,40,C.white,600);text(c,'开源原型 · 0.1 系列',365,276,23,C.muted);note(c,'根据公开使用说明书与车辆资料，原创绘制座舱和车机界面。不是原厂系统，不接入原生小艺，不连接真实车辆。',366,334,1100,24,C.text);note(c,'参考版本：G9OM26C1。页面结构有手册图例支持；没有完整截图的设置页按公开功能路径改编。',366,426,1100,21,C.muted);note(c,ui.liveMap?.enabled===true?'高德接口已配置，结果以实际返回为准。车辆动作来自本地仿真，曲目和设备仍为演示。':'地图、曲目、设备与路线数据用于流程演示。操作回执来自本地仿真引擎。',366,508,1100,21,C.muted);button(env,'about-home',1125,549,376,43,'返回桌面',{page:'home'});}
function feedbackOverlay(env){
  const feedback=env.ui.feedback;if(!feedback)return;const {c}=env,status=feedback.status||'info',targetNeeded=feedback.pendingKind==='target';
  const title=feedback.title||(status==='clarify'?(targetNeeded?'请选择控制对象':'请确认操作'):status==='success'?'操作完成':'操作提示'),message=String(feedback.message||'');
  if(status==='clarify'){
    env.clearHits();rr(c,0,0,W,H,0,'#03080dba');rr(c,386,163,828,419,29,'#2b3948');text(c,title,425,216,33,C.white,600);note(c,message.slice(0,90),426,276,744,24,C.text);
    if(targetNeeded){[['主驾',425,335],['副驾',815,335],['二排左侧',425,400],['二排右侧',815,400]].forEach(([command,x,y])=>button(env,'feedback-target-'+command,x,y,362,53,command,{command}));button(env,'feedback-cancel',425,493,751,51,'取消',{command:'取消'});}
    else{button(env,'feedback-cancel',425,462,347,64,'取消',{command:'取消'});button(env,'feedback-confirm',793,462,383,64,'确认',{command:'确认',active:true});}return;
  }
  const error=['error','blocked','unsupported'].includes(status),color=error?'#60423c':'#30465c';rr(c,407,62,785,98,19,color);text(c,title,432,92,22,C.white,600);text(c,message.length>38?message.slice(0,38)+'…':message,432,126,18,C.text);env.hit('feedback-block',407,62,785,98,{blocking:true,label:'操作反馈'});button(env,'feedback-dismiss',1114,75,61,64,'关闭',{ui:setUI('feedback',null),ariaLabel:'关闭操作反馈'});
}
