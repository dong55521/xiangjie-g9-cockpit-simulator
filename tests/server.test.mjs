import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {mkdtemp,writeFile,rm,symlink,mkdir} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {createCabinServer} from '../server.mjs';
import {loadServerConfig,parseEnvironment,publicServiceStatus} from '../server-config.mjs';

const config={deepseek:{apiKey:'fake-deepseek-secret',baseUrl:'https://api.deepseek.com',model:'deepseek-flash',valid:true},amap:{webKey:'fake-amap-secret'}};
async function serverFor(t,options={}){
  const server=createCabinServer({config,...options});server.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();}));
  return {server,url:`http://127.0.0.1:${server.address().port}`};
}
test('配置解析只接纳显式字段、不执行内容，环境变量优先',async(t)=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'g9-config-test-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const raw='DEEPSEEK_API_KEY="fake-local"\nDEEPSEEK_MODEL=deepseek-flash # comment\nAMAP_WEB_KEY=\'fake-map\'\nUNRELATED=private\n';await writeFile(path.join(root,'.env.local'),raw);
  assert.equal(parseEnvironment(raw).UNRELATED,undefined);assert.equal(loadServerConfig(root,{}).deepseek.apiKey,'fake-local');assert.equal(loadServerConfig(root,{DEEPSEEK_API_KEY:'fake-env'}).deepseek.apiKey,'fake-env');
  assert.equal(loadServerConfig(root,{DEEPSEEK_BASE_URL:'https://attacker.invalid'}).deepseek.valid,false);
  const status=JSON.stringify(publicServiceStatus(config));assert.ok(!status.includes('secret'));assert.ok(!status.includes('api.deepseek.com'));assert.equal(JSON.parse(status).deepseek.verification,'unverified');
});
test('status只显示已配置与未核验，不调用任何外部服务',async(t)=>{
  let calls=0;const {url}=await serverFor(t,{assistant:async()=>{calls++;return {ok:true};}});const result=await fetch(url+'/api/status');assert.equal(result.status,200);const body=await result.json();assert.equal(body.deepseek.configured,true);assert.equal(body.amap.configured,true);assert.equal(body.deepseek.verification,'unverified');assert.equal(calls,0);assert.equal(result.headers.get('access-control-allow-origin'),null);assert.ok(!JSON.stringify(body).includes('secret'));
});
test('同源调用可用；恶意Origin、Host、跨站请求均被拒绝',async(t)=>{
  let calls=0;const {url}=await serverFor(t,{assistant:async(_config,input)=>{calls++;return {ok:true,kind:'reply',message:input.query};}});
  // 原生 HTTP 保留手写 Host；fetch 会规范化该头，不能用于恶意 Host 测试。
  const request=headers=>new Promise((resolve,reject)=>{const req=http.request(url+'/api/assistant',{method:'POST',headers:{'content-type':'application/json',...headers}},res=>{res.resume();res.on('end',()=>resolve({status:res.statusCode}));});req.on('error',reject);req.end(JSON.stringify({query:'你好'}));});
  assert.equal((await request({origin:url})).status,200);
  for(const headers of [{origin:'https://evil.invalid'},{host:'evil.invalid'},{origin:'null'},{'sec-fetch-site':'cross-site'},{origin:url+'/'},{host:'localhost:1'}])assert.equal((await request(headers)).status,403,JSON.stringify(headers));
  assert.equal(calls,1);
});
test('JSON方法、内容类型、无效正文和64KB大小检查在调用前执行',async(t)=>{
  let calls=0;const {url}=await serverFor(t,{assistant:async()=>{calls++;return {ok:true};}});
  assert.equal((await fetch(url+'/api/assistant')).status,405);
  assert.equal((await fetch(url+'/api/assistant',{method:'POST',body:'{}'})).status,415);
  assert.equal((await fetch(url+'/api/assistant',{method:'POST',headers:{'content-type':'application/json'},body:'{'})).status,400);
  assert.equal((await fetch(url+'/api/assistant',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({query:'x'.repeat(65536)})})).status,413);
  assert.equal(calls,0);
});
test('静态路由拒绝env、服务端模块、测试与指向秘密的符号链接',async(t)=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'g9-static-test-'));t.after(()=>rm(root,{recursive:true,force:true}));
  await writeFile(path.join(root,'index.html'),'<h1>public</h1>');await writeFile(path.join(root,'.env.local'),'fake-secret');await mkdir(path.join(root,'tests'));await writeFile(path.join(root,'tests','fixture.js'),'private');await symlink(path.join(root,'.env.local'),path.join(root,'public.js'));
  const {url}=await serverFor(t,{root});assert.equal((await fetch(url+'/')).status,200);assert.equal((await fetch(url+'/',{method:'HEAD'})).status,200);
  for(const name of ['/.env.local','/%2eenv.local','/server.mjs','/server-ai.mjs','/server-config.mjs','/tests/fixture.js','/scripts/build.mjs','/public.js'])assert.equal((await fetch(url+name)).status,403,name);
});
test('地图搜索与路线透传既定参数和取消信号，不伪造成功',async(t)=>{
  const captured=[];const run=async(c,args,options)=>{assert.equal(c,config);assert.ok(options.signal instanceof AbortSignal);captured.push(args);return {ok:false,provider:'amap',errorCode:'10009',message:'密钥类型不匹配'};};
  const {url}=await serverFor(t,{mapsSearch:run,mapsRoute:run});
  for(const [route,body]of [['search',{keywords:'西湖',city:'杭州'}],['route',{origin:[120.2,30.2],destination:[120.1,30.3]}]]){const response=await fetch(url+'/api/maps/'+route,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});assert.equal(response.status,200);const data=await response.json();assert.equal(data.ok,false);assert.equal(data.errorCode,'10009');}
  assert.equal(captured.length,2);
});
test('上游未知异常不把秘密或完整URL回显给页面',async(t)=>{
  const {url}=await serverFor(t,{assistant:async()=>{throw new Error('https://example.invalid/?key=fake-secret');}});const response=await fetch(url+'/api/assistant',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});assert.equal(response.status,502);assert.ok(!(await response.text()).includes('fake-secret'));
});
test('浏览器取消请求会终止服务端上游请求',async(t)=>{
  let start,abort;const started=new Promise(resolve=>{start=resolve;}),aborted=new Promise(resolve=>{abort=resolve;});
  const {url}=await serverFor(t,{assistant:async(_config,_input,{signal})=>{start();await new Promise(resolve=>signal.addEventListener('abort',()=>{abort();resolve();},{once:true}));return {ok:false};}});
  const controller=new AbortController(),request=fetch(url+'/api/assistant',{method:'POST',headers:{'content-type':'application/json'},body:'{}',signal:controller.signal}).catch(()=>{});await started;controller.abort();await Promise.race([aborted,new Promise((_,reject)=>{const id=setTimeout(()=>reject(new Error('未收到取消信号')),1000);id.unref();})]);await request;
});
