import sharp from "sharp";

export type GeneratedAssetVariant = {
  body: Buffer;
  height: number | null;
  mimeType: "image/webp";
  variantKey: "thumb" | "preview";
  width: number | null;
};

const IMAGE_MIME_RE = /^image\/(png|jpe?g|webp)$/i;

async function buildWebpVariant(
  body: Buffer,
  variantKey: "thumb" | "preview",
  size: number,
  quality: number,
): Promise<GeneratedAssetVariant> {
  const output = await sharp(body, { failOn: "none" })
    .rotate()
    .resize({
      fit: "inside",
      height: size,
      width: size,
      withoutEnlargement: true,
    })
    .webp({ effort: 4, quality })
    .toBuffer({ resolveWithObject: true });

  return {
    body: output.data,
    height: output.info.height ?? null,
    mimeType: "image/webp",
    variantKey,
    width: output.info.width ?? null,
  };
}

export async function createImageVariants(input: {
  body: Buffer;
  mimeType: string;
}): Promise<GeneratedAssetVariant[]> {
  if (!IMAGE_MIME_RE.test(input.mimeType)) {
    return [];
  }

  const [thumb, preview] = await Promise.all([
    buildWebpVariant(input.body, "thumb", 640, 80),
    buildWebpVariant(input.body, "preview", 1024, 78),
  ]);

  return [thumb, preview];
}
