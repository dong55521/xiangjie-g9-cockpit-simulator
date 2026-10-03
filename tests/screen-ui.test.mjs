import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { paintVehicleScreen, SCREEN_PAGES, SCREEN_PAGE_LABELS, SCREEN_SOURCES } from '../screen-ui.js';
import { CabinScene } from '../scene.js';
import { createInitialState, performAction, executeCommand } from '../engine.js';

function canvasMock(width=1600,height=720) {
  const drawnText=[];
  const c={drawnText,createLinearGradient:()=>({addColorStop(){}}),createRadialGradient:()=>({addColorStop(){}}),fillText(value){drawnText.push(String(value));}};
  for(const name of ['save','restore','setTransform','clearRect','fillRect','beginPath','roundRect','fill','stroke','moveTo','lineTo','arc','ellipse','translate','scale','rotate','quadraticCurveTo','bezierCurveTo','closePath','setLineDash'])c[name]=()=>{};
  c.paths=[];c.fills=[];let points=[];c.beginPath=()=>{points=[];};c.moveTo=(x,y)=>points.push([x,y]);c.lineTo=(x,y)=>points.push([x,y]);c.stroke=()=>c.paths.push({color:c.strokeStyle,points:points.map(p=>[...p])});c.fill=()=>c.fills.push(c.fillStyle);
  return {width,height,getContext:()=>c,context:c};
}
function freeze(value) {
  if(value && typeof value==='object'){Object.freeze(value);for(const child of Object.values(value))freeze(child);}return value;
}
const close=(actual,expected,message)=>assert.ok(Math.abs(actual-expected)<1e-8,message||`${actual} ≈ ${expected}`);

for(const page of ['home','map','vehicle','climate']) {
  test(`大屏 ${page} 页的控制热区进入现有引擎，四个页面均可切换`,()=>{
    const state=freeze(createInitialState()),before=structuredClone(state);
    const result=paintVehicleScreen(canvasMock(),'navigation',state,{page});
    assert.equal(result.page,page);assert.equal(result.simulated,true);assert.ok(result.sourcePages.length);
    const destinations=new Set(result.hitRegions.map(region=>region.page).filter(Boolean));
    for(const destination of ['home','map','vehicle','climate'])assert.ok(destinations.has(destination),`${page} 缺少 ${destination} 入口`);
    const regions=result.hitRegions.filter(region=>region.action);assert.ok(regions.length>0);
    for(const region of regions){
      let receipt=performAction(region.action,state);
      if(receipt.status==='clarify'){
        assert.equal(receipt.pending?.kind,'confirm',`${region.id}: ${receipt.message}`);
        assert.deepEqual(receipt.state,state,'待确认动作不得提前改变车态');
        receipt=executeCommand('确认',receipt.state,receipt.context);
      }
      assert.equal(receipt.status,'success',`${page}/${region.id}: ${receipt.message}`);
    }
    assert.deepEqual(state,before,'绘制与热区执行不得修改输入状态');
  });
}

test('各类屏幕只读车态；温度显示和加减动作读取最新状态',()=>{
  const initial=createInitialState();initial.climate.driver=19.5;initial.climate.passenger=27;
  const state=freeze(initial),before=structuredClone(state);
  for(const type of ['instrument','navigation','passenger','rear']){
    const canvas=canvasMock();paintVehicleScreen(canvas,type,state,{page:'climate'});
    if(['navigation','passenger'].includes(type)){
      assert.ok(canvas.context.drawnText.includes('19.5°'));
      assert.ok(canvas.context.drawnText.includes('27.0°'));
    }
  }
  const first=paintVehicleScreen(canvasMock(),'navigation',state,{page:'climate'});
  const up=first.hitRegions.find(region=>region.id==='temperature-driver-up');
  const next=performAction(up.action,state);assert.equal(next.state.climate.driver,20.5);
  const canvas=canvasMock();const redrawn=paintVehicleScreen(canvas,'navigation',next.state,{page:'climate'});
  assert.ok(canvas.context.drawnText.includes('20.5°'));
  assert.equal(redrawn.hitRegions.find(region=>region.id==='temperature-driver-up').action.value,21.5);
  assert.deepEqual(state,before);
});

test('温度边界上的加减动作始终处于引擎支持范围',()=>{
  const state=createInitialState();state.climate.driver=16;state.climate.passenger=30;
  const result=paintVehicleScreen(canvasMock(),'navigation',state,{page:'climate'});
  for(const region of result.hitRegions.filter(region=>region.action?.domain==='temperature')){
    assert.ok(region.action.value>=16&&region.action.value<=30);
    assert.equal(performAction(region.action,state).status,'success');
  }
});

test('热区使用画布像素，宽高独立缩放后仍在画布内',()=>{
  const state=createInitialState();
  for(const page of ['home','map','vehicle','climate']){
    const full=paintVehicleScreen(canvasMock(1600,720),'navigation',state,{page});
    const small=paintVehicleScreen(canvasMock(768,384),'navigation',state,{page});
    assert.equal(small.hitRegions.length,full.hitRegions.length);
    small.hitRegions.forEach((region,index)=>{
      const original=full.hitRegions[index];assert.equal(region.id,original.id);
      for(const key of ['x','width'])close(region[key],original[key]*768/1600);
      for(const key of ['y','height'])close(region[key],original[key]*384/720);
      assert.ok(region.x>=0&&region.y>=0&&region.x+region.width<=768.0001&&region.y+region.height<=384.0001);
      assert.deepEqual(region.action,original.action);
    });
  }
});

function hitFixture() {
  const cabin=Object.create(CabinScene.prototype),root=new THREE.Group();
  const camera=new THREE.PerspectiveCamera(60,4/3,.025,20);camera.lookAt(0,0,-1);camera.updateMatrixWorld(true);
  const canvas=canvasMock(768,384),ref={type:'navigation',canvas,hitRegions:paintVehicleScreen(canvas,'navigation',createInitialState()).hitRegions};
  const screen=new THREE.Mesh(new THREE.PlaneGeometry(2,1),new THREE.MeshBasicMaterial());screen.position.z=-2;screen.userData.displayRef=ref;root.add(screen);
  Object.assign(cabin,{camera,vehicle:{root},raycaster:new THREE.Raycaster(),pointer:new THREE.Vector2(),xray:false,refs:{shade:{root:new THREE.Group()}},renderer:{domElement:{getBoundingClientRect:()=>({left:19,top:43,width:400,height:300})}}});
  const seat=new THREE.Group();seat.userData={target:'driver',domain:'seat'};root.add(seat);
  root.updateMatrixWorld(true);
  return {cabin,root,seat,screen,ref,event:{clientX:219,clientY:193}};
}
function expectScreen(fixture) {
  fixture.root.updateMatrixWorld(true);
  const hit=fixture.cabin.hit(fixture.event);assert.equal(hit?.display,fixture.ref);close(hit.uv.x,.5);close(hit.uv.y,.5);return hit;
}

test('屏幕不被座椅装饰缝线的默认一米拾取半径抢占',()=>{
  const fixture=hitFixture();
  const geometry=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(.25,0,-.2),new THREE.Vector3(.45,0,-.2)]);
  const seam=new THREE.LineSegments(geometry,new THREE.LineBasicMaterial());fixture.seat.add(seam);
  expectScreen(fixture);
  // 保留默认宽阈值，证明命中列表确实包含更近的缝线，而不是因未命中而假通过。
  const raw=fixture.cabin.raycaster.intersectObject(fixture.root,true);
  assert.equal(raw[0].object,seam);assert.ok(raw[0].distance<2);
});

test('屏幕不被装饰点云抢占',()=>{
  const fixture=hitFixture();
  const geometry=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,0,-.5)]);
  const points=new THREE.Points(geometry,new THREE.PointsMaterial());fixture.seat.add(points);
  expectScreen(fixture);assert.equal(fixture.cabin.raycaster.intersectObject(fixture.root,true)[0].object,points);
});

for(const opacity of [0,.005])test(`普通车内视角跳过透明度 ${opacity} 的座椅光效`,()=>{
  const fixture=hitFixture();
  const effect=new THREE.Mesh(new THREE.PlaneGeometry(2,1),new THREE.MeshBasicMaterial({transparent:true,opacity,depthWrite:false}));effect.position.z=-.5;fixture.seat.add(effect);
  expectScreen(fixture);assert.equal(fixture.cabin.raycaster.intersectObject(fixture.root,true)[0].object,effect);
});

test('隐藏祖先下的模型不遮挡屏幕点击',()=>{
  const fixture=hitFixture();fixture.seat.visible=false;
  const mesh=new THREE.Mesh(new THREE.PlaneGeometry(2,1),new THREE.MeshBasicMaterial());mesh.position.z=-.5;fixture.seat.add(mesh);expectScreen(fixture);
});

test('修复透明光效后，真正不透明的座椅仍能阻挡并被选中',()=>{
  const fixture=hitFixture();
  const mesh=new THREE.Mesh(new THREE.PlaneGeometry(2,1),new THREE.MeshBasicMaterial());mesh.position.z=-.5;fixture.seat.add(mesh);fixture.root.updateMatrixWorld(true);
  assert.deepEqual(fixture.cabin.hit(fixture.event),{target:'driver',domain:'seat'});
});

test('非等比装配缩放与位移不改变屏幕 UV 命中',()=>{
  const fixture=hitFixture();fixture.root.scale.set(.76,.70,.68);fixture.root.position.set(0,.09,.30);fixture.root.updateMatrixWorld(true);
  const center=fixture.screen.getWorldPosition(new THREE.Vector3());fixture.cabin.camera.position.set(0,.4,1);fixture.cabin.camera.lookAt(center);fixture.cabin.camera.updateMatrixWorld(true);expectScreen(fixture);
});

test('屏幕 UV 正确翻转纵轴并分发页切换及温度动作',()=>{
  const fixture=hitFixture(),pages=[],actions=[];
  fixture.cabin.setScreenPage=page=>pages.push(page);fixture.cabin.onScreenAction=action=>actions.push(action);
  for(const id of ['dock-climate','temperature-driver-up']){
    const region=fixture.ref.hitRegions.find(item=>item.id===id);assert.ok(region);
    const uv=new THREE.Vector2((region.x+region.width/2)/fixture.ref.canvas.width,1-(region.y+region.height/2)/fixture.ref.canvas.height);
    fixture.cabin.activateScreen(fixture.ref,uv);
  }
  assert.deepEqual(pages,['climate']);assert.equal(actions.length,1);
  const result=performAction(actions[0],createInitialState());assert.equal(result.status,'success');assert.equal(result.state.climate.driver,25);
});


const render=(page,ui={},state=createInitialState(),canvas=canvasMock())=>paintVehicleScreen(canvas,'navigation',state,{page,ui});
const hitById=(result,id)=>{const hit=result.hitRegions.find(region=>region.id===id);assert.ok(hit,`缺少 ${id}`);return hit;};
const topHit=(result,x,y)=>[...result.hitRegions].reverse().find(r=>x>=r.x&&x<=r.x+r.width&&y>=r.y&&y<=r.y+r.height);

test('20 个一级二级页面均从桌面可达，并提供唯一中文控件名称与手册依据',()=>{
  assert.equal(SCREEN_PAGES.length,20);const found=new Set(),pending=['home'];
  while(pending.length){const page=pending.shift();if(found.has(page))continue;found.add(page);const result=render(page);
    assert.ok(SCREEN_PAGE_LABELS[page]);assert.deepEqual(result.sourcePages,SCREEN_SOURCES[page]);
    const ids=new Set(),labels=new Set();
    for(const region of result.hitRegions){assert.ok(!ids.has(region.id),`${page} 重复 id`);ids.add(region.id);assert.ok(!labels.has(region.label),`${page} 重复 label`);labels.add(region.label);assert.match(region.label,/[一-鿿]/);
      if(region.page){assert.ok(SCREEN_PAGES.includes(region.page));pending.push(region.page);}
      if(region.disabled){assert.ok(region.reason);assert.ok(!region.action&&!region.command&&!region.ui&&!region.range&&!region.page,'禁用控件不能携带可执行行为');}
    }
  }
  assert.deepEqual([...found].sort(),[...SCREEN_PAGES].sort());
});

test('每页绘制均只读车态与界面偏好，所有活动车辆动作符合引擎契约',()=>{
  const state=freeze(createInitialState()),ui=freeze({seatTarget:'rearRight',doorTarget:'passenger',navDestination:'东湖公园',bluetooth:true,wifi:true,bluetoothDevice:'演示手机',wifiNetwork:'座舱演示网络'}),before=structuredClone({state,ui});
  let count=0;
  for(const page of SCREEN_PAGES){const result=render(page,ui,state);for(const region of result.hitRegions){if(!region.action)continue;const receipt=performAction(region.action,state);assert.ok(['success','clarify','blocked'].includes(receipt.status),`${page}/${region.id}: ${receipt.status} ${receipt.message}`);count++;}}
  assert.ok(count>150);assert.deepEqual({state,ui},before);
});

test('所有二级页面在非等比例画布中保留控件坐标与行为，热区不越界',()=>{
  for(const page of SCREEN_PAGES){const ui={navDestination:'湖畔营地',bluetooth:true,wifi:true},full=render(page,ui,createInitialState(),canvasMock()),small=render(page,ui,createInitialState(),canvasMock(999,423));
    assert.equal(full.hitRegions.length,small.hitRegions.length);small.hitRegions.forEach((r,i)=>{const f=full.hitRegions[i];assert.equal(r.id,f.id);for(const k of ['x','width'])close(r[k],f[k]*999/1600);for(const k of ['y','height'])close(r[k],f[k]*423/720);assert.ok(r.x>=0&&r.y>=0&&r.x+r.width<=999.0001&&r.y+r.height<=423.0001,`${page}/${r.id} 越界`);for(const k of ['action','ui','range','command','page'])assert.deepEqual(r[k],f[k]);});
  }
});

test('连续滑条保留音量 35 与任意整值亮度，动作端点可以进入引擎',()=>{
  const state=createInitialState();state.media.volume=35;
  for(const page of ['media','sound','display','lights','climate-rear']){const result=render(page,{brightness:63,ambientBrightness:47},state),ranges=result.hitRegions.filter(r=>r.range);assert.ok(ranges.length);
    for(const {range}of ranges){assert.equal((range.value-range.min)%range.step,0,`${page} 当前值必须落在合法步长`);assert.ok(range.value>=range.min&&range.value<=range.max);assert.ok(Boolean(range.action)!==Boolean(range.key));if(range.action){assert.ok(!('value'in range.action));for(const value of [range.min,range.value,range.max])assert.equal(performAction({...range.action,value},state).status,'success');}}
  }
  assert.equal(hitById(render('media',{},state),'media-volume-range').range.value,35);
  assert.equal(hitById(render('media',{},state),'media-volume-plus').action.value,45,'步进按钮仍按 10 调节');
});

test('座椅触屏前后与语音方向一致，各舒适度按钮提供明确目标名称',()=>{
  const state=createInitialState(),page=render('seats',{seatTarget:'rearRight'},state);
  const forward=performAction(hitById(page,'seat-forward').action,state),backward=performAction(hitById(page,'seat-backward').action,state);
  assert.ok(forward.state.seats.rearRight.position>state.seats.rearRight.position);assert.ok(backward.state.seats.rearRight.position<state.seats.rearRight.position);
  assert.ok(executeCommand('二排右座椅向前移动',state).state.seats.rearRight.position>state.seats.rearRight.position);
  assert.ok(executeCommand('二排右座椅向后移动',state).state.seats.rearRight.position<state.seats.rearRight.position);
  assert.equal(hitById(page,'seat-heat-2').label,'二排右加热：2 挡');assert.equal(hitById(page,'seat-vent-2').label,'二排右通风：2 挡');
});

test('第三排能力边界在绘制层禁用通风按摩，保留加热阅读灯',()=>{
  const page=render('seats',{seatTarget:'thirdLeft'});
  for(const id of ['seat-vent-0','seat-vent-1','seat-vent-2','seat-vent-3','seat-massage']){const r=hitById(page,id);assert.equal(r.disabled,true);assert.equal(r.action,undefined);assert.ok(r.reason);}
  assert.equal(hitById(page,'seat-heat-2').action.target,'thirdLeft');assert.equal(hitById(page,'seat-reading').action.target,'thirdLeft');
});

test('连接页分别描述蓝牙和无线网络，不以共享设备键覆盖连接',()=>{
  const ui={bluetooth:true,wifi:true,bluetoothDevice:'演示手机',wifiNetwork:'座舱演示网络'},both=render('connection',ui);
  assert.deepEqual(hitById(both,'bluetooth-device').ui,{type:'set',key:'bluetoothDevice',value:null});assert.deepEqual(hitById(both,'wifi-device').ui,{type:'set',key:'wifiNetwork',value:null});
  const reconnect=render('connection',{...ui,bluetoothDevice:null});assert.equal(hitById(reconnect,'bluetooth-device').ui.value,'演示手机');assert.equal(hitById(reconnect,'wifi-device').ui.value,null);
  assert.ok(!both.hitRegions.some(r=>r.ui?.key==='networkDevice'));
});

test('模拟地点搜索筛选、选择目的地、规划与开始结束路径完整',()=>{
  const all=render('map-search');assert.equal(all.hitRegions.filter(r=>r.id.startsWith('search-result-')).length,3);
  const results=render('map-search',{navQuery:'公园'}).hitRegions.filter(r=>r.id.startsWith('search-result-'));assert.equal(results.length,1);assert.deepEqual(results[0].ui,{type:'set',key:'navDestination',value:'东湖公园'});assert.equal(results[0].page,'map-route');
  assert.equal(render('map-search',{navQuery:'无匹配'}).hitRegions.filter(r=>r.id.startsWith('search-result-')).length,0);
  const route=render('map-route',{navDestination:'东湖公园'});assert.equal(hitById(route,'route-start').page,'map');assert.deepEqual(hitById(route,'route-start').ui,{type:'set',key:'routeActive',value:true});
  const active=render('map',{navDestination:'东湖公园',routeActive:true});assert.deepEqual(hitById(active,'map-route-end').ui,{type:'set',key:'routeActive',value:false});
});

test('三种模拟路线具有不同折线路径，导航信息卡阻止底层搜索点击',()=>{
  const routes=[];
  for(const routePreference of ['recommended','fastest','shortest']){const canvas=canvasMock(),result=render('map',{routePreference,navDestination:'东湖公园',routeActive:true},createInitialState(),canvas);routes.push(canvas.context.paths.filter(p=>p.color==='#85b5ed').map(p=>p.points));assert.ok(canvas.context.fills.includes('#25394b'),'导航卡应为不透明背景');assert.equal(topHit(result,100,70).id,'map-navigation-block');assert.equal(topHit(result,100,70).blocking,true);assert.equal(topHit(result,100,213).id,'map-route-detail');}
  assert.equal(new Set(routes.map(r=>JSON.stringify(r))).size,3);
});

test('开门待确认弹层只返回确认取消；取消不改变车态，确认执行同一动作',()=>{
  const state=createInitialState(),pending=performAction({domain:'door',target:'driver',operation:'open'},state);assert.equal(pending.status,'clarify');
  const result=render('doors',{feedback:{status:pending.status,message:pending.message,pendingKind:pending.pending.kind}},pending.state);
  assert.deepEqual(result.hitRegions.map(r=>r.command),['取消','确认']);assert.ok(result.hitRegions.every(r=>!r.action&&!r.page&&!r.ui&&!r.range));assert.equal(topHit(result,60,600),undefined);
  assert.deepEqual(executeCommand('取消',pending.state,pending.context).state,state);assert.equal(executeCommand('确认',pending.state,pending.context).state.doors.driver,true);
});

test('对象澄清弹层可选择四个座位，不能用确认假装解决缺失对象',()=>{
  const result=render('doors',{feedback:{status:'clarify',message:'请说明要控制哪个位置',pendingKind:'target'}});
  assert.deepEqual(result.hitRegions.map(r=>r.command),['主驾','副驾','二排左侧','二排右侧','取消']);assert.ok(result.hitRegions.every(r=>!r.action&&!r.page&&!r.ui&&!r.range));assert.equal(topHit(result,60,600),undefined);
});

test('未接入的风向和地图服务有明确禁用原因，反馈框遮挡底层并可关闭',()=>{
  const climate=render('climate');for(let i=0;i<3;i++){const r=hitById(climate,`climate-airflow-${i}`);assert.equal(r.disabled,true);assert.match(r.label,/仅示意/);}
  for(const id of ['map-traffic','map-charge','map-compass'])assert.equal(hitById(render('map'),id).disabled,true);
  const result=render('home',{feedback:{status:'success',title:'操作完成',message:'模拟车辆已更新'}});assert.equal(topHit(result,440,90).blocking,true);assert.deepEqual(hitById(result,'feedback-dismiss').ui,{type:'set',key:'feedback',value:null});
});

// 接口形状 fixture（测试数据），不代表已经调用或验证高德在线服务。
function liveFixture(overrides={}) {
  const poi={id:'fixture-poi-1',name:'接口测试目的地',address:'用于绘图测试的地址',city:'杭州',location:[120.168,30.245]};
  return {enabled:true,status:'ready',message:'',pois:[poi],selectedPoi:poi,routes:[{id:'route-one',distanceMeters:12345,durationSeconds:2212,polyline:[[120.212,30.291],[120.20,30.28],[120.18,30.275],[120.168,30.245]]},{id:'route-two',distanceMeters:13620,durationSeconds:1941,polyline:[[120.212,30.291],[120.218,30.269],[120.196,30.256],[120.168,30.245]]}],routeIndex:0,origin:{name:'杭州东站（演示起点）',location:[120.212,30.291]},city:'杭州',...overrides};
}
const routeDrawing=canvas=>canvas.context.paths.filter(path=>path.color==='#86c3ff');

test('高德搜索呈现接口 POI 并发出 select-poi，不混入虚构地点',()=>{
  const canvas=canvasMock(),page=render('map-search',{navQuery:'测试',liveMap:liveFixture()},createInitialState(),canvas);
  const poi=hitById(page,'live-poi-0');assert.deepEqual(poi.ui,{type:'select-poi',id:'fixture-poi-1'});assert.equal(poi.page,'map-route');assert.deepEqual(hitById(page,'search-submit').ui,{type:'search-map'});assert.equal(hitById(page,'search-input').label,'搜索高德目的地');
  assert.ok(canvas.context.drawnText.includes('接口测试目的地'));assert.ok(!canvas.context.drawnText.some(t=>t.includes('东湖公园')||t.includes('8.6 公里')||t.includes('虚构地点')));
});

test('高德路线使用接口时距与 select-route，只有有效路线才能开始展示',()=>{
  const canvas=canvasMock(),page=render('map-route',{liveMap:liveFixture()},createInitialState(),canvas);
  assert.match(hitById(page,'live-route-choice-0').label,/37 分钟，12.3 公里/);assert.deepEqual(hitById(page,'live-route-choice-1').ui,{type:'select-route',index:1});assert.deepEqual(hitById(page,'route-start').ui,{type:'set',key:'routeActive',value:true});
  assert.ok(canvas.context.drawnText.some(t=>t.includes('演示起点')));assert.ok(canvas.context.drawnText.includes('高德地点/路线 · 示意底图 · 演示起点，未定位'));
  for(const status of ['idle','loading','error']){const result=render('map-route',{liveMap:liveFixture({status,message:'接口测试失败'})});assert.ok(!result.hitRegions.some(r=>r.ui?.key==='routeActive'),'未成功返回不得开始');}
  assert.ok(!render('map-route',{liveMap:liveFixture({routes:[]})}).hitRegions.some(r=>r.id==='route-start'));
});

test('高德加载或失败时不沿用旧路线和旧 POI，提供明确错误与重试',()=>{
  for(const status of ['loading','error'])for(const name of ['map','map-search','map-route']){const canvas=canvasMock(),page=render(name,{routeActive:true,liveMap:liveFixture({status,message:'高德鉴权失败：测试消息'})},createInitialState(),canvas);
    assert.equal(routeDrawing(canvas).length,0,`${name}/${status} 不绘旧路线`);assert.ok(!page.hitRegions.some(r=>r.ui?.type==='select-poi'||r.ui?.type==='select-route'||r.ui?.key==='routeActive'));
    if(status==='error'){assert.ok(canvas.context.drawnText.some(t=>t.includes('高德鉴权失败')));assert.ok(page.hitRegions.some(r=>r.ui?.type==='search-map'));}
  }
});

test('高德折线按所选路线拟合并保持比例，投影点全部位于绘图区',()=>{
  const paths=[];for(const routeIndex of [0,1]){const canvas=canvasMock();render('map',{routeActive:true,liveMap:liveFixture({routeIndex})},createInitialState(),canvas);const [drawing]=routeDrawing(canvas);assert.ok(drawing);assert.equal(drawing.points.length,4);paths.push(drawing.points);for(const[x,y]of drawing.points){assert.ok(Number.isFinite(x)&&Number.isFinite(y));assert.ok(x>=665-.001&&x<=1455.001&&y>=137-.001&&y<=497.001);}}
  assert.notDeepEqual(paths[0],paths[1]);
});

test('异常时距或经纬度不会绘假路线，退回高德搜索而非本地模拟',()=>{
  const original=liveFixture().routes[0];for(const change of [{distanceMeters:NaN},{distanceMeters:0},{durationSeconds:0},{durationSeconds:-1},{polyline:[]},{polyline:[[120,30]]},{polyline:[[181,30],[120,30]]},{polyline:[[120,91],[120,30]]},{polyline:[[120,30],[Infinity,30]]}]){
    const canvas=canvasMock(),page=render('map-route',{liveMap:liveFixture({routes:[{...original,...change}]})},createInitialState(),canvas);assert.equal(routeDrawing(canvas).length,0);assert.ok(!page.hitRegions.some(r=>r.id==='route-start'));assert.equal(hitById(page,'route-search').page,'map-search');assert.ok(!canvas.context.drawnText.some(t=>t.includes('东湖公园')));
  }
});

test('高德搜索空结果和缺坐标地点明确不可规划，列表最多5项且不越界',()=>{
  const empty=canvasMock();const blank=render('map-search',{liveMap:liveFixture({pois:[]})},createInitialState(),empty);assert.ok(empty.context.drawnText.includes('高德未返回匹配地点'));assert.ok(!blank.hitRegions.some(r=>r.ui?.type==='select-poi'));
  const pois=Array.from({length:9},(_,i)=>({...liveFixture().pois[0],id:`fixture-${i}`,name:`测试地点${i}`,location:i===0?null:[120.2,30.2]})),canvas=canvasMock(),page=render('map-search',{liveMap:liveFixture({pois})},createInitialState(),canvas);
  assert.equal(page.hitRegions.filter(r=>r.id.startsWith('live-poi-')).length,5);assert.equal(hitById(page,'live-poi-0').disabled,true);assert.ok(!hitById(page,'live-poi-0').ui);assert.ok(canvas.context.drawnText.some(t=>t.includes('显示前 5 项')));for(const r of page.hitRegions)assert.ok(r.y+r.height<=720&&r.x+r.width<=1600);
});

test('高德三页各状态只读输入，在不同画布比例下保留事件契约',()=>{
  for(const status of ['idle','loading','ready','error'])for(const page of ['map','map-search','map-route']){const ui=freeze({navQuery:'测试',routeActive:true,liveMap:liveFixture({status,message:'接口错误'})}),state=freeze(createInitialState()),before=structuredClone({ui,state}),full=render(page,ui,state),small=render(page,ui,state,canvasMock(800,500));
    assert.deepEqual({ui,state},before);assert.equal(full.hitRegions.length,small.hitRegions.length);small.hitRegions.forEach((r,i)=>{const f=full.hitRegions[i];for(const key of ['x','width'])close(r[key],f[key]/2);for(const key of ['y','height'])close(r[key],f[key]*500/720);assert.deepEqual(r.ui,f.ui);assert.deepEqual(r.page,f.page);});
    assert.equal(new Set(full.hitRegions.map(r=>r.label)).size,full.hitRegions.length);
  }
});

test('启用高德不宣称在线已连接，未启用时保留原本模拟功能',()=>{
  const canvas=canvasMock();render('map-search',{liveMap:liveFixture({status:'idle'})},createInitialState(),canvas);assert.ok(canvas.context.drawnText.some(t=>t.includes('以接口回执为准')));assert.ok(!canvas.context.drawnText.some(t=>t.includes('已连接成功')));
  const simulation=render('map-search',{liveMap:{enabled:false,status:'error'}});assert.equal(simulation.hitRegions.filter(r=>r.id.startsWith('search-result-')).length,3);
});

test('关于页仅声明高德配置状态，不将配置成功或错误回执说成连通',()=>{
  const canvas=canvasMock();render('about',{liveMap:liveFixture({status:'error',message:'10009'})},createInitialState(),canvas);assert.ok(canvas.context.drawnText.some(t=>t.includes('高德接口已配置，结果以实际返回为准')));assert.ok(!canvas.context.drawnText.some(t=>t.includes('高德已连通')||t.includes('高德已验证')));
});
