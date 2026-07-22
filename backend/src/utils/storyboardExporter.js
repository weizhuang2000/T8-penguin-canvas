'use strict';

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const {
  AlignmentType,
  BorderStyle,
  Document,
  ImageRun,
  Packer,
  PageOrientation,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} = require('docx');
const PptxGenJS = require('pptxgenjs');
const pdfmake = require('pdfmake');
const { materializeOutputUrl } = require('../outputStorage/manager');

const EXPORT_FORMATS = new Set(['docx', 'pdf', 'pptx']);
const EXPORT_LAYOUTS = new Set(['production-table', 'shot-card-table']);
const PPT_SHOTS_PER_SLIDE = new Set([1, 2, 4]);
const MAX_SHOTS = 36;
const MAX_FIELD_CHARS = 5000;
const MAX_TOTAL_CHARS = 200000;
const FONT_NAME = 'Noto Sans SC';
const WORD_FONT_NAME = 'Microsoft YaHei';

const MIME_BY_FORMAT = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pdf: 'application/pdf',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};

function publicError(message, status = 400, code = 'invalid_storyboard_export') {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function cleanText(value, label, options = {}) {
  if (typeof value !== 'string') {
    if (options.allowEmpty) return '';
    throw publicError(`${label} 缺失`);
  }
  const text = value.replace(/\r\n?/g, '\n').trim();
  if (!text && !options.allowEmpty) throw publicError(`${label} 不能为空`);
  if (text.length > (options.max || MAX_FIELD_CHARS)) {
    throw publicError(`${label} 内容过长`, 413, 'storyboard_export_text_too_large');
  }
  return text;
}

function normalizeImageUrls(value, shotCount) {
  if (value == null) return Array.from({ length: shotCount }, () => '');
  if (!Array.isArray(value)) throw publicError('imageUrls 必须是数组');
  if (value.length > MAX_SHOTS) throw publicError(`镜头图片不能超过 ${MAX_SHOTS} 张`);
  return Array.from({ length: shotCount }, (_, index) => {
    const url = typeof value[index] === 'string' ? value[index].trim() : '';
    if (!url) return '';
    if (!url.startsWith('/files/output/')) {
      throw publicError(`第 ${index + 1} 张镜头图片不是本地输出文件`, 400, 'invalid_storyboard_image_url');
    }
    return url;
  });
}

function formatShotInfo(shot) {
  return [
    `标题：${shot.title}`,
    `时长：${shot.durationSeconds} 秒`,
    `景别：${shot.shotSize}`,
    `机位：${shot.cameraAngle}`,
    `运镜：${shot.cameraMovement}`,
  ].join('\n');
}

function formatVisualAction(shot) {
  return [`画面：${shot.visual}`, `动作：${shot.action}`].join('\n');
}

function formatDialogueVoice(shot) {
  return [
    `对白：${shot.dialogue || '无'}`,
    `旁白：${shot.voiceOver || '无'}`,
  ].join('\n');
}

function buildStoryboardExportModel(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw publicError('导出参数无效');
  if (input.sourceNodeType !== 'storyboard-grid') throw publicError('导出来源节点无效', 403, 'invalid_source_node_type');
  const format = EXPORT_FORMATS.has(input.format) ? input.format : '';
  const layout = EXPORT_LAYOUTS.has(input.layout) ? input.layout : '';
  const pptShotsPerSlide = Number(input.pptShotsPerSlide);
  if (!format) throw publicError('不支持的导出格式');
  if (!layout) throw publicError('不支持的导出排版');
  if (!PPT_SHOTS_PER_SLIDE.has(pptShotsPerSlide)) throw publicError('PPT 每页镜头数必须是 1、2 或 4');

  const script = input.script;
  if (!script || typeof script !== 'object' || Array.isArray(script)) throw publicError('分镜脚本无效');
  if (!Array.isArray(script.shots) || script.shots.length < 1) throw publicError('分镜脚本没有镜头');
  if (script.shots.length > MAX_SHOTS) throw publicError(`分镜镜头不能超过 ${MAX_SHOTS} 个`);

  const title = cleanText(script.title || '未命名分镜', '片名', { max: 200 });
  const visualContinuity = cleanText(script.visualContinuity || '', '视觉连续性', { allowEmpty: true, max: 10000 });
  const shots = script.shots.map((raw, position) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw publicError(`第 ${position + 1} 个镜头无效`);
    const duration = Number(raw.durationSeconds);
    if (!Number.isFinite(duration) || duration <= 0) throw publicError(`第 ${position + 1} 个镜头时长无效`);
    const shot = {
      index: position + 1,
      title: cleanText(raw.title, `第 ${position + 1} 个镜头标题`),
      durationSeconds: Math.round(duration * 100) / 100,
      shotSize: cleanText(raw.shotSize, `第 ${position + 1} 个镜头景别`),
      cameraAngle: cleanText(raw.cameraAngle, `第 ${position + 1} 个镜头机位`),
      cameraMovement: cleanText(raw.cameraMovement, `第 ${position + 1} 个镜头运镜`),
      visual: cleanText(raw.visual, `第 ${position + 1} 个镜头画面`),
      action: cleanText(raw.action, `第 ${position + 1} 个镜头动作`),
      dialogue: cleanText(raw.dialogue || '', `第 ${position + 1} 个镜头对白`, { allowEmpty: true }),
      voiceOver: cleanText(raw.voiceOver || '', `第 ${position + 1} 个镜头旁白`, { allowEmpty: true }),
    };
    return {
      ...shot,
      shotInfo: formatShotInfo(shot),
      visualAction: formatVisualAction(shot),
      dialogueVoice: formatDialogueVoice(shot),
    };
  });

  const totalChars = title.length + visualContinuity.length + shots.reduce((sum, shot) => (
    sum + shot.shotInfo.length + shot.visualAction.length + shot.dialogueVoice.length
  ), 0);
  if (totalChars > MAX_TOTAL_CHARS) {
    throw publicError('分镜脚本总内容过长', 413, 'storyboard_export_text_too_large');
  }

  const imageUrls = normalizeImageUrls(input.imageUrls, shots.length);
  return { format, layout, pptShotsPerSlide, title, visualContinuity, shots, imageUrls };
}

function resolveFontPath() {
  const resourceRoot = process.env.T8PC_RES
    ? path.resolve(process.env.T8PC_RES)
    : path.resolve(__dirname, '..', '..', '..');
  return path.join(resourceRoot, 'resources', 'fonts', 'NotoSansSC-VF.ttf');
}

async function prepareImageAsset(url, layout) {
  if (!url) return null;
  try {
    const localPath = await materializeOutputUrl(url);
    if (!localPath || !fs.existsSync(localPath)) return null;
    const maxWidth = layout === 'shot-card-table' ? 1280 : 720;
    const maxHeight = layout === 'shot-card-table' ? 800 : 480;
    const buffer = await sharp(localPath)
      .rotate()
      .resize({ width: maxWidth, height: maxHeight, fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#f8fafc' })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer();
    const metadata = await sharp(buffer).metadata();
    return {
      buffer,
      dataUri: `data:image/jpeg;base64,${buffer.toString('base64')}`,
      width: Number(metadata.width) || maxWidth,
      height: Number(metadata.height) || maxHeight,
    };
  } catch {
    return null;
  }
}

async function prepareStoryboardExport(input) {
  const model = buildStoryboardExportModel(input);
  const imageAssets = await Promise.all(model.imageUrls.map((url) => prepareImageAsset(url, model.layout)));
  return {
    ...model,
    shots: model.shots.map((shot, index) => ({ ...shot, image: imageAssets[index] || null })),
  };
}

function docxText(text, options = {}) {
  return new TextRun({
    text,
    bold: Boolean(options.bold),
    size: options.size || 18,
    color: options.color || '111827',
    font: { ascii: WORD_FONT_NAME, eastAsia: WORD_FONT_NAME, hAnsi: WORD_FONT_NAME },
  });
}

function docxParagraph(text, options = {}) {
  const lines = String(text || '').split('\n');
  const children = [];
  lines.forEach((line, index) => {
    if (index > 0) children.push(new TextRun({ break: 1 }));
    children.push(docxText(line, options));
  });
  return new Paragraph({
    children,
    alignment: options.alignment || AlignmentType.LEFT,
    spacing: { after: options.after == null ? 80 : options.after, line: options.line || 260 },
    pageBreakBefore: Boolean(options.pageBreakBefore),
    keepNext: Boolean(options.keepNext),
  });
}

const DOCX_BORDER = { style: BorderStyle.SINGLE, color: 'CBD5E1', size: 4 };
const DOCX_BORDERS = {
  top: DOCX_BORDER,
  bottom: DOCX_BORDER,
  left: DOCX_BORDER,
  right: DOCX_BORDER,
  insideHorizontal: DOCX_BORDER,
  insideVertical: DOCX_BORDER,
};

function docxCell(children, options = {}) {
  return new TableCell({
    children,
    width: options.width ? { size: options.width, type: WidthType.DXA } : undefined,
    verticalAlign: options.verticalAlign || VerticalAlign.CENTER,
    shading: options.fill ? { fill: options.fill, type: ShadingType.CLEAR } : undefined,
    margins: { top: 100, bottom: 100, left: 110, right: 110 },
    borders: DOCX_BORDERS,
  });
}

function docxImageContent(shot, width, height) {
  if (!shot.image) {
    return [docxParagraph('未生成', { alignment: AlignmentType.CENTER, color: '9CA3AF', after: 0 })];
  }
  const scale = Math.min(width / shot.image.width, height / shot.image.height);
  return [new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new ImageRun({
      type: 'jpg',
      data: shot.image.buffer,
      transformation: {
        width: Math.max(1, Math.round(shot.image.width * scale)),
        height: Math.max(1, Math.round(shot.image.height * scale)),
      },
      altText: { title: `镜头 ${shot.index}`, description: shot.title, name: `shot-${shot.index}` },
    })],
  })];
}

function createDocxProductionTable(shots) {
  const widths = [650, 2650, 2450, 4300, 4050];
  const headers = ['编号', '镜头画面', '镜头信息', '画面与动作', '对白与旁白'];
  const rows = [new TableRow({
    tableHeader: true,
    cantSplit: true,
    children: headers.map((header, index) => docxCell([
      docxParagraph(header, { bold: true, alignment: AlignmentType.CENTER, after: 0 }),
    ], { width: widths[index], fill: 'E0E7FF' })),
  })];
  for (const shot of shots) {
    rows.push(new TableRow({
      cantSplit: true,
      children: [
        docxCell([docxParagraph(String(shot.index), { bold: true, alignment: AlignmentType.CENTER, after: 0 })], { width: widths[0] }),
        docxCell(docxImageContent(shot, 160, 100), { width: widths[1] }),
        docxCell([docxParagraph(shot.shotInfo, { after: 0 })], { width: widths[2], verticalAlign: VerticalAlign.TOP }),
        docxCell([docxParagraph(shot.visualAction, { after: 0 })], { width: widths[3], verticalAlign: VerticalAlign.TOP }),
        docxCell([docxParagraph(shot.dialogueVoice, { after: 0 })], { width: widths[4], verticalAlign: VerticalAlign.TOP }),
      ],
    }));
  }
  return new Table({ rows, width: { size: 14100, type: WidthType.DXA }, columnWidths: widths, borders: DOCX_BORDERS });
}

function createDocxCardTable(shot) {
  const widths = [5200, 8900];
  const detail = [shot.shotInfo, shot.visualAction, shot.dialogueVoice].join('\n\n');
  return new Table({
    width: { size: 14100, type: WidthType.DXA },
    columnWidths: widths,
    borders: DOCX_BORDERS,
    rows: [new TableRow({
      cantSplit: true,
      children: [
        docxCell(docxImageContent(shot, 310, 195), { width: widths[0] }),
        docxCell([
          docxParagraph(`镜头 ${shot.index}`, { bold: true, size: 24, color: '4338CA', after: 120 }),
          docxParagraph(detail, { after: 0, line: 280 }),
        ], { width: widths[1], verticalAlign: VerticalAlign.TOP }),
      ],
    })],
  });
}

async function generateDocx(model) {
  const children = [
    docxParagraph(model.title, { bold: true, size: 34, color: '312E81', alignment: AlignmentType.CENTER, after: 180, keepNext: true }),
    docxParagraph(`视觉连续性：${model.visualContinuity || '无'}`, { size: 19, color: '475569', after: 120, keepNext: true }),
    docxParagraph(`镜头总数：${model.shots.length}`, { size: 18, color: '64748B', after: 180, keepNext: true }),
  ];
  if (model.layout === 'production-table') {
    children.push(createDocxProductionTable(model.shots));
  } else {
    model.shots.forEach((shot, index) => {
      if (index > 0) children.push(docxParagraph('', { after: 60 }));
      children.push(createDocxCardTable(shot));
    });
  }
  const document = new Document({
    creator: 'T8 Penguin Canvas',
    title: `${model.title} 分镜脚本`,
    description: '分镜脚本表格导出',
    sections: [{
      properties: {
        page: {
          size: { orientation: PageOrientation.LANDSCAPE },
          margin: { top: 600, right: 600, bottom: 600, left: 600 },
        },
      },
      children,
    }],
  });
  return Packer.toBuffer(document);
}

function pdfTextStack(text, options = {}) {
  return String(text || '').split('\n').map((line) => ({
    text: line,
    bold: Boolean(options.bold),
    color: options.color || '#111827',
    fontSize: options.fontSize || 8.5,
    margin: [0, 0, 0, 2],
  }));
}

function pdfImageCell(shot, fit) {
  if (!shot.image) return { text: '未生成', alignment: 'center', color: '#9CA3AF', margin: [0, 24, 0, 24] };
  return { image: shot.image.dataUri, fit, alignment: 'center', margin: [0, 2, 0, 2] };
}

function pdfProductionTable(shots) {
  return {
    table: {
      headerRows: 1,
      dontBreakRows: true,
      widths: [30, 115, 115, '*', '*'],
      body: [
        ['编号', '镜头画面', '镜头信息', '画面与动作', '对白与旁白'].map((text) => ({
          text,
          bold: true,
          alignment: 'center',
          fillColor: '#E0E7FF',
          color: '#312E81',
          margin: [3, 5, 3, 5],
        })),
        ...shots.map((shot) => [
          { text: String(shot.index), bold: true, alignment: 'center', margin: [0, 28, 0, 0] },
          pdfImageCell(shot, [110, 72]),
          { stack: pdfTextStack(shot.shotInfo) },
          { stack: pdfTextStack(shot.visualAction) },
          { stack: pdfTextStack(shot.dialogueVoice) },
        ]),
      ],
    },
    layout: {
      hLineColor: () => '#CBD5E1',
      vLineColor: () => '#CBD5E1',
      hLineWidth: () => 0.6,
      vLineWidth: () => 0.6,
      paddingLeft: () => 5,
      paddingRight: () => 5,
      paddingTop: () => 5,
      paddingBottom: () => 5,
    },
  };
}

function pdfCard(shot) {
  const detailStack = [
    { text: `镜头 ${shot.index}`, bold: true, color: '#4338CA', fontSize: 13, margin: [0, 0, 0, 6] },
    ...pdfTextStack(shot.shotInfo, { fontSize: 9.5 }),
    { text: '', margin: [0, 2, 0, 0] },
    ...pdfTextStack(shot.visualAction, { fontSize: 9.5 }),
    { text: '', margin: [0, 2, 0, 0] },
    ...pdfTextStack(shot.dialogueVoice, { fontSize: 9.5 }),
  ];
  return {
    unbreakable: true,
    margin: [0, 0, 0, 10],
    table: {
      widths: ['38%', '62%'],
      body: [[pdfImageCell(shot, [285, 175]), { stack: detailStack }]],
    },
    layout: {
      hLineColor: () => '#CBD5E1',
      vLineColor: () => '#CBD5E1',
      hLineWidth: () => 0.8,
      vLineWidth: () => 0.8,
      paddingLeft: () => 8,
      paddingRight: () => 8,
      paddingTop: () => 8,
      paddingBottom: () => 8,
    },
  };
}

async function generatePdf(model) {
  const fontPath = resolveFontPath();
  if (!fs.existsSync(fontPath)) throw publicError('缺少 PDF 中文字体资源', 500, 'storyboard_export_font_missing');
  pdfmake.setFonts({
    [FONT_NAME]: { normal: fontPath, bold: fontPath, italics: fontPath, bolditalics: fontPath },
  });
  pdfmake.setUrlAccessPolicy(() => false);
  pdfmake.setLocalAccessPolicy((requestedPath) => path.resolve(requestedPath) === path.resolve(fontPath));
  const content = [
    { text: model.title, style: 'title' },
    { text: `视觉连续性：${model.visualContinuity || '无'}`, style: 'continuity' },
    { text: `镜头总数：${model.shots.length}`, style: 'meta' },
  ];
  if (model.layout === 'production-table') content.push(pdfProductionTable(model.shots));
  else content.push(...model.shots.map(pdfCard));
  const docDefinition = {
    pageSize: 'A4',
    pageOrientation: 'landscape',
    pageMargins: [28, 28, 28, 28],
    info: { title: `${model.title} 分镜脚本`, author: 'T8 Penguin Canvas', subject: '分镜脚本表格导出' },
    defaultStyle: { font: FONT_NAME, fontSize: 9, color: '#111827', lineHeight: 1.2 },
    styles: {
      title: { fontSize: 20, bold: true, color: '#312E81', alignment: 'center', margin: [0, 0, 0, 10] },
      continuity: { fontSize: 9.5, color: '#475569', margin: [0, 0, 0, 6] },
      meta: { fontSize: 9, color: '#64748B', margin: [0, 0, 0, 10] },
    },
    content,
    footer: (currentPage, pageCount) => ({
      text: `${currentPage} / ${pageCount}`,
      alignment: 'center',
      color: '#94A3B8',
      fontSize: 8,
      margin: [0, 6, 0, 0],
    }),
  };
  return pdfmake.createPdf(docDefinition).getBuffer();
}

function textWeight(value) {
  let total = 0;
  for (const char of String(value || '')) {
    if (char === '\n') total += 8;
    else total += char.codePointAt(0) > 0x7f ? 2 : 1;
  }
  return total;
}

function splitTextByWeight(value, maxWeight) {
  const text = String(value || '');
  if (!text) return [''];
  const parts = [];
  let current = '';
  let currentWeight = 0;
  for (const char of text) {
    const weight = char === '\n' ? 8 : (char.codePointAt(0) > 0x7f ? 2 : 1);
    if (current && currentWeight + weight > maxWeight) {
      parts.push(current);
      current = '';
      currentWeight = 0;
    }
    current += char;
    currentWeight += weight;
  }
  if (current) parts.push(current);
  return parts;
}

function pptAddText(slide, text, options) {
  slide.addText(String(text || ''), {
    fontFace: WORD_FONT_NAME,
    color: '111827',
    margin: 0.06,
    valign: 'top',
    breakLine: false,
    ...options,
  });
}

function pptAddCell(pptx, slide, x, y, w, h, options = {}) {
  slide.addShape(pptx.ShapeType.rect, {
    x, y, w, h,
    fill: { color: options.fill || 'FFFFFF', transparency: options.transparency || 0 },
    line: { color: options.line || 'CBD5E1', width: options.lineWidth || 0.7 },
    radius: 0,
  });
}

function containedRect(asset, x, y, w, h, padding = 0.06) {
  const innerW = Math.max(0.01, w - padding * 2);
  const innerH = Math.max(0.01, h - padding * 2);
  const scale = Math.min(innerW / asset.width, innerH / asset.height);
  const imageW = asset.width * scale;
  const imageH = asset.height * scale;
  return {
    x: x + (w - imageW) / 2,
    y: y + (h - imageH) / 2,
    w: imageW,
    h: imageH,
  };
}

function pptAddImageOrPlaceholder(pptx, slide, shot, x, y, w, h) {
  pptAddCell(pptx, slide, x, y, w, h, { fill: 'F8FAFC' });
  if (shot.image) {
    slide.addImage({ data: shot.image.dataUri, ...containedRect(shot.image, x, y, w, h) });
  } else {
    pptAddText(slide, '未生成', { x, y: y + h / 2 - 0.13, w, h: 0.26, align: 'center', fontSize: 10, color: '94A3B8', valign: 'mid' });
  }
}

function pptSlideHeader(pptx, slide, model, subtitle) {
  slide.background = { color: 'F8FAFC' };
  pptAddText(slide, model.title, { x: 0.35, y: 0.18, w: 8.6, h: 0.36, fontSize: 18, bold: true, color: '312E81' });
  pptAddText(slide, subtitle, { x: 9.1, y: 0.2, w: 3.85, h: 0.28, fontSize: 9, align: 'right', color: '64748B' });
  slide.addShape(pptx.ShapeType.line, { x: 0.35, y: 0.65, w: 12.63, h: 0, line: { color: 'C7D2FE', width: 1.2 } });
}

function renderPptProductionSlide(pptx, model, shots, slideNumber) {
  const slide = pptx.addSlide();
  pptSlideHeader(pptx, slide, model, `标准制片表 · 第 ${slideNumber} 页`);
  const x = 0.35;
  const y = 0.82;
  const totalW = 12.63;
  const headerH = 0.42;
  const contentH = 6.1;
  const widths = [0.52, 2.35, 2.15, 3.72, 3.89];
  const headers = ['编号', '镜头画面', '镜头信息', '画面与动作', '对白与旁白'];
  let cx = x;
  headers.forEach((header, index) => {
    pptAddCell(pptx, slide, cx, y, widths[index], headerH, { fill: 'E0E7FF' });
    pptAddText(slide, header, { x: cx, y: y + 0.08, w: widths[index], h: 0.2, fontSize: 9, bold: true, align: 'center', color: '312E81', valign: 'mid' });
    cx += widths[index];
  });
  const rowH = contentH / shots.length;
  const fontSize = shots.length === 1 ? 12 : shots.length === 2 ? 9.5 : 7.2;
  shots.forEach((shot, rowIndex) => {
    const rowY = y + headerH + rowIndex * rowH;
    const fill = rowIndex % 2 ? 'F8FAFC' : 'FFFFFF';
    let cellX = x;
    widths.forEach((width) => {
      pptAddCell(pptx, slide, cellX, rowY, width, rowH, { fill });
      cellX += width;
    });
    pptAddText(slide, String(shot.index), { x, y: rowY + rowH / 2 - 0.15, w: widths[0], h: 0.3, fontSize: fontSize + 1, bold: true, align: 'center', color: '4338CA', valign: 'mid' });
    pptAddImageOrPlaceholder(pptx, slide, shot, x + widths[0], rowY, widths[1], rowH);
    pptAddText(slide, shot.shotInfo, { x: x + widths[0] + widths[1], y: rowY + 0.05, w: widths[2], h: rowH - 0.1, fontSize, breakLine: true });
    pptAddText(slide, shot.visualAction, { x: x + widths[0] + widths[1] + widths[2], y: rowY + 0.05, w: widths[3], h: rowH - 0.1, fontSize, breakLine: true });
    pptAddText(slide, shot.dialogueVoice, { x: x + widths[0] + widths[1] + widths[2] + widths[3], y: rowY + 0.05, w: widths[4], h: rowH - 0.1, fontSize, breakLine: true });
  });
  slide.addNotes(`镜头 ${shots.map((shot) => shot.index).join('、')}`);
  return totalW;
}

function cardPositions(count) {
  if (count === 1) return [{ x: 0.35, y: 0.85, w: 12.63, h: 6.2 }];
  if (count === 2) return [
    { x: 0.35, y: 0.85, w: 12.63, h: 2.98 },
    { x: 0.35, y: 4.02, w: 12.63, h: 2.98 },
  ];
  return [
    { x: 0.35, y: 0.85, w: 6.15, h: 2.98 },
    { x: 6.83, y: 0.85, w: 6.15, h: 2.98 },
    { x: 0.35, y: 4.02, w: 6.15, h: 2.98 },
    { x: 6.83, y: 4.02, w: 6.15, h: 2.98 },
  ];
}

function renderPptCardSlide(pptx, model, shots, slideNumber) {
  const slide = pptx.addSlide();
  pptSlideHeader(pptx, slide, model, `镜头大卡表 · 第 ${slideNumber} 页`);
  const positions = cardPositions(shots.length);
  const fontSize = shots.length === 1 ? 12 : shots.length === 2 ? 9.3 : 7.1;
  shots.forEach((shot, index) => {
    const box = positions[index];
    pptAddCell(pptx, slide, box.x, box.y, box.w, box.h, { fill: 'FFFFFF', line: 'A5B4FC', lineWidth: 1 });
    const imageW = box.w * 0.38;
    pptAddImageOrPlaceholder(pptx, slide, shot, box.x + 0.08, box.y + 0.08, imageW - 0.12, box.h - 0.16);
    const textX = box.x + imageW + 0.08;
    const textW = box.w - imageW - 0.16;
    pptAddText(slide, `镜头 ${shot.index} · ${shot.title}`, { x: textX, y: box.y + 0.1, w: textW, h: 0.32, fontSize: fontSize + 1.5, bold: true, color: '4338CA' });
    pptAddText(slide, [shot.shotInfo, shot.visualAction, shot.dialogueVoice].join('\n\n'), { x: textX, y: box.y + 0.48, w: textW, h: box.h - 0.58, fontSize, breakLine: true });
  });
}

function shotWeight(shot) {
  return textWeight(`${shot.shotInfo}\n${shot.visualAction}\n${shot.dialogueVoice}`);
}

function splitShotDetailPages(shot) {
  const sections = [
    ['镜头信息', shot.shotInfo],
    ['画面与动作', shot.visualAction],
    ['对白与旁白', shot.dialogueVoice],
  ];
  const lines = [];
  for (const [label, value] of sections) {
    const chunks = splitTextByWeight(value, 720);
    chunks.forEach((chunk, index) => lines.push(`${label}${index ? '（续）' : ''}\n${chunk}`));
  }
  const pages = [];
  let current = '';
  for (const block of lines) {
    const next = current ? `${current}\n\n${block}` : block;
    if (current && textWeight(next) > 1050) {
      pages.push(current);
      current = block;
    } else {
      current = next;
    }
  }
  if (current) pages.push(current);
  return pages;
}

function renderPptDedicatedShot(pptx, model, shot, slideStart) {
  const pages = splitShotDetailPages(shot);
  pages.forEach((detail, index) => {
    const slide = pptx.addSlide();
    pptSlideHeader(pptx, slide, model, `镜头 ${shot.index}${pages.length > 1 ? ` · ${index + 1}/${pages.length}` : ''}`);
    const x = 0.35;
    const y = 0.85;
    const w = 12.63;
    const h = 6.2;
    pptAddCell(pptx, slide, x, y, w, h, { fill: 'FFFFFF', line: 'A5B4FC', lineWidth: 1 });
    const imageW = 4.25;
    pptAddImageOrPlaceholder(pptx, slide, shot, x + 0.12, y + 0.12, imageW, h - 0.24);
    pptAddText(slide, `镜头 ${shot.index} · ${shot.title}`, { x: x + imageW + 0.3, y: y + 0.18, w: w - imageW - 0.45, h: 0.4, fontSize: 16, bold: true, color: '4338CA' });
    pptAddText(slide, detail, { x: x + imageW + 0.3, y: y + 0.72, w: w - imageW - 0.45, h: h - 0.9, fontSize: 11, breakLine: true });
  });
  return slideStart + pages.length;
}

function addPptTitleSlides(pptx, model) {
  const chunks = splitTextByWeight(model.visualContinuity || '无', 1800);
  chunks.forEach((chunk, index) => {
    const slide = pptx.addSlide();
    slide.background = { color: index === 0 ? 'EEF2FF' : 'F8FAFC' };
    pptAddText(slide, index === 0 ? model.title : '视觉连续性（续）', {
      x: 0.8, y: index === 0 ? 1.05 : 0.65, w: 11.7, h: 0.8,
      fontSize: index === 0 ? 30 : 22, bold: true, align: 'center', color: '312E81',
    });
    if (index === 0) {
      pptAddText(slide, `分镜脚本 · ${model.shots.length} 个镜头`, { x: 0.8, y: 2.0, w: 11.7, h: 0.35, fontSize: 13, align: 'center', color: '6366F1' });
    }
    pptAddCell(pptx, slide, 1.2, index === 0 ? 2.65 : 1.65, 10.93, index === 0 ? 3.25 : 4.9, { fill: 'FFFFFF', line: 'C7D2FE', lineWidth: 1 });
    pptAddText(slide, `视觉连续性\n${chunk}`, {
      x: 1.45, y: index === 0 ? 2.92 : 1.92, w: 10.43, h: index === 0 ? 2.75 : 4.4,
      fontSize: 13, color: '334155', breakLine: true,
    });
  });
}

async function generatePptx(model) {
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.author = 'T8 Penguin Canvas';
  pptx.company = 'T8 Penguin Canvas';
  pptx.subject = '分镜脚本表格导出';
  pptx.title = `${model.title} 分镜脚本`;
  pptx.lang = 'zh-CN';
  pptx.theme = {
    headFontFace: WORD_FONT_NAME,
    bodyFontFace: WORD_FONT_NAME,
    lang: 'zh-CN',
  };
  addPptTitleSlides(pptx, model);

  const maxPerSlide = model.pptShotsPerSlide;
  const normalLimit = model.layout === 'production-table'
    ? ({ 1: 1900, 2: 850, 4: 330 })[maxPerSlide]
    : ({ 1: 1700, 2: 720, 4: 280 })[maxPerSlide];
  let slideNumber = 1;
  let batch = [];
  const flush = () => {
    if (!batch.length) return;
    if (model.layout === 'production-table') renderPptProductionSlide(pptx, model, batch, slideNumber);
    else renderPptCardSlide(pptx, model, batch, slideNumber);
    slideNumber += 1;
    batch = [];
  };
  for (const shot of model.shots) {
    if (shotWeight(shot) > normalLimit) {
      flush();
      slideNumber = renderPptDedicatedShot(pptx, model, shot, slideNumber);
      continue;
    }
    batch.push(shot);
    if (batch.length >= maxPerSlide) flush();
  }
  flush();
  const output = await pptx.write({ outputType: 'nodebuffer', compression: true });
  return Buffer.isBuffer(output) ? output : Buffer.from(output);
}

function sanitizeExportFilename(title, format) {
  const safeTitle = String(title || '未命名分镜')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
    .replace(/[. ]+$/g, '')
    .trim()
    .slice(0, 100) || '未命名分镜';
  return `${safeTitle}_分镜脚本.${format}`;
}

async function exportStoryboardDocument(input) {
  const model = await prepareStoryboardExport(input);
  let buffer;
  if (model.format === 'docx') buffer = await generateDocx(model);
  else if (model.format === 'pdf') buffer = await generatePdf(model);
  else buffer = await generatePptx(model);
  return {
    buffer,
    filename: sanitizeExportFilename(model.title, model.format),
    mime: MIME_BY_FORMAT[model.format],
    model,
  };
}

module.exports = {
  EXPORT_FORMATS,
  EXPORT_LAYOUTS,
  MAX_SHOTS,
  MIME_BY_FORMAT,
  PPT_SHOTS_PER_SLIDE,
  buildStoryboardExportModel,
  exportStoryboardDocument,
  generateDocx,
  generatePdf,
  generatePptx,
  prepareStoryboardExport,
  resolveFontPath,
  sanitizeExportFilename,
  splitTextByWeight,
  textWeight,
};
