const endpoint=(import.meta.env||{}).VITE_ASSISTANT_URL||''
export const assistantAvailable=Boolean(endpoint&&(import.meta.env||{}).VITE_AI_ENABLED==='true')
const tokenKey='wulost_assistant_device_v1'
let bootstrap=null
function request(data,token){return new Promise((resolve,reject)=>uni.request({url:endpoint,method:'POST',data,timeout:65000,header:{'Content-Type':'application/json',...(token?{'x-assistant-token':token}:{})},success:r=>{if(r.statusCode>=200&&r.statusCode<300)resolve(r.data);else{const e=new Error(r.data?.error||'智能服务暂不可用');e.status=r.statusCode;reject(e)}},fail:()=>reject(new Error('智能服务连接失败，请检查网络后重试'))}))}
async function deviceToken(){
  const saved=uni.getStorageSync(tokenKey)
  if(saved)return saved
  if(!bootstrap)bootstrap=request({action:'bootstrap'}).then(data=>{if(!data.token)throw new Error('设备服务初始化失败');uni.setStorageSync(tokenKey,data.token);return data.token}).finally(()=>{bootstrap=null})
  return bootstrap
}
export async function assistantCall(action,data={}){
  if(!assistantAvailable)throw new Error('智能服务尚未配置')
  let token=await deviceToken()
  try{return await request({action,...data},token)}catch(e){if(e.status!==401)throw e;uni.removeStorageSync(tokenKey);uni.removeStorageSync('wulost_assistant_index_v1');token=await deviceToken();return request({action,...data},token)}
}
