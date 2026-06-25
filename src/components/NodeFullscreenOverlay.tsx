/**
 * NodeFullscreenOverlay —— 节点全屏覆盖层
 *
 * 将选中节点的 DOM 元素移动到全屏 portal 容器中,
 * 退出时移回原位, 保留所有 React 状态与交互性。
 */
import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Minimize2 } from 'lucide-react';
import { useFullscreenNodeStore } from '../stores/fullscreenNode';
import { useThemeStore } from '../stores/theme';
import { resolveThemeTemplate } from '../theme/defaultTemplates';

/** 需要在全屏模式下覆盖的 ReactFlow 节点行内样式 */
const FULLSCREEN_OVERRIDE: Partial<CSSStyleDeclaration> = {
  position: 'relative',
  width: '100%',
  height: '100%',
  minWidth: '100%',
  minHeight: '100%',
  maxWidth: '100%',
  maxHeight: '100%',
  transform: 'none',
  margin: '0',
  inset: 'auto',
  zIndex: 'auto',
};

const NodeFullscreenOverlay = () => {
  const fullscreenNodeId = useFullscreenNodeStore((s) => s.fullscreenNodeId);
  const setFullscreenNode = useFullscreenNodeStore((s) => s.setFullscreenNode);
  const isDark = useThemeStore((s) => s.theme === 'dark');
  const visualStyle = useThemeStore((s) => {
    const tpl = resolveThemeTemplate(s.templateId, s.customTemplates);
    return tpl.visuals?.style || s.style;
  });
  const isPixel = visualStyle === 'pixel';

  const containerRef = useRef<HTMLDivElement>(null);
  const savedRef = useRef<{
    parent: HTMLElement;
    nextSibling: Node | null;
    el: HTMLElement;
    originalCssText: string;
  } | null>(null);

  const close = useCallback(() => {
    const saved = savedRef.current;
    if (saved) {
      // 恢复原始样式
      saved.el.style.cssText = saved.originalCssText;
      // 移回原位
      try {
        if (saved.nextSibling && saved.nextSibling.parentNode === saved.parent) {
          saved.parent.insertBefore(saved.el, saved.nextSibling);
        } else {
          saved.parent.appendChild(saved.el);
        }
      } catch {
        /* DOM 可能已卸载 */
      }
      savedRef.current = null;
    }
    setFullscreenNode(null);
  }, [setFullscreenNode]);

  // DOM 搬运: 将节点元素移入全屏容器
  useLayoutEffect(() => {
    if (!fullscreenNodeId) return;

    // 容器可能还未挂载 (portal 在同一渲染周期), 用 rAF 等一帧
    const raf = requestAnimationFrame(() => {
      const nodeEl = document.querySelector<HTMLElement>(
        `[data-id="${fullscreenNodeId}"]`,
      );
      const container = containerRef.current;
      if (!nodeEl || !container) return;

      // 保存原始状态
      savedRef.current = {
        parent: nodeEl.parentElement!,
        nextSibling: nodeEl.nextSibling,
        el: nodeEl,
        originalCssText: nodeEl.style.cssText,
      };

      // 移入全屏容器
      container.appendChild(nodeEl);

      // 覆盖 ReactFlow 的定位样式
      Object.assign(nodeEl.style, FULLSCREEN_OVERRIDE);
    });

    return () => {
      cancelAnimationFrame(raf);
      // 组件卸载 / fullscreenNodeId 变化时移回
      const saved = savedRef.current;
      if (saved) {
        saved.el.style.cssText = saved.originalCssText;
        try {
          if (saved.nextSibling && saved.nextSibling.parentNode === saved.parent) {
            saved.parent.insertBefore(saved.el, saved.nextSibling);
          } else {
            saved.parent.appendChild(saved.el);
          }
        } catch {
          /* ignore */
        }
        savedRef.current = null;
      }
    };
  }, [fullscreenNodeId]);

  // ESC 退出
  useEffect(() => {
    if (!fullscreenNodeId) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [fullscreenNodeId, close]);

  if (!fullscreenNodeId) return null;

  const headerBg = isDark ? 'rgba(28,28,32,0.96)' : 'rgba(255,255,255,0.96)';
  const headerBorder = isDark
    ? '1px solid rgba(255,255,255,0.08)'
    : '1px solid rgba(0,0,0,0.08)';
  const btnBg = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)';
  const btnBorder = isDark
    ? '1px solid rgba(255,255,255,0.15)'
    : '1px solid rgba(0,0,0,0.12)';
  const btnColor = isDark ? '#e4e4e7' : '#3f3f46';

  return createPortal(
    <div
      data-node-fullscreen-overlay
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        background: isDark ? '#18181b' : '#f4f4f5',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'inherit',
      }}
    >
      {/* 顶栏 */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '6px 16px',
          background: headerBg,
          borderBottom: headerBorder,
          backdropFilter: 'blur(8px)',
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontSize: 11,
            opacity: 0.5,
            color: isDark ? '#fff' : '#000',
            letterSpacing: 1,
            textTransform: 'uppercase',
          }}
        >
          全屏预览
        </span>
        <button
          type="button"
          onClick={close}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '4px 12px',
            borderRadius: isPixel ? 0 : 6,
            border: isPixel ? '2px solid #1A1410' : btnBorder,
            background: isPixel ? '#FFFFFF' : btnBg,
            color: isPixel ? '#1A1410' : btnColor,
            cursor: 'pointer',
            fontSize: 12,
            fontWeight: 600,
            boxShadow: isPixel ? '2px 2px 0 #1A1410' : 'none',
            transition: isPixel ? 'none' : 'background 0.12s',
          }}
          onMouseEnter={(e) => {
            if (isPixel) return;
            (e.currentTarget as HTMLElement).style.background = isDark
              ? 'rgba(255,255,255,0.14)'
              : 'rgba(0,0,0,0.08)';
          }}
          onMouseLeave={(e) => {
            if (isPixel) return;
            (e.currentTarget as HTMLElement).style.background = btnBg;
          }}
        >
          <Minimize2 size={14} />
          退出全屏
        </button>
      </div>

      {/* 节点容器 */}
      <div
        ref={containerRef}
        className="nodrag nopan"
        style={{
          flex: 1,
          overflow: 'auto',
          padding: 16,
        }}
      />
    </div>,
    document.body,
  );
};

export default NodeFullscreenOverlay;
