"use strict";
/* Portal Assistant — floating help panel (V2).
   Answers come from /api/chat, which retrieves grounded guide sections
   (English and Hindi) and optionally calls Gemini or Grok server-side.
   The widget is bilingual, keyboard-operable, and works with no API key. */
(function () {
  if (document.getElementById("chat-fab")) return;

  var SVG = {
    bubble: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true" focusable="false"><path d="M21 12a8 8 0 0 1-8 8H4l2-3a8 8 0 1 1 15-5z"/><path d="M8.5 11h7M8.5 14h4"/></svg>',
    close: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    trash: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true" focusable="false"><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13M10 11v6M14 11v6"/></svg>',
    send: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true" focusable="false"><path d="M4 12l16-8-6 16-3-6z"/></svg>',
    mic: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true" focusable="false"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>',
    copy: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true" focusable="false"><rect x="9" y="9" width="11" height="11" rx="1.5"/><path d="M15 5H6a1 1 0 0 0-1 1v9"/></svg>',
    spark: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true" focusable="false"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/></svg>',
  };

  var COPY = {
    en: {
      title: "Portal Assistant",
      status: "Answers from the portal guide",
      open: "Help",
      placeholder: "Ask about any page, status or fix…",
      send: "Send",
      close: "Close assistant",
      clear: "Clear conversation",
      mic: "Speak your question",
      you: "You",
      assistant: "Assistant",
      copy: "Copy",
      copied: "Copied",
      thinking: "Searching the portal guide…",
      chips: [
        "How does the Delta Cache work?",
        "How does MAC polling work?",
        "How do I scan a room with the camera?",
        "My document was returned — how do I fix it?",
        "What does 'Verified' mean?",
        "How do I switch to Hindi?",
      ],
      greeting: "Namaste. Ask me how to sign in, upload or fix a document, read a finding, measure a room with the camera, or anything about the Delta cache and device polling — I will answer with the exact steps.",
      error: "The assistant could not be reached. Check your connection and try again.",
      langLabel: "Assistant language",
      sourceLocal: "Portal guide",
      sourceGemini: "Gemini",
      sourceGrok: "Grok",
    },
    hi: {
      title: "पोर्टल सहायक",
      status: "उत्तर पोर्टल मार्गदर्शिका से",
      open: "सहायता",
      placeholder: "किसी भी पृष्ठ, स्थिति या सुधार के बारे में पूछें…",
      send: "भेजें",
      close: "सहायक बंद करें",
      clear: "बातचीत साफ़ करें",
      mic: "अपना प्रश्न बोलें",
      you: "आप",
      assistant: "सहायक",
      copy: "प्रतिलिपि",
      copied: "कॉपी हो गया",
      thinking: "पोर्टल मार्गदर्शिका खोजी जा रही है…",
      chips: [
        "डेल्टा कैश कैसे काम करता है?",
        "MAC पोलिंग कैसे काम करती है?",
        "कैमरे से कक्ष स्कैन कैसे करें?",
        "मेरा दस्तावेज़ लौटाया गया — सुधार कैसे करें?",
        "'सत्यापित' का अर्थ क्या है?",
        "हिंदी में कैसे बदलें?",
      ],
      greeting: "नमस्ते। मुझसे पूछें कि साइन इन कैसे करें, दस्तावेज़ कैसे अपलोड या सुधारें, निष्कर्ष कैसे पढ़ें, कैमरे से कक्ष कैसे मापें, या डेल्टा कैश और डिवाइस पोलिंग के बारे में — मैं सटीक चरण बताऊँगा।",
      error: "सहायक तक नहीं पहुँचा जा सका। कनेक्शन जाँचकर पुनः प्रयास करें।",
      langLabel: "सहायक की भाषा",
      sourceLocal: "पोर्टल मार्गदर्शिका",
      sourceGemini: "जेमिनी",
      sourceGrok: "ग्रोक",
    },
  };

  function siteLang() {
    try { return localStorage.getItem("aicte_lang") === "hi" ? "hi" : "en"; } catch (e) { return "en"; }
  }
  var lang = siteLang();
  var copy = COPY[lang];
  var busy = false;

  /* ------------------------------- shell -------------------------------- */
  var fab = document.createElement("button");
  fab.type = "button";
  fab.className = "chat-fab";
  fab.id = "chat-fab";
  fab.setAttribute("aria-expanded", "false");
  fab.setAttribute("aria-controls", "chat-panel");
  fab.innerHTML = SVG.bubble + '<span class="chat-fab-label"></span>';

  var panel = document.createElement("section");
  panel.className = "chat-panel";
  panel.id = "chat-panel";
  panel.hidden = true;
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "false");
  panel.setAttribute("aria-labelledby", "chat-title");
  panel.innerHTML =
    '<header class="chat-head">' +
      '<span class="chat-avatar" aria-hidden="true">' + SVG.spark + "</span>" +
      '<div class="chat-id">' +
        '<h2 id="chat-title">' + copy.title + "</h2>" +
        '<p class="chat-status"><span class="chat-dot" aria-hidden="true"></span><span>' + copy.status + "</span></p>" +
      "</div>" +
      '<div class="chat-actions">' +
        '<div class="chat-lang" role="group" aria-label="' + copy.langLabel + '">' +
          '<button type="button" data-lang="en" aria-pressed="true">EN</button>' +
          '<button type="button" data-lang="hi" aria-pressed="false" lang="hi">हिं</button>' +
        "</div>" +
        '<button type="button" class="chat-icon-btn" id="chat-clear" aria-label="' + copy.clear + '" title="' + copy.clear + '">' + SVG.trash + "</button>" +
        '<button type="button" class="chat-icon-btn" id="chat-close" aria-label="' + copy.close + '" title="' + copy.close + '">' + SVG.close + "</button>" +
      "</div>" +
    "</header>" +
    '<div class="chat-log" id="chat-log" role="log" aria-live="polite" aria-relevant="additions text"></div>' +
    '<div class="chat-chips" id="chat-chips" role="group" aria-label="Suggested questions"></div>' +
    '<form class="chat-form" id="chat-form" novalidate>' +
      '<label class="chat-sr" for="chat-input"></label>' +
      '<textarea id="chat-input" rows="1" autocomplete="off" enterkeyhint="send" maxlength="1000"></textarea>' +
      '<button type="button" class="chat-icon-btn chat-mic" id="chat-mic" aria-label="' + copy.mic + '" title="' + copy.mic + '">' + SVG.mic + "</button>" +
      '<button type="submit" class="chat-send" id="chat-send" aria-label="' + copy.send + '" title="' + copy.send + '">' + SVG.send + "</button>" +
    "</form>";

  document.body.appendChild(fab);
  document.body.appendChild(panel);

  var log = panel.querySelector("#chat-log");
  var chips = panel.querySelector("#chat-chips");
  var form = panel.querySelector("#chat-form");
  var input = panel.querySelector("#chat-input");
  var micBtn = panel.querySelector("#chat-mic");
  var sendBtn = panel.querySelector("#chat-send");

  /* ------------------------------- helpers ------------------------------- */
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function clock() {
    var d = new Date();
    return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
  }
  function nearBottom() {
    return log.scrollHeight - log.scrollTop - log.clientHeight < 90;
  }
  function scrollLog(force) {
    if (force || nearBottom()) log.scrollTop = log.scrollHeight;
  }

  function applyCopy() {
    copy = COPY[lang];
    panel.querySelector("#chat-title").textContent = copy.title;
    panel.querySelector(".chat-status span:last-child").textContent = copy.status;
    panel.querySelector(".chat-lang").setAttribute("aria-label", copy.langLabel);
    panel.querySelector("#chat-clear").setAttribute("aria-label", copy.clear);
    panel.querySelector("#chat-clear").title = copy.clear;
    panel.querySelector("#chat-close").setAttribute("aria-label", copy.close);
    panel.querySelector("#chat-close").title = copy.close;
    micBtn.setAttribute("aria-label", copy.mic);
    micBtn.title = copy.mic;
    sendBtn.setAttribute("aria-label", copy.send);
    sendBtn.title = copy.send;
    input.placeholder = copy.placeholder;
    panel.querySelector(".chat-sr").textContent = copy.placeholder;
    fab.querySelector(".chat-fab-label").textContent = copy.open;
    fab.setAttribute("aria-label", copy.title);
    panel.querySelectorAll(".chat-lang button").forEach(function (b) {
      b.setAttribute("aria-pressed", b.dataset.lang === lang ? "true" : "false");
    });
    renderChips();
    if (!log.querySelector(".chat-msg")) addAssistant(copy.greeting, { source: "local", links: [] });
  }

  function renderChips() {
    chips.innerHTML = copy.chips
      .map(function (q) {
        return '<button type="button" class="chat-chip">' + esc(q) + "</button>";
      })
      .join("");
  }

  /* ------------------------------- messages ------------------------------ */
  function messageShell(role, inner, meta) {
    var wrap = document.createElement("div");
    wrap.className = "chat-msg chat-" + role;
    wrap.innerHTML =
      '<div class="chat-meta"><span class="chat-who">' + esc(role === "user" ? copy.you : copy.assistant) + "</span>" +
      '<span class="chat-time">' + clock() + "</span></div>" +
      '<div class="chat-bubble">' + inner + "</div>" +
      (meta || "");
    log.appendChild(wrap);
    scrollLog(true);
    return wrap;
  }

  function linkButtons(links) {
    if (!links || !links.length) return "";
    return '<div class="chat-links">' + links.map(function (l) {
      return '<a class="chat-link" href="' + esc(l.href) + '">' + esc(l.label) + "</a>";
    }).join("") + "</div>";
  }

  function sourceBadge(source) {
    var label = source === "gemini" ? copy.sourceGemini : source === "grok" ? copy.sourceGrok : copy.sourceLocal;
    return '<span class="chat-source" data-source="' + esc(source || "local") + '">' + SVG.spark + esc(label) + "</span>";
  }

  function addAssistant(text, opts) {
    opts = opts || {};
    var body = esc(text).replace(/\n/g, "<br>");
    var extra =
      '<div class="chat-foot">' + sourceBadge(opts.source) +
      '<button type="button" class="chat-copy" data-copy aria-label="' + copy.copy + '">' + SVG.copy + "<span>" + copy.copy + "</span></button></div>" +
      linkButtons(opts.links);
    return messageShell("assistant", body, extra);
  }

  function addUser(text) {
    return messageShell("user", esc(text).replace(/\n/g, "<br>"), "");
  }

  function typing() {
    var wrap = document.createElement("div");
    wrap.className = "chat-msg chat-assistant chat-typing";
    wrap.setAttribute("aria-label", copy.thinking);
    wrap.innerHTML =
      '<div class="chat-bubble"><span class="chat-dots"><i></i><i></i><i></i></span>' +
      '<span class="chat-thinking-text">' + esc(copy.thinking) + "</span></div>";
    log.appendChild(wrap);
    scrollLog(true);
    return wrap;
  }

  /* --------------------------------- send -------------------------------- */
  async function ask(text) {
    text = String(text || "").trim();
    if (!text || busy) return;
    busy = true;
    sendBtn.disabled = true;
    addUser(text);
    input.value = "";
    autoGrow();
    var t = typing();
    try {
      var res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, lang: lang }),
      });
      var data = await res.json().catch(function () { return null; });
      if (!res.ok) throw new Error((data && data.detail) || "Request failed");
      t.remove();
      addAssistant((data && data.reply) || copy.error, { source: data && data.source, links: (data && data.links) || [] });
    } catch (e) {
      t.remove();
      addAssistant(copy.error, { source: "local", links: [{ label: lang === "hi" ? "सहायता और सामान्य प्रश्न" : "Help and FAQs", href: "#/help" }] });
    } finally {
      busy = false;
      sendBtn.disabled = false;
      input.focus();
    }
  }

  /* ------------------------------ behaviours ----------------------------- */
  function autoGrow() {
    input.style.height = "auto";
    input.style.height = Math.min(120, input.scrollHeight) + "px";
  }

  function open() {
    panel.hidden = false;
    fab.setAttribute("aria-expanded", "true");
    document.body.classList.add("chat-open");
    input.focus();
    scrollLog(true);
  }
  function close() {
    panel.hidden = true;
    fab.setAttribute("aria-expanded", "false");
    document.body.classList.remove("chat-open");
    if (window.CamScan) { /* camera belongs to the page, not the chat */ }
    fab.focus();
  }
  function setLang(l) {
    lang = l === "hi" ? "hi" : "en";
    applyCopy();
    // keep the panel's transcript readable: new answers follow the new language
    if (!panel.hidden) input.focus();
  }

  fab.addEventListener("click", function () {
    if (panel.hidden) open(); else close();
  });
  panel.querySelector("#chat-close").addEventListener("click", close);
  panel.querySelector("#chat-clear").addEventListener("click", function () {
    log.innerHTML = "";
    addAssistant(copy.greeting, { source: "local", links: [] });
    input.focus();
  });

  panel.querySelectorAll(".chat-lang button").forEach(function (b) {
    b.addEventListener("click", function () {
      var l = b.dataset.lang;
      setLang(l);
      // sync with the site language so the whole portal follows the choice
      if (window.A && typeof window.A.setLang === "function" && siteLang() !== l) window.A.setLang(l);
    });
  });

  chips.addEventListener("click", function (ev) {
    var b = ev.target.closest(".chat-chip");
    if (b) ask(b.textContent);
  });

  log.addEventListener("click", function (ev) {
    var btn = ev.target.closest("[data-copy]");
    if (!btn) return;
    var bubble = btn.closest(".chat-msg").querySelector(".chat-bubble");
    var text = bubble ? bubble.innerText : "";
    var done = function () {
      var span = btn.querySelector("span");
      var old = span.textContent;
      span.textContent = copy.copied;
      setTimeout(function () { span.textContent = old; }, 1600);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done).catch(function () {});
  });

  form.addEventListener("submit", function (ev) {
    ev.preventDefault();
    ask(input.value);
  });

  input.addEventListener("input", autoGrow);
  input.addEventListener("keydown", function (ev) {
    if (ev.key === "Enter" && !ev.shiftKey) {
      ev.preventDefault();
      ask(input.value);
    }
  });

  document.addEventListener("keydown", function (ev) {
    if (ev.key === "Escape" && !panel.hidden) close();
  });

  /* optional voice input, only where the browser supports it */
  var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    micBtn.hidden = true;
  } else {
    var recog = null;
    micBtn.addEventListener("click", function () {
      if (recog) { recog.stop(); recog = null; micBtn.classList.remove("listening"); return; }
      recog = new SR();
      recog.lang = lang === "hi" ? "hi-IN" : "en-IN";
      recog.interimResults = false;
      recog.maxAlternatives = 1;
      micBtn.classList.add("listening");
      recog.onresult = function (ev) {
        var said = ev.results[0][0].transcript;
        input.value = said;
        autoGrow();
        ask(said);
      };
      recog.onend = function () { micBtn.classList.remove("listening"); recog = null; };
      recog.onerror = function () { micBtn.classList.remove("listening"); recog = null; };
      try { recog.start(); } catch (e) { micBtn.classList.remove("listening"); recog = null; }
    });
  }

  window.AICTE_CHAT = { open: open, close: close, setLang: setLang, lang: function () { return lang; } };
  applyCopy();
})();
