<template>
<view v-if="item" class="detail-page">
 <image class="cover" :src="item.category==='证件卡类'?'/static/photos/document-placeholder.jpg':(item.image||'/static/photos/document-placeholder.jpg')" mode="aspectFill"/>
 <view class="detail-top"><view class="flex-between"><view class="main-name">{{item.title}}</view><text class="kind" :class="item.kind==='lost'?'lost':'found'">{{item.kind==='lost'?'丢失':'招领'}}</text></view><view class="tags"><text>{{item.category}}</text><text>{{STATUS[item.status]||'未知状态'}}</text></view></view>
 <view class="info"><view><text>相关地点</text><text>{{item.location}}</text></view><view><text>发布时间</text><text>{{item.createdAt}}</text></view><view><text>发布者</text><text>{{item.ownerName}}</text></view><view v-if="item.category==='证件卡类'"><text>证件姓名</text><text>{{item.holderName||'未填写'}}</text></view><view v-if="item.category==='证件卡类'"><text>证件号码</text><text>{{item.documentNo||'未填写'}}</text></view><view v-if="item.kind==='found'"><text>归还地点</text><text>{{selectedPoint?.name||'待安排'}}</text></view></view>
 <view class="description"><view>物品详情</view><text>{{item.description||'暂未补充详细信息。'}}</text></view>
 <view v-if="item.category==='证件卡类'" class="privacy"><AppIcon name="shield" :size="40"/><text>已隐藏完整证件资料，认领时请向管理员出示证明，不要在公开留言中填写证件号码。</text></view>
 <view v-if="item.kind==='found'&&item.status==='approved'&&currentRole==='user'&&ownId!==item.ownerId" class="claim-block"><view class="section-title">申请认领</view><textarea v-model="claimNote" maxlength="140" placeholder="简单写下可以核实物品归属的特征，不要填写完整证件号码。"/><button class="btn-primary" @tap="claim">提交认领申请</button></view>
 <view v-if="matches.length" class="related"><view class="section-title">可能匹配的物品</view><text class="rule-note">根据物品类别、地点和关键词进行规则推荐，不代表已完成智能图像识别。</text><ItemRow v-for="p in matches" :key="p.id" :item="p"/></view>
 </view>
</template>
<script setup>
import {ref,computed} from 'vue';import {onLoad} from '@dcloudio/uni-app';import AppIcon from '../../components/AppIcon.vue';import ItemRow from '../../components/ItemRow.vue'
import {findPost,STATUS,session,places,publishedPosts,requestClaim,refreshCloud} from '../../utils/store.js'
const item=ref(null),claimNote=ref(''),ownId=ref(''),currentRole=ref(''),points=ref([])
onLoad(async o=>{try{await refreshCloud()}catch{}item.value=findPost(o.id);ownId.value=session()?.id||'';currentRole.value=session()?.role||'';points.value=places()})
const selectedPoint=computed(()=>points.value.find(x=>x.id===item.value?.pointId))
const matches=computed(()=>{if(!item.value)return[];const p=item.value;return publishedPosts().filter(x=>x.id!==p.id&&x.kind!==p.kind&&x.category===p.category&&x.status==='approved').map(x=>({...x,rank:(x.location===p.location?2:0)+((x.title===p.title||x.title.includes(p.title)||p.title.includes(x.title))?2:0)})).sort((a,b)=>b.rank-a.rank).slice(0,2)})
async function claim(){if(!claimNote.value.trim()){uni.showToast({title:'请先填写可核实特征',icon:'none'});return}try{const ok=await requestClaim(item.value.id,claimNote.value.trim());uni.showToast({title:ok?'认领申请已提交':'无法重复申请或状态已变更',icon:'none'});if(ok)claimNote.value=''}catch(e){uni.showToast({title:e.message||'提交失败',icon:'none'})}}
</script>
<style scoped>
.detail-page{padding-bottom:70rpx}.cover{width:100%;height:430rpx;background:#e4ebf1}.detail-top,.info,.description,.claim-block,.related{background:#fff;margin-bottom:15rpx;padding:26rpx}.main-name{font-size:37rpx;color:#002554;font-weight:750}.kind{font-size:23rpx;padding:8rpx 15rpx;color:white}.lost{background:#c76543}.found{background:#15815b}.tags{display:flex;gap:14rpx;margin-top:16rpx}.tags text{font-size:22rpx;background:#edf1f5;color:#5f768c;padding:7rpx 11rpx}.info>view{display:flex;align-items:center;justify-content:space-between;padding:22rpx 0;border-bottom:1rpx solid #f0f2f5;font-size:26rpx}.info>view text:first-child{color:#8090a0}.info>view text:last-child{color:#263f57;max-width:510rpx;text-align:right}.description view{color:#002554;font-size:29rpx;font-weight:700;margin-bottom:20rpx}.description text{line-height:1.8;color:#546c80;font-size:27rpx}.privacy{display:flex;align-items:start;gap:12rpx;margin:16rpx;padding:18rpx 22rpx;background:#e9f3ee;color:#557365;font-size:23rpx;line-height:1.6}.claim-block textarea{border:1rpx solid #d9e5ed;margin:20rpx 0;padding:20rpx;width:100%;height:170rpx;font-size:25rpx}.claim-block button{margin-top:18rpx}.rule-note{font-size:22rpx;color:#7c8b99;display:block;line-height:1.6;margin-top:15rpx}
</style>
