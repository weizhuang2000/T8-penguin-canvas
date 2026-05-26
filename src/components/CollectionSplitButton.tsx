import { useState } from 'react';
import { Ungroup } from 'lucide-react';

interface CollectionSplitButtonProps {
  count: number;
  kindLabel: string;
  onSplit: () => void;
  className?: string;
  confirmThreshold?: number;
}

export default function CollectionSplitButton({
  count,
  kindLabel,
  onSplit,
  className = '',
  confirmThreshold = 6,
}: CollectionSplitButtonProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  if (count <= 1) return null;

  const run = () => {
    setConfirmOpen(false);
    onSplit();
  };

  return (
    <div className={`relative inline-flex ${className}`}>
      <button
        type="button"
        className="nodrag nopan inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border border-[var(--t8-border)] bg-[var(--t8-bg-panel-elevated)] p-0 text-[var(--t8-text-muted)] opacity-75 shadow-sm transition hover:border-[var(--t8-accent)] hover:text-[var(--t8-accent)] hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--t8-accent)]"
        style={{ minWidth: 18, minHeight: 18 }}
        title={`打散${kindLabel}合集为 ${count} 个独立节点`}
        aria-label={`打散${kindLabel}合集`}
        onPointerDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onMouseDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (count > confirmThreshold) {
            setConfirmOpen((v) => !v);
            return;
          }
          run();
        }}
      >
        <Ungroup size={10} strokeWidth={2.2} />
      </button>
      {confirmOpen && (
        <div
          data-canvas-floating-ui
          className="nodrag nopan t8-panel absolute right-0 top-6 z-[80] w-44 rounded-lg border border-[var(--t8-border)] p-2 text-[11px] text-[var(--t8-text)] shadow-xl"
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="mb-2 leading-snug text-[var(--t8-text-muted)]">
            将打散为 {count} 个独立{kindLabel}节点。
          </div>
          <div className="flex gap-1.5">
            <button type="button" className="t8-btn h-7 flex-1 px-2" onClick={run}>
              确认
            </button>
            <button
              type="button"
              className="t8-btn h-7 flex-1 px-2"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setConfirmOpen(false);
              }}
            >
              取消
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
