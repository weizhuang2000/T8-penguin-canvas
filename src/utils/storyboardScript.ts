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

export interface StoryboardVideoStyle {
  id: string;
  label: string;
  prompt: string;
}

export const STORYBOARD_VIDEO_STYLES: StoryboardVideoStyle[] = [
  { id: 'auto', label: '自动匹配', prompt: '' },
  { id: 'cinematic-realism', label: '电影写实', prompt: '电影级写实影像，真实材质与自然表演，电影灯光和克制调色' },
  { id: 'commercial-tvc', label: '商业广告 / TVC', prompt: '高端商业广告TVC，精致布光，清晰产品质感，流畅有冲击力的镜头语言' },
  { id: 'documentary', label: '纪录片', prompt: '纪实纪录片风格，自然光，真实环境与抓拍感，克制可信的镜头表达' },
  { id: 'anime-2d', label: '2D 日系动画', prompt: '高质量2D日系动画，手绘赛璐璐质感，清晰线稿，富有表现力的角色动作' },
  { id: 'cg-3d', label: '3D CG 动画', prompt: '高质量3D CG动画，精细角色与环境建模，电影级渲染、灯光和体积效果' },
  { id: 'western-cartoon', label: '美式卡通', prompt: '现代美式卡通动画，夸张而自然的形体与表演，鲜明色彩和清晰轮廓' },
  { id: 'ink-animation', label: '国风水墨动画', prompt: '中国水墨动画，写意笔触、宣纸肌理、留白与东方色彩，流动墨韵' },
  { id: 'clay-stop-motion', label: '黏土定格动画', prompt: '黏土定格动画，手工模型与可见材质纹理，微缩布景，逐帧动画质感' },
  { id: 'motion-comic', label: '动态漫画', prompt: '动态漫画风格，强轮廓与网点质感，戏剧化构图，适合视差和分层运动' },
  { id: 'pixel-art', label: '像素动画', prompt: '精致像素艺术动画，统一像素颗粒与有限色板，清晰剪影和游戏动画节奏' },
  { id: 'cyberpunk', label: '赛博朋克', prompt: '赛博朋克影像，霓虹夜景、高科技低生活、潮湿反射与高对比氛围光' },
  { id: 'retro-film', label: '复古胶片', prompt: '复古电影胶片风格，柔和反差、自然颗粒、轻微色偏与年代感镜头' },
  { id: 'music-video', label: '音乐 MV', prompt: '音乐MV风格，节奏化视觉设计，大胆灯光与色彩，富有情绪的镜头表达' },
];

export function resolveStoryboardVideoStyle(value: unknown): StoryboardVideoStyle {
  return STORYBOARD_VIDEO_STYLES.find((item) => item.id === String(value || 'auto')) || STORYBOARD_VIDEO_STYLES[0];
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
];

export function normalizeStoryboardDimension(value: unknown, fallback: number): number {
  const parsed = Number.parseInt(String(value), 10);
  return Math.max(1, Math.min(6, Number.isFinite(parsed) ? parsed : fallback));
}

export function normalizeStoryboardTotalDuration(value: unknown, shotCount: number, fallback?: number): number {
  const count = Math.max(1, Math.floor(Number(shotCount) || 1));
  const parsed = Number.parseInt(String(value), 10);
  const defaultValue = Math.max(count, Math.min(count * 60, Math.round(fallback ?? count * 5)));
  return Math.max(count, Math.min(count * 60, Number.isFinite(parsed) ? parsed : defaultValue));
}

export function allocateStoryboardDurations(shots: StoryboardShot[], totalDurationSeconds: number): StoryboardShot[] {
  if (!shots.length) return [];
  const total = normalizeStoryboardTotalDuration(totalDurationSeconds, shots.length);
  const durations = Array.from({ length: shots.length }, () => 1);
  const weights = shots.map((shot) => Math.max(1, Number(shot.durationSeconds) || 1));
  let remaining = total - shots.length;

  while (remaining > 0) {
    const active = durations.map((duration, index) => ({ index, duration })).filter((item) => item.duration < 60);
    if (!active.length) break;
    const weightSum = active.reduce((sum, item) => sum + weights[item.index], 0);
    const shares = active.map((item) => {
      const exact = (remaining * weights[item.index]) / weightSum;
      return { ...item, exact, whole: Math.min(60 - item.duration, Math.floor(exact)) };
    });
    const assigned = shares.reduce((sum, item) => sum + item.whole, 0);
    if (assigned > 0) {
      shares.forEach((item) => { durations[item.index] += item.whole; });
      remaining -= assigned;
      continue;
    }
    shares
      .sort((a, b) => (b.exact - Math.floor(b.exact)) - (a.exact - Math.floor(a.exact)) || b.exact - a.exact || a.index - b.index)
      .slice(0, remaining)
      .forEach((item) => { durations[item.index] += 1; });
    remaining = 0;
  }

  return shots.map((shot, index) => ({ ...shot, durationSeconds: durations[index] }));
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

export function enrichStoryboardImagePrompt(input: {
  imagePrompt?: unknown;
  visual: string;
  action: string;
  shotSize: string;
  cameraAngle: string;
  cameraMovement: string;
  visualContinuity?: string;
}): string {
  const original = typeof input.imagePrompt === 'string' ? input.imagePrompt.trim() : '';
  if ([...original].length >= 60) return original;

  const parts = [
    original,
    input.visual ? `画面情节：${input.visual}` : '',
    input.action && input.action !== input.visual ? `人物动作与状态：${input.action}` : '',
    `镜头设计：${input.shotSize}，${input.cameraAngle}，${input.cameraMovement}`,
    input.visualContinuity ? `视觉连续性：${input.visualContinuity}` : '',
  ].filter(Boolean);
  let enriched = parts.join('；').replace(/[；。\s]+$/, '');
  if ([...enriched].length < 60) {
    enriched += '；保持主体外观、服饰、关键道具与空间方位连续，明确前景、中景和背景层次，补充符合情节的光线方向、色彩材质与情绪氛围';
  }
  return enriched;
}

export function parseStoryboardScript(input: string, expectedCount: number, totalDurationSeconds?: number): StoryboardScript {
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
  const visualContinuity = typeof raw.visualContinuity === 'string' ? raw.visualContinuity.trim() : '';
  const shots = raw.shots.map((shot: any, position: number): StoryboardShot => {
    if (!shot || typeof shot !== 'object' || Array.isArray(shot)) throw new Error(`第 ${position + 1} 个镜头不是对象`);
    for (const key of REQUIRED_SHOT_KEYS) {
      if (!Object.prototype.hasOwnProperty.call(shot, key)) throw new Error(`第 ${position + 1} 个镜头缺少字段 ${key}`);
    }
    const duration = Number(shot.durationSeconds);
    if (!Number.isFinite(duration)) throw new Error(`第 ${position + 1} 个镜头时长无效`);
    const title = stringField(shot.title, 'title');
    const shotSize = stringField(shot.shotSize, 'shotSize');
    const cameraAngle = stringField(shot.cameraAngle, 'cameraAngle');
    const cameraMovement = stringField(shot.cameraMovement, 'cameraMovement');
    const visual = stringField(shot.visual, 'visual');
    const action = stringField(shot.action, 'action');
    const imagePrompt = enrichStoryboardImagePrompt({
      imagePrompt: shot.imagePrompt,
      visual,
      action,
      shotSize,
      cameraAngle,
      cameraMovement,
      visualContinuity,
    });
    return {
      index: position + 1,
      title,
      durationSeconds: Math.max(1, Math.min(60, Math.round(duration))),
      shotSize,
      cameraAngle,
      cameraMovement,
      visual,
      action,
      dialogue: stringField(shot.dialogue, 'dialogue', true),
      voiceOver: stringField(shot.voiceOver, 'voiceOver', true),
      imagePrompt,
    };
  });
  const allocatedShots = totalDurationSeconds === undefined
    ? shots
    : allocateStoryboardDurations(shots, totalDurationSeconds);
  return {
    title: typeof raw.title === 'string' && raw.title.trim() ? raw.title.trim() : '未命名分镜',
    visualContinuity,
    shots: allocatedShots,
  };
}

export function buildStoryboardScriptMessages(
  outline: string,
  rows: number,
  cols: number,
  options: { videoStyle?: StoryboardVideoStyle; totalDurationSeconds?: number } = {},
) {
  const count = rows * cols;
  const style = options.videoStyle?.prompt ? `${options.videoStyle.label}：${options.videoStyle.prompt}` : '';
  const totalDuration = normalizeStoryboardTotalDuration(options.totalDurationSeconds, count);
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
        `全片总时长必须严格为 ${totalDuration} 秒。根据大纲的情节密度、动作复杂度、对白长度和戏剧节奏分配各镜头 durationSeconds；所有镜头时长相加必须恰好等于 ${totalDuration}，每镜 1-60 秒，不要机械平均。`,
        'dialogue 或 voiceOver 没有内容时使用空字符串；其它字段不得为空。',
        '每个镜头都必须紧扣原始大纲中对应的具体情节，不得只写“人物在场景中”“电影感画面”等泛化描述。visual 和 action 要交代该时刻发生了什么、人物目的与情绪如何变化，以及它和前后镜头的叙事衔接。',
        '每个 imagePrompt 必须是可直接用于图像模型的详细画面描述，至少 80 个中文字符或同等信息量；必须包含主体身份与外观连续性、此刻的具体动作和微表情、关键道具、时间与空间环境、前中后景层次、景别与机位构图、光线方向、色彩材质和情绪氛围。',
        'imagePrompt 应描述一个明确可见的瞬间，不使用空洞形容词堆砌，不包含镜头编号、字幕、对白文字、旁白或界面文字。不要遗漏大纲中的关键情节信息，也不要凭空改变人物关系和事件结果。',
        'visualContinuity 要总结角色外观、服装、场景、时代、色彩、光线和美术风格，保证所有镜头视觉一致。',
        style ? `指定的视频动画风格为“${style}”。visualContinuity 和所有 imagePrompt 必须遵循该风格。` : '',
      ].filter(Boolean).join('\n'),
    },
    { role: 'user' as const, content: outline.trim() },
  ];
}

export function buildStoryboardRepairMessages(
  rawResponse: string,
  outline: string,
  rows: number,
  cols: number,
  options: { videoStyle?: StoryboardVideoStyle; totalDurationSeconds?: number } = {},
) {
  const count = rows * cols;
  const style = options.videoStyle?.prompt ? `，并统一遵循“${options.videoStyle.label}：${options.videoStyle.prompt}”` : '';
  const totalDuration = normalizeStoryboardTotalDuration(options.totalDurationSeconds, count);
  return [
    {
      role: 'system' as const,
      content: `你负责修复分镜 JSON。严格返回一个合法 JSON 对象，shots 必须恰好 ${count} 项，字段完整${style}。各镜头时长须按情节节奏分配且合计恰好 ${totalDuration} 秒；每个 imagePrompt 至少 80 个中文字符或同等信息量，结合原始大纲补足具体动作、表情、环境层次、构图、光线、色彩材质与氛围。不要 Markdown 或解释。`,
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
  const totalDuration = script.shots.reduce((sum, shot) => sum + shot.durationSeconds, 0);
  return [`片名：${script.title}`, `总时长：${totalDuration} 秒`, `视觉连续性：${script.visualContinuity}`, ...storyboardTextSegments(script)].join('\n\n');
}

export interface StoryboardImagePromptOptions {
  sheetAspectRatio?: string;
  cellAspectRatio?: string;
  referenceImageCount?: number;
  videoStyle?: StoryboardVideoStyle;
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
    options.videoStyle?.prompt ? `视频动画风格：${options.videoStyle.label}。${options.videoStyle.prompt}。所有镜头必须使用完全一致的媒介、渲染方式和美术语言。` : '',
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
