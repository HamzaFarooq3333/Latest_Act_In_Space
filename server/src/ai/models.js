const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";

let cached = {
  fetchedAt: 0,
  models: [],
};

function isLikelyChatCapable(modelId) {
  // Heuristic: avoid image/audio/embeddings-only style IDs
  const id = modelId.toLowerCase();
  if (id.includes("embedding")) return false;
  if (id.includes("whisper")) return false;
  if (id.includes("tts")) return false;
  if (id.includes("vision")) return true; // still chat-capable often
  return true;
}

function scoreModel(modelId) {
  const id = modelId.toLowerCase();
  let s = 0;
  // Prefer modern general chat models when available
  if (id.includes("gpt-4")) s += 50;
  if (id.includes("gpt-4o")) s += 60;
  if (id.includes("gpt-4.1")) s += 65;
  if (id.includes("mini")) s += 10;
  if (id.includes("turbo")) s += 8;
  // Penalize obviously legacy / non-chat
  if (id.includes("davinci")) s -= 20;
  if (id.includes("babbage")) s -= 20;
  return s;
}

export async function discoverStandbyModels({ apiKey, standbyCount = 5, cacheTtlMs = 10 * 60 * 1000 } = {}) {
  if (!apiKey) throw new Error("missing OPENAI_API_KEY");

  const now = Date.now();
  if (cached.models.length && now - cached.fetchedAt < cacheTtlMs) {
    return cached.models.slice(0, standbyCount);
  }

  const resp = await fetch(`${OPENAI_BASE_URL}/models`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });
  if (!resp.ok) {
    const t = await resp.text().catch(() => "");
    throw new Error(`model_discovery_failed status=${resp.status} body=${t.slice(0, 200)}`);
  }
  const json = await resp.json();
  const ids = (json.data || []).map((m) => m.id).filter(Boolean);

  const selected = ids
    .filter(isLikelyChatCapable)
    .sort((a, b) => scoreModel(b) - scoreModel(a))
    .slice(0, standbyCount);

  cached = { fetchedAt: now, models: selected };
  return selected;
}

