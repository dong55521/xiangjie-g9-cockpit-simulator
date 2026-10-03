export class VoiceIO {
  constructor({onStatus,onTranscript,onResult,onError}={}) {
    Object.assign(this,{onStatus,onTranscript,onResult,onError});
    this.recognition=null;this.generation=0;this.muted=false;this.listening=false;
    this.Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;
  }
  get available(){return Boolean(this.Recognition);}
  start(){
    this.stop();
    window.speechSynthesis?.cancel();
    if(!this.Recognition){this.onError?.('当前浏览器未提供语音识别。可在支持语音识别的浏览器中打开，或先用下方文字体验。');return;}
    const generation=++this.generation,r=new this.Recognition();
    this.recognition=r;r.lang='zh-CN';r.continuous=false;r.interimResults=true;
    let completed=false;
    // 一次识别只完成一次；取消、报错、结束后的迟到回调不再执行控制。
    const current=()=>generation===this.generation&&!completed&&this.recognition===r;
    r.onstart=()=>{if(current()){this.listening=true;this.onStatus?.('listening','我在，请说');}};
    r.onresult=e=>{
      if(!current())return;
      const text=Array.from(e.results).map(x=>x[0].transcript).join('');
      this.onTranscript?.(text);
      if(e.results[e.results.length-1].isFinal){completed=true;this.listening=false;this.recognition=null;this.onStatus?.('processing','正在理解');this.onResult?.(text);}
    };
    r.onerror=e=>{
      if(!current())return;
      completed=true;this.listening=false;this.recognition=null;
      this.onStatus?.('error','语音未完成');
      const errors={'not-allowed':'麦克风权限未允许，请在浏览器地址栏允许麦克风后重试。','service-not-allowed':'浏览器语音服务不可用，请换用支持的浏览器或文字输入。','no-speech':'没有听清，请靠近麦克风再说一次。','network':'语音识别服务连接失败，可重试或使用文字输入。','audio-capture':'未找到可用麦克风，请检查设备。','aborted':'语音已取消。'};
      this.onError?.(errors[e.error]||'语音识别没有完成，请重试。');
    };
    r.onend=()=>{if(current()){completed=true;this.listening=false;this.recognition=null;this.onStatus?.('idle','准备聆听');}};
    try{r.start();}catch{completed=true;this.listening=false;this.recognition=null;this.onError?.('暂时无法启动麦克风，请稍后重试。');}
  }
  stop(){this.generation++;this.recognition?.abort();this.recognition=null;this.listening=false;window.speechSynthesis?.cancel();this.onStatus?.('idle','点击说话');}
  speak(text){
    if(this.muted||!window.speechSynthesis)return;
    window.speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(text);u.lang='zh-CN';u.rate=1.04;
    const voice=window.speechSynthesis.getVoices().find(v=>v.lang==='zh-CN')||window.speechSynthesis.getVoices().find(v=>v.lang.startsWith('zh'));
    if(voice)u.voice=voice;
    window.speechSynthesis.speak(u);
  }
  toggleMute(){this.muted=!this.muted;if(this.muted)window.speechSynthesis?.cancel();return this.muted;}
  dispose(){this.stop();}
}
