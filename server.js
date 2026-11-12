// Gemini 体验 —— Vertex AI 代理服务端
// 职责：持有服务账号凭据（绝不下发到浏览器）、转发对话/画图/视频/语音请求、可选访问密码保护
import 'dotenv/config';
import express from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI } from '@google/genai';
import { MODELS } from './models.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const ACCESS_PASSWORD = process.env.ACCESS_PASSWORD || '';
const DEFAULT_REGION = process.env.VERTEX_REGION || 'us-central1';

// ---------- 凭据加载：优先环境变量（线上部署），其次本地文件 ----------
function loadCredentials() {
  const raw = process.env.GOOGLE_CREDENTIALS_JSON;
  if (raw) {
    const text = raw.trim().startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
    return JSON.parse(text);
  }
  // 项目内凭据优先于系统级 GOOGLE_APPLICATION_CREDENTIALS（避免被电脑上其它旧项目的全局变量串号）
  const candidates = [
    process.env.CREDENTIALS_FILE,
    path.join(__dirname, 'credentials', 'service-account.json'),
    process.env.GOOGLE_APPLICATION_CREDENTIALS,
  ].filter(Boolean);
  const file = candidates.find((f) => fs.existsSync(f));
  if (file) return JSON.parse(fs.readFileSync(file, 'utf8'));
  throw new Error('未找到 Google 服务账号凭据：请设置 GOOGLE_CREDENTIALS_JSON 或把 JSON 放到 credentials/service-account.json');
}
const credentials = loadCredentials();
const PROJECT = process.env.GCP_PROJECT || credentials.project_id;

// 按区域缓存客户端（Gemini 3+ 多在 global，Veo 在 us-central1）
const clients = new Map();
function client(location = 'global') {
  if (!clients.has(location)) {
    clients.set(location, new GoogleGenAI({
      vertexai: true, project: PROJECT, location,
      googleAuthOptions: { credentials, scopes: ['https://www.googleapis.com/auth/cloud-platform'] },
    }));
  }
  return clients.get(location);
}
// 前端可传自定义模型；目录内模型用目录里的区域
function resolveLocation(model, fallback) {
  const m = MODELS.find((x) => x.id === model);
  return m?.location || fallback || 'global';
}

// ---------- 访问密码（部署给朋友时开启） ----------
const tokenOf = (pwd) => crypto.createHash('sha256').update('gemini-tiyan:' + pwd).digest('hex');
const VALID_TOKEN = ACCESS_PASSWORD ? tokenOf(ACCESS_PASSWORD) : '';
function auth(req, res, next) {
  if (!ACCESS_PASSWORD) return next();
  const t = req.get('x-access-token') || req.query.token || '';
  if (t.length === VALID_TOKEN.length && crypto.timingSafeEqual(Buffer.from(t), Buffer.from(VALID_TOKEN))) return next();
  res.status(401).json({ error: '需要访问密码' });
}

const app = express();
app.use(express.json({ limit: '100mb' }));
app.use(express.static(path.join(__dirname, 'public')));
// 前端依赖直接从 node_modules 提供，无需 CDN，国内网络也能稳定打开
const nm = (p) => path.join(__dirname, 'node_modules', p);
app.use('/vendor/marked', express.static(nm('marked/lib')));
app.use('/vendor/dompurify', express.static(nm('dompurify/dist')));
app.use('/vendor/hljs', express.static(nm('@highlightjs/cdn-assets')));
app.use('/vendor/katex', express.static(nm('katex/dist')));

app.get('/api/config', (req, res) => {
  res.json({ needPassword: !!ACCESS_PASSWORD, project: PROJECT, models: MODELS });
});
app.post('/api/login', (req, res) => {
  if (!ACCESS_PASSWORD) return res.json({ token: '' });
  if ((req.body?.password || '') !== ACCESS_PASSWORD) return res.status(401).json({ error: '密码错误' });
  res.json({ token: VALID_TOKEN });
});

const errMsg = (e) => {
  const s = String(e?.message || e);
  try { const j = JSON.parse(s); return j.error?.message || s; } catch { return s; }
};

// ---------- 对话 / Gemini 原生画图（流式 SSE） ----------
// 历史里的思考文本（thought:true）不回传，但要保留 thoughtSignature（Gemini 3 多轮必需）
function cleanContents(contents = []) {
  return contents.map((c) => {
    const parts = [];
    let pendingSig = null;
    for (const p of c.parts || []) {
      if (p.thought) { if (p.thoughtSignature) pendingSig = p.thoughtSignature; continue; }
      const q = { ...p };
      delete q.thought;
      if (pendingSig && !q.thoughtSignature) { q.thoughtSignature = pendingSig; pendingSig = null; }
      parts.push(q);
    }
    if (!parts.length) parts.push({ text: ' ' });
    return { role: c.role, parts };
  }).filter((c) => c.parts.length);
}

function buildConfig(body) {
  const s = body.settings || {};
  const cfg = {};
  if (body.systemInstruction?.trim()) cfg.systemInstruction = body.systemInstruction;
  for (const k of ['temperature', 'topP', 'topK', 'maxOutputTokens', 'seed', 'presencePenalty', 'frequencyPenalty']) {
    if (s[k] !== undefined && s[k] !== null && s[k] !== '') cfg[k] = Number(s[k]);
  }
  if (s.stopSequences?.length) cfg.stopSequences = s.stopSequences;
  if (s.thinkingLevel && s.thinkingLevel !== 'auto') cfg.thinkingConfig = { thinkingLevel: s.thinkingLevel.toUpperCase() };
  if (s.includeThoughts) cfg.thinkingConfig = { ...(cfg.thinkingConfig || {}), includeThoughts: true };
  if (s.jsonMode) cfg.responseMimeType = 'application/json';
  const tools = [];
  if (s.googleSearch) tools.push({ googleSearch: {} });
  if (s.urlContext) tools.push({ urlContext: {} });
  if (s.codeExecution) tools.push({ codeExecution: {} });
  if (tools.length) cfg.tools = tools;
  if (body.kind === 'image') {
    cfg.responseModalities = ['TEXT', 'IMAGE'];
    const ic = {};
    if (s.aspectRatio && s.aspectRatio !== 'auto') ic.aspectRatio = s.aspectRatio;
    if (s.imageSize && s.imageSize !== 'auto') ic.imageSize = s.imageSize;
    if (Object.keys(ic).length) cfg.imageConfig = ic;
  }
  if (s.safetyOff) {
    cfg.safetySettings = ['HARM_CATEGORY_HARASSMENT', 'HARM_CATEGORY_HATE_SPEECH', 'HARM_CATEGORY_SEXUALLY_EXPLICIT', 'HARM_CATEGORY_DANGEROUS_CONTENT']
      .map((category) => ({ category, threshold: 'BLOCK_ONLY_HIGH' }));
  }
  return cfg;
}

app.post('/api/chat', auth, async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();
  const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  const abort = new AbortController();
  res.on('close', () => abort.abort());

  try {
    const { model } = req.body;
    const location = resolveLocation(model, req.body.location);
    const config = { ...buildConfig(req.body), abortSignal: abort.signal };
    const stream = await client(location).models.generateContentStream({
      model, contents: cleanContents(req.body.contents), config,
    });
    let usage = null, grounding = null, finishReason = null;
    for await (const chunk of stream) {
      const cand = chunk.candidates?.[0];
      for (const p of cand?.content?.parts || []) send('part', p);
      if (cand?.groundingMetadata) grounding = cand.groundingMetadata;
      if (cand?.finishReason) finishReason = cand.finishReason;
      if (chunk.usageMetadata) usage = chunk.usageMetadata;
      if (chunk.promptFeedback?.blockReason) send('error', { message: '请求被安全策略拦截：' + chunk.promptFeedback.blockReason });
    }
    send('done', { usage, grounding, finishReason });
  } catch (e) {
    if (!abort.signal.aborted) send('error', { message: errMsg(e) });
  } finally {
    res.end();
  }
});

// ---------- 语音合成 TTS ----------
function pcmToWav(pcm, rate = 24000, channels = 1, bits = 16) {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8);
  h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(channels, 22);
  h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * channels * bits / 8, 28); h.writeUInt16LE(channels * bits / 8, 32);
  h.writeUInt16LE(bits, 34); h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}
app.post('/api/tts', auth, async (req, res) => {
  try {
    const { model, text, voice = 'Kore', style } = req.body;
    const r = await client(resolveLocation(model, req.body.location)).models.generateContent({
      model, contents: style ? `${style}：${text}` : text,
      config: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } } },
    });
    const part = r.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
    if (!part) throw new Error('模型没有返回音频');
    let { mimeType, data } = part.inlineData;
    if (/L16|pcm/i.test(mimeType)) {
      const rate = Number(/rate=(\d+)/.exec(mimeType)?.[1] || 24000);
      data = pcmToWav(Buffer.from(data, 'base64'), rate).toString('base64');
      mimeType = 'audio/wav';
    }
    res.json({ mimeType, data, usage: r.usageMetadata });
  } catch (e) { res.status(500).json({ error: errMsg(e) }); }
});

// ---------- 视频生成 Veo（长任务：提交 + 轮询） ----------
const videoOps = new Map(); // id -> { op, location, createdAt }
app.post('/api/video', auth, async (req, res) => {
  try {
    const { model, prompt, image, lastFrame, settings = {} } = req.body;
    const location = resolveLocation(model, req.body.location || DEFAULT_REGION);
    const config = { numberOfVideos: Number(settings.numberOfVideos) || 1 };
    if (settings.aspectRatio) config.aspectRatio = settings.aspectRatio;
    if (settings.durationSeconds) config.durationSeconds = Number(settings.durationSeconds);
    if (settings.resolution) config.resolution = settings.resolution;
    if (settings.generateAudio !== undefined) config.generateAudio = !!settings.generateAudio;
    if (settings.negativePrompt) config.negativePrompt = settings.negativePrompt;
    if (settings.enhancePrompt !== undefined) config.enhancePrompt = !!settings.enhancePrompt;
    if (settings.personGeneration) config.personGeneration = settings.personGeneration;
    if (settings.seed) config.seed = Number(settings.seed);
    if (lastFrame) config.lastFrame = { imageBytes: lastFrame.data, mimeType: lastFrame.mimeType };
    const params = { model, prompt, config };
    if (image) params.image = { imageBytes: image.data, mimeType: image.mimeType };
    const op = await client(location).models.generateVideos(params);
    const id = crypto.randomUUID();
    videoOps.set(id, { op, location, createdAt: Date.now() });
    res.json({ id });
  } catch (e) { res.status(500).json({ error: errMsg(e) }); }
});

app.get('/api/video/:id', auth, async (req, res) => {
  const job = videoOps.get(req.params.id);
  if (!job) return res.status(404).json({ error: '任务不存在（服务可能已重启）' });
  try {
    job.op = await client(job.location).operations.getVideosOperation({ operation: job.op });
    if (!job.op.done) return res.json({ done: false, elapsed: Math.round((Date.now() - job.createdAt) / 1000) });
    videoOps.delete(req.params.id);
    if (job.op.error) return res.json({ done: true, error: job.op.error.message || JSON.stringify(job.op.error) });
    const r = job.op.response || {};
    const videos = (r.generatedVideos || []).map((g) => ({
      mimeType: g.video?.mimeType || 'video/mp4', data: g.video?.videoBytes, uri: g.video?.uri,
    }));
    if (!videos.length) {
      const why = r.raiMediaFilteredReasons?.join('；') || '没有返回视频（可能被安全过滤）';
      return res.json({ done: true, error: why });
    }
    res.json({ done: true, videos });
  } catch (e) { res.status(500).json({ error: errMsg(e) }); }
});

// 清理超过 1 小时未领取的视频任务
setInterval(() => {
  for (const [id, j] of videoOps) if (Date.now() - j.createdAt > 3600_000) videoOps.delete(id);
}, 600_000).unref();

// ---------- 模型发现：列出 Model Garden 里的 Google 模型，方便尝鲜新模型 ----------
app.get('/api/discover', auth, async (req, res) => {
  try {
    const loc = req.query.location || 'global';
    const names = [];
    const pager = await client(loc).models.list({ config: { queryBase: true, pageSize: 100 } });
    for await (const m of pager) names.push(m.name.split('/').pop());
    res.json({ location: loc, models: names.sort() });
  } catch (e) { res.status(500).json({ error: errMsg(e) }); }
});

app.listen(PORT, () => {
  console.log(`✨ Gemini 体验已启动：http://localhost:${PORT}  （项目 ${PROJECT}${ACCESS_PASSWORD ? '，已开启访问密码' : ''}）`);
});
