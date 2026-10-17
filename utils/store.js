// 本机数据层。不可用作正式的身份认证、个人信息存储或权限控制。
export const CATEGORIES = ['证件卡类','电子数码','包袋衣物','生活用品','学习用品','钥匙卡类','其他']
export const LOST_AREAS = ['图书馆周边','教学楼区域','食堂周边','宿舍区域','体育场馆','校园道路','其他地点']
export const DEMO_ACCOUNTS = [
  {id:'u001',account:'20260001',password:'123456',name:'李同学',role:'user',department:'信息学部'},
  {id:'u002',account:'20260002',password:'123456',name:'王同学',role:'user',department:'文理学部'},
  {id:'admin',account:'管理员',password:'123456',name:'平台管理员',role:'admin',department:'平台管理'}
]
const K={posts:'wulost_posts_v1',places:'wulost_places_v1',claims:'wulost_claims_v1',session:'wulost_session_v1',init:'wulost_initialized_v1'}
function get(k, fallback){try{const a=uni.getStorageSync(k);return a?JSON.parse(a):fallback}catch(e){return fallback}}
function put(k,x){uni.setStorageSync(k,JSON.stringify(x));return x}
function pad(n){return String(n).padStart(2,'0')}
export function dateOnly(t=Date.now()){const d=new Date(t);return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`}
export function dateTime(t=Date.now()){const d=new Date(t);return `${dateOnly(t)} ${pad(d.getHours())}:${pad(d.getMinutes())}`}
function nDays(n){return dateTime(Date.now()-n*86400000)}
export function maskName(s){const v=String(s||'').trim();return v?v[0]+'**':''}
export function maskDocument(s){const a=String(s||'').trim().replace(/\s/g,'');return a.length>1?a[0]+'*'.repeat(Math.max(2,a.length-2))+a[a.length-1]:(a?'*':'')}
export function publicPost(p){if(!p)return null;const data={...p};if(data.category==='证件卡类'){data.holderName=maskIfNotMasked(data.holderName);data.documentNo=maskIfDocumentNotMasked(data.documentNo);data.image='';}delete data.privateImage;return data}
function maskIfNotMasked(a){return a&&a.includes('*')?a:maskName(a)}
function maskIfDocumentNotMasked(a){return a&&a.includes('*')?a:maskDocument(a)}
export function initialize(){
 if(get(K.init,false))return
 const points=[
  {id:'p1',name:'示例归还点一（待核实）',address:'请管理员填写学校实际地点',hours:'开放时间待核实',department:'负责人待配置',verified:false},
  {id:'p2',name:'示例归还点二（待核实）',address:'请管理员填写学校实际地点',hours:'开放时间待核实',department:'负责人待配置',verified:false}
 ]
 const posts=[
  {id:'r01',kind:'lost',title:'黑色双肩包',category:'包袋衣物',location:'图书馆周边',description:'黑色双肩包，侧面有白色小挂件，内有课本。',image:'/static/photos/backpack.jpg',createdAt:nDays(0),ownerId:'u001',ownerName:'李同学',status:'approved',pointId:''},
  {id:'r02',kind:'found',title:'白色无线耳机',category:'电子数码',location:'食堂周边',description:'捡到一副白色无线耳机，已交由工作人员保管。',image:'/static/photos/earbuds.jpg',createdAt:nDays(0),ownerId:'u002',ownerName:'王同学',status:'approved',pointId:'p1'},
  {id:'r03',kind:'lost',title:'学生证',category:'证件卡类',location:'教学楼区域',description:'蓝色证件套，遗失在教学楼附近。',image:'',holderName:'张**',documentNo:'2********5',createdAt:nDays(1),ownerId:'u001',ownerName:'李同学',status:'approved',pointId:''},
  {id:'r04',kind:'found',title:'银色钥匙串',category:'钥匙卡类',location:'图书馆周边',description:'钥匙串挂有玩偶挂件。',image:'/static/photos/keys.jpg',createdAt:nDays(1),ownerId:'u002',ownerName:'王同学',status:'approved',pointId:'p2'},
  {id:'r05',kind:'lost',title:'白色保温杯',category:'生活用品',location:'体育场馆',description:'白色保温杯，杯身有浅色图案。',image:'/static/photos/thermos.jpg',createdAt:nDays(2),ownerId:'u001',ownerName:'李同学',status:'returned',returnedAt:nDays(0),pointId:'p1'},
  {id:'r06',kind:'found',title:'黑色耳机',category:'电子数码',location:'宿舍区域',description:'黑色入耳式耳机，等待主人联系。',image:'/static/photos/earbuds.jpg',createdAt:nDays(3),ownerId:'u002',ownerName:'王同学',status:'approved',pointId:'p1'},
  {id:'r07',kind:'found',title:'校园卡',category:'证件卡类',location:'食堂周边',description:'卡面仅用于校内核实，公开信息已脱敏。',image:'',holderName:'陈**',documentNo:'6********2',createdAt:nDays(4),ownerId:'u002',ownerName:'王同学',status:'returned',returnedAt:nDays(1),pointId:'p2'},
  {id:'r08',kind:'lost',title:'深蓝色折叠伞',category:'生活用品',location:'校园道路',description:'深蓝色折叠雨伞，伞柄处有挂绳。',image:'',createdAt:nDays(5),ownerId:'u001',ownerName:'李同学',status:'approved',pointId:''},
  {id:'r09',kind:'lost',title:'透明文件袋',category:'学习用品',location:'教学楼区域',description:'文件袋内有复习资料。',image:'',createdAt:nDays(6),ownerId:'u002',ownerName:'王同学',status:'approved',pointId:''}
 ]
 put(K.points,points);put(K.posts,posts);put(K.claims,[]);put(K.init,true)
}
export function login(role,account,password){initialize();const a=DEMO_ACCOUNTS.find(x=>x.role===role&&x.account===account.trim()&&x.password===password);if(!a)return null;const s={id:a.id,name:a.name,role:a.role,department:a.department,account:a.account};put(K.session,s);return s}
export function session(){return get(K.session,null)}
export function logout(){try{uni.removeStorageSync(K.session)}catch(e){} }
export function requireRole(role){const s=session();if(!s||s.role!==role){uni.reLaunch({url:'/pages/login/login'});return false}return true}
export function posts(){initialize();return get(K.posts,[]).map(publicPost).sort((a,b)=>b.createdAt.localeCompare(a.createdAt))}
export function findPost(id){return posts().find(p=>p.id===id)||null}
export function publishedPosts(){return posts().filter(p=>['approved','returned'].includes(p.status))}
export function publish(input){initialize();const s=session();if(!s||s.role!=='user')throw Error('请先登录用户账号');
 const clean={...input};if(clean.category==='证件卡类'){clean.holderName=maskName(clean.holderName);clean.documentNo=maskDocument(clean.documentNo);clean.image=''}
 const p={id:`r${Date.now()}`,ownerId:s.id,ownerName:s.name,createdAt:dateTime(),status:'pending',pointId:'',...clean};
 // 白名单存储，避免意外将上传文件的临时路径、身份证原文等写入缓存。
 const safe={id:p.id,ownerId:p.ownerId,ownerName:p.ownerName,createdAt:p.createdAt,status:'pending',pointId:p.pointId||'',kind:p.kind,title:p.title,category:p.category,location:p.location,description:p.description||'',image:p.image||'',holderName:p.holderName||'',documentNo:p.documentNo||''}
 put(K.posts,[safe,...get(K.posts,[])]);return publicPost(safe)
}
export function editPost(id,patch){initialize();const s=session();const arr=get(K.posts,[]),i=arr.findIndex(p=>p.id===id);if(i<0)return false;const before=arr[i];if(!s||!(s.role==='admin'||(before.ownerId===s.id&&['closed'].includes(patch.status))))return false;
 const allowed=s.role==='admin'?['status','pointId','returnedAt']:['status'];for(const key of allowed){if(patch[key]!==undefined)before[key]=patch[key]};if(before.status==='returned'&&!before.returnedAt)before.returnedAt=dateTime();put(K.posts,arr);return true}
export function places(){initialize();return get(K.points,[])}
export function savePlace(data){initialize();if(session()?.role!=='admin')return false;const arr=places();const index=arr.findIndex(x=>x.id===data.id);const place={id:data.id||`p${Date.now()}`,name:data.name,address:data.address,hours:data.hours,department:data.department,verified:!!data.verified};if(index<0)arr.push(place);else arr[index]=place;put(K.points,arr);return true}
export function removePlace(id){if(session()?.role!=='admin')return false;const arr=places();if(posts().some(p=>p.pointId===id))return false;put(K.points,arr.filter(p=>p.id!==id));return true}
export function claims(){initialize();return get(K.claims,[])}
export function requestClaim(postId,note){initialize();const s=session(),p=findPost(postId);if(!s||s.role!=='user'||!p||p.kind!=='found'||p.ownerId===s.id||p.status!=='approved')return false;
 if(claims().some(c=>c.userId===s.id&&c.postId===postId&&c.status!=='rejected'))return false;
 put(K.claims,[{id:`c${Date.now()}`,postId,userId:s.id,userName:s.name,note:note.slice(0,140),status:'pending',createdAt:dateTime()},...claims()]);return true}
export function setClaimStatus(id,status){if(session()?.role!=='admin')return false;const arr=claims();const c=arr.find(x=>x.id===id);if(!c)return false;c.status=status;put(K.claims,arr);return true}
export function stats(){const all=posts(),today=dateOnly(),ds=[];for(let i=6;i>=0;i--){const day=dateOnly(Date.now()-i*86400000);ds.push({date:day.slice(5),lost:all.filter(x=>x.kind==='lost'&&x.createdAt.startsWith(day)).length,found:all.filter(x=>x.kind==='found'&&x.createdAt.startsWith(day)).length,returned:all.filter(x=>x.returnedAt?.startsWith(day)).length})}
 const locCount={};const categories={};for(const p of all){locCount[p.location]=(locCount[p.location]||0)+1;categories[p.category]=(categories[p.category]||0)+1}
 return {total:all.length,todayLost:all.filter(x=>x.kind==='lost'&&x.createdAt.startsWith(today)).length,todayFound:all.filter(x=>x.kind==='found'&&x.createdAt.startsWith(today)).length,todayReturned:all.filter(x=>x.returnedAt?.startsWith(today)).length,pending:all.filter(x=>x.status==='pending').length+claims().filter(x=>x.status==='pending').length,trends:ds,locations:Object.keys(locCount).map(name=>({name,value:locCount[name]})).sort((a,b)=>b.value-a.value),categories:Object.keys(categories).map(name=>({name,value:categories[name]})).sort((a,b)=>b.value-a.value)} }
export const STATUS={pending:'待审核',approved:'寻找中',returned:'已归还',rejected:'未通过',closed:'已关闭'}
export const CLAIM_STATUS={pending:'待核实',approved:'已通过',rejected:'未通过'}
export function categoryIcon(cat){return {'证件卡类':'id','电子数码':'phone','包袋衣物':'bag','生活用品':'cup','学习用品':'book','钥匙卡类':'key','其他':'other'}[cat]||'other'}
