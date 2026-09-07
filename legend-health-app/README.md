# 傳奇健康管理學院 客戶管理 APP v4

這是可部署到 GitHub + Railway 的手機版 PWA。v4 新增 **Web Push + Railway 後端排程喝水提醒**，即使使用者關閉網頁，Railway 仍會依排程透過瀏覽器 Push Service 發送通知。

## v4 功能

- 我的紀錄 + 10 組客戶紀錄
- 性別、身高、BMI 自動計算
- 體重、體脂肪率、骨骼肌率、內臟脂肪、腰圍與性別理想值
- 每日水量 = 體重 × 50 cc
- 每日蛋白質份數 =（體重 × 2）÷ 7；一份約 7 克
- 三天生活狀態、蛋白質、自我感受紀錄
- A4 直式 PDF、PNG、手機分享；匯出時自動移除按鈕與操作工具
- PWA 加入主畫面
- Web Push 背景喝水提醒：30 / 60 / 90 / 120 分鐘
- 每組客戶可設定不同開始時間、結束時間與時區
- 「測試通知」功能
- Railway PostgreSQL 保存推播 subscription 與排程；完整健康紀錄仍只存在使用者瀏覽器 LocalStorage

## Railway 部署（必要步驟）

### 1. 上傳 GitHub

將本資料夾內所有檔案放在 GitHub Repository 根目錄並 Commit / Push。

### 2. Railway 建立 Web Service

Railway → New Project → Deploy from GitHub Repo → 選擇 Repository。

Railway 會依 `package.json` 執行 `npm start`。

### 3. 加入 PostgreSQL

在同一 Railway Project 點 **+ New → Database → PostgreSQL**。

將 PostgreSQL 的 `DATABASE_URL` 變數提供給 Web Service。若 Railway 使用 Variable Reference，可在 Web Service Variables 加：

`DATABASE_URL=${{Postgres.DATABASE_URL}}`

實際服務名稱若不是 `Postgres`，請使用 Railway 畫面顯示的資料庫服務名稱。

APP 啟動時會自動建立 `push_reminders` 資料表，不需手動執行 SQL。

### 4. 產生 VAPID 金鑰

在本機解壓縮專案後：

```bash
npm install
npm run generate-vapid
```

會輸出：

```text
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:your-email@example.com
```

把這 3 個變數加入 Railway → Web Service → Variables。

`VAPID_SUBJECT` 請換成你自己的聯絡 Email，例如 `mailto:admin@yourdomain.com`。

> VAPID_PRIVATE_KEY 是伺服器私密金鑰，不要寫進 GitHub，也不要放在前端程式碼。

### 5. Generate Domain

Railway → Web Service → Settings / Networking → Generate Domain。

Web Push 正式環境必須使用 HTTPS。Railway 產生的網域已提供 HTTPS。

### 6. 確認後端狀態

部署完成後開啟：

`https://你的網域/api/health`

正常應看到：

```json
{"ok":true,"db":true,"push":true}
```

若 `db:false`：檢查 `DATABASE_URL`。
若 `push:false`：檢查 VAPID 三個環境變數。

## 手機啟用方式

### Android / Chrome

1. 用 Chrome 開啟 Railway 網址。
2. 進入「喝水提醒」。
3. 點「允許通知並連線」。
4. 手機跳出通知權限時選「允許」。
5. 設定開始、結束時間與間隔。
6. 開啟「啟用喝水提醒」。
7. 點「儲存提醒設定」。
8. 點「傳送測試通知」確認手機收到通知。

建議再將網站「加入主畫面／安裝 APP」。

### iPhone / iPad

Web Push 需要 **iOS / iPadOS 16.4 以上**，而且網站必須先加入主畫面：

1. 用 Safari 開啟 Railway 網址。
2. Safari 分享 → **加入主畫面**。
3. 從主畫面開啟「傳奇健康管理學院」APP。
4. 進入「喝水提醒」。
5. 點「允許通知並連線」，允許通知。
6. 設定提醒並儲存。
7. 點「傳送測試通知」。

如果 Safari 分頁內直接操作而沒有先加入主畫面，iPhone 可能無法取得 Web Push 權限。

## 排程方式

Railway Node 服務每分鐘檢查 PostgreSQL 中到期的提醒。實際發送時間可能有約 1 分鐘誤差。

例如：

- 開始 08:00
- 結束 22:00
- 每 60 分鐘

系統會在排程時段內持續推播；超過結束時間後，自動排到下一天開始時間。

也支援跨午夜，例如 20:00–01:00。

## 隱私與資料

完整姓名、年齡、身體數據、生活狀態等主要紀錄仍存在手機瀏覽器的 LocalStorage。

為了讓後端能在網頁關閉後發通知，Railway PostgreSQL 只保存：

- 隨機裝置 ID
- 紀錄編號（0–10）
- 該紀錄顯示姓名
- Web Push subscription
- 是否啟用
- 開始／結束時間
- 提醒間隔
- 時區
- 每日建議水量
- 上次與下次推播時間

## Railway 重要注意事項

- Web Service 必須保持可執行背景排程。若使用會休眠的方案，休眠期間不會準時執行提醒。
- 請勿在 Railway 設定多個完全獨立的 Web Service replicas 同時跑同一資料庫，否則有機會造成重複排程。一般單一 Railway service 即可。
- 如未來需要大量使用者，建議把排程改成 dedicated worker / queue，並加入登入與會員識別。

## 本機開發

不設定 PostgreSQL / VAPID 時，前端仍可開啟，但喝水背景推播 API 會顯示尚未設定。

```bash
npm install
npm start
```

瀏覽：`http://localhost:3000`

Service Worker / Push 在 localhost 可用於開發，但真正跨裝置通知仍需要有效 VAPID 與可連線資料庫。
