self.addEventListener('push', event => {
  let payload = { title: '校园失物招领', body: '你有一条新的匹配提醒', url: './#/pages/mine/mine' }
  try { if (event.data) payload = { ...payload, ...event.data.json() } } catch { /* use safe fallback */ }
  event.waitUntil(self.registration.showNotification(payload.title, {
    body: payload.body, tag: payload.tag || 'lost-found-match', data: { url: payload.url }
  }))
})
self.addEventListener('notificationclick', event => {
  event.notification.close()
  const target = event.notification.data?.url || './#/pages/mine/mine'
  event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(open => {
    const existing = open.find(client => client.url.startsWith(self.registration.scope))
    return existing ? existing.focus().then(() => existing.navigate(target)) : clients.openWindow(target)
  }))
})
