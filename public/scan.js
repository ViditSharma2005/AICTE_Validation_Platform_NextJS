"use strict";
/* Live camera room measurement (browser side).
   ---------------------------------------------------------------------------
   What this module actually does, stated plainly:

   1. Opens the rear camera with getUserMedia (no WebXR, no ARCore).
   2. Lets the surveyor mark the four floor corners of the room in order on a
      live frame. Corner 1 → corner 2 is the edge that is tape-measured.
   3. Recovers the room's real proportions from a single view: for a candidate
      aspect ratio it builds the homography from a rectangle template to the
      four marked corners, then measures how far K⁻¹H is from having two
      orthogonal, equal-length columns (the condition a real rectangle must
      satisfy under a pinhole camera). The aspect ratio that minimises that
      residual is taken as the room's shape, and the tape measurement scales it.
   4. Hashes the captured frame (SHA-256, SubtleCrypto) so the submission is
      tied to one frame, and asks for GPS once with a short timeout.

   Boundary: this is single-view perspective metrology with an assumed focal
   length (≈ 65° horizontal field of view). Expect a few percent of error; it
   is not a depth sensor. Out-of-tolerance results schedule a human
   inspection, and the server still applies the challenge code and geofence.
   ------------------------------------------------------------------------- */

(function () {
  const sessions = new Map();

  const state = (roomId) => sessions.get(roomId) || null;

  function deviceLabel() {
    const ua = navigator.userAgent || "";
    if (/Android/i.test(ua)) return "Browser camera (Android)";
    if (/iPhone|iPad|iPod/i.test(ua)) return "Browser camera (iOS)";
    if (/Macintosh/i.test(ua)) return "Browser camera (macOS)";
    if (/Windows/i.test(ua)) return "Browser camera (Windows)";
    return "Browser camera";
  }

  /* ------------------------------ linear algebra ------------------------- */
  function solve(A, b) {
    const n = b.length;
    const M = A.map((row, i) => [...row, b[i]]);
    for (let col = 0; col < n; col++) {
      let piv = col;
      for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
      if (Math.abs(M[piv][col]) < 1e-12) return null;
      [M[col], M[piv]] = [M[piv], M[col]];
      const d = M[col][col];
      for (let c = col; c <= n; c++) M[col][c] /= d;
      for (let r = 0; r < n; r++) {
        if (r === col) continue;
        const f = M[r][col];
        if (!f) continue;
        for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c];
      }
    }
    return M.map((row) => row[n]);
  }

  /* Homography taking template coordinates (x,y) to image coordinates (X,Y). */
  function homography(template, image) {
    const A = [];
    const b = [];
    for (let i = 0; i < 4; i++) {
      const { x, y } = template[i];
      const X = image[i].x, Y = image[i].y;
      A.push([x, y, 1, 0, 0, 0, -X * x, -X * y]); b.push(X);
      A.push([0, 0, 0, x, y, 1, -Y * x, -Y * y]); b.push(Y);
    }
    const h = solve(A, b);
    if (!h) return null;
    if (h.some((v) => !Number.isFinite(v))) return null;
    return [
      [h[0], h[1], h[2]],
      [h[3], h[4], h[5]],
      [h[6], h[7], 1],
    ];
  }

  /* Residual of the "this quad is a rectangle" condition for aspect ratio r. */
  function rectResidual(cornersCentred, r, f) {
    const template = [
      { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: r }, { x: 0, y: r },
    ];
    const H = homography(template, cornersCentred);
    if (!H) return Infinity;
    // K⁻¹ H with K = diag(f, f, 1) in principal-point-centred coordinates.
    const m1 = [H[0][0] / f, H[1][0] / f, H[2][0]];
    const m2 = [H[0][1] / f, H[1][1] / f, H[2][1]];
    const n1 = Math.hypot(...m1), n2 = Math.hypot(...m2);
    if (!n1 || !n2) return Infinity;
    const dot = Math.abs(m1[0] * m2[0] + m1[1] * m2[1] + m1[2] * m2[2]);
    return dot / (n1 * n2) + Math.abs(n1 / n2 - 1);
  }

  /* Best aspect ratio for the marked quad, by one-dimensional search. */
  function estimateAspect(corners, f) {
    let best = { r: 1, score: Infinity };
    const lo = Math.log(0.15), hi = Math.log(6.5);
    const N = 140;
    const evaluate = (r) => {
      const score = rectResidual(corners, r, f);
      if (score < best.score) best = { r, score };
    };
    for (let i = 0; i <= N; i++) evaluate(Math.exp(lo + ((hi - lo) * i) / N));
    // refine around the best sample
    let span = (hi - lo) / N;
    let centre = Math.log(best.r);
    for (let pass = 0; pass < 3; pass++) {
      for (let i = -10; i <= 10; i++) evaluate(Math.exp(centre + (span * i) / 10));
      centre = Math.log(best.r);
      span /= 6;
    }
    return best;
  }

  function measure(corners, calibration, focalPx) {
    if (!corners || corners.length !== 4 || !(calibration > 0.1)) return null;
    const best = estimateAspect(corners, focalPx);
    if (!Number.isFinite(best.score) || best.score > 0.35) {
      // the four marks do not behave like a rectangle in perspective
      return { unreliable: true, score: best.score, aspect: best.r };
    }
    const a = calibration;
    const b = best.r * calibration;
    return {
      measured_long: Math.max(a, b),
      measured_short: Math.min(a, b),
      aspect: best.r,
      residual: best.score,
      area_sqm: a * b,
      calibration_edge_m: calibration,
      focal_px: focalPx,
    };
  }

  /* --------------------------------- hashing ----------------------------- */
  async function frameHash(video) {
    try {
      const size = 96;
      const cv = document.createElement("canvas");
      cv.width = size; cv.height = size;
      const ctx = cv.getContext("2d");
      ctx.drawImage(video, 0, 0, size, size);
      const data = ctx.getImageData(0, 0, size, size).data;
      if (!(window.crypto && window.crypto.subtle)) return "";
      const digest = await window.crypto.subtle.digest("SHA-256", data.buffer.slice(0));
      return Array.from(new Uint8Array(digest)).map((x) => x.toString(16).padStart(2, "0")).join("");
    } catch (e) {
      return "";
    }
  }

  function gps() {
    return new Promise((resolve) => {
      if (!navigator.geolocation) return resolve(null);
      let done = false;
      const finish = (v) => { if (!done) { done = true; resolve(v); } };
      const timer = setTimeout(() => finish(null), 4500);
      navigator.geolocation.getCurrentPosition(
        (pos) => { clearTimeout(timer); finish({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }); },
        () => { clearTimeout(timer); finish(null); },
        { enableHighAccuracy: false, timeout: 4000, maximumAge: 60000 }
      );
    });
  }

  /* ------------------------------- rendering ----------------------------- */
  function renderOverlay(canvas, video, corners, fps) {
    const rect = video.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    canvas.style.width = rect.width + "px";
    canvas.style.height = rect.height + "px";
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);
    const toDisplay = (p) => ({ x: (p.x / video.videoWidth) * rect.width, y: (p.y / video.videoHeight) * rect.height });
    const pts = corners.map(toDisplay);
    if (pts.length > 1) {
      ctx.strokeStyle = "#FF9933";
      ctx.lineWidth = 2;
      ctx.beginPath();
      pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      if (pts.length === 4) ctx.closePath();
      ctx.stroke();
    }
    pts.forEach((p, i) => {
      ctx.fillStyle = "#0D47A1";
      ctx.strokeStyle = "#FFFFFF";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#FFFFFF";
      ctx.font = "600 12px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(i + 1), p.x, p.y + 0.5);
    });
    if (pts.length >= 2) {
      const a = pts[0], b = pts[1];
      ctx.fillStyle = "#073066";
      ctx.font = "600 11px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("calibrated edge", (a.x + b.x) / 2, Math.max(12, (a.y + b.y) / 2 - 10));
    }
    if (fps) {
      ctx.fillStyle = "rgba(7,48,102,.72)";
      ctx.fillRect(8, 8, 168, 22);
      ctx.fillStyle = "#FFFFFF";
      ctx.font = "600 11px system-ui, sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(fps, 14, 19);
    }
  }

  async function open(hostId, opts) {
    const host = document.getElementById(hostId);
    const roomId = opts.roomId;
    if (!host) throw new Error("Camera host not found");
    close(roomId);

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      const msg = "This browser cannot open a camera here. Use manual entry or the recorded replay instead.";
      opts.onError && opts.onError(msg);
      throw new Error(msg);
    }

    host.innerHTML = `
      <div class="cam-viewport">
        <video id="cam-video-${roomId}" playsinline muted autoplay aria-label="Live camera view of the room floor"></video>
        <canvas id="cam-canvas-${roomId}" class="cam-overlay" aria-label="Mark the four floor corners here"></canvas>
      </div>
      <div class="cam-controls">
        <label class="f" for="cam-cal-${roomId}" style="margin:0">Calibration edge (metres, corner 1 → 2)</label>
        <input id="cam-cal-${roomId}" type="number" step="0.01" min="0.1" inputmode="decimal" placeholder="e.g. 4.20" value="${opts.calibration ? opts.calibration : ""}">
        <div class="btn-row" style="margin:8px 0 0">
          <button class="btn ghost small" type="button" data-act="undo">Undo point</button>
          <button class="btn ghost small" type="button" data-act="clear">Clear marks</button>
          <button class="btn ghost small" type="button" data-act="stop">Stop camera</button>
        </div>
        <p class="soft" style="font-size:.82rem;margin:8px 0 0" data-role="hint">Tap the four floor corners in order, going around the room. Nothing is uploaded until you submit the measurement.</p>
      </div>`;

    const video = host.querySelector("video");
    const canvas = host.querySelector("canvas");
    const calInput = host.querySelector("input");
    const hint = host.querySelector('[data-role="hint"]');

    let stream = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
    } catch (e) {
      const msg = e && e.name === "NotAllowedError"
        ? "Camera permission was refused. Allow the camera in this browser, or use manual entry or the recorded replay."
        : "No camera is available in this browser or device. Manual entry and the recorded replay still work.";
      opts.onError && opts.onError(msg);
      host.innerHTML = `<p class="soft" style="font-size:.86rem;margin:8px 0 0">${msg}</p>`;
      throw new Error(msg);
    }

    video.srcObject = stream;
    await new Promise((resolve) => {
      const ready = () => resolve();
      video.onloadedmetadata = ready;
      setTimeout(ready, 1500);
    });
    try { await video.play(); } catch (e) { /* autoplay may need a gesture; the stream is still attached */ }

    const session = {
      stream, video, canvas, host, roomId, opts,
      corners: [],
      calibration: Number(opts.calibration) || 0,
      focal_px: 0,
      measurement: null,
      frame_hash: "",
      device: deviceLabel(),
      lat: null,
      lng: null,
    };
    sessions.set(roomId, session);

    const fps = { label: "" };
    session.fps = fps;
    const tick = () => {
      if (!sessions.has(roomId)) return;
      renderOverlay(canvas, video, session.corners, fps.label);
      session.raf = requestAnimationFrame(tick);
    };
    session.raf = requestAnimationFrame(tick);
    fps.label = `live · ${Math.round(video.videoWidth || 0)}×${Math.round(video.videoHeight || 0)}`;

    const recompute = async () => {
      if (session.corners.length < 4) {
        session.measurement = null;
        hint.textContent = session.corners.length
          ? `Corner ${session.corners.length} marked. ${4 - session.corners.length} to go.`
          : "Tap the four floor corners in order, going around the room.";
        opts.onMeasure && opts.onMeasure({ corners: session.corners, measured_long: 0, measured_short: 0, calibration_edge_m: session.calibration });
        return;
      }
      if (!(session.calibration > 0.1)) {
        hint.textContent = "Four corners marked. Now enter the real length of the edge between corner 1 and corner 2 — that measurement sets the scale.";
        opts.onMeasure && opts.onMeasure({ corners: session.corners, measured_long: 0, measured_short: 0, calibration_edge_m: 0 });
        return;
      }
      const focal = Math.max(200, (video.videoWidth || 1280) / (2 * Math.tan((65 * Math.PI) / 360)));
      session.focal_px = focal;
      const cx = (video.videoWidth || 1280) / 2;
      const cy = (video.videoHeight || 720) / 2;
      const centred = session.corners.map((p) => ({ x: p.x - cx, y: p.y - cy }));
      const m = measure(centred, session.calibration, focal);
      if (!m) { hint.textContent = "Mark four corners and enter the calibration edge."; return; }
      if (m.unreliable) {
        session.measurement = null;
        hint.textContent = "These four marks do not describe a rectangle in perspective — re-mark the corners, standing further back so the whole floor is visible.";
        opts.onMeasure && opts.onMeasure({ corners: session.corners, measured_long: 0, measured_short: 0, calibration_edge_m: session.calibration, unreliable: true });
        return;
      }
      session.measurement = m;
      session.frame_hash = session.frame_hash || (await frameHash(video));
      hint.textContent = `Estimated ${m.measured_long.toFixed(2)} m × ${m.measured_short.toFixed(2)} m (${m.area_sqm.toFixed(1)} sq m), aspect ${m.aspect.toFixed(2)}:1. Approximate: check it against the plan.`;
      opts.onMeasure && opts.onMeasure({ ...m, corners: session.corners, frame_hash: session.frame_hash });
    };

    const pointFromEvent = (ev) => {
      const rect = canvas.getBoundingClientRect();
      const pt = ev.touches ? ev.touches[0] : ev;
      const x = ((pt.clientX - rect.left) / rect.width) * (video.videoWidth || rect.width);
      const y = ((pt.clientY - rect.top) / rect.height) * (video.videoHeight || rect.height);
      return { x, y };
    };

    const onMark = async (ev) => {
      ev.preventDefault();
      if (session.corners.length >= 4) return;
      const p = pointFromEvent(ev);
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return;
      session.corners.push(p);
      session.frame_hash = "";
      await recompute();
    };
    canvas.addEventListener("click", onMark);
    canvas.addEventListener("touchend", onMark, { passive: false });

    calInput.addEventListener("input", async () => {
      session.calibration = Number(calInput.value) || 0;
      session.frame_hash = "";
      await recompute();
    });

    host.querySelector('[data-act="undo"]').onclick = async () => {
      session.corners.pop();
      session.frame_hash = "";
      await recompute();
    };
    host.querySelector('[data-act="clear"]').onclick = async () => {
      session.corners = [];
      session.frame_hash = "";
      await recompute();
    };
    host.querySelector('[data-act="stop"]').onclick = () => {
      close(roomId);
      host.innerHTML = `<p class="soft" style="font-size:.86rem;margin:8px 0 0">Camera stopped. The marks are kept until you submit or clear them.</p>`;
    };

    // GPS once, short timeout, never blocking
    gps().then((pos) => {
      if (pos && sessions.get(roomId) === session) { session.lat = pos.lat; session.lng = pos.lng; }
    }).catch(() => {});

    await recompute();
    return true;
  }

  function setCalibration(roomId, metres) {
    const session = state(roomId);
    if (!session) return;
    session.calibration = Number(metres) || 0;
    session.frame_hash = "";
    const input = session.host && session.host.querySelector("input");
    if (input && Number(input.value) !== metres) input.value = metres || "";
    const canvas = session.canvas, video = session.video;
    if (canvas && video) renderOverlay(canvas, video, session.corners, session.fps && session.fps.label);
  }

  function undo(roomId) {
    const session = state(roomId);
    if (!session) return;
    session.corners.pop();
    session.frame_hash = "";
    session.measurement = null;
    if (session.canvas && session.video) renderOverlay(session.canvas, session.video, session.corners, session.fps && session.fps.label);
    const hint = session.host && session.host.querySelector('[data-role="hint"]');
    if (hint) hint.textContent = `Corner ${session.corners.length} marked. ${4 - session.corners.length} to go.`;
  }

  function clear(roomId) {
    const session = state(roomId);
    if (!session) return;
    session.corners = [];
    session.frame_hash = "";
    session.measurement = null;
    session.opts && session.opts.onMeasure && session.opts.onMeasure({ corners: [], measured_long: 0, measured_short: 0, calibration_edge_m: session.calibration });
    const hint = session.host && session.host.querySelector('[data-role="hint"]');
    if (hint) hint.textContent = "Tap the four floor corners in order, going around the room.";
    if (session.canvas && session.video) renderOverlay(session.canvas, session.video, [], "");
  }

  function close(roomId) {
    const session = state(roomId);
    if (!session) return;
    if (session.raf) cancelAnimationFrame(session.raf);
    if (session.stream) session.stream.getTracks().forEach((t) => t.stop());
    sessions.delete(roomId);
  }

  function closeAll() {
    for (const id of [...sessions.keys()]) close(id);
  }

  function get(roomId) {
    const session = state(roomId);
    if (!session) return null;
    const m = session.measurement;
    return {
      corners: session.corners,
      measured_l: m ? m.measured_long : 0,
      measured_w: m ? m.measured_short : 0,
      calibration_edge_m: session.calibration,
      focal_px: session.focal_px,
      frame_w: (session.video && session.video.videoWidth) || 0,
      frame_h: (session.video && session.video.videoHeight) || 0,
      frame_hash: session.frame_hash,
      device: session.device,
      lat: session.lat,
      lng: session.lng,
      approximate: !!m,
    };
  }

  window.CamScan = { open, close, closeAll, clear, undo, get, setCalibration, supports: () => !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia) };
  window.addEventListener("beforeunload", closeAll);
})();
