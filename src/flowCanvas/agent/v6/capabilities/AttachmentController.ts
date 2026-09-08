import { uploadAssetFile, type AssetItem, type AssetKind } from "../../../../assets/assetApi";

export type UploadedAttachment = {
  assetId: string;
  kind: string;
  label: string;
};

export type AssetUploadAdapter = (input: {
  file: File;
  projectId?: string | null;
}) => Promise<Pick<AssetItem, "id" | "kind" | "originalFilename" | "title">>;

export type AttachmentControllerOptions = {
  uploadAsset?: AssetUploadAdapter;
};

export class AttachmentController {
  private readonly uploadAsset: AssetUploadAdapter;

  constructor(options: AttachmentControllerOptions = {}) {
    this.uploadAsset = options.uploadAsset ?? ((input) => uploadAssetFile({ file: input.file, projectId: input.projectId }));
  }

  async upload(file: File, options: { projectId?: string | null } = {}): Promise<UploadedAttachment> {
    const asset = await this.uploadAsset({ file, projectId: options.projectId });
    return {
      assetId: asset.id,
      kind: String(asset.kind as AssetKind),
      label: asset.title?.trim() || asset.originalFilename?.trim() || file.name,
    };
  }
}
