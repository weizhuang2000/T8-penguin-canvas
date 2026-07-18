import {
  getCodexCliSkills,
  getCodexCliStatus,
  streamCodexCliAgent,
  type CodexAgentArtifact,
  type CodexStreamEvent,
} from './codexCli.ts';

export const IMAGE_TO_EDITABLE_SKILL = 'image-to-editable-ppt';

export type EditableOutputFormat = 'ppt' | 'psd';

export interface EditableDocumentFile {
  title: string;
  url: string;
  format: EditableOutputFormat;
}

export interface EditableDocumentRunResult {
  files: EditableDocumentFile[];
  reply: string;
  workspace: string;
  artifacts: CodexAgentArtifact[];
}

function outputExtension(format: EditableOutputFormat) {
  return format === 'ppt' ? 'pptx' : 'psd';
}

function artifactUrl(artifact: CodexAgentArtifact) {
  return String(artifact.url || artifact.urls?.[0] || '').trim();
}

export function buildImageToEditablePrompt(options: {
  format: EditableOutputFormat;
  imageCount: number;
  extraInstructions?: string;
}) {
  const count = Math.max(1, Math.floor(options.imageCount || 1));
  const common = [
    `按命令附带图片的顺序处理 ${count} 张源图。`,
    '这是画布中的一次性非交互运行；不要停下来向用户提问。若未配置 PaddleOCR token，记录提示并继续使用离线 text hints。',
    '所有最终交付文件必须写入环境变量 T8_CODEX_OUTPUT_DIR 指向的目录，并在最终回复中用 Markdown 链接列出绝对路径。',
    '不得把完整源图作为唯一内容层来冒充可编辑结果；如果无法生成真实可编辑文件，明确失败并说明缺失的运行时或能力。',
  ];

  const formatInstructions = options.format === 'ppt'
    ? [
        '输出格式：PPTX。完整遵循 $image-to-editable-ppt 的 prepare、逐页重建/调度、record、finalize 与验证流程。',
        '多张图片按输入顺序组成同一个演示文稿；最终只交付通过 finalize 结构校验的 PPTX。',
        '必须保留真实的原生文字、结构形状和独立前景素材，不允许整页截图加文字覆盖。',
      ]
    : [
        '输出格式：PSD。用户明确要求把 $image-to-editable-ppt 改编为 PSD，这一输出要求覆盖该 Skill 中“输出始终为 PPTX”的限制。',
        '复用该 Skill 的页面清点、背景识别/修复、前景素材分离、文字测量、对象来源决策和视觉 QA 规则，但不要执行 PPTX finalize。',
        '每张输入图生成一个真实分层 PSD：背景、结构形状、每个独立前景对象、文字分别置于命名图层或图层组；可写为文字图层时必须保留可编辑文字。',
        '使用本机可用的 Photoshop 脚本或能够写入分层 PSD 的可靠工具，并重新读取生成文件验证图层数、画布尺寸与可解析性。禁止只写一个铺满画布的扁平图层。',
        '多张输入图分别输出多个 .psd 文件，文件名按输入顺序编号。任何一页无法形成真实分层 PSD 时，该页必须失败，不能降级为扁平 PSD。',
      ];

  const extra = String(options.extraInstructions || '').trim();
  return [
    '使用 $image-to-editable-ppt Skill 完成图片可编辑化重建。',
    ...common,
    ...formatInstructions,
    ...(extra ? [`用户补充要求：\n${extra}`] : []),
  ].join('\n\n');
}

export async function inspectImageToEditableRuntime(payload: { nodeId: string }) {
  const [status, skillResult] = await Promise.all([
    getCodexCliStatus(undefined, { runtimeOnly: false, includeEditppt: true }),
    getCodexCliSkills({ nodeId: payload.nodeId, sessionId: 'image-to-editable-skill-check' }),
  ]);
  return {
    status,
    skillAvailable: skillResult.skills.some((skill) => skill.name === IMAGE_TO_EDITABLE_SKILL),
    editpptAvailable: status.editppt?.available === true,
  };
}

export async function runImageToEditableDocument(
  payload: {
    nodeId: string;
    images: string[];
    format: EditableOutputFormat;
    extraInstructions?: string;
  },
  options: {
    signal?: AbortSignal;
    onProgress?: (message: string, event?: CodexStreamEvent) => void;
  } = {},
): Promise<EditableDocumentRunResult> {
  const images = payload.images.map((item) => String(item || '').trim()).filter(Boolean);
  if (images.length === 0) throw new Error('请先连接至少一张上游图片。');

  const result = await streamCodexCliAgent({
    nodeId: payload.nodeId,
    sessionId: `image-to-editable-${Date.now()}`,
    mode: 'prompt',
    command: '/image-to-editable',
    prompt: buildImageToEditablePrompt({
      format: payload.format,
      imageCount: images.length,
      extraInstructions: payload.extraInstructions,
    }),
    images,
    selectedSkillNames: [IMAGE_TO_EDITABLE_SKILL],
    sandbox: 'workspace-write',
    approvalPolicy: 'never',
    reasoningEffort: 'high',
    includePlanTool: true,
  }, {
    signal: options.signal,
    onEvent(event) {
      const message = String(event.message || '').trim();
      if (message) options.onProgress?.(message, event);
    },
  });

  const extension = outputExtension(payload.format);
  const artifacts = Array.isArray(result.artifacts) ? result.artifacts : [];
  const seen = new Set<string>();
  const files = artifacts
    .map((artifact) => ({ artifact, url: artifactUrl(artifact) }))
    .filter(({ url }) => new RegExp(`\\.${extension}(?:[?#].*)?$`, 'i').test(url))
    .filter(({ url }) => {
      if (seen.has(url)) return false;
      seen.add(url);
      return true;
    })
    .map(({ artifact, url }) => ({
      title: String(artifact.title || url.split(/[\\/]/).pop() || `editable.${extension}`),
      url,
      format: payload.format,
    }));

  if (files.length === 0) {
    const reply = String(result.reply || result.text || '').trim();
    const detail = reply ? `\n${reply.slice(-1200)}` : '';
    throw new Error(`任务结束但没有发现 .${extension} 交付文件。${detail}`);
  }

  return {
    files,
    reply: String(result.reply || result.text || '').trim(),
    workspace: String(result.workspace || ''),
    artifacts,
  };
}
