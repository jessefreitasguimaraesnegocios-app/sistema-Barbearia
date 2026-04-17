/**
 * Redimensiona e comprime imagem no browser para data URL JPEG (menos egress/BD que PNG gigante em base64).
 */

export type ResizeImageToJpegOptions = {
  /** Largura máxima em px (mantém proporção). */
  maxWidth: number;
  /** Altura máxima em px (mantém proporção). */
  maxHeight: number;
  /** Qualidade JPEG 0–1 (default 0.82). */
  quality?: number;
  /** Rejeita ficheiros maiores que isto antes de decodificar (default 8 MiB). */
  maxFileBytes?: number;
};

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result ?? ''));
    r.onerror = () => reject(new Error('read_failed'));
    r.readAsDataURL(file);
  });
}

/**
 * @returns data URL `image/jpeg` ou `null` se tipo inválido / ficheiro grande / falha no canvas.
 */
export async function resizeImageFileToJpegDataUrl(
  file: File,
  opts: ResizeImageToJpegOptions
): Promise<string | null> {
  if (!file.type.startsWith('image/')) return null;
  const maxFile = opts.maxFileBytes ?? 8 * 1024 * 1024;
  if (file.size > maxFile) return null;

  let dataUrl: string;
  try {
    dataUrl = await readFileAsDataUrl(file);
  } catch {
    return null;
  }

  const quality = opts.quality ?? 0.82;
  const { maxWidth, maxHeight } = opts;

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let w = img.width;
      let h = img.height;
      if (w <= 0 || h <= 0) {
        resolve(null);
        return;
      }
      const rw = maxWidth / w;
      const rh = maxHeight / h;
      const scale = Math.min(1, rw, rh);
      w = Math.max(1, Math.round(w * scale));
      h = Math.max(1, Math.round(h * scale));

      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(null);
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      try {
        resolve(canvas.toDataURL('image/jpeg', quality));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}
