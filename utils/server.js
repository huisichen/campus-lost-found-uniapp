// Python service mode; no server secrets belong in a client build.
const env=import.meta.env||{}
export const serverUrl=String(env.VITE_BACKEND_URL||'').replace(/\/$/,'')
export const serverEnabled=Boolean(serverUrl)
const key='wulost_python_session_v1'
let memory=null
function saved(){if(memory)return memory;try{return JSON.parse(uni.getStorageSync(key)||'null')}catch{return null}}
// 后端把「为什么失败」写在 error 字段里（请 60 秒后再获取验证码、该账号已停用…），
// 这里带上 HTTP 状态码，页面就能按 429 启动倒计时、按 401 踢回登录页。
function fail(message,status){const e=new Error(message);e.status=status||0;return e}
export function serverIdentity(){const s=saved();return s?.expiresAt>Date.now()?s.user:null}
export function serverRequest(path,{method='GET',data,authenticated=true}={}){
 const s=saved()
 if(authenticated&&!serverIdentity())return Promise.reject(fail('登录已失效，请重新登录',401))
 return new Promise((resolve,reject)=>uni.request({url:serverUrl+path,method,data,timeout:65000,header:{'Content-Type':'application/json',...(authenticated?{Authorization:`Bearer ${s.access_token}`}:{})},success:r=>{if(r.statusCode>=200&&r.statusCode<300)resolve(r.data);else{if(r.statusCode===401&&authenticated){memory=null;uni.removeStorageSync(key)}reject(fail(r.data?.error||'服务暂不可用，请稍后重试',r.statusCode))}},fail:()=>reject(fail('无法连接服务端，请检查网络',0))}))
}
export function serverSendCode(studentNo){return serverRequest('/auth/code',{method:'POST',data:{studentNo},authenticated:false})}
export async function serverVerifyCode(studentNo,code){const r=await serverRequest('/auth/verify',{method:'POST',data:{studentNo,code},authenticated:false});memory={access_token:r.access_token,user:r.user,expiresAt:Date.now()+r.expires_in*1000};uni.setStorageSync(key,JSON.stringify(memory));uni.setStorageSync('wulost_last_student_no_v1',studentNo);return r}
export async function serverRestore(){const user=await serverRequest('/auth/me');const s=saved();memory={...s,user};uni.setStorageSync(key,JSON.stringify(memory));return user}
export async function serverLogout(){try{if(serverIdentity())await serverRequest('/auth/logout',{method:'POST',data:{}})}finally{memory=null;uni.removeStorageSync(key)}}
export function serverTable(name,{method='GET',query='',data}={}){return serverRequest(`/data/${name}${query}`,{method,data})}
