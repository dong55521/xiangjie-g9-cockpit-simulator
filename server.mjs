import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadServerConfig,publicServiceStatus} from './server-config.mjs';
import {requestAssistant,ServiceError} from './server-ai.mjs';

const projectRoot=path.dirname(fileURLToPath(import.meta.url)),BODY_LIMIT=64*1024;
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.woff2':'font/woff2','.md':'text/plain; charset=utf-8'};
function json(res,status,body){if(res.destroyed||res.writableEnded)return;res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(body));}
function localRequest(req){
  const host=req.headers.host;
  if(typeof host!=='string'||!(/^(?:127\.0\.0\.1|localhost|\[::1\])(?::\d{1,5})?$/.test(host)))return false;
  let local;try{local=new URL(`http://${host}`);}catch{return false;}
  if(Number(local.port||80)!==req.socket.localPort)return false;
  if(req.headers['sec-fetch-site']==='cross-site')return false;
  if(req.headers.origin&&req.headers.origin!==local.origin)return false;
  return true;
}
function readBody(req){
  if((req.headers['content-type']||'').split(';')[0].trim().toLowerCase()!=='application/json')return Promise.reject(new ServiceError(415,'CONTENT_TYPE','请求需要使用 JSON 格式。'));
  if(Number(req.headers['content-length'])>BODY_LIMIT)return Promise.reject(new ServiceError(413,'BODY_TOO_LARGE','请求内容超过 64KB。'));
  return new Promise((resolve,reject)=>{
    const chunks=[];let length=0,done=false;
    const cleanup=()=>{req.off('data',data);req.off('end',end);req.off('aborted',abort);req.off('error',abort);};
    const fail=error=>{if(done)return;done=true;cleanup();req.resume();reject(error);};
    const abort=()=>fail(new ServiceError(499,'CANCELLED','请求已取消。'));
    const data=chunk=>{length+=chunk.length;if(length>BODY_LIMIT)fail(new ServiceError(413,'BODY_TOO_LARGE','请求内容超过 64KB。'));else chunks.push(chunk);};
    const end=()=>{if(done)return;done=true;cleanup();try{resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));}catch{reject(new ServiceError(400,'INVALID_JSON','JSON 格式无效。'));}};
    req.on('data',data);req.on('end',end);req.on('aborted',abort);req.on('error',abort);
  });
}
async function staticFile(req,res,pathname,root){
  const file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname)),relative=path.relative(root,file),segments=relative.split(path.sep);
  const privatePath=parts=>parts.some(part=>part.startsWith('.')||/^server(?:[-.]|$)/.test(part))||['tests','scripts'].includes(parts[0]);
  const blocked=relative.startsWith('..')||privatePath(segments)||(segments[0]==='node_modules'&&!(relative.startsWith('node_modules/three/build/')||relative.startsWith('node_modules/three/examples/jsm/')))||!Object.hasOwn(mime,path.extname(file));
  if(blocked){json(res,403,{ok:false,error:{code:'FORBIDDEN',message:'不可访问此文件。'}});return;}
  try{
    const real=await fs.promises.realpath(file),realRelative=path.relative(root,real);
    if(realRelative.startsWith('..')||privatePath(realRelative.split(path.sep)))throw new ServiceError(403,'FORBIDDEN','不可访问此文件。');
    const stat=await fs.promises.stat(real);if(!stat.isFile())throw Object.assign(new Error(),{code:'ENOENT'});
    res.writeHead(200,{'Content-Type':mime[path.extname(file)],'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff','Content-Length':stat.size});
    if(req.method==='HEAD')res.end();else fs.createReadStream(real).on('error',()=>res.destroy()).pipe(res);
  }catch(error){json(res,error.status||404,{ok:false,error:{code:error.status?'FORBIDDEN':'NOT_FOUND',message:error.status?'不可访问此文件。':'文件不存在。'}});}
}

export function createCabinServer({root=projectRoot,config=loadServerConfig(root),assistant=requestAssistant,mapsSearch=async(...args)=>(await import('./server-maps.mjs')).searchPlaces(...args),mapsRoute=async(...args)=>(await import('./server-maps.mjs')).planRoute(...args)}={}){
  root=fs.realpathSync(root);
  let activeRequests=0;
  return http.createServer(async(req,res)=>{
    if(!localRequest(req)){json(res,403,{ok:false,error:{code:'ORIGIN_DENIED',message:'仅允许本机同源访问。'}});return;}
    let pathname;try{pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);if(pathname.includes('\0'))throw new Error();}catch{json(res,400,{ok:false,error:{code:'INVALID_PATH',message:'请求路径无效。'}});return;}
    if(!pathname.startsWith('/api/')){
      if(!['GET','HEAD'].includes(req.method)){json(res,405,{ok:false,error:{code:'METHOD_NOT_ALLOWED',message:'请求方法不支持。'}});return;}
      await staticFile(req,res,pathname,root);return;
    }
    if(pathname==='/api/status'&&req.method==='GET'){json(res,200,publicServiceStatus(config));return;}
    const routes={'/api/assistant':assistant,'/api/maps/search':mapsSearch,'/api/maps/route':mapsRoute};
    if(!Object.hasOwn(routes,pathname)){json(res,404,{ok:false,error:{code:'NOT_FOUND',message:'接口不存在。'}});return;}
    if(req.method!=='POST'){json(res,405,{ok:false,error:{code:'METHOD_NOT_ALLOWED',message:'接口需要 POST 请求。'}});return;}
    if(activeRequests>=4){json(res,429,{ok:false,error:{code:'BUSY',message:'请求处理中，请稍后重试。'}});return;}
    const controller=new AbortController(),disconnect=()=>{if(!res.writableEnded)controller.abort();};
    req.on('aborted',disconnect);res.on('close',disconnect);activeRequests++;
    try{const body=await readBody(req);const result=await routes[pathname](config,body,{signal:controller.signal});json(res,200,result);}
    catch(error){const status=Number.isInteger(error.status)&&error.status>=400&&error.status<=599?error.status:502;const trusted=error instanceof ServiceError;json(res,status,{ok:false,error:{code:trusted?error.code:'SERVICE_ERROR',message:trusted?error.message:'服务请求未完成，请稍后重试。'}});}
    finally{activeRequests--;req.off('aborted',disconnect);res.off('close',disconnect);}
  });
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const port=Number(process.env.PORT||8940),server=createCabinServer();
  server.listen(port,'127.0.0.1',()=>console.log(`G9 座舱实验室：http://127.0.0.1:${port}`));
  server.on('error',()=>{console.error('本地服务启动失败，请检查端口或配置。');process.exitCode=1;});
}
