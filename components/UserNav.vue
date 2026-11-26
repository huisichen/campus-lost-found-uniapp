<template>
 <view class="user-nav">
  <view v-for="entry in entries" :key="entry.label" class="nav-entry" @tap="jump(entry)">
   <AppIcon :name="entry.icon" :size="40" />
   <text :class="{selected:active===entry.id}">{{entry.label}}</text>
  </view>
 </view>
</template>
<script setup>
import AppIcon from './AppIcon.vue'
defineProps({active:{type:String,default:'home'}})
const entries=[{id:'home',label:'大厅',icon:'home',url:'/pages/home/home'}, {id:'mine',label:'我的',icon:'user',url:'/pages/mine/mine'}]
function jump(entry){uni.redirectTo({url:entry.url})}
</script>
<style scoped>
.user-nav{height:112rpx;padding-bottom:env(safe-area-inset-bottom);background:#fff;position:fixed;bottom:0;left:0;right:0;display:flex;justify-content:space-around;border-top:1rpx solid #dce4ec;z-index:10}
.nav-entry{width:50%;height:105rpx;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:7rpx}
.nav-entry text{font-size:23rpx;color:#7d8ea0}
.nav-entry text.selected{color:#002554;font-weight:750}
</style>
