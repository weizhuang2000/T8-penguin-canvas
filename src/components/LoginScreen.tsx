import { FormEvent, useEffect, useState } from 'react';
import { Loader2, LockKeyhole, LogIn, Sparkles } from 'lucide-react';
import type { AuthUser } from '../services/api';
import * as api from '../services/api';

interface LoginScreenProps {
  onAuthenticated: (user: AuthUser) => void;
}

export default function LoginScreen({ onAuthenticated }: LoginScreenProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('sso_token');
    if (!token) return;

    const clean = new URL(window.location.href);
    clean.searchParams.delete('sso_token');
    window.history.replaceState({}, '', clean.toString());

    setLoading(true);
    setMessage('正在通过设计管理系统登录...');
    api.ssoLogin(token)
      .then((res) => onAuthenticated(res.user))
      .catch((e) => setMessage(e?.message || 'SSO 登录失败，请使用账号密码登录'))
      .finally(() => setLoading(false));
  }, [onAuthenticated]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setMessage('请输入用户名/邮箱和密码');
      return;
    }
    setLoading(true);
    setMessage('');
    try {
      const res = await api.login({ username: username.trim(), password });
      onAuthenticated(res.user);
    } catch (err: any) {
      setMessage(err?.message || '登录失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0b1120] text-white px-4">
      <div className="w-full max-w-[420px] border border-white/10 bg-white/[0.06] shadow-2xl rounded-lg p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-emerald-400/15 border border-emerald-300/30 flex items-center justify-center">
            <Sparkles size={20} className="text-emerald-300" />
          </div>
          <div>
            <h1 className="text-lg font-bold">T8 Penguin Canvas</h1>
            <p className="text-xs text-white/55">公司内部账号登录</p>
          </div>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <label className="block">
            <span className="block text-xs text-white/70 mb-1">用户名或邮箱</span>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full rounded-md bg-black/25 border border-white/15 px-3 py-2 text-sm outline-none focus:border-emerald-300/70"
              autoComplete="username"
              disabled={loading}
            />
          </label>
          <label className="block">
            <span className="block text-xs text-white/70 mb-1">密码</span>
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              className="w-full rounded-md bg-black/25 border border-white/15 px-3 py-2 text-sm outline-none focus:border-emerald-300/70"
              autoComplete="current-password"
              disabled={loading}
            />
          </label>
          {message && (
            <div className="text-xs text-amber-200 bg-amber-500/10 border border-amber-300/20 rounded-md px-3 py-2">
              {message}
            </div>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full h-10 rounded-md bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 text-sm font-semibold flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <LogIn size={16} />}
            登录
          </button>
        </form>

        <div className="mt-5 flex items-start gap-2 text-[11px] leading-relaxed text-white/45">
          <LockKeyhole size={13} className="mt-0.5 shrink-0" />
          <span>账号与权限来自设计管理系统。已登录设计管理系统的员工可通过 SSO 链接无缝进入。</span>
        </div>
      </div>
    </div>
  );
}
