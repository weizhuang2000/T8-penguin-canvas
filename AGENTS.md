# AGENTS.md

## 基本约定

- 默认使用中文回复，除非用户明确要求英文。
- 这是一个 AI 节点画布工作流应用，形态为 Web + Electron 桌面端：前端负责 React 画布与节点交互，后端负责本地数据、文件、图片处理和外部 AI/RH 代理。
- 修改前先读相关模块，优先沿用现有模式；不要顺手重构无关代码。
- 当前仓库中不少中文注释/README 在部分终端编码下会显示乱码，编辑时尽量不要无意义改动这些行。
- 不要提交密钥、用户数据或生成产物。开发模式会在项目根目录生成 `data/`、`input/`、`output/`、`thumbnails/`。

## 技术栈

- 前端：React 19、TypeScript 5、Vite 6、Tailwind CSS、@xyflow/react、zustand、lucide-react。
- 后端：Node.js CommonJS、Express、multer、sharp。
- 桌面端：Electron 33、electron-builder、bytenode、自定义 T8ENC1 加密打包链路。
- 测试：Node 内置 `node:test` + `node:assert/strict`，测试文件在 `tests/`。

## 常用命令

```powershell
npm install
cd backend; npm install; cd ..

npm run dev          # 同时启动后端和 Vite
npm run dev:vite     # 仅前端，http://127.0.0.1:11422
npm run dev:backend  # 仅后端，http://127.0.0.1:18766
npm run type-check   # tsc --noEmit
npm run build        # tsc -b && vite build
npm run preview      # 预览 dist
npm run electron:dev # Electron 开发模式
npm run dist         # Windows NSIS 打包
```

项目没有集中注册 `test` 脚本。可按需直接运行单测，例如：

```powershell
node --test tests\advancedProviders.test.ts
node --test tests\drawingBoardCutout.test.ts
```

## 端口与运行模式

- Vite 开发服务固定 `127.0.0.1:11422`，`strictPort: true`。
- 后端默认 `127.0.0.1:18766`，Vite 代理 `/api`、`/files`、`/output`、`/input` 到该端口。
- Electron 开发模式会加载 `backend/src/server.js`；打包模式会加载加密后的后端并把数据目录切到 Electron `userData`。
- 后端 CORS 只允许本机来源，外部平台请求必须通过后端代理层处理。

## 目录速览

```text
backend/
  src/server.js              Express 入口，挂载 API、静态文件和打包后的前端
  src/config.js              端口、数据目录、默认外部平台地址与本地路径
  src/routes/                canvas/settings/files/imageOps/proxy/themes/resources 等路由
  src/providers/             OpenAI 兼容、ModelScope、火山、ComfyUI、即梦等适配
  src/tools/aiWatermark/     去 AI 水印辅助工具封装

src/
  App.tsx                    应用外壳、顶部栏、设置/资源/主题入口
  main.tsx                   React 入口
  components/Canvas.tsx      画布主体、批量运行、对齐、复制粘贴等核心交互
  components/nodes/          各类节点组件
  components/edges/          自定义边
  stores/                    zustand 状态：canvas/apiKeys/theme/logs/runBus 等
  services/                  前端 API、生成、图片操作服务封装
  utils/                     拓扑排序、素材集合、快捷键、画板、视频等纯逻辑
  config/nodeRegistry.ts     Sidebar 节点注册表，新增节点通常要同步这里
  types/canvas.ts            节点、画布、设置、扩展 Provider 类型
  theme/                     主题模板解析、应用与校验
  styles/                    全局样式和主题 CSS

electron/
  main.cjs                   主进程、后端拉起、窗口、外链与日志
  preload.cjs                IPC 桥接
  loader.cjs                 bytenode/T8ENC1 loader
  encrypt.cjs                后端加密脚本
  _post_build.cjs            打包后校验

tests/                       node:test 单测
docs/theme-design-guide.md   主题设计规范
features.json                节点/功能快照与防丢失清单
tools/remove-ai-watermarks-runtime/
```

## 数据与接口约定

- 前端只请求相对路径 `/api/*`，不要在前端硬编码后端主机；封装集中在 `src/services/api.ts`。
- 后端持久化文件默认位于 `data/`：画布列表、设置、RH 应用、资源库元数据等。
- 上传、生成、缩略图分别走 `input/`、`output/`、`thumbnails/`，并通过 `/files/input/*`、`/files/output/*`、`/files/thumbnails/*` 访问。
- API Key 明文只能留在后端本地设置中。返回给前端的设置应脱敏，新增设置字段时同步考虑 mask/merge/blank preservation。
- 本地 Eagle API 只允许本机地址，保持 SSRF/远程代理风险边界。

## 前端改动指南

- 节点类型定义在 `src/types/canvas.ts`，节点入口/分类在 `src/config/nodeRegistry.ts`，实际渲染通常在 `src/components/nodes/` 和 `Canvas.tsx` 的 `nodeTypes` 映射中。
- 新增可执行节点时，检查批量运行、拓扑排序、运行总线、上游素材解析、输出素材与错误状态是否都接上。
- 全局状态优先使用既有 zustand store；跨节点触发优先查看 `stores/runBus.ts`、`hooks/useRunTrigger.ts`。
- 图标优先使用 `lucide-react`；按钮、浮层、主题样式尽量沿用现有类名和 CSS 变量。
- 主题相关改动同时检查 `src/theme/*`、`src/styles/theme-core.css`、具体 `theme-*.css`，浅色/深色都要可读。
- 画布交互要注意 ReactFlow 坐标系、viewport、缩放、拖拽和 DOM 输入框事件隔离，避免破坏快捷键和文本输入。

## 后端改动指南

- 后端是 CommonJS；前端是 ESM/TypeScript。不要混用模块风格。
- 路由以 `{ success, data, error }` 风格为主，前端 `request()` 会把 `error/message` 转成异常。
- 文件写入前做路径归一化和目录边界校验；外部 URL、baseUrl、provider id 等输入必须白名单或严格校验。
- 图片处理优先使用 `sharp`；上传走 `multer`。
- 新增外部 Provider 时同步考虑：配置规范化、脱敏、测试接口、前端设置 UI、生成节点中的 providerSource/providerId/providerModel。

## Electron 与打包注意

- `electron/main.cjs` 会在运行时选择可用后端端口，并注入 `PORT`、`HOST`、`T8PC_PACKAGED`、`T8PC_USER_DATA`、`T8PC_FRONTEND_DIST`。
- 打包链路：`npm run build` -> `npm run encrypt` -> `electron-builder` -> `_post_build.cjs`。
- 打包配置会把 `dist` 放进 `resources/frontend`，把加密后端放进 `resources/backend-enc`。
- 去 AI 水印完整离线能力依赖 `tools/remove-ai-watermarks-runtime/` sidecar；正式打包前按 README/工具目录说明确认 runtime 是否齐全。

## 验证建议

- 纯类型/前端结构改动：至少跑 `npm run type-check`。
- 构建或 Vite 配置改动：跑 `npm run build`。
- 后端路由、Provider、工具函数改动：跑对应 `tests/*.test.ts`，必要时启动 `npm run dev:backend` 后用 `/api/status` 做冒烟。
- 画布 UI/交互改动：启动 `npm run dev`，在 `http://127.0.0.1:11422` 手测新增/连接/运行/删除/撤销等关键路径。
- 主题改动：浅色和深色都检查节点、浮层、select、MiniMap、控制条、水印层级。

## Git 与改动边界

- 工作区可能已有用户改动，未经明确要求不要还原。
- 不要提交 `data/`、`input/`、`output/`、`thumbnails/`、`dist/`、`dist_electron/`、本地 runtime 或密钥文件。
- 小范围修复优先改最贴近问题的文件；跨前后端协议变更要同步类型、服务封装、路由和测试。
