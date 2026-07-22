import type { StoryboardScript } from '../utils/storyboardScript';

export type StoryboardExportFormat = 'docx' | 'pdf' | 'pptx';
export type StoryboardExportLayout = 'production-table' | 'shot-card-table';
export type StoryboardPptShotsPerSlide = 1 | 2 | 4;

export interface StoryboardExportRequest {
  format: StoryboardExportFormat;
  layout: StoryboardExportLayout;
  pptShotsPerSlide: StoryboardPptShotsPerSlide;
  script: StoryboardScript;
  imageUrls: string[];
  sourceNodeType: 'storyboard-grid';
}

export interface StoryboardExportResult {
  blob: Blob;
  filename: string;
}

function defaultFilename(format: StoryboardExportFormat): string {
  return `storyboard-export.${format}`;
}

function filenameFromDisposition(value: string | null, format: StoryboardExportFormat): string {
  const encoded = value?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (encoded) {
    try {
      return decodeURIComponent(encoded);
    } catch {
      /* use fallback */
    }
  }
  const plain = value?.match(/filename="?([^";]+)"?/i)?.[1]?.trim();
  return plain || defaultFilename(format);
}

export async function exportStoryboardDocument(request: StoryboardExportRequest): Promise<StoryboardExportResult> {
  const response = await fetch('/api/documents/storyboard/export', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  const contentType = response.headers.get('content-type') || '';
  if (!response.ok || contentType.includes('application/json')) {
    let message = `HTTP ${response.status}`;
    try {
      const payload = await response.json();
      message = payload?.error || payload?.message || message;
    } catch {
      const text = await response.text().catch(() => '');
      if (text.trim()) message = text.trim().slice(0, 500);
    }
    throw new Error(message);
  }
  return {
    blob: await response.blob(),
    filename: filenameFromDisposition(response.headers.get('content-disposition'), request.format),
  };
}

export function downloadStoryboardExport(result: StoryboardExportResult): void {
  const url = URL.createObjectURL(result.blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = result.filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
