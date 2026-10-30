// Attribute vectors, not learned image embeddings. Both modalities use this same schema.
export const CATEGORIES = ['证件卡类','电子数码','包袋衣物','生活用品','学习用品','钥匙卡类','其他']
const COLORS = ['黑','白','灰','银','金','红','橙','黄','绿','蓝','紫','粉','棕','透明']
const MATERIALS = ['金属','塑料','皮革','布','尼龙','玻璃','陶瓷','纸','硅胶','橡胶','木','其他']
const SHAPES = ['背包','手提包','钱包','耳机','手机','电脑','杯','伞','钥匙','卡','文件','书','衣服','其他']
export function scrub(value, max=500) {
  return String(value || '').trim().slice(0,max).replace(/\b1[3-9]\d{9}\b/g,'[隐私已省略]').replace(/\b\d{15}(?:\d{2}[0-9Xx])?\b/g,'[隐私已省略]')
}
function list(value,max=8) { return [...new Set((Array.isArray(value)?value:[]).map(x=>scrub(x,30)).filter(Boolean))].slice(0,max) }
export function normalizeFeatures(raw={}) {
  return {category:CATEGORIES.includes(raw.category)?raw.category:'其他',title:scrub(raw.title,30),description:scrub(raw.description,200),
    colors:list(raw.colors).filter(x=>COLORS.includes(x)),materials:list(raw.materials).filter(x=>MATERIALS.includes(x)),
    shape:SHAPES.includes(raw.shape)?raw.shape:'其他',brand:scrub(raw.brand,30).toLowerCase(),tags:list(raw.tags,10)}
}
function hash(text) { let n=2166136261;for(const c of text){n^=c.codePointAt(0);n=Math.imul(n,16777619)}return n>>>0 }
export function featureVector(features) {
  const f=normalizeFeatures(features),v=Array(128).fill(0)
  for(const c of f.colors)v[COLORS.indexOf(c)]=2
  for(const m of f.materials)v[14+MATERIALS.indexOf(m)]=1.3
  if(f.shape!=='其他')v[26+SHAPES.indexOf(f.shape)]=2
  if(f.brand&&f.brand!=='未知')v[40+hash(f.brand)%32]=2
  for(const tag of f.tags)v[72+hash(tag)%56]+=1
  const norm=Math.hypot(...v)
  return norm?v.map(x=>Number((x/norm).toFixed(6))):v
}
export function cosine(a,b) { if(!Array.isArray(a)||!Array.isArray(b)||a.length!==128||b.length!==128)return 0;const n=Math.hypot(...a)*Math.hypot(...b);return n?Math.max(0,Math.min(1,a.reduce((s,x,i)=>s+x*b[i],0)/n)):0 }
function timeCompatibility(a,b) {
  const la=a.kind==='lost'?a:b,fo=a.kind==='found'?a:b
  const start=Date.parse(la.eventStart||''),end=Date.parse(la.eventEnd||la.eventStart||''),found=Date.parse(fo.eventStart||''),foundEnd=Date.parse(fo.eventEnd||fo.eventStart||'')
  if(!Number.isFinite(start)||!Number.isFinite(found))return {value:.5,label:'未填写相关日期'}
  if((Number.isFinite(foundEnd)?foundEnd:found)<start-86400000)return {value:0,label:'拾取日期早于丢失范围'}
  const lostEnd=Number.isFinite(end)?end:start
  if(found<=lostEnd&&(Number.isFinite(foundEnd)?foundEnd:found)>=start)return {value:1,label:'相关日期范围重合'}
  const gap=Math.max(0,found-lostEnd)/86400000
  return {value:Math.max(0,1-gap/30),label:gap<=1?'相关日期接近':`日期相隔约 ${Math.ceil(gap)} 天`}
}
export function rankPair(a,b) {
  const p=a.public_item,q=b.public_item
  if(p.kind===q.kind||p.id===q.id||p.ownerId===q.ownerId||p.status!=='approved'||q.status!=='approved'||p.category!==q.category)return null
  const f=a.features,g=b.features,similarity=cosine(a.vector,b.vector)
  const colorConflict=f.colors.length&&g.colors.length&&!f.colors.some(x=>g.colors.includes(x))
  const shapeConflict=f.shape!=='其他'&&g.shape!=='其他'&&f.shape!==g.shape
  const brandConflict=f.brand&&g.brand&&f.brand!=='未知'&&g.brand!=='未知'&&f.brand!==g.brand
  const date=timeCompatibility(p,q),location=p.location&&p.location===q.location
  let score=Math.round(76*similarity+12+8*(location?1:.25)+4*date.value)
  if(colorConflict||shapeConflict||brandConflict)score=Math.min(score,55)
  if(date.value===0)score=Math.min(score,60)
  const reasons=[`属性向量相似度 ${Math.round(similarity*100)}%`,location?'地点一致':'地点不同，需进一步核实',date.label]
  if(colorConflict)reasons.push('颜色存在冲突')
  if(brandConflict)reasons.push('品牌存在冲突')
  return {id:q.id,score,similarity:Number(similarity.toFixed(4)),reason:reasons.join('；')}
}
export const QUESTIONS={lining:'物品内侧或内衬是什么颜色、材质？',zipper:'拉链头、扣件有什么特别的样式或使用痕迹？',contents:'物品里面有哪些不对外公开的内容物？',mark:'不易被看见的位置有什么特别标记？',wear:'物品的磨损或划痕具体在什么位置、是什么样子？',accessory:'物品上不易看见的附件有什么特点？',other:'请描述拾获者登记的一处隐蔽细节。'}
export function normalizeChecks(raw,publicText='') {
  const seen=new Set(),text=publicText.replace(/\s/g,'')
  return (Array.isArray(raw?.checks)?raw.checks:[]).filter(x=>{
    if(!x||!QUESTIONS[x.dimension]||seen.has(x.dimension))return false
    const answer=scrub(x.answer,160)
    if(answer.length<2||text.includes(answer.replace(/\s/g,'')))return false
    seen.add(x.dimension);return true
  }).slice(0,4).map(x=>({dimension:x.dimension,question:QUESTIONS[x.dimension],answer:scrub(x.answer,160),critical:x.critical===true}))
}
export function verificationDecision(checks,answers) {
  const matched=answers.filter(x=>x.verdict==='match'&&x.confidence>=.8).length
  const criticalFailed=checks.some((x,i)=>x.critical&&answers[i]?.verdict!=='match')
  return checks.length>=2&&answers.length===checks.length&&matched/checks.length>=.75&&!criticalFailed?'recommended':'manual'
}
export function explicitAnswerMatch(expected,answer) {
  if(/不|没|无|或|可能|也许|猜|忽略|指令|输出|系统|match|verdict/i.test(answer))return false
  const normalize=s=>String(s).normalize('NFKC').replace(/[\s，。；、：:,.!！的]/g,'').replace(/夹层|里面|内侧|内衬|内袋|里|有|一个|一只|是|为|放着/g,'')
  const e=normalize(expected),a=normalize(answer)
  return e.length>=2&&a===e
}
export function safeVerification(row) {
  const answers=Array.isArray(row.answers)?row.answers:[]
  return {sessionId:row.id,decision:row.result?.decision||'in_progress',completed:answers.length,total:row.checks.length,
    checks:answers.map((x,i)=>({question:row.checks[i].question,verdict:x.verdict})),
    question:row.result?null:{number:answers.length+1,total:row.checks.length,text:row.checks[answers.length]?.question||''}}
}
