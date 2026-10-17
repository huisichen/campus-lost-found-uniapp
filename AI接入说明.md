# DeepSeek 图文匹配接入状态

当前 GitHub Pages 页面保持原 UI 和原规则匹配。Supabase `ai-match` Edge Function 已部署，但网页中的 AI 开关保持关闭，因为项目的匿名登录尚未启用；不能把公开的 DeepSeek 密钥写进 H5 包来绕过这一步。

## 已完成

- 后端使用 DeepSeek `deepseek-flash` 对一条丢失物品和最多五条同类拾取物品的文字、照片进行比较，只有置信度达到阈值的候选才返回。
- DeepSeek 密钥保存在 Supabase Vault。网页及 GitHub 只包含可公开的 Supabase 地址和 publishable key。
- 证件类只使用已脱敏文字，不发送证件照片；服务端额外过滤常见手机号和证件号。
- 接口验证登录令牌，每个登录身份每天最多调用十次；仅允许本站来源，限制请求体与图片大小。
- “我的 → 匹配提醒”使用现有列表显示匹配。App 运行期间可尝试本地通知，H5 可尝试浏览器通知；均不等于后台远程推送。
- 保留原规则匹配作为 AI 未启用或失败时的回退。页面布局、样式、图标和模块未更改。

## 启用条件

1. 在 Supabase 项目 `gfmcllytyanpinnzgqec` 的 Auth → Providers 中启用 Anonymous Sign-Ins，并考虑开启 CAPTCHA 防止滥用。当前用户选择暂不启用。
2. 用真实账号与图片完成一次端到端测试。确认数据使用范围和隐私告知。
3. 构建时设置 `VITE_SUPABASE_URL`、`VITE_SUPABASE_PUBLISHABLE_KEY` 及 `VITE_AI_ENABLED=true`；可参考 `.env.example`。这些都是公开客户端配置，不包含 DeepSeek 密钥。
4. 若要不同设备之间匹配及手机后台推送，还必须把现有本机体验账号、发布记录和审核流程迁到带权限控制的共享数据库，并配置 UniPush 或其他推送服务。当前版本尚未实现这两项。

## 验证

`node tests/store.test.mjs` 和 `node tests/ai-match.test.mjs` 检查原有业务逻辑、请求校验、证件照片排除、密钥隔离、调用额度与结果清洗。真正的 DeepSeek 调用及通知到达需要启用登录后再做端到端验证。
