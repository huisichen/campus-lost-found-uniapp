import { sendPushNotification } from 'npm:@mmmike/web-push@1.3.0/send'
import { prepareMatch, normalizeMatches } from '../_shared/matcher.js'
import { context, json, fail, service, secret, consumeQuota, deepseek } from '../_shared/cloud.js'

function safePushHost(endpoint) {
  try {
    const url = new URL(endpoint)
    const host = url.hostname.toLowerCase()
    return url.protocol === 'https:' && (
      host === 'fcm.googleapis.com' || host.endsWith('.push.services.mozilla.com') ||
      host.endsWith('.push.apple.com')
    )
  } catch { return false }
}
async function sendPush(ctx, userId, foundId, title) {
  const vapid = await secret(ctx, 'get_web_push_vapid')
  if (!vapid?.publicKey || !vapid?.privateKey) return { delivered: 0, reason: 'not-configured' }
  const subscriptions = await service(ctx, `push_subscriptions?select=endpoint,p256dh,auth_key&user_id=eq.${encodeURIComponent(userId)}&limit=10`)
  let delivered = 0
  for (const item of subscriptions) {
    if (!safePushHost(item.endpoint)) continue
    try {
      const success = await sendPushNotification(
        { endpoint: item.endpoint, keys: { p256dh: item.p256dh, auth: item.auth_key } },
        { title: '失物招领匹配提醒', body: `${title} 发现可能对应的物品，请进入“匹配提醒”核实。`,
          url: `https://huisichen.github.io/campus-lost-found-uniapp/#/pages/mine/mine`, tag: `match-${foundId}` },
        vapid, { ttl: 86400, timeoutMs: 8000 }
      )
      if (success) delivered++
      else await service(ctx, `push_subscriptions?endpoint=eq.${encodeURIComponent(item.endpoint)}`, { method: 'DELETE' })
    } catch { /* Persisted in-app notification still remains available. */ }
  }
  return { delivered }
}

Deno.serve(async request => {
  let origin = request.headers.get('Origin') || ''
  try {
    const ctx = await context(request)
    origin = ctx.origin
    if (ctx.preflight) return ctx.preflight
    if (ctx.user.app_metadata?.role !== 'admin') throw { status: 403, message: '仅管理员可以触发审核后匹配' }
    const { postId } = await request.json()
    if (!/^[\w-]{1,64}$/.test(postId || '')) throw { status: 400, message: '物品编号无效' }
    const rows = await service(ctx, `posts?select=*&id=eq.${encodeURIComponent(postId)}&limit=1`)
    const post = rows[0]
    if (!post || post.status !== 'approved') throw { status: 400, message: '物品尚未审核通过' }
    const opposite = post.kind === 'lost' ? 'found' : 'lost'
    const candidates = await service(ctx, `posts?select=*&status=eq.approved&kind=eq.${opposite}&category=eq.${encodeURIComponent(post.category)}&id=neq.${encodeURIComponent(post.id)}&order=created_at.desc&limit=5`)
    if (!candidates.length) return json({ matches: [], notifications: 0 }, 200, origin)
    const toItem = row => ({ id: row.id, title: row.title, category: row.category, location: row.location,
      description: row.description, image: row.category === '证件卡类' ? '' : row.image })
    const lost = post.kind === 'lost' ? post : candidates[0]
    const found = post.kind === 'found' ? post : null
    // When the newly approved item is found, each lost post is checked separately.
    const batches = post.kind === 'lost' ? [{ lost: post, found: candidates }] : candidates.map(row => ({ lost: row, found: [found] }))
    const created = []
    for (const batch of batches) {
      await consumeQuota(ctx)
      const prepared = prepareMatch({ lost: toItem(batch.lost), candidates: batch.found.map(toItem) })
      const answer = await deepseek(ctx, prepared.content, 500)
      const matches = normalizeMatches(answer, prepared.candidates)
      for (const match of matches) {
        const foundRow = batch.found.find(row => row.id === match.id)
        if (!foundRow) continue
        const recipients = [...new Set([batch.lost.owner_id, foundRow.owner_id])]
        for (const userId of recipients) {
          const inserted = await service(ctx, 'match_notifications?on_conflict=user_id,lost_id,found_id', {
            method: 'POST', prefer: 'resolution=ignore-duplicates,return=representation',
            data: { user_id: userId, lost_id: batch.lost.id, found_id: foundRow.id, score: match.score, reason: match.reason }
          })
          if (inserted?.length) {
            const push = await sendPush(ctx, userId, foundRow.id, batch.lost.title)
            created.push({ lostId: batch.lost.id, foundId: foundRow.id, userId, pushDelivered: push.delivered })
          }
        }
      }
    }
    return json({ matches: created.map(x => ({ id: x.foundId })), notifications: created.length,
      pushDelivered: created.reduce((sum, x) => sum + x.pushDelivered, 0) }, 200, origin)
  } catch (error) { return fail(error, origin) }
})
