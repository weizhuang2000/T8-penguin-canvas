'use strict';

const SKILL_SOURCE = Object.freeze({
  name: 'remotion-best-practices',
  pluginVersion: '1.0.3',
  snapshot: '11c74d6b',
  repository: 'https://github.com/remotion-dev/remotion/tree/main/packages/codex-plugin',
  license: 'MIT',
});

const P = Object.freeze({PLAN: 'plan', CODE: 'code', REPAIR: 'repair', REVIEW: 'review'});
const ALL_PHASES = Object.freeze([P.PLAN, P.CODE, P.REPAIR, P.REVIEW]);

const definitions = [
  ['3d', 'disabled', ['3d', 'three', 'threejs', '三维', '3D'], [], '42cef6d68fb4a266ab495d35df0c60e03672b0d85c043f9b567f6aa7ff00dd0d', '', '当前未内置 @remotion/three 与 React Three Fiber，改用二维景深、视差和缩放营造空间感。'],
  ['animations', 'enabled', ['animation', 'animate', '动画', '动效'], ALL_PHASES, 'd9ee77603e83316355788b1418cde5cdb0370efe0be21bb0a66eaa26c3bd26d7', '所有运动必须由 useCurrentFrame() 驱动，并用 useVideoConfig() 的 fps 将秒换算为帧。禁止 CSS animation、CSS transition 和 Tailwind 动画类。'],
  ['assets', 'enabled', ['asset', '素材', '图片', '视频', '音频'], ALL_PHASES, '68b70928aaea682165f33dc8e98278d9dca8512b50e44abc2c884ee5f3ac78de', '只使用提交的素材 ID。TSX 通过 assets.find() 获取并用 staticFile(`assets/${asset.src}`) 引用；禁止远程 URL、绝对路径和 data URL 字面量。'],
  ['audio', 'enabled', ['audio', 'music', 'sound', '音频', '音乐', '配乐'], ALL_PHASES, 'e931664ac23bc4acfa137d8b415702bb4860b4fbabd6caed0042c0902d3bec90', '音频使用 @remotion/media 的 Audio，由 Sequence 控制起点和时长；音量回调用帧插值做淡入淡出，避免突兀截断。'],
  ['audio-visualization', 'disabled', ['audio visualization', 'waveform', 'spectrum', 'audiogram', '频谱', '波形', '音频可视化'], [], '0f4043de86639b6390e5ab888eaa66a24a10a8bd540f1443327cb88107eae1e9', '', '当前未内置媒体采样依赖，改用与节奏一致的受控装饰图形，不声称它们是真实频谱。'],
  ['calculate-metadata', 'adapted', ['metadata', 'duration', 'dimensions', '元数据', '时长', '尺寸'], [P.PLAN, P.CODE, P.REPAIR], '7d6217deed7425c6662e8d112b933be162a99a9f26a5c10b7c0b2ba62329a269', '外层 Composition 的尺寸、FPS 和总帧数由节点 Profile 统一提供。生成组件不得创建 Composition、registerRoot 或覆盖 profile。'],
  ['can-decode', 'adapted', ['decode', 'codec', '兼容', '解码', '编码'], [P.PLAN, P.CODE], 'd2323cc4f2a884a09d167f31a4fcb36bd94adf1002de88b99bd9af1a2bc5ed71', '媒体兼容性由后端在暂存后探测。代码只消费已授权的本地素材；如果元数据带有 probeWarning，应选择保守的静态或静音替代。'],
  ['charts', 'enabled', ['chart', 'graph', 'data', 'bar', 'line', 'pie', '图表', '数据', '趋势', '柱状', '折线', '饼图'], ALL_PHASES, 'c6863bd1122f53f80c2211fbe19bc5e3db8a38a5d43473748da8067af10fcf29', '图表使用 @t8/remotion-kit 或原生 SVG；数值、描边和柱高都由当前帧驱动，标签、颜色、坐标与数据必须清晰一致。'],
  ['compositions', 'adapted', ['composition', 'still', '构图', '画幅'], [P.PLAN, P.CODE, P.REPAIR], '3223ce9326048ef734fe880e5ddbd33e75e12dc4deb7f6043c58d11329d47f31', '只命名导出 GeneratedComposition 组件。外层 Composition 已固定处理画幅、FPS、总时长和默认 props，生成源码不得再次注册根组件。'],
  ['display-captions', 'adapted', ['caption', 'subtitle', 'karaoke', '字幕', '标题词', '逐词'], ALL_PHASES, '20b8898a90536fa427a5a39571fc7deac7bde96c4c7bfdf413eee1ef4ef85530', '字幕使用 @t8/remotion-kit 的 CaptionTrack 和受控 Caption JSON。每页保持短句、安全区、可读对比度，并可按 timestampMs 做逐词高亮。'],
  ['extract-frames', 'adapted', ['frame extraction', 'thumbnail', 'filmstrip', '抽帧', '关键帧', '缩略图'], [P.PLAN, P.REVIEW], '771eb211c58130b2e4533dfec87abe584a2070c1d3dd0a0d6f16d2bb85dd237f', '视频抽帧由后端多模态链路完成，生成 TSX 不得使用 canvas、fetch 或自行解码视频。规划和审片应利用已提供的关键帧理解镜头。'],
  ['ffmpeg', 'adapted', ['ffmpeg', 'ffprobe', '转码', '探测'], [P.PLAN, P.REVIEW], 'b67ff4e3ce01c48241ef92fa165398d427e9f676ae8e17d1ed19d5584bff5002', 'FFmpeg 仅在后端受控子进程中用于媒体探测、抽帧和静音分析。生成源码不得调用 shell、进程或文件系统。'],
  ['fonts', 'adapted', ['font', 'typography', '字体', '排版'], ALL_PHASES, '1749e4cf82e8b157d4b0a26f46721152d3ef9e5e9a1686753b8bb6a1be83ddbc', '仅使用系统字体栈；中文优先 "Microsoft YaHei","PingFang SC","Noto Sans CJK SC",sans-serif。禁止运行时下载 Google Fonts 或写入远程字体 URL。'],
  ['get-audio-duration', 'adapted', ['audio duration', '音频时长'], [P.PLAN, P.CODE], '720a5346ae79555e933498995d5cb04d1bfbeeee7232436d8835c3ec17d46281', '使用后端提供的音频 duration 元数据规划 Sequence；缺失时不得猜测精确节拍，应采用循环或保守裁切。'],
  ['get-video-dimensions', 'adapted', ['video dimensions', 'resolution', '视频尺寸', '分辨率'], [P.PLAN, P.CODE], 'ed1bb6e0ae742e4bfcb18e7c50af23fc782a9d699b90d367250437c7f6da7304', '根据后端提供的 width/height 选择 contain 或 cover，并保护主体与画幅安全区；不要在 TSX 中探测 DOM 或视频文件。'],
  ['get-video-duration', 'adapted', ['video duration', '视频时长'], [P.PLAN, P.CODE], 'ed594a0d73a5274483f21c30e612aba57089d5bbc5437041aa32d07a8e789fd9', '使用后端提供的媒体 duration 规划裁切、循环和场景时长；不得让素材越过节点权威总时长。'],
  ['gifs', 'disabled', ['gif', 'apng', 'animated webp', '动图'], [], 'db5d84bb8da4c52c133cdc9820a5b6995db94a548df5f9838efb8d1224065787', '', '当前未内置 Remotion GIF 解码组件，使用静态首帧或普通视频素材替代。'],
  ['images', 'enabled', ['image', 'photo', 'picture', '图片', '照片', '海报'], ALL_PHASES, '833e0a038d7c158f58b39f9bca7efafbbc4b944a54b3ae1c95e0d5973345e22c', '图片只使用 remotion 的 Img 或 @t8/remotion-kit 的 KenBurnsMedia；禁止原生 img 和 CSS background-image。运镜应克制并保留主体。'],
  ['import-srt-captions', 'adapted', ['srt', '字幕文件', '字幕文本'], [P.PLAN, P.CODE, P.REPAIR], 'ad89cc1834dcd63ff225593f699611a1a20b57eff4ed8e587f429b36516ec82c', 'SRT 在后端解析为 Caption JSON 后再进入提示词。代码只消费解析后的 text/startMs/endMs/timestampMs/confidence 字段。'],
  ['light-leaks', 'disabled', ['light leak', '漏光', '光泄漏'], [], '17d2f136f7bf2f438274a0ade43df017c360ae31175d8367ce476415c222dfca', '', '当前未内置 @remotion/light-leaks，改用 @t8/remotion-kit 的渐变、暗角和受控遮罩营造光感。'],
  ['lottie', 'disabled', ['lottie', 'bodymovin'], [], '6dd0a845f5cea9c0f3d2465b5678a16076f5778ad1a628abbf387dba0b929cbb', '', '当前未内置 Lottie 运行时，改用 SVG、形状和帧插值实现同类图形动画。'],
  ['maps', 'disabled', ['mapbox', 'map animation', '地图', '路线动画', '轨迹'], [], '5a531e1c925c58c4aa019c33bf2b6c0412560af3359295ab080f33e063e01d61', '', '当前不允许 Mapbox token、外网瓦片和 WebGL 地图，改用提交的地图图片或本地 SVG 路径。'],
  ['measuring-dom-nodes', 'adapted', ['measure', 'layout', 'overflow', '测量', '布局', '溢出'], [P.CODE, P.REPAIR, P.REVIEW], '4017103b03f14a041ac433be78c521ec2e9961629fae419c8b196d349637585b', '生成源码不得访问 document/window。优先使用 SafeArea、FitText、固定网格和可预测尺寸，最终由六帧审片检查溢出。'],
  ['measuring-text', 'adapted', ['fit text', 'text measure', '文字适配', '文本测量', '溢出'], ALL_PHASES, '5cab1807b9ae9f5be3fc0e1cb0e0513a69451e31e32657d6a665573331db6807', '长文本使用 FitText、最大宽度、显式行高和行数限制。不要依赖运行时网络字体；关键帧审片必须检查截断、重叠和安全区。'],
  ['parameters', 'adapted', ['parameter', 'props', 'schema', '参数', '属性'], [P.CODE, P.REPAIR], '9de38837a07dc406052dfbb759c58ca5298ca331d86d9aa0f4e177b339e288b5', '组件输入固定为 {assets, profile, subject}，不得扩展外部 schema。对缺失值提供确定性默认值，并以 profile 为尺寸、FPS 和总时长权威。'],
  ['sequencing', 'enabled', ['sequence', 'series', 'timeline', '场景', '分镜', '时间线'], ALL_PHASES, '7c18f2ac36974fd7b85c01efa1135ea06a14e8492dd9fe82ced3bec0b4bb605d', '用 Sequence、Series 或 TransitionSeries 管理时间线；Sequence 设置合理 premountFor，内部 useCurrentFrame() 按局部时间工作。'],
  ['sfx', 'adapted', ['sfx', 'sound effect', '音效', '提示音'], [P.PLAN, P.CODE, P.REVIEW], '96fcc4f0973b5ed5cd9cd0d4d0479c642984cfacd8010fc7d6186c468296626b', '音效只能引用用户提交的 audio 素材，不得搜索或引用远程音效。用 Sequence 精确对齐动作，并控制音量避免削波。'],
  ['silence-detection', 'adapted', ['silence', 'remove silence', '静音', '去停顿', '删除空白'], [P.PLAN, P.CODE], 'ed95d46d078f3749b87ec3c6e25c1c5b0c8485fdcb41156d649266369748fdc2', '静音区间由后端 FFmpeg 只读分析并作为 metadata.silenceRanges 提供。TSX 只据此安排裁切，不得调用 FFmpeg。'],
  ['subtitles', 'adapted', ['subtitle', 'caption', '字幕', '台词'], ALL_PHASES, '9f18ec4a9c88adf35d51b44aaf344442443fd687a4dc948366ebb683fc3ecd30', '字幕统一使用 Caption JSON：text、startMs、endMs、timestampMs、confidence。字幕必须位于安全区并与画面保持足够对比。'],
  ['tailwind', 'disabled', ['tailwind', 'utility class', '原子类'], [], '6212ce72abe5eaee0eb41822b2cdf944b77ad9b082426909beb2da07151e1788', '', '生成工程未启用 Tailwind 扫描，改用受控内联样式；仍禁止 transition-* 和 animate-*。'],
  ['text-animations', 'enabled', ['typewriter', 'kinetic text', 'highlight', '文字动画', '打字机', '高亮'], ALL_PHASES, '40ac6b1bccf1c57d9edd46c74e847ec6e86fe775d3ef4fd14e1338f4a2606171', '打字机使用字符串 slice，禁止逐字符 opacity；可使用 TypewriterText、WordHighlight、KineticText 和 WordReveal 构建层级清晰的文字动画。'],
  ['timing', 'enabled', ['timing', 'easing', 'spring', '节奏', '缓动', '弹簧'], ALL_PHASES, 'd7df8f74a08a86ff019cbd3bf528dd9d9528ae1860be70d54b3334544d6b36a7', '数值运动使用 interpolate() 配合双侧 clamp 和 Easing.bezier；颜色必须使用 interpolateColors()。入场减速、退场加速，共享时间应先计算 0..1 进度再映射属性。'],
  ['transcribe-captions', 'disabled', ['transcribe', 'whisper', 'speech to text', '语音转写', '自动字幕'], [], 'ad1a62af35fe176b37ac4d98f796451ca66bcc9983207a9710ec3eca6e847738', '', '当前未内置 Whisper，不能从音频自动转写；需要用户提交字幕文本或 SRT。'],
  ['transitions', 'enabled', ['transition', 'scene change', '转场', '切场', '场景切换'], ALL_PHASES, 'f6b0ca21322d68ab516345e8d57a2039c48654c98604b673913382c854e79d86', '多场景优先使用 TransitionSeries；转场会重叠并缩短总时长，必须从场景总帧数中扣除。转场服务叙事，避免每场使用不同花哨效果。'],
  ['transparent-videos', 'disabled', ['transparent video', 'alpha video', 'webm', 'prores', '透明视频', '透明通道'], [], '394ccda476e084522d544471fee92d7c65672e2cbaf2201a785c3dd5c74f31a4', '', '当前输出契约仅支持 H.264/AAC MP4，不生成透明 WebM 或 ProRes。'],
  ['trimming', 'enabled', ['trim', 'cut', 'clip', '裁切', '截取', '剪辑'], [P.PLAN, P.CODE, P.REPAIR], 'ae00948f6a903e384c7c312896adba9b50ed592f24a5a090699b7345849b36b9', '使用 Sequence 的负 from 裁掉开头，用 durationInFrames 限制结尾；裁切后仍要保证素材和场景不越过总时间线。'],
  ['videos', 'enabled', ['video', 'footage', '视频', '镜头'], ALL_PHASES, 'd9d3032a57f92c759daf0bd60b3282f6810ecc9958e9093a6b828de623b05328', '视频使用 @remotion/media 的 Video，按需设置 trimBefore、trimAfter、loop、muted、volume、playbackRate 和 objectFit；不支持反向播放。'],
  ['voiceover', 'disabled', ['voiceover', 'tts', 'elevenlabs', '旁白', '配音', '语音合成'], [], '60340034cf422052007183d031171b3c88422dd3fe85f0d915283dd8ec5df3e8', '', '当前节点不调用外部 TTS。生成无配音版本，并以字幕或用户提交的音频素材承载叙事。'],
];

const RULE_CATALOG = Object.freeze(Object.fromEntries(definitions.map(([id, support, triggers, phases, sha256, prompt, reason]) => [id, Object.freeze({
  id,
  sourceFile: `rules/${id}.md`,
  sha256,
  tags: Object.freeze([...triggers]),
  triggers: Object.freeze([...triggers]),
  phases: Object.freeze([...phases]),
  support,
  requires: Object.freeze([]),
  prompt,
  reason: reason || undefined,
})])));

module.exports = {ALL_PHASES, P, RULE_CATALOG, SKILL_SOURCE};
