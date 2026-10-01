import { z } from "zod";

import type { AssetsService } from "../assets/assets.service.js";
import type { AiModelCatalogService } from "../ai-model-catalog/ai-model-catalog.service.js";
import type { AgentCostEstimator } from "../agent/agent-cost-estimator.js";
import type { CanvasAgentRepository } from "./canvas-agent.repository.js";
import type {
  CanvasAgentContext,
  CanvasAgentEvent,
  CanvasAgentPending,
  CanvasAgentSession,
  CanvasSnapshot,
} from "./canvas-agent.types.js";

/** Narrow service surface the tools need; tests pass fakes. */
export type CanvasAgentToolDeps = {
  assets: Pick<AssetsService, "addAssetToFolder" | "createFolder" | "listAssets" | "listFolders">;
  catalog: Pick<AiModelCatalogService, "listModels" | "listRoutesForModel">;
  costEstimator: Pick<AgentCostEstimator, "estimateGenerateImage">;
  repository: CanvasAgentRepository;
};

export type CanvasAgentToolContext = {
  callId: string;
  canvas: CanvasSnapshot | null;
  ctx: CanvasAgentContext;
  deps: CanvasAgentToolDeps;
  emit: (event: CanvasAgentEvent) => void;
  session: CanvasAgentSession;
};

/** A tool either finishes with a JSON-serializable result or pauses the loop. */
export type CanvasAgentToolOutcome =
  | { output: unknown; summary?: string; type: "result" }
  | { pending: CanvasAgentPending; type: "pause" };

export type CanvasAgentTool<S extends z.ZodTypeAny = z.ZodTypeAny> = {
  description: string;
  name: string;
  /** Permission required beyond the route guard (flow:update). */
  permission?: string;
  run: (args: z.infer<S>, context: CanvasAgentToolContext) => Promise<CanvasAgentToolOutcome>;
  schema: S;
  /** Short Chinese step title shown in the chat ("查看当前画布节点"). */
  title: (args: z.infer<S>) => string;
};

export const defineTool = <S extends z.ZodTypeAny>(tool: CanvasAgentTool<S>): CanvasAgentTool => tool as unknown as CanvasAgentTool;

export const result = (output: unknown, summary?: string): CanvasAgentToolOutcome => ({ output, summary, type: "result" });

/** JSON Schema for provider tool definitions (zod 4 native). */
export function toolInputSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  const { $schema: _ignored, ...json } = z.toJSONSchema(schema) as Record<string, unknown>;
  return json;
}

const MAX_CANVAS_NODES = 200;
const clip = (value: string | null | undefined, max: number) => (value ? value.slice(0, max) : value ?? null);

const canvasInspect = defineTool({
  name: "canvas_inspect",
  description: "查看用户当前画布：节点列表（类型、标题、状态、已有图片的素材 id、提示词摘要）和当前选中的节点。动手规划前先调用。",
  schema: z.object({}).strict(),
  title: () => "查看当前画布节点与素材",
  async run(_args, { canvas }) {
    if (!canvas) return result({ available: false, note: "浏览器没有上送画布快照" }, "未获取到画布");
    const nodes = canvas.nodes.slice(0, MAX_CANVAS_NODES).map((node) => ({
      assetId: node.assetId ?? null, id: node.id, prompt: clip(node.prompt, 300),
      status: node.status ?? null, title: clip(node.title, 80), type: node.type,
    }));
    const imageCount = nodes.filter((node) => node.assetId).length;
    return result({
      nodeCount: canvas.nodes.length, nodes, revision: canvas.revision, selectedNodeIds: canvas.selectedNodeIds,
      truncated: canvas.nodes.length > MAX_CANVAS_NODES,
    }, `${canvas.nodes.length} 个节点，${imageCount} 张图片，选中 ${canvas.selectedNodeIds.length} 个`);
  },
});

const assetSearch = defineTool({
  name: "asset_search",
  description: "检索用户素材库，判断是否已有可用的产品图、白底图或参考图。",
  schema: z.object({
    folderId: z.string().uuid().optional(),
    kind: z.enum(["image", "video", "audio"]).optional(),
    query: z.string().trim().min(1).max(100).optional(),
  }).strict(),
  title: (args) => (args.query ? `检索素材库：${args.query}` : "检索素材库中是否有相关素材"),
  async run(args, { ctx, deps }) {
    const page = await deps.assets.listAssets(ctx, { ...args, page: 1, pageSize: 12 });
    const items = page.items.map((asset) => ({
      createdAt: asset.createdAt, description: clip(asset.description, 200), height: asset.height, id: asset.id,
      kind: asset.kind, title: asset.title ?? asset.originalFilename, width: asset.width,
    }));
    return result({ items, total: page.total }, page.total ? `找到 ${page.total} 个素材` : "素材库中没有相关素材");
  },
});

const assetListFolders = defineTool({
  name: "asset_list_folders",
  description: "列出素材库文件夹。",
  schema: z.object({}).strict(),
  title: () => "查看素材库文件夹",
  async run(_args, { ctx, deps }) {
    const folders = await deps.assets.listFolders(ctx);
    return result(
      folders.map((folder) => ({ id: folder.id, name: folder.name, parentFolderId: folder.parentFolderId })),
      `${folders.length} 个文件夹`,
    );
  },
});
const modelList = defineTool({
  name: "model_list",
  description: "列出当前可用的生图模型（modelKey、显示名）。规划生成前调用，只能使用这里返回的模型。",
  schema: z.object({}).strict(),
  title: () => "检查当前工作区可用的生成模型状态",
  async run(_args, { ctx, deps }) {
    const models = await deps.catalog.listModels(ctx, { environment: "production", modality: "image" });
    return result(
      models.map((model) => ({ defaultRouteKey: model.defaultRouteKey, displayName: model.displayName, modelKey: model.modelKey })),
      `${models.length} 个生图模型可用`,
    );
  },
});

const modelContract = defineTool({
  name: "model_contract",
  description: "查看某个生图模型的线路参数：支持的比例、分辨率、参考图上限、每张预估积分。提交生成前必须确认参数合法。",
  schema: z.object({ modelKey: z.string().trim().min(1).max(120) }).strict(),
  title: (args) => `查看 ${args.modelKey} 图像模型的参数与契约`,
  async run(args, { ctx, deps }) {
    const routes = await deps.catalog.listRoutesForModel(ctx, args.modelKey, { environment: "production" });
    if (!routes.length) return result({ error: "MODEL_NOT_AVAILABLE", modelKey: args.modelKey }, "模型不可用");
    return result({
      modelKey: args.modelKey,
      routes: routes.map((route) => ({
        aspectRatios: route.capabilities.aspectRatios ?? [],
        estimatedCreditsPerImage: route.estimatedCredits,
        maxReferenceImages: route.capabilities.maxImages ?? null,
        resolutions: route.capabilities.resolutions ?? ["1K", "2K", "4K"],
        routeKey: route.routeKey,
        routeLabel: route.routeLabel,
        supportsImageInput: route.capabilities.supportsImageInput ?? false,
      })),
    }, `${routes.length} 条线路`);
  },
});

const FILE_PATH = z.string().trim().regex(/^[A-Za-z0-9_-][A-Za-z0-9_.-]{0,99}$/, "只允许字母、数字、下划线、横线和点")
  .refine((path) => /\.(md|json|txt)$/.test(path), "只支持 .md / .json / .txt 文件");
const MAX_FILE_CHARS = 60_000;

const fileList = defineTool({
  name: "file_list",
  description: "列出这个画布下 Agent 维护的项目文件（如 project.md、req_*.json）。",
  schema: z.object({}).strict(),
  title: () => "查看项目文件",
  async run(_args, { ctx, deps, session }) {
    const files = await deps.repository.listFiles(ctx, session.flowId);
    return result(files.map((file) => ({ chars: file.content.length, path: file.path, updatedAt: file.updatedAt, version: file.version })));
  },
});

const fileRead = defineTool({
  name: "file_read",
  description: "读取一个项目文件的全文。",
  schema: z.object({ path: FILE_PATH }).strict(),
  title: (args) => `读取 ${args.path}`,
  async run(args, { ctx, deps, session }) {
    const file = await deps.repository.readFile(ctx, session.flowId, args.path);
    return file ? result({ content: file.content, path: file.path, version: file.version }) : result({ error: "FILE_NOT_FOUND", path: args.path }, "文件不存在");
  },
});

const fileWrite = defineTool({
  name: "file_write",
  description: "创建或整体覆盖一个项目文件。用 project.md 记录定位、交付清单、执行方式和关键要素状态表；用 req_*.json 记录每批生成需求。",
  schema: z.object({ content: z.string().max(MAX_FILE_CHARS), path: FILE_PATH }).strict(),
  title: (args) => `编辑 ${args.path}`,
  async run(args, { ctx, deps, emit, session }) {
    const file = await deps.repository.writeFile(ctx, {
      content: args.content, flowId: session.flowId, path: args.path, projectId: session.projectId, sessionId: session.id,
    });
    emit({ path: file.path, type: "file_updated", version: file.version });
    return result({ path: file.path, version: file.version }, `已编辑 ${file.path}`);
  },
});

const assetSave = defineTool({
  name: "asset_save",
  description: "把生成好的素材存进素材库的项目文件夹（没有就新建）。",
  permission: "asset:update",
  schema: z.object({
    assetIds: z.array(z.string().uuid()).min(1).max(50),
    folderName: z.string().trim().min(1).max(120),
  }).strict(),
  title: (args) => `将 ${args.assetIds.length} 个素材存入「${args.folderName}」`,
  async run(args, { ctx, deps }) {
    const folders = await deps.assets.listFolders(ctx);
    const folder = folders.find((item) => item.name === args.folderName && !item.parentFolderId)
      ?? await deps.assets.createFolder(ctx, { name: args.folderName });
    const saved: string[] = [];
    const failed: string[] = [];
    for (const assetId of args.assetIds) {
      try { await deps.assets.addAssetToFolder(ctx, folder.id, assetId); saved.push(assetId); } catch { failed.push(assetId); }
    }
    return result({ failed, folderId: folder.id, folderName: folder.name, saved }, `已存入 ${saved.length} 个${failed.length ? `，${failed.length} 个失败` : ""}`);
  },
});

/** Read-only and file tools; interactive tools live in canvas-agent.interactive-tools.ts. */
export const infoTools: CanvasAgentTool[] = [
  canvasInspect, assetSearch, assetListFolders, modelList, modelContract, fileList, fileRead, fileWrite, assetSave,
];
