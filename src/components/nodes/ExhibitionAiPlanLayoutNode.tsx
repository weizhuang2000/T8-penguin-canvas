import { memo } from 'react';
import type { NodeProps } from '@xyflow/react';
import ExhibitionPlanLayoutNode from './ExhibitionPlanLayoutNode';

const ExhibitionAiPlanLayoutNode = (props: NodeProps) => (
  <ExhibitionPlanLayoutNode
    {...props}
    data={{ ...(props.data || {}), aiPlanLayoutMode: true, structureLock: true }}
  />
);

export default memo(ExhibitionAiPlanLayoutNode);
