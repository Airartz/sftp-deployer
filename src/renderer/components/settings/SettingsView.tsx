import React, { useEffect, useState } from 'react'
import type { AppSettings } from '../../../../shared/types'
import { applyTheme } from '../../store/theme.store'

function useContextMenuState() {
  const [registered, setRegistered] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    window.electronAPI.contextMenu.isRegistered().then((res) => {
      if (res.ok) setRegistered(res.data ?? false)
    })
  }, [])

  const toggle = async () => {
    setBusy(true)
    setMsg(null)
    const res = registered
      ? await window.electronAPI.contextMenu.unregister()
      : await window.electronAPI.contextMenu.register()
    setBusy(false)
    if (res.ok) {
      setRegistered(!registered)
      setMsg(registered ? 'Kontextmenü entfernt' : 'Kontextmenü registriert')
      setTimeout(() => setMsg(null), 2500)
    } else {
      setMsg(res.error ?? 'Fehler')
    }
  }

  return { registered, busy, msg, toggle }
}

const DEFAULTS: AppSettings = {
  encryptionSalt: '',
  theme: 'dark',
  defaultPort: 22,
  logRetentionDays: 30,
  maxConcurrentUploads: 3,
  hashLargeFileThresholdMB: 10
}

function Field({
  label,
  hint,
  children
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-8 py-4 border-b border-slate-800">
      <div className="flex-1">
        <p className="text-sm text-white font-medium">{label}</p>
        {hint && <p className="text-xs text-slate-500 mt-0.5">{hint}</p>}
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  )
}

function NumberInput({
  value,
  onChange,
  min,
  max
}: {
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
}) {
  return (
    <input
      type="number"
      value={value}
      min={min}
      max={max}
      onChange={(e) => onChange(parseInt(e.target.value) || 0)}
      className="w-24 bg-[var(--color-base)] border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-300 text-right focus:outline-none focus:border-indigo-500"
    />
  )
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!value)}
      className={`relative w-10 h-5 rounded-full transition-colors ${value ? 'bg-indigo-600' : 'bg-slate-700'}`}
    >
      <span
        className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
          value ? 'translate-x-5' : 'translate-x-0.5'
        }`}
      />
    </button>
  )
}

export default function SettingsView(): React.ReactElement {
  const [settings, setSettings] = useState<AppSettings>(DEFAULTS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    window.electronAPI.settings.get().then((res) => {
      if (res.ok && res.data) setSettings(res.data)
      setLoading(false)
    })
  }, [])

  function set<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
    const updated = { ...settings, [key]: value }
    setSettings(updated)
    setSaved(false)
    // Theme is applied and saved immediately — no save button needed
    if (key === 'theme') {
      applyTheme(value as AppSettings['theme'])
      window.electronAPI.settings.update({ theme: value as AppSettings['theme'] })
    }
  }

  const handleSave = async () => {
    setSaving(true)
    const res = await window.electronAPI.settings.update(settings)
    setSaving(false)
    if (res.ok) {
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-slate-600 text-sm">
        Lade Einstellungen...
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 flex-shrink-0">
        <h2 className="text-lg font-semibold text-white">Einstellungen</h2>
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-1.5 text-sm font-medium rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 transition-colors text-white"
        >
          {saving ? 'Speichern...' : saved ? '✓ Gespeichert' : 'Speichern'}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Section: Sync */}
        <Section title="Synchronisation">
          <Field
            label="Max. parallele Uploads"
            hint="Wie viele Dateien gleichzeitig hochgeladen werden (1–8)"
          >
            <NumberInput
              value={settings.maxConcurrentUploads}
              onChange={(v) => set('maxConcurrentUploads', Math.max(1, Math.min(8, v)))}
              min={1}
              max={8}
            />
          </Field>

          <Field
            label="Hash-Schwellenwert (MB)"
            hint="Dateien über diesem Wert werden byte-weise per Hash verglichen"
          >
            <NumberInput
              value={settings.hashLargeFileThresholdMB}
              onChange={(v) => set('hashLargeFileThresholdMB', Math.max(1, v))}
              min={1}
            />
          </Field>

          <Field
            label="Standard-Port"
            hint="Vorausgefüllter SSH-Port beim Erstellen neuer Server"
          >
            <NumberInput
              value={settings.defaultPort}
              onChange={(v) => set('defaultPort', Math.max(1, Math.min(65535, v)))}
              min={1}
              max={65535}
            />
          </Field>
        </Section>

        {/* Section: Logs */}
        <Section title="Logs">
          <Field
            label="Log-Aufbewahrung (Tage)"
            hint="Ältere Log-Einträge werden automatisch gelöscht"
          >
            <NumberInput
              value={settings.logRetentionDays}
              onChange={(v) => set('logRetentionDays', Math.max(1, v))}
              min={1}
            />
          </Field>
        </Section>

        {/* Section: Appearance */}
        <Section title="Darstellung">
          <Field label="Design" hint="Farbschema der Anwendung">
            <div className="flex gap-2">
              {(['dark', 'light', 'system'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => set('theme', t)}
                  className={`px-3 py-1.5 text-xs rounded-lg border transition-colors capitalize
                    ${settings.theme === t
                      ? 'border-indigo-500 bg-indigo-600/20 text-indigo-300'
                      : 'border-slate-700 text-slate-500 hover:border-slate-600'
                    }`}
                >
                  {t === 'dark' ? 'Dunkel' : t === 'light' ? 'Hell' : 'System'}
                </button>
              ))}
            </div>
          </Field>
        </Section>

        {/* Section: Windows Integration */}
        <ContextMenuSection />

        {/* Section: Export / Import */}
        <ExportImportSection />

        {/* Section: Info */}
        <Section title="Info">
          <Field label="Version" hint="SFTP Deployer">
            <span className="text-sm text-slate-500 font-mono">1.0.0</span>
          </Field>
          <Field label="Datenspeicher" hint="SQLite-Datenbank + verschlüsselte Zugangsdaten">
            <span className="text-sm text-slate-600 font-mono text-right">%APPDATA%\sftp-deployer</span>
          </Field>
        </Section>
      </div>
    </div>
  )
}

function ExportImportSection(): React.ReactElement {
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const [importing, setImporting] = useState(false)

  const flash = (text: string, ok: boolean) => {
    setMsg({ text, ok })
    setTimeout(() => setMsg(null), 4000)
  }

  const handleExport = async () => {
    const res = await window.electronAPI.serverConfig.export()
    if (!res.ok || !res.data) { flash(res.error ?? 'Export fehlgeschlagen', false); return }
    const blob = new Blob([res.data], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `sftp-deployer-servers-${new Date().toISOString().slice(0,10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    flash('Server-Konfiguration exportiert', true)
  }

  const handleImport = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return
      setImporting(true)
      const text = await file.text()
      const res = await window.electronAPI.serverConfig.import(text)
      setImporting(false)
      if (res.ok && res.data) {
        flash(`${res.data.imported} importiert, ${res.data.skipped} übersprungen (bereits vorhanden)`, true)
        window.location.reload()
      } else {
        flash(res.error ?? 'Import fehlgeschlagen', false)
      }
    }
    input.click()
  }

  return (
    <Section title="Server-Konfiguration">
      <Field
        label="Exportieren"
        hint="Alle Server als JSON-Datei speichern (ohne Passwörter/Schlüssel)"
      >
        <button
          onClick={handleExport}
          className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-700 text-slate-400 hover:bg-slate-800 transition-colors"
        >
          Exportieren
        </button>
      </Field>
      <Field
        label="Importieren"
        hint="Server aus einer zuvor exportierten JSON-Datei laden"
      >
        <button
          onClick={handleImport}
          disabled={importing}
          className="px-3 py-1.5 text-xs font-medium rounded-lg border border-indigo-700 text-indigo-400 hover:bg-indigo-900/20 disabled:opacity-40 transition-colors"
        >
          {importing ? 'Importiere...' : 'Importieren'}
        </button>
      </Field>
      {msg && (
        <p className={`text-xs mt-1 mb-2 ${msg.ok ? 'text-emerald-400' : 'text-red-400'}`}>
          {msg.ok ? '✓' : '✗'} {msg.text}
        </p>
      )}
    </Section>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="px-6 pt-6 pb-2">
      <h3 className="text-xs text-slate-600 uppercase tracking-widest font-semibold mb-1">{title}</h3>
      {children}
    </div>
  )
}

function ContextMenuSection(): React.ReactElement {
  const { registered, busy, msg, toggle } = useContextMenuState()

  return (
    <Section title="Windows Integration">
      <Field
        label="Explorer-Kontextmenü"
        hint='Fügt "Mit SFTP Deployer hochladen" zum Rechtsklick-Menü hinzu (HKCU Registry)'
      >
        <div className="flex items-center gap-3">
          {registered !== null && (
            <span className={`text-xs ${registered ? 'text-emerald-400' : 'text-slate-600'}`}>
              {registered ? 'Aktiv' : 'Inaktiv'}
            </span>
          )}
          <button
            onClick={toggle}
            disabled={busy || registered === null}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors disabled:opacity-40
              ${registered
                ? 'border-red-800 text-red-400 hover:bg-red-900/20'
                : 'border-indigo-700 text-indigo-400 hover:bg-indigo-900/20'
              }`}
          >
            {busy ? '...' : registered ? 'Entfernen' : 'Registrieren'}
          </button>
        </div>
      </Field>
      {msg && (
        <p className={`text-xs mt-1 mb-2 ${msg.includes('Fehler') || msg.includes('rror') ? 'text-red-400' : 'text-emerald-400'}`}>
          {msg}
        </p>
      )}
    </Section>
  )
}
