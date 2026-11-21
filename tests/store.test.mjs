import assert from 'node:assert/strict'
const memory=new Map()
let relaunched=0
globalThis.uni={
 getStorageSync:k=>memory.get(k)||'',
 setStorageSync:(k,v)=>memory.set(k,v),
 removeStorageSync:k=>memory.delete(k),
 reLaunch:()=>{relaunched++}
}
const s=await import('../utils/store.js')
s.initialize()
assert.equal(s.posts().length,9)
assert.ok(s.posts().find(p=>p.category==='证件卡类').documentNo.includes('*'))
assert.equal(s.maskName('张小明'),'张**')
assert.equal(s.maskDocument('420123200012019876'),'4****************6')

// —— 登录第一步：学号格式与学校邮箱 ——
assert.equal(s.sha256Hex('abc'),'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
assert.equal(s.isStudentNo('2026302012345'),true)
assert.equal(s.isStudentNo('20260001'),false)
assert.equal(s.isStudentNo('202630201234'),false)
assert.equal(s.maskStudentNo('2026302012345'),'2026*****2345')
assert.equal(s.studentEmail('2026302012345'),'2026302012345@whu.edu.cn')
assert.equal(s.maskEmail('2026302012345@whu.edu.cn'),'2026*****2345@whu.edu.cn')
assert.equal(s.otpMode,'inline')
assert.equal((await s.requestCode('20260001')).code,'BAD_FORMAT')

// 演示模式：验证码回传给页面，不真正发信
const sent=await s.requestCode('2026302012345')
assert.equal(sent.ok,true)
assert.equal(sent.mode,'inline')
assert.equal(sent.email,'2026*****2345@whu.edu.cn')
assert.match(sent.devCode,/^\d{6}$/)
// 60 秒内不能重复获取
assert.equal((await s.requestCode('2026302012345')).code,'COOLDOWN')
// 验证码只以摘要保存，存储里搜不到明文
assert.ok(!JSON.stringify([...memory.values()]).includes(sent.devCode))

// —— 登录第二步：校验验证码 ——
assert.equal((await s.verifyCode('2026302012345','')).code,'BAD_CODE_FORMAT')
assert.equal((await s.verifyCode('2026302012345','12345')).code,'BAD_CODE_FORMAT')
const wrongCode=sent.devCode==='000000'?'000001':'000000'
const bad=await s.verifyCode('2026302012345',wrongCode)
assert.equal(bad.ok,false)
assert.equal(bad.code,'BAD_CODE')
assert.match(bad.message,/还可尝试 4 次/)
const first=await s.verifyCode('2026302012345',sent.devCode)
assert.equal(first.ok,true)
assert.equal(first.user.role,'user')
assert.equal(first.user.studentNo,'2026302012345')
assert.equal(first.user.email,'2026302012345@whu.edu.cn')
assert.ok(s.session().expiresAt>Date.now()+6*86400000)
assert.equal(s.lastStudentNo(),'2026302012345')
assert.equal(s.requireRole('user'),true)
assert.equal(s.requireRole('admin'),false)
assert.equal(relaunched,1)

// 用过的验证码不能再用
assert.equal((await s.verifyCode('2026302012345',sent.devCode)).code,'NO_CODE')

// —— 第一次登录自动建档（不需要管理员预先登记）——
async function signIn(no){
 memory.delete('wulost_login_codes_v1')
 const r=await s.requestCode(no)
 assert.equal(r.ok,true,no)
 const v=await s.verifyCode(no,r.devCode)
 return v
}
const fresh=await signIn('2026302019999')
assert.equal(fresh.ok,true)
assert.equal(fresh.user.name,'同学9999')
assert.equal(fresh.user.role,'user')
assert.equal(s.findUserByStudentNo('2026302019999').department,'待完善')

// 管理员由学号白名单判定
assert.equal((await signIn('2026900000001')).user.role,'admin')

// 停用账号不能登录
const users=JSON.parse(memory.get('wulost_users_v1'))
users.find(u=>u.studentNo==='2026302012348').status='disabled'
memory.set('wulost_users_v1',JSON.stringify(users))
assert.equal((await signIn('2026302012348')).code,'DISABLED')

// 验证码过期
await s.requestCode('2026302012346')
const codes=JSON.parse(memory.get('wulost_login_codes_v1'))
codes['2026302012346'].expiresAt=Date.now()-1000
memory.set('wulost_login_codes_v1',JSON.stringify(codes))
assert.equal((await s.verifyCode('2026302012346','123456')).code,'CODE_EXPIRED')

// 连续输错 5 次后作废
memory.delete('wulost_login_codes_v1')
const sent3=await s.requestCode('2026302012347')
let lastCode=null
for(let i=0;i<5;i++){const r=await s.verifyCode('2026302012347','000000'===sent3.devCode?'111111':'000000');lastCode=r.code}
assert.equal(lastCode,'CODE_LOCKED')

// 列表视图不含任何凭据
assert.equal(s.listUsers().length,7)
assert.ok(s.listUsers().every(u=>u.passwordHash===undefined&&u.salt===undefined))
assert.ok(s.listUsers().every(u=>u.email.endsWith('@whu.edu.cn')))

// 会话过期后自动失效
const expired=JSON.parse(memory.get('wulost_session_v1'))
expired.expiresAt=Date.now()-1000
memory.set('wulost_session_v1',JSON.stringify(expired))
assert.equal(s.session(),null)
assert.equal(s.requireRole('user'),false)
assert.equal((await signIn('2026302012345')).ok,true)

const newPost=s.publish({kind:'lost',category:'证件卡类',title:'身份证',location:'图书馆周边',description:'请帮忙找',holderName:'赵小华',documentNo:'110101199901010015',image:'unsafe-photo'})
assert.equal(newPost.holderName,'赵**')
assert.ok(newPost.documentNo.startsWith('1')&&newPost.documentNo.endsWith('5'))
assert.equal(newPost.image,'')
const stored=JSON.stringify([...memory.values()]);assert.ok(!stored.includes('赵小华'));assert.ok(!stored.includes('110101199901010015'));assert.ok(!stored.includes('unsafe-photo'))
assert.equal(newPost.status,'pending')
assert.equal(s.publishedPosts().find(x=>x.id===newPost.id),undefined)
assert.equal(s.editPost(newPost.id,{status:'approved'}),false)
assert.equal((await signIn('2026900000001')).user.role,'admin')
assert.equal(s.editPost(newPost.id,{status:'approved'}),true)
assert.equal(s.publishedPosts().find(x=>x.id===newPost.id).status,'approved')
assert.equal(s.savePlace({name:'已核实地点',address:'某栋一楼',hours:'九时至十七时',department:'值班室',verified:true}),true)
assert.equal(s.places().length,3)
assert.equal(s.editPost(newPost.id,{status:'returned'}),true)
assert.ok(s.stats().todayReturned>=1)
assert.equal(s.stats().trends.length,7)
assert.equal((await signIn('2026302012345')).ok,true)
assert.equal(s.requestClaim('r02','黑色耳机上面有我的挂饰'),true)
assert.equal(s.requestClaim('r02','重复申请'),false)
assert.equal((await signIn('2026900000001')).ok,true)
assert.equal(s.setClaimStatus(s.claims()[0].id,'approved'),true)
assert.equal(s.claims()[0].status,'approved')
s.logout()
assert.equal(s.session(),null)
console.log('通过：学号+邮箱验证码登录（格式/发信节流/错误码/过期/试错上限/自动建档/停用）、角色限制、证件脱敏、发布审核、地点管理、归还统计、认领流程')
