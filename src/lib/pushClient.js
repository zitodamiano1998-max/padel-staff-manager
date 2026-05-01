import { supabase } from './supabase'

// VAPID public key (sostituire con quella generata)
const VAPID_PUBLIC_KEY = 'BLbrD7BaOPf9Y9RhNynBFk5BLr92HByK9ccEYsqG54gY0fUCrSpVLDKP595aK2AkqfiLfgQMbwnX8c24m0wvAN8'

// Converte la VAPID public key da base64 URL-safe a Uint8Array
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

// Converte ArrayBuffer → base64 URL-safe (per p256dh/auth)
function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

// Verifica se push notifications sono supportate dal browser
export function isPushSupported() {
  return (
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    typeof window !== 'undefined' &&
    'PushManager' in window &&
    'Notification' in window
  )
}

// Diagnostica: spiega perché push non sono supportate (per debug)
export function whyNotSupported() {
  const reasons = []
  if (typeof navigator === 'undefined') reasons.push('navigator non disponibile')
  else if (!('serviceWorker' in navigator)) reasons.push('Service Worker non supportato')
  if (typeof window === 'undefined') reasons.push('window non disponibile')
  else {
    if (!('PushManager' in window)) reasons.push('PushManager non supportato (iOS richiede PWA installata)')
    if (!('Notification' in window)) reasons.push('Notification API non disponibile')
  }
  return reasons.join(', ') || 'Sconosciuto'
}

// Ottiene lo stato corrente del permesso
export function getPushPermissionStatus() {
  if (!('Notification' in window)) return 'unsupported'
  return Notification.permission // 'default' | 'granted' | 'denied'
}

// Verifica se l'utente è già sottoscritto su questo device
export async function isCurrentlySubscribed() {
  if (!isPushSupported()) return false
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
  return !!sub
}

// Sottoscrive il device alle push notifications
export async function subscribeToPush(staffId) {
  if (!isPushSupported()) {
    throw new Error('Push notifications non supportate da questo browser')
  }

  // Richiedi permesso
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    throw new Error('Permesso negato per le notifiche')
  }

  // Aspetta SW pronto
  const registration = await navigator.serviceWorker.ready

  // Sottoscrivi push manager (se già sottoscritto, ottiene la stessa)
  let subscription = await registration.pushManager.getSubscription()
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    })
  }

  // Estrai keys
  const p256dh = arrayBufferToBase64(subscription.getKey('p256dh'))
  const auth = arrayBufferToBase64(subscription.getKey('auth'))

  // Salva su DB (upsert per idempotenza)
  const { error } = await supabase
    .from('push_subscriptions')
    .upsert(
      {
        staff_id: staffId,
        endpoint: subscription.endpoint,
        p256dh,
        auth,
        user_agent: navigator.userAgent,
      },
      { onConflict: 'endpoint' }
    )

  if (error) throw error
  return subscription
}

// Rimuove la sottoscrizione push
export async function unsubscribeFromPush() {
  const registration = await navigator.serviceWorker.ready
  const subscription = await registration.pushManager.getSubscription()
  if (!subscription) return

  // Rimuovi da DB prima
  await supabase
    .from('push_subscriptions')
    .delete()
    .eq('endpoint', subscription.endpoint)

  // Poi unsubscribe dal browser
  await subscription.unsubscribe()
}
