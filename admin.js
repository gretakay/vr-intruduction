const setupCardEl = document.getElementById("setupCard");
const setupFormEl = document.getElementById("setupForm");
const setupSheetIdInputEl = document.getElementById("setupSheetIdInput");
const setupDriveFolderIdInputEl = document.getElementById("setupDriveFolderIdInput");
const setupPasswordInputEl = document.getElementById("setupPasswordInput");
const loginCardEl = document.getElementById("loginCard");
const adminPanelEl = document.getElementById("adminPanel");
const loginFormEl = document.getElementById("loginForm");
const passwordInputEl = document.getElementById("passwordInput");
const titleInputEl = document.getElementById("titleInput");
const logoInputEl = document.getElementById("logoInput");
const saveConfigBtnEl = document.getElementById("saveConfigBtn");
const systemSheetIdInputEl = document.getElementById("systemSheetIdInput");
const systemDriveFolderIdInputEl = document.getElementById("systemDriveFolderIdInput");
const systemPasswordInputEl = document.getElementById("systemPasswordInput");
const saveSystemBtnEl = document.getElementById("saveSystemBtn");
const addExhibitBtnEl = document.getElementById("addExhibitBtn");
const logoutBtnEl = document.getElementById("logoutBtn");
const exhibitListEl = document.getElementById("exhibitList");
const noticeEl = document.getElementById("notice");

const API_BASE_URL = window.APP_CONFIG?.API_BASE_URL || "";
const TOKEN_KEY = "vt_admin_token";
const MAX_IMAGE_EDGE_PX = 1600;
const IMAGE_UPLOAD_QUALITY = 0.82;
const AUDIO_WARN_SIZE_MB = 8;

const state = {
  config: {
    title: "",
    logoUrl: ""
  },
  exhibits: []
};

function formatRequestError(error) {
  const raw = String(error?.message || error || "");
  if (/Failed to fetch|NetworkError|Load failed/i.test(raw)) {
    return "無法連線 Apps Script API（可能是 CORS、部署權限或網址錯誤）。請檢查 config.js 的 API_BASE_URL 與 Web App 設定。";
  }
  return raw || "操作失敗";
}

function showNotice(message, type = "success") {
  noticeEl.textContent = message;
  noticeEl.classList.remove("hidden", "success", "error");
  noticeEl.classList.add(type);
  setTimeout(() => {
    noticeEl.classList.add("hidden");
  }, 2600);
}

function setLoginView(isLoggedIn) {
  setView(isLoggedIn ? "admin" : "login");
}

function setView(mode) {
  setupCardEl.classList.toggle("hidden", mode !== "setup");
  loginCardEl.classList.toggle("hidden", mode !== "login");
  adminPanelEl.classList.toggle("hidden", mode !== "admin");
}

function getToken() {
  return localStorage.getItem(TOKEN_KEY) || "";
}

function setToken(token) {
  if (!token) {
    localStorage.removeItem(TOKEN_KEY);
    return;
  }
  localStorage.setItem(TOKEN_KEY, token);
}

function bytesToMb(bytes) {
  return Number(bytes / (1024 * 1024)).toFixed(1);
}

function setButtonBusy(button, busy, idleText, busyText) {
  button.disabled = busy;
  button.textContent = busy ? busyText : idleText;
}

function isMp3File(file) {
  const name = String(file?.name || "").toLowerCase();
  const mime = String(file?.type || "").toLowerCase();
  return name.endsWith(".mp3") || mime === "audio/mpeg" || mime === "audio/mp3";
}

function fillSystemInputs(system) {
  const sheetId = system?.sheetId || "";
  const driveFolderId = system?.driveFolderId || "";

  setupSheetIdInputEl.value = sheetId;
  setupDriveFolderIdInputEl.value = driveFolderId;
  systemSheetIdInputEl.value = sheetId;
  systemDriveFolderIdInputEl.value = driveFolderId;
  systemPasswordInputEl.value = "";
}

async function postAction(payload) {
  if (!API_BASE_URL) {
    throw new Error("尚未設定 API_BASE_URL，請先編輯 config.js");
  }

  const response = await fetch(API_BASE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain;charset=utf-8"
    },
    body: JSON.stringify(payload)
  });

  const result = await response.json();
  if (!result.ok) {
    throw new Error(result.message || "操作失敗");
  }
  return result;
}

async function fetchStore() {
  const response = await fetch(`${API_BASE_URL}?action=publicData`);
  const result = await response.json();
  if (!result.ok) {
    throw new Error(result.message || "載入資料失敗");
  }

  state.config = result.data.config || state.config;
  state.exhibits = result.data.exhibits || [];

  titleInputEl.value = state.config.title || "";
  logoInputEl.value = state.config.logoUrl || "";
  renderExhibits();
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || "");
      const commaIndex = dataUrl.indexOf(",");
      resolve(commaIndex >= 0 ? dataUrl.slice(commaIndex + 1) : "");
    };
    reader.onerror = () => reject(new Error("檔案讀取失敗"));
    reader.readAsDataURL(file);
  });
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("檔案讀取失敗"));
    reader.readAsDataURL(file);
  });
}

function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("圖片解析失敗"));
    img.src = dataUrl;
  });
}

async function buildImagePayload(file) {
  const dataUrl = await fileToDataUrl(file);
  const image = await loadImage(dataUrl);

  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  const scale = Math.min(1, MAX_IMAGE_EDGE_PX / Math.max(width, height));

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));

  const context = canvas.getContext("2d");
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  const mime = "image/jpeg";
  const compressedDataUrl = canvas.toDataURL(mime, IMAGE_UPLOAD_QUALITY);
  const commaIndex = compressedDataUrl.indexOf(",");
  const base64 = commaIndex >= 0 ? compressedDataUrl.slice(commaIndex + 1) : "";

  return {
    name: file.name.replace(/\.[^.]+$/, ".jpg"),
    mime,
    base64,
    originalBytes: file.size,
    compressedBytes: Math.round((base64.length * 3) / 4)
  };
}

function exhibitRowTemplate(exhibit) {
  const wrap = document.createElement("article");
  wrap.className = "exhibit-row";
  wrap.dataset.id = exhibit.id;

  const imagePreviewHtml = exhibit.imageUrl
    ? `<a href="${exhibit.imageUrl}" target="_blank" rel="noreferrer">檢視目前圖片</a>`
    : `<span class="preview-disabled">目前沒有圖片</span>`;

  const audioPreviewHtml = exhibit.audioUrl
    ? `<a href="${exhibit.audioUrl}" target="_blank" rel="noreferrer">檢視目前語音</a>`
    : `<span class="preview-disabled">目前沒有語音</span>`;

  wrap.innerHTML = `
    <div class="exhibit-head">
      <strong>${exhibit.name || "未命名展區"}</strong>
      <small>ID: ${exhibit.id}</small>
    </div>

    <label>
      展區名稱
      <input class="name-input" type="text" value="${exhibit.name || ""}" />
    </label>

    <label>
      圖片檔案（image）
      <input class="image-file" type="file" accept="image/*" />
    </label>

    <label>
      語音檔案（audio）
      <input class="audio-file" type="file" accept=".mp3,audio/mpeg" />
    </label>

    <div class="preview-links">
      ${imagePreviewHtml}
      ${audioPreviewHtml}
    </div>

    <div class="row-actions">
      <button class="save-btn action-btn" type="button">儲存名稱</button>
      <button class="upload-btn action-btn" type="button">上傳圖片/語音</button>
      <button class="delete-image-btn ghost-btn" type="button">刪除圖片</button>
      <button class="delete-audio-btn ghost-btn" type="button">刪除音檔</button>
      <button class="delete-btn ghost-btn" type="button">刪除此展區</button>
    </div>
  `;

  const saveBtn = wrap.querySelector(".save-btn");
  const uploadBtn = wrap.querySelector(".upload-btn");
  const deleteImageBtn = wrap.querySelector(".delete-image-btn");
  const deleteAudioBtn = wrap.querySelector(".delete-audio-btn");
  const deleteBtn = wrap.querySelector(".delete-btn");

  saveBtn.addEventListener("click", async () => {
    try {
      const nameValue = wrap.querySelector(".name-input").value;
      await postAction({
        action: "updateExhibit",
        token: getToken(),
        id: exhibit.id,
        name: nameValue
      });
      await fetchStore();
      showNotice("名稱已更新");
    } catch (error) {
      showNotice(error.message || "儲存失敗", "error");
    }
  });

  uploadBtn.addEventListener("click", async () => {
    const uploadIdleText = "上傳圖片/語音";
    setButtonBusy(uploadBtn, true, uploadIdleText, "上傳中...");

    try {
      const imageFile = wrap.querySelector(".image-file").files?.[0];
      const audioFile = wrap.querySelector(".audio-file").files?.[0];

      if (!imageFile && !audioFile) {
        showNotice("請選擇至少一個檔案", "error");
        return;
      }

      const payload = {
        action: "uploadAssets",
        token: getToken(),
        id: exhibit.id
      };

      const startedAt = Date.now();

      if (imageFile) {
        const compressedImage = await buildImagePayload(imageFile);
        payload.image = {
          name: compressedImage.name,
          mime: compressedImage.mime,
          base64: compressedImage.base64
        };

        if (compressedImage.originalBytes > compressedImage.compressedBytes) {
          showNotice(
            `圖片已壓縮：${bytesToMb(compressedImage.originalBytes)}MB -> ${bytesToMb(compressedImage.compressedBytes)}MB`
          );
        }
      }

      if (audioFile) {
        if (!isMp3File(audioFile)) {
          showNotice("目前僅支援 MP3 音檔", "error");
          return;
        }

        if (audioFile.size > AUDIO_WARN_SIZE_MB * 1024 * 1024) {
          showNotice(`音檔 ${bytesToMb(audioFile.size)}MB 較大，上傳可能需較久`, "error");
        }

        payload.audio = {
          name: audioFile.name,
          mime: "audio/mpeg",
          base64: await fileToBase64(audioFile)
        };
      }

      await postAction(payload);
      await fetchStore();
      const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
      showNotice(`檔案已上傳並寫入 Google Sheet（${seconds} 秒）`);
    } catch (error) {
      showNotice(error.message || "上傳失敗", "error");
    } finally {
      setButtonBusy(uploadBtn, false, uploadIdleText, "上傳中...");
    }
  });

  deleteBtn.addEventListener("click", async () => {
    try {
      await postAction({
        action: "deleteExhibit",
        token: getToken(),
        id: exhibit.id
      });
      await fetchStore();
      showNotice("展區已刪除");
    } catch (error) {
      showNotice(error.message || "刪除失敗", "error");
    }
  });

  deleteImageBtn.addEventListener("click", async () => {
    try {
      await postAction({
        action: "removeAsset",
        token: getToken(),
        id: exhibit.id,
        assetType: "image"
      });
      await fetchStore();
      showNotice("圖片已刪除，雲端檔案已同步刪除");
    } catch (error) {
      showNotice(error.message || "刪除圖片失敗", "error");
    }
  });

  deleteAudioBtn.addEventListener("click", async () => {
    try {
      await postAction({
        action: "removeAsset",
        token: getToken(),
        id: exhibit.id,
        assetType: "audio"
      });
      await fetchStore();
      showNotice("音檔已刪除，雲端檔案已同步刪除");
    } catch (error) {
      showNotice(error.message || "刪除音檔失敗", "error");
    }
  });

  return wrap;
}

function renderExhibits() {
  exhibitListEl.innerHTML = "";
  state.exhibits.forEach((exhibit) => {
    exhibitListEl.appendChild(exhibitRowTemplate(exhibit));
  });
}

loginFormEl.addEventListener("submit", async (event) => {
  event.preventDefault();

  try {
    const password = passwordInputEl.value;
    const result = await postAction({ action: "login", password });
    setToken(result.token);
    setLoginView(true);
    const systemResult = await postAction({ action: "getSystemSettings", token: getToken() });
    fillSystemInputs(systemResult);
    await fetchStore();
    showNotice("登入成功");
    loginFormEl.reset();
  } catch (error) {
    showNotice(error.message || "登入失敗", "error");
  }
});

saveConfigBtnEl.addEventListener("click", async () => {
  try {
    await postAction({
      action: "saveConfig",
      token: getToken(),
      title: titleInputEl.value,
      logoUrl: logoInputEl.value
    });
    showNotice("標題與 Logo 已儲存");
  } catch (error) {
    showNotice(error.message || "儲存設定失敗", "error");
  }
});

saveSystemBtnEl.addEventListener("click", async () => {
  try {
    await postAction({
      action: "saveSystemSettings",
      token: getToken(),
      sheetId: systemSheetIdInputEl.value,
      driveFolderId: systemDriveFolderIdInputEl.value,
      adminPassword: systemPasswordInputEl.value
    });
    systemPasswordInputEl.value = "";
    showNotice("系統設定已更新");
  } catch (error) {
    showNotice(error.message || "系統設定儲存失敗", "error");
  }
});

addExhibitBtnEl.addEventListener("click", async () => {
  try {
    await postAction({
      action: "addExhibit",
      token: getToken()
    });
    await fetchStore();
    showNotice("已新增展區");
  } catch (error) {
    showNotice(error.message || "新增展區失敗", "error");
  }
});

logoutBtnEl.addEventListener("click", () => {
  setToken("");
  setLoginView(false);
  showNotice("已登出");
});

setupFormEl.addEventListener("submit", async (event) => {
  event.preventDefault();

  try {
    await postAction({
      action: "saveSystemSettings",
      sheetId: setupSheetIdInputEl.value,
      driveFolderId: setupDriveFolderIdInputEl.value,
      adminPassword: setupPasswordInputEl.value
    });

    setupPasswordInputEl.value = "";
    fillSystemInputs({
      sheetId: setupSheetIdInputEl.value,
      driveFolderId: setupDriveFolderIdInputEl.value
    });
    setView("login");
    showNotice("首次設定完成，請使用密碼登入");
  } catch (error) {
    showNotice(error.message || "首次設定失敗", "error");
  }
});

async function initialize() {
  if (!API_BASE_URL) {
    showNotice("請先在 config.js 設定 API_BASE_URL", "error");
    return;
  }

  // 安全模式：每次進入後台都要求重新登入，避免舊 token 造成誤判
  setToken("");

  const setupState = await postAction({ action: "getSystemSettings" });
  if (setupState.needsSetup) {
    fillSystemInputs(setupState);
    setView("setup");
    showNotice("請先完成首次系統設定", "error");
    return;
  }

  const token = getToken();
  if (!token) {
    setView("login");
    return;
  }

  try {
    await postAction({
      action: "checkToken",
      token
    });
    const systemResult = await postAction({ action: "getSystemSettings", token });
    fillSystemInputs(systemResult);
    setView("admin");
    await fetchStore();
  } catch (error) {
    setToken("");
    setView("login");
  }
}

initialize().catch((error) => {
  showNotice(formatRequestError(error), "error");
});
