import {cloudEnabled, callFunction} from './cloud.js'
import {imageDataUrl} from './photo.js'

// The DeepSeek secret is only read by Supabase Edge Functions.
export const aiAvailable = cloudEnabled && (import.meta.env || {}).VITE_AI_ENABLED === 'true'

export async function recognizeItemImage(localPhotoPath) {
  if (!localPhotoPath) throw new Error('请先选择物品照片')
  if (!aiAvailable) throw new Error('图片识别服务尚未配置')
  const image = await imageDataUrl(localPhotoPath)
  return callFunction('ai-recognize', { image })
}

// Current screens read persisted matches; this supports explicit server rechecks.
export async function matchLostItem(lost) {
  if (!aiAvailable) throw new Error('智能匹配服务尚未配置')
  if (lost?.kind !== 'lost') throw new Error('请选择丢失物品')
  const result = await callFunction('ai-process', { postId: lost.id })
  return Array.isArray(result?.matches) ? result.matches : []
}
