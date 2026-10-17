<template><image class="app-icon" :src="'/static/icons/' + name + '.png'" :style="{width:size+'rpx',height:size+'rpx'}" mode="aspectFit" /></template>
<script setup>defineProps({name:{type:String,default:'other'},size:{type:Number,default:38}})</script>
<style scoped>.app-icon{display:inline-block;flex-shrink:0}</style>
