'use client';

/** Phone photos are often 4–12 MB; the reader works from ~2000 px anyway, so shrink to a JPEG before sending. */
export async function shrinkImage(file: File, maxPx = 2000): Promise<File> {
  if (!file.type.startsWith('image/') || (file.size < 1.5 * 1024 * 1024 && file.type !== 'image/heic' && maxPx >= 2000)) return file;
  try {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, maxPx / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * k); canvas.height = Math.round(bmp.height * k);
    const ctx = canvas.getContext('2d'); if (!ctx) return file;
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob: Blob | null = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.88));
    return blob ? new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' }) : file;
  } catch { return file; }
}

/** File → data: URI. */
export const fileToDataUri = (f: Blob) => new Promise<string>((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.onerror = () => reject(r.error); r.readAsDataURL(f); });
