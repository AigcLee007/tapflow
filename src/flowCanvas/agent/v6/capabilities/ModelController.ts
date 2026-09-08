import { listRuntimeRoutes, type V2RuntimeRouteItem } from "../../../../services/v2AiRoutesApi";

export type ModelDisplayMetadata = {
  displayName: string;
  modality: string;
  modelKey: string;
};

export type ModelCatalogAdapter = (modality?: string) => Promise<readonly Pick<V2RuntimeRouteItem, "modelDisplayName" | "modelKey" | "modality">[]>;

export class ModelController {
  private readonly listRoutes: ModelCatalogAdapter;

  constructor(options: { listRoutes?: ModelCatalogAdapter } = {}) {
    this.listRoutes = options.listRoutes ?? ((modality) => listRuntimeRoutes(modality));
  }

  async list(modality?: string): Promise<ModelDisplayMetadata[]> {
    const seen = new Set<string>();
    const catalogItems = await this.listRoutes(modality);
    return catalogItems.flatMap((item) => {
      const modelKey = item.modelKey?.trim() || item.modelDisplayName?.trim() || "";
      const displayName = item.modelDisplayName?.trim() || modelKey;
      if (!modelKey || !displayName || seen.has(modelKey)) return [];
      seen.add(modelKey);
      return [{ displayName, modality: item.modality, modelKey }];
    });
  }
}
