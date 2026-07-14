import React from 'react';
import { Composition, registerRoot } from 'remotion';
import { FixedComposition, type FixedCompositionProps } from './FixedComposition';

const defaultProps: FixedCompositionProps = {
  spec: { version: 't8-remotion/v1', assets: [], scenes: [{ id: 'empty', start: 0, duration: 1, layers: [] }] },
  assets: [],
  profile: { width: 1920, height: 1080, fps: 30, duration: 8, durationInFrames: 240 },
};

const Root: React.FC = () => (
  <Composition
    id="T8Remotion"
    component={FixedComposition}
    width={1920}
    height={1080}
    fps={30}
    durationInFrames={240}
    defaultProps={defaultProps}
    calculateMetadata={({ props }) => ({
      width: props.profile.width,
      height: props.profile.height,
      fps: props.profile.fps,
      durationInFrames: props.profile.durationInFrames,
      props,
      defaultOutName: 't8-remotion-animation',
    })}
  />
);

registerRoot(Root);
