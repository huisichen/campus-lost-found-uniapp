<template>
<view class="page-body users-page">
 <view class="admin-title"><text>用户管理</text><text>已注册的邮箱账号；暂未接入学校统一身份认证</text></view>
 <view v-for="u in users" :key="u.id" class="user-row"><view class="user-avatar"><AppIcon name="user" :size="39"/></view><view><view>{{u.name}}<text class="pill">{{u.role==='admin'?'管理员':'普通用户'}}</text></view><text class="muted">{{u.department}}　·　{{displayAccount(u.account)}}</text></view></view>
 <view class="note">这里不显示密码。账号权限由服务器端验证。</view>
 <AdminNav active="users"/>
</view>
</template>
<script setup>
import {ref} from 'vue';import {onShow} from '@dcloudio/uni-app';import AppIcon from '../../../components/AppIcon.vue';import AdminNav from '../../../components/AdminNav.vue';import {userProfiles,refreshProfiles,requireRole} from '../../../utils/store.js'
const users=ref([])
onShow(async()=>{if(!requireRole('admin'))return;try{users.value=await refreshProfiles()}catch(e){uni.showToast({title:e.message||'用户加载失败',icon:'none'})}})
function displayAccount(x){if(!x)return '';const [name,domain]=x.split('@');return name.slice(0,2)+'***@'+(domain||'')}
</script>
<style scoped>
.admin-title{padding:31rpx;background:#002554;color:white;display:flex;flex-direction:column;gap:11rpx}.admin-title text:first-child{font-size:36rpx;font-weight:800}.admin-title text:last-child{font-size:23rpx;color:#c8d8e3}.user-row{display:flex;gap:21rpx;align-items:center;background:#fff;padding:26rpx;border-bottom:1rpx solid #ecf0f3}.user-avatar{background:#ebf2f7;width:75rpx;height:75rpx;border-radius:50%;display:flex;justify-content:center;align-items:center}.user-row>view:last-child{display:flex;flex-direction:column;gap:10rpx}.user-row>view:last-child>view{font-size:29rpx;color:#002554;font-weight:700;display:flex;align-items:center;gap:17rpx}.note{font-size:23rpx;color:#8c99a6;padding:26rpx;line-height:1.65}
</style>
