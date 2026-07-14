import React from 'react';
import {
  AbsoluteFill,
  Easing,
  Img,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import {Video} from '@remotion/media';

const clamp = {extrapolateLeft: 'clamp' as const, extrapolateRight: 'clamp' as const};

export const SafeArea: React.FC<React.PropsWithChildren<{padding?: number; style?: React.CSSProperties}>> = ({
  padding = 72,
  style,
  children,
}) => <AbsoluteFill style={{padding, ...style}}>{children}</AbsoluteFill>;

export const KineticText: React.FC<{
  text: string;
  delay?: number;
  duration?: number;
  distance?: number;
  style?: React.CSSProperties;
}> = ({text, delay = 0, duration = 0.7, distance = 70, style}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const progress = interpolate(frame, [delay * fps, (delay + duration) * fps], [0, 1], {
    ...clamp,
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });
  return <div style={{opacity: progress, transform: `translate3d(0, ${(1 - progress) * distance}px, 0) scale(${0.96 + progress * 0.04})`, ...style}}>{text}</div>;
};

export const WordReveal: React.FC<{
  text: string;
  delay?: number;
  stagger?: number;
  style?: React.CSSProperties;
}> = ({text, delay = 0, stagger = 0.08, style}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  return (
    <div style={{display: 'flex', flexWrap: 'wrap', gap: '0.28em', ...style}}>
      {text.split(/\s+/).filter(Boolean).map((word, index) => {
        const start = (delay + index * stagger) * fps;
        const progress = interpolate(frame, [start, start + 0.5 * fps], [0, 1], {
          ...clamp,
          easing: Easing.bezier(0.16, 1, 0.3, 1),
        });
        return <span key={`${word}-${index}`} style={{display: 'inline-block', opacity: progress, transform: `translateY(${(1 - progress) * 36}px)`}}>{word}</span>;
      })}
    </div>
  );
};

export const NumberCounter: React.FC<{
  from?: number;
  to: number;
  delay?: number;
  duration?: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  style?: React.CSSProperties;
}> = ({from = 0, to, delay = 0, duration = 1.2, decimals = 0, prefix = '', suffix = '', style}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const progress = interpolate(frame, [delay * fps, (delay + duration) * fps], [0, 1], {
    ...clamp,
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });
  const value = from + (to - from) * progress;
  return <span style={{fontVariantNumeric: 'tabular-nums', ...style}}>{prefix}{value.toFixed(decimals)}{suffix}</span>;
};

export const KenBurnsMedia: React.FC<{
  src: string;
  kind?: 'image' | 'video';
  fromScale?: number;
  toScale?: number;
  panX?: number;
  panY?: number;
  muted?: boolean;
  style?: React.CSSProperties;
}> = ({src, kind = 'image', fromScale = 1.04, toScale = 1.14, panX = 0, panY = 0, muted = true, style}) => {
  const frame = useCurrentFrame();
  const {durationInFrames} = useVideoConfig();
  const progress = interpolate(frame, [0, Math.max(1, durationInFrames - 1)], [0, 1], clamp);
  const mediaStyle: React.CSSProperties = {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    transform: `translate3d(${panX * progress}px, ${panY * progress}px, 0) scale(${fromScale + (toScale - fromScale) * progress})`,
    ...style,
  };
  return kind === 'video' ? <Video src={src} muted={muted} style={mediaStyle} /> : <Img src={src} style={mediaStyle} />;
};

export const GlassCard: React.FC<React.PropsWithChildren<{
  radius?: number;
  tint?: string;
  border?: string;
  style?: React.CSSProperties;
}>> = ({radius = 28, tint = 'rgba(12,18,32,0.72)', border = 'rgba(255,255,255,0.18)', style, children}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const enter = spring({frame, fps, config: {damping: 200}, durationInFrames: Math.round(0.8 * fps)});
  return <div style={{background: tint, border: `1px solid ${border}`, borderRadius: radius, boxShadow: '0 30px 90px rgba(0,0,0,0.32)', opacity: enter, transform: `translateY(${(1 - enter) * 24}px)`, ...style}}>{children}</div>;
};

export const GradientBackdrop: React.FC<{
  colors?: [string, string, string];
  angle?: number;
}> = ({colors = ['#07111f', '#172554', '#4c1d95'], angle = 125}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const drift = interpolate(frame, [0, 8 * fps], [0, 18], {...clamp, easing: Easing.inOut(Easing.sin)});
  return <AbsoluteFill style={{background: `linear-gradient(${angle + drift}deg, ${colors[0]} 0%, ${colors[1]} 52%, ${colors[2]} 100%)`}} />;
};

export const NoiseOverlay: React.FC<{opacity?: number}> = ({opacity = 0.08}) => (
  <AbsoluteFill style={{opacity, mixBlendMode: 'soft-light', pointerEvents: 'none'}}>
    <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
      <filter id="t8-remotion-noise"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" seed="8" /></filter>
      <rect width="100" height="100" filter="url(#t8-remotion-noise)" opacity="0.9" />
    </svg>
  </AbsoluteFill>
);

export const Vignette: React.FC<{opacity?: number}> = ({opacity = 0.72}) => (
  <AbsoluteFill style={{background: `radial-gradient(circle at center, transparent 38%, rgba(0,0,0,${opacity}) 120%)`, pointerEvents: 'none'}} />
);

export const SplitReveal: React.FC<React.PropsWithChildren<{
  direction?: 'left' | 'right' | 'up' | 'down';
  delay?: number;
  duration?: number;
}>> = ({direction = 'left', delay = 0, duration = 0.8, children}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const progress = interpolate(frame, [delay * fps, (delay + duration) * fps], [0, 1], {
    ...clamp,
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });
  const inset = (1 - progress) * 100;
  const clipPath = direction === 'left' ? `inset(0 ${inset}% 0 0)`
    : direction === 'right' ? `inset(0 0 0 ${inset}%)`
      : direction === 'up' ? `inset(0 0 ${inset}% 0)` : `inset(${inset}% 0 0 0)`;
  return <AbsoluteFill style={{clipPath}}>{children}</AbsoluteFill>;
};

export type ChartDatum = {label: string; value: number; color?: string};

export const BarChart: React.FC<{data: ChartDatum[]; color?: string; style?: React.CSSProperties}> = ({data, color = '#67e8f9', style}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const max = Math.max(1, ...data.map((item) => Number(item.value) || 0));
  return (
    <div style={{display: 'flex', alignItems: 'flex-end', gap: 22, height: 360, ...style}}>
      {data.map((item, index) => {
        const progress = spring({frame: frame - index * 5, fps, config: {damping: 200}});
        return <div key={`${item.label}-${index}`} style={{flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', gap: 12, height: '100%'}}>
          <div style={{fontSize: 24, fontWeight: 700, textAlign: 'center'}}>{Math.round(item.value * progress)}</div>
          <div style={{height: `${(item.value / max) * progress * 82}%`, minHeight: 3, background: item.color || color, borderRadius: '14px 14px 4px 4px'}} />
          <div style={{fontSize: 20, opacity: 0.75, textAlign: 'center'}}>{item.label}</div>
        </div>;
      })}
    </div>
  );
};

export const LineChart: React.FC<{data: ChartDatum[]; color?: string; style?: React.CSSProperties}> = ({data, color = '#a78bfa', style}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const progress = interpolate(frame, [0, 1.6 * fps], [0, 1], {...clamp, easing: Easing.out(Easing.cubic)});
  const max = Math.max(1, ...data.map((item) => Number(item.value) || 0));
  const points = data.map((item, index) => ({x: data.length <= 1 ? 50 : 50 + index * (900 / (data.length - 1)), y: 430 - (item.value / max) * 340}));
  const path = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');
  return (
    <svg viewBox="0 0 1000 500" style={{overflow: 'visible', ...style}}>
      <path d={path} fill="none" stroke={color} strokeWidth={10} strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - progress} />
      {points.map((point, index) => <g key={`${data[index]?.label}-${index}`} opacity={interpolate(progress, [index / Math.max(1, points.length), Math.min(1, index / Math.max(1, points.length) + 0.2)], [0, 1], clamp)}>
        <circle cx={point.x} cy={point.y} r={14} fill={data[index]?.color || color} />
        <text x={point.x} y={475} textAnchor="middle" fill="currentColor" fontSize={28}>{data[index]?.label}</text>
      </g>)}
    </svg>
  );
};
