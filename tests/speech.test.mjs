import test from 'node:test';
import assert from 'node:assert/strict';
import { VoiceIO } from '../speech.js';

// 这些测试仅模拟浏览器回调，不证明真实麦克风、音频设备或在线识别成功。
function withBrowser(run, { recognition = true, synthesis = true, startThrows = false } = {}) {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const originalUtterance = Object.getOwnPropertyDescriptor(globalThis, 'SpeechSynthesisUtterance');
  const recognized = [], transcripts = [], errors = [], statuses = [];
  class FakeRecognition {
    static instances = [];
    constructor() { FakeRecognition.instances.push(this); this.aborted = false; }
    start() {
      if (startThrows) throw new Error('模拟麦克风启动失败');
      this.onstart?.();
    }
    abort() {
      this.aborted = true;
      // 模拟 abort 同步派发取消与结束事件，验证先使旧会话失效。
      this.onerror?.({ error: 'aborted' });
      this.onend?.();
    }
    result(text, isFinal = true) {
      const result = [{ transcript: text }]; result.isFinal = isFinal;
      this.onresult?.({ results: [result], resultIndex: 0 });
    }
    error(error) { this.onerror?.({ error }); }
    end() { this.onend?.(); }
  }
  const utterances = [];
  const synth = {
    cancellations: 0,
    cancel() { this.cancellations++; },
    getVoices() { return [{ name: '英文测试音色', lang: 'en-US' }, { name: '中文测试音色', lang: 'zh-CN' }]; },
    speak(utterance) { utterances.push(utterance); },
  };
  const fakeWindow = {};
  if (recognition) fakeWindow.SpeechRecognition = FakeRecognition;
  if (synthesis) fakeWindow.speechSynthesis = synth;
  globalThis.window = fakeWindow;
  globalThis.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
  const voice = new VoiceIO({
    onResult: text => recognized.push(text),
    onTranscript: text => transcripts.push(text),
    onError: text => errors.push(text),
    onStatus: (...args) => statuses.push(args),
  });
  try {
    run({ voice, FakeRecognition, recognized, transcripts, errors, statuses, utterances, synth });
  } finally {
    voice.dispose();
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow); else delete globalThis.window;
    if (originalUtterance) Object.defineProperty(globalThis, 'SpeechSynthesisUtterance', originalUtterance); else delete globalThis.SpeechSynthesisUtterance;
  }
}

test('模拟回调：取消后旧识别结果与错误不得触发车辆执行或覆盖状态', () => {
  withBrowser(({ voice, FakeRecognition, recognized, transcripts, errors, statuses }) => {
    voice.start(); const old = FakeRecognition.instances[0];
    old.result('打开主驾', false);
    voice.stop();
    const statusCount = statuses.length, transcriptCount = transcripts.length;
    old.result('打开主驾车窗'); old.error('network'); old.end(); old.onstart();
    assert.equal(old.aborted, true);
    assert.deepEqual(recognized, []);
    assert.deepEqual(errors, []);
    assert.equal(statuses.length, statusCount);
    assert.equal(transcripts.length, transcriptCount);
    assert.equal(voice.listening, false);
  });
});

test('模拟回调：开始新识别使旧会话失效，旧结果不能混入新命令', () => {
  withBrowser(({ voice, FakeRecognition, recognized, errors }) => {
    voice.start(); const old = FakeRecognition.instances[0];
    voice.start(); const current = FakeRecognition.instances[1];
    old.result('打开车门'); old.end();
    assert.equal(voice.recognition, current);
    assert.equal(voice.listening, true);
    current.result('副驾温度调到二十四度');
    assert.deepEqual(recognized, ['副驾温度调到二十四度']);
    assert.deepEqual(errors, []);
  });
});

test('模拟回调：临时结果只转写，同一会话重复最终结果只执行一次', () => {
  withBrowser(({ voice, FakeRecognition, recognized, transcripts, statuses, errors }) => {
    voice.start(); const current = FakeRecognition.instances[0];
    current.result('打开', false); current.result('打开后排屏', false);
    assert.deepEqual(recognized, []);
    current.result('打开后排屏');
    current.result('打开后排屏'); current.error('network'); current.end();
    assert.deepEqual(recognized, ['打开后排屏']);
    assert.deepEqual(transcripts, ['打开', '打开后排屏', '打开后排屏']);
    assert.equal(statuses.filter(([status]) => status === 'processing').length, 1);
    assert.deepEqual(errors, []);
    assert.equal(voice.listening, false);
    assert.equal(voice.recognition, null);
  });
});

test('模拟回调：用户重新发起相同命令可以再次执行，不跨会话误去重', () => {
  withBrowser(({ voice, FakeRecognition, recognized }) => {
    voice.start(); FakeRecognition.instances[0].result('再低一点');
    voice.start(); FakeRecognition.instances[1].result('再低一点');
    assert.deepEqual(recognized, ['再低一点', '再低一点']);
  });
});

for (const [code, expected] of [['not-allowed', /麦克风权限未允许/], ['network', /语音识别服务连接失败/]]) {
  test(`模拟回调：${code} 正确反馈，并拦截报错后的迟到结果`, () => {
    withBrowser(({ voice, FakeRecognition, errors, recognized, statuses }) => {
      voice.start(); const current = FakeRecognition.instances[0];
      current.error(code);
      assert.equal(errors.length, 1); assert.match(errors[0], expected);
      assert.deepEqual(statuses.at(-1), ['error', '语音未完成']);
      current.result('打开所有车门'); current.error(code); current.end();
      assert.deepEqual(recognized, []);
      assert.equal(errors.length, 1);
      assert.equal(voice.listening, false);
      assert.equal(voice.recognition, null);
    });
  });
}

test('模拟回调：没有最终结果就结束的会话恢复待机，并拒绝迟到结果', () => {
  withBrowser(({ voice, FakeRecognition, statuses, recognized }) => {
    voice.start(); const current = FakeRecognition.instances[0];
    current.result('打开', false); current.end();
    assert.deepEqual(statuses.at(-1), ['idle', '准备聆听']);
    current.result('打开车门');
    assert.deepEqual(recognized, []);
  });
});

test('模拟浏览器：未提供识别接口时提示文字输入，不伪造识别成功', () => {
  withBrowser(({ voice, recognized, errors }) => {
    assert.equal(voice.available, false);
    voice.start();
    assert.equal(errors.length, 1);
    assert.match(errors[0], /浏览器未提供语音识别/);
    assert.match(errors[0], /文字体验/);
    assert.deepEqual(recognized, []);
    assert.equal(voice.listening, false);
  }, { recognition: false });
});

test('模拟回调：启动抛错后拒绝迟到结果，明确提示麦克风启动失败', () => {
  withBrowser(({ voice, FakeRecognition, recognized, errors }) => {
    voice.start();
    assert.match(errors[0], /无法启动麦克风/);
    FakeRecognition.instances[0].result('打开车门');
    assert.deepEqual(recognized, []);
    assert.equal(voice.recognition, null);
    assert.equal(voice.listening, false);
  }, { startThrows: true });
});

test('模拟播报：开启静音立即停止播报并阻止后续播报，取消静音可恢复', () => {
  withBrowser(({ voice, utterances, synth }) => {
    voice.speak('已将副驾温度调至二十四度');
    assert.equal(utterances.length, 1);
    assert.equal(utterances[0].lang, 'zh-CN');
    assert.equal(utterances[0].voice.lang, 'zh-CN');
    const beforeMute = synth.cancellations;
    assert.equal(voice.toggleMute(), true);
    assert.equal(synth.cancellations, beforeMute + 1);
    voice.speak('这段不应播报');
    assert.equal(utterances.length, 1);
    assert.equal(voice.toggleMute(), false);
    voice.speak('播报已恢复');
    assert.equal(utterances.length, 2);
    assert.equal(utterances[1].text, '播报已恢复');
  });
});

test('模拟浏览器：无播报接口时仍可使用文字，不抛异常', () => {
  withBrowser(({ voice, recognized }) => {
    assert.doesNotThrow(() => voice.speak('模拟执行成功'));
    assert.doesNotThrow(() => voice.toggleMute());
    assert.deepEqual(recognized, []);
  }, { synthesis: false });
});
