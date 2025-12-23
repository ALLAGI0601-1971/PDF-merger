// features/pdf-rotate/feature.js
// PDF Rotate Feature - Complete Implementation

import eventBus from "../../core/event-bus.js";
import * as utils from "../../core/utils.js";

// ==================== CONSTANTS ====================
const CANVAS_SCALE = 2.0; // High quality rendering
const THUMBNAIL_MAX_WIDTH = 350;
const THUMBNAIL_MAX_HEIGHT = 495; // A4 aspect ratio

// ==================== STATE ====================
let state = {
  pdfFiles: [], // Array of { id, file, name, size, rotation, thumbnail, pageCount, orientation }
  currentLang: "ja",
  processing: false,
  selectionMode: "all", // 'all', 'portrait', 'landscape'
};

// ==================== LANGUAGE TRANSLATIONS ====================
const LANG = {
  ja: {
    back: "戻る",
    uploadTitle: "PDF回転",
    uploadPrompt: "PDFファイルをドラッグ&ドロップ",
    uploadSubtext: "または",
    selectBtn: "ファイルを選択",
    uploadHint: "複数のPDFファイルを選択可能",
    rotateTitle: "PDF回転",
    addMore: "さらに追加",
    resetAll: "すべてリセット",
    hoverInfo: "カーソルを合わせて個別回転ボタンを表示",
    selection: "選択",
    selectAll: "すべて",
    selectPortrait: "縦向き",
    selectLandscape: "横向き",
    rotateLeft: "左回転",
    rotateRight: "右回転",
    saveRotated: "回転したPDFを保存",
    loadingFiles: "ファイルを読み込み中...",
    processingPdf: "PDF処理中...",
    savingFiles: "ファイルを保存中...",
    successTitle: "保存完了!",
    successMessage: "PDFファイルが回転・保存されました",
    rotateMore: "もっと回転",
    goHome: "ホームに戻る",
    errorInvalidPdf: "無効なPDFファイルです",
    errorLoading: "PDFの読み込みに失敗しました",
    errorSaving: "保存に失敗しました",
    rotationBadge: "回転",
  },
  en: {
    back: "Back",
    uploadTitle: "PDF Rotate",
    uploadPrompt: "Drag & drop PDF files",
    uploadSubtext: "or",
    selectBtn: "Select Files",
    uploadHint: "Multiple PDF files can be selected",
    rotateTitle: "PDF Rotate",
    addMore: "Add More",
    resetAll: "Reset All",
    hoverInfo: "Hover over PDFs to see individual rotate button",
    selection: "Selection",
    selectAll: "All",
    selectPortrait: "Portrait",
    selectLandscape: "Landscape",
    rotateLeft: "Rotate Left",
    rotateRight: "Rotate Right",
    saveRotated: "Save Rotated PDFs",
    loadingFiles: "Loading files...",
    processingPdf: "Processing PDF...",
    savingFiles: "Saving files...",
    successTitle: "Save Complete!",
    successMessage: "PDF files have been rotated and saved",
    rotateMore: "Rotate More",
    goHome: "Go Home",
    errorInvalidPdf: "Invalid PDF file",
    errorLoading: "Failed to load PDF",
    errorSaving: "Failed to save",
    rotationBadge: "Rotated",
  },
};

function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(resolve));
}

export async function init(container, params = {}) {
  console.log("🔄 PDF Rotate feature initializing...");

  try {
    state.currentLang = params.lang || "ja";
    state.pdfFiles = [];
    state.processing = false;
    state.selectionMode = "all";

    applyLanguage();
    setupEventListeners();

    // Listen for language changes
    eventBus.on(
      "language-changed",
      (lang) => {
        state.currentLang = lang;
        applyLanguage();
      },
      "pdf-rotate"
    );

    // Ensure we start on upload stage
    showUploadStage();

    console.log("✅ PDF Rotate feature initialized");
    return state;
  } catch (error) {
    console.error("❌ Failed to initialize PDF Rotate:", error);
    throw error;
  }
}

/**
 * Cleanup feature
 */
export async function cleanup() {
  console.log("🧹 Cleaning up PDF Rotate feature...");

  try {
    // Revoke all thumbnail URLs to prevent memory leaks
    state.pdfFiles.forEach((pdf) => {
      if (pdf.thumbnail) {
        URL.revokeObjectURL(pdf.thumbnail);
      }
    });

    state.pdfFiles = [];
    state.processing = false;
    eventBus.clear("language-changed");

    console.log("✅ PDF Rotate cleanup complete");
  } catch (error) {
    console.error("❌ Cleanup error:", error);
  }
}

// ==================== UI FUNCTIONS ====================

/**
 * Apply language to all UI elements
 */
function applyLanguage() {
  const L = LANG[state.currentLang];

  const elements = {
    backText: L.back,
    uploadTitle: L.uploadTitle,
    uploadPrompt: L.uploadPrompt,
    uploadSubtext: L.uploadSubtext,
    selectBtnText: L.selectBtn,
    uploadHint: L.uploadHint,
    backRotateText: L.back,
    rotateTitle: L.rotateTitle,
    addMoreText: L.addMore,
    resetAllText: L.resetAll,
    hoverInfoText: L.hoverInfo,
    selectionTitle: L.selection,
    selectAllText: L.selectAll,
    selectPortraitText: L.selectPortrait,
    selectLandscapeText: L.selectLandscape,
    rotateLeftText: L.rotateLeft,
    rotateRightText: L.rotateRight,
    saveRotatedText: L.saveRotated,
    successTitle: L.successTitle,
    successMessage: L.successMessage,
    rotateMoreText: L.rotateMore,
    goHomeText: L.goHome,
  };

  Object.entries(elements).forEach(([id, text]) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  });
}

function showUploadStage() {
  const uploadStage = document.getElementById("uploadStage");
  const rotateStage = document.getElementById("rotateStage");

  if (uploadStage) uploadStage.classList.add("active");
  if (rotateStage) rotateStage.classList.remove("active");
}
/**
 * Show rotate stage
 */
function showRotateStage() {
  const uploadStage = document.getElementById("uploadStage");
  const rotateStage = document.getElementById("rotateStage");

  if (uploadStage) uploadStage.classList.remove("active");
  if (rotateStage) rotateStage.classList.add("active");

  // Show/hide selection section based on PDF count
  const selectionSection = document.getElementById("selectionSection");
  if (selectionSection) {
    selectionSection.style.display =
      state.pdfFiles.length > 1 ? "block" : "none";
  }
}

/**
 * Render PDF grid
 */
function renderPdfGrid() {
  const grid = document.getElementById("pdfGrid");
  if (!grid) return;

  grid.innerHTML = "";

  // Add/remove single-pdf class for centering
  if (state.pdfFiles.length === 1) {
    grid.classList.add("single-pdf");
  } else {
    grid.classList.remove("single-pdf");
  }

  state.pdfFiles.forEach((pdf) => {
    const card = createPdfCard(pdf);
    grid.appendChild(card);
  });

  console.log(`🎨 Rendered ${state.pdfFiles.length} PDF cards`);
}

/**
 * Create a PDF card element
 */
function createPdfCard(pdf) {
  const card = document.createElement("div");
  card.className = "pdf-card";
  card.dataset.id = pdf.id;

  // Check if selected based on current selection mode
  if (isSelected(pdf)) {
    card.classList.add("selected");
  }

  const rotationDegrees = pdf.rotation * 90;

  card.innerHTML = `
    <div class="pdf-thumbnail-wrapper">
      <img 
        class="pdf-thumbnail" 
        src="${pdf.thumbnail}" 
        alt="${pdf.name}"
        style="transform: rotate(${rotationDegrees}deg)"
      />
      <button class="individual-rotate-btn" data-id="${pdf.id}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 12a9 9 0 01-9 9 9.75 9.75 0 01-6.74-2.74L3 16" />
          <path d="M3 21v-5h5" />
        </svg>
      </button>
    </div>
    <button class="delete-pdf-btn" data-id="${pdf.id}">×</button>
    <div class="pdf-info">
      <h4 class="pdf-name" title="${pdf.name}">${pdf.name}</h4>
      <div class="pdf-meta">
        <span>${utils.formatFileSize(pdf.size)}</span>
        ${
          pdf.rotation !== 0
            ? `<span class="rotation-badge">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 12a9 9 0 01-9 9 9.75 9.75 0 01-6.74-2.74L3 16" />
                </svg>
                ${pdf.rotation * 90}°
              </span>`
            : ""
        }
      </div>
    </div>
  `;

  // Event listeners
  const deleteBtn = card.querySelector(".delete-pdf-btn");
  deleteBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    deletePdf(pdf.id);
  });

  const rotateBtn = card.querySelector(".individual-rotate-btn");
  rotateBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    rotatePdfIndividual(pdf.id);
  });

  return card;
}

/**
 * Check if PDF is selected based on current selection mode
 */
function isSelected(pdf) {
  switch (state.selectionMode) {
    case "all":
      return true;
    case "portrait":
      return pdf.orientation === "portrait";
    case "landscape":
      return pdf.orientation === "landscape";
    default:
      return false;
  }
}

/**
 * Update selection mode UI
 */
function updateSelectionMode(mode) {
  state.selectionMode = mode;

  // Update button states
  const buttons = document.querySelectorAll(".selection-btn");
  buttons.forEach((btn) => {
    if (btn.dataset.mode === mode) {
      btn.classList.add("active");
    } else {
      btn.classList.remove("active");
    }
  });

  // Re-render to show selection
  renderPdfGrid();

  console.log(`📌 Selection mode: ${mode}`);
}

// ==================== EVENT LISTENERS ====================

/**
 * Setup all event listeners
 */
function setupEventListeners() {
  // Back buttons
  const backToHome = document.getElementById("backToHome");
  if (backToHome) {
    backToHome.addEventListener("click", () => {
      if (window.featureManager) {
        window.featureManager.deactivateAll();
      }
    });
  }

  const backToUpload = document.getElementById("backToUpload");
  if (backToUpload) {
    backToUpload.addEventListener("click", () => {
      showUploadStage();
      // Clean up thumbnails
      state.pdfFiles.forEach((pdf) => {
        if (pdf.thumbnail) URL.revokeObjectURL(pdf.thumbnail);
      });
      state.pdfFiles = [];
    });
  }

  // File input
  const fileInput = document.getElementById("pdfFileInput");
  const selectFileBtn = document.getElementById("selectFileBtn");
  const uploadArea = document.getElementById("uploadArea");

  if (selectFileBtn && fileInput) {
    selectFileBtn.addEventListener("click", () => fileInput.click());
  }

  if (fileInput) {
    fileInput.addEventListener("change", (e) => handleFiles(e.target.files));
  }

  // Drag and drop
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
      if (files) handleFiles(files);
    });

    uploadArea.addEventListener("click", (e) => {
      if (e.target === uploadArea || e.target.closest(".upload-icon")) {
        fileInput.click();
      }
    });
  }

  // Add more button
  const addMoreBtn = document.getElementById("addMoreBtn");
  if (addMoreBtn) {
    addMoreBtn.addEventListener("click", () => fileInput.click());
  }

  // Reset all button
  const resetAllBtn = document.getElementById("resetAllBtn");
  if (resetAllBtn) {
    resetAllBtn.addEventListener("click", resetAllRotations);
  }

  // Selection buttons
  const selectAllBtn = document.getElementById("selectAllBtn");
  if (selectAllBtn) {
    selectAllBtn.addEventListener("click", () => updateSelectionMode("all"));
  }

  const selectPortraitBtn = document.getElementById("selectPortraitBtn");
  if (selectPortraitBtn) {
    selectPortraitBtn.addEventListener("click", () =>
      updateSelectionMode("portrait")
    );
  }

  const selectLandscapeBtn = document.getElementById("selectLandscapeBtn");
  if (selectLandscapeBtn) {
    selectLandscapeBtn.addEventListener("click", () =>
      updateSelectionMode("landscape")
    );
  }

  // Rotation control buttons
  const rotateLeftBtn = document.getElementById("rotateLeftBtn");
  if (rotateLeftBtn) {
    rotateLeftBtn.addEventListener("click", () => rotateSelected("left"));
  }

  const rotateRightBtn = document.getElementById("rotateRightBtn");
  if (rotateRightBtn) {
    rotateRightBtn.addEventListener("click", () => rotateSelected("right"));
  }

  // Save button
  const saveRotatedBtn = document.getElementById("saveRotatedBtn");
  if (saveRotatedBtn) {
    saveRotatedBtn.addEventListener("click", saveRotatedPdfs);
  }

  // Success modal buttons
  const rotateMoreBtn = document.getElementById("rotateMoreBtn");
  if (rotateMoreBtn) {
    rotateMoreBtn.addEventListener("click", () => {
      hideSuccessModal();
      showUploadStage();
      state.pdfFiles.forEach((pdf) => {
        if (pdf.thumbnail) URL.revokeObjectURL(pdf.thumbnail);
      });
      state.pdfFiles = [];
    });
  }

  const goHomeBtn = document.getElementById("goHomeBtn");
  if (goHomeBtn) {
    goHomeBtn.addEventListener("click", () => {
      if (window.featureManager) {
        window.featureManager.deactivateAll();
      }
    });
  }
}

async function handleFiles(files) {
  if (!files || files.length === 0) return;

  const L = LANG[state.currentLang];
  const fileArray = Array.from(files);
  const validFiles = [];

  for (const file of fileArray) {
    const validation = utils.validatePdfFile(file);
    if (!validation.valid) {
      utils.showToast(`${file.name}: ${validation.error}`, "error");
      continue;
    }
    validFiles.push(file);
  }

  if (validFiles.length === 0) return;

  state.processing = true;

  const loader = utils.createLoadingOverlay(L.loadingFiles);
  loader.show();

  try {
    const total = validFiles.length; // 🔴 ADD THIS LINE

    for (let i = 0; i < total; i++) {
      loader.updateMessage(`${L.loadingFiles} ${i + 1}/${total}`);
      const pdfData = await loadPdfFile(validFiles[i]);
      state.pdfFiles.push(pdfData);
    }

    loader.hide();
    showRotateStage();
    renderPdfGrid();
  } catch (error) {
    loader.hide();
    utils.showToast(L.errorLoading, "error");
  } finally {
    state.processing = false; // 🔴 ADD THIS LINE
  }
}

/**
 * Load PDF file and generate thumbnail
 */
async function loadPdfFile(file) {
  const arrayBuffer = await utils.readFileAsArrayBuffer(file);

  // Load PDF with PDF.js
  const pdfjsLib = window.pdfjsLib;
  if (!pdfjsLib) {
    throw new Error("PDF.js not loaded");
  }

  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdfDoc = await loadingTask.promise;

  const pageCount = pdfDoc.numPages;

  // Render first page as thumbnail
  const page = await pdfDoc.getPage(1);
  const viewport = page.getViewport({ scale: CANVAS_SCALE });

  // Determine orientation
  const isLandscape = viewport.width > viewport.height;
  const orientation = isLandscape ? "landscape" : "portrait";

  // Create canvas for thumbnail
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", {
    alpha: false,
    desynchronized: true,
  });

  canvas.width = viewport.width;
  canvas.height = viewport.height;

  await page.render({
    canvasContext: context,
    viewport: viewport,
  }).promise;

  // Convert canvas to blob URL
  const blob = await new Promise((resolve) => {
    canvas.toBlob(resolve, "image/jpeg", 0.85);
  });

  const thumbnail = URL.createObjectURL(blob);

  // Clean up
  canvas.width = 0;
  canvas.height = 0;

  return {
    id: utils.generateId(),
    file,
    name: file.name,
    size: file.size,
    rotation: 0, // 0, 1, 2, 3 (multiples of 90 degrees)
    thumbnail,
    pageCount,
    orientation,
  };
}

// ==================== ROTATION LOGIC ====================

/**
 * Delete PDF from list
 */
function deletePdf(id) {
  const index = state.pdfFiles.findIndex((p) => p.id === id);
  if (index === -1) return;

  const pdf = state.pdfFiles[index];
  if (pdf.thumbnail) {
    URL.revokeObjectURL(pdf.thumbnail);
  }

  state.pdfFiles.splice(index, 1);
  console.log(`🗑️ Deleted PDF: ${pdf.name}`);

  if (state.pdfFiles.length === 0) {
    showUploadStage();
  } else {
    renderPdfGrid();
    // Update selection section visibility
    const selectionSection = document.getElementById("selectionSection");
    if (selectionSection) {
      selectionSection.style.display =
        state.pdfFiles.length > 1 ? "block" : "none";
    }
  }
}

/**
 * Rotate individual PDF
 */
function rotatePdfIndividual(id) {
  const pdf = state.pdfFiles.find((p) => p.id === id);
  if (!pdf) return;

  // Rotate right (clockwise)
  pdf.rotation = (pdf.rotation + 1) % 4;

  // Update orientation based on rotation
  updateOrientation(pdf);

  console.log(`🔄 Rotated ${pdf.name}: ${pdf.rotation * 90}°`);

  renderPdfGrid();
}

/**
 * Rotate selected PDFs
 */
function rotateSelected(direction) {
  const selectedPdfs = state.pdfFiles.filter(isSelected);

  if (selectedPdfs.length === 0) return;

  selectedPdfs.forEach((pdf) => {
    if (direction === "left") {
      pdf.rotation = (pdf.rotation - 1 + 4) % 4;
    } else {
      pdf.rotation = (pdf.rotation + 1) % 4;
    }

    updateOrientation(pdf);
  });

  console.log(`🔄 Rotated ${selectedPdfs.length} PDFs ${direction}`);

  renderPdfGrid();
}

/**
 * Reset all rotations
 */
function resetAllRotations() {
  state.pdfFiles.forEach((pdf) => {
    pdf.rotation = 0;
    updateOrientation(pdf);
  });

  console.log("🔄 Reset all rotations");

  renderPdfGrid();
}

/**
 * Update PDF orientation based on rotation
 */
function updateOrientation(pdf) {
  // Even rotations (0, 2) keep original orientation
  // Odd rotations (1, 3) flip orientation
  if (pdf.rotation % 2 === 0) {
    // Restore original orientation (would need to store original)
    // For simplicity, we'll recalculate based on current state
    return;
  } else {
    // Flip orientation
    pdf.orientation = pdf.orientation === "portrait" ? "landscape" : "portrait";
  }
}

async function saveRotatedPdfs() {
  if (state.processing || state.pdfFiles.length === 0) return;

  const L = LANG[state.currentLang];
  state.processing = true;

  // Show loading overlay using utils
  const loader = utils.createLoadingOverlay(L.processingPdf);
  loader.show();

  try {
    const PDFLib = await ensurePDFLib();
    const processedFiles = [];
    const total = state.pdfFiles.length;

    // Process PDFs
    for (let i = 0; i < total; i++) {
      loader.updateMessage(`${L.processingPdf} ${i + 1}/${total}`);

      const pdf = state.pdfFiles[i];
      const buffer = await utils.readFileAsArrayBuffer(pdf.file);
      const pdfDoc = await PDFLib.PDFDocument.load(buffer, {
        ignoreEncryption: true,
      });

      if (pdf.rotation !== 0) {
        const pages = pdfDoc.getPages();
        const rot = pdf.rotation * 90;
        pages.forEach((p) =>
          p.setRotation(PDFLib.degrees(p.getRotation().angle + rot))
        );
      }

      const bytes = await pdfDoc.save({ useObjectStreams: false });

      processedFiles.push({
        name: pdf.rotation ? `rotated_${pdf.name}` : pdf.name,
        base64Data: arrayBufferToBase64(bytes),
      });
    }

    // Update message before file dialog
    loader.updateMessage(L.savingFiles);

    let result;
    if (processedFiles.length === 1) {
      result = await window.electronAPI.saveRotatedPdfFile(processedFiles[0]);
    } else {
      result = await window.electronAPI.saveRotatedPdfFolder({
        files: processedFiles,
      });
    }

    loader.hide();

    if (result?.success) {
      showSuccessModal(result.path);
    }
  } catch (error) {
    loader.hide();
    utils.showToast(L.errorSaving, "error");
  } finally {
    state.processing = false;
  }
}

/**
 * Ensure pdf-lib is loaded
 */
async function ensurePDFLib() {
  if (window.PDFLib) return window.PDFLib;

  const pdfLibPath = window.libs?.pdfLibPath;
  if (!pdfLibPath) throw new Error("pdf-lib path not available");

  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `file://${pdfLibPath}`;
    script.onload = () => {
      if (window.PDFLib) {
        resolve(window.PDFLib);
      } else {
        reject(new Error("PDFLib not loaded"));
      }
    };
    script.onerror = () => reject(new Error("Failed to load pdf-lib"));
    document.head.appendChild(script);
  });
}

/**
 * Convert ArrayBuffer to Base64
 */
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

/**
 * Show success modal
 */
function showSuccessModal(path) {
  const modal = document.getElementById("successModal");
  const pathEl = document.getElementById("successPath");

  if (!modal) {
    console.error("❌ Success modal element not found!");
    return;
  }

  console.log(`🎉 [SHOW SUCCESS MODAL] Path: ${path}`);
  console.log(`   Current classes: "${modal.className}"`);

  if (pathEl && path) {
    pathEl.textContent = path;
    console.log(`   ✅ Path set: ${path}`);
  }

  modal.classList.add("active");

  requestAnimationFrame(() => {
    const newStyle = window.getComputedStyle(modal);
    console.log(`   ✅ Modal shown:`);
    console.log(`      Classes: "${modal.className}"`);
    console.log(`      Opacity: ${newStyle.opacity}`);
    console.log(`      Visibility: ${newStyle.visibility}`);
  });
}

/**
 * Hide success modal
 */
function hideSuccessModal() {
  const modal = document.getElementById("successModal");
  if (!modal) {
    console.warn("⚠️ Success modal not found when trying to hide");
    return;
  }

  console.log("🔄 [HIDE SUCCESS MODAL]");
  modal.classList.remove("active");
  console.log(`   ✅ Modal hidden`);
}
