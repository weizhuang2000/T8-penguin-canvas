import { useState, type MouseEvent } from 'react';
import { HelpCircle } from 'lucide-react';
import NodeHelpModal from './NodeHelpModal';

interface NodeHelpButtonProps {
  nodeType: string;
  className?: string;
  title?: string;
  size?: number;
}

// 节点标题栏帮助按钮：点击弹出该节点的 Markdown 帮助文档
// 加 nodrag nopan 避免点击触发节点拖动
export default function NodeHelpButton({ nodeType, className, title, size = 13 }: NodeHelpButtonProps) {
  const [open, setOpen] = useState(false);

  const handleClick = (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    e.preventDefault();
    setOpen(true);
  };

  return (
    <>
      <button
        type="button"
        className={`t8-node-help-button nodrag nopan ${className || ''}`}
        onClick={handleClick}
        onMouseDown={(e) => e.stopPropagation()}
        title={title || '查看节点帮助'}
        aria-label="查看节点帮助"
      >
        <HelpCircle size={size} />
      </button>
      <NodeHelpModal open={open} onClose={() => setOpen(false)} nodeType={nodeType} />
    </>
  );
}
