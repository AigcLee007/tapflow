import { AGENT_REFERENCE_LIMIT } from "../../agentReferenceContext";
import { AttachmentController, type AttachmentControllerOptions, type UploadedAttachment } from "./AttachmentController";

export type CanvasReference = {
  assetId: string;
  label: string;
  nodeId?: string;
  refId: string;
};

export type CanvasReferenceNode = {
  data?: {
    assetId?: unknown;
    label?: unknown;
    title?: unknown;
  };
  id: string;
  selected?: boolean;
};

export type CanvasReferenceControllerOptions = AttachmentControllerOptions & {
  referenceLimit?: number;
};

export class CanvasReferenceController {
  private readonly attachmentController: AttachmentController;
  private readonly referenceLimit: number;

  constructor(options: CanvasReferenceControllerOptions = {}) {
    this.attachmentController = new AttachmentController(options);
    this.referenceLimit = options.referenceLimit ?? AGENT_REFERENCE_LIMIT;
  }

  projectSelectedNodes(nodes: readonly CanvasReferenceNode[]): CanvasReference[] {
    return this.limitReferences(nodes.flatMap((node) => {
      if (!node.selected || typeof node.data?.assetId !== "string" || !node.data.assetId.trim()) return [];
      const label = typeof node.data.title === "string" && node.data.title.trim()
        ? node.data.title.trim()
        : typeof node.data.label === "string" && node.data.label.trim()
          ? node.data.label.trim()
          : node.id;
      return [{
        assetId: node.data.assetId,
        label,
        nodeId: node.id,
        refId: `canvas-node:${node.id}`,
      }];
    }));
  }

  limitReferences(references: readonly CanvasReference[]): CanvasReference[] {
    const seen = new Set<string>();
    return references.filter((reference) => {
      if (!reference.assetId || !reference.refId || seen.has(reference.refId)) return false;
      seen.add(reference.refId);
      return true;
    }).slice(0, this.referenceLimit);
  }

  async upload(file: File, options: { projectId?: string | null } = {}): Promise<UploadedAttachment> {
    return this.attachmentController.upload(file, options);
  }
}
