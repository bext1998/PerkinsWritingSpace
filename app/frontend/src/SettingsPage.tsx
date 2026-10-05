import {useEffect, useMemo, useState} from 'react';
import {ArrowLeft, BookMarked, Cloud, Cpu, KeyRound, Monitor, Moon, Palette, Plus, RefreshCw, RotateCcw, Save, Share2, Sun, Trash2} from 'lucide-react';
import {
    ClearCover, ConvertOptions, DeleteProfile, GetCover, GetResearch, GetSettings, ListModels, PickCover, PreviewExport, RenameProject, ResetPlatforms,
    SavePlatforms, SaveProfile, SetResearch, SetTheme,
} from '../wailsjs/go/main/App';
import {main, project, publish, settings} from '../wailsjs/go/models';
import {Button} from '@/components/ui/button';
import {Badge, Input, Label, Switch} from '@/components/ui/basic';
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Tabs, TabsContent, TabsList, TabsTrigger} from '@/components/ui/overlay';
import {cn, errText} from '@/lib/utils';
import {GeneratedCover} from './Bookshelf';
import NotionImport from './NotionImport';

interface Props {
    tree: project.Tree | null;
    setTree: (t: project.Tree) => void;
    theme: string;
    setTheme: (t: string) => void;
    onClose: () => void;
}

const SAMPLE = `# 第一章 出發

清晨的**王都**很安靜。
「走吧。」艾莉絲說。

***

<!-- 作者筆記:這裡之後要埋伏筆 -->
他們打開了軟體,出發了。`;

function Field({label, hint, children}: {label: string; hint?: string; children: React.ReactNode}) {
    return (
        <div className="grid gap-1.5">
            <Label>{label}</Label>
            {children}
            {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
        </div>
    );
}

function ModelsTab({cfg, setCfg}: {cfg: main.SettingsView; setCfg: (c: main.SettingsView) => void}) {
    const [selId, setSelId] = useState(cfg.active);
    const current = cfg.profiles.find(p => p.id === selId) ?? cfg.profiles[0];
    const [form, setForm] = useState<settings.Profile>(current);
    const [key, setKey] = useState('');
    const [models, setModels] = useState<string[]>([]);
    const [msg, setMsg] = useState('');
    const [error, setError] = useState('');

    useEffect(() => { setForm(current); setKey(''); setModels([]); setMsg(''); setError(''); }, [current?.id]);

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
        const id = 'p-' + Date.now().toString(36);
        try {
            const c = await SaveProfile({id, name: '新端點', baseUrl: 'https://openrouter.ai/api/v1', model: '', contextTokens: 32768} as settings.Profile, null as any);
            setCfg(c);
            setSelId(id);
        } catch (e) { setError(errText(e)); }
    };

    const remove = async () => {
        try {
            const c = await DeleteProfile(form.id);
            setCfg(c);
            setSelId(c.active);
        } catch (e) { setError(errText(e)); }
    };

    const remote = useMemo(() => {
        try { return !['localhost', '127.0.0.1', '[::1]'].includes(new URL(form.baseUrl).hostname); } catch { return true; }
    }, [form.baseUrl]);
    const view = cfg.profiles.find(p => p.id === form.id);

    return (
        <div className="grid grid-cols-[220px_1fr] gap-6">
            <div className="space-y-1">
                {cfg.profiles.map(p => (
                    <button key={p.id} onClick={() => setSelId(p.id)}
                            className={cn('flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm', p.id === form.id ? 'bg-accent' : 'hover:bg-accent/60')}>
                        {p.remote ? <Cloud className="h-4 w-4 text-muted-foreground"/> : <Monitor className="h-4 w-4 text-muted-foreground"/>}
                        <span className="flex-1 truncate">{p.name}</span>
                        {p.id === cfg.active && <Badge variant="secondary" className="text-[10px]">使用中</Badge>}
                    </button>
                ))}
                <Button variant="ghost" size="sm" className="w-full justify-start" onClick={add}><Plus/>新增端點</Button>
            </div>
            <div className="grid max-w-xl gap-4">
                <Field label="名稱"><Input value={form.name} onChange={e => setForm({...form, name: e.target.value})}/></Field>
                <Field label="端點網址" hint="OpenAI 相容的 /v1 位址。LM Studio 預設為 http://localhost:1234/v1。">
                    <Input value={form.baseUrl} onChange={e => setForm({...form, baseUrl: e.target.value})} data-testid="profile-url"/>
                </Field>
                {remote && (
                    <p className="rounded-md bg-warning/10 p-2 text-xs text-warning">
                        這個端點不在本機。使用時,附加的稿件與設定會傳到該服務;每次啟動 Perkins 後第一次送出前都會再確認一次。
                    </p>
                )}
                <Field label="模型">
                    <div className="flex gap-2">
                        <Input list="model-list" value={form.model} onChange={e => setForm({...form, model: e.target.value})} placeholder="模型 id"/>
                        <datalist id="model-list">{models.map(m => <option key={m} value={m}/>)}</datalist>
                        <Button variant="outline" onClick={load}><RefreshCw/>載入清單</Button>
                    </div>
                </Field>
                <Field label="上下文長度(tokens)" hint="用來估算能送多少內容;超過時會先濃縮較早的對話。請依模型實際設定填寫(LM Studio 在載入模型時設定)。">
                    <Input type="number" min={2048} step={1024} value={form.contextTokens}
                           onChange={e => setForm({...form, contextTokens: Number(e.target.value)})}/>
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
                <div className="flex gap-2">
                    <Button onClick={() => save(key ? key : null)} data-testid="save-profile"><Save/>儲存</Button>
                    <Button variant="ghost" className="text-destructive" disabled={cfg.profiles.length <= 1} onClick={remove}><Trash2/>刪除端點</Button>
                </div>
            </div>
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
        <div className="grid grid-cols-[220px_1fr] gap-6">
            <div className="space-y-1">
                {list.map((x, i) => (
                    <button key={x.id} onClick={() => setSel(i)}
                            className={cn('flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm', i === sel ? 'bg-accent' : 'hover:bg-accent/60')}>
                        <span className="flex-1 truncate">{x.name}</span>
                        {x.verified ? <Badge variant="success" className="text-[10px]">已驗證</Badge> : <Badge variant="outline" className="text-[10px] text-muted-foreground">未驗證</Badge>}
                    </button>
                ))}
                <Button variant="ghost" size="sm" className="w-full justify-start" onClick={add}><Plus/>新增平台</Button>
            </div>
            {p && (
                <div className="grid grid-cols-2 gap-6">
                    <div className="grid content-start gap-4">
                        <p className="rounded-md bg-muted p-2 text-[11px] leading-relaxed text-muted-foreground">
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
                        <div className="flex gap-2">
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
                        <p className="text-[11px] text-muted-foreground">作者筆記(&lt;!-- --&gt;)永遠不會被輸出。</p>
                    </div>
                </div>
            )}
        </div>
    );
}

function ProjectTab({tree, setTree}: {tree: project.Tree; setTree: (t: project.Tree) => void}) {
    const [name, setName] = useState(tree.name);
    const [cover, setCover] = useState('');
    const [error, setError] = useState('');
    const [researchOn, setResearchOn] = useState<boolean | null>(null); // null = 尚未載入
    const [researchSaving, setResearchSaving] = useState(false);
    const [researchError, setResearchError] = useState('');
    // 研究記錄載入失敗:保持未知(researchOn=null)、Switch 停用並顯示錯誤,不得冒充關閉
    useEffect(() => { GetCover().then(setCover); GetResearch().then(setResearchOn).catch(e => { setResearchError(errText(e)); }); }, []);

    return (
        <div className="grid max-w-3xl gap-8">
            <div className="grid grid-cols-[160px_1fr] gap-6">
                <div className="h-[220px] w-[156px] overflow-hidden rounded-r-md rounded-l-sm book-spine-shadow">
                    {cover ? <img src={cover} className="h-full w-full object-cover" alt=""/> : <GeneratedCover name={name || tree.name}/>}
                </div>
                <div className="grid content-start gap-4">
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
            {/* 研究記錄(§12.8):預設關閉,作者手動開啟;記錄檔隨作品存在 .perkins/research.jsonl */}
            <div className="mt-6 flex max-w-3xl items-start gap-4 rounded-lg border p-4" data-testid="research-row">
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
            <NotionImport onDone={() => {}}/>
        </div>
    );
}

export default function SettingsPage({tree, setTree, theme, setTheme, onClose}: Props) {
    const [cfg, setCfg] = useState<main.SettingsView | null>(null);
    useEffect(() => { GetSettings().then(setCfg); }, []);
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !document.querySelector('[role=dialog],[data-radix-popper-content-wrapper]')) onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    const changeTheme = (t: string) => { setTheme(t); SetTheme(t); };

    return (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-background" data-testid="settings-page">
            <div className="mx-auto max-w-5xl px-10 py-8">
                <div className="mb-6 flex items-center gap-3">
                    <Button variant="ghost" size="icon" onClick={onClose} data-testid="close-settings"><ArrowLeft/></Button>
                    <h1 className="font-serif text-2xl font-bold">設定</h1>
                </div>
                {cfg && (
                    <Tabs defaultValue="models">
                        <TabsList>
                            <TabsTrigger value="models"><Cpu className="h-4 w-4"/>模型端點</TabsTrigger>
                            <TabsTrigger value="platforms" data-testid="tab-platforms"><Share2 className="h-4 w-4"/>平台輸出</TabsTrigger>
                            {tree && <TabsTrigger value="project" data-testid="tab-project"><BookMarked className="h-4 w-4"/>作品</TabsTrigger>}
                            <TabsTrigger value="look"><Palette className="h-4 w-4"/>外觀</TabsTrigger>
                        </TabsList>
                        <TabsContent value="models" className="mt-6"><ModelsTab cfg={cfg} setCfg={setCfg}/></TabsContent>
                        <TabsContent value="platforms" className="mt-6"><PlatformsTab cfg={cfg} setCfg={setCfg}/></TabsContent>
                        {tree && <TabsContent value="project" className="mt-6"><ProjectTab tree={tree} setTree={setTree}/></TabsContent>}
                        <TabsContent value="look" className="mt-6">
                            <div className="flex gap-3">
                                {[{id: 'dark', label: '夜間書房', Icon: Moon}, {id: 'light', label: '白紙', Icon: Sun}].map(({id, label, Icon}) => (
                                    <button key={id} onClick={() => changeTheme(id)}
                                            className={cn('flex w-40 flex-col items-center gap-2 rounded-lg border p-4 text-sm', theme === id ? 'border-primary text-primary' : 'hover:bg-accent')}>
                                        <Icon className="h-6 w-6"/>{label}
                                    </button>
                                ))}
                            </div>
                        </TabsContent>
                    </Tabs>
                )}
            </div>
        </div>
    );
}
