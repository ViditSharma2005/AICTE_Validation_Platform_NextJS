# V2 interface snapshots

These four files are **static DOM snapshots**, not raster screenshots.

```text
01-home-en.html             portal home, English
02-home-hi.html             portal home, Hindi
03-officer-file-en.html     officer application file (delta strip, network evidence,
                            rooms, trust graph, audit) in English
04-officer-file-hi-chat.html the same file in Hindi with the assistant open and a
                            Hindi answer in the thread
```

Open any of them in a browser. Each file carries the three stylesheets inline
(`styles.css`, `chat.css`, `responsive.css`), so it re-flows at the window width
you give it — resize to 320, 390, 768, 1024 or 1440 px to see the responsive
layer — and the header at the top of each file states what it is.

Why not screenshots: this build environment could not install a browser engine.
Playwright's Chromium download is blocked, and the Chromium build that npm can
supply (`@sparticuz/chromium`) needs `libnss3` / `libnspr4`, which are not
present and cannot be fetched. The DOM snapshots were captured from the running
production build (`next start`) with the real scripts executed, so the markup,
the Hindi translations and the loaded API data are genuine; what is missing is a
rendering engine's paint.

Console errors were checked separately: a jsdom harness executes `app.js`,
`i18n.js`, `chat.js` and `scan.js` against the live server, walks every route,
signs in, switches language and opens the assistant — no console errors and no
page errors were raised.

The V1 screenshots (`01-home.png` … `12-m1-bounce.png`) in the parent folder
remain the raster reference for the shell that V2 preserves.
