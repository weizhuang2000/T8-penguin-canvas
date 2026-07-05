import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { HelpCircle, Loader2, X } from 'lucide-react';
import { getNodeHelp } from '../../services/api';
import { DEFAULT_NODE_HELPS } from '../../config/nodeHelpDefaults';
import { renderSimpleMarkdown } from '../../utils/simpleMarkdown';
import { getNodeMeta } from '../../config/nodeRegistry';

interface NodeHelpModalProps {
  open: boolean;
  onClose: () => void;
  nodeType: string;
}

// 模块级缓存：同一 nodeType 多次打开不重复请求
const helpCache: Record<string, string> = {};
const inflightRequests: Record<string, Promise<string>> = {};

async function fetchHelp(nodeType: string): Promise<string> {
  if (nodeType in helpCache) return helpCache[nodeType];
  if (nodeType in inflightRequests) return inflightRequests[nodeType];
  const promise = (async () => {
    try {
      const content = await getNodeHelp(nodeType);
      const final = content && content.trim() ? content : (DEFAULT_NODE_HELPS[nodeType] || '');
      helpCache[nodeType] = final;
      return final;
    } catch {
      const fallback = DEFAULT_NODE_HELPS[nodeType] || '';
      helpCache[nodeType] = fallback;
      return fallback;
    } finally {
      delete inflightRequests[nodeType];
    }
  })();
  inflightRequests[nodeType] = promise;
  return promise;
}

export function clearNodeHelpCache(nodeType?: string) {
  if (nodeType) {
    delete helpCache[nodeType];
  } else {
    Object.keys(helpCache).forEach((key) => delete helpCache[key]);
  }
}

export default function NodeHelpModal({ open, onClose, nodeType }: NodeHelpModalProps) {
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [isCustom, setIsCustom] = useState<boolean>(false);

  const meta = getNodeMeta(nodeType);
  const label = meta?.label || nodeType;
  const description = meta?.description || '';

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setContent('');
    fetchHelp(nodeType).then((result) => {
      if (cancelled) return;
      setContent(result);
      setIsCustom(!!result && result !== DEFAULT_NODE_HELPS[nodeType]);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [open, nodeType]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className="t8-node-help-modal-mask"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="t8-node-help-modal" role="dialog" aria-modal="true">
        <div className="t8-node-help-modal-header">
          <HelpCircle size={16} className="text-cyan-300 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="t8-node-help-modal-title">{label}</div>
            {description && <div className="t8-node-help-modal-subtitle">{description}</div>}
          </div>
          <button
            type="button"
            className="t8-node-help-modal-close"
            onClick={onClose}
            aria-label="关闭帮助"
          >
            <X size={16} />
          </button>
        </div>
        <div className="t8-node-help-modal-body">
          {loading ? (
            <div className="flex items-center justify-center py-10 text-white/50">
              <Loader2 size={18} className="animate-spin mr-2" /> 加载帮助内容...
            </div>
          ) : (
            <div className="t8-md-content">{renderSimpleMarkdown(content)}</div>
          )}
        </div>
        <div className="t8-node-help-modal-footer">
          <span>{isCustom ? '已使用自定义帮助文档' : '使用内置默认帮助文档'}</span>
          <span>可在 API 设置 → 节点帮助文档 中编辑</span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
