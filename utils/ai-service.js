// DeepSeek is called only by the Supabase Edge Function. Never put its key here.
const apiUrl = (import.meta.env.VITE_SUPABASE_URL || '').replace(/\/$/, '')
const publicKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || ''
const authStorageKey = 'wulost_supabase_anon_session_v1'

// Flip only after Auth anonymous sign-in and the deployed function are verified.
export const aiAvailable = Boolean(apiUrl && publicKey && import.meta.env.VITE_AI_ENABLED === 'true')

function request(url, options = {}) {
  return new Promise((resolve, reject) => {
    uni.request({
      url, method: options.method || 'GET', data: options.data,
      header: options.headers || {}, timeout: 30000,
      success: response => {
        if (response.statusCode >= 200 && response.statusCode < 300) resolve(response.data)
        else reject(new Error(response.data?.error || `服务暂不可用（${response.statusCode}）`))
      },
      fail: () => reject(new Error('网络连接失败，请稍后重试'))
    })
  })
}

function savedSession() {
  try { return JSON.parse(uni.getStorageSync(authStorageKey) || 'null') } catch { return null }
}

async function accessToken() {
  let current = savedSession()
  if (current?.access_token && current.expires_at > Date.now() / 1000 + 60) return current.access_token
  const headers = { apikey: publicKey, 'Content-Type': 'application/json' }
  if (current?.refresh_token) {
    try {
      current = await request(`${apiUrl}/auth/v1/token?grant_type=refresh_token`, {
        method: 'POST', headers, data: { refresh_token: current.refresh_token }
      })
    } catch { current = null }
  }
  if (!current?.access_token) {
    current = await request(`${apiUrl}/auth/v1/signup`, {
      method: 'POST', headers, data: { data: {} }
    })
  }
  if (!current?.access_token) throw new Error('无法建立安全会话，请检查 Supabase 匿名登录设置')
  current.expires_at = Math.floor(Date.now() / 1000) + Number(current.expires_in || 3600)
  uni.setStorageSync(authStorageKey, JSON.stringify(current))
  return current.access_token
}

function photoMime(path) {
  const suffix = String(path).split('?')[0].match(/\.(jpe?g|png|webp|gif)$/i)?.[1]?.toLowerCase()
  return suffix === 'png' ? 'image/png' : suffix === 'webp' ? 'image/webp' : suffix === 'gif' ? 'image/gif' : 'image/jpeg'
}

async function imageDataUrl(path) {
  if (!path) return ''
  if (path.startsWith('data:image/')) return path
  // H5 supports both packaged static assets and locally selected blob/file URLs.
  if (typeof window !== 'undefined') {
    const absolute = new URL(path, window.location.href).href
    const response = await fetch(absolute)
    if (!response.ok) throw new Error('无法读取物品照片，请重新选择图片')
    const blob = await response.blob()
    if (blob.size > 3 * 1024 * 1024) throw new Error('图片超过 3 MB，请压缩后重试')
    return await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.onerror = () => reject(new Error('照片读取失败'))
      reader.readAsDataURL(blob)
    })
  }
  if (typeof uni.getFileSystemManager === 'function') {
    return await new Promise((resolve, reject) => {
      uni.getFileSystemManager().readFile({
        filePath: path, encoding: 'base64',
        success: result => resolve(`data:${photoMime(path)};base64,${result.data}`),
        fail: () => reject(new Error('无法读取物品照片，请重新选择图片'))
      })
    })
  }
  throw new Error('当前设备暂不支持上传本地照片进行匹配')
}

function safeItem(item) {
  return {
    id: String(item.id).slice(0, 64),
    title: String(item.title || '').slice(0, 80),
    category: String(item.category || '').slice(0, 40),
    location: String(item.location || '').slice(0, 80),
    description: String(item.description || '').slice(0, 500)
  }
}

export async function matchLostItem(lost, found) {
  if (!aiAvailable) throw new Error('智能匹配服务尚未配置')
  if (lost?.kind !== 'lost' || !Array.isArray(found)) throw new Error('匹配资料不完整')
  const candidates = found.filter(item => item.kind === 'found' && item.status === 'approved' && item.category === lost.category && item.id !== lost.id).slice(0, 5)
  if (!candidates.length) return []
  const lostInput = safeItem(lost)
  const candidateInput = candidates.map(safeItem)
  if (lost.category !== '证件卡类') {
    lostInput.image = await imageDataUrl(lost.image)
    for (let i = 0; i < candidates.length; i++) candidateInput[i].image = await imageDataUrl(candidates[i].image)
  }
  const token = await accessToken()
  const data = await request(`${apiUrl}/functions/v1/ai-match`, {
    method: 'POST',
    headers: { apikey: publicKey, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    data: { lost: lostInput, candidates: candidateInput }
  })
  return Array.isArray(data?.matches) ? data.matches : []
}

// The previous "try image recognition" control remains in place; matching is the AI feature.
export async function recognizeItemImage(localPhotoPath) {
  if (!localPhotoPath) throw new Error('请先选择物品照片')
  throw new Error('图片自动分类尚未接入；请手动选择物品分类。照片匹配可在“我的－匹配提醒”中使用')
}
