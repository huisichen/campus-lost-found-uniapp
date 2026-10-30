import {assistantAvailable,assistantCall} from './assistant-client.js'
import {imageDataUrl} from './photo.js'

// The DeepSeek secret is only read by Supabase Edge Functions.
export const aiAvailable = assistantAvailable
const cacheKey='wulost_assistant_index_v1'
const matchesKey='wulost_assistant_matches_v1'
function savedPairs(){try{return JSON.parse(uni.getStorageSync(matchesKey)||'[]')}catch{return []}}
export function savedAiMatches(userId,all){return savedPairs().map(x=>({...x,a:all.find(p=>p.id===x.sourceId),b:all.find(p=>p.id===x.targetId)})).filter(x=>x.a&&x.b&&[x.a.ownerId,x.b.ownerId].includes(userId)&&x.a.status==='approved'&&x.b.status==='approved').map(x=>x.a.ownerId===userId?x:{...x,a:x.b,b:x.a})}
function readCache(){try{return JSON.parse(uni.getStorageSync(cacheKey)||'{}')}catch{return {}}}
function publicItem(post){return {id:post.id,kind:post.kind,title:post.title,category:post.category,description:post.description,location:post.location,status:post.status,ownerId:post.ownerId,eventStart:post.eventStart||'',eventEnd:post.eventEnd||''}}
export function aiItemState(id){return readCache()[id]?.result||null}
export async function syncAiItem(post,privateDetails){
  if(!aiAvailable)throw new Error('智能服务尚未配置')
  const p=publicItem(post),signature=JSON.stringify({...p,image:post.category==='证件卡类'?'':post.image||''})
  const cached=readCache()[post.id]
  if(privateDetails===undefined&&cached?.signature===signature)return cached.result
  const image=post.category==='证件卡类'?'':await imageDataUrl(post.image||'')
  const result=await assistantCall('index',{item:{...p,image},...(privateDetails!==undefined?{privateDetails}:{})})
  const cache=readCache();cache[post.id]={signature,result};uni.setStorageSync(cacheKey,JSON.stringify(cache))
  return result
}

export async function recognizeItemImage(localPhotoPath) {
  if (!localPhotoPath) throw new Error('请先选择物品照片')
  if (!aiAvailable) throw new Error('图片识别服务尚未配置')
  const image = await imageDataUrl(localPhotoPath)
  const result=await assistantCall('analyze',{item:{id:'photo-preview',kind:'found',category:'其他',title:'待识别物品',image}})
  return result.features
}

// Current screens read persisted matches; this supports explicit server rechecks.
export async function matchLostItem(lost,candidates=[]) {
  if (!aiAvailable) throw new Error('智能匹配服务尚未配置')
  await syncAiItem(lost)
  const eligible=candidates.filter(p=>p.kind!==lost.kind&&p.status==='approved'&&p.ownerId!==lost.ownerId&&p.category===lost.category).slice(0,20)
  for(let i=0;i<eligible.length;i+=2)await Promise.all(eligible.slice(i,i+2).map(p=>syncAiItem(p)))
  const result=await assistantCall('match',{postId:lost.id})
  const matches=(Array.isArray(result?.matches)?result.matches:[]).filter(x=>eligible.some(p=>p.id===x.id))
  const previous=savedPairs().filter(x=>x.sourceId!==lost.id&&x.targetId!==lost.id)
  uni.setStorageSync(matchesKey,JSON.stringify([...matches.map(x=>({sourceId:lost.id,targetId:x.id,score:x.score,reason:x.reason})),...previous].slice(0,100)))
  return matches
}
export async function startClaimVerification(post,claimantId){await syncAiItem(post);return assistantCall('challenge',{postId:post.id,claimantId})}
export function answerClaimVerification(sessionId,questionNumber,answer){return assistantCall('answer',{sessionId,questionNumber,answer})}
export function takeVerificationReceipt(sessionId,postId,claimantId){return assistantCall('receipt',{sessionId,postId,claimantId})}
