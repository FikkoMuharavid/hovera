export interface CompressionPreset {
  id: string;
  label: string;
  description: string;
  targetKb?: number;
  quality?: number;
  maxWidth?: number;
}

export const COMPRESSION_PRESETS: CompressionPreset[] = [
  {
    id: 'target-200kb',
    label: '< 200 KB',
    description: 'Syarat CPNS / BUMN / Formulir Web',
    targetKb: 200,
  },
  {
    id: 'target-500kb',
    label: '< 500 KB',
    description: 'Lampiran Email & Pesan Cepat',
    targetKb: 500,
  },
  {
    id: 'target-1mb',
    label: '< 1 MB',
    description: 'Dokumen Standar & Portofolio',
    targetKb: 1024,
  },
  {
    id: 'balanced',
    label: 'Seimbang (80%)',
    description: 'Full HD, Jernih & Hemat 70%',
    quality: 0.8,
    maxWidth: 1920,
  },
  {
    id: 'small',
    label: 'Hemat Ekstrem (55%)',
    description: 'Ukuran Ringkas untuk Web',
    quality: 0.55,
    maxWidth: 1440,
  },
  {
    id: 'high-quality',
    label: 'Kualitas Tinggi (92%)',
    description: 'Resolusi Asli, Kompresi Halus',
    quality: 0.92,
  },
  {
    id: 'custom',
    label: 'Kustom',
    description: 'Atur Kualitas & Resolusi Sendiri',
  },
];

export interface CompressOptions {
  presetId?: string;
  targetKb?: number;
  quality?: number; // 0.1 to 1.0
  scale?: number; // 0.1 to 1.0
  maxWidth?: number;
  format?: 'original' | 'image/webp' | 'image/jpeg' | 'image/png';
}

export interface CompressedImageResult {
  fileName: string;
  sourcePath?: string;
  originalSize: number;
  compressedSize: number;
  savingsPercent: number;
  width: number;
  height: number;
  previewUrl: string;
  base64: string;
  mimeType: string;
  ext: string;
}

/**
 * Loads an image from a File, Blob, or base64 Data URL.
 */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(new Error('Gagal memuat gambar: ' + e));
    img.src = src;
  });
}

/**
 * Convert Blob to Base64 string.
 */
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      resolve(reader.result as string);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Get canvas Blob with specific format and quality.
 */
function canvasToBlob(
  canvas: HTMLCanvasElement,
  format: string,
  quality: number
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Canvas gagal menghasilkan blob'));
      },
      format,
      quality
    );
  });
}

/**
 * Compresses a single image according to options.
 */
export async function compressImage(
  input: { file?: File; path?: string; dataUrl?: string; name: string; size: number },
  options: CompressOptions
): Promise<CompressedImageResult> {
  let srcUrl = '';
  let cleanupUrl = false;

  if (input.file) {
    srcUrl = URL.createObjectURL(input.file);
    cleanupUrl = true;
  } else if (input.dataUrl) {
    srcUrl = input.dataUrl;
  } else if (input.path && window.electronAPI?.readFileAsBase64) {
    const b64 = await window.electronAPI.readFileAsBase64(input.path);
    srcUrl = `data:image/jpeg;base64,${b64}`;
  } else {
    throw new Error('Tidak ada sumber gambar yang valid');
  }

  try {
    const img = await loadImage(srcUrl);

    // Determine target format
    let targetMime = 'image/webp';
    let targetExt = 'webp';

    if (options.format === 'image/jpeg') {
      targetMime = 'image/jpeg';
      targetExt = 'jpg';
    } else if (options.format === 'image/png') {
      targetMime = 'image/png';
      targetExt = 'png';
    } else if (options.format === 'image/webp') {
      targetMime = 'image/webp';
      targetExt = 'webp';
    } else {
      // 'original' or default
      const lower = input.name.toLowerCase();
      if (lower.endsWith('.png')) {
        targetMime = 'image/webp'; // WebP preserves transparency and is 80% smaller!
        targetExt = 'webp';
      } else if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) {
        targetMime = 'image/jpeg';
        targetExt = 'jpg';
      } else {
        targetMime = 'image/webp';
        targetExt = 'webp';
      }
    }

    // Base dimensions
    let targetWidth = img.naturalWidth || img.width;
    let targetHeight = img.naturalHeight || img.height;

    // Apply max width constraint
    if (options.maxWidth && targetWidth > options.maxWidth) {
      const ratio = options.maxWidth / targetWidth;
      targetWidth = Math.round(targetWidth * ratio);
      targetHeight = Math.round(targetHeight * ratio);
    }

    // Apply user scale constraint
    if (options.scale && options.scale > 0 && options.scale < 1) {
      targetWidth = Math.max(1, Math.round(targetWidth * options.scale));
      targetHeight = Math.max(1, Math.round(targetHeight * options.scale));
    }

    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Gagal menginisialisasi 2D Canvas');

    // Smooth scaling
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    // If JPEG, fill white background for transparent PNG source
    if (targetMime === 'image/jpeg') {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, targetWidth, targetHeight);
    }

    ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

    let finalBlob: Blob;

    // 1. If Target KB is requested (e.g. <200 KB) -> Binary search quality and auto-scale if needed
    if (options.targetKb && options.targetKb > 0) {
      const targetBytes = options.targetKb * 1024;
      let minQ = 0.08;
      let maxQ = 0.96;
      let bestBlob: Blob | null = null;
      let currentWidth = targetWidth;
      let currentHeight = targetHeight;

      for (let attempt = 0; attempt < 6; attempt++) {
        const midQ = (minQ + maxQ) / 2;
        const testBlob = await canvasToBlob(canvas, targetMime, midQ);

        if (testBlob.size <= targetBytes) {
          bestBlob = testBlob;
          minQ = midQ; // try to get better quality while still <= target
        } else {
          maxQ = midQ; // too big, decrease quality
        }
      }

      // If even min quality is still too big, scale down dimensions
      let scaleCount = 0;
      while ((!bestBlob || bestBlob.size > targetBytes) && scaleCount < 3) {
        scaleCount++;
        currentWidth = Math.round(currentWidth * 0.75);
        currentHeight = Math.round(currentHeight * 0.75);
        canvas.width = currentWidth;
        canvas.height = currentHeight;
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        if (targetMime === 'image/jpeg') {
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, currentWidth, currentHeight);
        }
        ctx.drawImage(img, 0, 0, currentWidth, currentHeight);

        const testBlob = await canvasToBlob(canvas, targetMime, 0.65);
        if (testBlob.size <= targetBytes || scaleCount >= 3) {
          bestBlob = testBlob;
          break;
        }
      }

      finalBlob = bestBlob || (await canvasToBlob(canvas, targetMime, 0.5));
    } else {
      // 2. Direct Quality
      const q = options.quality !== undefined ? options.quality : 0.8;
      finalBlob = await canvasToBlob(canvas, targetMime, q);
    }

    const compressedSize = finalBlob.size;
    const originalSize = input.size || compressedSize;
    const savingsPercent =
      originalSize > 0
        ? Math.max(0, Math.round(((originalSize - compressedSize) / originalSize) * 100))
        : 0;

    const base64 = await blobToBase64(finalBlob);
    const previewUrl = URL.createObjectURL(finalBlob);

    return {
      fileName: input.name,
      sourcePath: input.path,
      originalSize,
      compressedSize,
      savingsPercent,
      width: canvas.width,
      height: canvas.height,
      previewUrl,
      base64,
      mimeType: targetMime,
      ext: targetExt,
    };
  } finally {
    if (cleanupUrl && srcUrl) {
      URL.revokeObjectURL(srcUrl);
    }
  }
}

/**
 * Format bytes to readable string (e.g. 1.2 MB or 420 KB)
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}
