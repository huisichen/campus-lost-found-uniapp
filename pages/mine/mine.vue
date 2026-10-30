<template>
<view class="page-body">
 <view class="mine-header"><view class="flex-between"><text class="title-white">我的</text><view @tap="signOut" class="exit"><AppIcon name="logout" :size="30"/>退出</view></view><view class="user-summary"><view class="avatar"><AppIcon name="user" :size="58"/></view><view><text class="username">{{who?.name||'同学'}}</text><text class="department">{{who?.department}} · 体验账号</text></view></view></view>
 <view class="counts"><view><text>{{mine.length}}</text><text>我的发布</text></view><view><text>{{myClaims.length}}</text><text>我的认领</text></view><view><text>{{mine.filter(x=>x.status==='returned').length}}</text><text>已归还</text></view></view>
 <view class="mine-tabs"><view :class="tab==='posts'?'current':''" @tap="tab='posts'">我的发布</view><view :class="tab==='claims'?'current':''" @tap="tab='claims'">我的认领</view><view :class="tab==='matches'?'current':''" @tap="openMatches">匹配提醒</view></view>
 <view class="mine-content">
  <template v-if="tab==='posts'"><view v-for="p in mine" :key="p.id" class="mine-record" @tap="open(p.id)"><view class="flex-between"><text class="rec-title">{{p.title}}</text><text class="pill" :class="p.status==='pending'?'pill-wait':''">{{STATUS[p.status]}}</text></view><view class="rec-sub">{{p.kind==='lost'?'丢失':'招领'}} · {{p.location}} · {{p.createdAt.slice(0,10)}}</view><view class="rec-actions"><text @tap.stop="open(p.id)">查看详情 ›</text><text v-if="p.status==='approved'||p.status==='pending'" @tap.stop="closePost(p)">撤回信息</text></view></view><view v-if="!mine.length" class="no-data">你还没有发布过信息。</view></template>
  <template v-else-if="tab==='claims'"><view v-for="c in myClaims" :key="c.id" class="mine-record"><view class="flex-between"><text class="rec-title">{{postName(c.postId)}}</text><text class="pill">{{CLAIM_STATUS[c.status]}}</text></view><view class="rec-sub">申请时间：{{c.createdAt}}</view><view class="rec-sub">认领说明：{{c.note}}</view><view v-if="c.verification" class="rec-sub assistant-note">智能核验：{{c.verification.decision==='recommended'?'细节一致，等待管理员复核':'已转人工核验'}}（{{c.verification.completed||0}} / {{c.verification.total||0}} 题）</view></view><view v-if="!myClaims.length" class="no-data">暂无认领申请。</view></template>
  <template v-else><view class="notice-text assistant-note">{{matchNotice}}</view><view v-for="s in suggestions" :key="s.a.id+s.b.id" class="mine-record" @tap="open(s.b.id)"><view class="rec-title">{{s.a.title}} ↔ {{s.b.title}}</view><view class="rec-sub">{{s.score?`匹配线索 ${s.score} 分 · `:''}}可能相关：{{s.b.location}}，点击查看物品详情 ›</view><view v-if="s.reason" class="rec-sub assistant-note">{{s.reason}}</view></view><view v-if="!suggestions.length" class="no-data">{{matching?'正在分析图文特征…':'暂时没有可能匹配的信息。'}}</view></template>
 </view>
 <view class="actions-row"><button class="btn-primary" @tap="toPublish('lost')">发布丢失</button><button class="btn-green" @tap="toPublish('found')">发布招领</button></view>
 <UserNav active="mine"/>
</view>
</template>
<script setup>
import {ref,computed} from 'vue';import {onShow} from '@dcloudio/uni-app';import AppIcon from '../../components/AppIcon.vue';import UserNav from '../../components/UserNav.vue';import {session,logout,posts,claims,STATUS,CLAIM_STATUS,editPost,requireRole,refreshCloud,cloudEnabled,refreshMatchNotifications} from '../../utils/store.js'
import {aiAvailable,matchLostItem,savedAiMatches} from '../../utils/ai-service.js'
import {notifyNewMatches,requestMatchNotificationPermission,removePushSubscription} from '../../utils/match-notifications.js'
const who=ref(null),all=ref([]),allClaims=ref([]),tab=ref('posts'),aiMatches=ref([]),aiChecked=ref(false),matching=ref(false)
onShow(async()=>{if(!requireRole('user'))return;who.value=session();try{await refreshCloud()}catch(e){uni.showToast({title:e.message||'刷新失败',icon:'none'})}all.value=posts();allClaims.value=claims();const saved=savedAiMatches(who.value.id,all.value);if(saved.length){aiMatches.value=saved;aiChecked.value=true;notifyNewMatches(who.value.id,saved)}if(tab.value==='matches')refreshMatches()})
const mine=computed(()=>all.value.filter(x=>x.ownerId===who.value?.id))
const myClaims=computed(()=>allClaims.value.filter(x=>x.userId===who.value?.id))
const ruleSuggestions=computed(()=>{let result=[];const published=all.value.filter(p=>p.status==='approved');for(const a of mine.value){for(const b of published){if(b.id!==a.id&&b.kind!==a.kind&&b.category===a.category&&(b.location===a.location||b.title===a.title)){result.push({a,b})}}}return result.slice(0,6)})
const suggestions=computed(()=>cloudEnabled?aiMatches.value:(aiChecked.value?aiMatches.value:ruleSuggestions.value))
const matchNotice=computed(()=>matching.value?'正在分析图文属性、地点和日期，首次分析可能需要片刻。':aiChecked.value?'DeepSeek 提取图文属性并结合向量相似度、类别及时间地点排序；结果只作线索，认领需进一步核验。':'当前显示本机规则线索，打开本页后会尝试图文匹配。')
function openMatches(){tab.value='matches';requestMatchNotificationPermission().catch(e=>uni.showToast({title:e.message||'推送授权未完成',icon:'none'}));refreshMatches()}
async function refreshMatches(){
 if(cloudEnabled){try{const rows=await refreshMatchNotifications();aiMatches.value=rows.map(row=>({a:all.value.find(p=>p.id===row.lost_id),b:all.value.find(p=>p.id===row.found_id),score:row.score})).filter(x=>x.a&&x.b);aiChecked.value=true}catch(e){uni.showToast({title:e.message||'匹配记录加载失败',icon:'none'})}return}
 if(!aiAvailable||matching.value)return
 const lost=mine.value.filter(p=>p.status==='approved').slice(0,6)
 const found=all.value.filter(p=>p.status==='approved'&&p.ownerId!==who.value?.id)
 if(!lost.length||!found.length)return
 matching.value=true
 try{
  const pairs=[]
  for(const a of lost){
   const candidates=found.filter(p=>p.kind!==a.kind&&p.category===a.category).slice(0,20)
   if(!candidates.length)continue
   const matches=await matchLostItem(a,candidates)
   for(const match of matches){const b=candidates.find(p=>p.id===match.id);if(b)pairs.push({a,b,score:match.score,reason:match.reason})}
  }
  aiMatches.value=pairs.sort((a,b)=>b.score-a.score).slice(0,6)
  aiChecked.value=true
  notifyNewMatches(who.value.id,aiMatches.value)
 }catch(error){uni.showToast({title:error.message||'智能匹配暂不可用，已显示规则推荐',icon:'none'})}
 finally{matching.value=false}
}
function postName(id){return all.value.find(x=>x.id===id)?.title||'已移除的物品'}
function toPublish(k){uni.navigateTo({url:'/pages/publish/publish?kind='+k})}
function open(id){uni.navigateTo({url:'/pages/detail/detail?id='+id})}
function signOut(){uni.showModal({title:'退出登录',content:'确定退出当前账号吗？',success:async r=>{if(r.confirm){try{await removePushSubscription()}finally{await logout();uni.reLaunch({url:'/pages/login/login'})}}}})}
function closePost(p){uni.showModal({title:'撤回信息',content:'撤回后，该信息不再展示在大厅中。',success:async r=>{if(!r.confirm)return;try{if(await editPost(p.id,{status:'closed'})){all.value=posts();uni.showToast({title:'已撤回'})}}catch(e){uni.showToast({title:e.message||'撤回失败',icon:'none'})}}})}
</script>
<style scoped>
.mine-header{height:280rpx;background:#002554;color:white;padding:32rpx 30rpx}.title-white{font-size:42rpx;font-weight:800}.exit{display:flex;align-items:center;gap:10rpx;color:#dce7f0;font-size:24rpx}.user-summary{display:flex;gap:22rpx;align-items:center;margin-top:44rpx}.avatar{background:white;width:102rpx;height:102rpx;border-radius:50%;display:flex;align-items:center;justify-content:center}.user-summary>view:last-child{display:flex;flex-direction:column;gap:10rpx}.username{font-size:35rpx;font-weight:700}.department{font-size:22rpx;color:#ccdae6}.counts{display:flex;background:#fff;padding:28rpx 0;margin-bottom:15rpx}.counts view{flex:1;display:flex;flex-direction:column;align-items:center;gap:12rpx;border-right:1rpx solid #e5edf3}.counts view:last-child{border:0}.counts text:first-child{font-size:42rpx;color:#002554;font-weight:700}.counts text:last-child{font-size:23rpx;color:#6c7e92}.mine-tabs{display:flex;background:#fff;border-bottom:1rpx solid #e6eaf0}.mine-tabs view{flex:1;text-align:center;padding:25rpx 0;color:#7e8d9b}.mine-tabs view.current{color:#002554;font-weight:750;border-bottom:4rpx solid #002554}.mine-content{background:#fff;min-height:350rpx;padding:0 28rpx}.mine-record{padding:27rpx 0;border-bottom:1rpx solid #e8edf1}.rec-title{font-size:29rpx;font-weight:700;color:#24405a}.rec-sub{font-size:23rpx;color:#8190a0;margin-top:15rpx;line-height:1.55}.rec-actions{display:flex;justify-content:flex-end;gap:30rpx;margin-top:17rpx;font-size:23rpx;color:#315b85}.rec-actions text:last-child{color:#a56c60}.notice-text{font-size:23rpx;color:#7a8998;padding-top:24rpx;line-height:1.65}.actions-row{display:flex;gap:20rpx;padding:27rpx}.actions-row button{flex:1}
</style>
<style scoped>
.assistant-note{color:#526479}
</style>
