import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('cinema auditorium design node is registered across frontend and permissions', () => {
  assert.match(read('src/types/canvas.ts'), /\| 'cinema-auditorium-design'/);
  assert.match(read('src/config/nodeRegistry.ts'), /type: 'cinema-auditorium-design'/);
  assert.match(read('src/config/nodeRegistry.ts'), /label: '影院报告厅设计'/);
  assert.match(read('src/components/Canvas.tsx'), /CinemaAuditoriumDesignNode/);
  assert.match(read('src/components/Canvas.tsx'), /'cinema-auditorium-design': CinemaAuditoriumDesignNode/);
  assert.match(read('src/components/Canvas.tsx'), /lengthMm: 24000/);
  assert.match(read('src/components/Canvas.tsx'), /widthMm: 16000/);
  assert.match(read('src/components/Canvas.tsx'), /heightMm: 7500/);
  assert.match(read('src/components/Canvas.tsx'), /screenStageSide: 'north'/);
  assert.match(read('src/components/Canvas.tsx'), /venueType: 'standard-cinema'/);
  assert.match(read('src/components/Canvas.tsx'), /outputSelection: \['render', 'color-plan', 'system-principle'\]/);
  assert.match(read('src/config/portTypes.ts'), /'cinema-auditorium-design': \{ inputs: \['text', 'image'\], outputs: \['image', 'text'\] \}/);
  assert.match(read('src/utils/nodePlacement.ts'), /'cinema-auditorium-design': \{ w: 640, h: 820 \}/);
  assert.match(read('src/components/NodeActionBar.tsx'), /'cinema-auditorium-design'/);
  assert.match(read('backend/src/auth/toolPermissions.js'), /'cinema-auditorium-design'/);
  assert.match(read('src/config/exhibitionCompactForm.ts'), /nodeType: 'cinema-auditorium-design'/);
  assert.match(read('backend/src/auth/exhibitionCompactForm.js'), /nodeType: 'cinema-auditorium-design'/);
});

test('cinema auditorium component exposes handles, shared material controls and generation services', () => {
  const source = read('src/components/nodes/CinemaAuditoriumDesignNode.tsx');
  assert.match(source, /id="text"/);
  assert.match(source, /id="space-reference"/);
  assert.match(source, /id="color-material-reference"/);
  assert.match(source, /id="equipment-reference"/);
  assert.match(source, /id="text-output"/);
  assert.match(source, /ColorMaterialPresetSelect/);
  assert.match(source, /getElevationPromptPresets/);
  assert.match(source, /MentionPromptInput/);
  assert.match(source, /resolveMediaMentions/);
  assert.match(source, /buildCinemaAuditoriumImagePrompt/);
  assert.match(source, /buildCinemaAuditoriumDrawingPrompt/);
  assert.match(source, /buildCinemaColorPlanReferenceDataUrl/);
  assert.match(source, /uploadDataUrl\(dataUrl, 'cinema-color-plan-reference'\)/);
  assert.match(source, /generateExternalImage/);
  assert.match(source, /submitImageAsync/);
  assert.match(source, /queryImageStatus/);
  assert.match(source, /queryExternalImageStatus/);
  assert.match(source, /useRunTrigger\(id, runGenerate, 'image'\)/);
});

test('cinema auditorium output order and result fields are stable', () => {
  const source = read('src/components/nodes/CinemaAuditoriumDesignNode.tsx');
  assert.match(source, /OUTPUT_ORDER: CinemaAuditoriumOutputType\[\] = \['render', 'color-plan', 'system-principle'\]/);
  assert.match(source, /const sequence = OUTPUT_ORDER\.filter/);
  assert.match(source, /if \(kind === 'render'\) renderImage = generated\.imageUrl/);
  assert.match(source, /else if \(kind !== 'system-principle'\) previousDrawingImage = generated\.imageUrl/);
  assert.match(source, /kind === 'system-principle'\s*\?\s*equipmentReferenceImages/);
  assert.match(source, /cinemaAuditoriumResults: results\.slice\(\)/);
  assert.match(source, /imageUrls: generatedUrls\.slice\(\)/);
  assert.match(source, /urls: generatedUrls\.slice\(\)/);
  assert.match(source, /outputText: summaryText/);
  assert.match(source, /text: summaryText/);
});

test('cinema auditorium prompt presets cover special theaters and diagrams', async () => {
  const mod = await import('../src/utils/cinemaAuditoriumDesignPromptData.js');
  const venueIds = mod.CINEMA_AUDITORIUM_VENUE_TYPES.map((item) => item.id);
  assert.ok(venueIds.includes('flying-theater'));
  assert.ok(venueIds.includes('9d-cinema'));
  assert.ok(venueIds.includes('academic-report-hall'));
  const colorPlan = mod.buildCinemaAuditoriumDrawingPrompt({ outputType: 'color-plan', dimensions: { lengthMm: 24000, widthMm: 16000, heightMm: 7500 }, screenStageSide: 'north' });
  assert.match(colorPlan, /长宽比例|比例|银幕舞台方向|座席|走道|设备区/);
  const principle = mod.buildCinemaAuditoriumDrawingPrompt({ outputType: 'system-principle', specialEffects: ['motion-seats', 'wind', 'water-mist', 'scent'] });
  assert.match(principle, /拓扑|连线|图标|符号|pictogram/);
  assert.match(principle, /不需要主效果图|不需要彩色平面图|不要生成室内效果图|不要生成.*平面布局图/);
  assert.match(principle, /放映|LED|投影/);
  assert.match(principle, /音响|灯光|控制机房|服务器|播放系统/);
  assert.match(principle, /动感座椅|风效|水雾|气味/);
  assert.match(principle, /疏散|检修/);
});
