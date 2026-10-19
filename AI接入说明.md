# DeepSeek 与推送接入说明

当前已按展示需要回退为预设账号和本机数据。现有 UI 的结构、颜色、图标及 CSS 未改；生产构建关闭云端登录、DeepSeek 调用和 Web Push。以下内容是保留的后端准备工作，不代表当前网页版或安卓包已启用。

## 服务端

Supabase 项目 `gfmcllytyanpinnzgqec` 已部署 `ai-recognize`（照片分类与描述）和 `ai-process`（审核后的图文匹配、站内通知与 Web Push）两个需要有效用户 JWT 的 Edge Functions。原 `ai-match` 保留但当前页面不再直接提交任意候选数据。数据库迁移在 `supabase/migrations/202610190001_cloud_core.sql` 至 `202610190005_foreign_key_indexes.sql`。

Supabase 原有邮箱验证和管理员许可名单仍在服务端，但预设账号不会调用它们，也不会获得云端管理员权限。匿名登录仍关闭。未来若重新启用真实账号，需重新核对权限和登录流程。

DeepSeek API 密钥与 Web Push VAPID 私钥保存在 Supabase Vault。若之前的 API 密钥曾在聊天或其他地方明文传播，建议在 DeepSeek 控制台轮换，然后只更新 Vault 中的值。

## Web Push 条件

当前预设账号版不会建立 Web Push 订阅。原实现需要真实云端登录后，才会在“我的 → 匹配提醒”请求浏览器通知权限并把订阅保存到 `push_subscriptions`。支持条件见[WebKit 的 iOS Web Push 说明](https://webkit.org/blog/13878/)及[Web Push 库文档](https://github.com/MMMikeM/web-push)。安卓原生 App 还需单独完成 DCloud UniPush 2.0 配置和实机测试。

## 当前验证状态

数据库和服务端函数保留，但当前构建不使用。**真实 DeepSeek 调用、跨设备通知送达和安卓原生推送均未完成验收**。不能把这些未验收项目描述为当前可用功能。
