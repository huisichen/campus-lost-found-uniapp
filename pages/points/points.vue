<template>
<view class="points-page">
 <view class="intro"><AppIcon name="pin" :size="49"/><view><text>校园归还地点</text><text>物品可交至不同地点，具体以发布信息为准</text></view></view>
 <view class="notice">以下地点信息尚待核实。未经管理员确认，不应据此直接前往。</view>
 <view class="point-row" v-for="p in list" :key="p.id"><view class="flex-between"><text class="point-name">{{p.name}}</text><text class="pill" :class="p.verified?'pill-ok':'pill-wait'">{{p.verified?'已确认':'待核实'}}</text></view><view><AppIcon name="pin" :size="27"/><text>位置：{{p.address}}</text></view><view><AppIcon name="clock" :size="27"/><text>开放时间：{{p.hours}}</text></view><view><AppIcon name="users" :size="27"/><text>负责单位：{{p.department}}</text></view></view>
 <view v-if="!list.length" class="no-data">尚未设置归还地点，请联系管理员配置。</view>
</view>
</template>
<script setup>
import {ref} from 'vue';import {onShow} from '@dcloudio/uni-app';import AppIcon from '../../components/AppIcon.vue';import {places} from '../../utils/store.js'
const list=ref([]);onShow(()=>list.value=places())
</script>
<style scoped>
.points-page{min-height:100vh}.intro{display:flex;background:#002554;color:#fff;align-items:center;padding:33rpx 29rpx;gap:19rpx}.intro>view{display:flex;flex-direction:column;gap:8rpx}.intro text:first-child{font-size:34rpx;font-weight:700}.intro text:last-child{font-size:23rpx;color:#e4eaf0}.notice{background:#fff7ec;color:#a67430;font-size:23rpx;padding:19rpx 26rpx;line-height:1.65}.point-row{background:white;margin-top:12rpx;padding:30rpx;border-bottom:1rpx solid #e3ebef}.point-name{font-size:30rpx;font-weight:700;color:#173754}.point-row>view:not(:first-child){display:flex;align-items:center;gap:12rpx;font-size:24rpx;color:#738499;margin-top:21rpx}
</style>
