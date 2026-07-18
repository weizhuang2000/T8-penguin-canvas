import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileStack,
  Layers3,
  Loader2,
  Play,
  RefreshCw,
  Square,
} from 'lucide-react';
import { PORT_COLOR } from '../../config/portTypes';
import {
  inspectImageToEditableRuntime,
  runImageToEditableDocument,
  type EditableDocumentFile,
  type EditableOutputFormat,
} from '../../services/imageToEditableDocument';
import { useRunTrigger } from '../../hooks/useRunTrigger';
import SmartImage from '../SmartImage';
import { useUpdateNodeData } from './useUpdateNodeData';
import { useUpstreamMaterials } from './useUpstreamMaterials';

type RuntimeState = 'checking' | 'ready' | 'error';

function ImageToEditableDocumentNode({ id, data, selected }: NodeProps) {
  const update = useUpdateNodeData(id);
  const { images } = useUpstreamMaterials(id);
  const d = (data as any) || {};
  const format: EditableOutputFormat = d.editableOutputFormat === 'psd' ? 'psd' : 'ppt';
  const files: EditableDocumentFile[] = Array.isArray(d.editableFiles) ? d.editableFiles : [];
  const running = d.status === 'running';
  const [runtimeState, setRuntimeState] = useState<RuntimeState>('checking');
  const [runtimeMessage, setRuntimeMessage] = useState('正在检查 Codex CLI 与 Skill…');
  const controllerRef = useRef<AbortController | null>(null);

  const checkRuntime = useCallback(async () => {
    setRuntimeState('checking');
    setRuntimeMessage('正在检查 Codex CLI 与 Skill…');
    try {
      const result = await inspectImageToEditableRuntime({ nodeId: id });
      if (!result.status.available) throw new Error(result.status.message || 'Codex CLI 尚不可用或未登录。');
      if (!result.skillAvailable) throw new Error('未发现 image-to-editable-ppt Skill，请先安装该 Skill。');
      if (!result.editpptAvailable) {
        throw new Error('未发现 editppt CLI。请按 image-to-editable-ppt Skill 的 Pre-Run Check 安装后再运行。');
      }
      setRuntimeState('ready');
      setRuntimeMessage('Codex CLI 与 image-to-editable-ppt Skill 已就绪');
      return true;
    } catch (error: any) {
      setRuntimeState('error');
      setRuntimeMessage(error?.message || '运行环境检查失败');
      return false;
    }
  }, [id]);

  useEffect(() => {
    void checkRuntime();
    return () => controllerRef.current?.abort();
  }, [checkRuntime]);

  const handleRun = useCallback(async () => {
    if (images.length === 0) {
      update({ status: 'error', error: '请连接至少一张上游图片。' });
      return;
    }
    if (runtimeState !== 'ready' && !(await checkRuntime())) {
      update({ status: 'error', error: 'Codex CLI 或 image-to-editable-ppt Skill 尚未就绪。' });
      return;
    }

    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    update({
      status: 'running',
      error: '',
      editableFiles: [],
      fileUrl: '',
      fileUrls: [],
      editableProgress: `准备重建 ${images.length} 张图片…`,
    });

    try {
      const result = await runImageToEditableDocument({
        nodeId: id,
        images: images.map((item) => item.url),
        format,
        extraInstructions: String(d.editableExtraInstructions || ''),
      }, {
        signal: controller.signal,
        onProgress(message) {
          update({ editableProgress: message });
        },
      });
      const urls = result.files.map((file) => file.url);
      update({
        status: 'success',
        error: '',
        editableProgress: `已生成 ${result.files.length} 个可编辑文件`,
        editableFiles: result.files,
        fileUrl: urls[0] || '',
        fileUrls: urls,
        editableWorkspace: result.workspace,
        editableArtifacts: result.artifacts,
        editableReply: result.reply,
      });
    } catch (error: any) {
      const message = controller.signal.aborted ? '任务已停止。' : (error?.message || '可编辑文件重建失败。');
      update({ status: 'error', error: message, editableProgress: '' });
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
    }
  }, [checkRuntime, d.editableExtraInstructions, format, id, images, runtimeState, update]);

  useRunTrigger(id, handleRun, 'image-to-editable-document');

  const stopRun = () => controllerRef.current?.abort();
  const accent = format === 'ppt' ? '#38bdf8' : '#a78bfa';

  return (
    <div
      className={`t8-node overflow-hidden ${selected ? 'ring-2' : ''}`}
      style={{
        width: 410,
        borderColor: selected ? accent : 'var(--t8-border-strong)',
        boxShadow: selected ? `0 0 0 2px ${accent}44` : undefined,
      }}
    >
      <Handle type="target" position={Position.Left} style={{ background: PORT_COLOR.image, border: '1px solid var(--t8-bg-node)' }} />

      <div className="t8-node-header flex items-center gap-2 px-3 py-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-md" style={{ background: `${accent}2b`, color: accent }}>
          <Layers3 size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold">图片转可编辑文件</div>
          <div className="truncate text-[10px]" style={{ color: 'var(--t8-text-muted)' }}>
            image-to-editable-ppt · {format === 'ppt' ? '对象级 PPTX' : '分层 PSD'}
          </div>
        </div>
        <div className="text-[10px] font-semibold" style={{ color: runtimeState === 'ready' ? '#22c55e' : runtimeState === 'error' ? '#ef4444' : '#f59e0b' }}>
          {runtimeState === 'checking' ? <Loader2 size={13} className="animate-spin" /> : runtimeState === 'ready' ? <CheckCircle2 size={13} /> : <AlertCircle size={13} />}
        </div>
      </div>

      <div className="nodrag nowheel space-y-3 p-3" onMouseDown={(event) => event.stopPropagation()}>
        <div className="flex items-start gap-2 rounded-md border px-2 py-2 text-[10px]" style={{ borderColor: 'var(--t8-border)' }}>
          <div className="min-w-0 flex-1 leading-relaxed" style={{ color: runtimeState === 'error' ? '#ef4444' : 'var(--t8-text-muted)' }}>
            {runtimeMessage}
          </div>
          <button type="button" className="t8-btn p-1" title="重新检查" onClick={() => void checkRuntime()} disabled={runtimeState === 'checking' || running}>
            <RefreshCw size={12} className={runtimeState === 'checking' ? 'animate-spin' : ''} />
          </button>
        </div>

        <div>
          <div className="mb-1 text-[10px] font-semibold" style={{ color: 'var(--t8-text-muted)' }}>输出格式</div>
          <div className="grid grid-cols-2 gap-2">
            {(['ppt', 'psd'] as EditableOutputFormat[]).map((value) => {
              const active = format === value;
              return (
                <button
                  key={value}
                  type="button"
                  className="t8-btn justify-center px-3 py-2 text-xs font-bold"
                  style={active ? { borderColor: value === 'ppt' ? '#38bdf8' : '#a78bfa', color: value === 'ppt' ? '#38bdf8' : '#a78bfa' } : undefined}
                  onClick={() => update({ editableOutputFormat: value, editableFiles: [], fileUrl: '', fileUrls: [], error: '' })}
                  disabled={running}
                >
                  {value === 'ppt' ? <FileStack size={14} /> : <Layers3 size={14} />}
                  {value === 'ppt' ? 'PPTX' : 'PSD'}
                </button>
              );
            })}
          </div>
          <div className="mt-1 text-[10px] leading-relaxed" style={{ color: 'var(--t8-text-dim)' }}>
            {format === 'ppt'
              ? '多张图片按顺序合并为一个可编辑演示文稿，并执行 Skill 的结构校验。'
              : '每张图片输出一个真实分层 PSD；不允许扁平图层降级。'}
          </div>
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between text-[10px] font-semibold" style={{ color: 'var(--t8-text-muted)' }}>
            <span>上游图片</span>
            <span>{images.length} 张</span>
          </div>
          {images.length > 0 ? (
            <div className="grid grid-cols-4 gap-1.5">
              {images.slice(0, 8).map((item, index) => (
                <div key={item.id} className="relative aspect-video overflow-hidden rounded border" style={{ borderColor: 'var(--t8-border)' }}>
                  <SmartImage src={item.url} alt={item.label || `source ${index + 1}`} className="h-full w-full object-cover" thumbSize={180} />
                  <span className="absolute bottom-0 left-0 bg-black/65 px-1 text-[9px] text-white">{index + 1}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-md border border-dashed px-3 py-5 text-center text-[11px]" style={{ borderColor: 'var(--t8-border)', color: 'var(--t8-text-dim)' }}>
              连接图片、图片合集或画板输出
            </div>
          )}
        </div>

        <div>
          <div className="mb-1 text-[10px] font-semibold" style={{ color: 'var(--t8-text-muted)' }}>补充要求（可选）</div>
          <textarea
            className="t8-input nodrag nowheel min-h-16 w-full resize-y px-2 py-1.5 text-[11px]"
            value={String(d.editableExtraInstructions || '')}
            placeholder="例如：保留中文字体层级、页面比例不变、图层使用中文命名…"
            onChange={(event) => update({ editableExtraInstructions: event.target.value })}
            disabled={running}
          />
        </div>

        {running ? (
          <button type="button" className="t8-btn w-full justify-center px-3 py-2 text-sm" onClick={stopRun}>
            <Square size={13} />停止任务
          </button>
        ) : (
          <button type="button" className="t8-btn t8-btn-primary w-full justify-center px-3 py-2 text-sm" onClick={() => void handleRun()} disabled={images.length === 0 || runtimeState === 'checking'}>
            <Play size={14} />重建为 {format === 'ppt' ? 'PPTX' : 'PSD'}
          </button>
        )}

        {(running || d.editableProgress) && (
          <div className="flex items-start gap-2 rounded-md px-2 py-1.5 text-[10px]" style={{ background: `${accent}12`, color: 'var(--t8-text-muted)' }}>
            {running && <Loader2 size={12} className="mt-0.5 shrink-0 animate-spin" style={{ color: accent }} />}
            <span className="break-all">{d.editableProgress || '处理中…'}</span>
          </div>
        )}

        {d.error && (
          <div className="whitespace-pre-wrap rounded-md border px-2 py-1.5 text-[10px]" style={{ borderColor: '#ef444466', color: '#ef4444' }}>
            {d.error}
          </div>
        )}

        {files.length > 0 && (
          <div className="space-y-1.5">
            <div className="text-[10px] font-semibold" style={{ color: 'var(--t8-text-muted)' }}>交付文件</div>
            {files.map((file, index) => (
              <a
                key={`${file.url}-${index}`}
                href={file.url}
                download
                target="_blank"
                rel="noopener noreferrer"
                className="t8-card flex items-center gap-2 px-2 py-2 text-[11px] hover:brightness-110"
                title={file.url}
              >
                {file.format === 'ppt' ? <FileStack size={15} style={{ color: '#38bdf8' }} /> : <Layers3 size={15} style={{ color: '#a78bfa' }} />}
                <span className="min-w-0 flex-1 truncate">{file.title}</span>
                <Download size={13} />
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default memo(ImageToEditableDocumentNode);
