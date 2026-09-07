# 傳奇健康管理學院｜健康管理客戶管理 APP

## 功能
- 行動版 RWD，適配 iPhone / Android / 平板 / 電腦
- 我的紀錄 + 10 組客戶資料
- 基本資料、身體數據、生活狀態、蛋白質、自我感受、完整報告
- 水量自動計算：體重 × 50 cc
- 蛋白質份數自動計算：(體重 × 2) ÷ 7；1份約7克
- LocalStorage 自動儲存
- JSON 全資料備份 / 還原
- 當前頁面匯出 PNG / A4 直式 PDF / 系統分享
- 匯出時自動隱藏所有按鈕、導覽列與操作元件，輸入框轉成乾淨文字
- PWA 可加入手機主畫面

## GitHub
1. 建立新 Repository。
2. 將此資料夾內所有檔案上傳到 Repository 根目錄。
3. Push 即可。

## Railway
1. Railway → New Project → Deploy from GitHub Repo。
2. 選擇此 Repository。
3. Railway 會讀取 package.json，使用 `npm start`。
4. Settings / Networking → Generate Domain。

## 注意
目前資料儲存在使用者瀏覽器 LocalStorage；清除網站資料、換瀏覽器或換手機不會自動同步。可用「備份與設定」下載 JSON 備份檔。
