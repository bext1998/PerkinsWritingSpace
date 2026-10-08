# 編輯器在開發模式會被建立兩次:要對新編輯器做的事放在 Editor 掛載時

- **觸發條件**:父層(Workspace)想在編輯器重掛後對它做一次性操作(標示、捲動、選取),寫成「重掛後的父層 effect 呼叫 `editor.current.xxx()` 再清掉旗標」。
- **證據**(2026-10-09,#45 a 接受提案標示):`main.tsx` 用 `React.StrictMode`,開發模式下 Editor 的掛載 effect 會「建立 → 清理(destroy)→ 再建立」。父層 effect 第一次執行時拿到的是隨即被丟棄的 EditorView,標示畫在舊 view 上(除錯時 `view.current !== v`),第二次執行時旗標已清掉,畫面上看不到。E2E 跑在 `wails dev`(開發模式),所以會穩定失敗;正式建置不會。
- **做法**:把資料當成 Editor 的 prop(例如 `flash`),在 Editor 的掛載 effect 建立 view 之後套用,計時器在清理時取消;父層在 `reloadKey` 改變後的 effect 清掉 state,讓之後的重掛不再套用。
- **適用範圍**:所有由父層對 `Editor` 下的一次性指令。`scrollToLine` 這類由作者操作觸發、不跟重掛同一個 commit 的呼叫不受影響。
