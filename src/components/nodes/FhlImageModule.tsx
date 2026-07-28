import { useEffect, type ReactNode } from 'react';
import { clearFhlImageRuntimeConfig, setFhlImageRuntimeConfig, type FhlImageRuntimeConfig } from '../../services/fhlImageRuntime';

const FIELD = 'w-full rounded border border-white/10 bg-black/20 px-2 py-1.5 text-[11px] text-white outline-none focus:border-cyan-300/60 disabled:opacity-55';
const BUTTON = 'inline-flex h-7 items-center justify-center gap-1 rounded border border-white/10 bg-white/[0.06] px-2 text-[10px] text-white/75 hover:bg-white/[0.12] disabled:cursor-not-allowed disabled:opacity-40';
const GENERATE_2K = ['1:1', '3:2', '2:3', '4:3', '3:4', '16:9', '9:16', '2:1', '1:2', '7:4', '4:7'];
const EDIT_2K = ['1:1', '3:2', '2:3', '4:3', '3:4', '5:4', '4:5', '16:9', '9:16', '2:1', '1:2', '3:1', '1:3', '7:4', '4:7'];
const FOUR_K = ['1:1', '3:2', '2:3', '16:9', '9:16', '2:1', '1:2', '3:1', '1:3', '7:4', '4:7'];

export interface FhlImageModuleConfig {
  active: boolean;
  quality: '2K' | '4K';
  aspect: string;
  outputFormat: 'jpg' | 'png';
  aspectOptions: string[];
}

export function getFhlImageModuleConfig(data: any, referenceCount = 0): FhlImageModuleConfig {
  const quality: '2K' | '4K' = data?.fhlQuality === '4K' ? '4K' : '2K';
  const aspectOptions = quality === '4K' ? FOUR_K : (referenceCount > 0 ? EDIT_2K : GENERATE_2K);
  const requestedAspect = String(data?.fhlAspect || '16:9');
  return {
    active: data?.fhlImageEngine === 'fhl',
    quality,
    aspect: aspectOptions.includes(requestedAspect) ? requestedAspect : '16:9',
    outputFormat: data?.fhlOutputFormat === 'png' ? 'png' : 'jpg',
    aspectOptions,
  };
}

export function FhlImageModuleControls({
  nodeId,
  data,
  update,
  busy,
  isReadonly,
  referenceCount = 0,
  standardTitle = '生图平台与模型',
  compact = false,
  children,
}: {
  nodeId: string;
  data: any;
  update: (patch: Record<string, any>) => void;
  busy: boolean;
  isReadonly?: boolean;
  referenceCount?: number;
  standardTitle?: string;
  compact?: boolean;
  children?: ReactNode;
}) {
  const config = getFhlImageModuleConfig(data, referenceCount);
  const disabled = Boolean(isReadonly) || busy;

  useEffect(() => {
    if (data?.fhlAspect && data.fhlAspect !== config.aspect) update({ fhlAspect: config.aspect });
  }, [config.aspect, data?.fhlAspect, update]);

  useEffect(() => {
    const runtimeConfig: FhlImageRuntimeConfig = { ...config, update };
    setFhlImageRuntimeConfig(nodeId, runtimeConfig);
    return () => clearFhlImageRuntimeConfig(nodeId);
  }, [config.active, config.aspect, config.outputFormat, config.quality, nodeId, update]);

  const fhlFields = (
    <fieldset disabled={disabled || !config.active} className={`grid grid-cols-3 gap-2 ${!config.active ? 'opacity-45' : ''}`}>
      <label className="space-y-1"><span className="text-[10px] text-white/55">规格</span><select className={FIELD} value={config.quality} onChange={(event) => update({ fhlQuality: event.target.value })}><option value="2K">2K</option><option value="4K">4K</option></select></label>
      <label className="space-y-1"><span className="text-[10px] text-white/55">比例</span><select className={FIELD} value={config.aspect} onChange={(event) => update({ fhlAspect: event.target.value })}>{config.aspectOptions.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
      <label className="space-y-1"><span className="text-[10px] text-white/55">保存格式</span><select className={FIELD} value={config.outputFormat} onChange={(event) => update({ fhlOutputFormat: event.target.value })}><option value="jpg">JPG</option><option value="png">PNG</option></select></label>
    </fieldset>
  );

  if (compact) {
    return (
      <div data-fhl-image-module="switcher" className={`rounded border p-2 ${config.active ? 'border-amber-300/35 bg-amber-300/10' : 'border-white/10 bg-white/[0.025]'}`}>
        <div className="mb-2 flex items-center justify-between gap-2">
          <div>
            <div className={`text-[11px] font-semibold ${config.active ? 'text-amber-100' : 'text-cyan-100'}`}>{config.active ? 'FHL 生图模块' : '原生生图模块'}</div>
            <div className="mt-0.5 text-[9px] text-white/35">{config.active ? (referenceCount > 0 ? '已检测到参考图，将使用组合编辑' : '未连接参考图，将使用文生图') : '切换到 FHL 后，原生生图参数会保留但本次生成不再使用'}</div>
          </div>
          <button type="button" className={`${BUTTON} ${config.active ? 'border-amber-300/35 bg-amber-300/20 text-amber-100' : 'border-cyan-300/35 bg-cyan-300/20 text-cyan-100'}`} disabled={disabled} onClick={() => update({ fhlImageEngine: config.active ? 'standard' : 'fhl' })}>
            {config.active ? '已生效' : '启用 FHL'}
          </button>
        </div>
        {fhlFields}
      </div>
    );
  }

  return (
    <>
      <div data-fhl-image-module="standard" className={`rounded border p-2 ${config.active ? 'border-white/10 bg-white/[0.025]' : 'border-cyan-300/35 bg-cyan-300/10'}`}>
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className={`text-[11px] font-semibold ${config.active ? 'text-white/55' : 'text-cyan-100'}`}>{standardTitle}</div>
          <button type="button" className={`${BUTTON} ${!config.active ? 'border-cyan-300/35 bg-cyan-300/20 text-cyan-100' : ''}`} disabled={disabled} onClick={() => update({ fhlImageEngine: 'standard' })}>
            {!config.active ? '已生效' : '设为生效'}
          </button>
        </div>
        <fieldset disabled={disabled || config.active} className={config.active ? 'opacity-45' : ''}>{children}</fieldset>
      </div>
      <div data-fhl-image-module="fhl" className={`rounded border p-2 ${config.active ? 'border-amber-300/35 bg-amber-300/10' : 'border-white/10 bg-white/[0.025]'}`}>
        <div className="mb-2 flex items-center justify-between gap-2">
          <div>
            <div className={`text-[11px] font-semibold ${config.active ? 'text-amber-100' : 'text-white/55'}`}>FHL 生图模块</div>
            <div className="mt-0.5 text-[9px] text-white/35">{referenceCount > 0 ? '已检测到参考图，将使用组合编辑' : '未连接参考图，将使用文生图'}</div>
          </div>
          <button type="button" className={`${BUTTON} ${config.active ? 'border-amber-300/35 bg-amber-300/20 text-amber-100' : ''}`} disabled={disabled} onClick={() => update({ fhlImageEngine: 'fhl' })}>
            {config.active ? '已生效' : '设为生效'}
          </button>
        </div>
        {fhlFields}
      </div>
    </>
  );
}
