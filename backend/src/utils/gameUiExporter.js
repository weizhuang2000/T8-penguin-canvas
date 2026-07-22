'use strict';

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const JSZip = require('jszip');
const {
  AlignmentType,
  Document,
  HeadingLevel,
  ImageRun,
  Packer,
  PageOrientation,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} = require('docx');
const PptxGenJS = require('pptxgenjs');
const pdfmake = require('pdfmake');
const { materializeOutputUrl } = require('../outputStorage/manager');

const EXPORT_FORMATS = new Set(['docx', 'pdf', 'pptx', 'prototype-zip']);
const MAX_SCREENS = 8;
const MAX_FIELD_CHARS = 8000;
const MAX_TOTAL_CHARS = 180000;
const MAX_EXPORT_BYTES = 100 * 1024 * 1024;
const FONT_NAME = 'Noto Sans SC';
const WORD_FONT_NAME = 'Microsoft YaHei';
const MIME_BY_FORMAT = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pdf: 'application/pdf',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'prototype-zip': 'application/zip',
};

function publicError(message, status = 400, code = 'invalid_game_ui_export') {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function cleanText(value, label, allowEmpty = false, max = MAX_FIELD_CHARS) {
  if (typeof value !== 'string') {
    if (allowEmpty) return '';
    throw publicError(`${label} 缺失`);
  }
  const result = value.replace(/\r\n?/g, '\n').trim();
  if (!result && !allowEmpty) throw publicError(`${label} 不能为空`);
  if (result.length > max) throw publicError(`${label} 内容过长`, 413, 'game_ui_export_text_too_large');
  return result;
}

function normalizeImageUrls(value, count) {
  if (!Array.isArray(value) || value.length !== count) throw publicError(`imageUrls 必须严格包含 ${count} 项`);
  return value.map((raw, index) => {
    const url = typeof raw === 'string' ? raw.trim() : '';
    let decoded = url;
    try { decoded = decodeURIComponent(url); } catch { throw publicError(`第 ${index + 1} 张界面图地址无效`); }
    const relative = decoded.slice('/files/output/'.length);
    if (!url.startsWith('/files/output/') || !relative || relative.includes('\\') || relative.split('/').includes('..') || /[?#]/.test(relative)) {
      throw publicError(`第 ${index + 1} 张界面图不是安全的本地输出文件`, 400, 'invalid_game_ui_image_url');
    }
    return url;
  });
}

function cleanPrimitive(value, label) {
  if (!['boolean', 'number', 'string'].includes(typeof value)) throw publicError(`${label} 值无效`);
  if (typeof value === 'number' && !Number.isFinite(value)) throw publicError(`${label} 数字无效`);
  return value;
}

function buildGameUiExportModel(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw publicError('导出参数无效');
  if (input.sourceNodeType !== 'interactive-game-script') throw publicError('导出来源节点无效', 403, 'invalid_source_node_type');
  const format = EXPORT_FORMATS.has(input.format) ? input.format : '';
  if (!format) throw publicError('不支持的导出格式');
  const script = input.script;
  if (!script || typeof script !== 'object' || Array.isArray(script)) throw publicError('互动游戏脚本无效');
  if (!Array.isArray(script.screens) || script.screens.length < 4 || script.screens.length > MAX_SCREENS) throw publicError('界面数量必须为 4–8 个');
  if (!['state-graph', 'linear', 'branching-story'].includes(script.flowMode)) throw publicError('流程模式无效');
  const variables = Array.isArray(script.variables) ? script.variables.map((raw, index) => {
    const type = cleanText(raw?.type, `变量 ${index + 1} 类型`, false, 20);
    const initialValue = cleanPrimitive(raw?.initialValue, `变量 ${index + 1}`);
    if (!['boolean', 'number', 'string'].includes(type) || typeof initialValue !== type) throw publicError(`变量 ${index + 1} 类型无效`);
    return { id: cleanText(raw?.id, `变量 ${index + 1} ID`, false, 48), label: cleanText(raw?.label, `变量 ${index + 1} 名称`, false, 200), type, initialValue };
  }) : [];
  const variableIds = new Set(variables.map((item) => item.id));
  if (variableIds.size !== variables.length) throw publicError('变量 ID 重复');
  const screens = script.screens.map((raw, index) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw publicError(`第 ${index + 1} 个界面无效`);
    const elements = Array.isArray(raw.elements) ? raw.elements.map((item, elementIndex) => ({
      id: cleanText(item?.id, `界面 ${index + 1} 元素 ${elementIndex + 1} ID`, false, 48),
      type: cleanText(item?.type, `界面 ${index + 1} 元素 ${elementIndex + 1} 类型`, false, 80),
      label: cleanText(item?.label || '', `界面 ${index + 1} 元素 ${elementIndex + 1} 标签`, true, 300),
      description: cleanText(item?.description, `界面 ${index + 1} 元素 ${elementIndex + 1} 描述`, false, 1200),
    })) : [];
    const interactions = Array.isArray(raw.interactions) ? raw.interactions.map((item, interactionIndex) => {
      const hotspot = item?.hotspot || {};
      const coordinates = ['x', 'y', 'width', 'height'].map((key) => Number(hotspot[key]));
      if (coordinates.some((number) => !Number.isFinite(number)) || coordinates[0] < 0 || coordinates[1] < 0 || coordinates[2] <= 0 || coordinates[3] <= 0 || coordinates[0] + coordinates[2] > 100 || coordinates[1] + coordinates[3] > 100) {
        throw publicError(`界面 ${index + 1} 互动 ${interactionIndex + 1} 热点无效`);
      }
      const trigger = cleanText(item?.trigger, `界面 ${index + 1} 互动 ${interactionIndex + 1} 触发方式`, false, 40);
      if (!['tap', 'swipe-left', 'swipe-right', 'timeout'].includes(trigger)) throw publicError(`界面 ${index + 1} 互动 ${interactionIndex + 1} 触发方式无效`);
      const conditions = Array.isArray(item?.conditions) ? item.conditions.map((condition, conditionIndex) => {
        const variableId = cleanText(condition?.variableId, `条件 ${conditionIndex + 1} 变量`, false, 48);
        const operator = cleanText(condition?.operator, `条件 ${conditionIndex + 1} 操作符`, false, 20);
        if (!variableIds.has(variableId) || !['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'truthy', 'falsy'].includes(operator)) throw publicError(`条件 ${conditionIndex + 1} 无效`);
        return { variableId, operator, ...(!['truthy', 'falsy'].includes(operator) ? { value: cleanPrimitive(condition?.value, `条件 ${conditionIndex + 1}`) } : {}) };
      }) : [];
      const effects = Array.isArray(item?.effects) ? item.effects.map((effect, effectIndex) => {
        const variableId = cleanText(effect?.variableId, `效果 ${effectIndex + 1} 变量`, false, 48);
        const operation = cleanText(effect?.operation, `效果 ${effectIndex + 1} 操作`, false, 20);
        if (!variableIds.has(variableId) || !['set', 'increment', 'decrement', 'toggle'].includes(operation)) throw publicError(`效果 ${effectIndex + 1} 无效`);
        return { variableId, operation, ...(operation !== 'toggle' ? { value: cleanPrimitive(effect?.value, `效果 ${effectIndex + 1}`) } : {}) };
      }) : [];
      const feedbackType = cleanText(item?.feedback?.type || 'none', '反馈类型', false, 30);
      if (!['none', 'toast', 'highlight', 'modal'].includes(feedbackType)) throw publicError('反馈类型无效');
      return {
        id: cleanText(item?.id, `界面 ${index + 1} 互动 ${interactionIndex + 1} ID`, false, 48),
        label: cleanText(item?.label, `界面 ${index + 1} 互动 ${interactionIndex + 1} 标签`, false, 300),
        trigger,
        elementId: cleanText(item?.elementId || '', `界面 ${index + 1} 互动 ${interactionIndex + 1} 元素`, true, 48),
        hotspot: { x: coordinates[0], y: coordinates[1], width: coordinates[2], height: coordinates[3] },
        conditions,
        effects,
        targetScreenId: item?.targetScreenId === null ? null : cleanText(item?.targetScreenId, `界面 ${index + 1} 互动 ${interactionIndex + 1} 目标`, false, 48),
        feedback: { type: feedbackType, message: cleanText(item?.feedback?.message || '', '反馈文案', true, 500) },
      };
    }) : [];
    return {
      id: cleanText(raw.id, `第 ${index + 1} 个界面 ID`, false, 48),
      index: index + 1,
      title: cleanText(raw.title, `第 ${index + 1} 个界面标题`, false, 300),
      purpose: cleanText(raw.purpose, `第 ${index + 1} 个界面用途`, false, 2000),
      layout: cleanText(raw.layout, `第 ${index + 1} 个界面布局`, false, 3000),
      stateSummary: cleanText(raw.stateSummary, `第 ${index + 1} 个界面状态`, false, 2000),
      imagePrompt: cleanText(raw.imagePrompt, `第 ${index + 1} 个界面提示词`, false, 8000),
      elements,
      interactions,
    };
  });
  const screenIds = new Set(screens.map((screen) => screen.id));
  if (screenIds.size !== screens.length) throw publicError('界面 ID 重复');
  const initialScreenId = cleanText(script.initialScreenId, '初始界面 ID', false, 48);
  if (!screenIds.has(initialScreenId)) throw publicError('初始界面不存在');
  screens.forEach((screen) => screen.interactions.forEach((interaction) => {
    if (interaction.targetScreenId && !screenIds.has(interaction.targetScreenId)) throw publicError(`互动目标界面不存在：${interaction.targetScreenId}`);
  }));
  const title = cleanText(script.title, '项目名', false, 200);
  const concept = cleanText(script.concept, '项目概念', false, 5000);
  const globalVisual = cleanText(script.globalVisual, '全局视觉', false, 5000);
  const totalChars = JSON.stringify({ title, concept, globalVisual, variables, screens }).length;
  if (totalChars > MAX_TOTAL_CHARS) throw publicError('互动游戏脚本总内容过长', 413, 'game_ui_export_text_too_large');
  return { format, title, concept, globalVisual, flowMode: script.flowMode, initialScreenId, variables, screens, imageUrls: normalizeImageUrls(input.imageUrls, screens.length) };
}

function resolveFontPath() {
  const resourceRoot = process.env.T8PC_RES ? path.resolve(process.env.T8PC_RES) : path.resolve(__dirname, '..', '..', '..');
  return path.join(resourceRoot, 'resources', 'fonts', 'NotoSansSC-VF.ttf');
}

async function prepareImage(url) {
  const localPath = await materializeOutputUrl(url);
  if (!localPath || !fs.existsSync(localPath)) throw publicError('界面图片不存在', 400, 'game_ui_image_missing');
  const buffer = await sharp(localPath).rotate().resize({ width: 1920, height: 1080, fit: 'contain', background: '#111827', withoutEnlargement: true }).png().toBuffer();
  return { buffer, dataUri: `data:image/png;base64,${buffer.toString('base64')}` };
}

async function prepareGameUiExport(input) {
  const model = buildGameUiExportModel(input);
  const images = await Promise.all(model.imageUrls.map(prepareImage));
  model.screens.forEach((screen, index) => { screen.image = images[index]; screen.imageFile = `assets/screen-${String(index + 1).padStart(2, '0')}.png`; });
  return model;
}

function interactionText(interaction) {
  const conditions = interaction.conditions.length ? `条件 ${JSON.stringify(interaction.conditions)}` : '无条件';
  const effects = interaction.effects.length ? `效果 ${JSON.stringify(interaction.effects)}` : '无状态修改';
  return `${interaction.label}｜${interaction.trigger}｜${conditions}｜${effects}｜目标 ${interaction.targetScreenId || '结束'}${interaction.feedback.message ? `｜反馈 ${interaction.feedback.message}` : ''}`;
}

function docxText(value, options = {}) {
  return new Paragraph({
    heading: options.heading,
    alignment: options.alignment,
    spacing: { after: options.after ?? 100 },
    children: [new TextRun({ text: String(value || ''), bold: Boolean(options.bold), size: options.size || 20, color: options.color || '1F2937', font: WORD_FONT_NAME })],
  });
}

async function generateDocx(model) {
  const children = [
    docxText(model.title, { bold: true, size: 36, color: '0E7490', alignment: AlignmentType.CENTER, after: 180 }),
    docxText(`项目概念：${model.concept}`),
    docxText(`全局视觉：${model.globalVisual}`),
    docxText(`流程模式：${model.flowMode}｜初始界面：${model.initialScreenId}｜界面数：${model.screens.length}`, { after: 180 }),
  ];
  model.screens.forEach((screen) => {
    children.push(docxText(`${screen.index}. ${screen.title}`, { heading: HeadingLevel.HEADING_1, bold: true, size: 28, color: '0E7490' }));
    children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 120 }, children: [new ImageRun({ data: screen.image.buffer, transformation: { width: 640, height: 360 }, type: 'png' })] }));
    children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [
      new TableRow({ children: [new TableCell({ children: [docxText('用途', { bold: true })] }), new TableCell({ children: [docxText(screen.purpose)] })] }),
      new TableRow({ children: [new TableCell({ children: [docxText('布局', { bold: true })] }), new TableCell({ children: [docxText(screen.layout)] })] }),
      new TableRow({ children: [new TableCell({ children: [docxText('状态', { bold: true })] }), new TableCell({ children: [docxText(screen.stateSummary)] })] }),
      new TableRow({ children: [new TableCell({ children: [docxText('互动', { bold: true })] }), new TableCell({ children: screen.interactions.length ? screen.interactions.map((item) => docxText(interactionText(item))) : [docxText('终局 / 无互动')] })] }),
    ] }));
  });
  const document = new Document({ creator: 'T8 Penguin Canvas', title: `${model.title} 互动游戏方案`, sections: [{ properties: { page: { size: { orientation: PageOrientation.LANDSCAPE }, margin: { top: 600, right: 600, bottom: 600, left: 600 } } }, children }] });
  return Packer.toBuffer(document);
}

async function generatePdf(model) {
  const fontPath = resolveFontPath();
  if (!fs.existsSync(fontPath)) throw publicError('缺少 PDF 中文字体资源', 500, 'game_ui_export_font_missing');
  pdfmake.setFonts({ [FONT_NAME]: { normal: fontPath, bold: fontPath, italics: fontPath, bolditalics: fontPath } });
  pdfmake.setUrlAccessPolicy(() => false);
  pdfmake.setLocalAccessPolicy((requestedPath) => path.resolve(requestedPath) === path.resolve(fontPath));
  const content = [
    { text: model.title, style: 'title' },
    { text: `项目概念：${model.concept}`, margin: [0, 0, 0, 6] },
    { text: `全局视觉：${model.globalVisual}`, margin: [0, 0, 0, 6] },
    { text: `流程模式：${model.flowMode}　初始界面：${model.initialScreenId}`, color: '#64748B', margin: [0, 0, 0, 12] },
  ];
  model.screens.forEach((screen, index) => {
    content.push({ text: `${screen.index}. ${screen.title}`, style: 'screen', pageBreak: index ? 'before' : undefined });
    content.push({ image: screen.image.dataUri, fit: [700, 394], alignment: 'center', margin: [0, 4, 0, 10] });
    content.push({ table: { widths: [70, '*'], body: [
      ['用途', screen.purpose], ['布局', screen.layout], ['状态', screen.stateSummary],
      ['互动', screen.interactions.length ? screen.interactions.map(interactionText).join('\n') : '终局 / 无互动'],
    ] }, layout: 'lightHorizontalLines' });
  });
  return pdfmake.createPdf({ pageSize: 'A4', pageOrientation: 'landscape', pageMargins: [32, 28, 32, 28], defaultStyle: { font: FONT_NAME, fontSize: 9, color: '#111827' }, styles: { title: { fontSize: 23, bold: true, color: '#0E7490', alignment: 'center', margin: [0, 0, 0, 14] }, screen: { fontSize: 17, bold: true, color: '#0E7490', margin: [0, 0, 0, 6] } }, content }).getBuffer();
}

function addPptText(slide, value, options) {
  slide.addText(String(value || ''), { fontFace: WORD_FONT_NAME, color: '1F2937', margin: 0.05, valign: 'top', breakLine: false, fit: 'shrink', ...options });
}

async function generatePptx(model) {
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.author = 'T8 Penguin Canvas';
  pptx.title = `${model.title} 互动游戏方案`;
  pptx.lang = 'zh-CN';
  pptx.theme = { headFontFace: WORD_FONT_NAME, bodyFontFace: WORD_FONT_NAME, lang: 'zh-CN' };
  let slide = pptx.addSlide();
  slide.background = { color: 'ECFEFF' };
  addPptText(slide, model.title, { x: 0.8, y: 1.25, w: 11.73, h: 0.75, fontSize: 31, bold: true, align: 'center', color: '0E7490' });
  addPptText(slide, '互动游戏 UI 与逻辑演示方案', { x: 1, y: 2.2, w: 11.33, h: 0.4, fontSize: 17, align: 'center', color: '0891B2' });
  addPptText(slide, `${model.concept}\n\n流程：${model.flowMode}　界面：${model.screens.length} 个`, { x: 1.4, y: 3, w: 10.53, h: 2.3, fontSize: 14, align: 'center', color: '334155' });
  slide = pptx.addSlide();
  addPptText(slide, '方案总览', { x: 0.55, y: 0.35, w: 12.2, h: 0.45, fontSize: 22, bold: true, color: '0E7490' });
  addPptText(slide, `全局视觉\n${model.globalVisual}\n\n界面流程\n${model.screens.map((screen) => `${screen.index}. ${screen.title}`).join('　→　')}`, { x: 0.8, y: 1.25, w: 11.73, h: 4.8, fontSize: 15, color: '334155' });
  model.screens.forEach((screen) => {
    const detail = pptx.addSlide();
    addPptText(detail, `${screen.index}. ${screen.title}`, { x: 0.5, y: 0.25, w: 12.3, h: 0.5, fontSize: 22, bold: true, color: '0E7490' });
    detail.addImage({ data: screen.image.dataUri, x: 0.5, y: 0.9, w: 7.6, h: 4.275 });
    addPptText(detail, `用途\n${screen.purpose}\n\n布局\n${screen.layout}\n\n状态\n${screen.stateSummary}`, { x: 8.35, y: 0.95, w: 4.45, h: 3.0, fontSize: 10.5, color: '334155' });
    addPptText(detail, `互动逻辑\n${screen.interactions.length ? screen.interactions.map(interactionText).join('\n') : '终局 / 无互动'}`, { x: 0.6, y: 5.45, w: 12.1, h: 1.45, fontSize: 9.5, color: '334155' });
  });
  const output = await pptx.write({ outputType: 'nodebuffer', compression: true });
  return Buffer.isBuffer(output) ? output : Buffer.from(output);
}

const PROTOTYPE_CSS = `*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#05070b;color:#fff;font-family:Arial,"Microsoft YaHei",sans-serif}#app{position:relative;width:100%;height:100%;display:grid;place-items:center}.stage{position:relative;width:min(100vw,177.78vh);aspect-ratio:16/9;background:#000;overflow:hidden}.stage img{width:100%;height:100%;object-fit:contain}.hotspot{position:absolute;border:1px solid transparent;background:transparent;cursor:pointer}.hotspot:focus{outline:3px solid #22d3ee}.toast{position:absolute;left:50%;top:4%;transform:translateX(-50%);padding:12px 22px;border-radius:10px;background:#000c;opacity:0;transition:.2s}.toast.show{opacity:1}.toolbar{position:fixed;right:12px;top:12px;z-index:5}.toolbar button{border:1px solid #ffffff44;background:#0009;color:#fff;border-radius:8px;padding:8px 12px}`;

const PROTOTYPE_RUNTIME = `'use strict';(()=>{const data=JSON.parse(document.getElementById('prototype-data').textContent);const app=document.getElementById('app');let current=data.initialScreenId;let vars=Object.fromEntries(data.variables.map(v=>[v.id,v.initialValue]));let timer=null;const ok=c=>{const a=vars[c.variableId],b=c.value;if(c.operator==='truthy')return!!a;if(c.operator==='falsy')return!a;if(c.operator==='eq')return a===b;if(c.operator==='ne')return a!==b;if(c.operator==='gt')return Number(a)>Number(b);if(c.operator==='gte')return Number(a)>=Number(b);if(c.operator==='lt')return Number(a)<Number(b);return Number(a)<=Number(b)};const effects=list=>list.forEach(e=>{if(e.operation==='toggle')vars[e.variableId]=!vars[e.variableId];else if(e.operation==='increment')vars[e.variableId]=Number(vars[e.variableId]||0)+Number(e.value||0);else if(e.operation==='decrement')vars[e.variableId]=Number(vars[e.variableId]||0)-Number(e.value||0);else vars[e.variableId]=e.value});const run=(i,toast)=>{if(!i.conditions.every(ok)){toast.textContent='当前条件尚未满足';toast.classList.add('show');setTimeout(()=>toast.classList.remove('show'),1200);return}effects(i.effects);if(i.feedback.message){toast.textContent=i.feedback.message;toast.classList.add('show');setTimeout(()=>toast.classList.remove('show'),1200)}if(i.targetScreenId){current=i.targetScreenId;setTimeout(render,180)}};const render=()=>{if(timer)clearTimeout(timer);const s=data.screens.find(x=>x.id===current)||data.screens[0];app.textContent='';const stage=document.createElement('div');stage.className='stage';const img=document.createElement('img');img.src=s.imageFile;img.alt=s.title;stage.appendChild(img);const toast=document.createElement('div');toast.className='toast';stage.appendChild(toast);s.interactions.filter(i=>i.trigger==='tap').forEach(i=>{const b=document.createElement('button');b.className='hotspot';b.ariaLabel=i.label;Object.assign(b.style,{left:i.hotspot.x+'%',top:i.hotspot.y+'%',width:i.hotspot.width+'%',height:i.hotspot.height+'%'});b.addEventListener('click',()=>run(i,toast));stage.appendChild(b)});let start=0;stage.addEventListener('pointerdown',e=>{start=e.clientX});stage.addEventListener('pointerup',e=>{const d=e.clientX-start;if(Math.abs(d)<60)return;const trigger=d<0?'swipe-left':'swipe-right';const i=s.interactions.find(x=>x.trigger===trigger);if(i)run(i,toast)});const timeout=s.interactions.find(i=>i.trigger==='timeout');if(timeout)timer=setTimeout(()=>run(timeout,toast),1800);app.appendChild(stage)};document.getElementById('reset').addEventListener('click',()=>{current=data.initialScreenId;vars=Object.fromEntries(data.variables.map(v=>[v.id,v.initialValue]));render()});render()})();`;

function safeJsonForHtml(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
}

async function generatePrototypeZip(model) {
  const zip = new JSZip();
  const prototype = {
    schemaVersion: 1,
    title: model.title,
    flowMode: model.flowMode,
    initialScreenId: model.initialScreenId,
    variables: model.variables,
    screens: model.screens.map(({ image, ...screen }) => screen),
  };
  const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; object-src 'none'; connect-src 'none'"><title>${model.title.replace(/[<>&"]/g, '')}</title><link rel="stylesheet" href="styles.css"></head><body><div class="toolbar"><button id="reset" type="button">重置</button></div><main id="app"></main><script type="application/json" id="prototype-data">${safeJsonForHtml(prototype)}</script><script src="runtime.js"></script></body></html>`;
  zip.file('index.html', html);
  zip.file('styles.css', PROTOTYPE_CSS);
  zip.file('runtime.js', PROTOTYPE_RUNTIME);
  zip.file('prototype.json', JSON.stringify(prototype, null, 2));
  zip.file('README.txt', '双击 index.html 打开离线互动原型。原型不访问网络，不执行 AI 生成代码；右上角可重置演示。');
  model.screens.forEach((screen) => zip.file(screen.imageFile, screen.image.buffer));
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } });
}

function sanitizeFilename(title, format) {
  const safe = String(title || '未命名互动游戏').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/[. ]+$/g, '').trim().slice(0, 100) || '未命名互动游戏';
  return format === 'prototype-zip' ? `${safe}_互动原型.zip` : `${safe}_互动游戏方案.${format}`;
}

async function exportGameUiDocument(input) {
  const model = await prepareGameUiExport(input);
  let buffer;
  if (model.format === 'docx') buffer = await generateDocx(model);
  else if (model.format === 'pdf') buffer = await generatePdf(model);
  else if (model.format === 'pptx') buffer = await generatePptx(model);
  else buffer = await generatePrototypeZip(model);
  if (buffer.length > MAX_EXPORT_BYTES) throw publicError('导出文件超过 100MB', 413, 'game_ui_export_too_large');
  return { buffer, filename: sanitizeFilename(model.title, model.format), mime: MIME_BY_FORMAT[model.format], model };
}

module.exports = {
  EXPORT_FORMATS,
  MAX_SCREENS,
  MIME_BY_FORMAT,
  buildGameUiExportModel,
  exportGameUiDocument,
  generateDocx,
  generatePdf,
  generatePptx,
  generatePrototypeZip,
  prepareGameUiExport,
  resolveFontPath,
};
