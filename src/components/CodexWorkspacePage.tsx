import { AlertTriangle, ArrowLeft, Loader2, RefreshCcw } from 'lucide-react';
import { useEffect, useState } from 'react';

interface CodexWorkspacePageProps {
  onBack: () => void;
}

export default function CodexWorkspacePage({ onBack }: CodexWorkspacePageProps) {
  const [status, setStatus] = useState<'checking' | 'ready' | 'error'>('checking');
  const [message, setMessage] = useState('正在连接 Codex 工作区...');

  const check = async () => {
    setStatus('checking');
    try {
      const response = await fetch('/api/codex/health', { credentials: 'same-origin' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.success !== true) throw new Error(payload?.error || `HTTP ${response.status}`);
      setStatus('ready');
      setMessage('');
    } catch (error: any) {
      setStatus('error');
      setMessage(error?.message || 'Codex 工作区暂时不可用');
    }
  };

  useEffect(() => { void check(); }, []);

  if (status !== 'ready') {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center p-6" data-testid="codex-workspace-status">
        <div className="max-w-md text-center">
          {status === 'checking' ? <Loader2 className="mx-auto animate-spin text-cyan-400" size={28} /> : <AlertTriangle className="mx-auto text-amber-400" size={28} />}
          <div className="mt-3 text-sm font-semibold">{status === 'checking' ? 'Codex 工作区连接中' : 'Codex 工作区不可用'}</div>
          <div className="mt-2 text-xs opacity-65">{message}</div>
          <div className="mt-4 flex justify-center gap-2">
            <button type="button" onClick={onBack} className="inline-flex items-center gap-1 rounded-md border border-white/15 px-3 py-2 text-xs">
              <ArrowLeft size={14} /> 返回无限画布
            </button>
            {status === 'error' && <button type="button" onClick={() => void check()} className="inline-flex items-center gap-1 rounded-md bg-cyan-500 px-3 py-2 text-xs font-semibold text-black"><RefreshCcw size={14} /> 重试</button>}
          </div>
        </div>
      </div>
    );
  }

  return <iframe title="Codex 工作区" src="/codex/" className="h-full min-h-0 w-full flex-1 border-0 bg-transparent" data-testid="codex-workspace-frame" allow="clipboard-read; clipboard-write" />;
}
