# VR Introduction 一分鐘上線

## 你要做的只有 4 步

1. 建立 Google Sheet。
2. 建立 Google Apps Script，貼上 [apps-script/Code.gs](apps-script/Code.gs) 全部內容。
3. 部署 Apps Script 為 Web App（Execute as: Me、Who has access: Anyone）。
4. 把 Web App URL 貼到 [config.js](config.js) 的 API_BASE_URL，打開後台做首次互動式設定（SHEET_ID、ADMIN_PASSWORD、DRIVE_FOLDER_ID，以及 GitHub 音檔設定）。

## 最後上 GitHub

1. push 專案到 GitHub。
2. 開啟 GitHub Pages（main / root）。
3. 開站：
- 前台：你的 GitHub Pages 網址
- 後台：你的 GitHub Pages 網址 + /admin.html

## 檔案位置

- 前台頁面：[index.html](index.html)
- 後台頁面：[admin.html](admin.html)
- 前台邏輯：[app.js](app.js)
- 後台邏輯：[admin.js](admin.js)
- API 設定：[config.js](config.js)
- Google Sheet API：[apps-script/Code.gs](apps-script/Code.gs)

## 重要提醒

- 第一次呼叫 API 會自動建立 Config 與 Exhibits（含 8 個初始展區）。
- 圖片與音檔會上傳到 Google Drive，網址寫回 Google Sheet。
- 圖片上傳到 Google Drive；音檔（mp3）上傳到你指定的 GitHub repo。
- 後台可直接修改 SHEET_ID、ADMIN_PASSWORD、DRIVE_FOLDER_ID、GITHUB_OWNER、GITHUB_REPO、GITHUB_BRANCH、GITHUB_AUDIO_DIR、GITHUB_PAGES_BASE_URL，不一定要進 Script Properties 手動改。
- 後台可刪除單一圖片或音檔，刪除時會同步把 Google Drive 檔案移到垃圾桶。
- 全站不需要自架主機，不用電腦常駐。
