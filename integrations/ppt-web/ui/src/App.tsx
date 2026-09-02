import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import { Component, useEffect, type ReactNode } from 'react'
import { AppRoutes } from './router'
import { ToastHost } from './components/ui/Toast'
import { ModalHost } from './components/ui/Modal'
import { setHostManagedAuth, useAuthStore } from './stores/authStore'
import { useAppearanceStore } from './stores/appearanceStore'
import { useMascotStore } from './stores/mascotStore'
import { GenerationMascotHost } from './components/mascot/GenerationMascot'
import { setDisplayTimezone } from './lib/format'
import './index.css'

type HostAuthUser = {
  id: string
  email: string
  role?: string
}

class MascotErrorBoundary extends Component<{ children: ReactNode }, { crashed: boolean }> {
  state = { crashed: false }

  static getDerivedStateFromError() {
    return { crashed: true }
  }

  render() {
    if (this.state.crashed) return null
    return this.props.children
  }
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 5000 },
  },
})

function Boot({ authUser }: { authUser?: HostAuthUser }) {
  const boot = useAuthStore((s) => s.boot)
  const me = useAuthStore((s) => s.me)
  const booted = useAuthStore((s) => s.booted)
  const initAppearance = useAppearanceStore((s) => s.init)
  const initMascot = useMascotStore((s) => s.init)

  useEffect(() => {
    initAppearance()
    initMascot()
    if (authUser) {
      // The host T8 app is the source of truth for authentication.  Seeding
      // the PPT store directly also avoids a redirect loop when the proxy is
      // briefly unavailable during service startup.
      useAuthStore.setState({
        me: {
          id: authUser.id,
          email: authUser.email,
          quota_credits: 2147483647,
          role: authUser.role === 'admin' ? 'admin' : 'user',
        },
        booted: true,
      })
    } else {
      boot()
    }
    fetch('/api/ppt/health')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.display_timezone) setDisplayTimezone(data.display_timezone)
      })
      .catch(() => {})
  }, [authUser, boot, initAppearance, initMascot])

  return (
    <>
      <AppRoutes hostAuthenticated={!!authUser} />
      {booted && me ? (
        <MascotErrorBoundary>
          <GenerationMascotHost />
        </MascotErrorBoundary>
      ) : null}
      <ToastHost />
      <ModalHost />
    </>
  )
}

export default function App({ authUser }: { authUser?: HostAuthUser }) {
  setHostManagedAuth(!!authUser)
  // Seed host authentication before the router's first render.  The previous
  // effect-only initialization left RequireAuth with an unauthenticated first
  // frame on direct /ppt/* refreshes.
  if (authUser) {
    const current = useAuthStore.getState()
    if (!current.booted || current.me?.id !== authUser.id) {
      useAuthStore.setState({
        me: {
          id: authUser.id,
          email: authUser.email,
          quota_credits: 2147483647,
          role: authUser.role === 'admin' ? 'admin' : 'user',
        },
        booted: true,
      })
    }
  }

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter basename="/ppt">
        <Boot authUser={authUser} />
      </BrowserRouter>
    </QueryClientProvider>
  )
}
