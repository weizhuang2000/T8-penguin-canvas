import { create } from 'zustand'
import { normalizeThemeId, THEMES, type ThemeId } from '../lib/themes'

const THEME_KEY = 'ppt.theme'
const LEGACY_SKIN_KEY = 'ppt.skin'

interface AppearanceState {
  theme: ThemeId
  setTheme: (theme: ThemeId) => void
  init: () => void
}

function applyTheme(theme: ThemeId) {
  // ppt-web is embedded inside the T8 shell.  Never mutate <html> here:
  // doing so overwrites the host theme and can make the whole workspace
  // inherit an incompatible foreground/background pair.
  const root = document.querySelector<HTMLElement>('.ppt-web-root')
  if (root) root.dataset.pptTheme = theme
}

export const useAppearanceStore = create<AppearanceState>((set) => ({
  theme: 'modern',

  setTheme: (theme) => {
    applyTheme(theme)
    localStorage.setItem(THEME_KEY, theme)
    localStorage.removeItem(LEGACY_SKIN_KEY)
    set({ theme })
  },

  init: () => {
    try {
      const storedTheme = localStorage.getItem(THEME_KEY)
      const legacySkin = localStorage.getItem(LEGACY_SKIN_KEY)
      const theme = normalizeThemeId(storedTheme ?? legacySkin)
      applyTheme(theme)
      set({ theme })
    } catch {
      /* ignore */
    }
  },
}))

export const SKINS = THEMES.map((t) => ({
  id: t.id,
  label: t.label,
  swatch: t.preview.primary,
}))

/** @deprecated Use useAppearanceStore */
export const useThemeStore = useAppearanceStore

export type { ThemeId }
export type SkinId = ThemeId
export type ThemeMode = never
