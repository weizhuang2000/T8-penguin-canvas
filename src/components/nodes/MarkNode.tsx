import { memo } from 'react';
import { Badge } from 'lucide-react';
import type { NodeProps } from '@xyflow/react';
import { ImageOpFrame } from './ImageOpFrame';
import { useUpdateNodeData } from './useUpdateNodeData';
import { opMark } from '../../services/imageOps';

type MarkPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

const POSITION_OPTIONS: Array<{ value: MarkPosition; label: string }> = [
  { value: 'top-left', label: '左上角' },
  { value: 'top-right', label: '右上角' },
  { value: 'bottom-left', label: '左下角' },
  { value: 'bottom-right', label: '右下角' },
];

const normalizePosition = (value: any): MarkPosition => {
  if (value === 'top-right' || value === 'bottom-left' || value === 'bottom-right') return value;
  return 'top-left';
};

const clampFontSize = (value: any) => {
  const n = Number.parseInt(String(value), 10);
  if (!Number.isFinite(n)) return 12;
  return Math.max(1, Math.min(512, n));
};

const normalizeColor = (value: any) => {
  const s = String(value || '').trim();
  return /^#[0-9a-f]{6}$/i.test(s) ? s : '#ff0000';
};

const MarkNode = (p: NodeProps) => {
  const update = useUpdateNodeData(p.id);
  const d = p.data as any;
  const text = typeof d?.markText === 'string' ? d.markText : 'R';
  const position = normalizePosition(d?.markPosition);
  const color = normalizeColor(d?.markColor);
  const fontSize = clampFontSize(d?.markFontSize);
  const autoFontSize = d?.markAutoFontSize === true;
  const positionLabel = POSITION_OPTIONS.find((item) => item.value === position)?.label || '左上角';

  return (
    <ImageOpFrame
      id={p.id}
      data={p.data}
      selected={p.selected}
      title="加标识"
      subtitle={`${text || '空'} · ${positionLabel} · ${autoFontSize ? '自动字号' : `${fontSize}px`}`}
      icon={<Badge size={13} />}
      colorHex="#fb923c"
      bgRgba="rgba(251,146,60,.2)"
      shadowRgba="rgba(251,146,60,.2)"
      textHex="#fed7aa"
      buttonClasses="bg-orange-500/20 hover:bg-orange-500/30 text-orange-200"
      renderSettings={() => (
        <div className="grid grid-cols-2 gap-2">
          <div className="col-span-2">
            <label className="text-[10px] text-white/50 block mb-1">字符</label>
            <input
              type="text"
              value={text}
              onChange={(e) => update({ markText: e.target.value })}
              className="w-full rounded bg-white/5 border border-white/10 px-2 py-1 text-xs text-white outline-none focus:border-white/30"
            />
          </div>
          <div>
            <label className="text-[10px] text-white/50 block mb-1">位置</label>
            <select
              value={position}
              onChange={(e) => update({ markPosition: normalizePosition(e.target.value) })}
              className="w-full rounded bg-white/5 border border-white/10 px-2 py-1 text-xs text-white outline-none focus:border-white/30"
            >
              {POSITION_OPTIONS.map((option) => (
                <option key={option.value} value={option.value} className="bg-zinc-900">
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] text-white/50 block mb-1">大小</label>
            <input
              type="number"
              min={1}
              max={512}
              value={fontSize}
              onChange={(e) => update({ markFontSize: clampFontSize(e.target.value) })}
              disabled={autoFontSize}
              className="w-full rounded bg-white/5 border border-white/10 px-2 py-1 text-xs text-white outline-none focus:border-white/30 disabled:opacity-45"
            />
          </div>
          <label className="col-span-2 flex items-center justify-between gap-2 rounded border border-white/10 bg-white/5 px-2 py-1.5 text-[11px] text-white/70">
            <span>自动字号</span>
            <input
              type="checkbox"
              checked={autoFontSize}
              onChange={(e) => update({ markAutoFontSize: e.target.checked })}
              className="accent-orange-400"
            />
          </label>
          <div className="col-span-2">
            <label className="text-[10px] text-white/50 block mb-1">颜色</label>
            <div className="grid grid-cols-[34px_1fr] gap-2">
              <input
                type="color"
                value={color}
                onChange={(e) => update({ markColor: e.target.value })}
                className="h-8 w-full rounded bg-white/5 border border-white/10 p-0.5"
              />
              <input
                type="text"
                value={color}
                onChange={(e) => update({ markColor: e.target.value })}
                className="w-full rounded bg-white/5 border border-white/10 px-2 py-1 text-xs text-white outline-none focus:border-white/30"
              />
            </div>
          </div>
        </div>
      )}
      runOp={async (img) =>
        opMark(img as string, {
          text,
          position,
          color,
          fontSize,
          autoFontSize,
        })
      }
    />
  );
};

export default memo(MarkNode);
