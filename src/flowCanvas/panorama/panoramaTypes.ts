export const PANORAMA_GENERATION_MODE = 'panorama_360' as const;
export const PANORAMA_MEDIA_KIND = 'pano360' as const;
export const PANORAMA_DEFAULT_ASPECT_RATIO = '2:1' as const;
export const PANORAMA_SUPPORTED_ASPECT_RATIOS = ['2:1', '21:9'] as const;
export const PANORAMA_DEFAULT_PROJECTION = 'equirectangular' as const;

export type PanoramaAspectRatio = (typeof PANORAMA_SUPPORTED_ASPECT_RATIOS)[number];

export type PanoramaAssetMetadata = {
  aspectRatio?: string;
  generationMode: typeof PANORAMA_GENERATION_MODE;
  mediaKind: typeof PANORAMA_MEDIA_KIND;
  projection: typeof PANORAMA_DEFAULT_PROJECTION;
};
