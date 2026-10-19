<template>
<view class="login-page">
 <image class="hero" src="/static/photos/campus-wuhan-demo.jpg" mode="aspectFill"/>
 <view class="hero-cover"></view>
 <view class="identity">
   <SchoolLogo class="seal"/>
   <view><view class="school">武汉大学 · 珞珈校园</view><view class="name">校园失物招领</view><view class="slogan">让每一份遗失，都能回到身边</view></view>
 </view>
 <view class="login-panel">
  <view class="role-switch"><view :class="role==='user'?'chosen':''" @tap="choose('user')">用户登录</view><view :class="role==='admin'?'chosen':''" @tap="choose('admin')">管理员登录</view></view>
  <view class="login-heading">{{role==='user'?'欢迎回到校园':'管理平台身份验证'}}</view>
  <view class="input-line"><AppIcon name="user" :size="38"/><input v-model="account" maxlength="60" placeholder="请输入邮箱"/></view>
  <view class="input-line"><AppIcon name="lock" :size="38"/><input v-model="password" password placeholder="请输入密码"/></view>
  <button class="submit" @tap="submit">登录</button>
  <view class="demo-hint" @tap="register"><text>首次使用？注册邮箱账号</text><text>需邮箱验证</text></view>
  <view class="demo-tag">邮箱账号登录 · 暂未接入学校统一身份认证</view>
 </view>
 <view class="footer-note">自强 弘毅 求是 拓新</view>
</view>
</template>
<script setup>
import {ref,onMounted} from 'vue'
import AppIcon from '../../components/AppIcon.vue'
import SchoolLogo from '../../components/SchoolLogo.vue'
import {login,signup,session,restoreSession,cloudEnabled} from '../../utils/store.js'
const role=ref('user'), account=ref(''),password=ref(''),busy=ref(false)
onMounted(async()=>{if(!session())return;try{const s=await restoreSession();if(s)uni.redirectTo({url:s.role==='admin'?'/pages/admin/dashboard/dashboard':'/pages/home/home'})}catch{}})
function choose(r){role.value=r}
async function submit(){if(busy.value)return;busy.value=true;try{const s=await login(role.value,account.value,password.value);if(!s)throw new Error('账号或密码错误');uni.redirectTo({url:s.role==='admin'?'/pages/admin/dashboard/dashboard':'/pages/home/home'})}catch(e){uni.showToast({title:e.message||'登录失败',icon:'none'})}finally{busy.value=false}}
async function register(){if(!cloudEnabled){uni.showToast({title:'云端注册尚未启用',icon:'none'});return}if(!account.value.includes('@')||password.value.length<6){uni.showToast({title:'请填写邮箱和至少 6 位密码',icon:'none'});return}if(busy.value)return;busy.value=true;try{const result=await signup(account.value,password.value);uni.showModal({title:'注册申请已提交',content:result.needsConfirmation?'请查收验证邮件，确认后返回本页登录。':'账号已创建，请登录。',showCancel:false})}catch(e){uni.showToast({title:e.message||'注册失败',icon:'none'})}finally{busy.value=false}}
</script>
<style scoped>
.login-page{min-height:100vh;background:#f4f7fa;position:relative;padding-bottom:38rpx}.hero{height:470rpx;width:100%;display:block}.hero-cover{position:absolute;top:0;left:0;right:0;height:470rpx;background:linear-gradient(180deg,rgba(0,37,84,.72),rgba(0,37,84,.15))}.identity{position:absolute;top:102rpx;left:38rpx;display:flex;align-items:center;gap:17rpx;color:white}.seal{width:94rpx;height:94rpx}.school{font-size:22rpx;opacity:.9}.name{font-size:44rpx;font-weight:800;margin:3rpx 0}.slogan{font-size:24rpx;letter-spacing:2rpx}
.login-panel{background:white;position:relative;margin:-69rpx 26rpx 0;padding:0 30rpx 35rpx;border:1rpx solid #e2e9ef;box-shadow:0 5rpx 22rpx rgba(0,37,84,.06)}.role-switch{display:flex;border-bottom:1rpx solid #e4e9ed}.role-switch view{flex:1;text-align:center;padding:28rpx 0;font-size:28rpx;color:#7b8b9c}.role-switch .chosen{color:#002554;font-weight:750;border-bottom:5rpx solid #002554}.login-heading{font-size:31rpx;font-weight:750;margin:35rpx 0 26rpx;color:#002554}.input-line{display:flex;align-items:center;border:1rpx solid #dae4ea;padding:0 18rpx;gap:16rpx;margin-bottom:22rpx;height:91rpx;border-radius:7rpx}.input-line input{height:80rpx;flex:1;font-size:27rpx}.submit{color:white;background:#002554;border-radius:7rpx;margin-top:36rpx;height:90rpx;line-height:90rpx;font-weight:700}.demo-hint{display:flex;gap:18rpx;justify-content:center;font-size:22rpx;color:#6e8299;margin-top:24rpx}.demo-tag{font-size:20rpx;color:#ad6954;text-align:center;padding-top:28rpx}.footer-note{color:#74869c;letter-spacing:8rpx;text-align:center;margin-top:45rpx;font-size:23rpx}
</style>
