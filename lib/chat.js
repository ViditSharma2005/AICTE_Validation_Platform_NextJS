/* Portal assistant.
   Default mode ("local"): keyword retrieval over the built-in bilingual portal
   guide (lib/kb.js + lib/kb.hi.js) — answers with zero configuration and no
   API key. Optional modes ("gemini" | "grok"): the retrieved guide chunks are
   sent as grounding context and the model must answer in the requested
   language; any provider error falls back to the local answer. Keys are read
   from server environment variables only. */
import { chunksFor, GREETING, GREETING_HI, FALLBACK, FALLBACK_HI } from "./kb.js";

const STOP = new Set([
  // English function words
  "the", "a", "an", "is", "are", "was", "were", "i", "me", "my", "we", "our",
  "to", "of", "in", "on", "for", "and", "or", "it", "this", "that", "do",
  "does", "how", "what", "where", "when", "why", "can", "cant", "not", "no",
  "please", "tell", "show", "with", "from", "about", "there", "here",
  // Hindi function words (Devanagari and transliterated)
  "है", "हैं", "का", "की", "के", "को", "में", "से", "पर", "और", "या", "यह",
  "वह", "कि", "कैसे", "क्या", "कौन", "कहाँ", "कब", "क्यों", "कर", "करें",
  "कैसा", "कैसी", "मुझे", "मैं", "हम", "आप", "एक", "भी", "तो", "हो", "हुआ",
  "गया", "गई", "जा", "जाए", "जाएँ", "लिए", "साथ", "अब", "यहाँ", "वहाँ",
  "batao", "bataiye", "kaise", "kya", "hai", "hain", "ka", "ki", "ke", "ko",
  "mein", "se", "par", "aur", "ya",
]);

/* Unicode-aware tokeniser: Devanagari, Latin, digits and combining marks all
   survive, so Hindi questions retrieve Hindi chunks correctly. */
function tokens(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFC")
    .replace(/[^\p{L}\p{N}\p{M}]+/gu, " ")
    .split(" ")
    .map((w) => w.trim())
    .filter((w) => (w.length > 1 || /[\u0900-\u097F]/.test(w)) && !STOP.has(w));
}

function retrieve(question, lang = "en", topN = 3) {
  const q = new Set(tokens(question));
  if (!q.size) return [];
  const chunks = chunksFor(lang);
  return chunks
    .map((chunk) => {
      let score = 0;
      const kw = new Set(tokens(chunk.keywords));
      const title = new Set(tokens(chunk.title));
      // word-level body matching: substrings such as "paris" inside
      // "comparison" must not earn a hit
      const body = new Set(tokens(chunk.text));
      for (const w of q) {
        if (kw.has(w)) score += 3;
        if (title.has(w)) score += 2;
        if (body.has(w)) score += 1;
      }
      return { chunk, score };
    })
    /* A single incidental word match is not an answer. Requiring three points
       means a keyword or a title hit, which is the honest bar for saying the
       guide covers the question. */
    .filter((r) => r.score >= 3)
    .sort((x, y) => y.score - x.score)
    .slice(0, topN);
}

function localAnswer(question, lang) {
  const hits = retrieve(question, lang);
  const FALL = lang === "hi" ? FALLBACK_HI : FALLBACK;
  if (!hits.length) {
    return { reply: FALL, links: [{ label: lang === "hi" ? "सहायता और सामान्य प्रश्न" : "Open Help and FAQs", href: "#/help" }] };
  }
  const top = hits[0].chunk;
  let reply = top.text;
  if (hits[1] && hits[1].score >= hits[0].score - 2 && hits[1].chunk.id !== top.id) {
    reply += lang === "hi"
      ? `\n\nसंबंधित: ${hits[1].chunk.title} — विवरण चाहिए तो इसके बारे में पूछें।`
      : `\n\nRelated: ${hits[1].chunk.title} — ask me about that if you need the details.`;
  }
  return { reply, links: top.links || [] };
}

const SYSTEM_EN = `You are the help assistant on the AICTE Application Validation and Compliance Portal (Extension of Approval).
Answer ONLY from the portal guide context given below. Give short, numbered steps and name the exact page, menu or button.
If the guide does not cover the question, say so plainly and point the user to the Help page.
Write formal, plain English. Do not invent rules, fees, dates or account details that are not in the guide.`;

const SYSTEM_HI = `आप AICTE आवेदन सत्यापन एवं अनुपालन पोर्टल (अनुमोदन का विस्तार) के सहायता सहायक हैं।
केवल नीचे दी गई पोर्टल मार्गदर्शिका की सामग्री से उत्तर दें। संक्षिप्त, क्रमांकित चरण दें और सटीक पृष्ठ, मेनू या बटन का नाम बताएँ।
यदि मार्गदर्शिका में उत्तर नहीं है तो स्पष्ट रूप से कहें और उपयोगकर्ता को सहायता पृष्ठ पर भेजें।
औपचारिक, सरल हिंदी में लिखें। मार्गदर्शिका में न दिए गए नियम, शुल्क, तिथियाँ या खाता विवरण न बनाएँ।`;

async function callProvider(provider, question, hits, lang) {
  const hi = lang === "hi";
  const context = hits
    .map((h) => `## ${h.chunk.title}\n${h.chunk.text}`)
    .join("\n\n") || (hi ? "(कोई मार्गदर्शिका खंड मेल नहीं खाया)" : "(no guide section matched)");
  const userText = hi
    ? `पोर्टल मार्गदर्शिका की सामग्री:\n${context}\n\nउपयोगकर्ता का प्रश्न: ${question}\n\nउत्तर केवल हिंदी में दें।`
    : `Portal guide context:\n${context}\n\nUser question: ${question}\n\nAnswer in English.`;
  const system = hi ? SYSTEM_HI : SYSTEM_EN;
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
            systemInstruction: { parts: [{ text: system }] },
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
            { role: "system", content: system },
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

/* Language of the answer: explicit panel choice first, then the script of the
   question itself, so a Hindi question typed in English mode is still answered
   in Hindi. */
function resolveLang(requested, question) {
  if (requested === "hi" || requested === "en") return requested;
  return /[\u0900-\u097F]/.test(question) ? "hi" : "en";
}

export async function answerChat(body) {
  const question = String(body?.message || "").trim().slice(0, 1000);
  const lang = resolveLang(String(body?.lang || "").toLowerCase(), question);
  const hi = lang === "hi";
  if (!question) return { reply: hi ? GREETING_HI : GREETING, links: [], source: "local", lang };
  const greet = /^(hi|hello|hey|namaste|namaskar|नमस्ते|नमस्कार)\b/i.test(question) && question.length < 30;

  const hits = retrieve(question, lang);
  const provider = (process.env.CHAT_PROVIDER || "local").toLowerCase();
  if (provider === "gemini" || provider === "grok") {
    const reply = await callProvider(provider, question, hits, lang);
    if (reply) {
      return { reply, links: hits[0]?.chunk?.links || [], source: provider, lang };
    }
    // fall through to the grounded local answer on any provider failure
  }
  const local = localAnswer(question, lang);
  return {
    reply: greet ? (hi ? GREETING_HI : GREETING) + "\n\n" + local.reply : local.reply,
    links: local.links,
    source: "local",
    lang,
  };
}
