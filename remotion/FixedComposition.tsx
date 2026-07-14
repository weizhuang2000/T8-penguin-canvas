import React from 'react';
import {
  AbsoluteFill,
  Easing,
  Img,
  Sequence,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import { Audio, Video } from '@remotion/media';

type Animation = { type?: string; duration?: number; delay?: number };
type Asset = { id: string; kind: 'image' | 'video' | 'audio'; src: string; label?: string };
type Layer = Record<string, any> & {
  id: string;
  type: 'text' | 'image' | 'video' | 'audio' | 'shape';
  start: number;
  duration: number;
  enter?: Animation;
  exit?: Animation;
};
type Scene = { id: string; start: number; duration: number; background?: string; transition?: string; layers: Layer[] };
export type FixedCompositionProps = {
  spec: { version: string; assets: Array<{ id: string; kind: Asset['kind']; label?: string }>; scenes: Scene[] };
  assets: Asset[];
  profile: { width: number; height: number; fps: number; duration: number; durationInFrames: number };
};

const clamp = { extrapolateLeft: 'clamp' as const, extrapolateRight: 'clamp' as const };

function animationProgress(frame: number, fps: number, animation: Animation | undefined, fallbackDuration = 0.5) {
  if (!animation || !animation.type || animation.type === 'none') return 1;
  const start = Math.max(0, Number(animation.delay) || 0) * fps;
  const duration = Math.max(0.01, Number(animation.duration) || fallbackDuration) * fps;
  return interpolate(frame, [start, start + duration], [0, 1], {
    ...clamp,
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });
}

function layerMotion(layer: Layer, frame: number, fps: number) {
  const enter = animationProgress(frame, fps, layer.enter);
  const exitDuration = Math.max(0.01, Number(layer.exit?.duration) || 0.5) * fps;
  const exitStart = Math.max(0, layer.duration * fps - exitDuration - (Number(layer.exit?.delay) || 0) * fps);
  const exit = !layer.exit || layer.exit.type === 'none'
    ? 0
    : interpolate(frame, [exitStart, exitStart + exitDuration], [0, 1], {
        ...clamp,
        easing: Easing.in(Easing.cubic),
      });
  const progress = Math.max(0, Math.min(1, enter - exit));
  const type = String(layer.enter?.type || layer.exit?.type || 'none');
  let tx = 0;
  let ty = 0;
  let scale = Number(layer.scale) || 1;
  if (type.includes('left')) tx = interpolate(progress, [0, 1], [-120, 0]);
  if (type.includes('right')) tx = interpolate(progress, [0, 1], [120, 0]);
  if (type.includes('up')) ty = interpolate(progress, [0, 1], [-100, 0]);
  if (type.includes('down')) ty = interpolate(progress, [0, 1], [100, 0]);
  if (type === 'scale') scale *= interpolate(progress, [0, 1], [0.7, 1]);
  return { progress, tx, ty, scale };
}

function VisualLayer({ layer, assets }: { layer: Layer; assets: Map<string, Asset> }) {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const motion = layerMotion(layer, frame, fps);
  const w = Math.max(1, Number(layer.width ?? 1) * width);
  const h = Math.max(1, Number(layer.height ?? 1) * height);
  const x = (Number(layer.x ?? 0) + 1) * width / 2 - w / 2;
  const y = (Number(layer.y ?? 0) + 1) * height / 2 - h / 2;
  const style: React.CSSProperties = {
    position: 'absolute',
    left: x,
    top: y,
    width: w,
    height: h,
    opacity: (Number(layer.opacity ?? 1) || 0) * motion.progress,
    transform: `translate3d(${motion.tx}px, ${motion.ty}px, 0) rotate(${Number(layer.rotation) || 0}deg) scale(${motion.scale})`,
    transformOrigin: 'center center',
    overflow: 'hidden',
    borderRadius: Number(layer.borderRadius) || 0,
  };

  if (layer.type === 'text') {
    const raw = String(layer.text || '');
    const typed = layer.enter?.type === 'typewriter'
      ? raw.slice(0, Math.floor(raw.length * motion.progress))
      : raw;
    return (
      <div style={{
        ...style,
        display: 'flex',
        alignItems: 'center',
        justifyContent: layer.textAlign === 'left' ? 'flex-start' : layer.textAlign === 'right' ? 'flex-end' : 'center',
        color: layer.color || '#fff',
        fontSize: Number(layer.fontSize) || 64,
        fontWeight: layer.fontWeight || 700,
        lineHeight: Number(layer.lineHeight) || 1.2,
        textAlign: layer.textAlign || 'center',
        whiteSpace: 'pre-wrap',
      }}>{typed}</div>
    );
  }

  if (layer.type === 'shape') {
    return <div style={{ ...style, background: layer.fill || '#fff', borderRadius: layer.shape === 'circle' ? '50%' : (Number(layer.borderRadius) || 0) }} />;
  }

  const asset = assets.get(String(layer.assetId || ''));
  if (!asset) return null;
  const src = staticFile(`assets/${asset.src}`);
  if (layer.type === 'image') return <Img src={src} style={{ ...style, objectFit: layer.objectFit || 'cover' }} />;
  if (layer.type === 'video') {
    return (
      <Video
        src={src}
        style={{ ...style, objectFit: layer.objectFit || 'cover' }}
        muted={layer.muted !== false}
        volume={Math.max(0, Math.min(1, Number(layer.volume) || 0))}
        loop={layer.loop === true}
        trimBefore={Math.round((Number(layer.trimStart) || 0) * fps)}
        playbackRate={Number(layer.playbackRate) || 1}
      />
    );
  }
  return null;
}

function AudioLayer({ layer, asset }: { layer: Layer; asset: Asset }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const motion = layerMotion(layer, frame, fps);
  return (
    <Audio
      src={staticFile(`assets/${asset.src}`)}
      volume={Math.max(0, Math.min(1, Number(layer.volume ?? 1))) * motion.progress}
      loop={layer.loop === true}
      trimBefore={Math.round((Number(layer.trimStart) || 0) * fps)}
      playbackRate={Number(layer.playbackRate) || 1}
    />
  );
}

function SceneView({ scene, assets }: { scene: Scene; assets: Map<string, Asset> }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const transitionFrames = Math.min(scene.duration * fps / 3, 0.5 * fps);
  const enter = scene.transition && scene.transition !== 'none'
    ? interpolate(frame, [0, transitionFrames], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) })
    : 1;
  const exit = scene.transition && scene.transition !== 'none'
    ? interpolate(frame, [scene.duration * fps - transitionFrames, scene.duration * fps], [1, 0], { ...clamp, easing: Easing.in(Easing.cubic) })
    : 1;
  const visible = Math.min(enter, exit);
  const sceneX = scene.transition === 'slide-left' ? interpolate(enter, [0, 1], [120, 0])
    : scene.transition === 'slide-right' ? interpolate(enter, [0, 1], [-120, 0]) : 0;
  const assetMap = assets;
  return (
    <AbsoluteFill style={{ background: scene.background || '#09090b', opacity: visible, transform: `translate3d(${sceneX}px, 0, 0)` }}>
      {scene.layers.map((layer) => {
        const from = Math.round(layer.start * fps);
        const durationInFrames = Math.max(1, Math.round(layer.duration * fps));
        const asset = 'assetId' in layer ? assetMap.get(String(layer.assetId || '')) : undefined;
        return (
          <Sequence key={layer.id} from={from} durationInFrames={durationInFrames} premountFor={fps}>
            {layer.type === 'audio' && asset ? <AudioLayer layer={layer} asset={asset} /> : <VisualLayer layer={layer} assets={assetMap} />}
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
}

export const FixedComposition: React.FC<FixedCompositionProps> = ({ spec, assets }) => {
  const { fps } = useVideoConfig();
  const assetMap = React.useMemo(() => new Map(assets.map((asset) => [asset.id, asset])), [assets]);
  return (
    <AbsoluteFill style={{ background: '#09090b' }}>
      {spec.scenes.map((scene) => (
        <Sequence
          key={scene.id}
          from={Math.round(scene.start * fps)}
          durationInFrames={Math.max(1, Math.round(scene.duration * fps))}
          premountFor={fps}
        >
          <SceneView scene={scene} assets={assetMap} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
