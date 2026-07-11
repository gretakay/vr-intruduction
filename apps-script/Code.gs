const CONFIG_SHEET = "Config";
const EXHIBITS_SHEET = "Exhibits";
const TOKEN_TTL_SECONDS = 60 * 60 * 8;
const DEFAULT_GITHUB_BRANCH = "main";
const DEFAULT_GITHUB_AUDIO_DIR = "assets/audio";

function doGet(e) {
  const action = (e && e.parameter && e.parameter.action) || "publicData";

  try {
    if (action === "publicData") {
      return jsonOutput_({ ok: true, data: loadStore_() });
    }
    return jsonOutput_({ ok: false, message: "Unsupported GET action" });
  } catch (error) {
    return jsonOutput_({ ok: false, message: String(error.message || error) });
  }
}

function doPost(e) {
  try {
    const payload = parsePayload_(e);
    const action = payload.action || "";

    if (action === "getSystemSettings") {
      return getSystemSettings_(payload);
    }
    if (action === "login") {
      return login_(payload);
    }
    if (action === "checkToken") {
      requireAuth_(payload.token);
      return jsonOutput_({ ok: true });
    }
    if (action === "saveSystemSettings") {
      return saveSystemSettings_(payload);
    }
    if (action === "saveConfig") {
      requireAuth_(payload.token);
      return saveConfig_(payload);
    }
    if (action === "addExhibit") {
      requireAuth_(payload.token);
      return addExhibit_();
    }
    if (action === "updateExhibit") {
      requireAuth_(payload.token);
      return updateExhibit_(payload);
    }
    if (action === "deleteExhibit") {
      requireAuth_(payload.token);
      return deleteExhibit_(payload);
    }
    if (action === "uploadAssets") {
      requireAuth_(payload.token);
      return uploadAssets_(payload);
    }
    if (action === "removeAsset") {
      requireAuth_(payload.token);
      return removeAsset_(payload);
    }

    return jsonOutput_({ ok: false, message: "Unsupported POST action" });
  } catch (error) {
    return jsonOutput_({ ok: false, message: String(error.message || error) });
  }
}

function parsePayload_(e) {
  const raw = e && e.postData && e.postData.contents ? e.postData.contents : "{}";
  return JSON.parse(raw);
}

function jsonOutput_(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}

function login_(payload) {
  const savedPassword = getConfiguredAdminPassword_();
  if (!savedPassword) {
    throw new Error("尚未設定 ADMIN_PASSWORD，請先完成系統設定");
  }

  if (!payload.password || payload.password !== savedPassword) {
    throw new Error("密碼錯誤");
  }

  const token = Utilities.getUuid() + Utilities.getUuid();
  CacheService.getScriptCache().put(token, "1", TOKEN_TTL_SECONDS);
  return jsonOutput_({ ok: true, token: token });
}

function getSystemSettings_(payload) {
  const props = PropertiesService.getScriptProperties();
  const sheetId = props.getProperty("SHEET_ID") || "";
  const driveFolderId = props.getProperty("DRIVE_FOLDER_ID") || "";
  const hasPassword = Boolean(getConfiguredAdminPassword_());
  const githubConfig = getGithubConfig_();
  const needsSetup = !sheetId || !hasPassword;

  if (!needsSetup && payload.token) {
    requireAuth_(payload.token);
  }

  if (!needsSetup && !payload.token) {
    return jsonOutput_({ ok: true, needsSetup: false, hasPassword: true });
  }

  return jsonOutput_({
    ok: true,
    needsSetup: needsSetup,
    hasPassword: hasPassword,
    sheetId: sheetId,
    driveFolderId: driveFolderId,
    githubOwner: githubConfig.owner,
    githubRepo: githubConfig.repo,
    githubBranch: githubConfig.branch,
    githubAudioDir: githubConfig.audioDir,
    githubPagesBaseUrl: githubConfig.pagesBaseUrl,
    hasGithubToken: Boolean(githubConfig.token)
  });
}

function saveSystemSettings_(payload) {
  const props = PropertiesService.getScriptProperties();
  const needsSetup = !props.getProperty("SHEET_ID") || !props.getProperty("ADMIN_PASSWORD");

  if (!needsSetup) {
    requireAuth_(payload.token);
  }

  const nextSheetId = String(payload.sheetId || "").trim();
  const nextDriveFolderId = String(payload.driveFolderId || "").trim();
  const nextAdminPassword = String(payload.adminPassword || "").trim();
  const nextGithubOwner = String(payload.githubOwner || "").trim();
  const nextGithubRepo = String(payload.githubRepo || "").trim();
  const nextGithubBranch = String(payload.githubBranch || "").trim() || DEFAULT_GITHUB_BRANCH;
  const nextGithubAudioDir = String(payload.githubAudioDir || "").trim() || DEFAULT_GITHUB_AUDIO_DIR;
  const nextGithubPagesBaseUrl = String(payload.githubPagesBaseUrl || "").trim();
  const nextGithubToken = String(payload.githubToken || "").trim();

  if (!nextSheetId) {
    throw new Error("SHEET_ID 不可空白");
  }

  if (needsSetup && !nextAdminPassword) {
    throw new Error("首次設定時，ADMIN_PASSWORD 不可空白");
  }

  props.setProperty("SHEET_ID", nextSheetId);

  if (nextDriveFolderId) {
    props.setProperty("DRIVE_FOLDER_ID", nextDriveFolderId);
  } else {
    props.deleteProperty("DRIVE_FOLDER_ID");
  }

  if (nextAdminPassword) {
    props.setProperty("ADMIN_PASSWORD", nextAdminPassword);
  }

  if (nextGithubOwner) {
    props.setProperty("GITHUB_OWNER", nextGithubOwner);
  }
  if (nextGithubRepo) {
    props.setProperty("GITHUB_REPO", nextGithubRepo);
  }
  if (nextGithubBranch) {
    props.setProperty("GITHUB_BRANCH", nextGithubBranch);
  }
  if (nextGithubAudioDir) {
    props.setProperty("GITHUB_AUDIO_DIR", nextGithubAudioDir);
  }

  if (nextGithubPagesBaseUrl) {
    props.setProperty("GITHUB_PAGES_BASE_URL", nextGithubPagesBaseUrl);
  } else {
    props.deleteProperty("GITHUB_PAGES_BASE_URL");
  }

  if (nextGithubToken) {
    props.setProperty("GITHUB_TOKEN", nextGithubToken);
  }

  ensureSheets_();

  return jsonOutput_({ ok: true });
}

function requireAuth_(token) {
  if (!token) {
    throw new Error("請先登入");
  }
  const exists = CacheService.getScriptCache().get(token);
  if (!exists) {
    throw new Error("登入已過期，請重新登入");
  }
}

function ensureSheets_() {
  const spreadsheetId = PropertiesService.getScriptProperties().getProperty("SHEET_ID");
  if (!spreadsheetId) {
    throw new Error("請先設定 SHEET_ID");
  }

  const ss = SpreadsheetApp.openById(spreadsheetId);

  let configSheet = ss.getSheetByName(CONFIG_SHEET);
  if (!configSheet) {
    configSheet = ss.insertSheet(CONFIG_SHEET);
    configSheet.getRange(1, 1, 1, 2).setValues([["key", "value"]]);
    configSheet.getRange(2, 1, 2, 2).setValues([
      ["title", "歡迎來到某某某展場"],
      ["logoUrl", ""]
    ]);
  }

  let exhibitsSheet = ss.getSheetByName(EXHIBITS_SHEET);
  if (!exhibitsSheet) {
    exhibitsSheet = ss.insertSheet(EXHIBITS_SHEET);
    exhibitsSheet.getRange(1, 1, 1, 5).setValues([["id", "name", "imageUrl", "audioUrl", "updatedAt"]]);

    const rows = [];
    for (let i = 1; i <= 8; i += 1) {
      rows.push(["exhibit-" + i, "展區 " + i, "", "", new Date().toISOString()]);
    }
    exhibitsSheet.getRange(2, 1, rows.length, 5).setValues(rows);
  }

  return {
    ss: ss,
    configSheet: configSheet,
    exhibitsSheet: exhibitsSheet
  };
}

function loadStore_() {
  const refs = ensureSheets_();
  const configRows = refs.configSheet.getDataRange().getValues();
  const config = {
    title: "歡迎來到某某某展場",
    logoUrl: ""
  };

  for (let i = 1; i < configRows.length; i += 1) {
    const key = String(configRows[i][0] || "").trim();
    const value = String(configRows[i][1] || "").trim();
    if (key) {
      config[key] = value;
    }
  }

  const exhibitRows = refs.exhibitsSheet.getDataRange().getValues();
  const exhibits = [];

  for (let j = 1; j < exhibitRows.length; j += 1) {
    const row = exhibitRows[j];
    const id = String(row[0] || "").trim();
    if (!id) {
      continue;
    }
    exhibits.push({
      id: id,
      name: String(row[1] || "").trim(),
      imageUrl: normalizeImageUrl_(String(row[2] || "").trim()),
      audioUrl: normalizeAudioUrl_(String(row[3] || "").trim())
    });
  }

  return {
    config: config,
    exhibits: exhibits
  };
}

function saveConfig_(payload) {
  const refs = ensureSheets_();
  const title = String(payload.title || "").trim() || "歡迎來到某某某展場";
  const logoUrl = String(payload.logoUrl || "").trim();

  upsertConfigKey_(refs.configSheet, "title", title);
  upsertConfigKey_(refs.configSheet, "logoUrl", logoUrl);

  return jsonOutput_({ ok: true });
}

function upsertConfigKey_(sheet, key, value) {
  const values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i += 1) {
    if (String(values[i][0]).trim() === key) {
      sheet.getRange(i + 1, 2).setValue(value);
      return;
    }
  }
  sheet.appendRow([key, value]);
}

function addExhibit_() {
  const refs = ensureSheets_();
  const values = refs.exhibitsSheet.getDataRange().getValues();
  const count = Math.max(0, values.length - 1);
  const id = Utilities.getUuid().replace(/-/g, "").slice(0, 12);
  const name = "新展區 " + (count + 1);
  refs.exhibitsSheet.appendRow([id, name, "", "", new Date().toISOString()]);
  return jsonOutput_({ ok: true, id: id });
}

function updateExhibit_(payload) {
  const refs = ensureSheets_();
  const target = findExhibitRow_(refs.exhibitsSheet, payload.id);
  if (!target) {
    throw new Error("找不到展區");
  }

  const name = payload.name != null ? String(payload.name).trim() : null;
  if (name !== null) {
    refs.exhibitsSheet.getRange(target.row, 2).setValue(name);
    refs.exhibitsSheet.getRange(target.row, 5).setValue(new Date().toISOString());
  }

  return jsonOutput_({ ok: true });
}

function deleteExhibit_(payload) {
  const refs = ensureSheets_();
  const target = findExhibitRow_(refs.exhibitsSheet, payload.id);
  if (!target) {
    throw new Error("找不到展區");
  }

  deleteDriveFileByUrl_(target.imageUrl);
  deleteGithubAudioIfPossible_(target.audioUrl);

  refs.exhibitsSheet.deleteRow(target.row);
  return jsonOutput_({ ok: true });
}

function uploadAssets_(payload) {
  const refs = ensureSheets_();
  const target = findExhibitRow_(refs.exhibitsSheet, payload.id);
  if (!target) {
    throw new Error("找不到展區");
  }

  const folder = getUploadFolder_();

  if (payload.image && payload.image.base64) {
    deleteDriveFileByUrl_(target.imageUrl);
    const imageUrl = createDriveFile_(folder, payload.image);
    refs.exhibitsSheet.getRange(target.row, 3).setValue(imageUrl);
  }

  if (payload.audio && payload.audio.base64) {
    validateAudioPayload_(payload.audio);
    deleteGithubAudioIfPossible_(target.audioUrl);
    const audioUrl = uploadAudioToGithub_(payload.audio, payload.id);
    refs.exhibitsSheet.getRange(target.row, 4).setValue(audioUrl);
  }

  refs.exhibitsSheet.getRange(target.row, 5).setValue(new Date().toISOString());
  return jsonOutput_({ ok: true });
}

function validateAudioPayload_(audioPayload) {
  const name = String(audioPayload.name || "").toLowerCase();
  const mime = String(audioPayload.mime || "").toLowerCase();
  const isMp3ByName = /\.mp3$/.test(name);
  const isMp3ByMime = mime === "audio/mpeg" || mime === "audio/mp3";

  if (!isMp3ByName && !isMp3ByMime) {
    throw new Error("目前僅支援 MP3 音檔上傳");
  }
}

function removeAsset_(payload) {
  const refs = ensureSheets_();
  const target = findExhibitRow_(refs.exhibitsSheet, payload.id);
  if (!target) {
    throw new Error("找不到展區");
  }

  const assetType = String(payload.assetType || "").trim();
  if (assetType !== "image" && assetType !== "audio") {
    throw new Error("assetType 僅支援 image 或 audio");
  }

  if (assetType === "image") {
    deleteDriveFileByUrl_(target.imageUrl);
    refs.exhibitsSheet.getRange(target.row, 3).setValue("");
  } else {
    deleteGithubAudioIfPossible_(target.audioUrl);
    refs.exhibitsSheet.getRange(target.row, 4).setValue("");
  }

  refs.exhibitsSheet.getRange(target.row, 5).setValue(new Date().toISOString());
  return jsonOutput_({ ok: true });
}

function getUploadFolder_() {
  const folderId = PropertiesService.getScriptProperties().getProperty("DRIVE_FOLDER_ID") || "";
  if (folderId) {
    return DriveApp.getFolderById(folderId);
  }
  return DriveApp.getRootFolder();
}

function createDriveFile_(folder, filePayload) {
  const bytes = Utilities.base64Decode(filePayload.base64);
  const blob = Utilities.newBlob(bytes, filePayload.mime || "application/octet-stream", filePayload.name || Utilities.getUuid());
  const file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return drivePublicUrl_(file.getId(), String(filePayload.mime || "").indexOf("image/") === 0);
}

function drivePublicUrl_(fileId, isImage) {
  if (isImage) {
    // Use googleusercontent direct image URL for better frontend compatibility.
    return "https://lh3.googleusercontent.com/d/" + fileId + "=w2000";
  }
  // Prefer media export for direct playback in <audio>.
  return "https://drive.google.com/uc?export=media&id=" + fileId;
}

function getGithubConfig_() {
  const props = PropertiesService.getScriptProperties();
  return {
    owner: String(props.getProperty("GITHUB_OWNER") || "").trim(),
    repo: String(props.getProperty("GITHUB_REPO") || "").trim(),
    branch: String(props.getProperty("GITHUB_BRANCH") || "").trim() || DEFAULT_GITHUB_BRANCH,
    audioDir: String(props.getProperty("GITHUB_AUDIO_DIR") || "").trim() || DEFAULT_GITHUB_AUDIO_DIR,
    pagesBaseUrl: String(props.getProperty("GITHUB_PAGES_BASE_URL") || "").trim(),
    token: String(props.getProperty("GITHUB_TOKEN") || "").trim()
  };
}

function uploadAudioToGithub_(audioPayload, exhibitId) {
  const cfg = getGithubConfig_();
  if (!cfg.owner || !cfg.repo || !cfg.token) {
    throw new Error("音檔改為 GitHub 儲存，請先在系統設定填入 GITHUB_OWNER、GITHUB_REPO、GITHUB_TOKEN");
  }

  const safeName = String(audioPayload.name || "audio.mp3")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/\.[^.]+$/, ".mp3");
  const filePath = `${trimSlashes_(cfg.audioDir)}/${String(exhibitId || "exhibit")}/${Date.now()}-${safeName}`;
  const encodedPath = encodePathForGithub_(filePath);
  const apiUrl = `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/${encodedPath}`;

  const requestBody = {
    message: `chore: upload audio ${safeName}`,
    content: audioPayload.base64,
    branch: cfg.branch
  };

  const response = UrlFetchApp.fetch(apiUrl, {
    method: "put",
    contentType: "application/json",
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28"
    },
    payload: JSON.stringify(requestBody),
    muteHttpExceptions: true
  });

  const status = response.getResponseCode();
  if (status !== 200 && status !== 201) {
    throw new Error("GitHub 上傳失敗，請確認 Token 權限與 Repo 設定");
  }

  return buildGithubAudioUrl_(cfg, filePath);
}

function buildGithubAudioUrl_(cfg, filePath) {
  if (cfg.pagesBaseUrl) {
    return `${trimTrailingSlash_(cfg.pagesBaseUrl)}/${trimSlashes_(filePath)}`;
  }
  return `https://${cfg.owner}.github.io/${cfg.repo}/${trimSlashes_(filePath)}`;
}

function deleteGithubAudioIfPossible_(audioUrl) {
  const cfg = getGithubConfig_();
  if (!cfg.owner || !cfg.repo || !cfg.token) {
    return;
  }

  const filePath = extractGithubFilePath_(audioUrl, cfg);
  if (!filePath) {
    return;
  }

  const encodedPath = encodePathForGithub_(filePath);
  const apiUrl = `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/${encodedPath}?ref=${encodeURIComponent(cfg.branch)}`;
  const getRes = UrlFetchApp.fetch(apiUrl, {
    method: "get",
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28"
    },
    muteHttpExceptions: true
  });

  if (getRes.getResponseCode() !== 200) {
    return;
  }

  const getData = JSON.parse(getRes.getContentText() || "{}");
  const sha = String(getData.sha || "").trim();
  if (!sha) {
    return;
  }

  UrlFetchApp.fetch(`https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/${encodedPath}`, {
    method: "delete",
    contentType: "application/json",
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28"
    },
    payload: JSON.stringify({
      message: `chore: delete audio ${filePath}`,
      sha: sha,
      branch: cfg.branch
    }),
    muteHttpExceptions: true
  });
}

function extractGithubFilePath_(url, cfg) {
  const raw = String(url || "").trim();
  if (!raw) {
    return "";
  }

  const pagesBase = trimTrailingSlash_(cfg.pagesBaseUrl);
  if (pagesBase && raw.indexOf(pagesBase + "/") === 0) {
    return raw.slice((pagesBase + "/").length);
  }

  const defaultBase = `https://${cfg.owner}.github.io/${cfg.repo}/`;
  if (raw.indexOf(defaultBase) === 0) {
    return raw.slice(defaultBase.length);
  }

  return "";
}

function trimSlashes_(value) {
  return String(value || "").replace(/^\/+|\/+$/g, "");
}

function trimTrailingSlash_(value) {
  return String(value || "").replace(/\/+$/g, "");
}

function encodePathForGithub_(path) {
  return String(path || "")
    .split("/")
    .filter(function(part) {
      return part !== "";
    })
    .map(function(part) {
      return encodeURIComponent(part);
    })
    .join("/");
}

function normalizeImageUrl_(url) {
  const fileId = extractDriveFileId_(url);
  if (!fileId) {
    return url;
  }
  return "https://lh3.googleusercontent.com/d/" + fileId + "=w2000";
}

function normalizeAudioUrl_(url) {
  const fileId = extractDriveFileId_(url);
  if (!fileId) {
    return url;
  }
  return "https://drive.google.com/uc?export=media&id=" + fileId;
}

function findExhibitRow_(sheet, id) {
  const values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i += 1) {
    if (String(values[i][0] || "").trim() === String(id || "").trim()) {
      return {
        row: i + 1,
        imageUrl: String(values[i][2] || "").trim(),
        audioUrl: String(values[i][3] || "").trim()
      };
    }
  }
  return null;
}

function deleteDriveFileByUrl_(url) {
  const fileId = extractDriveFileId_(String(url || ""));
  if (!fileId) {
    return;
  }

  try {
    const file = DriveApp.getFileById(fileId);
    file.setTrashed(true);
  } catch (error) {
    throw new Error("雲端檔案刪除失敗，請確認 Drive 權限與檔案網址格式");
  }
}

function extractDriveFileId_(url) {
  if (!url) {
    return "";
  }

  const idFromUc = /[?&]id=([a-zA-Z0-9_-]+)/.exec(url);
  if (idFromUc && idFromUc[1]) {
    return idFromUc[1];
  }

  const idFromFilePath = /\/d\/([a-zA-Z0-9_-]+)/.exec(url);
  if (idFromFilePath && idFromFilePath[1]) {
    return idFromFilePath[1];
  }

  return "";
}

function getConfiguredAdminPassword_() {
  return PropertiesService.getScriptProperties().getProperty("ADMIN_PASSWORD") || "";
}
