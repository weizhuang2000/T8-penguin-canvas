import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import type { UnitPanelMaterialItem } from '../../services/api';

interface UnitPanelMaterialSelectProps {
  materials: UnitPanelMaterialItem[];
  value?: string;
  values?: string[];
  multiple?: boolean;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
  onChange: (next: string | string[], selected: UnitPanelMaterialItem | UnitPanelMaterialItem[] | null) => void;
}

const DEFAULT_CATEGORY = '默认';

function categoryOf(item: UnitPanelMaterialItem) {
  return String(item.category || DEFAULT_CATEGORY).trim() || DEFAULT_CATEGORY;
}

function groupMaterials(materials: UnitPanelMaterialItem[]) {
  const groups = new Map<string, UnitPanelMaterialItem[]>();
  for (const item of materials) {
    const category = categoryOf(item);
    const list = groups.get(category) || [];
    list.push(item);
    groups.set(category, list);
  }
  return Array.from(groups.entries()).map(([category, items]) => ({ category, items }));
}

export default function UnitPanelMaterialSelect({
  materials,
  value = '',
  values = [],
  multiple = false,
  disabled = false,
  className = '',
  placeholder = '不使用材质选项',
  onChange,
}: UnitPanelMaterialSelectProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const selectedIds = useMemo(
    () => new Set(multiple ? values : (value ? [value] : [])),
    [multiple, value, values],
  );
  const groups = useMemo(() => groupMaterials(materials), [materials]);
  const selected = useMemo(
    () => materials.filter((item) => selectedIds.has(item.id)),
    [materials, selectedIds],
  );
  const selectedLabel = selected.length
    ? selected.map((item) => item.label).join('、')
    : placeholder;

  useEffect(() => {
    if (!open) return undefined;
    const close = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  const selectNone = () => {
    onChange(multiple ? [] : '', multiple ? [] : null);
    if (!multiple) setOpen(false);
  };

  const toggle = (item: UnitPanelMaterialItem) => {
    if (!multiple) {
      onChange(item.id, item);
      setOpen(false);
      return;
    }
    const next = new Set(selectedIds);
    if (next.has(item.id)) next.delete(item.id);
    else next.add(item.id);
    const ids = Array.from(next);
    onChange(ids, materials.filter((entry) => ids.includes(entry.id)));
  };

  return (
    <div ref={rootRef} className="nodrag nowheel relative w-full" onPointerDown={(event) => event.stopPropagation()}>
      <button
        type="button"
        disabled={disabled}
        className={`${className} flex min-h-[30px] items-center justify-between gap-2 text-left disabled:cursor-not-allowed`}
        onClick={() => setOpen((current) => !current)}
      >
        <span className={selected.length ? 'truncate text-white' : 'truncate text-white/55'}>{selectedLabel}</span>
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-white/45 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && !disabled && (
        <div className="absolute left-0 right-0 z-50 mt-1 max-h-72 overflow-auto rounded border border-white/10 bg-zinc-950 p-1 text-[11px] shadow-2xl shadow-black/50">
          <button
            type="button"
            className={`flex w-full items-center justify-between rounded px-2 py-1.5 text-left hover:bg-white/10 ${selected.length === 0 ? 'text-cyan-100' : 'text-white/70'}`}
            onClick={selectNone}
          >
            <span className="truncate">{placeholder}</span>
            {selected.length === 0 && <Check className="h-3.5 w-3.5 shrink-0 text-cyan-200" />}
          </button>
          {groups.map((group) => (
            <div key={group.category} className="mt-1">
              <div className="px-2 py-1 text-[10px] font-semibold text-amber-200/80">{group.category}</div>
              {group.items.map((item) => {
                const active = selectedIds.has(item.id);
                return (
                  <button
                    key={item.id}
                    type="button"
                    title={[item.description, item.texture, item.usage].filter(Boolean).join('\n')}
                    className={`flex w-full items-center justify-between rounded px-3 py-1.5 text-left hover:bg-white/10 ${active ? 'bg-cyan-300/10 text-cyan-100' : 'text-white/75'}`}
                    onClick={() => toggle(item)}
                  >
                    <span className="truncate">{item.label}</span>
                    {active && <Check className="h-3.5 w-3.5 shrink-0 text-cyan-200" />}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
