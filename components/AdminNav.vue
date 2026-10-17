<template>
 <view class="admin-nav">
   <view v-for="entry in entries" :key="entry.id" class="tab" @tap="jump(entry)">
    <AppIcon :name="entry.icon" :size="39" />
    <text :class="{active:active===entry.id}">{{entry.title}}</text>
   </view>
 </view>
</template>
<script setup>
import AppIcon from './AppIcon.vue'
defineProps({active:{type:String,default:'dashboard'}})
const entries=[{id:'dashboard',title:'数据看板',icon:'chart',url:'/pages/admin/dashboard/dashboard'}, {id:'records',title:'信息审核',icon:'list',url:'/pages/admin/records/records'}, {id:'points',title:'归还点',icon:'pin',url:'/pages/admin/points/points'}, {id:'users',title:'用户',icon:'users',url:'/pages/admin/users/users'}]
function jump(x){uni.redirectTo({url:x.url})}
</script>
<style scoped>
.admin-nav{position:fixed;bottom:0;left:0;right:0;z-index:10;display:flex;background:#fff;border-top:1rpx solid #e0e7ed;height:112rpx;padding-bottom:env(safe-area-inset-bottom)}
.tab{flex:1;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:5rpx;height:105rpx}
.tab text{color:#7e8ca0;font-size:22rpx}.tab .active{color:#002554;font-weight:700}
</style>
