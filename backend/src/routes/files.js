/**
 * 文件上传/下载路由
 * 用于:用户从本地上传参考图,后续传给图像生成接口
 */
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const config = require('../config');
const { tryDecodeDuckPayload } = require('../utils/duckPayload');

const router = express.Router();
const CAM_IMAGE_EXT_RE = /\.(png|jpe?g|webp|gif|bmp|tiff?|avif)$/i;

// 配置 multer
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, config.INPUT_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || '.png';
    const name = `up_${Date.now()}_${Math.random().toString(36).slice(2, 6)}${ext}`;
    cb(null, name);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: config.MAX_FILE_SIZE },
});

// POST /api/files/upload — 上传文件
router.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, error: '未收到文件' });
  }
  res.json({
    success: true,
    data: {
      filename: req.file.filename,
      url: `/files/input/${req.file.filename}`,
      size: req.file.size,
      mime: req.file.mimetype,
    },
  });
});

// GET /api/files/list — 列出 output 目录
router.get('/list', (_req, res) => {
  try {
    const files = fs.readdirSync(config.OUTPUT_DIR)
      .filter((f) => /\.(png|jpe?g|webp|gif|mp4|webm|mp3|wav)$/i.test(f))
      .map((f) => {
        const stat = fs.statSync(path.join(config.OUTPUT_DIR, f));
        return {
          filename: f,
          url: `/files/output/${f}`,
          size: stat.size,
          mtime: stat.mtimeMs,
        };
      })
      .sort((a, b) => b.mtime - a.mtime);
    res.json({ success: true, data: files });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

function isSafeCamSegment(value) {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value !== '.' &&
    value !== '..' &&
    !/[\\/\0]/.test(value)
  );
}

function resolveInside(baseDir, ...parts) {
  const base = path.resolve(baseDir);
  const resolved = path.resolve(base, ...parts);
  if (resolved !== base && !resolved.startsWith(base + path.sep)) return null;
  return resolved;
}

function camRoot() {
  return path.resolve(config.CAM_OUTPUT_ROOT || 'C:\\cam-output');
}

function camProjectDir(projectName) {
  if (!isSafeCamSegment(projectName)) return null;
  return resolveInside(camRoot(), projectName);
}

function camOutputDir(projectName) {
  const projectDir = camProjectDir(projectName);
  if (!projectDir) return null;
  return resolveInside(projectDir, 'camoutput');
}

function camImageFilePath(project, filename) {
  if (!isSafeCamSegment(project) || !isSafeCamSegment(filename) || !CAM_IMAGE_EXT_RE.test(filename)) {
    return null;
  }
  const dir = camOutputDir(project);
  return dir ? resolveInside(dir, filename) : null;
}

function listCamOutputImages(projectName) {
  const dir = camOutputDir(projectName);
  if (!dir || !fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && CAM_IMAGE_EXT_RE.test(entry.name))
    .map((entry) => {
      const filePath = path.join(dir, entry.name);
      const stat = fs.statSync(filePath);
      return {
        filename: entry.name,
        url: `/files/cam-output/${encodeURIComponent(projectName)}/${encodeURIComponent(entry.name)}`,
        size: stat.size,
        mtime: stat.mtimeMs,
      };
    })
    .sort((a, b) => a.filename.localeCompare(b.filename, 'zh-Hans-CN', { numeric: true, sensitivity: 'base' }));
}

// GET /api/files/cam-output/projects - list direct children of C:\cam-output
router.get('/cam-output/projects', (_req, res) => {
  try {
    const root = camRoot();
    if (!fs.existsSync(root)) {
      return res.json({ success: true, data: { root, projects: [] } });
    }
    const projects = fs.readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && isSafeCamSegment(entry.name))
      .map((entry) => {
        const projectPath = path.join(root, entry.name);
        const stat = fs.statSync(projectPath);
        let imageCount = 0;
        try {
          imageCount = listCamOutputImages(entry.name).length;
        } catch {
          imageCount = 0;
        }
        return {
          name: entry.name,
          imageCount,
          mtime: stat.mtimeMs,
        };
      })
      .sort((a, b) => b.mtime - a.mtime);
    res.json({ success: true, data: { root, projects } });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// GET /api/files/cam-output/projects/:project/images - list images in <project>\camoutput
router.get('/cam-output/projects/:project/images', (req, res) => {
  try {
    const project = String(req.params.project || '');
    if (!isSafeCamSegment(project)) {
      return res.status(400).json({ success: false, error: 'Invalid project name' });
    }
    const dir = camOutputDir(project);
    if (!dir || !fs.existsSync(dir)) {
      return res.status(404).json({ success: false, error: 'camoutput folder not found' });
    }
    const images = listCamOutputImages(project);
    res.json({ success: true, data: { project, folder: dir, images } });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

function sendCamOutputImage(req, res) {
  try {
    const project = String(req.params.project || '');
    const filename = String(req.params.filename || '');
    const filePath = camImageFilePath(project, filename);
    if (!filePath) {
      return res.status(400).json({ success: false, error: 'Invalid image path' });
    }
    if (!filePath || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      return res.status(404).json({ success: false, error: 'Image not found' });
    }
    res.sendFile(filePath);
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
}

// GET /api/files/cam-output/projects/:project/image/:filename - legacy API image route
router.get('/cam-output/projects/:project/image/:filename', sendCamOutputImage);

// GET /api/files/cam-output/:project/:filename - image route that can also be mounted as /files/cam-output/*
router.get('/cam-output/:project/:filename', sendCamOutputImage);

// POST /api/files/upload-base64 — 从 base64 dataURL 保存 PNG/JPG 到 OUTPUT_DIR
// 供手绘画板 / 抽帧等前端产生的图像使用
router.post('/upload-base64', express.json({ limit: '20mb' }), (req, res) => {
  try {
    const { dataUrl, prefix } = req.body || {};
    if (!dataUrl || typeof dataUrl !== 'string') {
      return res.status(400).json({ success: false, error: '缺少 dataUrl' });
    }
    const m = /^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/i.exec(dataUrl);
    if (!m) {
      return res.status(400).json({ success: false, error: 'dataUrl 格式不支持' });
    }
    const ext = m[1].toLowerCase() === 'jpg' ? 'jpeg' : m[1].toLowerCase();
    const buf = Buffer.from(m[2], 'base64');
    const tag = (prefix || 'draw').replace(/[^a-z0-9-]/gi, '').slice(0, 16) || 'draw';
    const filename = `${tag}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.${ext === 'jpeg' ? 'png' : ext}`;
    const fp = path.join(config.OUTPUT_DIR, filename);
    fs.writeFileSync(fp, buf);
    res.json({
      success: true,
      data: {
        filename,
        url: `/files/output/${filename}`,
        size: buf.length,
      },
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

function resolveLocalFileUrl(url) {
  if (typeof url !== 'string' || !url.trim()) return null;
  const clean = url.split('?')[0].split('#')[0];
  const mounts = [
    { prefix: '/files/input/', dir: config.INPUT_DIR },
    { prefix: '/files/output/', dir: config.OUTPUT_DIR },
  ];
  const mount = mounts.find((item) => clean.startsWith(item.prefix));
  if (!mount) return null;
  const rel = decodeURIComponent(clean.slice(mount.prefix.length));
  const base = path.resolve(mount.dir);
  const resolved = path.resolve(base, rel);
  if (resolved !== base && !resolved.startsWith(base + path.sep)) return null;
  return resolved;
}

function isSameOrInside(child, parent) {
  const resolvedChild = normalizePathForCompare(child);
  const resolvedParent = normalizePathForCompare(parent);
  return resolvedChild === resolvedParent || resolvedChild.startsWith(resolvedParent + path.sep);
}

function isSamePath(left, right) {
  return normalizePathForCompare(left) === normalizePathForCompare(right);
}

function normalizePathForCompare(value) {
  const resolved = path.resolve(value);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

function shouldSkipDuplicateLocalSave(srcAbs, savePath) {
  const source = path.resolve(srcAbs);
  const targetDir = path.resolve(savePath);
  const outputDir = path.resolve(config.OUTPUT_DIR);
  if (!isSameOrInside(source, outputDir)) return false;
  return (
    isSamePath(targetDir, outputDir) ||
    isSamePath(targetDir, path.dirname(outputDir)) ||
    isSameOrInside(targetDir, outputDir)
  );
}

function safeDuckExt(ext) {
  const clean = String(ext || 'bin')
    .trim()
    .toLowerCase()
    .replace(/^\./, '')
    .replace(/[^a-z0-9._+-]/g, '')
    .slice(0, 40);
  return clean || 'bin';
}

// POST /api/files/duck-decode — 尝试按 SS_tools 无密码鸭鸭图批量解码本地素材
// 非鸭鸭图 / 密码鸭鸭图 / 非图片输出都只返回 decoded:false，前端会静默回退到普通上传输出。
router.post('/duck-decode', express.json({ limit: '256kb' }), async (req, res) => {
  try {
    const urls = Array.isArray(req.body?.urls) ? req.body.urls.filter((u) => typeof u === 'string') : [];
    if (urls.length === 0) {
      return res.status(400).json({ success: false, error: '缺少 urls' });
    }
    const limited = urls.slice(0, 30);
    const items = [];
    for (let i = 0; i < limited.length; i += 1) {
      const sourceUrl = limited[i];
      try {
        const fp = resolveLocalFileUrl(sourceUrl);
        if (!fp || !fs.existsSync(fp)) {
          items.push({ sourceUrl, decoded: false, reason: 'local_file_not_found' });
          continue;
        }
        const decoded = await tryDecodeDuckPayload(fs.readFileSync(fp));
        if (!decoded?.decoded || !decoded.buffer) {
          items.push({
            sourceUrl,
            decoded: false,
            isDuck: !!decoded?.isDuck,
            passwordProtected: !!decoded?.passwordProtected,
            reason: decoded?.passwordProtected ? 'password_protected' : 'not_duck',
          });
          continue;
        }
        if (!['image', 'video', 'audio'].includes(decoded.kind)) {
          items.push({ sourceUrl, decoded: false, isDuck: true, reason: 'unsupported_kind' });
          continue;
        }
        if (!fs.existsSync(config.OUTPUT_DIR)) fs.mkdirSync(config.OUTPUT_DIR, { recursive: true });
        const ext = safeDuckExt(decoded.ext);
        const filename = `duck_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 7)}.${ext}`;
        const target = path.join(config.OUTPUT_DIR, filename);
        fs.writeFileSync(target, decoded.buffer);
        items.push({
          sourceUrl,
          decoded: true,
          filename,
          url: `/files/output/${filename}`,
          size: decoded.buffer.length,
          kind: decoded.kind,
          mime: decoded.mime,
          originalExt: decoded.originalExt,
          ext,
          lsbBits: decoded.lsbBits,
        });
      } catch (e) {
        items.push({ sourceUrl, decoded: false, reason: e?.message || 'decode_failed' });
      }
    }
    res.json({
      success: true,
      data: {
        items,
        decodedCount: items.filter((item) => item.decoded).length,
      },
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e?.message || String(e) });
  }
});

// v1.2.10.2: 全局生成素材自动保存到本地路径
// POST /api/files/save-to-disk
//   body: { url: string, filename?: string, kind?: 'image'|'video'|'audio' }
//   url 支持:
//     - /files/output/xxx       → 从 OUTPUT_DIR 复制
//     - /files/input/xxx        → 从 INPUT_DIR 复制
//     - http(s)://...           → fetch 拉取后写入
//   读取当前 settings.fileSavePath, 不存在则 mkdir -p。
//   冲突防护: 同名文件已存在 → 跳过并返回 exist:true(不覆盖)。
router.post('/save-to-disk', express.json({ limit: '2mb' }), async (req, res) => {
  try {
    const { url, filename } = req.body || {};
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ success: false, error: '缺少 url' });
    }
    // 读取 settings
    let savePath = config.DEFAULT_LOCAL_SAVE_DIR;
    try {
      if (fs.existsSync(config.SETTINGS_FILE)) {
        const s = JSON.parse(fs.readFileSync(config.SETTINGS_FILE, 'utf-8'));
        if (typeof s?.fileSavePath === 'string' && s.fileSavePath.trim()) {
          savePath = s.fileSavePath.trim();
        }
      }
    } catch { /* ignore */ }
    if (!savePath) {
      return res.status(400).json({ success: false, error: '未配置 fileSavePath' });
    }
    if (!fs.existsSync(savePath)) {
      fs.mkdirSync(savePath, { recursive: true });
    }

    // 推断目标文件名
    const inferName = () => {
      if (filename && typeof filename === 'string') return filename.replace(/[\\\/:*?"<>|]/g, '_');
      try {
        const u = url.startsWith('http') ? new URL(url) : new URL(url, 'http://x');
        const base = path.basename(u.pathname || '') || `out_${Date.now()}`;
        return base.replace(/[\\\/:*?"<>|]/g, '_');
      } catch {
        return `out_${Date.now()}`;
      }
    };
    const target = path.join(savePath, inferName());

    // 已存在不覆盖 (防重复保存/面板多实例并发)
    if (fs.existsSync(target)) {
      return res.json({ success: true, data: { path: target, exist: true } });
    }

    // 本地 /files/output/* 或 /files/input/* → 直接 copyFile
    const localCopy = (srcAbs) => {
      if (!fs.existsSync(srcAbs)) {
        return res.status(404).json({ success: false, error: `源文件不存在: ${srcAbs}` });
      }
      if (shouldSkipDuplicateLocalSave(srcAbs, savePath)) {
        return res.json({ success: true, data: { path: srcAbs, exist: true, skipped: true, source: 'already-local' } });
      }
      fs.copyFileSync(srcAbs, target);
      return res.json({ success: true, data: { path: target, exist: false, source: 'copy' } });
    };
    if (url.startsWith('/files/output/')) {
      const rel = decodeURIComponent(url.replace('/files/output/', ''));
      return localCopy(path.join(config.OUTPUT_DIR, rel));
    }
    if (url.startsWith('/files/input/')) {
      const rel = decodeURIComponent(url.replace('/files/input/', ''));
      return localCopy(path.join(config.INPUT_DIR, rel));
    }

    // 远端 http(s) → fetch 拉取
    if (/^https?:\/\//i.test(url)) {
      try {
        const resp = await fetch(url);
        if (!resp.ok) {
          return res.status(502).json({ success: false, error: `拉取远端资源失败: HTTP ${resp.status}` });
        }
        const ab = await resp.arrayBuffer();
        fs.writeFileSync(target, Buffer.from(ab));
        return res.json({ success: true, data: { path: target, exist: false, source: 'fetch' } });
      } catch (e) {
        return res.status(502).json({ success: false, error: '拉取远端资源出错: ' + (e?.message || e) });
      }
    }

    return res.status(400).json({ success: false, error: '不支持的 url 协议' });
  } catch (e) {
    return res.status(500).json({ success: false, error: e?.message || String(e) });
  }
});

module.exports = router;
