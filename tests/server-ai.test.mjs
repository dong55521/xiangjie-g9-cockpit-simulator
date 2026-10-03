import test from 'node:test';
import assert from 'node:assert/strict';
import {requestAssistant,sanitizeAssistantRequest,validateModelPlan,validateModelAction} from '../server-ai.mjs';
import {createInitialState,performAction,executeCommand} from '../engine.js';

const config={deepseek:{apiKey:'fake-unit-test-secret',baseUrl:'https://api.deepseek.com',model:'deepseek-flash',valid:true},amap:{webKey:'fake-map-secret'}};
const response=(plan,finish_reason='stop')=>new Response(JSON.stringify({choices:[{finish_reason,message:{content:JSON.stringify(plan)}}]}),{status:200});
const plan={kind:'vehicle',actions:[{domain:'temperature',operation:'set',target:'passenger',value:22}],message:'模型声称已执行，此消息必须替换'};

test('真实调用契约使用官方 JSON 模式；不传播模型执行成功声明或秘密',async()=>{
  const state=createInitialState(),before=structuredClone(state);let called=0;
  const result=await requestAssistant(config,{query:'副驾温度22度',state},{fetchImpl:async(url,options)=>{
    called++;assert.equal(url,'https://api.deepseek.com/chat/completions');assert.equal(options.redirect,'error');assert.equal(options.headers.Authorization,'Bearer fake-unit-test-secret');
    const body=JSON.parse(options.body);assert.deepEqual(body.response_format,{type:'json_object'});assert.equal(body.model,'deepseek-flash');assert.equal(body.thinking.type,'disabled');assert.match(body.messages[0].content,/JSON/);assert.equal(body.messages.length,2);return response(plan);
  }});
  assert.equal(called,1);assert.equal(result.provider,'deepseek');assert.equal(result.kind,'vehicle');assert.deepEqual(result.actions,plan.actions);assert.match(result.message,/等待/);assert.ok(!result.message.includes('已执行'));assert.ok(!JSON.stringify(result).includes('fake-unit-test'));assert.deepEqual(state,before);
});
test('状态白名单过滤确认权限、任意历史、异常数值与未知音区',()=>{
  const raw={query:' 再低一点 ',state:{speaker:'injected',speed:Infinity,battery:-1,capabilities:{oxygen:true,secret:'bad'},seats:{driver:{position:.2,heat:8}},climate:{passenger:21},secret:'bad'},context:{confirmed:true,lastDomain:'temperature',lastTarget:'passenger',lastOperation:'set',pending:{kind:'confirm',actions:[{domain:'system'}]},history:['bad']}};
  const result=sanitizeAssistantRequest(raw);assert.equal(result.query,'再低一点');assert.equal(result.state.speaker,'unknown');assert.equal(result.state.speed,0);assert.equal(result.state.capabilities.oxygen,true);assert.equal(result.state.seats.driver.position,.2);assert.equal(result.state.seats.driver.heat,0);assert.equal(result.state.climate.passenger,21);assert.deepEqual(result.context,{lastDomain:'temperature',lastTarget:'passenger',lastOperation:'set',pendingKind:'confirm'});assert.ok(!JSON.stringify(result).includes('bad'));
  for(const input of [null,[],{query:''},{query:'x'.repeat(1001)},{query:'ok',state:[]},{query:'ok',context:'no'},{query:'ok',confirmed:true}])assert.throws(()=>sanitizeAssistantRequest(input),{code:'INVALID_REQUEST'});
});
test('合法动作进入现有引擎后仍需确认与条件检查',()=>{
  const action=validateModelAction({domain:'door',operation:'open',target:'driver'}),state=createInitialState();
  const pending=performAction(action,state);assert.equal(pending.status,'clarify');assert.equal(pending.state.doors.driver,false);assert.equal(executeCommand('确认',pending.state,pending.context).state.doors.driver,true);
  state.gear='D';assert.equal(performAction(action,state).status,'blocked');
});
test('拒绝未知动作、权限字段、数值越界、错误类型和无意义value',()=>{
  const invalid=[{domain:'system',operation:'execute'},{domain:'door',operation:'open',target:'driver',confirmed:true},{domain:'door',operation:'open',target:'thirdLeft'},{domain:'temperature',operation:'set',value:99},{domain:'fan',operation:'set',value:1.5},{domain:'seat',operation:'heat',value:4},{domain:'seat',operation:'move',value:-2},{domain:'seat',operation:'recline',value:1.1},{domain:'seat',operation:'massage',value:'true'},{domain:'climate',operation:'set',value:1},{domain:'climate',operation:'open',value:null},{domain:'media',operation:'volume',value:NaN},{domain:'ambient',operation:'color',value:'red'},{domain:'scene',operation:'start',value:'drive'},{domain:'media',operation:'play',target:'driver'}];
  for(const action of invalid)assert.throws(()=>validateModelAction(action),{code:'INVALID_MODEL_OUTPUT'});
});
test('允许所有有限数值端点和既有布尔枚举',()=>{
  const actions=[{domain:'window',operation:'set',target:'all',value:100},{domain:'shade',operation:'set',value:0},{domain:'temperature',operation:'set',value:16},{domain:'fan',operation:'set',value:7},{domain:'seat',operation:'move',value:1},{domain:'seat',operation:'recline',value:0},{domain:'seat',operation:'vent',value:3},{domain:'seat',operation:'massage',value:true},{domain:'reading',operation:'set',target:'third',value:false},{domain:'ambient',operation:'color',value:'#a0B9C1'},{domain:'media',operation:'volume',value:100},{domain:'scene',operation:'start',value:'rest'}];
  for(const action of actions)assert.deepEqual(validateModelAction(action),action);
});
test('严格计划结构拒绝超长复合动作、伪造路线与额外字段',()=>{
  for(const invalid of [{...plan,actions:[]},{...plan,actions:Array(5).fill(plan.actions[0])},{...plan,state:{}},{kind:'navigation',navigation:{keywords:'西湖',location:'0,0'},message:'地点'},{kind:'reply',message:'',actions:[]},{kind:'system',message:'no'}])assert.throws(()=>validateModelPlan(invalid,'deepseek-flash'),{code:'INVALID_MODEL_OUTPUT'});
  const nav=validateModelPlan({kind:'navigation',navigation:{keywords:' 西湖 ',city:' 杭州 '},message:'搜索'},'deepseek-flash');assert.deepEqual(nav.navigation,{keywords:'西湖',city:'杭州'});assert.match(nav.message,/等待地图/);
  assert.equal(validateModelPlan({kind:'reply',message:'请说明希望调整什么。'},'deepseek-flash').kind,'reply');
});
test('空内容、截断和畸形 JSON 均不可成为动作计划',async()=>{
  const fixtures=[response(plan,'length'),new Response('not-json'),new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:''}}]})),new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:'{"kind":'}}]}))];
  for(const fixture of fixtures)await assert.rejects(requestAssistant(config,{query:'打开车窗'},{fetchImpl:async()=>fixture}),{code:'INVALID_MODEL_OUTPUT'});
});
test('上游认证、限流、网络异常被替换为不含密钥的安全错误',async()=>{
  for(const [status,code]of [[401,'PROVIDER_AUTH'],[403,'PROVIDER_AUTH'],[429,'PROVIDER_LIMIT'],[503,'PROVIDER_ERROR']])await assert.rejects(requestAssistant(config,{query:'你好'},{fetchImpl:async()=>new Response('secret:'+config.deepseek.apiKey,{status})}),error=>error.code===code&&!error.message.includes(config.deepseek.apiKey));
  await assert.rejects(requestAssistant(config,{query:'你好'},{fetchImpl:async()=>{throw new Error(config.deepseek.apiKey);}}),{code:'NETWORK_ERROR'});
});
test('未配置或非官方地址不发请求',async()=>{
  let called=0;const fetchImpl=async()=>{called++;return response(plan);};
  await assert.rejects(requestAssistant({deepseek:{}},{query:'你好'},{fetchImpl}),{code:'NOT_CONFIGURED'});
  await assert.rejects(requestAssistant({deepseek:{...config.deepseek,baseUrl:'https://example.com'}},{query:'你好'},{fetchImpl}),{code:'INVALID_CONFIG'});assert.equal(called,0);
});
test('25秒默认计时机制可终止调用，取消信号传递到上游',async()=>{
  const waiting=async(_url,{signal})=>new Promise((resolve,reject)=>{if(signal.aborted)reject(new Error('aborted'));else signal.addEventListener('abort',()=>reject(new Error('aborted')),{once:true});});
  await assert.rejects(requestAssistant(config,{query:'你好'},{fetchImpl:waiting,timeoutMs:10}),{code:'TIMEOUT',status:504});
  const controller=new AbortController(),pending=requestAssistant(config,{query:'你好'},{fetchImpl:waiting,signal:controller.signal});controller.abort();await assert.rejects(pending,{code:'CANCELLED',status:499});
  let called=0;await assert.rejects(requestAssistant(config,{query:'你好'},{fetchImpl:async()=>{called++;return response(plan);},signal:controller.signal}),{code:'CANCELLED'});assert.equal(called,0);
});
