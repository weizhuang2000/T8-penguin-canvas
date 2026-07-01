import { memo, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Lock, Maximize2, SlidersHorizontal, Unlock, X } from 'lucide-react';
import type { NodeProps } from '@xyflow/react';
import { ImageOpFrame } from './ImageOpFrame';
import { useUpdateNodeData } from './useUpdateNodeData';
import {
  opResize,
  type ResizeAnchor,
  type ResizeFit,
  type ResizeKernel,
  type ResizeMode,
  type ResizeOptions,
  type ResizeOutputFormat,
  type ResizeUnit,
} from '../../services/imageOps';

const UNITS: Array<{ value: ResizeUnit; label: string }> = [
  { value: 'px', label: 'px' },
  { value: '%', label: '%' },
  { value: 'inch', label: 'inch' },
  { value: 'cm', label: 'cm' },
  { value: 'mm', label: 'mm' },
];

const KERNELS: Array<{ value: ResizeKernel; label: string }> = [
  { value: 'auto', label: '自动 / Lanczos' },
  { value: 'nearest', label: '邻近' },
  { value: 'linear', label: '双线性' },
  { value: 'cubic', label: '双三次' },
  { value: 'mitchell', label: 'Mitchell' },
  { value: 'lanczos2', label: 'Lanczos 2' },
  { value: 'lanczos3', label: 'Lanczos 3' },
];

const FITS: Array<{ value: ResizeFit; label: string }> = [
  { value: 'inside', label: '适合范围' },
  { value: 'cover', label: '裁切铺满' },
  { value: 'contain', label: '留白包含' },
  { value: 'fill', label: '拉伸填充' },
  { value: 'outside', label: '覆盖范围' },
];

const FORMATS: Array<{ value: ResizeOutputFormat; label: string }> = [
  { value: 'png', label: 'PNG' },
  { value: 'jpg', label: 'JPG' },
  { value: 'webp', label: 'WebP' },
  { value: 'source', label: '源格式' },
];

const ANCHORS: ResizeAnchor[] = [
  'top-left',
  'top',
  'top-right',
  'left',
  'center',
  'right',
  'bottom-left',
  'bottom',
  'bottom-right',
];

const anchorLabel: Record<ResizeAnchor, string> = {
  'top-left': '↖',
  top: '↑',
  'top-right': '↗',
  left: '←',
  center: '•',
  right: '→',
  'bottom-left': '↙',
  bottom: '↓',
  'bottom-right': '↘',
};

const modeLabel: Record<ResizeMode, string> = {
  image: '图像大小',
  canvas: '画布大小',
};

function numberFrom(value: unknown, fallback: number) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function positiveInt(value: unknown, fallback: number) {
  return Math.max(1, Math.round(numberFrom(value, fallback)));
}

function Select<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <select className="t8-select nodrag nowheel w-full px-2 py-1.5 text-xs" value={value} onChange={(event) => onChange(event.target.value as T)}>
      {options.map((item) => (
        <option key={item.value} value={item.value}>
          {item.label}
        </option>
      ))}
    </select>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="block text-[10px] font-semibold" style={{ color: 'var(--t8-text-muted)' }}>{label}</span>
      {children}
    </label>
  );
}

function NumberInput({
  value,
  min = 1,
  max,
  step = 1,
  onChange,
}: {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  return (
    <input
      className="t8-input nodrag nowheel w-full px-2 py-1.5 text-xs"
      type="number"
      min={min}
      max={max}
      step={step}
      value={Number.isFinite(value) ? value : ''}
      onChange={(event) => onChange(Number(event.target.value) || 0)}
    />
  );
}

function Toggle({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-[11px]" style={{ color: 'var(--t8-text-main)' }}>
      <input className="nodrag" type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      {label}
    </label>
  );
}

function buildOptions(d: any): ResizeOptions {
  const mode = (d.resizeMode === 'canvas' ? 'canvas' : 'image') as ResizeMode;
  const width = positiveInt(d.width, 1024);
  const height = positiveInt(d.height, 1024);
  const unit = (d.resizeUnit || 'px') as ResizeUnit;
  const keepAspect = d.resizeKeepAspect !== false;
  const resample = d.resizeResample !== false;
  const kernel = (d.resizeKernel || 'lanczos3') as ResizeKernel;
  const fit = (d.fit || 'cover') as ResizeFit;
  const density = positiveInt(d.resizeDensity, 72);
  const anchor = (d.resizeAnchor || 'center') as ResizeAnchor;
  const background = typeof d.resizeBackground === 'string' ? d.resizeBackground : '#00000000';
  const format = (d.resizeFormat || 'png') as ResizeOutputFormat;
  const quality = Math.max(1, Math.min(100, positiveInt(d.resizeQuality, 90)));
  const relative = d.resizeCanvasRelative === true;
  return {
    mode,
    width,
    height,
    unit,
    keepAspect,
    resample,
    kernel,
    fit,
    anchor,
    background,
    density,
    format,
    quality,
    imageSize: { width, height, unit, keepAspect, resample, density, fit, kernel },
    canvasSize: { width, height, unit, relative, anchor, background },
  };
}

function ResizeSettingsModal({
  d,
  onClose,
  update,
}: {
  d: any;
  onClose: () => void;
  update: (patch: Record<string, any>) => void;
}) {
  const options = buildOptions(d);
  const isCanvas = options.mode === 'canvas';
  const summary = isCanvas
    ? `${options.canvasSize?.relative ? '相对' : '绝对'}画布 ${options.width}${options.unit} × ${options.height}${options.unit} · ${options.anchor}`
    : `${options.width}${options.unit} × ${options.height}${options.unit} · ${options.resample ? options.kernel : '仅改 DPI'} · ${options.density} DPI`;

  return createPortal(
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/55 p-4" onMouseDown={onClose}>
      <div
        className="nodrag nowheel w-full max-w-2xl rounded-lg border shadow-2xl"
        style={{ background: 'var(--t8-bg-panel)', borderColor: 'var(--t8-border-strong)', color: 'var(--t8-text-main)' }}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b px-4 py-3" style={{ borderColor: 'var(--t8-border)' }}>
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-orange-500 text-white">
            <Maximize2 size={16} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-bold">尺寸调整完整设置</div>
            <div className="truncate text-[11px]" style={{ color: 'var(--t8-text-muted)' }}>{summary}</div>
          </div>
          <button type="button" className="t8-btn h-8 w-8 p-0" onClick={onClose} title="关闭">
            <X size={15} />
          </button>
        </div>

        <div className="grid gap-4 p-4 md:grid-cols-[1fr_220px]">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2 rounded-md border p-2" style={{ borderColor: 'var(--t8-border)' }}>
              <button
                type="button"
                className={`t8-btn px-2 py-1.5 text-xs ${options.mode === 'image' ? 't8-btn-primary' : ''}`}
                onClick={() => update({ resizeMode: 'image' })}
              >
                图像大小
              </button>
              <button
                type="button"
                className={`t8-btn px-2 py-1.5 text-xs ${options.mode === 'canvas' ? 't8-btn-primary' : ''}`}
                onClick={() => update({ resizeMode: 'canvas' })}
              >
                画布大小
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <Field label={isCanvas ? '画布宽' : '宽度'}>
                <NumberInput value={options.width || 1024} step={options.unit === '%' ? 1 : 1} onChange={(value) => update({ width: value })} />
              </Field>
              <Field label={isCanvas ? '画布高' : '高度'}>
                <NumberInput value={options.height || 1024} step={options.unit === '%' ? 1 : 1} onChange={(value) => update({ height: value })} />
              </Field>
              <Field label="单位">
                <Select value={options.unit || 'px'} options={UNITS} onChange={(value) => update({ resizeUnit: value })} />
              </Field>
            </div>

            {!isCanvas ? (
              <div className="grid grid-cols-2 gap-3 rounded-md border p-3" style={{ borderColor: 'var(--t8-border)' }}>
                <Toggle checked={options.keepAspect !== false} label="约束比例" onChange={(value) => update({ resizeKeepAspect: value })} />
                <Toggle checked={options.resample !== false} label="重新采样" onChange={(value) => update({ resizeResample: value })} />
                <Field label="重采样算法">
                  <Select value={options.kernel || 'lanczos3'} options={KERNELS} onChange={(value) => update({ resizeKernel: value })} />
                </Field>
                <Field label="适配方式">
                  <Select value={options.fit || 'inside'} options={FITS} onChange={(value) => update({ fit: value })} />
                </Field>
                <Field label="分辨率 DPI">
                  <NumberInput value={options.density || 72} min={1} max={2400} onChange={(value) => update({ resizeDensity: value })} />
                </Field>
                <div className="flex items-end text-[10px] leading-snug" style={{ color: 'var(--t8-text-dim)' }}>
                  关闭重新采样时只写入 DPI 元数据，像素尺寸保持不变。
                </div>
              </div>
            ) : (
              <div className="grid gap-3 rounded-md border p-3" style={{ borderColor: 'var(--t8-border)' }}>
                <Toggle checked={options.canvasSize?.relative === true} label="相对增减画布尺寸" onChange={(value) => update({ resizeCanvasRelative: value })} />
                <div className="grid grid-cols-[1fr_1fr] gap-3">
                  <Field label="背景">
                    <select
                      className="t8-select nodrag nowheel w-full px-2 py-1.5 text-xs"
                      value={options.background === '#00000000' ? 'transparent' : options.background}
                      onChange={(event) => {
                        const value = event.target.value;
                        update({ resizeBackground: value === 'transparent' ? '#00000000' : value });
                      }}
                    >
                      <option value="transparent">透明</option>
                      <option value="#ffffff">白色</option>
                      <option value="#000000">黑色</option>
                      <option value="#f3f4f6">浅灰</option>
                    </select>
                  </Field>
                  <Field label="自定义背景">
                    <input
                      className="t8-input nodrag nowheel w-full px-2 py-1.5 text-xs"
                      value={options.background || '#00000000'}
                      onChange={(event) => update({ resizeBackground: event.target.value })}
                    />
                  </Field>
                </div>
                <div>
                  <div className="mb-1 text-[10px] font-semibold" style={{ color: 'var(--t8-text-muted)' }}>锚点</div>
                  <div className="grid w-28 grid-cols-3 gap-1">
                    {ANCHORS.map((anchor) => (
                      <button
                        key={anchor}
                        type="button"
                        className={`t8-btn h-8 p-0 text-xs ${options.anchor === anchor ? 't8-btn-primary' : ''}`}
                        onClick={() => update({ resizeAnchor: anchor })}
                        title={anchor}
                      >
                        {anchorLabel[anchor]}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="rounded border px-2 py-1.5 text-[10px]" style={{ borderColor: '#f973164d', color: 'var(--t8-text-muted)' }}>
                  目标画布小于原图时会按锚点裁切，大于原图时会按锚点扩展。
                </div>
              </div>
            )}
          </div>

          <div className="space-y-3 rounded-md border p-3" style={{ borderColor: 'var(--t8-border)' }}>
            <div className="text-[11px] font-bold">输出</div>
            <Field label="格式">
              <Select value={options.format || 'png'} options={FORMATS} onChange={(value) => update({ resizeFormat: value })} />
            </Field>
            <Field label="质量">
              <NumberInput value={options.quality || 90} min={1} max={100} onChange={(value) => update({ resizeQuality: value })} />
            </Field>
            <div className="rounded-md border p-2 text-[11px] leading-relaxed" style={{ borderColor: 'var(--t8-border)', color: 'var(--t8-text-muted)' }}>
              <div className="font-semibold" style={{ color: 'var(--t8-text-main)' }}>摘要</div>
              <div>{summary}</div>
              <div>输出 {options.format?.toUpperCase()} · 质量 {options.quality}</div>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

const ResizeNode = (p: NodeProps) => {
  const update = useUpdateNodeData(p.id);
  const d = p.data as any;
  const [modalOpen, setModalOpen] = useState(false);
  const options = useMemo(() => buildOptions(d || {}), [d]);
  const subtitle = options.mode === 'canvas'
    ? `画布 ${options.width}×${options.height} ${options.anchor}`
    : `${options.width}×${options.height} ${options.resample ? options.kernel : 'DPI'} ${options.keepAspect ? '锁定' : '自由'}`;

  return (
    <>
      <ImageOpFrame
        id={p.id}
        data={p.data}
        selected={p.selected}
        title="尺寸调整"
        subtitle={subtitle}
        icon={<Maximize2 size={13} />}
        colorHex="#fb923c"
        bgRgba="rgba(251,146,60,.2)"
        shadowRgba="rgba(251,146,60,.2)"
        textHex="#fed7aa"
        buttonClasses="bg-orange-500/20 hover:bg-orange-500/30 text-orange-200"
        width={300}
        renderSettings={() => (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-1 rounded-md border p-1" style={{ borderColor: 'var(--t8-border)' }}>
              {(['image', 'canvas'] as ResizeMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  className={`t8-btn px-2 py-1 text-[11px] ${options.mode === mode ? 't8-btn-primary' : ''}`}
                  onClick={() => update({ resizeMode: mode })}
                >
                  {modeLabel[mode]}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-[1fr_1fr_72px] gap-2">
              <Field label="宽">
                <NumberInput value={options.width || 1024} onChange={(value) => update({ width: value })} />
              </Field>
              <Field label="高">
                <NumberInput value={options.height || 1024} onChange={(value) => update({ height: value })} />
              </Field>
              <Field label="单位">
                <Select value={options.unit || 'px'} options={UNITS} onChange={(value) => update({ resizeUnit: value })} />
              </Field>
            </div>
            <div className="grid grid-cols-[auto_1fr_auto] items-end gap-2">
              {options.mode === 'image' ? (
                <button
                  type="button"
                  className="t8-btn h-8 w-8 p-0"
                  onClick={() => update({ resizeKeepAspect: !options.keepAspect })}
                  title={options.keepAspect ? '解除比例锁定' : '锁定比例'}
                >
                  {options.keepAspect ? <Lock size={13} /> : <Unlock size={13} />}
                </button>
              ) : (
                <Toggle checked={options.canvasSize?.relative === true} label="相对" onChange={(value) => update({ resizeCanvasRelative: value })} />
              )}
              <Field label={options.mode === 'image' ? '算法' : '锚点'}>
                {options.mode === 'image' ? (
                  <Select value={options.kernel || 'lanczos3'} options={KERNELS} onChange={(value) => update({ resizeKernel: value })} />
                ) : (
                  <select className="t8-select nodrag nowheel w-full px-2 py-1.5 text-xs" value={options.anchor} onChange={(event) => update({ resizeAnchor: event.target.value })}>
                    {ANCHORS.map((anchor) => <option key={anchor} value={anchor}>{anchorLabel[anchor]} {anchor}</option>)}
                  </select>
                )}
              </Field>
              <button type="button" className="t8-btn h-8 w-8 p-0" onClick={() => setModalOpen(true)} title="完整设置">
                <SlidersHorizontal size={13} />
              </button>
            </div>
          </div>
        )}
        runOp={async (img) => opResize(img as string, buildOptions(d || {}))}
      />
      {modalOpen && <ResizeSettingsModal d={d || {}} update={update} onClose={() => setModalOpen(false)} />}
    </>
  );
};

export default memo(ResizeNode);
