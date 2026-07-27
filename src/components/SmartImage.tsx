import { useEffect, useMemo, useRef, useState, type ImgHTMLAttributes } from 'react';
import { previewImageUrl } from '../utils/mediaPreview';

type SmartImageProps = ImgHTMLAttributes<HTMLImageElement> & {
  src: string;
  thumbSize?: number;
};

export default function SmartImage({
  src,
  thumbSize = 360,
  loading = 'lazy',
  decoding = 'async',
  onError,
  ...props
}: SmartImageProps) {
  const imgRef = useRef<HTMLImageElement | null>(null);
  const previewSrc = useMemo(() => previewImageUrl(src, thumbSize), [src, thumbSize]);
  const [fallback, setFallback] = useState(false);
  const [failed, setFailed] = useState(false);
  const [shouldLoad, setShouldLoad] = useState(loading !== 'lazy');

  useEffect(() => {
    setFallback(false);
    setFailed(false);
    setShouldLoad(loading !== 'lazy');
  }, [previewSrc, loading]);

  useEffect(() => {
    if (shouldLoad || loading !== 'lazy') return;
    const el = imgRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setShouldLoad(true);
      return;
    }
    // ReactFlow switches node sets and restores the target viewport in adjacent renders.
    // Check the current transformed rect first so an already-visible node does not wait for
    // IntersectionObserver to deliver a later frame after a canvas switch.
    const rect = el.getBoundingClientRect();
    const margin = 720;
    if (
      rect.width > 0
      && rect.height > 0
      && rect.right >= -margin
      && rect.bottom >= -margin
      && rect.left <= window.innerWidth + margin
      && rect.top <= window.innerHeight + margin
    ) {
      setShouldLoad(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setShouldLoad(true);
          observer.disconnect();
        }
      },
      { rootMargin: '720px 720px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [previewSrc, loading, shouldLoad]);

  const actualSrc = shouldLoad && !failed ? (fallback ? src : previewSrc) : undefined;

  return (
    <img
      {...props}
      ref={imgRef}
      src={actualSrc}
      data-full-src={src}
      data-preview-src={previewSrc}
      loading={shouldLoad ? 'eager' : loading}
      decoding={decoding}
      onError={(event) => {
        if (!actualSrc) return;
        if (!fallback && actualSrc !== src) {
          setFallback(true);
          return;
        }
        setFailed(true);
        onError?.(event);
      }}
    />
  );
}
