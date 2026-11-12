// Gemini 体验 —— 前端主逻辑（原生 JS，无构建步骤）
// 数据全部存在浏览器 IndexedDB（对话、图片、视频），设置与提示词库存在 localStorage

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const esc = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const STAR = '<svg viewBox="0 0 64 64"><path d="M32 4c2 15 13 26 28 28-15 2-26 13-28 28-2-15-13-26-28-28C19 30 30 19 32 4z"/></svg>';

const KINDS = {
  chat: { label: '对话', icon: '💬', desc: '问答、写作、编程、读文件', ph: '输入消息，Enter 发送，Shift+Enter 换行…' },
  image: { label: '画图', icon: '🎨', desc: '文生图、上传参考图改图', ph: '描述你想要的画面；可上传参考图让它改图…' },
  video: { label: '视频', icon: '🎬', desc: 'Veo 文生视频、图生视频', ph: '描述视频画面与镜头运动；上传 1 张图=首帧，2 张=首帧+尾帧…' },
  tts: { label: '语音', icon: '🔊', desc: '文字转自然语音', ph: '输入要朗读的文字…' },
};
const EXAMPLES = {
  chat: ['用通俗的话解释一下量子纠缠', '帮我写一封得体的请假邮件', '今天有哪些重要科技新闻？（打开联网搜索）', '写一个 Python 脚本批量重命名图片'],
  image: ['一只戴着宇航员头盔的橘猫，漂浮在星空中，电影感光影', '水墨风格的江南小镇，细雨，乌篷船', '极简扁平风格的咖啡店 logo，暖色调', '赛博朋克夜晚的重庆洪崖洞，霓虹灯'],
  video: ['航拍镜头缓缓掠过云海之上的雪山日出', '一只柯基在海边沙滩上奔跑，慢动作，夕阳', '雨夜的东京街头，镜头跟随一把红伞前行', '咖啡倒入杯中的特写，奶泡形成拉花'],
  tts: ['大家好，欢迎来到 Gemini 体验，今天我们一起探索 AI 的无限可能。', '从前有座山，山里有座庙，庙里有个老和尚在给小和尚讲故事。'],
};
const VOICES = ['Kore', 'Puck', 'Zephyr', 'Charon', 'Fenrir', 'Leda', 'Orus', 'Aoede', 'Callirrhoe', 'Autonoe', 'Enceladus', 'Iapetus', 'Umbriel', 'Algieba', 'Despina', 'Erinome', 'Algenib', 'Rasalgethi', 'Laomedeia', 'Achernar', 'Alnilam', 'Schedar', 'Gacrux', 'Pulcherrima', 'Achird', 'Zubenelgenubi', 'Vindemiatrix', 'Sadachbia', 'Sadaltager', 'Sulafat'];

const DEFAULT_SETTINGS = {
  temperature: 1, topP: 0.95, maxOutputTokens: '', thinkingLevel: 'auto', includeThoughts: true,
  googleSearch: false, urlContext: false, codeExecution: false, jsonMode: false, safetyOff: false, stopSequences: '',
  aspectRatio: 'auto', imageSize: 'auto',
  vAspect: '16:9', vDuration: 8, vResolution: '720p', vAudio: true, vCount: 1, vNegative: '', vEnhance: true, vPerson: 'allow_adult', vSeed: '',
  voice: 'Kore', ttsStyle: '',
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
  prefs: LS.get('prefs', { defaultModel: 'gemini-3.8-flash', defaultPreset: 'none', theme: 'light', sendKey: 'enter' }),
  defaults: { ...DEFAULT_SETTINGS, ...LS.get('defaults', {}) },
  presets: LS.get('presets', null) || DEFAULT_PRESETS,
  token: LS.get('token', ''), busy: false, abort: null, attachments: [], needPassword: false,
};
const allModels = () => [...state.models, ...state.custom];
const modelInfo = (id) => allModels().find((m) => m.id === id) || { id, name: id, kind: 'chat', location: 'global' };

// ---------------- API ----------------
async function api(path, opts = {}) {
  const res = await fetch(path, { ...opts, headers: { 'Content-Type': 'application/json', 'x-access-token': state.token, ...(opts.headers || {}) } });
  if (res.status === 401) { showLogin(); throw new Error('需要访问密码'); }
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
const extOf = (mime) => ({ 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'video/mp4': 'mp4', 'audio/wav': 'wav' }[mime] || mime.split('/')[1] || 'bin');
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
}
function openConv(c) {
  if (state.busy) stopGen();
  state.conv = c;
  state.attachments = [];
  renderAll();
  // 恢复未完成的视频任务
  c.messages.forEach((m) => { if (m.meta?.job && !m.meta.job.done) pollVideo(c, m); });
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
    html += `<div class="conv-item ${state.conv?.id === c.id ? 'active' : ''}" data-id="${c.id}" role="button" tabindex="0">
      <span class="kind-dot ${modelInfo(c.model).kind}"></span><span class="t">${esc(c.title)}</span>
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
    html += ms.map((m) => `<button class="mm-item ${m.id === cur ? 'active' : ''}" data-id="${m.id}"><b>${esc(m.name)}</b><small>${esc(m.desc || m.id)}</small></button>`).join('');
  }
  if (state.custom.length) {
    html += `<div class="mm-group">🧪 自定义</div>`;
    html += state.custom.map((m) => `<button class="mm-item ${m.id === cur ? 'active' : ''}" data-id="${m.id}"><b>${esc(m.id)}</b><small>${KINDS[m.kind].label} · ${m.location} <span data-rm="${m.id}" title="移除">✕</span></small></button>`).join('');
  }
  html += `<div class="mm-custom"><input id="cmId" placeholder="自定义模型 ID，如 gemini-4-argon" />
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

// ---------------- 欢迎页 ----------------
function renderWelcome() {
  const w = $('#welcome');
  if (state.conv.messages.length) { w.classList.add('hidden'); return; }
  w.classList.remove('hidden');
  const kind = modelInfo(state.conv.model).kind;
  const h = new Date().getHours();
  const hi = h < 6 ? '夜深了' : h < 11 ? '早上好' : h < 14 ? '中午好' : h < 18 ? '下午好' : '晚上好';
  w.innerHTML = `<h1>${hi}，<br>今天想用 <em>Gemini</em> 做点什么？</h1>
    <p class="sub">对话、画图、做视频、合成语音 —— 选一种开始，随时在顶部切换模型。</p>
    <div class="mode-cards">${Object.entries(KINDS).map(([k, v]) => `<button class="mode-card ${k === kind ? 'active' : ''}" data-kind="${k}" style="--k:var(--${k})"><div class="ic">${v.icon}</div><b>${v.label}</b><small>${v.desc}</small></button>`).join('')}</div>
    <div class="examples">${(EXAMPLES[kind] || []).map((t) => `<button>${esc(t)}</button>`).join('')}</div>`;
}
$('#welcome').addEventListener('click', (e) => {
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
      <div class="msg-actions"><button data-act="copy">复制</button><button data-act="edit">编辑</button><button data-act="delete">删除</button></div></div>`;
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
    ${meta.loading ? '' : `<div class="msg-actions"><button data-act="copy">复制</button><button data-act="regen">重新生成</button><button data-act="delete">删除</button></div>`}</div>`;
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
  const act = e.target.closest('[data-act]')?.dataset.act; if (!act || state.busy) return;
  if (act === 'copy') copyText(m.parts.filter((p) => p.text && !p.thought).map((p) => p.text).join('\n'));
  if (act === 'delete') { conv.messages.splice(i, 1); msgEl.remove(); conv.messages.length ? saveConv() : (await dbDel(conv.id), state.convs = state.convs.filter((c) => c.id !== conv.id), renderAll()); }
  if (act === 'regen') {
    conv.messages.splice(i);
    renderThread(); runModel();
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
      renderThread(); runModel();
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
  if (kind === 'tts') html += `<button class="chip" data-open-panel>音色 ${s.voice}</button>`;
  $('#quickChips').innerHTML = html;
  $('#composerHint').textContent = state.conv.systemInstruction && (kind === 'chat' || kind === 'image') ? '✓ 已设前置提示词' : '';
  $('#sendBtn').classList.toggle('stop', state.busy);
  $('#sendBtn').textContent = state.busy ? '' : '↑';
}
$('#quickChips').addEventListener('click', (e) => {
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
$('#sendBtn').onclick = () => state.busy ? stopGen() : send();

// ---------------- 发送与生成 ----------------
async function send() {
  if (state.busy) return;
  const text = input.value.trim();
  if (!text && !state.attachments.length) return;
  const conv = state.conv;
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
  runModel();
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

function stopGen() { state.abort?.abort(); }

async function runModel() {
  const conv = state.conv;
  const info = modelInfo(conv.model);
  const history = conv.messages.slice();
  const msg = { id: uid(), role: 'model', parts: [], meta: { model: conv.model, loading: true }, ts: Date.now() };
  conv.messages.push(msg);
  $('#thread').appendChild(renderMsg(msg));
  scrollBottom(true);
  state.busy = true; state.abort = new AbortController(); renderComposer();
  const t0 = Date.now();
  try {
    if (info.kind === 'chat' || info.kind === 'image') await runStream(conv, info, history, msg);
    else if (info.kind === 'tts') await runTTS(conv, info, history, msg);
    else if (info.kind === 'video') await runVideo(conv, info, history, msg);
  } catch (e) {
    if (e.name === 'AbortError') { if (!msg.parts.length) msg.meta.error = '已停止生成'; }
    else msg.meta.error = e.message;
  }
  msg.meta.loading = false;
  msg.meta.seconds = ((Date.now() - t0) / 1000).toFixed(1);
  state.busy = false; state.abort = null;
  updateMsg(msg); renderComposer();
  if (conv.messages.includes(msg)) await saveConv(conv);
}

async function runStream(conv, info, history, msg) {
  const s = conv.settings;
  const settings = { ...s, stopSequences: s.stopSequences ? s.stopSequences.split(/[,，\n]/).map((x) => x.trim()).filter(Boolean) : [] };
  if (info.kind === 'image') Object.assign(settings, { includeThoughts: s.includeThoughts, thinkingLevel: 'auto', codeExecution: false, urlContext: false, jsonMode: false });
  const res = await api('/api/chat', {
    method: 'POST', signal: state.abort.signal,
    body: JSON.stringify({ model: conv.model, location: info.location, kind: info.kind, contents: buildContents(history), systemInstruction: conv.systemInstruction, settings }),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `请求失败 (${res.status})`);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
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
      else if (ev === 'done') {
        msg.meta.usage = data.usage; msg.meta.grounding = data.grounding;
        if (data.finishReason && !['STOP', 'MAX_TOKENS'].includes(data.finishReason) && !msg.parts.some((p) => !p.thought)) msg.meta.error = `模型未返回内容（${data.finishReason}）`;
        if (data.finishReason === 'MAX_TOKENS') msg.meta.error = '已达到最大输出长度，回答被截断';
      } else if (ev === 'error') msg.meta.error = data.message;
      scheduleUpdate(msg);
    }
  }
}

async function runTTS(conv, info, history, msg) {
  const last = history.at(-1);
  const text = last.parts.filter((p) => p.text).map((p) => p.text).join('\n');
  if (!text) throw new Error('请输入要朗读的文字');
  const r = await apiJSON('/api/tts', { model: conv.model, location: info.location, text, voice: conv.settings.voice, style: conv.settings.ttsStyle });
  msg.parts.push({ inlineData: { mimeType: r.mimeType, data: r.data } });
  msg.meta.usage = r.usage;
}

async function runVideo(conv, info, history, msg) {
  const last = history.at(-1);
  const prompt = last.parts.filter((p) => p.text).map((p) => p.text).join('\n');
  const imgs = last.parts.filter((p) => p.inlineData?.mimeType.startsWith('image/')).map((p) => p.inlineData);
  if (!prompt && !imgs.length) throw new Error('请描述视频内容或上传首帧图片');
  const s = conv.settings;
  const r = await apiJSON('/api/video', {
    model: conv.model, location: info.location, prompt, image: imgs[0], lastFrame: imgs[1],
    settings: { aspectRatio: s.vAspect, durationSeconds: s.vDuration, resolution: s.vResolution, generateAudio: s.vAudio, numberOfVideos: s.vCount, negativePrompt: s.vNegative, enhancePrompt: s.vEnhance, personGeneration: s.vPerson, seed: s.vSeed },
  });
  msg.meta.job = { id: r.id, done: false, elapsed: 0 };
  await saveConv(conv);
  await pollVideo(conv, msg);
}
async function pollVideo(conv, msg) {
  const job = msg.meta.job;
  msg.meta.loading = true;
  if (state.conv === conv) updateMsg(msg);
  while (!job.done) {
    await new Promise((r) => setTimeout(r, 6000));
    if (state.abort?.signal.aborted) { msg.meta.error = '已停止等待（服务端任务仍会继续并计费）'; job.done = true; break; }
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
  if (kind === 'chat' || kind === 'image') {
    html += `<div class="field"><label>前置提示词（System）<small><button type="button" class="link-btn" id="savePreset">存为预设</button></small></label>
      <select id="presetSelect"><option value="">— 从提示词库选择 —</option>${state.presets.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select>
      <textarea id="sysInput" placeholder="例如：你是一位幽默的历史老师，回答要生动有趣…" style="margin-top:6px">${esc(c.systemInstruction)}</textarea></div>`;
  }
  if (kind === 'chat') {
    html += range('temperature', '温度 Temperature', 0, 2, 0.05, '越高越有创意');
    html += range('topP', 'Top P', 0, 1, 0.01);
    html += `<div class="field"><label>最大输出长度<small>留空=模型默认</small></label><input type="number" data-k="maxOutputTokens" value="${s.maxOutputTokens}" placeholder="如 8192" min="1"></div>`;
    html += seg('thinkingLevel', '思考强度', [['auto', '自动'], ['minimal', '极低'], ['low', '低'], ['medium', '中'], ['high', '高']]);
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
    html += seg('vAspect', '画面比例', [['16:9', '横屏 16:9'], ['9:16', '竖屏 9:16']]);
    html += seg('vDuration', '时长', [[4, '4 秒'], [6, '6 秒'], [8, '8 秒']]);
    html += seg('vResolution', '分辨率', [['720p'], ['1080p'], ['4k', '4K']]);
    html += seg('vCount', '生成数量', [[1], [2], [3], [4]]);
    html += tog('vAudio', '同时生成音频', '对白、音效、配乐');
    html += tog('vEnhance', '自动优化提示词');
    html += `<div class="field"><label>人物生成</label><select data-k="vPerson"><option value="allow_adult" ${s.vPerson === 'allow_adult' ? 'selected' : ''}>允许成人</option><option value="allow_all" ${s.vPerson === 'allow_all' ? 'selected' : ''}>允许所有</option><option value="dont_allow" ${s.vPerson === 'dont_allow' ? 'selected' : ''}>不允许人物</option></select></div>`;
    html += `<div class="field"><label>反向提示词<small>不想出现的内容</small></label><input type="text" data-k="vNegative" value="${esc(s.vNegative)}" placeholder="如：模糊、文字水印"></div>`;
    html += `<div class="field"><label>随机种子<small>留空=随机</small></label><input type="number" data-k="vSeed" value="${esc(s.vSeed)}"></div>`;
    html += `<p class="hint">上传 1 张图作为首帧（图生视频），2 张图则为首帧 + 尾帧。视频生成通常需要 1-3 分钟，按秒计费。</p>`;
  }
  if (kind === 'tts') {
    html += `<div class="field"><label>音色</label><select data-k="voice">${VOICES.map((v) => `<option ${s.voice === v ? 'selected' : ''}>${v}</option>`).join('')}</select></div>`;
    html += `<div class="field"><label>语气风格<small>可选</small></label><input type="text" data-k="ttsStyle" value="${esc(s.ttsStyle)}" placeholder="如：用温柔开心的语气说"></div>`;
  }
  html += `<div class="sec-title">默认值</div><div style="display:flex;gap:8px;flex-wrap:wrap"><button type="button" class="btn" id="saveDefaults">设为新对话默认</button><button type="button" class="btn" id="resetSettings">恢复出厂</button></div>`;
  $('#panelBody').innerHTML = html;
}
$('#panelBody').addEventListener('input', (e) => {
  const c = state.conv; const el = e.target;
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
  if (e.target.id === 'presetSelect' && e.target.value) {
    const p = state.presets.find((x) => x.id === e.target.value);
    state.conv.systemInstruction = p.content; $('#sysInput').value = p.content; renderComposer();
    if (!state.conv.draft) saveConv();
  }
});
$('#panelBody').addEventListener('click', (e) => {
  const c = state.conv;
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

// ---------------- 设置弹窗 ----------------
let settingsTab = 'prompts', editingPreset = null;
function openSettings(tab = 'prompts') { settingsTab = tab; renderSettings(); $('#settingsDialog').showModal(); }
function renderSettings() {
  $$('#settingsTabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === settingsTab));
  const body = $('#settingsBody');
  if (settingsTab === 'prompts') {
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
    body.innerHTML = `<p>所有对话、生成的图片与视频都只保存在<b>当前浏览器</b>（IndexedDB）里，服务器不留存。</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap"><button type="button" class="btn" id="dExport">导出全部对话（JSON）</button>
      <button type="button" class="btn" id="dImport">导入对话</button><input type="file" id="dImportFile" accept=".json" hidden>
      <button type="button" class="btn danger" id="dClear">清空全部对话</button></div><p class="hint" id="dStat"></p>`;
    navigator.storage?.estimate?.().then((e) => { const el = $('#dStat'); if (el) el.textContent = `共 ${state.convs.length} 个对话，浏览器已用存储约 ${(e.usage / 1048576).toFixed(1)} MB`; });
  } else {
    body.innerHTML = `<div class="about"><p><b>Gemini 体验</b> 是一个基于 Google Vertex AI 的中文多模态工作台：对话、画图、视频、语音一站式体验。</p>
      <p>当前 Google Cloud 项目：<code>${esc(state.project || '')}</code></p>
      <p>凭据只存在服务端，浏览器不会接触到密钥；部署给朋友使用时，建议设置环境变量 <code>ACCESS_PASSWORD</code> 开启访问密码。</p>
      <p>模型列表在服务端 <code>models.js</code> 中维护；也可以在顶部模型菜单底部添加任意 Vertex 模型 ID 尝鲜。</p></div>`;
  }
}
$('#settingsTabs').addEventListener('click', (e) => { const t = e.target.closest('[data-tab]'); if (t) { settingsTab = t.dataset.tab; renderSettings(); } });
$('#settingsBody').addEventListener('click', async (e) => {
  const t = e.target;
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
  if (t.id === 'logout') { state.token = ''; LS.set('token', ''); location.reload(); }
  if (t.id === 'dExport') {
    const blob = new Blob([JSON.stringify({ app: 'gemini-tiyan', version: 1, convs: await dbAll(), presets: state.presets }, null, 0)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `gemini体验-备份-${new Date().toISOString().slice(0, 10)}.json`; a.click();
  }
  if (t.id === 'dImport') $('#dImportFile').click();
  if (t.id === 'dClear') {
    if (!confirm('确定清空全部对话？此操作不可恢复（建议先导出备份）')) return;
    await idb('readwrite', (s) => s.clear()); state.convs = []; openConv(newDraft()); renderSettings();
  }
});
$('#settingsBody').addEventListener('change', async (e) => {
  if (e.target.id === 'gModel') { state.prefs.defaultModel = e.target.value; LS.set('prefs', state.prefs); toast('已更新默认模型'); }
  if (e.target.id === 'dImportFile' && e.target.files[0]) {
    try {
      const j = JSON.parse(await e.target.files[0].text());
      for (const c of j.convs || []) await dbPut(c);
      if (j.presets) { const ids = new Set(state.presets.map((p) => p.id)); state.presets.push(...j.presets.filter((p) => !ids.has(p.id))); LS.set('presets', state.presets); }
      state.convs = await dbAll(); renderConvList(); renderSettings(); toast(`已导入 ${j.convs?.length || 0} 个对话`);
    } catch (err) { toast('导入失败：' + err.message); }
  }
});
$('#openSettings').onclick = () => openSettings();

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

// ---------------- 登录 ----------------
function showLogin() { if (!$('#loginDialog').open) $('#loginDialog').showModal(); setTimeout(() => $('#loginPwd').focus(), 50); }
$('#loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const res = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: $('#loginPwd').value }) });
  const j = await res.json();
  if (!res.ok) { $('#loginErr').textContent = j.error || '登录失败'; return; }
  state.token = j.token; LS.set('token', j.token); $('#loginDialog').close(); toast('欢迎回来');
});
$('#loginDialog').addEventListener('cancel', (e) => e.preventDefault());

// ---------------- 启动 ----------------
applyTheme();
if (LS.get('panelClosed', innerWidth < 1100)) $('#panel').classList.add('closed');
try {
  const cfg = await (await fetch('/api/config')).json();
  state.models = cfg.models; state.needPassword = cfg.needPassword; state.project = cfg.project;
  if (!allModels().some((m) => m.id === state.prefs.defaultModel)) state.prefs.defaultModel = state.models[0]?.id;
  if (cfg.needPassword && !state.token) showLogin();
} catch { toast('无法连接服务端'); }
state.convs = (await dbAll()).sort((a, b) => b.updatedAt - a.updatedAt);
openConv(newDraft(state.prefs.defaultModel));
input.focus();
