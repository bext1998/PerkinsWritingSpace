import {useEffect, useMemo, useRef, useState} from 'react';
import {ArrowLeft, BookMarked, Cloud, Cpu, KeyRound, Monitor, Moon, Palette, Plus, RefreshCw, RotateCcw, Save, Share2, Sun, Trash2} from 'lucide-react';
import {
    AgentsMdTokens, ClearCover, ConvertOptions, DeleteProfile, GetCover, GetResearch, GetSettings, ListModels, ListProfilePresets, PickCover, PreviewExport,
    ReadAgentsMd, RenameProject, ResetPlatforms, SavePlatforms, SaveProfile, SetAutosave, SetPaperLayout, SetResearch, SetTheme, WriteAgentsMd,
} from '../wailsjs/go/main/App';
import {main, project, publish, settings} from '../wailsjs/go/models';
import {Button} from '@/components/ui/button';
import {Badge, Checkbox, Input, Label, Switch, Textarea} from '@/components/ui/basic';
import {Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue} from '@/components/ui/overlay';
import {TITLEBAR_HEIGHT} from '@/lib/layout';
import {cn, errText} from '@/lib/utils';
import {GeneratedCover} from './Bookshelf';
import NotionImport from './NotionImport';
import {PAPER_FONT_SIZES, PAPER_PARA_GAPS, PAPER_WIDTHS, PaperLayout} from './paperLayout';

interface Props {
    tree: project.Tree | null;
    setTree: (t: project.Tree) => void;
    theme: string;
    setTheme: (t: string) => void;
    // 稿紙版面(版心寬度、字級、段距):與主題同一種保存方式(全域偏好,不是作品設定)
    paper: PaperLayout;
    setPaper: (p: PaperLayout) => void;
    onClose: () => void;
}

const SAMPLE = `# 第一章 出發

清晨的**王都**很安靜。
「走吧。」艾莉絲說。

***

<!-- 作者筆記:這裡之後要埋伏筆 -->
他們打開了軟體,出發了。`;

function Field({label, hint, children}: {label: string; hint?: string; children: React.ReactNode}) {
    // min-w-0 + minmax(0,1fr):640 寬(半螢幕)時 Input 的固有最小寬度不得把 1fr 欄撐出水平捲軸
    return (
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-1.5">
            <Label className="min-w-0">{label}</Label>
            {children}
            {hint && <p className="min-w-0 text-xs text-muted-foreground">{hint}</p>}
        </div>
    );
}

// ---- Perkins Bot 頁(Issue #38;原「AI 模型」頁)----

// 思考強度(#30):允許值依 Provider 而異。Radix Select 的 SelectItem value 不能是空字串,
// 「不指定」用 sentinel EFFORT_NONE,存回設定檔時轉回空字串。
const EFFORT_NONE = 'none';
const EFFORT_LABELS: Record<string, string> = {low: '低', medium: '中', high: '高', xhigh: '更高', max: '最高'};
// OpenAI 相容端點只收 low/medium/high;Anthropic 原生另有 xhigh/max(SPEC §12.3)
const effortsFor = (provider: string) => ['low', 'medium', 'high', ...(provider === 'anthropic' ? ['xhigh', 'max'] : [])];

// newProfileID:端點 id 只能小寫英文、數字、-(settings.ValidProfileID)
function newProfileID() {
    return 'p-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);
}

// Section 是「Perkins Bot」「外觀」頁的分區塊:標題 + 一句說明 + 內容
function Section({title, desc, children, testid}: {title: string; desc: string; children: React.ReactNode; testid?: string}) {
    return (
        <section aria-label={title} className="grid gap-4" data-testid={testid}>
            <div>
                <h2 className="font-serif text-lg font-semibold">{title}</h2>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{desc}</p>
            </div>
            {children}
        </section>
    );
}

// presetLabel:預設端點名稱 + 站別(國際站/中國站)+ API 型別,作者一眼可辨(#43)
function presetLabel(p: settings.Preset) {
    const region = p.region && !/國際站|中國站/.test(p.name) ? (p.region === 'intl' ? '(國際站)' : '(中國站)') : '';
    const provider = p.provider === 'anthropic' ? ' · Anthropic 原生' : '';
    return `${p.name}${region}${provider}`;
}

// AgentsEditor 是一份作者指示(AGENTS.md)的編輯區(Issue #38):作者本人編輯,按「儲存」才寫檔。
// 檔案不存在時編輯區為空、儲存即建立;內容清空並儲存 = 寫入空檔(不刪檔)。
// 估算長度與上限由後端以同一套估算提供(App.AgentsMdTokens / agent.AgentsLimit),前端不自己算。
function AgentsEditor({scope, title, hint}: {scope: 'global' | 'project'; title: string; hint: string}) {
    const [text, setText] = useState('');
    const [tokens, setTokens] = useState(0);
    const [limit, setLimit] = useState(4000);
    const [path, setPath] = useState('');
    const [msg, setMsg] = useState('');
    const [error, setError] = useState('');
    const seq = useRef(0);

    useEffect(() => {
        let alive = true;
        ReadAgentsMd(scope).then(v => {
            if (!alive) return;
            setText(v.text); setTokens(v.tokens); setLimit(v.limit); setPath(v.path);
        }).catch(e => { if (alive) setError(errText(e)); });
        return () => { alive = false; };
    }, [scope]);

    // 估算長度:輸入後 debounce 重算(與「超過上限整份不送出」用同一套估算)
    useEffect(() => {
        const s = ++seq.current;
        const id = setTimeout(() => {
            AgentsMdTokens(text).then(n => { if (s === seq.current) setTokens(n); }).catch(() => {});
        }, 300);
        return () => clearTimeout(id);
    }, [text]);

    const save = async () => {
        try {
            const v = await WriteAgentsMd(scope, text);
            setTokens(v.tokens); setLimit(v.limit); setPath(v.path);
            setMsg('已儲存。'); setError('');
        } catch (e) { setMsg(''); setError(errText(e)); }
    };

    return (
        <div className="grid gap-2 rounded-lg border p-4" data-testid={`agents-${scope}`}>
            <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                    <Label className="text-sm font-medium">{title}</Label>
                    <p className="mt-1 break-all text-xs text-muted-foreground">{path}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                    <span className={cn('text-xs', tokens > limit ? 'text-warning' : 'text-muted-foreground')} data-testid={`agents-${scope}-tokens`}>
                        約 {tokens} / {limit} 估算 tokens
                    </span>
                    <Button size="sm" onClick={save} data-testid={`agents-${scope}-save`}><Save/>儲存</Button>
                </div>
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">{hint}</p>
            <Textarea rows={7} className="min-w-0 font-mono text-xs leading-relaxed" value={text}
                      onChange={e => setText(e.target.value)} data-testid={`agents-${scope}-text`}/>
            {tokens > limit && (
                <p className="rounded-md bg-warning/10 p-2 text-xs text-warning" data-testid={`agents-${scope}-over`}>
                    超過長度上限:這份指示本次整份不送出(不會靜默截斷)。請刪減內容。
                </p>
            )}
            {msg && <p className="text-xs text-success">{msg}</p>}
            {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
    );
}

function PerkinsBotTab({cfg, setCfg, hasProject}: {cfg: main.SettingsView; setCfg: (c: main.SettingsView) => void; hasProject: boolean}) {
    const [selId, setSelId] = useState(cfg.active);
    const current = cfg.profiles.find(p => p.id === selId) ?? cfg.profiles[0];
    const [form, setForm] = useState<settings.Profile>(current);
    const [key, setKey] = useState('');
    const [models, setModels] = useState<string[]>([]);
    const [presets, setPresets] = useState<settings.Preset[]>([]);
    const [msg, setMsg] = useState('');
    const [error, setError] = useState('');

    useEffect(() => { setForm(current); setKey(''); setModels([]); setMsg(''); setError(''); }, [current?.id]);
    useEffect(() => { ListProfilePresets().then(setPresets).catch(() => setPresets([])); }, []);

    const save = async (apiKey: string | null) => {
        try {
            const c = await SaveProfile(form, apiKey as any);
            setCfg(c);
            setKey('');
            setMsg('已儲存。金鑰存在 Windows 憑證管理員,不會寫進任何專案或設定檔。');
            setError('');
        } catch (e) { setError(errText(e)); }
    };

    const load = async () => {
        try {
            await SaveProfile(form, null as any);
            setModels(await ListModels(form.id));
            setError('');
        } catch (e) { setError(errText(e)); setModels([]); }
    };

    const add = async () => {
        const id = newProfileID();
        try {
            const c = await SaveProfile({id, name: '新端點', baseUrl: 'https://openrouter.ai/api/v1', model: '', contextTokens: 32768} as settings.Profile, null as any);
            setCfg(c);
            setSelId(id);
        } catch (e) { setError(errText(e)); }
    };

    // 從預設新增(#43):帶入名稱、網址、Provider、建議上下文長度與預設模型;金鑰欄空白讓作者填
    const addFromPreset = async (presetID: string) => {
        const p = presets.find(x => x.id === presetID);
        if (!p) return;
        const id = newProfileID();
        try {
            const c = await SaveProfile({
                id,
                name: p.name,
                baseUrl: p.baseUrl,
                provider: p.provider || '',
                model: p.model || '',
                // 預設檔沒給建議值時用 §15 的預設上下文長度(16384),作者可再改
                contextTokens: p.contextTokens && p.contextTokens > 0 ? p.contextTokens : 16384,
            } as settings.Profile, null as any);
            setCfg(c);
            setSelId(id);
            setMsg('已從預設新增端點;請填入 API 金鑰(本機端點通常不需要)後按「儲存」。');
            setError('');
        } catch (e) { setError(errText(e)); }
    };

    const remove = async () => {
        try {
            const c = await DeleteProfile(form.id);
            setCfg(c);
            setSelId(c.active);
        } catch (e) { setError(errText(e)); }
    };

    // 換 Provider 時,新 Provider 不允許的思考強度重設為「不指定」(#30)
    const changeProvider = (v: string) => {
        setForm(f => ({...f, provider: v, reasoningEffort: effortsFor(v).includes(f.reasoningEffort ?? '') ? f.reasoningEffort : ''}));
    };

    const remote = useMemo(() => {
        try { return !['localhost', '127.0.0.1', '[::1]'].includes(new URL(form.baseUrl).hostname); } catch { return true; }
    }, [form.baseUrl]);
    const view = cfg.profiles.find(p => p.id === form.id);

    return (
        <div className="grid gap-8">
            <Section title="模型端點" desc="每個端點是一個模型服務(本機 LM Studio、雲端服務商…)。金鑰存 Windows 憑證管理員,不會寫進任何專案或設定檔。">
                {/* 窄寬度(lg 以下,含 640/768/960 半螢幕):清單與表單上下堆疊,表單滿寬;
                    否則 220px 清單 + 表單並排會把表單壓到約 148px,輸入框剩 24px(返回工#1,2026-10-07) */}
                <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
                    <div className="space-y-1">
                        {cfg.profiles.map(p => (
                            <button key={p.id} onClick={() => setSelId(p.id)}
                                    className={cn('flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm', p.id === form.id ? 'bg-accent' : 'hover:bg-accent/60')}>
                                {p.remote ? <Cloud className="h-4 w-4 text-muted-foreground"/> : <Monitor className="h-4 w-4 text-muted-foreground"/>}
                                <span className="flex-1 truncate">{p.name}</span>
                                {p.id === cfg.active && <Badge variant="secondary" className="text-xs">使用中</Badge>}
                            </button>
                        ))}
                        {/* 從預設新增(#43):依「本機/服務商」分組,國際站/中國站與 Anthropic 原生在選項上標示 */}
                        <Select onValueChange={addFromPreset}>
                            <SelectTrigger data-testid="preset-select" className="mt-2 w-full text-xs">
                                <SelectValue placeholder="從預設新增…"/>
                            </SelectTrigger>
                            <SelectContent>
                                <SelectGroup>
                                    <SelectLabel>本機</SelectLabel>
                                    {presets.filter(p => p.local).map(p => (
                                        <SelectItem key={p.id} value={p.id} data-testid={`preset-opt-${p.id}`}>{presetLabel(p)}</SelectItem>
                                    ))}
                                </SelectGroup>
                                <SelectGroup>
                                    <SelectLabel>服務商</SelectLabel>
                                    {presets.filter(p => !p.local).map(p => (
                                        <SelectItem key={p.id} value={p.id} data-testid={`preset-opt-${p.id}`}>{presetLabel(p)}</SelectItem>
                                    ))}
                                </SelectGroup>
                            </SelectContent>
                        </Select>
                        <Button variant="ghost" size="sm" className="w-full justify-start" onClick={add} data-testid="add-profile"><Plus/>新增空白端點</Button>
                    </div>
                    <div className="grid grid-cols-[minmax(0,1fr)] max-w-xl gap-4">
                        <Field label="名稱"><Input value={form.name} onChange={e => setForm({...form, name: e.target.value})}/></Field>
                        <Field label="端點網址" hint="OpenAI 相容的 /v1 位址。LM Studio 預設為 http://localhost:1234/v1。">
                            <Input value={form.baseUrl} onChange={e => setForm({...form, baseUrl: e.target.value})} data-testid="profile-url"/>
                        </Field>
                        {remote && (
                            <p className="rounded-md bg-warning/10 p-2 text-xs text-warning">
                                這個端點不在本機。使用時,附加的稿件與設定會傳到該服務;每次啟動 Perkins WritingSpace 後第一次送出前都會再確認一次。
                            </p>
                        )}
                        <Field label="API 型別" hint="Anthropic 官方端點選「Anthropic 原生」,其他服務與本機模型選「OpenAI 相容」。">
                            <Select value={form.provider || 'openai'} onValueChange={changeProvider}>
                                <SelectTrigger data-testid="provider-select"><SelectValue/></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="openai" data-testid="provider-opt-openai">OpenAI 相容(/chat/completions)</SelectItem>
                                    <SelectItem value="anthropic" data-testid="provider-opt-anthropic">Anthropic 原生(Messages API)</SelectItem>
                                </SelectContent>
                            </Select>
                        </Field>
                        <Field label="思考強度" hint="強度越高越慢、花費越多;本機模型多半不支援,保持「不指定」。">
                            <Select value={form.reasoningEffort || EFFORT_NONE} onValueChange={v => setForm({...form, reasoningEffort: v === EFFORT_NONE ? '' : v})}>
                                <SelectTrigger data-testid="effort-select"><SelectValue/></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value={EFFORT_NONE} data-testid="effort-opt-none">不指定(服務商預設)</SelectItem>
                                    {effortsFor(form.provider || 'openai').map(e => (
                                        <SelectItem key={e} value={e} data-testid={`effort-opt-${e}`}>{EFFORT_LABELS[e]}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </Field>
                        <Field label="模型">
                            <div className="flex flex-wrap gap-2">
                                <Input list="model-list" className="min-w-0 flex-1" value={form.model} onChange={e => setForm({...form, model: e.target.value})} placeholder="模型 id"/>
                                <datalist id="model-list">{models.map(m => <option key={m} value={m}/>)}</datalist>
                                <Button variant="outline" onClick={load}><RefreshCw/>載入清單</Button>
                            </div>
                        </Field>
                        <Field label="上下文長度(tokens)" hint="用來估算能送多少內容;自動壓縮開啟時,超過會先濃縮較早的對話。請依模型實際設定填寫(LM Studio 在載入模型時設定)。">
                            <Input type="number" min={2048} step={1024} value={form.contextTokens}
                                   onChange={e => setForm({...form, contextTokens: Number(e.target.value)})}/>
                        </Field>
                        <Field label="自動壓縮上下文" hint="關閉後,對話超過上下文長度時會擋下不送出,不會自動濃縮;請在聊天輸入 /compact 手動壓縮較早的對話,或開新對話。">
                            <label className="flex items-center gap-2 text-sm">
                                <Checkbox checked={!form.disableAutoCompact}
                                          onCheckedChange={v => setForm({...form, disableAutoCompact: v !== true})}
                                          data-testid="auto-compact-setting"/>
                                <span>開啟:超過上限時自動把較早的對話濃縮成摘要</span>
                            </label>
                        </Field>
                        <Field label="API 金鑰" hint={view?.hasKey ? '已儲存金鑰。留空表示不變更。' : '本機模型通常不需要。'}>
                            <div className="flex gap-2">
                                <div className="relative flex-1">
                                    <KeyRound className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground"/>
                                    <Input type="password" className="pl-8" value={key} onChange={e => setKey(e.target.value)} placeholder={view?.hasKey ? '••••••••' : ''}/>
                                </div>
                                {view?.hasKey && <Button variant="outline" onClick={() => save('')}>清除金鑰</Button>}
                            </div>
                        </Field>
                        {msg && <p className="text-xs text-success">{msg}</p>}
                        {error && <p className="text-xs text-destructive">{error}</p>}
                        <div className="flex flex-wrap gap-2">
                            <Button onClick={() => save(key ? key : null)} data-testid="save-profile"><Save/>儲存</Button>
                            <Button variant="ghost" className="text-destructive" disabled={cfg.profiles.length <= 1} onClick={remove}><Trash2/>刪除端點</Button>
                        </div>
                    </div>
                </div>
            </Section>
            <Section title="作者指示(AGENTS.md)" testid="agents-section"
                     desc="每次送出都會放進系統訊息的通用指示。兩層:作品層優先;不論哪一層都不能改變系統規則(AI 只能閱讀獲准內容、只能提出修改提案)。按「儲存」才寫檔;超過長度上限(估算 tokens)時整份不送出並在送出預覽說明原因。">
                <AgentsEditor scope="global" title="全域指示(所有作品)"
                              hint="放在 %APPDATA%\Perkins\AGENTS.md。作品資料夾裡沒有 AGENTS.md 時用這份。"/>
                {hasProject && (
                    <AgentsEditor scope="project" title="目前作品指示"
                                  hint="放在作品資料夾根目錄的 AGENTS.md(其他 coding agent 也會讀同一份)。與全域指示衝突時以這份為準。"/>
                )}
            </Section>
        </div>
    );
}

function PlatformsTab({cfg, setCfg}: {cfg: main.SettingsView; setCfg: (c: main.SettingsView) => void}) {
    const [list, setList] = useState<publish.Platform[]>(cfg.platforms);
    const [sel, setSel] = useState(0);
    const [out, setOut] = useState('');
    const [opts, setOpts] = useState<main.Option[]>([]);
    const [msg, setMsg] = useState('');
    const [error, setError] = useState('');
    const p = list[sel];

    useEffect(() => { ConvertOptions().then(setOpts); }, []);
    useEffect(() => {
        if (!p) return;
        PreviewExport(SAMPLE, p.rules).then(setOut).catch(e => setOut('錯誤:' + errText(e)));
    }, [p]);

    const update = (patch: Partial<publish.Platform> | {rules: Partial<publish.Rules>}) => {
        setList(l => l.map((x, i) => i !== sel ? x : {...x, ...patch, rules: {...x.rules, ...('rules' in patch ? patch.rules : {})}} as publish.Platform));
        setMsg('');
    };

    const save = async () => {
        try { setCfg(await SavePlatforms(list)); setMsg('已儲存。'); setError(''); } catch (e) { setError(errText(e)); }
    };
    const reset = async () => {
        try { const c = await ResetPlatforms(); setCfg(c); setList(c.platforms); setSel(0); setMsg('已恢復內建預設。'); } catch (e) { setError(errText(e)); }
    };
    const add = () => {
        setList(l => [...l, {id: 'custom-' + Date.now().toString(36), name: '新平台', verified: false,
            rules: {indent: true, blankLine: true, heading: 'drop', sceneBreak: '◇◇◇', convert: ''}} as publish.Platform]);
        setSel(list.length);
    };

    return (
        // 窄寬度(lg 以下,含 640/768/960 半螢幕):清單與表單上下堆疊,表單滿寬(同 ModelsTab)
        <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
            <div className="space-y-1">
                {list.map((x, i) => (
                    <button key={x.id} onClick={() => setSel(i)}
                            className={cn('flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm', i === sel ? 'bg-accent' : 'hover:bg-accent/60')}>
                        <span className="flex-1 truncate">{x.name}</span>
                        {x.verified ? <Badge variant="success" className="text-xs">已驗證</Badge> : <Badge variant="outline" className="text-xs text-muted-foreground">未驗證</Badge>}
                    </button>
                ))}
                <Button variant="ghost" size="sm" className="w-full justify-start" onClick={add}><Plus/>新增平台</Button>
            </div>
            {p && (
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                    <div className="grid content-start gap-4">
                        <p className="rounded-md bg-muted p-2 text-xs leading-relaxed text-muted-foreground">
                            內建的平台規則是推測值,沒有實際貼上驗證過。實際發文後如果版面不對,請在這裡調整,確認無誤後打開「已驗證」。
                        </p>
                        <Field label="名稱"><Input value={p.name} onChange={e => update({name: e.target.value})}/></Field>
                        <div className="flex items-center justify-between"><Label>段首縮排兩個全形空格</Label>
                            <Switch checked={p.rules.indent} onCheckedChange={v => update({rules: {indent: v}})}/></div>
                        <div className="flex items-center justify-between"><Label>段落之間空一行</Label>
                            <Switch checked={p.rules.blankLine} onCheckedChange={v => update({rules: {blankLine: v}})}/></div>
                        <Field label="章節標題">
                            <Select value={p.rules.heading || 'strip'} onValueChange={v => update({rules: {heading: v}})}>
                                <SelectTrigger><SelectValue/></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="strip">保留標題文字(去掉 #)</SelectItem>
                                    <SelectItem value="drop">不輸出標題(平台另外填)</SelectItem>
                                </SelectContent>
                            </Select>
                        </Field>
                        <Field label="場景分隔符號" hint="稿件中的 ***、---、◇◇◇ 會換成這個;留空則只空一行。">
                            <Input value={p.rules.sceneBreak} onChange={e => update({rules: {sceneBreak: e.target.value}})}/>
                        </Field>
                        <Field label="繁簡轉換" hint="「含用詞」會把「軟體」換成「软件」等,會改變你的用詞,請確認後再用。">
                            <Select value={p.rules.convert || 'none'} onValueChange={v => update({rules: {convert: v === 'none' ? '' : v}})}>
                                <SelectTrigger><SelectValue/></SelectTrigger>
                                <SelectContent>
                                    {opts.map(o => <SelectItem key={o.id || 'none'} value={o.id || 'none'}>{o.label}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </Field>
                        <div className="flex items-center justify-between"><Label>已實際貼上驗證</Label>
                            <Switch checked={p.verified} onCheckedChange={v => update({verified: v})}/></div>
                        {msg && <p className="text-xs text-success">{msg}</p>}
                        {error && <p className="text-xs text-destructive">{error}</p>}
                        <div className="flex flex-wrap gap-2">
                            <Button onClick={save}><Save/>儲存</Button>
                            <Button variant="ghost" onClick={reset}><RotateCcw/>恢復內建預設</Button>
                            <Button variant="ghost" className="text-destructive" onClick={() => { setList(l => l.filter((_, i) => i !== sel)); setSel(0); }}>
                                <Trash2/>
                            </Button>
                        </div>
                    </div>
                    <div className="grid content-start gap-2">
                        <Label>預覽(範例文字)</Label>
                        <pre className="min-h-[20rem] whitespace-pre-wrap rounded-md border bg-paper p-3 font-serif text-sm leading-relaxed" data-testid="platform-preview">{out}</pre>
                        <p className="text-xs text-muted-foreground">作者筆記(&lt;!-- --&gt;)永遠不會被輸出。</p>
                    </div>
                </div>
            )}
        </div>
    );
}

function ProjectTab({tree, setTree, autosave, onSetAutosave}: {
    tree: project.Tree;
    setTree: (t: project.Tree) => void;
    autosave: boolean;
    onSetAutosave: (on: boolean) => Promise<void>;
}) {
    const [name, setName] = useState(tree.name);
    const [cover, setCover] = useState('');
    const [error, setError] = useState('');
    const [autosaveSaving, setAutosaveSaving] = useState(false);
    const [autosaveError, setAutosaveError] = useState('');
    const [researchOn, setResearchOn] = useState<boolean | null>(null); // null = 尚未載入
    const [researchSaving, setResearchSaving] = useState(false);
    const [researchError, setResearchError] = useState('');
    // 研究記錄載入失敗:保持未知(researchOn=null)、Switch 停用並顯示錯誤,不得冒充關閉
    useEffect(() => { GetCover().then(setCover); GetResearch().then(setResearchOn).catch(e => { setResearchError(errText(e)); }); }, []);

    return (
        <div className="grid gap-8">
            {/* 區塊一:基本資料(小標題 + 封面/欄位;窄寬度 flex-wrap 換行,不重疊) */}
            <section aria-labelledby="proj-basic" className="grid gap-4">
                <h2 id="proj-basic" className="font-serif text-lg font-semibold">基本資料</h2>
                <div className="flex flex-wrap items-start gap-6">
                    <div className="h-[220px] w-[156px] shrink-0 overflow-hidden rounded-r-md rounded-l-sm border">
                        {cover ? <img src={cover} className="h-full w-full object-cover" alt=""/> : <GeneratedCover name={name || tree.name}/>}
                    </div>
                    <div className="grid min-w-[260px] flex-1 content-start gap-4">
                        <Field label="作品名稱">
                            <div className="flex gap-2">
                                <Input value={name} onChange={e => setName(e.target.value)}/>
                                <Button disabled={!name.trim() || name === tree.name}
                                        onClick={() => RenameProject(name).then(setTree).catch(e => setError(errText(e)))}><Save/>儲存</Button>
                            </div>
                        </Field>
                        <Field label="封面" hint="顯示在書櫃上。沒有設定時依作品名稱自動產生。">
                            <div className="flex gap-2">
                                <Button variant="outline" onClick={() => PickCover().then(c => c && setCover(c)).catch(e => setError(errText(e)))}>選擇圖片</Button>
                                {cover && <Button variant="ghost" onClick={() => ClearCover().then(() => setCover(''))}>移除封面</Button>}
                            </div>
                        </Field>
                        {error && <p className="text-xs text-destructive">{error}</p>}
                    </div>
                </div>
            </section>
            {/* 區塊二:自動存檔(SPEC §17.3):只提供開關,不提供間隔設定 */}
            <div className="flex items-start gap-4 rounded-lg border p-4" data-testid="autosave-row">
                <div className="flex-1">
                    <Label className="text-sm font-medium">自動存檔</Label>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                        停止輸入 2 秒後自動存檔,不建立版本快照。
                    </p>
                    {autosaveError && <p className="mt-1 text-xs text-destructive" data-testid="autosave-error">無法儲存自動存檔設定:{autosaveError}</p>}
                </div>
                <Switch data-testid="autosave-switch" checked={autosave} disabled={autosaveSaving}
                        onCheckedChange={async v => {
                            setAutosaveSaving(true);
                            try {
                                await onSetAutosave(v); // 後端保存成功才更新畫面
                                setAutosaveError('');
                            } catch (e) { setAutosaveError(errText(e)); /* 失敗保持原值 */ }
                            setAutosaveSaving(false);
                        }}/>
            </div>
            {/* 區塊三:研究記錄(§12.8):間距只靠容器 gap-8,不再 mt-6 疊加(SPEC §17.2) */}
            <div className="flex items-start gap-4 rounded-lg border p-4" data-testid="research-row">
                <div className="flex-1">
                    <Label className="text-sm font-medium">研究記錄</Label>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                        開啟後,本作品的操作、送給 AI 的內容與 AI 回覆會記錄在 .perkins/research.jsonl,只存在這台電腦。
                        檔案位置:作品資料夾\.perkins\research.jsonl。
                    </p>
                    {researchError && <p className="mt-1 text-xs text-destructive" data-testid="research-load-error">無法讀取研究記錄狀態:{researchError}</p>}
                </div>
                <Switch data-testid="research-switch" checked={researchOn === true}
                        disabled={researchOn === null || researchSaving || !!researchError}
                        onCheckedChange={async v => {
                            setResearchSaving(true);
                            try {
                                await SetResearch(v);
                                setResearchOn(v); // 後端保存成功才更新畫面
                            } catch (e) { setError(errText(e)); /* 失敗保持原值 */ }
                            setResearchSaving(false);
                        }}/>
            </div>
            {/* 區塊四:從 Notion 匯入(NotionImport 自帶小標題) */}
            <NotionImport onDone={() => {}}/>
        </div>
    );
}

// ---- 外觀頁(Issue #88):主題與稿紙版面,重新排版為「左邊名稱+說明、右邊控制項」的列 ----

const THEME_CARDS = [
    {id: 'dark', name: '夜間書房', desc: '深色底、暖色調光線;夜間或低光環境長時間寫作。', Icon: Moon},
    {id: 'light', name: '白紙', desc: '白底黑字,接近紙張;白天或明亮環境。', Icon: Sun},
];

function AppearanceTab({theme, setTheme, paper, setPaper}: Pick<Props, 'theme' | 'setTheme' | 'paper' | 'setPaper'>) {
    // 主題與稿紙版面都是作者的全域偏好:即按即存、立即套用,重開設定與重啟應用都保留
    const changeTheme = (t: string) => { setTheme(t); SetTheme(t); };
    const changePaper = (key: keyof PaperLayout, v: string) => {
        const next = {...paper, [key]: v};
        setPaper(next);
        SetPaperLayout(next.width, next.fontSize, next.gap);
    };
    const paperRow = (key: keyof PaperLayout, testid: string, label: string, desc: string, opts: {value: string; label: string}[]) => (
        <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-2">
            <div className="min-w-[12rem] flex-1">
                <Label className="text-sm">{label}</Label>
                <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{desc}</p>
            </div>
            <Select value={paper[key]} onValueChange={v => changePaper(key, v)}>
                <SelectTrigger data-testid={testid} className="h-8 w-[8.5rem] shrink-0 text-xs"><SelectValue/></SelectTrigger>
                <SelectContent>
                    {opts.map(o => <SelectItem key={o.value} value={o.value} data-testid={`${testid}-opt-${o.value}`}>{o.label}</SelectItem>)}
                </SelectContent>
            </Select>
        </div>
    );

    return (
        <div className="grid gap-8">
            <Section title="主題" testid="appearance-theme" desc="即按即存並立即套用;重開設定與重啟應用都還是你選的主題。">
                <div className="grid gap-3 sm:grid-cols-2">
                    {THEME_CARDS.map(({id, name, desc, Icon}) => (
                        <button key={id} onClick={() => changeTheme(id)} aria-pressed={theme === id}
                                data-testid={`theme-${id}`}
                                className={cn('flex items-start gap-3 rounded-lg border p-4 text-left',
                                    theme === id ? 'border-primary bg-accent' : 'hover:bg-accent/60')}>
                            <Icon className="mt-0.5 h-7 w-7 shrink-0"/>
                            <span className="min-w-0">
                                <span className="block text-sm font-medium">{name}</span>
                                <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{desc}</span>
                            </span>
                        </button>
                    ))}
                </div>
            </Section>
            <Section title="稿紙版面" testid="paper-layout"
                     desc="編輯區的版心寬度、字級與段距(作者的全域偏好,不是作品設定)。只提供預設檔,即按即存並立即套用到開著的編輯器。">
                <div className="grid divide-y rounded-lg border py-1">
                    {paperRow('width', 'paper-width', '版心寬度', '正文欄的最大寬度;視窗比版心窄時照常填滿可用寬度。', PAPER_WIDTHS)}
                    {paperRow('fontSize', 'paper-font-size', '字級', '正文的字體大小;標題與場景分隔行等比縮放。', PAPER_FONT_SIZES)}
                    {paperRow('gap', 'paper-gap', '段距', '段落之間的距離。', PAPER_PARA_GAPS)}
                </div>
            </Section>
        </div>
    );
}

export default function SettingsPage({tree, setTree, theme, setTheme, paper, setPaper, onClose}: Props) {
    const [cfg, setCfg] = useState<main.SettingsView | null>(null);
    const [page, setPage] = useState<'project' | 'models' | 'platforms' | 'appearance'>('models'); // 預設頁維持 Perkins Bot(SPEC §17.2)
    useEffect(() => { GetSettings().then(setCfg); }, []);
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !document.querySelector('[role=dialog],[data-radix-popper-content-wrapper]')) onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    // 自動存檔(SPEC §17.3):寫入設定檔成功後才更新畫面;Workspace 在設定頁關閉時重讀設定。
    const setAutosave = async (on: boolean) => {
        await SetAutosave(on);
        setCfg(c => c ? main.SettingsView.createFrom({...c, autosave: on}) : c);
    };

    const navBtn = (id: 'project' | 'models' | 'platforms' | 'appearance', label: string, Icon: typeof Cpu) => (
        <button data-testid={`tab-${id}`} onClick={() => setPage(id)}
                aria-current={page === id}
                className={cn('flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm',
                    page === id ? 'bg-accent font-medium text-foreground' : 'text-muted-foreground hover:bg-accent/60')}>
            <Icon className="h-4 w-4"/>{label}
        </button>
    );

    return (
        <div style={{top: TITLEBAR_HEIGHT}}
             className="fixed inset-x-0 bottom-0 z-50 flex flex-col overflow-hidden bg-background" data-testid="settings-page">
            {/* 頁首:返回 + 標題 */}
            <div className="flex shrink-0 items-center gap-3 border-b px-6 py-3">
                <Button variant="ghost" size="icon" onClick={onClose} data-testid="close-settings"><ArrowLeft/></Button>
                <h1 className="font-serif text-2xl font-bold">設定</h1>
            </div>
            <div className="flex min-h-0 flex-1">
                {/* 左側導覽欄(約 200px,選中態明顯);主題與稿紙版面搬到「外觀」頁(Issue #88) */}
                <nav data-testid="settings-nav" className="flex w-[200px] shrink-0 flex-col gap-1 border-r bg-sidebar p-3">
                    {tree && navBtn('project', '作品', BookMarked)}
                    {navBtn('models', 'Perkins Bot', Cpu)}
                    {navBtn('platforms', '平台輸出', Share2)}
                    {navBtn('appearance', '外觀', Palette)}
                </nav>
                {/* 內容區:獨立捲動、單一 max-w-5xl 置中(SPEC §17.2) */}
                <div data-testid="settings-content" className="min-w-0 flex-1 overflow-y-auto">
                    {cfg && (
                        <div className="mx-auto w-full max-w-5xl px-6 py-6">
                            {page === 'project' && tree && <ProjectTab tree={tree} setTree={setTree} autosave={cfg.autosave} onSetAutosave={setAutosave}/>}
                            {page === 'models' && <PerkinsBotTab cfg={cfg} setCfg={setCfg} hasProject={!!tree}/>}
                            {page === 'platforms' && <PlatformsTab cfg={cfg} setCfg={setCfg}/>}
                            {page === 'appearance' && <AppearanceTab theme={theme} setTheme={setTheme} paper={paper} setPaper={setPaper}/>}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
