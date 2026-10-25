// 打字機音效(#116):Web Audio 程式合成,不用音檔、不加依賴,不能阻塞輸入。
// AudioContext 第一次播放時才建立(瀏覽器自動播放政策要求使用者互動後才建立);
// 建立後 state 為 suspended 時 resume(不 await,不阻塞輸入)。
let ctx: AudioContext | null = null;

function context(): AudioContext {
    if (!ctx) ctx = new AudioContext();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
}

// E2E 計數(DEV 只有):無頭環境聽不到聲音,用呼叫計數驗證(每次呼叫都先加計數再判斷 volume)
const counts = {tick: 0, ding: 0};
if (import.meta.env.DEV) (window as any).__perkinsSound = counts;

// 「噠」:約 30ms 的白噪音,經 bandpass(約 2500Hz、Q 約 1),增益指數衰減到 0.001。
export function playTick(volume: number) {
    counts.tick++;
    if (volume <= 0) return;
    const ac = context();
    const len = Math.floor(ac.sampleRate * 0.03);
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = ac.createBufferSource();
    src.buffer = buf;
    const filter = ac.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 2500;
    filter.Q.value = 1;
    const gain = ac.createGain();
    gain.gain.setValueAtTime(0.6 * volume / 100, ac.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.03);
    src.connect(filter).connect(gain).connect(ac.destination);
    src.start();
    src.onended = () => { src.disconnect(); gain.disconnect(); };
}

// 「叮」:兩個 sine(約 1568Hz 與 2637Hz)一起,增益從 0.3 倍指數衰減到 0.001(約 0.8 秒)。
export function playDing(volume: number) {
    counts.ding++;
    if (volume <= 0) return;
    const ac = context();
    const gain = ac.createGain();
    gain.gain.setValueAtTime(0.3 * volume / 100, ac.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.8);
    gain.connect(ac.destination);
    for (const f of [1568, 2637]) {
        const osc = ac.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = f;
        osc.connect(gain);
        osc.start();
        osc.stop(ac.currentTime + 0.8);
    }
    // 衰減完後移除增益節點,不讓已停止的音效堆積
    window.setTimeout(() => gain.disconnect(), 900);
}
