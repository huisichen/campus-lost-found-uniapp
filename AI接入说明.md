# DeepSeek 与推送接入说明

现有 UI 的结构、颜色、图标及 CSS 未改。仅修正了“本机保存”“服务待接入”等事实提示，并把原有入口接到真实服务。

## 服务端

Supabase 项目 `gfmcllytyanpinnzgqec` 已部署 `ai-recognize`（照片分类与描述）和 `ai-process`（审核后的图文匹配、站内通知与 Web Push）两个需要有效用户 JWT 的 Edge Functions。原 `ai-match` 保留但当前页面不再直接提交任意候选数据。数据库迁移在 `supabase/migrations/202610190001_cloud_core.sql` 至 `202610190004_revoke_trigger_rpc.sql`。

邮箱验证开启，匿名登录关闭。第一个管理员邮箱仅在数据库许可名单，不在仓库。管理员需自己注册并点击验证邮件；验证后重新登录，JWT 才会带管理员角色。后台权限由 RLS 和 Edge Function 双重校验。

DeepSeek API 密钥与 Web Push VAPID 私钥保存在 Supabase Vault。若之前的 API 密钥曾在聊天或其他地方明文传播，建议在 DeepSeek 控制台轮换，然后只更新 Vault 中的值。

## Web Push 条件

用户登录后点击“我的 → 匹配提醒”，浏览器请求通知权限，注册根目录 `sw.js`，并把订阅保存到 `push_subscriptions`。只有新匹配写入站内通知时才发送推送；已失效订阅会清理。支持的浏览器与系统条件见[WebKit 的 iOS Web Push 说明](https://webkit.org/blog/13878/)及[Web Push 库文档](https://github.com/MMMikeM/web-push)。安卓原生 App 需要另行完成 DCloud UniPush 2.0 配置和实机测试。

## 当前验证状态

本地逻辑测试和 H5 编译已通过；数据库已部署，服务端密钥存在性已检查。由于线上尚无已验证账号、真实物品和设备推送订阅，**尚未完成真实 DeepSeek 调用、跨设备通知送达和安卓原生推送实机验收**。不能把这些未验收项目描述为已验证成功。
