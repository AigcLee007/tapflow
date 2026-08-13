import sharp from "sharp";

export const MAX_TEXT_IMAGE_BYTES = 5 * 1024 * 1024;

const MAX_DIMENSIONS = [2048, 1600, 1280, 1024, 768];
const WEBP_QUALITIES = [82, 72, 62, 52, 42, 32];

export async function compressTextImageForModel(input: {
  body: Buffer;
  mimeType: string;
}): Promise<{ body: Buffer; mimeType: string }> {
  if (input.body.byteLength <= MAX_TEXT_IMAGE_BYTES) {
    return input;
  }

  for (const size of MAX_DIMENSIONS) {
    for (const quality of WEBP_QUALITIES) {
      const output = await sharp(input.body, { failOn: "none" })
        .rotate()
        .resize({ fit: "inside", height: size, width: size, withoutEnlargement: true })
        .webp({ effort: 4, quality })
        .toBuffer();
      if (output.byteLength <= MAX_TEXT_IMAGE_BYTES) {
        return { body: output, mimeType: "image/webp" };
      }
    }
  }

  throw new Error("The image could not be compressed below the text provider size limit.");
}
