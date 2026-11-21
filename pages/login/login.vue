<template>
<view class="login-page">
 <image class="hero" src="/static/photos/campus-wuhan-demo.jpg" mode="aspectFill"/>
 <view class="hero-cover"></view>
 <view class="identity">
   <SchoolLogo class="seal"/>
   <view><view class="school">武汉大学 · 珞珈校园</view><view class="name">校园失物招领</view><view class="slogan">让每一份遗失，都能回到身边</view></view>
 </view>
 <view class="login-panel">
  <view class="login-heading">学号登录</view>
  <view class="login-sub">验证码将发送到本人学校邮箱：学号@whu.edu.cn</view>
  <view class="input-line"><AppIcon name="user" :size="38"/><input :value="studentNo" type="number" :maxlength="STUDENT_NO_LENGTH" placeholder="请输入 13 位学号" @input="onNoInput"/></view>
  <view class="input-line code-line">
    <AppIcon name="lock" :size="38"/>
    <input class="code-input" :value="code" type="number" maxlength="6" placeholder="请输入 6 位验证码" @input="onCodeInput" @confirm="submit"/>
    <text class="send-btn" :class="{muted:counting||sending}" @tap="sendCode">{{counting ? countdown + 's 后重发' : (sending ? '发送中…' : '获取验证码')}}</text>
  </view>
  <view v-if="devCode" class="dev-code">演示模式：本次验证码 <text class="dev-num">{{devCode}}</text>（未真正发送邮件）</view>
  <view v-if="error" class="error-line">{{error}}</view>
  <button class="submit" :disabled="loading" @tap="submit">{{loading ? '正在登录…' : '登录'}}</button>
  <view class="hint">首次登录会自动建档；姓名与院系可在「我的」中补充。</view>
  <view class="demo-tag">课程项目 · 验证码为演示用途 · 未接入学校统一身份认证</view>
 </view>
 <view class="footer-note">自强 弘毅 求是 拓新</view>
</view>
</template>
<script setup>
import {ref,onMounted,onUnmounted} from 'vue'
import AppIcon from '../../components/AppIcon.vue'
import SchoolLogo from '../../components/SchoolLogo.vue'
import {requestCode,verifyCode,session,lastStudentNo,STUDENT_NO_LENGTH,RESEND_SECONDS} from '../../utils/store.js'
const studentNo=ref(lastStudentNo()),code=ref(''),error=ref(''),loading=ref(false),sending=ref(false)
const devCode=ref(''),counting=ref(false),countdown=ref(RESEND_SECONDS)
let timer=null
function homeFor(role){return role==='admin'?'/pages/admin/dashboard/dashboard':'/pages/home/home'}
onMounted(()=>{const s=session();if(s)uni.redirectTo({url:homeFor(s.role)})})
onUnmounted(()=>{if(timer)clearInterval(timer)})
function startCountdown(){
  counting.value=true;countdown.value=RESEND_SECONDS
  if(timer)clearInterval(timer)
  timer=setInterval(()=>{
    countdown.value--
    if(countdown.value<=0){clearInterval(timer);timer=null;counting.value=false}
  },1000)
}
function onNoInput(e){const v=String(e.detail.value||'').replace(/\D/g,'').slice(0,STUDENT_NO_LENGTH);studentNo.value=v;error.value='';devCode.value='';return v}
function onCodeInput(e){code.value=String(e.detail.value||'').replace(/\D/g,'').slice(0,6);error.value=''}
async function sendCode(){
  if(counting.value||sending.value)return
  error.value=''
  const no=String(studentNo.value||'').trim()
  if(!/^\d{13}$/.test(no)){error.value=`请输入 ${STUDENT_NO_LENGTH} 位学号`;return}
  sending.value=true
  try{
    const result=await requestCode(no)
    if(!result.ok){error.value=result.message;return}
    devCode.value=result.devCode||''
    startCountdown()
    uni.showToast({title:'验证码已发送至 '+result.email,icon:'none'})
  }catch(e){
    error.value='验证码发送失败，请稍后重试'
  }finally{
    sending.value=false
  }
}
async function submit(){
  if(loading.value)return
  error.value=''
  const no=String(studentNo.value||'').trim()
  if(!/^\d{13}$/.test(no)){error.value=`请输入 ${STUDENT_NO_LENGTH} 位学号`;return}
  const c=String(code.value||'').trim()
  if(!/^\d{6}$/.test(c)){error.value='请输入 6 位验证码';return}
  loading.value=true
  try{
    const result=await verifyCode(no,c)
    if(!result.ok){error.value=result.message;return}
    uni.redirectTo({url:homeFor(result.user.role)})
  }catch(e){
    error.value='登录失败，请稍后重试'
  }finally{
    loading.value=false
  }
}
</script>
<style scoped>
.login-page{min-height:100vh;background:#f4f7fa;position:relative;padding-bottom:38rpx}.hero{height:470rpx;width:100%;display:block}.hero-cover{position:absolute;top:0;left:0;right:0;height:470rpx;background:linear-gradient(180deg,rgba(0,37,84,.72),rgba(0,37,84,.15))}.identity{position:absolute;top:102rpx;left:38rpx;display:flex;align-items:center;gap:17rpx;color:white}.seal{width:94rpx;height:94rpx}.school{font-size:22rpx;opacity:.9}.name{font-size:44rpx;font-weight:800;margin:3rpx 0}.slogan{font-size:24rpx;letter-spacing:2rpx}
.login-panel{background:white;position:relative;margin:-69rpx 26rpx 0;padding:0 30rpx 35rpx;border:1rpx solid #e2e9ef;box-shadow:0 5rpx 22rpx rgba(0,37,84,.06)}.login-heading{font-size:33rpx;font-weight:750;margin:38rpx 0 8rpx;color:#002554}.login-sub{font-size:23rpx;color:#7b8b9c;margin-bottom:28rpx}.input-line{display:flex;align-items:center;border:1rpx solid #dae4ea;padding:0 18rpx;gap:16rpx;margin-bottom:22rpx;height:91rpx;border-radius:7rpx}.input-line input{height:80rpx;flex:1;font-size:27rpx}.code-input{min-width:0}.send-btn{font-size:24rpx;color:#002554;font-weight:700;padding:12rpx 18rpx;background:#eef3f8;border-radius:6rpx;flex-shrink:0}.send-btn.muted{color:#9aa9b6;background:#f2f5f8}.dev-code{font-size:22rpx;color:#8a5a20;background:#fdf3e3;border:1rpx solid #f3e2c6;border-radius:6rpx;padding:14rpx 18rpx;margin:-6rpx 0 18rpx;line-height:1.5}.dev-num{font-weight:800;letter-spacing:3rpx;color:#b4762a}.error-line{font-size:23rpx;color:#b3261e;line-height:1.5;margin:-8rpx 0 18rpx}.submit{color:white;background:#002554;border-radius:7rpx;margin-top:24rpx;height:90rpx;line-height:90rpx;font-weight:700}.submit[disabled]{opacity:.65}.hint{font-size:21rpx;color:#8c99a6;text-align:center;padding-top:22rpx;line-height:1.6}.demo-tag{font-size:20rpx;color:#ad6954;text-align:center;padding-top:16rpx}.footer-note{color:#74869c;letter-spacing:8rpx;text-align:center;margin-top:45rpx;font-size:23rpx}
</style>
