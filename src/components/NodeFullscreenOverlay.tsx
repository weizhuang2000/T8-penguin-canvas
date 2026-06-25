/**
 * NodeFullscreenOverlay —— 节点全屏覆盖层
 *
 * 将选中节点的 DOM 元素移动到全屏 portal 容器中,
 * 并将节点内部的纵向堆叠 section 重排为多列网格,
 * 充分利用屏幕宽度, 减少上下滚动。
 * 退出时移回原位并恢复原始样式, 保留所有 React 状态与交互性。
 */
import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Minimize2 } from 'lucide-react';
import { useFullscreenNodeStore } from '../stores/fullscreenNode';
import { useThemeStore } from '../stores/theme';
import { resolveThemeTemplate } from '../theme/defaultTemplates';

/** 全屏时注入到 <head> 的样式表 id */
const FULLSCREEN_STYLE_ID = 't8-node-fullscreen-override-style';

/** 全屏覆盖层样式: 节点自适应全屏 + 配置区多列网格 */
const FULLSCREEN_CSS = `
/* 节点根元素: 去掉固定宽度, 自适应容器 */
[data-node-fullscreen-content] > [data-id] {
  position: relative !important;
  width: 100% !important;
  min-width: 100% !important;
  max-width: 100% !important;
  height: auto !important;
  min-height: auto !important;
  max-height: none !important;
  transform: none !important;
  margin: 0 !important;
  inset: auto !important;
  z-index: auto !important;
}

/* 去掉节点内容容器的固定宽度 */
[data-node-fullscreen-content] > [data-id] > div {
  width: 100% !important;
  min-width: 0 !important;
}

/* 配置区 (space-y-2 / space-y-2\.5 / space-y-3): 改为多列网格 */
[data-node-fullscreen-content] > [data-id] > div > .space-y-2,
[data-node-fullscreen-content] > [data-id] > div > .space-y-2\\.5,
[data-node-fullscreen-content] > [data-id] > div > .space-y-3,
[data-node-fullscreen-content] > [data-id] > div > div[class*="space-y-2"],
[data-node-fullscreen-content] > [data-id] > div > div[class*="space-y-3"] {
  display: grid !important;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  align-items: start;
  /* 移除节点内的滚动限制, 让内容自然展开 */
  max-height: none !important;
  overflow-y: visible !important;
  overflow: visible !important;
}

/* 配置区内的子 section 保持完整, 不被 grid 拆行 */
[data-node-fullscreen-content] > [data-id] > div > .space-y-2 > *,
[data-node-fullscreen-content] > [data-id] > div > .space-y-2\\.5 > *,
[data-node-fullscreen-content] > [data-id] > div > .space-y-3 > *,
[data-node-fullscreen-content] > [data-id] > div > div[class*="space-y-2"] > *,
[data-node-fullscreen-content] > [data-id] > div > div[class*="space-y-3"] > * {
  grid-row: auto;
}

/* 按钮、提示文字等跨两列, 避免占半屏 */
[data-node-fullscreen-content] > [data-id] > div > .space-y-2 > button,
[data-node-fullscreen-content] > [data-id] > div > .space-y-2\\.5 > button,
[data-node-fullscreen-content] > [data-id] > div > .space-y-3 > button,
[data-node-fullscreen-content] > [data-id] > div > div[class*="space-y-2"] > button,
[data-node-fullscreen-content] > [data-id] > div > div[class*="space-y-3"] > button,
[data-node-fullscreen-content] > [data-id] > div > .space-y-2 > div:not([class*="rounded"]),
[data-node-fullscreen-content] > [data-id] > div > .space-y-2\\.5 > div:not([class*="rounded"]),
[data-node-fullscreen-content] > [data-id] > div > .space-y-3 > div:not([class*="rounded"]),
[data-node-fullscreen-content] > [data-id] > div > div[class*="space-y-2"] > div:not([class*="rounded"]),
[data-node-fullscreen-content] > [data-id] > div > div[class*="space-y-3"] > div:not([class*="rounded"]) {
  grid-column: 1 / -1;
}

/* 结果展示区 (border-t) 跨全宽 */
[data-node-fullscreen-content] > [data-id] > div > .border-t,
[data-node-fullscreen-content] > [data-id] > .border-t {
  grid-column: 1 / -1;
}

/* 隐藏 ReactFlow 的 Handle (全屏时不需要连线交互) */
[data-node-fullscreen-content] > [data-id] .react-flow__handle {
  display: none !important;
}

/* 全屏下节点内的 max-h 限制一律移除 */
[data-node-fullscreen-content] > [data-id] [class*="max-h-"] {
  max-height: none !important;
  overflow-y: visible !important;
}
`;

/** 注入全屏覆盖样式 */
function injectFullscreenStyle() {
  if (document.getElementById(FULLSCREEN_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = FULLSCREEN_STYLE_ID;
  style.textContent = FULLSCREEN_CSS;
  document.head.appendChild(style);
}

/** 移除全屏覆盖样式 */
function removeFullscreenStyle() {
  const style = document.getElementById(FULLSCREEN_STYLE_ID);
  if (style) style.remove();
}

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
    /** 保存被移除的 Tailwind 宽度 class */
    removedClasses: string[];
  } | null>(null);

  const close = useCallback(() => {
    const saved = savedRef.current;
    if (saved) {
      // 恢复原始样式
      saved.el.style.cssText = saved.originalCssText;
      // 恢复被移除的 class
      for (const cls of saved.removedClasses) {
        saved.el.classList.add(cls);
      }
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
    removeFullscreenStyle();
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

      // 收集需要移除的固定宽度 class (w-[320px], w-[360px] 等)
      const widthClasses: string[] = [];
      for (const cls of Array.from(nodeEl.classList)) {
        if (/^w-\[\d+px\]$/.test(cls) || /^w-\d+$/.test(cls)) {
          widthClasses.push(cls);
        }
      }
      // 同样检查第一个子 div (节点内容容器)
      const firstChild = nodeEl.firstElementChild as HTMLElement | null;
      if (firstChild) {
        for (const cls of Array.from(firstChild.classList)) {
          if (/^w-\[\d+px\]$/.test(cls) || /^w-\d+$/.test(cls)) {
            widthClasses.push(cls);
          }
        }
      }

      // 保存原始状态
      savedRef.current = {
        parent: nodeEl.parentElement!,
        nextSibling: nodeEl.nextSibling,
        el: nodeEl,
        originalCssText: nodeEl.style.cssText,
        removedClasses: widthClasses,
      };

      // 移除固定宽度 class
      for (const cls of widthClasses) {
        nodeEl.classList.remove(cls);
        firstChild?.classList.remove(cls);
      }

      // 移入全屏容器
      container.appendChild(nodeEl);

      // 注入全屏覆盖样式
      injectFullscreenStyle();
    });

    return () => {
      cancelAnimationFrame(raf);
      // 组件卸载 / fullscreenNodeId 变化时移回
      const saved = savedRef.current;
      if (saved) {
        saved.el.style.cssText = saved.originalCssText;
        for (const cls of saved.removedClasses) {
          saved.el.classList.add(cls);
        }
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
      removeFullscreenStyle();
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

      {/* 节点容器: CSS 选择器锚点 data-node-fullscreen-content */}
      <div
        ref={containerRef}
        data-node-fullscreen-content
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
