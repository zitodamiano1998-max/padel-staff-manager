import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Bell, CheckCheck,
  Palmtree, Calendar, ArrowLeftRight, Check, X, Hand, BellRing, BellOff,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import {
  isPushSupported, getPushPermissionStatus, isCurrentlySubscribed,
  subscribeToPush, unsubscribeFromPush, whyNotSupported,
} from '../lib/pushClient'

export default function NotificationBell() {
  const { profile } = useAuth()
  const [notifications, setNotifications] = useState([])
  const [open, setOpen] = useState(false)
  const dropdownRef = useRef(null)
  const navigate = useNavigate()

  // Stato push notifications
  const [pushSupported, setPushSupported] = useState(false)
  const [pushSubscribed, setPushSubscribed] = useState(false)
  const [pushPermission, setPushPermission] = useState('default')
  const [pushBusy, setPushBusy] = useState(false)
  const [pushError, setPushError] = useState(null)

  // Live toast per notifiche realtime
  const [liveToast, setLiveToast] = useState(null)
  const toastTimeoutRef = useRef(null)

  // Init push state
  useEffect(() => {
    refreshPushState()
  }, [])

  // Re-check stato push ogni volta che apro il dropdown
  useEffect(() => {
    if (open) refreshPushState()
  }, [open])

  const refreshPushState = async () => {
    const supported = isPushSupported()
    setPushSupported(supported)
    if (!supported) return
    setPushPermission(getPushPermissionStatus())
    const subInBrowser = await isCurrentlySubscribed()
    setPushSubscribed(subInBrowser)
  }

  // Carica notifiche + Realtime
  useEffect(() => {
    if (!profile?.id) return
    fetchNotifications()

    const channel = supabase
      .channel('notif-' + profile.id)
      .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `recipient_id=eq.${profile.id}`,
        },
        (payload) => {
          setNotifications((prev) => [payload.new, ...prev].slice(0, 30))
          // Mostra toast in-app
          if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current)
          setLiveToast(payload.new)
          toastTimeoutRef.current = setTimeout(() => setLiveToast(null), 6000)
        }
      )
      .on('postgres_changes', {
          event: 'UPDATE',
          schema: 'public',
          table: 'notifications',
          filter: `recipient_id=eq.${profile.id}`,
        },
        (payload) => {
          setNotifications((prev) =>
            prev.map((n) => (n.id === payload.new.id ? payload.new : n))
          )
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [profile?.id])

  // Click fuori
  useEffect(() => {
    const handler = (e) => {
      if (open && dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const fetchNotifications = async () => {
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('recipient_id', profile.id)
      .order('created_at', { ascending: false })
      .limit(30)
    if (data) setNotifications(data)
  }

  const unreadCount = notifications.filter((n) => !n.is_read).length

  const markRead = async (id) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
    )
    await supabase.from('notifications').update({ is_read: true }).eq('id', id)
  }

  const markAllRead = async () => {
    const unreadIds = notifications.filter((n) => !n.is_read).map((n) => n.id)
    if (unreadIds.length === 0) return
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })))
    await supabase.from('notifications').update({ is_read: true }).in('id', unreadIds)
  }

  const handleItemClick = async (n) => {
    if (!n.is_read) await markRead(n.id)
    setOpen(false)
    if (n.link) navigate(n.link)
  }

  // ---- Push handlers ----
  const handleEnablePush = async () => {
    setPushBusy(true)
    setPushError(null)
    try {
      await subscribeToPush(profile.id)
      setPushSubscribed(true)
      setPushPermission(getPushPermissionStatus())
    } catch (err) {
      setPushError(err.message)
    } finally {
      setPushBusy(false)
    }
  }

  const handleDisablePush = async () => {
    setPushBusy(true)
    setPushError(null)
    try {
      await unsubscribeFromPush()
      setPushSubscribed(false)
    } catch (err) {
      setPushError(err.message)
    } finally {
      setPushBusy(false)
    }
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setOpen(!open)}
        className="relative p-2 rounded-lg hover:bg-cream-200 text-warm-brown hover:text-warm-dark transition"
        title="Notifiche">
        <Bell size={18} />
        {unreadCount > 0 && (
          <span className="absolute top-0.5 right-0.5 min-w-[16px] h-[16px] bg-terracotta-500 text-white text-[10px] font-sans font-bold rounded-full flex items-center justify-center px-1 leading-none">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-[22rem] max-w-[calc(100vw-2rem)] bg-white rounded-2xl shadow-xl border border-cream-300 max-h-[70vh] flex flex-col overflow-hidden z-50">
          <div className="px-4 py-3 border-b border-cream-200 flex items-center justify-between flex-shrink-0">
            <h3 className="font-serif text-lg text-warm-dark">Notifiche</h3>
            {unreadCount > 0 && (
              <button onClick={markAllRead}
                className="flex items-center gap-1 font-sans text-xs text-terracotta-600 hover:text-terracotta-700 font-semibold">
                <CheckCheck size={14} />
                Segna tutte lette
              </button>
            )}
          </div>

          {/* Push toggle */}
          <div className="px-4 py-3 border-b border-cream-200 bg-cream-50 flex-shrink-0">
            {!pushSupported ? (
              <div className="flex items-start gap-2 font-sans text-xs text-warm-brown">
                <BellOff size={14} className="text-warm-brown flex-shrink-0 mt-0.5" />
                <div>
                  <div>Push non disponibili su questo device.</div>
                  <div className="mt-1 opacity-70">{whyNotSupported()}</div>
                  <div className="mt-1 opacity-70">
                    💡 Su iPhone: installa l'app dalla schermata Home (Safari → Condividi → Aggiungi alla Home), poi apri da lì.
                  </div>
                </div>
              </div>
            ) : pushPermission === 'denied' ? (
              <div className="flex items-start gap-2 font-sans text-xs text-warm-brown">
                <BellOff size={14} className="text-red-600 flex-shrink-0 mt-0.5" />
                <span>
                  Push disabilitate dal browser. Vai nelle impostazioni del sito per riabilitarle.
                </span>
              </div>
            ) : pushSubscribed ? (
              <div className="flex items-center gap-2">
                <BellRing size={14} className="text-sage-600 flex-shrink-0" />
                <span className="font-sans text-xs text-warm-dark flex-1">
                  Notifiche push <strong>attive</strong> su questo device
                </span>
                <button onClick={handleDisablePush} disabled={pushBusy}
                  className="font-sans text-xs text-terracotta-600 hover:text-terracotta-700 font-semibold">
                  Disattiva
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Bell size={14} className="text-warm-brown flex-shrink-0" />
                <span className="font-sans text-xs text-warm-dark flex-1">
                  Ricevi notifiche anche con app chiusa
                </span>
                <button onClick={handleEnablePush} disabled={pushBusy}
                  className="font-sans text-xs font-semibold bg-terracotta-400 hover:bg-terracotta-500 text-white px-3 py-1 rounded-lg transition disabled:opacity-50">
                  {pushBusy ? '...' : 'Attiva'}
                </button>
              </div>
            )}
            {pushError && (
              <div className="mt-2 font-sans text-xs text-red-700 bg-red-50 rounded px-2 py-1">
                {pushError}
                </div>
              )}
            </div>

          <div className="overflow-y-auto flex-1">
            {notifications.length === 0 ? (
              <div className="p-10 text-center">
                <Bell size={28} className="mx-auto mb-2 text-warm-brown/30" />
                <p className="font-sans text-sm text-warm-brown">
                  Nessuna notifica
                </p>
              </div>
            ) : (
              notifications.map((n) => (
                <NotificationItem key={n.id} n={n} onClick={() => handleItemClick(n)} />
              ))
            )}
          </div>
        </div>
      )}

      {/* Live toast (notifica realtime in arrivo) */}
      {liveToast && (
        <LiveToast notification={liveToast}
          onClose={() => setLiveToast(null)}
          onClick={() => {
            handleItemClick(liveToast)
            setLiveToast(null)
          }} />
      )}
    </div>
  )
}

function LiveToast({ notification, onClose, onClick }) {
  const Icon = ICONS[notification.type] || ICONS.default
  const tone = getToneFromType(notification.type)
  const colorMap = {
    positive: { bg: 'bg-sage-50', border: 'border-sage-300', accent: 'text-sage-700', iconBg: 'bg-sage-100' },
    info: { bg: 'bg-white', border: 'border-cream-300', accent: 'text-warm-dark', iconBg: 'bg-cream-100' },
    warning: { bg: 'bg-amber-50', border: 'border-amber-300', accent: 'text-amber-700', iconBg: 'bg-amber-100' },
  }
  const c = colorMap[tone]
  return (
    <div className={`fixed top-4 right-4 z-50 ${c.bg} border ${c.border} rounded-2xl shadow-lg p-4 max-w-sm w-[calc(100vw-2rem)] sm:w-96 animate-slide-in-right`}>
      <div className="flex items-start gap-3">
        <button onClick={onClick} className="flex items-start gap-3 flex-1 text-left min-w-0">
          <div className={`w-9 h-9 ${c.iconBg} rounded-xl flex items-center justify-center flex-shrink-0 ${c.accent}`}>
            <Icon size={16} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-sans font-semibold text-sm text-warm-dark mb-0.5">
              {notification.title}
            </div>
            <div className="font-sans text-xs text-warm-brown line-clamp-2">
              {notification.body}
            </div>
          </div>
        </button>
        <button onClick={onClose}
          className="p-1 rounded-lg hover:bg-white/50 text-warm-brown hover:text-warm-dark transition flex-shrink-0">
          <X size={14} />
        </button>
      </div>
    </div>
  )
}

function getToneFromType(type) {
  if (!type) return 'info'
  if (type.includes('approved') || type.includes('published')) return 'positive'
  if (type.includes('pending') || type.includes('claimed') || type.includes('rejected')) return 'warning'
  return 'info'
}

function NotificationItem({ n, onClick }) {
  const Icon = ICONS[n.type] || ICONS.default
  return (
    <button onClick={onClick}
      className={`w-full text-left px-4 py-3 hover:bg-cream-50 transition border-b border-cream-100 last:border-b-0 flex items-start gap-3 ${
        !n.is_read ? 'bg-terracotta-50/30' : ''
      }`}>
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${Icon.bg}`}>
        <Icon.El size={14} className={Icon.fg} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start gap-2">
          <div className="font-sans text-sm font-semibold text-warm-dark mb-0.5 flex-1">
            {n.title}
          </div>
          {!n.is_read && (
            <span className="w-2 h-2 rounded-full bg-terracotta-500 flex-shrink-0 mt-1.5" />
          )}
        </div>
        {n.body && (
          <div className="font-sans text-xs text-warm-brown leading-snug line-clamp-2">
            {n.body}
          </div>
        )}
        <div className="font-sans text-[11px] text-warm-brown/70 mt-1">
          {timeAgo(n.created_at)}
        </div>
      </div>
    </button>
  )
}

const ICONS = {
  leave_pending: { El: Palmtree, bg: 'bg-amber-100', fg: 'text-amber-700' },
  leave_approved: { El: Check, bg: 'bg-sage-100', fg: 'text-sage-700' },
  leave_rejected: { El: X, bg: 'bg-red-100', fg: 'text-red-700' },
  shift_assigned: { El: Calendar, bg: 'bg-terracotta-100', fg: 'text-terracotta-700' },
  swap_open: { El: ArrowLeftRight, bg: 'bg-amber-100', fg: 'text-amber-700' },
  swap_claimed: { El: Hand, bg: 'bg-sage-100', fg: 'text-sage-700' },
  swap_pending: { El: ArrowLeftRight, bg: 'bg-terracotta-100', fg: 'text-terracotta-700' },
  swap_approved: { El: Check, bg: 'bg-sage-100', fg: 'text-sage-700' },
  swap_rejected: { El: X, bg: 'bg-red-100', fg: 'text-red-700' },
  default: { El: Bell, bg: 'bg-cream-200', fg: 'text-warm-brown' },
}

function timeAgo(iso) {
  const ms = Date.now() - new Date(iso).getTime()
  const m = Math.floor(ms / 60000)
  if (m < 1) return 'ora'
  if (m < 60) return `${m}m fa`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h fa`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d}g fa`
  return new Date(iso).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })
}
