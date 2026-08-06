import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { ImageUp } from 'lucide-react';
import RhImageCapabilityButton from './RhImageCapabilityButton';
import type { RunRhImageCapabilityBatchResult } from '../services/rhToolboxCapabilities';
import {
  RH_IMAGE_NODE_CAPABILITY_PRESETS,
  resolveRhImageCapabilityPreset,
  type RhImageCapabilityPresetId,
} from '../utils/rhToolboxCapabilities';

interface RhImageCapabilityRailProps {
  sourceUrl?: string;
  sourceUrls?: string[];
  accent: string;
  isDark: boolean;
  isPixel?: boolean;
  presets?: RhImageCapabilityPresetId[];
  onComplete: (result: RunRhImageCapabilityBatchResult) => void;
  onError?: (message: string) => void;
  onRunningChange?: (running: boolean) => void;
  onSeedvr2?: () => void;
  style?: CSSProperties;
}

export default function RhImageCapabilityRail({
  sourceUrl,
  sourceUrls,
  accent,
  isDark,
  isPixel = false,
  presets = RH_IMAGE_NODE_CAPABILITY_PRESETS,
  onComplete,
  onError,
  onRunningChange,
  onSeedvr2,
  style,
}: RhImageCapabilityRailProps) {
  const [runningPresetIds, setRunningPresetIds] = useState<Set<string>>(() => new Set());
  const runningPresetIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    onRunningChange?.(runningPresetIds.size > 0);
  }, [onRunningChange, runningPresetIds]);

  const setPresetRunning = useCallback((presetId: string, running: boolean) => {
    const next = new Set(runningPresetIdsRef.current);
    if (running) next.add(presetId);
    else next.delete(presetId);
    runningPresetIdsRef.current = next;
    setRunningPresetIds(next);
    onRunningChange?.(next.size > 0);
  }, [onRunningChange]);

  if (presets.length === 0) return null;

  return (
    <div
      className="nodrag nopan rh-image-capability-rail"
      data-rh-image-capability-rail
      data-rh-image-capability-count={presets.length}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      style={{
        position: 'absolute',
        top: 44,
        left: -44,
        zIndex: 32,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        maxHeight: 'calc(100% - 58px)',
        overflowX: 'hidden',
        overflowY: 'auto',
        padding: '2px',
        scrollbarWidth: 'thin',
        pointerEvents: 'auto',
        ...style,
      }}
    >
      {presets.map((presetId) => {
        const preset = resolveRhImageCapabilityPreset(presetId);
        if (presetId === 'upscale' && onSeedvr2) {
          const hasSource = Boolean(sourceUrl?.trim() || sourceUrls?.some((url) => url?.trim()));
          return (
            <button
              key={preset.id}
              type="button"
              className="nodrag nopan rh-image-capability-button rh-image-capability-button--rail"
              aria-label="SeedVR2 超分"
              data-seedvr2-quick-action
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onSeedvr2();
              }}
              onMouseDown={(event) => event.stopPropagation()}
              disabled={!hasSource}
              title="插入并运行 SeedVR2 超分节点"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'column',
                gap: 1,
                padding: '4px 2px',
                width: 36,
                minWidth: 36,
                height: 36,
                background: isDark ? 'rgba(28,28,32,0.92)' : 'rgba(255,255,255,0.95)',
                color: accent,
                border: `1px solid ${accent}66`,
                borderRadius: isPixel ? 0 : 6,
                boxShadow: isPixel
                  ? `2px 2px 0 ${accent}`
                  : isDark
                    ? '0 6px 24px rgba(0,0,0,0.4)'
                    : '0 6px 24px rgba(0,0,0,0.12)',
                cursor: hasSource ? 'pointer' : 'not-allowed',
                fontSize: 10,
                fontWeight: 600,
                lineHeight: 1,
                whiteSpace: 'nowrap',
                opacity: hasSource ? 1 : 0.56,
              }}
            >
              <ImageUp size={12} />
              <span>4K</span>
            </button>
          );
        }
        return (
          <RhImageCapabilityButton
            key={preset.id}
            sourceUrl={sourceUrl}
            sourceUrls={sourceUrls}
            accent={accent}
            isDark={isDark}
            isPixel={isPixel}
            preset={presetId}
            label={preset.label}
            shortLabel={preset.shortLabel}
            title={preset.title}
            variant="rail"
            onComplete={onComplete}
            onError={onError}
            onRunningChange={(running) => setPresetRunning(preset.id, running)}
          />
        );
      })}
    </div>
  );
}
