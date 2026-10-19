// Public Supabase settings only. Authorization always comes from the signed-in user.
const env = import.meta.env || {}
const url = (env.VITE_SUPABASE_URL || '').replace(/\/$/, '')
const key = env.VITE_SUPABASE_PUBLISHABLE_KEY || ''
export const cloudEnabled = Boolean(url && key && env.VITE_CLOUD_ENABLED === 'true')
const storageKey = 'wulost_real_auth_v1'
let refreshInFlight = null

function readSession() {
  try { return JSON.parse(uni.getStorageSync(storageKey) || 'null') } catch { return null }
}
function saveSession(value) {
  if (value) uni.setStorageSync(storageKey, JSON.stringify(value))
  else uni.removeStorageSync(storageKey)
}
function headers(token) {
  return { apikey: key, Authorization: `Bearer ${token || key}`, 'Content-Type': 'application/json' }
}
export function cloudRequest(path, { method = 'GET', data, token, extraHeaders = {} } = {}) {
  return new Promise((resolve, reject) => uni.request({
    url: `${url}${path}`, method, data, timeout: 45000,
    header: { ...headers(token), ...extraHeaders },
    success: result => {
      if (result.statusCode >= 200 && result.statusCode < 300) resolve(result.data)
      else reject(new Error(result.data?.msg || result.data?.message || result.data?.error_description || result.data?.error || `服务器返回 ${result.statusCode}`))
    },
    fail: () => reject(new Error('网络连接失败，请稍后重试'))
  }))
}
function normalizeAuth(data) {
  if (!data?.access_token || !data?.user?.id) throw new Error('邮箱尚未验证，或登录信息无效')
  const result = { ...data, expires_at: Math.floor(Date.now() / 1000) + Number(data.expires_in || 3600) }
  saveSession(result)
  return identity(result.user)
}
function identity(user) {
  const name = user.user_metadata?.display_name || String(user.email || '').split('@')[0] || '同学'
  const role = user.app_metadata?.role === 'admin' ? 'admin' : 'user'
  return { id: user.id, account: user.email, name, role, department: role === 'admin' ? '平台管理' : '校园用户' }
}
export function cachedIdentity() {
  const saved = readSession()
  return saved?.user ? identity(saved.user) : null
}
export async function cloudLogin(email, password) {
  const data = await cloudRequest('/auth/v1/token?grant_type=password', { method: 'POST', data: { email: email.trim(), password } })
  return normalizeAuth(data)
}
export async function cloudSignup(email, password) {
  const data = await cloudRequest('/auth/v1/signup', { method: 'POST', data: { email: email.trim(), password } })
  if (data?.access_token) return { identity: normalizeAuth(data), needsConfirmation: false }
  return { identity: null, needsConfirmation: true }
}
export async function cloudToken() {
  const saved = readSession()
  if (!saved?.refresh_token) throw new Error('请先登录真实账号')
  if (saved.access_token && saved.expires_at > Date.now() / 1000 + 90) return saved.access_token
  if (!refreshInFlight) refreshInFlight = cloudRequest('/auth/v1/token?grant_type=refresh_token', {
    method: 'POST', data: { refresh_token: saved.refresh_token }
  }).then(data => { normalizeAuth(data); return data.access_token }).catch(error => { saveSession(null); throw error }).finally(() => { refreshInFlight = null })
  return refreshInFlight
}
export async function cloudRestore() {
  const token = await cloudToken()
  const user = await cloudRequest('/auth/v1/user', { token })
  const saved = readSession()
  saveSession({ ...saved, user })
  return identity(user)
}
export async function cloudLogout() {
  const saved = readSession()
  saveSession(null)
  if (saved?.access_token) {
    try { await cloudRequest('/auth/v1/logout', { method: 'POST', token: saved.access_token }) } catch { /* local session is already removed */ }
  }
}
export async function table(name, { method = 'GET', query = '', data, prefer } = {}) {
  const token = await cloudToken()
  return cloudRequest(`/rest/v1/${name}${query}`, {
    method, data, token, extraHeaders: prefer ? { Prefer: prefer } : {}
  })
}
export async function callFunction(name, data) {
  const token = await cloudToken()
  return cloudRequest(`/functions/v1/${name}`, { method: 'POST', data, token })
}
function localTime(value) {
  if (!value) return ''
  return new Date(value).toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai', hour12: false }).slice(0, 16)
}
export function mapPost(row) {
  return { id: row.id, ownerId: row.owner_id, ownerName: row.owner_name, kind: row.kind,
    title: row.title, category: row.category, location: row.location, description: row.description,
    image: row.image, holderName: row.holder_name, documentNo: row.document_no,
    status: row.status, pointId: row.point_id || '', createdAt: localTime(row.created_at),
    returnedAt: localTime(row.returned_at) }
}
export function mapClaim(row) {
  return { id: row.id, postId: row.post_id, userId: row.user_id, userName: row.user_name,
    note: row.note, status: row.status, createdAt: localTime(row.created_at) }
}
export function mapPoint(row) {
  return { id: row.id, name: row.name, address: row.address, hours: row.hours,
    department: row.department, verified: row.verified }
}
