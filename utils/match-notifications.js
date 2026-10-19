import {cloudEnabled, table, cachedIdentity} from './cloud.js'

const vapidPublicKey = (import.meta.env || {}).VITE_WEB_PUSH_PUBLIC_KEY || ''
const seenKey = 'wulost_ai_notified_v1'

function decodeKey(base64) {
  const padded = base64.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - base64.length % 4) % 4)
  const binary = atob(padded)
  return Uint8Array.from(binary, char => char.charCodeAt(0))
}

export async function requestMatchNotificationPermission() {
  if (!cloudEnabled) {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') await Notification.requestPermission()
    return false
  }
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window) ||
      typeof Notification === 'undefined' || !vapidPublicKey) return false
  // Call permission immediately from the existing tab tap, before an await loses user activation.
  const permission = Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission
  if (permission !== 'granted') return false
  const workerUrl = new URL('sw.js', document.baseURI).href
  const registration = await navigator.serviceWorker.register(workerUrl)
  let subscription = await registration.pushManager.getSubscription()
  if (!subscription) subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true, applicationServerKey: decodeKey(vapidPublicKey)
  })
  const serialized = subscription.toJSON()
  const user = cachedIdentity()
  if (!user) return false
  await table('push_subscriptions', { method: 'POST', query: '?on_conflict=endpoint',
    prefer: 'resolution=merge-duplicates',
    data: { endpoint: serialized.endpoint, user_id: user.id,
      p256dh: serialized.keys.p256dh, auth_key: serialized.keys.auth } })
  return true
}

export async function removePushSubscription() {
  if (!cloudEnabled || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
  const registration = await navigator.serviceWorker.getRegistration()
  const subscription = await registration?.pushManager.getSubscription()
  if (!subscription) return
  try { await table('push_subscriptions', { method: 'DELETE', query: `?endpoint=eq.${encodeURIComponent(subscription.endpoint)}` }) } catch { /* sign-out continues */ }
  await subscription.unsubscribe()
}

// Offline fixtures retain the old foreground-only notification behavior.
export function notifyNewMatches(userId, matches) {
  if (cloudEnabled) return
  let seen = []
  try { seen = JSON.parse(uni.getStorageSync(seenKey) || '[]') } catch { /* ignore */ }
  const incoming = matches.filter(match => !seen.includes(`${userId}:${match.a.id}:${match.b.id}`))
  if (!incoming.length) return
  const first = incoming[0]
  const message = `${first.a.title} 与 ${first.b.title} 可能是同一件物品，请在“匹配提醒”中核实。`
  if (typeof uni.createPushMessage === 'function') {
    try { uni.createPushMessage({ title: '失物招领匹配提醒', content: message, payload: { postId: first.b.id } }) }
    catch { uni.showToast({ title: '发现可能匹配的物品', icon: 'none' }) }
  } else if (typeof Notification !== 'undefined' && Notification.permission === 'granted') new Notification('失物招领匹配提醒', { body: message })
  else uni.showToast({ title: '发现可能匹配的物品', icon: 'none' })
  uni.setStorageSync(seenKey, JSON.stringify([...seen, ...incoming.map(match => `${userId}:${match.a.id}:${match.b.id}`)].slice(-200)))
}
