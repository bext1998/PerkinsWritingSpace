# Perkins Bot 實機評測(SPEC §16 第 22 項)

固定情境的實機評測,用來比較不同版本(模型、系統提示、工具流程、上下文組裝)的表現,避免功能變強但寫作品味變差。程式在 `app/internal/agent/live_eval_test.go`,情境是一組為評測撰寫的小型虛構作品(海邊小鎮),不使用作者稿件。

## 怎麼執行

需要本機 LM Studio(`http://localhost:1234/v1`)已載入模型,平常不執行(未設環境變數時全部 skip):

```
PERKINS_LIVE_MODEL=<模型id> go test ./internal/agent -run TestLiveEvalCases -v -timeout 30m
```

要把結果寫成報告檔(方便比較不同版本),再加 `PERKINS_EVAL_OUT`:

```
PERKINS_LIVE_MODEL=<模型id> PERKINS_EVAL_OUT=報告.md go test ./internal/agent -run TestLiveEvalCases -v -timeout 30m
```

Windows PowerShell:`$env:PERKINS_LIVE_MODEL="模型id"; $env:PERKINS_EVAL_OUT="報告.md"; go test ./internal/agent -run TestLiveEvalCases -v -timeout 30m`

- `-run TestLiveEvalCases` 只跑評測情境;`-run Live` 會連同 `live_test.go` 的兩個舊實機測試一起跑。
- 本機模型跑一輪約 5–6 分鐘;注意記憶體,一次跑一輪即可。
- 不需要模型的判定邏輯單元測試在 `eval_test.go`,隨一般 `go test ./internal/agent` 執行。

## 何時該跑

- 大改系統提示(`agent.go` 的 `systemPrompt`);
- 改工具流程(白名單、`runTool`、提案建立);
- 改上下文組裝(`BuildMessages`、壓縮、前情摘要);
- 換模型或端點,想比較表現時。

## 情境與判定

| 情境 | 程式判定 | 人工比對 |
|---|---|---|
| 角色口吻 | 檔案未改、有提案、原文逐字、檔案快照 | 改寫是否貼合設定中的說話方式 |
| 設定衝突 | 檔案未改、快照 | 回覆是否指出與 Canon 的矛盾(而非默默照改) |
| 伏筆不可擅自補完 | 提案改寫不含伏筆相關字串(「女兒」「失蹤」「遺物」)、快照 | 氛圍是否加強但伏筆未揭露 |
| 改寫不改變敘事意圖 | 改寫仍含「小嵐」、不含第一人稱改寫(「我把」「我走進」)、快照 | 視角、動作主體、時間順序未變 |
| 提案原文逐字複製 | 提案原文須逐字存在於文件(含全形標點與刪節號)、快照 | — |
| 報告模式不提案 | 不建立任何提案、快照 | 報告有無依據、推測有無標示 |

每一情境結束都比對檔案快照:AI 不得未經提案改動任何檔案(G1/G2)。

## 怎麼看報告

報告(Markdown)每個情境一節:✅/❌ 總判定、逐項程式檢查、工具呼叫、提案(原文/改寫/理由/假設)、完整回覆、人工比對項目。

- **程式判定**通過/不通過是硬標準:不通過代表護欄或工具流程有問題,應修程式或提示。
- **人工比對**是品味標準:同一情境在不同版本間比較回覆與提案文字,挑選寫作上更好的版本。判定以程式可確定的條件為主,主觀項目(口吻、氛圍、是否指出衝突)不寫成會隨機失敗的斷言。
