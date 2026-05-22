# T8-penguin-canvas · skill.md

> 项目能力 / 接口 / 文件用途速查手册。
> 版本：v1.2.0 ｜ 仓库：<https://github.com/T8mars/T8-penguin-canvas>

---

## 1. 项目定位

T8-penguin-canvas 是 PenguinPravite 画布功能的 **轻量化重构版**，定位为 **纯 Web 端 AI 创作画布工具**：

- 仅运行于浏览器（前端 Vite 5180 端口 + 后端 Node Express 18766 端口）。
- 严格剔除桌面端封装、CLI、登录系统、创意库等非画布能力。
- 25 个业务节点（含 upload）全部落地，覆盖文本 / 图像 / 视频 / 音频 / LLM / 工作流 / 工具 / 辅助 / 工具箱。
- 支持 **批量执行（拓扑顺序串行）**、**节点对齐辅助线（snap-to-grid + 智能吸附）**、**双主题（科技风 / 像素糖果风）**、**终端日志面板**。
- 支持 **打组（GroupBox）** —— 框选多节点后一键套色框容器，可拖拽联动成员、一键执行、换色改名（12 色调色板）。
- 支持 **右键画布空白区快速添加节点** —— 菜单列出 input + core 7 个高频节点（upload / text / image / video / seedance / audio / llm），点击后节点出现在鼠标点击位置。
- 支持 **框选 ≥2 节点后自动弹出操作菜单**（组执行 / 复制 / 快复制 / 删除 / 打组），无需右键。

---

## 2. 仓库结构

```
T8-penguin-canvas/
├── backend/                     # Node + Express 后端
│   └── src/
│       ├── server.js            # 入口，挂载 5 类路由
│       ├── config.js            # 端口/目录/上游 baseUrl
│       ├── utils/
│       │   └── whitePng.js      # 零依赖 PNG 编码器（GPT2 文生图占位白图）
│       └── routes/
│           ├── canvas.js        # 画布 CRUD（防空覆盖）
│           ├── settings.js      # 三套 API Key 持久化（脱敏 GET / 明文 raw）
│           ├── files.js         # 上传 / list / base64 转存
│           ├── imageOps.js      # sharp：resize/upscale/grid-crop/combine/remove-bg
│           └── proxy.js         # 上游代理：image/llm/video/audio/runninghub（全异步对齐主项目）
├── src/                         # 前端 React + TS
│   ├── App.tsx                  # 三栏布局 + 状态栏
│   ├── components/
│   │   ├── Canvas.tsx           # 画布主体（xyflow）+ 批量运行 + 对齐辅助
│   │   ├── CanvasToolbar.tsx    # 顶部浮动工具栏（运行/吸附/历史/复制/导入导出/模板/帮助/终端）
│   │   ├── TerminalPanel.tsx    # 底部抽屉式日志面板（双主题）
│   │   ├── CanvasManager.tsx    # 多画布管理列
│   │   ├── Sidebar.tsx          # 节点拖拽侧边栏
│   │   ├── ApiSettings.tsx      # 三套 Key 设置弹窗
│   │   └── nodes/               # 27 个节点组件文件
│   ├── stores/
│   │   ├── canvas.ts            # 画布列表 store
│   │   ├── apiKeys.ts           # 三套 Key store
│   │   ├── theme.ts             # 浅/深色 + 科技/像素双主题
│   │   ├── runBus.ts            # 运行总线（批量执行）
│   │   └── logs.ts              # 日志总线 logBus（对齐 gpt-image-2-web log()）
│   ├── hooks/
│   │   ├── useCanvasHistory.ts  # Undo/Redo 栈
│   │   └── useRunTrigger.ts     # 节点订阅运行总线
│   ├── services/
│   │   ├── api.ts               # 后端 REST 封装
│   │   ├── generation.ts        # 图像/视频/音频/LLM 生成调用封装
│   │   └── imageOps.ts          # /api/image/* 工具调用
│   ├── providers/               # 模型注册表（image/video/audio/llm）
│   ├── config/
│   │   ├── nodeRegistry.ts      # 24 节点元数据（label/icon/color）
│   │   └── canvasTemplates.ts   # 工作流模板预设
│   ├── utils/
│   │   └── topologicalSort.ts   # Kahn 拓扑排序（批量运行依赖序）
│   ├── types/canvas.ts          # 节点 / 画布 / Key 类型
│   └── styles/index.css         # Tailwind 入口
├── data/                        # 画布 JSON / 设置 JSON（gitignore）
├── input/  output/  thumbnails/ # 用户上传 / 生成产物 / 缩略（gitignore）
├── features.json                # 节点防丢失锁 + 接口快照
├── vite.config.ts               # 5180 端口 + /api → 18766 代理
├── package.json
└── tsconfig.json
```

---

## 3. 后端接口（http://127.0.0.1:18766）

### 3.1 健康检查

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/status` | 返回 `{ ok, service, version, port, time }` |

### 3.2 画布 CRUD（routes/canvas.js）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/canvas` | 画布列表 |
| POST | `/api/canvas` | 新建画布 `{ name? }` |
| GET | `/api/canvas/:id` | 画布数据 `{ nodes, edges, viewport }` |
| PUT | `/api/canvas/:id` | 保存画布数据，**拒绝空数据覆盖非空画布** |
| DELETE | `/api/canvas/:id` | 删除画布及数据文件 |
| PATCH | `/api/canvas/:id/name` | 重命名 `{ name }` |

> 数据文件位置：`data/canvas_list.json` + `data/canvas_<id>.json`。

### 3.3 设置（routes/settings.js）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/settings` | 三套 Key 设置（Key 字段被 `****xxxx` 脱敏） |
| GET | `/api/settings/raw` | 内部接口，明文（仅供 proxy.js 调用） |
| POST | `/api/settings` | 更新设置；`zhenzhenBaseUrl` / `llmBaseUrl` 强制为配置值 |

字段：`zhenzhenApiKey / rhApiKey / llmApiKey + 各自 baseUrl + preferences{ theme, language }`。

### 3.4 文件（routes/files.js）

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/files/upload` | multipart 上传到 `input/`，限 10MB |
| GET | `/api/files/list` | 列出 `output/` 中的 png/jpg/webp/gif/mp4/webm/mp3/wav |
| POST | `/api/files/upload-base64` | dataURL 转存到 `output/`（手绘画板 / 抽帧使用） |

静态托管：`/files/output`、`/files/input`、`/files/thumbnails`、`/output`、`/input`。

### 3.5 图像处理（routes/imageOps.js · sharp）

| 方法 | 路径 | body |
|---|---|---|
| POST | `/api/image/resize` | `{ imageUrl, width?, height?, fit? }` |
| POST | `/api/image/upscale` | `{ imageUrl, scale }`（1~8，lanczos3） |
| POST | `/api/image/grid-crop` | `{ imageUrl, rows, cols }`，返回 `urls[]` |
| POST | `/api/image/combine` | `{ imageUrls[], direction: 'horizontal' \| 'vertical' }`，等比缩放后拼接 |
| POST | `/api/image/remove-bg` | `{ imageUrl }`（**占位实现**，仅 PNG 化） |

输入支持本地 URL（`/files/output|input` / `/output|input`）、HTTP(S)、`data:image/...;base64,` 三种形态。

### 3.6 上游代理（routes/proxy.js）

> 隐藏 Key、自动注入 Key、产物自动转存到 `output/` 并返回本地 URL。

#### 图像（全异步 · 1:1 对齐 gpt-image-2-web）
| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/proxy/image` | 同步入口：内部提交异步任务并轮询至完成，返回本地图片 URL（兼容同步响应的上游） |
| POST | `/api/proxy/image/submit` | 提交异步任务，返回 `{ sync, taskId?, urls?, status, progress }` |
| GET  | `/api/proxy/image/status/:tid` | 轮询 `/v1/images/tasks/{tid}`，返回 `{ status, progress, urls? }` |

调用上游必加 `?async=true` 查询参数，GPT2 始终走 multipart `/v1/images/edits?async=true`（无参考图时插入 1024×1024 白图占位）；nano-banana 文生图 JSON `/v1/images/generations?async=true`、图生图 multipart `/v1/images/edits?async=true`。详见 §11 异步任务规范。

#### 同步：LLM
| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/proxy/llm` | 贞贞工坊 `/v1/chat/completions`，使用 **LLM 独立 Key** |

#### 异步：视频（全异步 · 1:1 对齐 gpt-image-2-web）
| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/proxy/video/submit` | 上游 `/v2/videos/generations`；**后端根据 `model` 名自动选择 Veo3.1 / Grok / Seedance 三种 payload 协议**，返回 `taskId` |
| GET | `/api/proxy/video/query?taskId` | 轮询；SUCCESS 时下载视频到本地，返回 `videoUrl` |

Grok 路径另依赖上游 `POST /v1/files`（multipart `file`）上传参考图拿 URL，后端在 [`uploadRefToZhenzhen`](file:///e:/PenguinPravite/T8-penguin-canvas/backend/src/routes/proxy.js) 内部完成，前端可传 base64 或 `/files/*` 本地 URL。详见 §11.6。

#### 异步：Suno 音频（v5.5 三模式）
| 方法 | 路径 | mode |
|---|---|---|
| POST | `/api/proxy/audio/submit` | `generate / cover / extend`，自动选 `mv` |
| GET | `/api/proxy/audio/query?clipIds` | 解析 `audio_url`，返回 `tracks[]` |

模型映射：`suno-v5.5 → chirp-fenix`、`v5 → chirp-v3-5`、`v4.5 → chirp-v4-5`、`v4 → chirp-v4`。

#### 异步：RunningHub
| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/proxy/runninghub/submit` | `/task/openapi/ai-app/run`，返回 `taskId` |
| GET | `/api/proxy/runninghub/query?taskId` | 轮询；code `0/804/813/805` → `SUCCESS/RUNNING/QUEUED/FAILED`，转存所有产物 |
| GET | `/api/proxy/runninghub/app-info?webappId` | 调 `/api/webapp/apiCallDemo`，返回 `nodeInfoList` 等 |

---

## 4. 前端服务封装

### `src/services/api.ts`
- `checkBackendStatus()` / `listCanvases()` / `createCanvas(name?)`
- `getCanvasData(id)` / `saveCanvasData(id, data)` / `deleteCanvas(id)` / `renameCanvas(id, name)`
- `getSettings()` / `updateSettings(patch)`

### `src/services/generation.ts`
统一封装 image / video / audio / llm 的提交 + 轮询，向上层节点暴露 Promise。

### `src/services/imageOps.ts`
对 `/api/image/*` 的薄封装，供工具节点 `ResizeNode / UpscaleNode / GridCropNode / CombineNode / RemoveBgNode` 使用。

---

## 5. 节点清单（25 个）

| 分组 | 节点 type | 入口 | 可批量运行 |
|---|---|---|---|
| 核心 | text | TextNode | ✗ |
| 核心 | upload | UploadNode（图像/音频/视频自适应） | ✗ |
| 核心 | image | ImageNode（异步轮询，对齐 gpt-image-2-web） | ✓ |
| 核心 | video | VideoNode | ✓ |
| 核心 | seedance | VideoNode（model=seedance-2.0） | ✓ |
| 核心 | audio | AudioNode | ✓ |
| 核心 | llm | LLMNode | ✓ |
| 核心 | runninghub | RunningHubNode | ✓ |
| 核心 | rh-config | RhConfigNode | ✗ |
| 特殊 | multi-angle-3d / panorama-720 / penguin-portrait | PresetImageNode | ✓ |
| 特殊 | portrait-metadata | PortraitMetadataNode | ✗ |
| 特殊 | storyboard-grid | StoryboardGridNode | ✗ |
| 工具 | drawing-board | DrawingBoardNode | ✗ |
| 工具 | browser | BrowserNode | ✗ |
| 工具 | image-compare | ImageCompareNode | ✗ |
| 工具 | frame-extractor | FrameExtractorNode | ✓ |
| 工具 | resize / upscale / grid-crop / combine / remove-bg | ImageOpFrame | ✓ |
| 辅助 | edit | ImageNode（mode=edit） | ✓ |
| 辅助 | idea / bp / relay / video-output | IdeaNode / BpNode / RelayNode / VideoOutputNode | ✗ |
| 工具箱 | cinematic / video-motion | ToolboxParamNode | ✗ |

> 「可批量运行」= 已通过 `useRunTrigger(nodeId, runFn)` 接入运行总线。

---

## 6. 运行总线（批量执行）

### `src/stores/runBus.ts` · zustand
```
state: { currentRunId, lastDone, mode, batchTotal, batchDoneCount }
actions: triggerRun(id, mode='single'|'batch'), markDone(id, ok, error?),
         cancelAll(), setBatchProgress(total, done)
```

### `src/hooks/useRunTrigger.ts`
节点端订阅 `currentRunId`，命中自身则 `await runFn()` → `markDone(id, true)`。
- 用 `runFnRef = useRef(runFn)` 保持闭包最新。
- `startedRef` 防 React StrictMode 二次挂载重入。
- 异常被节点内部 `try/catch` 消化（节点自管 `status='error'`），运行总线只关心「已完成」。

### `src/utils/topologicalSort.ts`
Kahn 算法：仅取可执行节点子图的入度，排序失败时按原始顺序补全（环兼容）。

### `Canvas.tsx · handleRunAll`
1. 拓扑排序得 `order: string[]`
2. `setBatchProgress(order.length, 0)` → 串行 `await new Promise(...)`，每个节点 5 分钟安全超时
3. 监听 `lastDone.id === order[i]` 推进
4. `cancelRunRef` 控制中断
5. 工具栏 Play/Square 按钮 + `done/total` 进度徽标

---

## 7. 节点对齐辅助

### snap-to-grid
ReactFlow 内置：`snapToGrid={snapEnabled} snapGrid={[20, 20]}`。

### 智能对齐辅助线（onNodeDrag）
对每对「拖拽节点 6 边 × 其他节点 6 边」做差，差 < `ALIGN_THRESHOLD=6px`：
- 记入 `guides.vertical / horizontal`
- 取最优差值做弱吸附（`setNodes` 直接调整位置）
- 通过 `<ViewportPortal>` + SVG 在世界坐标系绘制橙色虚线（`vectorEffect="non-scaling-stroke"`）
- `onNodeDragStop` 清空辅助线

工具栏 **磁铁 Magnet 按钮** 开关吸附与辅助线。

---

## 8. 画布交互

| 能力 | 实现 | 文件 |
|---|---|---|
| Undo/Redo | 节流 250ms 入栈 + 拖拽中暂停 | `useCanvasHistory.ts` |
| 复制/粘贴/快复制/删除 | 仅复制选中节点 + 子图边，paste 偏移 (40,40) | `Canvas.tsx · handleCopy/Paste/Duplicate/DeleteSelected` |
| 导入/导出 JSON | `{ version, exportedAt, nodes, edges }` | `Canvas.tsx · handleExport/handleImportFile` |
| 工作流模板 | 预设节点+连线，一键插入 | `config/canvasTemplates.ts` |
| 自动保存 | 800ms 防抖；防空数据覆盖（前端 + 后端双层） | `Canvas.tsx` 自动保存 effect |
| 后端连通检测 | 每 15s `GET /api/status` | `App.tsx` |

### 全局快捷键
`Ctrl+Z` / `Ctrl+Shift+Z` / `Ctrl+Y` / `Ctrl+C` / `Ctrl+V` / `Ctrl+Shift+V` / `Ctrl+D` / `Ctrl+A` / `Delete` / `Backspace`。

- **`Ctrl+V`** 普通粘贴（仅复制选中节点 + 其内部边，偏移 40,40）
- **`Ctrl+Shift+V`** 连边粘贴（额外保留原节点与画布邻居的**外部入边 / 出边**。例：原有 文本→图像，复制图像节点 → Ctrl+Shift+V 后新图像节点的入口也连上原文本节点的出口）

### 拖线连接
- 拖动节点 Handle 拉到另一节点 Handle / 节点体 / 连线上 → ReactFlow 默认处理（连接成功或被 `isValidConnection` 拒绝）
- 拖动释放到**空白画布**（pane / background）→ 弹出候选节点菜单，选中后在拖落位置创建并自动连线
- 判断逻辑：`event.target.closest('.react-flow__handle | __node | __edge')` 任一命中则不弹菜单

### 鼠标交互

| 操作 | 效果 |
|---|---|
| 左键拖动空白 | 平移画布（ReactFlow 默认） |
| **Ctrl + 左键拖动** | 框选多个节点（`selectionKeyCode=['Control','Meta']`，Mac 下 ⌘ 同效） |
| **Ctrl + 点击节点** | 叠加多选（`multiSelectionKeyCode`） |
| **框选松手（选中 ≥2）** | 自动在鼠标位置弹出操作菜单（组执行 / 复制 / 快复制 / 删除 / **打组(N)**），无需右键 |
| **右键点击节点 / 选区** | 同上菜单（选中 ≥2 时额外出现「打组(N)」）|
| **右键画布空白** | **弹出「快速添加节点」菜单**，含 7 个高频节点：upload / text / image / video / seedance / audio / llm；点击后节点出现在鼠标点击位置（左上角对准鼠标）|
| 滚轮 / 触控板 | 缩放画布 |
| 空格 + 拖动 | 平移画布（备选） |

**节点添加默认定位策略**（[`addNode`](file:///e:/PenguinPravite/T8-penguin-canvas/src/components/Canvas.tsx) 双分支）：
- **左侧 Sidebar 点击添加** → 节点 **视觉中心对准当前视口中心**（`screenToFlowPosition` 将画布容器 `getBoundingClientRect()` 中心 → 画布坐标，避开侧栏）+ 小范围抖动避免重叠。
- **右键菜单点击添加** → 节点 **左上角贴鼠标点击位置**（鼠标自然落在 header 上，跳过中心偏移）。

**右键菜单 / 选区菜单定位**：节点对 / 画布菜单容器均用 `position: fixed`（直接相对视口，`clientX/Y` 一一对应），不受 Canvas 根容器 `<div className="flex-1 relative">` 的侧边 sidebar 偏移影响；边界保护用 `Math.min(x, innerWidth - 220)` 避免出屏。

**组执行**实现：[`Canvas.handleRunGroup(ids)`](file:///e:/PenguinPravite/T8-penguin-canvas/src/components/Canvas.tsx) 调 [`runNodesByOrder(subNodes, subEdges)`](file:///e:/PenguinPravite/T8-penguin-canvas/src/components/Canvas.tsx) 通用引擎 —— 仅保留所选子集**内部**的边作为依赖，拓扑排序后串行调 `runBus.triggerRun(id, 'batch')`，与全量批量运行共享 `isRunning` 状态、`batchTotal/Done` 进度、停止机制。设计思路对齐 [`PenguinPravite/components/PebblingCanvas/index.tsx`](file:///e:/PenguinPravite/components/PebblingCanvas/index.tsx) 中 `executeGroup` 的“selection 临时组 + 可执行节点顺序执行”模式。

**框选自动弹菜单**实现：`onSelectionChange` 同步最新选中 ids 到 `lastSelectedIdsRef` 避免 React state 异步滞后；`onSelectionEnd(e)` 中读取 ref 赋值 `setContextMenu({ x: e.clientX, y: e.clientY, ids })`。仅 `ids.length ≥ 2` 才弹（遵循[框选多节点自动弹出列表按钮触发条件](file:///e:/PenguinPravite/T8-penguin-canvas/skill.md)）。

---

## 9. 三套 API Key

| Key | 默认 BaseUrl | 是否固定 | 影响节点 |
|---|---|---|---|
| `zhenzhenApiKey` | `https://ai.t8star.org` | ✓ | image / video / audio |
| `runninghubApiKey` | `https://www.runninghub.cn` | ✗（仅 Key） | runninghub / rh-config |
| `llmApiKey` | `https://ai.t8star.org` | ✓ | llm / vision（**额度独立**） |

后端 `routes/settings.js` 在保存时强制将 `zhenzhenBaseUrl / llmBaseUrl` 还原为配置常量，防止前端篡改。

---

## 10. 启动 / 构建

```powershell
# 安装
npm install
cd backend; npm install; cd ..

# 开发（前端 5180 + 后端 18766，concurrently 并发）
npm run dev

# 类型检查 / 构建
npm run type-check
npm run build
```

或 Windows 双击 `start-dev.bat`。

---

## 11. 异步任务对齐外部参考项目规范（重要·以图像节点改造为参考样板）

> 本节记录的是 **通用规范**，适用于后续 **任何节点** 对齐外部参考项目（gpt-image-2-web / suno-web / runninghub-web 等）的改造。
> **字段名、路径、查询参数、枚举值并非固定**，每次都以当次参考项目的源码为准。

### 11.1 三原则

1. **参照源于参考项目的运行时代码**：优先读 `index.html` / `main.js` 中的 `fetch(...)` 调用点，而不是口头描述或官方文档。
2. **字段严格原样复制**：包括大小写（`aspectRatio` vs `aspect_ratio`）、枚举值大小写（`1k` vs `1K`）、是否传空串、是否增加 `?async=true` 查询参数、multipart vs JSON。
3. **反向验证**：提交后上游后台必须能看到 **异步任务**，而不是只看到同步请求；否则表示代理未走对应路径。

### 11.2 后端处理范式

上游调用集中抽取为 **单一 helper**（主项目例：[`callImageUpstreamAsync`](file:///e:/PenguinPravite/T8-penguin-canvas/backend/src/routes/proxy.js)），同步入口（`/image`）与异步入口（`/image/submit`）**必须复用同一 helper**，避免双实现漂移。

```
request → callXUpstreamAsync(...) → fetch(`?async=true`) → normalize →
  - kind=='sync'  → 转存产物 → 返回 urls
  - kind=='async' → 返回 taskId（/image/submit）或 pollXTask(taskId) → urls（/image）
```

轮询路径（图像示例）：`GET {baseUrl}/v1/images/tasks/{taskId}`。响应结构可能是多层嵌套（`data.data.data[0].url`），要同时兼容 `data.data[0]` 与 `data.data.data[0]` 两种布局，详见 [proxy.js#image/status](file:///e:/PenguinPravite/T8-penguin-canvas/backend/src/routes/proxy.js)。

状态字段同样不固定，要同时识别 `SUCCESS / completed / done / success`、与失败类 `failure / failed / error`，**全部转小写后判断**。

### 11.3 前端节点执行范式

```ts
// 1) 提交
const submit = await submitXAsync({ ... });
// 2) 同步完成分支
if (submit.sync && submit.urls?.length) { update(success); return; }
// 3) 异步轮询分支
for (let i = 0; i < MAX; i++) {
  await sleep(INTERVAL);
  const q = await queryXStatus(submit.taskId!);
  update({ progress: q.progress });
  const st = String(q.status).toLowerCase();
  if (['completed','success','done'].includes(st)) { update(success(q.urls)); return; }
  if (['failed','failure','error'].includes(st))   throw new Error(q.error);
}
throw new Error('超时');
```

默认参数：`MAX=60`、`INTERVAL=2000ms`（与主项目一致）。各节点可根据任务平均耗时调整，但无特殊原因不要脱离这个量级。

### 11.4 特殊补丁（为什么需要白图）

某些上游端点（如 GPT2 的 `/v1/images/edits`）**必须传 `image` 字段**。主项目代码中文生图场景会以 canvas 制造 1024×1024 白图占位（`index.html` line 2861）。Node 端无 canvas，改以 [whitePng.js](file:///e:/PenguinPravite/T8-penguin-canvas/backend/src/utils/whitePng.js) 零依赖手写 PNG（zlib + CRC32 + IHDR/IDAT/IEND）生成，并缓存。其他节点遇到类似“上游要求字段但场景上没有”的问题时，**优先选择补默认体以保持一致**，不要反向修改分发逻辑。

### 11.5 代码定位索引（主项目 gpt-image-2-web）

| 关键点 | 文件·行号 |
|---|---|
| GPT2 全量参数 + 白图 + `?async=true` | `index.html` ~ line 2840-2883 |
| GPT_SIZE_MAP 完整表（13×3） | `index.html` line 2173 |
| nano-banana 文生图 JSON | `index.html` ~ line 2998-3008 |
| pollTask 轮询逻辑及状态字段调和 | `index.html` ~ line 4866-4908 |
| Veo3.1 `runVeo3` / `pollVeo3` | `index.html` line 3372 / 3422 |
| Grok Video `runGrok3` / `pollGrok3` | `index.html` line 3863 / 3917 |
| `uploadFileToAPI`（Grok 参考图上传） | `index.html` line 3104 |
| veo_model 13 子模型下拉 | `index.html` line 1350 |
| gk_ratio / gk_duration / gk_resolution | `index.html` line 1410-1414 |

后续改造 audio / sora 等节点时同样到参考项目 `index.html` 用 `grep_code` 搜“`/suno/generate`”、“`runSora`” 以定位。

### 11.6 视频节点协议对齐实例（Veo3.1 / Grok Video）

> 此例为 **可复用样本**：“一个上游路径、两种完全不同的 payload 字段”怎么在同一路由中优雅剩余。后续 sora2 / fal 渠道接入可参照同样“分支-不破坏”结构。

#### 两个模型的 payload 字段对照表（字段名严格以主项目为准）

| 范畴 | Veo3.1 （`runVeo3`） | Grok Video （`runGrok3`） |
|---|---|---|
| 上游路径 | `POST /v2/videos/generations` | `POST /v2/videos/generations`（同） |
| 轮询路径 | `GET /v2/videos/generations/{tid}` | （同） |
| 模型子选 | 13 个（veo3 / veo3-fast / veo3.1 / veo3.1-pro / veo3.1-4k …） | `grok-video-3` |
| 比例字段 | `aspect_ratio`（8 选项仅中 16:9/9:16） | `ratio`（2:3 / 3:2 / 16:9 / 9:16 / 1:1） |
| 时长 | —不传— | `duration`（**数字秒**：6/10/15/30） |
| 分辨率 | —不传— | `resolution`（`480P` / `720P`，**大写 P**） |
| 提示词增强 | `enhance_prompt:bool` | — |
| 上采样 | `enable_upsample:bool` | — |
| 随机种子 | `seed`（0 不传） | `seed`（0 不传） |
| 参考图上限 | 3 | 7 |
| 参考图格式 | `images: string[]`，**base64 dataURL** | `images: string[]`，**先 `POST /v1/files` 上传拿 URL** |

#### 后端处理分支（零破坏原则）

[`/api/proxy/video/submit`](file:///e:/PenguinPravite/T8-penguin-canvas/backend/src/routes/proxy.js) 内以 `model` 名包含 `'grok'` / `'veo'` 作为分支键。**未知模型（如 seedance）必须堆在 Veo 分支**，以保留历史画布中 “model=seedance-2.0 使用 aspect_ratio + images=base64” 的旧行为。这是“仅加不减”原则的典型设计。

Grok 参考图上传：
```js
// uploadRefToZhenzhen(): 接受 base64 dataURL 或 /files/* 本地 URL
// 内部 fetch 转 Buffer → multipart fd.append('file', blob, ...) → POST /v1/files → 取 j.url
```
前端不需要为 Grok 转 base64，直接传上游可访问的 URL 或本地 `/files/*` 即可。

#### 前端节点设计要点

- [`VIDEO_MODELS`](file:///e:/PenguinPravite/T8-penguin-canvas/src/providers/models.ts) 中 **每个项携带 `kind: 'veo' | 'grok' | 'seedance'`**，以该枚举控制 UI 列表（是否展示 duration / resolution / enhance/upsample）。
- [`VideoNode`](file:///e:/PenguinPravite/T8-penguin-canvas/src/components/nodes/VideoNode.tsx) 提交时按 `modelDef.kind` **选不同字段名**（`aspect_ratio` vs `ratio`），而不是走同一份字段让后端重映射。
- 参考图预处理：`kind === 'grok'` 直接传 URL 列表；其他 kind 调 `urlToBase64()`。
- 切主模型时调 `switchMainModel()` **重置** ratio/duration/resolution 为该 kind 默认值，避免跨模型参数遗留（如从 grok 切到 veo 还带着 `2:3`）。
- 旧画布兼容：接受 `model='veo-3.1'`/`'grok-video'` 这些旧值时 `find` 不到会退回 `VIDEO_MODELS[0]`，不报错。

### 11.7 FAL 渠道接入规范（后续 FAL 模型接入的唯一参考）

> **本节是 FAL 渠道的唯一接入规范**。任何后续 FAL 模型（无论 GPT FAL / NanoBanana FAL / Flux FAL / SDXL FAL 等）都须严格遵遵本节一部分 “协议核心” 与二部分 “零破坏三层架构”。三部分 “现有实例” 为代码参考，四部分 “接入新 FAL 子模型的 N 步法” 为可执行样板。
>
> 权威依据：[`gpt-image-2-web/SKILL.md` §FAL模型渠道接入规范](file:///E:/PenguinPravite/gpt-image-2-web/SKILL.md)。
> 运行时代码：[`gpt-image-2-web/index.html`](file:///E:/PenguinPravite/gpt-image-2-web/index.html) 中 `runGPTFal` / `runNanoFal`。
>
> **零破坏越界：**只允许修改 FAL 相关逻辑。`/v1/images/*` 路径上的 GPT2 / nano-banana-2 / nano-banana-pro 代码、参数、调用流程**均不得变更**。

#### 一、协议核心（所有 FAL 模型通用，不得偏离）

| 要素 | 取值 | 备注 |
|---|---|---|
| URL 前缀 | `${ZHENZHEN_BASE_URL}/fal/${endpoint}` | 贞贞工坊统一代理 `https://queue.fal.run`；**严禁**直调公网 fal.run |
| 认证 | `Authorization: Bearer ${zhenzhenApiKey}` | **重用贞贞工坊 Key**，不引入独立 FAL Key |
| Content-Type | `application/json` | submit / query 都是 JSON |
| 同步返回 | `result.images[]` 直接拿 URL（部分上游在 `sync_mode=true` 时会同步返） | 后端需 `saveRemoteImage()` 转存 |
| 异步返回 | `{ request_id, response_url }` → 轮询 | response_url 需域名修复 |
| **response_url 修复** | `queue.fal.run` → `${baseUrl}/fal` | 后端 `fixFalResponseUrl()` 在 submit 时**一次性**完成，query 不依赖前端 |
| 轮询接口 | `GET ${responseUrl}` 或 `${baseUrl}/fal/${endpoint}/requests/${requestId}` | response_url 优先 |
| **HTTP 非 200 处理** | body `status === 'IN_QUEUE'` / `'IN_PROGRESS'` 视为 pending，**必须重试不能抛错** | 其他才是真错误 |
| 完成识别 | body `images[]` 非空 | 取 `images[].url` |
| 失败识别 | body `status === 'FAILED'` 或 `'CANCELLED'` | 拋 `Error(body.error 或 status)` |
| 自定义尺寸 | 宽高必须 **16 整数倍** | 后端 `snap16(v, 256, 3840)` 自动对齐 |
| 参考图 | 上传 `${baseUrl}/v1/files` 拿 URL（复用现有 `uploadRefToZhenzhen()`） | 部分模型可选 base64 dataURI |
| 轮询上限 | 前端 600 × 3s = 30min | 与视频节点一致量级 |

#### 二、零破坏三层架构

FAL 走**独立路由 + 独立服务 + 独立 UI 面板**，**不**与原 `/v1/images/*` 协议合街。

```
模型注册（src/providers/models.ts）
  ├ FAL_REGISTRY[apiModel] = { endpoint, editEndpoint?, paramKind, maxRefs }
  └ isFalModel(apiModel)  → ImageNode 入口统一判断
         ↓
ReactFlow 节点（src/components/nodes/ImageNode.tsx）
  ├ isFal && falDef ：渲染 FAL 专属面板（蓝色边框）
  ├ FAL 专属 state 字段名（falXxx / nbXxx）与原 aspectRatio/sizeLevel **完全隔离**
  └ handleGenerate 内 if (isFal) 分支 → submitImageFal + 内置轮询
         ↓
服务层（src/services/generation.ts）
  ├ submitImageFal(req: FalSubmitRequest) → FalSubmitResult
  └ queryImageFal({ responseUrl, endpoint, requestId }) → FalQueryResult
         ↓
后端独立路由（backend/src/routes/proxy.js）
  ├ POST /api/proxy/image/fal/submit —— 仅服务 FAL
  ├ GET  /api/proxy/image/fal/query  —— 仅服务 FAL
  ├ snap16() / fixFalResponseUrl() / FAL_REGISTRY 同名与前端一致
  └ 同步拿到 images[] 时立即 saveRemoteImage 转存
```

**严禁在 `/api/proxy/image/submit` 内分流 fal**——FAL 参数集与原协议完全不同，混入会造成双路径同时漂移。

#### 三、现有实例（gpt-image-2-fal / nano-banana-pro-fal / nano-banana-2-fal镜像）

##### 3.1 payload 字段对照（字段名严格以主项目 `runGPTFal` / `runNanoFal` 为准）

| 范畴 | gpt-image-2-fal（paramKind=`gpt-fal`） | nano-banana-pro-fal（paramKind=`nbpro-fal`） |
|---|---|---|
| endpoint | `openai/gpt-image-2`（gen） / `openai/gpt-image-2/edit`（edit） | `fal-ai/nano-banana-pro/edit`（只有 edit） |
| 模式 | `mode: 'edit' \| 'gen'`（有参考图默认 edit） | 仅 edit |
| 尺寸 | `image_size: 'auto' \| 'square_hd' \| 'square' \| 'portrait_4_3' \| 'portrait_16_9' \| 'landscape_4_3' \| 'landscape_16_9'` 或 `{width,height}`（custom，16倍数） | `aspect_ratio: 'auto'/'21:9'/'16:9'/'3:2'/'4:3'/'5:4'/'1:1'/'4:5'/'3:4'/'2:3'/'9:16'` + `resolution: '1K' \| '2K' \| '4K'` |
| 张数 | `num_images: 1–4` | `num_images: 1–4` |
| 质量 | `quality: 'low' \| 'medium' \| 'high' \| 'auto'`（默认 medium） | — |
| 输出 | `output_format: 'png' \| 'jpeg' \| 'webp'` | `output_format`（同） |
| 同步开关 | `sync_mode: true` | — |
| 安全 | — | `safety_tolerance: '1'(严)..'6'(松)`，默认 `'4'` |
| 系统词 | — | `system_prompt`（可选） |
| 联网 | — | `enable_web_search: bool` |
| 种子 | — | `seed`（0 不传） |
| 参考图字段 | `image_urls: string[]`（仅 edit） | `image_urls: string[]`（必填） |
| 参考图上限 | **5** | **8** |
| 参考图编码 | URL（贞贞上传） | URL 或 base64 dataURI（`image_mode: 'image_url' \| 'base64'`） |

##### 3.1.1 镜像复用案例 —— `nano-banana-2-fal`

> 主项目 [`gpt-image-2-web/index.html · runGeminiFal`](file:///E:/PenguinPravite/gpt-image-2-web/index.html) 验证：`nano-banana-2-fal` 与 `nano-banana-pro-fal` **endpoint / paramKind / 参数集完全一致**，仅注册名不同。这种场景采用「**镜像注册**」策略，零增量后端/UI 代码：

```ts
// src/providers/models.ts —— 主模型 nano-banana-2 加一个子选项
{ value: 'nano-banana-2', label: 'nano-banana-2 (Flash)' },
{ value: 'nano-banana-2-fal', label: 'nano-banana-2-fal' },

// FAL_REGISTRY 完整镜像 nbpro-fal 的 endpoint/paramKind/maxRefs
'nano-banana-2-fal': {
  endpoint: 'fal-ai/nano-banana-pro/edit',
  editEndpoint: 'fal-ai/nano-banana-pro/edit',
  paramKind: 'nbpro-fal',   // **复用** 而非新建
  maxRefs: 8,
}
```

后端 `proxy.js` 的 `FAL_REGISTRY` **必须同步增加同一条**（前后端注册表是两份独立常量），但 `paramKind === 'nbpro-fal'` 分支**不动**——自动复用已有的 payload 拼装。

##### 3.2 关键代码位置

| 内容 | 位置 |
|---|---|
| 后端 FAL 路由双件 | [`backend/src/routes/proxy.js §/image/fal/submit + /image/fal/query`](file:///e:/PenguinPravite/T8-penguin-canvas/backend/src/routes/proxy.js) |
| 前端服务函数 | [`src/services/generation.ts §submitImageFal + queryImageFal`](file:///e:/PenguinPravite/T8-penguin-canvas/src/services/generation.ts) |
| FAL 注册表 + 枚举 | [`src/providers/models.ts §FAL_REGISTRY / FalParamKind / isFalModel / GPT_FAL_SIZES / NBPRO_FAL_RATIOS / NBPRO_FAL_RESOLUTIONS`](file:///e:/PenguinPravite/T8-penguin-canvas/src/providers/models.ts) |
| 节点 UI 两套面板 | [`src/components/nodes/ImageNode.tsx §isFal && falDef`](file:///e:/PenguinPravite/T8-penguin-canvas/src/components/nodes/ImageNode.tsx) |
| 主项目参考 | `gpt-image-2-web/index.html` `runGPTFal` line 2890–2973、`runNanoFal` line 3587–3679、`uploadFileToAPI` line 3104、`gf_panel` HTML line 1069–1080、`nano_fal_panel` HTML line 1154–1173 |

### 11.8 接入新 FAL 子模型的 N 步法（样板）

> 适用场景：后续需要接入**任何一个新 FAL 模型**（例如 `flux-pro-fal` / `seedream-fal` / `recraft-fal` / `imagen3-fal` 等）。以下是可执行清单，**严禁跳步骤**。

#### Step 0a：判断是否「镜像现有 paramKind」

> 若新模型与某已接入模型 endpoint + 参数集**完全一致**（如 `nano-banana-2-fal` ↔ `nano-banana-pro-fal`），**走镜像路径**：
>
> 1. `src/providers/models.ts · FAL_REGISTRY` 加一项，`paramKind` **复用现有**
> 2. `src/providers/models.ts · 主模型 apiModelOptions` 加一项子选项
> 3. `backend/src/routes/proxy.js · FAL_REGISTRY` **同步加同一项**（不加会报「未知的 FAL 模型」）
> 4. `features.json · modelRegistry.image` 加一项
> 5. 跳过 Step 3 / Step 4 / Step 5（已自动复用），直接做 Step 6 验收
>
> **特别注意**：`backend/package.json` 的 `dev` 是 `node src/server.js` 无 nodemon 热更，注册表改动须 `taskkill /PID <旧后端> /F` 后手动重启 `node src/server.js`。否则跑的是改前进程，提交会报「未知的 FAL 模型」。

#### Step 0：拿取官方参考

1. 查 [fal.ai 官方页](https://fal.ai/models) 拿到：
   - **endpoint slug**（如 `fal-ai/flux-pro/v1.1`，去掉 `https://queue.fal.run/` 前缀）
   - 是否有独立 `/edit` 变体
   - 请求 payload 完整字段表
   - 返回体中 `images[]` 位置是否主流（如 `images[0].url`）
2. 查主项目 `gpt-image-2-web/index.html` 是否已实现过（`grep_code` 搜 `"fal-ai/<模型名>"`）——优先拿主项目运行时代码作为准则。

#### Step 1：在注册表增加一项

```ts
// src/providers/models.ts
export const FAL_REGISTRY: Record<string, FalEndpointDef> = {
  'gpt-image-2-fal': { ... },
  'nano-banana-pro-fal': { ... },
  // 新增
  'flux-pro-fal': {
    endpoint: 'fal-ai/flux-pro/v1.1',
    editEndpoint: 'fal-ai/flux-pro/v1.1/redux',  // 如有独立 edit 才填
    paramKind: 'flux-fal',                        // 新 paramKind
    maxRefs: 4,                                   // 上限 = 官方限制
  },
};
```

同步增加枚举常量（参考 `GPT_FAL_SIZES` / `NBPRO_FAL_RATIOS`）——**独立名命名**不复用原有常量。

#### Step 2：在 nano-banana-pro / gpt-image-2 的 apiModelOptions 加子选项

```ts
// src/providers/models.ts —— 加到合适的主模型 TAB 下，**不新增 Tab**
IMAGE_MODELS【主模型】.apiModelOptions.push({
  value: 'flux-pro-fal',
  label: 'flux-pro-fal'  // 询问项目内部名。遵守设置：gpt-image-2 三档为 'gpt-image-2-all' / 'gpt-image-2' / 'gpt-image-2-fal'
});
```

#### Step 3：后端 `proxy.js` 加 paramKind 分支

在 [`POST /image/fal/submit`](file:///e:/PenguinPravite/T8-penguin-canvas/backend/src/routes/proxy.js) 内现有 `if (paramKind === 'gpt-fal')` / `else if (paramKind === 'nbpro-fal')` 后追加一个 `else if (paramKind === 'flux-fal') { ... }`。

```js
else if (paramKind === 'flux-fal') {
  payload = {
    prompt: prompt,
    num_images: clamp(n, 1, 4),
    image_size: size,
    enable_safety_checker: true,
    output_format: format,
    // 有参考图走 redux endpoint
    ...(image_urls.length ? { image_url: image_urls[0] } : {}),
  };
  if (image_urls.length) endpoint = def.editEndpoint;
}
```

**禁止**在其他 paramKind 分支上修改现有字段拼装 —— 零破坏。

#### Step 4：前端服务 `submitImageFal` 准许新字段

[`src/services/generation.ts §FalSubmitRequest`](file:///e:/PenguinPravite/T8-penguin-canvas/src/services/generation.ts) 加可选字段：

```ts
export interface FalSubmitRequest {
  // ... 已有
  // flux-fal 专属
  enable_safety_checker?: boolean;
  num_inference_steps?: number;
  guidance_scale?: number;
}
```

#### Step 5：节点 UI 加 paramKind 面板

[`src/components/nodes/ImageNode.tsx`](file:///e:/PenguinPravite/T8-penguin-canvas/src/components/nodes/ImageNode.tsx) 中原有：

```tsx
{isFal && falKind === 'gpt-fal' && (<GptFalPanel ... />)}
{isFal && falKind === 'nbpro-fal' && (<NbproFalPanel ... />)}
```

加一项：

```tsx
{isFal && falKind === 'flux-fal' && (
  // 独立 state字段名：fluxXxx，不与 falXxx/nbXxx 冲突
  // 参考图上限 falDef.maxRefs
  // 返回后走同一轮询 queryImageFal
)}
```

**绝对禁止**复用 falXxx 或 nbXxx 字段名，否则切 apiModel 时会携带上一个模型的设置（历史 bug。。）。

#### Step 6：验收清单（必跑）

1. `npx tsc --noEmit` 无错。
2. `node -e "require('./src/routes/proxy.js')"` 输出 OK。
3. 启动 `npm run dev`，选择新模型，提交后**上游后台能看到异步任务**（贞贞工坊控制台 · 任务类型=fal queue）。
4. 轮询能拿到 `images[]`，节点转存后显示本地 `/files/output/...` URL。
5. 双主题（科技 / 像素）的 FAL 面板都能正常点击 / 输入 / 复位。
6. 切回原标准模型（`gpt-image-2` / `nano-banana-2` / `nano-banana-pro`），原“比例 + 尺寸” UI 能正常显示，参数不串。

#### Step 7：同步 features.json

- 在 `modelRegistry.image[]` 添加一项： `{ id, label, provider: 'zhenzhen-fal', endpoint: '/fal/<endpoint>', paramKind, maxRefs }`
- 在 `phases` 添加一个新阶段项以锁住交付。

#### 常见陷阱清单

| 错误 | 表现 | 修法 |
|---|---|---|
| 用 `/v1/images/generations` 调 FAL | 400 “model not found” | 改走 `${baseUrl}/fal/${endpoint}` |
| 忘了修 response_url 域名 | 轮询走公网 fal.run 全安被拦 / 401 | submit 时 `fixFalResponseUrl()` 改为 `${baseUrl}/fal` |
| HTTP 200 外直接拋错 | 节点“任务取消”，但实际上游还在开始排队 | body `IN_QUEUE/IN_PROGRESS` 视为进行中重试 |
| 自定义尺寸被上游拒 | 400 “width must be multiple of 16” | snap16(v, 256, 3840) |
| 参考图走 nbpro-fal 却超过 8 张 | 400 “too many image_urls” | UI 上限走 `falDef.maxRefs` 动态限制 |
| 子模型划入错误的 TAB | UI 主模型在 nbpro 却拿到 gpt-fal 参数 | apiModel 选项需被初始化子选项继承主模型 TAB |
| 带走上个 FAL 模型参数 | 切 nbpro-fal 发现 num_images=4 / safety=4 什么都不动 | falXxx / nbXxx state 字段名**不能复用** |

---

## 12. 日志总线 / 终端面板规范

### 12.1 logBus

[`src/stores/logs.ts`](file:///e:/PenguinPravite/T8-penguin-canvas/src/stores/logs.ts) 提供双接口：
- 响应式：`useLogStore()` 订阅 entries / open / unread
- 命令式：`logBus.info|success|warn|error|debug(message, source?)`

调用点 = **gpt-image-2-web 中原型调 `log(...)` 的位置**（提交 / 进入轮询 / progress 变化 / 完成 / 失败）。实现参考 [ImageNode.handleGenerate](file:///e:/PenguinPravite/T8-penguin-canvas/src/components/nodes/ImageNode.tsx)。

**允许：** 改造其他节点（VideoNode / AudioNode / RunningHubNode / LLMNode 等）时在同样五个时机增加 `logBus.*` 调用，`source` 统一使用 `分类:节点 id 前6位`（如 `video:abc123`）。

**禁止：** 不要在节点 render 函数主体、useEffect deps 变化、父组件 rerender 路径上打日志，会造成狂刷。

### 12.2 TerminalPanel

[`src/components/TerminalPanel.tsx`](file:///e:/PenguinPravite/T8-penguin-canvas/src/components/TerminalPanel.tsx)：底部抽屉式（`absolute left-3 right-3 bottom-3`），高度 `min(48vh, 420px)`，不遮挡画布交互。备选能力：
- 5 级筛选 · 跟随尾部 · 清空 · ESC 关闭 · X 关闭
- 主题分支：`style==='pixel'` 走糖果风（mint 头 + yellow/pink 徽章 + 黑边硬阴影），否则走科技风（毛玻璃 + 霓虹色级别色）

[`CanvasToolbar.tsx`](file:///e:/PenguinPravite/T8-penguin-canvas/src/components/CanvasToolbar.tsx) 末尾附加 **终端按钮**：`useLogStore.toggleOpen()`，未读数额以双主题色徽章显示。

---

## 13. 节点改造原则（强约束）

> 以下原则适用于后续 **任何** 节点迭代、对齐外部项目、增加参数、修复 Bug 的工作。违反任何一条都可能造成 **原本已实现的功能被静默破坏**。

### 13.1 参数以参考项目为准，不要写死
- **错误示例：** 把 `aspectRatio` / `image_size` 等字段名写死在代码另一侧。
- **正确示例：** 每次改造先读参考项目 `index.html`，字段名、枚举值大小写、查询参数、是 multipart 还是 JSON、是否传空串，完全复制。
- **主项目参考位置：** [`gpt-image-2-web/index.html`](file:///e:/PenguinPravite/gpt-image-2-web/index.html)。

### 13.2 增量改动，不要重写整个路由/节点
- 优先抽取 helper 复用（如 [callImageUpstreamAsync](file:///e:/PenguinPravite/T8-penguin-canvas/backend/src/routes/proxy.js)），**不要** 复制一份同步代码 + 一份异步代码走两条路。
- 修改节点 UI 时保留原有的父组件 contract（props / ref / `onMouseDown` 防拖拽冒泡等）。
- 修改 stores 时保留原有订阅字段名，只加不减。

### 13.3 双主题必须同步考虑
- 任何新 UI 均需加 `style === 'pixel'` 分支，否则像素风下会漏样式。
- 像素风主色使用 mint（薄荷绿） + yellow + pink，全局类名以 `var(--px-*)` 为准，详见 [theme-pixel.css](file:///e:/PenguinPravite/T8-penguin-canvas/src/styles)。

### 13.4 连接校验不要调松
- [`portTypes.ts`](file:///e:/PenguinPravite/T8-penguin-canvas/src/config/portTypes.ts) 中定义的端口语义不得随意删除或放宽，需增加节点时补全该节点的输入输出类型后再注册。
- Canvas.tsx 的 `isValidConnection` 不要提前绕过。

### 13.5 批量运行总线的接入
- 可执行节点必须 `useRunTrigger(id, runFn)` 接入，且 `runFn` 需与“点击生成”为同一个函数。
- 节点内部以 `try/catch` 消化异常，使 `markDone(id, true)` 始终可调，不会阻塞 `handleRunAll` 的拓扑串行。

## 13.6 验收清单（必跑）
1. `npx tsc --noEmit`
2. 后端启动无语法错（`node -e "require('./src/routes/proxy')"`）
3. **端到端**：提交后验证 `taskId` 是真的，轮询能拿到 `urls`，上游后台能看到异步任务。
4. 双主题选择“像素” 与 “科技” 各看一眼控件是否文本/底色选中态都正常。

---

## 14. 节点组容器（GroupBox / 打组功能）

> 设计参考：主项目 [`PebblingCanvas/NodeGroupBox.tsx`](file:///e:/PenguinPravite/components/PebblingCanvas/NodeGroupBox.tsx)（SVG 实现）。T8 用 ReactFlow（DOM 节点），不能直接复用 SVG 版本，需用 `div + flex` 重写为 ReactFlow 自定义节点类型。

### 14.1 三层解耦架构

ReactFlow 自定义节点（`NodeProps`）拿不到外部 Canvas 作用域里的回调（如 `handleRunGroup`、`setNodes`），不能写死 import 引入循环。**必须**走总线模式：

```
GroupBoxNode (UI)  ──触发──▶  groupBus store (请求总线 ts 时间戳)  ──监听 useEffect──▶  Canvas (执行/删除)
```

- [`src/stores/groupBus.ts`](file:///e:/PenguinPravite/T8-penguin-canvas/src/stores/groupBus.ts)：`executeReq` / `deleteReq` 字段为 `{ ts, ... }`，`requestExecute` / `requestDelete` 写入新 ts，Canvas 用 `useEffect(..., [executeReq?.ts])` 触发后调 `clearExecute()` 防重入。
- [`src/components/nodes/GroupBoxNode.tsx`](file:///e:/PenguinPravite/T8-penguin-canvas/src/components/nodes/GroupBoxNode.tsx)：用 `useReactFlow().setNodes` 改自身 data（颜色 / 名字），通过 `useGroupBusStore.getState().requestExecute / requestDelete` 触发 Canvas 行为。
- [`src/components/Canvas.tsx`](file:///e:/PenguinPravite/T8-penguin-canvas/src/components/Canvas.tsx)：注册 `nodeTypes.groupBox = GroupBoxNode` + `handleCreateGroup` + 拖动联动 + useEffect 监听总线。

### 14.2 GroupBox 节点设计要点

| 关键属性 | 值 | 原因 |
|---|---|---|
| `type` | `'groupBox'` | 注册到 `nodeTypes` |
| `zIndex` | `-1000` | 置于普通节点之下；取 **-1000** 而非 -1 是为了抵消 ReactFlow 选中节点 +1000 提升后还能跨过组容器（需同时在 ReactFlow 上设 `elevateNodesOnSelect={false}` 彻底禁止提升，避免选中组后成员被遵掩）|
| `connectable` | `false` | 不参与连线校验，避免污染 `portTypes` |
| `deletable` | `true` | 支持 Delete 键删除 |
| `draggable` / `selectable` | `true` | 可被框选可拖动 |
| `data.memberIds` | `string[]` | 成员节点 id，dangling 容错由消费侧 `idSet.has(n.id)` 过滤 |
| `data.name` | 默认 `'My favourite girl is Go Younjung'`（常量 [`DEFAULT_GROUP_NAME`](file:///e:/PenguinPravite/T8-penguin-canvas/src/stores/groupBus.ts)）| 双击标题进入输入框模式 |
| `data.color` | 从 [`GROUP_COLORS`](file:///e:/PenguinPravite/T8-penguin-canvas/src/stores/groupBus.ts) **12 色**随机 | 顶部颜色点点击可换色（与主项目 NodeGroupBox.GROUP_COLORS 对齐）|
| 内部按钮 | `className="nodrag"` + `onMouseDown stopPropagation` | 防止 ReactFlow 把按钮点击当作节点拖拽 |

### 14.3 拖动联动 delta 法

**不能**用 ReactFlow 的 parentNode 父子嵌套（会破坏成员的绝对坐标和现有连线相对参考）。改用 `onNodeDrag` 顶部拦截 + ref 计算每帧 delta：

```ts
if (node.type === 'groupBox') {
  const ref = groupDragRef.current;
  if (!ref || ref.groupId !== node.id) {
    groupDragRef.current = { groupId: node.id, lastX: node.position.x, lastY: node.position.y };
    return;
  }
  const dx = node.position.x - ref.lastX;
  const dy = node.position.y - ref.lastY;
  if (dx === 0 && dy === 0) return;
  ref.lastX = node.position.x; ref.lastY = node.position.y;
  const idSet = new Set((node.data as any)?.memberIds ?? []);
  setNodes(prev => prev.map(n =>
    idSet.has(n.id) ? { ...n, position: { x: n.position.x + dx, y: n.position.y + dy } } : n));
  return;
}
```

`onNodeDragStop` 中 `groupDragRef.current = null;` 清理。

### 14.4 打组创建 (handleCreateGroup)

- 入参：`ids: string[]`（来自右键菜单选区）。
- 过滤：`n.type !== 'groupBox'` —— **禁止嵌套**，组里不能再套组。
- bounding box：`PAD = 30`、`HEADER = 40`，`groupX = minX - PAD`、`groupY = minY - PAD - HEADER`，让标题栏浮在成员上方。
- 新组节点 unshift 进 nodes 头部并清空其它 selected。

### 14.5 组执行复用拓扑

- 不在 `EXECUTABLE_NODE_TYPES` 加 `groupBox` —— 让全局批量运行自动跳过组容器。
- 组执行直接调 Canvas 已有的 `handleRunGroup(memberIds)`（从右键菜单"组执行"复用而来），它会对子图做拓扑排序后串行触发。
- 已删除成员通过 `nodes.filter(n => idSet.has(n.id))` 自然过滤，不报错。

### 14.6 双主题样式分支

```ts
const outerStyle = isPixel
  ? { border: `3px solid ${selected ? '#3B82F6' : '#1A1410'}`, borderRadius: 14, boxShadow: `4px 4px 0 ${color}` }  // 像素风：硬阴影
  : { border: `2px solid ${color}`, borderRadius: 16, boxShadow: selected ? `0 0 0 2px ${color}33, 0 8px 32px rgba(0,0,0,.18)` : `0 4px 18px rgba(0,0,0,.14)`, backdropFilter: 'blur(2px)' };  // 科技风：柔光 + 模糊
```

半透明底色用 `${color}26` （HEX 8 位 alpha = **15%**） 让组内成员仍能透出底色与背景。调高会遮住节点，调低会看不出色块。

#### 像素风全局白底规则排除（重要 ⚠️）

[`src/styles/theme-pixel.css`](file:///e:/PenguinPravite/T8-penguin-canvas/src/styles/theme-pixel.css) 中有两条用 `!important` 强刷节点根 `<div>` 的规则（为了让所有业务节点在像素主题下统一白底糖果色）。必须用 `:not(.react-flow__node-groupBox)` 排除组容器，否则 `GroupBoxNode` 的 inline `bodyBg` 会被覆盖成不透明白色：

```css
/* 错误：会覆盖 GroupBox 透明底 */
html[data-theme-style="pixel"] .react-flow__node > div:first-child { background: var(--px-surface) !important; }

/* 正确：排除 groupBox */
html[data-theme-style="pixel"] .react-flow__node:not(.react-flow__node-groupBox) > div:first-child {
  background: var(--px-surface) !important;
  ...
}
html[data-theme-style="pixel"] .react-flow__node.selected:not(.react-flow__node-groupBox) > div:first-child {
  outline: 3px dashed var(--px-pink-deep) !important;
  ...
}
```

后续新增任何「结构上能被业务节点区分」的画布辅助节点类型时，都需同步在该选择器中添 `:not(.react-flow__node-XXX)`。

### 14.7 验收清单
1. 框选多个普通节点 → 右键 → "打组" → 出现颜色框；标题栏可双击改名；颜色点点击可换色。
2. 拖拽组容器，组内所有成员同步位移；松手不残留 ref（再拖另一个组不会从老位置开始）。
3. 右上角 ▶ 触发 `handleRunGroup`，按拓扑顺序跑完。
4. 右上角 X 仅删除组容器本身，成员节点保留。
5. 删除组内某成员后再点 ▶，不报错（dangling 容错）。
6. 双主题（科技 / 像素）切换样式正常；**选中组后成员节点仍可见**（验证 `elevateNodesOnSelect={false}` + `zIndex: -1000` + `:not(.react-flow__node-groupBox)` 三重保护生效）。

---

## 15. 右键画布快速添加菜单（paneMenu）

### 15.1 交互设计

- 触发：右键点击画布**空白**区（`onPaneContextMenu`）。如果右键落在节点 / Handle / Edge 上则走 `onNodeContextMenu` / `onSelectionContextMenu`（另一个菜单体系），互不干扰。
- 菜单项：[`NODE_REGISTRY`](file:///e:/PenguinPravite/T8-penguin-canvas/src/config/nodeRegistry.ts) 中 `category === 'input' \|\| category === 'core'` 过滤出的 7 个高频节点：`upload / text / image / video / seedance / audio / llm`。
- 图标：`import * as LucideIcons from 'lucide-react'` + `(LucideIcons as any)[meta.icon] || LucideIcons.Box`，与 [Sidebar.tsx](file:///e:/PenguinPravite/T8-penguin-canvas/src/components/Sidebar.tsx) 同源动态查，**保证两处图标一致**。
- 颜色：内置 `COLOR_HEX` 映射表将 nodeRegistry 里的 Tailwind 调色名（`sky / amber / rose / fuchsia / violet / emerald / cyan / indigo / orange / pink / slate`）转为 HEX，供圆形色块图标背景使用。
- 定位：`position: fixed` + `left/top = clientX/Y`，边界保护 `Math.min(x, innerWidth - 220)` / `Math.min(y, innerHeight - 360)`。遵循[画布右键菜单定位规范](file:///e:/PenguinPravite/T8-penguin-canvas/skill.md)。
- 关闭：点击遮罩层 / 点击菜单项后 / 右键遮罩。

### 15.2 点击后节点生成位置

```ts
onClick={() => {
  const at = { x: paneMenu.x, y: paneMenu.y };  // 快照点击位置
  closePaneMenu();
  addNode(meta.type as NodeType, at);            // 传入 atScreen
}}
```

[`addNode`](file:///e:/PenguinPravite/T8-penguin-canvas/src/components/Canvas.tsx) 识别到 `atScreen` 后：
```ts
position: atScreen
  ? { x: center.x, y: center.y }                 // 左上角对准鼠标
  : { x: center.x - 160 + jitter, y: center.y - 100 + jitter2 }; // Sidebar: 中心对齐视口中心
```
`center = screenToFlowPosition({ x, y })` 将屏幕坐标转为画布坐标，不受画布缩放 / 平移影响。

### 15.3 验收清单

1. 右键画布任意位置（包括贴近 sidebar / 右下角）菜单均贴鼠标弹出，不走到极远位置。
2. 点击任意 7 个节点项，节点出现位置与右键点击位置重合（左上角）；连续右键不同位置加节点，节点不重叠。
3. 双主题下菜单样式正常（科技：毛玻璃深色；像素：糖果黄底 + 黑边硬阴影）。
4. 右键画布 → 出现菜单后再右键另一位置，菜单重新定位不重叠。
5. 左侧 Sidebar 点击添加节点仍出现在视口中心（两个入口策略不互相破坏）。

---

## 16. 画布节点添加与菜单定位总结

> 本节是项目「画布交互 UI 定位」的唯一规范，后续任何弹出 / 添加节点类型的交互都需遵循。

### 16.1 坐标三重体系

| 坐标系 | 含义 | API |
|---|---|---|
| **屏幕坐标** | 鼠标事件 `clientX/Y`，相对视口 (0,0) | `e.clientX`, `e.clientY` |
| **画布坐标** | ReactFlow 世界坐标，受缩放/平移影响 | `screenToFlowPosition({ x, y })` |
| **节点 position** | 节点左上角在画布坐标系中的位置 | `node.position = { x, y }` |

### 16.2 三种入口的定位策略

| 入口 | 期望 | 实现 |
|---|---|---|
| 左侧 Sidebar 点击 | 节点中心 = 画布容器中心 | 取 `.react-flow` 容器 `getBoundingClientRect()` 中心 → `screenToFlowPosition` → 减去半宽半高 (160, 100) |
| 右键画布菜单项 | 节点左上角 = 鼠标点击位置 | `clientX/Y` → `screenToFlowPosition` → 不减偏移 |
| 拖线到空白创建 | 节点左上角 = 鼠标拖落位置 | 同上 |

### 16.3 弹层 / 菜单定位原则

- **一律用 `position: fixed`**，不用 `absolute`。原因：Canvas 根容器 `<div className="flex-1 relative">` 位于侧栏右侧，`absolute` 会被偏移一个 sidebar 宽度。
- 菜单 `left/top` 直接使用 `clientX/Y`。
- 边界保护：`Math.min(x, innerWidth - menuW)` / `Math.min(y, innerHeight - menuH)`。
- 遮罩层同样用 `fixed inset-0 z-30`，菜单本体 `z-40`，点击遮罩关闭。
- 选区菜单（contextMenu）与画布菜单（paneMenu）是两个独立 state，同时只能存在一个。

---
