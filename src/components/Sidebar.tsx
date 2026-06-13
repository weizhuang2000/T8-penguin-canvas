import { useEffect, useMemo, useState } from 'react';
import * as Icons from 'lucide-react';
import {
  Check,
  ChevronDown,
  ChevronRight,
  Edit2,
  FolderOpen,
  Loader2,
  Plus,
  Search,
  Share2,
  Trash2,
  X,
} from 'lucide-react';
import { NODE_GROUPS } from '../config/nodeRegistry';

// vite.config.ts 中通过 define 注入的编译期常量（与 package.json version 同步）
declare const __APP_VERSION__: string;
import type { CanvasListItem, CanvasShareEntry, CanvasSharePermission, NodeMeta, NodeType } from '../types/canvas';
import { useThemeStore } from '../stores/theme';
import { useCanvasStore } from '../stores/canvas';
import { resolveThemeTemplate } from '../theme/defaultTemplates';
import * as api from '../services/api';
import type { AuthUser } from '../services/api';
const COLOR_HEX: Record<string, string> = {
  sky: '#7dd3fc',
  amber: '#fcd34d',
  rose: '#fda4af',
  fuchsia: '#f0abfc',
  violet: '#c4b5fd',
  emerald: '#6ee7b7',
  cyan: '#67e8f9',
  indigo: '#a5b4fc',
  orange: '#fdba74',
  pink: '#f9a8d4',
  teal: '#5eead4',
  slate: '#cbd5e1',
};

const OP_ICON_BY_TYPE: Record<string, string> = {
  upload: 'Anchor',
  output: 'Gem',
  text: 'ScrollText',
  image: 'Map',
  video: 'Telescope',
  seedance: 'Film',
  audio: 'Music2',
  llm: 'Compass',
  runninghub: 'Waypoints',
  'runninghub-wallet': 'WalletCards',
  'rh-tools': 'ShipWheel',
  'frame-pair': 'Telescope',
  loop: 'Repeat',
  'pick-from-set': 'Map',
  resize: 'Maximize2',
  combine: 'Boxes',
  'grid-crop': 'Grid3x3',
  idea: 'Lightbulb',
  bp: 'Map',
  relay: 'ArrowRightLeft',
  'import-cam-project': 'Box',
  cinematic: 'Clapperboard',
  'video-motion': 'Sailboat',
  'exhibition-prompt': 'GalleryHorizontalEnd',
  'elevation-prompt': 'PanelsTopLeft',
  'exhibition-img2img': 'Boxes',
  'exhibition-creative-image': 'Layers3',
  'pose-master': 'PersonStanding',
};

const NARUTO_ICON_BY_TYPE: Record<string, string> = {
  upload: 'BadgeUp',
  output: 'BadgeCheck',
  text: 'ScrollText',
  image: 'Flame',
  video: 'Zap',
  seedance: 'Film',
  audio: 'Drum',
  llm: 'BrainCircuit',
  runninghub: 'Network',
  'runninghub-wallet': 'BadgeDollarSign',
  'rh-tools': 'Boxes',
  'frame-pair': 'ScanEye',
  loop: 'Repeat2',
  'pick-from-set': 'PackageOpen',
  resize: 'MoveDiagonal',
  combine: 'Layers3',
  'grid-crop': 'Grid3x3',
  idea: 'Lightbulb',
  bp: 'BookOpen',
  relay: 'ArrowRightLeft',
  'import-cam-project': 'PackageOpen',
  cinematic: 'Clapperboard',
  'video-motion': 'Route',
  'exhibition-prompt': 'GalleryHorizontalEnd',
  'elevation-prompt': 'PanelsTopLeft',
  'exhibition-img2img': 'Boxes',
  'exhibition-creative-image': 'Layers3',
  'multi-angle-visual': 'Orbit',
  'text-split': 'Scissors',
  'image-compare': 'ScanSearch',
  'material-set': 'Package',
  'pose-master': 'PersonStanding',
};

const EVA_ICON_BY_TYPE: Record<string, string> = {
  upload: 'FileUp',
  output: 'MonitorCheck',
  text: 'Terminal',
  image: 'ScanLine',
  video: 'Clapperboard',
  seedance: 'Film',
  audio: 'Radio',
  llm: 'BrainCircuit',
  runninghub: 'Network',
  'runninghub-wallet': 'KeyRound',
  'rh-tools': 'Boxes',
  'frame-pair': 'ScanEye',
  loop: 'Repeat2',
  'pick-from-set': 'PackageOpen',
  resize: 'MoveDiagonal',
  combine: 'Layers3',
  'grid-crop': 'Grid3x3',
  idea: 'Lightbulb',
  bp: 'BookOpen',
  relay: 'Cable',
  'import-cam-project': 'PackageOpen',
  cinematic: 'Clapperboard',
  'video-motion': 'Route',
  'exhibition-prompt': 'GalleryHorizontalEnd',
  'elevation-prompt': 'PanelsTopLeft',
  'exhibition-img2img': 'Boxes',
  'exhibition-creative-image': 'Layers3',
  'multi-angle-visual': 'Orbit',
  'text-split': 'Scissors',
  'image-compare': 'ScanSearch',
  'material-set': 'Package',
  'pose-master': 'PersonStanding',
};

const YYH_ICON_BY_TYPE: Record<string, string> = {
  upload: 'FileUp',
  output: 'MonitorCheck',
  text: 'ScrollText',
  image: 'Sparkles',
  video: 'Clapperboard',
  seedance: 'Film',
  audio: 'Radio',
  llm: 'BrainCircuit',
  runninghub: 'Network',
  'runninghub-wallet': 'KeyRound',
  'rh-tools': 'Boxes',
  'frame-pair': 'ScanEye',
  loop: 'Repeat2',
  'pick-from-set': 'PackageOpen',
  resize: 'MoveDiagonal',
  combine: 'Layers3',
  'grid-crop': 'Grid3x3',
  idea: 'Lightbulb',
  bp: 'BookOpen',
  relay: 'Cable',
  'import-cam-project': 'PackageOpen',
  cinematic: 'Clapperboard',
  'video-motion': 'Route',
  'exhibition-prompt': 'GalleryHorizontalEnd',
  'elevation-prompt': 'PanelsTopLeft',
  'exhibition-img2img': 'Boxes',
  'exhibition-creative-image': 'Layers3',
  'multi-angle-visual': 'Orbit',
  'text-split': 'Scissors',
  'image-compare': 'ScanSearch',
  'material-set': 'Package',
  'drawing-board': 'PenTool',
  'portrait-master': 'UserRoundCog',
  'pose-master': 'PersonStanding',
};

const SLAMDUNK_ICON_BY_TYPE: Record<string, string> = {
  upload: 'FileUp',
  output: 'Trophy',
  text: 'ClipboardList',
  image: 'Image',
  video: 'Clapperboard',
  seedance: 'Film',
  audio: 'Radio',
  llm: 'BrainCircuit',
  runninghub: 'Network',
  'runninghub-wallet': 'BadgeDollarSign',
  'rh-tools': 'Boxes',
  'frame-pair': 'ScanEye',
  loop: 'Repeat2',
  'pick-from-set': 'PackageOpen',
  resize: 'MoveDiagonal',
  combine: 'Layers3',
  'grid-crop': 'Grid3x3',
  idea: 'Lightbulb',
  bp: 'NotebookTabs',
  relay: 'ArrowRightLeft',
  'import-cam-project': 'PackageOpen',
  cinematic: 'Clapperboard',
  'video-motion': 'Route',
  'exhibition-prompt': 'GalleryHorizontalEnd',
  'elevation-prompt': 'PanelsTopLeft',
  'exhibition-img2img': 'Boxes',
  'exhibition-creative-image': 'Layers3',
  'multi-angle-visual': 'Orbit',
  'text-split': 'Scissors',
  'image-compare': 'ScanSearch',
  'material-set': 'Package',
  'drawing-board': 'PenTool',
  'portrait-master': 'UserRoundCog',
  'pose-master': 'PersonStanding',
};

interface SidebarProps {
  onAddNode: (type: NodeType) => void;
  visibleNodeTypes?: string[];
}

export default function Sidebar({ onAddNode, visibleNodeTypes }: SidebarProps) {
  const { theme, style, templateId, customTemplates } = useThemeStore();
  const currentTemplate = useMemo(
    () => resolveThemeTemplate(templateId, customTemplates),
    [templateId, customTemplates],
  );
  const visualStyle = currentTemplate.visuals?.style || style;
  const isDark = theme === 'dark';
  const isPixel = style === 'pixel';
  const visibleNodeTypeSet = useMemo(() => new Set(visibleNodeTypes || []), [visibleNodeTypes]);
  const nodeGroups = useMemo(() => {
    if (!visibleNodeTypes) return NODE_GROUPS;
    return Object.fromEntries(
      Object.entries(NODE_GROUPS).map(([key, group]) => [
        key,
        {
          ...group,
          nodes: group.nodes.filter((node) => visibleNodeTypeSet.has(node.type)),
        },
      ]),
    ) as typeof NODE_GROUPS;
  }, [visibleNodeTypeSet, visibleNodeTypes]);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [keyword, setKeyword] = useState('');

  // 画布管理(整合到节点侧边栏顶部)
  const {
    canvases,
    activeId,
    loading: canvasLoading,
    loadCanvases,
    createCanvas,
    deleteCanvas,
    renameCanvas,
    updateCanvasShares,
    setActive,
  } = useCanvasStore();
  const [canvasPanelOpen, setCanvasPanelOpen] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [shareCanvas, setShareCanvas] = useState<CanvasListItem | null>(null);
  const [canvasKeyword, setCanvasKeyword] = useState('');

  useEffect(() => {
    loadCanvases();
  }, [loadCanvases]);

  const handleCreateCanvas = async () => {
    await createCanvas();
  };

  const startEdit = (id: string, name: string) => {
    setEditingId(id);
    setEditingName(name);
  };

  const submitEdit = async () => {
    if (editingId && editingName.trim()) {
      await renameCanvas(editingId, editingName.trim());
    }
    setEditingId(null);
  };

  const handleDeleteCanvas = async (id: string) => {
    await deleteCanvas(id);
    setConfirmDelete(null);
  };

  const activeCanvas = canvases.find((canvas) => canvas.id === activeId) || null;
  const canEditActiveCanvas = activeCanvas?.access?.canEdit !== false;
  const filteredCanvases = useMemo(() => {
    const keyword = canvasKeyword.trim().toLowerCase();
    if (!keyword) return canvases;
    return canvases.filter((canvas) => canvas.name.toLowerCase().includes(keyword));
  }, [canvases, canvasKeyword]);

  const toggle = (key: string) => setCollapsed((s) => ({ ...s, [key]: !s[key] }));

  const renderNode = (n: NodeMeta) => {
    const themedIcon = visualStyle === 'op'
      ? OP_ICON_BY_TYPE[n.type] || n.icon
      : visualStyle === 'naruto'
        ? NARUTO_ICON_BY_TYPE[n.type] || n.icon
      : visualStyle === 'eva'
        ? EVA_ICON_BY_TYPE[n.type] || n.icon
      : visualStyle === 'yyh'
        ? YYH_ICON_BY_TYPE[n.type] || n.icon
      : visualStyle === 'slamdunk'
        ? SLAMDUNK_ICON_BY_TYPE[n.type] || n.icon
        : n.icon;
    const Icon = (Icons as any)[themedIcon] || Icons.Box;
    const colorHex = COLOR_HEX[n.color] || COLOR_HEX.slate;
    return (
      <button
        key={n.type}
        onClick={() => {
          if (!canEditActiveCanvas) return;
          onAddNode(n.type);
        }}
        disabled={!canEditActiveCanvas}
        title={canEditActiveCanvas ? n.description : '当前画布为只读，不能添加节点'}
        className={`t8-sidebar-node w-full text-left flex items-center gap-2 px-2 py-1.5 transition-colors text-xs ${
          isPixel
            ? 'px-row'
            : `rounded-md ${
                isDark
                  ? 'hover:bg-white/10 text-zinc-200'
                  : 'hover:bg-black/5 text-zinc-800'
              }`
        } ${!canEditActiveCanvas ? 'opacity-45 cursor-not-allowed' : ''}`}
      >
        <span
          className={`w-6 h-6 flex items-center justify-center flex-shrink-0 ${
            isPixel ? 'rounded-[6px] border-2' : 'rounded'
          }`}
          style={
            isPixel
              ? {
                  background: colorHex,
                  color: '#1A1410',
                  borderColor: '#1A1410',
                }
              : {
                  background: colorHex + '22',
                  color: colorHex,
                  boxShadow: `inset 0 0 0 1px ${colorHex}55`,
                }
          }
        >
          <Icon size={13} />
        </span>
        <span className="flex-1 min-w-0 truncate">{n.label}</span>
      </button>
    );
  };

  // 搜索过滤
  const filterNodes = (nodes: NodeMeta[]) => {
    if (!keyword.trim()) return nodes;
    const k = keyword.toLowerCase();
    return nodes.filter(
      (n) =>
        n.label.toLowerCase().includes(k) ||
        n.type.toLowerCase().includes(k) ||
        n.description.toLowerCase().includes(k)
    );
  };

  return (
    <div
      className={`t8-sidebar w-64 flex flex-col border-r overflow-hidden ${
        isPixel
          ? 'px-panel'
          : isDark
            ? 'bg-zinc-900 border-white/10'
            : 'bg-white border-black/10'
      }`}
    >
      {/* 画布管理(可折叠) */}
      <div
        className={`border-b ${
          isPixel ? 'border-[#1A1410]/80' : isDark ? 'border-white/10' : 'border-black/10'
        }`}
      >
        <div
          className={`flex items-center gap-1 px-2 py-2 ${
            isPixel ? '' : isDark ? 'text-white/70' : 'text-zinc-700'
          }`}
        >
          <button
            onClick={() => setCanvasPanelOpen((v) => !v)}
            className={`flex items-center gap-1 shrink-0 text-left text-[11px] font-semibold uppercase tracking-wider ${
              isPixel
                ? 'px-group-title'
                : isDark
                  ? 'hover:text-white'
                  : 'hover:text-zinc-900'
            }`}
          >
            {canvasPanelOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            <FolderOpen size={12} />
            <span>画布</span>
            <span className="opacity-60 ml-1 normal-case">{canvases.length}</span>
          </button>
          <div
            className={`min-w-0 flex-1 flex items-center gap-1 px-1.5 py-1 ${
              isPixel
                ? 'px-input rounded-[10px]'
                : `rounded-md ${isDark ? 'bg-white/5' : 'bg-black/5'}`
            }`}
          >
            <Search size={11} className="shrink-0 opacity-50" />
            <input
              type="text"
              value={canvasKeyword}
              onChange={(e) => setCanvasKeyword(e.target.value)}
              onFocus={() => setCanvasPanelOpen(true)}
              placeholder="搜索画布"
              className={`min-w-0 flex-1 bg-transparent outline-none text-[10px] ${
                isPixel
                  ? ''
                  : isDark
                    ? 'text-white placeholder:text-white/30'
                    : 'text-zinc-900 placeholder:text-zinc-400'
              }`}
            />
          </div>
          <button
            onClick={handleCreateCanvas}
            className={
              isPixel
                ? 'px-btn px-btn--icon px-btn--mint'
                : `p-1 rounded-md ${
                    isDark
                      ? 'hover:bg-white/10 text-white/70 hover:text-white'
                      : 'hover:bg-black/10 text-zinc-700'
                  }`
            }
            title="新建画布"
          >
            <Plus size={13} />
          </button>
        </div>
        {canvasPanelOpen && (
          <div className="px-2 pb-2 max-h-56 overflow-y-auto space-y-0.5 scrollbar-hide">
            {canvasLoading && (
              <div
                className={`flex items-center gap-2 px-2 py-2 text-[11px] ${
                  isPixel ? '' : isDark ? 'text-white/40' : 'text-zinc-500'
                }`}
              >
                <Loader2 size={12} className="animate-spin" /> 加载中...
              </div>
            )}
            {!canvasLoading && canvases.length === 0 && (
              <div
                className={`text-center py-3 text-[11px] ${
                  isPixel ? '' : isDark ? 'text-white/40' : 'text-zinc-500'
                }`}
              >
                <p>还没有画布</p>
                <button
                  onClick={handleCreateCanvas}
                  className={
                    isPixel
                      ? 'mt-1.5 px-btn px-btn--sm px-btn--mint'
                      : 'mt-1.5 px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 text-[10px] hover:bg-emerald-500/30'
                  }
                >
                  + 新建第一个画布
                </button>
              </div>
            )}
            {!canvasLoading && canvases.length > 0 && filteredCanvases.length === 0 && (
              <div
                className={`px-2 py-2 text-center text-[11px] ${
                  isPixel ? '' : isDark ? 'text-white/40' : 'text-zinc-500'
                }`}
              >
                没有匹配的画布
              </div>
            )}
            {filteredCanvases.map((c) => {
              const isActive = c.id === activeId;
              const isEditing = editingId === c.id;
              const needConfirm = confirmDelete === c.id;
              const canManageCanvas = c.access?.canManageSharing !== false;
              return (
                <div
                  key={c.id}
                  onClick={() => !isEditing && setActive(c.id)}
                  className={`group px-2 py-1 cursor-pointer text-[11px] transition-colors ${
                    isPixel
                      ? `px-row ${isActive ? 'is-active' : ''}`
                      : `rounded-md ${
                          isActive
                            ? isDark
                              ? 'bg-white/10 text-white'
                              : 'bg-black/10 text-zinc-900'
                            : isDark
                              ? 'text-white/70 hover:bg-white/5'
                              : 'text-zinc-700 hover:bg-black/5'
                        }`
                  }`}
                >
                  {isEditing ? (
                    <input
                      autoFocus
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') submitEdit();
                        if (e.key === 'Escape') setEditingId(null);
                      }}
                      onBlur={submitEdit}
                      className={`w-full px-1.5 py-0.5 rounded text-[11px] outline-none border ${
                        isDark
                          ? 'bg-zinc-800 border-white/20 text-white'
                          : 'bg-white border-black/20'
                      }`}
                    />
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <div className="flex-1 min-w-0">
                        <div className="truncate font-medium">{c.name}</div>
                        <div
                          className={`text-[10px] ${
                            isDark ? 'text-white/30' : 'text-zinc-400'
                          }`}
                        >
                          {c.nodeCount} 个节点
                        </div>
                      </div>
                      <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 transition-opacity">
                        {needConfirm ? (
                          <>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteCanvas(c.id);
                              }}
                              className="p-0.5 rounded hover:bg-red-500/20 text-red-400"
                              title="确认删除"
                            >
                              <Check size={11} />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setConfirmDelete(null);
                              }}
                              className={`p-0.5 rounded ${
                                isDark ? 'hover:bg-white/10' : 'hover:bg-black/10'
                              }`}
                            >
                              <X size={11} />
                            </button>
                          </>
                        ) : (
                          <>
                            {canManageCanvas && (
                            <>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setShareCanvas(c);
                              }}
                              className={`p-0.5 rounded ${
                                isDark ? 'hover:bg-sky-500/20 text-sky-300' : 'hover:bg-sky-100 text-sky-700'
                              }`}
                              title="共享画布"
                            >
                              <Share2 size={10} />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                startEdit(c.id, c.name);
                              }}
                              className={`p-0.5 rounded ${
                                isDark ? 'hover:bg-white/10' : 'hover:bg-black/10'
                              }`}
                              title="重命名"
                            >
                              <Edit2 size={10} />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setConfirmDelete(c.id);
                              }}
                              className={`p-0.5 rounded ${
                                isDark
                                  ? 'hover:bg-red-500/20 text-red-400'
                                  : 'hover:bg-red-100 text-red-600'
                              }`}
                              title="删除"
                            >
                              <Trash2 size={10} />
                            </button>
                            </>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 搜索框 */}
      <div
        className={`t8-sidebar-search-row p-2 border-b ${
          isPixel ? 'border-[#1A1410]/80' : isDark ? 'border-white/10' : 'border-black/10'
        }`}
      >
        <div
          className={`t8-sidebar-search-box flex items-center gap-2 px-2 py-1.5 ${
            isPixel
              ? 'px-input rounded-[10px]'
              : `rounded-md ${isDark ? 'bg-white/5' : 'bg-black/5'}`
          }`}
        >
          <Search size={14} className="opacity-60" />
          <input
            type="text"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="搜索节点..."
            className={`flex-1 bg-transparent outline-none text-xs ${
              isPixel
                ? ''
                : isDark
                  ? 'text-white placeholder:text-white/30'
                  : 'text-zinc-900 placeholder:text-zinc-400'
            }`}
          />
        </div>
      </div>

      {/* 节点分组列表 */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1 scrollbar-hide">
        {Object.entries(nodeGroups).map(([key, group]) => {
          const visible = filterNodes(group.nodes);
          if (visible.length === 0) return null;
          const isCollapsed = collapsed[key];
          return (
            <div key={key} className="mb-1">
              <button
                onClick={() => toggle(key)}
                className={`w-full flex items-center gap-1 px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wider ${
                  isPixel
                    ? 'px-group-title'
                    : isDark
                      ? 'text-white/50 hover:text-white/80'
                      : 'text-zinc-500 hover:text-zinc-800'
                }`}
              >
                {isCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                <span className="flex-1 text-left">{group.label}</span>
                <span className="opacity-60">{visible.length}</span>
              </button>
              {!isCollapsed && <div className="space-y-0.5 mt-0.5">{visible.map(renderNode)}</div>}
            </div>
          );
        })}
      </div>

      {/* 底部版本信息 */}
      {shareCanvas && (
        <CanvasShareModal
          canvas={canvases.find((canvas) => canvas.id === shareCanvas.id) || shareCanvas}
          isDark={isDark}
          isPixel={isPixel}
          onClose={() => setShareCanvas(null)}
          onSave={async (sharedWith) => {
            await updateCanvasShares(shareCanvas.id, sharedWith);
          }}
        />
      )}

      <div
        className={`px-3 py-2 border-t text-[10px] ${
          isPixel
            ? 'border-[#1A1410]/80'
            : isDark
              ? 'border-white/10 text-white/30'
              : 'border-black/10 text-zinc-400'
        }`}
      >
        {isPixel ? (
          <span className="px-chip px-chip--muted">T8 · v{__APP_VERSION__}</span>
        ) : (
          <>T8-penguin-canvas · v{__APP_VERSION__}</>
        )}
      </div>
    </div>
  );
}

interface CanvasShareModalProps {
  canvas: CanvasListItem;
  isDark: boolean;
  isPixel: boolean;
  onClose: () => void;
  onSave: (sharedWith: CanvasShareEntry[]) => Promise<void>;
}

function CanvasShareModal({ canvas, isDark, isPixel, onClose, onSave }: CanvasShareModalProps) {
  const [shares, setShares] = useState<CanvasShareEntry[]>(() => canvas.sharedWith || []);
  const [query, setQuery] = useState('');
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    setShares(canvas.sharedWith || []);
  }, [canvas.id, canvas.sharedWith]);

  useEffect(() => {
    let cancelled = false;
    setLoadingUsers(true);
    const timer = window.setTimeout(() => {
      api.searchUsers(query)
        .then((items) => {
          if (!cancelled) setUsers(items.filter((user) => user.id !== canvas.ownerUserId));
        })
        .catch((e) => {
          if (!cancelled) setMessage(e?.message || '读取用户失败');
        })
        .finally(() => {
          if (!cancelled) setLoadingUsers(false);
        });
    }, 220);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, canvas.ownerUserId]);

  const addUser = (user: AuthUser) => {
    if (shares.some((share) => share.userId === user.id)) return;
    setShares((prev) => [
      ...prev,
      {
        userId: user.id,
        username: user.username,
        name: user.name || user.username,
        role: user.role,
        permission: 'view',
        sharedAt: Date.now(),
        sharedByUserId: '',
      },
    ]);
  };

  const setPermission = (userId: string, permission: CanvasSharePermission) => {
    setShares((prev) => prev.map((share) => (share.userId === userId ? { ...share, permission } : share)));
  };

  const removeUser = (userId: string) => {
    setShares((prev) => prev.filter((share) => share.userId !== userId));
  };

  const save = async () => {
    setSaving(true);
    setMessage('');
    try {
      await onSave(shares);
      onClose();
    } catch (e: any) {
      setMessage(e?.message || '保存共享失败');
    } finally {
      setSaving(false);
    }
  };

  const modalCls = isPixel
    ? 'px-card'
    : `rounded-lg border shadow-2xl ${isDark ? 'bg-zinc-900 border-white/10 text-white' : 'bg-white border-black/10 text-zinc-900'}`;
  const inputCls = isPixel
    ? 'px-input'
    : `rounded-md border px-2 py-1.5 text-xs outline-none ${isDark ? 'bg-zinc-950 border-white/15 text-white' : 'bg-white border-black/15'}`;
  const btnCls = isPixel
    ? 'px-btn px-btn--sm'
    : `rounded-md px-2 py-1 text-xs font-semibold ${isDark ? 'bg-white/10 hover:bg-white/15' : 'bg-black/5 hover:bg-black/10'}`;
  const primaryBtnCls = isPixel
    ? 'px-btn px-btn--sm px-btn--mint'
    : 'rounded-md px-3 py-1.5 text-xs font-semibold bg-emerald-500 text-white hover:bg-emerald-400 disabled:opacity-60';

  return (
    <div
      className={`fixed inset-0 z-[80] flex items-center justify-center ${isPixel ? 'px-modal-mask' : 'bg-black/45'}`}
      data-canvas-floating-ui="canvas-share-modal"
      onMouseDown={onClose}
    >
      <div className={`${modalCls} w-[min(560px,calc(100vw-32px))] max-h-[82vh] overflow-hidden`} onMouseDown={(e) => e.stopPropagation()}>
        <div className={`flex items-center justify-between px-4 py-3 border-b ${isDark ? 'border-white/10' : 'border-black/10'}`}>
          <div className="min-w-0">
            <div className="text-sm font-semibold truncate">共享画布</div>
            <div className={`text-[11px] truncate ${isDark ? 'text-white/45' : 'text-zinc-500'}`}>{canvas.name}</div>
          </div>
          <button className={btnCls} onClick={onClose} type="button">
            <X size={14} />
          </button>
        </div>
        <div className="p-4 space-y-4 overflow-y-auto max-h-[68vh]">
          <div className="space-y-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索用户名、姓名或邮箱"
              className={`${inputCls} w-full`}
            />
            <div className={`rounded-md border ${isDark ? 'border-white/10' : 'border-black/10'} max-h-36 overflow-y-auto`}>
              {loadingUsers && <div className="px-3 py-2 text-xs opacity-60">搜索中...</div>}
              {!loadingUsers && users.length === 0 && <div className="px-3 py-2 text-xs opacity-60">没有可添加的用户</div>}
              {!loadingUsers && users.map((user) => {
                const exists = shares.some((share) => share.userId === user.id);
                return (
                  <button
                    type="button"
                    key={user.id}
                    disabled={exists}
                    className={`w-full flex items-center justify-between gap-3 px-3 py-2 text-left text-xs ${exists ? 'opacity-45 cursor-not-allowed' : isDark ? 'hover:bg-white/10' : 'hover:bg-black/5'}`}
                    onClick={() => addUser(user)}
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{user.name || user.username}</span>
                      <span className="block truncate opacity-55">{user.username} · {user.role}</span>
                    </span>
                    <Plus size={13} />
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-[11px] font-semibold opacity-65">已共享用户</div>
            {shares.length === 0 && <div className="text-xs opacity-55">还没有共享给其他用户</div>}
            {shares.map((share) => (
              <div key={share.userId} className={`flex items-center gap-2 rounded-md border px-3 py-2 ${isDark ? 'border-white/10 bg-white/5' : 'border-black/10 bg-black/[0.03]'}`}>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-semibold">{share.name || share.username}</div>
                  <div className="truncate text-[10px] opacity-55">{share.username} · {share.role}</div>
                </div>
                <select
                  value={share.permission}
                  onChange={(e) => setPermission(share.userId, e.target.value as CanvasSharePermission)}
                  className={inputCls}
                >
                  <option value="view">查看</option>
                  <option value="edit">编辑</option>
                </select>
                <button type="button" className={btnCls} onClick={() => removeUser(share.userId)} title="移除共享">
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>

          {message && <div className="rounded-md border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">{message}</div>}
        </div>
        <div className={`flex justify-end gap-2 px-4 py-3 border-t ${isDark ? 'border-white/10' : 'border-black/10'}`}>
          <button type="button" className={btnCls} onClick={onClose}>取消</button>
          <button type="button" className={primaryBtnCls} onClick={save} disabled={saving}>
            {saving ? '保存中...' : '保存共享'}
          </button>
        </div>
      </div>
    </div>
  );
}
