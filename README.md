# 今日事

樂樂每天要做的事、媽媽們交代的事、留言和存錢筒。三支手機（樂樂、兩位媽媽）共用同一份資料，即時同步，沒有網路也能打勾。

- 前端：React + Vite，部署在 **GitHub Pages**（推到 `main` 自動部署）
- 登入與資料庫：**Supabase**，跟「叫蛋記帳」共用同一個免費專案，資料表都用 `kt_` 開頭、權限分開
- 不串接任何 AI API，也不需要付費服務

## 身分

畫面上只有兩種身分：**樂樂**（打勾、留言、申請領錢）和**媽媽們**（交代事情、改任務和考試、存入、確認領錢）。身分記在資料表 `kt_members`，權限由資料庫規則（RLS）把關，前端改不了。

## 離線

- 網頁本身由 `public/sw.js` 存在手機裡，沒網路也打得開。
- 離線時的動作先排隊存在手機（`localStorage`），連上網路依序送出；每個新增都帶固定 id，重送不會重複。
- 打勾離線晚送也算數，但只接受當天和前一天，時間必須落在那一天。

## 資料來源

- 國定假日：行政院人事行政總處辦公日曆表（經 github.com/ruyut/TaiwanCalendar），2026、2027 年內建，之後的年份自動下載。
- 學校日期與段考：家長提供的 115 學年度第一學期行事曆。下學期的行事曆出來後要更新 `src/lib/calendar.ts` 和段考日期。

## 指令

```
npm run typecheck
npm test            # 純函式 + 資料庫權限規則（PGlite 跑真的 migration）
npm run build
npm run test:e2e    # 兩支手機同時操作的驗收流程（本機 Supabase 替身）
npm run check:secrets
```

沒有 Playwright 自帶瀏覽器的環境：`PW_CHROMIUM_PATH=<chromium 路徑> npm run test:e2e`

## 機密資料

前端只有 Supabase 的 publishable key（本來就設計成公開）。資料庫密碼、secret / service_role 金鑰不放進 repo；`npm run check:secrets` 會在部署前檢查。帳號密碼不寫在 repo 裡。
