import type { ReactNode } from 'react';

// 简易 Markdown 渲染器
// 支持：# ## ### 标题、-/* 无序列表、1. 有序列表、**bold**、`code`、```代码块```、> 引用、空行分段、单换行 <br>
// 所有文本通过 React 自动转义，不使用 dangerouslySetInnerHTML，天然防 XSS。

const CODE_FENCE = /^```/;
const HEADING_RE = /^(#{1,3})\s+(.*)$/;
const UL_RE = /^\s*[-*]\s+(.*)$/;
const OL_RE = /^\s*(\d+)\.\s+(.*)$/;
const QUOTE_RE = /^>\s?(.*)$/;

// 解析行内 **bold** 和 `code`
function renderInline(text: string, keyBase: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  // 用占位符先提取 code span，避免 bold 解析干扰 code 内容
  const codeSegments: string[] = [];
  const placeholderRe = /`([^`]+)`/;
  let working = text;
  let match: RegExpMatchArray | null;
  while ((match = placeholderRe.exec(working)) !== null) {
    const idx = codeSegments.length;
    codeSegments.push(match[1]);
    working = working.slice(0, match.index) + `\u0000CODE${idx}\u0000` + working.slice(match.index! + match[0].length);
  }

  // 按 **bold** 分割
  const parts = working.split(/(\*\*[^*]+\*\*)/g);
  parts.forEach((part, i) => {
    if (!part) return;
    const key = `${keyBase}-inline-${i}`;
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      nodes.push(<strong key={key}>{part.slice(2, -2)}</strong>);
      return;
    }
    // 还原 code 占位符
    const codeRestored = part.replace(/\u0000CODE(\d+)\u0000/g, (_m, idxStr) => `\u0001${idxStr}\u0001`);
    const subParts = codeRestored.split(/\u0001(\d+)\u0001/g);
    subParts.forEach((sub, j) => {
      if (!sub) return;
      if (/^\d+$/.test(sub)) {
        nodes.push(
          <code key={`${key}-code-${j}`} className="t8-md-code-inline">
            {codeSegments[Number(sub)]}
          </code>,
        );
      } else {
        nodes.push(<span key={`${key}-text-${j}`}>{sub}</span>);
      }
    });
  });
  return nodes;
}

interface Block {
  type: 'heading' | 'ul' | 'ol' | 'quote' | 'code' | 'paragraph';
  level?: number;
  items?: string[]; // 列表项
  text?: string; // 段落/标题/引用文本
  lang?: string; // 代码块语言
}

function parseBlocks(md: string): Block[] {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // 代码块
    if (CODE_FENCE.test(line)) {
      const langMatch = line.match(/^```(\S*)/);
      const lang = langMatch?.[1] || '';
      const codeLines: string[] = [];
      i += 1;
      while (i < lines.length && !CODE_FENCE.test(lines[i])) {
        codeLines.push(lines[i]);
        i += 1;
      }
      i += 1; // 跳过结束的 ```
      blocks.push({ type: 'code', lang, text: codeLines.join('\n') });
      continue;
    }

    // 空行
    if (!line.trim()) {
      i += 1;
      continue;
    }

    // 标题
    const hMatch = line.match(HEADING_RE);
    if (hMatch) {
      blocks.push({ type: 'heading', level: hMatch[1].length, text: hMatch[2].trim() });
      i += 1;
      continue;
    }

    // 引用
    const qMatch = line.match(QUOTE_RE);
    if (qMatch) {
      const quoteLines: string[] = [qMatch[1]];
      i += 1;
      while (i < lines.length) {
        const nextQ = lines[i].match(QUOTE_RE);
        if (!nextQ) break;
        quoteLines.push(nextQ[1]);
        i += 1;
      }
      blocks.push({ type: 'quote', text: quoteLines.join(' ') });
      continue;
    }

    // 无序列表
    if (UL_RE.test(line)) {
      const items: string[] = [];
      while (i < lines.length) {
        const m = lines[i].match(UL_RE);
        if (!m) break;
        items.push(m[1].trim());
        i += 1;
      }
      blocks.push({ type: 'ul', items });
      continue;
    }

    // 有序列表
    if (OL_RE.test(line)) {
      const items: string[] = [];
      while (i < lines.length) {
        const m = lines[i].match(OL_RE);
        if (!m) break;
        items.push(m[2].trim());
        i += 1;
      }
      blocks.push({ type: 'ol', items });
      continue;
    }

    // 段落（连续非空非特殊行合并）
    const paraLines: string[] = [line];
    i += 1;
    while (i < lines.length) {
      const next = lines[i];
      if (!next.trim()) break;
      if (CODE_FENCE.test(next) || HEADING_RE.test(next) || UL_RE.test(next) || OL_RE.test(next) || QUOTE_RE.test(next)) break;
      paraLines.push(next);
      i += 1;
    }
    blocks.push({ type: 'paragraph', text: paraLines.join('\n') });
  }
  return blocks;
}

export function renderSimpleMarkdown(md: string): ReactNode[] {
  if (!md || !md.trim()) {
    return [<p key="empty" className="t8-md-empty text-white/40">暂无帮助内容</p>];
  }
  const blocks = parseBlocks(md);
  return blocks.map((block, idx) => {
    const key = `md-block-${idx}`;
    switch (block.type) {
      case 'heading': {
        const cls = block.level === 1 ? 't8-md-h1' : block.level === 2 ? 't8-md-h2' : 't8-md-h3';
        if (block.level === 1) return <h1 key={key} className={cls}>{renderInline(block.text || '', key)}</h1>;
        if (block.level === 2) return <h2 key={key} className={cls}>{renderInline(block.text || '', key)}</h2>;
        return <h3 key={key} className={cls}>{renderInline(block.text || '', key)}</h3>;
      }
      case 'ul':
        return (
          <ul key={key} className="t8-md-ul">
            {block.items!.map((item, i) => (
              <li key={`${key}-li-${i}`}>{renderInline(item, `${key}-li-${i}`)}</li>
            ))}
          </ul>
        );
      case 'ol':
        return (
          <ol key={key} className="t8-md-ol">
            {block.items!.map((item, i) => (
              <li key={`${key}-li-${i}`}>{renderInline(item, `${key}-li-${i}`)}</li>
            ))}
          </ol>
        );
      case 'quote':
        return <blockquote key={key} className="t8-md-quote">{renderInline(block.text || '', key)}</blockquote>;
      case 'code':
        return (
          <pre key={key} className="t8-md-pre">
            <code className="t8-md-code-block">{block.text}</code>
          </pre>
        );
      case 'paragraph':
      default: {
        const text = block.text || '';
        const parts = text.split('\n');
        return (
          <p key={key} className="t8-md-p">
            {parts.map((p, i) => (
              <span key={`${key}-p-${i}`}>
                {i > 0 && <br />}
                {renderInline(p, `${key}-p-${i}`)}
              </span>
            ))}
          </p>
        );
      }
    }
  });
}
