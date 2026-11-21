// 身份层（方案 C：学号 + 学校邮箱验证码）。
//
// 流程：输入 13 位学号 → 把 6 位验证码发到「学号@whu.edu.cn」→ 输入验证码 → 建立本机会话。
//
// 边界必须说清楚（不要当成真实认证）：
//   1. 账号表、验证码、会话全部保存在本机 localStorage，改写本地存储即可伪造身份；
//   2. 默认 otpMode='inline' 是演示模式，验证码不会真的发邮件，而是回传给页面显示；
//      配置 VITE_OTP_MODE=supabase 且填好 VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY
//      之后，才会通过 Supabase Auth 的邮件 OTP 真正发到学校邮箱；
//   3. 管理员身份现在由学号白名单判定，正式上线必须由服务端判定；
//   4. 会话凭证由前端生成，正式上线应由服务端签发。
//
// 换成服务端认证时只改本文件的 requestCode / verifyCode / session / listUsers，页面不用动。
const USERS_KEY = 'wulost_users_v1'
const SESSION_KEY = 'wulost_session_v1'
const LAST_NO_KEY = 'wulost_last_student_no_v1'
const CODES_KEY = 'wulost_login_codes_v1'

export const STUDENT_NO_LENGTH = 13
export const SESSION_DAYS = 7
export const CODE_TTL_MS = 5 * 60 * 1000
export const RESEND_SECONDS = 60
export const MAX_CODE_ATTEMPTS = 5
// 学号即学校邮箱前缀（武汉大学学生邮箱为「学号@whu.edu.cn」）。
// 如果你们学校的邮箱域名不是这个，只改这一行。
export const EMAIL_DOMAIN = '@whu.edu.cn'

const env = (typeof import.meta !== 'undefined' && import.meta.env) ? import.meta.env : {}
// 'inline'（默认，演示）| 'supabase'（真实发信，需要 Supabase Auth 已开通邮件服务）
export const otpMode = env.VITE_OTP_MODE === 'supabase' ? 'supabase' : 'inline'
const SUPABASE_URL = env.VITE_SUPABASE_URL || ''
const SUPABASE_KEY = env.VITE_SUPABASE_PUBLISHABLE_KEY || ''

// 管理员学号白名单。方案 C 没有服务端，只能先这样判定；正式版必须换成数据库里的 role 字段。
const ADMIN_STUDENT_NOS = ['2026900000001']

// 预置档案：只为了演示数据有归属（示例物品的 ownerId 是 u001/u002）。
// 其他学号第一次登录时会自动建档，不再需要管理员手工登记。
const SEED_USERS = [
  {id:'u001',studentNo:'2026302012345',name:'李同学',department:'信息学部',role:'user'},
  {id:'u002',studentNo:'2026302012346',name:'王同学',department:'文理学部',role:'user'},
  {id:'u003',studentNo:'2026302012347',name:'张同学',department:'工学部',role:'user'},
  {id:'u004',studentNo:'2026302012348',name:'陈同学',department:'医学部',role:'user'},
  {id:'u005',studentNo:'2026302012349',name:'周同学',department:'理学部',role:'user'},
  {id:'admin',studentNo:'2026900000001',name:'平台管理员',department:'平台管理',role:'admin'}
]

function readUsers(){
  try{const raw=uni.getStorageSync(USERS_KEY);const list=raw?JSON.parse(raw):null;return Array.isArray(list)?list:[]}catch(e){return []}
}
function writeUsers(list){uni.setStorageSync(USERS_KEY,JSON.stringify(list));return list}
function seedUsers(){
  const list=readUsers()
  if(list.length){
    // 旧版本留下的 salt / passwordHash 已经没有用了，顺手清掉
    let dirty=false
    list.forEach(u=>{if(u.passwordHash!==undefined||u.salt!==undefined){delete u.passwordHash;delete u.salt;dirty=true}})
    if(dirty)writeUsers(list)
    return
  }
  const now=Date.now()
  writeUsers(SEED_USERS.map(u=>({...u,status:'active',createdAt:now,lastLoginAt:0,verifiedAt:0})))
}
function readCodes(){
  try{const raw=uni.getStorageSync(CODES_KEY);const o=raw?JSON.parse(raw):null;return o&&typeof o==='object'?o:{}}catch(e){return {}}
}
function writeCodes(o){uni.setStorageSync(CODES_KEY,JSON.stringify(o));return o}

export function isStudentNo(value){return /^\d{13}$/.test(String(value==null?'':value).trim())}

export function maskStudentNo(value){
  const s=String(value==null?'':value).trim()
  if(!s)return ''
  if(s.length<=4)return s[0]+'***'
  return s.slice(0,4)+'*'.repeat(Math.max(3,s.length-8))+s.slice(-4)
}

export function studentEmail(studentNo){
  const no=String(studentNo==null?'':studentNo).trim()
  return no?no+EMAIL_DOMAIN:''
}

export function maskEmail(email){
  const s=String(email==null?'':email).trim()
  const at=s.indexOf('@')
  if(at<0)return s
  return maskStudentNo(s.slice(0,at))+s.slice(at)
}

// 只读的账号视图：不含任何可用于登录的凭据。
export function listUsers(){
  seedUsers()
  return readUsers().map(u=>({
    id:u.id,studentNo:u.studentNo,name:u.name,department:u.department,role:u.role,
    email:studentEmail(u.studentNo),status:u.status||'active',
    lastLoginAt:u.lastLoginAt||0,verifiedAt:u.verifiedAt||0,createdAt:u.createdAt||0
  }))
}

export function findUserByStudentNo(studentNo){
  seedUsers()
  const no=String(studentNo==null?'':studentNo).trim()
  return listUsers().find(u=>u.studentNo===no)||null
}

export function lastStudentNo(){
  try{return String(uni.getStorageSync(LAST_NO_KEY)||'')}catch(e){return ''}
}

// —— 第一步：获取验证码 ——
// 返回 {ok:true, email, mode, devCode?}；演示模式下 devCode 是给页面显示的验证码。
export async function requestCode(studentNo){
  seedUsers()
  const no=String(studentNo==null?'':studentNo).trim()
  if(!isStudentNo(no))return fail('BAD_FORMAT',`请输入 ${STUDENT_NO_LENGTH} 位学号`)
  const email=studentEmail(no)
  const codes=readCodes()
  const rec=codes[no]
  const now=Date.now()
  if(rec&&rec.sentAt&&now-rec.sentAt<RESEND_SECONDS*1000){
    const left=Math.ceil((RESEND_SECONDS*1000-(now-rec.sentAt))/1000)
    return fail('COOLDOWN',`请 ${left} 秒后再获取验证码`)
  }

  if(otpMode==='supabase'){
    if(!SUPABASE_URL||!SUPABASE_KEY)return fail('NOT_CONFIGURED','未配置邮件服务，无法发送验证码')
    try{
      const res=await fetch(`${SUPABASE_URL}/auth/v1/otp`,{
        method:'POST',
        headers:{'Content-Type':'application/json',apikey:SUPABASE_KEY,Authorization:`Bearer ${SUPABASE_KEY}`},
        body:JSON.stringify({email,create_user:true})
      })
      if(!res.ok)return fail('SEND_FAIL','验证码发送失败，请稍后再试')
    }catch(e){
      return fail('SEND_FAIL','验证码发送失败，请检查网络')
    }
    delete codes[no]
    writeCodes(codes)
    return {ok:true,email:maskEmail(email),mode:'supabase'}
  }

  const code=randomCode()
  codes[no]={codeHash:sha256Hex(`${no}:${code}`),expiresAt:now+CODE_TTL_MS,attempts:0,sentAt:now}
  writeCodes(codes)
  return {ok:true,email:maskEmail(email),mode:'inline',devCode:code}
}

// —— 第二步：校验验证码并建立会话 ——
export async function verifyCode(studentNo,code){
  seedUsers()
  const no=String(studentNo==null?'':studentNo).trim()
  const input=String(code==null?'':code).trim()
  if(!isStudentNo(no))return fail('BAD_FORMAT',`请输入 ${STUDENT_NO_LENGTH} 位学号`)
  if(!/^\d{6}$/.test(input))return fail('BAD_CODE_FORMAT','请输入 6 位验证码')

  const email=studentEmail(no)
  if(otpMode==='supabase'){
    if(!SUPABASE_URL||!SUPABASE_KEY)return fail('NOT_CONFIGURED','未配置邮件服务，无法校验验证码')
    try{
      const res=await fetch(`${SUPABASE_URL}/auth/v1/verify`,{
        method:'POST',
        headers:{'Content-Type':'application/json',apikey:SUPABASE_KEY},
        body:JSON.stringify({type:'email',email,token:input})
      })
      if(!res.ok)return fail('BAD_CODE','验证码不正确或已过期')
    }catch(e){
      return fail('VERIFY_FAIL','校验失败，请检查网络')
    }
    return completeLogin(no)
  }

  const codes=readCodes()
  const rec=codes[no]
  if(!rec)return fail('NO_CODE','请先获取验证码')
  if(rec.expiresAt<=Date.now()){
    delete codes[no];writeCodes(codes)
    return fail('CODE_EXPIRED','验证码已过期，请重新获取')
  }
  if((rec.attempts||0)>=MAX_CODE_ATTEMPTS){
    delete codes[no];writeCodes(codes)
    return fail('CODE_LOCKED','验证码错误次数过多，请重新获取')
  }
  if(sha256Hex(`${no}:${input}`)!==rec.codeHash){
    rec.attempts=(rec.attempts||0)+1
    writeCodes(codes)
    const left=MAX_CODE_ATTEMPTS-rec.attempts
    return left>0?fail('BAD_CODE',`验证码不正确，还可尝试 ${left} 次`):fail('CODE_LOCKED','验证码错误次数过多，请重新获取')
  }
  delete codes[no]
  writeCodes(codes)
  return completeLogin(no)
}

// 校验通过后的统一出口：建档（首次登录自动建档）→ 更新登录时间 → 写会话。
function completeLogin(no){
  const list=readUsers()
  let user=list.find(u=>u.studentNo===no)
  const now=Date.now()
  if(!user){
    user={
      id:'s'+no,studentNo:no,
      name:'同学'+no.slice(-4),department:'待完善',
      role:ADMIN_STUDENT_NOS.includes(no)?'admin':'user',
      status:'active',createdAt:now,lastLoginAt:0,verifiedAt:0
    }
    list.push(user)
  }
  if((user.status||'active')==='disabled')return fail('DISABLED','该账号已停用，请联系管理员')
  if(ADMIN_STUDENT_NOS.includes(no))user.role='admin'
  user.lastLoginAt=now
  user.verifiedAt=now
  user.fails=0
  writeUsers(list)
  const sessionUser={
    id:user.id,studentNo:user.studentNo,name:user.name,role:user.role,department:user.department,
    email:studentEmail(user.studentNo),loginAt:now,expiresAt:now+SESSION_DAYS*86400000
  }
  uni.setStorageSync(SESSION_KEY,JSON.stringify(sessionUser))
  try{uni.setStorageSync(LAST_NO_KEY,no)}catch(e){}
  return {ok:true,user:sessionUser}
}

function fail(code,message){return {ok:false,code,message}}

function randomCode(){
  const n=Math.floor(Math.random()*1000000)
  return String(n).padStart(6,'0')
}

export function session(){
  let s=null
  try{const raw=uni.getStorageSync(SESSION_KEY);s=raw?JSON.parse(raw):null}catch(e){s=null}
  if(!s||!s.id)return null
  if(!s.expiresAt||s.expiresAt<=Date.now()){logout();return null}
  return s
}

export function logout(){try{uni.removeStorageSync(SESSION_KEY)}catch(e){} }

export function requireRole(role){
  const s=session()
  if(!s||s.role!==role){uni.reLaunch({url:'/pages/login/login'});return false}
  return true
}

// —— SHA-256（纯 JS，避免依赖 crypto.subtle：小程序与 App 端没有这个 API）——
const K256=[
  0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
  0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
  0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
  0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
  0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
  0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
  0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
  0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2
]
function rotr(x,n){return (x>>>n)|(x<<(32-n))}
function utf8Bytes(text){
  const out=[]
  const str=String(text)
  for(let i=0;i<str.length;i++){
    let c=str.charCodeAt(i)
    if(c<0x80)out.push(c)
    else if(c<0x800)out.push(0xc0|(c>>6),0x80|(c&63))
    else if(c>=0xd800&&c<=0xdbff){
      const c2=str.charCodeAt(++i)
      const cp=0x10000+((c-0xd800)<<10)+(c2-0xdc00)
      out.push(0xf0|(cp>>18),0x80|((cp>>12)&63),0x80|((cp>>6)&63),0x80|(cp&63))
    }else out.push(0xe0|(c>>12),0x80|((c>>6)&63),0x80|(c&63))
  }
  return out
}
export function sha256Hex(text){
  const data=utf8Bytes(text)
  const bitLen=data.length*8
  data.push(0x80)
  while(data.length%64!==56)data.push(0)
  const hi=Math.floor(bitLen/4294967296),lo=bitLen>>>0
  data.push((hi>>>24)&255,(hi>>>16)&255,(hi>>>8)&255,hi&255)
  data.push((lo>>>24)&255,(lo>>>16)&255,(lo>>>8)&255,lo&255)
  const h=[0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19]
  const w=new Array(64)
  for(let i=0;i<data.length;i+=64){
    for(let j=0;j<16;j++)w[j]=((data[i+j*4]<<24)|(data[i+j*4+1]<<16)|(data[i+j*4+2]<<8)|data[i+j*4+3])|0
    for(let j=16;j<64;j++){
      const s0=rotr(w[j-15],7)^rotr(w[j-15],18)^(w[j-15]>>>3)
      const s1=rotr(w[j-2],17)^rotr(w[j-2],19)^(w[j-2]>>>10)
      w[j]=(w[j-16]+s0+w[j-7]+s1)|0
    }
    let a=h[0],b=h[1],c=h[2],d=h[3],e=h[4],f=h[5],g=h[6],hh=h[7]
    for(let j=0;j<64;j++){
      const S1=rotr(e,6)^rotr(e,11)^rotr(e,25)
      const ch=(e&f)^(~e&g)
      const t1=(hh+S1+ch+K256[j]+w[j])|0
      const S0=rotr(a,2)^rotr(a,13)^rotr(a,22)
      const maj=(a&b)^(a&c)^(b&c)
      const t2=(S0+maj)|0
      hh=g;g=f;f=e;e=(d+t1)|0;d=c;c=b;b=a;a=(t1+t2)|0
    }
    h[0]=(h[0]+a)|0;h[1]=(h[1]+b)|0;h[2]=(h[2]+c)|0;h[3]=(h[3]+d)|0
    h[4]=(h[4]+e)|0;h[5]=(h[5]+f)|0;h[6]=(h[6]+g)|0;h[7]=(h[7]+hh)|0
  }
  return h.map(x=>(x>>>0).toString(16).padStart(8,'0')).join('')
}
