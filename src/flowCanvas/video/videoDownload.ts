import { getAssetDownloadUrl } from '../../assets/assetApi';

export async function downloadVideoAsset(input: { assetId: string; filename: string }): Promise<void> {
  try {
    const response = await getAssetDownloadUrl(input.assetId);
    const url = String(response.url || '').trim();
    if (!url) throw new Error('Missing download URL');

    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = input.filename;
    anchor.rel = 'noopener noreferrer';
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } catch {
    throw new Error('Unable to download video. Please try again.');
  }
}
