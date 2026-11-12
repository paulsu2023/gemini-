# Gemini 体验

基于 **Google Vertex AI** 的中文多模态工作台 —— 在一个对话框里体验 **日常对话、原生画图与多轮改图、Veo 3.1 视频生成、语音合成**，带 **AI Studio 风格运行设置面板** 与 **前置提示词库（System Prompt）**。

## 功能一览

- **多模态全模型切换**：
  - 💬 **对话**：Gemini 4 Argon / Carbon、Gemini 3.8 / 3.7 / 3.6 / 3.5 Flash、Gemini 3.1 Pro 等；支持上传图片 / PDF / 音视频 / 代码与文档、思考过程展示、Google 联网搜索 Grounding、网页读取、Python 代码执行、JSON 输出模式。
  - 🎨 **画图**：Nano Banana 2.1、Gemini 3 Pro Image（支持 1K/2K/4K）、Gemini 3.1 Flash Image；支持比例选择、参考图上传、多轮对话改图。
  - 🎬 **视频**：Veo 3.1 / Fast / Lite；支持 16:9 与 9:16、4/6/8 秒、720p/1080p/4K、同步生成对白与音效、首帧图生视频、首尾帧插值。
  - 🔊 **语音**：Gemini 3.8 / 2.5 Flash TTS，30 种音色 + 自然语言语气控制。
  - 🧪 **自定义模型**：顶部模型菜单可直接输入任意 Vertex 模型 ID 尝鲜。
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

Windows 下也可以直接双击 **`启动.bat`**，会自动打开 `http://localhost:3000`。

---

## 线上部署（给朋友用）

仓库已包含 `Dockerfile` 与 `render.yaml`，可一键部署到 **Cloud Run / Render / Railway / Zeabur / Fly.io** 等任意支持 Node.js 或 Docker 的平台。

部署时只需在平台后台配置 **2 个环境变量**（无需上传密钥文件）：

| 环境变量 | 必填 | 说明 |
| :--- | :---: | :--- |
| `GOOGLE_CREDENTIALS_JSON` | 是 | 服务账号 JSON 文件的**完整内容**（直接粘贴 JSON 原文，或 base64 编码均可） |
| `ACCESS_PASSWORD` | 强烈建议 | 朋友打开网页时需要输入的访问密码（防止额度被陌生人盗刷） |
| `PORT` | 否 | 监听端口，默认 `3000` |
| `GCP_PROJECT` | 否 | 覆盖默认 Google Cloud 项目 ID |
