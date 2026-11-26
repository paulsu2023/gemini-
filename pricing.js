// Vertex AI 官方价格表与消耗估算引擎（前后端共用，单位：USD）
// 价格参考 Google Cloud Vertex AI / Gemini Enterprise 官方定价（2026-11 含促销期与标准期两套费率）
export const USD_TO_CNY = 7.25;

// tokens 单位价格均为 $/1M tokens；imagePerUnit 为无 token 明细时的单张兜底价；videoPerSec 按分辨率计 ($/秒)
export const MODEL_PRICING = {
  // —— 对话与推理 ——
  'gemini-4-argon': {
    promo: { in: 2.0, out: 10.0, cache: 0.1, tag: '官方促销价 (11月底前)' },
    standard: { in: 4.0, out: 20.0, cache: 0.2, tag: '官方标准价 (12/1起)' },
  },
  'gemini-4-carbon': {
    promo: { in: 2.0, out: 10.0, cache: 0.1, tag: '官方促销价 (11月底前)' },
    standard: { in: 4.0, out: 20.0, cache: 0.2, tag: '官方标准价 (12/1起)' },
  },
  'gemini-4-neon': {
    promo: { in: 3.0, out: 15.0, cache: 0.15, tag: '官方标准价 (缓存95%折)' },
    standard: { in: 3.0, out: 15.0, cache: 0.15, tag: '官方标准价 (缓存95%折)' },
  },
  'gemini-4-hydrogen': {
    promo: { in: 1.5, out: 7.5, cache: 0.075, tag: '官方标准价' },
    standard: { in: 1.5, out: 7.5, cache: 0.075, tag: '官方标准价' },
  },
  'gemini-3.8-flash': {
    promo: { in: 0.75, out: 3.75, cache: 0.075, tag: '官方促销价 (年底前)' },
    standard: { in: 1.5, out: 7.5, cache: 0.15, tag: '官方标准价 (1/1起)' },
  },
  'gemini-3.7-flash': {
    promo: { in: 0.75, out: 3.75, cache: 0.075, tag: '官方促销价 (年底前)' },
    standard: { in: 1.5, out: 7.5, cache: 0.15, tag: '官方标准价 (1/1起)' },
  },
  'gemini-3.6-flash': {
    promo: { in: 0.75, out: 3.75, cache: 0.075, tag: '官方促销价 (年底前)' },
    standard: { in: 1.5, out: 7.5, cache: 0.15, tag: '官方标准价 (1/1起)' },
  },
  'gemini-3.5-flash': {
    promo: { in: 1.5, out: 9.0, cache: 0.15, tag: '官方标准价' },
    standard: { in: 1.5, out: 9.0, cache: 0.15, tag: '官方标准价' },
  },
  'gemini-3.5-flash-lite': {
    promo: { in: 0.25, out: 1.5, cache: 0.025, tag: 'Flash-Lite 官方档' },
    standard: { in: 0.25, out: 1.5, cache: 0.025, tag: 'Flash-Lite 官方档' },
  },
  'gemini-3.1-pro-preview': {
    promo: { in: 2.0, out: 12.0, cache: 0.2, tag: '官方预览价' },
    standard: { in: 2.0, out: 12.0, cache: 0.2, tag: '官方标准价' },
  },
  'gemini-3.1-flash-lite': {
    promo: { in: 0.25, out: 1.5, cache: 0.025, tag: '官方标准价' },
    standard: { in: 0.25, out: 1.5, cache: 0.025, tag: '官方标准价' },
  },
  'gemini-3-flash-preview': {
    promo: { in: 0.5, out: 3.0, cache: 0.05, tag: '官方预览估算' },
    standard: { in: 0.75, out: 3.75, cache: 0.075, tag: '官方标准参考' },
  },
  'gemma-4-26b-a4b-it-maas': {
    promo: { in: 0.1, out: 0.4, cache: 0.01, tag: 'MaaS 开源模型参考价' },
    standard: { in: 0.1, out: 0.4, cache: 0.01, tag: 'MaaS 开源模型参考价' },
  },

  // —— 原生画图 ——
  'gemini-nano-banana-2.1': {
    promo: { in: 1.5, out: 30.0, cache: 0.15, imageFallback: 0.034, tag: '官方价 ($30/1M 图token)' },
    standard: { in: 1.5, out: 30.0, cache: 0.15, imageFallback: 0.034, tag: '官方价 ($30/1M 图token)' },
  },
  'gemini-3-pro-image': {
    promo: { in: 2.0, out: 120.0, cache: 0.2, imageFallback: 0.134, tag: '官方价 ($120/1M 图token)' },
    standard: { in: 2.0, out: 120.0, cache: 0.2, imageFallback: 0.134, tag: '官方价 ($120/1M 图token)' },
  },
  'gemini-3.1-flash-image': {
    promo: { in: 0.75, out: 60.0, cache: 0.075, imageFallback: 0.067, tag: '官方价 ($60/1M 图token)' },
    standard: { in: 1.5, out: 60.0, cache: 0.15, imageFallback: 0.067, tag: '官方价 ($60/1M 图token)' },
  },
  'gemini-3.1-flash-lite-image': {
    promo: { in: 0.25, out: 30.0, cache: 0.025, imageFallback: 0.034, tag: '官方价 ($30/1M 图token)' },
    standard: { in: 0.25, out: 30.0, cache: 0.025, imageFallback: 0.034, tag: '官方价 ($30/1M 图token)' },
  },
  'gemini-2.5-flash-image': {
    promo: { in: 0.3, out: 30.0, cache: 0.03, imageFallback: 0.039, tag: '官方价 ($30/1M 图token)' },
    standard: { in: 0.3, out: 30.0, cache: 0.03, imageFallback: 0.039, tag: '官方价 ($30/1M 图token)' },
  },

  // —— 视频生成 ——
  'gemini-omni-1.2-flash': {
    promo: { in: 1.5, out: 12.0, videoPerSec: { '360p': 0.023, '720p': 0.07, '1080p': 0.104, '4k': 0.209 }, tag: '官方换算 (~$0.07/秒 720p)' },
    standard: { in: 1.5, out: 12.0, videoPerSec: { '360p': 0.023, '720p': 0.07, '1080p': 0.104, '4k': 0.209 }, tag: '官方换算 (~$0.07/秒 720p)' },
  },
  'gemini-omni-1.1-flash-preview': {
    promo: { in: 1.5, out: 12.0, videoPerSec: { '360p': 0.023, '720p': 0.07, '1080p': 0.104, '4k': 0.209 }, tag: 'Omni 同档估算 (~$0.07/秒)' },
    standard: { in: 1.5, out: 12.0, videoPerSec: { '360p': 0.023, '720p': 0.07, '1080p': 0.104, '4k': 0.209 }, tag: 'Omni 同档估算 (~$0.07/秒)' },
  },
  'gemini-omni-flash-preview': {
    promo: { in: 1.5, out: 12.0, videoPerSec: { '360p': 0.023, '720p': 0.07, '1080p': 0.104, '4k': 0.209 }, tag: 'Omni 同档估算 (~$0.07/秒)' },
    standard: { in: 1.5, out: 12.0, videoPerSec: { '360p': 0.023, '720p': 0.07, '1080p': 0.104, '4k': 0.209 }, tag: 'Omni 同档估算 (~$0.07/秒)' },
  },
  'veo-3.1-generate-001': {
    promo: { videoPerSec: { '720p': 0.4, '1080p': 0.4, '4k': 0.6 }, tag: '官方价 ($0.40/秒 · 4K $0.60/秒)' },
    standard: { videoPerSec: { '720p': 0.4, '1080p': 0.4, '4k': 0.6 }, tag: '官方价 ($0.40/秒 · 4K $0.60/秒)' },
  },
  'veo-3.1-fast-generate-001': {
    promo: { videoPerSec: { '720p': 0.1, '1080p': 0.12, '4k': 0.3 }, tag: '官方价 ($0.10~$0.12/秒)' },
    standard: { videoPerSec: { '720p': 0.1, '1080p': 0.12, '4k': 0.3 }, tag: '官方价 ($0.10~$0.12/秒)' },
  },
  'veo-3.1-lite-generate-001': {
    promo: { videoPerSec: { '720p': 0.05, '1080p': 0.08, '4k': 0.15 }, tag: '官方价 ($0.05~$0.08/秒)' },
    standard: { videoPerSec: { '720p': 0.05, '1080p': 0.08, '4k': 0.15 }, tag: '官方价 ($0.05~$0.08/秒)' },
  },

  // —— 语音合成 TTS ——
  'gemini-3.8-flash-tts': {
    promo: { in: 1.0, out: 9.0, cache: 0.1, tag: '官方促销价 ($9/1M 音频token)' },
    standard: { in: 1.0, out: 18.0, cache: 0.1, tag: '官方标准价 ($18/1M 音频token)' },
  },
  'gemini-3.8-flash-lite-tts': {
    promo: { in: 0.5, out: 9.0, cache: 0.05, tag: 'TTS Flash 同档' },
    standard: { in: 0.5, out: 18.0, cache: 0.05, tag: 'TTS Flash 同档' },
  },
  'gemini-2.5-pro-tts': {
    promo: { in: 1.0, out: 20.0, cache: 0.1, tag: '2.5 Pro TTS 参考价' },
    standard: { in: 1.0, out: 20.0, cache: 0.1, tag: '2.5 Pro TTS 参考价' },
  },
  'gemini-2.5-flash-tts': {
    promo: { in: 0.5, out: 10.0, cache: 0.05, tag: '2.5 TTS 参考价' },
    standard: { in: 0.5, out: 10.0, cache: 0.05, tag: '2.5 TTS 参考价' },
  },
};

export function getRate(modelId = '', mode = 'promo') {
  const row = MODEL_PRICING[modelId];
  if (row) return row[mode] || row.promo;
  if (/veo.*lite/i.test(modelId)) return MODEL_PRICING['veo-3.1-lite-generate-001'].promo;
  if (/veo.*fast/i.test(modelId)) return MODEL_PRICING['veo-3.1-fast-generate-001'].promo;
  if (/veo/i.test(modelId)) return MODEL_PRICING['veo-3.1-generate-001'].promo;
  if (/omni/i.test(modelId)) return MODEL_PRICING['gemini-omni-1.2-flash'].promo;
  if (/tts/i.test(modelId)) return MODEL_PRICING['gemini-3.8-flash-tts'][mode] || MODEL_PRICING['gemini-3.8-flash-tts'].promo;
  if (/pro.*image/i.test(modelId)) return MODEL_PRICING['gemini-3-pro-image'].promo;
  if (/image|banana/i.test(modelId)) return MODEL_PRICING['gemini-3.1-flash-image'].promo;
  if (/gemini-4/i.test(modelId)) return MODEL_PRICING['gemini-4-carbon'][mode] || MODEL_PRICING['gemini-4-carbon'].promo;
  if (/pro/i.test(modelId)) return MODEL_PRICING['gemini-3.1-pro-preview'].promo;
  if (/lite/i.test(modelId)) return MODEL_PRICING['gemini-3.1-flash-lite'].promo;
  return { in: 0.75, out: 3.75, cache: 0.075, tag: '通用 Flash 估算' };
}

export function calcEventCost(ev, mode = 'promo') {
  const rate = getRate(ev.model, mode);
  if (ev.ok === false && !(ev.totalTokens > 0)) return { usd: 0, rate };

  if (ev.kind === 'video') {
    const secs = Number(ev.videoSeconds) || 0;
    const res = String(ev.resolution || '720p').toLowerCase();
    const perSec = rate.videoPerSec?.[res] ?? rate.videoPerSec?.['720p'] ?? 0.1;
    if (secs > 0) return { usd: secs * perSec, rate };
    if (ev.outputTokens > 0 || ev.promptTokens > 0) {
      const pCost = ((ev.promptTokens || 0) / 1e6) * (rate.in || 1.5);
      const oCost = (((ev.outputTokens || 0) + (ev.thoughtTokens || 0)) / 1e6) * (rate.out || 12);
      return { usd: pCost + oCost, rate };
    }
    return { usd: 0, rate };
  }

  const cached = Math.max(0, Number(ev.cachedTokens) || 0);
  const promptRaw = Math.max(0, Number(ev.promptTokens) || 0);
  const uncachedIn = Math.max(0, promptRaw - cached);
  const outAndThink = Math.max(0, (Number(ev.outputTokens) || 0) + (Number(ev.thoughtTokens) || 0));

  let usd = (uncachedIn / 1e6) * (rate.in || 0)
    + (cached / 1e6) * (rate.cache ?? (rate.in || 0) * 0.1)
    + (outAndThink / 1e6) * (rate.out || 0);

  if (ev.kind === 'image' && usd === 0 && (ev.imageCount || 0) > 0) {
    usd = (ev.imageCount || 0) * (rate.imageFallback || 0.067);
  }
  return { usd, rate };
}

export function formatUnitPrice(modelId, kind, mode = 'promo') {
  const r = getRate(modelId, mode);
  if (kind === 'video' && r.videoPerSec) {
    const p720 = r.videoPerSec['720p'];
    const p4k = r.videoPerSec['4k'];
    return `$${p720}/s` + (p4k && p4k !== p720 ? ` (4K $${p4k}/s)` : '');
  }
  return `$${r.in ?? 0} / $${r.out ?? 0} per 1M`;
}
