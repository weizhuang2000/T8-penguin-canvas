'use strict';

function sanitizeNodeDataPatch(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const patch = { ...value };
  delete patch.id;
  delete patch.type;
  delete patch.position;
  delete patch.data;
  return patch;
}

function patchCanvasNodeData(existing, nodeId, patch) {
  if (!existing || !Array.isArray(existing.nodes)) {
    return { status: 404, error: 'Canvas data not found' };
  }
  const safePatch = sanitizeNodeDataPatch(patch);
  if (!safePatch) {
    return { status: 400, error: 'Invalid node data patch' };
  }
  let foundNode = false;
  const nodes = existing.nodes.map((node) => {
    if (String(node?.id || '') !== String(nodeId || '')) return node;
    foundNode = true;
    return {
      ...node,
      data: {
        ...(node.data || {}),
        ...safePatch,
      },
    };
  });
  if (!foundNode) {
    return { status: 404, error: 'Node not found' };
  }
  return {
    status: 200,
    data: {
      ...existing,
      nodes,
      edges: Array.isArray(existing.edges) ? existing.edges : [],
      viewport: existing.viewport || { x: 0, y: 0, zoom: 1 },
    },
  };
}

module.exports = {
  patchCanvasNodeData,
  sanitizeNodeDataPatch,
};
