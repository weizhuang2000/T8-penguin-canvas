import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildShowcaseInteriorDesignPrompt,
  colorMaterialTextFromPreset,
  normalizeShowcaseExhibitItems,
  normalizeShowcaseStyle,
} from '../src/utils/showcaseInteriorDesignPromptData.js';

test('showcase prompt includes four showcase dimensions and cap switch in Chinese', () => {
  const withCap = buildShowcaseInteriorDesignPrompt({
    showcaseStyle: {
      widthMm: 1200,
      baseHeightMm: 300,
      glassHeightMm: 1400,
      capHeightMm: 180,
      hasCap: true,
    },
  });
  assert.match(withCap, /展柜宽度：1200 mm/);
  assert.match(withCap, /底座高度：300 mm/);
  assert.match(withCap, /玻璃区高度：1400 mm/);
  assert.match(withCap, /柜帽：开启，柜帽高度 180 mm/);
  assert.match(withCap, /推导总高度：1880 mm/);
  assert.match(withCap, /比例要求：展柜宽度、底座高度、玻璃区高度、柜帽高度必须形成可信比例；玻璃区应是主要陈列空间，底座承托稳定。/);
  assert.match(withCap, /画面比例硬约束：展柜整体外框宽高比必须接近 1200:1880（宽\/高≈0\.64）/);
  assert.match(withCap, /完整展柜外框必须全部落在画面内，顶部柜帽、底部底座和左右边框都不能被裁切或超出画布/);
  assert.match(withCap, /底座高度约占总高度 16%/);
  assert.match(withCap, /玻璃区高度约占总高度 74\.5%/);
  assert.match(withCap, /柜帽高度约占总高度 9\.6%/);
  assert.doesNotMatch(withCap, /柜帽仅在开启时出现/);

  const withoutCap = buildShowcaseInteriorDesignPrompt({
    showcaseStyle: { widthMm: 1200, baseHeightMm: 300, glassHeightMm: 1400, capHeightMm: 180, hasCap: false },
  });
  assert.match(withoutCap, /推导总高度：1700 mm/);
  assert.match(withoutCap, /顶部形式：透明玻璃顶/);
  assert.match(withoutCap, /顶部不安装任何灯具、灯带或射灯/);
  assert.match(withoutCap, /顶部必须是通透玻璃顶/);
  assert.doesNotMatch(withoutCap, /柜帽/);

  assert.deepEqual(normalizeShowcaseStyle({}), {
    widthMm: 1200,
    baseHeightMm: 300,
    glassHeightMm: 1400,
    capHeightMm: 180,
    hasCap: false,
    hasBodyPattern: false,
  });
});

test('showcase prompt disables body patterns by default and keeps current logic when enabled', () => {
  const withoutPattern = buildShowcaseInteriorDesignPrompt({
    showcaseStyle: { hasCap: true, hasBodyPattern: false },
  });
  assert.match(withoutPattern, /柜体图案：关闭/);
  assert.match(withoutPattern, /柜体、底座、边框、柜帽都不要出现图案、纹样、花纹/);

  const withoutPatternAndCap = buildShowcaseInteriorDesignPrompt({
    showcaseStyle: { hasCap: false, hasBodyPattern: false },
  });
  assert.match(withoutPatternAndCap, /柜体图案：关闭/);
  assert.match(withoutPatternAndCap, /柜体、底座、边框和顶部玻璃连接构件都不要出现图案、纹样、花纹/);
  assert.doesNotMatch(withoutPatternAndCap, /柜帽/);

  const withPattern = buildShowcaseInteriorDesignPrompt({
    showcaseStyle: { hasCap: true, hasBodyPattern: true },
  });
  assert.doesNotMatch(withPattern, /柜体图案：关闭/);
  assert.doesNotMatch(withPattern, /都不要出现图案/);
});

test('showcase prompt keeps exhibit order and display height in millimeters', () => {
  const items = normalizeShowcaseExhibitItems([
    { url: '/files/input/a.png', label: '青铜器', heightMm: 420 },
    { url: '/files/input/b.png', label: '陶俑', heightMm: 260 },
  ]);
  assert.deepEqual(items.map((item) => item.heightMm), [420, 260]);
  assert.deepEqual(items.map((item) => item.supportHeightMm), [150, 150]);
  assert.deepEqual(items.map((item) => item.heritageLevel), ['unrated', 'unrated']);

  const prompt = buildShowcaseInteriorDesignPrompt({ exhibitItems: items, showcaseStyle: { widthMm: 1200, glassHeightMm: 1400 } });
  const promptWithCap = buildShowcaseInteriorDesignPrompt({ exhibitItems: items, showcaseStyle: { widthMm: 1200, glassHeightMm: 1400, hasCap: true } });
  assert.ok(prompt.indexOf('1. @img1：展品主体目标高度 420 mm') < prompt.indexOf('2. @img2：展品主体目标高度 260 mm'));
  assert.match(promptWithCap, /展柜宽度、底座高度、玻璃区高度、柜帽高度和柜体总高度保持设定尺寸不变/);
  assert.match(prompt, /参考图顺序：@img1 = 展品 1，@img2 = 展品 2，以此类推。必须按这个顺序匹配展品参考图、展托高度和文物级别。/);
  assert.match(prompt, /陈列行数：1 行。所有展品默认按单排横向陈列/);
  assert.match(prompt, /不要做前后错排、多排纵深、上下分层或阶梯式多层展架/);
  assert.doesNotMatch(prompt, /尺寸合成参考图/);
  assert.doesNotMatch(prompt, /第 2 张参考图 = 展品 1/);
  assert.match(prompt, /严格比例规则/);
  assert.match(prompt, /展品视角要求/);
  assert.match(prompt, /侧视图或正侧视图/);
  assert.match(prompt, /保持平视/);
  assert.match(prompt, /倾斜旋转/);
  assert.match(prompt, /生图时展品本体显示高度必须按用户设定的展品主体目标高度生成/);
  assert.match(prompt, /展柜宽度、底座高度、玻璃区高度和柜体总高度保持设定尺寸不变/);
  assert.match(prompt, /顶部保持透明玻璃顶，不安装任何灯具、灯带或射灯/);
  assert.doesNotMatch(prompt, /柜帽高度/);
  assert.doesNotMatch(prompt, /柜帽：开启/);
  assert.match(prompt, /不要给任何展品本体标注尺寸数字/);
  assert.match(prompt, /展品主体目标高度只指参考图中主要物体\/展品本体的可见垂直高度，不包含整张图片画幅/);
  assert.match(prompt, /不得为了构图、焦点或视觉美观而随意放大或缩小/);
  assert.match(prompt, /保留充足柜内空白，为以后继续放置其它展品预留空间/);
  assert.match(prompt, /@img1 对应参考图顺序中的展品 1/);
  assert.match(prompt, /不要给展品 1 标注 420 mm/);
  assert.match(prompt, /尺寸复核：生成前必须逐项核对 展品 1 主体高度 420 mm；展品 2 主体高度 260 mm/);
  assert.match(prompt, /展品 1 展托高度 150 mm；展品 2 展托高度 150 mm/);
  assert.match(prompt, /展品主体高度和展托高度都必须与上述设置一致/);
  assert.match(prompt, /不得按构图、画面留白、文件尺寸或模型偏好擅自改大改小/);
  assert.match(prompt, /尺度换算：展品 1 的主体高度 420 mm 约占玻璃区高度 1400 mm 的 30%/);
  assert.match(prompt, /展托高度 150 mm 约占玻璃区高度的 10\.7%/);
  assert.doesNotMatch(prompt, /青铜器：展品主体目标高度/);
  assert.doesNotMatch(prompt, /陶俑：展品主体目标高度/);
  assert.doesNotMatch(prompt, /参考图 URL/);
  assert.doesNotMatch(prompt, /\/files\/input\/a\.png/);
  assert.doesNotMatch(prompt, /比例校验：展品/);
  assert.doesNotMatch(prompt, /上限约束：展品/);
  assert.doesNotMatch(prompt, /本体可见高度不得超过其主体目标高度/);
  assert.doesNotMatch(prompt, /70%/);
  assert.doesNotMatch(prompt, /生图显示高度/);
  assert.doesNotMatch(prompt, /显示高度约为展柜宽度/);
  assert.match(prompt, /相对尺寸审计/);
  assert.match(prompt, /如果高度数值相同，最终展品本体必须显示为相同高度/);

  const legacy = normalizeShowcaseExhibitItems([{ url: '/files/input/legacy.png', maxSideMm: 188 }]);
  assert.equal(legacy[0].heightMm, 188);
  assert.equal(legacy[0].supportHeightMm, 150);
  assert.equal(legacy[0].heritageLevel, 'unrated');
});

test('showcase prompt supports automatic support height strategies and heritage levels', () => {
  const exhibitItems = [
    { url: '/files/input/a.png', label: '青铜器', heightMm: 420, supportHeightMm: 260, heritageLevel: 'first' },
    { url: '/files/input/b.png', label: '陶俑', heightMm: 260, supportHeightMm: 120, heritageLevel: 'third' },
    { url: '/files/input/c.png', label: '玉佩', heightMm: 420, supportHeightMm: 80, heritageLevel: 'unrated' },
  ];
  const inputMode = buildShowcaseInteriorDesignPrompt({ exhibitItems, supportHeightMode: 'input' });
  assert.match(inputMode, /展托高度策略：按照输入尺寸/);
  assert.match(inputMode, /文物级别：一级；展托高度：260 mm/);
  assert.match(inputMode, /文物级别：三级；展托高度：120 mm/);
  assert.match(inputMode, /文物级别：未评级；展托高度：80 mm/);
  assert.match(inputMode, /必须绘制可见展托\/托座\/支架/);
  assert.match(inputMode, /展品 1、3 的主体高度同为 420 mm，最终画面中的展品本体可见高度必须完全一致/);
  assert.match(inputMode, /不得因为参考图构图、器型细长、留白、位置靠边或视觉焦点不同而把其中某一件画得更高/);

  const modelValue = buildShowcaseInteriorDesignPrompt({ exhibitItems, supportHeightMode: 'model-value' });
  assert.match(modelValue, /参考图顺序：@img1 = 展品 1，@img2 = 展品 2，以此类推。必须按这个顺序匹配展品参考图、展托高度和文物级别。/);
  assert.match(modelValue, /展托高度策略：模型按展品价值自动判断/);
  assert.match(modelValue, /根据每件展品的珍贵程度、视觉主次、材质和形态判断展托高度/);
  assert.match(modelValue, /价值高的展品展托更高一点，位置更靠中间/);
  assert.match(modelValue, /文物级别：一级；展托高度：由模型根据展品价值自动判断/);
  assert.match(modelValue, /展托高度按当前策略判断，但不能反向改变展品主体高度/);

  const multiRows = buildShowcaseInteriorDesignPrompt({ exhibitItems, supportHeightMode: 'input', arrangementRows: 2 });
  assert.match(multiRows, /陈列行数：2 行。必须按前后纵深排列，不是上下分层、不是多层层板/);
  assert.match(multiRows, /第 1 行为前排，后续行依次位于更靠后的深度位置/);
  assert.match(multiRows, /后排展托必须逐排升高以越过前排遮挡/);
  assert.match(multiRows, /展柜进深必须明显加大/);
  assert.match(multiRows, /不能因为后排展托更高就放大展品本体/);
  assert.match(multiRows, /排列复核：当前为 2 行陈列/);
  assert.match(multiRows, /后排展托高度必须高于前排展托/);

  const heritageLevel = buildShowcaseInteriorDesignPrompt({ exhibitItems, supportHeightMode: 'heritage-level' });
  assert.match(heritageLevel, /参考图顺序：@img1 = 展品 1，@img2 = 展品 2，以此类推。必须按这个顺序匹配展品参考图、展托高度和文物级别。/);
  assert.match(heritageLevel, /高度策略：根据文物级别组织/);
  assert.match(heritageLevel, /展品主体高度和展托高度都由模型按文物级别、展品价值和柜内视觉秩序判断/);
  assert.match(heritageLevel, /一级文物优先放在中间或视觉核心区，展品更突出，展托更高、更稳重/);
  assert.match(heritageLevel, /二级文物次之/);
  assert.match(heritageLevel, /三级文物和未评级展品可更低或偏侧/);
  assert.match(heritageLevel, /1\. @img1\n/);
  assert.match(heritageLevel, /文物级别：一级；展品主体高度和展托高度均由模型按该级别判断，不使用输入高度数值/);
  assert.match(heritageLevel, /文物级别：三级；展品主体高度和展托高度均由模型按该级别判断，不使用输入高度数值/);
  assert.match(heritageLevel, /当前为按文物级别模式，不输出也不使用每件展品的输入主体高度和输入展托高度/);
  assert.match(heritageLevel, /不要按输入高度数值排序/);
  assert.match(heritageLevel, /展品视觉高度按文物级别、展品价值和柜内视觉秩序判断/);
  assert.doesNotMatch(heritageLevel, /展品主体目标高度 420 mm/);
  assert.doesNotMatch(heritageLevel, /展品主体目标高度 260 mm/);
  assert.doesNotMatch(heritageLevel, /展托高度：260 mm/);
  assert.doesNotMatch(heritageLevel, /展托高度：120 mm/);
  assert.doesNotMatch(heritageLevel, /主体高度 420 mm/);
});

test('showcase prompt switches dimension marks and exploded view requirements', () => {
  const marked = buildShowcaseInteriorDesignPrompt({ showcaseStyle: { hasCap: true }, perspectiveEnabled: true, dimensionMarksEnabled: true, explodedViewEnabled: true });
  assert.match(marked, /透视效果：开启/);
  assert.match(marked, /尺寸标注：开启/);
  assert.match(marked, /所有标注必须使用用户设定尺寸/);
  assert.match(marked, /不标注展品本体尺寸/);
  assert.match(marked, /分解爆炸图：开启/);
  assert.match(marked, /柜体、玻璃罩、底座、柜帽、托架、展品、灯光组件/);

  const markedWithoutCap = buildShowcaseInteriorDesignPrompt({ perspectiveEnabled: true, dimensionMarksEnabled: true, explodedViewEnabled: true });
  assert.match(markedWithoutCap, /柜体、玻璃罩、底座、透明玻璃顶、托架和展品/);
  assert.match(markedWithoutCap, /顶部仍为玻璃且不安装任何灯具、灯带或射灯/);
  assert.doesNotMatch(markedWithoutCap, /柜帽高度/);
  assert.doesNotMatch(markedWithoutCap, /柜帽：开启/);

  const unmarked = buildShowcaseInteriorDesignPrompt({ perspectiveEnabled: false, dimensionMarksEnabled: false, explodedViewEnabled: false });
  assert.match(unmarked, /透视效果：关闭/);
  assert.match(unmarked, /画面框定：完整展柜必须居中完整入画/);
  assert.match(unmarked, /可以缩小整柜在画面中的占比，但不能改变展柜宽高比和各分段高度比例/);
  assert.match(unmarked, /完全平面的正立面\/二维方案效果/);
  assert.match(unmarked, /不要任何 3D 透视/);
  assert.match(unmarked, /所有水平线和垂直线必须保持平行/);
  assert.match(unmarked, /尺寸标注：关闭/);
  assert.match(unmarked, /展品视觉高度按展品主体目标高度，展柜尺寸不变/);
  assert.match(unmarked, /分解爆炸图：关闭/);
  assert.match(unmarked, /完整组装后的柜内陈列效果图/);
});

test('showcase prompt supports empty exhibit fallback modes', () => {
  const search = buildShowcaseInteriorDesignPrompt({
    exhibitItems: [],
    emptyExhibitMode: 'search',
    emptyExhibitQuery: '汉代陶俑',
  });
  assert.match(search, /当前选择：自动搜索相关展品/);
  assert.match(search, /展品搜索\/生成关键词：汉代陶俑/);
  assert.match(search, /自动寻找或生成可信的相关展品外观/);
  assert.match(search, /展品视角要求/);
  assert.match(search, /侧视图或正侧视图/);
  assert.match(search, /不要俯拍、仰拍、斜拍、倾斜摆放/);
  assert.doesNotMatch(search, /当前选择：空展柜/);

  const empty = buildShowcaseInteriorDesignPrompt({
    exhibitItems: [],
    emptyExhibitMode: 'empty',
  });
  assert.match(empty, /当前选择：空展柜/);
  assert.match(empty, /没有展品的空展柜内部设计效果/);
  assert.match(empty, /不要自动添加展品/);
  assert.doesNotMatch(empty, /自动搜索相关展品/);
});

test('showcase prompt supports manual layout mode without auto height scaling', () => {
  const prompt = buildShowcaseInteriorDesignPrompt({
    layoutMode: 'manual',
    showcaseStyle: { widthMm: 1500, glassHeightMm: 1400 },
    exhibitItems: [
      { url: '/files/input/a.png', label: '青铜器', heightMm: 420 },
      { url: '/files/input/b.png', label: '陶俑', heightMm: 260 },
    ],
    manualLayoutItems: [
      { url: '/files/input/a.png', label: '青铜器', xMm: 120, yMm: 300, widthMm: 180, heightMm: 240, zIndex: 2 },
      { url: '/files/input/b.png', label: '陶俑', xMm: 520, yMm: 360, widthMm: 150, heightMm: 210, zIndex: 1 },
    ],
    hasColorMaterialReferenceImage: true,
  });
  assert.match(prompt, /手动排版模式/);
  assert.match(prompt, /手动排版合成图/);
  assert.match(prompt, /第 1 张参考图 = 手动排版合成图/);
  assert.match(prompt, /不要再把展品原图逐张当作独立参考图理解/);
  assert.match(prompt, /展品视角要求/);
  assert.match(prompt, /侧视图或正侧视图、平视角度/);
  assert.match(prompt, /不要倾斜摆放/);
  assert.match(prompt, /玻璃区正投影模板/);
  assert.match(prompt, /必须保持合成图中每个展品的像素占比/);
  assert.match(prompt, /排版窗口中每个展品的垂直位置直接对应它在玻璃区内的实际展示高度/);
  assert.match(prompt, /每件展品下面使用独立展托、托座或支架托举到排版窗口指定高度/);
  assert.match(prompt, /必须把展托画成清晰可见的实体构件/);
  assert.match(prompt, /展托必须从底座或层板连续连接到展品底部/);
  assert.match(prompt, /不要隐藏展托、不要把展托做成完全透明不可见/);
  assert.match(prompt, /青铜器：顶部距玻璃区顶部 300 mm，展品显示高度 240 mm，展品底边距玻璃区底部 860 mm；下方必须绘制可见展托，展托高度约 860 mm/);
  assert.match(prompt, /陶俑：顶部距玻璃区顶部 360 mm，展品显示高度 210 mm，展品底边距玻璃区底部 830 mm；下方必须绘制可见展托，展托高度约 830 mm/);
  assert.match(prompt, /必须用不同高度的可见展托承接各展品底边/);
  assert.match(prompt, /不要出现悬浮展品/);
  assert.match(prompt, /不得重新居中/);
  assert.match(prompt, /不得自动适配画面/);
  assert.match(prompt, /不要套用自动尺寸模式中的“展品主体目标高度 mm”规则/);
  assert.match(prompt, /宽 1500 mm，高 1400 mm/);
  assert.match(prompt, /第 2 张参考图 = 色彩材质参考图/);
  assert.doesNotMatch(prompt, /左上角 x=/);
  assert.doesNotMatch(prompt, /显示宽度 150 mm/);
  assert.doesNotMatch(prompt, /参考图 URL/);
  assert.doesNotMatch(prompt, /生图显示高度 294 mm/);
  assert.doesNotMatch(prompt, /本体显示高度按设定高度的 70% 生成/);
  assert.doesNotMatch(prompt, /展品视觉高度按设定高度的 70%/);
});

test('showcase prompt separates exhibit images from color material reference', () => {
  const prompt = buildShowcaseInteriorDesignPrompt({
    exhibitItems: [{ url: '/files/input/exhibit.png', label: '展品图', heightMm: 300 }],
    colorMaterialPresetText: '深灰金属、暖光、低反射玻璃',
    manualColorMaterial: '背板使用细腻织物肌理',
    colorMaterialReferenceTone: '主色调：深蓝、香槟金',
    hasColorMaterialReferenceImage: true,
  });
  assert.match(prompt, /普通 image 输入均视为展品图/);
  assert.match(prompt, /独立 color-material-reference 输入/);
  assert.match(prompt, /排在所有展品图之后/);
  assert.match(prompt, /它不是展品图/);
  assert.match(prompt, /不得套用任何展品高度尺寸/);
  assert.match(prompt, /共享色彩与材质预设作为次级补充/);
  assert.match(prompt, /手动色彩与材质补充/);
  assert.match(prompt, /@img1：展品主体目标高度 300 mm/);
  assert.doesNotMatch(prompt, /@img1 展品图：展品主体目标高度 300 mm/);
});

test('showcase color material preset keeps only color and material constraints', () => {
  const presetText = colorMaterialTextFromPreset({
    core: '主色为深灰金属，香槟金收边，禁止使用龙纹图案',
    features: '材质为低反射玻璃、磨砂亚克力；需要金色文字标题和 logo',
    usage: '背板使用织物肌理；加入云纹符号',
    info: 'warm light, matte metal, pattern of waves, typography system',
  });
  assert.match(presetText, /深灰金属/);
  assert.match(presetText, /低反射玻璃/);
  assert.match(presetText, /磨砂亚克力/);
  assert.match(presetText, /织物肌理/);
  assert.match(presetText, /matte metal/);
  assert.doesNotMatch(presetText, /龙纹/);
  assert.doesNotMatch(presetText, /文字/);
  assert.doesNotMatch(presetText, /logo/i);
  assert.doesNotMatch(presetText, /云纹/);
  assert.doesNotMatch(presetText, /pattern/i);

  const prompt = buildShowcaseInteriorDesignPrompt({ colorMaterialPresetText: presetText });
  assert.match(prompt, /仅采用色彩和材质信息/);
  assert.match(prompt, /忽略其中所有图案、纹样、文字、符号、logo、排版约定/);
});
