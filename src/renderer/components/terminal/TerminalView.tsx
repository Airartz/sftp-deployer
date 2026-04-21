import React, { useEffect, useRef, useState, useCallback } from 'react'
import { Terminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import 'xterm/css/xterm.css'
import { useServerStore } from '../../store/server.store'
import type { TerminalConnectConfig } from '../../../../shared/types'

const INACTIVITY_MS = 60 * 60 * 1000

// ─── Module-level IPC binding ─────────────────────────────────────────────────
// Registered ONCE regardless of React StrictMode double-mount or hot reloads.
// Handlers are stored in Sets so add/delete is lifecycle-safe.

type DataEv   = { sessionId: string; data: string }
type ClosedEv = { sessionId: string }

const _dataHandlers   = new Set<(ev: DataEv) => void>()
const _closedHandlers = new Set<(ev: ClosedEv) => void>()
let _ipcBound = false

function bindTerminalIPC(): void {
  if (_ipcBound) return
  _ipcBound = true
  window.electronAPI.on.terminalData((ev)   => _dataHandlers.forEach(h => h(ev)))
  window.electronAPI.on.terminalClosed((ev) => _closedHandlers.forEach(h => h(ev)))
}

const THEME = {
  background: '#0d1117', foreground: '#e2e8f0', cursor: '#818cf8',
  selectionBackground: '#3730a3',
  black: '#1e2535', brightBlack: '#475569',
  red: '#f87171', brightRed: '#fca5a5',
  green: '#34d399', brightGreen: '#6ee7b7',
  yellow: '#fbbf24', brightYellow: '#fcd34d',
  blue: '#818cf8', brightBlue: '#a5b4fc',
  magenta: '#c084fc', brightMagenta: '#d8b4fe',
  cyan: '#22d3ee', brightCyan: '#67e8f9',
  white: '#cbd5e1', brightWhite: '#f8fafc'
}

// ─── Types ────────────────────────────────────────────────────────────────────

type TabStatus = 'connecting' | 'connected' | 'error' | 'disconnected'

interface TabState {
  id: string
  label: string
  status: TabStatus
  sessionId: string | null
  error: string | null
}

interface XtermInst {
  term: Terminal
  fit: FitAddon
  sessionId: string
  lastActivity: number
}

type AuthMode = 'password' | 'key'
type ConnMode = 'server' | 'manual'

interface DialogForm {
  mode: ConnMode
  serverId: string
  host: string
  port: string
  username: string
  authType: AuthMode
  password: string
  privateKey: string
  passphrase: string
}

// ─── Input helper ─────────────────────────────────────────────────────────────

function Inp({
  label, value, onChange, placeholder, type = 'text', mono = false
}: {
  label: string; value: string; onChange: (v: string) => void
  placeholder?: string; type?: string; mono?: boolean
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs text-slate-500">{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full bg-[var(--color-base)] border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-300 focus:outline-none focus:border-indigo-500 ${mono ? 'font-mono' : ''}`}
      />
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function TerminalView({
  isActive,
  isStandalone = false
}: {
  isActive: boolean
  isStandalone?: boolean
}): React.ReactElement {
  const { servers } = useServerStore()

  const [tabs, setTabs] = useState<TabState[]>([])
  const [activeTabId, setActiveTabId] = useState<string | null>(null)
  const [showDialog, setShowDialog] = useState(false)
  const [termCtxMenu, setTermCtxMenu] = useState<{ x: number; y: number; tabId: string } | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [form, setForm] = useState<DialogForm>({
    mode: servers.length > 0 ? 'server' : 'manual',
    serverId: servers[0]?.id ?? '',
    host: '', port: '22', username: '', authType: 'password',
    password: '', privateKey: '', passphrase: ''
  })

  // Refs — stable across renders, no React state needed
  const xtermMap = useRef<Map<string, XtermInst>>(new Map())
  const containerRefs = useRef<Map<string, HTMLDivElement | null>>(new Map())
  const sessionToTab = useRef<Map<string, string>>(new Map())
  const activeTabIdRef = useRef<string | null>(null)

  useEffect(() => { activeTabIdRef.current = activeTabId }, [activeTabId])

  // ─── IPC listeners — module-level binding, Set-based dispatch ────────────

  useEffect(() => {
    bindTerminalIPC()   // no-op if already bound

    const onData = (ev: DataEv) => {
      const tabId = sessionToTab.current.get(ev.sessionId)
      if (!tabId) return
      const inst = xtermMap.current.get(tabId)
      if (inst) { inst.term.write(ev.data); inst.lastActivity = Date.now() }
    }
    const onClosed = (ev: ClosedEv) => {
      const tabId = sessionToTab.current.get(ev.sessionId)
      if (!tabId) return
      xtermMap.current.get(tabId)?.term.write('\r\n\x1b[33m[Verbindung getrennt]\x1b[0m\r\n')
      sessionToTab.current.delete(ev.sessionId)
      xtermMap.current.delete(tabId)
      setTabs(prev => prev.map(t => t.id === tabId ? { ...t, status: 'disconnected', sessionId: null } : t))
    }

    _dataHandlers.add(onData)
    _closedHandlers.add(onClosed)
    return () => {
      _dataHandlers.delete(onData)
      _closedHandlers.delete(onClosed)
    }
  }, [])

  // ─── Init xterm once tab reaches 'connected' ───────────────────────────────

  useEffect(() => {
    for (const tab of tabs) {
      if (tab.status !== 'connected' || !tab.sessionId) continue
      if (xtermMap.current.has(tab.id)) continue

      const container = containerRefs.current.get(tab.id)
      if (!container) continue

      const term = new Terminal({
        theme: THEME,
        fontFamily: '"Cascadia Code", "Fira Code", Consolas, monospace',
        fontSize: 13, lineHeight: 1.4, cursorBlink: true, convertEol: true
      })
      const fit = new FitAddon()
      term.loadAddon(fit)
      term.open(container)
      requestAnimationFrame(() => fit.fit())

      const sid = tab.sessionId
      term.onData(data => window.electronAPI.terminal.write(sid, data))
      term.onResize(({ cols, rows }) => window.electronAPI.terminal.resize(sid, cols, rows))

      term.attachCustomKeyEventHandler((ev) => {
        if (ev.type !== 'keydown') return true
        if (ev.ctrlKey && ev.shiftKey && ev.code === 'KeyC') {
          const sel = term.getSelection()
          if (sel) navigator.clipboard.writeText(sel)
          return false
        }
        if (ev.ctrlKey && ev.shiftKey && ev.code === 'KeyV') {
          navigator.clipboard.readText().then(t => { if (t) window.electronAPI.terminal.write(sid, t) })
          return false
        }
        return true
      })

      const inst: XtermInst = { term, fit, sessionId: sid, lastActivity: Date.now() }
      xtermMap.current.set(tab.id, inst)
      sessionToTab.current.set(sid, tab.id)

      const ro = new ResizeObserver(() => requestAnimationFrame(() => fit.fit()))
      ro.observe(container)
      ;(inst as XtermInst & { _ro?: ResizeObserver })._ro = ro
    }
  }, [tabs])

  // ─── Fit active tab when visibility changes ────────────────────────────────

  useEffect(() => {
    if (activeTabId) requestAnimationFrame(() => xtermMap.current.get(activeTabId)?.fit.fit())
  }, [activeTabId, isActive])

  // ─── Inactivity timer ──────────────────────────────────────────────────────

  useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now()
      for (const [tabId, inst] of xtermMap.current) {
        if (now - inst.lastActivity > INACTIVITY_MS) {
          inst.term.write('\r\n\x1b[31m[Sitzung beendet — 1 Stunde Inaktivität]\x1b[0m\r\n')
          window.electronAPI.terminal.close(inst.sessionId)
          sessionToTab.current.delete(inst.sessionId)
          ;(inst as XtermInst & { _ro?: ResizeObserver })._ro?.disconnect()
          inst.term.dispose()
          xtermMap.current.delete(tabId)
          setTabs(prev => prev.map(t => t.id === tabId ? { ...t, status: 'disconnected', sessionId: null } : t))
        }
      }
    }, 60_000)
    return () => clearInterval(timer)
  }, [])

  // ─── Cleanup all sessions on unmount ──────────────────────────────────────

  useEffect(() => {
    return () => {
      for (const [, inst] of xtermMap.current) {
        try { window.electronAPI.terminal.close(inst.sessionId) } catch {}
        ;(inst as XtermInst & { _ro?: ResizeObserver })._ro?.disconnect()
        inst.term.dispose()
      }
    }
  }, [])

  // ─── Connect ──────────────────────────────────────────────────────────────

  const handleConnect = async () => {
    setConnecting(true)
    const tabId = crypto.randomUUID()
    let label: string

    if (form.mode === 'server') {
      label = servers.find(s => s.id === form.serverId)?.name ?? 'Server'
    } else {
      label = `${form.username || 'user'}@${form.host || '?'}`
    }

    const newTab: TabState = { id: tabId, label, status: 'connecting', sessionId: null, error: null }
    setTabs(prev => [...prev, newTab])
    setActiveTabId(tabId)
    setShowDialog(false)
    setConnecting(false)

    let res: Awaited<ReturnType<typeof window.electronAPI.terminal.open>>

    if (form.mode === 'server') {
      res = await window.electronAPI.terminal.open(form.serverId)
    } else {
      const cfg: TerminalConnectConfig = {
        host: form.host,
        port: parseInt(form.port) || 22,
        username: form.username
      }
      if (form.authType === 'password') cfg.password = form.password
      else { cfg.privateKey = form.privateKey; if (form.passphrase) cfg.passphrase = form.passphrase }
      res = await window.electronAPI.terminal.openDirect(cfg, label)
    }

    if (!res.ok) {
      setTabs(prev => prev.map(t => t.id === tabId ? { ...t, status: 'error', error: res.error ?? 'Verbindungsfehler' } : t))
      return
    }
    setTabs(prev => prev.map(t => t.id === tabId ? { ...t, status: 'connected', sessionId: res.data!.sessionId } : t))
  }

  const closeTab = (tabId: string) => {
    const inst = xtermMap.current.get(tabId)
    if (inst) {
      try { window.electronAPI.terminal.close(inst.sessionId) } catch {}
      sessionToTab.current.delete(inst.sessionId)
      ;(inst as XtermInst & { _ro?: ResizeObserver })._ro?.disconnect()
      inst.term.dispose()
      xtermMap.current.delete(tabId)
    }
    containerRefs.current.delete(tabId)
    setTabs(prev => {
      const remaining = prev.filter(t => t.id !== tabId)
      setActiveTabId(cur => cur === tabId ? (remaining.at(-1)?.id ?? null) : cur)
      return remaining
    })
  }

  const disconnectTab = (tabId: string) => {
    const inst = xtermMap.current.get(tabId)
    if (inst) {
      try { window.electronAPI.terminal.close(inst.sessionId) } catch {}
      sessionToTab.current.delete(inst.sessionId)
      inst.term.write('\r\n\x1b[33m[Getrennt]\x1b[0m\r\n')
      ;(inst as XtermInst & { _ro?: ResizeObserver })._ro?.disconnect()
      inst.term.dispose()
      xtermMap.current.delete(tabId)
    }
    setTabs(prev => prev.map(t => t.id === tabId ? { ...t, status: 'disconnected', sessionId: null } : t))
  }

  const handleTabClick = (tabId: string) => {
    setActiveTabId(tabId)
    requestAnimationFrame(() => xtermMap.current.get(tabId)?.fit.fit())
  }

  const openNewDialog = () => {
    setForm(f => ({ ...f, mode: servers.length > 0 ? 'server' : 'manual', serverId: servers[0]?.id ?? '' }))
    setShowDialog(true)
  }

  const openNewWindow = useCallback(async () => {
    await window.electronAPI.terminal.createWindow()
  }, [])

  // ─── Sub-components ───────────────────────────────────────────────────────

  const tabBar = (
    <div
      className="flex items-center border-b border-slate-800 flex-shrink-0 bg-[var(--color-surface)]"
      style={{ minHeight: 36 }}
    >
      {/* Tabs */}
      <div className="flex items-stretch overflow-x-auto flex-1 min-w-0" style={{ scrollbarWidth: 'none' }}>
        {tabs.map(tab => (
          <div
            key={tab.id}
            onClick={() => handleTabClick(tab.id)}
            className={`flex items-center gap-1.5 px-3 h-9 text-xs border-r border-slate-800 cursor-pointer flex-shrink-0 max-w-[160px] transition-colors
              ${activeTabId === tab.id
                ? 'text-slate-200 border-b-2 border-b-indigo-500 bg-[var(--color-elevated)]'
                : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/40'
              }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
              tab.status === 'connected' ? 'bg-emerald-400' :
              tab.status === 'connecting' ? 'bg-indigo-400 animate-pulse' :
              tab.status === 'error' ? 'bg-red-400' : 'bg-slate-600'
            }`} />
            <span className="truncate">{tab.label}</span>
            <button
              onClick={e => { e.stopPropagation(); closeTab(tab.id) }}
              className="flex-shrink-0 w-4 h-4 flex items-center justify-center rounded hover:bg-slate-700 text-slate-600 hover:text-slate-300 ml-0.5"
            >×</button>
          </div>
        ))}

        <button
          onClick={openNewDialog}
          title="Neue Verbindung"
          className="h-9 px-3 text-slate-600 hover:text-indigo-400 text-lg leading-none flex-shrink-0 transition-colors"
        >+</button>
      </div>

      {/* Right controls */}
      <div className="flex items-center gap-1 px-2 flex-shrink-0">
        {activeTabId && tabs.find(t => t.id === activeTabId)?.status === 'connected' && (
          <button
            onClick={() => disconnectTab(activeTabId)}
            className="px-2 py-0.5 text-xs rounded border border-red-900 hover:bg-red-900/20 text-red-500 transition-colors"
          >Trennen</button>
        )}
        {!isStandalone && (
          <button
            onClick={openNewWindow}
            title="In eigenem Fenster öffnen"
            className="w-7 h-7 flex items-center justify-center rounded text-slate-600 hover:text-slate-300 hover:bg-slate-800 transition-colors"
          >
            <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
              <path fillRule="evenodd" d="M1.5 1h6v1.5h-4v11h11v-4H16V14a1 1 0 01-1 1H1a1 1 0 01-1-1V2a1 1 0 011-1zm8 0H16v6.5l-2-2-3.5 3.5-1.5-1.5L12.5 4l-2-2H9.5V1z" clipRule="evenodd"/>
            </svg>
          </button>
        )}
      </div>
    </div>
  )

  const connectToServer = async (serverId: string, label: string) => {
    const tabId = crypto.randomUUID()
    setTabs(prev => [...prev, { id: tabId, label, status: 'connecting', sessionId: null, error: null }])
    setActiveTabId(tabId)
    const res = await window.electronAPI.terminal.open(serverId)
    if (!res.ok) {
      setTabs(prev => prev.map(t => t.id === tabId ? { ...t, status: 'error', error: res.error ?? 'Verbindungsfehler' } : t))
    } else {
      setTabs(prev => prev.map(t => t.id === tabId ? { ...t, status: 'connected', sessionId: res.data!.sessionId } : t))
    }
  }

  const termArea = (
    <div className="flex-1 relative overflow-hidden">
      {tabs.length === 0 ? (
        <div className="absolute inset-0 overflow-y-auto p-6">
          <p className="text-xs text-slate-600 uppercase tracking-wider mb-4">Verbindung herstellen</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {servers.map(s => (
              <button
                key={s.id}
                onClick={() => connectToServer(s.id, s.name)}
                className="flex items-start gap-3 p-4 rounded-xl border border-slate-800 bg-[var(--color-surface)] hover:border-indigo-700 hover:bg-indigo-600/5 transition-all text-left group"
              >
                <div className="w-8 h-8 rounded-lg bg-indigo-600/20 flex items-center justify-center flex-shrink-0 mt-0.5 group-hover:bg-indigo-600/30 transition-colors">
                  <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-indigo-400">
                    <path fillRule="evenodd" d="M2 5a2 2 0 012-2h12a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V5zm3.293 1.293a1 1 0 011.414 0l3 3a1 1 0 010 1.414l-3 3a1 1 0 01-1.414-1.414L7.586 10 5.293 7.707a1 1 0 010-1.414zM11 12a1 1 0 100 2h3a1 1 0 100-2h-3z" clipRule="evenodd"/>
                  </svg>
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-200 truncate">{s.name}</p>
                  <p className="text-xs text-slate-500 truncate mt-0.5">{s.username}@{s.host}:{s.port}</p>
                </div>
              </button>
            ))}

            {/* Manual connection card */}
            <button
              onClick={openNewDialog}
              className="flex items-start gap-3 p-4 rounded-xl border border-dashed border-slate-700 hover:border-slate-500 hover:bg-slate-800/30 transition-all text-left group"
            >
              <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center flex-shrink-0 mt-0.5 group-hover:bg-slate-700 transition-colors">
                <span className="text-slate-400 text-lg leading-none">+</span>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-400 group-hover:text-slate-300 transition-colors">Manuelle Verbindung</p>
                <p className="text-xs text-slate-600 mt-0.5">Host, Port und Zugangsdaten eingeben</p>
              </div>
            </button>
          </div>
        </div>
      ) : (
        tabs.map(tab => (
          <div key={tab.id} className="absolute inset-0 flex flex-col p-2"
            style={{ display: activeTabId === tab.id ? 'flex' : 'none' }}
          >
            {tab.status === 'connecting' && (
              <div className="flex items-center justify-center h-full text-slate-600 text-sm gap-2">
                <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
                Verbinde mit {tab.label}…
              </div>
            )}
            {tab.status === 'error' && (
              <div className="flex flex-col items-center justify-center h-full gap-2">
                <p className="text-sm text-red-400">{tab.error}</p>
                <button onClick={openNewDialog}
                  className="px-3 py-1.5 text-xs rounded-lg border border-slate-700 text-slate-400 hover:border-slate-600 transition-colors">
                  Erneut verbinden
                </button>
              </div>
            )}
            {tab.status === 'disconnected' && (
              <div className="flex flex-col items-center justify-center h-full gap-2">
                <p className="text-sm text-slate-600">Verbindung getrennt</p>
                <button onClick={openNewDialog}
                  className="px-3 py-1.5 text-xs rounded-lg border border-slate-700 text-slate-400 hover:border-slate-600 transition-colors">
                  Neu verbinden
                </button>
              </div>
            )}
            {/* xterm container — always in DOM when tab exists, hidden when not connected */}
            <div
              ref={el => { containerRefs.current.set(tab.id, el) }}
              className="flex-1 rounded-md overflow-hidden"
              style={{ background: '#0d1117', display: tab.status === 'connected' ? 'block' : 'none' }}
              onContextMenu={e => { e.preventDefault(); setTermCtxMenu({ x: e.clientX, y: e.clientY, tabId: tab.id }) }}
            />
          </div>
        ))
      )}
    </div>
  )

  // ─── Connection dialog ────────────────────────────────────────────────────

  const dialog = showDialog && (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center">
      <div className="bg-[var(--color-surface)] border border-slate-700 rounded-xl shadow-2xl w-[440px] p-5 space-y-4">
        <h3 className="text-white font-semibold text-base">Neue SSH-Verbindung</h3>

        {/* Mode toggle — only show server option if servers exist */}
        {servers.length > 0 && (
          <div className="flex gap-1 p-1 bg-slate-900 rounded-lg">
            {(['server', 'manual'] as ConnMode[]).map(m => (
              <button key={m} onClick={() => setForm(f => ({ ...f, mode: m }))}
                className={`flex-1 py-1.5 text-xs rounded-md transition-colors font-medium
                  ${form.mode === m ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:text-slate-300'}`}>
                {m === 'server' ? 'Gespeicherter Server' : 'Manuell eingeben'}
              </button>
            ))}
          </div>
        )}

        {form.mode === 'server' ? (
          <div className="space-y-1">
            <label className="text-xs text-slate-500">Server auswählen</label>
            <select value={form.serverId} onChange={e => setForm(f => ({ ...f, serverId: e.target.value }))}
              className="w-full bg-[var(--color-base)] border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-300 focus:outline-none focus:border-indigo-500">
              {servers.map(s => (
                <option key={s.id} value={s.id}>{s.name} — {s.username}@{s.host}:{s.port}</option>
              ))}
            </select>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2">
                <Inp label="Host / IP" value={form.host} onChange={v => setForm(f => ({ ...f, host: v }))} placeholder="example.com" />
              </div>
              <Inp label="Port" value={form.port} onChange={v => setForm(f => ({ ...f, port: v }))} placeholder="22" />
            </div>
            <Inp label="Benutzername" value={form.username} onChange={v => setForm(f => ({ ...f, username: v }))} placeholder="root" />

            {/* Auth type */}
            <div className="flex gap-2">
              {(['password', 'key'] as AuthMode[]).map(a => (
                <button key={a} onClick={() => setForm(f => ({ ...f, authType: a }))}
                  className={`flex-1 py-1.5 text-xs rounded-lg border transition-colors font-medium
                    ${form.authType === a ? 'border-indigo-600 bg-indigo-600/20 text-indigo-300' : 'border-slate-700 text-slate-500 hover:border-slate-600 hover:text-slate-300'}`}>
                  {a === 'password' ? 'Passwort' : 'SSH-Key'}
                </button>
              ))}
            </div>

            {form.authType === 'password' ? (
              <Inp label="Passwort" type="password" value={form.password} onChange={v => setForm(f => ({ ...f, password: v }))} />
            ) : (
              <>
                <div className="space-y-1">
                  <label className="text-xs text-slate-500">Private Key (PEM-Format)</label>
                  <textarea value={form.privateKey} onChange={e => setForm(f => ({ ...f, privateKey: e.target.value }))}
                    rows={5}
                    placeholder={'-----BEGIN OPENSSH PRIVATE KEY-----\n...\n-----END OPENSSH PRIVATE KEY-----'}
                    className="w-full bg-[var(--color-base)] border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-300 font-mono focus:outline-none focus:border-indigo-500 resize-none"
                  />
                </div>
                <Inp label="Passphrase (optional)" type="password" value={form.passphrase} onChange={v => setForm(f => ({ ...f, passphrase: v }))} />
              </>
            )}
          </div>
        )}

        <div className="flex gap-2 justify-end pt-1">
          <button onClick={() => setShowDialog(false)}
            className="px-3 py-1.5 text-sm text-slate-400 hover:text-slate-200 transition-colors">
            Abbrechen
          </button>
          <button
            onClick={handleConnect}
            disabled={connecting || (form.mode === 'manual' && (!form.host.trim() || !form.username.trim()))}
            className="px-4 py-1.5 text-sm font-medium rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 transition-colors text-white"
          >
            {connecting ? 'Verbinde…' : 'Verbinden'}
          </button>
        </div>
      </div>
    </div>
  )

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <>
      {dialog}
      {termCtxMenu && (
        <div
          style={{ position: 'fixed', left: termCtxMenu.x, top: termCtxMenu.y, zIndex: 300 }}
          className="bg-[var(--color-elevated)] border border-slate-700 rounded-lg shadow-2xl py-1 min-w-36"
          onMouseLeave={() => setTermCtxMenu(null)}
        >
          <button
            onClick={() => {
              const sel = xtermMap.current.get(termCtxMenu.tabId)?.term.getSelection()
              if (sel) navigator.clipboard.writeText(sel)
              setTermCtxMenu(null)
            }}
            className="w-full flex items-center gap-2.5 px-3 py-1.5 text-xs text-left text-slate-300 hover:bg-slate-700/70"
          >
            Kopieren <span className="ml-auto text-slate-600">Strg+Shift+C</span>
          </button>
          <button
            onClick={() => {
              const inst = xtermMap.current.get(termCtxMenu.tabId)
              if (!inst) return
              navigator.clipboard.readText().then(t => { if (t) window.electronAPI.terminal.write(inst.sessionId, t) })
              setTermCtxMenu(null)
            }}
            className="w-full flex items-center gap-2.5 px-3 py-1.5 text-xs text-left text-slate-300 hover:bg-slate-700/70"
          >
            Einfügen <span className="ml-auto text-slate-600">Strg+Shift+V</span>
          </button>
        </div>
      )}
      <div className="absolute inset-0 flex flex-col" style={{ display: isActive ? 'flex' : 'none' }}>
        {tabBar}
        {termArea}
      </div>
    </>
  )
}
