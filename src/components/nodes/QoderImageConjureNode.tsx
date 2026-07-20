import { memo } from 'react';
import type { NodeProps } from '@xyflow/react';
import { CodexImageConjureNode } from './CodexImageConjureNode';

const QoderImageConjureNode = (props: NodeProps) => (
  <CodexImageConjureNode {...props} runtime="qoder" />
);

export default memo(QoderImageConjureNode);
