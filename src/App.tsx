import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { LogOut, Moon, Settings, Sun, Wifi, WifiOff, Sparkles, Cloud, ExternalLink, Copy, Check, Gift, Heart, Youtube, PlayCircle, Bell, Wand2, Globe, MessageCircle, CalendarDays, Rocket, Key, Library, Palette, Skull, Sailboat, Clock3, UserCog, BarChart3 } from 'lucide-react';
import { useThemeStore } from './stores/theme';
import { useApiKeysStore } from './stores/apiKeys';
import { useShortcutStore } from './stores/shortcuts';
import Sidebar from './components/Sidebar';
import GenerationHistoryDrawer from './components/GenerationHistoryDrawer';
import MaterialContextMenu from './components/MaterialContextMenu';
import UserManagementModal from './components/UserManagementModal';
import NotificationCenterModal from './components/NotificationCenterModal';
import ErrorBoundary from './components/ErrorBoundary';
import LoginScreen from './components/LoginScreen';
import type { AddNodeFn, InsertWorkflowFn } from './components/Canvas';
import AppUpdaterButton from './components/AppUpdaterButton';
import AchievementButton from './components/AchievementButton';
import AchievementDrawer from './components/AchievementDrawer';
import AchievementToast from './components/AchievementToast';
import AchievementTracker from './components/AchievementTracker';
import { RHToolsProvider } from './providers/RHToolsProvider';
import * as api from './services/api';
import type { AuthUser, SystemNotification } from './services/api';
import type { NodeType } from './types/canvas';
import type { ResourceItem } from './services/api';
import { applyThemeTemplate } from './theme/applyTheme';
import { resolveThemeTemplate } from './theme/defaultTemplates';
import { materialSetItemsToData, type MaterialSetKind, type MaterialSetItem } from './utils/materialSet';
import { workflowManifestToFragment } from './utils/workflowResource';
import { matchesAnyShortcut } from './utils/keyboardShortcuts';
import { portraitResourceToNodeData } from './utils/portraitResource';

const Canvas = lazy(() => import('./components/Canvas'));
const ImageEditorPage = lazy(() => import('./components/ImageEditorPage'));
const ApiSettingsModal = lazy(() => import('./components/ApiSettings'));
const ResourceLibraryDrawer = lazy(() => import('./components/ResourceLibraryDrawer'));
const ThemeTemplateManager = lazy(() => import('./components/ThemeTemplateManager'));
const DataMonitoringDashboard = lazy(() => import('./components/DataMonitoringDashboard'));

// vite.config 注入的编译期常量（与 package.json 同步），勿硬编码 v1.x.x
declare const __APP_VERSION__: string;

function isShortcutTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    target.isContentEditable ||
    Boolean(target.closest('[contenteditable="true"]'))
  );
}

function poseBackupToNodeData(value: unknown): Record<string, any> | null {
  const raw = value && typeof value === 'object' ? (value as Record<string, any>) : null;
  const backup = raw?.schema === 't8-pose-master-resource' ? raw.poseBackup : raw;
  if (!backup || typeof backup !== 'object' || (backup as any).schema !== 't8-pose-master') return null;
  const pose = backup as Record<string, any>;
  const people = Array.isArray(pose.people)
    ? pose.people
    : pose.hasPeople === false
      ? []
      : pose.points
        ? [pose.points]
        : [];
  const prompt = typeof pose.prompt === 'string' ? pose.prompt : '';
  return {
    kind: 'pose-master',
    posePoints: pose.points,
    posePointVersion: Number(pose.pointVersion) || 4,
    poseHasPeople: pose.hasPeople !== false,
    posePeople: people,
    poseActivePersonIndex: 0,
    poseHandControls: pose.handControls,
    posePresetId: typeof pose.presetId === 'string' ? pose.presetId : 'standing',
    poseViewId: typeof pose.viewId === 'string' ? pose.viewId : 'front',
    poseShotId: typeof pose.shotId === 'string' ? pose.shotId : 'full-body',
    poseIntensityId: typeof pose.intensityId === 'string' ? pose.intensityId : 'natural',
    poseLanguage: pose.language === 'zh' ? 'zh' : 'en',
    poseCustomText: typeof pose.custom === 'string' ? pose.custom : '',
    poseCanvasRatioId: typeof pose.canvasRatioId === 'string' ? pose.canvasRatioId : 'default',
    poseCanvasCustomWidth: Number(pose.canvasCustomWidth) || 620,
    poseCanvasCustomHeight: Number(pose.canvasCustomHeight) || 520,
    prompt,
    text: prompt,
    outputText: prompt,
    posePrompt: prompt,
    metadata: {
      schema: 't8-pose-master',
      resourceRestoredAt: Date.now(),
      sourceName: typeof pose.name === 'string' ? pose.name : '',
    },
  };
}

async function poseResourceToNodeData(item: ResourceItem): Promise<Record<string, any> | null> {
  if (item.kind !== 'pose' || !item.fileUrl) return null;
  const res = await fetch(item.fileUrl);
  if (!res.ok) throw new Error(`读取姿势资源失败: HTTP ${res.status}`);
  return poseBackupToNodeData(await res.json());
}

async function workflowResourceToFragment(item: ResourceItem) {
  if (item.kind !== 'workflow' || !item.fileUrl) return null;
  const res = await fetch(item.fileUrl);
  if (!res.ok) throw new Error(`读取工作流资源失败: HTTP ${res.status}`);
  return workflowManifestToFragment(await res.json());
}

function InfiniteCanvasBootLoading() {
  return (
    <div className="t8-boot-screen" role="status" aria-label="正在打开画布工作台">
      <img className="t8-boot-art" src="/infinite-canvas-loading.png" alt="" aria-hidden="true" />
      <div className="t8-boot-progress-shell" aria-hidden="true">
        <span className="t8-boot-progress-label">正在启动...</span>
        <div className="t8-boot-progress-track">
          <span className="t8-boot-progress-fill" />
          <span className="t8-boot-progress-spark" />
        </div>
        <span className="t8-boot-progress-percent">Loading</span>
      </div>
    </div>
  );
}

/**
 * T8-penguin-canvas 应用根组件 (Phase 1)
 * 布局: [侧边栏(画布管理 + 节点列表)] [画布主体] + 头部状态栏
 */
function App() {
  const { theme, style, templateId, customTemplates, toggleTheme, loadCustomTemplates } = useThemeStore();
  const { load: loadSettings } = useApiKeysStore();
  const shortcuts = useShortcutStore((s) => s.shortcuts);
  const currentTemplate = useMemo(
    () => resolveThemeTemplate(templateId, customTemplates),
    [templateId, customTemplates],
  );
  const [backendStatus, setBackendStatus] = useState<'checking' | 'ok' | 'error'>('checking');
  const backendFailureCountRef = useRef(0);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [resourceOpen, setResourceOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [themeManagerOpen, setThemeManagerOpen] = useState(false);
  const [userManagementOpen, setUserManagementOpen] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [monitoringOpen, setMonitoringOpen] = useState(false);
  const [notificationUnreadCount, setNotificationUnreadCount] = useState(0);
  const [appPath, setAppPath] = useState(() => window.location.pathname);
  // 画布接收节点添加的 ref(从 Sidebar -> Canvas)
  const addNodeRef = useRef<AddNodeFn | null>(null);
  const insertWorkflowRef = useRef<InsertWorkflowFn | null>(null);

  useEffect(() => {
    const onPopState = () => setAppPath(window.location.pathname);
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const navigateApp = (path: string) => {
    if (window.location.pathname !== path) window.history.pushState({}, '', path);
    setAppPath(path);
  };


  useEffect(() => {
    const hasOpenTopSurface = resourceOpen || historyOpen;
    if (!hasOpenTopSurface) return;

    const onDocPointerDown = (e: PointerEvent) => {
      const target = e.target;
      if (!(target instanceof HTMLElement)) return;
      if (
        target.closest('.t8-topbar') ||
        target.closest('.resource-library-drawer') ||
        target.closest('.generation-history-drawer') ||
        target.closest('[data-canvas-floating-ui]') ||
        target.closest('.react-flow__node') ||
        target.closest('.react-flow__edge') ||
        target.closest('.react-flow__controls') ||
        target.closest('.react-flow__minimap') ||
        target.closest('.t8-control-rail')
      ) {
        return;
      }

      setResourceOpen(false);
      setHistoryOpen(false);
    };

    document.addEventListener('pointerdown', onDocPointerDown, true);
    return () => {
      document.removeEventListener('pointerdown', onDocPointerDown, true);
    };
  }, [resourceOpen, historyOpen]);

  // 将主题状态注入 <html> 供 CSS 选择器使用
  useEffect(() => {
    const root = document.documentElement;
    applyThemeTemplate(currentTemplate, theme);
    // 全局禁用拼写检查(节点提示词为中文/@变量语法,不需红色波浪线干扰)
    // spellcheck 属性 HTML 标准上是可继承的 → 根上设一次,所有后代 textarea/input 都生效
    root.setAttribute('spellcheck', 'false');
    document.body.setAttribute('spellcheck', 'false');
  }, [currentTemplate, theme]);

  // 全局 MutationObserver: 为动态挂载的 textarea / input 自动设置 spellcheck=false
  // (Chromium 对 textarea 默认 spellcheck=true,不会从祖先继承 → 需逐个设置)
  //
  // 同时：全局为所有 textarea / input / select 添加 `nodrag` + `nowheel` className
  // — xyflow v12 识别 `nodrag` 后不触发节点拖动，避免「框选文字时整个节点跟着鼠标走」
  // — `nowheel` 让 textarea 内部可独立滚轮滚动，不被 xyflow 接管为画布缩放
  // — 不覆盖节点原有 className(classList.add 只追加)，零侵入
  useEffect(() => {
    const apply = (el: Element) => {
      const tag = el.tagName;
      if (tag === 'TEXTAREA' || tag === 'INPUT' || tag === 'SELECT') {
        if (tag !== 'SELECT') {
          el.setAttribute('spellcheck', 'false');
          el.setAttribute('autocorrect', 'off');
          el.setAttribute('autocapitalize', 'off');
        }
        // xyflow noDragClassName / noWheelClassName 默认 'nodrag' / 'nowheel'
        // 加上后该元素上的 pointerdown 不会被 xyflow 当作节点拖拽启动
        el.classList.add('nodrag', 'nowheel');
      }
    };
    // 初始扫描
    document.querySelectorAll('textarea, input, select').forEach(apply);
    // 增量监听
    const mo = new MutationObserver((muts) => {
      for (const m of muts) {
        m.addedNodes.forEach((n) => {
          if (n.nodeType !== 1) return;
          const el = n as Element;
          apply(el);
          el.querySelectorAll?.('textarea, input, select').forEach(apply);
        });
      }
    });
    mo.observe(document.body, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, []);

  // 启动探测后端
  useEffect(() => {
    const check = async () => {
      const ok = await api.checkBackendStatus();
      if (ok) {
        backendFailureCountRef.current = 0;
        setBackendStatus('ok');
        return;
      }
      backendFailureCountRef.current += 1;
      if (backendFailureCountRef.current >= 2) setBackendStatus('error');
    };
    check();
    const t = window.setInterval(check, 15_000);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('sso_token')) {
      setAuthLoading(false);
      return;
    }
    api.getCurrentUser()
      .then((user) => setAuthUser(user))
      .finally(() => setAuthLoading(false));
  }, []);

  // 预加载 settings
  useEffect(() => {
    if (!authUser) return;
    loadSettings();
    loadCustomTemplates();
  }, [authUser, loadSettings, loadCustomTemplates]);

  useEffect(() => {
    if (!authUser?.id) return;
    let lastInteractionAt = Date.now();
    const markInteraction = () => { lastInteractionAt = Date.now(); };
    const isEffectivelyActive = () => (
      document.visibilityState === 'visible' &&
      document.hasFocus() &&
      Date.now() - lastInteractionAt <= 5 * 60 * 1000
    );
    const heartbeat = (keepalive = false) => {
      if (!isEffectivelyActive()) return;
      void api.sendMonitoringHeartbeat(keepalive).catch(() => {});
    };
    const onFocus = () => { markInteraction(); heartbeat(); };
    const onVisibility = () => { if (document.visibilityState === 'visible') onFocus(); };
    const onPageHide = () => heartbeat(true);
    const activityEvents: Array<keyof WindowEventMap> = ['pointerdown', 'keydown', 'wheel', 'touchstart'];
    activityEvents.forEach((eventName) => window.addEventListener(eventName, markInteraction, { passive: true }));
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);
    heartbeat();
    const timer = window.setInterval(() => heartbeat(), 30_000);
    return () => {
      window.clearInterval(timer);
      activityEvents.forEach((eventName) => window.removeEventListener(eventName, markInteraction));
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
    };
  }, [authUser?.id]);

  useEffect(() => {
    if (!authUser?.id) return;
    let cancelled = false;
    api.getNotifications()
      .then((items) => {
        if (cancelled) return;
        const unreadCount = items.filter((item) => item.status === 'active' && !item.read).length;
        setNotificationUnreadCount(unreadCount);
        if (unreadCount > 0) setNotificationOpen(true);
      })
      .catch((error) => {
        console.warn('[notifications] 读取通知失败:', error);
      });
    return () => {
      cancelled = true;
    };
  }, [authUser?.id]);

  // 资源库快捷键：未选中任何节点时打开 / 关闭资源库。输入框内不拦截，避免打断提示词编辑。
  useEffect(() => {
    if (!authUser) return;
    const onKey = (e: KeyboardEvent) => {
      if (!matchesAnyShortcut(shortcuts['global.resource-library'], e)) return;
      if (e.repeat) return;
      if (isShortcutTypingTarget(e.target)) return;
      if (document.querySelector('.react-flow__node.selected')) return;
      e.preventDefault();
      setResourceOpen((open) => !open);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [authUser, shortcuts]);

  const isDark = theme === 'dark';
  const isPixel = style === 'pixel';
  const isOp = currentTemplate.visuals?.style === 'op';
  const isRh = currentTemplate.visuals?.style === 'rh';
  const isNaruto = currentTemplate.visuals?.style === 'naruto';
  const isEva = currentTemplate.visuals?.style === 'eva';
  const isYyh = currentTemplate.visuals?.style === 'yyh';
  const isSlamdunk = currentTemplate.visuals?.style === 'slamdunk';
  const isSoccer = currentTemplate.visuals?.style === 'soccer-hero';
  const isDragonBall = currentTemplate.visuals?.style === 'dragon-ball';
  const canManageSettings = authUser?.role === 'admin' || authUser?.role === 'manager';
  const canViewMonitoring = authUser?.role === 'admin';
  const visibleNodeTypes = authUser?.permissions?.visibleNodeTypes;
  const allowedNodeTypes = authUser?.permissions?.allowedNodeTypes;
  const exhibitionCompactForm = authUser?.permissions?.exhibitionCompactForm;
  const imageEditorVisible = !visibleNodeTypes
    || (visibleNodeTypes.includes('prompt-reverse') && visibleNodeTypes.includes('image'));
  const imageEditorAvailable = !allowedNodeTypes
    || (allowedNodeTypes.includes('prompt-reverse') && allowedNodeTypes.includes('image'));
  const imageEditorRoute = appPath === '/image-editor' || appPath.startsWith('/image-editor/');

  const handleLogout = async () => {
    await api.logout().catch(() => {});
    setAuthUser(null);
  };

  const refreshAuthUser = async () => {
    const user = await api.getCurrentUser();
    if (user) setAuthUser(user);
  };

  const handleNotificationsChanged = (items: SystemNotification[]) => {
    setNotificationUnreadCount(items.filter((item) => item.status === 'active' && !item.read).length);
  };

  const handleAddNode = (type: NodeType) => {
    addNodeRef.current?.(type);
  };

  const handleInsertResource = async (item: ResourceItem) => {
    const portraitData = portraitResourceToNodeData(item);
    if (portraitData) {
      addNodeRef.current?.('portrait-master', { data: portraitData });
      void api.updateResourceItem(item.id, { touch: true });
      return;
    }
    if (item.kind === 'pose') {
      const poseData = await poseResourceToNodeData(item);
      if (!poseData) throw new Error('姿势资源格式无效');
      addNodeRef.current?.('pose-master', { data: poseData });
      void api.updateResourceItem(item.id, { touch: true });
      return;
    }
    if (item.kind === 'workflow') {
      const fragment = await workflowResourceToFragment(item);
      if (!fragment) throw new Error('工作流资源格式无效');
      insertWorkflowRef.current?.(fragment, { title: item.title || '工作流' });
      void api.updateResourceItem(item.id, { touch: true });
      return;
    }
    if (item.kind === 'set' && item.materialSetKind && item.materialSetItems?.length) {
      addNodeRef.current?.('material-set', {
        data: materialSetItemsToData(
          item.materialSetKind as MaterialSetKind,
          item.materialSetItems as MaterialSetItem[],
        ),
      });
      return;
    }
    const mediaKind = item.kind === 'panorama' ? 'image' : item.kind;
    const data: Record<string, any> = {
      uploadType: mediaKind,
      fileName: item.title || item.originalName || '资源库素材',
      fileSize: item.size || 0,
      mime: item.mime || '',
    };
    if (mediaKind === 'image') {
      data.imageUrl = item.fileUrl;
    } else if (mediaKind === 'video') {
      data.videoUrl = item.fileUrl;
    } else if (mediaKind === 'audio') {
      data.audioUrl = item.fileUrl;
    }
    addNodeRef.current?.('upload', { data });
  };

  if (authLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-[#0b1120] text-white text-sm">
        正在检查登录状态...
      </div>
    );
  }

  if (!authUser) {
    return <LoginScreen onAuthenticated={setAuthUser} />;
  }

  return (
    <RHToolsProvider>
    <AchievementTracker />
    <div
      className={`t8-app-shell h-screen flex flex-col overflow-hidden ${
        isPixel ? '' : isDark ? 'bg-zinc-950 text-white' : 'bg-zinc-50 text-zinc-900'
      } ${isOp ? 't8-app-shell--op' : ''} ${isRh ? 't8-app-shell--rh' : ''} ${isNaruto ? 't8-app-shell--naruto' : ''} ${isEva ? 't8-app-shell--eva' : ''} ${isYyh ? 't8-app-shell--yyh' : ''} ${isSlamdunk ? 't8-app-shell--slamdunk' : ''} ${isSoccer ? 't8-app-shell--soccer' : ''} ${isDragonBall ? 't8-app-shell--dragon-ball' : ''}`}
      style={{ background: 'var(--t8-bg-app)', color: 'var(--t8-text-main)' }}
    >
      {/* 头部状态栏 */}
      <header
        className={`t8-topbar flex items-center justify-between px-4 py-2 border-b ${
          isPixel
            ? 'px-panel'
            : isDark
              ? 'bg-zinc-900 border-white/10'
              : 'bg-white border-black/10'
        }`}
      >
        <div className="flex items-center gap-3">
          {isOp ? (
            <div className="t8-op-brand flex items-center gap-2">
              <span className="t8-op-brand__mark">
                <Skull size={16} />
              </span>
              <div className="min-w-0">
                <h1 className="t8-op-brand__title text-[14px] font-black leading-none">
                  ONE PIECE · 百达的无限画布
                </h1>
                <div className="t8-op-brand__sub text-[9px] font-bold tracking-wide leading-none mt-0.5">
                  GRAND LINE CANVAS
                </div>
              </div>
              <Sailboat className="t8-op-brand__ship" size={15} />
            </div>
          ) : isRh ? (
            <div className="t8-rh-brand flex items-center gap-2">
              <span className="t8-rh-brand__mark">
                <Cloud size={16} />
              </span>
              <div className="min-w-0">
                <h1 className="t8-rh-brand__title text-[14px] font-black leading-none">
                  RH · 百达的无限画布
                </h1>
                <div className="t8-rh-brand__sub text-[9px] font-bold tracking-wide leading-none mt-0.5">
                  RUNNINGHUB WORKSPACE
                </div>
              </div>
            </div>
          ) : isNaruto ? (
            <div className="t8-naruto-brand flex items-center gap-2">
              <span className="t8-naruto-brand__mark" aria-hidden="true">
                <span className="t8-naruto-brand__leaf" />
              </span>
              <div className="min-w-0">
                <h1 className="t8-naruto-brand__title text-[14px] font-black leading-none">
                  火影 · 百达的无限画布
                </h1>
                <div className="t8-naruto-brand__sub text-[9px] font-bold tracking-wide leading-none mt-0.5">
                  SHINOBI CHAKRA CANVAS
                </div>
              </div>
            </div>
          ) : isEva ? (
            <div className="t8-eva-brand flex items-center gap-2">
              <span className="t8-eva-brand__mark" aria-hidden="true">
                <span className="t8-eva-brand__core" />
              </span>
              <div className="min-w-0">
                <h1 className="t8-eva-brand__title text-[14px] font-black leading-none">
                  EVA · 百达的无限画布
                </h1>
                <div className="t8-eva-brand__sub text-[9px] font-bold tracking-wide leading-none mt-0.5">
                  NERV HQ - TOKYO-3 / MAGI SYSTEM ONLINE
                </div>
              </div>
              <span className="t8-eva-brand__sync" aria-hidden="true">SYSTEM STATUS: ONLINE</span>
            </div>
          ) : isYyh ? (
            <div className="t8-yyh-brand flex items-center gap-2">
              <span className="t8-yyh-brand__mark" aria-hidden="true">
                <Sparkles size={16} />
              </span>
              <div className="min-w-0">
                <h1 className="t8-yyh-brand__title text-[14px] font-black leading-none">
                  幽游白书 · 百达的无限画布
                </h1>
                <div className="t8-yyh-brand__sub text-[9px] font-bold tracking-wide leading-none mt-0.5">
                  SPIRIT DETECTIVE CANVAS / REI MAP ONLINE
                </div>
              </div>
              <span className="t8-yyh-brand__status" aria-hidden="true">REI GUN READY</span>
            </div>
          ) : isSlamdunk ? (
            <div className="t8-slamdunk-brand flex items-center gap-2">
              <span className="t8-slamdunk-brand__mark" aria-hidden="true">
                <span className="t8-slamdunk-brand__ball" />
              </span>
              <div className="min-w-0">
                <h1 className="t8-slamdunk-brand__title text-[14px] font-black leading-none">
                  灌篮高手 · 百达的无限画布
                </h1>
                <div className="t8-slamdunk-brand__sub text-[9px] font-bold tracking-wide leading-none mt-0.5">
                  FULL COURT CANVAS / BUZZER BEATER READY
                </div>
              </div>
              <span className="t8-slamdunk-brand__score" aria-hidden="true">T8 10 : 08 AI</span>
            </div>
          ) : isSoccer ? (
            <div className="t8-soccer-brand flex items-center gap-2">
              <span className="t8-soccer-brand__mark" aria-hidden="true">
                <span className="t8-soccer-brand__jersey" />
              </span>
              <div className="min-w-0">
                <h1 className="t8-soccer-brand__title text-[14px] font-black leading-none">
                  足球小将 · 百达的无限画布
                </h1>
                <div className="t8-soccer-brand__sub text-[9px] font-bold tracking-wide leading-none mt-0.5">
                  CAPTAIN TSUBASA CANVAS / GOLDEN GOAL READY
                </div>
              </div>
              <span className="t8-soccer-brand__score" aria-hidden="true">Japan 3:2 Brazil</span>
            </div>
          ) : isDragonBall ? (
            <div className="t8-dragonball-brand flex items-center gap-2">
              <span className="t8-dragonball-brand__mark" aria-hidden="true">
                <span className="t8-dragonball-brand__orb" />
              </span>
              <div className="min-w-0">
                <h1 className="t8-dragonball-brand__title text-[14px] font-black leading-none">
                  七龙珠 · 百达的无限画布
                </h1>
                <div className="t8-dragonball-brand__sub text-[9px] font-bold tracking-wide leading-none mt-0.5">
                  CAPSULE CORP CANVAS / DRAGON RADAR ONLINE
                </div>
              </div>
              <span className="t8-dragonball-brand__stars" aria-hidden="true">
                <span />
                <span />
                <span />
                <span />
                <span />
                <span />
                <span />
              </span>
            </div>
          ) : isPixel ? (
            <>
              <h1 className="px-title text-[14px] font-bold tracking-wide leading-none">
                百达的无限画布
              </h1>
            </>
          ) : (
            <h1 className="text-sm font-semibold">百达的无限画布</h1>
          )}
          <span
            className={
              isPixel
                ? 'px-chip px-chip--mint text-[10px]'
                : `t8-topbar-status-chip text-[10px] px-1.5 py-0.5 rounded ${
                    isDark ? 'bg-white/10 text-white/60' : 'bg-black/5 text-zinc-500'
                  }`
            }
          >
            v{__APP_VERSION__}
          </span>
          {/* 后端状态 */}
          {isPixel ? (
            <span
              className={`px-chip ${
                backendStatus === 'ok'
                  ? 'px-chip--mint'
                  : backendStatus === 'error'
                    ? 'px-chip--pink'
                    : 'px-chip--yellow'
              }`}
            >
              {backendStatus === 'ok' ? <Wifi size={11} /> : <WifiOff size={11} />}
              {backendStatus === 'ok' && '后端已连接'}
              {backendStatus === 'error' && '后端未连接'}
              {backendStatus === 'checking' && '检测中...'}
            </span>
          ) : (
            <div
              className={`t8-topbar-status-chip flex items-center gap-1.5 text-[11px] ${
                backendStatus === 'ok'
                  ? 'text-emerald-400'
                  : backendStatus === 'error'
                    ? 'text-red-400'
                    : 'text-yellow-400'
              }`}
            >
              {backendStatus === 'ok' ? <Wifi size={12} /> : <WifiOff size={12} />}
              {backendStatus === 'ok' && '后端已连接'}
              {backendStatus === 'error' && '后端未连接'}
              {backendStatus === 'checking' && '检测中...'}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1">
          {imageEditorVisible && (
            <button
              type="button"
              onClick={() => navigateApp('/image-editor')}
              disabled={!imageEditorAvailable}
              className={
                isPixel
                  ? 'px-btn px-btn--sm px-btn--mint'
                  : `flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors border disabled:cursor-not-allowed disabled:opacity-40 ${
                      imageEditorRoute
                        ? isDark
                          ? 'bg-emerald-500/25 border-emerald-400/55 text-emerald-200'
                          : 'bg-emerald-100 border-emerald-400 text-emerald-800'
                        : isDark
                          ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/20'
                          : 'bg-emerald-50 border-emerald-300 text-emerald-700 hover:bg-emerald-100'
                    }`
              }
              title={imageEditorAvailable ? '打开网页版改图' : '需要提示词反推与图像节点权限'}
            >
              <Wand2 size={14} />
              <span className="text-[11px]">网页版改图</span>
            </button>
          )}
          {/* 主题模板 */}
          <button
            onClick={() => setThemeManagerOpen(true)}
            className={
              isPixel
                ? 'px-btn px-btn--sm px-btn--pink max-w-[150px]'
                : `flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors border ${
                    isDark
                      ? 'bg-sky-500/10 border-sky-500/30 text-sky-300 hover:bg-sky-500/20'
                      : 'bg-sky-50 border-sky-300 text-sky-700 hover:bg-sky-100'
                  }`
            }
            title="主题模板"
          >
            <Palette size={14} />
            <span className="text-[11px] truncate">{currentTemplate.name}</span>
          </button>
          <AchievementButton isPixel={isPixel} isDark={isDark} />
          <button
            onClick={() => setResourceOpen(true)}
            className={
              isPixel
                ? 'px-btn px-btn--sm px-btn--mint'
                : `flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors border ${
                    isDark
                      ? 'bg-fuchsia-500/10 border-fuchsia-500/30 text-fuchsia-300 hover:bg-fuchsia-500/20'
                      : 'bg-fuchsia-50 border-fuchsia-300 text-fuchsia-700 hover:bg-fuchsia-100'
                  }`
            }
            title="资源库"
          >
            <Library size={14} />
            <span className="text-[11px]">资源库</span>
          </button>
          <AppUpdaterButton isPixel={isPixel} isDark={isDark} />
          <button
            onClick={() => setHistoryOpen(true)}
            className={
              isPixel
                ? 'px-btn px-btn--sm px-btn--yellow'
                : `flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors border ${
                    isDark
                      ? 'bg-amber-500/10 border-amber-500/30 text-amber-300 hover:bg-amber-500/20'
                      : 'bg-amber-50 border-amber-300 text-amber-700 hover:bg-amber-100'
                  }`
            }
            title="历史生成"
          >
            <Clock3 size={14} />
            <span className="text-[11px]">历史生成</span>
          </button>
          {canManageSettings && (
          <button
            onClick={() => setUserManagementOpen(true)}
            className={
              isPixel
                ? 'px-btn px-btn--icon px-btn--ghost'
                : `p-2 rounded-md ${isDark ? 'hover:bg-white/10' : 'hover:bg-black/5'}`
            }
            title="用户管理"
          >
            <UserCog size={isPixel ? 14 : 16} />
          </button>
          )}
          {canViewMonitoring && (
          <button
            onClick={() => setMonitoringOpen(true)}
            className={
              isPixel
                ? 'px-btn px-btn--icon px-btn--ghost'
                : `p-2 rounded-md ${isDark ? 'hover:bg-cyan-500/15 text-cyan-300' : 'hover:bg-cyan-50 text-cyan-700'}`
            }
            title="数据监控"
          >
            <BarChart3 size={isPixel ? 14 : 16} />
          </button>
          )}
          {canManageSettings && (
          <button
            onClick={() => setSettingsOpen(true)}
            className={
              isPixel
                ? 'px-btn px-btn--icon px-btn--ghost'
                : `p-2 rounded-md ${isDark ? 'hover:bg-white/10' : 'hover:bg-black/5'}`
            }
            title="API 设置"
          >
            <Settings size={isPixel ? 14 : 16} />
          </button>
          )}
          <button
            onClick={() => setNotificationOpen(true)}
            className={
              isPixel
                ? 'px-btn px-btn--icon px-btn--ghost relative'
                : `relative p-2 rounded-md ${isDark ? 'hover:bg-white/10' : 'hover:bg-black/5'}`
            }
            title={notificationUnreadCount > 0 ? `系统通知（${notificationUnreadCount} 条未读）` : '系统通知'}
          >
            <Bell size={isPixel ? 14 : 16} />
            {notificationUnreadCount > 0 && (
              <span className="absolute -right-1 -top-1 flex min-w-4 h-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold leading-none text-white">
                {notificationUnreadCount > 99 ? '99+' : notificationUnreadCount}
              </span>
            )}
          </button>
          <button
            onClick={toggleTheme}
            className={
              isPixel
                ? 'px-btn px-btn--icon px-btn--ghost'
                : `p-2 rounded-md ${isDark ? 'hover:bg-white/10' : 'hover:bg-black/5'}`
            }
            title={`切换到${isDark ? '浅色' : '深色'}主题`}
          >
            {isDark ? <Sun size={isPixel ? 14 : 16} /> : <Moon size={isPixel ? 14 : 16} />}
          </button>
          <div
            className={
              isPixel
                ? 'px-chip'
                : `hidden sm:flex flex-col leading-none px-2 py-1 rounded-md border ${
                    isDark ? 'border-white/10 bg-white/5' : 'border-black/10 bg-black/[0.03]'
                  }`
            }
            title={`${authUser.name || authUser.username} · ${authUser.role}`}
          >
            <span className="text-[11px] font-semibold max-w-[120px] truncate">{authUser.name || authUser.username}</span>
            <span className="text-[9px] opacity-60">{authUser.role}</span>
          </div>
          <button
            onClick={handleLogout}
            className={
              isPixel
                ? 'px-btn px-btn--icon px-btn--ghost'
                : `p-2 rounded-md ${isDark ? 'hover:bg-white/10 text-white/75' : 'hover:bg-black/5 text-zinc-600'}`
            }
            title="退出登录"
          >
            <LogOut size={isPixel ? 14 : 16} />
          </button>
        </div>
      </header>

      {/* 主体两栏布局 */}
      <div className="flex-1 flex overflow-hidden">
        {imageEditorRoute ? (
          imageEditorAvailable ? (
            <ErrorBoundary fallbackTitle="网页版改图渲染出错了，已被错误边界捕获">
              <Suspense fallback={<InfiniteCanvasBootLoading />}>
                <ImageEditorPage user={authUser} onBack={() => navigateApp('/')} />
              </Suspense>
            </ErrorBoundary>
          ) : (
            <div className="flex flex-1 items-center justify-center p-6">
              <div className="max-w-md rounded-xl border border-amber-400/30 bg-amber-500/10 p-6 text-center">
                <div className="font-semibold">当前账号没有网页版改图权限</div>
                <div className="mt-2 text-xs opacity-65">需要同时开放“提示词反推”和“图像”节点。</div>
                <button type="button" onClick={() => navigateApp('/')} className="mt-4 rounded-lg bg-amber-500 px-4 py-2 text-xs font-bold text-black">返回无限画布</button>
              </div>
            </div>
          )
        ) : (
          <>
            <Sidebar
              onAddNode={handleAddNode}
              visibleNodeTypes={visibleNodeTypes}
              currentUserId={authUser.id}
            />
            <ErrorBoundary fallbackTitle="画布渲染出错了，已被错误边界捕获">
              <Suspense fallback={<InfiniteCanvasBootLoading />}>
                <Canvas
                  onAddNodeRef={addNodeRef}
                  onInsertWorkflowRef={insertWorkflowRef}
                  currentUserId={authUser.id}
                  allowedNodeTypes={allowedNodeTypes}
                  exhibitionCompactForm={exhibitionCompactForm}
                  canEditExhibitionCompactForm={canManageSettings}
                  onExhibitionCompactFormChanged={refreshAuthUser}
                />
              </Suspense>
            </ErrorBoundary>
          </>
        )}
      </div>

      {/* API 设置弹窗 */}
      {canManageSettings && (
        <UserManagementModal
          open={userManagementOpen}
          onClose={() => setUserManagementOpen(false)}
          onPermissionsChanged={refreshAuthUser}
        />
      )}
      <NotificationCenterModal
        open={notificationOpen}
        canManage={canManageSettings}
        onClose={() => setNotificationOpen(false)}
        onNotificationsChanged={handleNotificationsChanged}
      />
      <Suspense fallback={null}>
        {canManageSettings && settingsOpen && <ApiSettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />}
        {themeManagerOpen && (
          <ThemeTemplateManager open={themeManagerOpen} onClose={() => setThemeManagerOpen(false)} />
        )}
        {resourceOpen && (
          <ResourceLibraryDrawer
            open={resourceOpen}
            onClose={() => setResourceOpen(false)}
            onInsertMaterial={handleInsertResource}
            userRole={authUser.role}
          />
        )}
        {historyOpen && (
          <GenerationHistoryDrawer
            open={historyOpen}
            onClose={() => setHistoryOpen(false)}
            userRole={authUser.role}
          />
        )}
        {canViewMonitoring && monitoringOpen && (
          <DataMonitoringDashboard open={monitoringOpen} onClose={() => setMonitoringOpen(false)} />
        )}
      </Suspense>
      <MaterialContextMenu userRole={authUser.role} />
      <AchievementDrawer />
      <AchievementToast />
    </div>
    </RHToolsProvider>
  );
}

export default App;
