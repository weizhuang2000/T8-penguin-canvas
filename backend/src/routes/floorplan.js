const express = require('express');
const multer = require('multer');
const { parseDxf, generateLayouts, validateLayout } = require('../utils/floorplanEngine');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024, files: 1 } });

router.post('/parse-dxf', upload.single('file'), (req, res) => {
  try {
    if (!req.file || !/\.dxf$/i.test(req.file.originalname || '')) return res.status(400).json({ success: false, error: '请选择 DXF 文件' });
    const architecture = parseDxf(req.file.buffer.toString('utf8'));
    return res.json({ success: true, data: { architecture, file: { name: req.file.originalname, size: req.file.size } } });
  } catch (error) { return res.status(400).json({ success: false, error: error.message || 'DXF 解析失败' }); }
});

router.post('/analyze-image', (req, res) => {
  try {
    const widthMm = Number(req.body?.widthMm);
    const heightMm = Number(req.body?.heightMm);
    if (!(widthMm > 0) || !(heightMm > 0)) return res.status(400).json({ success: false, error: '截图识别前必须提供校准后的宽度和高度' });
    const analysis = req.body?.analysis && typeof req.body.analysis === 'object' ? req.body.analysis : {};
    const normPoint = (value) => [Math.max(0, Math.min(widthMm, Number(value?.[0]) || 0)), Math.max(0, Math.min(heightMm, Number(value?.[1]) || 0))];
    const detectedWalls = Array.isArray(analysis.walls) ? analysis.walls.slice(0, 500).map((wall, index) => ({ id: `wall-ai-${index + 1}`, polyline: (Array.isArray(wall.polyline) ? wall.polyline : []).slice(0, 100).map(normPoint), thickness: Math.max(100, Number(wall.thickness) || 240), locked: true, confidence: Math.max(0, Math.min(1, Number(wall.confidence) || 0.5)), needsConfirmation: true })).filter((wall) => wall.polyline.length >= 2) : [];
    const detectedColumns = Array.isArray(analysis.columns) ? analysis.columns.slice(0, 200).map((column, index) => ({ id: `column-ai-${index + 1}`, shape: column.shape === 'circle' ? 'circle' : 'rect', x: Math.max(0, Number(column.x) || 0), y: Math.max(0, Number(column.y) || 0), width: Math.max(100, Number(column.width) || 600), height: Math.max(100, Number(column.height) || 600), locked: true, confidence: Math.max(0, Math.min(1, Number(column.confidence) || 0.5)), needsConfirmation: true })) : [];
    const detectedOpenings = Array.isArray(analysis.openings) ? analysis.openings.slice(0, 100).map((opening, index) => ({ id: `opening-ai-${index + 1}`, type: opening.type === 'exit' ? 'exit' : 'entrance', position: normPoint(opening.position), width: Math.max(600, Number(opening.width) || 1800), locked: true, confidence: Math.max(0, Math.min(1, Number(opening.confidence) || 0.5)), needsConfirmation: true })) : [];
    const architecture = {
      units: 'mm', bounds: { x: 0, y: 0, width: widthMm, height: heightMm }, walls: [
        { id: 'wall-top', polyline: [[0, 0], [widthMm, 0]], thickness: 240, locked: true },
        { id: 'wall-right', polyline: [[widthMm, 0], [widthMm, heightMm]], thickness: 240, locked: true },
        { id: 'wall-bottom', polyline: [[widthMm, heightMm], [0, heightMm]], thickness: 240, locked: true },
        { id: 'wall-left', polyline: [[0, heightMm], [0, 0]], thickness: 240, locked: true },
      ], columns: detectedColumns, openings: detectedOpenings.length ? detectedOpenings : [
        { id: 'entry-1', type: 'entrance', position: [0, heightMm * 0.25], width: 1800, locked: true, confidence: 0.55, needsConfirmation: true },
        { id: 'exit-1', type: 'exit', position: [widthMm, heightMm * 0.75], width: 1800, locked: true, confidence: 0.55, needsConfirmation: true },
      ], rooms: [], annotations: [], confidence: Number(analysis.confidence) || 0.45, needsConfirmation: ['墙体轮廓', '柱体', '入口位置', '出口位置', '比例'], sourceType: 'image',
      architectureVersion: `arch-image-${Date.now().toString(36)}`,
    };
    if (detectedWalls.length) architecture.walls = detectedWalls;
    return res.json({ success: true, data: { architecture } });
  } catch (error) { return res.status(400).json({ success: false, error: error.message || '截图分析失败' }); }
});

router.post('/generate-layouts', (req, res) => {
  try { return res.json({ success: true, data: generateLayouts(req.body?.architecture, req.body?.requirement, req.body?.constraints) }); }
  catch (error) { return res.status(400).json({ success: false, error: error.message || '布局生成失败' }); }
});

router.post('/validate-layout', (req, res) => {
  try { return res.json({ success: true, data: validateLayout(req.body?.architecture, req.body?.candidate, req.body?.constraints) }); }
  catch (error) { return res.status(400).json({ success: false, error: error.message || '布局校验失败' }); }
});

module.exports = router;
