<template>
<view class="page-body users-page">
 <view class="admin-title"><text>用户管理</text><text>当前为本机体验账号；正式版应连接学校统一身份认证</text></view>
 <view v-for="u in users" :key="u.id" class="user-row"><view class="user-avatar"><AppIcon name="user" :size="39"/></view><view><view>{{u.name}}<text class="pill">{{u.role==='admin'?'管理员':'普通用户'}}</text></view><text class="muted">{{u.department}}　·　{{displayAccount(u.account)}}</text></view></view>
 <view class="note">这里不显示密码。当前版本没有真实用户数据库，也无法进行服务器端权限管理。</view>
 <AdminNav active="users"/>
</view>
</template>
<script setup>
import {onShow} from '@dcloudio/uni-app';import AppIcon from '../../../components/AppIcon.vue';import AdminNav from '../../../components/AdminNav.vue';import {DEMO_ACCOUNTS,requireRole} from '../../../utils/store.js'
const users=DEMO_ACCOUNTS
onShow(()=>requireRole('admin'))
function displayAccount(x){return x==='管理员'?'管理员':x.slice(0,2)+'***'+x.slice(-2)}
</script>
<style scoped>
.admin-title{padding:31rpx;background:#002554;color:white;display:flex;flex-direction:column;gap:11rpx}.admin-title text:first-child{font-size:36rpx;font-weight:800}.admin-title text:last-child{font-size:23rpx;color:#c8d8e3}.user-row{display:flex;gap:21rpx;align-items:center;background:#fff;padding:26rpx;border-bottom:1rpx solid #ecf0f3}.user-avatar{background:#ebf2f7;width:75rpx;height:75rpx;border-radius:50%;display:flex;justify-content:center;align-items:center}.user-row>view:last-child{display:flex;flex-direction:column;gap:10rpx}.user-row>view:last-child>view{font-size:29rpx;color:#002554;font-weight:700;display:flex;align-items:center;gap:17rpx}.note{font-size:23rpx;color:#8c99a6;padding:26rpx;line-height:1.65}
</style>
