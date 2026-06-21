/**
 * Image processing utilities for Flow Canvas
 */
const LEGACY_API_ORIGIN =
  typeof window !== 'undefined' && window.location.hostname === 'localhost'
    ? 'http://localhost:3355'
    : '';

// URL -> Blob
export async function imageUrlToBlob(url: string): Promise<Blob> {
  if (url.startsWith('data:')) {
    const [header, payload = ''] = url.split(',', 2);
    const mime = header.match(/^data:([^;]+)/)?.[1] || 'application/octet-stream';
    const binary = header.includes(';base64') ? atob(payload) : decodeURIComponent(payload);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return new Blob([bytes], { type: mime });
  }

  const headers: Record<string, string> = {};
  if (url.startsWith('/api/v2/')) {
    try {
      const { getStoredAccessToken } = await import('../../services/v2HttpClient');
      const token = getStoredAccessToken();
      if (token) {
        headers.Authorization = token.startsWith('Bearer ') ? token : `Bearer ${token}`;
      }
    } catch {
      // Keep image tools usable in non-auth test environments.
    }
  }

  const response = await fetch(url, {
    cache: 'no-store',
    headers,
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch image: ${response.statusText}`);
  }
  return await response.blob();
}

export async function imageUrlToBlobWithProxyFallback(url: string): Promise<Blob> {
  try {
    return await imageUrlToBlob(url);
  } catch (error) {
    if (!/^https?:\/\//i.test(url)) {
      throw error;
    }
    return imageUrlToBlob(`${LEGACY_API_ORIGIN}/api/proxy/image?url=${encodeURIComponent(url)}`);
  }
}

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// URL -> Base64
export async function imageUrlToBase64(url: string): Promise<string> {
  const blob = await imageUrlToBlob(url);
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// Canvas -> Blob URL
export function canvasToBlobUrl(canvas: HTMLCanvasElement, type = 'image/png', quality = 1): Promise<string> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(URL.createObjectURL(blob));
        } else {
          reject(new Error('Canvas to Blob conversion failed'));
        }
      },
      type,
      quality
    );
  });
}

export function triggerBrowserDownload(url: string, filename: string): void {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener noreferrer';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// Download Image
export async function downloadImage(url: string, filename: string): Promise<void> {
  try {
    const blob = await imageUrlToBlob(url);
    const objectUrl = URL.createObjectURL(blob);
    triggerBrowserDownload(objectUrl, filename);
    setTimeout(() => URL.revokeObjectURL(objectUrl), 100);
  } catch (err) {
    console.error('Download failed:', err);
    triggerBrowserDownload(url, filename);
  }
}

// Get Natural Size
export function getImageNaturalSize(url: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous'; // Help with CORS if applicable
    img.onload = () => {
      resolve({ w: img.naturalWidth, h: img.naturalHeight });
    };
    img.onerror = reject;
    img.src = url;
  });
}
