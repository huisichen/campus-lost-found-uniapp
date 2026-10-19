import { context, json, fail, consumeQuota, deepseek } from '../_shared/cloud.js'

const allowed = new Set(['证件卡类','电子数码','包袋衣物','生活用品','学习用品','钥匙卡类','其他'])
const imagePattern = /^data:image\/(jpeg|png|gif|webp);base64,[A-Za-z0-9+/=]+$/
Deno.serve(async request => {
  let origin = request.headers.get('Origin') || ''
  try {
    const ctx = await context(request)
    origin = ctx.origin
    if (ctx.preflight) return ctx.preflight
    const raw = await request.text()
    if (raw.length > 4_300_000) throw { status: 413, message: '照片过大' }
    const { image } = JSON.parse(raw)
    if (typeof image !== 'string' || !imagePattern.test(image) || image.length > 4_200_000) throw { status: 400, message: '照片格式不支持' }
    await consumeQuota(ctx)
    const result = await deepseek(ctx, [
      { type: 'text', text: '识别照片中的主要物品，返回 JSON：{"category":"七个分类之一","title":"简短物品名称","description":"可见外观特征，不要臆测品牌、身份或地点"}。分类仅可从证件卡类、电子数码、包袋衣物、生活用品、学习用品、钥匙卡类、其他中选择。证件类不要抄录照片上的姓名或号码。' },
      { type: 'image_url', image_url: { url: image, detail: 'low' } }
    ], 250)
    const clean = value => String(value || '').slice(0, 160).replace(/\b1[3-9]\d{9}\b/g, '[号码已隐藏]').replace(/\b\d{15}(?:\d{2}[0-9Xx])?\b/g, '[证件号已隐藏]').replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[邮箱已隐藏]')
    return json({ category: allowed.has(result.category) ? result.category : '其他', title: clean(result.title).slice(0, 30), description: clean(result.description) }, 200, origin)
  } catch (error) { return fail(error, origin) }
})
