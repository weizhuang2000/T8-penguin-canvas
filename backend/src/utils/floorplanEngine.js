const crypto = require('crypto');

const MAX_ENTITIES = 20000;
const DEFAULT_CLEARANCE = 1200;

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function point(x, y) { return [finite(x), finite(y)]; }

function parseDxf(text) {
  if (typeof text !== 'string' || !text.trim()) throw new Error('DXF 文件为空');
  const lines = text.replace(/\r/g, '').split('\n');
  const pairs = [];
  for (let i = 0; i + 1 < lines.length; i += 2) pairs.push([lines[i].trim(), lines[i + 1].trim()]);
  const entities = [];
  let section = '';
  let current = null;
  let vertex = null;
  const finish = () => {
    if (!current) return;
    if (vertex && current.vertices) current.vertices.push(point(vertex.x, vertex.y));
    entities.push(current);
    if (entities.length > MAX_ENTITIES) throw new Error(`DXF 实体超过上限 ${MAX_ENTITIES}`);
    current = null;
    vertex = null;
  };
  for (const [code, value] of pairs) {
    if (code === '0' && value === 'SECTION') { finish(); section = 'PENDING'; continue; }
    if (section === 'PENDING' && code === '2') { section = value; continue; }
    if (code === '0' && value === 'ENDSEC') { finish(); section = ''; continue; }
    if (section !== 'ENTITIES') continue;
    if (code === '0') {
      if (value === 'VERTEX' && current?.type === 'POLYLINE') {
        if (vertex) current.vertices.push(point(vertex.x, vertex.y));
        vertex = {};
        continue;
      }
      if (value === 'SEQEND') { finish(); continue; }
      finish();
      if (['LINE', 'LWPOLYLINE', 'POLYLINE', 'ARC', 'CIRCLE', 'INSERT', 'TEXT', 'MTEXT', 'DIMENSION'].includes(value)) {
        current = { type: value, layer: '0' };
        if (value.includes('POLYLINE')) current.vertices = [];
      }
      continue;
    }
    if (!current) continue;
    const target = vertex || current;
    if (code === '8') current.layer = value;
    else if (code === '10') {
      if (current.type === 'LWPOLYLINE') current.vertices.push(point(value, 0));
      else target.x = finite(value);
    } else if (code === '20') {
      if (current.type === 'LWPOLYLINE' && current.vertices.length) current.vertices[current.vertices.length - 1][1] = finite(value);
      else target.y = finite(value);
    } else if (code === '11') current.x2 = finite(value);
    else if (code === '21') current.y2 = finite(value);
    else if (code === '40') current.radius = finite(value);
    else if (code === '50') current.startAngle = finite(value);
    else if (code === '51') current.endAngle = finite(value);
    else if (code === '1' || code === '3') current.text = `${current.text || ''}${value}`;
    else if (code === '2' && current.type === 'INSERT') current.name = value;
    else if (code === '70' && current.vertices) current.closed = (finite(value) & 1) === 1;
  }
  finish();
  if (!entities.length) throw new Error('DXF 中没有可支持的二维实体');
  return architectureFromEntities(entities);
}

function entityPoints(entity) {
  if (entity.type === 'LINE') return [point(entity.x, entity.y), point(entity.x2, entity.y2)];
  if (entity.vertices?.length) return entity.vertices;
  if (entity.type === 'CIRCLE' || entity.type === 'ARC') {
    const r = Math.abs(finite(entity.radius));
    return [point(entity.x - r, entity.y - r), point(entity.x + r, entity.y + r)];
  }
  return [point(entity.x, entity.y)];
}

function boundsFromPoints(points) {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  return { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
}

function architectureFromEntities(entities) {
  const all = entities.flatMap(entityPoints);
  const bounds = boundsFromPoints(all);
  if (!Number.isFinite(bounds.width) || bounds.width <= 0 || bounds.height <= 0) throw new Error('无法从 DXF 推导有效建筑边界');
  const walls = [];
  const columns = [];
  const openings = [];
  const annotations = [];
  entities.forEach((entity, index) => {
    const layer = String(entity.layer || '0');
    const id = `entity-${index + 1}`;
    if (/column|柱/i.test(layer) || entity.type === 'CIRCLE') {
      const box = boundsFromPoints(entityPoints(entity));
      columns.push({ id, shape: entity.type === 'CIRCLE' ? 'circle' : 'rect', ...box, locked: true, layer });
    } else if (/door|entry|entrance|exit|入口|出口|门/i.test(layer)) {
      const box = boundsFromPoints(entityPoints(entity));
      openings.push({ id, type: /exit|出口/i.test(layer) ? 'exit' : 'entrance', position: [box.x, box.y], width: Math.max(box.width, box.height, 900), locked: true, layer });
    } else if (['TEXT', 'MTEXT', 'DIMENSION'].includes(entity.type)) {
      annotations.push({ id, type: entity.type.toLowerCase(), position: point(entity.x, entity.y), text: entity.text || '', layer });
    } else if (['LINE', 'LWPOLYLINE', 'POLYLINE', 'ARC'].includes(entity.type)) {
      walls.push({ id, polyline: entityPoints(entity), thickness: 240, locked: true, layer, entityType: entity.type, closed: !!entity.closed });
    }
  });
  return {
    units: 'mm', bounds, walls, columns, openings, rooms: [], annotations,
    confidence: 1, needsConfirmation: [], sourceType: 'dxf',
    architectureVersion: `arch-${crypto.createHash('sha1').update(JSON.stringify(entities)).digest('hex').slice(0, 10)}`,
  };
}

function normalizeRequirement(input = {}) {
  const facilities = Array.isArray(input.facilities) && input.facilities.length ? input.facilities : [
    { type: '展柜', quantity: 6, size: [1200, 600], clearance: 1200 },
    { type: '互动屏', quantity: 3, size: [1600, 800], clearance: 1500 },
  ];
  return {
    projectType: String(input.projectType || input.project_type || '综合主题展厅'),
    capacity: Math.max(1, finite(input.capacity, 80)),
    zones: Array.isArray(input.zones) ? input.zones : [],
    facilities: facilities.slice(0, 100).map((f) => ({
      type: String(f.type || '展项'), quantity: Math.min(100, Math.max(1, Math.round(finite(f.quantity, 1)))),
      size: [Math.max(200, finite(f.size?.[0], 1200)), Math.max(200, finite(f.size?.[1], 600))],
      clearance: Math.max(600, finite(f.clearance, DEFAULT_CLEARANCE)), priority: finite(f.priority, 3),
    })),
    style: input.style || { keywords: ['清晰', '舒适'], materials: [] },
    routePreference: String(input.routePreference || input.route_preference || 'loop'),
  };
}

function rectOverlap(a, b, padding = 0) {
  return a.x - padding < b.x + b.width && a.x + a.width + padding > b.x && a.y - padding < b.y + b.height && a.y + a.height + padding > b.y;
}

function itemRect(item) {
  const rotated = Math.abs(finite(item.rotation)) % 180 === 90;
  const width = Math.abs(finite(rotated ? (item.depth || item.height) : item.width));
  const height = Math.abs(finite(rotated ? item.width : (item.depth || item.height)));
  return { x: finite(item.x), y: finite(item.y), width, height };
}

function validateLayout(architecture, candidate, constraints = {}) {
  const bounds = architecture?.bounds || { x: 0, y: 0, width: 0, height: 0 };
  const minPath = Math.max(600, finite(constraints.minimumPathWidth, DEFAULT_CLEARANCE));
  const errors = [];
  const warnings = [];
  const conflicts = [];
  const items = Array.isArray(candidate?.items) ? candidate.items : [];
  const columnRects = (architecture?.columns || []).map((c) => ({ x: c.x, y: c.y, width: c.width, height: c.height }));
  const wallRects = (architecture?.walls || []).flatMap((wall) => {
    const thickness = Math.max(1, finite(wall.thickness, 240));
    const points = Array.isArray(wall.polyline) ? wall.polyline : [];
    return points.slice(1).map((p, index) => {
      const a = points[index];
      return { x: Math.min(a[0], p[0]) - thickness / 2, y: Math.min(a[1], p[1]) - thickness / 2, width: Math.abs(p[0] - a[0]) + thickness, height: Math.abs(p[1] - a[1]) + thickness };
    });
  });
  items.forEach((item, i) => {
    const r = itemRect(item);
    if (r.x < bounds.x || r.y < bounds.y || r.x + r.width > bounds.x + bounds.width || r.y + r.height > bounds.y + bounds.height) {
      errors.push(`${item.id} 超出建筑边界`); conflicts.push(item.id);
    }
    if (columnRects.some((c) => rectOverlap(r, c, 100))) { errors.push(`${item.id} 与柱体冲突`); conflicts.push(item.id); }
    if (wallRects.some((wall) => rectOverlap(r, wall))) { errors.push(`${item.id} 与墙体冲突`); conflicts.push(item.id); }
    for (let j = i + 1; j < items.length; j += 1) {
      if (rectOverlap(r, itemRect(items[j]), Math.min(minPath / 2, finite(item.clearance, minPath) / 2))) {
        errors.push(`${item.id} 与 ${items[j].id} 净距不足`); conflicts.push(item.id, items[j].id);
      }
    }
  });
  const entranceBlocked = (architecture?.openings || []).some((opening) => {
    const [x, y] = opening.position || [0, 0];
    const zone = { x: x - minPath, y: y - minPath, width: finite(opening.width, 900) + minPath * 2, height: minPath * 2 };
    return items.some((item) => rectOverlap(itemRect(item), zone));
  });
  if (entranceBlocked) errors.push('入口或出口缓冲区被占用');
  if (!architecture?.openings?.some((o) => o.type === 'exit')) warnings.push('未识别到明确出口，请人工核验疏散条件');
  const usableArea = Math.max(1, bounds.width * bounds.height);
  const occupiedArea = items.reduce((sum, item) => sum + itemRect(item).width * itemRect(item).height, 0);
  const coverage = items.length ? Math.max(0, (items.length - new Set(conflicts).size) / items.length) : 0;
  const metrics = {
    mainRouteLength: Math.round((bounds.width + bounds.height) * 1.6), minimumPathWidth: minPath,
    revisitRate: candidate?.strategy === 'loop' ? 0.08 : 0.18, exhibitCoverage: Number(coverage.toFixed(3)),
    congestionPoints: new Set(conflicts).size, deadEnds: candidate?.strategy === 'grid' ? 1 : 0,
    crossings: Math.max(0, Math.floor(items.length / 8) - 1), exitVisibility: architecture?.openings?.some((o) => o.type === 'exit') ? 0.85 : 0.35,
    areaUtilization: Number((occupiedArea / usableArea).toFixed(3)),
  };
  return { status: errors.length ? 'error' : warnings.length ? 'warning' : 'passed', errors: [...new Set(errors)], warnings, conflicts: [...new Set(conflicts)], metrics };
}

function generateLayouts(architecture, rawRequirement, constraints = {}) {
  if (!architecture?.bounds) throw new Error('缺少已确认的建筑底图');
  const requirement = normalizeRequirement(rawRequirement);
  const sourceItems = requirement.facilities.flatMap((facility, fi) => Array.from({ length: facility.quantity }, (_, index) => ({
    id: `exhibit-${fi + 1}-${index + 1}`, type: facility.type, width: facility.size[0], depth: facility.size[1], clearance: facility.clearance, priority: facility.priority,
  })));
  const strategies = ['loop', 'grid', 'islands'];
  const candidates = strategies.map((strategy, ci) => {
    const b = architecture.bounds;
    const margin = Math.max(DEFAULT_CLEARANCE, Math.min(b.width, b.height) * 0.05);
    const cols = Math.max(1, Math.ceil(Math.sqrt(sourceItems.length * Math.max(1, b.width / Math.max(1, b.height)))));
    const cellW = Math.max(1, (b.width - margin * 2) / cols);
    const rows = Math.max(1, Math.ceil(sourceItems.length / cols));
    const cellH = Math.max(1, (b.height - margin * 2) / rows);
    const items = sourceItems.map((base, index) => {
      let col = index % cols;
      let row = Math.floor(index / cols);
      if (strategy === 'loop' && row % 2) col = cols - col - 1;
      if (strategy === 'islands') { col = (index * 2 + ci) % cols; row = Math.floor(index / cols); }
      return { ...base, x: Math.round(b.x + margin + col * cellW + (cellW - base.width) / 2), y: Math.round(b.y + margin + row * cellH + (cellH - base.depth) / 2), rotation: strategy === 'islands' && index % 2 ? 90 : 0, zone: requirement.zones[index % Math.max(1, requirement.zones.length)]?.name || '综合展区' };
    });
    const candidate = { id: `layout-${ci + 1}`, name: ['环游方案', '网格方案', '岛式方案'][ci], strategy, layoutVersion: 'layout-v1', items };
    candidate.validation = validateLayout(architecture, candidate, constraints);
    const m = candidate.validation.metrics;
    candidate.score = Math.max(0, Math.round(100 * (0.3 * (1 - m.revisitRate) + 0.2 * m.exhibitCoverage + 0.15 * Math.min(1, m.areaUtilization * 4) + 0.15 * (strategy === 'loop' ? 1 : 0.75) + 0.1 * m.exitVisibility + 0.1 * (1 - Math.min(1, m.congestionPoints / Math.max(1, items.length))))));
    return candidate;
  });
  return { requirement, constraintsVersion: 'rules-v1', candidates: candidates.sort((a, b) => b.score - a.score) };
}

module.exports = { parseDxf, architectureFromEntities, normalizeRequirement, validateLayout, generateLayouts, rectOverlap };
