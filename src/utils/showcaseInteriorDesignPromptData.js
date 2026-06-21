const DEFAULT_SHOWCASE_STYLE = {
  widthMm: 1200,
  baseHeightMm: 300,
  glassHeightMm: 1400,
  capHeightMm: 180,
  hasCap: true,
};

function cleanText(value, max = 12000) {
  return String(value || '').replace(/\r\n?/g, '\n').trim().slice(0, max);
}

function normalizeNumber(value, fallback = 0, min = 0, max = 999999) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.round(Math.min(max, Math.max(min, n)) * 100) / 100;
}

function formatPercent(value) {
  if (!Number.isFinite(value)) return '0';
  return String(Math.round(value * 10) / 10);
}

export function normalizeShowcaseStyle(value = {}) {
  const source = value && typeof value === 'object' ? value : {};
  return {
    widthMm: normalizeNumber(source.widthMm ?? source.width ?? source.showcaseWidth, DEFAULT_SHOWCASE_STYLE.widthMm),
    baseHeightMm: normalizeNumber(source.baseHeightMm ?? source.baseHeight, DEFAULT_SHOWCASE_STYLE.baseHeightMm),
    glassHeightMm: normalizeNumber(source.glassHeightMm ?? source.glassHeight, DEFAULT_SHOWCASE_STYLE.glassHeightMm),
    capHeightMm: normalizeNumber(source.capHeightMm ?? source.capHeight, DEFAULT_SHOWCASE_STYLE.capHeightMm),
    hasCap: source.hasCap !== false,
  };
}

export function normalizeShowcaseExhibitItems(value = []) {
  const list = Array.isArray(value) ? value : [];
  return list
    .map((item, index) => {
      const url = cleanText(item?.url || item?.imageUrl || '', 1000);
      const label = cleanText(item?.label || item?.name || `Exhibit ${index + 1}`, 80);
      const maxSideMm = normalizeNumber(item?.maxSideMm ?? item?.longestSideMm ?? item?.sizeMm, 300, 1, 99999);
      if (!url && !label) return null;
      return { url, label: label || `Exhibit ${index + 1}`, maxSideMm };
    })
    .filter(Boolean);
}

export function colorMaterialTextFromPreset(preset) {
  if (!preset) return '';
  return [preset.core, preset.features, preset.usage, preset.info]
    .map((item) => cleanText(item, 1200))
    .filter(Boolean)
    .join('; ');
}

function showcaseStyleText(style) {
  const s = normalizeShowcaseStyle(style);
  const totalHeight = s.baseHeightMm + s.glassHeightMm + (s.hasCap ? s.capHeightMm : 0);
  return [
    `Showcase width: ${s.widthMm} mm`,
    `Base height: ${s.baseHeightMm} mm`,
    `Glass display zone height: ${s.glassHeightMm} mm`,
    s.hasCap
      ? `Has top cap: yes, top cap height ${s.capHeightMm} mm`
      : `Has top cap: no. Do not render a top cap; the stored top cap height ${s.capHeightMm} mm is inactive.`,
    `Derived total height: ${totalHeight} mm`,
  ].join('\n');
}

function exhibitItemsText(items, style, values = {}) {
  const normalized = normalizeShowcaseExhibitItems(items);
  const s = normalizeShowcaseStyle(style);
  if (!normalized.length) {
    return [
      'No exhibit photos are connected. Use abstract exhibit placeholders, but keep realistic museum display scale.',
      'Use appropriate mounts, supports, low-reflection protection, focal lighting, and clear cabinet hierarchy. Do not generate readable exhibit label text.',
    ].join('\n');
  }

  const lines = [
    'All ordinary image inputs are EXHIBIT PHOTOS. They are only for exhibit appearance, silhouette, material detail, and display priority. They are NOT color/material style references.',
    'REFERENCE IMAGE ORDER: input image #1 is Exhibit 1, input image #2 is Exhibit 2, and so on. Match the connected exhibit photos to the sizes below in the same order.',
    'STRICT SCALE RULE: scale each exhibit only by its longestSideMm value. Do not scale by source-image pixel size, crop size, subject prominence, or how large the object appears in its reference photo.',
  ];

  normalized.forEach((item, index) => {
    const widthPercent = s.widthMm > 0 ? (item.maxSideMm / s.widthMm) * 100 : 0;
    const glassPercent = s.glassHeightMm > 0 ? (item.maxSideMm / s.glassHeightMm) * 100 : 0;
    lines.push(`${index + 1}. ${item.label}: longestSideMm = ${item.maxSideMm} mm; reference URL: ${item.url || '[upstream exhibit image]'}`);
    lines.push(`   SCALE CHECK: Exhibit ${index + 1} longest side is ${formatPercent(widthPercent)}% of the ${s.widthMm} mm showcase width and ${formatPercent(glassPercent)}% of the ${s.glassHeightMm} mm glass-zone height.`);
  });

  if (values.hasColorMaterialReferenceImage === true) {
    lines.push('COLOR MATERIAL REFERENCE: the separate color-material-reference image is the final reference image. It is NOT an exhibit photo and must NOT receive a longest-side size.');
  }
  lines.push('RELATIVE SIZE AUDIT: if two exhibit reference photos look similarly large but have different longestSideMm values, render them at visibly different physical sizes according to the millimeter numbers.');
  lines.push('FINAL SCALE AUDIT BEFORE RENDERING: compare every exhibit against the cabinet width and glass-zone height. Small maxSideMm values must stay small in the cabinet; large maxSideMm values may dominate only when the number justifies it.');
  return lines.join('\n');
}

function colorMaterialText(values) {
  const presetText = cleanText(values.colorMaterialPresetText || values.colorMaterial, 1800);
  const manualText = cleanText(values.manualColorMaterial ?? values.colorMaterialManual ?? values.manualColorMaterialText, 1600);
  const referenceTone = cleanText(values.colorMaterialReferenceTone, 800);
  const hasReference = values.hasColorMaterialReferenceImage === true;
  const lines = [];

  if (hasReference) {
    lines.push('The color/material reference uses the separate color-material-reference input. Use it only for cabinet background, base, back panel, mounts, lighting, metal/acrylic/glass material language. Do not treat it as an exhibit photo and do not alter exhibit identity.');
    if (referenceTone) lines.push(`Reference dominant tone/material note: ${referenceTone}`);
  }
  if (presetText && !hasReference) lines.push(`Shared color and material preset: ${presetText}`);
  if (presetText && hasReference) lines.push(`Shared color and material preset as secondary support: ${presetText}`);
  if (manualText) lines.push(`Manual color/material supplement: ${manualText}`);
  if (!lines.length) {
    lines.push('If no color/material direction is specified, use restrained, low-reflection, museum-grade, buildable cabinet interior materials.');
  }
  return lines.join('\n');
}

function outputRequirementText(values) {
  return [
    values.dimensionMarksEnabled === true
      ? 'Dimension marks: ON. Add clean engineering dimension annotations in millimeters for key widths/heights, but keep them tidy and proposal-like.'
      : 'Dimension marks: OFF. Do not draw dimension lines, mm numbers, red measurement labels, rulers, or engineering annotation symbols. Still obey the provided dimensions silently.',
    values.explodedViewEnabled === true
      ? 'Exploded view: ON. Show separated structural relationships among cabinet body, glass cover, base, top cap, mounts, exhibits, and lighting components.'
      : 'Exploded view: OFF. Render a fully assembled cabinet interior display. Do not scatter or float cabinet components.',
  ].join('\n');
}

export function buildShowcaseInteriorDesignPrompt(values = {}) {
  const style = values.showcaseStyle || values.dimensions || values;
  const supplement = cleanText(values.supplement, 3000);
  const lines = [
    'Task: museum / exhibition showcase interior design image generation.',
    '',
    'Core goal: generate a professional, realistic, buildable showcase interior display design from cabinet dimensions, exhibit reference photos, and cabinet interior style direction.',
    '',
    '1. Showcase Style And Dimensions',
    showcaseStyleText(style),
    '',
    'Proportion rule: the showcase width, base height, glass display zone height, and top cap height must form a believable physical cabinet. The glass display zone is the main exhibit volume. The top cap appears only when enabled.',
    '',
    '2. Exhibit Inputs And Physical Size Constraints',
    exhibitItemsText(values.exhibitItems, style, values),
    '',
    '3. Cabinet Interior Design Style',
    colorMaterialText(values),
    '',
    'Interior design requirements: organize exhibits with back panels, plinths, mounts, small platforms, shelves, concealed light strips, focal spotlights, low-reflection glass, protection clearance, and a clear visual focal hierarchy. The result should look like a real exhibition detail-design proposal, not a retail window display.',
    '',
    '4. Output Requirements',
    outputRequirementText(values),
    '',
    '5. Image Quality Constraints',
    'Create a high-fidelity exhibition design rendering: clear structure, transparent glass, realistic materials, layered lighting, and credible exhibit scale.',
    'Avoid random brand logos, unrelated people, retail-window clutter, low resolution blur, wrong text, unreadable label gibberish, or decorations unrelated to the exhibits.',
  ];
  if (supplement) lines.push('', '6. Supplement', supplement);
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

