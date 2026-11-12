// 模型目录：kind 决定前端交互模式；location 为该模型在 Vertex AI 上可用的区域
// 列表经 scripts/probe*.mjs 在本项目实测可用（2026-11）。新模型可在网页「自定义模型」里直接填 ID 体验。
export const MODELS = [
  // —— 对话 ——
  { id: 'gemini-4-argon', name: 'Gemini 4 Argon', kind: 'chat', location: 'global', desc: '新一代旗舰，复杂推理' },
  { id: 'gemini-4-carbon', name: 'Gemini 4 Carbon', kind: 'chat', location: 'global', desc: '新一代旗舰，均衡' },
  { id: 'gemini-3.8-flash', name: 'Gemini 3.8 Flash', kind: 'chat', location: 'global', desc: '最新 Flash，快且强' },
  { id: 'gemini-3.7-flash', name: 'Gemini 3.7 Flash', kind: 'chat', location: 'global' },
  { id: 'gemini-3.6-flash', name: 'Gemini 3.6 Flash', kind: 'chat', location: 'global' },
  { id: 'gemini-3.5-flash', name: 'Gemini 3.5 Flash', kind: 'chat', location: 'global' },
  { id: 'gemini-3.5-flash-lite', name: 'Gemini 3.5 Flash Lite', kind: 'chat', location: 'global', desc: '轻量低价' },
  { id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro (预览)', kind: 'chat', location: 'global', desc: '深度思考' },
  { id: 'gemini-3.1-flash-lite', name: 'Gemini 3.1 Flash Lite', kind: 'chat', location: 'global' },
  { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash (预览)', kind: 'chat', location: 'global' },
  // —— 画图（Gemini 原生出图，支持多轮改图、上传参考图） ——
  { id: 'gemini-nano-banana-2.1', name: 'Nano Banana 2.1', kind: 'image', location: 'global', desc: '最新原生画图' },
  { id: 'gemini-3-pro-image', name: 'Gemini 3 Pro Image', kind: 'image', location: 'global', desc: '高质量，支持 2K/4K' },
  { id: 'gemini-3.1-flash-image', name: 'Gemini 3.1 Flash Image', kind: 'image', location: 'global', desc: '快速出图' },
  { id: 'gemini-3.1-flash-lite-image', name: 'Gemini 3.1 Flash Lite Image', kind: 'image', location: 'global', desc: '低价出图' },
  { id: 'gemini-2.5-flash-image', name: 'Gemini 2.5 Flash Image', kind: 'image', location: 'global' },
  // —— 视频 ——
  { id: 'veo-3.1-generate-001', name: 'Veo 3.1', kind: 'video', location: 'us-central1', desc: '最高画质，带音频' },
  { id: 'veo-3.1-fast-generate-001', name: 'Veo 3.1 Fast', kind: 'video', location: 'us-central1', desc: '更快更省' },
  { id: 'veo-3.1-lite-generate-001', name: 'Veo 3.1 Lite', kind: 'video', location: 'us-central1', desc: '最省钱' },
  // —— 语音合成 ——
  { id: 'gemini-3.8-flash-tts', name: 'Gemini 3.8 Flash TTS', kind: 'tts', location: 'global' },
  { id: 'gemini-3.8-flash-lite-tts', name: 'Gemini 3.8 Flash Lite TTS', kind: 'tts', location: 'global' },
  { id: 'gemini-2.5-flash-tts', name: 'Gemini 2.5 Flash TTS', kind: 'tts', location: 'global' },
];
