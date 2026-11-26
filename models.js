// 模型目录：kind 决定前端交互模式；location 为该模型在 Vertex AI 上可用的区域
// 列表经本项目实测可用（2026-11）。新模型可在网页「自定义模型」里直接填 ID 体验。
export const MODELS = [
  // —— 综合工作台（单窗口融合对话 + 画图 + 视频 + 音乐 + 语音） ——
  { id: 'gemini-studio-all', name: '全能综合模式', kind: 'studio', location: 'global', desc: '对话中按需自动画图、做视频、作曲、配音' },
  // —— 对话 ——
  { id: 'gemini-4-argon', name: 'Gemini 4 Argon', kind: 'chat', location: 'global', desc: '新一代旗舰，复杂推理' },
  { id: 'gemini-4-carbon', name: 'Gemini 4 Carbon', kind: 'chat', location: 'global', desc: '新一代旗舰，均衡' },
  { id: 'gemini-4-neon', name: 'Gemini 4 Neon', kind: 'chat', location: 'global', desc: '最新主力旗舰，高速强推理均衡' },
  { id: 'gemini-4-hydrogen', name: 'Gemini 4 Hydrogen', kind: 'chat', location: 'global', desc: '新一代轻量旗舰，极速高性价比' },
  { id: 'gemini-3.8-flash', name: 'Gemini 3.8 Flash', kind: 'chat', location: 'global', desc: '最新 Flash，快且强' },
  { id: 'gemini-3.7-flash', name: 'Gemini 3.7 Flash', kind: 'chat', location: 'global' },
  { id: 'gemini-3.6-flash', name: 'Gemini 3.6 Flash', kind: 'chat', location: 'global' },
  { id: 'gemini-3.5-flash', name: 'Gemini 3.5 Flash', kind: 'chat', location: 'global' },
  { id: 'gemini-3.5-flash-lite', name: 'Gemini 3.5 Flash Lite', kind: 'chat', location: 'global', desc: '轻量低价' },
  { id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro (预览)', kind: 'chat', location: 'global', desc: '深度思考' },
  { id: 'gemini-3.1-flash-lite', name: 'Gemini 3.1 Flash Lite', kind: 'chat', location: 'global' },
  { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash (预览)', kind: 'chat', location: 'global' },
  { id: 'gemma-4-26b-a4b-it-maas', name: 'Gemma 4 26B A4B', kind: 'chat', location: 'global', desc: '最新开源权重 MoE 模型' },
  // —— 画图（Gemini 原生出图，支持多轮改图、上传参考图） ——
  { id: 'gemini-nano-banana-2.1', name: 'Nano Banana 2.1', kind: 'image', location: 'global', desc: '最新原生画图' },
  { id: 'gemini-3-pro-image', name: 'Gemini 3 Pro Image', kind: 'image', location: 'global', desc: '高质量，支持 2K/4K' },
  { id: 'gemini-3.1-flash-image', name: 'Gemini 3.1 Flash Image', kind: 'image', location: 'global', desc: '快速出图' },
  { id: 'gemini-3.1-flash-lite-image', name: 'Gemini 3.1 Flash Lite Image', kind: 'image', location: 'global', desc: '低价出图' },
  { id: 'gemini-2.5-flash-image', name: 'Gemini 2.5 Flash Image', kind: 'image', location: 'global' },
  // —— 视频（Gemini Omni 走 Interactions API / global；Veo 3.1 走 generateVideos / us-central1） ——
  { id: 'gemini-omni-1.2-flash', name: 'Gemini Omni 1.2 Flash', kind: 'video', api: 'interactions', location: 'global', desc: '最新 Omni 视频，支持最高 15 秒音画同步' },
  { id: 'gemini-omni-1.1-flash-preview', name: 'Gemini Omni 1.1 Flash', kind: 'video', api: 'interactions', location: 'global', desc: 'Omni 8~10 秒音画同步视频' },
  { id: 'gemini-omni-flash-preview', name: 'Gemini Omni Flash (预览)', kind: 'video', api: 'interactions', location: 'global', desc: 'Omni 极速视频生成' },
  { id: 'veo-3.1-generate-001', name: 'Veo 3.1', kind: 'video', api: 'veo', location: 'us-central1', desc: '最高画质，带音频' },
  { id: 'veo-3.1-fast-generate-001', name: 'Veo 3.1 Fast', kind: 'video', api: 'veo', location: 'us-central1', desc: '更快更省' },
  { id: 'veo-3.1-lite-generate-001', name: 'Veo 3.1 Lite', kind: 'video', api: 'veo', location: 'us-central1', desc: '最省钱' },
  // —— 语音合成 ——
  { id: 'gemini-3.8-flash-tts', name: 'Gemini 3.8 Flash TTS', kind: 'tts', location: 'global' },
  { id: 'gemini-3.8-flash-lite-tts', name: 'Gemini 3.8 Flash Lite TTS', kind: 'tts', location: 'global' },
  { id: 'gemini-2.5-pro-tts', name: 'Gemini 2.5 Pro TTS', kind: 'tts', location: 'global', desc: '高精度 Pro 语音合成' },
  { id: 'gemini-2.5-flash-tts', name: 'Gemini 2.5 Flash TTS', kind: 'tts', location: 'global' },
  // —— 音乐生成（Lyria 3 走 Vertex AI Interactions API / global；Lyria 2 走 :predict / us-central1） ——
  { id: 'lyria-3-pro-preview', name: 'Lyria 3 Pro (预览)', kind: 'music', api: 'interactions', location: 'global', desc: '完整歌曲（最长约3分钟，支持人声与歌词）' },
  { id: 'lyria-3-clip-preview', name: 'Lyria 3 Clip (预览)', kind: 'music', api: 'interactions', location: 'global', desc: '30 秒短曲 / BGM（支持人声与歌词）' },
  { id: 'lyria-002', name: 'Lyria 2 (纯音乐)', kind: 'music', api: 'predict', location: 'us-central1', desc: '30 秒 48kHz 纯音乐 WAV' },
];
