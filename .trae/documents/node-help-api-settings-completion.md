# 完成 ApiSettings 节点帮助文档管理区块

## Context

前一会话已完成：后端路由 (`backend/src/routes/nodeHelp.js`)、前端服务封装 (`src/services/api.ts`)、默认帮助文本 (`src/config/nodeHelpDefaults.ts`)、Markdown 渲染器 (`src/utils/simpleMarkdown.tsx`)、`NodeHelpButton` + `NodeHelpModal` 组件、19 个展陈节点 header 注入 `?` 按钮、CSS 样式 (`src/styles/index.css`)。

本计划仅覆盖**剩余部分**：`src/components/ApiSettings.tsx` 中"节点帮助文档"管理区块的 useEffect、事件处理函数和 UI 渲染。

## 当前状态

`ApiSettings.tsx` 已完成：
- L8/L11/L13：import `getNodeHelps/saveNodeHelp/deleteNodeHelp/exportNodeHelps/importNodeHelps/bulkReplaceNodeHelps/NodeHelpMap`、`DEFAULT_NODE_HELPS`、`renderSimpleMarkdown`、`clearNodeHelpCache`
- L2：import 图标 `HelpCircle, RotateCcw, Edit3, Eye as EyeIcon`（均已存在）
- L105-106：常量 `EXHIBITION_HELP_NODES`、`NODE_HELP_STORAGE_KEY`
- L420-428：9 个 state 变量（`nodeHelpOpen/nodeHelpMap/activeNodeHelpType/nodeHelpDraft/nodeHelpDirty/nodeHelpView/nodeHelpBusy/nodeHelpMessage/nodeHelpImportFileRef`）

待完成：
1. 加载 `nodeHelpMap` 的 useEffect
2. `activeNodeHelpType` 切换时同步 `nodeHelpDraft` 的 useEffect
3. 6 个事件处理函数
4. 折叠区块 UI 渲染

## 实现步骤

### 1. 添加加载 nodeHelpMap 的 useEffect

**位置**：在现有 reset 表单的 useEffect 之后（L491 后、L493 `if (!open) return null;` 之前），新增独立 useEffect。

```typescript
useEffect(() => {
  if (!open) return;
  let cancelled = false;
  setNodeHelpBusy(true);
  setNodeHelpMessage('');
  getNodeHelps()
    .then((map) => {
      if (cancelled) return;
      const merged: NodeHelpMap = {};
      for (const node of EXHIBITION_HELP_NODES) {
        const custom = map[node.type];
        merged[node.type] = custom && custom.trim() ? custom : (DEFAULT_NODE_HELPS[node.type] || '');
      }
      setNodeHelpMap(merged);
      if (!activeNodeHelpType && EXHIBITION_HELP_NODES.length > 0) {
        setActiveNodeHelpType(EXHIBITION_HELP_NODES[0].type);
      }
    })
    .catch((e: any) => {
      if (!cancelled) setNodeHelpMessage(e?.message || '加载节点帮助失败');
    })
    .finally(() => {
      if (!cancelled) setNodeHelpBusy(false);
    });
  return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [open]);
```

### 2. 添加 activeNodeHelpType 同步 useEffect

**位置**：紧接步骤 1 的 useEffect 之后。

```typescript
useEffect(() => {
  if (!activeNodeHelpType) return;
  const current = nodeHelpMap[activeNodeHelpType] ?? '';
  setNodeHelpDraft(current);
  setNodeHelpDirty(false);
  setNodeHelpView('edit');
  setNodeHelpMessage('');
}, [activeNodeHelpType, nodeHelpMap]);
```

### 3. 添加 6 个事件处理函数

**位置**：在 `handlePreviewTaskFailureSound` 之后（L948 后）、`renderGetKeyButtons` 之前（L950 前）。

#### handleSaveNodeHelp（保存当前编辑）
```typescript
const handleSaveNodeHelp = async () => {
  if (!activeNodeHelpType) return;
  setNodeHelpBusy(true);
  setNodeHelpMessage('');
  try {
    const content = nodeHelpDraft;
    await saveNodeHelp(activeNodeHelpType, content);
    setNodeHelpMap((prev) => ({ ...prev, [activeNodeHelpType]: content }));
    setNodeHelpDirty(false);
    clearNodeHelpCache(activeNodeHelpType);
    setNodeHelpMessage('已保存');
  } catch (e: any) {
    setNodeHelpMessage(e?.message || '保存失败');
  } finally {
    setNodeHelpBusy(false);
  }
};
```

#### handleResetNodeHelp（重置为默认，删除后端覆盖）
```typescript
const handleResetNodeHelp = async () => {
  if (!activeNodeHelpType) return;
  setNodeHelpBusy(true);
  setNodeHelpMessage('');
  try {
    await deleteNodeHelp(activeNodeHelpType);
    const fallback = DEFAULT_NODE_HELPS[activeNodeHelpType] || '';
    setNodeHelpMap((prev) => ({ ...prev, [activeNodeHelpType]: fallback }));
    setNodeHelpDraft(fallback);
    setNodeHelpDirty(false);
    clearNodeHelpCache(activeNodeHelpType);
    setNodeHelpMessage('已恢复为默认');
  } catch (e: any) {
    setNodeHelpMessage(e?.message || '重置失败');
  } finally {
    setNodeHelpBusy(false);
  }
};
```

#### handleClearNodeHelp（清空当前编辑内容，不保存）
```typescript
const handleClearNodeHelp = () => {
  setNodeHelpDraft('');
  setNodeHelpDirty(true);
  setNodeHelpMessage('');
};
```

#### handleExportNodeHelps（导出 JSON 备份）
```typescript
const handleExportNodeHelps = async () => {
  setNodeHelpBusy(true);
  setNodeHelpMessage('');
  try {
    const result = await exportNodeHelps();
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'node-helps-backup.json';
    a.click();
    URL.revokeObjectURL(url);
    setNodeHelpMessage('已导出备份');
  } catch (e: any) {
    setNodeHelpMessage(e?.message || '导出失败');
  } finally {
    setNodeHelpBusy(false);
  }
};
```

#### handleImportNodeHelps（导入 JSON 备份）
```typescript
const handleImportNodeHelps = async (file: File | null) => {
  if (!file) return;
  setNodeHelpBusy(true);
  setNodeHelpMessage('');
  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    const helps: NodeHelpMap = parsed?.helps && typeof parsed.helps === 'object' ? parsed.helps : parsed;
    await importNodeHelps(helps, 'merge');
    const map = await getNodeHelps();
    const merged: NodeHelpMap = {};
    for (const node of EXHIBITION_HELP_NODES) {
      const custom = map[node.type];
      merged[node.type] = custom && custom.trim() ? custom : (DEFAULT_NODE_HELPS[node.type] || '');
    }
    setNodeHelpMap(merged);
    clearNodeHelpCache();
    setNodeHelpMessage('已导入备份');
  } catch (e: any) {
    setNodeHelpMessage(e?.message || '导入失败，请检查 JSON 格式');
  } finally {
    setNodeHelpBusy(false);
    if (nodeHelpImportFileRef.current) nodeHelpImportFileRef.current.value = '';
  }
};
```

#### handleResetAllNodeHelps（恢复全部默认，清空后端）
```typescript
const handleResetAllNodeHelps = async () => {
  if (!window.confirm('确定恢复全部节点帮助为默认内容？这将清空所有自定义帮助。')) return;
  setNodeHelpBusy(true);
  setNodeHelpMessage('');
  try {
    await bulkReplaceNodeHelps({});
    const merged: NodeHelpMap = {};
    for (const node of EXHIBITION_HELP_NODES) {
      merged[node.type] = DEFAULT_NODE_HELPS[node.type] || '';
    }
    setNodeHelpMap(merged);
    clearNodeHelpCache();
    setNodeHelpMessage('已恢复全部默认');
  } catch (e: any) {
    setNodeHelpMessage(e?.message || '恢复失败');
  } finally {
    setNodeHelpBusy(false);
  }
};
```

### 4. 添加折叠区块 UI 渲染

**位置**：在 nodeMenuOpen 区块闭合 `</div>`（L3322）之后、"任务完成提示音"区块（L3324 `<div className="t8-api-settings-divider pt-3 border-t">` 之前）插入新折叠区块。

**结构**：参考 nodeMenuOpen 区块（L3261-L3322）的折叠模式，包含：
- 折叠按钮（HelpCircle 图标 + 标题"节点帮助文档" + 展开提示）
- 展开内容：
  - 顶部说明 + 「导出 JSON」「导入 JSON」「恢复全部默认」按钮
  - 隐藏的 `<input type="file" ref={nodeHelpImportFileRef} accept=".json" onChange={...} />`
  - 左右两栏布局：
    - 左侧节点列表（每项显示 label + 自定义/默认状态圆点）
    - 右侧编辑/预览区：
      - 节点名 + 状态徽章
      - 「编辑/预览」tab 切换
      - 编辑模式：`<textarea>` monospace
      - 预览模式：`renderSimpleMarkdown(nodeHelpDraft)`
      - 底部按钮：「保存」「重置为默认」「清空」
  - 消息提示行（nodeHelpMessage）

**关键样式**：
- 沿用 `t8-api-settings-section`/`t8-api-settings-toggle`/`t8-api-settings-badge` 等现有类名
- isPixel 风格分支（参考其他区块的 `isPixel ? '... px-btn ...' : '... rounded-lg border ...'` 模式）
- 自定义状态用 `data-tone="success"`（绿色），默认用 `data-tone="muted"`（灰色）
- textarea 样式：`font-mono text-[11px] leading-relaxed w-full min-h-[280px]` + 现有 FIELD 风格

**状态判定逻辑**：
```typescript
const activeHelpNode = EXHIBITION_HELP_NODES.find((n) => n.type === activeNodeHelpType);
const activeHelpIsCustom = !!activeNodeHelpType
  && !!nodeHelpMap[activeNodeHelpType]
  && nodeHelpMap[activeNodeHelpType] !== DEFAULT_NODE_HELPS[activeNodeHelpType];
```

## 关键复用点

- 折叠区块模式：参考 [ApiSettings.tsx](file:///d:/works/windsurf/T8-penguin-canvas/src/components/ApiSettings.tsx) #L3261-L3322（nodeMenuOpen 区块）
- 文件上传 input + ref 模式：参考 L3354-L3359（taskCompletionSoundFileInputRef）
- isPixel 样式分支：参考 L1206-L1207、L3268-L3271
- 状态徽章：参考 L3347-L3352（`t8-api-settings-badge` + `data-tone`）

## 验证

1. `npm run type-check` 通过（无 TS 错误）
2. `npm run dev:backend` 启动后端，`curl http://127.0.0.1:18766/api/node-help` 返回 `{ success: true, data: {} }`
3. `npm run dev` 启动前端，浏览器打开 `http://127.0.0.1:11422`
4. 打开 API 设置（顶部齿轮），找到"节点帮助文档"折叠区块，展开
5. 左侧节点列表显示 19 个展陈节点，全部为"默认"状态
6. 选一个节点，在编辑模式修改 Markdown，点保存，确认提示"已保存"，状态变为"自定义"
7. 切换到预览模式，确认 Markdown 渲染正常
8. 点"重置为默认"，确认回退为默认内容
9. 点"导出 JSON"，确认下载 `node-helps-backup.json`
10. 修改一个节点后点"导入 JSON"导入刚下载的文件，确认恢复
11. 点"恢复全部默认"，确认全部回退
12. 回到画布，添加展陈节点，点 `?` 按钮，确认弹窗显示对应帮助内容
13. 测试深色/浅色主题切换，弹窗与按钮均清晰可读
