import test from 'node:test';
import assert from 'node:assert/strict';
import {LatestRequest,createLiveMap,validRoute} from '../services.js';
import {createInitialState,performActions,executeCommand} from '../engine.js';

test('旧响应晚到不能覆盖新指令，即使底层忽略 abort',async()=>{
  const pending=[];const service=new LatestRequest(()=>new Promise(resolve=>pending.push(resolve)));
  const first=service.run('/api/assistant',{query:'旧'}),second=service.run('/api/assistant',{query:'新'});
  pending[1]({ok:true,json:async()=>({ok:true,message:'新'})});assert.equal((await second).message,'新');
  pending[0]({ok:true,json:async()=>({ok:true,message:'旧'})});assert.equal(await first,null);
});
test('触控或重置取消在途请求，晚到的失败也不弹错',async()=>{
  let reject;const service=new LatestRequest(()=>new Promise((_,r)=>reject=r));
  const request=service.run('/api/assistant',{});service.cancel();reject(new Error('旧错误'));assert.equal(await request,null);
});
test('接口业务失败保留安全提示与错误码',async()=>{
  const service=new LatestRequest(async()=>({ok:false,json:async()=>({ok:false,message:'密钥平台不匹配',code:'10009'})}));
  await assert.rejects(service.run('/api/maps/search',{}),e=>e.code==='10009'&&e.message==='密钥平台不匹配');
});
test('超时明确失败且不伪装规则结果',async()=>{
  const service=new LatestRequest((_,options)=>new Promise((_,reject)=>options.signal.addEventListener('abort',()=>reject(Object.assign(new Error(),{name:'AbortError'})))));
  await assert.rejects(service.run('/api/assistant',{},10),/超时/);
});
test('地图默认无结果且示例起点不伪装用户定位',()=>{
  const map=createLiveMap(true);assert.equal(map.status,'idle');assert.deepEqual(map.routes,[]);assert.match(map.origin.name,/演示起点/);assert.equal(validRoute({distanceMeters:0,durationSeconds:30,polyline:[[0,0],[1,1]]}),false);
});
test('模型复合动作失败时全部回滚，不漏执行前一个动作',()=>{
  const state=createInitialState();const result=performActions([{domain:'window',operation:'open',target:'driver'},{domain:'oxygen',operation:'open'}],state);
  assert.equal(result.status,'blocked');assert.deepEqual(result.state,state);
});
test('模型复合动作确认前不执行，确认后原子执行',()=>{
  const state=createInitialState();const result=performActions([{domain:'temperature',operation:'set',target:'passenger',value:22},{domain:'door',operation:'open',target:'passenger'}],state,{confirmed:true});
  assert.equal(result.status,'clarify');assert.deepEqual(result.state,state);
  const confirmed=executeCommand('确认',result.state,result.context);assert.equal(confirmed.status,'success');assert.equal(confirmed.state.climate.passenger,22);assert.equal(confirmed.state.doors.passenger,true);
});
test('动作数组拒绝空值和超出限制',()=>{
  const state=createInitialState();for(const actions of [null,[],Array(5).fill({domain:'window',operation:'open'})]){const r=performActions(actions,state);assert.equal(r.status,'unsupported');assert.deepEqual(r.state,state);}
});
