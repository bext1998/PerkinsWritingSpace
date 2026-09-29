Agentic Writing 與 Harness Engineering：Fundamental Theory、架構與護欄

學術研究報告｜資料截點：2026 年 7 月 17 日

本報告研究以人類創作意圖為核心、由具備任務規劃、狀態管理與工具操作能力的 Agent 協助完成長篇內容之 Agentic Writing，並分析其與 Harness Engineering 的理論關係。報告不把 Agent 視為單純的文字產生器，而把它放入一個包含目標、狀態、工具、權限、評估、記憶、版本與人類批准的社會技術系統中。

**核心結論：**Agentic Writing 的基本單位不是一次提示詞，而是「人類意圖 → 代理提案 → 可觀測評估 → 人類裁決 → 版本化狀態」的閉迴路。Harness Engineering 的任務，是讓這個閉迴路可控、可追溯、可回復，並保護創作中的不確定性與異質性。

# 一、執行摘要

* Agentic Writing 與 Harness Engineering 都仍屬新興、跨領域且術語未完全標準化的研究對象。本報告提出的是以人為中心的操作性理論，不宣稱已有單一公認的 Fundamental Theory。  
* 最直接的創意寫作研究顯示：AI 可以提高單篇作品的平均品質與生產力，但也可能降低群體作品的多樣性；AI 介入早期創意任務時，人類的角色與協作設計會影響品質、滿意度與多樣性。  
* Agentic 化會把單次協作風險放大成長期系統風險：代理可以自行拆題、記憶、評選、修訂與呼叫工具，若沒有明確的狀態與批准邊界，代理的偏好會逐步變成作品的規範。  
* Harness 不是更長的 prompt。它是代理外部的執行環境與控制平面，涵蓋上下文治理、記憶、任務編排、權限、工具、評估器、錯誤回復、版本化與人類介入。  
* 對非絕對確定性的決策，LLM 應先辨識不確定性的類型，再選擇直接回答、條件式建議、提出澄清問題、產生多個候選，或暫緩／升級；創意選擇不應被錯誤地轉成單一『最佳答案』。

# 二、術語、範圍與證據狀態

## 2.1 Agentic Writing 的操作性定義

本報告沿用並精確化你的工作定義：Agentic Writing 是「以人類創作意圖為核心，由具備任務規劃、狀態管理與工具操作能力的 Agent 協助完成長篇內容」。人類負責創意方向、價值判斷與最終決策；Agent 負責組織、分析、查核、一致性維護、重複工作與受控的候選生成。

這個定義與傳統 AI 輔助寫作的差異，不只是模型是否能自主呼叫工具，而是工作單位由「句子／段落」提升為「跨多輪、跨文件、跨角色、可恢復的創作任務」。因此，Story Bible、Narrative State、Writing Task、Continuity Checker、Style Guard、Source Ledger 與 Decision／Uncertainty Ledger 都是理論上的一級物件，而非附加功能。

## 2.2 Harness Engineering 的操作性定義

本報告將 Harness Engineering 定義為：設計包覆 Agent 的執行環境，使 Agent 能在有限權限、明確狀態、可觀測回饋與可驗證門檻下，長時間完成多步驟任務。其核心問題不是『模型會不會寫』，而是『模型如何在這個環境中被引導、限制、檢驗、修正與安全地持續工作』。

| 概念 | 主要控制對象 | 典型失效 | 在 Agentic Writing 中的對應 |
| :---- | :---- | :---- | :---- |
| Prompt engineering | 單次指令措辭 | 理解偏差、指令遺漏 | 要求某角色語氣或某段落形式 |
| Context engineering | 送入模型的資訊選擇與排序 | 上下文過長、遺漏關鍵狀態 | 召回相關角色卡、章節摘要與先前決策 |
| Harness engineering | 整個代理執行環境 | 漂移、循環、越權、無法回復 | 任務拆解、狀態、工具、評估、批准與版本歷史 |

**證據狀態：**Agentic Writing 不是成熟的單一學派；Harness Engineering 也剛從產業實務與代理系統研究中浮現。以下模型是根據 HCI、創意寫作、人機協作、代理規劃與自動化研究的綜合設計理論，需透過 PerkinsBench 與長期使用研究驗證。

# 三、Fundamental Theory：人類中心的閉迴路創作系統

## 3.1 六項基本命題

1. 意圖主權命題：人類是作品之『為何存在』與價值取捨的語義權威；Agent 可以提出方案，但不能把自身偏好升格為 canon。  
2. 提案非提交命題：Agent 的生成結果預設是候選提案，不是正式故事事實；只有經過批准與版本化的狀態變更才可進入 Canon。  
3. 狀態優先命題：長篇協作的主要記憶不是聊天紀錄，而是結構化、可核對、可回復的狀態物件。  
4. 評估分離命題：生成、評論與批准應有清楚的角色與證據分離；Agent 不應單獨評選自己產生的唯一答案。  
5. 不確定性保留命題：創作中的未知與歧義有時是資產，不是缺陷；系統應保存候選分支、理由與未決問題，而不是強行壓成單一結論。  
6. 可恢復性命題：每一項重大變更都要能回答『誰在何時以何根據改了什麼』，並能回到前一個穩定狀態。

## 3.2 形式化表示

令創作狀態為 Sₜ \= (Iₜ, Cₜ, Nₜ, Pₜ, Uₜ, Vₜ)：I 是人類意圖與價值；C 是 Canon／Story Bible；N 是 Narrative State；P 是權限與任務狀態；U 是不確定性與候選分支；V 是版本、來源與決策歷史。Agent 讀取 Sₜ 後產生提案 pₜ 與評估證據 eₜ，但不直接把 pₜ 寫入 Cₜ。

狀態轉移可表示為：Sₜ₊₁ \= Merge(Sₜ, pₜ, eₜ, hₜ)，其中 hₜ 是人類批准／拒絕／重定向動作。對低風險、可逆的格式整理，hₜ 可以是預先授權的規則；對改變主題、角色倫理、世界觀、情節因果或公開發布的動作，hₜ 必須是明確的人類批准。這是本報告的設計模型，不是已獲實證驗證的數學定律。

## 3.3 為何是閉迴路而非線性流水線

ReAct 類研究顯示，代理能在推理與行動之間交替，透過環境回饋更新計畫；Reflexion 與 Self-Refine 則展示以語言回饋、記憶與反覆修訂促進後續行動。這些研究支持『觀察—提案—行動—回饋』的代理迴圈，但在創作領域必須加上一層人類語義裁決，避免代理把自己的回饋當成唯一標準。

因此，Agentic Writing 的品質函數不能只有效率或單篇評分。可用設計目標 J \= αQ \+ βA \+ γD \+ δT − λR 表示：Q 為作品品質，A 為作者能動性與所有權，D 為候選／群體多樣性，T 為可追溯性，R 為錯誤、越權與同質化風險。權重應由作品類型與作者設定，且需用實驗驗證，不能直接把這個式子當作客觀真理。

# 四、Agentic Writing 架構

建議將系統分為七層。其關鍵不是每層都必須由獨立模型實現，而是每一層的責任、資料邊界與批准條件要能被看見。

| 層次 | 核心物件／能力 | 人類與 Agent 的責任 | 失效時的保護 |
| :---- | :---- | :---- | :---- |
| 1\. 意圖層 | Creative Brief、主題、讀者、禁區、不可妥協價值 | 人類定義與修訂；Agent 只協助澄清 | 意圖變更需顯式批准 |
| 2\. Canon／狀態層 | Story Bible、角色卡、時間線、Narrative State | 人類擁有語義權威；Agent 提交 patch | 只讀 Canon、版本化、衝突標記 |
| 3\. 任務層 | Writing Task、依賴、完成條件、優先序 | Orchestrator 拆分；人類批准高風險任務 | 小批次、可重試、禁止無限循環 |
| 4\. Agent 能力層 | 發想、起草、查詢、連貫性、風格、事實查核 | 各 Agent 只做窄任務 | 最小權限、角色分離、禁止自動改 Canon |
| 5\. 工具／環境層 | 檔案、搜尋、資料庫、渲染、評估器 | Harness 管理工具與沙盒 | allowlist、隔離、成本與速率限制 |
| 6\. 評估／回饋層 | Continuity、Style、Source、Uncertainty、Diversity checks | Agent 提供證據；人類判斷文學價值 | 獨立評估、紅旗、升級 |
| 7\. 版本／治理層 | Decision Ledger、Provenance、diff、審批、發布 | 人類對重大變更負責 | 可回復、稽核、作者貢獻記錄 |

**視覺化總覽：**人類意圖 → Harness 任務化 → Agent 候選生成／工具操作 → 狀態與證據評估 → 人類批准／拒絕／重定向 → Canon 版本化 → 下一輪任務。所有箭頭都應留下可讀取的輸入、輸出與理由。

# 五、Harness Engineering 架構與護欄

## 5.1 Harness 的四個控制面

| 控制面 | 回答的問題 | 寫作實作 |
| :---- | :---- | :---- |
| Context plane | Agent 此刻應看見什麼？ | 只召回與本任務相關的 Canon、摘要、未決問題與來源；避免把全部聊天紀錄當記憶。 |
| Action plane | Agent 可以做什麼？ | 產生候選、提交 patch、查詢來源、執行檢查；不能自行發布或改寫人類鎖定的內容。 |
| Evaluation plane | 如何知道完成或失敗？ | 以章節完成條件、連貫性測試、來源核對、風格規則與人類評閱組合判斷。 |
| Governance plane | 誰批准、誰負責、如何回復？ | 高風險門檻、審批記錄、diff、版本、回滾與不確定性升級。 |

## 5.2 十道護欄的詳細設計

| 護欄 | 目的 | 機制 | 驗收／測試 |
| :---- | :---- | :---- | :---- |
| 1 意圖護欄 | 保護主題、倫理與作者想說的話 | Creative Brief 必須包含目標、讀者、價值、禁區與未決問題；Agent 改變其中任一項即建立意圖變更提案。 | 防止任務執行中方向漂移；測試每次大幅改寫是否能指出其對意圖的影響。 |
| 2 Canon 護欄 | 區分候選文字與正式故事事實 | Canon 只讀；Agent 以 patch、分支或候選文件提交；合併需人類或明確規則批准。 | 防止自動生成內容被下一輪當成既定事實；測試未批准 patch 不得被召回為 Canon。 |
| 3 狀態護欄 | 維持長篇工作的連貫性 | Story Bible、角色卡、時間線、Narrative State 使用結構化欄位；每輪任務先產生狀態摘要與待確認衝突。 | 防止角色年齡、動機、時間與空間錯亂；測試以回歸案例檢查跨章節一致性。 |
| 4 任務護欄 | 控制代理自主拆題與持續時間 | 每個 Writing Task 有輸入、輸出、完成條件、最大迭代、停止條件與升級條件；大任務拆成可驗收的小批次。 | 防止 doom loop、無限修訂與範圍膨脹；測試超出迭代上限必須停下。 |
| 5 角色／權限護欄 | 避免同一 Agent 同時發想、裁決與提交 | 分離 Orchestrator、Ideation、Drafter、Continuity Reviewer、Literary Editor、Source Verifier、Docs Keeper；高風險 Agent 只讀。 | 降低自我合理化與單一觀點壟斷；測試每個工具呼叫均符合 allowlist。 |
| 6 工具護欄 | 限制外部作用與資料外洩 | 工具採 allowlist、沙盒、最小權限、速率／成本上限；搜尋、寫檔、發布、刪除分開授權。 | 防止越權修改、把草稿外傳或誤刪；測試禁止工具必須被拒絕並留下記錄。 |
| 7 評估護欄 | 讓完成條件可觀測而非靠語感 | 將自動測試、來源核對、連貫性檢查、風格檢查與人類評閱並列；評估器與生成器分離。 | 防止流暢性取代正確性；測試每個通過結論都要附證據或明確標示『未驗證』。 |
| 8 不確定性護欄 | 不把未知或創意分歧偽裝成確定答案 | 標示事實不確定、意圖不確定、價值不確定、模型不確定與分支選擇；高不確定時提出問題或列出選項。 | 防止幻覺、過度自信與創意過早收斂；測試高風險輸出必須升級。 |
| 9 來源／版本護欄 | 保存可追溯、可回復的工作歷史 | 每次重大變更記錄作者、Agent、模型、來源、理由、diff、時間與批准狀態；保留分支和回滾點。 | 防止無法辨識人類貢獻與錯誤累積；測試任一成品段落可回溯到決策與來源。 |
| 10 多樣性護欄 | 保護個人聲音與群體異質性 | 在發想階段要求語義上真正不同的方案；保存少數／反直覺候選；用相似度、視角、節奏與題材分布做監測。 | 抵抗負向文化棘輪；測試不是只選最高平均評分，而要報告方案分布與被淘汰的理由。 |

## 5.3 角色分工：Humans steer, agents execute

| 角色 | 可做 | 不可做 | 交付物 |
| :---- | :---- | :---- | :---- |
| Human Author／Editor | 定義意圖、挑選分支、批准 Canon、判斷文學價值 | 把責任完全外包給模型 | 批准決策、語義修訂、最終作品 |
| Orchestrator | 讀取任務與狀態、安排順序、管理停止條件 | 改寫 Canon 或自行改變意圖 | 任務計畫、狀態摘要、升級事項 |
| Ideation Agent | 產生不同候選與反例 | 把候選標成唯一最佳答案 | 候選集、差異說明、未決問題 |
| Drafter Agent | 依批准方向起草局部文本 | 自行加入未批准的世界觀事實 | 草稿、變更 patch、假設清單 |
| Continuity／Source Reviewer | 查找矛盾、核對來源、提出風險 | 直接改正並默默寫回正式文件 | 問題報告、證據連結、嚴重度 |
| Docs／Canon Keeper | 維護版本、索引與可追溯資料 | 替人類做價值選擇 | 版本、diff、Provenance、Decision Ledger |

『只讀』在創意系統中不代表 Agent 沒有價值，而是將它的價值放在觀測、比較與提出可審核的變更。這正是 Harness 將能力與權限分離的地方：Agent 可以很會分析，但不因此自動擁有修改語義狀態的權力。

# 六、LLM 如何應對非絕對確定性的決策

## 6.1 先辨認五種不確定性

| 類型 | 例子 | 正確處理 |
| :---- | :---- | :---- |
| 事實不確定 | 某歷史細節、地名、來源是否存在 | 檢索、交叉核對、標示來源；無法驗證就不寫成確定事實。 |
| 意圖不確定 | 作者想要悲劇收束還是開放結局 | 提出最小澄清問題，或並列兩個符合不同意圖的方案。 |
| 價值不確定 | 哪一個角色行為更道德或更有文學力量 | 呈現取捨與後果，把判斷交還作者；不要以模型偏好冒充客觀標準。 |
| 模型不確定 | 模型輸出在不同抽樣下出現互相矛盾的說法 | 多次採樣、語義一致性檢查、外部證據與升級；不以語氣自信作信度。 |
| 創意分支不確定 | 三個情節都可能成立，沒有唯一正解 | 保留分支、比較效果、延後收斂；把不確定性當成探索資源。 |

## 6.2 決策策略：四種回應模式

7. 直接回答：證據充分、風險低、意圖清楚，而且答案可逆時，給出答案並指出依據。  
8. 條件式建議：有多個合理解，明確列出『若你重視 A，選方案 1；若你重視 B，選方案 2』，不要製造虛假的唯一最佳解。  
9. 澄清／分支：意圖或價值尚未確定時，提出一個能最大幅度降低歧義的問題，或提供小型候選集，讓人類保留主導權。  
10. 暫緩／升級：高風險事實、權利、公開發布、重大世界觀變更或證據互斥時，停止自動寫入，交給人類或專業檢查。

## 6.3 不確定性介面應呈現什麼

Farquhar 等人的 semantic entropy 研究提醒我們，LLM 的不確定性應盡量在語義層次估計，而不是只看字詞機率；研究也明確指出，偵測到 confabulation 不等於保證事實正確。對寫作 Harness 而言，工程上可採用較保守的組合：多候選語義聚類、來源檢索、規則檢查、角色／時間線回歸測試、以及人類在高風險處的裁決。

| 介面欄位 | 建議內容 |
| :---- | :---- |
| 信心不是單一百分比 | 分別顯示證據充分度、候選分歧度、意圖清晰度與風險等級。 |
| 理由與假設 | 列出用了哪些 Canon、哪些外部來源、哪些內容是推測或新提案。 |
| 可逆性 | 標示此動作是否可回滾，以及若採用會鎖定哪些後續選擇。 |
| 下一步選項 | 直接採用、先看其他候選、提出澄清、只存為草稿、交由人類／專業者審核。 |

# 七、由理論到工作流：Perkins Agentic Writing Editor

依照先前對 Perkins Agentic Writing Editor 的定位——重新定義代理寫作、以人為中心的 Agent 輔助創作平台——建議採用以下工作流。這是產品與研究架構建議，不代表現有介面已完成。

| 階段 | 人類輸入／批准 | Agent 動作 | 不可跨越的門檻 |
| :---- | :---- | :---- | :---- |
| A 意圖設定 | Creative Brief、作品價值、禁區、成功條件 | 澄清歧義、建立問題清單 | 不得自行替作者定義主題 |
| B 發散探索 | 可接受的探索範圍與要保留的禁忌／反直覺方向 | 生成多樣候選、反例與代價 | 不得只回傳單一最佳答案 |
| C 選擇與任務化 | 選定分支、鎖定 Canon、批准章節任務 | 拆解任務、建立依賴與驗收條件 | 重大選擇要留下理由 |
| D 局部起草 | 批准角色、視角、語氣與本段目標 | 起草、標註假設、提出 patch | 不得默默改變未批准事實 |
| E 評估修訂 | 人類判斷文學效果與取捨 | 做連貫性、來源、風格與風險檢查 | 生成器不得自動合併自己的批評 |
| F 合併與回顧 | 批准進入 Canon 或退回分支 | 更新版本、索引、Decision／Uncertainty Ledger | 未批准內容不可成為下輪 Canon |

對介面而言，最重要的不是增加更多『生成』按鈕，而是讓作者清楚看見：目前正在處理哪個任務、Agent 讀了哪些狀態、提出了哪些不同候選、哪些部分已被批准、哪些仍是假設，以及下一步會鎖定什麼。

# 八、評估設計與 PerkinsBench 的研究位置

PerkinsBench 可被定位為本架構的研究型診斷基準：不是只測『寫得像不像標準答案』，而是測 Agent 是否能在創意開放、價值分歧與不確定性存在時，維持人類能動性並做出可辯護的介入。建議四個軸向如下：

| 軸向 | 評估問題 | 可能指標 |
| :---- | :---- | :---- |
| P1 Literary Technique | Agent 能否辨識與改善視角、節奏、意象、對話、敘事距離等技術問題？ | 專業評閱、局部修訂效益、錯誤診斷率 |
| P2 Constructive Uncertainty | 面對多個合理方向時，Agent 是否能保留分支而非假裝確定？ | 分支品質、校準、澄清問題資訊價值、適當升級率 |
| P3 Open-ended Creative Decision-making | Agent 能否擴大候選空間而不把作者錨定在自己的高頻模板？ | 語義多樣性、反直覺候選、作者選擇後的滿意度 |
| P4 Editorial／Literary Judgment | Agent 是否能提出有證據的編輯判斷，並尊重作者的最終選擇？ | 建議可採用率、理由品質、誤導率、作者能動性與所有權 |

## 8.1 不能只測成品分數

如果只以讀者平均評分、文字流暢度或完成時間做 benchmark，系統會偏向高機率模板，無法測出作者是否仍在做關鍵決策，也無法測出被壓縮的創意尾端。評估應同時包含：成品品質、過程中的人類介入、候選分布、錯誤回復、決策可追溯性、以及在不同作者與文化語境下的公平性。

## 8.2 建議的實驗對照

* 人類單獨創作 vs. 單輪 AI 輔助 vs. 具 Harness 的 Agentic Writing。  
* 只有 prompt 的系統 vs. 有狀態、角色分離、版本與評估門檻的 Harness。  
* AI 在規劃早期主導 vs. 人類先寫 Creative Brief、AI 延後介入。  
* 單一候選最佳化 vs. 多分支、反例與多樣性約束。  
* 自動合併 vs. 人類批准後合併，觀察品質、速度、所有權與後續修訂能力。

# 九、研究限制與待驗證問題

* 目前直接針對長篇 Agentic Writing 的長期、跨文化與大樣本研究仍有限；許多建議是從 HCI、創意寫作實驗與代理系統研究轉移而來。  
* AI 造成的同質化可能依模型、提示、作者能力、題材、平台評分與人類介入方式而變；不能把單一實驗外推為所有寫作情境的必然結果。  
* 語義熵、模型自評與相似度指標只能提供風險訊號，不能替代文學判斷，也不能保證沒有幻覺或偏見。  
* 『作者性』與『所有權感』同時涉及心理、文化、法律與社群規範；應在台灣語境中進行使用者研究，特別關注中文、台語、客語、原住民族語與混語創作。  
* 需要研究 Harness 是否會過度規訓創作者：護欄若只剩硬性檢查，可能把創意中的故意違規、歧義與陌生化誤判為錯誤。護欄應區分安全／一致性硬門檻與可由作者覆寫的文學偏好。

# 十、結論

Agentic Writing 的 Fundamental Theory 不應建立在『模型更會寫，所以讓它自主完成更多』這個單一假設上。更穩健的理論起點是：創意寫作是一個由意圖、探索、選擇、表達、評估與回顧組成的閉迴路；LLM Agent 可以提高其中若干環節的速度與廣度，但也會改變注意力、候選分布、權威感、技能分配與文化回饋。

Harness Engineering 因而是 Agentic Writing 的必要基礎設施。它把人類意圖、Canon、任務、工具、評估、權限、記憶、版本與批准編排成可觀測的系統，讓 Agent 的能力可以被放大，而不把作者的語義主權一併外包。最重要的設計原則可濃縮為：人類決定方向，Agent 擴張與檢驗可能性；Agent 提交提案，不直接改寫真實；不確定性被記錄與利用，而不是被流暢語句掩蓋；每個重大決策都可回溯、可辯護、可回復。

因此，Perkins Agentic Writing Editor 的研究與產品路線，應優先建立『人類主權 \+ 結構化狀態 \+ 多角色代理 \+ 評估與不確定性護欄 \+ 可追溯版本』的協作骨架，再逐步增加模型能力。若以 PerkinsBench 量測文學技術、建設性不確定性、開放式創意決策與編輯判斷，便能把『AI 幫忙寫得更快』提升為更嚴謹的問題：AI 是否在擴大人類的創作能力，同時保留人類作為作者、判斷者與文化創新者的地位。

# 參考資料與延伸閱讀

**\[1\]** Reza, M. et al. (2025). Co-Writing with AI, on Human Terms: Aligning Research with User Demands Across the Writing Process. arXiv:2504.12488. https://arxiv.org/abs/2504.12488

**\[2\]** Hosanagar, K. & Ahn, D. (2024). Designing Human and Generative AI Collaboration. arXiv:2412.14199. https://arxiv.org/abs/2412.14199

**\[3\]** Doshi, A. R. & Hauser, O. P. (2024). Generative AI enhances individual creativity but reduces the collective diversity of novel content. Science Advances, 10(28). https://doi.org/10.1126/sciadv.adn5290

**\[4\]** Clark, E. et al. (2018). Creative Writing with a Machine in the Loop: Case Studies on Slogans and Stories. IUI. https://doi.org/10.1145/3172944.3172983

**\[5\]** Mirowski, P. et al. (2023). Co-Writing Screenplays and Theatre Scripts with Language Models: Evaluation by Industry Professionals. CHI. https://doi.org/10.1145/3544548.3581225

**\[6\]** Jakesch, M. et al. (2023). Co-Writing with Opinionated Language Models Affects Users’ Views. CHI. https://doi.org/10.1145/3544548.3581196

**\[7\]** Amershi, S. et al. (2019). Guidelines for Human-AI Interaction. CHI. https://doi.org/10.1145/3290605.3300233

**\[8\]** Horvitz, E. (1999). Principles of Mixed-Initiative User Interfaces. CHI. https://doi.org/10.1145/302979.303030

**\[9\]** Shneiderman, B. (2020). Human-Centered Artificial Intelligence: Reliable, Safe & Trustworthy. arXiv:2002.04087. https://arxiv.org/abs/2002.04087

**\[10\]** Yao, S. et al. (2023). ReAct: Synergizing Reasoning and Acting in Language Models. ICLR. https://arxiv.org/abs/2210.03629

**\[11\]** Shinn, N. et al. (2023). Reflexion: Language Agents with Verbal Reinforcement Learning. NeurIPS. https://arxiv.org/abs/2303.11366

**\[12\]** Madaan, A. et al. (2023). Self-Refine: Iterative Refinement with Self-Feedback. NeurIPS. https://arxiv.org/abs/2303.17651

**\[13\]** Hu, S., Lu, C. & Clune, J. (2025). Automated Design of Agentic Systems. ICLR. https://openreview.net/forum?id=t9U3LW7JVX

**\[14\]** Lee, Y. et al. (2026). Meta-Harness: End-to-End Optimization of Model Harnesses. arXiv:2603.28052. https://arxiv.org/abs/2603.28052

**\[15\]** Lin, J. et al. (2026). Agentic Harness Engineering: Observability-Driven Automatic Evolution of Coding-Agent Harnesses. arXiv:2604.25850. https://arxiv.org/abs/2604.25850

**\[16\]** Meng, Q. et al. (2026). Agent Harness for Large Language Model Agents: A Survey. Preprints. https://www.preprints.org/manuscript/202604.0428/v1

**\[17\]** Anthropic (2026). Long-running Claude for scientific computing. https://www.anthropic.com/research/long-running-Claude

**\[18\]** Farquhar, S. et al. (2024). Detecting hallucinations in large language models using semantic entropy. Nature, 630, 625–630. https://doi.org/10.1038/s41586-024-07421-0

**\[19\]** Tomani, C. et al. (2024). Uncertainty-Based Abstention in LLMs Improves Safety and Reduces Hallucinations. arXiv:2404.10960. https://arxiv.org/abs/2404.10960

**\[20\]** Bender, E. M. et al. (2021). On the Dangers of Stochastic Parrots. FAccT. https://doi.org/10.1145/3442188.3445922

**\[21\]** Parasuraman, R. & Riley, V. (1997). Humans and Automation: Use, Misuse, Disuse, Abuse. Human Factors. https://doi.org/10.1518/001872097778543886

**\[22\]** Ji, Z. et al. (2023). Survey of Hallucination in Natural Language Generation. ACM Computing Surveys. https://doi.org/10.1145/3571730

**\[23\]** Shumailov, I. et al. (2024). AI models collapse when trained on recursively generated data. Nature, 631, 755–759. https://doi.org/10.1038/s41586-024-07566-y

**\[24\]** Tennie, C. et al. (2009). Ratcheting up the ratchet: on the evolution of cumulative culture. Philosophical Transactions B. https://doi.org/10.1098/rstb.2009.0052

**\[25\]** Carlini, N. et al. (2021). Extracting Training Data from Large Language Models. USENIX Security. https://www.usenix.org/conference/usenixsecurity21/presentation/carlini

**\[26\]** U.S. Copyright Office (2025). Copyright and Artificial Intelligence, Part 2: Copyrightability. https://www.copyright.gov/ai/Copyright-and-Artificial-Intelligence-Part-2-Copyrightability-Report.pdf

**\[27\]** NIST (2023). Artificial Intelligence Risk Management Framework (AI RMF 1.0). https://doi.org/10.6028/NIST.AI.100-1