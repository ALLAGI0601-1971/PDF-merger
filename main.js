const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { PDFDocument } = require('pdf-lib');

// Disable hardware acceleration to avoid GPU cache errors
app.disableHardwareAcceleration();

// Set custom cache path to avoid permission issues
app.setPath('userData', path.join(app.getPath('appData'), 'pdf-merger-electron'));

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
  if (Array.isArray(bufLike)) {
    return Buffer.from(bufLike);
  }
  if (bufLike instanceof ArrayBuffer) {
    return Buffer.from(new Uint8Array(bufLike));
  }
  if (ArrayBuffer.isView(bufLike)) {
    return Buffer.from(bufLike);
  }
  if (Buffer.isBuffer(bufLike)) {
    return bufLike;
  }
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

    // A4 size in points (1 point = 1/72 inch)
    // A4 = 210mm x 297mm = 595.28 x 841.89 points
    const A4_WIDTH = 595.28;
    const A4_HEIGHT = 841.89;

    for (const f of filesArray) {
      const name = f.name || 'unknown';
      const type = f.type || '';
      const raw = f.buffer;
      const buffer = normalizeBuffer(raw);
      if (!buffer || buffer.length === 0) continue;

      if ((type === 'application/pdf') || /\.pdf$/i.test(name)) {
        // PDF: copy pages as-is
        const pdfDoc = await PDFDocument.load(buffer);
        const copied = await mergedPdf.copyPages(pdfDoc, pdfDoc.getPageIndices());
        copied.forEach(p => mergedPdf.addPage(p));
      } else if (type.startsWith('image/') || /\.(png|jpe?g|jpg)$/i.test(name)) {
        // Image: embed and scale to fit A4
        try {
          let embedded;

          if (type === 'image/jpeg' || /\.jpe?g|jpg$/i.test(name)) {
            embedded = await mergedPdf.embedJpg(buffer);
          } else {
            try {
              embedded = await mergedPdf.embedPng(buffer);
            } catch (err) {
              // Fallback to JPEG if PNG fails
              embedded = await mergedPdf.embedJpg(buffer);
            }
          }

          // Get original image dimensions
          const imgWidth = embedded.width;
          const imgHeight = embedded.height;

          // Calculate scale to fit within A4 with margins
          const MARGIN = 40; // 40 points margin on each side
          const maxWidth = A4_WIDTH - (MARGIN * 2);
          const maxHeight = A4_HEIGHT - (MARGIN * 2);

          // Calculate scale factor to fit image within A4
          const scaleX = maxWidth / imgWidth;
          const scaleY = maxHeight / imgHeight;
          const scale = Math.min(scaleX, scaleY); // Use smaller scale to fit both dimensions

          // Calculate final dimensions
          const finalWidth = imgWidth * scale;
          const finalHeight = imgHeight * scale;

          // Calculate position to center image on page
          const x = (A4_WIDTH - finalWidth) / 2;
          const y = (A4_HEIGHT - finalHeight) / 2;

          // Create A4 page and draw scaled image centered
          const page = mergedPdf.addPage([A4_WIDTH, A4_HEIGHT]);
          page.drawImage(embedded, {
            x: x,
            y: y,
            width: finalWidth,
            height: finalHeight
          });

        } catch (imgErr) {
          console.warn('Image embedding failed, skipping:', name, imgErr);
        }
      } else {
        // Unknown type - try to embed as PNG
        try {
          const embedded = await mergedPdf.embedPng(buffer);
          const imgWidth = embedded.width;
          const imgHeight = embedded.height;

          const MARGIN = 40;
          const maxWidth = A4_WIDTH - (MARGIN * 2);
          const maxHeight = A4_HEIGHT - (MARGIN * 2);

          const scaleX = maxWidth / imgWidth;
          const scaleY = maxHeight / imgHeight;
          const scale = Math.min(scaleX, scaleY);

          const finalWidth = imgWidth * scale;
          const finalHeight = imgHeight * scale;

          const x = (A4_WIDTH - finalWidth) / 2;
          const y = (A4_HEIGHT - finalHeight) / 2;

          const page = mergedPdf.addPage([A4_WIDTH, A4_HEIGHT]);
          page.drawImage(embedded, {
            x: x,
            y: y,
            width: finalWidth,
            height: finalHeight
          });
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
