<template>
<view class="page-body users-page">
 <view class="admin-title"><text>用户管理</text><text>{{cloudEnabled ? '学校邮箱验证账号 · 云端共享' : '学号 + 学校邮箱验证码登录；账号表保存在本机'}}</text></view>
 <view class="stat-strip">共 {{list.length}} 个账号　·　学生 {{studentCount}}　·　管理员 {{adminCount}}</view>
 <view v-for="u in list" :key="u.id" class="user-row">
   <view class="user-avatar"><AppIcon name="user" :size="39"/></view>
   <view class="user-info">
     <view class="user-name">{{u.name}}<text class="pill">{{u.role==='admin'?'管理员':'学生'}}</text><text v-if="u.disabled" class="pill pill-off">已停用</text></view>
     <text class="muted">{{u.department || '院系待完善'}}{{u.account ? '　·　' + u.account : ''}}</text>
     <text class="muted">{{u.email}}</text>
     <text class="muted">{{u.statusText}}</text>
   </view>
 </view>
 <view class="note">{{cloudEnabled ? '管理员角色及账号权限由服务端判定；此处展示已验证邮箱的账号。' : '验证码只以「加盐摘要」暂存在本机，5 分钟后失效、最多试 5 次。正式版应由服务端发信、签发凭证并判定管理员角色。'}}</view>
 <AdminNav active="users"/>
</view>
</template>
<script setup>
import {ref,computed} from 'vue'
import {onShow} from '@dcloudio/uni-app'
import AppIcon from '../../../components/AppIcon.vue'
import AdminNav from '../../../components/AdminNav.vue'
import {refreshProfiles,requireRole,cloudEnabled,maskStudentNo,maskEmail,dateTime} from '../../../utils/store.js'
const list=ref([])
const studentCount=computed(()=>list.value.filter(u=>u.role==='user').length)
const adminCount=computed(()=>list.value.filter(u=>u.role==='admin').length)
function normalize(u){
  const studentNo=u.studentNo||''
  const emailRaw=u.email||(u.account&&String(u.account).includes('@')?u.account:'')
  const lastLogin=u.lastLoginAt?('最近登录 '+dateTime(u.lastLoginAt)):(u.account?'云端账号':'尚未登录')
  const verified=u.verifiedAt?'　·　已验证':(u.account&&!studentNo?'':'　·　未验证')
  return {
    id:u.id,
    name:u.name||'同学',
    role:u.role==='admin'?'admin':'user',
    department:u.department||'',
    account:studentNo?('学号 '+maskStudentNo(studentNo)):(u.account&&String(u.account).includes('@')?maskEmail(String(u.account)):''),
    email:studentNo&&u.email?maskEmail(u.email):(studentNo?'':'学号/邮箱：'+(u.account||'—')),
    disabled:u.status==='disabled',
    statusText:lastLogin+verified
  }
}
onShow(async()=>{
  if(!requireRole('admin'))return
  try{list.value=(await refreshProfiles()).map(normalize)}
  catch(e){uni.showToast({title:e.message||'用户加载失败',icon:'none'})}
})
</script>
<style scoped>
.admin-title{padding:31rpx;background:#002554;color:white;display:flex;flex-direction:column;gap:11rpx}.admin-title text:first-child{font-size:36rpx;font-weight:800}.admin-title text:last-child{font-size:23rpx;color:#c8d8e3}.stat-strip{background:#eef3f8;color:#4c5f73;font-size:22rpx;padding:18rpx 26rpx}.user-row{display:flex;gap:21rpx;align-items:flex-start;background:#fff;padding:26rpx;border-bottom:1rpx solid #ecf0f3}.user-avatar{background:#ebf2f7;width:75rpx;height:75rpx;border-radius:50%;display:flex;justify-content:center;align-items:center;flex-shrink:0}.user-info{display:flex;flex-direction:column;gap:10rpx;min-width:0}.user-name{font-size:29rpx;color:#002554;font-weight:700;display:flex;align-items:center;gap:17rpx}.user-info .muted{font-size:22rpx;color:#7b8b9c}.pill-off{background:#f6e7e4;color:#b3261e}.note{font-size:23rpx;color:#8c99a6;padding:26rpx;line-height:1.65}
</style>
