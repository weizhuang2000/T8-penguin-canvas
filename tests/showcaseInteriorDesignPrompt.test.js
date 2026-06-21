import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildShowcaseInteriorDesignPrompt,
  normalizeShowcaseExhibitItems,
  normalizeShowcaseStyle,
} from '../src/utils/showcaseInteriorDesignPromptData.js';

test('showcase prompt includes four showcase dimensions and cap switch', () => {
  const withCap = buildShowcaseInteriorDesignPrompt({
    showcaseStyle: {
      widthMm: 1200,
      baseHeightMm: 300,
      glassHeightMm: 1400,
      capHeightMm: 180,
      hasCap: true,
    },
  });
  assert.match(withCap, /Showcase width: 1200 mm/);
  assert.match(withCap, /Base height: 300 mm/);
  assert.match(withCap, /Glass display zone height: 1400 mm/);
  assert.match(withCap, /Has top cap: yes, top cap height 180 mm/);
  assert.match(withCap, /Derived total height: 1880 mm/);

  const withoutCap = buildShowcaseInteriorDesignPrompt({
    showcaseStyle: { widthMm: 1200, baseHeightMm: 300, glassHeightMm: 1400, capHeightMm: 180, hasCap: false },
  });
  assert.match(withoutCap, /Has top cap: no/);
  assert.match(withoutCap, /Derived total height: 1700 mm/);

  assert.deepEqual(normalizeShowcaseStyle({}), {
    widthMm: 1200,
    baseHeightMm: 300,
    glassHeightMm: 1400,
    capHeightMm: 180,
    hasCap: true,
  });
});

test('showcase prompt keeps exhibit order and longest side in millimeters', () => {
  const items = normalizeShowcaseExhibitItems([
    { url: '/files/input/a.png', label: 'Bronze vessel', maxSideMm: 420 },
    { url: '/files/input/b.png', label: 'Pottery figure', maxSideMm: 260 },
  ]);
  assert.deepEqual(items.map((item) => item.maxSideMm), [420, 260]);

  const prompt = buildShowcaseInteriorDesignPrompt({ exhibitItems: items, showcaseStyle: { widthMm: 1200, glassHeightMm: 1400 } });
  assert.ok(prompt.indexOf('1. Bronze vessel: longestSideMm = 420 mm') < prompt.indexOf('2. Pottery figure: longestSideMm = 260 mm'));
  assert.match(prompt, /REFERENCE IMAGE ORDER/);
  assert.match(prompt, /STRICT SCALE RULE/);
  assert.match(prompt, /35% of the 1200 mm showcase width/);
  assert.match(prompt, /18\.6% of the 1400 mm glass-zone height/);
  assert.match(prompt, /RELATIVE SIZE AUDIT/);
});

test('showcase prompt switches dimension marks and exploded view requirements', () => {
  const marked = buildShowcaseInteriorDesignPrompt({ dimensionMarksEnabled: true, explodedViewEnabled: true });
  assert.match(marked, /Dimension marks: ON/);
  assert.match(marked, /Exploded view: ON/);
  assert.match(marked, /cabinet body, glass cover, base, top cap, mounts, exhibits, and lighting components/);

  const unmarked = buildShowcaseInteriorDesignPrompt({ dimensionMarksEnabled: false, explodedViewEnabled: false });
  assert.match(unmarked, /Dimension marks: OFF/);
  assert.match(unmarked, /Exploded view: OFF/);
  assert.match(unmarked, /fully assembled cabinet interior display/);
});

test('showcase prompt separates exhibit images from color material reference', () => {
  const prompt = buildShowcaseInteriorDesignPrompt({
    exhibitItems: [{ url: '/files/input/exhibit.png', label: 'Exhibit photo', maxSideMm: 300 }],
    colorMaterialPresetText: 'dark gray metal, warm light, low-reflection glass',
    manualColorMaterial: 'fine textile back panel',
    colorMaterialReferenceTone: 'dominant tone: deep blue, champagne gold',
    hasColorMaterialReferenceImage: true,
  });
  assert.match(prompt, /ordinary image inputs are EXHIBIT PHOTOS/);
  assert.match(prompt, /separate color-material-reference input/);
  assert.match(prompt, /NOT an exhibit photo/);
  assert.match(prompt, /must NOT receive a longest-side size/);
  assert.match(prompt, /Shared color and material preset as secondary support/);
  assert.match(prompt, /Manual color\/material supplement/);
  assert.match(prompt, /Exhibit photo: longestSideMm = 300 mm/);
});

