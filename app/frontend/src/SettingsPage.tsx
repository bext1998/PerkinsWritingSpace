import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {ArrowLeft, BookMarked, ChevronRight, Cloud, Cpu, KeyRound, Monitor, Moon, Palette, Plus, RefreshCw, RotateCcw, Save, Share2, Sun, Trash2} from 'lucide-react';
import {
    AgentsMdTokens, ClearCover, ConvertOptions, DeleteProfile, GetBotRead, GetCover, GetResearch, GetSettings, ListModels, ListProfilePresets, PickCover, PreviewExport,
    ReadAgentsMd, RenameProject, ResetPlatforms, SavePlatforms, SaveProfile, SetAppearance, SetAutosave, SetBotRead, SetPaperLayout, SetResearch, WriteAgentsMd,
} from '../wailsjs/go/main/App';
import {main, project, publish, settings} from '../wailsjs/go/models';
import {ACCENT_PRESETS, contrastRatio, hexToHSL} from './appearance';
import {Button} from '@/components/ui/button';
import {Badge, Checkbox, Input, Label, Switch, Textarea} from '@/components/ui/basic';
import {Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue, Tip} from '@/components/ui/overlay';
import {TITLEBAR_HEIGHT} from '@/lib/layout';
import {cn, errText} from '@/lib/utils';
import {GeneratedCover} from './Bookshelf';
import NotionImport from './NotionImport';
import {PAPER_FONT_SIZES, PAPER_PARA_GAPS, PAPER_WIDTHS, PaperLayout} from './paperLayout';

interface Props {
    tree: project.Tree | null;
    setTree: (t: project.Tree) => void;
    // 外觀(Issue #118):模式、各側主題與自訂色、字級、減少動態
    appearance: settings.Appearance;
    setAppearance: (a: settings.Appearance) => void;
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

// Section(UI_GUIDE §12.1):區塊標題與一句說明放在卡片外,內容(通常是一張設定卡片)在下
function Section({title, desc, children, testid}: {title: string; desc: string; children: React.ReactNode; testid?: string}) {
    return (
        <section aria-label={title} className="grid gap-3" data-testid={testid}>
            <div>
                <h2 className="text-sm font-semibold">{title}</h2>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{desc}</p>
            </div>
            {children}
        </section>
    );
}

// 設定卡片:各列以分隔線隔開(UI_GUIDE §12.1)
function RowCard({children, testid}: {children: React.ReactNode; testid?: string}) {
    return <div className="grid divide-y overflow-hidden rounded-lg border" data-testid={testid}>{children}</div>;
}

// 設定列:左名稱+說明、右控制項;窄寬度時控制項換到下方(UI_GUIDE §12.2)
function SettingRow({title, desc, children}: {title: string; desc?: React.ReactNode; children: React.ReactNode}) {
    return (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
            <div className="min-w-[12rem] flex-1">
                <div className="text-sm font-medium">{title}</div>
                {desc && <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{desc}</p>}
            </div>
            <div className="shrink-0">{children}</div>
        </div>
    );
}

// 長文字輸入(名稱、網址、金鑰、模型)的列:標題在上、輸入框全寬(UI_GUIDE §12.2)
function FieldRow({title, desc, children}: {title: string; desc?: React.ReactNode; children: React.ReactNode}) {
    return (
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-1.5 px-4 py-3">
            <div className="text-sm font-medium">{title}</div>
            {children}
            {desc && <p className="min-w-0 text-xs leading-relaxed text-muted-foreground">{desc}</p>}
        </div>
    );
}

// 進入子頁的列:結尾「›」、整列可點(UI_GUIDE §12.3)
function NavRow({title, desc, icon, badge, onClick, testid}: {
    title: string; desc?: string; icon?: React.ReactNode; badge?: React.ReactNode; onClick: () => void; testid?: string;
}) {
    return (
        <button type="button" onClick={onClick} data-testid={testid}
                className="flex w-full min-w-0 items-center gap-3 px-4 py-3 text-left hover:bg-accent/60">
            {icon}
            <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{title}</span>
                {desc && <span className="mt-0.5 block truncate text-xs text-muted-foreground">{desc}</span>}
            </span>
            {badge}
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground"/>
        </button>
    );
}

// 子頁標題列:返回鍵+項目名稱,右側放此項目的動作(例如刪除)
function SubpageHeader({title, onBack, children}: {title: string; onBack: () => void; children?: React.ReactNode}) {
    return (
        <div className="flex flex-wrap items-center gap-2">
            <Button variant="ghost" size="iconSm" onClick={onBack} aria-label="返回" data-testid="subpage-back"><ArrowLeft/></Button>
            <h3 className="min-w-0 flex-1 truncate text-lg font-semibold" data-testid="subpage-title">{title}</h3>
            {children}
        </div>
    );
}

// Bot 可讀範圍(SPEC §12.3,#98):以資料夾決定 Bot 能用工具自行搜尋、讀取的範圍;只管讀取,寫入仍只能提案
const BOT_READ_ROWS: Record<string, {name: string; desc: string}> = {
    canon: {name: '設定集(canon/)', desc: '角色、世界觀等設定。'},
    outline: {name: '大綱(outline/)', desc: '可能含還沒寫到的劇情。'},
    notes: {name: '筆記(notes/)', desc: '私人筆記。'},
};

function BotReadSection() {
    const [rows, setRows] = useState<main.BotReadView[] | null>(null);
    const [error, setError] = useState('');
    const [saving, setSaving] = useState('');
    useEffect(() => {
        GetBotRead().then(r => setRows(r ?? [])).catch(e => setError(errText(e)));
    }, []);
    const toggle = async (dir: string, on: boolean) => {
        setSaving(dir);
        try {
            await SetBotRead(dir, on); // 寫進 perkins.json 成功才更新畫面
            setRows(rs => rs?.map(r => r.dir === dir ? {...r, on} : r) ?? rs);
            setError('');
        } catch (e) { setError(errText(e)); }
        setSaving('');
    };
    return (
        <Section title="Bot 可讀範圍" testid="bot-read-section"
                 desc="開啟的資料夾,Perkins Bot 會在需要時自己搜尋、讀取,不必每次附加;不會預先整份送出。關閉的資料夾只有你附加的檔案才看得到。只影響讀取:任何修改仍要你接受提案才會寫入。設定存在這部作品,下一次提問生效。">
            <RowCard>
                {rows?.map(r => (
                    <SettingRow key={r.dir} title={BOT_READ_ROWS[r.dir]?.name ?? r.dir} desc={BOT_READ_ROWS[r.dir]?.desc}>
                        <Switch data-testid={`bot-read-${r.dir}`} checked={r.on} disabled={saving !== ''}
                                onCheckedChange={v => toggle(r.dir, v)}/>
                    </SettingRow>
                ))}
            </RowCard>
            {error && <p className="text-xs text-destructive" data-testid="bot-read-error">{error}</p>}
        </Section>
    );
}

// presetLabel:預設端點名稱 + 站別(國際站/中國站)+ API 型別,作者一眼可辨(#43)
function presetLabel(p: settings.Preset) {
    const region = p.region && !/國際站|中國站/.test(p.name) ? (p.region === 'intl' ? '(國際站)' : '(中國站)') : '';
    const provider = p.provider === 'anthropic' ? ' · Anthropic 原生' : '';
    return `${p.name}${region}${provider}`;
}

// 離開保護(UI_GUIDE §12.5):子頁回報是否有未儲存變更;返回、切換導覽頁、關閉設定頁前由 guard 提醒
interface LeaveGuard {
    guard: (leave: () => void) => void;
    setDirty: (dirty: boolean) => void;
}

// AgentsEditor 是一份作者指示(AGENTS.md)的編輯區(Issue #38):作者本人編輯,按「儲存」才寫檔。
// 檔案不存在時編輯區為空、儲存即建立;內容清空並儲存 = 寫入空檔(不刪檔)。
// 估算長度與上限由後端以同一套估算提供(App.AgentsMdTokens / agent.AgentsLimit),前端不自己算。
function AgentsEditor({scope, hint, setDirty}: {scope: 'global' | 'project'; hint: string; setDirty: (d: boolean) => void}) {
    const [text, setText] = useState('');
    const [saved, setSaved] = useState('');
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
            setText(v.text); setSaved(v.text); setTokens(v.tokens); setLimit(v.limit); setPath(v.path);
        }).catch(e => { if (alive) setError(errText(e)); });
        return () => { alive = false; };
    }, [scope]);

    const dirty = text !== saved;
    useEffect(() => { setDirty(dirty); }); // 每次 render 都回報:父層清掉後子頁若仍在,立即恢復
    useEffect(() => () => setDirty(false), [setDirty]);

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
            setSaved(text); setTokens(v.tokens); setLimit(v.limit); setPath(v.path);
            setMsg('已儲存。'); setError('');
        } catch (e) { setMsg(''); setError(errText(e)); }
    };

    return (
        <div className="grid gap-3" data-testid={`agents-${scope}`}>
            <p className="text-xs leading-relaxed text-muted-foreground">{hint}</p>
            <p className="break-all text-xs text-muted-foreground">{path}</p>
            <Textarea rows={14} className="min-w-0 font-mono text-xs leading-relaxed" value={text}
                      onChange={e => { setText(e.target.value); setMsg(''); }} data-testid={`agents-${scope}-text`}/>
            {tokens > limit && (
                <p className="rounded-md bg-warning/10 p-2 text-xs text-warning" data-testid={`agents-${scope}-over`}>
                    超過長度上限:這份指示本次整份不送出(不會靜默截斷)。請刪減內容。
                </p>
            )}
            <div className="flex flex-wrap items-center gap-3">
                <Button size="sm" onClick={save} data-testid={`agents-${scope}-save`}><Save/>儲存</Button>
                <span className={cn('text-xs', tokens > limit ? 'text-warning' : 'text-muted-foreground')} data-testid={`agents-${scope}-tokens`}>
                    約 {tokens} / {limit} 估算 tokens
                </span>
                {dirty && <span className="text-xs text-warning" data-testid={`agents-${scope}-dirty`}>有未儲存的變更</span>}
                {msg && <span className="text-xs text-success">{msg}</span>}
            </div>
            {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
    );
}

// 端點設定中作者可編輯的欄位;用來判斷子頁是否有未儲存變更
const PROFILE_KEYS = ['name', 'baseUrl', 'provider', 'reasoningEffort', 'model', 'contextTokens', 'disableAutoCompact'] as const;
const normField = (v: unknown) => v === undefined || v === null || v === false || v === '' ? '' : String(v);
const sameProfile = (a: settings.Profile, b: settings.Profile) => PROFILE_KEYS.every(k => normField(a[k]) === normField(b[k]));

// 端點子頁(#95):一個端點的完整設定,按「儲存」才寫入;刪除在標題列,兩步確認(UI_GUIDE §7)
function ProfilePage({cfg, setCfg, view, notice, onBack, onDeleted, setDirty}: {
    cfg: main.SettingsView; setCfg: (c: main.SettingsView) => void; view: main.ProfileView; notice: string;
    onBack: () => void; onDeleted: () => void; setDirty: (d: boolean) => void;
}) {
    const [form, setForm] = useState<settings.Profile>(view);
    const [key, setKey] = useState('');
    const [models, setModels] = useState<string[]>([]);
    const [msg, setMsg] = useState(notice);
    const [error, setError] = useState('');
    const [confirmDel, setConfirmDel] = useState(false);

    const dirty = !sameProfile(form, view) || key !== '';
    useEffect(() => { setDirty(dirty); }); // 每次 render 都回報:父層清掉後子頁若仍在,立即恢復
    useEffect(() => () => setDirty(false), [setDirty]);

    const save = async (apiKey: string | null) => {
        const sent = form;
        try {
            const c = await SaveProfile(sent, apiKey as any);
            setCfg(c);
            // 後端可能正規化欄位(空白名稱改用網址):只同步送出後沒再改過的欄位,儲存期間的新輸入保留
            const saved = c.profiles.find(p => p.id === sent.id);
            if (saved) setForm(f => ({...f, ...Object.fromEntries(PROFILE_KEYS.filter(k => normField(f[k]) === normField(sent[k])).map(k => [k, saved[k]]))}));
            setKey(k => (k === (apiKey ?? '') ? '' : k));
            setMsg('已儲存。金鑰存在 Windows 憑證管理員,不會寫進任何專案或設定檔。');
            setError('');
        } catch (e) { setError(errText(e)); }
    };

    // 清除金鑰:只動金鑰,以已儲存的設定送出,不把表單上未儲存的修改一起寫入(UI_GUIDE §12.5)
    const clearKey = async () => {
        try {
            setCfg(await SaveProfile(view, ''));
            setMsg('已清除金鑰。');
            setError('');
        } catch (e) { setError(errText(e)); }
    };

    // 載入清單用的是已儲存的連線設定(後端 ListModels 依端點 id 讀設定與金鑰),不寫入表單
    const connDirty = normField(form.baseUrl) !== normField(view.baseUrl) || normField(form.provider) !== normField(view.provider) || key !== '';
    const load = async () => {
        try {
            setModels(await ListModels(form.id));
            setError('');
        } catch (e) { setError(errText(e)); setModels([]); }
    };

    const remove = async () => {
        try {
            setCfg(await DeleteProfile(form.id));
            onDeleted();
        } catch (e) { setError(errText(e)); setConfirmDel(false); }
    };

    // 換 Provider 時,新 Provider 不允許的思考強度重設為「不指定」(#30)
    const changeProvider = (v: string) => {
        setForm(f => ({...f, provider: v, reasoningEffort: effortsFor(v).includes(f.reasoningEffort ?? '') ? f.reasoningEffort : ''}));
    };

    const remote = useMemo(() => {
        try { return !['localhost', '127.0.0.1', '[::1]'].includes(new URL(form.baseUrl).hostname); } catch { return true; }
    }, [form.baseUrl]);
    const onlyOne = cfg.profiles.length <= 1;

    return (
        <div className="grid gap-8" data-testid="profile-page">
            <div className="grid gap-3">
                <SubpageHeader title={view.name} onBack={onBack}>
                    {onlyOne ? (
                        <Tip label="至少要保留一個端點" side="left">
                            <span><Button variant="ghost" size="sm" className="text-destructive" disabled><Trash2/>刪除端點</Button></span>
                        </Tip>
                    ) : (
                        <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setConfirmDel(true)}
                                data-testid="delete-profile"><Trash2/>刪除端點</Button>
                    )}
                </SubpageHeader>
                {confirmDel && (
                    <div className="flex flex-wrap items-center gap-2 rounded-md border border-destructive/40 p-3 text-xs" data-testid="delete-profile-confirm">
                        <span className="min-w-0 flex-1 text-destructive">刪除「{view.name}」後無法復原,它的 API 金鑰也會從 Windows 憑證管理員移除。</span>
                        <Button size="sm" variant="ghost" onClick={() => setConfirmDel(false)}>取消</Button>
                        <Button size="sm" variant="destructive" onClick={remove} data-testid="delete-profile-yes"><Trash2/>刪除端點</Button>
                    </div>
                )}
            </div>
            <Section title="連線" desc="模型服務的位址與存取方式。">
                <RowCard>
                    <FieldRow title="名稱"><Input value={form.name} onChange={e => setForm({...form, name: e.target.value})} data-testid="profile-name"/></FieldRow>
                    <FieldRow title="端點網址" desc="OpenAI 相容的 /v1 位址。LM Studio 預設為 http://localhost:1234/v1。">
                        <Input value={form.baseUrl} onChange={e => setForm({...form, baseUrl: e.target.value})} data-testid="profile-url"/>
                        {remote && (
                            <p className="rounded-md bg-warning/10 p-2 text-xs text-warning">
                                這個端點不在本機。使用時,送出的稿件與 Bot 讀取的內容會傳到該服務;第一次送出前會請你確認一次,之後不再詢問(網址改變時會再確認)。
                            </p>
                        )}
                    </FieldRow>
                    <SettingRow title="API 型別" desc="Anthropic 官方端點選「Anthropic 原生」,其他服務與本機模型選「OpenAI 相容」。">
                        <Select value={form.provider || 'openai'} onValueChange={changeProvider}>
                            <SelectTrigger className="w-72" data-testid="provider-select"><SelectValue/></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="openai" data-testid="provider-opt-openai">OpenAI 相容(/chat/completions)</SelectItem>
                                <SelectItem value="anthropic" data-testid="provider-opt-anthropic">Anthropic 原生(Messages API)</SelectItem>
                            </SelectContent>
                        </Select>
                    </SettingRow>
                    <FieldRow title="API 金鑰" desc={view.hasKey ? '已儲存金鑰。留空表示不變更。' : '本機模型通常不需要。'}>
                        <div className="flex gap-2">
                            <div className="relative min-w-0 flex-1">
                                <KeyRound className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground"/>
                                <Input type="password" className="pl-8" value={key} onChange={e => setKey(e.target.value)} placeholder={view.hasKey ? '••••••••' : ''}/>
                            </div>
                            {view.hasKey && <Button variant="outline" onClick={clearKey}>清除金鑰</Button>}
                        </div>
                    </FieldRow>
                </RowCard>
            </Section>
            <Section title="模型" desc="這個端點使用的模型與送出方式。">
                <RowCard>
                    <FieldRow title="模型">
                        <div className="flex flex-wrap gap-2">
                            <Input list="model-list" className="min-w-0 flex-1" value={form.model} onChange={e => setForm({...form, model: e.target.value})} placeholder="模型 id"/>
                            <datalist id="model-list">{models.map(m => <option key={m} value={m}/>)}</datalist>
                            <Button variant="outline" onClick={load} disabled={connDirty} data-testid="load-models"><RefreshCw/>載入清單</Button>
                        </div>
                        {connDirty && <p className="text-xs text-muted-foreground">網址、API 型別或金鑰改過還沒儲存;先按「儲存」再載入模型清單。</p>}
                    </FieldRow>
                    <SettingRow title="思考強度" desc="強度越高越慢、花費越多;本機模型多半不支援,保持「不指定」。">
                        <Select value={form.reasoningEffort || EFFORT_NONE} onValueChange={v => setForm({...form, reasoningEffort: v === EFFORT_NONE ? '' : v})}>
                            <SelectTrigger className="w-56" data-testid="effort-select"><SelectValue/></SelectTrigger>
                            <SelectContent>
                                <SelectItem value={EFFORT_NONE} data-testid="effort-opt-none">不指定(服務商預設)</SelectItem>
                                {effortsFor(form.provider || 'openai').map(e => (
                                    <SelectItem key={e} value={e} data-testid={`effort-opt-${e}`}>{EFFORT_LABELS[e]}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </SettingRow>
                    <SettingRow title="上下文長度" desc="用來估算能送多少內容;請依模型實際設定填寫(LM Studio 在載入模型時設定)。">
                        <div className="flex items-center gap-2">
                            <Input type="number" min={2048} step={1024} className="w-56" value={form.contextTokens}
                                   onChange={e => setForm({...form, contextTokens: Number(e.target.value)})}/>
                            <span className="text-xs text-muted-foreground">tokens</span>
                        </div>
                    </SettingRow>
                    <SettingRow title="自動壓縮上下文" desc="開啟時,超過上下文長度會先把較早的對話濃縮成摘要;關閉時會擋下不送出,可在聊天輸入 /compact 手動壓縮或開新對話。">
                        <Switch checked={!form.disableAutoCompact} onCheckedChange={v => setForm({...form, disableAutoCompact: !v})}
                                data-testid="auto-compact-setting"/>
                    </SettingRow>
                </RowCard>
            </Section>
            <div className="grid gap-2">
                <div className="flex flex-wrap items-center gap-3">
                    <Button onClick={() => save(key ? key : null)} data-testid="save-profile"><Save/>儲存</Button>
                    {dirty && <span className="text-xs text-warning" data-testid="profile-dirty">有未儲存的變更</span>}
                    {msg && !dirty && <span className="text-xs text-success">{msg}</span>}
                </div>
                {error && <p className="text-xs text-destructive">{error}</p>}
            </div>
        </div>
    );
}

type BotSub = {kind: 'profile'; id: string; notice: string} | {kind: 'agents'; scope: 'global' | 'project'} | null;

const AGENTS_PAGES = {
    global: {title: '全域指示(所有作品)', desc: '%USERPROFILE%\\.perkins\\AGENTS.md', hint: '放在 %USERPROFILE%\\.perkins\\AGENTS.md,所有作品共用。與作品指示衝突時以作品指示為準。'},
    project: {title: '目前作品指示', desc: '作品資料夾根目錄的 AGENTS.md', hint: '放在作品資料夾根目錄的 AGENTS.md(其他 coding agent 也會讀同一份)。與全域指示衝突時以這份為準。'},
};

// Perkins Bot 頁(#38、#95):端點與作者指示是「›」進入子頁的列,Bot 可讀範圍是即時生效的開關(UI_GUIDE §12)
function PerkinsBotTab({cfg, setCfg, hasProject, guard, setDirty}: {
    cfg: main.SettingsView; setCfg: (c: main.SettingsView) => void; hasProject: boolean;
} & LeaveGuard) {
    const [sub, setSub] = useState<BotSub>(null);
    const [presets, setPresets] = useState<settings.Preset[]>([]);
    const [error, setError] = useState('');
    useEffect(() => { ListProfilePresets().then(setPresets).catch(() => setPresets([])); }, []);

    const back = () => guard(() => setSub(null));

    const add = async () => {
        const id = newProfileID();
        try {
            setCfg(await SaveProfile({id, name: '新端點', baseUrl: 'https://openrouter.ai/api/v1', model: '', contextTokens: 32768} as settings.Profile, null as any));
            setSub({kind: 'profile', id, notice: ''});
            setError('');
        } catch (e) { setError(errText(e)); }
    };

    // 從預設新增(#43):帶入名稱、網址、Provider、建議上下文長度與預設模型;金鑰欄空白讓作者填
    const addFromPreset = async (presetID: string) => {
        const p = presets.find(x => x.id === presetID);
        if (!p) return;
        const id = newProfileID();
        try {
            setCfg(await SaveProfile({
                id,
                name: p.name,
                baseUrl: p.baseUrl,
                provider: p.provider || '',
                model: p.model || '',
                // 預設檔沒給建議值時用 §15 的預設上下文長度(16384),作者可再改
                contextTokens: p.contextTokens && p.contextTokens > 0 ? p.contextTokens : 16384,
            } as settings.Profile, null as any));
            setSub({kind: 'profile', id, notice: '已從預設新增端點;請填入 API 金鑰(本機端點通常不需要)後按「儲存」。'});
            setError('');
        } catch (e) { setError(errText(e)); }
    };

    const subView = sub?.kind === 'profile' ? cfg.profiles.find(p => p.id === sub.id) : undefined;
    if (sub?.kind === 'profile' && subView) {
        return <ProfilePage key={sub.id} cfg={cfg} setCfg={setCfg} view={subView} notice={sub.notice} onBack={back}
                            onDeleted={() => { setDirty(false); setSub(null); }} setDirty={setDirty}/>;
    }
    if (sub?.kind === 'agents') {
        const pg = AGENTS_PAGES[sub.scope];
        return (
            <div className="grid gap-6">
                <SubpageHeader title={pg.title} onBack={back}/>
                <AgentsEditor key={sub.scope} scope={sub.scope} hint={pg.hint} setDirty={setDirty}/>
            </div>
        );
    }

    return (
        <div className="grid gap-8">
            <Section title="模型端點" desc="每個端點是一個模型服務(本機 LM Studio、雲端服務商…)。點選端點編輯設定;金鑰存 Windows 憑證管理員,不會寫進任何專案或設定檔。">
                <div className="flex flex-wrap items-center gap-2">
                    {/* 從預設新增(#43):依「本機/服務商」分組,國際站/中國站與 Anthropic 原生在選項上標示 */}
                    <Select onValueChange={addFromPreset}>
                        <SelectTrigger data-testid="preset-select" className="h-8 w-56 text-xs">
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
                    <Button variant="outline" size="sm" onClick={add} data-testid="add-profile"><Plus/>新增空白端點</Button>
                </div>
                <RowCard testid="profile-list">
                    {cfg.profiles.map(p => (
                        <NavRow key={p.id} testid={`profile-card-${p.id}`} title={p.name}
                                desc={`${p.model || '尚未選擇模型'} · ${p.remote ? '雲端' : '本機'}`}
                                icon={p.remote ? <Cloud className="h-4 w-4 shrink-0 text-muted-foreground"/> : <Monitor className="h-4 w-4 shrink-0 text-muted-foreground"/>}
                                badge={p.id === cfg.active ? <Badge variant="secondary" className="shrink-0 text-xs">使用中</Badge> : undefined}
                                onClick={() => setSub({kind: 'profile', id: p.id, notice: ''})}/>
                    ))}
                </RowCard>
                {error && <p className="text-xs text-destructive">{error}</p>}
            </Section>
            {hasProject && <BotReadSection/>}
            <Section title="作者指示(AGENTS.md)" testid="agents-section"
                     desc="每次送出都會放進系統訊息的通用指示。兩層:作品層優先;不論哪一層都不能改變系統規則(AI 只能閱讀獲准內容、只能提出修改提案)。超過長度上限(估算 tokens)時整份不送出並在送出預覽說明原因。">
                <RowCard>
                    <NavRow testid="agents-row-global" title={AGENTS_PAGES.global.title} desc={AGENTS_PAGES.global.desc}
                            onClick={() => setSub({kind: 'agents', scope: 'global'})}/>
                    {hasProject && (
                        <NavRow testid="agents-row-project" title={AGENTS_PAGES.project.title} desc={AGENTS_PAGES.project.desc}
                                onClick={() => setSub({kind: 'agents', scope: 'project'})}/>
                    )}
                </RowCard>
            </Section>
        </div>
    );
}

// ---- 平台輸出頁(#95:清單 → 子頁,同 Perkins Bot 頁版型)----

// 繁簡轉換的短標示:清單列的規則摘要用,選單內仍用 ConvertOptions 的完整標示
const CONV_SHORT: Record<string, string> = {tw2s: '轉簡', tw2sp: '轉簡(含用詞)', s2tw: '轉繁', s2twp: '轉繁(含用詞)'};

// 規則摘要:清單列上一行看完這個平台的輸出規則
function rulesSummary(r: publish.Rules) {
    return [r.indent ? '段首縮排' : '不縮排', r.blankLine ? '段間空行' : '不留空行',
        r.heading === 'strip' ? '保留標題' : '不輸出標題', `分隔:${r.sceneBreak || '空行'}`,
        `繁簡:${r.convert ? (CONV_SHORT[r.convert] ?? r.convert) : '不轉'}`].join(' · ');
}

// 平台規則欄位:判斷子頁是否有未儲存變更,與儲存回應後同步沒再改過的欄位
const PLATFORM_KEYS = ['name', 'verified'] as const;
const RULE_KEYS = ['indent', 'blankLine', 'heading', 'sceneBreak', 'convert'] as const;
const samePlatform = (a: publish.Platform, b: publish.Platform) =>
    PLATFORM_KEYS.every(k => normField(a[k]) === normField(b[k])) && RULE_KEYS.every(k => normField(a.rules[k]) === normField(b.rules[k]));

// 平台子頁(#95):一個平台的規則與預覽,按「儲存」才寫入;刪除在標題列,兩步確認(UI_GUIDE §7)
// 平台清單的寫入(儲存、刪除、恢復預設):後端 SavePlatforms 整份覆寫清單(PR #110 審查)。
// 前一次寫入還沒回應就離開子頁、切換導覽頁或關閉設定頁,再刪別的平台時,若以畫面上的舊清單為基礎,
// 會把剛儲存的內容蓋回去,遲到的回應也會讓刪掉的平台在畫面上復活。
// 所以佇列放在模組層級(跨元件重建與設定頁重開都是同一條),每次寫入在輪到自己時才向後端讀最新清單。
type PlatformWrite = (edit: ((list: publish.Platform[]) => publish.Platform[]) | 'reset') => Promise<main.SettingsView>;
let platformQueue: Promise<unknown> = Promise.resolve();
const queuePlatformWrite: PlatformWrite = edit => {
    const run = platformQueue.then(async () =>
        edit === 'reset' ? ResetPlatforms() : SavePlatforms(edit((await GetSettings()).platforms)));
    platformQueue = run.catch(() => {}); // 失敗由呼叫者顯示;不讓佇列卡住
    return run;
};

function PlatformPage({cfg, write, initial, opts, onBack, onDeleted, setDirty}: {
    cfg: main.SettingsView; write: PlatformWrite; initial: publish.Platform; opts: main.Option[];
    onBack: () => void; onDeleted: () => void; setDirty: (d: boolean) => void;
}) {
    const [form, setForm] = useState<publish.Platform>(initial);
    const [out, setOut] = useState('');
    const [msg, setMsg] = useState('');
    const [error, setError] = useState('');
    const [confirmDel, setConfirmDel] = useState(false);
    // 已儲存的版本;沒有就是「新增後還沒儲存」的平台,一律視為未儲存
    const saved = cfg.platforms.find(x => x.id === initial.id);
    const dirty = !saved || !samePlatform(form, saved);
    useEffect(() => { setDirty(dirty); }); // 每次 render 都回報:父層清掉後子頁若仍在,立即恢復
    useEffect(() => () => setDirty(false), [setDirty]);
    // 預覽依子頁目前草稿的規則即時重算
    useEffect(() => {
        PreviewExport(SAMPLE, form.rules).then(setOut).catch(e => setOut('錯誤:' + errText(e)));
    }, [form.rules]);

    const update = (patch: Partial<publish.Platform> | {rules: Partial<publish.Rules>}) => {
        setForm(f => ({...f, ...patch, rules: {...f.rules, ...('rules' in patch ? patch.rules : {})}} as publish.Platform));
        setMsg('');
    };

    const save = async () => {
        const sent = form;
        try {
            // 以「上一次寫入完成後」的最新清單為基礎取代或加入這個平台,不用畫面上可能過期的 cfg
            const c = await write(list => list.some(x => x.id === sent.id) ? list.map(x => (x.id === sent.id ? sent : x)) : [...list, sent]);
            // 後端可能正規化欄位:只同步送出後沒再改過的欄位,儲存期間的新輸入保留
            const got = c.platforms.find(x => x.id === sent.id);
            if (got) setForm(f => ({
                ...f,
                ...Object.fromEntries(PLATFORM_KEYS.filter(k => normField(f[k]) === normField(sent[k])).map(k => [k, got[k]])),
                rules: {...f.rules, ...Object.fromEntries(RULE_KEYS.filter(k => normField(f.rules[k]) === normField(sent.rules[k])).map(k => [k, got.rules[k]]))},
            } as publish.Platform));
            setMsg('已儲存。');
            setError('');
        } catch (e) { setMsg(''); setError(errText(e)); }
    };

    // 刪除:以 SavePlatforms(刪掉該項的清單)立即保存並回到清單(尚未儲存的新平台等於直接捨棄)
    const remove = async () => {
        try {
            await write(list => list.filter(x => x.id !== form.id));
            onDeleted();
        } catch (e) { setError(errText(e)); setConfirmDel(false); }
    };

    return (
        <div className="grid gap-8" data-testid="platform-page">
            <div className="grid gap-3">
                <SubpageHeader title={form.name} onBack={onBack}>
                    <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setConfirmDel(true)}
                            data-testid="delete-platform"><Trash2/>刪除平台</Button>
                </SubpageHeader>
                {confirmDel && (
                    <div className="flex flex-wrap items-center gap-2 rounded-md border border-destructive/40 p-3 text-xs" data-testid="delete-platform-confirm">
                        <span className="min-w-0 flex-1 text-destructive">刪除「{form.name}」後無法復原。</span>
                        <Button size="sm" variant="ghost" onClick={() => setConfirmDel(false)}>取消</Button>
                        <Button size="sm" variant="destructive" onClick={remove} data-testid="delete-platform-yes"><Trash2/>刪除平台</Button>
                    </div>
                )}
            </div>
            <Section title="規則" desc="複製或匯出到這個平台時套用的格式規則。">
                <RowCard>
                    <FieldRow title="名稱"><Input value={form.name} onChange={e => update({name: e.target.value})} data-testid="platform-name"/></FieldRow>
                    <SettingRow title="段首縮排兩個全形空格">
                        <Switch checked={form.rules.indent} onCheckedChange={v => update({rules: {indent: v}})} data-testid="platform-indent"/>
                    </SettingRow>
                    <SettingRow title="段落之間空一行">
                        <Switch checked={form.rules.blankLine} onCheckedChange={v => update({rules: {blankLine: v}})} data-testid="platform-blankline"/>
                    </SettingRow>
                    <SettingRow title="章節標題">
                        <Select value={form.rules.heading || 'strip'} onValueChange={v => update({rules: {heading: v}})}>
                            <SelectTrigger className="w-72" data-testid="platform-heading"><SelectValue/></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="strip" data-testid="platform-heading-opt-strip">保留標題文字(去掉 #)</SelectItem>
                                <SelectItem value="drop" data-testid="platform-heading-opt-drop">不輸出標題(平台另外填)</SelectItem>
                            </SelectContent>
                        </Select>
                    </SettingRow>
                    <SettingRow title="場景分隔符號" desc="稿件中的 ***、---、◇◇◇ 會換成這個;留空則只空一行。">
                        <Input className="w-56" value={form.rules.sceneBreak} onChange={e => update({rules: {sceneBreak: e.target.value}})} data-testid="platform-scene-break"/>
                    </SettingRow>
                    <SettingRow title="繁簡轉換" desc="「含用詞」會把「軟體」換成「软件」等,會改變你的用詞,請確認後再用。">
                        <Select value={form.rules.convert || 'none'} onValueChange={v => update({rules: {convert: v === 'none' ? '' : v}})}>
                            <SelectTrigger className="w-72" data-testid="platform-convert"><SelectValue/></SelectTrigger>
                            <SelectContent>
                                {opts.map(o => <SelectItem key={o.id || 'none'} value={o.id || 'none'}>{o.label}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </SettingRow>
                    <SettingRow title="已實際貼上驗證">
                        <Switch checked={form.verified} onCheckedChange={v => update({verified: v})} data-testid="platform-verified"/>
                    </SettingRow>
                </RowCard>
            </Section>
            <Section title="預覽" desc="以範例文字示範這個平台的輸出格式,隨上方規則即時重算。">
                <pre className="min-h-[20rem] whitespace-pre-wrap rounded-md border bg-paper p-3 font-serif text-sm leading-relaxed" data-testid="platform-preview">{out}</pre>
                <p className="text-xs text-muted-foreground">作者筆記(&lt;!-- --&gt;)永遠不會被輸出。</p>
            </Section>
            <div className="grid gap-2">
                <div className="flex flex-wrap items-center gap-3">
                    <Button onClick={save} data-testid="save-platform"><Save/>儲存</Button>
                    {dirty && <span className="text-xs text-warning" data-testid="platform-dirty">有未儲存的變更</span>}
                    {msg && !dirty && <span className="text-xs text-success">{msg}</span>}
                </div>
                {error && <p className="text-xs text-destructive">{error}</p>}
            </div>
        </div>
    );
}

// 平台輸出頁(#95):平台是「›」進入子頁的列(UI_GUIDE §12.3),規則表單與預覽在子頁、按「儲存」才寫入
function PlatformsTab({cfg, setCfg, guard, setDirty}: {cfg: main.SettingsView; setCfg: (c: main.SettingsView) => void} & LeaveGuard) {
    const [sub, setSub] = useState<string | null>(null); // 進入中的平台 id
    const [fresh, setFresh] = useState<publish.Platform | null>(null); // 新增後尚未儲存的平台(不在設定裡)
    const [confirmReset, setConfirmReset] = useState(false);
    const [opts, setOpts] = useState<main.Option[]>([]);
    const [msg, setMsg] = useState('');
    const [error, setError] = useState('');
    useEffect(() => { ConvertOptions().then(setOpts); }, []);

    // 寫入走模組層級佇列;回應依序套用到畫面(已卸載的舊實例收到的回應不影響目前畫面)
    const write: PlatformWrite = async edit => {
        const c = await queuePlatformWrite(edit);
        setCfg(c);
        return c;
    };

    const view = sub ? (cfg.platforms.find(p => p.id === sub) ?? (fresh?.id === sub ? fresh : undefined)) : undefined;
    const back = () => guard(() => { setSub(null); setFresh(null); });

    // 新增平台:先放在草稿裡、直接進子頁;按「儲存」才寫入,沒儲存就離開不會留下任何東西
    const add = () => {
        const p = {id: 'custom-' + Date.now().toString(36), name: '新平台', verified: false,
            rules: {indent: true, blankLine: true, heading: 'drop', sceneBreak: '◇◇◇', convert: ''}} as publish.Platform;
        setFresh(p);
        setSub(p.id);
    };

    // 恢復內建預設:破壞性操作,兩步確認(UI_GUIDE §7)後才丟掉作者自訂的平台與修改
    const reset = async () => {
        try { await write('reset'); setConfirmReset(false); setMsg('已恢復內建預設。'); setError(''); } catch (e) { setError(errText(e)); }
    };

    if (sub && view) {
        return <PlatformPage key={sub} cfg={cfg} write={write} initial={view} opts={opts} onBack={back}
                            onDeleted={() => { setDirty(false); setSub(null); setFresh(null); }} setDirty={setDirty}/>;
    }

    return (
        <div className="grid gap-8">
            <Section title="平台" testid="platforms-section"
                     desc="複製到平台時套用的格式規則。內建規則是推測值,實際貼上確認後打開「已驗證」。">
                <div className="flex flex-wrap items-center gap-2">
                    <Button variant="outline" size="sm" onClick={add} data-testid="add-platform"><Plus/>新增平台</Button>
                    <Button variant="ghost" size="sm" onClick={() => setConfirmReset(true)} data-testid="reset-platforms"><RotateCcw/>恢復內建預設</Button>
                </div>
                {confirmReset && (
                    <div className="flex flex-wrap items-center gap-2 rounded-md border border-destructive/40 p-3 text-xs" data-testid="reset-platforms-confirm">
                        <span className="min-w-0 flex-1 text-destructive">恢復內建預設會丟掉你自訂的平台與所有修改,改回內建規則,無法復原。</span>
                        <Button size="sm" variant="ghost" onClick={() => setConfirmReset(false)} data-testid="reset-platforms-cancel">取消</Button>
                        <Button size="sm" variant="destructive" onClick={reset} data-testid="reset-platforms-yes"><RotateCcw/>恢復內建預設</Button>
                    </div>
                )}
                <RowCard testid="platform-list">
                    {cfg.platforms.map(p => (
                        <NavRow key={p.id} testid={`platform-card-${p.id}`} title={p.name} desc={rulesSummary(p.rules)}
                                badge={p.verified ? <Badge variant="success" className="shrink-0 text-xs">已驗證</Badge>
                                    : <Badge variant="outline" className="shrink-0 text-xs text-muted-foreground">未驗證</Badge>}
                                onClick={() => { setFresh(null); setSub(p.id); }}/>
                    ))}
                </RowCard>
                {msg && <p className="text-xs text-success" data-testid="platforms-msg">{msg}</p>}
                {error && <p className="text-xs text-destructive">{error}</p>}
            </Section>
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
                <h2 id="proj-basic" className="text-sm font-semibold">基本資料</h2>
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

// ---- 外觀頁(Issue #118):模式/主題/強調色/背景/文字 + 進階(字級、減少動效果、重置) + 稿紙版面 ----

// 主題預設檔在各側的顯示設定:名稱、說明與 icon。
const DARK_PRESET_META: Record<string, {name: string; desc: string; Icon: typeof Moon}> = {
    study: {name: '夜間書房', desc: '深藍墨色為底、琥珀金強調色;夜間或低光環境寫作。', Icon: Moon},
    graphite: {name: '深灰', desc: '中性深灰、不帶色調;覺得夜間書房太藍時使用。', Icon: Monitor},
};
const LIGHT_PRESET_META: Record<string, {name: string; desc: string; Icon: typeof Sun}> = {
    paper: {name: '白紙', desc: '暖白底、黑字;白天或明亮環境寫作。', Icon: Sun},
    cream: {name: '米白', desc: '比白紙更黃、像舊紙;眼睛容易疲勞時使用。', Icon: BookMarked},
};

const MODE_OPTIONS: {id: string; label: string; desc: string; Icon: typeof Moon}[] = [
    {id: 'dark', label: '深色', desc: '一律深色底;不受系統設定影響。', Icon: Moon},
    {id: 'light', label: '淺色', desc: '一律淺色底;不受系統設定影響。', Icon: Sun},
    {id: 'system', label: '跟隨系統', desc: '依作業系統目前偏好的主題自動切換;系統變更時即時生效。', Icon: Monitor},
];

const UIFontSizeOptions: {id: string; label: string}[] = [
    {id: 'small', label: '小'},
    {id: 'standard', label: '標準'},
    {id: 'large', label: '大'},
];

const ReduceMotionOptions: {id: string; label: string}[] = [
    {id: 'system', label: '系統'},
    {id: 'on', label: '開啟'},
    {id: 'off', label: '關閉'},
];

// HEX 驗證:7 字元小寫 #rrggbb;不是合法值不動(表示驗證失敗,不為作者存進去)。
const HEX_RE = /^#[0-9a-f]{6}$/;

// 與 App.tsx 同樣的系統偏好判斷,避免設定頁與實際生效不一致。
const systemPrefersDark = () => typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;

// 「當前生效那一側」:mode=system 時以目前 matchMedia 為準。
const effectiveSide = (mode: string): 'dark' | 'light' =>
    mode === 'system' ? (systemPrefersDark() ? 'dark' : 'light') : mode === 'light' ? 'light' : 'dark';

// 各側的預設背景/前景/強調色:不在使用者檔案裡的色時,給警告判斷有個可用的參考;
// 與 App.tsx 的 deriveTokens fallback 一致。
const SIDE_FALLBACK = {
    dark:  {bg: '#161b22', fg: '#e7e2d4', accent: '#d99749'},
    light: {bg: '#fdfaf3', fg: '#1f1d18', accent: '#8a5a2c'},
};

function AppearanceTab({appearance, setAppearance, paper, setPaper}: Pick<Props, 'appearance' | 'setAppearance' | 'paper' | 'setPaper'>) {
    // 作者全域偏好:即按即存、立即套用,重開設定與重啟應用都保留(#118)。
    // setAppearance 是樂觀更新(前端立刻套用),SetAppearance 同步寫進後端;失敗由 React 不回滕。
    // 以 createFrom 重建實例是為了符合 wails 自動生成型別的 class 形狀(物件字面值不帶 convertValues)。
    const persist = (next: {mode: string; uiFontSize: string; reduceMotion: string; dark: settings.SideAppearance; light: settings.SideAppearance}) => {
        const inst = settings.Appearance.createFrom({
            mode: next.mode, uiFontSize: next.uiFontSize, reduceMotion: next.reduceMotion,
            dark: {preset: next.dark.preset, accent: next.dark.accent, background: next.dark.background, foreground: next.dark.foreground},
            light: {preset: next.light.preset, accent: next.light.accent, background: next.light.background, foreground: next.light.foreground},
        }) as settings.Appearance;
        setAppearance(inst);
        SetAppearance(inst);
    };
    const changePaper = (key: keyof PaperLayout, v: string) => {
        const next = {...paper, [key]: v};
        setPaper(next);
        SetPaperLayout(next.width, next.fontSize, next.gap);
    };

    const side = effectiveSide(appearance.mode);
    const sideCfg = side === 'dark' ? appearance.dark : appearance.light;
    const presetList = side === 'dark' ? ['study', 'graphite'] : ['paper', 'cream'];
    const presetMeta = side === 'dark' ? DARK_PRESET_META : LIGHT_PRESET_META;

    // 背景/文字 對比低於 4.5:1 顯示警告(#118):但有自訂色才檢查(否則是預設主題,作者不需要警告)。
    const bgForContrast = sideCfg.background || SIDE_FALLBACK[side].bg;
    const fgForContrast = sideCfg.foreground || SIDE_FALLBACK[side].fg;
    const ratio = contrastRatio(hexToHSL(bgForContrast), hexToHSL(fgForContrast));
    const contrastWarn = (sideCfg.background || sideCfg.foreground) && ratio < 4.5;

    // 重置為預設值(兩步確認):只重置外觀設定,稿紙版面另有自己重置位置(這裡不重置)。
    const [resetArmed, setResetArmed] = useState(false);

    const paperRow = (key: keyof PaperLayout, testid: string, label: string, desc: string, opts: {value: string; label: string}[]) => (
        <SettingRow title={label} desc={desc}>
            <Select value={paper[key]} onValueChange={v => changePaper(key, v)}>
                <SelectTrigger data-testid={testid} className="h-8 w-[8.5rem] shrink-0 text-xs"><SelectValue/></SelectTrigger>
                <SelectContent>
                    {opts.map(o => <SelectItem key={o.value} value={o.value} data-testid={`${testid}-opt-${o.value}`}>{o.label}</SelectItem>)}
                </SelectContent>
            </Select>
        </SettingRow>
    );

    // ColorField:色塊 + hex 輸入,空 = 跟隨主題。每列有「清除」回主題值。
    const ColorField = ({label, desc, fieldKey, testid}: {label: string; desc: string; fieldKey: 'accent' | 'background' | 'foreground'; testid: string}) => {
        const value = sideCfg[fieldKey];
        const update = (next: settings.SideAppearance) => {
            const updated = side === 'dark'
                ? {...appearance, dark: next}
                : {...appearance, light: next};
            persist(updated);
        };
        const onHex = (raw: string) => {
            const v = raw.trim().toLowerCase();
            // 不合法:不更新狀態(保留上一個有效值);空表示要重設。
            if (v === '') { update({...sideCfg, [fieldKey]: ''}); return; }
            if (HEX_RE.test(v)) update({...sideCfg, [fieldKey]: v});
        };
        const onColor = (raw: string) => {
            const v = raw.toLowerCase();
            if (HEX_RE.test(v)) update({...sideCfg, [fieldKey]: v});
        };
        const clear = () => update({...sideCfg, [fieldKey]: ''});
        return (
            <div className="px-4 py-3" data-testid={testid}>
                <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
                    <div className="min-w-[12rem] flex-1">
                        <div className="text-sm font-medium">{label}</div>
                        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{desc}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                        <input type="color" value={value || (side === 'dark' ? '#161b22' : '#fdfaf3')}
                               onChange={e => onColor(e.target.value)}
                               data-testid={`${testid}-picker`}
                               className="h-8 w-10 cursor-pointer rounded-md border bg-transparent p-0"/>
                        <Input value={value} onChange={e => onHex(e.target.value)} placeholder="跟隨主題"
                               data-testid={`${testid}-hex`}
                               className="h-8 w-[8.5rem] font-mono text-xs"/>
                        {value && <Button size="iconSm" variant="ghost" onClick={clear} aria-label="清除回主題" data-testid={`${testid}-clear`}><RotateCcw className="h-3.5 w-3.5"/></Button>}
                    </div>
                </div>
                {fieldKey === 'foreground' && contrastWarn && (
                    <p className="mt-2 text-xs text-warning" data-testid="contrast-warn">前景與背景對比 {ratio.toFixed(1)}:1,低於 4.5:1 可能看不清。</p>
                )}
            </div>
        );
    };

    return (
        <div className="grid gap-8">
            <Section title="視覺風格" testid="appearance-visual"
                     desc="主題、主題預設檔與自訂色都會立即套用。深色與淺色各自記住選擇;切到另一邊再切回來不會丟。">
                {/* 模式:深色 / 淺色 / 跟隨系統 */}
                <div className="grid gap-3 rounded-lg border p-3" data-testid="appearance-mode">
                    <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
                        <div className="min-w-[12rem] flex-1">
                            <div className="text-sm font-medium">模式</div>
                            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">選擇外觀的主要方向;跟隨系統時會依作業系統偏好自動切換。</p>
                        </div>
                        <div className="flex shrink-0 gap-1 rounded-md border bg-muted p-1">
                            {MODE_OPTIONS.map(o => (
                                <button key={o.id} type="button" aria-pressed={appearance.mode === o.id}
                                        data-testid={`appearance-mode-${o.id}`}
                                        title={o.desc}
                                        onClick={() => persist({...appearance, mode: o.id})}
                                        className={cn('flex items-center gap-1.5 rounded px-3 py-1 text-xs transition-colors',
                                            appearance.mode === o.id ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
                                    <o.Icon className="h-3.5 w-3.5"/>{o.label}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
                {/* 主題:只列當前生效那一邊 */}
                <RowCard testid="appearance-preset">
                    <div className="flex flex-wrap items-start gap-x-4 gap-y-2 px-4 py-3">
                        <div className="min-w-[12rem] flex-1">
                            <div className="text-sm font-medium">主題</div>
                            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{side === 'dark' ? '深色側' : '淺色側'}的主題預設檔;切換模式時會記住各側選擇。</p>
                        </div>
                        <Select value={sideCfg.preset}
                                onValueChange={v => {
                                    const next: settings.SideAppearance = {...sideCfg, preset: v};
                                    const updated = side === 'dark'
                                        ? {...appearance, dark: next}
                                        : {...appearance, light: next};
                                    persist(updated);
                                }}>
                            <SelectTrigger data-testid="appearance-preset-select" className="h-8 w-[10rem] shrink-0 text-xs"><SelectValue/></SelectTrigger>
                            <SelectContent>
                                {presetList.map(p => {
                                    const m = presetMeta[p];
                                    return <SelectItem key={p} value={p} data-testid={`appearance-preset-opt-${p}`}>{m.name}</SelectItem>;
                                })}
                            </SelectContent>
                        </Select>
                    </div>
                </RowCard>
                {/* 強調色/背景/文字:跟隨主題為空;自訂會推算其他 token */}
                <RowCard testid="appearance-colors">
                    <ColorField label="強調色" desc="按鈕、選中態、焦點;選擇「跟隨主題」時用主題的強調色。" fieldKey="accent" testid="appearance-accent"/>
                    <ColorField label="背景" desc="整個介面的主底色;其他顏色(側欄、欄位、文字…)會自動從這裡推算。" fieldKey="background" testid="appearance-background"/>
                    <ColorField label="文字顏色" desc="介面主要文字色;與背景對比低於 4.5:1 時會顯示警告。" fieldKey="foreground" testid="appearance-foreground"/>
                </RowCard>
            </Section>

            {/* 進階區塊(可收合,預設收合):UI_GUIDE §12.4 */}
            <details className="grid gap-3" data-testid="appearance-advanced">
                <summary className="cursor-pointer text-sm font-semibold">進階</summary>
                <RowCard testid="appearance-advanced-card">
                    <SettingRow title="介面字體大小" desc="全介面字級(html 根字級 15 / 16 / 17px);稿紙字級會一起等比縮放。">
                        <Select value={appearance.uiFontSize} onValueChange={v => persist({...appearance, uiFontSize: v})}>
                            <SelectTrigger data-testid="appearance-font-size" className="h-8 w-[8.5rem] shrink-0 text-xs"><SelectValue/></SelectTrigger>
                            <SelectContent>
                                {UIFontSizeOptions.map(o => <SelectItem key={o.id} value={o.id} data-testid={`appearance-font-size-opt-${o.id}`}>{o.label}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </SettingRow>
                    <SettingRow title="減少動態效果" desc="「系統」跟隨作業系統的減少動態偏好;開啟時 transition 與 animation 歸零,包含打字機捲動的平滑捲動。">
                        <Select value={appearance.reduceMotion} onValueChange={v => persist({...appearance, reduceMotion: v})}>
                            <SelectTrigger data-testid="appearance-reduce-motion" className="h-8 w-[8.5rem] shrink-0 text-xs"><SelectValue/></SelectTrigger>
                            <SelectContent>
                                {ReduceMotionOptions.map(o => <SelectItem key={o.id} value={o.id} data-testid={`appearance-reduce-motion-opt-${o.id}`}>{o.label}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </SettingRow>
                    <SettingRow title="重置為預設值" desc="把外觀設定(模式、主題、自訂色、字級、減少動態)回到預設;稿紙版面不受影響。">
                        {!resetArmed ? (
                            <Button size="sm" variant="ghost" onClick={() => setResetArmed(true)} data-testid="appearance-reset">重置為預設值</Button>
                        ) : (
                            <div className="flex items-center gap-2">
                                <span className="text-xs text-warning">確定要重置嗎?</span>
                                <Button size="sm" variant="destructive" onClick={() => { setResetArmed(false); persist(DEFAULTS_APPEARANCE); }} data-testid="appearance-reset-confirm">重置</Button>
                                <Button size="sm" variant="ghost" onClick={() => setResetArmed(false)} data-testid="appearance-reset-cancel">取消</Button>
                            </div>
                        )}
                    </SettingRow>
                </RowCard>
            </details>

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

// 重置後回到的預設值:與 App.tsx DEFAULT_APPEARANCE 與 Go 端 DefaultsAppearance 一致。
const DEFAULTS_APPEARANCE = settings.Appearance.createFrom({
    mode: 'dark', uiFontSize: 'standard', reduceMotion: 'system',
    dark: {preset: 'study'}, light: {preset: 'paper'},
}) as settings.Appearance;

type Page = 'project' | 'models' | 'platforms' | 'appearance';
const PAGE_LABEL: Record<Page, string> = {project: '作品', models: 'Perkins Bot', platforms: '平台輸出', appearance: '外觀'};

export default function SettingsPage({tree, setTree, appearance, setAppearance, paper, setPaper, onClose}: Props) {
    const [cfg, setCfg] = useState<main.SettingsView | null>(null);
    const [page, setPage] = useState<Page>('models'); // 預設頁維持 Perkins Bot(SPEC §17.2)
    useEffect(() => { GetSettings().then(setCfg); }, []);

    // 離開保護(UI_GUIDE §12.5):子頁有未儲存變更時,返回、切換導覽頁、關閉設定頁前先提醒
    const dirty = useRef(false);
    const setDirty = useCallback((d: boolean) => { dirty.current = d; }, []);
    const [pendingLeave, setPendingLeave] = useState<(() => void) | null>(null);
    const guard = useCallback((leave: () => void) => {
        if (dirty.current) setPendingLeave(() => leave);
        else leave();
    }, []);
    const discardAndLeave = () => {
        const leave = pendingLeave;
        dirty.current = false;
        setPendingLeave(null);
        leave?.();
    };

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !document.querySelector('[role=dialog],[data-radix-popper-content-wrapper]')) guard(onClose); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose, guard]);

    // 自動存檔(SPEC §17.3):寫入設定檔成功後才更新畫面;Workspace 在設定頁關閉時重讀設定。
    const setAutosave = async (on: boolean) => {
        await SetAutosave(on);
        setCfg(c => c ? main.SettingsView.createFrom({...c, autosave: on}) : c);
    };

    const navBtn = (id: Page, Icon: typeof Cpu) => (
        <button data-testid={`tab-${id}`} onClick={() => { if (id !== page) guard(() => setPage(id)); }}
                aria-current={page === id}
                className={cn('flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm',
                    page === id ? 'bg-accent font-medium text-foreground' : 'text-muted-foreground hover:bg-accent/60')}>
            <Icon className="h-4 w-4"/>{PAGE_LABEL[id]}
        </button>
    );

    return (
        <div style={{top: TITLEBAR_HEIGHT}}
             className="fixed inset-x-0 bottom-0 z-50 flex flex-col overflow-hidden bg-background" data-testid="settings-page">
            {/* 頁首:返回 + 標題 */}
            <div className="flex shrink-0 items-center gap-3 border-b px-6 py-3">
                <Button variant="ghost" size="icon" onClick={() => guard(onClose)} data-testid="close-settings"><ArrowLeft/></Button>
                <h1 className="font-serif text-2xl font-bold">設定</h1>
            </div>
            <div className="flex min-h-0 flex-1">
                {/* 左側導覽欄(約 200px,選中態明顯);主題與稿紙版面搬到「外觀」頁(Issue #88) */}
                <nav data-testid="settings-nav" className="flex w-[200px] shrink-0 flex-col gap-1 border-r bg-sidebar p-3">
                    {tree && navBtn('project', BookMarked)}
                    {navBtn('models', Cpu)}
                    {navBtn('platforms', Share2)}
                    {navBtn('appearance', Palette)}
                </nav>
                {/* 內容區:獨立捲動、單一 max-w-5xl 置中(SPEC §17.2) */}
                <div data-testid="settings-content" className="min-w-0 flex-1 overflow-y-auto">
                    {cfg && (
                        <div className="mx-auto w-full max-w-5xl px-6 py-6">
                            {pendingLeave && (
                                <div className="sticky top-0 z-10 bg-background pb-3">
                                    <div role="alert" className="flex flex-wrap items-center gap-2 rounded-md border border-warning/40 bg-warning/10 p-3 text-xs text-warning" data-testid="unsaved-leave">
                                        <span className="min-w-0 flex-1">有尚未儲存的變更,離開會捨棄這些變更。</span>
                                        <Button size="sm" variant="ghost" onClick={() => setPendingLeave(null)} data-testid="unsaved-stay">繼續編輯</Button>
                                        <Button size="sm" variant="destructive" onClick={discardAndLeave} data-testid="unsaved-discard">捨棄並離開</Button>
                                    </div>
                                </div>
                            )}
                            <h2 className="mb-6 text-xl font-semibold" data-testid="settings-page-title">{PAGE_LABEL[page]}</h2>
                            {page === 'project' && tree && <ProjectTab tree={tree} setTree={setTree} autosave={cfg.autosave} onSetAutosave={setAutosave}/>}
                            {page === 'models' && <PerkinsBotTab cfg={cfg} setCfg={setCfg} hasProject={!!tree} guard={guard} setDirty={setDirty}/>}
                            {page === 'platforms' && <PlatformsTab cfg={cfg} setCfg={setCfg} guard={guard} setDirty={setDirty}/>}
                            {page === 'appearance' && <AppearanceTab appearance={appearance} setAppearance={setAppearance} paper={paper} setPaper={setPaper}/>}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
