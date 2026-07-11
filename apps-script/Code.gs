const CONFIG_SHEET = "Config";
const EXHIBITS_SHEET = "Exhibits";
const TOKEN_TTL_SECONDS = 60 * 60 * 8;

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
    driveFolderId: driveFolderId
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
  const audioUrl = payload.audioUrl != null ? String(payload.audioUrl).trim() : null;
  let changed = false;

  if (name !== null) {
    refs.exhibitsSheet.getRange(target.row, 2).setValue(name);
    changed = true;
  }

  if (audioUrl !== null) {
    refs.exhibitsSheet.getRange(target.row, 4).setValue(audioUrl);
    changed = true;
  }

  if (changed) {
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
  let nextImageUrl = target.imageUrl;

  if (payload.image && payload.image.base64) {
    deleteDriveFileByUrl_(target.imageUrl);
    const imageUrl = createDriveFile_(folder, payload.image);
    refs.exhibitsSheet.getRange(target.row, 3).setValue(imageUrl);
    nextImageUrl = imageUrl;
  }

  refs.exhibitsSheet.getRange(target.row, 5).setValue(new Date().toISOString());
  return jsonOutput_({
    ok: true,
    imageUrl: nextImageUrl
  });
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
