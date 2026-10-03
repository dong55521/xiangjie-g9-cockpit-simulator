import fs from 'node:fs';
import path from 'node:path';

// 只读显式配置，不执行内容或展开环境变量；密钥从不进入公开状态。
const KEYS=new Set(['DEEPSEEK_API_KEY','DEEPSEEK_BASE_URL','DEEPSEEK_MODEL','AMAP_WEB_KEY']);
export function parseEnvironment(text){
  const result={};
  for(const line of String(text).split(/\r?\n/)){
    const match=line.match(/^\s*(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if(!match||!KEYS.has(match[1]))continue;
    let value=match[2];
    if((value.startsWith('"')&&value.endsWith('"'))||(value.startsWith("'")&&value.endsWith("'")))value=value.slice(1,-1);
    else value=value.replace(/\s+#.*$/,'').trim();
    if(value.length<=4096&&!/[\r\n\0]/.test(value))result[match[1]]=value;
  }
  return result;
}
export function loadServerConfig(root,environment=process.env){
  let local={};
  try{const file=path.join(root,'.env.local');if(fs.statSync(file).size>64*1024)throw new Error();local=parseEnvironment(fs.readFileSync(file,'utf8'));}
  catch(error){if(error.code!=='ENOENT')throw new Error('无法读取本地服务配置');}
  const pick=key=>String(Object.hasOwn(environment,key)?environment[key]??'':local[key]??'').trim();
  const baseUrl=(pick('DEEPSEEK_BASE_URL')||'https://api.deepseek.com').replace(/\/+$/,'');
  const model=pick('DEEPSEEK_MODEL')||'deepseek-flash';
  const valid=/^https:\/\/api\.deepseek\.com(?:\/v1)?$/.test(baseUrl)&&/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/.test(model);
  const key=value=>value.length<=4096&&!/[\r\n\0]/.test(value)?value:'';
  return {deepseek:{apiKey:key(pick('DEEPSEEK_API_KEY')),baseUrl,model,valid},amap:{webKey:key(pick('AMAP_WEB_KEY'))}};
}
export function publicServiceStatus(config){
  return {ok:true,deepseek:{configured:Boolean(config.deepseek?.apiKey&&config.deepseek?.valid!==false),verification:'unverified',model:/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/.test(config.deepseek?.model||'')?config.deepseek.model:null},amap:{configured:Boolean(config.amap?.webKey),verification:'unverified'},vehicle:{execution:'simulation'}};
}
