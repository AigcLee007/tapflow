# aigc-flow 改造详细开发计划

> 目标：把当前 `aigc-flow` 改造成一套统一的账号制 AI Flow 工作台：用户登录后进入 TapNow 风格工作空间；工作空间中有多个项目；每个项目对应一套 React Flow 画布；画布、素材、计费扣费均服务端持久化；保留登录、计费、素材库能力，删除/下线旧经典画布和重复入口。

---

## 0. 项目结论与改造原则

### 0.1 当前仓库状态

根据当前公开仓库结构，项目已经具备以下基础：

- 根 `package.json` 已经是 npm workspaces，包含 `apps/*` 与 `packages/*`，并有 `dev:api`、`dev:worker`、`db:migrate`、`start:v2` 等 v2 运行脚本。
- 当前 `App.tsx` 同时挂了多套前端入口：旧经典画布、Flow 画布、素材库、账号中心、账单中心、后台管理、模型映射等，导致产品体验和代码边界混乱。
- v2 后端已经有 `apps/api`、`apps/worker`、PostgreSQL、Redis/BullMQ、S3-compatible storage 的生产方向。
- 数据库已有 `users / tenants / tenant_memberships`、`projects / flows / flow_versions`、`assets / asset_variants`、`billing_accounts / usage_events / billing_ledger` 等基础表。
- Flow 页面已经是 `@xyflow/react` 画布，但当前自动保存仍偏本地化，需要改为服务端项目级草稿。
- 旧素材库和旧账号计费前端仍有 legacy API / IndexedDB / localStorage 痕迹，需要统一改到 `/api/v2/*`。

### 0.2 核心原则

1. **v2 是唯一主线**  
   登录、项目、画布、素材、计费都统一走 `/api/v2/*`。legacy CJS server、旧 account API、旧本地缓存仅用于迁移参考，不再作为产品路径。

2. **产品只保留一套前端壳子**  
   未登录进入 `/login`；登录后进入 `/workspace`；核心页面是 `/workspace`、`/projects/:projectId`、`/assets`、`/billing`、`/account`。

3. **项目 = 用户看到的画布容器**  
   产品层面一个项目对应一套画布。数据库可以保留 `project -> flow` 的可扩展设计，但前端不暴露多个 flow。

4. **画布 JSON 只保存结构**  
   `graph_json` 只存 `nodes / edges / viewport / node data` 等结构化数据。图片、视频、音频、生成结果全部进入 `assets` 和对象存储，节点只引用 `assetId`。

5. **计费只能由后端扣**  
   前端只发起任务。后端 reserve，worker settle/refund，ledger 记录流水。禁止前端直接修改余额。

6. **分阶段落地，先可用再清理**  
   先新建新路由和新数据通路；旧页面先从路由下线；build 稳定后再物理删除旧代码。

---

## 1. 最终产品信息架构

### 1.1 路由

```txt
未登录：
/login
/register

登录后：
/workspace                 工作空间首页
/projects/:projectId       项目 Flow 画布
/assets                    素材库
/billing                   账单/充值/扣费记录
/account                   账号中心

兼容/重定向：
/                          未登录 -> /login；已登录 -> /workspace
/create/flow               redirect -> /workspace 或最近项目
/create/classic            redirect -> /workspace
/admin                     暂不作为普通用户入口
/model-mapping             暂不作为普通用户入口
```

### 1.2 页面结构

```txt
WorkspaceShell
├── 顶部导航
│   ├── Logo
│   ├── 工作空间
│   ├── 素材库
│   ├── 账单
│   ├── 账户
│   ├── 当前余额
│   └── 头像/退出
└── Page Content
    ├── WorkspacePage
    ├── FlowProjectPage
    ├── AssetLibraryPage
    ├── BillingCenterPage
    └── AccountCenterPage
```

### 1.3 用户主要路径

```txt
注册/登录
-> /workspace
-> 新建项目
-> 自动创建默认 flow + draft
-> /projects/:projectId
-> 上传或生成素材
-> 素材进入 assets
-> 画布节点引用 assetId
-> 自动保存 flow_drafts
-> 生成任务扣费
-> /billing 查看流水
-> /assets 管理素材
```

---

## 2. 目标目录结构

### 2.1 前端建议目录

```txt
src/
  app/
    AppRouter.tsx
    WorkspaceShell.tsx
    routes.ts
    navigation.ts

  auth/
    AuthProvider.tsx
    AuthGate.tsx
    LoginPage.tsx
    RegisterPage.tsx
    useAuth.ts

  services/
    v2HttpClient.ts
    v2AuthClient.ts

  workspace/
    WorkspacePage.tsx
    WorkspaceHeader.tsx
    ProjectTabs.tsx
    ProjectToolbar.tsx
    ProjectGrid.tsx
    ProjectCard.tsx
    CreateProjectCard.tsx
    useWorkspaceProjects.ts
    workspaceApi.ts

  flowCanvas/
    FlowProjectPage.tsx
    FlowCanvasPage.tsx
    canvas/
    nodes/
    edges/
    store/
    hooks/
      useRemoteFlowProject.ts
      useRemoteFlowAutosave.ts
      useInsertAssetNode.ts
    services/
      flowProjectApi.ts
      flowAssetApi.ts
    utils/

  assets/
    AssetLibraryPage.tsx
    AssetGrid.tsx
    AssetCard.tsx
    AssetPreviewModal.tsx
    AssetFolderSidebar.tsx
    UploadAssetButton.tsx
    useAssetLibrary.ts
    assetApi.ts

  billing/
    BillingCenterPage.tsx
    BillingSummaryCards.tsx
    BillingLedgerTable.tsx
    BillingUsageTable.tsx
    RedeemCodeBox.tsx
    RechargePanel.tsx
    billingApi.ts

  account/
    AccountPage.tsx
    AccountProfile.tsx
    AccountSecurity.tsx
```

### 2.2 后端建议目录

```txt
apps/api/src/modules/
  auth/
  projects/
  flows/
    flow-drafts.service.ts
  workspace/
    workspace.routes.ts
    workspace.service.ts
    workspace.schemas.ts
  assets/
    assets-library.routes.ts
    assets-library.service.ts
  billing/
    redeem.routes.ts
    payments.routes.ts
    admin-billing.routes.ts
```

### 2.3 数据库迁移建议

```txt
packages/db/migrations/
  000009_flow_drafts.sql
  000010_asset_library.sql
  000011_project_workspace_metadata.sql
  000012_billing_redeem_payments.sql
  000013_model_pricing.sql
```

---

## 3. Sprint 1：统一 App 入口、登录与产品壳子

### 3.1 目标

把当前多入口 `App.tsx` 收敛成一套清晰路由：

- 未登录只允许访问 `/login`、`/register`
- 登录后访问 `/workspace`、`/projects/:projectId`、`/assets`、`/billing`、`/account`
- 不再默认进入旧 `InfiniteCanvas`
- 不再通过 `/create/flow` 作为主入口

### 3.2 需要新增文件

```txt
src/app/AppRouter.tsx
src/app/WorkspaceShell.tsx
src/app/routes.ts
src/auth/AuthProvider.tsx
src/auth/AuthGate.tsx
src/auth/LoginPage.tsx
src/auth/RegisterPage.tsx
src/auth/useAuth.ts
src/services/v2HttpClient.ts
src/services/v2AuthClient.ts
```

### 3.3 `v2HttpClient.ts`

职责：

- 自动拼接 `/api/v2`
- 自动加 `Authorization: Bearer <accessToken>`
- 处理 401：调用 refresh；refresh 失败则 logout
- 返回统一错误结构

建议接口：

```ts
export type ApiError = {
  status: number;
  message: string;
  code?: string;
  details?: unknown;
};

export async function apiGet<T>(path: string): Promise<T>;
export async function apiPost<T>(path: string, body?: unknown): Promise<T>;
export async function apiPatch<T>(path: string, body?: unknown): Promise<T>;
export async function apiPut<T>(path: string, body?: unknown): Promise<T>;
export async function apiDelete<T>(path: string): Promise<T>;
```

### 3.4 `v2AuthClient.ts`

统一使用 v2 auth：

```ts
export async function register(input: {
  email: string;
  password: string;
  displayName?: string;
  tenantName?: string;
}) {}

export async function login(input: {
  email: string;
  password: string;
  tenantId?: string;
}) {}

export async function refresh() {}
export async function logout() {}
export async function getMe() {}
```

### 3.5 `AuthProvider`

状态：

```ts
type AuthState = {
  loading: boolean;
  authenticated: boolean;
  user: User | null;
  tenant: Tenant | null;
  permissions: string[];
  login: (input) => Promise<void>;
  register: (input) => Promise<void>;
  logout: () => Promise<void>;
  refreshMe: () => Promise<void>;
};
```

启动流程：

```txt
1. 读取 access token / refresh token
2. 如果没有 token：authenticated = false
3. 如果有 token：GET /api/v2/auth/me
4. 401 时尝试 /api/v2/auth/refresh
5. refresh 成功后重新 getMe
6. refresh 失败清空 token
```

### 3.6 `App.tsx` 目标形态

```tsx
import { AuthProvider } from "./src/auth/AuthProvider";
import { AppRouter } from "./src/app/AppRouter";

export default function App() {
  return (
    <AuthProvider>
      <AppRouter />
    </AuthProvider>
  );
}
```

### 3.7 `AppRouter.tsx` 目标逻辑

```tsx
export function AppRouter() {
  const path = window.location.pathname;

  if (path === "/login") return <LoginPage />;
  if (path === "/register") return <RegisterPage />;

  return (
    <AuthGate>
      <WorkspaceShell>
        {path === "/" && <Redirect to="/workspace" />}
        {path.startsWith("/workspace") && <WorkspacePage />}
        {path.startsWith("/projects/") && <FlowProjectPage />}
        {path.startsWith("/assets") && <AssetLibraryPage />}
        {path.startsWith("/billing") && <BillingCenterPage />}
        {path.startsWith("/account") && <AccountPage />}
      </WorkspaceShell>
    </AuthGate>
  );
}
```

如果项目暂时没有 `react-router-dom`，先沿用当前 pathname 分发，避免额外依赖。

### 3.8 暂时下线的入口

从 `App.tsx` 移除直接渲染：

```txt
AdminDashboardPage
ImageEditMappingPage
InfiniteCanvas
ControlPanel
MobileView
Toolbar
MainLayout
ModalsContainer
旧 create classic 入口
旧 create flow 入口
```

不是立即删文件，而是先不再引用。

### 3.9 验收标准

- 未登录访问 `/workspace` 会跳转 `/login`
- 登录后刷新页面仍保持登录
- 退出登录后 token 清空，回到 `/login`
- `/` 自动进入 `/workspace`
- 旧 `/create/classic` 不再作为主产品入口
- `npm run build` 通过
- `npm test` 如当前测试可跑，必须通过

---

## 4. Sprint 2：TapNow 风格工作空间与项目系统

### 4.1 目标

实现截图里的工作空间体验：

- 顶部导航
- 个人 / 团队项目 tab
- 搜索
- 显示全部筛选
- 网格 / 列表切换
- 新建项目卡片
- 项目卡片
- 点击项目进入对应画布

### 4.2 新增前端文件

```txt
src/workspace/WorkspacePage.tsx
src/workspace/WorkspaceHeader.tsx
src/workspace/ProjectTabs.tsx
src/workspace/ProjectToolbar.tsx
src/workspace/ProjectGrid.tsx
src/workspace/ProjectCard.tsx
src/workspace/CreateProjectCard.tsx
src/workspace/useWorkspaceProjects.ts
src/workspace/workspaceApi.ts
```

### 4.3 项目卡片数据结构

```ts
export type WorkspaceProject = {
  id: string;
  name: string;
  description?: string | null;
  coverAssetId?: string | null;
  coverUrl?: string | null;
  updatedAt: string;
  createdAt: string;
  nodeCount: number;
  edgeCount: number;
  assetCount: number;
  ownerUserId?: string;
};
```

### 4.4 前端 API

```ts
export async function listWorkspaceProjects(params?: {
  query?: string;
  scope?: "personal" | "team";
  sort?: "updated_desc" | "created_desc" | "name_asc";
}): Promise<WorkspaceProject[]> {}

export async function createWorkspaceProject(input: {
  name?: string;
  description?: string | null;
}): Promise<{ projectId: string; flowId: string }> {}

export async function updateProject(projectId: string, input: {
  name?: string;
  description?: string | null;
  coverAssetId?: string | null;
}) {}

export async function deleteProject(projectId: string) {}
```

### 4.5 后端聚合接口

建议新增 workspace 模块，减少前端为了打开一个项目连续调多个接口：

```txt
GET  /api/v2/workspace/projects
POST /api/v2/workspace/projects
GET  /api/v2/workspace/projects/:projectId
GET  /api/v2/workspace/projects/:projectId/canvas
PUT  /api/v2/workspace/projects/:projectId/canvas
```

`POST /api/v2/workspace/projects` 内部完成：

```txt
1. create project
2. create default flow
3. create empty flow_draft
4. return { project, flow, draft }
```

### 4.6 数据库补充

```sql
ALTER TABLE projects
ADD COLUMN IF NOT EXISTS cover_asset_id uuid REFERENCES assets(id),
ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS sort_order int NOT NULL DEFAULT 0;
```

可选：每个项目只允许一个主画布 flow：

```sql
ALTER TABLE flows
ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'canvas',
ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT true;

CREATE UNIQUE INDEX IF NOT EXISTS flows_one_default_canvas_per_project_idx
ON flows(project_id)
WHERE deleted_at IS NULL AND kind = 'canvas' AND is_default = true;
```

### 4.7 工作空间 UI 要求

- 深色背景
- 卡片圆角、边框、hover 提升
- 左侧第一张固定“新建项目”
- 项目封面优先使用 `coverUrl`
- 无封面时使用渐变占位图
- 更新时间显示为“3 分钟前 / 14 天前”
- 列表为空时引导新建项目

### 4.8 验收标准

- 项目列表来自服务端数据库
- 新建项目后刷新仍存在
- 点击项目进入 `/projects/:projectId`
- 删除项目后从列表消失
- 不同 tenant 的项目隔离
- 没有 project 权限时 UI 不显示创建按钮或接口返回 403

---

## 5. Sprint 3：项目级 Flow 画布与远程草稿持久化

### 5.1 目标

把当前 Flow 画布从“单个本地自动保存画布”改成“项目对应一套服务端持久化画布”。

### 5.2 需要新增前端文件

```txt
src/flowCanvas/FlowProjectPage.tsx
src/flowCanvas/hooks/useRemoteFlowProject.ts
src/flowCanvas/hooks/useRemoteFlowAutosave.ts
src/flowCanvas/services/flowProjectApi.ts
```

### 5.3 `FlowProjectPage`

职责：

```txt
1. 从 pathname 解析 projectId
2. 调用 GET /api/v2/workspace/projects/:projectId/canvas
3. 获取 project、flow、draft
4. 将 draft.graph_json hydrate 到 FlowCanvas store
5. 渲染 FlowCanvasPage
6. 接入 autosave 状态：保存中 / 已保存 / 保存失败
```

### 5.4 新增 `flow_drafts` 表

```sql
CREATE TABLE IF NOT EXISTS flow_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  flow_id uuid NOT NULL REFERENCES flows(id) ON DELETE CASCADE,
  graph_json jsonb NOT NULL DEFAULT '{"nodes":[],"edges":[],"viewport":{"x":0,"y":0,"zoom":1}}'::jsonb,
  revision int NOT NULL DEFAULT 1,
  last_saved_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(flow_id)
);

CREATE INDEX IF NOT EXISTS flow_drafts_tenant_project_idx
ON flow_drafts (tenant_id, project_id);

CREATE INDEX IF NOT EXISTS flow_drafts_graph_json_gin_idx
ON flow_drafts USING gin (graph_json);

ALTER TABLE flow_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE flow_drafts FORCE ROW LEVEL SECURITY;

CREATE POLICY flow_drafts_select_current_tenant
ON flow_drafts FOR SELECT
USING (tenant_id = app.current_tenant_id());

CREATE POLICY flow_drafts_insert_current_tenant
ON flow_drafts FOR INSERT
WITH CHECK (tenant_id = app.current_tenant_id());

CREATE POLICY flow_drafts_update_current_tenant
ON flow_drafts FOR UPDATE
USING (tenant_id = app.current_tenant_id())
WITH CHECK (tenant_id = app.current_tenant_id());

CREATE POLICY flow_drafts_delete_current_tenant
ON flow_drafts FOR DELETE
USING (tenant_id = app.current_tenant_id());
```

### 5.5 Flow draft API

```txt
GET  /api/v2/flows/:flowId/draft
PUT  /api/v2/flows/:flowId/draft
POST /api/v2/flows/:flowId/snapshot
```

返回格式：

```ts
type FlowDraftResponse = {
  id: string;
  flowId: string;
  projectId: string;
  revision: number;
  updatedAt: string;
  graph: {
    nodes: unknown[];
    edges: unknown[];
    viewport: { x: number; y: number; zoom: number };
  };
};
```

保存格式：

```ts
type SaveFlowDraftInput = {
  revision?: number;
  graph: {
    nodes: unknown[];
    edges: unknown[];
    viewport: { x: number; y: number; zoom: number };
  };
};
```

### 5.6 冲突策略

第一版可采用简单策略：

```txt
- 前端保存时带上本地 revision
- 后端如果 revision 小于当前 revision，返回 409
- 前端弹出“画布已在其他位置更新，是否刷新”
```

后续再做协同编辑，不在本阶段做。

### 5.7 移除本地 autosave

需要在 Flow 画布中移除或停用：

```txt
localStorage key: flow-canvas-autosave
IndexedDB key: flow-canvas-autosave-v2
useAutoSave
useAutoLoad
saveFlowSnapshot
loadFlowSnapshot
```

注意：可以保留本地 UI 偏好，比如侧栏开关、视图模式，但不能作为画布权威数据源。

### 5.8 autosave 策略

```txt
触发：
- nodes changed
- edges changed
- viewport changed
- node data changed
- asset inserted
- generation result attached

防抖：
- 1000ms 到 1500ms

状态：
- idle
- dirty
- saving
- saved
- error

失败：
- 重试 2 次
- 顶部显示错误
- 用户可手动点击“重新保存”
```

### 5.9 验收标准

- 新建项目后进入空画布
- 添加节点后 1-2 秒自动保存
- 刷新页面后节点仍在
- 清空浏览器缓存后画布仍在
- 另一台设备同账号打开能看到画布
- 保存失败有可见提示
- `flow_versions` 不被高频 autosave 写爆

---

## 6. Sprint 4：云端素材库与画布素材引用

### 6.1 目标

把素材库从浏览器本地数据改成账号/tenant 云端素材库。画布节点不再保存 blob/data URL，而是保存 `assetId`。

### 6.2 当前需要替换的本地逻辑

逐步替换：

```txt
src/services/assetStorage.ts
src/flowCanvas/store/imageFolderStore.ts
src/flowCanvas/pages/ImageLibraryPage.tsx 中对本地 store 的依赖
画布上传时把文件转 data URL 的逻辑
节点 data 中 blob:/data: URL 作为主数据的逻辑
```

### 6.3 新增或增强表

```sql
CREATE TABLE IF NOT EXISTS asset_folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  owner_user_id uuid REFERENCES users(id),
  name text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS asset_folder_items (
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  folder_id uuid NOT NULL REFERENCES asset_folders(id) ON DELETE CASCADE,
  asset_id uuid NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (folder_id, asset_id)
);

ALTER TABLE assets
ADD COLUMN IF NOT EXISTS title text,
ADD COLUMN IF NOT EXISTS description text,
ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}',
ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'upload',
ADD COLUMN IF NOT EXISTS favorite boolean NOT NULL DEFAULT false;
```

为新表加 RLS：

```sql
ALTER TABLE asset_folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE asset_folders FORCE ROW LEVEL SECURITY;

CREATE POLICY asset_folders_current_tenant_select
ON asset_folders FOR SELECT
USING (tenant_id = app.current_tenant_id());

CREATE POLICY asset_folders_current_tenant_insert
ON asset_folders FOR INSERT
WITH CHECK (tenant_id = app.current_tenant_id());

CREATE POLICY asset_folders_current_tenant_update
ON asset_folders FOR UPDATE
USING (tenant_id = app.current_tenant_id())
WITH CHECK (tenant_id = app.current_tenant_id());

CREATE POLICY asset_folders_current_tenant_delete
ON asset_folders FOR DELETE
USING (tenant_id = app.current_tenant_id());

ALTER TABLE asset_folder_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE asset_folder_items FORCE ROW LEVEL SECURITY;

CREATE POLICY asset_folder_items_current_tenant_all
ON asset_folder_items
USING (tenant_id = app.current_tenant_id())
WITH CHECK (tenant_id = app.current_tenant_id());
```

### 6.4 素材 API

已有 presigned upload 的前提下，补素材列表和文件夹：

```txt
GET    /api/v2/assets
POST   /api/v2/assets/presigned-upload
POST   /api/v2/assets/:assetId/complete-upload
GET    /api/v2/assets/:assetId
GET    /api/v2/assets/:assetId/download-url
PATCH  /api/v2/assets/:assetId/metadata
DELETE /api/v2/assets/:assetId

GET    /api/v2/assets/folders
POST   /api/v2/assets/folders
PATCH  /api/v2/assets/folders/:folderId
DELETE /api/v2/assets/folders/:folderId
POST   /api/v2/assets/folders/:folderId/items
DELETE /api/v2/assets/folders/:folderId/items/:assetId
```

### 6.5 `GET /api/v2/assets` 查询参数

```txt
projectId
kind=image|video|audio|document|other
source=upload|generated|edited|reference|cover
favorite=true|false
folderId
query
page
pageSize
sort=updated_desc|created_desc|name_asc
```

### 6.6 前端素材库

新增：

```txt
src/assets/AssetLibraryPage.tsx
src/assets/AssetGrid.tsx
src/assets/AssetCard.tsx
src/assets/AssetPreviewModal.tsx
src/assets/AssetFolderSidebar.tsx
src/assets/UploadAssetButton.tsx
src/assets/useAssetLibrary.ts
src/assets/assetApi.ts
```

素材卡片：

```ts
type AssetItem = {
  id: string;
  title?: string | null;
  originalFilename?: string | null;
  kind: "image" | "video" | "audio" | "document" | "other";
  mimeType: string;
  previewUrl: string;
  downloadUrl?: string;
  width?: number | null;
  height?: number | null;
  durationMs?: number | null;
  source: string;
  favorite: boolean;
  projectId?: string | null;
  createdAt: string;
  updatedAt: string;
};
```

### 6.7 画布节点数据改造

禁止长期保存：

```ts
{
  src: "blob:...",
  imageUrl: "data:image/png;base64,...",
  originalImageUrl: "data:image/png;base64,..."
}
```

改成：

```ts
{
  assetId: "uuid",
  previewUrl: "/api/v2/assets/:assetId/download-url 或签名后的临时 URL",
  thumbnailAssetId: "uuid 可选",
  width: 1024,
  height: 768,
  mimeType: "image/png"
}
```

注意：`previewUrl` 可以是短期缓存字段，不应作为唯一权威字段。权威字段是 `assetId`。

### 6.8 上传流程

```txt
1. 用户在画布或素材库选择文件
2. POST /api/v2/assets/presigned-upload
3. 前端 PUT 文件到对象存储
4. POST /api/v2/assets/:assetId/complete-upload
5. 返回 asset
6. 如果来自画布：创建对应 node，node.data.assetId = asset.id
7. 自动保存 draft
```

### 6.9 从素材库插入画布

```txt
1. 用户在 /assets 点击“插入画布”
2. 选择项目，或默认最近项目
3. 跳转 /projects/:projectId?insertAssetId=xxx
4. FlowProjectPage 读取 query
5. 拉取 asset metadata
6. 创建 image/video/audio node
7. autosave
```

### 6.10 生成结果自动入库

worker 成功生成后必须：

```txt
1. 获取供应商返回的文件 URL 或 binary
2. 服务端下载/转存到对象存储
3. 创建 assets 记录，source='generated'
4. 关联 project_id、workflow_run_id、node_run_id
5. 返回 assetId 给前端
6. 画布节点保存 assetId
7. 素材库自动出现生成结果
```

### 6.11 验收标准

- 上传素材后刷新不丢
- 换浏览器登录后素材仍存在
- 画布节点只需 `assetId` 即可恢复预览
- 生成结果自动进入素材库
- 素材可按项目、类型、关键词筛选
- 删除素材时，如果仍被画布引用，需要提示风险或禁止硬删除

---

## 7. Sprint 5：计费、充值、扣费闭环

### 7.1 目标

用户有余额/点数；AI 生成任务先冻结额度，成功后扣费，失败后退款；账单中心能看到完整流水。

### 7.2 计费展示单位

建议第一阶段直接把内部 `balance_cents` 作为点数展示：

```txt
balance_cents   -> balanceCredits
reserved_cents  -> reservedCredits
billable_cents  -> chargedCredits
```

前端文案：

```txt
余额：1200 点
冻结中：30 点
本月消耗：340 点
```

后续如果接真实支付货币，再引入 currency/price 映射。

### 7.3 新增表：兑换码和支付

```sql
CREATE TABLE IF NOT EXISTS billing_redeem_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id),
  code_hash text NOT NULL UNIQUE,
  credits bigint NOT NULL,
  status text NOT NULL DEFAULT 'active',
  max_redemptions int NOT NULL DEFAULT 1,
  redeemed_count int NOT NULL DEFAULT 0,
  expires_at timestamptz,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS billing_redeem_code_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  redeem_code_id uuid NOT NULL REFERENCES billing_redeem_codes(id),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  user_id uuid REFERENCES users(id),
  billing_ledger_id uuid REFERENCES billing_ledger(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS billing_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  name text NOT NULL,
  monthly_credits bigint NOT NULL DEFAULT 0,
  price_cents bigint NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  limits jsonb NOT NULL DEFAULT '{}'::jsonb,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS billing_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  user_id uuid REFERENCES users(id),
  provider text NOT NULL,
  provider_payment_id text,
  amount_cents bigint NOT NULL,
  credits bigint NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  status text NOT NULL DEFAULT 'pending',
  billing_ledger_id uuid REFERENCES billing_ledger(id),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

### 7.4 模型价格表

```sql
CREATE TABLE IF NOT EXISTS model_pricing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  model text NOT NULL,
  route text NOT NULL DEFAULT 'default',
  unit text NOT NULL,
  unit_credits bigint NOT NULL,
  min_charge_credits bigint NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(provider, model, route, unit)
);
```

示例 unit：

```txt
image_generation
video_generation_second
audio_generation_second
token_1k_input
token_1k_output
```

### 7.5 Billing API

已有：

```txt
GET /api/v2/billing/summary
GET /api/v2/billing/usage-events
GET /api/v2/billing/ledger
```

补充：

```txt
POST /api/v2/billing/redeem
POST /api/v2/billing/payment/create-checkout
POST /api/v2/billing/payment/webhook
POST /api/v2/billing/admin/adjust
POST /api/v2/billing/admin/redeem-codes
GET  /api/v2/billing/admin/redeem-codes
GET  /api/v2/billing/pricing
```

### 7.6 扣费流程

#### 生成前 reserve

```txt
POST /api/v2/workflow-runs
body:
{
  projectId,
  flowId,
  nodeId,
  modelId,
  routeId,
  input
}
```

后端：

```txt
1. 检查用户权限
2. 查询 model_pricing
3. 计算 estimatedCredits
4. 检查 balance - reserved >= estimatedCredits
5. reserveUsage
6. 创建 workflow_run / node_run
7. 写入 BullMQ
8. 返回 workflowRunId / nodeRunId / reservedCredits
```

#### 成功 settle

worker：

```txt
1. 调供应商成功
2. 计算 actualCredits
3. recordUsageEvent
4. settleUsage
5. 转存生成结果到 assets
6. node_run success
7. 通过轮询或事件让前端更新节点
```

#### 失败 refund

worker：

```txt
1. 捕获失败
2. refundUsage
3. node_run failed
4. 前端显示失败原因
```

### 7.7 幂等键

必须使用稳定 idempotency key：

```txt
reserve:{tenantId}:{workflowRunId}:{nodeRunId}
usage:{tenantId}:{workflowRunId}:{nodeRunId}:{providerTaskId}
settle:{tenantId}:{usageEventId}
refund:{tenantId}:{workflowRunId}:{nodeRunId}
redeem:{tenantId}:{codeHash}
payment:{provider}:{providerPaymentId}
```

### 7.8 前端账单页

新增或重构：

```txt
src/billing/BillingCenterPage.tsx
src/billing/BillingSummaryCards.tsx
src/billing/BillingLedgerTable.tsx
src/billing/BillingUsageTable.tsx
src/billing/RedeemCodeBox.tsx
src/billing/RechargePanel.tsx
src/billing/billingApi.ts
```

功能：

```txt
1. 余额卡片
2. 冻结中点数
3. 本月消耗
4. 充值入口
5. 兑换码入口
6. ledger 流水
7. usage event 详情
8. 按时间、项目、模型筛选
```

### 7.9 验收标准

- 余额不足不能发起生成
- 发起生成后有冻结点数
- 生成成功扣除实际点数
- 生成失败释放冻结
- 重试/回调不会重复扣费
- 账单中心可看到 reserve / settle / refund
- 兑换码只能按规则使用一次或指定次数

---

## 8. Sprint 6：账号中心与权限

### 8.1 目标

保留账号中心，但改成 v2 数据源。

### 8.2 页面

```txt
/account
├── 基本资料
├── 当前工作空间
├── 权限/角色
├── 安全设置
└── 退出登录
```

### 8.3 API

```txt
GET /api/v2/auth/me
PATCH /api/v2/account/profile       可新增
POST /api/v2/auth/logout
```

### 8.4 权限映射

前端根据 `/auth/me` 的 permissions 控制 UI：

```ts
const canCreateProject = permissions.includes("project:create");
const canReadBilling = permissions.includes("billing:read");
const canCreateAsset = permissions.includes("asset:create");
const canDeleteAsset = permissions.includes("asset:delete");
```

### 8.5 验收标准

- 账号中心展示当前用户邮箱、昵称、tenant
- 可退出登录
- 没权限的入口不显示或置灰
- 403 时有明确提示

---

## 9. Sprint 7：清理旧代码和迁移收尾

### 9.1 下线旧入口

确认新系统稳定后，删除或归档：

```txt
components/InfiniteCanvas.tsx
components/ControlPanel.tsx
components/Toolbar.tsx
components/MobileView.tsx
src/store/canvasStore.ts
src/hooks/useCanvasOperations.ts
src/services/assetStorage.ts
src/flowCanvas/store/imageFolderStore.ts
旧 create/classic 路由
旧 model-mapping 页面
旧 admin 普通入口
```

### 9.2 legacy 后端

从生产脚本中移除：

```txt
legacy:server
legacy:start
server.cjs
authStore*.cjs
billingStore*.cjs
generationRecordStore*.cjs
flowProjectStore.cjs
generatedAssetService.cjs
```

可以先不删除文件，但 README 必须说明 legacy 只用于迁移/参考。

### 9.3 文档更新

```txt
README.md
docs/architecture.md
docs/api.md
docs/billing.md
docs/assets.md
docs/development.md
AGENTS.md
```

### 9.4 验收标准

- `npm run build` 通过
- `npm test` 通过
- README 只有 v2 启动路径
- 新开发者根据 README 能跑起来
- 搜索代码，主要产品路径不再依赖 `assetStorage` / `canvasStore` / legacy account API

---

## 10. 推荐 Codex 执行顺序

### 10.1 第一条 Codex 任务：只做路由和 Auth 壳子

```txt
请阅读 AGENTS.md 和 DEVELOPMENT_PLAN.md，然后只完成 Sprint 1：
1. 重构 App.tsx 为 AuthProvider + AppRouter。
2. 新增 v2HttpClient、v2AuthClient、AuthProvider、AuthGate、LoginPage、RegisterPage、WorkspaceShell。
3. 保留现有页面文件，但从主路由移除旧 InfiniteCanvas、classic create、admin、model-mapping 的直接入口。
4. 不要改数据库。
5. 完成后运行 npm run build，并列出仍需后续处理的旧引用。
```

### 10.2 第二条 Codex 任务：工作空间项目页

```txt
完成 Sprint 2：
1. 新建 TapNow 风格 WorkspacePage 与项目卡片组件。
2. 对接 /api/v2/projects 或新增 /api/v2/workspace/projects 聚合接口。
3. 新建项目时自动创建默认 flow 和 draft；如果 draft 表尚未存在，先按现有 flow 创建，下一阶段补 draft。
4. 点击项目进入 /projects/:projectId。
5. 运行 npm run build。
```

### 10.3 第三条 Codex 任务：flow_drafts 和远程保存

```txt
完成 Sprint 3：
1. 新增 flow_drafts migration。
2. 新增 GET/PUT /api/v2/flows/:flowId/draft。
3. 新增 FlowProjectPage、useRemoteFlowProject、useRemoteFlowAutosave。
4. 移除 FlowCanvasPage 中 localStorage/IndexedDB 作为权威持久化的逻辑。
5. 保存 nodes/edges/viewport 到服务端。
6. 运行 db migration、npm run build、npm test。
```

### 10.4 第四条 Codex 任务：素材库云端化

```txt
完成 Sprint 4：
1. 新增 asset_folders、asset_folder_items migration。
2. 增加 GET /api/v2/assets 列表和 metadata/folder 接口。
3. 重构素材库页面为服务端素材库。
4. 上传走 presigned-upload + complete-upload。
5. 画布节点保存 assetId，不保存 base64/blob 作为权威字段。
6. 运行 npm run build、npm test。
```

### 10.5 第五条 Codex 任务：计费闭环

```txt
完成 Sprint 5：
1. 增加兑换码、支付、model_pricing migration。
2. 补 billing redeem/payment/pricing 接口。
3. workflow run 创建前 reserve，worker 成功 settle，失败 refund。
4. 重构 BillingCenterPage 到 /api/v2/billing。
5. 增加幂等测试。
6. 运行 npm run build、npm test。
```

---

## 11. 风险清单

### 11.1 最大技术风险

1. **画布状态结构复杂**  
   在替换 autosave 前，必须先明确 FlowCanvas 当前 store 的 nodes/edges/viewport 来源，避免双写导致状态错乱。

2. **素材 URL 生命周期**  
   签名 URL 会过期，不能把签名 URL 当作长期数据。长期只保存 `assetId`。

3. **扣费幂等**  
   AI 供应商回调、worker retry、网络重试都可能导致重复扣费。必须使用 idempotency key。

4. **RLS 和 tenant context**  
   新表必须加 tenant_id、索引和 RLS policy，否则多租户隔离会出问题。

5. **删除旧代码时机**  
   先从路由下线，确认 build 和新流程稳定后再删除文件。

### 11.2 产品风险

1. **用户已有本地数据迁移**  
   如果已有用户在 localStorage/IndexedDB 有作品，可能需要一次性导入工具。第一版可以提供“导入旧本地画布”按钮。

2. **余额单位变化**  
   如果旧系统叫 points，新系统内部叫 cents，需要统一展示文案为“点数”，避免用户困惑。

3. **素材删除引用**  
   被项目画布引用的素材不能直接硬删除，至少要软删除或提示影响。

---

## 12. Definition of Done

每个 Sprint 完成必须满足：

```txt
1. 功能可从 UI 完整跑通。
2. npm run build 通过。
3. 相关后端测试或至少核心 service 单测通过。
4. 新增数据库表有 RLS、索引、tenant_id。
5. 新增 API 使用 requireAuth 和权限检查。
6. 没有新增浏览器本地缓存作为权威数据源。
7. 画布、素材、账单变更都有错误提示。
8. 代码中没有把 secret、API key、支付 key 暴露到前端。
9. 提交说明列出修改文件、验证命令、已知风险。
```

---

## 13. 最终验收场景

### 场景 1：新用户从注册到创作

```txt
注册
-> 登录
-> 进入 /workspace
-> 新建项目
-> 进入 /projects/:projectId
-> 上传一张图片
-> 图片节点出现在画布
-> 自动保存
-> 刷新页面
-> 图片节点仍在
-> /assets 能看到这张图片
```

### 场景 2：生成扣费

```txt
用户余额 100 点
-> 创建生成节点
-> 发起生成，预估 20 点
-> 余额显示 100，冻结 20
-> 生成成功，实际 18 点
-> 余额显示 82，冻结 0
-> /billing 有 reserve 和 settle 流水
-> /assets 有生成结果
-> 画布节点引用生成结果 assetId
```

### 场景 3：失败退款

```txt
用户余额 100 点
-> 发起生成，冻结 20
-> worker 失败
-> 冻结释放
-> 余额仍为 100
-> /billing 有 reserve 和 refund 流水
-> 画布节点显示失败原因
```

### 场景 4：多设备同步

```txt
设备 A 登录
-> 新建项目并添加节点
-> 等待已保存
-> 设备 B 登录同账号
-> 打开同项目
-> 能看到相同节点和素材
```

### 场景 5：tenant 隔离

```txt
用户 A 创建项目和素材
用户 B 属于不同 tenant
-> 用户 B 不能看到用户 A 的项目、素材、账单
-> 直接访问 API 返回 404 或 403
```

---

## 14. 建议 PR 拆分

```txt
PR 1: app-router-auth-shell
PR 2: workspace-projects
PR 3: flow-drafts-remote-autosave
PR 4: asset-library-server-side
PR 5: canvas-asset-id-migration
PR 6: billing-redeem-pricing
PR 7: workflow-billing-reserve-settle-refund
PR 8: cleanup-legacy-ui
PR 9: docs-and-agent-instructions
```

每个 PR 都应该小于一个大功能，不要把路由、素材、计费一次性混在一起改。

---

## 15. 给 Codex 的总目标提示

```txt
你要把这个项目从“旧经典画布 + Flow 画布 + 多套后台页面混合”的状态，改造成“一套登录后的 AI Flow 工作台”。

保留并强化：
- 用户登录
- 工作空间
- 项目列表
- Flow 画布
- 素材库
- 计费扣费

下线或删除：
- 旧 InfiniteCanvas 作为主入口
- /create/classic
- legacy account/billing API 前端调用
- IndexedDB/localStorage 作为画布和素材的权威存储

严格要求：
- 所有业务数据走 /api/v2
- 所有项目/素材/账单数据带 tenant 隔离
- 画布 draft 存服务端
- 文件进 assets 和对象存储
- 扣费在后端和 worker 中完成
```
