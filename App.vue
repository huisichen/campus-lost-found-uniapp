<script>
export default {
  onLaunch() { /* 本机初始数据在首次访问存储时初始化 */ }
}
</script>
<style>
page { background:#f5f7f9; color:#18314f; font-family: 'PingFang SC','Microsoft YaHei',sans-serif; font-size:28rpx; }
view,text,image,button,input,textarea,picker {box-sizing:border-box}
button {margin:0; line-height:1.5;}
button::after {border:0}
.brand {color:#002554}
.title {font-size:40rpx;font-weight:750;color:#002554}
.subtitle {font-size:24rpx;color:#74859b}
.page-body {min-height:100vh;padding-bottom:145rpx}
.page-pad {padding:28rpx}
.surface {background:#fff}
.line {height:1rpx;background:#e7ebf0}
.muted {color:#7c8a9e;font-size:24rpx}
.small {font-size:23rpx}
.btn-primary {background:#002554;color:white;font-size:29rpx;border-radius:9rpx;padding:20rpx 26rpx;text-align:center}
.btn-green {background:#115740;color:white;font-size:29rpx;border-radius:9rpx;padding:20rpx 26rpx;text-align:center}
.btn-light {background:#eef3f7;color:#002554;border:1rpx solid #d8e3ed;font-size:27rpx;border-radius:8rpx;padding:17rpx 25rpx;text-align:center}
.btn-outline {background:#fff;color:#002554;border:1rpx solid #b6c8db;font-size:27rpx;border-radius:8rpx;padding:17rpx 25rpx;text-align:center}
.section-head {display:flex;align-items:center;justify-content:space-between;margin:28rpx 0 18rpx}
.section-title {font-size:33rpx;color:#002554;font-weight:700}
.pill {font-size:21rpx; padding:6rpx 12rpx;border-radius:5rpx;background:#eff3f7;color:#60758d}
.pill-lost {background:#ffefe9;color:#c65c35}
.pill-found {background:#e5f3ec;color:#14764d}
.pill-ok {background:#e6f4ed;color:#14764d}
.pill-wait {background:#fff0df;color:#b36b25}
.field-title {display:block;color:#334c65;font-size:26rpx;font-weight:650;margin:25rpx 0 12rpx}
.field {border:1rpx solid #d9e2ea;background:white;border-radius:8rpx;min-height:84rpx;padding:0 22rpx;display:flex;align-items:center;font-size:27rpx}
.field-input {flex:1;height:82rpx;font-size:27rpx;color:#203951}
.field-area {height:190rpx;min-height:190rpx;padding:20rpx;line-height:1.7;width:100%;font-size:27rpx;color:#203951}
.no-data {padding:70rpx 24rpx;text-align:center;color:#8a98a8;font-size:26rpx}
.topbar {background:white;border-bottom:1rpx solid #e7ebf0;padding:22rpx 28rpx;display:flex;align-items:center;justify-content:space-between}
.topbar-title {font-size:34rpx;font-weight:750;color:#002554}
.flex-row {display:flex;align-items:center}
.flex-between {display:flex;align-items:center;justify-content:space-between}
.sep {height:13rpx;background:#f5f7f9}
.safe-bottom {padding-bottom:calc(20rpx + env(safe-area-inset-bottom))}
</style>
