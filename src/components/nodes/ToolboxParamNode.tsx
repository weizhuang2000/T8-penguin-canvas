import { memo, useState, type CSSProperties } from 'react';
import { Handle, Position, useReactFlow, type Edge, type Node, type NodeProps } from '@xyflow/react';
import {
  Aperture,
  Camera,
  Clapperboard,
  Copy,
  Film,
  Palette,
  Play,
  RotateCcw,
  Sparkles,
  Sun,
  Wand2,
} from 'lucide-react';
import { useRunTrigger } from '../../hooks/useRunTrigger';
import { placeSingleNode } from '../../utils/nodePlacement';
import { useUpdateNodeData } from './useUpdateNodeData';

/**
 * ToolboxParamNode - 参数提供节点
 * 提供预设的 prompt 片段或运动模板,作为下游节点的提示词来源。
 *
 * 通过 data.kind 区分:
 *   - 'cinematic' = 电影感组合器(风格 / 镜头 / 光影 / 调色 / 质感)
 *   - 'video-motion' = 视频运镜组合器(场景 / 动作 / 路径 / 节奏 / 稳定 / 主体)
 *
 * 输出:data.prompt(下游通过 prompt 收集消费)
 */

type PromptLanguage = 'en' | 'zh';

interface Preset {
  id: string;
  label: string;
  text: string;
  zhText: string;
}

interface CinematicGroup {
  id: CinematicField;
  label: string;
  icon: React.ReactNode;
  items: Preset[];
}

interface MotionGroup {
  id: MotionField;
  label: string;
  icon: React.ReactNode;
  items: Preset[];
  columns?: number;
}

type CinematicField =
  | 'cinematicPresetId'
  | 'cinematicShotId'
  | 'cinematicLightId'
  | 'cinematicColorId'
  | 'cinematicTextureId';

type MotionField =
  | 'motionSceneId'
  | 'motionActionId'
  | 'motionPathId'
  | 'motionTempoId'
  | 'motionStabilityId'
  | 'motionSubjectId';

const CINEMATIC_PRESETS: Preset[] = [
  { id: 'soft-light', label: '柔光', text: 'soft cinematic lighting, golden hour, gentle shadows', zhText: '柔和电影光线，黄金时刻，温柔阴影' },
  { id: 'noir', label: '黑色电影', text: 'film noir style, high contrast, hard shadows, monochrome', zhText: '黑色电影风格，高反差，硬朗阴影，黑白影调' },
  { id: 'dreamy', label: '梦幻', text: 'dreamy soft focus, pastel palette, ethereal glow', zhText: '梦幻柔焦，粉彩色调，轻盈发光氛围' },
  { id: 'epic', label: '史诗', text: 'epic cinematic shot, dramatic lighting, ultra wide, IMAX', zhText: '史诗电影镜头，戏剧化光影，超宽画幅，IMAX 气势' },
  { id: 'vintage', label: '复古胶片', text: 'vintage 35mm film grain, faded colors, kodak portra', zhText: '复古 35mm 胶片颗粒，褪色色彩，柯达人像胶片感' },
  { id: 'cyberpunk', label: '赛博朋克', text: 'cyberpunk neon city, rain reflections, blade runner mood', zhText: '赛博朋克霓虹城市，雨夜反光，银翼杀手式氛围' },
  { id: 'japanese-film', label: '日影清透', text: 'Japanese cinema still, clean natural light, quiet emotional realism', zhText: '日系电影剧照，清透自然光，安静真实的情绪感' },
  { id: 'hongkong', label: '港风霓虹', text: 'Hong Kong cinema mood, neon signs, wet streets, rich urban atmosphere', zhText: '港风电影氛围，霓虹招牌，湿润街道，浓郁城市感' },
  { id: 'commercial', label: '广告大片', text: 'premium commercial film look, polished lighting, clean high-end composition', zhText: '高级广告片质感，精致布光，干净高级构图' },
  { id: 'dark-fantasy', label: '暗黑奇幻', text: 'dark fantasy cinematic atmosphere, mysterious shadows, painterly drama', zhText: '暗黑奇幻电影氛围，神秘阴影，绘画般戏剧张力' },
  { id: 'documentary', label: '纪录片', text: 'documentary film still, natural texture, authentic candid realism', zhText: '纪录片电影剧照，自然质地，真实抓拍感' },
  { id: 'romance', label: '浪漫暖调', text: 'romantic cinematic mood, warm backlight, soft glow, intimate atmosphere', zhText: '浪漫电影氛围，温暖逆光，柔和光晕，亲密感' },
  { id: 'western', label: '西部片', text: 'modern western film look, dusty sunlight, rugged cinematic atmosphere', zhText: '现代西部片质感，尘土阳光，粗粝电影氛围' },
  { id: 'suspense', label: '悬疑', text: 'suspense thriller atmosphere, tense framing, uneasy shadows', zhText: '悬疑惊悚氛围，紧张构图，不安阴影' },
  { id: 'sci-fi', label: '科幻', text: 'high-end science fiction film still, futuristic production design, clean cinematic scale', zhText: '高级科幻电影剧照，未来感美术设计，干净宏大的电影尺度' },
];

const CINEMATIC_GROUPS: CinematicGroup[] = [
  {
    id: 'cinematicShotId',
    label: '镜头',
    icon: <Camera size={12} />,
    items: [
      { id: 'extreme-close', label: '大特写', text: 'extreme close-up shot, intense detail, intimate emotion', zhText: '大特写镜头，细节强烈，情绪贴近' },
      { id: 'close-up', label: '特写', text: 'close-up portrait shot, expressive face, shallow depth of field', zhText: '人物特写，表情突出，浅景深' },
      { id: 'medium-shot', label: '半身', text: 'medium shot, character-focused framing, cinematic blocking', zhText: '半身镜头，人物主体明确，电影化调度' },
      { id: 'full-body', label: '全身', text: 'full body shot, clear silhouette, balanced character composition', zhText: '全身镜头，轮廓清晰，人物构图平衡' },
      { id: 'wide-shot', label: '远景', text: 'wide establishing shot, strong environment storytelling', zhText: '远景建立镜头，环境叙事强' },
      { id: 'ultra-wide', label: '超广角', text: 'ultra wide angle shot, expansive space, dramatic perspective', zhText: '超广角镜头，空间开阔，透视戏剧化' },
      { id: 'low-angle', label: '低角度', text: 'low angle shot, heroic perspective, powerful presence', zhText: '低角度镜头，英雄视角，存在感强' },
      { id: 'high-angle', label: '高角度', text: 'high angle shot, vulnerable mood, elegant composition', zhText: '高角度镜头，脆弱氛围，构图优雅' },
      { id: 'top-down', label: '俯拍', text: 'overhead top-down shot, graphic composition', zhText: '垂直俯拍，图形化构图' },
      { id: 'over-shoulder', label: '过肩', text: 'over-the-shoulder shot, conversational framing, cinematic depth', zhText: '过肩镜头，对话式构图，层次有深度' },
      { id: 'pov', label: '中景', text: 'medium shot, balanced subject and environment, clear narrative context', zhText: '中景镜头，人物与环境比例平衡，叙事空间清晰' },
      { id: 'dutch', label: '倾斜', text: 'Dutch angle shot, uneasy energy, stylized tension', zhText: '倾斜镜头，不稳定能量，风格化紧张感' },
      { id: 'macro', label: '微距', text: 'macro cinematic shot, tactile detail, shallow focus', zhText: '微距电影镜头，触感细节，浅焦' },
      { id: 'long-lens', label: '长焦', text: 'telephoto lens compression, creamy background separation', zhText: '长焦压缩空间，背景柔滑分离' },
      { id: 'symmetry', label: '对称', text: 'centered symmetrical composition, precise cinematic framing', zhText: '居中对称构图，精准电影画框' },
    ],
  },
  {
    id: 'cinematicLightId',
    label: '光影',
    icon: <Sun size={12} />,
    items: [
      { id: 'window', label: '窗光', text: 'soft window light, gentle falloff, natural indoor shadows', zhText: '柔和窗光，渐变自然，室内阴影真实' },
      { id: 'rim', label: '轮廓光', text: 'strong rim light, glowing edge highlights, cinematic silhouette', zhText: '强轮廓光，边缘高光发亮，电影化剪影' },
      { id: 'volumetric', label: '体积光', text: 'volumetric light beams, visible haze, atmospheric depth', zhText: '体积光束，可见薄雾，空间氛围深' },
      { id: 'hard-shadow', label: '硬阴影', text: 'hard directional light, bold shadow shapes, dramatic contrast', zhText: '硬质方向光，大块阴影形状，戏剧反差' },
      { id: 'neon', label: '霓虹', text: 'neon practical lights, colored reflections, night city ambience', zhText: '霓虹实景光，彩色反射，夜城氛围' },
      { id: 'overcast', label: '阴天柔光', text: 'overcast soft light, muted shadows, calm cinematic realism', zhText: '阴天柔光，阴影低调，平静真实电影感' },
      { id: 'candle', label: '烛光', text: 'warm candlelight, flickering highlights, intimate low-key mood', zhText: '温暖烛光，跳动高光，亲密低调氛围' },
      { id: 'backlight', label: '逆光', text: 'strong backlight, glowing atmosphere, translucent edges', zhText: '强逆光，空气发亮，边缘通透' },
      { id: 'spotlight', label: '聚光', text: 'single spotlight, theatrical focus, deep surrounding shadows', zhText: '单一聚光，舞台焦点，周围深暗' },
      { id: 'golden-hour', label: '金时刻', text: 'golden hour sunlight, long warm shadows, cinematic glow', zhText: '黄金时刻阳光，温暖长阴影，电影光晕' },
      { id: 'blue-hour', label: '蓝时刻', text: 'blue hour ambient light, cool dusk tone, soft city glow', zhText: '蓝调时刻环境光，冷色黄昏，城市微光' },
      { id: 'moonlight', label: '月光', text: 'moonlit night scene, cool silver highlights, quiet shadows', zhText: '月光夜景，冷银高光，安静阴影' },
      { id: 'practical', label: '实景灯', text: 'practical lights inside the frame, motivated cinematic lighting', zhText: '画面内实景灯光，有动机的电影布光' },
      { id: 'chiaroscuro', label: '明暗法', text: 'chiaroscuro lighting, sculpted face, deep painterly contrast', zhText: '明暗对照光，脸部雕塑感，深沉绘画反差' },
      { id: 'softbox', label: '柔光箱', text: 'large softbox lighting, clean skin highlights, controlled studio falloff', zhText: '大柔光箱布光，皮肤高光干净，棚拍渐变可控' },
    ],
  },
  {
    id: 'cinematicColorId',
    label: '调色',
    icon: <Palette size={12} />,
    items: [
      { id: 'teal-orange', label: '青橙', text: 'teal and orange color grade, cinematic skin tones', zhText: '青橙电影调色，肤色电影感' },
      { id: 'muted', label: '低饱和', text: 'muted color palette, restrained contrast, elegant film grade', zhText: '低饱和色彩，克制反差，优雅电影调色' },
      { id: 'warm', label: '暖金', text: 'warm golden color grade, sunlit highlights, soft amber tone', zhText: '暖金色调，阳光高光，柔和琥珀色' },
      { id: 'cool', label: '冷蓝', text: 'cool blue color grade, crisp shadows, clean cinematic contrast', zhText: '冷蓝色调，阴影清爽，电影反差干净' },
      { id: 'pastel', label: '粉彩', text: 'pastel color grade, soft highlights, delicate dreamy palette', zhText: '粉彩调色，高光柔软，精致梦幻色盘' },
      { id: 'bleach', label: '银漂', text: 'bleach bypass look, desaturated colors, strong contrast', zhText: '银漂效果，低饱和色彩，强反差' },
      { id: 'kodak-warm', label: '柯达暖', text: 'Kodak warm film grade, rich reds, creamy highlights', zhText: '柯达暖调胶片，红色浓郁，高光奶油感' },
      { id: 'moody-green', label: '冷绿', text: 'moody green shadows, cinematic cyan midtones, mysterious tone', zhText: '冷绿色阴影，青色中间调，神秘气质' },
      { id: 'candy', label: '糖果色', text: 'vibrant candy color grade, playful saturation, clean contrast', zhText: '鲜明糖果调色，活泼饱和，反差干净' },
      { id: 'monochrome', label: '黑白', text: 'fine monochrome film grade, rich grayscale, elegant contrast', zhText: '精致黑白胶片调色，灰阶丰富，反差优雅' },
      { id: 'sepia', label: '棕褐', text: 'sepia vintage tone, aged warmth, nostalgic atmosphere', zhText: '棕褐复古调，温暖旧时感，怀旧氛围' },
      { id: 'cyber-neon', label: '电光', text: 'electric neon color grade, saturated magenta and cyan, glossy night mood', zhText: '电光霓虹调色，高饱和品红与青色，光泽夜景' },
      { id: 'autumn', label: '秋色', text: 'autumn film palette, amber leaves, warm earthy tones', zhText: '秋季电影色盘，琥珀叶色，温暖大地色' },
      { id: 'silver-blue', label: '银蓝', text: 'silver blue color grade, cool metallic highlights, premium sci-fi tone', zhText: '银蓝调色，冷金属高光，高级科幻质感' },
      { id: 'high-key', label: '明亮', text: 'high-key bright color grade, airy whites, clean optimistic tone', zhText: '高调明亮调色，空气感白色，干净乐观氛围' },
    ],
  },
  {
    id: 'cinematicTextureId',
    label: '质感',
    icon: <Aperture size={12} />,
    items: [
      { id: '35mm', label: '35mm', text: 'shot on 35mm film, subtle film grain, organic texture', zhText: '35mm 胶片拍摄，细腻颗粒，有机质感' },
      { id: 'imax', label: 'IMAX', text: 'IMAX cinematic clarity, grand scale, high dynamic range', zhText: 'IMAX 电影清晰度，宏大尺度，高动态范围' },
      { id: 'kodak', label: '柯达', text: 'Kodak Portra inspired film stock, soft contrast, warm skin tones', zhText: '柯达 Portra 胶片感，反差柔和，肤色温暖' },
      { id: 'fuji', label: '富士', text: 'Fujifilm Eterna inspired film stock, smooth highlights, cinematic greens', zhText: '富士 Eterna 胶片感，高光顺滑，绿色电影感' },
      { id: 'anamorphic', label: '变宽银幕', text: 'anamorphic lens look, oval bokeh, subtle horizontal lens flare', zhText: '变宽银幕镜头感，椭圆焦外，轻微横向眩光' },
      { id: 'grain', label: '颗粒', text: 'fine film grain, natural texture, handcrafted cinematic finish', zhText: '细腻胶片颗粒，自然纹理，手作电影质感' },
      { id: 'clean-digital', label: '数字清晰', text: 'clean digital cinema look, crisp detail, controlled noise', zhText: '干净数字电影质感，细节清晰，噪点可控' },
      { id: 'vhs', label: 'VHS', text: 'subtle VHS texture, analog softness, nostalgic scanline feeling', zhText: '轻微 VHS 质感，模拟柔化，怀旧扫描线感' },
      { id: '16mm', label: '16mm', text: '16mm film texture, visible grain, intimate indie cinema mood', zhText: '16mm 胶片质感，颗粒可见，独立电影亲密感' },
      { id: 'matte', label: '哑光', text: 'matte cinematic finish, soft black levels, restrained highlights', zhText: '哑光电影质感，黑位柔和，高光克制' },
      { id: 'glossy', label: '高光泽', text: 'glossy premium finish, polished reflections, luxury commercial texture', zhText: '高光泽高级质感，反射精致，奢华广告片质地' },
      { id: 'halation', label: '光晕', text: 'film halation around highlights, glowing red-orange bloom', zhText: '胶片高光晕影，红橙色发光扩散' },
      { id: 'bokeh', label: '焦外', text: 'cinematic bokeh, creamy out-of-focus background, lens character', zhText: '电影焦外，奶油般虚化背景，镜头性格明显' },
      { id: 'lens-flare', label: '眩光', text: 'subtle lens flare, realistic glass reflections, cinematic optics', zhText: '轻微镜头眩光，真实玻璃反射，电影镜头光学感' },
      { id: 'hdr', label: 'HDR', text: 'HDR cinematic finish, rich highlight detail, deep shadow recovery', zhText: 'HDR 电影质感，高光细节丰富，暗部层次深' },
    ],
  },
];

const STRENGTH_PRESETS: Preset[] = [
  { id: 'subtle', label: '轻微', text: 'subtle cinematic enhancement, keep the original subject and realism', zhText: '轻微电影化增强，保留原主体和真实感' },
  { id: 'balanced', label: '标准', text: 'balanced cinematic look, polished but natural', zhText: '标准电影化质感，精致但自然' },
  { id: 'strong', label: '强烈', text: 'strong cinematic stylization, bold atmosphere and dramatic visual identity', zhText: '强烈电影风格化，氛围鲜明，视觉识别度高' },
];

const MOTION_SCENE_PRESETS: Preset[] = [
  { id: 'character-entry', label: '角色登场', text: 'cinematic character entrance, reveal the subject with confident movement', zhText: '角色登场镜头，用有气势的运动逐步揭示主体' },
  { id: 'product-showcase', label: '产品展示', text: 'premium product showcase movement, clean controlled camera path', zhText: '高级产品展示运镜，路径干净可控' },
  { id: 'emotion-push', label: '情绪推近', text: 'emotional push-in, gradually intensify the character feeling', zhText: '情绪推近，逐步强化人物情绪' },
  { id: 'orbit-reveal', label: '环绕展示', text: 'hero orbit reveal, show the subject from a dynamic surrounding angle', zhText: '主角式环绕展示，从动态角度呈现主体' },
  { id: 'world-reveal', label: '环境揭示', text: 'environment reveal shot, start intimate then open into the wider scene', zhText: '环境揭示镜头，从局部逐渐打开到更大场景' },
  { id: 'impact-action', label: '战斗冲击', text: 'impactful action camera move, energetic but readable motion', zhText: '战斗冲击运镜，有能量但画面可读' },
  { id: 'dream-drift', label: '梦幻漂移', text: 'dreamlike drifting camera, floating graceful movement', zhText: '梦幻漂移镜头，漂浮而优雅的运动' },
  { id: 'architecture-tour', label: '建筑巡游', text: 'architectural tour movement, glide through space with clear depth', zhText: '建筑巡游运镜，平滑穿行并展示空间层次' },
  { id: 'food-detail', label: '美食细节', text: 'food detail camera move, macro glide with appetizing focus', zhText: '美食细节运镜，微距滑动并突出诱人焦点' },
  { id: 'travel-drone', label: '旅行航拍', text: 'travel drone reveal, cinematic aerial movement over the scene', zhText: '旅行航拍揭示镜头，从空中电影化展示场景' },
  { id: 'dialogue-follow', label: '对话跟随', text: 'dialogue follow camera, natural human movement and stable framing', zhText: '对话跟随镜头，自然移动并保持构图稳定' },
  { id: 'transition-whip', label: '转场甩镜', text: 'whip pan transition energy, fast directional motion for a scene change', zhText: '甩镜转场能量，用快速方向运动衔接场景' },
];

const MOTION_ACTION_PRESETS: Preset[] = [
  { id: 'static', label: '静止', text: 'static locked-off shot, no camera movement', zhText: '固定机位，无镜头运动' },
  { id: 'zoom-in', label: '推近', text: 'slow dolly in toward the subject', zhText: '镜头缓慢向主体推进' },
  { id: 'zoom-out', label: '拉远', text: 'slow dolly out, revealing more of the scene', zhText: '镜头缓慢拉远，展示更多场景' },
  { id: 'pan-l', label: '左摇', text: 'smooth pan to the left', zhText: '镜头平滑向左摇动' },
  { id: 'pan-r', label: '右摇', text: 'smooth pan to the right', zhText: '镜头平滑向右摇动' },
  { id: 'tilt-up', label: '上摇', text: 'smooth tilt up, revealing height and scale', zhText: '镜头平滑上摇，揭示高度和尺度' },
  { id: 'tilt-down', label: '下摇', text: 'smooth tilt down, revealing the subject from above', zhText: '镜头平滑下摇，从上方揭示主体' },
  { id: 'orbit', label: '环绕', text: 'orbit around the subject with a clear circular camera move', zhText: '围绕主体环绕，运动轨迹清晰' },
  { id: 'tracking', label: '跟拍', text: 'tracking shot following the subject movement', zhText: '跟拍主体移动，保持连续跟随' },
  { id: 'dolly', label: '滑轨', text: 'smooth dolly track through the scene', zhText: '滑轨式平滑穿过场景' },
  { id: 'pedestal', label: '升降', text: 'vertical pedestal camera move, rising or descending smoothly', zhText: '垂直升降运镜，平滑上升或下降' },
  { id: 'aerial', label: '航拍', text: 'aerial drone camera movement with cinematic scale', zhText: '航拍镜头，带有电影化空间尺度' },
  { id: 'handheld', label: '手持', text: 'subtle handheld camera motion, alive but controlled', zhText: '轻微手持镜头，有生命感但可控' },
  { id: 'whip', label: '甩镜', text: 'fast whip pan motion with directional blur', zhText: '快速甩镜，带方向性运动模糊' },
  { id: 'crash-zoom', label: '急推', text: 'dramatic crash zoom, sudden emphasis on the subject', zhText: '戏剧化急推，突然强调主体' },
];

const MOTION_GROUPS: MotionGroup[] = [
  {
    id: 'motionPathId',
    label: '路径',
    icon: <Wand2 size={12} />,
    columns: 3,
    items: [
      { id: 'forward', label: '向前推进', text: 'move forward through the space', zhText: '穿过空间向前推进' },
      { id: 'backward', label: '向后拉开', text: 'pull backward to reveal the wider scene', zhText: '向后拉开，揭示更大场景' },
      { id: 'left-to-right', label: '左到右', text: 'travel from left to right across the frame', zhText: '从画面左侧移动到右侧' },
      { id: 'right-to-left', label: '右到左', text: 'travel from right to left across the frame', zhText: '从画面右侧移动到左侧' },
      { id: 'rise', label: '低处上升', text: 'rise from a low position into a broader view', zhText: '从低处上升到更开阔视角' },
      { id: 'descend', label: '高处下降', text: 'descend from above toward the subject', zhText: '从高处向主体下降' },
      { id: 'clockwise', label: '顺时针', text: 'circle clockwise around the subject', zhText: '顺时针围绕主体运动' },
      { id: 'counter-clockwise', label: '逆时针', text: 'circle counter-clockwise around the subject', zhText: '逆时针围绕主体运动' },
      { id: 'from-cover', label: '遮挡露出', text: 'reveal the subject from behind a foreground obstruction', zhText: '从前景遮挡后露出主体' },
      { id: 'detail-to-wide', label: '细节到全景', text: 'begin on a close detail and open into a wide view', zhText: '从近处细节打开到全景' },
      { id: 'wide-to-detail', label: '全景到细节', text: 'begin wide and move into a specific detail', zhText: '从全景推进到具体细节' },
      { id: 'through-space', label: '穿越空间', text: 'move through layers of the environment with depth', zhText: '穿过环境层次，表现空间深度' },
      { id: 'parallel-follow', label: '平行跟随', text: 'move parallel with the subject at matching speed', zhText: '与主体平行移动并保持速度一致' },
      { id: 'diagonal', label: '斜向推进', text: 'move diagonally toward the subject for dynamic depth', zhText: '斜向推进主体，增加动态纵深' },
      { id: 'arc', label: '弧线移动', text: 'move along a gentle arc path', zhText: '沿柔和弧线路径移动' },
    ],
  },
  {
    id: 'motionTempoId',
    label: '节奏',
    icon: <Sparkles size={12} />,
    columns: 3,
    items: [
      { id: 'very-slow', label: '极慢', text: 'very slow movement, calm and deliberate', zhText: '极慢运动，安静而克制' },
      { id: 'slow', label: '慢速', text: 'slow cinematic movement', zhText: '慢速电影化运动' },
      { id: 'standard', label: '标准', text: 'natural medium-speed camera movement', zhText: '自然中速运镜' },
      { id: 'fast', label: '快速', text: 'fast energetic camera movement while keeping the subject readable', zhText: '快速有能量的运镜，同时保持主体可读' },
      { id: 'accelerate', label: '加速', text: 'gradually accelerate the camera movement', zhText: '镜头运动逐渐加速' },
      { id: 'decelerate', label: '减速', text: 'gradually slow down into the final frame', zhText: '逐渐减速并落到最终画面' },
      { id: 'ease', label: '缓入缓出', text: 'smooth ease-in and ease-out motion', zhText: '平滑缓入缓出运动' },
      { id: 'sudden-stop', label: '突然停顿', text: 'end with a controlled sudden stop for emphasis', zhText: '以可控的突然停顿强化重点' },
      { id: 'oner', label: '一镜到底', text: 'single continuous take, no cuts', zhText: '一镜到底，不切镜头' },
    ],
  },
  {
    id: 'motionStabilityId',
    label: '稳定',
    icon: <Aperture size={12} />,
    columns: 3,
    items: [
      { id: 'stabilizer', label: '稳定器', text: 'smooth gimbal-stabilized camera movement', zhText: '稳定器般平滑运镜' },
      { id: 'subtle-handheld', label: '轻手持', text: 'subtle handheld motion, organic and controlled', zhText: '轻微手持感，自然且可控' },
      { id: 'strong-handheld', label: '强手持', text: 'energetic handheld motion with intentional shake', zhText: '强手持运动，有意图的抖动感' },
      { id: 'drone', label: '无人机', text: 'drone-like stabilized aerial motion', zhText: '无人机般稳定的空中运动' },
      { id: 'slider', label: '滑轨', text: 'clean slider movement with precise linear motion', zhText: '干净滑轨运动，线性精准' },
      { id: 'crane', label: '摇臂', text: 'crane-style camera move with elegant vertical sweep', zhText: '摇臂式运镜，优雅纵向扫动' },
      { id: 'telephoto', label: '长焦压缩', text: 'telephoto compression, smooth background separation', zhText: '长焦压缩空间，背景分离平滑' },
      { id: 'wide-angle', label: '广角空间', text: 'wide-angle spatial movement, strong depth and scale', zhText: '广角空间运镜，纵深和尺度强' },
      { id: 'no-shake', label: '无抖动', text: 'no unwanted shake, no jitter, keep motion clean', zhText: '无多余抖动，无跳动，保持运动干净' },
    ],
  },
  {
    id: 'motionSubjectId',
    label: '主体',
    icon: <Camera size={12} />,
    columns: 3,
    items: [
      { id: 'centered', label: '主体居中', text: 'keep the subject centered in frame', zhText: '保持主体居中' },
      { id: 'face-clear', label: '脸部清晰', text: 'keep the face clear and readable', zhText: '保持脸部清晰可读' },
      { id: 'follow-person', label: '跟随人物', text: 'follow the person naturally without losing framing', zhText: '自然跟随人物，不丢失构图' },
      { id: 'surround-subject', label: '围绕主体', text: 'move around the subject while maintaining focus', zhText: '围绕主体移动并保持焦点' },
      { id: 'reveal-background', label: '揭示背景', text: 'reveal the background while keeping the subject important', zhText: '揭示背景，同时保持主体重要性' },
      { id: 'detail-emphasis', label: '强调细节', text: 'emphasize key details with controlled motion', zhText: '用可控运动强调关键细节' },
      { id: 'stable-framing', label: '构图稳定', text: 'keep composition stable and balanced', zhText: '保持构图稳定平衡' },
      { id: 'no-cuts', label: '不切镜', text: 'avoid cuts, keep one continuous camera move', zhText: '避免切镜，保持连续运镜' },
      { id: 'no-warp', label: '不变形', text: 'avoid warping, melting, or drifting subject geometry', zhText: '避免主体变形、融化或漂移' },
    ],
  },
];

function findPreset(items: Preset[], id?: string): Preset | undefined {
  if (!id) return undefined;
  return items.find((item) => item.id === id);
}

function presetText(preset: Preset | undefined, lang: PromptLanguage) {
  if (!preset) return '';
  return lang === 'zh' ? preset.zhText : preset.text;
}

function buildCinematicPrompt(
  data: any,
  patch: Partial<Record<CinematicField | 'cinematicStrength' | 'cinematicCustom' | 'cinematicLanguage', string>> = {},
) {
  const next = { ...data, ...patch };
  const lang: PromptLanguage = next.cinematicLanguage === 'zh' ? 'zh' : 'en';
  const baseId = next.cinematicPresetId || next.presetId;
  const strengthId = next.cinematicStrength || 'balanced';
  const parts = [
    presetText(findPreset(CINEMATIC_PRESETS, baseId), lang),
    ...CINEMATIC_GROUPS.map((group) => presetText(findPreset(group.items, next[group.id]), lang)),
    presetText(findPreset(STRENGTH_PRESETS, strengthId), lang),
    typeof next.cinematicCustom === 'string' ? next.cinematicCustom.trim() : '',
  ].filter(Boolean);

  return parts.join(lang === 'zh' ? '，' : ', ');
}

function buildMotionPrompt(
  data: any,
  patch: Partial<Record<MotionField | 'motionCustom' | 'motionLanguage', string>> = {},
) {
  const next = { ...data, ...patch };
  const lang: PromptLanguage = next.motionLanguage === 'zh' ? 'zh' : 'en';
  const actionId = next.motionActionId || next.presetId;
  const parts = [
    presetText(findPreset(MOTION_SCENE_PRESETS, next.motionSceneId), lang),
    presetText(findPreset(MOTION_ACTION_PRESETS, actionId), lang),
    ...MOTION_GROUPS.map((group) => presetText(findPreset(group.items, next[group.id]), lang)),
    typeof next.motionCustom === 'string' ? next.motionCustom.trim() : '',
  ].filter(Boolean);

  return parts.join(lang === 'zh' ? '，' : ', ');
}

const chipClass = 't8-btn min-h-7 min-w-0 px-1.5 text-[10px] leading-none whitespace-nowrap overflow-hidden text-ellipsis';
const miniChipClass = 't8-btn min-h-6 min-w-0 px-1 text-[9px] leading-none whitespace-nowrap overflow-hidden text-ellipsis';
const miniControlStyle: CSSProperties = {
  width: 28,
  minWidth: 28,
  height: 26,
  minHeight: 26,
  padding: 0,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: '1.5px solid var(--t8-border-strong, var(--t8-border))',
  borderRadius: 999,
  background: 'var(--t8-bg-panel-elevated)',
  color: 'var(--t8-text-main)',
  boxShadow: 'none',
  fontSize: 10,
  fontWeight: 800,
  lineHeight: 1,
  letterSpacing: 0,
  cursor: 'pointer',
};
const miniControlActiveStyle: CSSProperties = {
  ...miniControlStyle,
  background: 'var(--t8-accent)',
  color: 'var(--t8-accent-text)',
};
const miniIconControlStyle: CSSProperties = {
  ...miniControlStyle,
  width: 26,
  minWidth: 26,
};

interface MotionPreviewShape {
  d: string;
  dot: [number, number];
  subject: boolean;
}

function motionPreviewShape(key?: string): MotionPreviewShape {
  switch (key || 'forward') {
    case 'static':
    case 'locked-off':
      return { d: 'M108 34 C122 34 138 34 152 34', dot: [152, 34], subject: true };
    case 'zoom-in':
    case 'crash-zoom':
    case 'forward':
    case 'wide-to-detail':
    case 'through-space':
      return { d: 'M82 34 C112 34 146 34 178 34', dot: [178, 34], subject: true };
    case 'zoom-out':
    case 'backward':
    case 'detail-to-wide':
      return { d: 'M178 34 C146 34 112 34 82 34', dot: [82, 34], subject: true };
    case 'pan-l':
    case 'right-to-left':
      return { d: 'M190 34 C154 30 110 30 72 34', dot: [72, 34], subject: false };
    case 'pan-r':
    case 'left-to-right':
      return { d: 'M72 34 C108 30 152 30 190 34', dot: [190, 34], subject: false };
    case 'tilt-up':
    case 'pedestal':
    case 'rise':
      return { d: 'M132 54 C134 42 136 28 138 14', dot: [138, 14], subject: true };
    case 'tilt-down':
    case 'descend':
      return { d: 'M138 14 C136 28 134 42 132 54', dot: [132, 54], subject: true };
    case 'orbit':
    case 'clockwise':
    case 'counter-clockwise':
    case 'surround-subject':
      return { d: 'M112 34 C126 12 174 12 188 34 C174 56 126 56 112 34', dot: [188, 34], subject: true };
    case 'tracking':
    case 'dolly':
    case 'parallel-follow':
      return { d: 'M68 40 C108 24 148 44 194 28', dot: [194, 28], subject: true };
    case 'aerial':
      return { d: 'M78 54 C104 22 154 18 196 16', dot: [196, 16], subject: true };
    case 'handheld':
    case 'strong-handheld':
      return { d: 'M70 36 C94 20 112 50 136 30 C156 14 168 54 190 34', dot: [190, 34], subject: true };
    case 'whip':
    case 'transition-whip':
      return { d: 'M58 38 C100 18 150 54 204 28', dot: [204, 28], subject: false };
    case 'from-cover':
      return { d: 'M72 46 C102 46 126 24 158 28 C176 30 190 34 204 34', dot: [204, 34], subject: true };
    case 'arc':
    case 'diagonal':
      return { d: 'M70 52 C104 18 150 18 194 30', dot: [194, 30], subject: true };
    default:
      return { d: 'M74 34 C104 34 150 34 190 34', dot: [190, 34], subject: true };
  }
}

function motionPreviewPath(actionId?: string, pathId?: string) {
  const baseKey = actionId || pathId || 'forward';
  const base = motionPreviewShape(baseKey);
  const overlay = actionId && pathId && pathId !== actionId ? motionPreviewShape(pathId) : null;
  return { ...base, overlay };
}

function motionPresetLabel(items: Preset[], id?: string) {
  return id ? items.find((item) => item.id === id)?.label || '' : '';
}

function motionPathLabel(id?: string) {
  return motionPresetLabel(MOTION_GROUPS.find((group) => group.id === 'motionPathId')?.items || [], id);
}

function MotionRoutePreview({ actionId, pathId }: { actionId?: string; pathId?: string }) {
  const preview = motionPreviewPath(actionId, pathId);
  const actionLabel = motionPresetLabel(MOTION_ACTION_PRESETS, actionId);
  const pathLabel = motionPathLabel(pathId);
  return (
    <div className="t8-card px-2.5 py-2 space-y-1.5">
      <div className="flex items-center gap-1.5 text-[11px] font-bold" style={{ color: 'var(--t8-text-muted)' }}>
        <Camera size={12} />
        路线预览
        <span className="ml-auto max-w-[150px] truncate text-[10px] font-semibold" style={{ color: 'var(--t8-text-dim)' }}>
          {[actionLabel || '默认', pathLabel].filter(Boolean).join(' + ')}
        </span>
      </div>
      <svg viewBox="0 0 260 72" className="w-full h-16 block" aria-hidden="true">
        <rect x="7" y="8" width="246" height="56" rx="18" fill="var(--t8-bg-panel-muted)" opacity="0.68" />
        <path
          d="M22 54 C68 14 196 14 238 54"
          fill="none"
          stroke="var(--t8-grid-line)"
          strokeWidth="1"
          strokeDasharray="5 6"
          opacity="0.55"
        />
        {preview.subject && (
          <g opacity="0.95">
            <circle cx="132" cy="34" r="12" fill="var(--t8-bg-panel-elevated)" stroke="var(--t8-border-strong)" strokeWidth="2" />
            <circle cx="132" cy="34" r="4" fill="var(--t8-accent)" />
          </g>
        )}
        <path d={preview.d} fill="none" stroke="var(--t8-accent)" strokeWidth="5" strokeLinecap="round" opacity="0.28" />
        <path d={preview.d} fill="none" stroke="var(--t8-accent)" strokeWidth="2.5" strokeLinecap="round" />
        <circle cx={preview.dot[0]} cy={preview.dot[1]} r="5" fill="var(--t8-secondary)" stroke="var(--t8-bg-panel)" strokeWidth="2" />
        {preview.overlay && (
          <>
            <path
              d={preview.overlay.d}
              fill="none"
              stroke="var(--t8-secondary)"
              strokeWidth="4"
              strokeLinecap="round"
              strokeDasharray="7 6"
              opacity="0.22"
            />
            <path
              d={preview.overlay.d}
              fill="none"
              stroke="var(--t8-secondary)"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeDasharray="7 6"
              opacity="0.82"
            />
            <circle cx={preview.overlay.dot[0]} cy={preview.overlay.dot[1]} r="4" fill="var(--t8-secondary)" opacity="0.78" />
          </>
        )}
      </svg>
    </div>
  );
}

const ToolboxParamNode = (p: NodeProps) => {
  const update = useUpdateNodeData(p.id);
  const rf = useReactFlow();
  const d = p.data as any;
  const kind: 'cinematic' | 'video-motion' | string = d?.kind || 'cinematic';
  const prompt: string = d?.prompt || '';
  const [error, setError] = useState('');

  const cinematicLang: PromptLanguage = d?.cinematicLanguage === 'zh' ? 'zh' : 'en';
  const motionLang: PromptLanguage = d?.motionLanguage === 'zh' ? 'zh' : 'en';
  const selectedMotionActionId: string | undefined = d?.motionActionId || d?.presetId;
  const selectedMotionSceneId: string | undefined = d?.motionSceneId;
  const selectedMotionPathId: string | undefined = d?.motionPathId;
  const selectedBaseId: string | undefined = d?.cinematicPresetId || d?.presetId;
  const selectedStrength = d?.cinematicStrength || 'balanced';

  const updateCinematic = (patch: Partial<Record<CinematicField | 'cinematicStrength' | 'cinematicCustom' | 'cinematicLanguage', string>>) => {
    const promptText = buildCinematicPrompt(d, patch);
    const next: Record<string, string> = { ...patch, prompt: promptText };
    if (patch.cinematicPresetId) next.presetId = patch.cinematicPresetId;
    if (patch.cinematicLanguage) next.cinematicLanguage = patch.cinematicLanguage;
    update(next);
    setError('');
  };

  const clearCinematic = () => {
    update({
      presetId: '',
      cinematicPresetId: '',
      cinematicShotId: '',
      cinematicLightId: '',
      cinematicColorId: '',
      cinematicTextureId: '',
      cinematicStrength: 'balanced',
      cinematicCustom: '',
      cinematicLanguage: 'en',
      prompt: '',
    });
    setError('');
  };

  const updateMotion = (patch: Partial<Record<MotionField | 'motionCustom' | 'motionLanguage', string>>) => {
    const promptText = buildMotionPrompt(d, patch);
    const next: Record<string, string> = { ...patch, prompt: promptText };
    if (patch.motionActionId) next.presetId = patch.motionActionId;
    if (patch.motionLanguage) next.motionLanguage = patch.motionLanguage;
    update(next);
    setError('');
  };

  const clearMotion = () => {
    update({
      presetId: '',
      motionSceneId: '',
      motionActionId: '',
      motionPathId: '',
      motionTempoId: '',
      motionStabilityId: '',
      motionSubjectId: '',
      motionCustom: '',
      motionLanguage: 'en',
      prompt: '',
    });
    setError('');
  };

  const copyPrompt = () => {
    if (!prompt || typeof navigator === 'undefined' || !navigator.clipboard) return;
    navigator.clipboard.writeText(prompt).catch(() => undefined);
  };

  const handleRun = async () => {
    const finalPrompt = String((p.data as any)?.prompt || prompt || '').trim();
    if (!finalPrompt) {
      const msg = kind === 'cinematic' ? '请先选择电影感风格或填写自定义补充' : '请先选择运镜动作或填写自定义补充';
      setError(msg);
      throw new Error(msg);
    }
    setError('');
    const nodes = rf.getNodes();
    const edges = rf.getEdges();
    const downstreamOutputIds = new Set(
      edges
        .filter((e) => e.source === p.id)
        .map((e) => nodes.find((n) => n.id === e.target))
        .filter((n): n is Node => !!n && n.type === 'output')
        .map((n) => n.id),
    );

    if (downstreamOutputIds.size > 0) {
      rf.setNodes((nds) =>
        nds.map((n) => {
          if (!downstreamOutputIds.has(n.id)) return n;
          const nd = (n.data as any) || {};
          if (nd.directOutputText === finalPrompt) return n;
          return { ...n, data: { ...nd, directOutputText: finalPrompt } };
        }),
      );
      return;
    }

    const me = rf.getNode(p.id);
    const myW = (me as any)?.measured?.width || (me as any)?.width || (kind === 'cinematic' ? 620 : 540);
    const baseX = (me?.position?.x ?? 0) + myW + 80;
    const baseY = me?.position?.y ?? 0;
    const pos = placeSingleNode(baseX, baseY, 'output', nodes, { source: `placement:toolbox-output:${p.id}` });
    const ts = Date.now();
    const newId = `output-auto-toolbox-${p.id}-${ts}-${Math.random().toString(36).slice(2, 6)}`;
    const newNode: Node = {
      id: newId,
      type: 'output',
      position: pos,
      data: { directOutputText: finalPrompt },
      selected: false,
    } as Node;
    const newEdge: Edge = {
      id: `e-auto-toolbox-${newId}`,
      source: p.id,
      target: newId,
      type: 'deletable',
    } as Edge;
    rf.addNodes(newNode);
    rf.setEdges((eds) => [...eds, newEdge]);
  };

  useRunTrigger(p.id, handleRun);

  if (kind === 'video-motion') {
    return (
      <div
        className={`t8-node relative transition-all ${p.selected ? 'ring-2 ring-violet-300' : ''}`}
        style={{ width: 540, maxWidth: 540 }}
      >
        <Handle type="source" position={Position.Right} style={{ background: 'var(--t8-accent)', border: 0 }} />

        <div className="t8-node-header flex items-center gap-2 px-3 py-2 rounded-t-[inherit]">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{
              background: 'color-mix(in srgb, var(--t8-accent) 18%, var(--t8-bg-panel-elevated))',
              color: 'var(--t8-accent)',
              boxShadow: 'inset 0 0 0 1px var(--t8-accent)',
            }}
          >
            <Film size={15} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold">视频运镜组合器</div>
            <div className="text-[10px] truncate" style={{ color: 'var(--t8-text-dim)' }}>
              场景 / 动作 / 路径 / 节奏 / 稳定
            </div>
          </div>
          <div className="flex items-center gap-1">
            {(['en', 'zh'] as PromptLanguage[]).map((item) => (
              <button
                key={item}
                type="button"
                style={motionLang === item ? miniControlActiveStyle : miniControlStyle}
                title={item === 'en' ? '输出英文 prompt' : '输出中文 prompt'}
                onClick={() => updateMotion({ motionLanguage: item })}
              >
                {item === 'en' ? 'EN' : '中'}
              </button>
            ))}
            <button
              type="button"
              style={miniIconControlStyle}
              title="清空"
              aria-label="清空视频运镜设置"
              onClick={clearMotion}
            >
              <RotateCcw size={13} />
            </button>
          </div>
        </div>

        <div className="p-3 space-y-3 nodrag" onPointerDown={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
          <section className="space-y-1.5">
            <div className="flex items-center gap-1.5 text-[11px] font-bold" style={{ color: 'var(--t8-text-muted)' }}>
              <Clapperboard size={12} />
              成片场景
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {MOTION_SCENE_PRESETS.map((ps) => (
                <button
                  key={ps.id}
                  type="button"
                  onClick={() => updateMotion({ motionSceneId: selectedMotionSceneId === ps.id ? '' : ps.id })}
                  className={`${chipClass} ${selectedMotionSceneId === ps.id ? 't8-btn-primary' : ''}`}
                  title={ps.label}
                >
                  {ps.label}
                </button>
              ))}
            </div>
          </section>

          <div className="grid grid-cols-[1.35fr_1fr] gap-2">
            <section className="t8-card p-2 space-y-1.5">
              <div className="flex items-center gap-1.5 text-[11px] font-bold" style={{ color: 'var(--t8-text-muted)' }}>
                <Camera size={12} />
                运镜动作
              </div>
              <div className="grid grid-cols-3 gap-1">
                {MOTION_ACTION_PRESETS.map((ps) => (
                  <button
                    key={ps.id}
                    type="button"
                    onClick={() => updateMotion({ motionActionId: selectedMotionActionId === ps.id ? '' : ps.id })}
                    className={`${miniChipClass} ${selectedMotionActionId === ps.id ? 't8-btn-primary' : ''}`}
                    title={ps.label}
                  >
                    {ps.label}
                  </button>
                ))}
              </div>
            </section>

            <MotionRoutePreview actionId={selectedMotionActionId} pathId={selectedMotionPathId} />
          </div>

          <div className="grid grid-cols-2 gap-2">
            {MOTION_GROUPS.map((group) => {
              const selectedId = d?.[group.id] || '';
              return (
                <section key={group.id} className="t8-card p-2 space-y-1.5">
                  <div className="flex items-center gap-1.5 text-[11px] font-bold" style={{ color: 'var(--t8-text-muted)' }}>
                    {group.icon}
                    {group.label}
                  </div>
                  <div className={`grid gap-1 ${group.columns === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
                    {group.items.map((ps) => (
                      <button
                        key={ps.id}
                        type="button"
                        onClick={() => updateMotion({ [group.id]: selectedId === ps.id ? '' : ps.id })}
                        className={`${miniChipClass} ${selectedId === ps.id ? 't8-btn-primary' : ''}`}
                        title={ps.label}
                      >
                        {ps.label}
                      </button>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>

          <label className="t8-card p-2 space-y-1.5 block">
            <span className="flex items-center gap-1.5 text-[11px] font-bold" style={{ color: 'var(--t8-text-muted)' }}>
              <Film size={12} />
              自定义补充
            </span>
            <input
              className="t8-input w-full h-8 px-2 text-[11px]"
              value={d?.motionCustom || ''}
              placeholder="如慢动作、镜头穿过雨幕、不要切镜..."
              onChange={(e) => updateMotion({ motionCustom: e.target.value })}
            />
          </label>

          <div className="t8-card px-2.5 py-2 text-[10px] leading-relaxed">
            <div className="flex items-center gap-2 mb-1" style={{ color: 'var(--t8-text-dim)' }}>
              <Sparkles size={10} />
              <span className="font-bold">输出到下游 prompt</span>
              <button
                type="button"
                className="ml-auto"
                title="复制输出文本"
                aria-label="复制输出文本"
                onClick={copyPrompt}
                disabled={!prompt}
                style={{
                  ...miniIconControlStyle,
                  width: 24,
                  minWidth: 24,
                  height: 24,
                  minHeight: 24,
                  opacity: prompt ? 1 : 0.45,
                  cursor: prompt ? 'pointer' : 'not-allowed',
                }}
              >
                <Copy size={11} />
              </button>
            </div>
            <div className="min-h-[40px] max-h-24 overflow-y-auto pr-1 break-words" style={{ color: prompt ? 'var(--t8-text-main)' : 'var(--t8-text-dim)' }}>
              {prompt || '选择成片场景，再叠加运镜动作、路径、节奏和主体约束。'}
            </div>
          </div>

          <button type="button" className="t8-btn t8-btn-primary w-full min-h-9 text-xs" onClick={handleRun}>
            <Play size={13} fill="currentColor" />
            运行输出文本
          </button>
          {error && <div className="text-[10px]" style={{ color: 'var(--t8-danger, #ef4444)' }}>{error}</div>}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`t8-node relative transition-all ${p.selected ? 'ring-2 ring-pink-300' : ''}`}
      style={{ width: 620, maxWidth: 620 }}
    >
      <Handle type="source" position={Position.Right} style={{ background: 'var(--t8-accent)', border: 0 }} />

      <div className="t8-node-header flex items-center gap-2 px-3 py-2 rounded-t-[inherit]">
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center"
          style={{
            background: 'color-mix(in srgb, var(--t8-secondary) 18%, var(--t8-bg-panel-elevated))',
            color: 'var(--t8-secondary)',
            boxShadow: 'inset 0 0 0 1px var(--t8-secondary)',
          }}
        >
          <Clapperboard size={15} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold">电影感组合器</div>
          <div className="text-[10px] truncate" style={{ color: 'var(--t8-text-dim)' }}>
            风格 / 镜头 / 光影 / 调色 / 质感
          </div>
        </div>
        <div className="flex items-center gap-1">
          {(['en', 'zh'] as PromptLanguage[]).map((item) => (
            <button
              key={item}
              type="button"
              style={cinematicLang === item ? miniControlActiveStyle : miniControlStyle}
              title={item === 'en' ? '输出英文 prompt' : '输出中文 prompt'}
              onClick={() => updateCinematic({ cinematicLanguage: item })}
            >
              {item === 'en' ? 'EN' : '中'}
            </button>
          ))}
          <button
            type="button"
            style={miniIconControlStyle}
            title="清空"
            aria-label="清空电影感设置"
            onClick={clearCinematic}
          >
            <RotateCcw size={13} />
          </button>
        </div>
      </div>

      <div className="p-3 space-y-3 nodrag" onPointerDown={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
        <section className="space-y-1.5">
          <div className="flex items-center gap-1.5 text-[11px] font-bold" style={{ color: 'var(--t8-text-muted)' }}>
            <Wand2 size={12} />
            成片风格
          </div>
          <div className="grid grid-cols-5 gap-1.5">
            {CINEMATIC_PRESETS.map((ps) => (
              <button
                key={ps.id}
                type="button"
                onClick={() => updateCinematic({ cinematicPresetId: ps.id })}
                className={`${chipClass} ${selectedBaseId === ps.id ? 't8-btn-primary' : ''}`}
                title={ps.label}
              >
                {ps.label}
              </button>
            ))}
          </div>
        </section>

        <div className="grid grid-cols-2 gap-2">
          {CINEMATIC_GROUPS.map((group) => {
            const selectedId = d?.[group.id] || '';
            return (
              <section key={group.id} className="t8-card p-2 space-y-1.5">
                <div className="flex items-center gap-1.5 text-[11px] font-bold" style={{ color: 'var(--t8-text-muted)' }}>
                  {group.icon}
                  {group.label}
                </div>
                <div className="grid grid-cols-3 gap-1">
                  {group.items.map((ps) => (
                    <button
                      key={ps.id}
                      type="button"
                      onClick={() => updateCinematic({ [group.id]: selectedId === ps.id ? '' : ps.id })}
                      className={`${miniChipClass} ${selectedId === ps.id ? 't8-btn-primary' : ''}`}
                      title={ps.label}
                    >
                      {ps.label}
                    </button>
                  ))}
                </div>
              </section>
            );
          })}
        </div>

        <section className="grid grid-cols-[1fr_1.45fr] gap-2">
          <div className="t8-card p-2 space-y-1.5">
            <div className="flex items-center gap-1.5 text-[11px] font-bold" style={{ color: 'var(--t8-text-muted)' }}>
              <Sparkles size={12} />
              强度
            </div>
            <div className="grid grid-cols-3 gap-1">
              {STRENGTH_PRESETS.map((ps) => (
                <button
                  key={ps.id}
                  type="button"
                  onClick={() => updateCinematic({ cinematicStrength: ps.id })}
                  className={`${miniChipClass} ${selectedStrength === ps.id ? 't8-btn-primary' : ''}`}
                >
                  {ps.label}
                </button>
              ))}
            </div>
          </div>

          <label className="t8-card p-2 space-y-1.5 block">
            <span className="flex items-center gap-1.5 text-[11px] font-bold" style={{ color: 'var(--t8-text-muted)' }}>
              <Film size={12} />
              自定义补充
            </span>
            <input
              className="t8-input w-full h-8 px-2 text-[11px]"
              value={d?.cinematicCustom || ''}
              placeholder="如雨夜、宫崎骏、冷白皮..."
              onChange={(e) => updateCinematic({ cinematicCustom: e.target.value })}
            />
          </label>
        </section>

        <div className="t8-card px-2.5 py-2 text-[10px] leading-relaxed">
          <div className="flex items-center gap-2 mb-1" style={{ color: 'var(--t8-text-dim)' }}>
            <Sparkles size={10} />
            <span className="font-bold">输出到下游 prompt</span>
            <button
              type="button"
              className="ml-auto"
              title="复制输出文本"
              aria-label="复制输出文本"
              onClick={copyPrompt}
              disabled={!prompt}
              style={{
                ...miniIconControlStyle,
                width: 24,
                minWidth: 24,
                height: 24,
                minHeight: 24,
                opacity: prompt ? 1 : 0.45,
                cursor: prompt ? 'pointer' : 'not-allowed',
              }}
            >
              <Copy size={11} />
            </button>
          </div>
          <div className="min-h-[40px] max-h-24 overflow-y-auto pr-1 break-words" style={{ color: prompt ? 'var(--t8-text-main)' : 'var(--t8-text-dim)' }}>
            {prompt || '选择一个成片风格，再叠加镜头、光影、调色或质感。'}
          </div>
        </div>

        <button type="button" className="t8-btn t8-btn-primary w-full min-h-9 text-xs" onClick={handleRun}>
          <Play size={13} fill="currentColor" />
          运行输出文本
        </button>
        {error && <div className="text-[10px]" style={{ color: 'var(--t8-danger, #ef4444)' }}>{error}</div>}
      </div>
    </div>
  );
};

export default memo(ToolboxParamNode);
