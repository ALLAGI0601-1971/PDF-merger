const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { PDFDocument } = require('pdf-lib');

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 820,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.loadFile('index.html');
  // win.webContents.openDevTools();
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// Helper to normalize incoming buffer (ArrayBuffer / Uint8Array / Array / Buffer)
function normalizeBuffer(bufLike) {
  if (!bufLike) return Buffer.alloc(0);
  // If it's a plain Array (from older code), convert:
  if (Array.isArray(bufLike)) {
    return Buffer.from(bufLike);
  }
  // If it's an ArrayBuffer
  if (bufLike instanceof ArrayBuffer) {
    return Buffer.from(new Uint8Array(bufLike));
  }
  // If it's a typed array (Uint8Array)
  if (ArrayBuffer.isView(bufLike)) {
    return Buffer.from(bufLike);
  }
  // If Buffer already
  if (Buffer.isBuffer(bufLike)) {
    return bufLike;
  }
  // Fallback: try Buffer.from
  try {
    return Buffer.from(bufLike);
  } catch (e) {
    return Buffer.alloc(0);
  }
}

ipcMain.handle('merge-files', async (event, filesArray) => {
  try {
    if (!filesArray || filesArray.length < 1) {
      throw new Error('No files provided');
    }

    const mergedPdf = await PDFDocument.create();

    for (const f of filesArray) {
      const name = f.name || 'unknown';
      const type = f.type || '';
      const raw = f.buffer;
      const buffer = normalizeBuffer(raw);
      if (!buffer || buffer.length === 0) continue;

      if ((type === 'application/pdf') || /\.pdf$/i.test(name)) {
        // PDF: copy pages
        const pdfDoc = await PDFDocument.load(buffer);
        const copied = await mergedPdf.copyPages(pdfDoc, pdfDoc.getPageIndices());
        copied.forEach(p => mergedPdf.addPage(p));
      } else if (type.startsWith('image/') || /\.(png|jpe?g|jpg)$/i.test(name)) {
        // Image: embed
        try {
          // Attempt to embed as JPEG first (works if data is jpeg)
          if (type === 'image/jpeg' || /\.jpe?g|jpg$/i.test(name)) {
            const embedded = await mergedPdf.embedJpg(buffer);
            const { width, height } = embedded.scale(1);
            const page = mergedPdf.addPage([width, height]);
            page.drawImage(embedded, { x: 0, y: 0, width, height });
          } else {
            // PNG or other image types
            const embedded = await mergedPdf.embedPng(buffer).catch(async (err) => {
              // if embedPng fails (rare), attempt embedJpg by converting was already done on renderer side
              return mergedPdf.embedJpg(buffer);
            });
            const { width, height } = embedded.scale(1);
            const page = mergedPdf.addPage([width, height]);
            page.drawImage(embedded, { x: 0, y: 0, width, height });
          }
        } catch (imgErr) {
          console.warn('Image embedding failed, skipping:', name, imgErr);
        }
      } else {
        // Unknown - try to embed as PNG
        try {
          const embedded = await mergedPdf.embedPng(buffer);
          const { width, height } = embedded.scale(1);
          const page = mergedPdf.addPage([width, height]);
          page.drawImage(embedded, { x: 0, y: 0, width, height });
        } catch (e) {
          console.warn('Skipping unsupported file:', name, e);
        }
      }
    }

    const mergedBytes = await mergedPdf.save();

    const { canceled, filePath } = await dialog.showSaveDialog({
      title: 'Save merged PDF',
      defaultPath: 'merged.pdf',
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    });

    if (canceled || !filePath) {
      return { success: false, message: 'Save canceled' };
    }

    fs.writeFileSync(filePath, Buffer.from(mergedBytes));
    return { success: true, path: filePath, message: 'Merged and saved' };

  } catch (err) {
    console.error('Merge error:', err);
    return { success: false, message: err.message || String(err) };
  }
});
