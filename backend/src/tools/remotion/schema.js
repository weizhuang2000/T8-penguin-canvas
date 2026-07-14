'use strict';

const { z } = require('zod');

const VERSION = 't8-remotion/v1';
const ASSET_KINDS = ['image', 'video', 'audio'];
const ANIMATION_KINDS = ['none', 'fade', 'slide-left', 'slide-right', 'slide-up', 'slide-down', 'scale', 'typewriter'];

const animationSchema = z.object({
  type: z.enum(ANIMATION_KINDS).default('none'),
  duration: z.number().min(0).max(10).default(0.5),
  delay: z.number().min(0).max(60).default(0),
}).strict();

const commonLayer = {
  id: z.string().trim().min(1).max(80),
  start: z.number().min(0).max(60).default(0),
  duration: z.number().positive().max(60),
  x: z.number().min(-1).max(1).default(0),
  y: z.number().min(-1).max(1).default(0),
  width: z.number().positive().max(2).default(1),
  height: z.number().positive().max(2).default(1),
  opacity: z.number().min(0).max(1).default(1),
  rotation: z.number().min(-720).max(720).default(0),
  scale: z.number().positive().max(10).default(1),
  enter: animationSchema.optional(),
  exit: animationSchema.optional(),
};

const textLayerSchema = z.object({
  ...commonLayer,
  type: z.literal('text'),
  text: z.string().max(12000),
  color: z.string().trim().max(80).default('#ffffff'),
  fontSize: z.number().min(8).max(400).default(64),
  fontWeight: z.union([z.number().min(100).max(900), z.enum(['normal', 'bold'])]).default(700),
  textAlign: z.enum(['left', 'center', 'right']).default('center'),
  lineHeight: z.number().min(0.5).max(4).default(1.2),
}).strict();

const mediaCommon = {
  ...commonLayer,
  assetId: z.string().trim().min(1).max(80),
  objectFit: z.enum(['contain', 'cover', 'fill']).default('cover'),
  borderRadius: z.number().min(0).max(1000).default(0),
};

const imageLayerSchema = z.object({ ...mediaCommon, type: z.literal('image') }).strict();
const videoLayerSchema = z.object({
  ...mediaCommon,
  type: z.literal('video'),
  volume: z.number().min(0).max(1).default(0),
  muted: z.boolean().default(true),
  loop: z.boolean().default(false),
  trimStart: z.number().min(0).max(36000).default(0),
  playbackRate: z.number().min(0.25).max(4).default(1),
}).strict();

const audioLayerSchema = z.object({
  id: commonLayer.id,
  type: z.literal('audio'),
  assetId: z.string().trim().min(1).max(80),
  start: commonLayer.start,
  duration: commonLayer.duration,
  volume: z.number().min(0).max(1).default(1),
  loop: z.boolean().default(false),
  trimStart: z.number().min(0).max(36000).default(0),
  playbackRate: z.number().min(0.25).max(4).default(1),
  enter: animationSchema.optional(),
  exit: animationSchema.optional(),
}).strict();

const shapeLayerSchema = z.object({
  ...commonLayer,
  type: z.literal('shape'),
  shape: z.enum(['rect', 'circle']).default('rect'),
  fill: z.string().trim().max(100).default('#ffffff'),
  borderRadius: z.number().min(0).max(1000).default(0),
}).strict();

const layerSchema = z.discriminatedUnion('type', [
  textLayerSchema,
  imageLayerSchema,
  videoLayerSchema,
  audioLayerSchema,
  shapeLayerSchema,
]);

const specSchema = z.object({
  version: z.literal(VERSION),
  assets: z.array(z.object({
    id: z.string().trim().min(1).max(80),
    kind: z.enum(ASSET_KINDS),
    label: z.string().trim().max(200).optional(),
  }).strict()).max(32).default([]),
  scenes: z.array(z.object({
    id: z.string().trim().min(1).max(80),
    start: z.number().min(0).max(60),
    duration: z.number().positive().max(60),
    background: z.string().trim().max(100).default('#09090b'),
    transition: z.enum(['none', 'fade', 'slide-left', 'slide-right', 'wipe']).default('none'),
    layers: z.array(layerSchema).max(128),
  }).strict()).min(1).max(64),
}).strict();

function normalizeProfile(raw = {}) {
  const ratio = ['16:9', '9:16', '1:1'].includes(raw.ratio) ? raw.ratio : '16:9';
  const resolution = raw.resolution === '720p' ? '720p' : '1080p';
  const fps = [24, 30, 60].includes(Number(raw.fps)) ? Number(raw.fps) : 30;
  const duration = Math.max(1, Math.min(60, Number(raw.duration) || 8));
  const dimensions = {
    '16:9': resolution === '720p' ? [1280, 720] : [1920, 1080],
    '9:16': resolution === '720p' ? [720, 1280] : [1080, 1920],
    '1:1': resolution === '720p' ? [720, 720] : [1080, 1080],
  }[ratio];
  return { ratio, resolution, fps, duration, width: dimensions[0], height: dimensions[1], durationInFrames: Math.ceil(duration * fps) };
}

function zodIssues(error) {
  return (error?.issues || []).map((issue) => `${issue.path.join('.') || 'spec'}: ${issue.message}`);
}

function validateDslSpec(value, options = {}) {
  const result = specSchema.safeParse(value);
  if (!result.success) return { ok: false, errors: zodIssues(result.error) };

  const profile = normalizeProfile(options.profile);
  const submittedAssets = new Map((options.assets || []).map((asset) => [String(asset.id || ''), asset]));
  const declaredAssets = new Map(result.data.assets.map((asset) => [asset.id, asset]));
  const errors = [];
  const seenSceneIds = new Set();
  const seenLayerIds = new Set();

  for (const asset of result.data.assets) {
    const submitted = submittedAssets.get(asset.id);
    if (!submitted) errors.push(`assets.${asset.id}: 未提交对应素材`);
    else if (submitted.kind !== asset.kind) errors.push(`assets.${asset.id}: 素材类型不匹配`);
  }

  for (const scene of result.data.scenes) {
    if (seenSceneIds.has(scene.id)) errors.push(`scenes.${scene.id}: id 重复`);
    seenSceneIds.add(scene.id);
    if (scene.start + scene.duration > profile.duration + 0.001) errors.push(`scenes.${scene.id}: 超出总时长 ${profile.duration}s`);
    for (const layer of scene.layers) {
      if (seenLayerIds.has(layer.id)) errors.push(`layers.${layer.id}: id 重复`);
      seenLayerIds.add(layer.id);
      if (layer.start + layer.duration > scene.duration + 0.001) errors.push(`layers.${layer.id}: 超出所属场景时长`);
      if ('assetId' in layer) {
        const declared = declaredAssets.get(layer.assetId);
        if (!declared) errors.push(`layers.${layer.id}: 未声明素材 ${layer.assetId}`);
        const expected = layer.type === 'image' ? 'image' : layer.type === 'video' ? 'video' : 'audio';
        if (declared && declared.kind !== expected) errors.push(`layers.${layer.id}: 素材 ${layer.assetId} 必须是 ${expected}`);
      }
    }
  }

  return errors.length ? { ok: false, errors } : { ok: true, data: result.data, profile, errors: [] };
}

function parseJsonSource(source) {
  const clean = String(source || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  if (!clean) return { ok: false, errors: ['描述内容为空'] };
  try {
    return { ok: true, data: JSON.parse(clean) };
  } catch (error) {
    return { ok: false, errors: [`JSON 解析失败: ${error.message}`] };
  }
}

module.exports = {
  VERSION,
  ANIMATION_KINDS,
  normalizeProfile,
  parseJsonSource,
  validateDslSpec,
};
