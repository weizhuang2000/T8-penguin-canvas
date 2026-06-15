import {
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type Ref,
} from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, AtSign, Image as ImageIcon, Music, Video as VideoIcon } from 'lucide-react';
import type { Material } from './useUpstreamMaterials';
import {
  getUnresolvedMentionCount,
  insertMediaMention,
  isMentionableMaterial,
  resolveMediaMentions,
  tokenForMaterial,
  updateMentionRanges,
  type MediaMention,
} from './mediaMentions';

interface Props {
  value: string;
  mentions?: MediaMention[];
  materials: Material[];
  onChange: (value: string, mentions: MediaMention[]) => void;
  placeholder?: string;
  className?: string;
  style?: CSSProperties;
  isDark: boolean;
  isPixel: boolean;
  editorRef?: Ref<HTMLTextAreaElement>;
}

interface QueryState {
  open: boolean;
  start: number;
  end: number;
  query: string;
  activeIndex: number;
}

function assignRef<T>(ref: Ref<T> | undefined, value: T | null) {
  if (!ref) return;
  if (typeof ref === 'function') {
    ref(value);
    return;
  }
  ref.current = value;
}

function getAtQuery(text: string, caret: number, mentions: MediaMention[] = []): { start: number; end: number; query: string } | null {
  const before = text.slice(0, caret);
  const at = before.lastIndexOf('@');
  if (at < 0) return null;
  const segment = before.slice(at);
  if (/\s/.test(segment)) return null;
  const afterMention = mentions.some((mention) => mention.end === at);
  const prev = at > 0 ? text[at - 1] : '';
  if (!afterMention && prev && !/\s/.test(prev) && !'([{ "\''.includes(prev)) return null;
  return { start: at, end: caret, query: segment.slice(1) };
}

function fileName(url: string): string {
  try {
    return decodeURIComponent((url.split('?')[0].split('/').pop() || url).slice(0, 42));
  } catch {
    return (url.split('?')[0].split('/').pop() || url).slice(0, 42);
  }
}

function displayKind(kind: Material['kind']): string {
  if (kind === 'image') return '图像';
  if (kind === 'video') return '视频';
  if (kind === 'audio') return '音频';
  return '文本';
}

function areMentionsSame(a: MediaMention[] = [], b: MediaMention[] = []): boolean {
  if (a.length !== b.length) return false;
  return a.every((item, index) => {
    const other = b[index];
    return !!other &&
      item.id === other.id &&
      item.token === other.token &&
      item.start === other.start &&
      item.end === other.end &&
      item.materialKey === other.materialKey;
  });
}

const MentionPromptInput = ({
  value,
  mentions = [],
  materials,
  onChange,
  placeholder,
  className,
  style,
  isDark,
  isPixel,
  editorRef,
}: Props) => {
  const localRef = useRef<HTMLTextAreaElement | null>(null);
  const composingRef = useRef(false);
  const localEditRef = useRef(false);
  const localEditTimerRef = useRef<number | null>(null);
  const draftValueRef = useRef(value);
  const draftMentionsRef = useRef<MediaMention[]>(mentions);
  const [draftValue, setDraftValue] = useState(value);
  const [draftMentions, setDraftMentions] = useState<MediaMention[]>(mentions);
  const [queryState, setQueryState] = useState<QueryState>({
    open: false,
    start: 0,
    end: 0,
    query: '',
    activeIndex: 0,
  });
  const [popupRect, setPopupRect] = useState<{ left: number; top: number; width: number } | null>(null);

  const markLocalEdit = () => {
    localEditRef.current = true;
    if (localEditTimerRef.current !== null) {
      window.clearTimeout(localEditTimerRef.current);
    }
    localEditTimerRef.current = window.setTimeout(() => {
      localEditRef.current = false;
      localEditTimerRef.current = null;
    }, 250);
  };

  useEffect(() => {
    if (localEditRef.current && value === draftValue && areMentionsSame(mentions, draftMentions)) {
      localEditRef.current = false;
      return;
    }
    if (localEditRef.current) return;
    draftValueRef.current = value;
    draftMentionsRef.current = mentions;
    setDraftValue(value);
    setDraftMentions(mentions);
  }, [draftMentions, draftValue, mentions, value]);

  useEffect(() => {
    return () => {
      if (localEditTimerRef.current !== null) {
        window.clearTimeout(localEditTimerRef.current);
      }
    };
  }, []);

  const mentionableMaterials = useMemo(
    () => materials.filter(isMentionableMaterial),
    [materials],
  );

  const filteredMaterials = useMemo(() => {
    const q = queryState.query.trim().toLowerCase();
    if (!q) return mentionableMaterials;
    return mentionableMaterials.filter((material) => {
      const token = tokenForMaterial(material, mentionableMaterials).toLowerCase();
      const label = `${material.label || ''} ${fileName(material.url)} ${displayKind(material.kind)}`.toLowerCase();
      return token.includes(q) || label.includes(q);
    });
  }, [mentionableMaterials, queryState.query]);

  const resolvedPreview = useMemo(
    () => resolveMediaMentions(draftValue, draftMentions, mentionableMaterials),
    [draftValue, draftMentions, mentionableMaterials],
  );
  const unresolvedCount = useMemo(
    () => getUnresolvedMentionCount(draftMentions, mentionableMaterials),
    [draftMentions, mentionableMaterials],
  );

  const setEditorRef = (el: HTMLTextAreaElement | null) => {
    localRef.current = el;
    assignRef(editorRef, el);
  };

  const syncPopupRect = () => {
    const el = localRef.current;
    if (!el || typeof window === 'undefined') return;
    const rect = el.getBoundingClientRect();
    const width = Math.min(Math.max(rect.width, 220), 360);
    const left = Math.min(Math.max(8, rect.left), Math.max(8, window.innerWidth - width - 8));
    const below = rect.bottom + 6;
    const top = below > window.innerHeight - 220 ? Math.max(8, rect.top - 228) : below;
    setPopupRect({ left, top, width });
  };

  const closePopup = () => setQueryState((s) => (s.open ? { ...s, open: false } : s));

  const openFromCaret = (text: string, caret: number, nextMentions: MediaMention[] = draftMentions) => {
    const query = getAtQuery(text, caret, nextMentions);
    if (!query) {
      closePopup();
      return;
    }
    setQueryState({ ...query, open: true, activeIndex: 0 });
    window.setTimeout(syncPopupRect, 0);
  };

  const emitChange = (nextValue: string, caret: number) => {
    const nextMentions = updateMentionRanges(draftValueRef.current, nextValue, draftMentionsRef.current);
    markLocalEdit();
    draftValueRef.current = nextValue;
    draftMentionsRef.current = nextMentions;
    setDraftValue(nextValue);
    setDraftMentions(nextMentions);
    if (nextValue !== value || !areMentionsSame(nextMentions, mentions)) {
      onChange(nextValue, nextMentions);
    }
    openFromCaret(nextValue, caret, nextMentions);
  };

  const updateDraftOnly = (nextValue: string) => {
    const nextMentions = updateMentionRanges(draftValueRef.current, nextValue, draftMentionsRef.current);
    markLocalEdit();
    draftValueRef.current = nextValue;
    draftMentionsRef.current = nextMentions;
    setDraftValue(nextValue);
    setDraftMentions(nextMentions);
  };

  const selectMaterial = (material: Material) => {
    const el = localRef.current;
    if (!el) return;
    const currentValue = draftValueRef.current;
    const currentMentions = draftMentionsRef.current;
    const start = queryState.open ? queryState.start : el.selectionStart ?? currentValue.length;
    const end = queryState.open ? queryState.end : el.selectionEnd ?? start;
    const result = insertMediaMention(
      currentValue,
      currentMentions,
      material,
      mentionableMaterials,
      start,
      end,
    );
    markLocalEdit();
    draftValueRef.current = result.text;
    draftMentionsRef.current = result.mentions;
    setDraftValue(result.text);
    setDraftMentions(result.mentions);
    onChange(result.text, result.mentions);
    closePopup();
    window.setTimeout(() => {
      const textarea = localRef.current;
      if (!textarea) return;
      textarea.focus();
      textarea.setSelectionRange(result.caret, result.caret);
    }, 0);
  };

  const activeMaterial = filteredMaterials[Math.min(queryState.activeIndex, Math.max(0, filteredMaterials.length - 1))];

  const popup =
    queryState.open && popupRect && typeof document !== 'undefined'
      ? createPortal(
          <div
            data-canvas-floating-ui
            className="nodrag nowheel"
            style={{
              position: 'fixed',
              left: popupRect.left,
              top: popupRect.top,
              width: popupRect.width,
              zIndex: 10050,
              border: isPixel ? '2px solid var(--px-ink, #1a1410)' : '1px solid rgba(255,255,255,.18)',
              borderRadius: isPixel ? 14 : 10,
              background: isPixel
                ? 'var(--px-surface, #fff7df)'
                : isDark
                  ? 'rgba(16,18,24,.98)'
                  : 'rgba(255,255,255,.98)',
              color: isPixel ? 'var(--px-ink, #1a1410)' : isDark ? '#f8fafc' : '#111827',
              boxShadow: isPixel
                ? '4px 4px 0 var(--px-ink, #1a1410)'
                : '0 18px 48px rgba(0,0,0,.32)',
              padding: 6,
            }}
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '4px 7px 7px',
                fontSize: 10,
                opacity: 0.72,
                fontWeight: 700,
              }}
            >
              <AtSign size={12} />
              可引用的当前素材
            </div>
            {filteredMaterials.length === 0 ? (
              <div style={{ padding: '10px 8px', fontSize: 11, opacity: 0.65 }}>暂无匹配素材</div>
            ) : (
              <div style={{ maxHeight: 210, overflowY: 'auto', display: 'grid', gap: 4 }}>
                {filteredMaterials.map((material, index) => {
                  const token = tokenForMaterial(material, mentionableMaterials);
                  const active = activeMaterial?.id === material.id;
                  return (
                    <button
                      key={`${material.id}:${index}`}
                      type="button"
                      className="nodrag"
                      onClick={() => selectMaterial(material)}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '38px 1fr auto',
                        alignItems: 'center',
                        gap: 8,
                        width: '100%',
                        minHeight: 44,
                        padding: 5,
                        borderRadius: isPixel ? 10 : 8,
                        border: active
                          ? (isPixel ? '2px solid var(--px-ink, #1a1410)' : '1px solid rgba(94,234,212,.65)')
                          : '1px solid transparent',
                        background: active
                          ? (isPixel ? 'var(--px-yellow, #ffe08a)' : 'rgba(20,184,166,.16)')
                          : 'transparent',
                        color: 'inherit',
                        textAlign: 'left',
                        cursor: 'pointer',
                      }}
                    >
                      <span
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: isPixel ? 8 : 7,
                          border: isPixel ? '1.5px solid var(--px-ink, #1a1410)' : '1px solid rgba(255,255,255,.16)',
                          overflow: 'hidden',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          background: material.kind === 'audio' ? 'rgba(250,204,21,.18)' : 'rgba(15,23,42,.18)',
                        }}
                      >
                        {material.kind === 'image' ? (
                          <img src={material.url} alt="" draggable={false} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : material.kind === 'video' ? (
                          <VideoIcon size={18} />
                        ) : material.kind === 'audio' ? (
                          <Music size={18} />
                        ) : (
                          <ImageIcon size={18} />
                        )}
                      </span>
                      <span style={{ minWidth: 0 }}>
                        <span style={{ display: 'block', fontSize: 11, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {material.label || fileName(material.url)}
                        </span>
                        <span style={{ display: 'block', fontSize: 10, opacity: 0.62 }}>
                          {displayKind(material.kind)}
                        </span>
                      </span>
                      <span style={{ fontSize: 11, fontWeight: 900, opacity: 0.82 }}>{token}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>,
          document.body,
        )
      : null;

  return (
    <div className="nodrag nowheel">
      <div className="relative">
        <textarea
          ref={setEditorRef}
          value={draftValue}
          aria-multiline="true"
          placeholder={placeholder}
          onChange={(e) => {
            if (composingRef.current) {
              updateDraftOnly(e.currentTarget.value);
              return;
            }
            emitChange(e.currentTarget.value, e.currentTarget.selectionStart ?? e.currentTarget.value.length);
          }}
          onCompositionStart={() => {
            composingRef.current = true;
            closePopup();
          }}
          onCompositionEnd={(e) => {
            composingRef.current = false;
            const caret = e.currentTarget.selectionStart ?? e.currentTarget.value.length;
            emitChange(e.currentTarget.value, caret);
          }}
          onFocus={syncPopupRect}
          onClick={(e) => {
            if (composingRef.current) return;
            openFromCaret(e.currentTarget.value, e.currentTarget.selectionStart ?? e.currentTarget.value.length);
          }}
          onKeyUp={(e) => {
            if (composingRef.current || e.nativeEvent.isComposing) return;
            if (['Escape', 'Enter', 'Tab', 'ArrowDown', 'ArrowUp'].includes(e.key)) return;
            openFromCaret(e.currentTarget.value, e.currentTarget.selectionStart ?? e.currentTarget.value.length);
          }}
          onKeyDown={(e) => {
            if (composingRef.current || e.nativeEvent.isComposing) return;
            if (!queryState.open) return;
            if (e.key === 'Escape') {
              e.preventDefault();
              closePopup();
              return;
            }
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setQueryState((s) => ({ ...s, activeIndex: Math.min(filteredMaterials.length - 1, s.activeIndex + 1) }));
              return;
            }
            if (e.key === 'ArrowUp') {
              e.preventDefault();
              setQueryState((s) => ({ ...s, activeIndex: Math.max(0, s.activeIndex - 1) }));
              return;
            }
            if ((e.key === 'Enter' || e.key === 'Tab') && activeMaterial) {
              e.preventDefault();
              selectMaterial(activeMaterial);
            }
          }}
          onBlur={() => {
            localEditRef.current = false;
            window.setTimeout(closePopup, 120);
          }}
          className={className}
          style={{
            ...style,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            overflowY: 'auto',
            minHeight: 56,
            lineHeight: 1.45,
            caretColor: 'currentColor',
            cursor: 'text',
          }}
        />
      </div>
      {draftMentions.length > 0 && (
        <div
          className="mt-1 rounded px-2 py-1 text-[10px]"
          style={{
            border: isPixel ? '1.5px solid var(--px-ink, #1a1410)' : '1px solid rgba(255,255,255,.12)',
            background: isPixel
              ? 'var(--px-muted, rgba(255,255,255,.52))'
              : isDark
                ? 'rgba(255,255,255,.06)'
                : 'rgba(15,23,42,.06)',
            color: isPixel ? 'var(--px-ink, #1a1410)' : isDark ? 'rgba(255,255,255,.78)' : 'rgba(15,23,42,.76)',
          }}
        >
          <span style={{ fontWeight: 800 }}>实际发送 </span>
          <span className="break-all">{resolvedPreview.length > 120 ? `${resolvedPreview.slice(0, 120)}...` : resolvedPreview}</span>
        </div>
      )}
      {unresolvedCount > 0 && (
        <div className="mt-1 flex items-center gap-1 rounded border border-amber-400/40 bg-amber-400/10 px-2 py-1 text-[10px] text-amber-200">
          <AlertTriangle size={11} />
          有 {unresolvedCount} 个 @ 素材已断开，生成时会按普通文本保留
        </div>
      )}
      {popup}
    </div>
  );
};

export default memo(MentionPromptInput);
