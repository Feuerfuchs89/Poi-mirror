/* PoiTracker: robustes Zwei-Licht-Tracking
 * - Schwerpunkt gewichtet nach Helligkeit (Subpixel), nahe Blobs (Bloom) werden verschmolzen
 * - Alpha-Beta-Filter mit Geschwindigkeit: Vorhersage + Glättung ohne spürbare Verzögerung
 * - Zuordnung über Vorhersage (statt letzter Position) + leichter Farbhinweis
 * - Kreuzen sich die Poi (ein verschmolzener Blob), laufen beide auf Kurs weiter, keine Vertauschung
 */
(function (global) {
    'use strict';
    const ALPHA = 0.8, BETA = 0.25, MAX_COAST = 260, MAX_DT = 100;

    /** Findet helle Blobs. data = RGBA, Rückgabe in Analyse-Pixeln. */
    function detect(data, aw, ah, thresh) {
        const n = aw * ah, mask = new Uint8Array(n), lum = new Float32Array(n);
        for (let i = 0, p = 0; p < n; i += 4, p++) {
            const l = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
            lum[p] = l;
            if (l > thresh) mask[p] = 1;
        }
        let blobs = [];
        const stack = [];
        for (let p0 = 0; p0 < n; p0++) {
            if (mask[p0] !== 1) continue;
            let sx = 0, sy = 0, m = 0, cnt = 0, cr = 0, cg = 0, cb = 0;
            stack.length = 0; stack.push(p0); mask[p0] = 2;
            while (stack.length) {
                const p = stack.pop(), x = p % aw, y = (p / aw) | 0;
                const w = lum[p] - thresh * 0.7;
                sx += (x + 0.5) * w; sy += (y + 0.5) * w; m += w; cnt++;
                cr += data[p * 4]; cg += data[p * 4 + 1]; cb += data[p * 4 + 2];
                if (x > 0 && mask[p - 1] === 1) { mask[p - 1] = 2; stack.push(p - 1); }
                if (x < aw - 1 && mask[p + 1] === 1) { mask[p + 1] = 2; stack.push(p + 1); }
                if (y > 0 && mask[p - aw] === 1) { mask[p - aw] = 2; stack.push(p - aw); }
                if (y < ah - 1 && mask[p + aw] === 1) { mask[p + aw] = 2; stack.push(p + aw); }
            }
            if (cnt < 3) continue;
            const mx = Math.max(cr, cg, cb, 1);
            blobs.push({ x: sx / m, y: sy / m, m, n: cnt, c: [cr / mx, cg / mx, cb / mx] });
        }
        // Bloom-Fragmente eines Lichts verschmelzen
        blobs.sort((a, b) => b.m - a.m);
        const mergeR = Math.max(3, aw * 0.04), out = [];
        for (const b of blobs) {
            const host = out.find(o => Math.hypot(o.x - b.x, o.y - b.y) < mergeR + Math.sqrt(o.n));
            if (host) {
                const t = host.m + b.m;
                host.x = (host.x * host.m + b.x * b.m) / t; host.y = (host.y * host.m + b.y * b.m) / t;
                host.m = t; host.n += b.n;
            } else out.push(b);
        }
        return out.slice(0, 4);
    }

    const predict = (t, now) => {
        const dt = Math.min(MAX_DT, now - t.t);
        return { x: t.fx + t.vx * dt, y: t.fy + t.vy * dt };
    };

    /** Aktualisiert die zwei Spuren. blobs in CSS-Pixeln {x,y,m,c}. */
    function update(tracks, blobs, now, W, H) {
        const diag = Math.hypot(W, H);
        const gate = diag * 0.3;
        const act = tracks.map(t => t.fx !== undefined && t.last && now - t.lastSeen < MAX_COAST);
        const pred = tracks.map((t, i) => act[i] ? predict(t, now) : null);

        // Kreuzung: beide aktiv, Vorhersagen nah beieinander, nur ein Blob -> beide laufen auf Kurs weiter
        const crossing = act[0] && act[1] && blobs.length <= 1 &&
            Math.hypot(pred[0].x - pred[1].x, pred[0].y - pred[1].y) < diag * 0.07;

        let best = [null, null];
        if (!crossing && blobs.length) {
            const cost = (i, b) => {
                if (!act[i]) return 0;
                const d = Math.hypot(pred[i].x - b.x, pred[i].y - b.y);
                if (d > gate) return Infinity;
                let cc = 0;
                if (tracks[i].col) cc = Math.hypot(tracks[i].col[0] - b.c[0], tracks[i].col[1] - b.c[1]) * gate * 0.12;
                return d + cc;
            };
            const miss = i => act[i] ? gate * 0.45 : gate * 0.02;
            let bestCost = Infinity;
            const opts = [-1, ...blobs.keys()];
            for (const a of opts) for (const b of opts) {
                if (a >= 0 && a === b) continue;
                const ca = a < 0 ? miss(0) : cost(0, blobs[a]);
                const cb = b < 0 ? miss(1) : cost(1, blobs[b]);
                let c = ca + cb;
                // beide frisch: stabile Identität über x-Position (links = Poi 1)
                if (!act[0] && !act[1] && a >= 0 && b >= 0 && blobs[a].x > blobs[b].x) c += 1;
                if (c < bestCost) { bestCost = c; best = [a < 0 ? null : blobs[a], b < 0 ? null : blobs[b]]; }
            }
        }

        tracks.forEach((t, i) => {
            const m = best[i];
            if (m) {
                if (act[i]) {
                    const dt = Math.max(8, Math.min(MAX_DT, now - t.t));
                    const px = pred[i].x, py = pred[i].y;
                    const rx = m.x - px, ry = m.y - py;
                    t.fx = px + ALPHA * rx; t.fy = py + ALPHA * ry;
                    t.vx += BETA * rx / dt; t.vy += BETA * ry / dt;
                } else { t.fx = m.x; t.fy = m.y; t.vx = 0; t.vy = 0; }
                t.col = t.col ? t.col.map((v, k) => v * 0.9 + m.c[k] * 0.1) : m.c.slice();
                t.t = now; t.lastSeen = now;
                if (!act[i] && t.last) t.pts.push({ gap: true, t: now });
                t.last = { x: t.fx, y: t.fy };
                t.pts.push({ x: t.fx, y: t.fy, t: now });
            } else if (act[i] && now - t.lastSeen <= MAX_COAST) {
                // Ausrollen auf Kurs (Kreuzung / kurzer Ausfall), Linie bleibt zusammenhängend
                const p = pred[i];
                t.fx = p.x; t.fy = p.y; t.t = now;
                t.last = { x: t.fx, y: t.fy };
                t.pts.push({ x: t.fx, y: t.fy, t: now });
            } else if (t.last) {
                t.pts.push({ gap: true, t: now });
                t.last = null; t.fx = undefined;
            }
        });
    }

    global.PoiTracker = { detect, update };
})(window);
