// Gemini 体验 —— Vertex AI 代理服务端
// 职责：持有服务账号凭据（绝不下发到浏览器）、自动适配本地系统代理、转发对话/画图/Omni与Veo视频/语音请求、本地+Google云免费层长期记忆存储
import 'dotenv/config';
import express from 'express';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import nodeFetch from 'node-fetch';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { GoogleAuth } from 'google-auth-library';
import { GoogleGenAI } from '@google/genai';
import { MODELS } from './models.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const ACCESS_PASSWORD = process.env.ACCESS_PASSWORD || 'brysj';
const VIDEO_PASSWORD = process.env.VIDEO_PASSWORD || 'hhrhl';
const DEFAULT_REGION = process.env.VERTEX_REGION || 'us-central1';

// ---------- 代理自动探测与挂载（解决国内 Windows 开启系统代理但未设环境变量导致 Node fetch 超时/断连） ----------
function detectWindowsSystemProxy() {
  if (process.platform !== 'win32') return '';
  try {
    const out = execSync('reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings"', { encoding: 'utf8', timeout: 1500 });
    const enabled = /ProxyEnable\s+REG_DWORD\s+0x1\b/i.test(out);
    const server = /ProxyServer\s+REG_SZ\s+([^\r\n]+)/i.exec(out)?.[1]?.trim();
    if (!enabled || !server) return '';
    const hostPort = server.includes('=') ? (/https=([^;]+)/i.exec(server)?.[1] || server.split(';')[0].split('=')[1]) : server;
    return hostPort.startsWith('http') ? hostPort : `http://${hostPort}`;
  } catch { return ''; }
}
async function setupProxyIfAvailable() {
  let proxyUrl = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy || detectWindowsSystemProxy();
  if (!proxyUrl) return;
  try {
    const u = new URL(proxyUrl);
    const ok = await new Promise((resolve) => {
      const sock = net.connect({ host: u.hostname, port: Number(u.port) || 80, timeout: 600 }, () => { sock.destroy(); resolve(true); });
      sock.on('error', () => resolve(false));
      sock.on('timeout', () => { sock.destroy(); resolve(false); });
    });
    if (!ok) return;
    process.env.HTTPS_PROXY = proxyUrl;
    process.env.HTTP_PROXY = proxyUrl;
    const nativeFetch = globalThis.fetch;
    globalThis.fetch = async (input, init = {}) => {
      const rawUrl = typeof input === 'string' ? input : input instanceof URL ? input.href : input?.url || '';
      if (/^https?:\/\/(localhost|127\.0\.0\.1)\b/i.test(rawUrl)) return nativeFetch(input, init);
      let url = input;
      let baseOpts = { ...init };
      if (input && typeof input === 'object' && 'url' in input && !(input instanceof URL)) {
        url = input.url;
        baseOpts = {
          method: input.method,
          headers: Object.fromEntries(input.headers.entries()),
          body: input.body ? Buffer.from(await input.arrayBuffer()) : undefined,
          signal: input.signal || init.signal,
          ...init,
        };
      }
      // 每次请求使用独立非复用连接（避免本地 Clash/代理关闭空闲连接导致 TLS 握手断连），并对瞬态断连自动重试 3 次
      let lastErr;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const agent = new HttpsProxyAgent(proxyUrl, { keepAlive: false });
          const res = await nodeFetch(url, { ...baseOpts, agent });
          if (res.body && !res.body.getReader) {
            return new Response(Readable.toWeb(res.body), {
              status: res.status,
              statusText: res.statusText,
              headers: Object.fromEntries(res.headers.entries()),
            });
          }
          return res;
        } catch (err) {
          lastErr = err;
          if (baseOpts.signal?.aborted) throw err;
          const msg = String(err?.message || err);
          if (attempt < 2 && /socket disconnected|ECONNRESET|ETIMEDOUT|socket hang up|EPIPE|network|fetch failed/i.test(msg)) {
            await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
            continue;
          }
          throw err;
        }
      }
      throw lastErr;
    };
    console.log(`🌐 已启用网络代理（含 TLS 防断连自动重试）：${proxyUrl}`);
  } catch {}
}
await setupProxyIfAvailable();

// ---------- 凭据加载：优先环境变量（线上部署），其次项目内 credentials/service-account.json ----------
function loadCredentials() {
  const raw = process.env.GOOGLE_CREDENTIALS_JSON;
  if (raw) {
    const text = raw.trim().startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
    return JSON.parse(text);
  }
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
const MEMORY_BUCKET = process.env.MEMORY_BUCKET || `${PROJECT}-gemini-memory`;
const googleAuth = new GoogleAuth({ credentials, scopes: ['https://www.googleapis.com/auth/cloud-platform'] });

// 按区域缓存客户端（Gemini 3/4/Omni 在 global，Veo 在 us-central1）
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
function resolveLocation(model, fallback) {
  const m = MODELS.find((x) => x.id === model);
  if (m?.location) return m.location;
  if (/omni/i.test(model)) return 'global';
  return fallback || 'global';
}

// ---------- 访问密码与朋友昵称登录认证（普通朋友口令 brysj，管理员/视频解锁口令 hhrhl） ----------
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || VIDEO_PASSWORD || 'hhrhl';
const tokenOf = (pwd) => crypto.createHash('sha256').update('gemini-tiyan:' + pwd).digest('hex');
const VALID_TOKEN = ACCESS_PASSWORD ? tokenOf(ACCESS_PASSWORD) : '';

function makeUserToken(nickname = 'default', isAdmin = false) {
  const payload = JSON.stringify({ n: String(nickname).trim() || 'default', a: isAdmin ? 1 : 0 });
  const b64 = Buffer.from(payload, 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', 'gemini-tiyan:' + ACCESS_PASSWORD + ':' + ADMIN_PASSWORD).update(b64).digest('hex');
  return `${b64}.${sig}`;
}

function parseUserToken(token = '') {
  if (!ACCESS_PASSWORD) return { ok: true, nickname: 'default', isAdmin: true };
  if (!token) return { ok: false };
  if (token.includes('.')) {
    const [b64, sig] = token.split('.');
    const expected1 = crypto.createHmac('sha256', 'gemini-tiyan:' + ACCESS_PASSWORD + ':' + ADMIN_PASSWORD).update(b64 || '').digest('hex');
    const expectedLegacy = crypto.createHmac('sha256', 'gemini-tiyan:' + ACCESS_PASSWORD).update(b64 || '').digest('hex');
    const match1 = sig && sig.length === expected1.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected1));
    const matchLegacy = !match1 && sig && sig.length === expectedLegacy.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedLegacy));
    if (match1 || matchLegacy) {
      const raw = Buffer.from(b64, 'base64url').toString('utf8') || 'default';
      if (raw.startsWith('{')) {
        try {
          const obj = JSON.parse(raw);
          return { ok: true, nickname: obj.n || 'default', isAdmin: !!obj.a };
        } catch {}
      }
      return { ok: true, nickname: raw, isAdmin: false };
    }
    return { ok: false };
  }
  if (token.length === VALID_TOKEN.length && crypto.timingSafeEqual(Buffer.from(token), Buffer.from(VALID_TOKEN))) {
    return { ok: true, nickname: 'default', isAdmin: false };
  }
  return { ok: false };
}

// 判断是否为本机 localhost / 127.0.0.1 直接访问（本机主人自用免登录、免密码、免视频密码、直享管理员权限）
function isLocalDirectRequest(req) {
  if (process.env.VERCEL || process.env.REQUIRE_VIDEO_PASSWORD === '1') return false;
  if (req.get('cf-ray') || req.get('cf-connecting-ip') || req.get('x-forwarded-for')) return false;
  const host = (req.get('x-forwarded-host') || req.get('host') || '').toLowerCase();
  const origin = (req.get('origin') || req.get('referer') || '').toLowerCase();
  if (origin && !/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/|$)/.test(origin)) return false;
  return /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host);
}

function auth(req, res, next) {
  if (isLocalDirectRequest(req)) {
    const headerNick = req.get('x-user-nickname') ? decodeURIComponent(req.get('x-user-nickname')) : '';
    req.userNickname = (headerNick || 'default').trim();
    req.isAdmin = true;
    return next();
  }
  const t = req.get('x-access-token') || req.query.token || '';
  const parsed = parseUserToken(t);
  if (!parsed.ok) return res.status(401).json({ error: '请先输入昵称与访问密码登录' });
  const headerNick = req.get('x-user-nickname') ? decodeURIComponent(req.get('x-user-nickname')) : '';
  req.userNickname = (headerNick || parsed.nickname || 'default').trim();
  req.isAdmin = !!parsed.isAdmin || (req.get('x-admin-password') === ADMIN_PASSWORD);
  const u = usersRegistry.users?.[safeUserKey(req.userNickname)];
  if (u?.blocked && !req.isAdmin) return res.status(403).json({ error: `昵称「${req.userNickname}」已被管理员停用` });
  next();
}

// 管理员专属权限校验：仅允许本机 localhost 直连，或携带管理员密码 (hhrhl) 的请求访问
function adminAuth(req, res, next) {
  auth(req, res, () => {
    if (req.isAdmin || isLocalDirectRequest(req) || req.get('x-admin-password') === ADMIN_PASSWORD) {
      return next();
    }
    return res.status(403).json({ error: '仅管理员可访问用户管理后台（需管理员口令）', needAdminPassword: true });
  });
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

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/api/config', (req, res) => {
  const isLocal = isLocalDirectRequest(req);
  res.json({
    needPassword: !isLocal && !!ACCESS_PASSWORD,
    requireNickname: !isLocal,
    needVideoPassword: !isLocal,
    isAdmin: isLocal,
    project: PROJECT,
    memoryBucket: MEMORY_BUCKET,
    models: MODELS,
  });
});

const errMsg = (e) => {
  const s = String(e?.message || e);
  try { const j = JSON.parse(s); return j.error?.message || s; } catch { return s; }
};

// ---------- 长期记忆与云端同步（本地 data/ 目录 + Google Cloud Storage US-CENTRAL1 永久免费层） ----------
let LOCAL_MEM_DIR = path.join(__dirname, 'data', 'memories');
try {
  fs.mkdirSync(LOCAL_MEM_DIR, { recursive: true });
} catch {
  LOCAL_MEM_DIR = path.join(os.tmpdir(), 'gemini-tiyan-memories');
  try { fs.mkdirSync(LOCAL_MEM_DIR, { recursive: true }); } catch {}
}
const LOCAL_USERS_FILE = path.join(path.dirname(LOCAL_MEM_DIR), 'users.json');

function safeUserKey(raw = 'default') {
  const s = String(raw || 'default').trim().toLowerCase().slice(0, 64);
  if (!s) return 'default';
  // 允许中文/字母/数字/下划线/短横线，同时附带短哈希避免碰撞或路径穿越
  const clean = s.replace(/[^a-z0-9_\-\u4e00-\u9fa5]/g, '_');
  const hash = crypto.createHash('sha1').update(s).digest('hex').slice(0, 8);
  return s === 'default' ? 'default' : `${clean}-${hash}`;
}

let bucketReady = false;
async function ensureMemoryBucket(token) {
  if (bucketReady) return;
  const check = await fetch(`https://storage.googleapis.com/storage/v1/b/${ encodeURIComponent(MEMORY_BUCKET) }`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (check.status === 200) { bucketReady = true; return; }
  if (check.status === 404) {
    const create = await fetch(`https://storage.googleapis.com/storage/v1/b?project=${encodeURIComponent(PROJECT)}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: MEMORY_BUCKET,
        location: 'US-CENTRAL1',
        storageClass: 'STANDARD',
        iamConfiguration: { uniformBucketLevelAccess: { enabled: true }, publicAccessPrevention: 'enforced' },
      }),
    });
    if (create.ok || create.status === 409) bucketReady = true;
  }
}

async function gcsReadJson(objectName) {
  const token = await googleAuth.getAccessToken();
  await ensureMemoryBucket(token);
  const url = `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(MEMORY_BUCKET)}/o/${encodeURIComponent(objectName)}?alt=media`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`GCS 读取失败 (${r.status})`);
  return JSON.parse(await r.text());
}

async function gcsWriteJson(objectName, data) {
  const token = await googleAuth.getAccessToken();
  await ensureMemoryBucket(token);
  const url = `https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(MEMORY_BUCKET)}/o?uploadType=media&name=${encodeURIComponent(objectName)}`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(data),
  });
  if (!r.ok) throw new Error(`GCS 写入失败 (${r.status})`);
}

// ---------- 用户登记与用量管理中心（本地 data/users.json + GCS admin/users.json 双重持久化） ----------
let usersRegistry = { users: {}, updatedAt: 0 };
try {
  if (fs.existsSync(LOCAL_USERS_FILE)) usersRegistry = JSON.parse(fs.readFileSync(LOCAL_USERS_FILE, 'utf8'));
} catch {}

function saveLocalUsers() {
  try { fs.writeFileSync(LOCAL_USERS_FILE, JSON.stringify(usersRegistry, null, 2), 'utf8'); } catch {}
}

function mergeUserEntry(a = {}, b = {}) {
  const newerBlock = (b.blockedUpdatedAt || 0) > (a.blockedUpdatedAt || 0) ? b : a;
  const newerAct = (b.lastActiveAt || 0) >= (a.lastActiveAt || 0) ? b : a;
  return {
    nickname: newerAct.nickname || a.nickname || b.nickname || '未命名',
    userKey: a.userKey || b.userKey,
    firstSeenAt: Math.min(a.firstSeenAt || Infinity, b.firstSeenAt || Infinity) === Infinity ? Date.now() : Math.min(a.firstSeenAt || Infinity, b.firstSeenAt || Infinity),
    lastLoginAt: Math.max(a.lastLoginAt || 0, b.lastLoginAt || 0),
    lastActiveAt: Math.max(a.lastActiveAt || 0, b.lastActiveAt || 0),
    loginCount: Math.max(a.loginCount || 0, b.loginCount || 0),
    chatCount: Math.max(a.chatCount || 0, b.chatCount || 0),
    imageCount: Math.max(a.imageCount || 0, b.imageCount || 0),
    videoCount: Math.max(a.videoCount || 0, b.videoCount || 0),
    ttsCount: Math.max(a.ttsCount || 0, b.ttsCount || 0),
    lastModel: newerAct.lastModel || a.lastModel || b.lastModel || '',
    lastPromptPreview: newerAct.lastPromptPreview || a.lastPromptPreview || b.lastPromptPreview || '',
    blocked: !!newerBlock.blocked,
    blockedUpdatedAt: Math.max(a.blockedUpdatedAt || 0, b.blockedUpdatedAt || 0),
  };
}

async function syncUsersFromCloud() {
  try {
    const cloud = await gcsReadJson('admin/users.json');
    if (cloud?.users) {
      const merged = { ...usersRegistry.users };
      const deleted = new Set(cloud.deletedKeys || []);
      for (const [k, v] of Object.entries(cloud.users)) {
        if (deleted.has(k)) continue;
        merged[k] = merged[k] ? mergeUserEntry(merged[k], v) : v;
      }
      usersRegistry.users = merged;
      usersRegistry.deletedKeys = [...deleted];
      usersRegistry.updatedAt = Math.max(usersRegistry.updatedAt || 0, cloud.updatedAt || 0);
      saveLocalUsers();
    }
  } catch {}
  return usersRegistry;
}

let persistTimer = null;
async function persistUsersToCloud(immediate = false) {
  saveLocalUsers();
  if (immediate || process.env.VERCEL) {
    try { await gcsWriteJson('admin/users.json', usersRegistry); } catch {}
    return;
  }
  clearTimeout(persistTimer);
  persistTimer = setTimeout(async () => {
    try { await gcsWriteJson('admin/users.json', usersRegistry); } catch {}
  }, 4000);
}

async function recordUserActivity(rawNickname, event = {}, immediate = false) {
  const nickname = String(rawNickname || 'default').trim().slice(0, 32) || 'default';
  const userKey = safeUserKey(nickname);
  if (!usersRegistry.users) usersRegistry.users = {};
  const now = Date.now();
  const cur = usersRegistry.users[userKey] || {
    nickname, userKey, firstSeenAt: now, lastLoginAt: now, lastActiveAt: now,
    loginCount: 0, chatCount: 0, imageCount: 0, videoCount: 0, ttsCount: 0,
    lastModel: '', lastPromptPreview: '', blocked: false, blockedUpdatedAt: 0,
  };
  cur.nickname = nickname;
  cur.lastActiveAt = now;
  if (event.type === 'login') { cur.loginCount = (cur.loginCount || 0) + 1; cur.lastLoginAt = now; }
  if (event.type === 'chat') cur.chatCount = (cur.chatCount || 0) + 1;
  if (event.type === 'image') cur.imageCount = (cur.imageCount || 0) + 1;
  if (event.type === 'video') cur.videoCount = (cur.videoCount || 0) + 1;
  if (event.type === 'tts') cur.ttsCount = (cur.ttsCount || 0) + 1;
  if (event.model) cur.lastModel = event.model;
  if (event.preview) cur.lastPromptPreview = String(event.preview).replace(/\s+/g, ' ').trim().slice(0, 80);
  usersRegistry.users[userKey] = cur;
  usersRegistry.updatedAt = now;
  await persistUsersToCloud(immediate);
  return cur;
}

// 启动时后台拉取一次云端用户账本并预热 OAuth2 令牌
syncUsersFromCloud();
googleAuth.getAccessToken().catch(() => {});

app.post('/api/login', async (req, res) => {
  const nickname = String(req.body?.nickname || '').trim().slice(0, 32);
  const password = String(req.body?.password || '');
  if (!nickname) return res.status(400).json({ error: '请先填写你的昵称（方便为你独立保存记忆与对话）' });
  const isAdmin = password === ADMIN_PASSWORD;
  if (ACCESS_PASSWORD && password !== ACCESS_PASSWORD && !isAdmin) {
    return res.status(401).json({ error: '访问密码错误，请输入正确的口令' });
  }
  await syncUsersFromCloud();
  const userKey = safeUserKey(nickname);
  if (usersRegistry.users?.[userKey]?.blocked && !isAdmin) {
    return res.status(403).json({ error: `昵称「${nickname}」已被管理员停用` });
  }
  const entry = await recordUserActivity(nickname, { type: 'login' }, true);
  res.json({ token: makeUserToken(nickname, isAdmin), nickname: entry.nickname, userKey, isAdmin });
});

// 管理员专属口令校验接口：允许在线已登录用户通过输入管理员密码 (hhrhl) 解锁管理权限
app.post('/api/admin/unlock', auth, (req, res) => {
  const pwd = String(req.body?.password || '').trim();
  if (req.isAdmin || isLocalDirectRequest(req) || pwd === ADMIN_PASSWORD) {
    return res.json({ ok: true, isAdmin: true });
  }
  res.status(403).json({ error: '管理员密码错误' });
});

// 管理员专属接口：查看全部朋友列表及实时用量统计（仅限本机 localhost 或管理员口令 hhrhl 访问）
app.get('/api/admin/users', adminAuth, async (req, res) => {
  try {
    await syncUsersFromCloud();
    const list = Object.values(usersRegistry.users || {}).sort((a, b) => (b.lastActiveAt || 0) - (a.lastActiveAt || 0));
    res.json({
      users: list,
      accessPassword: ACCESS_PASSWORD,
      bucket: MEMORY_BUCKET,
      updatedAt: usersRegistry.updatedAt || Date.now(),
    });
  } catch (e) { res.status(500).json({ error: errMsg(e) }); }
});

// 管理员专属接口：停用/启用或删除某个用户
app.post('/api/admin/user-action', adminAuth, async (req, res) => {
  try {
    const { userKey, action } = req.body || {};
    await syncUsersFromCloud();
    const u = usersRegistry.users?.[userKey];
    if (!u) return res.status(404).json({ error: '未找到该用户' });
    if (action === 'toggleBlock') {
      u.blocked = !u.blocked;
      u.blockedUpdatedAt = Date.now();
      usersRegistry.updatedAt = Date.now();
      await persistUsersToCloud(true);
      return res.json({ ok: true, user: u });
    }
    if (action === 'deleteUser') {
      delete usersRegistry.users[userKey];
      usersRegistry.deletedKeys = [...new Set([...(usersRegistry.deletedKeys || []), userKey])];
      usersRegistry.updatedAt = Date.now();
      await persistUsersToCloud(true);
      return res.json({ ok: true });
    }
    res.status(400).json({ error: '未知操作' });
  } catch (e) { res.status(500).json({ error: errMsg(e) }); }
});

function readLocalMemory(userKey) {
  const f = path.join(LOCAL_MEM_DIR, `${userKey}.json`);
  if (!fs.existsSync(f)) return null;
  try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; }
}
function writeLocalMemory(userKey, payload) {
  const f = path.join(LOCAL_MEM_DIR, `${userKey}.json`);
  fs.writeFileSync(f, JSON.stringify(payload, null, 2), 'utf8');
}

// 读取记忆（合并本地文件与 Google Cloud 免费存储中较新的版本；非管理员仅允许读取自己昵称的记忆）
app.get('/api/memory', auth, async (req, res) => {
  const targetUser = req.isAdmin ? (req.query.user || req.userNickname) : req.userNickname;
  const userKey = safeUserKey(targetUser);
  const cloud = req.query.cloud !== '0';
  let localData = readLocalMemory(userKey);
  let cloudData = null;
  let cloudOk = false;
  if (cloud) {
    try {
      cloudData = await gcsReadJson(`memories/${userKey}.json`);
      cloudOk = true;
    } catch {}
  }
  const chosen = (cloudData?.updatedAt || 0) > (localData?.updatedAt || 0) ? cloudData : (localData || cloudData || { memories: [], updatedAt: 0 });
  if (chosen && chosen === cloudData) writeLocalMemory(userKey, chosen);
  res.json({
    userKey,
    memories: chosen.memories || [],
    updatedAt: chosen.updatedAt || 0,
    cloudOk,
    bucket: MEMORY_BUCKET,
  });
});

// 保存记忆（同时写本地文件 + Google Cloud Storage 免费桶；非管理员仅允许写入自己昵称的记忆）
app.post('/api/memory', auth, async (req, res) => {
  try {
    const targetUser = req.isAdmin ? (req.body?.user || req.userNickname) : req.userNickname;
    const userKey = safeUserKey(targetUser);
    const memories = Array.isArray(req.body?.memories) ? req.body.memories : [];
    const syncCloud = req.body?.syncCloud !== false;
    const payload = { userKey, memories, updatedAt: Date.now() };
    writeLocalMemory(userKey, payload);
    let cloudOk = false, cloudErr = '';
    if (syncCloud) {
      try {
        await gcsWriteJson(`memories/${userKey}.json`, payload);
        cloudOk = true;
      } catch (e) { cloudErr = errMsg(e); }
    }
    res.json({ ok: true, userKey, updatedAt: payload.updatedAt, cloudOk, cloudErr, bucket: MEMORY_BUCKET });
  } catch (e) { res.status(500).json({ error: errMsg(e) }); }
});

// 从对话自动提炼长期记忆（调用轻量快速的 gemini-3.5-flash-lite）
app.post('/api/memory/extract', auth, async (req, res) => {
  try {
    const { messages = [], existing = [] } = req.body || {};
    const snippet = messages.slice(-8).map((m) => `${m.role === 'user' ? '用户' : 'AI'}：${m.text || ''}`).join('\n');
    const existingList = existing.map((m, i) => `${i + 1}. ${m.content}`).join('\n') || '（暂无）';
    const prompt = `你是一个“用户长期记忆提炼器”。请阅读以下近期对话，判断用户是否透露了值得在未来跨对话中长期记住的个人信息（例如：姓名/称呼、职业/业务领域、技术栈、语言或排版偏好、固定工作流、明确要求“记住…”的事项）。
已有记忆：
${existingList}

近期对话：
${snippet}

规则：
1. 只提取关于【用户本人】的稳定事实、长期偏好或明确指令；不要提取单次临时任务内容或常识。
2. 与“已有记忆”语义重复的不要重复提取。
3. 每条记忆用简短精炼的一句话陈述（例如：“用户从事跨境电商业务，偏好直接给出可落地的方案”）。
4. 若没有任何值得新增的长期记忆，返回空数组。
请严格返回 JSON 格式：{"added": ["记忆1", "记忆2"]}`;

    const r = await client('global').models.generateContent({
      model: 'gemini-3.5-flash-lite',
      contents: prompt,
      config: { responseMimeType: 'application/json', temperature: 0.2 },
    });
    const parsed = JSON.parse(r.text || '{"added":[]}');
    const added = (Array.isArray(parsed.added) ? parsed.added : []).map((s) => String(s).trim()).filter(Boolean);
    res.json({ added });
  } catch (e) { res.status(500).json({ error: errMsg(e) }); }
});

// 云端同步历史对话（将轻量对话记录同步到 Google Cloud Storage 免费桶；非管理员仅允许读写自己昵称的数据）
app.get('/api/cloud-convs', auth, async (req, res) => {
  try {
    const targetUser = req.isAdmin ? (req.query.user || req.userNickname) : req.userNickname;
    const userKey = safeUserKey(targetUser);
    const data = await gcsReadJson(`convs/${userKey}.json`);
    res.json({ userKey, convs: data?.convs || [], updatedAt: data?.updatedAt || 0 });
  } catch (e) { res.status(500).json({ error: errMsg(e) }); }
});

app.post('/api/cloud-convs', auth, async (req, res) => {
  try {
    const targetUser = req.isAdmin ? (req.body?.user || req.userNickname) : req.userNickname;
    const userKey = safeUserKey(targetUser);
    // 为节省免费额度，云端备份剔除超大体积的 base64 视频/图片二进制，仅保留全部文本对话与设定
    const rawConvs = Array.isArray(req.body?.convs) ? req.body.convs : [];
    const slimConvs = rawConvs.slice(0, 100).map((c) => ({
      ...c,
      messages: (c.messages || []).map((m) => ({
        ...m,
        parts: (m.parts || []).map((p) => (p.inlineData && p.inlineData.data?.length > 120_000)
          ? { text: `[媒体文件 ${p.inlineData.mimeType}，保存在原设备本地]` }
          : p),
      })),
    }));
    const payload = { userKey, convs: slimConvs, updatedAt: Date.now() };
    await gcsWriteJson(`convs/${userKey}.json`, payload);
    res.json({ ok: true, userKey, count: slimConvs.length, updatedAt: payload.updatedAt });
  } catch (e) { res.status(500).json({ error: errMsg(e) }); }
});

// ---------- 对话 / Gemini 原生画图（流式 SSE） ----------
// 历史里的思考文本（thought:true）不回传，但要保留 thoughtSignature（Gemini 3/4 多轮必需）
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
  const model = body.model || '';
  const cfg = {};
  if (body.systemInstruction?.trim()) cfg.systemInstruction = body.systemInstruction;
  for (const k of ['temperature', 'topP', 'topK', 'maxOutputTokens', 'seed', 'presencePenalty', 'frequencyPenalty']) {
    if (s[k] !== undefined && s[k] !== null && s[k] !== '') cfg[k] = Number(s[k]);
  }
  if (s.stopSequences?.length) cfg.stopSequences = s.stopSequences;
  if (body.kind !== 'image') {
    const isG4 = /^gemini-4-/i.test(model);
    const noMinimal = isG4 || /pro/i.test(model);
    let level = s.thinkingLevel && s.thinkingLevel !== 'auto' ? s.thinkingLevel.toUpperCase() : (isG4 ? 'LOW' : null);
    if (level === 'MINIMAL' && noMinimal) level = 'LOW';
    if (level) cfg.thinkingConfig = { thinkingLevel: level };
    if (s.includeThoughts) cfg.thinkingConfig = { ...(cfg.thinkingConfig || {}), includeThoughts: true };
  } else if (s.includeThoughts) {
    cfg.thinkingConfig = { includeThoughts: true };
  }
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
    const lastUserPart = [...(req.body.contents || [])].reverse().find((c) => c.role === 'user')?.parts?.find((p) => p.text)?.text || '';
    const location = resolveLocation(model, req.body.location);
    const config = { ...buildConfig(req.body), abortSignal: abort.signal };
    const cleaned = cleanContents(req.body.contents);

    let usage = null, grounding = null, finishReason = null, emitted = false, lastErr = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const stream = await client(location).models.generateContentStream({
          model, contents: cleaned, config,
        });
        for await (const chunk of stream) {
          const cand = chunk.candidates?.[0];
          for (const p of cand?.content?.parts || []) { emitted = true; send('part', p); }
          if (cand?.groundingMetadata) grounding = cand.groundingMetadata;
          if (cand?.finishReason) finishReason = cand.finishReason;
          if (chunk.usageMetadata) usage = chunk.usageMetadata;
          if (chunk.promptFeedback?.blockReason) send('error', { message: '请求被安全策略拦截：' + chunk.promptFeedback.blockReason });
        }
        lastErr = null;
        break;
      } catch (err) {
        lastErr = err;
        const msg = String(err?.message || err);
        if (!emitted && !abort.signal.aborted && attempt < 2 && /socket disconnected|ECONNRESET|ETIMEDOUT|socket hang up|oauth2|fetch failed/i.test(msg)) {
          await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
          continue;
        }
        throw err;
      }
    }
    if (lastErr) throw lastErr;
    send('done', { usage, grounding, finishReason });
    recordUserActivity(req.userNickname, {
      type: req.body.kind === 'image' ? 'image' : 'chat',
      model,
      preview: lastUserPart,
    });
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
    recordUserActivity(req.userNickname, { type: 'tts', model, preview: text });
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

// ---------- 视频生成：同时支持 Gemini Omni (Interactions API) 与 Veo 3.1 (generateVideos) ----------
const videoOps = new Map(); // id -> { kind: 'omni'|'veo', op?, result?, error?, done?, location, createdAt }

function isOmniVideoModel(model = '') {
  const m = MODELS.find((x) => x.id === model);
  return m?.api === 'interactions' || /omni/i.test(model);
}

app.post('/api/video', auth, async (req, res) => {
  try {
    if (!isLocalDirectRequest(req)) {
      const vpwd = String(req.body?.videoPassword || req.get('x-video-password') || '').trim();
      if (vpwd !== VIDEO_PASSWORD) {
        return res.status(403).json({
          error: '线上环境已限制视频生成，请输入视频专属密码解锁',
          needVideoPassword: true,
        });
      }
    }
    const { model, prompt = '', image, lastFrame, images = [], settings = {} } = req.body;
    recordUserActivity(req.userNickname, { type: 'video', model, preview: prompt });
    const id = crypto.randomUUID();

    // 通道 A：Gemini Omni 视频模型（Vertex AI Interactions API，global 区域）
    if (isOmniVideoModel(model)) {
      const location = resolveLocation(model, 'global');
      const specParts = [];
      if (settings.aspectRatio) specParts.push(`aspect ratio ${settings.aspectRatio}`);
      if (settings.durationSeconds) specParts.push(`duration ${settings.durationSeconds} seconds`);
      if (settings.resolution) specParts.push(`${settings.resolution} resolution`);
      if (settings.generateAudio === false) specParts.push('silent video without audio');
      else specParts.push('with synchronized audio');
      let fullPrompt = prompt.trim();
      if (specParts.length) fullPrompt = `${fullPrompt}\n[Output specification: ${specParts.join(', ')}]`.trim();
      if (settings.negativePrompt?.trim()) fullPrompt += `\n[Negative constraints: avoid ${settings.negativePrompt.trim()}]`;

      const refImgs = images.length ? images : [image, lastFrame].filter(Boolean);
      const input = refImgs.length
        ? [
            ...refImgs.map((img) => ({ type: 'image', data: img.data, mimeType: img.mimeType, mime_type: img.mimeType })),
            ...(fullPrompt ? [{ type: 'text', text: fullPrompt }] : []),
          ]
        : fullPrompt;

      const job = { kind: 'omni', done: false, videos: null, error: null, createdAt: Date.now() };
      videoOps.set(id, job);

      // 后台异步执行 Interactions API 视频生成，前端统一通过 /api/video/:id 轮询进度
      (async () => {
        try {
          const params = { model, input };
          if (settings.seed) params.generation_config = { seed: Number(settings.seed) };
          const r = await client(location).interactions.create(params);
          const vids = [];
          if (r.output_video?.data || r.output_video?.uri) {
            vids.push({ mimeType: r.output_video.mime_type || 'video/mp4', data: r.output_video.data, uri: r.output_video.uri });
          } else {
            for (const step of r.steps || []) {
              for (const c of step.content || []) {
                if (c.type === 'video' && (c.data || c.uri)) {
                  vids.push({ mimeType: c.mime_type || 'video/mp4', data: c.data, uri: c.uri });
                }
              }
            }
          }
          if (!vids.length) {
            const errStep = (r.steps || []).find((s) => s.error)?.error?.message;
            job.error = errStep || r.output_text || '模型未返回视频（可能被安全策略过滤）';
          } else {
            job.videos = vids;
          }
        } catch (e) {
          job.error = errMsg(e);
        } finally {
          job.done = true;
        }
      })();

      return res.json({ id });
    }

    // 通道 B：Veo 3.1 视频模型（Vertex AI generateVideos Long-Running Operation，us-central1 区域）
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
    videoOps.set(id, { kind: 'veo', op, location, createdAt: Date.now() });
    res.json({ id });
  } catch (e) { res.status(500).json({ error: errMsg(e) }); }
});

app.get('/api/video/:id', auth, async (req, res) => {
  const job = videoOps.get(req.params.id);
  if (!job) return res.status(404).json({ error: '任务不存在（服务可能已重启）' });
  const elapsed = Math.round((Date.now() - job.createdAt) / 1000);
  try {
    if (job.kind === 'omni') {
      if (!job.done) return res.json({ done: false, elapsed });
      videoOps.delete(req.params.id);
      if (job.error) return res.json({ done: true, error: job.error });
      return res.json({ done: true, videos: job.videos });
    }
    job.op = await client(job.location).operations.getVideosOperation({ operation: job.op });
    if (!job.op.done) return res.json({ done: false, elapsed });
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

if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`✨ Gemini 体验已启动：http://localhost:${PORT}  （项目 ${PROJECT}${ACCESS_PASSWORD ? '，已开启访问密码' : ''}）`);
  });
}

export default app;
