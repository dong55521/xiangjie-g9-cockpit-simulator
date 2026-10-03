import test from 'node:test';
import assert from 'node:assert/strict';
import {ScreenSession} from '../screen-session.js';
import {createInitialState,performAction,executeCommand} from '../engine.js';
import {CabinScene} from '../scene.js';
const setup=()=>new ScreenSession(['home','apps','settings','seats','doors','map','map-search','map-route']);

test('首页进入设置与座椅，再逐级返回；首页清理历史而非无限堆叠',()=>{
  const s=setup();s.navigate('settings');s.navigate('seats');s.dispatch({type:'set',key:'seatTarget',value:'rearRight'});
  s.dispatch({type:'back'});assert.equal(s.page,'settings');assert.equal(s.ui.seatTarget,'rearRight');
  s.dispatch({type:'back'});assert.equal(s.page,'home');s.dispatch({type:'back'});assert.equal(s.page,'home');
  s.navigate('apps');s.navigate('seats');s.navigate('home');assert.deepEqual(s.history,['home']);
});
test('开门确认未完成时，屏内跳转与偏好操作不能覆盖确认；确认后才开门',()=>{
  const s=setup(),before=createInitialState();s.navigate('doors');
  const pending=performAction({domain:'door',target:'driver',operation:'open'},before);s.setFeedback(pending);
  assert.equal(s.navigate('home'),false);assert.equal(s.dispatch({type:'back'}),false);assert.equal(s.dispatch({type:'set',key:'brightness',value:40}),false);
  assert.equal(pending.state.doors.driver,false);const done=executeCommand('确认',pending.state,pending.context);
  s.setFeedback(done);assert.equal(done.state.doors.driver,true);assert.equal(s.navigate('home'),true);
});
test('取消确认保留车态并允许返回；切换目标之后使用新目标',()=>{
  const s=setup();s.navigate('doors');const before=createInitialState();
  const pending=performAction({domain:'door',target:'driver',operation:'open'},before);s.setFeedback(pending);
  const cancelled=executeCommand('取消',pending.state,pending.context);s.setFeedback(cancelled);
  assert.deepEqual(cancelled.state,before);assert.equal(s.dispatch({type:'set',key:'doorTarget',value:'rearLeft'}),true);
  const next=performAction({domain:'door',target:s.ui.doorTarget,operation:'open'},cancelled.state,cancelled.context);
  assert.equal(next.pending.actions[0].target,'rearLeft');
});
test('导航演示需要目的地；更换目的地会结束旧路线，不制造真实导航状态',()=>{
  const s=setup();assert.equal(s.dispatch({type:'set',key:'routeActive',value:true}),false);
  s.dispatch({type:'set',key:'navQuery',value:'公园'});s.dispatch({type:'set',key:'navDestination',value:'东湖公园'});s.navigate('map-route');
  assert.equal(s.dispatch({type:'set',key:'routeActive',value:true}),true);assert.equal(s.ui.routeActive,true);
  s.dispatch({type:'set',key:'navDestination',value:'中央美术馆'});assert.equal(s.ui.routeActive,false);
  s.dispatch({type:'set',key:'navDestination',value:null});assert.equal(s.ui.navDestination,null);
});
test('界面设置拒绝未知键、非法枚举、越界数字和伪造路线参数',()=>{
  const s=setup();const initial=structuredClone(s.ui);
  for(const [key,value]of [['__proto__',{}],['brightness',Infinity],['brightness',0],['ambientBrightness',101],['seatTarget','unknown'],['doorTarget','thirdLeft'],['wifi','true'],['textSize','giant'],['navQuery','x'.repeat(65)]])assert.equal(s.dispatch({type:'set',key,value}),false);
  assert.deepEqual(s.ui,initial);assert.equal(s.navigate('missing'),false);
});
test('重置清理本地偏好、历史、反馈；会话之间互不污染',()=>{
  const a=setup(),b=setup();a.navigate('seats');a.dispatch({type:'set',key:'brightness',value:40});a.setFeedback({status:'blocked',message:'未执行'});
  assert.equal(b.page,'home');assert.equal(b.ui.brightness,80);a.reset();assert.deepEqual(a.ui,b.ui);assert.deepEqual(a.history,['home']);
});
test('关闭模拟蓝牙清空模拟配对对象，并保持车辆状态独立',()=>{
  const s=setup(),car=createInitialState(),before=structuredClone(car);
  s.dispatch({type:'set',key:'bluetooth',value:true});s.dispatch({type:'set',key:'networkDevice',value:'演示手机'});
  s.dispatch({type:'set',key:'bluetooth',value:false});assert.equal(s.ui.networkDevice,null);assert.deepEqual(car,before);
});
test('蓝牙与无线网络可同时保持模拟连接，关闭其中一个不影响另一个',()=>{
  const s=setup();assert.equal(s.dispatch({type:'set',key:'wifiNetwork',value:'座舱演示网络'}),false);
  for(const [key,value]of [['bluetooth',true],['bluetoothDevice','演示手机'],['wifi',true],['wifiNetwork','座舱演示网络']])assert.equal(s.dispatch({type:'set',key,value}),true);
  assert.equal(s.ui.bluetoothDevice,'演示手机');assert.equal(s.ui.wifiNetwork,'座舱演示网络');
  s.dispatch({type:'set',key:'bluetooth',value:false});assert.equal(s.ui.bluetoothDevice,null);assert.equal(s.ui.wifiNetwork,'座舱演示网络');
  s.dispatch({type:'set',key:'wifi',value:false});assert.equal(s.ui.wifiNetwork,null);
});
test('目标追问保留类型，普通反馈可关闭，待确认反馈不可绕过',()=>{
  const s=setup(),car=createInitialState();car.speaker='unknown';const r=executeCommand('打开车窗',car,{});
  assert.equal(r.pending.kind,'target');s.setFeedback(r);assert.equal(s.ui.feedback.pendingKind,'target');
  assert.equal(s.dispatch({type:'set',key:'feedback',value:null}),false);
  const done=executeCommand('副驾',r.state,r.context);s.setFeedback(done);assert.equal(done.state.windows.passenger,100);
  assert.equal(s.dispatch({type:'set',key:'feedback',value:null}),true);assert.equal(s.ui.feedback,null);
});
test('副驾与后排屏独立进入页面并返回，不把中控页面复制到其他屏幕',()=>{
  const cabin=Object.create(CabinScene.prototype),painted=[];
  cabin.screenPage='map';cabin.paintScreen=ref=>painted.push([ref.type,ref.page]);cabin.onScreenUI=()=>assert.fail('副驾返回不应改中控历史');
  const ref=type=>({type,canvas:{width:100,height:100},page:'home',pageHistory:['home'],hitRegions:[]});
  const passenger=ref('passenger'),rear=ref('rear');cabin.refs={screens:[passenger,rear]};
  const activate=(r,payload)=>{r.hitRegions=[{x:0,y:0,width:100,height:100,...payload}];cabin.activateScreen(r,{x:.5,y:.5});};
  activate(passenger,{page:'media'});assert.equal(passenger.page,'media');assert.equal(rear.page,'home');assert.equal(cabin.screenPage,'map');
  activate(rear,{page:'settings'});activate(passenger,{ui:{type:'back'}});
  assert.equal(passenger.page,'home');assert.equal(rear.page,'settings');assert.equal(cabin.screenPage,'map');
  cabin.resetScreenPages();assert.equal(cabin.screenPage,'home');assert.equal(rear.page,'home');assert.deepEqual(rear.pageHistory,['home']);assert.ok(painted.length>=5);
});
