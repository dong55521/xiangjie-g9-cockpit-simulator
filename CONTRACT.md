# G9 座舱实验室实现约定

独立本地项目。所有用户界面中文。用户已批准三维建模、语音控制、教学与模拟测试。参考 G9 六座纯电 Ultra+，选装设备须独立标识；官方功能依据、模拟策略与原型扩展分别标注。本项目没有原生小艺服务和真实车辆接口。

## 分工
- scene.js：三维场景，仅由建模代理编辑。
- engine.js、tests/engine.test.mjs：状态、理解、校验、执行，仅由引擎代理编辑。
- catalog.js、docs/：功能证据与文档，仅由资料代理编辑。
- app.js、style.css、index.html、speech.js、server.mjs、scripts/：主线程。

## 坐标与部件
三维坐标 x 为左右（驾驶员 x<0），y 为上，z 为前后（车头 z<0）。六座 2+2+2。
目标标识：driver/passenger/rearLeft/rearRight/thirdLeft/thirdRight。门窗只有前两排四个目标。氛围灯、遮阳帘、后排屏等为全局。

## 状态接口（JSON 可序列化）
createInitialState() 返回：
{ gear:'P', speed:0, battery:82, speaker:'driver', scene:'normal',
  capabilities:{electricDoors:true,rearScreen:true,fragrance:true,oxygen:false},
  fault:null, windows:{driver:0,passenger:0,rearLeft:0,rearRight:0},
  doors:{driver:false,passenger:false,rearLeft:false,rearRight:false},
  seats:{[六个目标]:{position:0,recline:0,heat:0,vent:0,massage:false}},
  climate:{power:true,driver:24,passenger:24,rearLeft:24,rearRight:24,fan:2},
  lights:{ambient:true,color:'#b3cda4',reading:{[六个目标]:false}},
  rearScreen:false,shade:0,fragrance:false,oxygen:false,media:{playing:false,volume:35},
  childLock:false,chargePort:false }
窗户开度0为关闭、100为打开。遮阳帘0关闭、100打开。座椅position -1到1，recline 0到1。

## 引擎接口
export createInitialState();
export executeCommand(text,state,context={}) -> {status:'success'|'clarify'|'blocked'|'unsupported'|'error'|'cancelled', message, state, actions:[], steps:[{label,detail,status}], target, intent, evidence:'official'|'adapted'|'design', pending:null|{}, context:{...}, before, after};
纯函数不得修改输入state。context保留lastTarget,lastDomain,pending以支持再低一点、取消、确认。自然语言通过本地规则解析，界面诚实标注；识别与播报由浏览器提供。
export performAction(action,state,context={}) 同一回执结构，action={domain,operation,target?,value?};
标准domain：window/door/seat/temperature/fan/climate/reading/ambient/rearScreen/shade/fragrance/oxygen/media/scene/childLock/chargePort。operation set/open/close/toggle/move/heat/vent/massage/color/play/pause/volume/start/stop。
export TEST_SCENARIOS=[{id,name,description,query,setup:{...},expect:{status,...}}]，至少覆盖成功、条件拒绝、配置缺失、歧义、故障、连续指代。

## 三维接口
export class CabinScene { constructor(container,{onSelect,onReady}={}); update(state,{target,domain}={}); setView('overview'|'driver'|'passenger'|'rear'|'exterior'); setSelection(target,domain); setXray(bool); dispose(); }
onSelect({target,domain})，屏幕domain=rearScreen、窗window、门door、座椅seat、灯reading等。允许轮转缩放。update用插值动画，渲染不导致DOM整体重建。WebGL不可用时抛出或展示清楚错误。

## 功能目录接口
export CATEGORIES=[{id,label,description}];
export CAPABILITIES=[{id,category,title,description,example,domain,target?,evidence:'official'|'adapted'|'design',sourcePages:[],sourceUrl,conditions:[],why,action?:{domain,operation,target?,value?}}];
export VEHICLE_PROFILE={name,subtitle,seats:6,sourceUrl,disclaimer};
类别使用 window,seat,climate,lighting,display,scene,other。能力覆盖先以座舱核心完成；不把不同车型条目移植成G9确证。原型数值与保护策略要单独注明。能识别与允许执行分开。
