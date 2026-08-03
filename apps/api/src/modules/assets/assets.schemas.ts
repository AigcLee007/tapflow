import { z } from "zod";

const MAX_METADATA_ENTRIES = 32;
const MAX_METADATA_VALUE_LENGTH = 4000;
const MAX_TAGS = 24;

export const assetIdParamsSchema = z.object({
  assetId: z.string().uuid(),
});

export const folderIdParamsSchema = z.object({
  folderId: z.string().uuid(),
});

export const folderAssetParamsSchema = folderIdParamsSchema.extend({
  assetId: z.string().uuid(),
});

export const assetMetadataSchema = z
  .record(z.string(), z.string().max(MAX_METADATA_VALUE_LENGTH))
  .refine((value) => Object.keys(value).length <= MAX_METADATA_ENTRIES, {
    message: "metadata must not exceed 32 entries",
  });

export const assetListQuerySchema = z.object({
  favorite: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
  folderId: z.string().uuid().optional(),
  includePreviewUrls: z.coerce.boolean().optional(),
  kind: z.string().trim().min(1).max(64).optional(),
  page: z.coerce.number().int().positive().max(10_000).optional(),
  pageSize: z.coerce.number().int().positive().max(100).optional(),
  previewExpiresInSeconds: z.coerce.number().int().min(60).max(3600).optional(),
  projectId: z.string().uuid().optional(),
  query: z.string().trim().min(1).max(255).optional(),
  source: z.string().trim().min(1).max(64).optional(),
});

export const assetDownloadUrlQuerySchema = z.object({
  variantKey: z.string().trim().min(1).max(64).optional(),
});

export const updateAssetMetadataSchema = z
  .object({
    description: z.string().trim().max(2000).nullable().optional(),
    favorite: z.boolean().optional(),
    metadata: assetMetadataSchema.optional(),
    source: z.string().trim().min(1).max(64).optional(),
    tags: z.array(z.string().trim().min(1).max(64)).max(MAX_TAGS).optional(),
    title: z.string().trim().max(255).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided",
  });

export const createAssetFolderSchema = z.object({
  description: z.string().trim().max(2000).nullable().optional(),
  name: z.string().trim().min(1).max(120),
  parentFolderId: z.string().uuid().nullable().optional(),
});

export const updateAssetFolderSchema = z
  .object({
    description: z.string().trim().max(2000).nullable().optional(),
    name: z.string().trim().min(1).max(120).optional(),
    parentFolderId: z.string().uuid().nullable().optional(),
  })
  .refine(
    (value) =>
      value.name !== undefined ||
      value.description !== undefined ||
      value.parentFolderId !== undefined,
    {
      message: "At least one field must be provided",
    },
  );

export const presignedUploadSchema = z.object({
  checksumSha256: z.string().trim().min(1).max(128).optional(),
  durationMs: z.number().int().nonnegative().nullable().optional(),
  height: z.number().int().positive().nullable().optional(),
  kind: z.string().trim().min(1).max(64),
  metadata: assetMetadataSchema.optional(),
  mimeType: z.string().trim().min(1).max(255),
  originalFilename: z.string().trim().min(1).max(255),
  projectId: z.string().uuid().nullable().optional(),
  sizeBytes: z.number().int().nonnegative().nullable().optional(),
  width: z.number().int().positive().nullable().optional(),
});

export const completeUploadSchema = z
  .object({
    checksumSha256: z.string().trim().min(1).max(128).optional(),
    durationMs: z.number().int().nonnegative().nullable().optional(),
    height: z.number().int().positive().nullable().optional(),
    sizeBytes: z.number().int().nonnegative().nullable().optional(),
    width: z.number().int().positive().nullable().optional(),
  })
  .optional()
  .default({});

export const signedAssetUrlRequestSchema = z.object({
  requests: z
    .array(
      z.object({
        allowVariantFallback: z.boolean().optional().default(false),
        assetId: z.string().uuid(),
        variantKey: z.enum(["thumb", "preview"]).optional(),
      }),
    )
    .min(1)
    .max(100),
});

export type AssetIdParams = z.infer<typeof assetIdParamsSchema>;
export type AssetDownloadUrlQuery = z.infer<typeof assetDownloadUrlQuerySchema>;
export type AssetListQuery = z.infer<typeof assetListQuerySchema>;
export type CompleteUploadInput = z.infer<typeof completeUploadSchema>;
export type CreateAssetFolderInput = z.infer<typeof createAssetFolderSchema>;
export type FolderAssetParams = z.infer<typeof folderAssetParamsSchema>;
export type FolderIdParams = z.infer<typeof folderIdParamsSchema>;
export type PresignedUploadInput = z.infer<typeof presignedUploadSchema>;
export type SignedAssetUrlRequest = z.infer<typeof signedAssetUrlRequestSchema>;
export type UpdateAssetFolderInput = z.infer<typeof updateAssetFolderSchema>;
export type UpdateAssetMetadataInput = z.infer<typeof updateAssetMetadataSchema>;
