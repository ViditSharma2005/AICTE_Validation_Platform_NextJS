/* Portal assistant.
   Default mode ("local"): keyword retrieval over the built-in portal guide
   (lib/kb.js) — answers with zero configuration and no API key.
   Optional modes ("gemini" | "grok"): the retrieved guide chunks are sent
   as grounding context to the model; any provider error falls back to the
   local answer. Keys are read from server environment variables only. */
import { KB, GREETING, FALLBACK } from "./kb.js";

const STOP = new Set([
  "the", "a", "an", "is", "are", "was", "were", "i", "me", "my", "we", "our",
  "to", "of", "in", "on", "for", "and", "or", "it", "this", "that", "do",
  "does", "how", "what", "where", "when", "why", "can", "cant", "not", "no",
  "please", "tell", "show", "with", "from", "about", "there", "here",
]);

function tokens(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((w) => w.length > 2 && !STOP.has(w));
}

function retrieve(question, topN = 3) {
  const q = new Set(tokens(question));
  if (!q.size) return [];
  return KB.map((chunk) => {
    let score = 0;
    const kw = new Set(tokens(chunk.keywords));
    const title = new Set(tokens(chunk.title));
    for (const w of q) {
      if (kw.has(w)) score += 3;
      if (title.has(w)) score += 2;
    }
    // phrase bonus: full question words appearing in the answer body
    const body = chunk.text.toLowerCase();
    for (const w of q) if (body.includes(w)) score += 1;
    return { chunk, score };
  })
    .filter((r) => r.score > 0)
    .sort((x, y) => y.score - x.score)
    .slice(0, topN);
}

function localAnswer(question) {
  const hits = retrieve(question);
  if (!hits.length) return { reply: FALLBACK, links: [{ label: "Open Help and FAQs", href: "#/help" }] };
  const top = hits[0].chunk;
  let reply = top.text;
  // If a second chunk scored nearly as well, append its first line as a pointer.
  if (hits[1] && hits[1].score >= hits[0].score - 2 && hits[1].chunk.id !== top.id) {
    reply += `\n\nRelated: ${hits[1].chunk.title} — ask me about that if you need the details.`;
  }
  return { reply, links: top.links || [] };
}

const SYSTEM = `You are the help assistant on the AICTE Application Validation and Compliance Portal (Extension of Approval).
Answer ONLY from the portal guide context given below. Give short, numbered steps and name the exact page, menu or button.
If the guide does not cover the question, say so plainly and point the user to the Help page.
Write formal, plain English. Do not invent rules, fees, dates or account details that are not in the guide.`;

async function callProvider(provider, question, hits) {
  const context = hits.map((h) => `## ${h.chunk.title}\n${h.chunk.text}`).join("\n\n") || "(no guide section matched)";
  const userText = `Portal guide context:\n${context}\n\nUser question: ${question}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    if (provider === "gemini") {
      const key = process.env.GEMINI_API_KEY;
      const model = process.env.GEMINI_MODEL || "gemini-2.0-flash";
      if (!key) return null;
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: SYSTEM }] },
            contents: [{ role: "user", parts: [{ text: userText }] }],
            generationConfig: { temperature: 0.2, maxOutputTokens: 700 },
          }),
          signal: ctrl.signal,
        }
      );
      if (!res.ok) return null;
      const data = await res.json();
      return data?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("").trim() || null;
    }
    if (provider === "grok") {
      const key = process.env.XAI_API_KEY;
      const model = process.env.XAI_MODEL || "grok-3-mini";
      if (!key) return null;
      const res = await fetch("https://api.x.ai/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: SYSTEM },
            { role: "user", content: userText },
          ],
          temperature: 0.2,
          max_tokens: 700,
        }),
        signal: ctrl.signal,
      });
      if (!res.ok) return null;
      const data = await res.json();
      return data?.choices?.[0]?.message?.content?.trim() || null;
    }
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
  return null;
}

export async function answerChat(body) {
  const question = String(body?.message || "").trim().slice(0, 1000);
  if (!question) return { reply: GREETING, links: [], source: "local" };
  const greet = /^(hi|hello|hey|namaste|namaskar)\b/i.test(question) && question.length < 24;

  const hits = retrieve(question);
  const provider = (process.env.CHAT_PROVIDER || "local").toLowerCase();
  if (provider === "gemini" || provider === "grok") {
    const reply = await callProvider(provider, question, hits);
    if (reply) {
      return { reply, links: hits[0]?.chunk.links || [], source: provider };
    }
    // fall through to the grounded local answer on any provider failure
  }
  const local = localAnswer(question);
  return {
    reply: greet ? GREETING + "\n\n" + local.reply : local.reply,
    links: local.links,
    source: "local",
  };
}
