import { apiGet } from './v2HttpClient';

export interface AssetDownloadUrlResponse {
  expiresAt: string;
  method: 'GET';
  url: string;
}

export async function getAssetDownloadUrl(assetId: string): Promise<AssetDownloadUrlResponse> {
  return apiGet<AssetDownloadUrlResponse>(`/assets/${assetId}/download-url`);
}
