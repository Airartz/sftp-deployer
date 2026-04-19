import type { AppSettings } from '../../../../shared/types'

function resolveTheme(theme: AppSettings['theme']): 'light' | 'dark' {
  if (theme === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return theme
}

export function applyTheme(theme: AppSettings['theme']): void {
  document.documentElement.dataset.theme = resolveTheme(theme)
}

export async function loadAndApplyTheme(): Promise<void> {
  const res = await window.electronAPI.settings.get()
  if (res.ok && res.data) {
    applyTheme(res.data.theme)
  }
}
