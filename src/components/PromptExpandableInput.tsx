import { useEffect, useRef, useState, type InputHTMLAttributes, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { flushSync } from 'react-dom';
import { Maximize2 } from 'lucide-react';
import { useThemeStore } from '../stores/theme';
import { useShortcutStore } from '../stores/shortcuts';
import { formatShortcutList, matchesAnyShortcut } from '../utils/keyboardShortcuts';
import PromptExpandModal, { type PromptExpandEditorKind } from './PromptExpandModal';

interface PromptExpandableInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> {
  value: string;
  onValueChange?: (value: string) => void;
  title: string;
  containerClassName?: string;
  isDark?: boolean;
  isPixel?: boolean;
  mono?: boolean;
  editorKind?: PromptExpandEditorKind;
}

export default function PromptExpandableInput({
  value,
  onValueChange = () => {},
  title,
  containerClassName = 'relative',
  isDark: propIsDark,
  isPixel: propIsPixel,
  mono = false,
  editorKind = 'text',
  className,
  style,
  onKeyDown,
  placeholder,
  disabled,
  readOnly,
  ...rest
}: PromptExpandableInputProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const { theme, style: themeStyle } = useThemeStore();
  const shortcuts = useShortcutStore((s) => s.shortcuts);
  const expandCombos = shortcuts['editor.expand-prompt'];
  const isDark = propIsDark ?? theme === 'dark';
  const isPixel = propIsPixel ?? themeStyle === 'pixel';
  const [expanded, setExpanded] = useState(false);
  const [localValue, setLocalValue] = useState(value || '');
  const [draft, setDraft] = useState(value || '');
  const shortcutText = formatShortcutList(expandCombos);

  useEffect(() => {
    setLocalValue(value || '');
  }, [value]);

  const commitValue = (nextValue: string) => {
    flushSync(() => {
      setLocalValue(nextValue);
    });
    if (!disabled && !readOnly) onValueChange(nextValue);
  };

  const openExpanded = () => {
    setDraft(localValue || '');
    setExpanded(true);
  };

  const closeExpanded = () => {
    setExpanded(false);
    window.setTimeout(() => inputRef.current?.focus(), 0);
  };

  const applyExpanded = () => {
    commitValue(draft);
    closeExpanded();
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (matchesAnyShortcut(expandCombos, event.nativeEvent)) {
      event.preventDefault();
      event.stopPropagation();
      openExpanded();
      return;
    }
    onKeyDown?.(event);
  };

  const inputStyle = {
    ...style,
    paddingRight: style?.paddingRight ?? 34,
  };

  const buttonCls = isPixel
    ? 'px-btn px-btn--icon px-btn--ghost'
    : `rounded border p-1 shadow-sm ${
        isDark ? 'border-white/10 bg-zinc-950/80 text-white/70 hover:text-white' : 'border-black/10 bg-white/90 text-zinc-600 hover:text-zinc-900'
      }`;

  return (
    <div className={containerClassName}>
      <input
        {...rest}
        ref={inputRef}
        value={localValue}
        className={className}
        style={inputStyle}
        placeholder={placeholder}
        disabled={disabled}
        readOnly={readOnly || disabled}
        onChange={(event) => {
          const nextValue = event.target.value;
          setLocalValue(nextValue);
          if (!disabled && !readOnly) onValueChange(nextValue);
        }}
        onKeyDown={handleKeyDown}
        spellCheck={false}
      />
      <button
        type="button"
        data-prompt-expand-trigger
        className={`nodrag nopan absolute right-1.5 top-1/2 z-10 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center ${buttonCls}`}
        onMouseDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          openExpanded();
        }}
        title={`扩大编辑 (${shortcutText})`}
        aria-label="扩大编辑"
      >
        <Maximize2 size={12} />
      </button>
      <PromptExpandModal
        open={expanded}
        title={title}
        value={draft}
        onValueChange={setDraft}
        onApply={applyExpanded}
        onCancel={closeExpanded}
        placeholder={typeof placeholder === 'string' ? placeholder : undefined}
        isDark={isDark}
        isPixel={isPixel}
        readOnly={!!disabled || !!readOnly}
        mono={mono || editorKind === 'json'}
        editorKind={editorKind}
      />
    </div>
  );
}
