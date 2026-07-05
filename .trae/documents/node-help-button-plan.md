# 展陈节点帮助按钮 + API 设置帮助文档管理

## Context

展陈工具分类下的 19 个节点功能复杂、控件众多，用户缺少每个控件用法的就地说明。本次改动给每个展陈节点的标题栏左侧名称旁添加一个 `?` 帮助按钮，点击后弹出该节点的 Markdown 帮助文档（解释每个控件的作用与用法）。同时在 API 设置弹窗中新增"节点帮助文档"管理模块，让管理员可以在线编辑每个节点的帮助内容，无需改代码即可更新。

存储与渲染均独立于现有 settings.json：帮助内容存放在 `data/node_helps.json`，通过新的 `/api/node-help` 路由读写；前端用简易 Markdown 渲染器避免引入新依赖。

范围：仅 `nodeRegistry.ts` 中 `category === 'exhibition'` 的 19 个节点（含 import-cam-project）。其余分类本次不涉及。

## 实现步骤

### 1. 后端：新增 node_helps.json 数据文件与路由

**修改 `backend/src/config.js`**：在数据文件区新增一行
```js
NODE_HELP_FILE: path.join(DATA_ROOT, 'data', 'node_helps.json'),
```

**新建 `backend/src/routes/nodeHelp.js`**（CommonJS，沿用 settings.js 中 `loadJson/saveJson` 模式）：
- `GET /api/node-help` → 返回 `{ success, data: { [nodeType]: markdownString } }`，无需 admin
- `GET /api/node-help/:nodeType` → 返回 `{ success, data: { content } }`，无需 admin
- `PUT /api/node-help/:nodeType` → body `{ content }`，requireAdmin，写入单个
- `DELETE /api/node-help/:nodeType` → requireAdmin，删除单个
- `POST /api/node-help/bulk` → body `{ helps: { [nodeType]: string } }`，requireAdmin，整体替换
- `GET /api/node-help/export` → 导出全部 JSON，无需 admin
- `POST /api/node-help/import` → body `{ helps }` 或 `{ schema, version, helps }`，requireAdmin，merge 或 replace

校验：`nodeType` 必须 in 展陈节点白名单（从 `nodeRegistry.ts` 同步一份常量数组），`content` 必须是字符串且长度 ≤ 100KB。

**修改 `backend/src/server.js`**：在路由注册区加
```js
const nodeHelpRouter = require('./routes/nodeHelp');
app.use('/api/node-help', nodeHelpRouter);
```

### 2. 前端 services：新增 nodeHelp API 封装

**修改 `src/services/api.ts`**，仿 `getRawSettings/updateSettings` 模式新增：
```ts
export async function getNodeHelps(): Promise<Record<string, string>>
export async function getNodeHelp(nodeType: string): Promise<string>
export async function saveNodeHelp(nodeType: string, content: string): Promise<void>
export async function deleteNodeHelp(nodeType: string): Promise<void>
export async function exportNodeHelps(): Promise<Record<string, string>>
export async function importNodeHelps(helps: Record<string, string>, mode?: 'merge' | 'replace'): Promise<void>
```

### 3. 前端：内置默认帮助文本

**新建 `src/config/nodeHelpDefaults.ts`**：导出 `DEFAULT_NODE_HELPS: Record<string, string>`，为 19 个展陈节点各写一段 Markdown 默认帮助。结构参考：
```md
# 展陈图生图

> 结构示意图 / 表现效果图 / 工艺版式

## 输入接口
- **平面布局图**：与空间结构示意图互斥...
- **空间结构示意图**：保留结构、动线、分区...

## 主要控件
- **图像数量**：1~4 张...
- **优先级排序**：...

## 输出
- 图像端口：最终展陈图生图结果
- 文本端口：最终提示词文本
```

默认内容来源：nodeRegistry description + 各节点 utils 中的常量注释（如 `ExhibitionImg2ImgNode.tsx` 顶部 FIELD/BUTTON 定义附近的语义）。每个节点默认帮助 200~500 字。

### 4. 前端：简易 Markdown 渲染器

**新建 `src/utils/simpleMarkdown.tsx`**：纯函数组件 `renderSimpleMarkdown(md: string): ReactNode[]`，支持：
- `#`/`##`/`###` 标题
- `- `/`* ` 无序列表
- `1. ` 有序列表
- `**bold**`、`` `code` ``
- ``` ``` 代码块
- `> ` 引用
- 空行分段、单换行转 `<br>`
- 转义 HTML，防 XSS

不引入第三方 markdown 库（项目当前未安装 markdown-it/marked/react-markdown，保持依赖精简）。

### 5. 前端：NodeHelpButton + NodeHelpModal 组件

**新建 `src/components/nodes/NodeHelpModal.tsx`**：
- props: `{ open, onClose, nodeType, label }`
- 打开时调 `getNodeHelp(nodeType)`，失败/空 fallback 到 `DEFAULT_NODE_HELPS[nodeType]`
- 顶部标题栏：节点名 + 关闭按钮
- 内容区：`renderSimpleMarkdown(content)`，深色/浅色样式适配（参考 `ExhibitionImg2ImgNode` 的 `bg-slate-950/white/15` 风格）
- 底部：「在 API 设置中编辑」按钮（如检测到管理员，否则隐藏）—— 可选，初版可不加

**新建 `src/components/nodes/NodeHelpButton.tsx`**：
- props: `{ nodeType: string, className?: string, title?: string }`
- 渲染一个 `<button>` 内含 lucide `HelpCircle` 图标（size 14），点击 `e.stopPropagation()` 后 setOpen(true)
- 用 `createPortal` 渲染 `NodeHelpModal` 到 `document.body`（仿 `ExhibitionImg2ImgNode` 中 `createPortal` 用法）
- 样式：`nodrag nopan` 防止拖动节点，半透明 hover 高亮，与现有 `?` 风格一致
- 内部带 content 缓存（同一 nodeType 多次打开不重复请求）

### 6. 前端：在 19 个展陈节点 header 注入 NodeHelpButton

**注入策略**：每个节点文件在 header 标题块后、原右侧元素（busy Loader / status / 设置按钮）前插入 `<NodeHelpButton nodeType="..." />`。

主流 12 个节点（className `flex items-center gap-2 border-b border-white/10 px-3 py-2`）注入位置一致：标题 `<div className="min-w-0 flex-1">...</div>` 之后、`{busy && <Loader2/>}` 之前。代表文件：
- [ExhibitionImg2ImgNode.tsx](file:///d:/works/windsurf/T8-penguin-canvas/src/components/nodes/ExhibitionImg2ImgNode.tsx) #L3014-L3023
- [ExhibitionStyleTransferNode.tsx](file:///d:/works/windsurf/T8-penguin-canvas/src/components/nodes/ExhibitionStyleTransferNode.tsx) #L638
- [ExhibitionRecolorNode.tsx](file:///d:/works/windsurf/T8-penguin-canvas/src/components/nodes/ExhibitionRecolorNode.tsx) #L1018
- [ExhibitionLightingHeatmapNode.tsx](file:///d:/works/windsurf/T8-penguin-canvas/src/components/nodes/ExhibitionLightingHeatmapNode.tsx) #L404
- [ExhibitionCreativeImageNode.tsx](file:///d:/works/windsurf/T8-penguin-canvas/src/components/nodes/ExhibitionCreativeImageNode.tsx) #L2069
- [ExhibitionPlanLayoutNode.tsx](file:///d:/works/windsurf/T8-penguin-canvas/src/components/nodes/ExhibitionPlanLayoutNode.tsx) #L764（含 ai-plan-layout）
- [UnitPanelDesignNode.tsx](file:///d:/works/windsurf/T8-penguin-canvas/src/components/nodes/UnitPanelDesignNode.tsx) #L610
- [SculptureReliefDesignNode.tsx](file:///d:/works/windsurf/T8-penguin-canvas/src/components/nodes/SculptureReliefDesignNode.tsx) #L521
- [WayfindingDesignNode.tsx](file:///d:/works/windsurf/T8-penguin-canvas/src/components/nodes/WayfindingDesignNode.tsx) #L501
- [ExhibitionSceneDesignNode.tsx](file:///d:/works/windsurf/T8-penguin-canvas/src/components/nodes/ExhibitionSceneDesignNode.tsx) #L587
- [ScienceExhibitDesignNode.tsx](file:///d:/works/windsurf/T8-penguin-canvas/src/components/nodes/ScienceExhibitDesignNode.tsx) #L682
- [ShowcaseInteriorDesignNode.tsx](file:///d:/works/windsurf/T8-penguin-canvas/src/components/nodes/ShowcaseInteriorDesignNode.tsx) #L984
- [ElevationPromptNode.tsx](file:///d:/works/windsurf/T8-penguin-canvas/src/components/nodes/ElevationPromptNode.tsx) #L633

5 个异构节点单独适配插入位置：
- [ImportCamProjectNode.tsx](file:///d:/works/windsurf/T8-penguin-canvas/src/components/nodes/ImportCamProjectNode.tsx) #L254（无 data 属性，nodeType 用 `import-cam-project`）
- [ExhibitionRenderToElevationNode.tsx](file:///d:/works/windsurf/T8-penguin-canvas/src/components/nodes/ExhibitionRenderToElevationNode.tsx) #L528（justify-between，插在标题 `<div className="min-w-0">` 后、status 徽章前）
- [ExhibitionTextImageLoopNode.tsx](file:///d:/works/windsurf/T8-penguin-canvas/src/components/nodes/ExhibitionTextImageLoopNode.tsx) #L625（inline style header，按钮也用 inline style）
- [ExhibitionOutlineSplitNode.tsx](file:///d:/works/windsurf/T8-penguin-canvas/src/components/nodes/ExhibitionOutlineSplitNode.tsx) #L489（t8-node-header，插在标题块后、busy/Brain 三元前）
- [CinemaAuditoriumDesignNode.tsx](file:///d:/works/windsurf/T8-penguin-canvas/src/components/nodes/CinemaAuditoriumDesignNode.tsx) #L1189（justify-between，插在内层 `<div className="flex items-center gap-2">` 后、busy 前）

每个文件需：
1. 顶部 import `NodeHelpButton`
2. 在 header 标题块后插入 `<NodeHelpButton nodeType="<type>" />`

### 7. 前端：ApiSettings 新增"节点帮助文档"管理区块

**修改 `src/components/ApiSettings.tsx`**：在"画布右键节点菜单"折叠区块后（约 #L3305）、"任务完成提示音"前，新增一个折叠区块 `nodeHelpOpen`。展开时显示：

- 顶部说明 + 「导出 JSON」「导入 JSON」「恢复全部默认」按钮
- 左侧节点列表：从 `NODE_REGISTRY.filter(n => n.category === 'exhibition' && !n.hidden)` 渲染，每项显示 label + 是否已自定义（绿色圆点）/ 默认（灰色）
- 右侧编辑区：
  - 节点名 + 当前状态徽章（自定义 / 默认）
  - 「预览/编辑」切换 tab
  - 编辑模式：`<textarea>` 直接编辑 Markdown，monospace 字体
  - 预览模式：`renderSimpleMarkdown(content)` 渲染
  - 底部按钮：「保存」（调 `saveNodeHelp`）、「重置为默认」（调 `deleteNodeHelp`，前端回退到 DEFAULT_NODE_HELPS）、「清空」（清空当前编辑内容但不保存）
- 新增 state：`nodeHelpOpen`, `nodeHelpMap`（全部节点的当前内容，初始化合并 DEFAULT + 后端覆盖）, `activeNodeHelpType`, `nodeHelpDraft`（当前编辑草稿）, `nodeHelpDirty`, `nodeHelpView`（'edit' | 'preview'）
- 在 modal `useEffect` 重置表单时同步初始化 nodeHelpMap（调 `getNodeHelps()`）
- 不接入 `getCurrentEditableSettings`（独立保存链路，点「保存」按钮即调 API）

样式沿用 `t8-api-settings-section`/`t8-api-settings-toggle`/`t8-api-settings-badge` 等现有类名，深色/浅色/像素风三种风格自动适配。

### 8. 类型定义（可选）

**修改 `src/types/canvas.ts`**：如需强类型，新增 `export type NodeHelpMap = Record<string, string>;`。若 services/api.ts 内联类型即可省略。

## 关键复用点

- 后端 `loadJson/saveJson/genId/cleanId` 模式：参考 [settings.js](file:///d:/works/windsurf/T8-penguin-canvas/backend/src/routes/settings.js) #L659-L683
- 前端 `request<T>` 封装：[api.ts](file:///d:/works/windsurf/T8-penguin-canvas/src/services/api.ts) #L190
- 折叠区块模式：参考 ApiSettings 中 `nodeMenuOpen` 区块 [ApiSettings.tsx](file:///d:/works/windsurf/T8-penguin-canvas/src/components/ApiSettings.tsx) #L3243-L3305
- `createPortal` 弹窗模式：参考 `ExhibitionImg2ImgNode` 中 ColorMaterialPresetEditorModal 用法
- 展陈节点白名单：从 [nodeRegistry.ts](file:///d:/works/windsurf/T8-penguin-canvas/src/config/nodeRegistry.ts) #L101-L119 提取 19 个 type

## 验证

1. `npm run type-check` 通过
2. `npm run dev:backend` 启动后端，`curl http://127.0.0.1:18766/api/status` 冒烟
3. `curl http://127.0.0.1:18766/api/node-help` 返回 `{ success: true, data: {} }`（首次空）
4. `npm run dev` 启动前端，浏览器打开 `http://127.0.0.1:11422`
5. 画布上添加任意展陈节点（如展陈图生图），确认标题栏左侧名称旁出现 `?` 按钮
6. 点击 `?`，确认弹出帮助弹窗，显示默认 Markdown 内容，关闭正常
7. 打开 API 设置（顶部齿轮），找到"节点帮助文档"区块，展开
8. 选一个节点，编辑 Markdown，点保存
9. 回到画布，重新点该节点的 `?`，确认显示更新后的内容
10. 点"重置为默认"，确认回退
11. 测试深色/浅色主题切换，弹窗与按钮均清晰可读
12. 测试像素风主题（如已启用），确认样式不破

## 不在本次范围

- 非展陈分类节点的帮助按钮（用户确认仅做展陈）
- 帮助内容的多语言（当前仅中文）
- 帮助内容的版本历史
- 节点内嵌行内帮助（hover tooltip 等）
