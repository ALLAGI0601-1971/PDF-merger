// features/pdf-redact/feature.js
// PDF Redact Feature - FIXED ZOOM & COORDINATE SYSTEM

import eventBus from "../../core/event-bus.js";
import * as utils from "../../core/utils.js";

// ==================== CONSTANTS ====================
const RENDER_SCALE = 3.0; // High quality render scale
const SELECTION_COLOR = "rgba(255, 0, 0, 0.4)";
const SELECTION_BORDER = "rgba(255, 0, 0, 0.8)";
const REDACTION_COLOR = "#000000";
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3.0;
const ZOOM_STEP = 0.25;

// ==================== STATE ====================
let state = {
  pdfFile: null,
  pdfDoc: null,
  currentPage: 1,
  totalPages: 0,
  baseScale: 1.0, // Base scale to fit container
  zoomLevel: 1.0, // User zoom multiplier
  minScale: MIN_ZOOM,
  maxScale: MAX_ZOOM,
  selections: [],
  currentLang: "ja",
  processing: false,
  thumbnails: {},
  panToolActive: false,
  // Drawing state
  isDrawing: false,
  drawStart: null,
  currentRect: null,
  // Page dimensions (original PDF coordinates)
  pageDimensions: {},
  // Pan state
  panX: 0,
  panY: 0,
  isPanning: false,
  lastMouseX: 0,
  lastMouseY: 0,
};

// ==================== LANGUAGE TRANSLATIONS ====================
const LANG = {
  ja: {
    back: "戻る",
    uploadTitle: "PDF墨塗り",
    uploadPrompt: "PDFファイルをドラッグ&ドロップ",
    uploadSubtext: "または",
    selectBtn: "ファイルを選択",
    uploadHint: "1つのPDFファイルを選択",
    toolsTitle: "選択方法",
    infoText: "ドラッグして墨塗りエリアを描画",
    redactionListTitle: "選択リスト",
    redactionCountText: (count) => `${count} 個選択中`,
    emptyText: "選択なし",
    clearAllText: "すべて解除",
    saveRedactedText: "選択部分を墨塗り",
    loadingFiles: "ファイルを読み込み中...",
    processingPdf: "PDF処理中...",
    savingFiles: "ファイルを保存中...",
    successTitle: "保存完了!",
    successMessage: "選択されたテキストが墨塗りされました",
    redactMoreText: "もっと墨塗り",
    goHomeText: "ホームに戻る",
    errorInvalidPdf: "無効なPDFファイルです",
    errorLoading: "PDFの読み込みに失敗しました",
    errorSaving: "保存に失敗しました",
    pageInfo: (current, total) => `ページ ${current} / ${total}`,
    thumbnailsTitle: "ページ一覧",
  },
  en: {
    back: "Back",
    uploadTitle: "PDF Redact",
    uploadPrompt: "Drag & drop PDF file",
    uploadSubtext: "or",
    selectBtn: "Select File",
    uploadHint: "Select one PDF file",
    toolsTitle: "Selection Method",
    infoText: "Drag to draw redaction areas",
    redactionListTitle: "Selection List",
    redactionCountText: (count) => `${count} selected`,
    emptyText: "No selections",
    clearAllText: "Clear All",
    saveRedactedText: "Redact Selected",
    loadingFiles: "Loading file...",
    processingPdf: "Processing PDF...",
    savingFiles: "Saving file...",
    successTitle: "Save Complete!",
    successMessage: "Selected text has been redacted",
    redactMoreText: "Redact More",
    goHomeText: "Go Home",
    errorInvalidPdf: "Invalid PDF file",
    errorLoading: "Failed to load PDF",
    errorSaving: "Failed to save",
    pageInfo: (current, total) => `Page ${current} / ${total}`,
    thumbnailsTitle: "Pages",
  },
};

// ==================== INITIALIZATION ====================
export async function init(container, params = {}) {
  console.log("🖤 PDF Redact initializing (FIXED ZOOM)...");

  try {
    state.currentLang = params.lang || "ja";
    resetState();
    applyLanguage();
    setupEventListeners();

    eventBus.on(
      "language-changed",
      (lang) => {
        state.currentLang = lang;
        applyLanguage();
      },
      "pdf-redact"
    );

    showUploadStage();
    console.log("✅ PDF Redact initialized");
    return state;
  } catch (error) {
    console.error("❌ Init error:", error);
    throw error;
  }
}

function resetState() {
  state.pdfFile = null;
  state.pdfDoc = null;
  state.currentPage = 1;
  state.totalPages = 0;
  state.baseScale = 1.0;
  state.zoomLevel = 1.0;
  state.selections = [];
  state.processing = false;
  state.thumbnails = {};
  state.isDrawing = false;
  state.drawStart = null;
  state.currentRect = null;
  state.pageDimensions = {};
  state.panX = 0;
  state.panY = 0;
  state.isPanning = false;
}

// ==================== CLEANUP ====================
export async function cleanup() {
  console.log("🧹 Cleaning up...");
  try {
    resetState();
    eventBus.clear("language-changed");
    console.log("✅ Cleanup complete");
  } catch (error) {
    console.error("❌ Cleanup error:", error);
  }
}

// ==================== UI FUNCTIONS ====================
function applyLanguage() {
  const L = LANG[state.currentLang];
  const elements = {
    backText: L.back,
    uploadTitle: L.uploadTitle,
    uploadPrompt: L.uploadPrompt,
    uploadSubtext: L.uploadSubtext,
    selectBtnText: L.selectBtn,
    uploadHint: L.uploadHint,
    toolsTitle: L.toolsTitle,
    infoText: L.infoText,
    redactionListTitle: L.redactionListTitle,
    emptyText: L.emptyText,
    clearAllText: L.clearAllText,
    saveRedactedText: L.saveRedactedText,
    successTitle: L.successTitle,
    successMessage: L.successMessage,
    redactMoreText: L.redactMoreText,
    goHomeText: L.goHomeText,
    thumbnailsTitle: L.thumbnailsTitle,
  };

  Object.entries(elements).forEach(([id, text]) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  });

  updateSelectionCount();
  updatePageIndicator();
}

function showUploadStage() {
  const uploadStage = document.getElementById("uploadStage");
  const redactStage = document.getElementById("redactStage");
  if (uploadStage) uploadStage.classList.add("active");
  if (redactStage) redactStage.classList.remove("active");
}

function showRedactStage() {
  const uploadStage = document.getElementById("uploadStage");
  const redactStage = document.getElementById("redactStage");
  if (uploadStage) uploadStage.classList.remove("active");
  if (redactStage) redactStage.classList.add("active");
  updatePageIndicator();
}

function updatePageIndicator() {
  const L = LANG[state.currentLang];
  const pageInfo = document.getElementById("pageInfo");
  if (pageInfo) {
    pageInfo.textContent = L.pageInfo(state.currentPage, state.totalPages);
  }
}
function updatePanToolUI() {
  const panToolBtn = document.getElementById("panToolBtn");
  if (panToolBtn) {
    if (state.panToolActive) {
      panToolBtn.classList.add("active");
    } else {
      panToolBtn.classList.remove("active");
    }
  }
}

function updateCanvasCursor() {
  const canvas = document.getElementById("pdfCanvas");
  const drawLayer = document.getElementById("drawingLayer");

  if (state.panToolActive && state.zoomLevel > 1) {
    if (canvas) canvas.style.cursor = "grab";
    if (drawLayer) drawLayer.style.pointerEvents = "none";
  } else {
    if (canvas) canvas.style.cursor = "default";
    if (drawLayer) drawLayer.style.pointerEvents = "auto";
  }
}
function updateZoomLevel() {
  const zoomLevel = document.getElementById("zoomLevel");
  if (zoomLevel) {
    zoomLevel.textContent = `${Math.round(state.zoomLevel * 100)}%`;
  }
}

function updateSelectionCount() {
  const L = LANG[state.currentLang];
  const countText = document.getElementById("redactionCountText");
  const emptyMessage = document.getElementById("redactionEmpty");
  const count = state.selections.length;

  if (countText) countText.textContent = L.redactionCountText(count);
  if (emptyMessage) emptyMessage.style.display = count === 0 ? "flex" : "none";

  const saveBtn = document.getElementById("saveRedactedBtn");
  if (saveBtn) saveBtn.disabled = count === 0;
}

function updateThumbnailHighlight() {
  const thumbnails = document.querySelectorAll(".thumbnail-item");
  thumbnails.forEach((thumb) => {
    const pageNum = parseInt(thumb.dataset.page);
    if (pageNum === state.currentPage) {
      thumb.classList.add("active");
    } else {
      thumb.classList.remove("active");
    }
  });
}

// ==================== SELECTION LIST ====================
function renderSelectionList() {
  const listContainer = document.getElementById("redactionList");
  if (!listContainer) return;

  listContainer
    .querySelectorAll(".redaction-item")
    .forEach((item) => item.remove());

  const sorted = [...state.selections].sort((a, b) => a.page - b.page);

  sorted.forEach((sel, index) => {
    const item = document.createElement("div");
    item.className = "redaction-item";
    item.dataset.id = sel.id;

    item.innerHTML = `
      <div class="redaction-info">
        <div class="redaction-page">${
          state.currentLang === "ja" ? "ページ" : "Page"
        } ${sel.page}</div>
        <div class="redaction-coords">${
          state.currentLang === "ja" ? "エリア" : "Area"
        } ${index + 1}: ${Math.round(sel.width)}×${Math.round(sel.height)}</div>
      </div>
      <button class="redaction-delete" data-id="${sel.id}">×</button>
    `;

    const deleteBtn = item.querySelector(".redaction-delete");
    deleteBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      deleteSelection(sel.id);
    });

    item.addEventListener("click", (e) => {
      if (e.target === deleteBtn) return;
      if (sel.page !== state.currentPage) goToPage(sel.page);
    });

    listContainer.appendChild(item);
  });

  updateSelectionCount();
}

// ==================== EVENT LISTENERS ====================
function setupEventListeners() {
  const backToHome = document.getElementById("backToHome");
  if (backToHome) {
    backToHome.addEventListener("click", () => {
      if (window.featureManager) window.featureManager.deactivateAll();
    });
  }

  const backToUpload = document.getElementById("backToUpload");
  if (backToUpload) {
    backToUpload.addEventListener("click", () => {
      showUploadStage();
      resetState();
    });
  }

  const fileInput = document.getElementById("pdfFileInput");
  const selectFileBtn = document.getElementById("selectFileBtn");
  const uploadArea = document.getElementById("uploadArea");

  if (selectFileBtn && fileInput) {
    selectFileBtn.addEventListener("click", () => fileInput.click());
  }

  if (fileInput) {
    fileInput.addEventListener("change", (e) => {
      if (e.target.files?.[0]) handleFile(e.target.files[0]);
    });
  }

  if (uploadArea) {
    ["dragenter", "dragover"].forEach((evt) => {
      uploadArea.addEventListener(evt, (e) => {
        e.preventDefault();
        uploadArea.classList.add("drag-over");
      });
    });

    ["dragleave", "drop"].forEach((evt) => {
      uploadArea.addEventListener(evt, (e) => {
        e.preventDefault();
        uploadArea.classList.remove("drag-over");
      });
    });

    uploadArea.addEventListener("drop", (e) => {
      const files = e.dataTransfer?.files;
      if (files?.[0]) handleFile(files[0]);
    });

    uploadArea.addEventListener("click", (e) => {
      if (e.target === uploadArea || e.target.closest(".upload-icon")) {
        fileInput.click();
      }
    });
  }

  const clearAllBtn = document.getElementById("clearAllBtn");
  if (clearAllBtn) clearAllBtn.addEventListener("click", clearAllSelections);

  const saveRedactedBtn = document.getElementById("saveRedactedBtn");
  if (saveRedactedBtn)
    saveRedactedBtn.addEventListener("click", saveRedactedPdf);

  // Zoom controls
  const zoomInBtn = document.getElementById("zoomInBtn");
  const zoomOutBtn = document.getElementById("zoomOutBtn");
  const resetZoomBtn = document.getElementById("resetZoomBtn");

  if (zoomInBtn) {
    zoomInBtn.addEventListener("click", () => {
      if (state.zoomLevel < state.maxScale) {
        state.zoomLevel = Math.min(state.zoomLevel + ZOOM_STEP, state.maxScale);
        renderPage();
      }
    });
  }

  if (zoomOutBtn) {
    zoomOutBtn.addEventListener("click", () => {
      if (state.zoomLevel > state.minScale) {
        state.zoomLevel = Math.max(state.zoomLevel - ZOOM_STEP, state.minScale);
        renderPage();
      }
    });
  }

  if (resetZoomBtn) {
    resetZoomBtn.addEventListener("click", () => {
      state.zoomLevel = 1.0;
      state.panX = 0;
      state.panY = 0;
      renderPage();
    });
  }

  // Add after zoom button listeners:
  const panToolBtn = document.getElementById("panToolBtn");
  if (panToolBtn) {
    panToolBtn.addEventListener("click", () => {
      state.panToolActive = !state.panToolActive;
      updatePanToolUI();
      updateCanvasCursor();
    });
  }

  const redactMoreBtn = document.getElementById("redactMoreBtn");
  if (redactMoreBtn) {
    redactMoreBtn.addEventListener("click", () => {
      hideSuccessModal();
      showUploadStage();
      resetState();
    });
  }

  const goHomeBtn = document.getElementById("goHomeBtn");
  if (goHomeBtn) {
    goHomeBtn.addEventListener("click", () => {
      if (window.featureManager) window.featureManager.deactivateAll();
    });
  }

  // Pan on main canvas
  setupPanListeners();
}

function setupPanListeners() {
  const canvas = document.getElementById("pdfCanvas");
  if (!canvas) return;

  canvas.addEventListener("mousedown", (e) => {
    // Only pan if pan tool is active AND zoomed in
    if (!state.panToolActive || state.zoomLevel <= 1 || state.isDrawing) return;
    state.isPanning = true;
    state.lastMouseX = e.clientX;
    state.lastMouseY = e.clientY;
    canvas.style.cursor = "grabbing";
    e.preventDefault();
  });

  document.addEventListener("mousemove", (e) => {
    if (!state.isPanning) return;
    const deltaX = e.clientX - state.lastMouseX;
    const deltaY = e.clientY - state.lastMouseY;
    state.panX += deltaX;
    state.panY += deltaY;
    state.lastMouseX = e.clientX;
    state.lastMouseY = e.clientY;
    applyPanTransform();
  });

  document.addEventListener("mouseup", () => {
    if (state.isPanning) {
      state.isPanning = false;
      updateCanvasCursor();
    }
  });
}
function applyPanTransform() {
  const canvas = document.getElementById("pdfCanvas");
  const overlay = document.getElementById("redactionOverlay");
  const drawLayer = document.getElementById("drawingLayer");

  const transform = `translate(${state.panX}px, ${state.panY}px)`;

  if (canvas) {
    canvas.style.transform = transform;
  }
  if (overlay) {
    overlay.style.transform = transform;
  }
  if (drawLayer) {
    drawLayer.style.transform = transform;
  }
}

// ==================== FILE HANDLING ====================
async function handleFile(file) {
  const L = LANG[state.currentLang];
  const validation = utils.validatePdfFile(file);
  if (!validation.valid) {
    utils.showToast(validation.error, "error");
    return;
  }

  state.processing = true;
  const loader = utils.createLoadingOverlay(L.loadingFiles);
  loader.show();

  try {
    const arrayBuffer = await utils.readFileAsArrayBuffer(file);
    state.pdfFile = file;

    const pdfjsLib = window.pdfjsLib;
    if (!pdfjsLib) throw new Error("PDF.js not loaded");

    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    state.pdfDoc = await loadingTask.promise;
    state.totalPages = state.pdfDoc.numPages;
    state.currentPage = 1;

    // Cache page dimensions (original PDF coordinates)
    for (let i = 1; i <= state.totalPages; i++) {
      const page = await state.pdfDoc.getPage(i);
      const viewport = page.getViewport({ scale: 1.0 });
      state.pageDimensions[i] = {
        width: viewport.width,
        height: viewport.height,
      };
    }

    console.log(`✅ PDF loaded: ${file.name} (${state.totalPages} pages)`);

    loader.hide();
    showRedactStage();

    await renderAllThumbnails();
    await renderPage();
  } catch (error) {
    console.error("❌ Failed to load PDF:", error);
    loader.hide();
    utils.showToast(L.errorLoading, "error");
  } finally {
    state.processing = false;
  }
}

// ==================== THUMBNAIL RENDERING ====================
async function renderAllThumbnails() {
  const container = document.getElementById("thumbnailContainer");
  if (!container) return;

  container.innerHTML = "";

  for (let pageNum = 1; pageNum <= state.totalPages; pageNum++) {
    const div = document.createElement("div");
    div.className = "thumbnail-item";
    div.dataset.page = pageNum;
    if (pageNum === state.currentPage) div.classList.add("active");

    div.innerHTML = `
      <canvas class="thumbnail-canvas" id="thumbnail-${pageNum}"></canvas>
      <div class="thumbnail-label">
        ${state.currentLang === "ja" ? "ページ" : "Page"} ${pageNum}
      </div>
    `;

    div.addEventListener("click", () => goToPage(pageNum));
    container.appendChild(div);
    await renderThumbnail(pageNum);
  }
}

async function renderThumbnail(pageNum) {
  try {
    const page = await state.pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale: 0.3 });
    const canvas = document.getElementById(`thumbnail-${pageNum}`);
    if (!canvas) return;

    const context = canvas.getContext("2d");
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    await page.render({ canvasContext: context, viewport }).promise;
    state.thumbnails[pageNum] = true;
  } catch (error) {
    console.error(`❌ Thumbnail ${pageNum} failed:`, error);
  }
}

// ==================== PDF RENDERING ====================
async function renderPage() {
  if (
    !state.pdfDoc ||
    state.currentPage < 1 ||
    state.currentPage > state.totalPages
  ) {
    console.error("❌ Invalid page");
    return;
  }

  try {
    const page = await state.pdfDoc.getPage(state.currentPage);

    // Get original dimensions
    const originalViewport = page.getViewport({ scale: 1.0 });
    const originalWidth = originalViewport.width;
    const originalHeight = originalViewport.height;

    // Calculate base scale to fit container
    const wrapper = document.getElementById("pdfCanvasWrapper");
    if (wrapper) {
      const containerWidth = wrapper.clientWidth - 80; // padding
      const containerHeight = wrapper.clientHeight - 80;
      state.baseScale = Math.min(
        containerWidth / originalWidth,
        containerHeight / originalHeight,
        1.0 // Don't scale up beyond 100%
      );
    }

    // Apply both base scale and zoom
    const finalScale = state.baseScale * state.zoomLevel * RENDER_SCALE;
    const viewport = page.getViewport({ scale: finalScale });

    const canvas = document.getElementById("pdfCanvas");
    const context = canvas.getContext("2d", { alpha: false });

    // Set canvas size at render scale
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    // Set display size (accounting for RENDER_SCALE)
    const displayWidth = viewport.width / RENDER_SCALE;
    const displayHeight = viewport.height / RENDER_SCALE;
    canvas.style.width = displayWidth + "px";
    canvas.style.height = displayHeight + "px";

    await page.render({ canvasContext: context, viewport }).promise;

    // Update cursor for pan
    if (state.zoomLevel > 1) {
      canvas.style.cursor = "grab";
    } else {
      canvas.style.cursor = "default";
    }

    setupDrawingLayer();
    drawSelections();
    updateThumbnailHighlight();
    updatePageIndicator();
    updateZoomLevel();
    applyPanTransform();
    // At the end of renderPage(), replace the cursor logic with:
    updateCanvasCursor();
    console.log(
      `✅ Rendered page ${state.currentPage} at scale ${finalScale.toFixed(
        2
      )} (base: ${state.baseScale.toFixed(2)}, zoom: ${state.zoomLevel})`
    );
  } catch (error) {
    console.error("❌ Render failed:", error);
  }
}

// ==================== COORDINATE CONVERSION ====================
function displayToOriginal(displayX, displayY) {
  const pageDim = state.pageDimensions[state.currentPage];
  const canvas = document.getElementById("pdfCanvas");
  if (!pageDim || !canvas) return { x: displayX, y: displayY };

  const displayWidth = parseFloat(canvas.style.width);
  const displayHeight = parseFloat(canvas.style.height);

  return {
    x: (displayX / displayWidth) * pageDim.width,
    y: (displayY / displayHeight) * pageDim.height,
  };
}

function originalToDisplay(originalX, originalY) {
  const pageDim = state.pageDimensions[state.currentPage];
  const canvas = document.getElementById("pdfCanvas");
  if (!pageDim || !canvas) return { x: originalX, y: originalY };

  const displayWidth = parseFloat(canvas.style.width);
  const displayHeight = parseFloat(canvas.style.height);

  return {
    x: (originalX / pageDim.width) * displayWidth,
    y: (originalY / pageDim.height) * displayHeight,
  };
}

// ==================== DRAWING HANDLERS ====================
function handleDrawStart(e) {
  if (e.button !== 0 || state.isPanning) return; // Only left click

  const drawLayer = document.getElementById("drawingLayer");
  if (!drawLayer) return;

  const rect = drawLayer.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  state.isDrawing = true;
  state.drawStart = { x, y };

  console.log(`🖊️ Draw start: [${x.toFixed(1)}, ${y.toFixed(1)}]`);
}

function handleDrawMove(e) {
  if (!state.isDrawing || !state.drawStart) return;

  const drawLayer = document.getElementById("drawingLayer");
  if (!drawLayer) return;

  const rect = drawLayer.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  const left = Math.min(state.drawStart.x, x);
  const top = Math.min(state.drawStart.y, y);
  const width = Math.abs(x - state.drawStart.x);
  const height = Math.abs(y - state.drawStart.y);

  state.currentRect = { left, top, width, height };

  drawCurrentSelection();
}

function handleDrawEnd(e) {
  if (!state.isDrawing || !state.drawStart) return;

  const drawLayer = document.getElementById("drawingLayer");
  if (!drawLayer) return;

  const rect = drawLayer.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  const left = Math.min(state.drawStart.x, x);
  const top = Math.min(state.drawStart.y, y);
  const width = Math.abs(x - state.drawStart.x);
  const height = Math.abs(y - state.drawStart.y);

  // Only add if rectangle has minimum size
  if (width > 10 && height > 10) {
    addSelection(left, top, width, height);
    console.log(`✅ Selection added: ${width.toFixed(1)}×${height.toFixed(1)}`);
  }

  state.isDrawing = false;
  state.drawStart = null;
  state.currentRect = null;

  // Clear preview
  const preview = drawLayer.querySelector(".draw-preview");
  if (preview) preview.remove();
}

function handleDrawCancel(e) {
  if (!state.isDrawing) return;

  state.isDrawing = false;
  state.drawStart = null;
  state.currentRect = null;

  const drawLayer = document.getElementById("drawingLayer");
  if (drawLayer) {
    const preview = drawLayer.querySelector(".draw-preview");
    if (preview) preview.remove();
  }

  console.log("⚠️ Draw cancelled");
}

function drawCurrentSelection() {
  if (!state.currentRect) return;

  const drawLayer = document.getElementById("drawingLayer");
  if (!drawLayer) return;

  let preview = drawLayer.querySelector(".draw-preview");
  if (!preview) {
    preview = document.createElement("div");
    preview.className = "draw-preview";
    drawLayer.appendChild(preview);
  }

  preview.style.position = "absolute";
  preview.style.left = state.currentRect.left + "px";
  preview.style.top = state.currentRect.top + "px";
  preview.style.width = state.currentRect.width + "px";
  preview.style.height = state.currentRect.height + "px";
  preview.style.backgroundColor = SELECTION_COLOR;
  preview.style.border = `2px solid ${SELECTION_BORDER}`;
  preview.style.pointerEvents = "none";
  preview.style.boxSizing = "border-box";
}

function setupDrawingLayer() {
  const wrapper = document.getElementById("pdfCanvasWrapper");
  const canvas = document.getElementById("pdfCanvas");
  if (!wrapper || !canvas) return;

  // Remove old layer
  let drawLayer = wrapper.querySelector("#drawingLayer");
  if (drawLayer) drawLayer.remove();

  // Create new drawing layer
  drawLayer = document.createElement("div");
  drawLayer.id = "drawingLayer";
  drawLayer.className = "drawing-layer";

  // Get actual dimensions
  const displayWidth = parseFloat(canvas.style.width);
  const displayHeight = parseFloat(canvas.style.height);

  // Calculate centered position
  const wrapperWidth = wrapper.clientWidth;
  const wrapperHeight = wrapper.clientHeight;
  const left = (wrapperWidth - displayWidth) / 2;
  const top = (wrapperHeight - displayHeight) / 2;

  // Position exactly over canvas
  drawLayer.style.position = "absolute";
  drawLayer.style.left = left + "px";
  drawLayer.style.top = top + "px";
  drawLayer.style.width = displayWidth + "px";
  drawLayer.style.height = displayHeight + "px";
  drawLayer.style.cursor = "crosshair";
  drawLayer.style.zIndex = "10";
  drawLayer.style.pointerEvents = "auto";
  drawLayer.style.transformOrigin = "0 0";

  wrapper.appendChild(drawLayer);

  // Setup drawing events
  drawLayer.addEventListener("mousedown", handleDrawStart);
  drawLayer.addEventListener("mousemove", handleDrawMove);
  drawLayer.addEventListener("mouseup", handleDrawEnd);
  drawLayer.addEventListener("mouseleave", handleDrawCancel);

  console.log(
    `✅ Drawing layer: ${displayWidth}x${displayHeight} at [${left}, ${top}]`
  );
}
function drawSelections() {
  const overlay = document.getElementById("redactionOverlay");
  if (!overlay) {
    console.error("❌ Redaction overlay not found");
    return;
  }

  overlay.innerHTML = "";

  const wrapper = document.getElementById("pdfCanvasWrapper");
  const canvas = document.getElementById("pdfCanvas");
  if (!wrapper || !canvas) return;

  // Get actual dimensions
  const displayWidth = parseFloat(canvas.style.width);
  const displayHeight = parseFloat(canvas.style.height);

  // Calculate centered position
  const wrapperWidth = wrapper.clientWidth;
  const wrapperHeight = wrapper.clientHeight;
  const left = (wrapperWidth - displayWidth) / 2;
  const top = (wrapperHeight - displayHeight) / 2;

  // Position overlay exactly over canvas
  overlay.style.position = "absolute";
  overlay.style.left = left + "px";
  overlay.style.top = top + "px";
  overlay.style.width = displayWidth + "px";
  overlay.style.height = displayHeight + "px";
  overlay.style.pointerEvents = "none";
  overlay.style.zIndex = "15";
  overlay.style.transformOrigin = "0 0";

  const pageSelections = state.selections.filter(
    (s) => s.page === state.currentPage
  );

  console.log(`🎨 Drawing ${pageSelections.length} selections`);

  pageSelections.forEach((sel) => {
    const div = document.createElement("div");
    div.className = "selection-highlight";
    div.dataset.id = sel.id;

    const topLeft = originalToDisplay(sel.x, sel.y);
    const bottomRight = originalToDisplay(
      sel.x + sel.width,
      sel.y + sel.height
    );

    const selLeft = topLeft.x;
    const selTop = topLeft.y;
    const width = bottomRight.x - topLeft.x;
    const height = bottomRight.y - topLeft.y;

    div.style.position = "absolute";
    div.style.left = selLeft + "px";
    div.style.top = selTop + "px";
    div.style.width = width + "px";
    div.style.height = height + "px";
    div.style.backgroundColor = SELECTION_COLOR;
    div.style.border = `2px solid ${SELECTION_BORDER}`;
    div.style.pointerEvents = "auto";
    div.style.cursor = "pointer";
    div.style.transition = "all 0.2s";
    div.style.zIndex = "5";
    div.style.boxSizing = "border-box";

    div.addEventListener("mouseenter", () => {
      div.style.backgroundColor = "rgba(255, 0, 0, 0.6)";
      div.style.borderColor = "#ff0000";
    });

    div.addEventListener("mouseleave", () => {
      div.style.backgroundColor = SELECTION_COLOR;
      div.style.borderColor = SELECTION_BORDER;
    });

    div.addEventListener("click", (e) => {
      e.stopPropagation();
      deleteSelection(sel.id);
    });

    overlay.appendChild(div);
  });

  console.log(`✅ Drew ${pageSelections.length} selections`);
}

// ==================== SELECTION MANAGEMENT ====================
function addSelection(left, top, width, height) {
  // Convert display coordinates to original PDF coordinates
  const topLeftOriginal = displayToOriginal(left, top);
  const bottomRightOriginal = displayToOriginal(left + width, top + height);

  const sel = {
    id: utils.generateId(),
    page: state.currentPage,
    x: topLeftOriginal.x,
    y: topLeftOriginal.y,
    width: bottomRightOriginal.x - topLeftOriginal.x,
    height: bottomRightOriginal.y - topLeftOriginal.y,
  };

  state.selections.push(sel);
  console.log(`✅ Added selection (original coords):`, sel); // ← FIX: Add comma after colon

  drawSelections();
  renderSelectionList();
}
function deleteSelection(id) {
  const idx = state.selections.findIndex((s) => s.id === id);
  if (idx === -1) return;

  const deleted = state.selections.splice(idx, 1)[0];
  console.log(`🗑️ Deleted selection:`, deleted); // ← FIX: Add comma after colon

  drawSelections();
  renderSelectionList();
}
function clearAllSelections() {
  if (state.selections.length === 0) return;
  const confirmed = confirm(
    state.currentLang === "ja"
      ? "すべての選択を解除しますか?"
      : "Clear all selections?"
  );
  if (!confirmed) return;
  const count = state.selections.length;
  state.selections = [];
  drawSelections();
  renderSelectionList();
  console.log(`🗑️ Cleared ${count} selections`);
}
// ==================== NAVIGATION ====================
async function goToPage(pageNum) {
  if (
    pageNum < 1 ||
    pageNum > state.totalPages ||
    pageNum === state.currentPage
  )
    return;
  state.currentPage = pageNum;
  await renderPage();
  console.log(`📄 Navigated to page ${pageNum}`);
}
// ==================== SAVE ====================
async function saveRedactedPdf() {
  if (state.processing || state.selections.length === 0) return;
  const L = LANG[state.currentLang];
  state.processing = true;
  const loader = utils.createLoadingOverlay(L.processingPdf);
  loader.show();
  try {
    const PDFLib = await ensurePDFLib();
    const arrayBuffer = await utils.readFileAsArrayBuffer(state.pdfFile);
    const pdfDoc = await PDFLib.PDFDocument.load(arrayBuffer, {
      ignoreEncryption: true,
    });
    const byPage = {};
    state.selections.forEach((s) => {
      if (!byPage[s.page]) byPage[s.page] = [];
      byPage[s.page].push(s);
    });

    for (const [pageNum, sels] of Object.entries(byPage)) {
      const page = pdfDoc.getPage(parseInt(pageNum) - 1);
      const { height } = page.getSize();

      sels.forEach((sel) => {
        // PDF-lib uses bottom-left origin, we use top-left
        const pdfY = height - sel.y - sel.height;
        page.drawRectangle({
          x: sel.x,
          y: pdfY,
          width: sel.width,
          height: sel.height,
          color: PDFLib.rgb(0, 0, 0),
        });
      });
    }

    const pdfBytes = await pdfDoc.save({ useObjectStreams: false });
    loader.updateMessage(L.savingFiles);

    const fileName = `redacted_${state.pdfFile.name}`;
    const base64Data = arrayBufferToBase64(pdfBytes);
    const result = await window.electronAPI.savePdfFile({
      fileName,
      base64Data,
    });

    loader.hide();

    if (result?.success) {
      showSuccessModal(result.path);
      console.log(`✅ Saved: ${result.path}`);
    } else {
      utils.showToast(L.errorSaving, "error");
    }
  } catch (error) {
    console.error("❌ Save failed:", error);
    loader.hide();
    utils.showToast(L.errorSaving, "error");
  } finally {
    state.processing = false;
  }
}
async function ensurePDFLib() {
  if (window.PDFLib) return window.PDFLib;
  const path = window.libs?.pdfLibPath;
  if (!path) throw new Error("pdf-lib path missing");
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `file://${path}`;
    script.onload = () =>
      window.PDFLib
        ? resolve(window.PDFLib)
        : reject(new Error("PDFLib failed"));
    script.onerror = () => reject(new Error("Script load failed"));
    document.head.appendChild(script);
  });
}
function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 32768;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    binary += String.fromCharCode.apply(null, chunk);
  }
  return btoa(binary);
}
function showSuccessModal(path) {
  const modal = document.getElementById("successModal");
  const pathEl = document.getElementById("successPath");
  if (!modal) return;
  if (pathEl && path) pathEl.textContent = path;
  modal.classList.add("active");
  console.log(`🎉 Success: ${path}`);
}
function hideSuccessModal() {
  const modal = document.getElementById("successModal");
  if (modal) modal.classList.remove("active");
}
