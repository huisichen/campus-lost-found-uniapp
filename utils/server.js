// Python service mode; no server secrets belong in a client build.
const env=import.meta.env||{}
export const serverUrl=String(env.VITE_BACKEND_URL||'').replace(/\/$/,'')
export const serverEnabled=Boolean(serverUrl)
const key='wulost_python_session_v1'
let memory=null
function saved(){if(memory)return memory;try{return JSON.parse(uni.getStorageSync(key)||'null')}catch{return null}}
export function serverIdentity(){const s=saved();return s?.expiresAt>Date.now()?s.user:null}
export function serverRequest(path,{method='GET',data,authenticated=true}={}){
 const s=saved()
 if(authenticated&&!serverIdentity())return Promise.reject(new Error('登录已失效，请重新登录'))
 return new Promise((resolve,reject)=>uni.request({url:serverUrl+path,method,data,timeout:65000,header:{'Content-Type':'application/json',...(authenticated?{Authorization:`Bearer ${s.access_token}`}:{})},success:r=>{if(r.statusCode>=200&&r.statusCode<300)resolve(r.data);else{if(r.statusCode===401&&authenticated){memory=null;uni.removeStorageSync(key)}reject(new Error(r.data?.error||'服务暂不可用，请稍后重试'))}},fail:()=>reject(new Error('无法连接服务端，请检查网络'))}))
}
export function serverSendCode(studentNo){return serverRequest('/auth/code',{method:'POST',data:{studentNo},authenticated:false})}
export async function serverVerifyCode(studentNo,code){const r=await serverRequest('/auth/verify',{method:'POST',data:{studentNo,code},authenticated:false});memory={access_token:r.access_token,user:r.user,expiresAt:Date.now()+r.expires_in*1000};uni.setStorageSync(key,JSON.stringify(memory));uni.setStorageSync('wulost_last_student_no_v1',studentNo);return r}
export async function serverRestore(){const user=await serverRequest('/auth/me');const s=saved();memory={...s,user};uni.setStorageSync(key,JSON.stringify(memory));return user}
export async function serverLogout(){try{if(serverIdentity())await serverRequest('/auth/logout',{method:'POST',data:{}})}finally{memory=null;uni.removeStorageSync(key)}}
export function serverTable(name,{method='GET',query='',data}={}){return serverRequest(`/data/${name}${query}`,{method,data})}
