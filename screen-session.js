/** 车机页面与本地演示偏好；不保存车辆状态，不调用系统设置或导航服务。 */
export function createScreenPreferences() {
  return {seatTarget:'driver',doorTarget:'driver',brightness:80,textSize:'standard',soundPreset:'balanced',navDestination:null,navQuery:'',routePreference:'recommended',routeActive:false,bluetooth:false,wifi:false,ambientBrightness:70,airMode:'balanced',networkDevice:null,bluetoothDevice:null,wifiNetwork:null,mediaTrack:0,feedback:null};
}
const seats=['driver','passenger','rearLeft','rearRight','thirdLeft','thirdRight'];
const choices={seatTarget:seats,doorTarget:seats.slice(0,4),textSize:['standard','large'],soundPreset:['balanced','vocal','surround','bass','classic'],routePreference:['recommended','fastest','shortest','avoidHighways','avoid-congestion','highway','eco'],airMode:['balanced','face','feet','defrost','auto','fresh','recirculate']};
const bounded={brightness:[10,100],ambientBrightness:[0,100],mediaTrack:[0,20]};
export class ScreenSession {
  constructor(pages=['home']) {this.pages=new Set(pages);this.reset();}
  reset(){this.page='home';this.history=['home'];this.ui=createScreenPreferences();}
  navigate(page){
    if(!this.pages.has(page)||this.ui.feedback?.status==='clarify')return false;
    if(page===this.page)return false;
    this.page=page;
    if(page==='home')this.history=['home'];
    else {this.history.push(page);if(this.history.length>40)this.history.splice(1,1);}
    return true;
  }
  dispatch(event){
    if(!event||this.ui.feedback?.status==='clarify')return false;
    if(event.type==='back'){
      if(this.history.length>1)this.history.pop();
      this.page=this.history.at(-1)||'home';return true;
    }
    if(event.type!=='set')return false;
    const {key,value}=event;
    if(key==='feedback'&&value===null){this.setFeedback(null);return true;}
    if(Object.hasOwn(choices,key)){if(!choices[key].includes(value))return false;}
    else if(Object.hasOwn(bounded,key)){if(typeof value!=='number'||!Number.isFinite(value))return false;const [min,max]=bounded[key];if(value<min||value>max)return false;}
    else if(['bluetooth','wifi','routeActive'].includes(key)){if(typeof value!=='boolean')return false;if(key==='routeActive'&&value&&!this.ui.navDestination)return false;}
    else if(['navDestination','networkDevice','bluetoothDevice','wifiNetwork'].includes(key)){if(value!==null&&(typeof value!=='string'||!value.trim()||value.length>64))return false;if(key==='bluetoothDevice'&&value&&!this.ui.bluetooth)return false;if(key==='wifiNetwork'&&value&&!this.ui.wifi)return false;}
    else if(key==='navQuery'){if(typeof value!=='string'||value.length>64)return false;}
    else return false;
    this.ui={...this.ui,[key]:value};
    if(key==='navDestination')this.ui.routeActive=false;
    if(key==='bluetooth'&&!value){this.ui.networkDevice=null;this.ui.bluetoothDevice=null;}
    if(key==='wifi'&&!value)this.ui.wifiNetwork=null;
    return true;
  }
  setFeedback(receipt){this.ui={...this.ui,feedback:receipt?{status:receipt.status,title:receipt.title||'',message:receipt.message||'',pendingKind:receipt.pending?.kind||receipt.pendingKind||null}:null};}
}
