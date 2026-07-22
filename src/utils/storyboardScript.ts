export interface StoryboardShot {
  index: number;
  title: string;
  durationSeconds: number;
  shotSize: string;
  cameraAngle: string;
  cameraMovement: string;
  visual: string;
  action: string;
  dialogue: string;
  voiceOver: string;
  imagePrompt: string;
}

export interface StoryboardScript {
  title: string;
  visualContinuity: string;
  shots: StoryboardShot[];
}

const REQUIRED_SHOT_KEYS: Array<keyof StoryboardShot> = [
  'index',
  'title',
  'durationSeconds',
  'shotSize',
  'cameraAngle',
  'cameraMovement',
  'visual',
  'action',
  'dialogue',
  'voiceOver',
  'imagePrompt',
];

export function normalizeStoryboardDimension(value: unknown, fallback: number): number {
  const parsed = Number.parseInt(String(value), 10);
  return Math.max(1, Math.min(6, Number.isFinite(parsed) ? parsed : fallback));
}

function extractJsonObject(input: string): string {
  const text = String(input || '').trim();
  if (!text) throw new Error('LLM 未返回脚本内容');
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  const source = fenced || text;
  const start = source.indexOf('{');
  const end = source.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('LLM 返回内容中没有 JSON 对象');
  return source.slice(start, end + 1);
}

function stringField(value: unknown, field: string, allowEmpty = false): string {
  if (typeof value !== 'string') throw new Error(`镜头字段 ${field} 缺失`);
  const normalized = value.trim();
  if (!allowEmpty && !normalized) throw new Error(`镜头字段 ${field} 不能为空`);
  return normalized;
}

export function parseStoryboardScript(input: string, expectedCount: number): StoryboardScript {
  let raw: any;
  try {
    raw = JSON.parse(extractJsonObject(input));
  } catch (error: any) {
    if (error?.message?.startsWith('LLM') || error?.message?.startsWith('镜头')) throw error;
    throw new Error(`脚本 JSON 解析失败: ${error?.message || error}`);
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('脚本 JSON 顶层必须是对象');
  if (!Array.isArray(raw.shots)) throw new Error('脚本 JSON 缺少 shots 数组');
  if (raw.shots.length !== expectedCount) {
    throw new Error(`LLM 返回 ${raw.shots.length} 个镜头，必须严格为 ${expectedCount} 个`);
  }
  const shots = raw.shots.map((shot: any, position: number): StoryboardShot => {
    if (!shot || typeof shot !== 'object' || Array.isArray(shot)) throw new Error(`第 ${position + 1} 个镜头不是对象`);
    for (const key of REQUIRED_SHOT_KEYS) {
      if (!Object.prototype.hasOwnProperty.call(shot, key)) throw new Error(`第 ${position + 1} 个镜头缺少字段 ${key}`);
    }
    const duration = Number(shot.durationSeconds);
    if (!Number.isFinite(duration)) throw new Error(`第 ${position + 1} 个镜头时长无效`);
    return {
      index: position + 1,
      title: stringField(shot.title, 'title'),
      durationSeconds: Math.max(1, Math.min(60, Math.round(duration))),
      shotSize: stringField(shot.shotSize, 'shotSize'),
      cameraAngle: stringField(shot.cameraAngle, 'cameraAngle'),
      cameraMovement: stringField(shot.cameraMovement, 'cameraMovement'),
      visual: stringField(shot.visual, 'visual'),
      action: stringField(shot.action, 'action'),
      dialogue: stringField(shot.dialogue, 'dialogue', true),
      voiceOver: stringField(shot.voiceOver, 'voiceOver', true),
      imagePrompt: stringField(shot.imagePrompt, 'imagePrompt'),
    };
  });
  return {
    title: typeof raw.title === 'string' && raw.title.trim() ? raw.title.trim() : '未命名分镜',
    visualContinuity: typeof raw.visualContinuity === 'string' ? raw.visualContinuity.trim() : '',
    shots,
  };
}

export function buildStoryboardScriptMessages(outline: string, rows: number, cols: number) {
  const count = rows * cols;
  return [
    {
      role: 'system' as const,
      content: [
        '你是专业影视分镜师和视觉导演。',
        `把用户大纲严格拆分为 ${count} 个连续镜头，布局为 ${rows} 行 × ${cols} 列，顺序从左到右、从上到下。`,
        '只输出一个 JSON 对象，不要 Markdown，不要解释。',
        '顶层字段必须是 title、visualContinuity、shots。',
        'shots 中每项必须完整包含 index、title、durationSeconds、shotSize、cameraAngle、cameraMovement、visual、action、dialogue、voiceOver、imagePrompt。',
        `shots 数组必须恰好 ${count} 项，index 必须依次为 1 到 ${count}。`,
        'dialogue 或 voiceOver 没有内容时使用空字符串；其它字段不得为空。',
        'imagePrompt 必须是可直接用于图像模型的精炼画面描述，不包含镜头编号、字幕、对白文字或界面文字。',
        'visualContinuity 要总结角色外观、服装、场景、时代、色彩、光线和美术风格，保证所有镜头视觉一致。',
      ].join('\n'),
    },
    { role: 'user' as const, content: outline.trim() },
  ];
}

export function buildStoryboardRepairMessages(rawResponse: string, outline: string, rows: number, cols: number) {
  const count = rows * cols;
  return [
    {
      role: 'system' as const,
      content: `你负责修复分镜 JSON。严格返回一个合法 JSON 对象，shots 必须恰好 ${count} 项，字段完整，不要 Markdown 或解释。`,
    },
    {
      role: 'user' as const,
      content: `原始大纲：\n${outline}\n\n待修复输出：\n${rawResponse}`,
    },
  ];
}

export function formatStoryboardShot(shot: StoryboardShot): string {
  const lines = [
    `镜头 ${shot.index}｜${shot.title}`,
    `时长：${shot.durationSeconds} 秒`,
    `镜头：${shot.shotSize}；${shot.cameraAngle}；${shot.cameraMovement}`,
    `画面：${shot.visual}`,
    `动作：${shot.action}`,
  ];
  if (shot.dialogue) lines.push(`对白：${shot.dialogue}`);
  if (shot.voiceOver) lines.push(`旁白：${shot.voiceOver}`);
  lines.push(`生图提示词：${shot.imagePrompt}`);
  return lines.join('\n');
}

export function storyboardTextSegments(script: StoryboardScript): string[] {
  return script.shots.map(formatStoryboardShot);
}

export function formatStoryboardScript(script: StoryboardScript): string {
  return [`片名：${script.title}`, `视觉连续性：${script.visualContinuity}`, ...storyboardTextSegments(script)].join('\n\n');
}

export interface StoryboardImagePromptOptions {
  sheetAspectRatio?: string;
  cellAspectRatio?: string;
  referenceImageCount?: number;
}

export function buildStoryboardImagePrompt(
  script: StoryboardScript,
  rows: number,
  cols: number,
  options: StoryboardImagePromptOptions = {},
): string {
  const rowPercent = Number((100 / rows).toFixed(4));
  const colPercent = Number((100 / cols).toFixed(4));
  const referenceCount = Math.max(0, Math.floor(Number(options.referenceImageCount) || 0));
  const ordered = script.shots.map((shot) => (
    `第 ${shot.index} 格：${shot.imagePrompt}。景别 ${shot.shotSize}，机位 ${shot.cameraAngle}，运镜构图意图 ${shot.cameraMovement}。`
  )).join('\n');
  return [
    `生成一张严格的 ${rows} 行 × ${cols} 列影视分镜接触表，共 ${rows * cols} 个完全等宽、完全等高的矩形画面。`,
    `这是数学等分矩阵：每一行必须严格占整图高度的 ${rowPercent}%，每一列必须严格占整图宽度的 ${colPercent}%。所有横向分隔线必须笔直、平行并贯穿整张图；所有纵向分隔线必须笔直、平行并在每一行完全对齐。`,
    '禁止不等高行、可变高度面板、大小格、跨格画面、漫画式分栏、瀑布流、拼贴、错位边界、倾斜边界、圆角卡片或任何不规则布局。不得让任何镜头比其他镜头更大或更小。',
    options.sheetAspectRatio ? `整张接触表比例：${options.sheetAspectRatio}。` : '',
    options.cellAspectRatio ? `每个单格使用相同构图比例，约为 ${options.cellAspectRatio}。` : '',
    '画面顺序必须从左到右、从上到下，与下面的分格描述一一对应。',
    '每一格只表现一个独立镜头，主体和动作不得跨越格子边界。',
    '不要生成镜头编号、标题、字幕、对白、旁白、水印、Logo 或任何可见文字。',
    '不要额外增加格子，不要合并格子。格子之间无间距或只使用宽度完全一致的细分隔线，四周不得额外增加标题栏、留白或装饰边框。输出必须能直接按照等分像素坐标裁切。',
    referenceCount > 0
      ? `已提供 ${referenceCount} 张视觉参考图。将它们作为主要人物身份与面部、体型、服饰、道具、建筑、场景、色彩和材质的强参考，并在所有相关镜头中保持一致；不要把参考图本身画成额外宫格、拼贴板或说明页。`
      : '',
    script.visualContinuity ? `全局视觉连续性：${script.visualContinuity}` : '',
    ordered,
    `最终复核：只能有 ${rows} 条等高水平带和 ${cols} 条等宽垂直列，共 ${rows * cols} 个尺寸一致的矩形镜头；禁止任何一行高度不同。`,
  ].filter(Boolean).join('\n');
}

function gcd(a: number, b: number): number {
  let x = Math.abs(Math.round(a));
  let y = Math.abs(Math.round(b));
  while (y) [x, y] = [y, x % y];
  return x || 1;
}

export function derivedStoryboardCellRatio(sheetRatio: string, rows: number, cols: number): string {
  const match = String(sheetRatio || '').match(/^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/);
  if (!match) return '自动';
  const width = Math.round(Number(match[1]) * rows * 100);
  const height = Math.round(Number(match[2]) * cols * 100);
  const divisor = gcd(width, height);
  return `${width / divisor}:${height / divisor}`;
}

export function legacyFramesToStoryboard(frames: unknown): StoryboardScript | null {
  if (!Array.isArray(frames) || frames.length === 0) return null;
  const shots = frames.map((frame: any, index): StoryboardShot => {
    const title = String(frame?.title || `镜头 ${index + 1}`).trim();
    const visual = String(frame?.desc || title).trim();
    return {
      index: index + 1,
      title,
      durationSeconds: 5,
      shotSize: '中景',
      cameraAngle: '平视',
      cameraMovement: '固定镜头',
      visual,
      action: visual,
      dialogue: '',
      voiceOver: '',
      imagePrompt: visual,
    };
  });
  return { title: '旧版分镜', visualContinuity: '', shots };
}
