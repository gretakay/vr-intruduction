const state = {
  config: {
    title: "歡迎來到某某某展場",
    logoUrl: ""
  },
  exhibits: [],
  currentId: null
};

const API_BASE_URL = window.APP_CONFIG?.API_BASE_URL || "";

const siteTitleEl = document.getElementById("siteTitle");
const siteLogoEl = document.getElementById("siteLogo");
const stageImageEl = document.getElementById("stageImage");
const stagePlaceholderEl = document.getElementById("stagePlaceholder");
const stageTitleEl = document.getElementById("stageTitle");
const playBtnEl = document.getElementById("playBtn");
const audioPlayerEl = document.getElementById("audioPlayer");
const galleryGridEl = document.getElementById("galleryGrid");

function formatLoadError(error) {
  const raw = String(error?.message || error || "");
  if (/Failed to fetch|NetworkError|Load failed/i.test(raw)) {
    return "無法連線 Apps Script API（可能是 CORS、部署權限或網址錯誤）。請檢查 config.js 的 API_BASE_URL 與 Web App 存取權限。";
  }
  return raw || "載入失敗";
}

function renderSiteHeader() {
  siteTitleEl.textContent = state.config.title || "歡迎來到某某某展場";
  document.title = state.config.title || "虛擬導覽";

  if (state.config.logoUrl) {
    siteLogoEl.src = state.config.logoUrl;
    siteLogoEl.classList.remove("hidden");
  } else {
    siteLogoEl.classList.add("hidden");
  }
}

function getCurrentExhibit() {
  return state.exhibits.find((item) => item.id === state.currentId) || null;
}

function renderStage() {
  const current = getCurrentExhibit();
  if (!current) {
    stagePlaceholderEl.classList.remove("hidden");
    stageImageEl.classList.add("hidden");
    stageTitleEl.textContent = "尚未選擇展區";
    playBtnEl.disabled = true;
    audioPlayerEl.removeAttribute("src");
    audioPlayerEl.load();
    return;
  }

  stageTitleEl.textContent = current.name || "未命名展區";

  if (current.imageUrl) {
    stageImageEl.src = current.imageUrl;
    stageImageEl.classList.remove("hidden");
    stagePlaceholderEl.classList.add("hidden");
  } else {
    stageImageEl.classList.add("hidden");
    stagePlaceholderEl.classList.remove("hidden");
  }

  if (current.audioUrl) {
    playBtnEl.disabled = false;
    audioPlayerEl.src = current.audioUrl;
  } else {
    playBtnEl.disabled = true;
    audioPlayerEl.removeAttribute("src");
    audioPlayerEl.load();
  }
}

function renderGallery() {
  galleryGridEl.innerHTML = "";

  if (!state.exhibits.length) {
    galleryGridEl.innerHTML = '<p class="empty-tip">目前沒有展區，請到後台新增。</p>';
    return;
  }

  state.exhibits.forEach((item) => {
    const card = document.createElement("button");
    card.className = `gallery-card ${item.id === state.currentId ? "active" : ""}`;
    card.type = "button";

    const image = item.imageUrl
      ? `<img src="${item.imageUrl}" alt="${item.name}" class="thumb-image" />`
      : `<div class="thumb-placeholder">待上傳圖片</div>`;

    card.innerHTML = `
      <div class="thumb-wrap">${image}</div>
      <div class="thumb-name">${item.name || "未命名展區"}</div>
    `;

    card.addEventListener("click", () => {
      state.currentId = item.id;
      renderGallery();
      renderStage();
      if (item.audioUrl) {
        audioPlayerEl.play().catch(() => {});
      }
    });

    galleryGridEl.appendChild(card);
  });
}

async function loadPublicData() {
  if (!API_BASE_URL) {
    throw new Error("尚未設定 API_BASE_URL，請先編輯 config.js");
  }

  const response = await fetch(`${API_BASE_URL}?action=publicData`);
  const result = await response.json();

  if (!result.ok) {
    throw new Error(result.message || "載入失敗");
  }

  state.config = result.data.config || state.config;
  state.exhibits = result.data.exhibits || [];
  state.currentId = state.exhibits[0]?.id || null;

  renderSiteHeader();
  renderGallery();
  renderStage();
}

playBtnEl.addEventListener("click", () => {
  audioPlayerEl.play().catch(() => {
    stageTitleEl.textContent = `${stageTitleEl.textContent}（語音播放失敗）`;
  });
});

audioPlayerEl.addEventListener("error", () => {
  playBtnEl.disabled = true;
  stageTitleEl.textContent = `${stageTitleEl.textContent}（語音連結無法播放）`;
});

loadPublicData().catch((error) => {
  galleryGridEl.innerHTML = `<p class="empty-tip">載入失敗：${formatLoadError(error)}</p>`;
});
