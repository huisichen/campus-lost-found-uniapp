<template>
 <view class="item" @tap="open">
  <view class="photo-wrap">
   <image class="photo" :src="item.category==='证件卡类'?'/static/photos/document-placeholder.jpg':(item.image||'/static/photos/document-placeholder.jpg')" mode="aspectFill" />
   <view class="corner" :class="item.kind==='lost'?'corner-lost':'corner-found'">{{item.kind==='lost'?'丢失':'招领'}}</view>
  </view>
  <view class="item-body">
   <view class="flex-between"><text class="item-name">{{item.title}}</text><text class="pill" :class="item.status==='returned'?'pill-ok':item.status==='pending'?'pill-wait':''">{{STATUS[item.status]||'寻找中'}}</text></view>
   <view class="flex-row details"><AppIcon name="pin" :size="23"/><text>{{item.location}}</text><text class="dot">·</text><text>{{item.createdAt.slice(5,16)}}</text></view>
   <view class="desc">{{item.description}}</view>
   <view v-if="item.category==='证件卡类'" class="private">姓名：{{item.holderName||'未填写'}}　证件号：{{item.documentNo||'未填写'}}</view>
  </view>
 </view>
</template>
<script setup>
import AppIcon from './AppIcon.vue'
import {STATUS} from '../utils/store.js'
const props=defineProps({item:{type:Object,required:true}})
function open(){uni.navigateTo({url:'/pages/detail/detail?id='+props.item.id})}
</script>
<style scoped>
.item{display:flex;padding:22rpx 0;border-bottom:1rpx solid #e6eaf0;gap:22rpx}
.photo-wrap{position:relative;width:188rpx;height:154rpx;flex-shrink:0;overflow:hidden;background:#edf3f7}
.photo{width:100%;height:100%}.corner{position:absolute;top:0;left:0;padding:4rpx 12rpx;font-size:21rpx;color:white}.corner-lost{background:#c86643}.corner-found{background:#187554}
.item-body{min-width:0;flex:1;display:flex;flex-direction:column;gap:11rpx}
.item-name{font-size:29rpx;font-weight:700;color:#173556;max-width:270rpx;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.details{gap:7rpx;color:#8694a6;font-size:21rpx}.dot{padding:0 5rpx}.desc{font-size:23rpx;color:#64768b;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;line-height:1.55}.private{font-size:20rpx;color:#537187}
</style>
