import type { FloorplanArchitecture, FloorplanCandidate } from '../types/floorplan';

const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c));

export function buildFloorplanSvg(architecture: FloorplanArchitecture, candidate?: FloorplanCandidate | null, width = 1400, height = 900) {
  const b = architecture.bounds;
  const pad = Math.max(b.width, b.height) * 0.025;
  const viewBox = `${b.x - pad} ${b.y - pad} ${b.width + pad * 2} ${b.height + pad * 2}`;
  const conflicts = new Set(candidate?.validation?.conflicts || []);
  const walls = architecture.walls.map((wall) => `<polyline points="${wall.polyline.map((p) => `${p[0]},${p[1]}`).join(' ')}" fill="none" stroke="#64748b" stroke-width="${wall.thickness || 240}" stroke-linecap="square"/>`).join('');
  const columns = architecture.columns.map((c) => `<rect x="${c.x}" y="${c.y}" width="${c.width}" height="${c.height}" fill="#64748b"/>`).join('');
  const openings = architecture.openings.map((o) => `<g><circle cx="${o.position[0]}" cy="${o.position[1]}" r="180" fill="${o.type === 'exit' ? '#22c55e' : '#facc15'}"/><text x="${o.position[0] + 240}" y="${o.position[1]}" font-size="320" fill="#e2e8f0">${o.type === 'exit' ? '出口' : '入口'}</text></g>`).join('');
  const items = (candidate?.items || []).map((item) => `<g transform="rotate(${item.rotation || 0} ${item.x + item.width / 2} ${item.y + item.depth / 2})"><rect x="${item.x}" y="${item.y}" width="${item.width}" height="${item.depth}" rx="80" fill="${conflicts.has(item.id) ? '#ef4444' : '#2563eb'}" fill-opacity=".78" stroke="#bfdbfe" stroke-width="40"/><text x="${item.x + 80}" y="${item.y + Math.min(item.depth - 60, 360)}" font-size="260" fill="white">${esc(item.type)}</text></g>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${viewBox}" preserveAspectRatio="xMidYMid meet"><rect x="${b.x - pad}" y="${b.y - pad}" width="${b.width + pad * 2}" height="${b.height + pad * 2}" fill="#0f172a"/><g id="architecture">${walls}${columns}${openings}</g><g id="constraints"></g><g id="layout">${items}</g></svg>`;
}

export function svgDataUrl(svg: string) { return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`; }

export async function floorplanSvgToPngDataUrl(svg: string, width = 1400, height = 900): Promise<string> {
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const objectUrl = URL.createObjectURL(blob);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error('精确平面 SVG 栅格化失败'));
      element.src = objectUrl;
    });
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('浏览器不支持平面图 Canvas 栅格化');
    context.fillStyle = '#0f172a';
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    return canvas.toDataURL('image/png');
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
