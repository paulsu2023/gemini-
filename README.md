# Gemini 体验

基于 **Google Vertex AI** 的中文多模态工作台 —— 在一个对话框里体验 **日常对话、原生画图与多轮改图、Veo 3.1 视频生成、语音合成**，带 **AI Studio 风格运行设置面板** 与 **前置提示词库（System Prompt）**。

## 功能一览

- **多模态全模型切换**：
  - 💬 **对话**：Gemini 4 Argon / Carbon、Gemini 3.8 / 3.7 / 3.6 / 3.5 Flash、Gemini 3.1 Pro 等；支持上传图片 / PDF / 音视频 / 代码与文档、思考过程展示、Google 联网搜索 Grounding、网页读取、Python 代码执行、JSON 输出模式。
  - 🎨 **画图**：Nano Banana 2.1、Gemini 3 Pro Image（支持 1K/2K/4K）、Gemini 3.1 Flash Image；支持比例选择、参考图上传、多轮对话改图。
  - 🎬 **视频（双引擎）**：
    - **Gemini Omni 1.2 Flash / Omni 1.1 Flash / Omni Flash**（走 Vertex AI Interactions API，支持最高 **15 秒** 音画同步视频与参考图生视频）；
    - **Veo 3.1 / Fast / Lite**（支持 16:9 与 9:16、4/6/8 秒、720p/1080p/4K、同步生成对白与音效、首帧图生视频、首尾帧插值）。
  - 🔊 **语音**：Gemini 3.8 / 2.5 Flash TTS，30 种音色 + 自然语言语气控制。
  - 🧪 **自定义模型**：顶部模型菜单可直接输入任意 Vertex 模型 ID 尝鲜。
- **🧠 长期记忆（本地 + Google Cloud 永久免费云双模存储）**：
  - **自动学习与注入**：聊天中提到个人背景、偏好或说「记住……」，系统会自动提炼为长期记忆并在后续所有对话中自动注入；也支持点击任意消息下方的「🧠 记住」、一键「✨ 从当前对话提炼」或手动增删改。
  - **本地 + 云端零配置双保险**：本地实时保存在浏览器与 `data/memories/` 目录；线上直接复用同一份 Google 服务账号凭据，自动存入 Google Cloud Storage `US-CENTRAL1` 永久免费层（`${project_id}-gemini-memory`，每月 5GB 容量 + 50,000 次读 + 5,000 次写永久免费，**无需额外部署数据库或申请新密钥**）。
  - **多用户记忆空间隔离**：支持自定义「记忆空间标识（昵称/口令）」，你和朋友共用同一个线上网址时，各自输入自己的昵称即可拥有完全独立的长期记忆与云端对话备份。
- **前置提示词库 & 运行设置**：右侧面板随时调整 System Prompt、温度、Top-P、思考强度、安全过滤等；可将常用人设存入提示词库或设为新对话默认。
- **隐私与安全**：
  - 服务账号密钥**只保存在服务端**，浏览器永远拿不到私钥。
  - 对话、图片、视频保存在用户自己的浏览器 IndexedDB，支持一键导出 / 导入 JSON 备份。
  - 支持通过 `ACCESS_PASSWORD` 开启访问密码，方便部署到公网给朋友使用。

---

## 本地运行

1. 环境要求：**Node.js >= 20**
2. 把 Google Cloud 服务账号 JSON 放到 `credentials/service-account.json`（该目录已在 `.gitignore` 中排除，不会被提交）。
3. 安装并启动：

```bash
npm install
npm start
```

Windows 下也可以：
- 双击 **`启动.bat`**：在本地打开 `http://localhost:3000`。
- 双击 **`启动并生成外网分享链接.bat`**：一键启动本地服务并建立 **Cloudflare 全球边缘隧道 (`*.trycloudflare.com`)**，**中国大陆的朋友无需翻墙/VPN 即可直接打开体验**。

---

## 线上部署（让中国大陆的朋友免翻墙直接体验）

由于后端需要直接调用海外的 Google Vertex AI 接口 (`aiplatform.googleapis.com`)，而国内朋友需要**不挂梯子直接打开网页**，推荐以下 **3 种对中国大陆最友好的部署方案**：

1. **方案一：本机一键 Cloudflare 边缘隧道分享（最快、0 成本、国内免翻墙直连）**
   - 直接双击项目目录下的 **`启动并生成外网分享链接.bat`**，终端会自动吐出一个 `https://xxxx.trycloudflare.com` 网址，发给国内朋友即可直接打开。
2. **方案二：Zeabur / Render / Railway 云端 24 小时托管（关掉电脑也能用）**
   - 在 [Zeabur](https://zeabur.com)（亚太香港/东京节点对国内最友好）或 [Render](https://render.com) 绑定本 GitHub 仓库 `paulsu2023/gemini-`，自动识别 `Dockerfile` 或 `render.yaml` 部署。
3. **方案三：Vercel / Google Cloud Run + 自定义域名（绑定 Cloudflare CDN）**
   - 仓库已内置 `vercel.json` 与 `Dockerfile`，支持一键部署到 Vercel 或 Cloud Run；若绑定一个托管在 Cloudflare DNS 下的自定义域名（开启小黄云），全国三网均可毫秒级免翻墙直连。

部署到云平台时只需在后台配置 **2 个环境变量**（无需上传密钥文件）：

| 环境变量 | 必填 | 说明 |
| :--- | :---: | :--- |
| `GOOGLE_CREDENTIALS_JSON` | 是 | 服务账号 JSON 文件的**完整内容**（直接粘贴 JSON 原文，或 base64 编码均可） |
| `ACCESS_PASSWORD` | 强烈建议 | 朋友打开网页时需要输入的访问密码（防止额度被陌生人盗刷） |
| `PORT` | 否 | 监听端口，默认 `3000` |
| `GCP_PROJECT` | 否 | 覆盖默认 Google Cloud 项目 ID |
