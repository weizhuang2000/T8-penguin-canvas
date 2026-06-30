import { useEffect, useMemo, useState } from 'react';
import { Check, Loader2, Search, Shield, UserCog, X } from 'lucide-react';
import { NODE_GROUPS, NODE_REGISTRY } from '../config/nodeRegistry';
import {
  defaultExhibitionCompactForm,
  EXHIBITION_COMPACT_FORM_DEFINITIONS,
  getExhibitionCompactSectionItems,
  normalizeExhibitionCompactFormConfig,
} from '../config/exhibitionCompactForm';
import * as api from '../services/api';
import type { AuthUser, ToolPermissionRule, ToolPermissionsConfig } from '../services/api';
import type { NodeType } from '../types/canvas';
import { useThemeStore } from '../stores/theme';

interface UserManagementModalProps {
  open: boolean;
  onClose: () => void;
  onPermissionsChanged?: () => Promise<void> | void;
}

const ROLE_OPTIONS = ['designer', 'pm', 'manager', 'admin'];

function defaultRule(): ToolPermissionRule {
  return { mode: 'inherit', allowedNodeTypes: [], deniedNodeTypes: [] };
}

function customRule(types: string[]): ToolPermissionRule {
  return { mode: 'custom', allowedNodeTypes: types, deniedNodeTypes: [] };
}

function uniqueTypes(types: string[]) {
  const allowed = new Set(NODE_REGISTRY.map((node) => node.type));
  return Array.from(new Set(types.filter((type) => allowed.has(type as NodeType))));
}

function resolvedTypes(rule: ToolPermissionRule | undefined, inherited: string[]) {
  if (!rule || rule.mode !== 'custom') return inherited;
  const denied = new Set(rule.deniedNodeTypes || []);
  return uniqueTypes((rule.allowedNodeTypes?.length ? rule.allowedNodeTypes : inherited).filter((type) => !denied.has(type)));
}

function toggleType(rule: ToolPermissionRule | undefined, inherited: string[], type: string) {
  const current = new Set(resolvedTypes(rule, inherited));
  if (current.has(type)) current.delete(type);
  else current.add(type);
  return customRule(Array.from(current));
}

function applyGroup(rule: ToolPermissionRule | undefined, inherited: string[], groupTypes: string[], checked: boolean) {
  const current = new Set(resolvedTypes(rule, inherited));
  groupTypes.forEach((type) => {
    if (checked) current.add(type);
    else current.delete(type);
  });
  return customRule(Array.from(current));
}

export default function UserManagementModal({ open, onClose, onPermissionsChanged }: UserManagementModalProps) {
  const { theme, style } = useThemeStore();
  const isDark = theme === 'dark';
  const isPixel = style === 'pixel';
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [query, setQuery] = useState('');
  const [config, setConfig] = useState<ToolPermissionsConfig | null>(null);
  const [activeMode, setActiveMode] = useState<'role' | 'user' | 'compact'>('role');
  const [activeRole, setActiveRole] = useState('designer');
  const [activeUserId, setActiveUserId] = useState('');

  const users = config?.users || [];
  const activeUser = users.find((user) => user.id === activeUserId) || users[0] || null;
  const defaultTypes = config?.defaultVisibleNodeTypes || [];
  const inheritedForUser = activeUser ? resolvedTypes(config?.roleRules?.[activeUser.role], defaultTypes) : defaultTypes;
  const editingRule = activeMode === 'role'
    ? config?.roleRules?.[activeRole]
    : activeUser
      ? config?.userRules?.[activeUser.id]
      : undefined;
  const inheritedTypes = activeMode === 'role' ? defaultTypes : inheritedForUser;
  const activeTypes = resolvedTypes(editingRule, inheritedTypes);
  const activeTypeSet = useMemo(() => new Set(activeTypes), [activeTypes]);
  const compactConfig = normalizeExhibitionCompactFormConfig(config?.exhibitionCompactForm);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setMessage('');
    api.getToolPermissions(query)
      .then((data) => {
        if (cancelled) return;
        setConfig(data);
        if (!activeUserId && data.users?.[0]) setActiveUserId(data.users[0].id);
      })
      .catch((e) => {
        if (!cancelled) setMessage(e?.message || '读取用户权限失败');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, query]);

  if (!open) return null;

  const patchRule = (nextRule: ToolPermissionRule) => {
    if (!config) return;
    if (activeMode === 'role') {
      setConfig({ ...config, roleRules: { ...config.roleRules, [activeRole]: nextRule } });
      return;
    }
    if (activeMode === 'compact') return;
    if (!activeUser) return;
    setConfig({ ...config, userRules: { ...config.userRules, [activeUser.id]: nextRule } });
  };

  const resetToInherit = () => patchRule(defaultRule());

  const save = async () => {
    if (!config) return;
    setSaving(true);
    setMessage('');
    try {
      const saved = await api.updateToolPermissions({
        defaultVisibleNodeTypes: config.defaultVisibleNodeTypes,
        roleRules: config.roleRules,
        userRules: config.userRules,
        exhibitionCompactForm: config.exhibitionCompactForm,
      });
      setConfig({ ...config, ...saved });
      setMessage('权限已保存');
      await onPermissionsChanged?.();
    } catch (e: any) {
      setMessage(e?.message || '保存权限失败');
    } finally {
      setSaving(false);
    }
  };

  const panelCls = isPixel
    ? 'px-card'
    : `rounded-lg border shadow-2xl ${isDark ? 'bg-zinc-950 border-white/10 text-white' : 'bg-white border-black/10 text-zinc-900'}`;
  const inputCls = isPixel
    ? 'px-input'
    : `rounded-md border px-2 py-1.5 text-xs outline-none ${isDark ? 'bg-white/5 border-white/10 text-white' : 'bg-black/5 border-black/10'}`;
  const btnCls = isPixel
    ? 'px-btn px-btn--sm'
    : `rounded-md border px-2 py-1.5 text-xs font-semibold ${isDark ? 'border-white/10 hover:bg-white/10' : 'border-black/10 hover:bg-black/5'}`;
  const primaryCls = isPixel
    ? 'px-btn px-btn--sm px-btn--mint'
    : 'rounded-md bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-400 disabled:opacity-60';

  const patchCompactNodeSections = (nodeType: string, sections: string[]) => {
    if (!config) return;
    const normalized = normalizeExhibitionCompactFormConfig({
      sectionsByNodeType: {
        ...compactConfig.sectionsByNodeType,
        [nodeType]: sections,
      },
      itemsByNodeType: compactConfig.itemsByNodeType,
    });
    setConfig({ ...config, exhibitionCompactForm: normalized });
  };

  const patchCompactNode = (nodeType: string, sections: string[], sectionItems: Record<string, string[]>) => {
    if (!config) return;
    const normalized = normalizeExhibitionCompactFormConfig({
      sectionsByNodeType: {
        ...compactConfig.sectionsByNodeType,
        [nodeType]: sections,
      },
      itemsByNodeType: {
        ...compactConfig.itemsByNodeType,
        [nodeType]: {
          ...compactConfig.itemsByNodeType[nodeType],
          ...sectionItems,
        },
      },
    });
    setConfig({ ...config, exhibitionCompactForm: normalized });
  };

  const toggleCompactSection = (nodeType: string, sectionId: string) => {
    const current = new Set(compactConfig.sectionsByNodeType[nodeType] || []);
    if (current.has(sectionId)) current.delete(sectionId);
    else current.add(sectionId);
    patchCompactNodeSections(nodeType, Array.from(current));
  };

  const patchCompactSectionItems = (nodeType: string, sectionId: string, items: string[]) => {
    patchCompactNode(nodeType, compactConfig.sectionsByNodeType[nodeType] || [], { [sectionId]: items });
  };

  const toggleCompactItem = (nodeType: string, sectionId: string, itemId: string) => {
    const current = new Set(compactConfig.itemsByNodeType[nodeType]?.[sectionId] || []);
    if (current.has(itemId)) current.delete(itemId);
    else current.add(itemId);
    patchCompactSectionItems(nodeType, sectionId, Array.from(current));
  };

  const patchCompactNodeAll = (nodeType: string, checked: boolean) => {
    const definition = EXHIBITION_COMPACT_FORM_DEFINITIONS.find((item) => item.nodeType === nodeType);
    if (!definition) return;
    patchCompactNode(
      nodeType,
      checked ? definition.sections.map((section) => section.id) : [],
      Object.fromEntries(definition.sections.map((section) => [
        section.id,
        checked ? getExhibitionCompactSectionItems(section).map((item) => item.id) : [],
      ])),
    );
  };

  const resetCompactNode = (nodeType: string) => {
    const defaults = defaultExhibitionCompactForm();
    patchCompactNode(
      nodeType,
      defaults.sectionsByNodeType[nodeType] || [],
      defaults.itemsByNodeType[nodeType] || {},
    );
  };

  return (
    <div className={`fixed inset-0 z-[90] flex items-center justify-center ${isPixel ? 'px-modal-mask' : 'bg-black/55'}`} onMouseDown={onClose}>
      <div className={`${panelCls} flex h-[min(780px,calc(100vh-36px))] w-[min(1120px,calc(100vw-36px))] flex-col overflow-hidden`} onMouseDown={(e) => e.stopPropagation()}>
        <div className={`flex items-center justify-between px-4 py-3 ${isDark ? 'border-b border-white/10' : 'border-b border-black/10'}`}>
          <div className="flex min-w-0 items-center gap-2">
            <UserCog size={18} />
            <div>
              <div className="text-sm font-semibold">用户管理</div>
              <div className={`text-[11px] ${isDark ? 'text-white/45' : 'text-zinc-500'}`}>工具可见与执行权限</div>
            </div>
          </div>
          <button className={btnCls} onClick={onClose} type="button"><X size={14} /></button>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-[280px_1fr]">
          <aside className={`min-h-0 overflow-y-auto p-3 ${isDark ? 'border-r border-white/10 bg-white/[0.02]' : 'border-r border-black/10 bg-black/[0.02]'}`}>
            <div className="mb-3 flex gap-1">
              <button className={`${btnCls} flex-1 ${activeMode === 'role' ? 'bg-emerald-500/15 text-emerald-300' : ''}`} onClick={() => setActiveMode('role')} type="button">角色</button>
              <button className={`${btnCls} flex-1 ${activeMode === 'user' ? 'bg-emerald-500/15 text-emerald-300' : ''}`} onClick={() => setActiveMode('user')} type="button">个人</button>
            </div>

            <button className={`${btnCls} mb-3 w-full justify-start text-left ${activeMode === 'compact' ? 'bg-emerald-500/15 text-emerald-300' : ''}`} onClick={() => setActiveMode('compact')} type="button">精简窗体</button>

            {activeMode === 'compact' ? (
              <div className="space-y-2 text-xs">
                <div className={`rounded-md border px-2 py-2 ${isDark ? 'border-cyan-300/20 bg-cyan-300/10 text-cyan-100' : 'border-cyan-200 bg-cyan-50 text-cyan-800'}`}>
                  全局展陈精简窗体
                </div>
                <button className={`${btnCls} w-full justify-start text-left`} type="button" onClick={() => setConfig(config ? { ...config, exhibitionCompactForm: defaultExhibitionCompactForm() } : config)}>
                  恢复全部默认
                </button>
              </div>
            ) : activeMode === 'role' ? (
              <div className="space-y-1">
                {ROLE_OPTIONS.map((role) => (
                  <button key={role} className={`${btnCls} w-full justify-start text-left ${activeRole === role ? 'bg-sky-500/15 text-sky-300' : ''}`} onClick={() => setActiveRole(role)} type="button">
                    <Shield size={13} className="mr-1 inline" /> {role}
                  </button>
                ))}
              </div>
            ) : (
              <>
                <div className="relative mb-2">
                  <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 opacity-55" />
                  <input className={`${inputCls} w-full pl-7`} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索用户" />
                </div>
                <div className="space-y-1">
                  {users.map((user) => (
                    <button
                      key={user.id}
                      className={`${btnCls} w-full min-w-0 text-left ${activeUser?.id === user.id ? 'bg-sky-500/15 text-sky-300' : ''}`}
                      onClick={() => setActiveUserId(user.id)}
                      type="button"
                    >
                      <span className="block truncate font-semibold">{user.name || user.username}</span>
                      <span className="block truncate text-[10px] opacity-60">{user.username} · {user.role}</span>
                    </button>
                  ))}
                  {!loading && users.length === 0 && <div className="px-2 py-3 text-xs opacity-55">没有匹配用户</div>}
                </div>
              </>
            )}
          </aside>

          <main className="min-h-0 overflow-y-auto p-4">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold">
                  {activeMode === 'role' ? `角色: ${activeRole}` : `个人: ${activeUser?.name || activeUser?.username || '-'}`}
                </div>
                <div className={`text-[11px] ${isDark ? 'text-white/45' : 'text-zinc-500'}`}>
                  {editingRule?.mode === 'custom' ? `自定义 ${activeTypes.length} 个工具` : `继承 ${inheritedTypes.length} 个工具`}
                </div>
              </div>
              {activeMode !== 'compact' && (
                <>
                  <button className={btnCls} type="button" onClick={() => patchRule(customRule(activeTypes))}>转为自定义</button>
                  <button className={btnCls} type="button" onClick={resetToInherit}>继承默认</button>
                </>
              )}
              <button className={primaryCls} type="button" onClick={save} disabled={saving || loading || !config}>
                {saving ? <Loader2 size={13} className="mr-1 inline animate-spin" /> : <Check size={13} className="mr-1 inline" />}
                保存
              </button>
            </div>

            {message && <div className={`mb-3 rounded-md px-3 py-2 text-xs ${isDark ? 'bg-white/10 text-white/70' : 'bg-black/5 text-zinc-600'}`}>{message}</div>}
            {loading && <div className="text-xs opacity-55">加载中...</div>}

            {activeMode === 'compact' && (
              <div className="space-y-3">
                {EXHIBITION_COMPACT_FORM_DEFINITIONS.map((definition) => {
                  const selected = new Set(compactConfig.sectionsByNodeType[definition.nodeType] || []);
                  const itemCount = definition.sections.reduce((sum, section) => sum + getExhibitionCompactSectionItems(section).length, 0);
                  const selectedItemCount = definition.sections.reduce((sum, section) => (
                    sum + (compactConfig.itemsByNodeType[definition.nodeType]?.[section.id] || []).length
                  ), 0);
                  return (
                    <section key={definition.nodeType} className={`rounded-md border p-3 ${isDark ? 'border-white/10 bg-white/[0.03]' : 'border-black/10 bg-black/[0.02]'}`}>
                      <div className="mb-2 flex items-center gap-2">
                        <div className="flex-1 text-xs font-semibold">{definition.label} {' / '} {selected.size}/{definition.sections.length} {' / '} {selectedItemCount}/{itemCount}</div>
                        <button className={btnCls} type="button" onClick={() => patchCompactNodeAll(definition.nodeType, true)}>{'\u5168\u9009'}</button>
                        <button className={btnCls} type="button" onClick={() => patchCompactNodeAll(definition.nodeType, false)}>{'\u5168\u4e0d\u9009'}</button>
                        <button className={btnCls} type="button" onClick={() => resetCompactNode(definition.nodeType)}>{'\u6062\u590d\u9ed8\u8ba4'}</button>
                      </div>
                      <div className="space-y-2">
                        {definition.sections.map((section) => {
                          const checked = selected.has(section.id);
                          const items = getExhibitionCompactSectionItems(section);
                          const selectedItems = new Set(compactConfig.itemsByNodeType[definition.nodeType]?.[section.id] || []);
                          return (
                            <div key={section.id} className={`rounded-md border p-2 text-xs ${checked ? 'border-cyan-300/50 bg-cyan-400/10' : isDark ? 'border-white/10 bg-black/10' : 'border-black/10 bg-white'}`}>
                              <div className="mb-2 flex min-w-0 items-center gap-2">
                                <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => toggleCompactSection(definition.nodeType, section.id)}
                                  />
                                  <span className="min-w-0 flex-1 truncate font-semibold">{section.label}</span>
                                  <span className="truncate text-[10px] opacity-45">{section.id}</span>
                                  <span className="text-[10px] opacity-60">{selectedItems.size}/{items.length}</span>
                                </label>
                                {items.length > 0 && (
                                  <>
                                    <button className={btnCls} type="button" onClick={() => patchCompactSectionItems(definition.nodeType, section.id, items.map((item) => item.id))}>{'\u672c\u533a\u5168\u9009'}</button>
                                    <button className={btnCls} type="button" onClick={() => patchCompactSectionItems(definition.nodeType, section.id, [])}>{'\u672c\u533a\u5168\u4e0d\u9009'}</button>
                                    <button className={btnCls} type="button" onClick={() => patchCompactSectionItems(definition.nodeType, section.id, defaultExhibitionCompactForm().itemsByNodeType[definition.nodeType]?.[section.id] || [])}>{'\u672c\u533a\u9ed8\u8ba4'}</button>
                                  </>
                                )}
                              </div>
                              {items.length > 0 && <div className="grid grid-cols-2 gap-1.5 md:grid-cols-3 xl:grid-cols-4">
                                {items.map((item) => {
                                  const itemChecked = selectedItems.has(item.id);
                                  return (
                                    <label key={item.id} className={`flex min-w-0 cursor-pointer items-center gap-2 rounded border px-2 py-1.5 ${itemChecked ? 'border-emerald-300/40 bg-emerald-400/10' : isDark ? 'border-white/10 bg-black/10' : 'border-black/10 bg-white'}`}>
                                      <input
                                        type="checkbox"
                                        checked={itemChecked}
                                        onChange={() => toggleCompactItem(definition.nodeType, section.id, item.id)}
                                      />
                                      <span className="min-w-0 flex-1 truncate">{item.label}</span>
                                      <span className="truncate text-[10px] opacity-45">{item.id}</span>
                                    </label>
                                  );
                                })}
                              </div>}
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  );
                })}
              </div>
            )}

            <div className={activeMode === 'compact' ? 'hidden' : 'space-y-3'}>
              {Object.entries(NODE_GROUPS).map(([key, group]) => {
                const groupTypes = group.nodes.map((node) => node.type);
                const checkedCount = groupTypes.filter((type) => activeTypeSet.has(type)).length;
                return (
                  <section key={key} className={`rounded-md border p-3 ${isDark ? 'border-white/10 bg-white/[0.03]' : 'border-black/10 bg-black/[0.02]'}`}>
                    <div className="mb-2 flex items-center gap-2">
                      <div className="flex-1 text-xs font-semibold">{group.label} · {checkedCount}/{groupTypes.length}</div>
                      <button className={btnCls} type="button" onClick={() => patchRule(applyGroup(editingRule, inheritedTypes, groupTypes, true))}>全选</button>
                      <button className={btnCls} type="button" onClick={() => patchRule(applyGroup(editingRule, inheritedTypes, groupTypes, false))}>全不选</button>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5 md:grid-cols-3 xl:grid-cols-4">
                      {group.nodes.map((node) => {
                        const checked = activeTypeSet.has(node.type);
                        return (
                          <label key={node.type} className={`flex min-w-0 cursor-pointer items-center gap-2 rounded-md border px-2 py-1.5 text-xs ${checked ? 'border-emerald-400/50 bg-emerald-500/10' : isDark ? 'border-white/10 bg-black/10' : 'border-black/10 bg-white'}`}>
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => patchRule(toggleType(editingRule, inheritedTypes, node.type))}
                            />
                            <span className="min-w-0 flex-1 truncate">{node.label}</span>
                            <span className="truncate text-[10px] opacity-45">{node.type}</span>
                          </label>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
