'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(process.argv[2] || '');
if (!root || !fs.existsSync(path.join(root, 'package.json'))) {
  throw new Error('Usage: node deploy.cjs /absolute/path/to/app');
}

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8').replace(/\r\n/g, '\n');
}

function write(relativePath, content) {
  fs.writeFileSync(path.join(root, relativePath), content, 'utf8');
  process.stdout.write(`patched ${relativePath}\n`);
}

function ensureAfter(relativePath, anchor, insertion, marker = insertion.trim()) {
  const source = read(relativePath);
  if (source.includes(marker)) return;
  const index = source.indexOf(anchor);
  if (index < 0) throw new Error(`Missing anchor in ${relativePath}: ${anchor.slice(0, 80)}`);
  write(relativePath, source.slice(0, index + anchor.length) + insertion + source.slice(index + anchor.length));
}

function ensureBefore(relativePath, anchor, insertion, marker = insertion.trim()) {
  const source = read(relativePath);
  if (source.includes(marker)) return;
  const index = source.indexOf(anchor);
  if (index < 0) throw new Error(`Missing anchor in ${relativePath}: ${anchor.slice(0, 80)}`);
  write(relativePath, source.slice(0, index) + insertion + source.slice(index));
}

function replaceOnce(relativePath, before, after, marker) {
  const source = read(relativePath);
  if (marker && source.includes(marker)) return;
  const first = source.indexOf(before);
  if (first < 0 || source.indexOf(before, first + 1) >= 0) {
    throw new Error(`Expected one replacement anchor in ${relativePath}`);
  }
  write(relativePath, source.slice(0, first) + after + source.slice(first + before.length));
}

function replaceAll(relativePath, before, after, expectedCount, marker) {
  const source = read(relativePath);
  if (marker && source.includes(marker)) return;
  const count = source.split(before).length - 1;
  if (count !== expectedCount) throw new Error(`Expected ${expectedCount} anchors in ${relativePath}, found ${count}`);
  write(relativePath, source.split(before).join(after));
}

const outputBlock = [
  "        // Blender node output fields coexist in one data object; isolate them by source Handle.",
  "        if ((n as any)?.type === 'blender-model') {",
  "          const wantsModel = handles.has('model') || handles.has(null);",
  "          const wantsRender = handles.has('render') || handles.has(null);",
  "          const wantsReport = handles.has('report') || handles.has(null);",
  "          if (wantsModel) {",
  "            pushUnique(out.models, ud.modelUrl);",
  "            if (Array.isArray(ud.modelUrls)) ud.modelUrls.forEach((url: any) => pushUnique(out.models, url));",
  "          }",
  "          if (wantsRender) {",
  "            pushUnique(out.images, ud.imageUrl);",
  "            if (Array.isArray(ud.imageUrls)) ud.imageUrls.forEach((url: any) => pushUnique(out.images, url));",
  "          }",
  "          if (wantsReport) {",
  "            pushUniqueText(out.texts, ud.outputText);",
  "            pushUniqueText(out.texts, ud.text);",
  "            pushUniqueText(out.texts, ud.prompt);",
  "          }",
  "          continue;",
  "        }",
  "",
].join('\n');

const upstreamBlock = [
  "      // Blender model, render and report data must follow the selected source Handle.",
  "      if (n.type === 'blender-model') {",
  "        if (handles.has('render') || handles.has(null)) {",
  "          pushUrl(sid, 'image', ud.imageUrl, images, `blender:${sid}:render`, 'Blender main render');",
  "          if (Array.isArray(ud.imageUrls)) {",
  "            ud.imageUrls.forEach((url: any, index: number) => {",
  "              pushUrl(sid, 'image', url, images, `blender:${sid}:render:${index}`, `Blender render ${index + 1}`);",
  "            });",
  "          }",
  "        }",
  "        if (handles.has('report') || handles.has(null)) {",
  "          pushText(sid, ud.outputText || ud.text || ud.prompt, `blender:${sid}:report`, 'Blender report', textMeta);",
  "        }",
  "        continue;",
  "      }",
  "",
].join('\n');

const initialDataBlock = [
  "  'blender-model': {",
  "    llmKeyId: '',",
  "    blenderPrompt: '',",
  "    blenderRenderPreset: 'final',",
  "    blenderExecutablePath: '',",
  "    blenderMaterialOrder: [],",
  "    blenderExcludedMaterialIds: [],",
  "    blenderPhase: 'idle',",
  "    blenderProgress: 0,",
  "    blenderWarnings: [],",
  "    blenderReviews: [],",
  "    blenderRepairsUsed: 0,",
  "  },",
].join('\n') + '\n';

ensureAfter('backend/src/server.js', "const remotionRouter = require('./routes/remotion');", "\nconst blenderRouter = require('./routes/blender');", "const blenderRouter = require('./routes/blender');");
ensureAfter('backend/src/server.js', "app.use('/api/remotion', remotionRouter);", "\napp.use('/api/blender', blenderRouter);", "app.use('/api/blender', blenderRouter);");
replaceAll('backend/src/auth/toolPermissions.js', "  'remotion-animation',\n  'runninghub',", "  'remotion-animation',\n  'blender-model',\n  'runninghub',", 2, "  'blender-model',");
replaceOnce('backend/src/providers/llmClient.js', "    stream: false,\n  };\n  const retries", "    stream: false,\n  };\n  if (options.webSearch === true) payload.tools = [{ type: 'web_search' }];\n  const retries", "options.webSearch === true");

ensureAfter('src/components/Canvas.tsx', "import RemotionAnimationNode from './nodes/RemotionAnimationNode';", "\nimport BlenderModelNode from './nodes/BlenderModelNode';", "import BlenderModelNode from './nodes/BlenderModelNode';");
ensureAfter('src/components/Canvas.tsx', "  'remotion-animation': RemotionAnimationNode,", "\n  'blender-model': BlenderModelNode,", "  'blender-model': BlenderModelNode,");
ensureBefore('src/components/Canvas.tsx', "  upload: { uploadType: null },", initialDataBlock, "  'blender-model': {");
replaceOnce('src/components/Canvas.tsx', "'prompt-reverse', 'remotion-animation', 'runninghub'", "'prompt-reverse', 'remotion-animation', 'blender-model', 'runninghub'", "'remotion-animation', 'blender-model', 'runninghub'");
replaceOnce('src/components/NodeActionBar.tsx', "'llm', 'remotion-animation', 'runninghub'", "'llm', 'remotion-animation', 'blender-model', 'runninghub'", "'remotion-animation', 'blender-model', 'runninghub'");
replaceOnce('src/types/canvas.ts', "  | 'remotion-animation'\n  | 'runninghub'", "  | 'remotion-animation'\n  | 'blender-model'\n  | 'runninghub'", "  | 'blender-model'");

ensureBefore('src/components/nodes/OutputNode.tsx', "      // === v1.2.9.0:", outputBlock, "type === 'blender-model'");
ensureBefore('src/components/nodes/useUpstreamMaterials.ts', "      // 文本: textSegments", upstreamBlock, "n.type === 'blender-model'");

ensureBefore('src/config/nodeRegistry.ts', "  { type: 'panorama-3d',", "  { type: 'blender-model', label: 'Blender 模型', category: '3d', description: '文字或参考图经 LLM 分阶段推理与渲染审片，调用本机 Blender 生成 BLEND、GLB、质检图和完整工程包', icon: 'Box', color: 'orange' },\n", "type: 'blender-model'");
ensureBefore('src/config/portTypes.ts', "  'panorama-3d':", "  'blender-model': { inputs: ['text', 'image'], outputs: ['model3d', 'image', 'text'] },\n", "  'blender-model': {");

ensureAfter('src/utils/connectionHandles.ts', "  'interactive-game-script': {\n    source: { screens: 'image', script: 'text' },\n    target: { brief: 'text', references: 'image' },\n  },", "\n  'blender-model': {\n    source: { model: 'model3d', render: 'image', report: 'text' },\n    target: { text: 'text', images: 'image' },\n  },", "source: { model: 'model3d', render: 'image', report: 'text' }");
ensureAfter('src/utils/connectionHandles.ts', "  'interactive-game-script': {\n    source: { image: 'screens', text: 'script' },\n    target: { text: 'brief', image: 'references' },\n  },", "\n  'blender-model': {\n    source: { model3d: 'model', image: 'render', text: 'report' },\n    target: { text: 'text', image: 'images' },\n  },", "source: { model3d: 'model', image: 'render', text: 'report' }");

ensureAfter('Dockerfile', 'FROM node:22-bookworm-slim AS runtime', '\n\nARG BLENDER_VERSION=4.3.2\nARG BLENDER_SHA256=4da1c956673c0485e63054e563ee69198cc8f80d8157dd7592dffc8a6a5592e6', 'ARG BLENDER_VERSION=4.3.2');
replaceOnce(
  'Dockerfile',
  "RUN apt-get update \\\n  && apt-get install -y --no-install-recommends ffmpeg python3 python3-venv ca-certificates docker.io \\\n  && rm -rf /var/lib/apt/lists/*",
  "RUN apt-get update \\\n  && apt-get install -y --no-install-recommends \\\n    ca-certificates curl docker.io ffmpeg python3 python3-venv xz-utils \\\n    libdbus-1-3 libegl1 libfontconfig1 libgl1 libglib2.0-0 libice6 libsm6 \\\n    libx11-6 libxext6 libxfixes3 libxi6 libxkbcommon0 libxkbcommon-x11-0 \\\n    libxrender1 libxxf86vm1 \\\n  && curl -fsSL \"https://download.blender.org/release/Blender4.3/blender-${BLENDER_VERSION}-linux-x64.tar.xz\" -o /tmp/blender.tar.xz \\\n  && echo \"${BLENDER_SHA256}  /tmp/blender.tar.xz\" | sha256sum -c - \\\n  && mkdir -p /opt/blender \\\n  && tar -xJf /tmp/blender.tar.xz -C /opt/blender --strip-components=1 \\\n  && ln -s /opt/blender/blender /usr/local/bin/blender \\\n  && blender --version | head -n 1 \\\n  && rm -f /tmp/blender.tar.xz \\\n  && rm -rf /var/lib/apt/lists/*",
  'download.blender.org/release/Blender4.3'
);

const payloadFiles = [
  'backend/src/routes/blender.js',
  'backend/src/tools/blender/jobManager.js',
  'backend/src/tools/blender/pythonScripts.js',
  'backend/src/tools/blender/runtime.js',
  'src/components/nodes/BlenderModelNode.tsx',
  'src/services/blender.ts',
];
for (const relativePath of payloadFiles) {
  const source = path.join(__dirname, 'payload', relativePath);
  const target = path.join(root, relativePath);
  if (!fs.existsSync(source)) throw new Error(`Missing payload file: ${relativePath}`);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
  process.stdout.write(`copied ${relativePath}\n`);
}

process.stdout.write('BLENDER_DEPLOY_PATCH_OK\n');
