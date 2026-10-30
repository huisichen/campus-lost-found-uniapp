<template>
<view v-if="item" class="detail-page">
 <image class="cover" :src="item.category==='证件卡类'?'/static/photos/document-placeholder.jpg':(item.image||'/static/photos/document-placeholder.jpg')" mode="aspectFill"/>
 <view class="detail-top"><view class="flex-between"><view class="main-name">{{item.title}}</view><text class="kind" :class="item.kind==='lost'?'lost':'found'">{{item.kind==='lost'?'丢失':'招领'}}</text></view><view class="tags"><text>{{item.category}}</text><text>{{STATUS[item.status]||'未知状态'}}</text></view></view>
 <view class="info"><view><text>相关地点</text><text>{{item.location}}</text></view><view><text>发布时间</text><text>{{item.createdAt}}</text></view><view><text>发布者</text><text>{{item.ownerName}}</text></view><view v-if="item.category==='证件卡类'"><text>证件姓名</text><text>{{item.holderName||'未填写'}}</text></view><view v-if="item.category==='证件卡类'"><text>证件号码</text><text>{{item.documentNo||'未填写'}}</text></view><view v-if="item.kind==='found'"><text>归还地点</text><text>{{selectedPoint?.name||'待安排'}}</text></view></view>
 <view class="description"><view>物品详情</view><text>{{item.description||'暂未补充详细信息。'}}</text></view>
 <view v-if="item.category==='证件卡类'" class="privacy"><AppIcon name="shield" :size="40"/><text>已隐藏完整证件资料，认领时请向管理员出示证明，不要在公开留言中填写证件号码。</text></view>
 <view v-if="item.kind==='found'&&item.category!=='证件卡类'&&currentRole==='user'&&ownId===item.ownerId" class="claim-block">
  <view class="section-title">认领核验细节</view><text class="rule-note assistant-note">{{privateReady?'已登记隐藏核验细节，原答案不对外展示。重新登记将覆盖原设置。':'请登记至少两处不在公开照片和描述中出现的细节，如内衬颜色、夹层内容物或隐蔽标记。'}}</text>
  <textarea v-model="privateDetails" maxlength="800" placeholder="这些细节仅发送到服务端用于问答核验，请勿填写证件号、姓名或联系方式。"/>
  <text v-if="privateError" class="assistant-error">{{privateError}}</text><button class="btn-outline" :disabled="privateBusy" @tap="savePrivate">{{privateBusy?'正在登记…':'保存隐藏细节'}}</button>
 </view>
 <view v-if="item.kind==='found'&&item.status==='approved'&&currentRole==='user'&&ownId!==item.ownerId" class="claim-block">
  <view class="section-title">申请认领</view><textarea v-model="claimNote" maxlength="140" placeholder="简单写下可以核实物品归属的特征，不要填写完整证件号码。"/>
  <template v-if="verification"><text class="rule-note assistant-note">{{verificationText}}</text>
   <view v-for="(check,i) in verification.checks||[]" :key="i" class="verification-line">{{i+1}}. {{check.question}} <text>{{check.verdict==='match'?'细节一致':'待人工核实'}}</text></view>
   <template v-if="verification.question"><text class="field-title">第 {{verification.question.number}} / {{verification.question.total}} 题：{{verification.question.text}}</text><textarea v-model="answer" maxlength="240" placeholder="只回答你记得的事实；不确定可以填写“不确定”。"/><button class="btn-primary" :disabled="claimBusy" @tap="answerQuestion">{{claimBusy?'正在核验…':'提交回答'}}</button></template>
  </template>
  <text v-if="claimError" class="assistant-error">{{claimError}}</text>
  <button v-if="!verification?.question" class="btn-primary" :disabled="claimBusy||submitted" @tap="claim">{{submitted?'认领申请已提交':claimBusy?'正在处理…':verification?'提交管理员核验':item.category==='证件卡类'?'提交认领申请':'开始智能核验'}}</button>
  <button v-if="claimError&&!submitted" class="btn-outline" :disabled="claimBusy" @tap="manualClaim">转人工核验</button>
 </view>
 <view v-if="matches.length||matching||matchError" class="related"><view class="section-title">可能匹配的物品</view><text class="rule-note assistant-note">{{matching?'正在分析图文特征与时间地点…':matchError||'根据图文属性向量、类别和时空条件排序，分数表示线索强度，仍需核验归属。'}}</text><view v-for="p in matches" :key="p.id"><ItemRow :item="p"/><text class="rule-note assistant-note">{{p.aiScore?`匹配线索 ${p.aiScore} 分 · ${p.aiReason}`:'本机规则推荐，尚未完成 AI 分析'}}</text></view></view>
 </view>
</template>
<script setup>
import {ref,computed} from 'vue';import {onLoad} from '@dcloudio/uni-app';import AppIcon from '../../components/AppIcon.vue';import ItemRow from '../../components/ItemRow.vue'
import {findPost,STATUS,session,places,publishedPosts,requestClaim,refreshCloud,claims} from '../../utils/store.js'
import {aiAvailable,matchLostItem,syncAiItem,aiItemState,startClaimVerification,answerClaimVerification,takeVerificationReceipt} from '../../utils/ai-service.js'
const item=ref(null),claimNote=ref(''),ownId=ref(''),currentRole=ref(''),points=ref([])
const aiRelated=ref(null),matching=ref(false),matchError=ref(''),privateDetails=ref(''),privateReady=ref(false),privateBusy=ref(false),privateError=ref('')
const verification=ref(null),answer=ref(''),claimBusy=ref(false),claimError=ref(''),submitted=ref(false)
onLoad(async o=>{try{await refreshCloud()}catch{}item.value=findPost(o.id);ownId.value=session()?.id||'';currentRole.value=session()?.role||'';points.value=places();if(!item.value)return;submitted.value=claims().some(c=>c.postId===item.value.id&&c.userId===ownId.value&&c.status!=='rejected');privateReady.value=!!aiItemState(item.value.id)?.verificationReady;loadMatches()})
const selectedPoint=computed(()=>points.value.find(x=>x.id===item.value?.pointId))
const candidates=computed(()=>item.value?publishedPosts().filter(x=>x.id!==item.value.id&&x.kind!==item.value.kind&&x.category===item.value.category&&x.status==='approved'):[])
const matches=computed(()=>aiRelated.value||candidates.value.slice(0,2))
const verificationText=computed(()=>verification.value?.question?'请依次回答不公开的细节，系统不会显示登记原答案。':verification.value?.decision==='recommended'?'细节核验一致，建议由管理员复核并安排交接。此结果不自动证明物品归属。':verification.value?.message||'部分细节无法核实，将交由管理员继续核验。')
async function loadMatches(){if(!aiAvailable||!candidates.value.length||item.value.status!=='approved')return;matching.value=true;try{const result=await matchLostItem(item.value,candidates.value);aiRelated.value=result.map(m=>({...candidates.value.find(p=>p.id===m.id),aiScore:m.score,aiReason:m.reason}))}catch(e){matchError.value=`${e.message}，暂显示本机规则线索。`}finally{matching.value=false}}
async function savePrivate(){if(privateBusy.value)return;privateBusy.value=true;privateError.value='';try{const r=await syncAiItem(item.value,privateDetails.value.trim());privateReady.value=r.verificationReady;privateDetails.value='';uni.showToast({title:'隐藏细节已登记',icon:'none'})}catch(e){privateError.value=e.message}finally{privateBusy.value=false}}
async function submitClaim(){if(submitted.value)return;if(claims().some(c=>c.postId===item.value.id&&c.userId===ownId.value&&c.status!=='rejected'))throw new Error('你已提交认领申请，请在“我的认领”查看');const receipt=verification.value?.sessionId?await takeVerificationReceipt(verification.value.sessionId,item.value.id,ownId.value):verification.value;const ok=await requestClaim(item.value.id,claimNote.value.trim(),receipt);if(!ok)throw new Error('当前状态无法认领，请刷新后重试');submitted.value=true;uni.showToast({title:'已提交管理员核验',icon:'none'})}
async function claim(){if(claimBusy.value||submitted.value)return;if(!claimNote.value.trim()){claimError.value='请先填写可核实的物品特征。';return}claimBusy.value=true;claimError.value='';try{if(verification.value||item.value.category==='证件卡类'||!aiAvailable){await submitClaim();return}verification.value=await startClaimVerification(item.value,ownId.value)}catch(e){claimError.value=e.message}finally{claimBusy.value=false}}
async function answerQuestion(){if(claimBusy.value)return;if(!answer.value.trim()){claimError.value='请填写答案；不确定时可以填写“不确定”。';return}claimBusy.value=true;claimError.value='';try{verification.value=await answerClaimVerification(verification.value.sessionId,verification.value.question.number,answer.value.trim());answer.value=''}catch(e){claimError.value=e.message}finally{claimBusy.value=false}}
async function manualClaim(){if(!claimNote.value.trim()){claimError.value='请先填写可核实的物品特征。';return}claimBusy.value=true;try{verification.value={decision:'manual',checks:[],completed:0,total:0};await submitClaim();claimError.value=''}catch(e){claimError.value=e.message}finally{claimBusy.value=false}}
</script>
<style scoped>
.detail-page{padding-bottom:70rpx}.cover{width:100%;height:430rpx;background:#e4ebf1}.detail-top,.info,.description,.claim-block,.related{background:#fff;margin-bottom:15rpx;padding:26rpx}.main-name{font-size:37rpx;color:#002554;font-weight:750}.kind{font-size:23rpx;padding:8rpx 15rpx;color:white}.lost{background:#c76543}.found{background:#15815b}.tags{display:flex;gap:14rpx;margin-top:16rpx}.tags text{font-size:22rpx;background:#edf1f5;color:#5f768c;padding:7rpx 11rpx}.info>view{display:flex;align-items:center;justify-content:space-between;padding:22rpx 0;border-bottom:1rpx solid #f0f2f5;font-size:26rpx}.info>view text:first-child{color:#8090a0}.info>view text:last-child{color:#263f57;max-width:510rpx;text-align:right}.description view{color:#002554;font-size:29rpx;font-weight:700;margin-bottom:20rpx}.description text{line-height:1.8;color:#546c80;font-size:27rpx}.privacy{display:flex;align-items:start;gap:12rpx;margin:16rpx;padding:18rpx 22rpx;background:#e9f3ee;color:#557365;font-size:23rpx;line-height:1.6}.claim-block textarea{border:1rpx solid #d9e5ed;margin:20rpx 0;padding:20rpx;width:100%;height:170rpx;font-size:25rpx}.claim-block button{margin-top:18rpx}.rule-note{font-size:22rpx;color:#7c8b99;display:block;line-height:1.6;margin-top:15rpx}
</style>
<style scoped>
.assistant-error{display:block;color:#a64a35;font-size:24rpx;line-height:1.7;margin:16rpx 0}.verification-line{border-bottom:1rpx solid #e7ebf0;padding:18rpx 0;color:#334c65;font-size:25rpx;line-height:1.7}.verification-line text{display:block;color:#115740;font-size:23rpx}
.assistant-note{color:#526479}
</style>
