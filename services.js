/** 同源服务请求；取消后即使旧响应到达，也不能再更新车态或路线。 */
export class LatestRequest {
  constructor(fetcher = globalThis.fetch) { this.fetcher=fetcher.bind(globalThis);this.sequence=0;this.controller=null; }
  cancel(){this.sequence++;this.controller?.abort();this.controller=null;}
  async run(path, body, timeout=30000){
    this.cancel();const sequence=this.sequence, controller=new AbortController();this.controller=controller;
    let timedOut=false;
    const timer=setTimeout(()=>{timedOut=true;controller.abort();},timeout);
    try {
      const response=await this.fetcher(path,{method:body===undefined?'GET':'POST',headers:body===undefined?{}:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:controller.signal});
      const data=await response.json();
      if(sequence!==this.sequence)return null;
      if(!response.ok||data.ok===false){const error=new Error(data.message||data.error?.message||'服务请求失败，请重试。');error.code=data.code||data.errorCode||data.error?.code;throw error;}
      return data;
    } catch(error) {
      if(sequence!==this.sequence)return null;
      if(timedOut)throw new Error('服务响应超时，本次请求未执行。');
      if(error.name==='AbortError')return null;
      throw error;
    } finally {clearTimeout(timer);if(sequence===this.sequence)this.controller=null;}
  }
}
export const DEMO_ORIGIN={name:'杭州东站（演示起点）',location:[120.212,30.291]};
export function createLiveMap(enabled=false){return {enabled,status:'idle',message:'',pois:[],selectedPoi:null,routes:[],routeIndex:0,origin:structuredClone(DEMO_ORIGIN),city:'杭州'};}
export function validRoute(route){return route&&Number.isFinite(route.distanceMeters)&&route.distanceMeters>0&&Number.isFinite(route.durationSeconds)&&route.durationSeconds>0&&Array.isArray(route.polyline)&&route.polyline.length>=2;}
