/**
 * Ultra-lightweight Zero-Dependency Image to PDF generator.
 * Produces 100% standard PDF-1.4 documents viewable in any PDF reader.
 */

export interface ImageToMerge {
  id: string;
  name: string;
  file?: File;
  path?: string;
  dataUrl?: string;
}

export interface MergePdfOptions {
  pageSize: 'a4' | 'fit';
  marginPt?: number;
}

/**
 * Loads an image from data URL or blob.
 */
function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(new Error('Gagal membaca gambar: ' + e));
    img.src = src;
  });
}

/**
 * Convert canvas image to JPEG bytes.
 */
function canvasToJpegBytes(
  img: HTMLImageElement
): Promise<{ bytes: Uint8Array; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth || img.width;
    canvas.height = img.naturalHeight || img.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return reject(new Error('Canvas context gagal dibuat'));

    // Fill white background for transparent areas
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);

    canvas.toBlob(
      (blob) => {
        if (!blob) return reject(new Error('Gagal menghasilkan blob JPEG'));
        const reader = new FileReader();
        reader.onloadend = () => {
          const buffer = reader.result as ArrayBuffer;
          resolve({
            bytes: new Uint8Array(buffer),
            width: canvas.width,
            height: canvas.height,
          });
        };
        reader.onerror = reject;
        reader.readAsArrayBuffer(blob);
      },
      'image/jpeg',
      0.9
    );
  });
}

/**
 * Merges a list of images into a single valid standard PDF-1.4 file.
 */
export async function mergeImagesToPdf(
  images: ImageToMerge[],
  options: MergePdfOptions = { pageSize: 'a4', marginPt: 20 }
): Promise<{ blob: Blob; base64: string }> {
  if (images.length === 0) {
    throw new Error('Minimal harus ada 1 gambar untuk digabung ke PDF');
  }

  // A4 dimensions in PDF points (72 pt/inch)
  // 595.28 x 841.89 points
  const A4_WIDTH = 595.28;
  const A4_HEIGHT = 841.89;

  interface ProcessedPage {
    jpegBytes: Uint8Array;
    imgWidth: number;
    imgHeight: number;
    pageWidth: number;
    pageHeight: number;
    drawX: number;
    drawY: number;
    drawWidth: number;
    drawHeight: number;
  }

  const pagesData: ProcessedPage[] = [];

  for (const item of images) {
    let srcUrl = '';
    let cleanup = false;

    if (item.file) {
      srcUrl = URL.createObjectURL(item.file);
      cleanup = true;
    } else if (item.dataUrl) {
      srcUrl = item.dataUrl;
    } else if (item.path && window.electronAPI?.readFileAsBase64) {
      const b64 = await window.electronAPI.readFileAsBase64(item.path);
      srcUrl = `data:image/jpeg;base64,${b64}`;
    }

    if (!srcUrl) continue;

    try {
      const img = await loadImageElement(srcUrl);
      const { bytes, width, height } = await canvasToJpegBytes(img);

      if (options.pageSize === 'fit') {
        // 1 PDF point = 1 image pixel scaled nicely
        const scale = 72 / 150; // standard 150 DPI display
        const pW = width * scale;
        const pH = height * scale;
        pagesData.push({
          jpegBytes: bytes,
          imgWidth: width,
          imgHeight: height,
          pageWidth: pW,
          pageHeight: pH,
          drawX: 0,
          drawY: 0,
          drawWidth: pW,
          drawHeight: pH,
        });
      } else {
        // Standard A4
        const margin = options.marginPt ?? 20;
        const maxW = A4_WIDTH - margin * 2;
        const maxH = A4_HEIGHT - margin * 2;

        const ratio = Math.min(maxW / width, maxH / height);
        const drawW = width * ratio;
        const drawH = height * ratio;
        const drawX = (A4_WIDTH - drawW) / 2;
        const drawY = (A4_HEIGHT - drawH) / 2;

        pagesData.push({
          jpegBytes: bytes,
          imgWidth: width,
          imgHeight: height,
          pageWidth: A4_WIDTH,
          pageHeight: A4_HEIGHT,
          drawX,
          drawY,
          drawWidth: drawW,
          drawHeight: drawH,
        });
      }
    } finally {
      if (cleanup && srcUrl) {
        URL.revokeObjectURL(srcUrl);
      }
    }
  }

  if (pagesData.length === 0) {
    throw new Error('Tidak ada gambar valid yang dapat diproses');
  }

  // Construct PDF binary structure
  // Object IDs:
  // 1: Catalog
  // 2: Pages
  // Per page:
  //   3 + (i * 3): Page
  //   3 + (i * 3) + 1: Content stream
  //   3 + (i * 3) + 2: Image XObject

  const chunks: (Uint8Array | string)[] = [];
  const offsets: number[] = [];
  let currentOffset = 0;

  function pushString(str: string) {
    const enc = new TextEncoder();
    const bytes = enc.encode(str);
    chunks.push(bytes);
    currentOffset += bytes.length;
  }

  function pushBytes(bytes: Uint8Array) {
    chunks.push(bytes);
    currentOffset += bytes.length;
  }

  function startObject(objNum: number) {
    offsets[objNum] = currentOffset;
    pushString(`${objNum} 0 obj\n`);
  }

  function endObject() {
    pushString('endobj\n');
  }

  // 1. Header
  pushString('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');

  // Object 1: Catalog
  startObject(1);
  pushString('<< /Type /Catalog /Pages 2 0 R >>\n');
  endObject();

  // Object 2: Pages
  const numPages = pagesData.length;
  const pageObjIds: number[] = [];
  for (let i = 0; i < numPages; i++) {
    pageObjIds.push(3 + i * 3);
  }

  startObject(2);
  pushString(
    `<< /Type /Pages /Kids [${pageObjIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${numPages} >>\n`
  );
  endObject();

  // Write each page
  for (let i = 0; i < numPages; i++) {
    const p = pagesData[i];
    const pageId = 3 + i * 3;
    const contentId = pageId + 1;
    const imageId = pageId + 2;

    // Page object
    startObject(pageId);
    pushString(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${p.pageWidth.toFixed(2)} ${p.pageHeight.toFixed(2)}] /Contents ${contentId} 0 R /Resources << /XObject << /Im${i} ${imageId} 0 R >> >> >>\n`
    );
    endObject();

    // Content stream (draw image)
    const contentStream = `q ${p.drawWidth.toFixed(2)} 0 0 ${p.drawHeight.toFixed(2)} ${p.drawX.toFixed(2)} ${p.drawY.toFixed(2)} cm /Im${i} Do Q\n`;
    const contentBytes = new TextEncoder().encode(contentStream);

    startObject(contentId);
    pushString(`<< /Length ${contentBytes.length} >>\nstream\n`);
    pushBytes(contentBytes);
    pushString('\nendstream\n');
    endObject();

    // Image XObject
    startObject(imageId);
    pushString(
      `<< /Type /XObject /Subtype /Image /Width ${p.imgWidth} /Height ${p.imgHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpegBytes.length} >>\nstream\n`
    );
    pushBytes(p.jpegBytes);
    pushString('\nendstream\n');
    endObject();
  }

  // Cross-reference table
  const totalObjects = 2 + numPages * 3;
  const xrefOffset = currentOffset;

  pushString(`xref\n0 ${totalObjects + 1}\n`);
  pushString('0000000000 65535 f \n');
  for (let i = 1; i <= totalObjects; i++) {
    const offsetStr = String(offsets[i] || 0).padStart(10, '0');
    pushString(`${offsetStr} 00000 n \n`);
  }

  // Trailer
  pushString(
    `trailer\n<< /Size ${totalObjects + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`
  );

  const totalLength = chunks.reduce((acc, c) => acc + (c as Uint8Array).length, 0);
  const finalPdfBytes = new Uint8Array(totalLength);
  let pos = 0;
  for (const c of chunks) {
    const b = c as Uint8Array;
    finalPdfBytes.set(b, pos);
    pos += b.length;
  }

  const blob = new Blob([finalPdfBytes], { type: 'application/pdf' });

  // Convert to base64
  let binary = '';
  const len = finalPdfBytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(finalPdfBytes[i]);
  }
  const base64 = btoa(binary);

  return { blob, base64 };
}
