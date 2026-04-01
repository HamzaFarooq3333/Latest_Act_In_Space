const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function isRetryableStatus(status) {
  return status === 408 || status === 409 || status === 429 || (status >= 500 && status <= 599);
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const resp = await fetch(url, { ...options, signal: ctrl.signal });
    return resp;
  } finally {
    clearTimeout(id);
  }
}

export async function chatWithFallback({
  apiKey,
  models,
  messages,
  timeoutMs = 9000,
  maxRetriesPerModel = 2,
} = {}) {
  if (!apiKey) throw new Error("missing OPENAI_API_KEY");
  if (!Array.isArray(models) || models.length === 0) throw new Error("no_models_available");
  if (!Array.isArray(messages) || messages.length === 0) throw new Error("no_messages");

  const diagnostics = {
    attempts: [],
    finalModel: null,
    totalAttempts: 0,
  };

  for (const model of models) {
    for (let attempt = 0; attempt <= maxRetriesPerModel; attempt++) {
      diagnostics.totalAttempts++;
      const startedAt = Date.now();
      try {
        const resp = await fetchWithTimeout(
          `${OPENAI_BASE_URL}/chat/completions`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              model,
              messages,
              temperature: 0.2,
            }),
          },
          timeoutMs
        );

        const elapsedMs = Date.now() - startedAt;

        if (!resp.ok) {
          const bodyText = await resp.text().catch(() => "");
          diagnostics.attempts.push({
            model,
            attempt,
            ok: false,
            status: resp.status,
            elapsedMs,
            error: bodyText.slice(0, 220),
          });

          if (isRetryableStatus(resp.status) && attempt < maxRetriesPerModel) {
            await sleep(250 * Math.pow(2, attempt));
            continue;
          }
          break; // switch model
        }

        const json = await resp.json();
        const content = json.choices?.[0]?.message?.content ?? "";
        diagnostics.attempts.push({ model, attempt, ok: true, status: 200, elapsedMs });
        diagnostics.finalModel = model;
        return { content, modelUsed: model, diagnostics };
      } catch (e) {
        const elapsedMs = Date.now() - startedAt;
        const msg = String(e?.message || e);
        diagnostics.attempts.push({ model, attempt, ok: false, status: 0, elapsedMs, error: msg.slice(0, 220) });
        if (attempt < maxRetriesPerModel) {
          await sleep(250 * Math.pow(2, attempt));
          continue;
        }
        break;
      }
    }
  }

  throw new Error("all_models_failed");
}

