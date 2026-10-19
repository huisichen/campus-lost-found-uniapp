<template>
<view class="page-body records-page">
 <view class="intro"><text>信息管理</text><text>失物、招领、认领审核与归还确认</text></view>
 <view class="tabs"><view :class="tab==='pending'?'sel':''" @tap="tab='pending'">待审核 <text>{{pendingCount}}</text></view><view :class="tab==='all'?'sel':''" @tap="tab='all'">全部物品</view><view :class="tab==='claims'?'sel':''" @tap="tab='claims'">认领申请 <text>{{pendingClaims}}</text></view></view>
 <view v-if="tab!=='claims'" class="record-list"><view v-for="p in filtered" :key="p.id" class="record"><view class="flex-between"><text class="record-title">{{p.title}}</text><text class="pill" :class="p.status==='pending'?'pill-wait':p.status==='returned'?'pill-ok':''">{{STATUS[p.status]}}</text></view><view class="record-meta">{{p.kind==='lost'?'丢失登记':'招领信息'}}　·　{{p.category}}　·　{{p.location}}</view><view class="record-meta">发布人：{{p.ownerName}}　{{p.createdAt}}</view><view v-if="p.category==='证件卡类'" class="privacy-info">姓名：{{p.holderName||'未填写'}}　证件号：{{p.documentNo||'未填写'}}</view><view class="record-desc">{{p.description}}</view>
  <view v-if="p.kind==='found'" class="point-picker"><text>归还点</text><picker :range="pointNames" :value="pointValue(p.pointId)" @change="e=>assignPoint(p,Number(e.detail.value))"><view>{{pointLabel(p.pointId)}} ⌄</view></picker></view>
  <view class="buttons"><button v-if="p.status==='pending'" class="btn-green" @tap="action(p,'approved')">审核通过</button><button v-if="p.status==='pending'" class="btn-outline" @tap="action(p,'rejected')">不予通过</button><button v-if="p.status==='approved'" class="btn-green" @tap="action(p,'returned')">确认已归还</button><button class="btn-light" @tap="open(p.id)">查看详情</button></view>
 </view><view v-if="!filtered.length" class="no-data">当前没有相关记录。</view></view>
 <view v-else class="record-list"><view v-for="c in requestList" :key="c.id" class="record"><view class="flex-between"><text class="record-title">{{itemLabel(c.postId)}}</text><text class="pill" :class="c.status==='pending'?'pill-wait':''">{{CLAIM_STATUS[c.status]}}</text></view><view class="record-meta">申请人：{{c.userName}}　·　{{c.createdAt}}</view><view class="record-desc">申请说明：{{c.note}}</view><view v-if="c.status==='pending'" class="buttons"><button class="btn-green" @tap="claimAction(c,'approved')">核实通过</button><button class="btn-outline" @tap="claimAction(c,'rejected')">驳回申请</button></view><view v-else class="record-meta">审核记录已保存至当前设备</view></view><view v-if="!requestList.length" class="no-data">当前没有认领申请。</view></view>
 <AdminNav active="records"/>
</view>
</template>
<script setup>
import {ref,computed} from 'vue';import {onShow} from '@dcloudio/uni-app';import AdminNav from '../../../components/AdminNav.vue';import {posts,claims,places,editPost,setClaimStatus,STATUS,CLAIM_STATUS,requireRole,refreshCloud} from '../../../utils/store.js'
const tab=ref('pending'),all=ref([]),requests=ref([]),points=ref([])
onShow(reload)
async function reload(){if(!requireRole('admin'))return;try{await refreshCloud();all.value=posts();requests.value=claims();points.value=places()}catch(e){uni.showToast({title:e.message||'加载失败',icon:'none'})}}
const filtered=computed(()=>tab.value==='pending'?all.value.filter(x=>x.status==='pending'):all.value)
const requestList=computed(()=>requests.value)
const pendingCount=computed(()=>all.value.filter(x=>x.status==='pending').length)
const pendingClaims=computed(()=>requests.value.filter(x=>x.status==='pending').length)
const pointNames=computed(()=>['待指定',...points.value.map(p=>p.name)])
function pointValue(id){return Math.max(0,points.value.findIndex(x=>x.id===id)+1)}
function pointLabel(id){return points.value.find(x=>x.id===id)?.name||'待指定'}
async function assignPoint(p,index){const id=index>0?points.value[index-1].id:'';try{if(await editPost(p.id,{pointId:id})){await reload();uni.showToast({title:'归还点已更新'})}}catch(e){uni.showToast({title:e.message||'更新失败',icon:'none'})}}
function itemLabel(id){return all.value.find(x=>x.id===id)?.title||'未找到对应物品'}
function action(p,status){const msg=status==='approved'?'审核通过后将对用户公开。':status==='returned'?'确认物品已经线下交还本人？':'驳回后该信息不再公开。';uni.showModal({title:status==='returned'?'归还确认':'信息审核',content:msg,success:async r=>{if(!r.confirm)return;try{await editPost(p.id,{status});await reload()}catch(e){await reload();uni.showToast({title:e.message||'处理失败',icon:'none'})}}})}
function claimAction(c,status){uni.showModal({title:'认领核实',content:'请确保已线下核验物品归属。此操作仅记录审核结果，不自动认定物品完成交接。',success:async r=>{if(!r.confirm)return;try{await setClaimStatus(c.id,status);await reload()}catch(e){uni.showToast({title:e.message||'处理失败',icon:'none'})}}})}
function open(id){uni.navigateTo({url:'/pages/detail/detail?id='+id})}
</script>
<style scoped>
.records-page{padding-bottom:140rpx}.intro{padding:27rpx 28rpx;background:#002554;display:flex;flex-direction:column;gap:10rpx;color:#fff}.intro text:first-child{font-size:37rpx;font-weight:750}.intro text:last-child{font-size:23rpx;color:#c4d5e4}.tabs{background:#fff;display:flex;border-bottom:1rpx solid #e5e9ee}.tabs>view{flex:1;text-align:center;padding:24rpx 0;font-size:24rpx;color:#6b8092}.tabs .sel{color:#002554;border-bottom:4rpx solid #002554;font-weight:750}.tabs text{font-size:20rpx;color:#b47f32}.record-list{padding:15rpx}.record{background:#fff;border:1rpx solid #e4ebf1;margin:0 0 15rpx;padding:23rpx}.record-title{font-size:29rpx;color:#002554;font-weight:750}.record-meta{font-size:23rpx;color:#8491a0;margin-top:13rpx}.privacy-info{font-size:22rpx;color:#476d66;margin-top:14rpx}.record-desc{font-size:24rpx;color:#4e6780;line-height:1.65;margin:16rpx 0}.point-picker{display:flex;justify-content:space-between;border-top:1rpx solid #edf0f4;padding-top:19rpx;gap:20rpx;font-size:24rpx;color:#607589}.point-picker picker{color:#1a5877;font-size:22rpx;max-width:470rpx}.buttons{display:flex;gap:11rpx;justify-content:flex-end;margin-top:18rpx;flex-wrap:wrap}.buttons button{font-size:22rpx;padding:14rpx 14rpx}
</style>
