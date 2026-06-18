import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import type { ElevationColorMaterialPresetItem } from '../../services/api';

interface ColorMaterialPresetSelectProps {
  presets: ElevationColorMaterialPresetItem[];
  value?: string;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
  onChange: (presetId: string, preset: ElevationColorMaterialPresetItem | null) => void;
}

const DEFAULT_CATEGORY = '默认';

function presetCategory(preset: Pick<ElevationColorMaterialPresetItem, 'category'>): string {
  return String(preset.category || DEFAULT_CATEGORY).trim() || DEFAULT_CATEGORY;
}

function groupPresets(presets: ElevationColorMaterialPresetItem[]) {
  const groups = new Map<string, ElevationColorMaterialPresetItem[]>();
  for (const preset of presets) {
    const category = presetCategory(preset);
    const items = groups.get(category) || [];
    items.push(preset);
    groups.set(category, items);
  }
  return Array.from(groups.entries()).map(([category, items]) => ({ category, items }));
}

export default function ColorMaterialPresetSelect({
  presets,
  value = '',
  disabled = false,
  className = '',
  placeholder = '不使用色彩与材质预设',
  onChange,
}: ColorMaterialPresetSelectProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const groups = useMemo(() => groupPresets(presets), [presets]);
  const selectedPreset = useMemo(
    () => presets.find((preset) => preset.id === value) || null,
    [presets, value],
  );
  const selectedCategory = selectedPreset ? presetCategory(selectedPreset) : '';
  const fallbackCategory = selectedCategory || groups[0]?.category || DEFAULT_CATEGORY;
  const [expandedCategory, setExpandedCategory] = useState<string | null>(fallbackCategory);

  useEffect(() => {
    if (!open) setExpandedCategory(fallbackCategory);
  }, [fallbackCategory, open]);

  useEffect(() => {
    if (!open) return undefined;
    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const selectPreset = (preset: ElevationColorMaterialPresetItem | null) => {
    onChange(preset?.id || '', preset);
    setOpen(false);
  };

  return (
    <div
      ref={rootRef}
      className="nodrag nowheel relative w-full"
      onPointerDown={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        className={`${className} flex min-h-[30px] items-center justify-between gap-2 text-left disabled:cursor-not-allowed`}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
      >
        <span className={selectedPreset ? 'truncate text-white' : 'truncate text-white/55'}>
          {selectedPreset?.label || placeholder}
        </span>
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-white/45 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && !disabled && (
        <div className="absolute left-0 right-0 z-50 mt-1 max-h-64 overflow-auto rounded border border-white/10 bg-zinc-950 p-1 text-[11px] shadow-2xl shadow-black/50">
          <button
            type="button"
            className={`flex w-full items-center justify-between rounded px-2 py-1.5 text-left hover:bg-white/10 ${!value ? 'text-cyan-100' : 'text-white/70'}`}
            onClick={() => selectPreset(null)}
          >
            <span className="truncate">{placeholder}</span>
            {!value && <Check className="h-3.5 w-3.5 shrink-0 text-cyan-200" />}
          </button>

          {groups.map((group) => {
            const expanded = group.category === expandedCategory;
            return (
              <div key={group.category} className="mt-1">
                <button
                  type="button"
                  className={`flex w-full items-center justify-between rounded px-2 py-1.5 text-left font-semibold text-rose-300 hover:bg-rose-300/10 ${expanded ? 'bg-rose-300/10' : ''}`}
                  onClick={() => setExpandedCategory((current) => current === group.category ? null : group.category)}
                >
                  <span className="truncate">{group.category}</span>
                  <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                </button>
                {expanded && (
                  <div className="mt-0.5 space-y-0.5">
                    {group.items.map((preset) => {
                      const selected = preset.id === value;
                      return (
                        <button
                          key={preset.id}
                          type="button"
                          title={preset.info}
                          className={`flex w-full items-center justify-between rounded px-3 py-1.5 text-left hover:bg-white/10 ${selected ? 'bg-cyan-300/10 text-cyan-100' : 'text-white/75'}`}
                          onClick={() => selectPreset(preset)}
                        >
                          <span className="truncate">{preset.label}</span>
                          {selected && <Check className="h-3.5 w-3.5 shrink-0 text-cyan-200" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
