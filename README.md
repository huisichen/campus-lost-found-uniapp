# 珞珈校园失物招领（uni-app + Vue 3）

武汉大学校园失物招领的课程项目：手机端界面、学号登录、发布与审核、规则匹配、认领流程、管理员看板。
**不是武汉大学官方应用**，站内物品、地点与用户均为演示数据。

> 本版本 = GitHub 上游最新版（含图片识别、智能认领核验、匹配提醒等 API 功能）+ 我们做的「学号 + 学校邮箱验证码」登录改造。

## 在线预览

- 网页版：https://huisichen.github.io/campus-lost-found-uniapp/
- 安卓安装包 v1.2.1：https://github.com/huisichen/campus-lost-found-uniapp/releases/tag/v1.2.1-android
- 页面文件在 `docs/` 目录（GitHub Pages 发布源）。

## 功能

### 2026-11-21 老师纪要改造

新增 [Python 后端与部署说明](backend/README.md)：真实 SMTP 邮箱验证码、共享数据库、服务端管理员权限、信息下架、分类初筛与模型细匹配、刷新拉取匹配结果、持久任务队列和 token 记录。页面样式保留。

8 组后端 HTTP 集成测试及原有 4 组测试通过；本地浏览器已完成登录、发布与跨账号匹配联调（注入测试邮件收件箱和模型替身）。

2026-11-26：现有服务器上的 DeepSeek 密钥已配置，真实文字识别、图片识别、候选匹配和隐藏细节提取均返回有效结果，后端健康检查通过。SMTP 已有配置，真实邮件投递未在本轮重新验收。域名解析已恢复，但域名访问被阿里云备案检查返回 403；用户确认备案正在审核，HTTPS 与客户端完整联调仍待完成。GitHub Pages 和 v1.2.1 APK 保留原展示配置，未切换至被拦截的接口。

大厅上方重复的“大厅／丢失物品／拾取物品”标签已删除，保留底部导航、搜索、分类、数量和发布入口。其余页面样式保留。[服务器再部署指南](服务器再部署指南.md) 包含配置与迁移步骤；真实密钥、数据库和配置备份不在仓库中。

用户端

- 学号 + 学校邮箱验证码登录（13 位学号，首次登录自动建档）
- 大厅／丢失物品／拾取物品／我的 四个底部入口
- 按关键词与分类筛选；证件类信息自动脱敏（`张小明 → 张**`、`420123…9876 → 4****************6`）
- 发布丢失／招领信息，新信息先进入待审核
- 物品详情、规则式可能匹配、认领申请、撤回、匹配提醒
- 「尝试图片识别」：调用 DeepSeek 填入名称、分类与外观描述（需 `VITE_AI_ENABLED=true`）
- 「开始智能核验」：按轮次回答隐藏细节问题，服务端只回状态不回原答案

管理端

- 今日登记／发布／归还、待处理数量、近七日趋势、高发地点、分类分布
- 信息审核、归还确认、归还点分配与维护
- 认领结果登记
- 用户列表（学号与邮箱脱敏、最近登录、是否已验证）

## 登录方式

输入 13 位学号 → 点「获取验证码」→ 验证码发到 `学号@whu.edu.cn` → 输入 6 位验证码进入平台。

| 姓名 | 学号 | 角色 |
| --- | --- | --- |
| 李同学 | 2026302012345 | 学生 |
| 王同学 | 2026302012346 | 学生 |
| 张同学 | 2026302012347 | 学生 |
| 陈同学 | 2026302012348 | 学生 |
| 周同学 | 2026302012349 | 学生 |
| 平台管理员 | 2026900000001 | 管理员 |

- **默认演示模式**：不真正发信，验证码直接显示在登录页的黄色提示框里。
- 真实发信：`.env` 中设置 `VITE_OTP_MODE=supabase` 并填好 `VITE_SUPABASE_URL`、`VITE_SUPABASE_PUBLISHABLE_KEY`，再到 Supabase 控制台 Auth → Email 配置 SMTP。
- 邮箱域名常量在 `utils/auth.js` 的 `EMAIL_DOMAIN`（默认 `@whu.edu.cn`）。

## 运行

用 HBuilderX（推荐，最省事）

1. 安装 HBuilderX App 开发版
2. 文件 → 打开目录，选择本目录
3. 运行 → 运行到浏览器／运行到手机或模拟器

用命令行（生成网页版）

```bash
npm install
npm run dev        # 本地开发
npm run build:pages  # 重新生成 docs/ 网页版产物
npm test           # 核心逻辑测试（node，无需浏览器）
```

## 目录结构

```
pages/            页面（login / home / publish / detail / mine / points / admin/*）
components/       导航、图标、校徽等组件
utils/auth.js     学号 + 邮箱验证码登录、自动建档、会话
utils/store.js    本机数据层、脱敏规则、统计；登录函数再导出
utils/cloud.js    可选的 Supabase 云端模式（VITE_CLOUD_ENABLED）
utils/ai-service.js    AI 图文匹配调用
utils/assistant-client.js  图片识别与认领核验调用
utils/photo.js    图片读取与压缩
utils/match-notifications.js  匹配提醒与推送订阅
public/sw.js      网页版 Service Worker
supabase/         Edge Functions（ai-match / ai-process / ai-recognize / item-assistant）与迁移脚本
tests/            纯逻辑测试（4 套）
docs/             GitHub Pages 构建产物
scripts/build-pages.mjs  网页版构建脚本
scripts/dev-h5.mjs       H5 开发服务器
```

## 已知限制（请勿当成正式系统）

- 所有业务数据、账号与会话都保存在**浏览器／手机本地**（localStorage），换设备不同步。
- 任何人改写本机存储都能伪造身份；管理员角色是前端白名单判定。**不构成服务端认证**。
- 验证码默认不对接任何邮件服务；真实发信需要自行配置 SMTP。
- 未接入学校统一身份认证（CAS／OAuth），学校密码不应交给本应用保存。
- 归还点名称与地址为「待核实」示例，不可据此实际前往。
- 智能匹配、图片识别、认领核验需要 Supabase Edge Function 可用并配置 DeepSeek 密钥；未配置时自动退回本机规则推荐。
- 云端模式（`VITE_CLOUD_ENABLED=true`）走 Supabase Auth 邮箱密码登录，与本机验证码登录是两套互不混用的路径。

## 文档

- [`使用说明.md`](使用说明.md)：完整功能、登录、部署与限制说明
- [`AI接入说明.md`](AI接入说明.md)：AI 匹配函数与配额说明
