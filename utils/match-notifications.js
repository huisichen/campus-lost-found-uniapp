const seenKey = 'wulost_ai_notified_v1'

export function requestMatchNotificationPermission() {
  if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
    // Called only from the user's tap on the existing "匹配提醒" tab.
    try { Notification.requestPermission()?.catch?.(() => {}) } catch { /* permission not available */ }
  }
}

export function notifyNewMatches(userId, matches) {
  let seen = []
  try { seen = JSON.parse(uni.getStorageSync(seenKey) || '[]') } catch { /* ignore corrupt cache */ }
  const incoming = matches.filter(match => !seen.includes(`${userId}:${match.a.id}:${match.b.id}`))
  if (!incoming.length) return
  const first = incoming[0]
  const message = `${first.a.title} 与 ${first.b.title} 可能是同一件物品，请在“匹配提醒”中核实。`
  if (typeof uni.createPushMessage === 'function') {
    // Local notification while the app is running; remote/background push needs UniPush.
    try { uni.createPushMessage({ title: '失物招领匹配提醒', content: message, payload: { postId: first.b.id } }) }
    catch { uni.showToast({ title: '发现可能匹配的物品', icon: 'none' }) }
  } else if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    new Notification('失物招领匹配提醒', { body: message })
  } else {
    uni.showToast({ title: '发现可能匹配的物品', icon: 'none' })
  }
  uni.setStorageSync(seenKey, JSON.stringify([...seen, ...incoming.map(match => `${userId}:${match.a.id}:${match.b.id}`)].slice(-200)))
}
