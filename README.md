# IELTS Review Atlas

一个独立的雅思阅读 / 听力错题复盘网站，专门用来记录错题、上传截图、统计高频题型和错因，并调用 AI 生成复盘总结。

## 推荐使用方式

正式使用时，推荐把这个子站单独部署成在线版本：

- 前端：Cloudflare Pages
- 在线 AI：Cloudflare Pages Functions 调 GemAI 的 OpenAI 兼容接口
- 云端保存：Cloudflare KV

这样页面打开后就会自动连接在线 AI，也能自动登录同一个同步账号并拉取云端错题档案，不需要每次本地启动 `server.py`。

根目录的本地 `server.py` 现在只是调试备用方案，不再是日常使用的必需条件。

## 已包含功能

- 阅读 / 听力错题分模块录入
- 按题目来源、题号、题型、错因、原文定位、同义替换、复盘心得记录单题
- 图片上传、拖拽和粘贴截图
- 本地统计高频题型和常见错因
- 本地导出 / 导入 JSON，导出 CSV
- AI 结合结构化统计和题目截图做整批复盘
- 登录同步账号后自动云端备份与跨设备同步
- 默认按 GemAI 的 OpenAI 兼容接口配置，模型默认 `gpt-5.1-thinking`

## 本地运行

这部分只用于本地调试。如果你要的是日常在线使用，优先看下面的 Cloudflare Pages 部署。

1. 在仓库根目录启动本地代理：

```bash
cd /Users/shyn/Documents/Playground
export OPENAI_API_KEY="你的 GemAI / OpenAI 兼容 Key"
export OPENAI_BASE_URL="https://api.gemai.cc/v1"
export OPENAI_ERROR_REVIEW_MODEL="gpt-5.1-thinking"
python3 server.py
```

2. 打开：

- `http://127.0.0.1:8000/reading-listening-review/`

3. 页面会调用以下本地接口：

- `GET /api/ai/error-review-status`
- `POST /api/ai/error-review`
- `POST /api/cloud-sync/auth`
- `GET /api/cloud-sync/state`
- `POST /api/cloud-sync/state`

本地模式下，云端同步数据会单独保存在：

- `/Users/shyn/Documents/Playground/.reading-review-cloud-sync.json`

这样即使你不用线上部署，也能先体验“注册账号 -> 自动同步”的完整流程。

## Cloudflare Pages 部署

这个子站已经额外带了 Cloudflare Pages Functions 版本的 AI 接口和云同步接口，适合单独部署，不会影响你现有的写作站。

推荐做法：

1. 在 Cloudflare Pages 新建一个独立项目，把项目根目录指向：

- `/Users/shyn/Documents/Playground/reading-listening-review`

2. 把 [wrangler.example.toml](/Users/shyn/Documents/Playground/reading-listening-review/wrangler.example.toml) 复制成你自己的 `wrangler.toml`，并填上 Cloudflare KV 的 `id` 和 `preview_id`。

3. 在 Pages 项目环境变量里设置：

- `OPENAI_API_KEY`
- `OPENAI_BASE_URL=https://api.gemai.cc/v1`
- 可选：`OPENAI_ERROR_REVIEW_MODEL=gpt-5.1-thinking`

4. 再额外绑定一个 Cloudflare KV Namespace，绑定名必须是：

- `REVIEW_ATLAS_SYNC`

5. Pages 会自动使用：

- `functions/api/ai/error-review.js`
- `functions/api/ai/error-review-status.js`
- `functions/api/cloud-sync/auth.js`
- `functions/api/cloud-sync/state.js`

## 说明

- 这个站点和现有写作批改站的 Netlify 配置完全分离。
- 即使你后续把这个站部署到 Cloudflare，也不会占用原来写作站的 Netlify 额度。
- 图片会先在浏览器端压缩再发送，能减少免费额度下的请求压力。
- 页面打开时会自动检测在线 AI 状态；如果你已经登录过同步账号，也会自动尝试拉取云端较新的那一份错题档案。
- 如果你前端和后端不是同域部署，可以在 [site-config.js](/Users/shyn/Documents/Playground/reading-listening-review/site-config.js) 里填写：

```js
window.__IELTS_REVIEW_ATLAS_CONFIG__ = {
  backendBaseUrl: "https://your-backend.example.com",
  aiApiBaseUrl: "https://your-ai-api.example.com",
  cloudSyncBaseUrl: "https://your-cloud-sync.example.com",
};
```
