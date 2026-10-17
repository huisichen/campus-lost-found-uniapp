<template>
  <image :src="current" :mode="failed?'aspectFit':'aspectFill'" @error="fallback"/>
</template>
<script setup>
import {ref} from 'vue'
// 来源：武汉大学官网“武大标识”页面。学校的标准校徽含有作为图形组成部分的英文字母。
// 离线环境或官网资源不可用时，自动使用中文校园示意图形；正式上线请提供授权的标准校徽本地文件。
const official='https://www.whu.edu.cn/__local/E/EA/D6/D007F1FEAD3CBA8EE4667228D78_778EF543_153C9.png?e=.png'
const current=ref(official),failed=ref(false)
function fallback(){if(!failed.value){failed.value=true;current.value='/static/branding/school-mark-demo.png'}}
</script>
