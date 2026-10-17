import assert from 'node:assert/strict'
import { handleRequest, normalizeMatches, prepareMatch } from '../supabase/functions/_shared/matcher.js'

const lost = { id: 'l1', title: '黑色双肩包', category: '包袋衣物', location: '图书馆周边', description: '侧面有白色挂件' }
const found = { id: 'f1', title: '捡到黑色背包', category: '包袋衣物', location: '图书馆周边', description: '侧面有白色挂件' }
const sampleImage = 'data:image/jpeg;base64,/9j/2Q=='
const prepared = prepareMatch({ lost: { ...lost, image: sampleImage }, candidates: [{ ...found, image: sampleImage }] })
assert.equal(prepared.content.filter(x => x.type === 'image_url').length, 2)
assert.ok(prepared.content[0].text.includes('黑色双肩包'))
assert.equal(normalizeMatches({ matches: [{ id: 'f1', score: 92, reason: '挂件相似' }, { id: 'f1', score: 91 }, { id: 'bogus', score: 99 }, { id: 'f1', score: 60 }] }, [found]).length, 1)
assert.equal(prepareMatch({ lost: { ...lost, category: '证件卡类', image: sampleImage }, candidates: [{ ...found, category: '证件卡类', image: sampleImage }] }).content.filter(x => x.type === 'image_url').length, 0)
assert.throws(() => prepareMatch({ lost, candidates: [{ ...found, category: '钥匙卡类' }] }))
assert.throws(() => prepareMatch({ lost: { ...lost, image: 'https://bad.example/photo.jpg' }, candidates: [found] }))

const calls = []
const fetcher = async (url, options) => {
  calls.push({ url, options })
  if (url.includes('/auth/v1/user')) return Response.json({ id: '11111111-1111-1111-1111-111111111111' })
  if (url.includes('consume_ai_match_quota')) return Response.json(true)
  if (url.includes('get_deepseek_api_key')) return Response.json('server-only-secret')
  return Response.json({ choices: [{ message: { content: JSON.stringify({ matches: [{ id: 'f1', score: 87, reason: '颜色和挂件一致' }] }) } }] })
}
const request = new Request('https://example.supabase.co/functions/v1/ai-match', {
  method: 'POST', headers: { Origin: 'https://huisichen.github.io', Authorization: 'Bearer user-jwt', apikey: 'public-key' },
  body: JSON.stringify({ lost, candidates: [found] })
})
const result = await handleRequest(request, { supabaseUrl: 'https://example.supabase.co', serviceKey: 'server-key' }, fetcher)
assert.equal(result.status, 200)
assert.deepEqual((await result.json()).matches.map(x => x.id), ['f1'])
assert.equal(calls.length, 4)
assert.equal(calls[3].options.headers.Authorization, 'Bearer server-only-secret')
assert.equal(calls[3].options.body.includes('server-only-secret'), false)

const blocked = await handleRequest(new Request('https://example.supabase.co/functions/v1/ai-match', { method: 'POST', headers: { Origin: 'https://evil.example', Authorization: 'Bearer user-jwt' }, body: '{}' }), {}, fetcher)
assert.equal(blocked.status, 403)
console.log('通过：图片与文字输入、证件照片排除、候选校验、服务端密钥、调用额度、响应清洗')
