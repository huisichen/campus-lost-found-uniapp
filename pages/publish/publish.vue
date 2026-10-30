<template>
<view class="page-pad publish">
 <view class="kind-tabs"><view :class="kind==='lost'?'current lost':''" @tap="kind='lost'"><AppIcon name="search" :size="39"/>发布丢失信息</view><view :class="kind==='found'?'current found':''" @tap="kind='found'"><AppIcon name="add" :size="39"/>发布招领信息</view></view>
 <view class="form-section">
  <text class="form-heading">物品基本信息</text>
  <text class="field-title">物品分类 <text class="required">*</text></text>
  <picker mode="selector" :range="categories" :value="categoryIndex" @change="changeCategory"><view class="field">{{categories[categoryIndex]}}<text class="pick-arrow">⌄</text></view></picker>
  <text class="field-title">物品名称 <text class="required">*</text></text>
  <view class="field"><input class="field-input" v-model="title" maxlength="30" placeholder="例如：黑色双肩包、学生证"/></view>
  <text class="field-title">{{kind==='lost'?'丢失地点':'拾到地点'}} <text class="required">*</text></text>
  <picker :range="areas" :value="areaIndex" @change="e=>areaIndex=Number(e.detail.value)"><view class="field">{{areas[areaIndex]}}<text class="pick-arrow">⌄</text></view></picker>
  <text class="field-title">物品特征与说明</text>
  <view class="field field-large"><textarea class="field-area" v-model="description" maxlength="200" placeholder="写下颜色、品牌、遗失位置等特征，请勿公开电话、完整证件号"/></view>
  <text class="field-title">{{kind==='lost'?'丢失日期范围':'拾取日期范围'}}（选填）</text>
  <picker mode="date" :value="eventStart" @change="e=>eventStart=e.detail.value"><view class="field">{{eventStart||'选择开始日期'}}<text class="pick-arrow">⌄</text></view></picker>
  <picker mode="date" :value="eventEnd" :start="eventStart" @change="e=>eventEnd=e.detail.value"><view class="field">{{eventEnd||'选择结束日期'}}<text class="pick-arrow">⌄</text></view></picker>
 </view>
 <view v-if="isDocument" class="form-section">
  <text class="form-heading">证件信息保护</text>
  <view class="protect"><AppIcon name="shield" :size="40"/><text>姓名仅公开第一个字，其余用星号遮挡；证件号码仅公开首尾字符。原始内容不会保存。</text></view>
  <text class="field-title">证件姓名（仅用于本次自动脱敏）</text><view class="field"><input class="field-input" v-model="holderName" maxlength="30" placeholder="如：张小明，公开后显示张**"/></view>
  <text class="field-title">证件号码（仅用于本次自动脱敏）</text><view class="field"><input class="field-input" v-model="documentNo" maxlength="24" placeholder="公开页面仅显示首尾字符"/></view>
  <view class="preview"><text>公开效果：</text><text>{{maskName(holderName)||'姓**'}}　{{maskDocument(documentNo)||'首********尾'}}</text></view>
  <view class="doc-warning">为保护隐私，证件照片不公开上传；认领时由管理员线下核验。</view>
 </view>
 <view v-else class="form-section">
  <text class="form-heading">物品照片</text>
  <view class="upload-row" @tap="selectImage"><image v-if="photo" :src="photo" mode="aspectFill"/><view v-else><AppIcon name="camera" :size="49"/><text>拍照或从相册选择</text></view></view>
  <text class="note assistant-note">{{aiAvailable?'照片将传给 DeepSeek 提取外观特征；照片保存在本机，服务端保存解析后的属性和特征向量。请勿上传证件照片。':'可选填，建议上传清晰的物品照片。当前数据仅保存在本机。'}}</text>
  <view class="recognition" @tap="runRecognition"><AppIcon name="image" :size="30"/><text>{{recognizing?'正在识别物品…':'尝试图片识别'}}</text><text class="dim">{{aiAvailable?'（AI 辅助填写）':'（服务待接入）'}}</text></view>
 </view>
 <view v-if="kind==='found'&&!isDocument" class="form-section">
  <text class="form-heading">认领核验细节</text>
  <text class="note assistant-note">选填至少两处未公开的细节，如内衬颜色、夹层内容物或隐蔽标记。仅供智能问答核验，不会出现在大厅。请勿填写姓名、联系方式和完整证件号。</text>
  <view class="field field-large"><textarea class="field-area" v-model="hiddenDetails" maxlength="800" placeholder="例如：内衬的具体颜色；夹层里放了什么；不易看见的位置有什么标记。"/></view>
 </view>
 <view v-if="kind==='found'" class="form-section">
  <text class="form-heading">归还地点</text>
  <text class="note">不同物品可选择不同归还点。当前地点尚待核实，请以管理员确认后的信息为准。</text>
  <picker :range="pointNames" :value="pointIndex" @change="e=>pointIndex=Number(e.detail.value)"><view class="field point-field">{{pointNames[pointIndex]}}<text class="pick-arrow">⌄</text></view></picker>
 </view>
 <view class="footer-actions"><button class="btn-outline" @tap="cancel">取消</button><button class="btn-primary" :disabled="saving" @tap="submit">提交审核</button></view>
 <view class="bottom-note">发布后由管理员审核，通过后在大厅展示。{{aiAvailable?'在“我的 → 匹配提醒”查看图文匹配线索；认领结果仍由管理员确认。':'当前版本暂无真正的图像识别和消息推送服务。'}}</view>
</view>
</template>
<script setup>
import {ref,computed} from 'vue';import {onLoad} from '@dcloudio/uni-app';import AppIcon from '../../components/AppIcon.vue'
import {CATEGORIES,LOST_AREAS,publish,places,maskName,maskDocument,requireRole,refreshCloud} from '../../utils/store.js'
import {recognizeItemImage,aiAvailable,syncAiItem} from '../../utils/ai-service.js'
const kind=ref('lost'),categories=CATEGORIES,categoryIndex=ref(0),areas=LOST_AREAS,areaIndex=ref(0),title=ref(''),description=ref(''),holderName=ref(''),documentNo=ref(''),photo=ref(''),saving=ref(false),pointIndex=ref(0),points=ref([])
const isDocument=computed(()=>CATEGORIES[categoryIndex.value]==='证件卡类')
const hiddenDetails=ref(''),eventStart=ref(''),eventEnd=ref(''),recognizing=ref(false)
const pointNames=computed(()=>['暂不指定，由管理员安排',...points.value.map(p=>p.name)])
onLoad(async opts=>{kind.value=opts.kind==='found'?'found':'lost';if(requireRole('user')){try{await refreshCloud();points.value=places()}catch{points.value=[]}}})
function changeCategory(e){categoryIndex.value=Number(e.detail.value);if(isDocument.value)photo.value=''}
function selectImage(){uni.chooseImage({count:1,sizeType:['compressed'],sourceType:['camera','album'],success:r=>{const file=r.tempFilePaths[0];uni.saveFile({tempFilePath:file,success:res=>{photo.value=res.savedFilePath},fail:()=>{photo.value=file;uni.showToast({title:'图片为临时文件，重启后可能失效',icon:'none'})}})},fail:()=>{}})}
async function runRecognition(){if(recognizing.value)return;recognizing.value=true;try{const result=await recognizeItemImage(photo.value);const index=CATEGORIES.indexOf(result.category);if(index>=0)categoryIndex.value=index;if(result.title)title.value=result.title;if(result.description)description.value=result.description;uni.showToast({title:'已填入识别结果，请核对',icon:'none'})}catch(e){uni.showModal({title:'图片识别',content:e.message,showCancel:false})}finally{recognizing.value=false}}
function cancel(){uni.navigateBack()}
async function submit(){if(!title.value.trim()){uni.showToast({title:'请输入物品名称',icon:'none'});return}if(saving.value)return;saving.value=true
 try{if(eventStart.value&&eventEnd.value&&eventEnd.value<eventStart.value)throw new Error('结束日期不能早于开始日期');const post=await publish({kind:kind.value,title:title.value.trim(),category:categories[categoryIndex.value],location:areas[areaIndex.value],description:description.value.trim(),image:isDocument.value?'':photo.value,holderName:isDocument.value?holderName.value:'',documentNo:isDocument.value?documentNo.value:'',pointId:kind.value==='found'&&pointIndex.value>0?points.value[pointIndex.value-1].id:'',eventStart:eventStart.value,eventEnd:eventEnd.value});
 let aiMessage='';if(aiAvailable){try{await syncAiItem(post,kind.value==='found'&&!isDocument.value&&hiddenDetails.value.trim()?hiddenDetails.value.trim():undefined)}catch(e){aiMessage=`智能资料暂未完成：${e.message}。可在物品详情中重试登记。`}}
 holderName.value='';documentNo.value='';hiddenDetails.value='';uni.showModal({title:'提交成功',content:`信息已进入待审核列表，可在“我的发布”中查看。${aiMessage}`,showCancel:false,success:()=>uni.redirectTo({url:'/pages/mine/mine'})})
 }catch(e){uni.showToast({title:e.message||'提交失败',icon:'none'})}finally{saving.value=false}}
</script>
<style scoped>
.publish{padding-bottom:65rpx}.recognition{display:flex;gap:10rpx;align-items:center;color:#285880;font-size:23rpx;margin-top:18rpx}.recognition .dim{color:#8996a4}.kind-tabs{display:flex;background:#fff;margin:-28rpx -28rpx 15rpx;border-bottom:1rpx solid #e2e8ec}.kind-tabs view{flex:1;text-align:center;padding:27rpx 10rpx;color:#6f8090;font-size:27rpx;display:flex;gap:8rpx;align-items:center;justify-content:center}.kind-tabs .current{border-bottom:5rpx solid #002554;color:#002554;font-weight:700}.kind-tabs .found{border-color:#115740;color:#115740}.form-section{background:white;padding:28rpx;margin:0 -3rpx 16rpx;border:1rpx solid #e7ecef}.form-heading{font-size:30rpx;color:#002554;font-weight:750;border-left:7rpx solid #115740;padding-left:17rpx}.pick-arrow{margin-left:auto;color:#7793a1;font-size:30rpx}.required{color:#c95d43}.field-large{height:194rpx;padding:0}.protect{display:flex;gap:15rpx;background:#eef5f1;padding:20rpx;margin-top:22rpx;align-items:flex-start;color:#41665a;line-height:1.6;font-size:23rpx}.preview{margin-top:20rpx;background:#f5f7f8;padding:17rpx;display:flex;flex-wrap:wrap;font-size:23rpx;color:#526479}.doc-warning{font-size:22rpx;color:#a35d4d;margin-top:19rpx}.upload-row{margin-top:23rpx;width:190rpx;height:190rpx;border:2rpx dashed #bdcbd8;display:flex;align-items:center;justify-content:center;text-align:center}.upload-row>image{width:100%;height:100%}.upload-row>view{display:flex;flex-direction:column;align-items:center;gap:12rpx;font-size:21rpx;color:#68809a}.note{font-size:22rpx;color:#85929f;line-height:1.7;display:block;margin-top:17rpx}.point-field{margin-top:21rpx}.footer-actions{display:flex;gap:18rpx;margin-top:28rpx}.footer-actions button{flex:1}.bottom-note{color:#8390a0;font-size:22rpx;line-height:1.5;text-align:center;margin:20rpx}
</style>
<style scoped>
.assistant-note{color:#526479}
</style>
