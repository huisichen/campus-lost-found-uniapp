# 老师纪要对应的服务端改造

这是 Python 3.11+ 服务（仅用标准库），面向单台轻量服务器上的小范围试用。SQLite WAL 数据库放在服务器持久磁盘，所有用户共享；无需依赖某个用户手机。单个服务进程包含并发 HTTP 请求、2 个匹配任务线程和可恢复的数据库队列。不能启动多个服务副本共用这个队列。

## 已落地

- 163 SMTP SSL 真实发信，验证码由服务端生成、HMAC 摘要保存，5 分钟有效，最多 5 次尝试，60 秒重发间隔，邮箱及 IP 限流。发送失败直接报错，不降级为页面验证码。
- 服务端签发 256 位随机登录凭证，数据库只存摘要，7 天过期，退出后立即吊销。管理员名单仅从服务器环境配置读取，前端填写角色无效。
- 物品、认领、归还点、审核日志、账号、匹配结果均在共享数据库。待审核记录仅发布者和管理员可见；其他用户只看已审核公开记录。图片持久保存，不依赖本机临时路径。证件姓名和号码服务端再次脱敏，不收证件照片。
- 管理员审核、下架、分配归还点、归还确认和认领结果登记均有后端鉴权与状态校验。
- SQL 按类别、相反发布类型、不同发布者、审核状态初筛，再使用模型解析的图文属性编码召回及 DeepSeek 细匹配。颜色、形态、品牌或时间冲突限制高分。新记录审核通过后自动排队；结果分别归属于失主与拾获者。
- 不引入 WebSocket。用户切页、点击“匹配提醒”时刷新云端记录并拉取本人结果。下架或归还后立即过滤失效的匹配。
- 模型调用记录 prompt/completion/total tokens、失败状态和日期；每日用户次数、全站 token 预算限制。后台任务失败退避重试，进程重启恢复未完成任务。管理看板原提示区域显示近期 token 总量和待执行任务数，详细汇总见 `/api/admin/operations`。
- 保留隐藏细节认领问答：只有发布者能登记事实，问答不返回答案，认领申请提交时原子消费核验结果；管理员仍最终确认物品归属。

## 当前边界

截至 2026-11-26，现有服务器的后端正在运行，DeepSeek 密钥仅在服务器配置，真实文字识别、背包图片识别、候选匹配和隐藏细节提取已验证，四次调用共返回 3614 tokens。测试物品不含真实用户资料，直接调用模型适配器，未写入用户发布或匹配数据库，也不计入应用的 usage 表。

SMTP 配置存在且 MAIL_DEBUG=0，但本轮未重新验收真实邮件送达。域名解析已恢复，域名访问仍被阿里云备案检查返回 403；用户确认备案正在审核。因此 HTTPS、跨设备完整流程、GitHub Pages 真实后端切换与新版安卓包尚未交付。现有网页与 v1.2.1 APK 继续保留原展示配置，不把健康检查或模型适配器测试称为客户端全流程验收。

8 组自动化测试使用真实本地 HTTP 请求及注入的测试邮件收件箱、模型替身，与上面的真实 DeepSeek 验证分别记录。匹配提醒仍为切页或点击时拉取，不是锁屏后的系统推送。

## 配置服务

1. 将代码部署到 Linux 的 `/opt/campus`，Python 至少 3.11。服务器发行版可自选，无第三方 Python 包依赖。
2. 复制 `backend/.env.example` 为 `backend/.env`。执行 `python -c "import secrets; print(secrets.token_urlsafe(48))"` 生成 APP_SECRET，仅填入服务端。
3. 注册并登录 163 邮箱，在其官方网页设置中开启 SMTP，取得客户端授权码；`SMTP_USER` 填完整邮箱，`SMTP_PASSWORD` 填授权码，`SMTP_FROM` 留空或填同一邮箱。服务商界面步骤以账号实际显示为准。
4. `ADMIN_STUDENT_NOS` 填真正管理员的 13 位学号（必须能接收对应学校邮箱验证码），不能使用示例学号作为真实管理员。`SCHOOL_EMAIL_DOMAIN` 需确认学校邮箱实际域名，不在代码中推断邮箱前缀与学号的对应关系。
5. `DEEPSEEK_API_KEY` 填原有 API 密钥，模型名通过 `DEEPSEEK_MODEL` 配置。密钥不能写进 VITE 配置、GitHub 或 APK。
6. 本地执行 `python -m backend.server`，健康检查 `http://127.0.0.1:8000/api/health`。配置不全不会伪造发信或模型响应。

## Linux 部署

创建非登录服务用户 `campus`，建 `/var/lib/campus` 并授予该用户读写权限。代码目录可读，`.env` 仅服务用户可读（权限 600）。服务器环境中设置：

```ini
DATABASE_PATH=/var/lib/campus/campus.sqlite3
BIND_HOST=127.0.0.1
TRUST_PROXY=true
ALLOWED_ORIGINS=https://你的展示地址
```

将 `deploy/campus.service` 放到 systemd，`deploy/nginx.conf` 安装为 nginx 站点，执行 nginx 配置检查后启用服务。只开放反向代理端口，数据库、API 8000 端口不公开。IP 可用于部署联通检查；真实邮箱和登录凭证的小范围使用前需配置 HTTPS，GitHub HTTPS 页面也无法调用 HTTP API。

## 接现有网页／安卓

在构建环境设置（不要填写任何私密值）：

```ini
VITE_BACKEND_URL=https://真实服务地址/api
VITE_AI_ENABLED=true
VITE_CLOUD_ENABLED=false
```

`VITE_BACKEND_URL` 非空后自动启用 Python 学校邮箱登录和云端业务数据；不使用旧本机账号和旧 Supabase 邮箱密码路径。请求使用 uni.request，支持 H5 和 App。服务启用前不要修改线上 `.env.production` 指向一个未部署地址。

同一服务器托管网页时可以用 `VITE_BACKEND_URL=/api`；安卓必须使用绝对 HTTPS 地址。保留原 H5 基路径 `/campus-lost-found-uniapp/`。生成网页：`node scripts/build-pages.mjs`；安卓通过现有 HBuilderX 云打包。

## 测试与上线核对

```bash
python -m unittest backend.test_backend -v
node tests/store.test.mjs
node tests/ai-match.test.mjs
node tests/assistant.test.mjs
node tests/photo.test.mjs
```

真实上线后，用两个真实学校邮箱账号分别在两台设备登录，一人发布失物、一人发布同类拾取物，管理员审核后核对双方拉取匹配结果。用确实不同的物品核对低分与无匹配，再检查 `/api/admin/operations` 的实际 tokens。没有收到邮件、没有匹配、模型额度耗尽均应展示错误或等待状态，不能提示成功。归还地点仅录入学校确认的位置。

上线前后使用 `python backend/deploy/backup.py /var/lib/campus/campus.sqlite3 /受保护备份目录/带日期.sqlite3` 备份。备份与数据库均包含业务及核验资料，不对外提供下载，不提交 GitHub。

现有浏览器／手机单机记录不会自动迁入共享数据库；试用使用真实用户重新发布，旧数据只在管理员核对、脱敏并确认归属后再导入。没有自动上传原 Excel 或证件照片。
