import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { Image as ImageIcon } from 'lucide-react';

interface ImageLoadFallbackProps {
  src: string;
  isDark: boolean;
  className?: string;
  style?: CSSProperties;
  children: (onError: () => void) => ReactNode;
}

export default function ImageLoadFallback({
  src,
  isDark,
  className,
  style,
  children,
}: ImageLoadFallbackProps) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (!failed) return <>{children(() => setFailed(true))}</>;

  return (
    <div
      className={className}
      style={{
        minHeight: 92,
        border: `1px dashed ${isDark ? 'rgba(248,113,113,.45)' : 'rgba(185,28,28,.35)'}`,
        background: isDark ? 'rgba(239,68,68,.14)' : 'rgba(239,68,68,.08)',
        color: isDark ? '#fca5a5' : '#b91c1c',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        padding: 12,
        textAlign: 'center',
        ...style,
      }}
      title={src}
    >
      <ImageIcon size={22} />
      <div style={{ fontSize: 12, fontWeight: 700 }}>图片缺失</div>
      <div style={{ maxWidth: '100%', fontSize: 10, opacity: 0.78, wordBreak: 'break-all' }}>
        {src.split('/').pop() || src}
      </div>
    </div>
  );
}
