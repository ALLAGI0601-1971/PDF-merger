// renderer.js
// Modern UI renderer with Japanese/English language toggle

const fileElem = document.getElementById('fileElem');
const filesList = document.getElementById('filesList');
const dropArea = document.getElementById('drop-area');
const mergeBtn = document.getElementById('mergeBtn');
const statusEl = document.getElementById('status');
const clearBtn = document.getElementById('clearBtn');
const countEl = document.getElementById('count');
const totalsizeEl = document.getElementById('totalsize');
const dropText = document.getElementById('dropText');
const addBtn = document.getElementById('addBtn');
const titleEl = document.getElementById('title');
const subtitleEl = document.getElementById('subtitle');
const footerText = document.getElementById('footerText');
const langToggle = document.getElementById('langToggle');

let files = []; // array of { id, name, type, size, buffer: ArrayBuffer, thumbUrl }
let currentLang = "ja"; // Default Japanese

const MAX_IMAGE_WIDTH = 1654; // ~A4 width at 150dpi
const JPEG_QUALITY = 0.8; // jpeg compression for speed/size

//--------------------------------
// Language Strings
//--------------------------------
const LANG = {
  ja: {
    add: "ファイル追加",
    clear: "全削除",
    merge: "結合する",
    merging: "結合中…",
    drag: "ここにドラッグ＆ドロップ または「ファイル追加」",
    status_idle: "すべてPC内で処理（アップロードなし）",
    status_loading: "読み込み中…",
    status_merging: "結合中…",
    saved: "保存完了：",
    files: (n) => `${n} 個のファイル`,
    footer: "ドラッグで並び替え、×で削除できます。",
    langBtn: "🇯🇵 日本語",
    remove: "削除",
    title: "PDF結合ツール",
    subtitle: "ローカルで高速結合",
    addOne: "ファイルを1つ以上追加してください。",
    mergeFailed: "結合失敗：",
    mergeError: "結合エラー："
  },
  en: {
    add: "Add files",
    clear: "Clear All",
    merge: "Merge files",
    merging: "Merging...",
    drag: "Drag files here or click Add files",
    status_idle: "All files stay on this PC — no upload.",
    status_loading: "Processing files...",
    status_merging: "Merging...",
    saved: "Saved: ",
    files: (n) => `${n} file${n !== 1 ? 's' : ''}`,
    footer: "Drag to reorder, click × to remove.",
    langBtn: "🇺🇸 English",
    remove: "Remove",
    title: "PDF Merger",
    subtitle: "Local & Fast",
    addOne: "Add at least one file.",
    mergeFailed: "Merge failed: ",
    mergeError: "Merge error: "
  }
};

//--------------------------------
// Update all labels based on lang
//--------------------------------
function applyLanguage() {
  const L = LANG[currentLang];

  addBtn.innerText = L.add;
  clearBtn.innerText = L.clear;
  mergeBtn.innerText = L.merge;
  dropText.innerText = L.drag;
  statusEl.innerText = L.status_idle;
  footerText.innerText = L.footer;
  langToggle.innerText = L.langBtn;
  titleEl.innerText = L.title;
  subtitleEl.innerText = L.subtitle;
  updateSummary();
}

langToggle.addEventListener("click", () => {
  currentLang = currentLang === "ja" ? "en" : "ja";
  applyLanguage();
});

// Helpers
function humanSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024*1024) return Math.round(bytes/1024) + ' KB';
  return Math.round(bytes/(1024*1024)) + ' MB';
}

function updateSummary() {
  const L = LANG[currentLang];
  countEl.innerText = L.files(files.length);
  const total = files.reduce((s,f) => s + (f.size || 0), 0);
  totalsizeEl.innerText = `${humanSize(total)}`;
}

function renderFiles() {
  const L = LANG[currentLang];
  filesList.innerHTML = '';

  files.forEach((f, idx) => {
    const card = document.createElement('div');
    card.className = 'file-card';
    card.draggable = true;

    const thumb = document.createElement('div');
    thumb.className = 'thumb';
    if (f.thumbUrl && f.isImage) {
      const img = document.createElement('img');
      img.src = f.thumbUrl;
      img.style.width = '100%';
      img.style.height = '100%';
      img.style.objectFit = 'cover';
      img.onerror = () => {
        // Fallback if image fails to load
        thumb.innerHTML = '<div style="font-size:22px;color:#667085">🖼️</div>';
      };
      thumb.appendChild(img);
    } else {
      const span = document.createElement('div');
      span.style.fontSize = '22px';
      span.style.color = '#667085';
      span.innerText = f.isImage === false ? '📄' : '🖼️';
      thumb.appendChild(span);
    }

    const meta = document.createElement('div');
    meta.className = 'file-meta';
    const nameEl = document.createElement('div');
    nameEl.className = 'fname';
    nameEl.innerText = f.name;
    const infoEl = document.createElement('div');
    infoEl.className = 'fmeta';
    infoEl.innerText = `${f.type || 'unknown'} • ${humanSize(f.size || 0)}`;

    meta.appendChild(nameEl);
    meta.appendChild(infoEl);

    const removeBtn = document.createElement('button');
    removeBtn.className = 'remove-btn';
    removeBtn.title = L.remove;
    removeBtn.innerText = '×';
    removeBtn.onclick = (e) => {
      e.stopPropagation();
      URL.revokeObjectURL(f.thumbUrl || '');
      files.splice(idx,1);
      renderFiles();
      updateSummary();
    };

    // Drag handlers
    card.addEventListener('dragstart', (e) => {
      card.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(idx));
      card._dragIndex = idx;
    });
    card.addEventListener('dragend', () => {
      card.classList.remove('dragging');
    });
    card.addEventListener('dragover', (e) => {
      e.preventDefault();
    });
    card.addEventListener('drop', (e) => {
      e.preventDefault();
      const src = e.dataTransfer.getData('text/plain');
      const srcIdx = src ? Number(src) : card._dragIndex;
      const destIdx = idx;
      if (isNaN(srcIdx)) return;
      if (srcIdx === destIdx) return;
      const moved = files.splice(srcIdx,1)[0];
      files.splice(destIdx, 0, moved);
      renderFiles();
      updateSummary();
    });

    card.appendChild(thumb);
    card.appendChild(meta);
    card.appendChild(removeBtn);
    filesList.appendChild(card);
  });
}

// Image downscale: read File -> resized JPEG ArrayBuffer
async function resizeImageFileToJpegArrayBuffer(file, maxWidth = MAX_IMAGE_WIDTH, quality = JPEG_QUALITY) {
  const blob = file;
  const imageBitmap = await createImageBitmap(blob);
  const ratio = Math.min(1, maxWidth / imageBitmap.width);
  const targetWidth = Math.round(imageBitmap.width * ratio);
  const targetHeight = Math.round(imageBitmap.height * ratio);

  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(imageBitmap, 0, 0, targetWidth, targetHeight);

  const blobPromise = new Promise((res) => canvas.toBlob(res, 'image/jpeg', quality));
  const jpegBlob = await blobPromise;
  const ab = await jpegBlob.arrayBuffer();
  return ab;
}

// Handle selected files (FileList)
async function handleFileList(fileList) {
  const L = LANG[currentLang];
  const inputFiles = Array.from(fileList);
  statusEl.innerText = L.status_loading;

  for (const file of inputFiles) {
    const name = file.name;
    const lower = name.toLowerCase();
    if (!/\.(pdf|png|jpe?g|jpg)$/i.test(name)) continue;

    // For images: downscale to jpeg for speed and size
    if (/\.(png|jpe?g|jpg)$/i.test(lower)) {
      try {
        // Create thumbnail from original file BEFORE resizing
        const thumbUrl = URL.createObjectURL(file);

        // Then resize for the actual merge
        const resizedAb = await resizeImageFileToJpegArrayBuffer(file);
        const size = resizedAb.byteLength;

        files.push({
          id: Math.random().toString(36).slice(2,9),
          name,
          type: 'image/jpeg',
          size,
          buffer: resizedAb,
          thumbUrl,
          isImage: true
        });
      } catch (e) {
        // Fallback: use original file
        const ab = await file.arrayBuffer();
        const size = ab.byteLength;
        const thumbUrl = URL.createObjectURL(file);
        files.push({
          id: Math.random().toString(36).slice(2,9),
          name,
          type: file.type || 'image/jpeg',
          size,
          buffer: ab,
          thumbUrl,
          isImage: true
        });
      }
    } else if (/\.(pdf)$/i.test(lower)) {
      const ab = await file.arrayBuffer();
      files.push({
        id: Math.random().toString(36).slice(2,9),
        name,
        type: 'application/pdf',
        size: ab.byteLength,
        buffer: ab,
        thumbUrl: null,
        isImage: false
      });
    }
  }

  renderFiles();
  updateSummary();
  statusEl.innerText = L.status_idle;
}

// File input change
fileElem.addEventListener('change', async (e) => {
  await handleFileList(e.target.files);
  fileElem.value = null;
});

// Drag & drop to dropArea
['dragenter','dragover'].forEach(evt => {
  dropArea.addEventListener(evt, (e) => {
    e.preventDefault();
    dropArea.classList.add('drag-over');
  });
});
['dragleave','drop'].forEach(evt => {
  dropArea.addEventListener(evt, (e) => {
    e.preventDefault();
    dropArea.classList.remove('drag-over');
  });
});
dropArea.addEventListener('drop', async (e) => {
  e.preventDefault();
  const dt = e.dataTransfer;
  if (dt && dt.files && dt.files.length) {
    await handleFileList(dt.files);
  }
});

// Clear all
clearBtn.addEventListener('click', () => {
  files.forEach(f => { if (f.thumbUrl) URL.revokeObjectURL(f.thumbUrl); });
  files = [];
  renderFiles();
  updateSummary();
  const L = LANG[currentLang];
  statusEl.innerText = L.status_idle;
});

// Merge
mergeBtn.addEventListener('click', async () => {
  const L = LANG[currentLang];

  if (files.length < 1) {
    statusEl.innerText = L.addOne;
    return;
  }

  mergeBtn.disabled = true;
  mergeBtn.innerText = L.merging;
  statusEl.innerText = L.status_merging;

  const toSend = files.map(f => ({
    name: f.name,
    type: f.type,
    buffer: f.buffer
  }));

  try {
    const result = await window.electronAPI.mergeFiles(toSend);
    if (result && result.success) {
      statusEl.innerText = `${L.saved}${result.path}`;
      files.forEach(f => { if (f.thumbUrl) URL.revokeObjectURL(f.thumbUrl); });
      files = [];
      renderFiles();
      updateSummary();
    } else {
      statusEl.innerText = `${L.mergeFailed}${result.message || 'unknown'}`;
    }
  } catch (err) {
    statusEl.innerText = L.mergeError + (err && err.message ? err.message : String(err));
  } finally {
    mergeBtn.disabled = false;
    mergeBtn.innerText = L.merge;
  }
});

// Initial render with Japanese language
applyLanguage();
renderFiles();
updateSummary();
