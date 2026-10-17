<template>
<view class="page-body">
 <view class="mine-header"><view class="flex-between"><text class="title-white">我的</text><view @tap="signOut" class="exit"><AppIcon name="logout" :size="30"/>退出</view></view><view class="user-summary"><view class="avatar"><AppIcon name="user" :size="58"/></view><view><text class="username">{{who?.name||'同学'}}</text><text class="department">{{who?.department}} · 体验账号</text></view></view></view>
 <view class="counts"><view><text>{{mine.length}}</text><text>我的发布</text></view><view><text>{{myClaims.length}}</text><text>我的认领</text></view><view><text>{{mine.filter(x=>x.status==='returned').length}}</text><text>已归还</text></view></view>
 <view class="mine-tabs"><view :class="tab==='posts'?'current':''" @tap="tab='posts'">我的发布</view><view :class="tab==='claims'?'current':''" @tap="tab='claims'">我的认领</view><view :class="tab==='matches'?'current':''" @tap="tab='matches'">匹配提醒</view></view>
 <view class="mine-content">
  <template v-if="tab==='posts'"><view v-for="p in mine" :key="p.id" class="mine-record" @tap="open(p.id)"><view class="flex-between"><text class="rec-title">{{p.title}}</text><text class="pill" :class="p.status==='pending'?'pill-wait':''">{{STATUS[p.status]}}</text></view><view class="rec-sub">{{p.kind==='lost'?'丢失':'招领'}} · {{p.location}} · {{p.createdAt.slice(0,10)}}</view><view class="rec-actions"><text @tap.stop="open(p.id)">查看详情 ›</text><text v-if="p.status==='approved'||p.status==='pending'" @tap.stop="closePost(p)">撤回信息</text></view></view><view v-if="!mine.length" class="no-data">你还没有发布过信息。</view></template>
  <template v-else-if="tab==='claims'"><view v-for="c in myClaims" :key="c.id" class="mine-record"><view class="flex-between"><text class="rec-title">{{postName(c.postId)}}</text><text class="pill">{{CLAIM_STATUS[c.status]}}</text></view><view class="rec-sub">申请时间：{{c.createdAt}}</view><view class="rec-sub">认领说明：{{c.note}}</view></view><view v-if="!myClaims.length" class="no-data">暂无认领申请。</view></template>
  <template v-else><view class="notice-text">根据类别与位置推荐潜在匹配记录，属于规则匹配结果，不能保证是同一物品。</view><view v-for="s in suggestions" :key="s.a.id+s.b.id" class="mine-record" @tap="open(s.b.id)"><view class="rec-title">{{s.a.title}} ↔ {{s.b.title}}</view><view class="rec-sub">可能相关：{{s.b.location}}，点击查看物品详情 ›</view></view><view v-if="!suggestions.length" class="no-data">暂时没有可能匹配的信息。</view></template>
 </view>
 <view class="actions-row"><button class="btn-primary" @tap="toPublish('lost')">发布丢失</button><button class="btn-green" @tap="toPublish('found')">发布招领</button></view>
 <UserNav active="mine"/>
</view>
</template>
<script setup>
import {ref,computed} from 'vue';import {onShow} from '@dcloudio/uni-app';import AppIcon from '../../components/AppIcon.vue';import UserNav from '../../components/UserNav.vue';import {session,logout,posts,claims,STATUS,CLAIM_STATUS,editPost,requireRole,publishedPosts} from '../../utils/store.js'
const who=ref(null),all=ref([]),allClaims=ref([]),tab=ref('posts')
onShow(()=>{if(!requireRole('user'))return;who.value=session();all.value=posts();allClaims.value=claims()})
const mine=computed(()=>all.value.filter(x=>x.ownerId===who.value?.id))
const myClaims=computed(()=>allClaims.value.filter(x=>x.userId===who.value?.id))
const suggestions=computed(()=>{let result=[];const published=all.value.filter(p=>p.status==='approved');for(const a of mine.value){for(const b of published){if(b.id!==a.id&&b.kind!==a.kind&&b.category===a.category&&(b.location===a.location||b.title===a.title)){result.push({a,b})}}}return result.slice(0,6)})
function postName(id){return all.value.find(x=>x.id===id)?.title||'已移除的物品'}
function toPublish(k){uni.navigateTo({url:'/pages/publish/publish?kind='+k})}
function open(id){uni.navigateTo({url:'/pages/detail/detail?id='+id})}
function signOut(){uni.showModal({title:'退出登录',content:'确定退出当前账号吗？',success:r=>{if(r.confirm){logout();uni.reLaunch({url:'/pages/login/login'})}}})}
function closePost(p){uni.showModal({title:'撤回信息',content:'撤回后，该信息不再展示在大厅中。',success:r=>{if(r.confirm&&editPost(p.id,{status:'closed'})){all.value=posts();uni.showToast({title:'已撤回'})}}})}
</script>
<style scoped>
.mine-header{height:280rpx;background:#002554;color:white;padding:32rpx 30rpx}.title-white{font-size:42rpx;font-weight:800}.exit{display:flex;align-items:center;gap:10rpx;color:#dce7f0;font-size:24rpx}.user-summary{display:flex;gap:22rpx;align-items:center;margin-top:44rpx}.avatar{background:white;width:102rpx;height:102rpx;border-radius:50%;display:flex;align-items:center;justify-content:center}.user-summary>view:last-child{display:flex;flex-direction:column;gap:10rpx}.username{font-size:35rpx;font-weight:700}.department{font-size:22rpx;color:#ccdae6}.counts{display:flex;background:#fff;padding:28rpx 0;margin-bottom:15rpx}.counts view{flex:1;display:flex;flex-direction:column;align-items:center;gap:12rpx;border-right:1rpx solid #e5edf3}.counts view:last-child{border:0}.counts text:first-child{font-size:42rpx;color:#002554;font-weight:700}.counts text:last-child{font-size:23rpx;color:#6c7e92}.mine-tabs{display:flex;background:#fff;border-bottom:1rpx solid #e6eaf0}.mine-tabs view{flex:1;text-align:center;padding:25rpx 0;color:#7e8d9b}.mine-tabs view.current{color:#002554;font-weight:750;border-bottom:4rpx solid #002554}.mine-content{background:#fff;min-height:350rpx;padding:0 28rpx}.mine-record{padding:27rpx 0;border-bottom:1rpx solid #e8edf1}.rec-title{font-size:29rpx;font-weight:700;color:#24405a}.rec-sub{font-size:23rpx;color:#8190a0;margin-top:15rpx;line-height:1.55}.rec-actions{display:flex;justify-content:flex-end;gap:30rpx;margin-top:17rpx;font-size:23rpx;color:#315b85}.rec-actions text:last-child{color:#a56c60}.notice-text{font-size:23rpx;color:#7a8998;padding-top:24rpx;line-height:1.65}.actions-row{display:flex;gap:20rpx;padding:27rpx}.actions-row button{flex:1}
</style>
