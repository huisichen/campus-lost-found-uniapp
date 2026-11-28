<template>
<view class="page-pad">
 <template v-if="!supportMode">
  <view class="panel"><view class="section-title">智能找物</view><text class="note">先筛选已有信息，再核验隐藏细节；没有线索时可发布或转人工。</text>
   <view class="buttons"><button class="btn-outline" @tap="start('lost')">我丢失了物品</button><button class="btn-outline" @tap="start('found')">我拾取了物品</button></view>
   <text v-if="kind" class="note">当前：{{kind==='lost'?'寻找拾取信息':'寻找失物信息'}}</text>
   <picker v-if="kind" :range="categories" @change="chooseCategory"><view class="field">{{result.filters?.category||'选择物品类别'}} ⌄</view></picker>
   <view v-for="(m,i) in result.messages||[]" :key="i" class="message"><text>{{m.role==='user'?'我':'找物助手'}}：{{m.text}}</text></view>
   <text v-if="Object.keys(result.filters||{}).length" class="note">当前条件：{{Object.values(result.filters).join(' · ')}}</text>
   <view v-if="kind" class="field"><input v-model="message" maxlength="500" placeholder="例如：黑色背包；也可说“不限颜色”" @confirm="send()"/></view>
   <button v-if="kind" class="btn-primary" :disabled="busy||!message.trim()" @tap="send()">{{busy?'正在筛选…':'发送描述'}}</button>
   <text v-if="error" class="error">{{error}}</text>
  </view>
  <view class="panel" v-if="result.sessionId"><view class="section-title">候选物品（{{result.total||0}}）</view><ItemRow v-for="p in result.items||[]" :key="p.id" :item="mapPost(p)"/><text v-if="!result.total" class="note">当前没有符合条件的已审核信息。</text><button class="btn-outline" @tap="publishDraft">{{kind==='lost'?'转为发布丢失信息':'转为发布招领信息'}}</button></view>
  <button class="btn-outline" @tap="supportMode=true;loadTickets()">转人工／查看联系消息</button>
 </template>
 <template v-else>
  <view class="panel"><view class="section-title">联系与人工</view><text class="note">关联物品的消息可由发布者和管理员查看；一般求助由管理员处理。不要公开证件号。</text><view class="field field-large"><textarea v-model="message" maxlength="500" placeholder="填写需要联系发布者或人工协助的内容"/></view><button class="btn-primary" :disabled="busy||!message.trim()" @tap="createTicket">发送消息</button><text v-if="error" class="error">{{error}}</text></view>
  <view v-for="t in tickets" :key="t.id" class="panel"><view class="section-title">{{t.postId?'物品联系':'人工求助'}} · {{t.status==='pending'?'待回复':'已回复'}}</view><view v-for="(m,i) in t.messages" :key="i" class="message">{{m.name}}：{{m.text}}<text class="note">{{m.at}}</text></view><view class="field"><input v-model="replies[t.id]" maxlength="500" placeholder="回复此会话"/></view><button class="btn-outline" :disabled="busy" @tap="reply(t)">回复</button></view>
  <text v-if="!tickets.length" class="note">暂无联系消息。</text><button class="btn-outline" @tap="loadTickets">刷新消息</button>
 </template>
</view>
</template>
<script setup>
import {ref} from 'vue';import {onLoad} from '@dcloudio/uni-app';import ItemRow from '../../components/ItemRow.vue';import {CATEGORIES,session} from '../../utils/store.js';import {mapPost} from '../../utils/cloud.js';import {assistantCall} from '../../utils/assistant-client.js';import {serverEnabled} from '../../utils/server.js'
const categories=CATEGORIES,kind=ref(''),message=ref(''),result=ref({}),busy=ref(false),error=ref(''),supportMode=ref(false),postId=ref(''),tickets=ref([]),replies=ref({})
onLoad(o=>{if(!session()){uni.reLaunch({url:'/pages/login/login'});return}supportMode.value=o.support==='1';postId.value=o.postId||'';if(supportMode.value)loadTickets()})
async function run(action,data){if(busy.value)return;busy.value=true;error.value='';try{if(!serverEnabled)throw new Error('此网页为展示配置，智能对话和联系消息需使用已接入后端的版本');return await assistantCall(action,data)}catch(e){error.value=e.message}finally{busy.value=false}}
async function start(k){kind.value=k;result.value={};message.value='';const r=await run('search',{kind:k});if(r)result.value=r}
async function chooseCategory(e){const r=await run('search',{kind:kind.value,sessionId:result.value.sessionId,category:categories[Number(e.detail.value)]});if(r)result.value=r}
async function send(){if(!message.value.trim())return;const r=await run('search',{kind:kind.value,sessionId:result.value.sessionId,message:message.value});if(r){result.value=r;message.value=''}}
function publishDraft(){const f=result.value.filters||{},q={kind:kind.value,category:f.category||'',title:[f.color,f.brand,f.keyword].filter(Boolean).join(''),location:f.location||'',description:[f.color,f.brand,f.keyword,f.location].filter(Boolean).join('，')};uni.navigateTo({url:'/pages/publish/publish?'+Object.entries(q).map(([k,v])=>k+'='+encodeURIComponent(v)).join('&')})}
async function loadTickets(){const r=await run('support_list',{});if(r)tickets.value=r.tickets}
async function createTicket(){if(!message.value.trim())return;const r=await run('support',{postId:postId.value,message:message.value});if(r){message.value='';await loadTickets()}}
async function reply(t){const text=replies.value[t.id]?.trim();if(!text)return;const r=await run('support_reply',{ticketId:t.id,message:text});if(r){replies.value[t.id]='';await loadTickets()}}
</script>
<style scoped>
.panel{background:#fff;padding:26rpx;margin-bottom:18rpx}.note{display:block;color:#526479;font-size:24rpx;line-height:1.7;margin:16rpx 0}.message{padding:20rpx 0;border-bottom:1rpx solid #e7ecef;font-size:27rpx;line-height:1.8;color:#263f57}.buttons{display:flex;gap:16rpx;margin:22rpx 0}.buttons button{flex:1}.field input{width:100%;font-size:26rpx}.field-large{height:auto;min-height:180rpx}.field textarea{width:100%;font-size:26rpx}.error{display:block;color:#a64a35;font-size:24rpx;line-height:1.7;margin:16rpx 0}button{margin-top:18rpx}
</style>
