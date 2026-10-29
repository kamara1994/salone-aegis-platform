// Prepares a user-chosen canvas background so it fits in browser storage. Images stay on this computer.
export const BG_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
export const BG_MAX_BYTES = 4 * 1024 * 1024;
const KEEP_AS_IS = 1_500_000; // data-URL characters; small images (and animated GIFs) are kept untouched
const MAX_EDGE = 1920;

export function checkBackgroundFile(file: { type: string; size: number }): string | null {
  if (!BG_TYPES.includes(file.type)) return 'Use a PNG, JPEG, WebP or GIF image.';
  if (file.size > BG_MAX_BYTES) return 'Images must be 4 MB or smaller.';
  return null;
}

/** Scale to fit within 1920 px on the long edge, re-encoded as WebP (or JPEG where WebP is not supported). */
export function fitScale(w: number, h: number, max = MAX_EDGE) {
  const k = Math.min(1, max / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
}

export async function prepareBackground(file: File): Promise<{ ok: true; dataUrl: string; resized: boolean } | { ok: false; error: string }> {
  const bad = checkBackgroundFile(file);
  if (bad) return { ok: false, error: bad };
  const dataUrl = await new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => (typeof r.result === 'string' ? res(r.result) : rej(new Error('read')));
    r.onerror = () => rej(new Error('read'));
    r.readAsDataURL(file);
  }).catch(() => null);
  if (!dataUrl) return { ok: false, error: 'This image could not be read.' };
  if (dataUrl.length <= KEEP_AS_IS) return { ok: true, dataUrl, resized: false };
  const img = new Image();
  const loaded = await new Promise<boolean>((res) => {
    img.onload = () => res(true);
    img.onerror = () => res(false);
    img.src = dataUrl;
  });
  if (!loaded) return { ok: false, error: 'This image could not be read.' };
  const { w, h } = fitScale(img.naturalWidth, img.naturalHeight);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return { ok: true, dataUrl, resized: false };
  ctx.drawImage(img, 0, 0, w, h);
  let out = canvas.toDataURL('image/webp', 0.82);
  if (!out.startsWith('data:image/webp')) out = canvas.toDataURL('image/jpeg', 0.85);
  return { ok: true, dataUrl: out.length < dataUrl.length ? out : dataUrl, resized: out.length < dataUrl.length };
}
