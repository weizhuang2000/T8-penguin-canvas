import { memo, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Handle, Position, useReactFlow, type NodeProps } from '@xyflow/react';
import {
  AlertCircle,
  Box,
  FolderOpen,
  ImagePlus,
  Loader2,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';
import { useThemeStore } from '../../stores/theme';
import { PORT_COLOR } from '../../config/portTypes';
import {
  listCamOutputProjectImages,
  listCamOutputProjects,
  type CamOutputProject,
} from '../../services/api';

type ImportCamMaterialSetDetail = {
  sourceNodeId: string;
  sourcePosition?: { x: number; y: number };
  sourceWidth?: number;
  projectName: string;
  images: Array<{
    filename: string;
    url: string;
    size?: number;
  }>;
};

function formatTime(ms?: number) {
  if (!Number.isFinite(ms || 0) || !ms) return '';
  try {
    return new Date(ms).toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

const ImportCamProjectNode = ({ id, data, selected }: NodeProps) => {
  const rf = useReactFlow();
  const { theme, style } = useThemeStore();
  const isDark = theme === 'dark';
  const isPixel = style === 'pixel';
  const d = (data as any) || {};

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [importingName, setImportingName] = useState<string | null>(null);
  const [root, setRoot] = useState<string>(d.camOutputRoot || 'C:\\cam-output');
  const [projects, setProjects] = useState<CamOutputProject[]>([]);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);

  const accent = PORT_COLOR.image;
  const filteredProjects = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter((project) => project.name.toLowerCase().includes(q));
  }, [projects, query]);

  const loadProjects = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await listCamOutputProjects();
      setRoot(result.root || root);
      setProjects(result.projects || []);
    } catch (e: any) {
      setError(e?.message || '读取项目列表失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) void loadProjects();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const importProject = async (project: CamOutputProject) => {
    setImportingName(project.name);
    setError(null);
    try {
      const result = await listCamOutputProjectImages(project.name);
      const images = (result.images || []).map((item) => ({
        filename: item.filename,
        url: item.url,
        size: item.size,
      }));
      if (images.length === 0) {
        setError(`项目「${project.name}」的 camoutput 文件夹内没有图像`);
        return;
      }
      const me = rf.getNode(id);
      const detail: ImportCamMaterialSetDetail = {
        sourceNodeId: id,
        sourcePosition: me?.position,
        sourceWidth: (me as any)?.measured?.width || (me as any)?.width,
        projectName: project.name,
        images,
      };
      window.dispatchEvent(new CustomEvent<ImportCamMaterialSetDetail>('penguin:import-cam-material-set', { detail }));
      setOpen(false);
    } catch (e: any) {
      setError(e?.message || '导入项目失败');
    } finally {
      setImportingName(null);
    }
  };

  const containerStyle: React.CSSProperties = isPixel
    ? {
        width: 300,
        background: 'var(--px-surface, #fff)',
        border: '2px solid var(--px-ink, #1a1410)',
        borderRadius: 0,
        boxShadow: selected ? '5px 5px 0 var(--px-ink, #1a1410)' : '3px 3px 0 var(--px-ink, #1a1410)',
        color: 'var(--px-ink, #1a1410)',
      }
    : isDark
      ? {
          width: 300,
          background: 'rgba(20,20,22,.93)',
          border: selected ? `2px solid ${accent}` : '2px solid rgba(255,255,255,.14)',
          borderRadius: 12,
          boxShadow: selected ? `0 0 0 1px ${accent}, 0 16px 32px rgba(251,191,36,.18)` : undefined,
        }
      : {
          width: 300,
          background: 'rgba(255,255,255,.96)',
          border: selected ? `2px solid ${accent}` : '2px solid rgba(0,0,0,.12)',
          borderRadius: 12,
          boxShadow: selected ? `0 0 0 1px ${accent}, 0 16px 32px rgba(251,191,36,.16)` : '0 4px 12px rgba(0,0,0,.06)',
        };

  const modal = open ? (
    <div
      className="nodrag nopan fixed inset-0 z-[1000] flex items-center justify-center bg-black/45 px-4"
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div
        className={`w-full max-w-xl overflow-hidden rounded-lg border shadow-2xl ${
          isDark ? 'border-white/12 bg-zinc-950 text-white' : 'border-black/10 bg-white text-zinc-900'
        }`}
      >
        <div className={`flex items-center gap-2 border-b px-4 py-3 ${isDark ? 'border-white/10' : 'border-black/10'}`}>
          <FolderOpen size={17} style={{ color: accent }} />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold">选择项目白模</div>
            <div className={`truncate text-[11px] ${isDark ? 'text-white/45' : 'text-zinc-500'}`}>{root}</div>
          </div>
          <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center rounded hover:bg-black/10"
            onClick={() => void loadProjects()}
            title="刷新"
          >
            {loading ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
          </button>
          <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center rounded hover:bg-black/10"
            onClick={() => setOpen(false)}
            title="关闭"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-3 p-4">
          <label
            className={`flex h-9 items-center gap-2 rounded border px-2 ${
              isDark ? 'border-white/12 bg-white/5' : 'border-black/10 bg-zinc-50'
            }`}
          >
            <Search size={14} className={isDark ? 'text-white/45' : 'text-zinc-400'} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索项目名"
              className="nowheel min-w-0 flex-1 bg-transparent text-[13px] outline-none"
              autoFocus
            />
          </label>

          {error && (
            <div className="flex items-start gap-1.5 rounded border border-red-500/30 bg-red-500/10 px-2 py-1.5 text-[12px] text-red-400">
              <AlertCircle size={14} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className={`max-h-[420px] overflow-y-auto rounded border ${isDark ? 'border-white/10' : 'border-black/10'}`}>
            {loading ? (
              <div className="flex h-32 items-center justify-center gap-2 text-[13px] opacity-70">
                <Loader2 size={16} className="animate-spin" />
                正在读取项目列表...
              </div>
            ) : filteredProjects.length === 0 ? (
              <div className="flex h-32 items-center justify-center text-[13px] opacity-55">
                {projects.length === 0 ? '没有找到项目目录' : '没有匹配的项目'}
              </div>
            ) : (
              filteredProjects.map((project) => {
                const importing = importingName === project.name;
                return (
                  <button
                    key={project.name}
                    type="button"
                    className={`flex w-full items-center gap-3 border-b px-3 py-2.5 text-left last:border-b-0 ${
                      isDark ? 'border-white/10 hover:bg-white/10' : 'border-black/10 hover:bg-zinc-50'
                    }`}
                    disabled={!!importingName}
                    onClick={() => void importProject(project)}
                  >
                    <ImagePlus size={16} style={{ color: accent }} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-semibold">{project.name}</div>
                      <div className={`text-[11px] ${isDark ? 'text-white/45' : 'text-zinc-500'}`}>
                        {project.imageCount} 张图像{formatTime(project.mtime) ? ` · ${formatTime(project.mtime)}` : ''}
                      </div>
                    </div>
                    {importing && <Loader2 size={15} className="animate-spin" />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <>
      <div className="relative" style={containerStyle}>
        <Handle
          type="source"
          position={Position.Right}
          className="!border-0"
          style={{ background: accent, width: 11, height: 11 }}
          title="导入后输出图像素材集"
        />

        <div className={`flex items-center gap-2 border-b px-3 py-2 ${isDark ? 'border-white/10' : 'border-black/10'}`}>
          <div
            className="flex h-7 w-7 items-center justify-center rounded"
            style={{ background: `${accent}26`, color: accent, boxShadow: `inset 0 0 0 1px ${accent}66` }}
          >
            <Box size={15} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold">导入项目白模</div>
            <div className={`truncate text-[10px] ${isDark ? 'text-white/45' : 'text-zinc-500'}`}>
              {root}
            </div>
          </div>
        </div>

        <div className="space-y-2 p-3" onMouseDown={(e) => e.stopPropagation()}>
          <div className={`rounded border px-2 py-2 text-[11px] ${isDark ? 'border-white/10 text-white/60' : 'border-black/10 text-zinc-500'}`}>
            读取服务器目录下的项目，并导入项目 camoutput 文件夹内的全部图像。
          </div>
          <button
            type="button"
            className="nodrag nopan t8-btn h-9 w-full gap-1.5 text-[12px]"
            onClick={() => setOpen(true)}
          >
            <FolderOpen size={14} />
            选择项目
          </button>
          {error && (
            <div className="flex items-start gap-1.5 rounded border border-red-500/30 bg-red-500/10 px-2 py-1.5 text-[11px] text-red-400">
              <AlertCircle size={13} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>
      </div>
      {modal && typeof document !== 'undefined' ? createPortal(modal, document.body) : modal}
    </>
  );
};

export default memo(ImportCamProjectNode);
