import React, { useState, useEffect } from 'react'
import type { Server, ServerFormData } from '../../../../shared/types'
import FileBlacklist from './FileBlacklist'

interface Props {
  server?: Server
  onClose: () => void
  onSave: (server: Server) => void
}

const DEFAULTS: ServerFormData = {
  name: '',
  projectName: '',
  host: '',
  port: 22,
  username: '',
  authType: 'password',
  password: '',
  privateKey: '',
  passphrase: '',
  localPath: '',
  remotePath: '/var/www/html',
  ignorePatterns: [],
  autoWatch: false,
  deleteOrphans: false,
  backup: false,
  postDeployCommand: ''
}

export default function ServerDialog({ server, onClose, onSave }: Props): React.ReactElement {
  const [form, setForm] = useState<ServerFormData>(DEFAULTS)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const [ignoreText, setIgnoreText] = useState('')
  const [keyFilePath, setKeyFilePath] = useState('')
  const [showBlacklist, setShowBlacklist] = useState(false)

  useEffect(() => {
    if (server) {
      setForm({
        name: server.name,
        projectName: server.projectName,
        host: server.host,
        port: server.port,
        username: server.username,
        authType: server.authType,
        localPath: server.localPath,
        remotePath: server.remotePath,
        ignorePatterns: server.ignorePatterns,
        autoWatch: server.autoWatch,
        deleteOrphans: server.deleteOrphans,
        backup: server.backup,
        postDeployCommand: server.postDeployCommand ?? ''
      })
      setIgnoreText(server.ignorePatterns.join('\n'))
    }
  }, [server])

  function set<K extends keyof ServerFormData>(key: K, value: ServerFormData[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const handlePickFolder = async () => {
    const res = await window.electronAPI.fs.pickFolder()
    if (res.ok && res.data) set('localPath', res.data)
  }

  const handlePickKey = async () => {
    const res = await window.electronAPI.fs.pickKeyFile()
    if (res.ok && res.data) {
      setKeyFilePath(res.data)
      const content = await window.electronAPI.fs.readKeyFile(res.data)
      if (content.ok && content.data) {
        set('privateKey', content.data)
        setTestResult({ ok: true, msg: 'Key geladen: ' + content.data.split('\n')[0] })
      } else {
        setTestResult({ ok: false, msg: 'Key-Fehler: ' + (content.error ?? 'Unbekannter Fehler') })
      }
    }
  }

  const handleTest = async () => {
    setTesting(true)
    setTestResult(null)
    const data: ServerFormData = {
      ...form,
      ignorePatterns: ignoreText.split('\n').map((l) => l.trim()).filter(Boolean)
    }
    // Use existing server ID if available, otherwise test with raw form data
    const res = server
      ? await window.electronAPI.servers.testConnection(server.id)
      : await window.electronAPI.servers.testNewConnection(data)
    setTesting(false)
    if (res.ok && res.data) {
      setTestResult({ ok: true, msg: `Verbindung erfolgreich (${res.data.ms}ms)` })
    } else {
      setTestResult({ ok: false, msg: res.error ?? 'Verbindung fehlgeschlagen' })
    }
  }

  const handleSave = async () => {
    setSaving(true)
    const data: ServerFormData = {
      ...form,
      ignorePatterns: ignoreText.split('\n').map((l) => l.trim()).filter(Boolean)
    }

    // When editing: don't send empty credential fields — the repo would overwrite
    // the stored encrypted value with null if an empty string is passed.
    if (server) {
      if (!data.privateKey) delete data.privateKey
      if (!data.password)   delete data.password
      if (!data.passphrase) delete data.passphrase
    }

    let res
    if (server) {
      res = await window.electronAPI.servers.update(server.id, data)
    } else {
      res = await window.electronAPI.servers.create(data)
    }

    setSaving(false)
    if (res.ok && res.data) {
      onSave(res.data)
    } else {
      alert(res.error ?? 'Fehler beim Speichern')
    }
  }

  return (
    <>
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-[var(--color-surface)] border border-slate-700 rounded-2xl w-full max-w-lg max-h-[90vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <h2 className="font-semibold text-white">
            {server ? 'Server bearbeiten' : 'Server hinzufügen'}
          </h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 text-xl">✕</button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          <Field label="Name">
            <Input value={form.name} onChange={(v) => set('name', v)} placeholder="Mein Produktionsserver" />
          </Field>

          <Field label="Projektname">
            <Input value={form.projectName} onChange={(v) => set('projectName', v)} placeholder="my-website" />
          </Field>

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <Field label="Host / IP">
                <Input value={form.host} onChange={(v) => set('host', v)} placeholder="123.456.789.0" />
              </Field>
            </div>
            <Field label="Port">
              <Input
                value={String(form.port)}
                onChange={(v) => set('port', parseInt(v) || 22)}
                placeholder="22"
                type="number"
              />
            </Field>
          </div>

          <Field label="Benutzername">
            <Input value={form.username} onChange={(v) => set('username', v)} placeholder="root" />
          </Field>

          {/* Auth type */}
          <Field label="Authentifizierung">
            <div className="flex gap-2">
              {(['password', 'key'] as const).map((type) => (
                <button
                  key={type}
                  onClick={() => set('authType', type)}
                  className={`flex-1 py-1.5 text-sm rounded-lg border transition-colors
                    ${form.authType === type
                      ? 'border-indigo-500 bg-indigo-600/20 text-indigo-300'
                      : 'border-slate-700 text-slate-500 hover:border-slate-600'
                    }`}
                >
                  {type === 'password' ? 'Passwort' : 'SSH-Key'}
                </button>
              ))}
            </div>
          </Field>

          {form.authType === 'password' ? (
            <Field label="Passwort">
              <Input
                value={form.password ?? ''}
                onChange={(v) => set('password', v)}
                type="password"
                placeholder={server ? '(unverändert lassen)' : 'Passwort'}
              />
            </Field>
          ) : (
            <div className="space-y-3">
              <Field label="SSH Private Key">
                <div className="flex gap-2">
                  <input
                    readOnly
                    value={keyFilePath || (server?.encryptedPrivateKey ? '(gespeichert)' : '')}
                    className="flex-1 bg-[var(--color-base)] border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-400"
                    placeholder="Key-Datei wählen..."
                  />
                  <button
                    onClick={handlePickKey}
                    className="px-3 py-2 text-sm border border-slate-700 rounded-lg hover:bg-slate-800 text-slate-400"
                  >
                    Wählen
                  </button>
                </div>
              </Field>
              <Field label="Passphrase (optional)">
                <Input
                  value={form.passphrase ?? ''}
                  onChange={(v) => set('passphrase', v)}
                  type="password"
                  placeholder="Passphrase für SSH-Key"
                />
              </Field>
            </div>
          )}

          {/* Paths */}
          <Field label="Lokaler Ordner">
            <div className="flex gap-2">
              <input
                readOnly
                value={form.localPath}
                className="flex-1 bg-[var(--color-base)] border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-300 truncate"
                placeholder="Ordner wählen..."
              />
              <button
                onClick={handlePickFolder}
                className="px-3 py-2 text-sm border border-slate-700 rounded-lg hover:bg-slate-800 text-slate-400 flex-shrink-0"
              >
                Wählen
              </button>
            </div>
            {form.localPath && (
              <button
                onClick={() => setShowBlacklist(true)}
                className="mt-1.5 flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
              >
                <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                  <path fillRule="evenodd" d="M13.477 14.89A6 6 0 015.11 6.524l8.367 8.368zm1.414-1.414L6.524 5.11a6 6 0 018.367 8.367zM18 10a8 8 0 11-16 0 8 8 0 0116 0z" clipRule="evenodd"/>
                </svg>
                Dateien blacklisten
                {ignoreText.trim() && (
                  <span className="text-slate-500">
                    ({ignoreText.split('\n').filter(Boolean).length} Muster aktiv)
                  </span>
                )}
              </button>
            )}
          </Field>

          <Field label="Zielordner auf Server">
            <Input value={form.remotePath} onChange={(v) => set('remotePath', v)} placeholder="/var/www/html" />
          </Field>

          {/* Ignore patterns */}
          <Field label="Ignore-Muster (eine Zeile pro Muster)">
            <textarea
              value={ignoreText}
              onChange={(e) => setIgnoreText(e.target.value)}
              rows={3}
              placeholder="*.log&#10;tmp/&#10;.env"
              className="w-full bg-[var(--color-base)] border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-300 font-mono resize-none focus:outline-none focus:border-indigo-500"
            />
          </Field>

          {/* Options */}
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <label className="flex items-center gap-2 text-sm text-slate-400 cursor-pointer">
              <input
                type="checkbox"
                checked={form.autoWatch}
                onChange={(e) => set('autoWatch', e.target.checked)}
                className="rounded"
              />
              Auto-Watch
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-400 cursor-pointer">
              <input
                type="checkbox"
                checked={form.deleteOrphans}
                onChange={(e) => set('deleteOrphans', e.target.checked)}
                className="rounded"
              />
              Remote-Orphans löschen
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-400 cursor-pointer">
              <input
                type="checkbox"
                checked={form.backup ?? false}
                onChange={(e) => set('backup', e.target.checked)}
                className="rounded"
              />
              Backup vor Upload
            </label>
          </div>

          {/* Post-Deploy Command */}
          <Field label="Post-Deploy Befehl">
            <input
              type="text"
              value={form.postDeployCommand ?? ''}
              onChange={(e) => set('postDeployCommand', e.target.value)}
              placeholder="z.B. systemctl restart nginx"
              className="w-full bg-[var(--color-base)] border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-300 focus:outline-none focus:border-indigo-500 font-mono"
            />
            <p className="text-xs text-slate-600 mt-1">Wird nach jedem erfolgreichen Sync auf dem Server ausgeführt</p>
          </Field>

          {/* Test result */}
          {testResult && (
            <p className={`text-sm ${testResult.ok ? 'text-emerald-400' : 'text-red-400'}`}>
              {testResult.ok ? '✓' : '✗'} {testResult.msg}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-800">
          <button
            onClick={handleTest}
            disabled={testing || !form.host || !form.username}
            className="px-4 py-2 text-sm border border-slate-700 rounded-lg hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed text-slate-400 transition-colors"
          >
            {testing ? 'Teste...' : 'Verbindung testen'}
          </button>
          <div className="flex gap-3">
            <button onClick={onClose} className="px-4 py-2 text-sm text-slate-500 hover:text-slate-300">
              Abbrechen
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !form.name || !form.host || !form.localPath}
              className="px-5 py-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-white transition-colors"
            >
              {saving ? 'Speichern...' : 'Speichern'}
            </button>
          </div>
        </div>
      </div>
    </div>

    {showBlacklist && form.localPath && (
      <FileBlacklist
        folderPath={form.localPath}
        blacklisted={ignoreText.split('\n').map((l) => l.trim()).filter(Boolean)}
        onClose={() => setShowBlacklist(false)}
        onSave={(patterns) => {
          const existing = ignoreText.split('\n').map((l) => l.trim()).filter(Boolean)
          const existingGlobs = existing.filter((p) => p.startsWith('*') || !p.includes('/'))
          const merged = [...new Set([...existingGlobs, ...patterns])]
          setIgnoreText(merged.join('\n'))
          setShowBlacklist(false)
        }}
      />
    )}
    </>
  )
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-xs text-slate-500 uppercase tracking-wider">{label}</label>
      {children}
    </div>
  )
}

function Input({
  value, onChange, placeholder, type = 'text'
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: string
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full bg-[var(--color-base)] border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-300 focus:outline-none focus:border-indigo-500 placeholder:text-slate-700 transition-colors"
    />
  )
}
