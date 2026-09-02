import { useEffect, useMemo, useRef, useState, type ImgHTMLAttributes } from 'react';
import { previewImageUrl } from '../utils/mediaPreview';

const fullImageLoads = new Map<string, Promise<void>>();

/** Start an independent, high-priority full-resolution load without waiting for other canvas images. */
export function preloadFullImage(src: string): Promise<void> {
  const url = String(src || '').trim();
  if (!url) return Promise.reject(new Error('empty image url'));
  const existing = fullImageLoads.get(url);
  if (existing) return existing;
  const promise = new Promise<void>((resolve, reject) => {
    const image = new Image();
    try { image.fetchPriority = 'high'; } catch { /* older browsers */ }
    image.onload = () => resolve();
    image.onerror = () => reject(new Error(`failed to load image: ${url}`));
    image.src = url;
  });
  fullImageLoads.set(url, promise);
  promise.catch(() => {
    if (fullImageLoads.get(url) === promise) fullImageLoads.delete(url);
  });
  return promise;
}

type SmartImageProps = ImgHTMLAttributes<HTMLImageElement> & {
  src: string;
  thumbSize?: number;
  /** Whether to promote the thumbnail to the full-resolution source automatically. */
  preloadFull?: boolean;
};

export default function SmartImage({
  src,
  thumbSize = 360,
  preloadFull = true,
  loading = 'lazy',
  decoding = 'async',
  onLoad,
  onError,
  ...props
}: SmartImageProps) {
  const imgRef = useRef<HTMLImageElement | null>(null);
  const previewSrc = useMemo(() => previewImageUrl(src, thumbSize), [src, thumbSize]);
  const [fallback, setFallback] = useState(false);
  const [failed, setFailed] = useState(false);
  const [shouldLoad, setShouldLoad] = useState(loading !== 'lazy');
  const [thumbnailLoaded, setThumbnailLoaded] = useState(false);
  const [fullLoaded, setFullLoaded] = useState(false);

  useEffect(() => {
    setFallback(false);
    setFailed(false);
    setThumbnailLoaded(false);
    setFullLoaded(false);
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
    const margin = 160;
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
      { rootMargin: '160px 160px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [previewSrc, loading, shouldLoad]);

  const hasSeparatePreview = previewSrc !== src;
  const actualSrc = shouldLoad && !failed ? (fallback || !hasSeparatePreview || fullLoaded ? src : previewSrc) : undefined;

  useEffect(() => {
    if (!preloadFull || !shouldLoad || fallback || failed || !hasSeparatePreview || !thumbnailLoaded || fullLoaded) return undefined;
    let cancelled = false;
    // The thumbnail remains visible while this image loads; each node advances independently.
    void preloadFullImage(src).then(() => {
      if (!cancelled) setFullLoaded(true);
    }).catch(() => {
      // Keep the thumbnail if the original is unavailable.
    });
    return () => { cancelled = true; };
  }, [failed, fallback, fullLoaded, hasSeparatePreview, preloadFull, shouldLoad, src, thumbnailLoaded]);

  return (
    <img
      {...props}
      ref={imgRef}
      src={actualSrc}
      data-full-src={src}
      data-preview-src={previewSrc}
      data-image-stage={hasSeparatePreview && !fallback && !fullLoaded ? 'thumbnail' : 'full'}
      loading={shouldLoad ? 'eager' : loading}
      decoding={decoding}
      onLoad={(event) => {
        if (actualSrc === previewSrc && hasSeparatePreview) setThumbnailLoaded(true);
        onLoad?.(event);
      }}
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
