// Gemini 体验 —— 前端主逻辑（原生 JS，无构建步骤）
// 数据全部存在浏览器 IndexedDB（对话、图片、视频），设置与提示词库存在 localStorage
import { calcEventCost, formatUnitPrice, formatPriceBadge, estimateRunCost, USD_TO_CNY, getRate } from '/pricing.js';
import { TTS_VOICES } from '/voices.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const esc = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const STAR = '<svg viewBox="0 0 64 64"><path d="M32 4c2 15 13 26 28 28-15 2-26 13-28 28-2-15-13-26-28-28C19 30 30 19 32 4z"/></svg>';

const KINDS = {
  chat: { label: '对话', icon: '💬', desc: '问答、写作、编程、读文件', ph: '输入消息，Enter 发送，Shift+Enter 换行…' },
  image: { label: '画图', icon: '🎨', desc: '文生图、上传参考图改图', ph: '描述你想要的画面；可上传参考图让它改图…' },
  video: { label: '视频', icon: '🎬', desc: 'Gemini Omni / Veo 3.1 文生与图生视频', ph: '描述视频画面与镜头运动；可上传参考图或首尾帧…' },
  tts: { label: '语音', icon: '🔊', desc: '文字转自然语音', ph: '输入要朗读的文字…' },
  music: { label: '音乐', icon: '🎵', desc: 'Lyria 3 词曲人声 / 纯音乐生成', ph: '描述想要的曲风、情绪、乐器、节奏或歌词（Lyria 3 支持上传参考图配乐）…' },
  studio: { label: '综合', icon: '✨', desc: '单窗口自动融合对话、画图、视频、音乐、语音', ph: '像平时一样聊天，或直接说「画一张…」「做个视频…」「写一首歌…」「把上面那段读出来」…' },
};
const EXAMPLES = {
  chat: ['用通俗的话解释一下量子纠缠', '帮我写一封得体的请假邮件', '今天有哪些重要科技新闻？（打开联网搜索）', '写一个 Python 脚本批量重命名图片'],
  image: ['一只戴着宇航员头盔的橘猫，漂浮在星空中，电影感光影', '水墨风格的江南小镇，细雨，乌篷船', '极简扁平风格的咖啡店 logo，暖色调', '赛博朋克夜晚的重庆洪崖洞，霓虹灯'],
  video: ['航拍镜头缓缓掠过云海之上的雪山日出', '一只柯基在海边沙滩上奔跑，慢动作，夕阳', '雨夜的东京街头，镜头跟随一把红伞前行', '咖啡倒入杯中的特写，奶泡形成拉花'],
  tts: ['大家好，欢迎来到 Gemini 体验，今天我们一起探索 AI 的无限可能。', '从前有座山，山里有座庙，庙里有个老和尚在给小和尚讲故事。'],
  music: ['一首温暖治愈的东京夏夜 City Pop，复古合成器贝斯，温柔中文女声演唱关于霓虹与晚风的歌', '清晨阳光咖啡馆里的轻快木吉他 Lo-Fi 纯音乐，100 BPM，温暖放松', '史诗级科幻电影预告片管弦乐，弦乐渐强与震撼铜管，充满希望感', '国风电子赛博混音，古筝与现代电子节拍结合，动感十足'],
  studio: ['帮我写一段 50 字的治愈晚安小故事，并用温柔的语气朗读出来', '画一张雨夜赛博朋克猫咖啡馆插图，再配一首 30 秒治愈 Lo-Fi 纯音乐', '生成一段航拍雪山云海日出的 8 秒视频', '对比一下 Gemini 4 Neon 和 Gemini 3.8 Flash 的适用场景'],
};
const voiceInfo = (id) => {
  const core = TTS_VOICES.find((v) => v.id === id);
  if (core) return { ...core, isCore: true };
  const ext = (state.extVoices || []).find((v) => v.id === id);
  if (ext) return {
    id: ext.id,
    name: ext.name,
    gender: ext.gender || '中性',
    pitch: ext.pitch || '中',
    trait: `${ext.lang}${ext.accent ? '·' + ext.accent : ''}`,
    useCase: ext.persona || ext.context || '扩展角色',
    sample: ext.desc || `${ext.lang} ${ext.persona}`,
    isCore: false,
  };
  return { ...TTS_VOICES[0], isCore: true };
};

const DEFAULT_SETTINGS = {
  temperature: 1, topP: 0.95, maxOutputTokens: '', thinkingLevel: 'auto', includeThoughts: true,
  googleSearch: false, urlContext: false, codeExecution: false, jsonMode: false, safetyOff: false, stopSequences: '',
  aspectRatio: 'auto', imageSize: 'auto',
  vAspect: '16:9', vDuration: 8, vResolution: '720p', vAudio: true, vCount: 1, vNegative: '', vEnhance: true, vPerson: 'allow_adult', vSeed: '',
  voice: 'Kore', ttsStyle: '',
  mInstrumental: false, mLyrics: '', mNegative: '', mSeed: '', mCount: 1,
  studioChat: 'gemini-3.8-flash', studioImage: 'gemini-nano-banana-2.1', studioVideo: 'gemini-omni-1.2-flash',
  studioMusic: 'lyria-3-clip-preview', studioTts: 'gemini-3.8-flash-tts', studioForce: 'auto',
};
const DEFAULT_PRESETS = [
  { id: 'none', name: '（无前置提示词）', content: '' },
  { id: 'cn', name: '中文贴心助手', content: '你是一位知识渊博、表达清晰的中文助手。默认使用简体中文回答，结构清晰、先给结论再展开；不确定的内容要明确说明。' },
  { id: 'code', name: '资深编程专家', content: '你是一名资深全栈工程师。回答时先给出可直接运行的完整代码，再简要解释关键点；指出潜在的边界情况和性能问题。' },
  { id: 'trans', name: '中英互译', content: '你是专业翻译。用户输入中文就翻译成地道英文，输入其他语言就翻译成流畅的简体中文。只输出译文，不要解释。' },
  { id: 'xhs', name: '小红书文案', content: '你是小红书爆款文案写手。输出：吸睛标题（带 emoji）、分段正文（口语化、真实体验感、适量 emoji）、结尾互动引导、5-8 个话题标签。' },
  { id: 'img', name: '画图提示词增强', content: '把用户的简短描述扩写成专业的画面提示：主体、构图、光线、色彩、风格、镜头参数都要具体，然后直接生成图片。' },
];

// ---------------- 本地存储 ----------------
const LS = {
  get: (k, d) => { try { return JSON.parse(localStorage.getItem('gt.' + k)) ?? d; } catch { return d; } },
  set: (k, v) => localStorage.setItem('gt.' + k, JSON.stringify(v)),
};
const db = await new Promise((resolve, reject) => {
  const r = indexedDB.open('gemini-tiyan', 1);
  r.onupgradeneeded = () => r.result.createObjectStore('convs', { keyPath: 'id' });
  r.onsuccess = () => resolve(r.result);
  r.onerror = () => reject(r.error);
});
const idb = (mode, fn) => new Promise((resolve, reject) => {
  const tx = db.transaction('convs', mode);
  const req = fn(tx.objectStore('convs'));
  tx.oncomplete = () => resolve(req?.result);
  tx.onerror = () => reject(tx.error);
});
const dbAll = () => idb('readonly', (s) => s.getAll());
const dbPut = (c) => idb('readwrite', (s) => s.put(c));
const dbDel = (id) => idb('readwrite', (s) => s.delete(id));

// ---------------- 状态 ----------------
const state = {
  models: [], custom: LS.get('customModels', []), convs: [], conv: null,
  prefs: {
    defaultModel: 'gemini-3.8-flash', defaultPreset: 'none', theme: 'light', sendKey: 'enter',
    memoryUser: LS.get('lastNickname', '') || 'default', memoryEnabled: true, memoryAutoExtract: true, memoryCloudSync: true,
    ...LS.get('prefs', {}),
  },
  defaults: { ...DEFAULT_SETTINGS, ...LS.get('defaults', {}) },
  presets: LS.get('presets', null) || DEFAULT_PRESETS,
  memories: [], memoryBucket: '', memoryCloudOk: false,
  nickname: LS.get('lastNickname', ''),
  isAdmin: false, adminSecret: '', adminUsers: [], adminPassword: '', adminInspectHtml: '',
  usageEvents: [], usageSource: 'merged', usageRange: 'all', usageRateMode: 'promo', healthReport: null, healthBusy: false,
  voiceFilter: 'all', voiceBank: 'core', voiceLang: 'all', voiceQuery: '', voiceLimit: 36,
  extVoices: [], extLoaded: false, extLoading: false, playingVoice: '', loadingVoice: '',
  // 每次打开网页必须重新登录验证（token 仅保存在当前页面内存，不跨次免密跳过）
  token: '', tasks: new Map(), attachments: [], needPassword: true,
  needVideoPassword: !/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname),
  videoPassword: '',
};
const isBusy = (cid = state.conv?.id) => !!(cid && state.tasks.has(cid));
const allModels = () => [...state.models, ...state.custom];
const modelInfo = (id) => allModels().find((m) => m.id === id) || { id, name: id, kind: 'chat', location: 'global' };

// ---------------- 长期记忆（本地 + Google Cloud 免费云存储双模同步） ----------------
const memKey = () => 'memories.' + (state.prefs.memoryUser || 'default').trim().toLowerCase();
function updateMemBadge() {
  const active = state.prefs.memoryEnabled !== false ? state.memories.filter((m) => m.enabled !== false).length : 0;
  const el = $('#memBadge');
  if (el) el.textContent = active ? `${active}` : '';
}
async function loadMemories() {
  const user = (state.prefs.memoryUser || 'default').trim() || 'default';
  const localList = LS.get(memKey(), []);
  state.memories = Array.isArray(localList) ? localList : [];
  updateMemBadge();
  try {
    const cloud = state.prefs.memoryCloudSync !== false ? '1' : '0';
    const r = await apiJSON(`/api/memory?user=${encodeURIComponent(user)}&cloud=${cloud}`);
    state.memoryBucket = r.bucket || state.memoryBucket;
    state.memoryCloudOk = !!r.cloudOk;
    if (Array.isArray(r.memories) && (r.memories.length || !state.memories.length)) {
      state.memories = r.memories;
      LS.set(memKey(), state.memories);
    }
    updateMemBadge(); renderComposer();
  } catch {}
}
async function saveMemories(tip) {
  const user = (state.prefs.memoryUser || 'default').trim() || 'default';
  LS.set(memKey(), state.memories);
  updateMemBadge(); renderComposer();
  try {
    const r = await apiJSON('/api/memory', {
      user, memories: state.memories, syncCloud: state.prefs.memoryCloudSync !== false,
    });
    state.memoryCloudOk = !!r.cloudOk;
    if (tip) toast(r.cloudOk ? `${tip}（已同步本地与 Google 云）` : `${tip}（已存本地）`);
  } catch {
    if (tip) toast(`${tip}（已存浏览器本地）`);
  }
}
function addMemoryItem(content, tip = '🧠 已记入长期记忆') {
  const txt = String(content || '').trim();
  if (!txt) return false;
  if (state.memories.some((m) => m.content === txt)) return false;
  state.memories.unshift({ id: uid(), content: txt, enabled: true, createdAt: Date.now() });
  saveMemories(tip);
  return true;
}
function composeSystemInstruction(base = '') {
  const active = state.prefs.memoryEnabled !== false ? state.memories.filter((m) => m.enabled !== false) : [];
  if (!active.length) return base;
  const memBlock = `[关于用户的长期记忆（请在回答时自然贴合这些背景与偏好，无需生硬复述）]\n` +
    active.map((m, i) => `${i + 1}. ${m.content}`).join('\n');
  return base?.trim() ? `${ base.trim() }\n\n${memBlock}` : memBlock;
}
async function autoExtractMemories(conv) {
  if (state.prefs.memoryEnabled === false || state.prefs.memoryAutoExtract === false) return;
  const recent = conv.messages.slice(-4).map((m) => ({
    role: m.role,
    text: (m.parts || []).filter((p) => p.text && !p.thought).map((p) => p.text).join('\n').trim(),
  })).filter((m) => m.text);
  const lastUser = [...recent].reverse().find((m) => m.role === 'user')?.text || '';
  // 当用户消息提到偏好/身份口令或长度足够时触发轻量提炼
  if (lastUser.length < 6 && !/记住|我是|我叫|我喜欢|我偏好|以后|默认|习惯/.test(lastUser)) return;
  try {
    const r = await apiJSON('/api/memory/extract', { messages: recent, existing: state.memories });
    const added = (r.added || []).filter((txt) => !state.memories.some((m) => m.content === txt));
    if (added.length) {
      for (const txt of added) state.memories.unshift({ id: uid(), content: txt, enabled: true, createdAt: Date.now() });
      await saveMemories();
      toast(`🧠 已自动记住：${added[0].slice(0, 24)}${added.length > 1 ? ` 等 ${added.length} 条` : ''}`);
    }
  } catch {}
}

// ---------------- API ----------------
async function api(path, opts = {}) {
  const nick = encodeURIComponent(state.nickname || state.prefs.memoryUser || 'default');
  const headers = { 'Content-Type': 'application/json', 'x-access-token': state.token, 'x-user-nickname': nick, ...(opts.headers || {}) };
  if (state.adminSecret) headers['x-admin-password'] = state.adminSecret;
  const res = await fetch(path, { ...opts, headers });
  if (res.status === 401 || res.status === 403) {
    const j = await res.clone().json().catch(() => ({}));
    if (j.needVideoPassword) {
      state.videoPassword = '';
      throw new Error(j.error || '视频解锁密码错误，线上环境禁止生成视频');
    }
    if (j.needAdminPassword) {
      state.isAdmin = false;
      state.adminSecret = '';
      updateAdminUI();
      throw new Error(j.error || '仅管理员可访问');
    }
    showLogin(j.error || '请先输入昵称与访问密码登录');
    throw new Error(j.error || '需要登录');
  }
  return res;
}
async function apiJSON(path, body) {
  const res = await api(path, body ? { method: 'POST', body: JSON.stringify(body) } : {});
  const j = await res.json().catch(() => ({}));
  if (!res.ok || j.error) throw new Error(j.error || `请求失败 (${res.status})`);
  return j;
}

// ---------------- Markdown 渲染（含代码高亮与公式） ----------------
marked.setOptions({ gfm: true, breaks: true });
function renderMarkdown(text = '') {
  const maths = [];
  const segs = text.split(/(```[\s\S]*?(?:```|$)|`[^`\n]*`)/g);
  const src = segs.map((seg, i) => {
    if (i % 2 === 1) return seg;
    return seg.replace(/\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)|\$([^\s$](?:[^$\n]*?[^\s$])?)\$/g, (m, a, b, c, d) => {
      const display = a !== undefined || b !== undefined;
      try {
        maths.push(katex.renderToString((a ?? b ?? c ?? d).trim(), { displayMode: display, throwOnError: false }));
        return `@@MATH${maths.length - 1}@@`;
      } catch { return m; }
    });
  }).join('');
  let html = DOMPurify.sanitize(marked.parse(src), { ADD_ATTR: ['target'] });
  html = html.replace(/@@MATH(\d+)@@/g, (_, i) => maths[i]);
  return html;
}
function enhanceCode(root) {
  $$('pre > code', root).forEach((code) => {
    if (code.dataset.done) return;
    code.dataset.done = 1;
    const lang = (code.className.match(/language-(\S+)/) || [])[1] || '';
    try { lang && hljs.getLanguage(lang) ? hljs.highlightElement(code) : hljs.highlightElement(code); } catch {}
    const head = document.createElement('div');
    head.className = 'code-head';
    head.innerHTML = `<span>${esc(lang || 'code')}</span><button type="button">复制</button>`;
    head.querySelector('button').onclick = () => copyText(code.textContent);
    code.parentElement.prepend(head);
  });
  $$('a', root).forEach((a) => { a.target = '_blank'; a.rel = 'noopener'; });
}

// ---------------- 工具 ----------------
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 1800);
}
async function copyText(s) { try { await navigator.clipboard.writeText(s); toast('已复制'); } catch { toast('复制失败'); } }
const urlCache = new Map();
function dataURL(inline) {
  const key = inline.data.length + ':' + inline.data.slice(0, 64) + inline.data.slice(-64);
  if (urlCache.has(key)) return urlCache.get(key);
  const bin = atob(inline.data); const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([arr], { type: inline.mimeType }));
  urlCache.set(key, url);
  return url;
}
const extOf = (mime) => ({ 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'video/mp4': 'mp4', 'audio/wav': 'wav', 'audio/mpeg': 'mp3', 'audio/mp3': 'mp3' }[mime] || mime.split('/')[1] || 'bin');
const fileIcon = (mime) => mime.startsWith('image/') ? '🖼' : mime.startsWith('video/') ? '🎞' : mime.startsWith('audio/') ? '🎵' : mime === 'application/pdf' ? '📕' : '📄';
function fmtUsage(u) {
  if (!u) return '';
  const parts = [`输入 ${u.promptTokenCount ?? 0}`, `输出 ${u.candidatesTokenCount ?? 0}`];
  if (u.thoughtsTokenCount) parts.push(`思考 ${u.thoughtsTokenCount}`);
  return parts.join(' · ') + ' tokens';
}

// ---------------- 会话管理 ----------------
function newDraft(model) {
  const preset = state.presets.find((p) => p.id === state.prefs.defaultPreset);
  const m = model || state.conv?.model || state.prefs.defaultModel;
  return { id: uid(), title: '新对话', model: m, systemInstruction: preset?.content || '', settings: { ...state.defaults }, messages: [], createdAt: Date.now(), updatedAt: Date.now(), draft: true };
}
async function saveConv(c = state.conv) {
  if (!c || !c.messages.length) return;
  c.draft = false; c.updatedAt = Date.now();
  await dbPut(JSON.parse(JSON.stringify(c)));
  const i = state.convs.findIndex((x) => x.id === c.id);
  if (i >= 0) state.convs[i] = c; else state.convs.unshift(c);
  renderConvList();
  // 自动将该昵称下的对话轻量同步到 Google Cloud 免费桶，方便换设备恢复与管理员查看
  clearTimeout(saveConv._cloudTimer);
  saveConv._cloudTimer = setTimeout(async () => {
    if (!state.token || state.prefs.memoryCloudSync === false) return;
    try {
      await apiJSON('/api/cloud-convs', { user: state.prefs.memoryUser || state.nickname || 'default', convs: state.convs });
    } catch {}
  }, 1500);
}
function openConv(c) {
  // 支持多窗口/多对话并行生成：切换或新建对话时不中断原对话的生成任务
  state.conv = c;
  state.attachments = [];
  renderAll();
  // 仅当该对话尚未在后台轮询时，恢复未完成的视频任务
  if (!isBusy(c.id)) {
    c.messages.forEach((m) => {
      if (m.meta?.job && !m.meta.job.done) {
        const abort = new AbortController();
        state.tasks.set(c.id, { abort, msgId: m.id });
        renderConvList(); renderComposer();
        pollVideo(c, m, abort).finally(() => {
          state.tasks.delete(c.id);
          renderConvList();
          if (state.conv === c) renderComposer();
        });
      }
    });
  }
  closeSidebarMobile();
}
function renderAll() {
  renderConvList(); renderHeader(); renderThread(); renderPanel(); renderComposer(); renderAttachments();
}

function renderConvList() {
  const q = $('#searchConv').value.trim().toLowerCase();
  const list = state.convs.filter((c) => !q || c.title.toLowerCase().includes(q) || c.messages.some((m) => m.parts?.some((p) => p.text?.toLowerCase().includes(q))))
    .sort((a, b) => b.updatedAt - a.updatedAt);
  const now = new Date(); const day = 86400000;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const groupOf = (t) => t >= today ? '今天' : t >= today - day ? '昨天' : t >= today - 7 * day ? '近 7 天' : '更早';
  let html = '', last = '';
  for (const c of list) {
    const g = groupOf(c.updatedAt);
    if (g !== last) { html += `<div class="conv-group">${g}</div>`; last = g; }
    const running = isBusy(c.id);
    html += `<div class="conv-item ${state.conv?.id === c.id ? 'active' : ''}" data-id="${c.id}" role="button" tabindex="0">
      <span class="kind-dot ${modelInfo(c.model).kind}"></span><span class="t">${esc(c.title)}</span>${running ? '<span class="busy-dot" title="正在后台生成中"></span>' : ''}
      <span class="ops"><button data-op="rename" title="重命名">✎</button><button data-op="del" title="删除">🗑</button></span></div>`;
  }
  $('#convList').innerHTML = html || '<div class="conv-group">还没有对话</div>';
}
$('#convList').addEventListener('click', async (e) => {
  const item = e.target.closest('.conv-item'); if (!item) return;
  const c = state.convs.find((x) => x.id === item.dataset.id);
  const op = e.target.closest('button')?.dataset.op;
  if (op === 'del') {
    if (!confirm(`删除对话「${c.title}」？`)) return;
    stopGen(c.id);
    await dbDel(c.id); state.convs = state.convs.filter((x) => x.id !== c.id);
    if (state.conv?.id === c.id) openConv(newDraft()); else renderConvList();
  } else if (op === 'rename') {
    const t = prompt('新的标题', c.title); if (t?.trim()) { c.title = t.trim(); await saveConv(c); renderHeader(); }
  } else openConv(c);
});
$('#searchConv').addEventListener('input', renderConvList);

// ---------------- 顶栏与模型选择 ----------------
function renderHeader() {
  const m = modelInfo(state.conv.model);
  $('#modelName').textContent = m.name;
  $('#modelKindDot').className = 'kind-dot ' + m.kind;
  $('#convTitle').textContent = state.conv.messages.length ? state.conv.title : '';
  document.title = (state.conv.messages.length ? state.conv.title + ' · ' : '') + 'Gemini 体验';
}
function renderModelMenu() {
  const cur = state.conv.model;
  let html = '';
  for (const [k, info] of Object.entries(KINDS)) {
    const ms = state.models.filter((m) => m.kind === k);
    if (!ms.length) continue;
    html += `<div class="mm-group"><span class="kind-dot ${k}"></span>${info.icon} ${info.label}</div>`;
    html += ms.map((m) => {
      const price = formatPriceBadge(m.id, m.kind);
      return `<button class="mm-item ${m.id === cur ? 'active' : ''}" data-id="${m.id}"><b>${esc(m.name)}</b><small>${esc(m.desc || m.id)}</small>${price ? `<span class="mm-price">${esc(price)}</span>` : ''}</button>`;
    }).join('');
  }
  if (state.custom.length) {
    html += `<div class="mm-group">🧪 自定义</div>`;
    html += state.custom.map((m) => `<button class="mm-item ${m.id === cur ? 'active' : ''}" data-id="${m.id}"><b>${esc(m.id)}</b><small>${KINDS[m.kind].label} · ${m.location} <span data-rm="${m.id}" title="移除">✕</span></small></button>`).join('');
  }
  html += `<div class="mm-custom"><input id="cmId" placeholder="自定义模型 ID，如 gemini-4-neon" />
    <select id="cmKind">${Object.entries(KINDS).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('')}</select>
    <select id="cmLoc"><option>global</option><option>us-central1</option><option>europe-west4</option><option>asia-northeast1</option></select>
    <button class="btn" id="cmAdd" type="button">添加</button></div>`;
  $('#modelMenu').innerHTML = html;
}
$('#modelBtn').onclick = (e) => { e.stopPropagation(); renderModelMenu(); $('#modelMenu').classList.toggle('open'); };
$('#modelMenu').addEventListener('click', (e) => {
  e.stopPropagation();
  const rm = e.target.closest('[data-rm]');
  if (rm) { state.custom = state.custom.filter((m) => m.id !== rm.dataset.rm); LS.set('customModels', state.custom); renderModelMenu(); return; }
  if (e.target.id === 'cmAdd') {
    const id = $('#cmId').value.trim(); if (!id) return;
    state.custom = state.custom.filter((m) => m.id !== id).concat({ id, name: id, kind: $('#cmKind').value, location: $('#cmLoc').value });
    LS.set('customModels', state.custom); selectModel(id); return;
  }
  const item = e.target.closest('.mm-item'); if (item) selectModel(item.dataset.id);
});
function selectModel(id) {
  state.conv.model = id;
  $('#modelMenu').classList.remove('open');
  renderHeader(); renderPanel(); renderComposer(); renderWelcome();
  if (!state.conv.draft) saveConv();
}
document.addEventListener('click', () => $('#modelMenu').classList.remove('open'));

// ---------------- 音色库加载与试听播放器（核心 30 MP3 秒播 + 扩展 2,120 音色按需试听并缓存） ----------------
const CORE_VOICE_IDS = new Set(TTS_VOICES.map((v) => v.id));
async function ensureExtendedVoices() {
  if (state.extLoaded || state.extLoading) return;
  state.extLoading = true;
  try {
    const r = await fetch('/tts-extended-voices.json');
    if (r.ok) {
      state.extVoices = await r.json();
      state.extLoaded = true;
    }
  } catch {} finally {
    state.extLoading = false;
    if (modelInfo(state.conv?.model).kind === 'tts') { renderWelcome(); renderPanel(); }
  }
}

const LANG_GROUPS = [
  ['all', '🌐 全部语言'],
  ['zh', '🇨🇳 中文 / 粤语 (zh/yue)'],
  ['en-US', '🇺🇸 美式英语 (en-US)'],
  ['en-GB', '🇬🇧 英式英语 (en-GB)'],
  ['en-other', '🌍 澳/加/印等英语'],
  ['ja-JP', '🇯🇵 日语 (ja-JP)'],
  ['ko-KR', '🇰🇷 韩语 (ko-KR)'],
  ['eu', '🇪🇺 德/法/西/意/葡/俄等'],
  ['other', '🌏 其他全部语种'],
];

function matchLangGroup(lang = '', group = 'all') {
  if (group === 'all') return true;
  if (group === 'zh') return /^(zh|yue)/i.test(lang);
  if (group === 'en-US') return lang === 'en-US';
  if (group === 'en-GB') return lang === 'en-GB';
  if (group === 'en-other') return lang.startsWith('en-') && lang !== 'en-US' && lang !== 'en-GB';
  if (group === 'ja-JP') return lang === 'ja-JP';
  if (group === 'ko-KR') return lang === 'ko-KR';
  if (group === 'eu') return /^(de|fr|es|it|pt|nl|pl|cs|el|ro|ru|uk|tr)-/i.test(lang);
  return !/^(zh|yue|en|ja|ko|de|fr|es|it|pt|nl|pl|cs|el|ro|ru|uk|tr)-/i.test(lang);
}

function getFilteredExtVoices() {
  const q = (state.voiceQuery || '').trim().toLowerCase();
  return (state.extVoices || []).filter((v) => {
    if (state.voiceFilter !== 'all' && v.gender !== state.voiceFilter) return false;
    if (!matchLangGroup(v.lang, state.voiceLang)) return false;
    if (q) {
      const hay = `${v.id} ${v.name} ${v.lang} ${v.accent} ${v.persona} ${v.context} ${v.desc}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

let sampleAudio = null;
function refreshVoicePlayUI() {
  $$('[data-vplay]').forEach((b) => {
    const id = b.dataset.vplay;
    const on = id === state.playingVoice;
    const loading = id === state.loadingVoice;
    b.classList.toggle('playing', on || loading);
    b.textContent = loading ? (b.dataset.short ? '…' : '⏳ 加载中')
      : on ? (b.dataset.short ? '⏹' : '⏹ 停止')
        : (b.dataset.short ? '▶' : '▶ 试听');
  });
}
function toggleVoiceSample(id) {
  if (sampleAudio) { sampleAudio.pause(); sampleAudio = null; }
  if (state.playingVoice === id) {
    state.playingVoice = ''; state.loadingVoice = '';
    refreshVoicePlayUI();
    return;
  }
  const isCore = CORE_VOICE_IDS.has(id);
  const src = isCore
    ? `/tts-samples/${encodeURIComponent(id)}.mp3`
    : `/api/tts-sample/${encodeURIComponent(id)}${state.token ? `?token=${encodeURIComponent(state.token)}` : ''}`;
  state.playingVoice = '';
  state.loadingVoice = isCore ? '' : id;
  refreshVoicePlayUI();
  const a = new Audio(src);
  sampleAudio = a;
  a.oncanplay = () => {
    if (sampleAudio !== a) return;
    state.loadingVoice = '';
    state.playingVoice = id;
    refreshVoicePlayUI();
  };
  a.onplaying = () => { state.loadingVoice = ''; state.playingVoice = id; refreshVoicePlayUI(); };
  a.onended = () => { if (state.playingVoice === id) { state.playingVoice = ''; state.loadingVoice = ''; refreshVoicePlayUI(); } };
  a.onerror = () => {
    if (sampleAudio !== a) return;
    state.playingVoice = ''; state.loadingVoice = '';
    refreshVoicePlayUI();
    toast('试听加载失败（请检查网络或登录后重试）');
  };
  a.play().catch(() => { state.playingVoice = ''; state.loadingVoice = ''; refreshVoicePlayUI(); });
}

// ---------------- 欢迎页 ----------------
function renderWelcome() {
  const w = $('#welcome');
  if (state.conv.messages.length) { w.classList.add('hidden'); return; }
  w.classList.remove('hidden');
  const kind = modelInfo(state.conv.model).kind;
  w.classList.toggle('tts-mode', kind === 'tts');
  if (kind === 'tts') ensureExtendedVoices();
  const h = new Date().getHours();
  const hi = h < 6 ? '夜深了' : h < 11 ? '早上好' : h < 14 ? '中午好' : h < 18 ? '下午好' : '晚上好';
  let extra = '';
  if (kind === 'tts') {
    const f = state.voiceFilter || 'all';
    const bank = state.voiceBank || 'core';
    const curV = state.conv.settings.voice;
    const extCount = state.extVoices.length || 2120;
    let bodyHtml = '';
    if (bank === 'core') {
      const list = f === 'all' ? TTS_VOICES : TTS_VOICES.filter((v) => v.gender === f);
      bodyHtml = `<div class="voice-grid">
        ${list.map((v) => {
          const playing = state.playingVoice === v.id;
          return `<div class="voice-card ${curV === v.id ? 'on' : ''}" data-vpick="${v.id}" role="button" tabindex="0">
            <div class="voice-top">
              <b>${esc(v.id)}</b>
              <span class="vsex ${v.gender === '女' ? 'f' : 'm'}">${v.gender === '女' ? '♀ 女' : '♂ 男'}</span>
              <span class="vpitch">${esc(v.pitch)}音</span>
              <button type="button" class="vplay ${playing ? 'playing' : ''}" data-vplay="${v.id}">${playing ? '⏹ 停止' : '▶ 试听'}</button>
            </div>
            <div class="voice-trait">${esc(v.trait)} · <small style="color:var(--ink-3);font-weight:400">${esc(v.useCase)}</small></div>
            <div class="voice-sample" title="${esc(v.sample)}">「${esc(v.sample)}」</div>
          </div>`;
        }).join('')}
      </div>`;
    } else if (state.extLoading && !state.extLoaded) {
      bodyHtml = '<p class="hint">正在加载官方 2,120+ 全球扩展声库…</p>';
    } else {
      const matched = getFilteredExtVoices();
      const shown = matched.slice(0, state.voiceLimit || 36);
      bodyHtml = `<div class="voice-controls">
        <select id="wExtLang">${LANG_GROUPS.map(([k, l]) => `<option value="${k}" ${state.voiceLang === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>
        <input id="wExtSearch" value="${esc(state.voiceQuery)}" placeholder="搜索口音、职业、地区，如 普通话 / 上海 / 律师 / 温柔…">
        <span class="hint">匹配 ${matched.length} 个角色（点击 ▶ 实时试听并自动缓存）</span>
      </div>
      <div class="voice-grid">
        ${shown.length ? shown.map((v) => {
          const playing = state.playingVoice === v.id;
          const loading = state.loadingVoice === v.id;
          const gCls = v.gender === '女' ? 'f' : v.gender === '男' ? 'm' : 'n';
          const gTxt = v.gender === '女' ? '♀ 女' : v.gender === '男' ? '♂ 男' : '中性';
          return `<div class="voice-card ${curV === v.id ? 'on' : ''}" data-vpick="${esc(v.id)}" role="button" tabindex="0">
            <div class="voice-top">
              <b title="${esc(v.id)}">${esc(v.name)}</b>
              <span class="vsex ${gCls}">${gTxt}</span>
              <span class="vpitch">${esc(v.lang)}</span>
              <button type="button" class="vplay ${playing || loading ? 'playing' : ''}" data-vplay="${esc(v.id)}">${loading ? '⏳ 加载中' : playing ? '⏹ 停止' : '▶ 试听'}</button>
            </div>
            <div class="voice-trait">${esc(v.accent || v.lang)} · ${esc(v.pitch)}音 · <small style="color:var(--ink-3);font-weight:400">${esc(v.persona || v.context)}</small></div>
            <div class="voice-sample" title="${esc(v.desc)}">${esc(v.desc || v.id)}</div>
          </div>`;
        }).join('') : '<p class="hint">没有匹配的扩展音色，请换个关键词或语种筛选试试。</p>'}
      </div>
      ${matched.length > shown.length ? `<div style="text-align:center;margin-top:12px"><button type="button" class="btn" id="wExtMore">展开更多音色（已显示 ${shown.length} / ${matched.length}）</button></div>` : ''}`;
    }

    extra = `<div class="voice-showcase">
      <div class="voice-head">
        <div class="voice-filter">
          <button type="button" data-vbank="core" class="${bank === 'core' ? 'on' : ''}">🌟 核心中文精选 (${TTS_VOICES.length})</button>
          <button type="button" data-vbank="ext" class="${bank === 'ext' ? 'on' : ''}">🌐 官方全球扩展库 (${extCount})</button>
        </div>
        <div class="voice-filter">
          <button type="button" data-vfilter="all" class="${f === 'all' ? 'on' : ''}">全部</button>
          <button type="button" data-vfilter="女" class="${f === '女' ? 'on' : ''}">♀ 女声</button>
          <button type="button" data-vfilter="男" class="${f === '男' ? 'on' : ''}">♂ 男声</button>
        </div>
      </div>
      ${bodyHtml}
    </div>`;
  }
  w.innerHTML = `<h1>${hi}，<br>今天想用 <em>Gemini</em> 做点什么？</h1>
    <p class="sub">对话、画图、做视频、合成语音 —— 选一种开始，随时在顶部切换模型。</p>
    <div class="mode-cards">${Object.entries(KINDS).map(([k, v]) => `<button class="mode-card ${k === kind ? 'active' : ''}" data-kind="${k}" style="--k:var(--${k})"><div class="ic">${v.icon}</div><b>${v.label}</b><small>${v.desc}</small></button>`).join('')}</div>
    <div class="examples">${(EXAMPLES[kind] || []).map((t) => `<button>${esc(t)}</button>`).join('')}</div>${extra}`;
}
$('#welcome').addEventListener('click', (e) => {
  const playBtn = e.target.closest('[data-vplay]');
  if (playBtn) { e.stopPropagation(); toggleVoiceSample(playBtn.dataset.vplay); return; }
  const bankBtn = e.target.closest('[data-vbank]');
  if (bankBtn) { state.voiceBank = bankBtn.dataset.vbank; state.voiceLimit = 36; renderWelcome(); renderPanel(); return; }
  if (e.target.id === 'wExtMore') { state.voiceLimit += 36; renderWelcome(); return; }
  const fltBtn = e.target.closest('[data-vfilter]');
  if (fltBtn) { state.voiceFilter = fltBtn.dataset.vfilter; state.voiceLimit = 36; renderWelcome(); renderPanel(); return; }
  const pickCard = e.target.closest('[data-vpick]');
  if (pickCard) {
    const v = voiceInfo(pickCard.dataset.vpick);
    state.conv.settings.voice = v.id;
    renderWelcome(); renderPanel(); renderComposer();
    if (!state.conv.draft) saveConv();
    toast(`🎙 已选用音色：${v.name || v.id}（${v.gender} · ${v.trait}）`);
    return;
  }
  const card = e.target.closest('.mode-card');
  if (card) {
    const k = card.dataset.kind;
    const pick = state.models.find((m) => m.kind === k && m.id === LS.get('lastModel.' + k)) || state.models.find((m) => m.kind === k);
    if (pick) selectModel(pick.id);
    return;
  }
  const ex = e.target.closest('.examples button');
  if (ex) { $('#input').value = ex.textContent.replace('（打开联网搜索）', ''); autoGrow(); $('#input').focus(); }
});
$('#welcome').addEventListener('change', (e) => {
  if (e.target.id === 'wExtLang') { state.voiceLang = e.target.value; state.voiceLimit = 36; renderWelcome(); renderPanel(); }
});
$('#welcome').addEventListener('input', (e) => {
  if (e.target.id === 'wExtSearch') {
    const pos = e.target.selectionStart;
    state.voiceQuery = e.target.value; state.voiceLimit = 36;
    renderWelcome(); renderPanel();
    const el = $('#wExtSearch'); if (el) { el.focus(); el.setSelectionRange(pos, pos); }
  }
});

// ---------------- 消息渲染 ----------------
function renderThread() {
  renderWelcome();
  $('#thread').innerHTML = '';
  state.conv.messages.forEach((m) => $('#thread').appendChild(renderMsg(m)));
  scrollBottom(true);
}
function scrollBottom(force) {
  const el = $('#messages');
  if (force || el.scrollHeight - el.scrollTop - el.clientHeight < 160) el.scrollTop = el.scrollHeight;
}
function renderMsg(m) {
  const el = document.createElement('div');
  el.className = `msg ${m.role}`;
  el.dataset.id = m.id;
  fillMsg(el, m);
  return el;
}
function fillMsg(el, m) {
  if (m.role === 'user') {
    const files = m.parts.filter((p) => p.inlineData);
    const text = m.parts.filter((p) => p.text).map((p) => p.text).join('\n');
    el.innerHTML = `<div class="user-col">
      ${files.length ? `<div class="user-files">${files.map((p) => p.inlineData.mimeType.startsWith('image/')
        ? `<img src="${dataURL(p.inlineData)}" alt="" data-zoom>` : `<span class="file-chip">${fileIcon(p.inlineData.mimeType)} ${esc(p.fileName || p.inlineData.mimeType)}</span>`).join('')}</div>` : ''}
      ${text ? `<div class="bubble">${esc(text)}</div>` : ''}
      <div class="msg-actions"><button data-act="copy">复制</button><button data-act="remember" title="存入长期记忆">🧠 记住</button><button data-act="edit">编辑</button><button data-act="delete">删除</button></div></div>`;
    return;
  }
  el.classList.toggle('loading', !!m.meta?.loading);
  const thoughts = m.parts.filter((p) => p.thought);
  const main = m.parts.filter((p) => !p.thought);
  let body = '';
  if (thoughts.length) {
    const tText = thoughts.filter((p) => p.text).map((p) => p.text).join('');
    const tImgs = thoughts.filter((p) => p.inlineData?.mimeType?.startsWith('image/'));
    const open = m.meta?.loading && !main.some((p) => p.text || p.inlineData) ? 'open' : '';
    body += `<details class="thoughts" ${open}><summary>${m.meta?.loading && open ? '思考中…' : '思考过程'}</summary>
      <div class="md">${renderMarkdown(tText)}</div>
      ${tImgs.length ? `<div class="gen-images" style="padding:0 12px 12px">${tImgs.map((p) => `<div class="gen-media"><img src="${dataURL(p.inlineData)}" data-zoom></div>`).join('')}</div>` : ''}</details>`;
  }
  let imgBuf = [];
  const flushImgs = () => { if (imgBuf.length) { body += `<div class="gen-images">${imgBuf.join('')}</div>`; imgBuf = []; } };
  main.forEach((p, idx) => {
    if (p.inlineData) {
      const { mimeType } = p.inlineData; const url = dataURL(p.inlineData);
      const name = `gemini-${m.id}-${idx}.${extOf(mimeType)}`;
      if (mimeType.startsWith('image/')) {
        imgBuf.push(`<div class="gen-media"><img src="${url}" data-zoom alt=""><a class="dl" href="${url}" download="${name}">下载</a>
          <a class="dl" style="right:62px" href="#" data-attach="${idx}">作为附件</a></div>`);
        return;
      }
      flushImgs();
      if (mimeType.startsWith('video/')) body += `<div class="gen-media" style="max-width:720px"><video src="${url}" controls playsinline loop></video><a class="dl" href="${url}" download="${name}">下载</a></div>`;
      else if (mimeType.startsWith('audio/')) body += `<audio src="${url}" controls></audio> <a class="link-btn" href="${url}" download="${name}">下载音频</a>`;
      return;
    }
    flushImgs();
    if (p.text !== undefined && p.text !== '') body += `<div class="md">${renderMarkdown(p.text)}</div>`;
    else if (p.executableCode) body += `<div class="exec"><div class="code-head"><span>▶ 执行代码 · ${esc(p.executableCode.language || 'python').toLowerCase()}</span></div><pre>${esc(p.executableCode.code)}</pre></div>`;
    else if (p.codeExecutionResult) body += `<div class="exec"><div class="code-head"><span>${p.codeExecutionResult.outcome === 'OUTCOME_OK' ? '✓ 运行结果' : '✗ 运行出错'}</span></div><pre>${esc(p.codeExecutionResult.output || '（无输出）')}</pre></div>`;
  });
  flushImgs();
  const meta = m.meta || {};
  if (meta.job && !meta.job.done) {
    body += `<div class="progress"><span>🎬 视频生成中 · 已等待 ${meta.job.elapsed || 0} 秒</span><div class="bar"><i></i></div></div>`;
  }
  if (meta.studioStatus) {
    body += `<div class="studio-status"><span>${esc(meta.studioStatus)}</span></div>`;
  }
  if (meta.grounding?.groundingChunks?.length) {
    const links = meta.grounding.groundingChunks.filter((g) => g.web?.uri);
    body += `<div class="sources"><span class="lbl">🔎 参考来源${meta.grounding.webSearchQueries?.length ? '（搜索：' + esc(meta.grounding.webSearchQueries.join('、')) + '）' : ''}</span>
      ${links.map((g, i) => `<a href="${esc(g.web.uri)}" target="_blank" rel="noopener" title="${esc(g.web.title || '')}">${i + 1}. ${esc(g.web.title || g.web.uri)}</a>`).join('')}</div>`;
  }
  if (meta.error) body += `<div class="err">⚠ ${esc(meta.error)}</div>`;
  if (meta.loading && !body) body = '<div class="md"><span class="cursor"></span></div>';
  const info = modelInfo(meta.model || state.conv.model);
  el.innerHTML = `<div class="avatar">${STAR}</div><div class="body">
    <div class="msg-meta"><span>${esc(info.name)}</span>${meta.usage ? `<span class="usage">${fmtUsage(meta.usage)}</span>` : ''}${meta.seconds ? `<span class="usage">${meta.seconds}s</span>` : ''}</div>
    ${body}
    ${meta.loading ? '' : `<div class="msg-actions"><button data-act="copy">复制</button><button data-act="remember" title="存入长期记忆">🧠 记住</button><button data-act="regen">重新生成</button><button data-act="delete">删除</button></div>`}</div>`;
  if (meta.loading) { const last = $$('.md', el).pop(); if (last && main.some((p) => p.text)) last.classList.add('cursor'); }
  enhanceCode(el);
}
function updateMsg(m) {
  const el = $(`.msg[data-id="${m.id}"]`);
  if (el) { fillMsg(el, m); scrollBottom(); }
}
let rafPending = new Set();
function scheduleUpdate(m) {
  if (rafPending.has(m.id)) return;
  rafPending.add(m.id);
  requestAnimationFrame(() => { rafPending.delete(m.id); updateMsg(m); });
}

$('#thread').addEventListener('click', async (e) => {
  const zoom = e.target.closest('[data-zoom]');
  if (zoom) { $('#lightboxImg').src = zoom.src; $('#lightbox').classList.add('open'); return; }
  const att = e.target.closest('[data-attach]');
  const msgEl = e.target.closest('.msg'); if (!msgEl) return;
  const conv = state.conv;
  const i = conv.messages.findIndex((x) => x.id === msgEl.dataset.id);
  const m = conv.messages[i];
  if (att) {
    e.preventDefault();
    const p = m.parts.filter((x) => !x.thought)[Number(att.dataset.attach)];
    state.attachments.push({ id: uid(), name: `生成图-${state.attachments.length + 1}.png`, mimeType: p.inlineData.mimeType, data: p.inlineData.data });
    renderAttachments(); toast('已加入附件，可继续改图或用作视频首帧'); return;
  }
  const act = e.target.closest('[data-act]')?.dataset.act; if (!act) return;
  if (act === 'copy') { copyText(m.parts.filter((p) => p.text && !p.thought).map((p) => p.text).join('\n')); return; }
  if (act === 'remember') {
    const raw = m.parts.filter((p) => p.text && !p.thought).map((p) => p.text).join(' ').replace(/\s+/g, ' ').trim();
    const val = prompt('编辑要存入长期记忆的内容：', raw.slice(0, 160));
    if (val?.trim()) addMemoryItem(val.trim());
    return;
  }
  if (isBusy(conv.id)) return;
  if (act === 'delete') { conv.messages.splice(i, 1); msgEl.remove(); conv.messages.length ? saveConv() : (await dbDel(conv.id), state.convs = state.convs.filter((c) => c.id !== conv.id), renderAll()); }
  if (act === 'regen') {
    conv.messages.splice(i);
    renderThread(); runModel(conv);
  }
  if (act === 'edit') {
    const text = m.parts.filter((p) => p.text).map((p) => p.text).join('\n');
    const col = $('.user-col', msgEl);
    col.innerHTML = `<div class="edit-box" style="width:min(640px,80vw)"><textarea>${esc(text)}</textarea><div class="row"><button class="btn" data-e="cancel">取消</button><button class="btn primary" data-e="ok">保存并重新发送</button></div></div>`;
    const ta = $('textarea', col); ta.focus();
    col.onclick = (ev) => {
      const b = ev.target.closest('[data-e]'); if (!b) return; ev.stopPropagation();
      if (b.dataset.e === 'cancel') return fillMsg(msgEl, m);
      m.parts = m.parts.filter((p) => !p.text).concat(ta.value.trim() ? [{ text: ta.value.trim() }] : []);
      conv.messages.splice(i + 1);
      renderThread(); runModel(conv);
    };
  }
});
$('#lightbox').onclick = () => $('#lightbox').classList.remove('open');

// ---------------- 输入区与附件 ----------------
const input = $('#input');
function autoGrow() { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 260) + 'px'; }
input.addEventListener('input', autoGrow);
input.addEventListener('keydown', (e) => {
  if (e.isComposing) return;
  const ctrl = state.prefs.sendKey === 'ctrl';
  if (e.key === 'Enter' && (ctrl ? (e.ctrlKey || e.metaKey) : !e.shiftKey)) { e.preventDefault(); send(); }
});
function renderComposer() {
  const kind = modelInfo(state.conv.model).kind;
  const s = state.conv.settings;
  input.placeholder = KINDS[kind].ph + (state.prefs.sendKey === 'ctrl' ? '' : '');
  let chips = [];
  if (kind === 'chat') chips = [['googleSearch', '🔎 联网搜索'], ['includeThoughts', '✦ 显示思考'], ['codeExecution', '⌘ 代码执行'], ['urlContext', '🔗 读取网址']];
  if (kind === 'image') chips = [['googleSearch', '🔎 联网参考']];
  if (kind === 'video') chips = [['vAudio', '🔊 生成音频']];
  let html = chips.map(([k, l]) => `<button class="chip ${s[k] ? 'on' : ''}" data-chip="${k}">${l}</button>`).join('');
  if (kind === 'image') html += `<button class="chip" data-open-panel>比例 ${s.aspectRatio === 'auto' ? '自动' : s.aspectRatio} · ${s.imageSize === 'auto' ? '默认尺寸' : s.imageSize}</button>`;
  if (kind === 'video') html += `<button class="chip" data-open-panel>${s.vAspect} · ${s.vDuration}秒 · ${s.vResolution}</button>`;
  if (kind === 'tts') {
    const v = voiceInfo(s.voice);
    html += `<button class="chip" data-open-panel>🔊 ${esc(v.name || v.id)}（${v.gender}·${esc(v.trait)}）</button>`;
    html += `<button class="chip ${state.playingVoice === v.id ? 'on' : ''}" data-vplay="${esc(v.id)}">${state.playingVoice === v.id ? '⏹ 停止试听' : '▶ 试听音色'}</button>`;
  }
  if (kind === 'music') {
    const isL3 = /lyria-3/i.test(state.conv.model);
    if (isL3) html += `<button class="chip ${s.mInstrumental ? 'on' : ''}" data-chip="mInstrumental">🎹 纯音乐</button>`;
    html += `<button class="chip" data-open-panel>${isL3 ? (/pro/i.test(state.conv.model) ? '🎼 完整歌曲 · 最长3分钟' : '🎵 30秒片段 · 含词曲') : '🎻 30秒纯音乐 WAV'}</button>`;
  }
  if (kind === 'studio') {
    const curF = s.studioForce || 'auto';
    const forceBtns = [['auto', '✨ 自动判断'], ['chat', '💬 对话'], ['image', '🎨 画图'], ['video', '🎬 视频'], ['music', '🎵 音乐'], ['tts', '🔊 语音']];
    html += forceBtns.map(([v, l]) => `<button class="chip ${curF === v ? 'on' : ''}" data-studio-force="${v}">${l}</button>`).join('');
    const subMap = { image: s.studioImage || 'gemini-nano-banana-2.1', video: s.studioVideo || 'gemini-omni-1.2-flash', music: s.studioMusic || 'lyria-3-clip-preview' };
    if (subMap[curF]) {
      const fEst = estimateRunCost(subMap[curF], curF, s);
      if (fEst) html += `<button class="chip cost" data-open-panel title="${esc(fEst.detail)}">💰 预估 ${esc(fEst.short)}</button>`;
    }
  }
  const est = estimateRunCost(state.conv.model, kind, s);
  if (est) html += `<button class="chip cost" data-open-panel title="${esc(est.detail + (est.tag ? ' · ' + est.tag : ''))}">💰 预估 ${esc(est.short)}</button>`;
  $('#quickChips').innerHTML = html;
  const memCount = state.prefs.memoryEnabled !== false ? state.memories.filter((m) => m.enabled !== false).length : 0;
  const hints = [];
  if (state.conv.systemInstruction && (kind === 'chat' || kind === 'image' || kind === 'studio')) hints.push('✓ 前置提示词');
  if (memCount && (kind === 'chat' || kind === 'image' || kind === 'studio')) hints.push(`🧠 记忆 ${memCount} 条`);
  $('#composerHint').textContent = hints.join(' · ');
  const busy = isBusy();
  $('#sendBtn').classList.toggle('stop', busy);
  $('#sendBtn').textContent = busy ? '' : '↑';
}
$('#quickChips').addEventListener('click', (e) => {
  const vp = e.target.closest('[data-vplay]');
  if (vp) { toggleVoiceSample(vp.dataset.vplay); renderComposer(); return; }
  const sf = e.target.closest('[data-studio-force]');
  if (sf) { state.conv.settings.studioForce = sf.dataset.studioForce; renderComposer(); renderPanel(); if (!state.conv.draft) saveConv(); return; }
  const c = e.target.closest('[data-chip]');
  if (c) { const k = c.dataset.chip; state.conv.settings[k] = !state.conv.settings[k]; renderComposer(); renderPanel(); if (!state.conv.draft) saveConv(); }
  if (e.target.closest('[data-open-panel]')) $('#panel').classList.remove('closed');
});
const TEXT_EXT = /\.(txt|md|markdown|csv|tsv|json|js|ts|jsx|tsx|py|java|c|cpp|h|cs|go|rs|rb|php|html|css|xml|yaml|yml|sql|sh|log|ini|toml|vue|swift|kt)$/i;
async function addFiles(files) {
  for (const f of files) {
    if (f.size > 20 * 1024 * 1024) { toast(`${f.name} 超过 20MB，已跳过`); continue; }
    let mimeType = f.type;
    if (!mimeType || TEXT_EXT.test(f.name)) mimeType = TEXT_EXT.test(f.name) ? 'text/plain' : 'application/octet-stream';
    const data = await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result.split(',')[1]); fr.readAsDataURL(f); });
    state.attachments.push({ id: uid(), name: f.name, mimeType, data });
  }
  renderAttachments();
}
function renderAttachments() {
  const kind = modelInfo(state.conv.model).kind;
  let imgIdx = 0;
  $('#attachments').innerHTML = state.attachments.map((a) => {
    const isImg = a.mimeType.startsWith('image/');
    const tag = kind === 'video' && isImg ? `<span class="tag">${imgIdx++ === 0 ? '首帧' : '尾帧'}</span>` : '';
    return `<div class="att">${isImg ? `<img src="data:${a.mimeType};base64,${a.data}">` : `<span class="ficon">${fileIcon(a.mimeType)}</span>`}${tag}<span>${esc(a.name)}</span><button class="x" data-rm="${a.id}">✕</button></div>`;
  }).join('');
}
$('#attachments').addEventListener('click', (e) => {
  const id = e.target.closest('[data-rm]')?.dataset.rm;
  if (id) { state.attachments = state.attachments.filter((a) => a.id !== id); renderAttachments(); }
});
$('#attachBtn').onclick = () => $('#fileInput').click();
$('#fileInput').onchange = (e) => { addFiles([...e.target.files]); e.target.value = ''; };
input.addEventListener('paste', (e) => {
  const files = [...(e.clipboardData?.files || [])];
  if (files.length) { e.preventDefault(); addFiles(files); }
});
const composer = $('#composer');
['dragenter', 'dragover'].forEach((t) => document.addEventListener(t, (e) => { e.preventDefault(); composer.classList.add('drag'); }));
['dragleave', 'drop'].forEach((t) => document.addEventListener(t, (e) => { e.preventDefault(); if (t === 'drop' || !e.relatedTarget) composer.classList.remove('drag'); }));
document.addEventListener('drop', (e) => { if (e.dataTransfer?.files?.length) addFiles([...e.dataTransfer.files]); });
$('#sendBtn').onclick = () => isBusy() ? stopGen() : send();

// ---------------- 发送与生成 ----------------
async function send() {
  const conv = state.conv;
  if (isBusy(conv.id)) return;
  const text = input.value.trim();
  if (!text && !state.attachments.length) return;
  const parts = state.attachments.map((a) => ({ inlineData: { mimeType: a.mimeType, data: a.data }, fileName: a.name }));
  if (text) parts.push({ text });
  conv.messages.push({ id: uid(), role: 'user', parts, ts: Date.now() });
  if (conv.title === '新对话') conv.title = (text || state.attachments[0].name).replace(/\s+/g, ' ').slice(0, 28);
  input.value = ''; autoGrow();
  state.attachments = []; renderAttachments();
  renderWelcome();
  $('#thread').appendChild(renderMsg(conv.messages.at(-1)));
  scrollBottom(true);
  LS.set('lastModel.' + modelInfo(conv.model).kind, conv.model);
  await saveConv(conv);
  renderHeader();
  runModel(conv);
}

// 组装多轮上下文：模型生成的视频/音频不回传给对话模型
function buildContents(msgs) {
  return msgs.filter((m) => m.parts?.length).map((m) => {
    let parts = m.parts.map(({ fileName, ...p }) => p);
    if (m.role === 'model') {
      parts = parts.filter((p) => !(p.inlineData && /^(video|audio)\//.test(p.inlineData.mimeType)));
      if (!parts.length) parts = [{ text: '[已生成媒体内容]' }];
    }
    return { role: m.role, parts };
  });
}

function mergePart(parts, p) {
  const last = parts.at(-1);
  if (p.text !== undefined && last && last.text !== undefined && !!last.thought === !!p.thought) {
    last.text += p.text;
    if (p.thoughtSignature) last.thoughtSignature = p.thoughtSignature;
  } else parts.push({ ...p });
}

function stopGen(cid = state.conv?.id) { state.tasks.get(cid)?.abort?.abort(); }

async function runModel(conv = state.conv) {
  if (isBusy(conv.id)) return;
  const info = modelInfo(conv.model);
  const history = conv.messages.slice();
  const msg = { id: uid(), role: 'model', parts: [], meta: { model: conv.model, loading: true }, ts: Date.now() };
  conv.messages.push(msg);
  if (state.conv === conv) {
    $('#thread').appendChild(renderMsg(msg));
    scrollBottom(true);
  }
  const abort = new AbortController();
  state.tasks.set(conv.id, { abort, msgId: msg.id });
  renderConvList();
  if (state.conv === conv) renderComposer();
  const t0 = Date.now();
  try {
    if (info.kind === 'chat' || info.kind === 'image') await runStream(conv, info, history, msg, abort);
    else if (info.kind === 'studio') await runStudio(conv, info, history, msg, abort);
    else if (info.kind === 'tts') await runTTS(conv, info, history, msg, abort);
    else if (info.kind === 'music') await runMusic(conv, info, history, msg, abort);
    else if (info.kind === 'video') await runVideo(conv, info, history, msg, abort);
  } catch (e) {
    if (e.name === 'AbortError') { if (!msg.parts.length) msg.meta.error = '已停止生成'; }
    else msg.meta.error = e.message;
  }
  msg.meta.loading = false;
  msg.meta.seconds = ((Date.now() - t0) / 1000).toFixed(1);
  state.tasks.delete(conv.id);
  renderConvList();
  if (state.conv === conv) {
    updateMsg(msg); renderComposer();
  } else {
    toast(`${msg.meta.error ? '⚠' : '✅'} 「${conv.title}」${msg.meta.error ? '生成出错' : '已在后台生成完毕'}`);
  }
  if (conv.messages.includes(msg)) {
    await saveConv(conv);
    if (info.kind === 'chat' && !msg.meta.error) autoExtractMemories(conv);
  }
}

async function runStream(conv, info, history, msg, abort, opts = {}) {
  const s = conv.settings;
  const targetModel = opts.model || conv.model;
  const targetKind = opts.kind || info.kind;
  const targetLoc = opts.location || info.location;
  const settings = { ...s, stopSequences: s.stopSequences ? s.stopSequences.split(/[,，\n]/).map((x) => x.trim()).filter(Boolean) : [] };
  if (targetKind === 'image') Object.assign(settings, { includeThoughts: s.includeThoughts, thinkingLevel: 'auto', codeExecution: false, urlContext: false, jsonMode: false });
  const res = await api('/api/chat', {
    method: 'POST', signal: abort.signal,
    body: JSON.stringify({ model: targetModel, location: targetLoc, kind: targetKind, studioTools: !!opts.studioTools, contents: buildContents(history), systemInstruction: composeSystemInstruction(conv.systemInstruction), settings }),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `请求失败 (${res.status})`);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  const toolCalls = [];
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf('\n\n')) >= 0) {
      const raw = buf.slice(0, idx); buf = buf.slice(idx + 2);
      const ev = /^event: (.+)$/m.exec(raw)?.[1];
      const data = JSON.parse(/^data: (.*)$/m.exec(raw)?.[1] || '{}');
      if (ev === 'part') mergePart(msg.parts, data);
      else if (ev === 'toolCall') toolCalls.push(data);
      else if (ev === 'done') {
        msg.meta.usage = data.usage; msg.meta.grounding = data.grounding;
        if (data.finishReason && !['STOP', 'MAX_TOKENS'].includes(data.finishReason) && !msg.parts.some((p) => !p.thought) && !toolCalls.length) msg.meta.error = `模型未返回内容（${data.finishReason}）`;
        if (data.finishReason === 'MAX_TOKENS') msg.meta.error = '已达到最大输出长度，回答被截断';
      } else if (ev === 'error') msg.meta.error = data.message;
      if (state.conv === conv) scheduleUpdate(msg);
    }
  }
  return toolCalls;
}

function findRecentImages(history, limit = 2) {
  const out = [];
  for (let i = history.length - 1; i >= 0 && out.length < limit; i--) {
    const imgs = (history[i].parts || []).filter((p) => p.inlineData?.mimeType?.startsWith('image/')).map((p) => p.inlineData);
    for (const img of imgs) {
      if (out.length < limit) out.push(img);
    }
  }
  return out;
}

async function runStudio(conv, info, history, msg, abort) {
  const s = conv.settings;
  const chatId = s.studioChat || 'gemini-3.8-flash';
  const imgId = s.studioImage || 'gemini-nano-banana-2.1';
  const vidId = s.studioVideo || 'gemini-omni-1.2-flash';
  const musId = s.studioMusic || 'lyria-3-clip-preview';
  const ttsId = s.studioTts || 'gemini-3.8-flash-tts';
  const force = s.studioForce || 'auto';

  const setStatus = (txt) => {
    msg.meta.studioStatus = txt;
    if (state.conv === conv) updateMsg(msg);
  };

  if (force === 'chat') {
    await runStream(conv, modelInfo(chatId), history, msg, abort, { model: chatId, kind: 'chat' });
    return;
  }
  if (force === 'image') {
    const m = modelInfo(imgId);
    const est = estimateRunCost(imgId, 'image', s);
    setStatus(`🎨 正在调用 ${m.name} 生成图片${est ? `（${est.short}）` : ''}…`);
    await runStream(conv, m, history, msg, abort, { model: imgId, kind: 'image' });
    setStatus('');
    return;
  }
  if (force === 'video') {
    const m = modelInfo(vidId);
    const est = estimateRunCost(vidId, 'video', s);
    setStatus(`🎬 正在调用 ${m.name} 生成视频${est ? `（${est.short}）` : ''}…`);
    const fakeConv = { ...conv, model: vidId };
    await runVideo(fakeConv, m, history, msg, abort);
    setStatus('');
    return;
  }
  if (force === 'music') {
    const m = modelInfo(musId);
    const est = estimateRunCost(musId, 'music', s);
    setStatus(`🎵 正在调用 ${m.name} 创作音乐${est ? `（${est.short}）` : ''}…`);
    const fakeConv = { ...conv, model: musId };
    await runMusic(fakeConv, m, history, msg, abort);
    setStatus('');
    return;
  }
  if (force === 'tts') {
    const m = modelInfo(ttsId);
    setStatus(`🔊 正在调用 ${m.name} 合成语音…`);
    const fakeConv = { ...conv, model: ttsId };
    await runTTS(fakeConv, m, history, msg, abort);
    setStatus('');
    return;
  }

  // 自动判断模式：由对话大脑原生 Function Calling 决定是否调用画图 / 视频 / 音乐 / 语音
  const chatInfo = modelInfo(chatId);
  const calls = await runStream(conv, chatInfo, history, msg, abort, { model: chatId, kind: 'chat', studioTools: true });
  if (!calls.length || msg.meta.error) return;

  for (const call of calls) {
    if (abort?.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const args = call.args || {};
    if (call.name === 'generate_image') {
      const m = modelInfo(imgId);
      const est = estimateRunCost(imgId, 'image', s);
      setStatus(`🎨 正在调用 ${m.name} 生成图片${est ? `（${est.short}）` : ''}…`);
      const refImgs = args.useReferenceImage ? findRecentImages(history, 2) : history.at(-1).parts.filter((p) => p.inlineData?.mimeType?.startsWith('image/')).map((p) => p.inlineData);
      const imgHist = [{ role: 'user', parts: [...refImgs.map((inlineData) => ({ inlineData })), { text: args.prompt || '' }] }];
      await runStream(conv, m, imgHist, msg, abort, { model: imgId, kind: 'image' });
    } else if (call.name === 'generate_music') {
      const m = modelInfo(musId);
      const est = estimateRunCost(musId, 'music', s);
      setStatus(`🎵 正在调用 ${m.name} 创作音乐${est ? `（${est.short}）` : ''}…`);
      const mSettings = { ...s, mInstrumental: args.instrumental ?? s.mInstrumental, mLyrics: args.lyrics ?? s.mLyrics };
      const fakeConv = { ...conv, model: musId, settings: mSettings };
      const imgs = history.at(-1).parts.filter((p) => p.inlineData?.mimeType?.startsWith('image/')).map((p) => p.inlineData);
      const mHist = [{ role: 'user', parts: [...imgs.map((inlineData) => ({ inlineData })), { text: args.prompt || '' }] }];
      await runMusic(fakeConv, m, mHist, msg, abort);
    } else if (call.name === 'generate_speech') {
      const m = modelInfo(ttsId);
      setStatus(`🔊 正在调用 ${m.name} 合成语音…`);
      const tSettings = { ...s, ttsStyle: args.style ?? s.ttsStyle };
      const fakeConv = { ...conv, model: ttsId, settings: tSettings };
      const tHist = [{ role: 'user', parts: [{ text: args.text || '' }] }];
      await runTTS(fakeConv, m, tHist, msg, abort);
    } else if (call.name === 'generate_video') {
      const m = modelInfo(vidId);
      const vSettings = { ...s, vDuration: args.durationSeconds || s.vDuration };
      const est = estimateRunCost(vidId, 'video', vSettings);
      setStatus(`🎬 正在调用 ${m.name} 生成视频${est ? `（${est.short}）` : ''}…`);
      const refImgs = args.useReferenceImage ? findRecentImages(history, 2) : history.at(-1).parts.filter((p) => p.inlineData?.mimeType?.startsWith('image/')).map((p) => p.inlineData);
      const fakeConv = { ...conv, model: vidId, settings: vSettings };
      const vHist = [{ role: 'user', parts: [...refImgs.map((inlineData) => ({ inlineData })), { text: args.prompt || '' }] }];
      await runVideo(fakeConv, m, vHist, msg, abort);
    }
  }
  setStatus('');
}

async function runTTS(conv, info, history, msg, abort) {
  const last = history.at(-1);
  const text = last.parts.filter((p) => p.text).map((p) => p.text).join('\n');
  if (!text) throw new Error('请输入要朗读的文字');
  const r = await apiJSON('/api/tts', { model: conv.model, location: info.location, text, voice: conv.settings.voice, style: conv.settings.ttsStyle });
  if (abort?.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  msg.parts.push({ inlineData: { mimeType: r.mimeType, data: r.data } });
  msg.meta.usage = r.usage;
}

async function runMusic(conv, info, history, msg, abort) {
  const last = history.at(-1);
  const promptText = last.parts.filter((p) => p.text).map((p) => p.text).join('\n');
  const imgs = last.parts.filter((p) => p.inlineData?.mimeType.startsWith('image/')).map((p) => p.inlineData);
  if (!promptText && !imgs.length) throw new Error('请描述想要的音乐风格或上传参考图');
  const s = conv.settings;
  const r = await apiJSON('/api/music', {
    model: conv.model,
    prompt: promptText,
    images: imgs,
    settings: { instrumental: !!s.mInstrumental, lyrics: s.mLyrics || '', negativePrompt: s.mNegative || '', seed: s.mSeed, sampleCount: s.mCount || 1 },
  });
  if (abort?.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  (r.audios || []).forEach((a) => msg.parts.push({ inlineData: { mimeType: a.mimeType, data: a.data } }));
  if (r.texts?.length) msg.parts.push({ text: r.texts.join('\n\n') });
}

async function runVideo(conv, info, history, msg, abort) {
  const last = history.at(-1);
  const promptText = last.parts.filter((p) => p.text).map((p) => p.text).join('\n');
  const imgs = last.parts.filter((p) => p.inlineData?.mimeType.startsWith('image/')).map((p) => p.inlineData);
  if (!promptText && !imgs.length) throw new Error('请描述视频内容或上传首帧图片');
  if (state.needVideoPassword && !state.videoPassword) {
    const vpwd = window.prompt('🎬 线上环境已禁止直接生成视频，请输入视频专属密码解锁：');
    if (!vpwd || !vpwd.trim()) throw new Error('未输入视频专属密码，线上环境禁止生成视频');
    state.videoPassword = vpwd.trim();
  }
  const s = conv.settings;
  const r = await apiJSON('/api/video', {
    model: conv.model, location: info.location, prompt: promptText, image: imgs[0], lastFrame: imgs[1], images: imgs,
    videoPassword: state.videoPassword,
    settings: { aspectRatio: s.vAspect, durationSeconds: s.vDuration, resolution: s.vResolution, generateAudio: s.vAudio, numberOfVideos: s.vCount, negativePrompt: s.vNegative, enhancePrompt: s.vEnhance, personGeneration: s.vPerson, seed: s.vSeed },
  });
  msg.meta.job = { id: r.id, done: false, elapsed: 0 };
  await saveConv(conv);
  await pollVideo(conv, msg, abort);
}
async function pollVideo(conv, msg, abort) {
  const job = msg.meta.job;
  msg.meta.loading = true;
  if (state.conv === conv) updateMsg(msg);
  while (!job.done) {
    await new Promise((r) => setTimeout(r, 6000));
    if (abort?.signal?.aborted) { msg.meta.error = '已停止等待（服务端任务仍会继续并计费）'; job.done = true; break; }
    try {
      const r = await apiJSON('/api/video/' + job.id);
      if (!r.done) { job.elapsed = r.elapsed; if (state.conv === conv) updateMsg(msg); continue; }
      job.done = true;
      if (r.error) msg.meta.error = r.error;
      (r.videos || []).forEach((v) => v.data ? msg.parts.push({ inlineData: { mimeType: v.mimeType, data: v.data } }) : msg.parts.push({ text: `视频地址：${v.uri}` }));
    } catch (e) { job.done = true; msg.meta.error = e.message; }
  }
  msg.meta.loading = false;
  if (state.conv === conv) updateMsg(msg);
  await saveConv(conv);
}

// ---------------- 右侧运行设置 ----------------
function renderPanel() {
  const c = state.conv; const s = c.settings; const kind = modelInfo(c.model).kind;
  const range = (k, label, min, max, step, tip = '') => `<div class="field"><label>${label}<small>${tip}</small></label><div class="range-row">
    <input type="range" min="${min}" max="${max}" step="${step}" value="${s[k]}" data-k="${k}" data-num><input type="number" min="${min}" max="${max}" step="${step}" value="${s[k]}" data-k="${k}" data-num></div></div>`;
  const tog = (k, label, tip = '') => `<div class="toggle"><div>${label}${tip ? `<small>${tip}</small>` : ''}</div><label class="switch"><input type="checkbox" data-k="${k}" ${s[k] ? 'checked' : ''}><span></span></label></div>`;
  const seg = (k, label, opts) => `<div class="field"><div class="lab">${label}</div><div class="seg">${opts.map(([v, l]) => `<button type="button" class="${String(s[k]) === String(v) ? 'on' : ''}" data-seg="${k}" data-v="${v}">${l ?? v}</button>`).join('')}</div></div>`;
  let html = `<div class="field"><div class="lab">模型<small>${esc(c.model)}</small></div></div>`;
  const panelEst = estimateRunCost(c.model, kind, s);
  if (panelEst) {
    html += `<div class="cost-card">
      <div class="cost-card-top"><span>💵 本次生成预估</span><b>${esc(panelEst.short)}</b></div>
      <div class="cost-card-sub">${esc(panelEst.detail)}${panelEst.tag ? ` · ${esc(panelEst.tag)}` : ''}</div>
    </div>`;
  }
  if (kind === 'chat' || kind === 'image' || kind === 'studio') {
    html += `<div class="field"><label>前置提示词（System）<small><button type="button" class="link-btn" id="savePreset">存为预设</button></small></label>
      <select id="presetSelect"><option value="">— 从提示词库选择 —</option>${state.presets.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select>
      <textarea id="sysInput" placeholder="例如：你是一位幽默的历史老师，回答要生动有趣…" style="margin-top:6px">${esc(c.systemInstruction)}</textarea></div>`;
  }
  if (kind === 'studio') {
    const selModels = (k, field, label) => {
      const list = state.models.filter((m) => m.kind === k);
      const curVal = s[field] || list[0]?.id || '';
      return `<div class="field"><label>${label}</label><select data-k="${field}">${list.map((m) => {
        const p = formatPriceBadge(m.id, m.kind);
        return `<option value="${esc(m.id)}" ${m.id === curVal ? 'selected' : ''}>${esc(m.name)}${p ? ` (${p})` : ''}</option>`;
      }).join('')}</select></div>`;
    };
    html += `<div class="sec-title">综合引擎调度模型（附参考单价）</div>`;
    html += selModels('chat', 'studioChat', '💬 对话大脑');
    html += selModels('image', 'studioImage', '🎨 画图模型');
    html += selModels('video', 'studioVideo', '🎬 视频模型');
    html += selModels('music', 'studioMusic', '🎵 音乐模型');
    html += selModels('tts', 'studioTts', '🔊 语音模型');
    html += `<div class="sec-title">常用媒体参数</div>`;
    html += seg('aspectRatio', '画图比例', [['auto', '自动'], ['1:1'], ['3:4'], ['9:16'], ['16:9']]);
    html += seg('vDuration', '视频时长', [[4, '4 秒'], [6, '6 秒'], [8, '8 秒']]);
    html += tog('mInstrumental', '音乐默认纯音乐', '关闭时支持人声与自动作词');
    const curV = voiceInfo(s.voice);
    html += `<div class="field"><label>语音朗读音色<small>${esc(curV.gender)} · ${esc(curV.trait)}</small></label><select data-k="voice">${TTS_VOICES.map((v) => `<option value="${esc(v.id)}" ${v.id === s.voice ? 'selected' : ''}>${esc(v.name)} (${v.gender}·${esc(v.trait)})</option>`).join('')}</select></div>`;
    html += `<p class="hint">在综合窗口里直接像平时一样聊天，AI 会按你的意图自动调用画图、视频、音乐或语音；也可点击输入框下方的模式按钮手动指定本轮工具。</p>`;
  }
  if (kind === 'chat') {
    html += range('temperature', '温度 Temperature', 0, 2, 0.05, '越高越有创意');
    html += range('topP', 'Top P', 0, 1, 0.01);
    html += `<div class="field"><label>最大输出长度<small>留空=模型默认</small></label><input type="number" data-k="maxOutputTokens" value="${s.maxOutputTokens}" placeholder="如 8192" min="1"></div>`;
    const thinkOpts = /^gemini-4-/i.test(c.model)
      ? [['auto', '自动'], ['low', '低'], ['medium', '中'], ['high', '高'], ['xhigh', '极高']]
      : [['auto', '自动'], ['minimal', '极低'], ['low', '低'], ['medium', '中'], ['high', '高']];
    html += seg('thinkingLevel', '思考强度', thinkOpts);
    html += tog('includeThoughts', '显示思考过程', '展示模型的推理摘要');
    html += `<div class="sec-title">工具</div>`;
    html += tog('googleSearch', '联网搜索', 'Google 搜索 Grounding，附来源');
    html += tog('urlContext', '读取网址内容', '消息里贴链接即可让模型阅读');
    html += tog('codeExecution', '代码执行', '模型可运行 Python 计算/画图');
    html += `<div class="sec-title">高级</div>`;
    html += tog('jsonMode', 'JSON 输出模式', '强制返回合法 JSON');
    html += tog('safetyOff', '放宽安全过滤', '仅拦截高风险内容');
    html += `<div class="field"><label>停止词<small>逗号分隔</small></label><input type="text" data-k="stopSequences" value="${esc(s.stopSequences)}"></div>`;
  }
  if (kind === 'image') {
    html += seg('aspectRatio', '画面比例', [['auto', '自动'], ['1:1'], ['3:4'], ['4:3'], ['9:16'], ['16:9'], ['2:3'], ['3:2'], ['21:9']]);
    html += seg('imageSize', '分辨率', [['auto', '默认'], ['1K'], ['2K'], ['4K']]);
    html += range('temperature', '温度 Temperature', 0, 2, 0.05);
    html += tog('includeThoughts', '显示思考过程', 'Pro 画图模型会先打草稿');
    html += tog('googleSearch', '联网参考', '画实时信息（天气、新闻图表）');
    html += `<p class="hint">提示：上传图片 + 文字即可改图；点生成图上的「作为附件」可以继续迭代。</p>`;
  }
  if (kind === 'video') {
    const isOmni = /omni/i.test(c.model);
    if (!isOmni && s.vDuration > 8) s.vDuration = 8;
    const durOpts = isOmni
      ? [[4, '4 秒'], [6, '6 秒'], [8, '8 秒'], [10, '10 秒'], [15, '15 秒']]
      : [[4, '4 秒'], [6, '6 秒'], [8, '8 秒']];
    html += seg('vAspect', '画面比例', [['16:9', '横屏 16:9'], ['9:16', '竖屏 9:16']]);
    html += seg('vDuration', '时长', durOpts);
    html += seg('vResolution', '分辨率', [['720p'], ['1080p'], ['4k', '4K']]);
    if (!isOmni) html += seg('vCount', '生成数量', [[1], [2], [3], [4]]);
    html += tog('vAudio', '同时生成音频', '对白、音效、配乐');
    if (!isOmni) html += tog('vEnhance', '自动优化提示词');
    if (!isOmni) html += `<div class="field"><label>人物生成</label><select data-k="vPerson"><option value="allow_adult" ${s.vPerson === 'allow_adult' ? 'selected' : ''}>允许成人</option><option value="allow_all" ${s.vPerson === 'allow_all' ? 'selected' : ''}>允许所有</option><option value="dont_allow" ${s.vPerson === 'dont_allow' ? 'selected' : ''}>不允许人物</option></select></div>`;
    html += `<div class="field"><label>反向提示词<small>不想出现的内容</small></label><input type="text" data-k="vNegative" value="${esc(s.vNegative)}" placeholder="如：模糊、文字水印"></div>`;
    html += `<div class="field"><label>随机种子<small>留空=随机</small></label><input type="number" data-k="vSeed" value="${esc(s.vSeed)}"></div>`;
    html += `<p class="hint">${isOmni ? 'Gemini Omni 走 Vertex AI Interactions 通道（global），支持最高 15 秒音画同步及参考图生视频。' : 'Veo 3.1 上传 1 张图作为首帧（图生视频），2 张图则为首帧 + 尾帧。'}视频生成通常需要 30~120 秒。</p>`;
  }
  if (kind === 'tts') {
    ensureExtendedVoices();
    const curV = voiceInfo(s.voice);
    const f = state.voiceFilter || 'all';
    const bank = state.voiceBank || 'core';
    const list = bank === 'core'
      ? (f === 'all' ? TTS_VOICES : TTS_VOICES.filter((v) => v.gender === f))
      : getFilteredExtVoices().slice(0, 60);
    const playingCur = state.playingVoice === curV.id;
    const extCount = state.extVoices.length || 2120;
    const curGCls = curV.gender === '女' ? 'f' : curV.gender === '男' ? 'm' : 'n';
    const curGTxt = curV.gender === '女' ? '♀ 女' : curV.gender === '男' ? '♂ 男' : '中性';
    html += `<div class="field"><label>当前角色音色<small>${curV.gender === '女' ? '♀ 女声' : curV.gender === '男' ? '♂ 男声' : '中性声音'} · ${esc(curV.pitch)}音</small></label>
      <div class="voice-panel-cur">
        <div class="voice-top"><b>${esc(curV.name || curV.id)}</b><span class="vsex ${curGCls}">${curGTxt}</span><span class="vpitch">${esc(curV.pitch)}音</span>
          <button type="button" class="vplay ${playingCur ? 'playing' : ''}" data-vplay="${esc(curV.id)}">${playingCur ? '⏹ 停止' : '▶ 试听'}</button></div>
        <div class="voice-trait" style="margin-top:4px">${esc(curV.trait)} · <small style="color:var(--ink-3);font-weight:400">${esc(curV.useCase)}</small></div>
        <div class="voice-sample" style="margin-top:4px">${curV.isCore ? `「${esc(curV.sample)}」` : esc(curV.sample)}</div>
      </div>
      <div class="voice-filter" style="margin-bottom:6px">
        <button type="button" data-vbank="core" class="${bank === 'core' ? 'on' : ''}">核心 (${TTS_VOICES.length})</button>
        <button type="button" data-vbank="ext" class="${bank === 'ext' ? 'on' : ''}">扩展库 (${extCount})</button>
      </div>
      <div class="voice-filter" style="margin-bottom:8px">
        <button type="button" data-vfilter="all" class="${f === 'all' ? 'on' : ''}">全部</button>
        <button type="button" data-vfilter="女" class="${f === '女' ? 'on' : ''}">♀ 女</button>
        <button type="button" data-vfilter="男" class="${f === '男' ? 'on' : ''}">♂ 男</button>
      </div>
      ${bank === 'ext' ? `<div style="display:flex;flex-direction:column;gap:6px;margin-bottom:8px">
        <select id="pExtLang">${LANG_GROUPS.map(([k, l]) => `<option value="${k}" ${state.voiceLang === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>
        <input type="text" id="pExtSearch" value="${esc(state.voiceQuery)}" placeholder="搜索语种/地区/职业…">
      </div>` : ''}
      <div class="voice-panel-list">${list.map((v) => {
        const pl = state.playingVoice === v.id;
        const ld = state.loadingVoice === v.id;
        const gCls = v.gender === '女' ? 'f' : v.gender === '男' ? 'm' : 'n';
        const sub = bank === 'core' ? `${v.trait} · ${v.pitch}音 · ${v.useCase}` : `${v.lang} · ${v.accent || ''} · ${v.persona || v.desc || ''}`;
        return `<div class="voice-row ${v.id === curV.id ? 'on' : ''}" data-vpick="${esc(v.id)}" role="button" tabindex="0">
          <span class="vsex ${gCls}">${v.gender || '?'}</span>
          <div class="vinfo"><b>${esc(v.name || v.id)}</b><small>${esc(sub)}</small></div>
          <button type="button" class="vplay ${pl || ld ? 'playing' : ''}" data-vplay="${esc(v.id)}" data-short="1" title="试听">${ld ? '…' : pl ? '⏹' : '▶'}</button>
        </div>`;
      }).join('')}</div></div>`;
    html += `<div class="field"><label>语气风格<small>可选</small></label><input type="text" data-k="ttsStyle" value="${esc(s.ttsStyle)}" placeholder="如：用温柔开心的语气说">
      <div class="chips" style="margin-top:6px">${['温柔舒缓', '热情开心', '专业新闻播报', '悬疑低语讲故事', '活泼俏皮'].map((st) => `<button type="button" class="chip" data-tts-style="${st}">${st}</button>`).join('')}</div></div>`;
  }
  if (kind === 'music') {
    const isL3 = /lyria-3/i.test(c.model);
    if (isL3) {
      html += tog('mInstrumental', '纯音乐模式（无人声）', '关闭时支持人声与自动作词');
      if (!s.mInstrumental) {
        html += `<div class="field"><label>自定义歌词<small>可选，留空自动作词</small></label><textarea data-k="mLyrics" placeholder="[Verse 1]&#10;写下你的歌词，或留空由 Lyria 3 自动创作…">${esc(s.mLyrics)}</textarea></div>`;
      }
    } else {
      html += seg('mCount', '生成数量', [[1], [2], [3], [4]]);
      html += `<div class="field"><label>随机种子<small>留空=随机，填写时固定生成 1 首</small></label><input type="number" data-k="mSeed" value="${esc(s.mSeed)}"></div>`;
    }
    html += `<div class="field"><label>排除元素<small>不想出现的乐器或风格</small></label><input type="text" data-k="mNegative" value="${esc(s.mNegative)}" placeholder="如：heavy metal, drums, distorted"></div>`;
    html += `<p class="hint">${isL3 ? 'Lyria 3 支持中英文提示词、歌词人声与上传参考图配乐；Pro 最长约 3 分钟，Clip 为 30 秒片段，单次约需 15~45 秒。' : 'Lyria 2 专注 30 秒 48kHz 纯音乐 WAV，建议用英文描述乐器、BPM 与情绪。'}</p>`;
  }
  html += `<div class="sec-title">默认值</div><div style="display:flex;gap:8px;flex-wrap:wrap"><button type="button" class="btn" id="saveDefaults">设为新对话默认</button><button type="button" class="btn" id="resetSettings">恢复出厂</button></div>`;
  $('#panelBody').innerHTML = html;
}
$('#panelBody').addEventListener('input', (e) => {
  const c = state.conv; const el = e.target;
  if (el.id === 'pExtSearch') {
    const pos = el.selectionStart;
    state.voiceQuery = el.value; state.voiceLimit = 36;
    renderPanel(); renderWelcome();
    const inp = $('#pExtSearch'); if (inp) { inp.focus(); inp.setSelectionRange(pos, pos); }
    return;
  }
  if (el.id === 'sysInput') { c.systemInstruction = el.value; renderComposer(); }
  else if (el.dataset.k) {
    const k = el.dataset.k;
    if (el.type === 'checkbox') c.settings[k] = el.checked;
    else if (el.dataset.num !== undefined) {
      c.settings[k] = Number(el.value);
      $$(`[data-k="${k}"]`, $('#panelBody')).forEach((x) => { if (x !== el) x.value = el.value; });
    } else c.settings[k] = el.value;
    renderComposer();
  } else return;
  clearTimeout(renderPanel._t); renderPanel._t = setTimeout(() => !c.draft && saveConv(c), 400);
});
$('#panelBody').addEventListener('change', (e) => {
  if (e.target.id === 'pExtLang') { state.voiceLang = e.target.value; state.voiceLimit = 36; renderPanel(); renderWelcome(); return; }
  if (e.target.id === 'presetSelect' && e.target.value) {
    const p = state.presets.find((x) => x.id === e.target.value);
    state.conv.systemInstruction = p.content; $('#sysInput').value = p.content; renderComposer();
    if (!state.conv.draft) saveConv();
  }
});
$('#panelBody').addEventListener('click', (e) => {
  const c = state.conv;
  const vp = e.target.closest('[data-vplay]');
  if (vp) { e.stopPropagation(); toggleVoiceSample(vp.dataset.vplay); return; }
  const vb = e.target.closest('[data-vbank]');
  if (vb) { state.voiceBank = vb.dataset.vbank; state.voiceLimit = 36; renderPanel(); renderWelcome(); return; }
  const vf = e.target.closest('[data-vfilter]');
  if (vf) { state.voiceFilter = vf.dataset.vfilter; state.voiceLimit = 36; renderPanel(); renderWelcome(); return; }
  const vpick = e.target.closest('[data-vpick]');
  if (vpick) {
    const v = voiceInfo(vpick.dataset.vpick);
    c.settings.voice = v.id;
    renderPanel(); renderComposer(); renderWelcome();
    if (!c.draft) saveConv();
    toast(`🎙 已选用：${v.name || v.id}（${v.gender} · ${v.trait}）`);
    return;
  }
  const ts = e.target.closest('[data-tts-style]');
  if (ts) {
    c.settings.ttsStyle = `用${ts.dataset.ttsStyle}的语气说`;
    renderPanel(); if (!c.draft) saveConv();
    return;
  }
  const sg = e.target.closest('[data-seg]');
  if (sg) {
    const k = sg.dataset.seg; const v = sg.dataset.v;
    c.settings[k] = typeof DEFAULT_SETTINGS[k] === 'number' ? Number(v) : v;
    renderPanel(); renderComposer(); if (!c.draft) saveConv();
  }
  if (e.target.id === 'saveDefaults') { state.defaults = { ...c.settings }; LS.set('defaults', state.defaults); toast('已保存为新对话默认设置'); }
  if (e.target.id === 'resetSettings') { c.settings = { ...DEFAULT_SETTINGS }; renderPanel(); renderComposer(); toast('已恢复出厂设置'); }
  if (e.target.id === 'savePreset') {
    if (!c.systemInstruction.trim()) return toast('先写点提示词再保存');
    const name = prompt('给这个预设起个名字'); if (!name?.trim()) return;
    state.presets.push({ id: uid(), name: name.trim(), content: c.systemInstruction }); LS.set('presets', state.presets);
    renderPanel(); toast('已存入提示词库');
  }
});
$('#togglePanel').onclick = () => { $('#panel').classList.toggle('closed'); LS.set('panelClosed', $('#panel').classList.contains('closed')); };
$('#closePanel').onclick = () => { $('#panel').classList.add('closed'); LS.set('panelClosed', true); };

// ---------------- 设置弹窗与管理员后台 ----------------
let settingsTab = 'prompts', editingPreset = null;
const fmtTime = (ts) => ts ? new Date(ts).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';

async function loadAdminUsers() {
  try {
    const r = await apiJSON('/api/admin/users');
    state.adminUsers = r.users || [];
    state.adminPassword = r.accessPassword || 'brysj';
    state.memoryBucket = r.bucket || state.memoryBucket;
    if (settingsTab === 'admin') renderSettings();
  } catch (e) {
    toast('加载用户列表失败：' + e.message);
  }
}

async function loadUsageData() {
  try {
    const r = await apiJSON('/api/admin/usage');
    state.usageEvents = r.events || [];
    if (settingsTab === 'usage') renderSettings();
  } catch (e) {
    toast('加载用量账本失败：' + e.message);
  }
}

function collectLocalBrowserUsage() {
  const list = [];
  for (const c of state.convs || []) {
    for (const m of c.messages || []) {
      if (m.role !== 'model') continue;
      const model = m.meta?.model || c.model || 'unknown';
      const info = modelInfo(model);
      const kind = info.kind || 'chat';
      const u = m.meta?.usage || {};
      const vidCount = (m.parts || []).filter((p) => p.inlineData?.mimeType?.startsWith('video/')).length;
      const imgCount = (m.parts || []).filter((p) => !p.thought && p.inlineData?.mimeType?.startsWith('image/')).length;
      const sec = Number(m.meta?.seconds) || 0;
      const vDur = Number(c.settings?.vDuration) || 8;
      list.push({
        id: 'idb-' + m.id,
        ts: m.ts || c.updatedAt || c.createdAt || Date.now(),
        user: state.nickname || state.prefs.memoryUser || '本机用户',
        model,
        kind,
        ok: !m.meta?.error,
        error: m.meta?.error || '',
        ms: sec * 1000,
        promptTokens: Number(u.promptTokenCount) || 0,
        outputTokens: Number(u.candidatesTokenCount) || 0,
        thoughtTokens: Number(u.thoughtsTokenCount) || 0,
        cachedTokens: Number(u.cachedContentTokenCount) || 0,
        totalTokens: Number(u.totalTokenCount) || ((Number(u.promptTokenCount) || 0) + (Number(u.candidatesTokenCount) || 0) + (Number(u.thoughtsTokenCount) || 0)),
        imageCount: imgCount,
        videoCount: vidCount,
        videoSeconds: kind === 'video' && vidCount ? vidCount * vDur : 0,
        resolution: c.settings?.vResolution || '720p',
      });
    }
  }
  return list;
}

function getFilteredUsageEvents() {
  const serverEvs = state.usageEvents || [];
  const localEvs = collectLocalBrowserUsage();
  let evs = [];
  if (state.usageSource === 'server') {
    evs = serverEvs;
  } else if (state.usageSource === 'local') {
    evs = localEvs;
  } else {
    // 合并模式：服务端启用前（早于最早服务端记录前 5 秒）的本地老对话自动补入，避免新数据重复计算
    const minServerTs = serverEvs.length ? Math.min(...serverEvs.map((e) => e.ts || Infinity)) - 5000 : Infinity;
    const olderLocal = localEvs.filter((e) => (e.ts || 0) < minServerTs);
    evs = [...olderLocal, ...serverEvs];
  }
  const now = Date.now();
  const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
  const cutoff = state.usageRange === 'today' ? dayStart.getTime()
    : state.usageRange === '7d' ? now - 7 * 86400000
      : state.usageRange === '30d' ? now - 30 * 86400000 : 0;
  return evs.filter((e) => (e.ts || 0) >= cutoff);
}

const fmtNum = (n) => Number(n || 0).toLocaleString('zh-CN');
const fmtUSD = (u) => u < 0.01 && u > 0 ? `$${u.toFixed(4)}` : `$${u.toFixed(3)}`;

function updateAdminUI() {
  const isAdm = !!state.isAdmin;
  ['#openAdmin', '#openUsage', '#settingsTabs [data-tab="admin"]', '#settingsTabs [data-tab="usage"]'].forEach((sel) => {
    const el = $(sel);
    if (el) el.style.display = isAdm ? '' : 'none';
  });
}

async function ensureAdminAccess() {
  if (state.isAdmin) return true;
  const pwd = window.prompt('🛡 仅限管理员访问，请输入管理员口令：');
  if (!pwd || !pwd.trim()) return false;
  try {
    const r = await apiJSON('/api/admin/unlock', { password: pwd.trim() });
    if (r.isAdmin) {
      state.isAdmin = true;
      state.adminSecret = pwd.trim();
      state.videoPassword = pwd.trim();
      updateAdminUI();
      toast('🛡 管理员权限已解锁');
      return true;
    }
  } catch (e) {
    toast('🚫 ' + (e.message || '管理员密码错误'));
  }
  return false;
}

async function openSettings(tab = 'prompts') {
  if ((tab === 'admin' || tab === 'usage')) {
    const ok = await ensureAdminAccess();
    if (!ok) return;
  }
  settingsTab = tab;
  renderSettings();
  $('#settingsDialog').showModal();
  if (tab === 'admin') loadAdminUsers();
  if (tab === 'usage') loadUsageData();
}
function renderSettings() {
  updateAdminUI();
  $$('#settingsTabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === settingsTab));
  const body = $('#settingsBody');
  if (settingsTab === 'usage') {
    const evs = getFilteredUsageEvents();
    const mode = state.usageRateMode || 'promo';
    let totalUsd = 0, totalIn = 0, totalOut = 0, totalThink = 0, totalCache = 0, okCalls = 0, errCalls = 0, totalImgs = 0, totalVidSec = 0, totalMs = 0, timedCalls = 0;
    const byModel = new Map();
    const byUser = new Map();
    for (const ev of evs) {
      const { usd, rate } = calcEventCost(ev, mode);
      totalUsd += usd;
      totalIn += ev.promptTokens || 0;
      totalOut += ev.outputTokens || 0;
      totalThink += ev.thoughtTokens || 0;
      totalCache += ev.cachedTokens || 0;
      if (ev.ok === false) errCalls++; else okCalls++;
      totalImgs += ev.imageCount || 0;
      totalVidSec += ev.videoSeconds || 0;
      if (ev.ms > 0) { totalMs += ev.ms; timedCalls++; }

      const mk = ev.model || 'unknown';
      const mr = byModel.get(mk) || {
        model: mk, kind: ev.kind || modelInfo(mk).kind || 'chat',
        calls: 0, ok: 0, err: 0, inTok: 0, outTok: 0, thinkTok: 0, cacheTok: 0,
        imgs: 0, vidSec: 0, ms: 0, usd: 0, tag: rate.tag || '',
      };
      mr.calls++; if (ev.ok === false) mr.err++; else mr.ok++;
      mr.inTok += ev.promptTokens || 0; mr.outTok += ev.outputTokens || 0; mr.thinkTok += ev.thoughtTokens || 0; mr.cacheTok += ev.cachedTokens || 0;
      mr.imgs += ev.imageCount || 0; mr.vidSec += ev.videoSeconds || 0; mr.ms += ev.ms || 0; mr.usd += usd;
      byModel.set(mk, mr);

      const uk = ev.user || 'default';
      const ur = byUser.get(uk) || { user: uk, calls: 0, tokens: 0, imgs: 0, vidSec: 0, usd: 0 };
      ur.calls++; ur.tokens += (ev.promptTokens || 0) + (ev.outputTokens || 0) + (ev.thoughtTokens || 0);
      ur.imgs += ev.imageCount || 0; ur.vidSec += ev.videoSeconds || 0; ur.usd += usd;
      byUser.set(uk, ur);
    }
    const modelRows = [...byModel.values()].sort((a, b) => b.usd - a.usd || b.calls - a.calls);
    const userRows = [...byUser.values()].sort((a, b) => b.usd - a.usd || b.calls - a.calls);
    const totalCalls = okCalls + errCalls;
    const totalTokens = totalIn + totalOut + totalThink;
    const successRate = totalCalls ? ((okCalls / totalCalls) * 100).toFixed(1) : '100.0';
    const avgSec = timedCalls ? (totalMs / timedCalls / 1000).toFixed(1) : '0.0';
    const cny = totalUsd * USD_TO_CNY;
    const trialPct = Math.min(100, (totalUsd / 300) * 100).toFixed(2);
    const health = state.healthReport;

    body.innerHTML = `<div class="usage-toolbar">
      <div class="usage-filters">
        <select id="uSource" title="数据来源">
          <option value="merged" ${state.usageSource === 'merged' ? 'selected' : ''}>📦 全部合并（历史会话 + 服务端账本）</option>
          <option value="server" ${state.usageSource === 'server' ? 'selected' : ''}>🌐 仅服务端账本（含线上朋友）</option>
          <option value="local" ${state.usageSource === 'local' ? 'selected' : ''}>💻 仅当前浏览器历史对话</option>
        </select>
        <select id="uRange" title="时间范围">
          <option value="all" ${state.usageRange === 'all' ? 'selected' : ''}>全部时间</option>
          <option value="today" ${state.usageRange === 'today' ? 'selected' : ''}>今天</option>
          <option value="7d" ${state.usageRange === '7d' ? 'selected' : ''}>近 7 天</option>
          <option value="30d" ${state.usageRange === '30d' ? 'selected' : ''}>近 30 天</option>
        </select>
        <select id="uRate" title="官方费率标准">
          <option value="promo" ${mode === 'promo' ? 'selected' : ''}>🏷 当前官方价（含 2026-11 促销）</option>
          <option value="standard" ${mode === 'standard' ? 'selected' : ''}>📈 正式标准价（12月/1月涨价参考）</option>
        </select>
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <button type="button" class="btn" id="uHealthBtn" ${state.healthBusy ? 'disabled' : ''}>${state.healthBusy ? '🩺 体检中…' : '🩺 全面体检'}</button>
        <button type="button" class="btn" id="uRefresh">🔄 刷新</button>
        <button type="button" class="btn" id="uExportCsv">⬇ 导出 CSV</button>
        <button type="button" class="btn danger" id="uClearServer" title="仅清空服务端账本，不删对话">清空账本</button>
      </div>
    </div>

    ${health ? `<div class="health-box">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
        <b>🩺 全链路体检报告（总耗时 ${health.totalMs} ms · ${health.ok ? '✅ 全部正常' : '⚠️ 存在异常'}）</b>
        <button type="button" class="btn" id="uLivePingBtn" style="padding:3px 10px;font-size:12px" ${state.healthBusy ? 'disabled' : ''}>⚡ 附带 1-Token 实机推理测试</button>
      </div>
      ${(health.checks || []).map((c) => `<div class="health-row">
        <span>${c.ok ? '🟢' : '🔴'} <b>${esc(c.name)}</b></span>
        <span style="color:var(--ink-2)">${esc(c.detail)}${c.ms ? ` <small style="color:var(--ink-3)">(${c.ms}ms)</small>` : ''}</span>
      </div>`).join('')}
    </div>` : ''}

    <div class="kpi-grid">
      <div class="kpi-card">
        <div class="kpi-label">💵 预估官方费用 (${mode === 'promo' ? '促销期' : '标准期'})</div>
        <div class="kpi-val">${fmtUSD(totalUsd)} <small style="font-size:13px;font-weight:400;color:var(--ink-3)">≈ ¥${cny.toFixed(2)}</small></div>
        <div class="kpi-sub">占 \$300 赠金约 ${trialPct}%（汇率 ${USD_TO_CNY}）</div>
        <div class="kpi-bar"><i style="width:${Math.min(100, Number(trialPct))}%"></i></div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">🪙 总 Token 消耗</div>
        <div class="kpi-val">${fmtNum(totalTokens)}</div>
        <div class="kpi-sub">输入 ${fmtNum(totalIn)} · 输出 ${fmtNum(totalOut)}<br>深度思考 ${fmtNum(totalThink)} · 缓存 ${fmtNum(totalCache)}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">⚡ 请求数与媒体产出</div>
        <div class="kpi-val">${totalCalls} <small style="font-size:13px;font-weight:400;color:#2d8a56">成功率 ${successRate}%</small></div>
        <div class="kpi-sub">报错 ${errCalls} 次 · 画图 ${totalImgs} 张 · 视频 ${totalVidSec} 秒</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">⏱ 平均耗时 & 高耗提醒</div>
        <div class="kpi-val">${avgSec}s <small style="font-size:13px;font-weight:400;color:var(--ink-3)">/ 次</small></div>
        <div class="kpi-sub">${modelRows[0] ? `最耗费：${esc(modelInfo(modelRows[0].model).name)} (${fmtUSD(modelRows[0].usd)})` : '暂无调用记录'}</div>
      </div>
    </div>

    <div class="usage-table-wrap">
      <table class="usage-table">
        <thead><tr>
          <th>模型</th><th>类型</th><th class="num">次数 (成功/错)</th><th class="num">输入 Token</th>
          <th class="num">输出 + 思考 Token</th><th class="num">产出</th><th>官方参考单价</th><th class="num">金额 (USD / CNY)</th>
        </tr></thead>
        <tbody>
          ${modelRows.length ? modelRows.map((r) => {
            const pct = totalUsd > 0 ? Math.max(2, Math.round((r.usd / totalUsd) * 100)) : 0;
            const kindLabel = KINDS[r.kind]?.label || r.kind;
            const mediaCol = r.kind === 'video' ? `${r.vidSec} 秒` : r.kind === 'image' ? `${r.imgs} 张` : r.kind === 'music' ? `${r.calls} 首` : r.cacheTok ? `缓存 ${fmtNum(r.cacheTok)}` : '—';
            const unitTxt = formatUnitPrice(r.model, r.kind, mode);
            return `<tr>
              <td><b>${esc(modelInfo(r.model).name)}</b><br><small style="color:var(--ink-3);font-family:var(--mono)">${esc(r.model)}</small></td>
              <td><span class="kind-dot ${esc(r.kind)}" style="display:inline-block;margin-right:4px"></span>${esc(kindLabel)}</td>
              <td class="num">${r.calls} <small style="color:var(--ink-3)">(${r.ok}/${r.err})</small></td>
              <td class="num">${fmtNum(r.inTok)}</td>
              <td class="num">${fmtNum(r.outTok + r.thinkTok)}${r.thinkTok ? `<br><small style="color:var(--ink-3)">含思考 ${fmtNum(r.thinkTok)}</small>` : ''}</td>
              <td class="num">${mediaCol}</td>
              <td><small title="${esc(r.tag)}">${esc(unitTxt)}<br><span style="color:var(--ink-3)">${esc(r.tag)}</span></small></td>
              <td class="num"><b>${fmtUSD(r.usd)}</b> <small style="color:var(--ink-3)">¥${(r.usd * USD_TO_CNY).toFixed(2)}</small><span class="cost-bar-bg"><i style="width:${pct}%"></i></span></td>
            </tr>`;
          }).join('') : '<tr><td colspan="8" style="text-align:center;color:var(--ink-3);padding:24px">当前筛选条件下暂无消耗记录（发送一次对话/画图/视频/记忆提炼后立即统计）</td></tr>'}
        </tbody>
      </table>
    </div>

    ${userRows.length > 1 || (userRows[0] && userRows[0].user !== 'default') ? `<div class="usage-table-wrap">
      <table class="usage-table">
        <thead><tr><th>使用者昵称</th><th class="num">调用次数</th><th class="num">总 Token</th><th class="num">画图张数</th><th class="num">视频秒数</th><th class="num">预估费用</th></tr></thead>
        <tbody>${userRows.map((u) => `<tr>
          <td>👤 <b>${esc(u.user)}</b></td><td class="num">${u.calls}</td><td class="num">${fmtNum(u.tokens)}</td>
          <td class="num">${u.imgs}</td><td class="num">${u.vidSec} 秒</td>
          <td class="num"><b>${fmtUSD(u.usd)}</b> <small style="color:var(--ink-3)">(¥${(u.usd * USD_TO_CNY).toFixed(2)})</small></td>
        </tr>`).join('')}</tbody>
      </table>
    </div>` : ''}
    <p class="hint" style="margin:0">注：金额按 Google Cloud Vertex AI 官方公开价格表（<code>global</code> 节点，${mode === 'promo' ? '当前 2026-11 促销价' : '正式标准价'}）实时估算；实际账单与 \$300 赠金余额以 Google Cloud Console 结算页为准。<code>gemini-4-neon</code> 官方标准价为 \$3/\$15；<code>gemini-4-argon/carbon</code> 将于 2026-12-01 结束 \$2/\$10 半价促销恢复为 \$4/\$20。</p>`;
  } else if (settingsTab === 'memory') {
    const user = state.prefs.memoryUser || state.nickname || 'default';
    body.innerHTML = `<div class="mem-bar">
      <span>👤 记忆空间（昵称）：</span>
      <input id="memUserInput" value="${esc(user)}" ${state.isAdmin ? '' : 'readonly'} placeholder="如 小明 或朋友昵称" title="${state.isAdmin ? '不同昵称的记忆彼此独立' : '已按你的登录昵称自动隔离'}">
      ${state.isAdmin ? '<button type="button" class="btn" id="memSwitchUser">切换/拉取</button>' : ''}
      <button type="button" class="btn" id="memExtractNow">✨ 从当前对话提炼</button>
      <span class="mem-status">${state.memoryCloudOk ? `☁ Google 免费云已连接 (${esc(state.memoryBucket)})` : '💾 本地存储已就绪'}</span>
    </div>
    <div style="display:flex;gap:18px;flex-wrap:wrap;margin-bottom:8px">
      <label class="toggle" style="gap:10px;padding:2px 0"><span>对话时自动注入记忆</span><label class="switch"><input type="checkbox" id="memEnableChk" ${state.prefs.memoryEnabled !== false ? 'checked' : ''}><span></span></label></label>
      <label class="toggle" style="gap:10px;padding:2px 0"><span>聊天时自动学习新记忆</span><label class="switch"><input type="checkbox" id="memAutoChk" ${state.prefs.memoryAutoExtract !== false ? 'checked' : ''}><span></span></label></label>
      <label class="toggle" style="gap:10px;padding:2px 0"><span>自动同步到 Google 免费云</span><label class="switch"><input type="checkbox" id="memCloudChk" ${state.prefs.memoryCloudSync !== false ? 'checked' : ''}><span></span></label></label>
    </div>
    <div class="mem-add">
      <input id="memNewInput" placeholder="手动添加一条长期记忆，例如：我是做跨境电商的，回答请直接给可落地方案…">
      <button type="button" class="btn primary" id="memAddBtn">＋ 添加记忆</button>
    </div>
    <div class="mem-list">${state.memories.length ? state.memories.map((m) => `<div class="mem-item ${m.enabled === false ? 'off' : ''}" data-mid="${m.id}">
      <input type="checkbox" data-mact="toggle" ${m.enabled !== false ? 'checked' : ''} title="启用/暂停此条记忆">
      <span class="txt">${esc(m.content)}</span>
      <span class="ops"><button type="button" data-mact="edit">编辑</button><button type="button" data-mact="del">删除</button></span>
    </div>`).join('') : '<p class="hint">还没有长期记忆。你可以在上面手动添加，或者在聊天里直接说“记住我喜欢……”，AI 会自动帮你记住。</p>'}</div>`;
  } else if (settingsTab === 'admin') {
    const users = state.adminUsers || [];
    const totalCalls = users.reduce((s, u) => s + (u.chatCount || 0) + (u.imageCount || 0) + (u.videoCount || 0) + (u.ttsCount || 0), 0);
    body.innerHTML = `<div class="admin-bar">
      <div>🔑 访问口令：<code>${esc(state.adminPassword || 'brysj')}</code> &nbsp;·&nbsp; 👥 已登录朋友：<b>${users.length}</b> 人 &nbsp;·&nbsp; ⚡ 累计调用：<b>${totalCalls}</b> 次 &nbsp;·&nbsp; ☁ 云桶：<code>${esc(state.memoryBucket || '')}</code></div>
      <button type="button" class="btn" id="adminRefresh">🔄 刷新列表</button>
    </div>
    <div class="admin-user-list">${users.length ? users.map((u) => `<div class="admin-user-card ${u.blocked ? 'blocked' : ''}" data-ukey="${esc(u.userKey)}" data-unick="${esc(u.nickname)}">
      <div class="admin-user-top">
        <div class="admin-user-name">
          <span>👤 ${esc(u.nickname)}</span>
          <span class="admin-tag ${u.blocked ? 'err' : 'ok'}">${u.blocked ? '🚫 已停用' : '🟢 正常'}</span>
          <small style="font-weight:400;color:var(--ink-3)">最后活跃：${fmtTime(u.lastActiveAt)} · 首次登录：${fmtTime(u.firstSeenAt)}</small>
        </div>
        <div class="admin-ops">
          <button type="button" class="btn" data-aact="mem">🧠 查看/管记忆</button>
          <button type="button" class="btn" data-aact="convs">💬 查看对话</button>
          <button type="button" class="btn ${u.blocked ? '' : 'danger'}" data-aact="block">${u.blocked ? '✅ 恢复使用' : '🚫 停用昵称'}</button>
          <button type="button" class="btn danger" data-aact="del">🗑</button>
        </div>
      </div>
      <div class="admin-stats">
        <span>🔑 登录 <b>${u.loginCount || 0}</b> 次</span>
        <span>💬 对话 <b>${u.chatCount || 0}</b> 次</span>
        <span>🎨 画图 <b>${u.imageCount || 0}</b> 张</span>
        <span>🎬 视频 <b>${u.videoCount || 0}</b> 条</span>
        <span>🔊 语音 <b>${u.ttsCount || 0}</b> 次</span>
        ${u.lastModel ? `<span>🤖 最近模型：<code>${esc(u.lastModel)}</code></span>` : ''}
      </div>
      ${u.lastPromptPreview ? `<div class="admin-preview" title="${esc(u.lastPromptPreview)}">最近提问：${esc(u.lastPromptPreview)}</div>` : ''}
    </div>`).join('') : '<p class="hint">暂无朋友登录记录。朋友输入昵称与密码 <code>brysj</code> 登录后会自动出现在这里。</p>'}</div>
    ${state.adminInspectHtml ? `<div class="admin-inspect">${state.adminInspectHtml}</div>` : ''}`;
  } else if (settingsTab === 'prompts') {
    editingPreset = editingPreset && state.presets.find((p) => p.id === editingPreset.id) || state.presets[1] || state.presets[0];
    body.innerHTML = `<div class="preset-layout"><div class="preset-list">
      ${state.presets.map((p) => `<button type="button" class="p ${p.id === editingPreset?.id ? 'active' : ''}" data-pid="${p.id}">${p.id === state.prefs.defaultPreset ? '★ ' : ''}${esc(p.name)}</button>`).join('')}
      <button type="button" class="btn" id="pNew" style="margin-top:8px">＋ 新建预设</button></div>
      <div class="preset-edit">${editingPreset ? `<input id="pName" value="${esc(editingPreset.name)}" placeholder="预设名称">
        <textarea id="pContent" placeholder="写下前置提示词（System Instruction），它会在每轮对话前告诉模型扮演什么角色、遵守什么规则…">${esc(editingPreset.content)}</textarea>
        <div class="row"><button type="button" class="btn primary" id="pSave">保存</button><button type="button" class="btn" id="pApply">应用到当前对话</button>
        <button type="button" class="btn" id="pDefault">设为新对话默认 ★</button><button type="button" class="btn danger" id="pDel">删除</button></div>` : ''}</div></div>`;
  } else if (settingsTab === 'general') {
    body.innerHTML = `<div class="field"><label>新对话默认模型</label><select id="gModel">${allModels().map((m) => `<option value="${m.id}" ${m.id === state.prefs.defaultModel ? 'selected' : ''}>${KINDS[m.kind].label} · ${esc(m.name)}</option>`).join('')}</select></div>
      <div class="field"><label>外观</label><div class="seg"><button type="button" data-theme-set="light" class="${state.prefs.theme === 'light' ? 'on' : ''}">宣纸（亮）</button><button type="button" data-theme-set="dark" class="${state.prefs.theme === 'dark' ? 'on' : ''}">松烟（暗）</button><button type="button" data-theme-set="auto" class="${state.prefs.theme === 'auto' ? 'on' : ''}">跟随系统</button></div></div>
      <div class="field"><label>发送快捷键</label><div class="seg"><button type="button" data-send="enter" class="${state.prefs.sendKey !== 'ctrl' ? 'on' : ''}">Enter 发送</button><button type="button" data-send="ctrl" class="${state.prefs.sendKey === 'ctrl' ? 'on' : ''}">Ctrl + Enter 发送</button></div></div>
      ${state.needPassword ? `<div class="field"><button type="button" class="btn" id="logout">退出登录（清除访问密码）</button></div>` : ''}`;
  } else if (settingsTab === 'data') {
    body.innerHTML = `<p><b>本地存储</b>：所有对话、生成的图片与视频默认保存在当前浏览器（IndexedDB），长期记忆同时保存在本地 <code>data/memories/</code>。</p>
      <p><b>Google 免费云同步</b>：直接复用你的 Vertex 服务账号，存储在 Google Cloud Storage <code>US-CENTRAL1</code> 永久免费层（<code>${esc(state.memoryBucket || '')}</code>，无需额外配置），按「记忆空间标识（当前：<code>${esc(state.prefs.memoryUser || 'default')}</code>）」隔离。</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin:12px 0"><button type="button" class="btn primary" id="dCloudPush">☁ 备份对话到 Google 云</button>
      <button type="button" class="btn" id="dCloudPull">☁ 从 Google 云恢复对话</button>
      <button type="button" class="btn" id="dExport">导出全部对话（JSON）</button>
      <button type="button" class="btn" id="dImport">导入对话</button><input type="file" id="dImportFile" accept=".json" hidden>
      <button type="button" class="btn danger" id="dClear">清空全部对话</button></div><p class="hint" id="dStat"></p>`;
    navigator.storage?.estimate?.().then((e) => { const el = $('#dStat'); if (el) el.textContent = `共 ${state.convs.length} 个对话，浏览器已用存储约 ${(e.usage / 1048576).toFixed(1)} MB`; });
  } else {
    body.innerHTML = `<div class="about"><p><b>Gemini 体验</b> 是一个基于 Google Vertex AI 的中文多模态工作台：对话、画图、视频、语音、长期记忆一站式体验。</p>
      <p>当前 Google Cloud 项目：<code>${esc(state.project || '')}</code> · 免费云记忆桶：<code>${esc(state.memoryBucket || '')}</code></p>
      <p>凭据只存在服务端，浏览器不会接触到密钥；部署给朋友使用时，建议设置环境变量 <code>ACCESS_PASSWORD</code> 开启访问密码。</p>
      <p>模型列表在服务端 <code>models.js</code> 中维护；也可以在顶部模型菜单底部添加任意 Vertex 模型 ID 尝鲜。</p></div>`;
  }
}
$('#settingsTabs').addEventListener('click', async (e) => {
  const t = e.target.closest('[data-tab]');
  if (t) {
    if ((t.dataset.tab === 'admin' || t.dataset.tab === 'usage') && !(await ensureAdminAccess())) return;
    settingsTab = t.dataset.tab;
    renderSettings();
    if (settingsTab === 'admin') loadAdminUsers();
    if (settingsTab === 'usage') loadUsageData();
  }
});
$('#settingsBody').addEventListener('click', async (e) => {
  const t = e.target;
  // —— Token 消耗与体检看板操作 ——
  if (t.id === 'uRefresh') { toast('正在刷新用量账本…'); await loadUsageData(); return; }
  if (t.id === 'uClearServer') {
    if (!confirm('确定清空服务端用量账本？（本地历史对话不会受影响）')) return;
    try { await apiJSON('/api/admin/usage/clear', {}); state.usageEvents = []; renderSettings(); toast('已清空服务端账本'); }
    catch (err) { toast('清空失败：' + err.message); }
    return;
  }
  if (t.id === 'uHealthBtn' || t.id === 'uLivePingBtn') {
    const livePing = t.id === 'uLivePingBtn';
    state.healthBusy = true; renderSettings();
    try {
      state.healthReport = await apiJSON('/api/admin/health-check', { livePing });
      if (livePing) await loadUsageData();
    } catch (err) {
      toast('体检出错：' + err.message);
    } finally {
      state.healthBusy = false; renderSettings();
    }
    return;
  }
  if (t.id === 'uExportCsv') {
    const evs = getFilteredUsageEvents();
    const mode = state.usageRateMode || 'promo';
    const rows = [['时间', '用户', '模型', '类型', '状态', '耗时ms', '输入Token', '输出Token', '思考Token', '缓存Token', '图片张数', '视频秒数', '分辨率', '预估USD', '错误信息']];
    for (const ev of evs) {
      const { usd } = calcEventCost(ev, mode);
      rows.push([
        new Date(ev.ts || 0).toISOString(), ev.user || '', ev.model || '', ev.kind || '',
        ev.ok === false ? '失败' : '成功', ev.ms || 0, ev.promptTokens || 0, ev.outputTokens || 0,
        ev.thoughtTokens || 0, ev.cachedTokens || 0, ev.imageCount || 0, ev.videoSeconds || 0,
        ev.resolution || '', usd.toFixed(6), (ev.error || '').replace(/[\r\n,]/g, ' '),
      ]);
    }
    const csv = '\uFEFF' + rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `gemini-用量账单-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    return;
  }
  // —— 管理员用户后台操作 ——
  if (t.id === 'adminRefresh') {
    toast('正在刷新用户数据…');
    await loadAdminUsers();
    return;
  }
  const ucard = t.closest('.admin-user-card');
  if (ucard && t.dataset.aact) {
    const ukey = ucard.dataset.ukey;
    const unick = ucard.dataset.unick;
    if (t.dataset.aact === 'mem') {
      state.prefs.memoryUser = unick;
      LS.set('prefs', state.prefs);
      await loadMemories();
      settingsTab = 'memory';
      renderSettings();
      toast(`🧠 正在查看/管理「${unick}」的长期记忆`);
      return;
    }
    if (t.dataset.aact === 'convs') {
      toast(`正在读取「${unick}」的云端对话…`);
      try {
        const r = await apiJSON(`/api/cloud-convs?user=${encodeURIComponent(unick)}`);
        const convs = r.convs || [];
        state.adminInspectHtml = `<b>💬 「${esc(unick)}」的云端对话记录（共 ${convs.length} 个会话）</b>` +
          (convs.length ? convs.map((c) => `<div style="margin-top:10px;padding-top:8px;border-top:1px dashed var(--line)">
            <div><b>${esc(c.title || '未命名对话')}</b> <small style="color:var(--ink-3)">(${esc(c.model || '')} · ${fmtTime(c.updatedAt)})</small></div>
            ${(c.messages || []).slice(-6).map((m) => `<div style="margin:4px 0;color:var(--ink-2)"><b>${m.role === 'user' ? '👤 ' + esc(unick) : '✦ AI'}：</b>${esc((m.parts || []).filter((p) => p.text && !p.thought).map((p) => p.text).join(' ').slice(0, 220))}</div>`).join('')}
          </div>`).join('') : '<p class="hint">该用户暂未产生云端备份对话。</p>');
        renderSettings();
      } catch (err) { toast('读取失败：' + err.message); }
      return;
    }
    if (t.dataset.aact === 'block') {
      try {
        await apiJSON('/api/admin/user-action', { userKey: ukey, action: 'toggleBlock' });
        await loadAdminUsers();
        toast(`已更新「${unick}」的状态`);
      } catch (err) { toast('操作失败：' + err.message); }
      return;
    }
    if (t.dataset.aact === 'del') {
      if (!confirm(`确定从管理列表移除「${unick}」的统计记录？`)) return;
      try {
        await apiJSON('/api/admin/user-action', { userKey: ukey, action: 'deleteUser' });
        await loadAdminUsers();
        toast(`已移除「${unick}」`);
      } catch (err) { toast('删除失败：' + err.message); }
      return;
    }
  }
  // —— 长期记忆操作 ——
  if (t.id === 'memAddBtn') {
    const inp = $('#memNewInput');
    if (addMemoryItem(inp.value)) { inp.value = ''; renderSettings(); }
    return;
  }
  if (t.id === 'memSwitchUser') {
    state.prefs.memoryUser = ($('#memUserInput').value || 'default').trim() || 'default';
    LS.set('prefs', state.prefs);
    await loadMemories();
    renderSettings();
    toast(`已切换到记忆空间：${state.prefs.memoryUser}`);
    return;
  }
  if (t.id === 'memExtractNow') {
    if (!state.conv?.messages?.length) return toast('当前对话还是空的');
    toast('正在从当前对话提炼记忆…');
    const msgs = state.conv.messages.map((m) => ({
      role: m.role,
      text: (m.parts || []).filter((p) => p.text && !p.thought).map((p) => p.text).join('\n').trim(),
    })).filter((m) => m.text);
    try {
      const r = await apiJSON('/api/memory/extract', { messages: msgs, existing: state.memories });
      const added = (r.added || []).filter((txt) => !state.memories.some((m) => m.content === txt));
      if (!added.length) return toast('未发现需要新增的长期记忆');
      for (const txt of added) state.memories.unshift({ id: uid(), content: txt, enabled: true, createdAt: Date.now() });
      await saveMemories(`✨ 已提炼 ${added.length} 条新记忆`);
      renderSettings();
    } catch (err) { toast('提炼失败：' + err.message); }
    return;
  }
  const mitem = t.closest('.mem-item');
  if (mitem && t.dataset.mact) {
    const m = state.memories.find((x) => x.id === mitem.dataset.mid);
    if (!m) return;
    if (t.dataset.mact === 'toggle') { m.enabled = t.checked; await saveMemories(); renderSettings(); }
    if (t.dataset.mact === 'edit') {
      const v = prompt('修改记忆内容：', m.content);
      if (v?.trim()) { m.content = v.trim(); await saveMemories('已更新记忆'); renderSettings(); }
    }
    if (t.dataset.mact === 'del') {
      state.memories = state.memories.filter((x) => x.id !== m.id);
      await saveMemories('已删除记忆'); renderSettings();
    }
    return;
  }
  if (t.id === 'dCloudPush') {
    try {
      toast('正在同步对话到 Google 云…');
      const r = await apiJSON('/api/cloud-convs', { user: state.prefs.memoryUser || state.nickname || 'default', convs: await dbAll() });
      toast(`☁ 已备份 ${r.count} 个对话到 Google 免费云`);
    } catch (err) { toast('云备份失败：' + err.message); }
    return;
  }
  if (t.id === 'dCloudPull') {
    try {
      const r = await apiJSON(`/api/cloud-convs?user=${encodeURIComponent(state.prefs.memoryUser || state.nickname || 'default')}`);
      if (!r.convs?.length) return toast('云端暂无该标识下的备份对话');
      for (const c of r.convs) await dbPut(c);
      state.convs = (await dbAll()).sort((a, b) => b.updatedAt - a.updatedAt);
      renderConvList(); renderSettings();
      toast(`☁ 已从 Google 云恢复 ${r.convs.length} 个对话`);
    } catch (err) { toast('云恢复失败：' + err.message); }
    return;
  }
  const pid = t.closest('[data-pid]')?.dataset.pid;
  if (pid) { editingPreset = state.presets.find((p) => p.id === pid); renderSettings(); return; }
  const savePresets = () => LS.set('presets', state.presets);
  if (t.id === 'pNew') { editingPreset = { id: uid(), name: '新预设', content: '' }; state.presets.push(editingPreset); savePresets(); renderSettings(); $('#pName').select(); }
  if (t.id === 'pSave') { editingPreset.name = $('#pName').value.trim() || '未命名'; editingPreset.content = $('#pContent').value; savePresets(); renderSettings(); renderPanel(); toast('已保存'); }
  if (t.id === 'pApply') { state.conv.systemInstruction = $('#pContent').value; renderPanel(); renderComposer(); if (!state.conv.draft) saveConv(); toast('已应用到当前对话'); }
  if (t.id === 'pDefault') { state.prefs.defaultPreset = editingPreset.id; LS.set('prefs', state.prefs); renderSettings(); toast('新对话将默认使用此提示词'); }
  if (t.id === 'pDel') { if (!confirm('删除这个预设？')) return; state.presets = state.presets.filter((p) => p.id !== editingPreset.id); editingPreset = null; savePresets(); renderSettings(); renderPanel(); }
  if (t.dataset.themeSet) { state.prefs.theme = t.dataset.themeSet; LS.set('prefs', state.prefs); applyTheme(); renderSettings(); }
  if (t.dataset.send) { state.prefs.sendKey = t.dataset.send; LS.set('prefs', state.prefs); renderSettings(); }
  if (t.id === 'logout') { state.token = ''; $('#settingsDialog').close(); showLogin(); }
  if (t.id === 'dExport') {
    const blob = new Blob([JSON.stringify({ app: 'gemini-tiyan', version: 1, convs: await dbAll(), presets: state.presets, memories: state.memories }, null, 0)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `gemini体验-备份-${new Date().toISOString().slice(0, 10)}.json`; a.click();
  }
  if (t.id === 'dImport') $('#dImportFile').click();
  if (t.id === 'dClear') {
    if (!confirm('确定清空全部对话？此操作不可恢复（建议先导出备份）')) return;
    await idb('readwrite', (s) => s.clear()); state.convs = []; openConv(newDraft()); renderSettings();
  }
});
$('#settingsBody').addEventListener('change', async (e) => {
  if (e.target.id === 'uSource') { state.usageSource = e.target.value; renderSettings(); return; }
  if (e.target.id === 'uRange') { state.usageRange = e.target.value; renderSettings(); return; }
  if (e.target.id === 'uRate') { state.usageRateMode = e.target.value; renderSettings(); return; }
  if (e.target.id === 'memEnableChk') { state.prefs.memoryEnabled = e.target.checked; LS.set('prefs', state.prefs); updateMemBadge(); renderComposer(); }
  if (e.target.id === 'memAutoChk') { state.prefs.memoryAutoExtract = e.target.checked; LS.set('prefs', state.prefs); }
  if (e.target.id === 'memCloudChk') { state.prefs.memoryCloudSync = e.target.checked; LS.set('prefs', state.prefs); if (e.target.checked) saveMemories('☁ 已开启 Google 云同步'); }
  if (e.target.id === 'gModel') { state.prefs.defaultModel = e.target.value; LS.set('prefs', state.prefs); toast('已更新默认模型'); }
  if (e.target.id === 'dImportFile' && e.target.files[0]) {
    try {
      const j = JSON.parse(await e.target.files[0].text());
      for (const c of j.convs || []) await dbPut(c);
      if (j.presets) { const ids = new Set(state.presets.map((p) => p.id)); state.presets.push(...j.presets.filter((p) => !ids.has(p.id))); LS.set('presets', state.presets); }
      if (Array.isArray(j.memories)) { const mc = new Set(state.memories.map((m) => m.content)); state.memories.push(...j.memories.filter((m) => !mc.has(m.content))); await saveMemories(); }
      state.convs = await dbAll(); renderConvList(); renderSettings(); toast(`已导入 ${j.convs?.length || 0} 个对话`);
    } catch (err) { toast('导入失败：' + err.message); }
  }
});
$('#settingsBody').addEventListener('keydown', (e) => {
  if (e.target.id === 'memNewInput' && e.key === 'Enter') { e.preventDefault(); $('#memAddBtn')?.click(); }
  if (e.target.id === 'memUserInput' && e.key === 'Enter') { e.preventDefault(); $('#memSwitchUser')?.click(); }
});
$('#openMemory').onclick = () => openSettings('memory');
$('#openUsage').onclick = () => openSettings('usage');
$('#openAdmin').onclick = () => openSettings('admin');
$('#openSettings').onclick = () => openSettings('prompts');
$('#userBadgeBtn').onclick = () => showLogin();

// ---------------- 主题 / 侧栏 / 快捷键 ----------------
function applyTheme() {
  const t = state.prefs.theme === 'auto' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : state.prefs.theme;
  document.documentElement.dataset.theme = t;
  $('#hljs-light').disabled = t === 'dark'; $('#hljs-dark').disabled = t !== 'dark';
}
$('#toggleTheme').onclick = () => { state.prefs.theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'; LS.set('prefs', state.prefs); applyTheme(); };
$('#newChat').onclick = () => openConv(newDraft());
$('#openSidebar').onclick = () => { $('#sidebar').classList.add('open'); $('#scrim').classList.add('open'); };
function closeSidebarMobile() { $('#sidebar').classList.remove('open'); $('#scrim').classList.remove('open'); }
$('#closeSidebar').onclick = closeSidebarMobile;
$('#scrim').onclick = closeSidebarMobile;
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openConv(newDraft()); input.focus(); }
  if (e.key === 'Escape') { $('#modelMenu').classList.remove('open'); $('#lightbox').classList.remove('open'); }
});

// ---------------- 登录（线上环境每次打开网页强制填写昵称 + 密码；本机 localhost 免登录直接用） ----------------
function updateUserBadge() {
  const btn = $('#userBadgeBtn');
  const el = $('#userBadgeText');
  if (!state.needPassword) {
    if (btn) btn.style.display = 'none';
    return;
  }
  if (btn) btn.style.display = '';
  if (el) el.textContent = state.token && state.nickname ? state.nickname : '未登录';
}
function showLogin(errText = '') {
  if (!state.needPassword) return;
  $('#loginErr').textContent = errText || '';
  if (state.nickname && !$('#loginName').value) $('#loginName').value = state.nickname;
  $('#loginPwd').value = '';
  if (!$('#loginDialog').open) $('#loginDialog').showModal();
  setTimeout(() => ($('#loginName').value ? $('#loginPwd') : $('#loginName')).focus(), 50);
}
$('#loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const nickname = $('#loginName').value.trim();
  const password = $('#loginPwd').value;
  if (!nickname) { $('#loginErr').textContent = '请填写你的昵称'; return; }
  const res = await fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nickname, password }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) { $('#loginErr').textContent = j.error || '登录失败'; return; }
  state.token = j.token;
  state.nickname = j.nickname;
  if (j.isAdmin) {
    state.isAdmin = true;
    state.adminSecret = password;
    state.videoPassword = password;
  }
  LS.set('lastNickname', j.nickname);
  state.prefs.memoryUser = j.nickname;
  LS.set('prefs', state.prefs);
  updateUserBadge();
  updateAdminUI();
  $('#loginDialog').close();
  await loadMemories();
  if (location.pathname === '/admin' || location.hash === '#admin' || new URLSearchParams(location.search).get('admin') === '1') {
    openSettings('admin');
  }
  toast(`🎉 欢迎你，${j.nickname}！已载入你的专属记忆空间`);
  input.focus();
});
$('#loginDialog').addEventListener('cancel', (e) => {
  if (state.needPassword && !state.token) e.preventDefault();
});

// ---------------- 启动 ----------------
applyTheme();
if (LS.get('panelClosed', innerWidth < 1100)) $('#panel').classList.add('closed');
try {
  const cfg = await (await fetch('/api/config')).json();
  state.models = cfg.models; state.needPassword = !!cfg.needPassword; state.project = cfg.project; state.memoryBucket = cfg.memoryBucket || '';
  state.isAdmin = !!cfg.isAdmin;
  if (cfg.needVideoPassword !== undefined) state.needVideoPassword = !!cfg.needVideoPassword;
  if (!allModels().some((m) => m.id === state.prefs.defaultModel)) state.prefs.defaultModel = state.models[0]?.id;
} catch { toast('无法连接服务端'); }
updateUserBadge();
updateAdminUI();
state.convs = (await dbAll()).sort((a, b) => b.updatedAt - a.updatedAt);
openConv(newDraft(state.prefs.defaultModel));
if (state.needPassword) {
  // 线上环境每次打开网页强制弹出「昵称 + 密码」登录验证
  showLogin();
} else {
  // 本机 localhost 直接免密使用
  await loadMemories();
  if (location.pathname === '/admin' || location.hash === '#admin' || new URLSearchParams(location.search).get('admin') === '1') {
    openSettings('admin');
  }
  input.focus();
}
