// 快速指令(SPEC §12.3):只是預先寫好的問題,送出前作者仍可修改問題與附加內容。
export interface Quick {
    id: string;
    label: string;
    question: string;
    mode?: 'report';
}

export const QUICK_ACTIONS: Quick[] = [
    {id: 'analyze', label: '分析這段', question: '請分析這段:它在情節與角色上做了什麼、寫得好的地方,以及可以加強的地方。'},
    {
        id: 'canon', label: '檢查是否違反設定', mode: 'report',
        question: '這段裡角色的言行、稱呼、口癖、能力,是否與附加的設定矛盾?請逐項列出並引用原文與設定作為依據。',
    },
    {id: 'pace', label: '節奏是否太快或太慢', question: '這段的節奏是否太快或太慢?請指出具體位置,並說明讀者可能的感受。'},
    {
        id: 'next', label: '接下來的合理發展',
        question: '根據目前的設定與前文,接下來有哪些合理的發展方向?請列出 3 個,說明各自的依據與代價。不要替我決定,也不要寫出正文。',
    },
];

// 檢查面板的 AI 一致性檢查(報告模式,不會產生提案,B5)。
export const CHECKS: Quick[] = [
    {
        id: 'char', label: '人物設定矛盾', mode: 'report',
        question: '請檢查本章中角色的外貌、個性、口癖、稱呼、能力與附加的設定是否矛盾。逐項列出:位置(引用原文)、矛盾的設定(引用)、嚴重程度。',
    },
    {
        id: 'events', label: '前後事件衝突', mode: 'report',
        question: '請對照前情摘要與附加資料,檢查本章事件是否與前面的情節衝突(時間、地點、誰知道什麼、傷勢與道具狀態等)。逐項列出並引用依據。',
    },
    {
        id: 'terms', label: '名詞與稱呼錯誤', mode: 'report',
        question: '請檢查本章的角色名稱、專有名詞、稱呼方式是否與附加的設定一致,列出每個疑似錯誤的原文與正確寫法。',
    },
];
