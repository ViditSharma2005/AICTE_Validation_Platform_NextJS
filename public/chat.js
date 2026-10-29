"use strict";
/* Portal Assistant widget — floating help bubble.
   Posts to /api/chat, which answers from the built-in portal guide
   (and through Gemini/Grok when configured server-side). */
(function () {
  if (document.getElementById("chat-fab")) return;

  var CHIPS = [
    "How do I sign in?",
    "My document was returned — how do I fix it?",
    "How does the room scan work?",
    "What does 'Verified' mean?",
    "How do I upload a document?",
  ];

  var icon =
    '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true" focusable="false">' +
    '<path d="M21 12a8 8 0 0 1-8 8H4l2-3a8 8 0 1 1 15-5z"/><path d="M8.5 11h7M8.5 14h4"/></svg>';

  var fab = document.createElement("button");
  fab.type = "button";
  fab.className = "chat-fab";
  fab.id = "chat-fab";
  fab.setAttribute("aria-expanded", "false");
  fab.setAttribute("aria-controls", "chat-panel");
  fab.innerHTML = icon + "<span>Help</span>";

  var panel = document.createElement("section");
  panel.className = "chat-panel";
  panel.id = "chat-panel";
  panel.hidden = true;
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "Portal Assistant");
  panel.innerHTML =
    '<div class="chat-head">' +
      "<div><h2>Portal Assistant</h2>" +
      "<p>Navigation, uploads, findings and fixes — ask in your own words.</p></div>" +
      '<button type="button" class="chat-close" id="chat-close" aria-label="Close assistant">×</button>' +
    "</div>" +
    '<div class="chat-log" id="chat-log" aria-live="polite"></div>' +
    '<div class="chat-chips" id="chat-chips" aria-label="Suggested questions"></div>' +
    '<form class="chat-form" id="chat-form">' +
      '<label class="sr-only" for="chat-input">Ask the portal assistant</label>' +
      '<input id="chat-input" type="text" autocomplete="off" maxlength="500" ' +
        'placeholder="Ask, e.g. signature not detected">' +
      '<button type="submit" id="chat-send">Ask</button>' +
    "</form>";

  document.body.appendChild(fab);
  document.body.appendChild(panel);

  var log = panel.querySelector("#chat-log");
  var form = panel.querySelector("#chat-form");
  var input = panel.querySelector("#chat-input");
  var sendBtn = panel.querySelector("#chat-send");
  var chips = panel.querySelector("#chat-chips");
  var greeted = false;

  function addMsg(text, who, links) {
    var div = document.createElement("div");
    div.className = "chat-msg " + who;
    String(text || "").split(/\n+/).forEach(function (para) {
      if (!para.trim()) return;
      var p = document.createElement("p");
      p.textContent = para;
      div.appendChild(p);
    });
    if (links && links.length) {
      var row = document.createElement("div");
      row.className = "chat-links";
      links.forEach(function (l) {
        var a = document.createElement("a");
        a.href = l.href;
        a.textContent = l.label;
        a.addEventListener("click", function () {
          if (window.innerWidth < 720) toggle(false);
        });
        row.appendChild(a);
      });
      div.appendChild(row);
    }
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
    return div;
  }

  function setStatus(text) {
    var old = log.querySelector(".chat-status");
    if (old) old.remove();
    if (!text) return null;
    var s = document.createElement("div");
    s.className = "chat-status";
    s.setAttribute("role", "status");
    s.textContent = text;
    log.appendChild(s);
    log.scrollTop = log.scrollHeight;
    return s;
  }

  function ask(question) {
    var q = String(question || "").trim();
    if (!q) return;
    addMsg(q, "user");
    input.value = "";
    sendBtn.disabled = true;
    setStatus("Checking the portal guide…");
    fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: q }),
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        setStatus("");
        addMsg((data && data.reply) || "I could not answer that just now.", "bot", (data && data.links) || []);
      })
      .catch(function () {
        setStatus("");
        addMsg(
          "The assistant could not be reached. The Help page covers accounts, statuses and the main workflows.",
          "bot",
          [{ label: "Open Help and FAQs", href: "#/help" }]
        );
      })
      .finally(function () {
        sendBtn.disabled = false;
        input.focus();
      });
  }

  function toggle(open) {
    var willOpen = typeof open === "boolean" ? open : panel.hidden;
    panel.hidden = !willOpen;
    fab.setAttribute("aria-expanded", willOpen ? "true" : "false");
    if (willOpen) {
      if (!greeted) {
        greeted = true;
        addMsg(
          "Namaste. I am the portal assistant. Ask me how to sign in, upload or fix a document, read a finding, run the room scan, or use any part of this portal — and I will answer with the exact steps.",
          "bot",
          [{ label: "Help and FAQs", href: "#/help" }, { label: "Compliance Checklist", href: "#/checklist" }]
        );
      }
      input.focus();
    } else {
      fab.focus();
    }
  }

  CHIPS.forEach(function (c) {
    var b = document.createElement("button");
    b.type = "button";
    b.textContent = c;
    b.addEventListener("click", function () { ask(c); });
    chips.appendChild(b);
  });

  fab.addEventListener("click", function () { toggle(); });
  panel.querySelector("#chat-close").addEventListener("click", function () { toggle(false); });
  form.addEventListener("submit", function (ev) { ev.preventDefault(); ask(input.value); });
  document.addEventListener("keydown", function (ev) {
    if (ev.key === "Escape" && !panel.hidden) toggle(false);
  });
})();
