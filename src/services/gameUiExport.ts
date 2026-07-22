import type { GameUiScript } from '../utils/interactiveGameScript';

export type GameUiExportFormat = 'pptx' | 'pdf' | 'docx';

export interface GameUiExportRequest {
  format: GameUiExportFormat | 'prototype-zip';
  script: GameUiScript;
  imageUrls: string[];
  sourceNodeType: 'interactive-game-script';
}

export interface GameUiExportResult {
  blob: Blob;
  filename: string;
}

function fallbackFilename(format: GameUiExportRequest['format']) {
  return format === 'prototype-zip' ? 'interactive-game-prototype.zip' : `interactive-game-script.${format}`;
}

function responseFilename(response: Response, fallback: string) {
  const disposition = response.headers.get('Content-Disposition') || '';
  const utf8 = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (utf8) {
    try { return decodeURIComponent(utf8); } catch { return fallback; }
  }
  return disposition.match(/filename="([^"]+)"/i)?.[1] || fallback;
}

export async function exportGameUiDocument(request: GameUiExportRequest): Promise<GameUiExportResult> {
  const response = await fetch('/api/documents/game-ui/export', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  if (!response.ok) {
    const contentType = response.headers.get('Content-Type') || '';
    if (contentType.includes('application/json')) {
      const payload = await response.json().catch(() => null);
      throw new Error(payload?.error || `导出失败：HTTP ${response.status}`);
    }
    throw new Error(`导出失败：HTTP ${response.status}`);
  }
  return { blob: await response.blob(), filename: responseFilename(response, fallbackFilename(request.format)) };
}

export function downloadGameUiExport(result: GameUiExportResult) {
  const url = URL.createObjectURL(result.blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = result.filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
