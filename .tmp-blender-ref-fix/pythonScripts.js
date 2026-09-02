'use strict';

const VALIDATOR_SOURCE = String.raw`
import ast
import re

ALLOWED_IMPORTS = {'bpy', 'bmesh', 'math', 'mathutils', 'random', 'colorsys', 'collections', 'itertools'}
DENIED_NAMES = {'open', 'exec', 'eval', 'compile', '__import__', 'input', 'breakpoint', 'globals', 'locals', 'vars', 'getattr', 'setattr', 'delattr'}
DENIED_CHAINS = {
    'bpy.ops.wm.open_mainfile', 'bpy.ops.wm.save_as_mainfile', 'bpy.ops.wm.read_homefile',
    'bpy.data.libraries.load', 'bpy.data.images.load', 'bpy.data.sounds.load',
    'bpy.data.cache_files.load', 'bpy.data.texts.load', 'bpy.data.fonts.load',
    'bpy.data.movieclips.load', 'bpy.ops.script', 'bpy.ops.export_scene', 'bpy.ops.import_scene'
}

def _chain(node):
    parts = []
    while isinstance(node, ast.Attribute):
        parts.append(node.attr)
        node = node.value
    if isinstance(node, ast.Name):
        parts.append(node.id)
    return '.'.join(reversed(parts))

def validate_generated(source):
    errors = []
    try:
        tree = ast.parse(source, filename='generated.py')
    except SyntaxError as exc:
        return ['Python 语法错误: %s' % exc]
    has_build = False
    for item in tree.body:
        if isinstance(item, (ast.Import, ast.ImportFrom, ast.FunctionDef, ast.ClassDef, ast.Assign, ast.AnnAssign)):
            pass
        elif isinstance(item, ast.Expr) and isinstance(item.value, ast.Constant) and isinstance(item.value.value, str):
            pass
        else:
            errors.append('顶层只允许导入、常量和函数/类定义')
        if isinstance(item, (ast.FunctionDef, ast.AsyncFunctionDef)) and item.name == 'build':
            has_build = True
    if not has_build:
        errors.append('必须定义 build(context) 入口')
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                if alias.name.split('.')[0] not in ALLOWED_IMPORTS:
                    errors.append('禁止导入模块: %s' % alias.name)
        elif isinstance(node, ast.ImportFrom):
            if (node.module or '').split('.')[0] not in ALLOWED_IMPORTS:
                errors.append('禁止导入模块: %s' % (node.module or ''))
        elif isinstance(node, ast.Name) and node.id in DENIED_NAMES:
            errors.append('禁止使用名称: %s' % node.id)
        elif isinstance(node, ast.Attribute):
            chain = _chain(node)
            if node.attr.startswith('__') or any(chain == item or chain.startswith(item + '.') for item in DENIED_CHAINS):
                errors.append('禁止访问属性: %s' % chain)
        elif isinstance(node, ast.Constant) and isinstance(node.value, str):
            value = node.value.strip()
            if re.match(r'^(?:https?://|file://|[A-Za-z]:[\\/]|/(?:etc|home|root|usr|var|tmp)/)', value, re.I):
                errors.append('禁止在生成脚本中使用外部 URL 或绝对路径')
    return list(dict.fromkeys(errors))
`;

const RUNNER_SOURCE = String.raw`
import bpy
import math
import json
import os
import sys
import traceback
from mathutils import Vector

${VALIDATOR_SOURCE}

def emit(kind, **payload):
    data = {'type': kind}
    data.update(payload)
    print(json.dumps(data, ensure_ascii=False), flush=True)

def bounds():
    points = []
    for obj in bpy.context.scene.objects:
        if obj.type in {'MESH', 'CURVE', 'SURFACE', 'META', 'FONT'} and not obj.hide_render:
            for corner in obj.bound_box:
                points.append(obj.matrix_world @ Vector(corner))
    if not points:
        raise RuntimeError('场景中没有可渲染几何体')
    if any(not math.isfinite(value) for point in points for value in point):
        raise RuntimeError('场景边界包含 NaN 或无穷坐标')
    low = Vector((min(p.x for p in points), min(p.y for p in points), min(p.z for p in points)))
    high = Vector((max(p.x for p in points), max(p.y for p in points), max(p.z for p in points)))
    return low, high

def look_at(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat('-Z', 'Y').to_euler()

def ensure_world():
    world = bpy.context.scene.world or bpy.data.worlds.new('T8 World')
    bpy.context.scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes.get('Background')
    if bg:
        bg.inputs['Color'].default_value = (0.025, 0.035, 0.05, 1)
        bg.inputs['Strength'].default_value = 0.32

def ensure_lights(center, size):
    if any(obj.type == 'LIGHT' for obj in bpy.context.scene.objects):
        return
    for name, loc, energy, color, scale in [
        ('T8 Key', (1.4, -1.2, 1.8), 1500, (1.0, 0.82, 0.68), 5.0),
        ('T8 Fill', (-1.3, -0.5, 0.9), 900, (0.62, 0.78, 1.0), 4.0),
        ('T8 Rim', (0.2, 1.5, 1.5), 1100, (0.75, 0.9, 1.0), 3.0),
    ]:
        data = bpy.data.lights.new(name, 'AREA')
        data.energy = energy
        data.color = color
        data.shape = 'DISK'
        data.size = max(size * scale * 0.35, 2.0)
        obj = bpy.data.objects.new(name, data)
        bpy.context.collection.objects.link(obj)
        obj.location = center + Vector(loc) * size
        look_at(obj, center)

def ensure_camera(name, center, size, direction):
    existing = bpy.data.objects.get(name)
    if existing and existing.type == 'CAMERA':
        return existing
    data = bpy.data.cameras.new(name)
    data.lens = 50
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    obj.location = center + Vector(direction).normalized() * max(size * 2.4, 4.0)
    look_at(obj, center)
    return obj

def configure_render(preset, width, height):
    scene = bpy.context.scene
    scene.render.resolution_x = width
    scene.render.resolution_y = height
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.render.film_transparent = False
    if preset == 'final':
        scene.render.engine = 'CYCLES'
        scene.cycles.samples = 128
        scene.cycles.use_denoising = True
        scene.cycles.device = 'CPU'
        try:
            prefs = bpy.context.preferences.addons['cycles'].preferences
            prefs.get_devices()
            for backend in ('OPTIX', 'CUDA', 'HIP', 'ONEAPI'):
                try:
                    prefs.compute_device_type = backend
                    devices = [device for device in prefs.devices if device.type != 'CPU']
                    if devices:
                        for device in devices:
                            device.use = True
                        scene.cycles.device = 'GPU'
                        break
                except Exception:
                    continue
        except Exception:
            pass
    else:
        scene.render.engine = 'BLENDER_EEVEE_NEXT'
        if hasattr(scene, 'eevee'):
            if hasattr(scene.eevee, 'taa_render_samples'):
                scene.eevee.taa_render_samples = 32
            if hasattr(scene.eevee, 'taa_samples'):
                scene.eevee.taa_samples = 32
        scene.render.image_settings.color_mode = 'RGBA'
        scene.render.film_transparent = False

def render_camera(camera, target):
    scene = bpy.context.scene
    scene.camera = camera
    scene.render.filepath = target
    bpy.ops.render.render(write_still=True)

class BuildContext(dict):
    """Expose JSON job metadata plus the Blender context expected by bpy modules."""
    def __getattr__(self, name):
        try:
            return self[name]
        except KeyError as exc:
            raise AttributeError(name) from exc

    def __setattr__(self, name, value):
        self[name] = value

def build_context(value):
    data = dict(value) if isinstance(value, dict) else {}
    context = BuildContext(data)
    context.scene = bpy.context.scene
    context.collection = bpy.context.collection
    context.view_layer = bpy.context.view_layer
    context.preferences = bpy.context.preferences
    return context

def ensure_referenced_datablocks(source):
    """Create minimal, scene-linked placeholders for explicit bpy.data lookups."""
    pattern = r"bpy\\.data\\.(objects|collections|materials|lights|cameras|meshes)\\s*\\[\\s*['\\\"]([^'\\\"]+)['\\\"]\\s*\\]"
    for kind, name in set(re.findall(pattern, source)):
        if kind == 'objects':
            if bpy.data.objects.get(name):
                continue
            upper = name.upper()
            if upper.startswith(('LGT_', 'LIGHT_', 'AREA_', 'SUN_')):
                light_type = 'SUN' if upper.startswith('SUN_') else 'AREA'
                data = bpy.data.lights.new(name, light_type)
                obj = bpy.data.objects.new(name, data)
            elif upper.startswith(('CAM_', 'CAMERA_')):
                obj = bpy.data.objects.new(name, bpy.data.cameras.new(name))
            else:
                obj = bpy.data.objects.new(name, None)
            bpy.context.collection.objects.link(obj)
        elif kind == 'collections':
            if not bpy.data.collections.get(name):
                collection = bpy.data.collections.new(name)
                bpy.context.scene.collection.children.link(collection)
        elif kind == 'materials':
            if not bpy.data.materials.get(name):
                bpy.data.materials.new(name)
        elif kind == 'lights':
            if not bpy.data.lights.get(name):
                bpy.data.lights.new(name, 'AREA')
        elif kind == 'cameras':
            if not bpy.data.cameras.get(name):
                bpy.data.cameras.new(name)
        elif kind == 'meshes':
            if not bpy.data.meshes.get(name):
                bpy.data.meshes.new(name)

def execute_module(module_path, context):
    source = open(module_path, 'r', encoding='utf-8').read()
    errors = validate_generated(source)
    if errors:
        raise RuntimeError('脚本安全校验失败: ' + '; '.join(errors))
    ensure_referenced_datablocks(source)
    namespace = {'__name__': 't8_generated_blender'}
    exec(compile(source, module_path, 'exec'), namespace, namespace)
    namespace['build'](build_context(context))

def main():
    marker = sys.argv.index('--') if '--' in sys.argv else len(sys.argv) - 1
    request_path = sys.argv[marker + 1]
    request = json.load(open(request_path, 'r', encoding='utf-8'))
    operation = request['operation']
    current_blend = request.get('currentBlend', '')
    if current_blend and os.path.isfile(current_blend):
        bpy.ops.wm.open_mainfile(filepath=current_blend)
    if operation == 'apply':
        execute_module(request['modulePath'], request.get('context', {}))
        low, high = bounds()
        center = (low + high) * 0.5
        size = max((high - low).length, 1.0)
        ensure_world()
        ensure_lights(center, size)
        camera = ensure_camera('T8_CHECK_CAMERA', center, size, (1.35, -1.55, 1.05))
        configure_render('draft', 640, 640)
        render_camera(camera, request['checkpointPath'])
        bpy.ops.wm.save_as_mainfile(filepath=request['outputBlend'])
        emit('complete', outputBlend=request['outputBlend'], checkpoint=request['checkpointPath'])
        return
    low, high = bounds()
    center = (low + high) * 0.5
    size = max((high - low).length, 1.0)
    ensure_world()
    ensure_lights(center, size)
    preset = request.get('preset', 'final')
    width = 1024 if preset == 'final' else 640
    configure_render(preset, width, width)
    directions = [(1.4, -1.6, 1.1), (-1.4, -1.3, 0.8), (0.1, 1.7, 0.65), (1.0, -0.7, 2.0)]
    previews = []
    for index, direction in enumerate(directions):
        camera = ensure_camera('T8_FINAL_%02d' % (index + 1), center, size, direction)
        target = os.path.join(request['previewDir'], 'view-%02d.png' % (index + 1))
        render_camera(camera, target)
        previews.append(target)
    try:
        bpy.ops.file.pack_all()
    except Exception:
        pass
    bpy.ops.wm.save_as_mainfile(filepath=request['outputBlend'])
    bpy.ops.export_scene.gltf(filepath=request['outputGlb'], export_format='GLB', export_apply=True)
    emit('complete', outputBlend=request['outputBlend'], outputGlb=request['outputGlb'], previews=previews, engine=bpy.context.scene.render.engine, device=getattr(bpy.context.scene.cycles, 'device', 'CPU'))

try:
    main()
except Exception as exc:
    emit('error', error=str(exc), traceback=traceback.format_exc()[-6000:])
    raise
`;

module.exports = { RUNNER_SOURCE, VALIDATOR_SOURCE };
