import { useEffect, useRef, useState } from 'react';
import {
  drawAligned,
  drawDiffPixels,
  loadImage,
  type AlignMode,
  type CompareMode,
} from '../utils/imageCompare';

function DiffCanvasPreview(props: {
  before: string;
  after: string;
  align: AlignMode;
  threshold: number;
  variant: 'heatmap' | 'focus';
}) {
  const { before, after, align, threshold, variant } = props;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([loadImage(before), loadImage(after)])
      .then(([a, b]) => {
        if (cancelled) return;
        const baseW = a.naturalWidth || a.width || 1;
        const baseH = a.naturalHeight || a.height || 1;
        const scale = Math.min(920 / baseW, 560 / baseH, 1);
        const w = Math.max(80, Math.round(baseW * scale));
        const h = Math.max(80, Math.round(baseH * scale));
        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.clearRect(0, 0, w, h);
        drawAligned(ctx, a, w, h, 'fill');
        const imgA = ctx.getImageData(0, 0, w, h);
        ctx.clearRect(0, 0, w, h);
        drawAligned(ctx, b, w, h, align);
        const imgB = ctx.getImageData(0, 0, w, h);
        const out = new ImageData(drawDiffPixels(imgA.data, imgB.data, threshold, variant), w, h);
        ctx.putImageData(out, 0, 0);
      })
      .catch(() => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (canvas && ctx) {
          canvas.width = 640;
          canvas.height = 360;
          ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [align, after, before, threshold, variant]);

  return <canvas ref={canvasRef} className="block h-full w-full rounded-lg object-contain" />;
}

export default function ImageCompareStage(props: {
  before: string;
  after: string;
  mode: CompareMode;
  align: AlignMode;
  split: number;
  opacity: number;
  threshold: number;
  labels?: [string, string];
  className?: string;
}) {
  const {
    before,
    after,
    mode,
    align,
    split,
    opacity,
    threshold,
    labels = ['输入图', '结果图'],
    className = 'aspect-video',
  } = props;
  const [blinkOn, setBlinkOn] = useState(false);

  useEffect(() => {
    if (mode !== 'blink') {
      setBlinkOn(false);
      return;
    }
    const timer = window.setInterval(() => setBlinkOn((v) => !v), 650);
    return () => window.clearInterval(timer);
  }, [mode]);

  const imageFit = align === 'fill' ? 'fill' : align;

  if (mode === 'side-by-side') {
    return (
      <div className={`grid grid-cols-2 gap-2 ${className}`}>
        {[
          [labels[0], before],
          [labels[1], after],
        ].map(([label, url]) => (
          <div key={label} className="min-h-0 overflow-hidden rounded-lg border border-[var(--t8-border)] bg-[var(--t8-bg-panel-muted)]">
            <div className="px-2 py-1 text-[10px] font-bold text-[var(--t8-text-muted)] border-b border-[var(--t8-border)]">{label}</div>
            <div className="h-[calc(100%-24px)] min-h-[160px]">
              <img src={url} alt={label} className="w-full h-full object-contain" draggable={false} />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className={`relative overflow-hidden rounded-lg border border-[var(--t8-border)] bg-[var(--t8-bg-panel-muted)] select-none ${className}`}>
      <img
        src={before}
        alt={labels[0]}
        className="absolute inset-0 w-full h-full"
        style={{ objectFit: imageFit as any, opacity: mode === 'blink' && blinkOn ? 0 : mode === 'heatmap' ? 0.35 : 1 }}
        draggable={false}
      />
      {mode === 'slider' && (
        <>
          <img
            src={after}
            alt={labels[1]}
            className="absolute inset-0 w-full h-full"
            style={{ objectFit: imageFit as any, clipPath: `inset(0 ${100 - split}% 0 0)` }}
            draggable={false}
          />
          <div className="absolute inset-y-0 w-0.5 bg-[var(--t8-accent)] shadow" style={{ left: `calc(${split}% - 1px)` }} />
        </>
      )}
      {mode === 'overlay' && (
        <img
          src={after}
          alt={labels[1]}
          className="absolute inset-0 w-full h-full"
          style={{ objectFit: imageFit as any, opacity: opacity / 100 }}
          draggable={false}
        />
      )}
      {mode === 'blink' && (
        <>
          <img
            src={after}
            alt={labels[1]}
            className="absolute inset-0 w-full h-full"
            style={{ objectFit: imageFit as any, opacity: blinkOn ? 1 : 0 }}
            draggable={false}
          />
          <div className="absolute bottom-2 left-2 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-bold text-white">
            {blinkOn ? labels[1] : labels[0]}
          </div>
        </>
      )}
      {(mode === 'heatmap' || mode === 'focus') && (
        <div className="absolute inset-0 bg-[var(--t8-bg-panel-muted)]">
          <DiffCanvasPreview before={before} after={after} align={align} threshold={threshold} variant={mode} />
        </div>
      )}
    </div>
  );
}
