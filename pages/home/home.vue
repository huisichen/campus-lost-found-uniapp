<template>
<view class="page-body">
 <view class="head"><SchoolLogo class="brand-logo"/><view class="head-name"><text>武汉大学</text><text>校园失物招领</text></view><view class="head-tools" @tap="toPoints"><AppIcon name="pin" :size="39"/><text>归还地点</text></view></view>
 <view v-if="active==='home'" class="hero"><image src="/static/photos/campus-wuhan-demo.jpg" mode="aspectFill"/><view class="hero-shade"></view><view class="hero-message"><text class="hero-main">让每一份遗失</text><text class="hero-main">都能回到身边</text><text class="hero-small">武汉大学校园失物招领服务平台</text></view></view>
 <view class="filter-area">
  <view class="search"><AppIcon name="search" :size="34"/><input v-model="query" confirm-type="search" placeholder="搜索物品名称、地点、描述"/><view @tap="searchGo">搜索</view></view>
  <scroll-view scroll-x class="category-scroll" :show-scrollbar="false"><view class="category-list"><view v-for="c in categories" :key="c" class="cat" :class="selectedCat===c?'cat-active':''" @tap="selectedCat=c"><AppIcon :name="categoryIcon(c)" :size="40"/><text>{{c}}</text></view></view></scroll-view>
 </view>
 <view class="action-strip"><view @tap="toPublish('lost')"><AppIcon name="search" :size="38"/><text>发布丢失信息</text><text class="arrow">›</text></view><view @tap="toPublish('found')"><AppIcon name="add" :size="38"/><text>发布招领信息</text><text class="arrow">›</text></view></view>
 <view class="list-box">
  <view class="section-head"><view class="section-title">{{active==='lost'?'丢失物品':active==='found'?'拾取物品':'最新失物与招领'}}</view><view class="refresh" @tap="reload"><AppIcon name="refresh" :size="29"/><text>刷新</text></view></view>
  <view class="filter-tabs"><text :class="active==='home'?'active':''" @tap="setActive('home')">大厅</text><text :class="active==='lost'?'active':''" @tap="setActive('lost')">丢失物品</text><text :class="active==='found'?'active':''" @tap="setActive('found')">拾取物品</text><text class="result-count">共{{filtered.length}}条</text></view>
  <ItemRow v-for="p in filtered" :key="p.id" :item="p"/>
  <view v-if="!filtered.length" class="no-data">没有找到符合条件的物品，试试其他关键词。</view>
 </view>
 <UserNav :active="active" />
</view>
</template>
<script setup>
import {ref,computed,onMounted,onUnmounted} from 'vue'
import SchoolLogo from '../../components/SchoolLogo.vue';import UserNav from '../../components/UserNav.vue';import AppIcon from '../../components/AppIcon.vue';import ItemRow from '../../components/ItemRow.vue'
import {CATEGORIES,categoryIcon,publishedPosts,requireRole} from '../../utils/store.js'
const categories=['全部分类',...CATEGORIES];const active=ref('home'),selectedCat=ref('全部分类'),query=ref(''),items=ref([])
const filtered=computed(()=>items.value.filter(p=>(active.value==='home'||p.kind===active.value)&&(selectedCat.value==='全部分类'||p.category===selectedCat.value)&&(!query.value||[p.title,p.description,p.location,p.category].join(' ').includes(query.value.trim()))))
function reload(){items.value=publishedPosts()}
function searchGo(){reload()}
function setActive(v){active.value=v}
function toPublish(kind){uni.navigateTo({url:'/pages/publish/publish?kind='+kind})}
function toPoints(){uni.navigateTo({url:'/pages/points/points'})}
function setupPage(opt){active.value=['lost','found'].includes(opt?.tab)?opt.tab:'home';if(requireRole('user'))reload()}
// 页面路由参数使用页面级生命周期，保证底部导航重定向时参数仍可用。
import {onLoad,onShow} from '@dcloudio/uni-app'
onLoad(setupPage);onShow(()=>{if(requireRole('user'))reload()})
</script>
<style scoped>
.head{background:#fff;display:flex;align-items:center;padding:19rpx 24rpx;border-bottom:1rpx solid #e2e7ed;height:104rpx}.brand-logo{width:70rpx;height:70rpx}.head-name{display:flex;flex-direction:column;margin-left:15rpx;font-weight:700;color:#002554;font-size:25rpx;line-height:1.4}.head-name text:last-child{font-size:22rpx}.head-tools{margin-left:auto;display:flex;gap:7rpx;align-items:center;font-size:22rpx;color:#527088}
.hero{height:300rpx;position:relative}.hero image{width:100%;height:100%}.hero-shade{position:absolute;inset:0;background:linear-gradient(90deg,rgba(0,27,57,.75),transparent)}.hero-message{position:absolute;top:55rpx;left:38rpx;color:white;display:flex;flex-direction:column;gap:6rpx}.hero-main{font-family:serif;font-size:46rpx;font-weight:bold;letter-spacing:4rpx}.hero-small{font-size:21rpx;margin-top:18rpx}
.filter-area{background:white;padding:22rpx 25rpx 10rpx}.search{height:76rpx;background:#f5f7f9;border:1rpx solid #d7e1ea;border-radius:7rpx;display:flex;align-items:center;padding-left:15rpx;gap:10rpx}.search input{flex:1;font-size:24rpx;height:68rpx}.search>view{height:75rpx;line-height:75rpx;background:#002554;color:white;padding:0 29rpx;font-size:25rpx}.category-scroll{margin-top:18rpx;white-space:nowrap}.category-list{display:flex;gap:8rpx;width:max-content;padding-bottom:12rpx}.cat{min-width:115rpx;padding:13rpx 15rpx;display:flex;flex-direction:column;align-items:center;gap:7rpx;font-size:20rpx;color:#60738b;border-bottom:3rpx solid transparent}.cat-active{border-color:#002554;background:#edf3f8;color:#002554;font-weight:700}
.action-strip{display:flex;gap:15rpx;background:#fff;padding:14rpx 24rpx 22rpx}.action-strip>view{flex:1;border:1rpx solid #dce4ec;padding:23rpx 12rpx;display:flex;align-items:center;gap:9rpx;color:#002554;font-size:24rpx;font-weight:700}.action-strip>view:last-child{background:#f0f6f2;color:#115740;border-color:#d5e5dc}.arrow{margin-left:auto;font-size:34rpx}.list-box{background:#fff;margin-top:14rpx;padding:3rpx 25rpx 28rpx}.refresh{display:flex;gap:5rpx;color:#77899a;font-size:23rpx;align-items:center}.filter-tabs{display:flex;align-items:center;gap:36rpx;border-bottom:1rpx solid #e9eef1}.filter-tabs text{color:#65798c;font-size:26rpx;padding-bottom:19rpx}.filter-tabs text.active{color:#002554;font-weight:700;border-bottom:4rpx solid #002554}.filter-tabs .result-count{margin-left:auto;font-size:20rpx}
</style>
