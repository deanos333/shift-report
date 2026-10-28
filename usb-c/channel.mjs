// Shells cut open along a horizontal plane, boxes and bent strips, drawn for a camera.
// Shared by the build and the live page (inlined there with `export` stripped), so the
// plug can be rebuilt each frame on either side of the receptacle's mouth.
export function usbGeometry({ P, iso, pathOf, light, view }) {
  const BANDS = [0, 0.2, 0.42, 0.62];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const unit = (a) => {
    const l = Math.hypot(a[0], a[1], a[2]) || 1;
    return [a[0] / l, a[1] / l, a[2] / l];
  };
  const band = (n) => {
    const s = dot(unit(n), light);
    let t = 0;
    while (t < BANDS.length && s >= BANDS[t]) t++;
    return t;
  };
  const seen = (n) => dot(n, view) > 1e-6;
  const d = (pts, closed) => pathOf(pts.map((p) => iso(p, P)), closed);
  const face = (n, pts) => {
    const b = band(n);
    return b === 4 ? `<path class="iso-top" d="${d(pts, true)}"/>` : `<path class="iso-shade" data-shade="${b}" d="${d(pts, true)}"/>`;
  };
  const line = (pts, tone, closed = false) => `<path class="iso-line" data-tone="${tone}" d="${d(pts, closed)}"/>`;

  // A stadium w x h about its axis, cut at height `cut`: [y, z] points from the far cut point round the bottom to the near one.
  function below(w, h, cut, steps = 12) {
    const r = h / 2;
    const c = w / 2 - r;
    const q = Math.asin(Math.max(-1, Math.min(1, cut / r)));
    const pts = [];
    for (let i = 0; i <= steps; i++) {
      const t = Math.PI - q + ((Math.PI / 2 + q) * i) / steps;
      pts.push([-c + r * Math.cos(t), r * Math.sin(t)]);
    }
    for (let i = 1; i <= steps; i++) {
      const t = -Math.PI / 2 + ((Math.PI / 2 + q) * i) / steps;
      pts.push([c + r * Math.cos(t), r * Math.sin(t)]);
    }
    return pts;
  }

  // An open channel from x0 to x1: `far` is what you see inside it, `near` the near wall, both rims and the front face.
  function channel({ x0, x1, za, w, h, wall, cut, start = true, front = false, back = null, rear = null, tone = "hi" }) {
    const O = below(w, h, cut);
    const I = below(w - wall * 2, h - wall * 2, cut);
    const at = (x, [y, z]) => [x, y, za + z];
    const far = [];
    const farLines = [];
    for (let i = 0; i < I.length - 1; i++) {
      const a = I[i];
      const b = I[i + 1];
      const n = [0, -(b[1] - a[1]), b[0] - a[0]];
      if (!seen(n)) continue;
      far.push(face(n, [at(x0, a), at(x0, b), at(x1, b), at(x1, a)]));
      if (start && back === null) farLines.push(line([at(x0, a), at(x0, b)], tone));
    }
    if (back !== null) {
      far.push(face([1, 0, 0], I.map((p) => at(back, p))));
      farLines.push(line(I.map((p) => at(back, p)), "lo", true));
      const y0 = I[0][0];
      const y1 = I[I.length - 1][0];
      far.push(face([0, 0, 1], [[rear, y0, za + cut], [back, y0, za + cut], [back, y1, za + cut], [rear, y1, za + cut]]));
    }
    farLines.push(line([at(x0, I[0]), at(x1, I[0])], "lo"));
    const near = [];
    const nearLines = [];
    const vis = [];
    for (let i = 0; i < O.length - 1; i++) {
      const a = O[i];
      const b = O[i + 1];
      const n = [0, b[1] - a[1], -(b[0] - a[0])];
      vis.push(seen(n));
      if (!vis[i]) continue;
      near.push(face(n, [at(x0, a), at(x0, b), at(x1, b), at(x1, a)]));
      if (start) nearLines.push(line([at(x0, a), at(x0, b)], tone));
    }
    for (let i = 1; i < vis.length; i++) if (vis[i] !== vis[i - 1]) nearLines.push(line([at(x0, O[i]), at(x1, O[i])], tone));
    const last = O.length - 1;
    const rims = [[O[0], I[0]], [I[I.length - 1], O[last]]];
    for (const [a, b] of rims) {
      near.push(face([0, 0, 1], [at(x0, a), at(x1, a), at(x1, b), at(x0, b)]));
      if (start) nearLines.push(line([at(x0, a), at(x0, b)], tone));
    }
    if (front) {
      const ring = [...O.map((p) => at(x1, p)), ...[...I].reverse().map((p) => at(x1, p))];
      near.push(face([1, 0, 0], ring));
      nearLines.push(line(ring, tone, true));
    }
    nearLines.push(line([at(x0, O[0]), at(x1, O[0])], tone));
    nearLines.push(line([at(x0, I[I.length - 1]), at(x1, I[I.length - 1])], tone));
    nearLines.push(line([at(x0, O[last]), at(x1, O[last])], "lo"));
    return { far: far.join("") + farLines.join(""), near: near.join("") + nearLines.join("") };
  }

  // A box seen from +x, +y, +z; `start` and `end` say whether its x ends are real faces or cuts.
  function box({ x0, x1, y0, y1, z0, z1, start = true, end = true, tone = "mid" }) {
    if (x1 - x0 < 0.01) return "";
    const out = [face([0, 0, 1], [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]]), face([0, 1, 0], [[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]])];
    if (end) out.push(face([1, 0, 0], [[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]]));
    out.push(line([[x0, y0, z1], [x1, y0, z1]], tone), line([[x0, y1, z0], [x1, y1, z0]], tone), line([[x0, y1, z1], [x1, y1, z1]], "lo"));
    if (start) out.push(line([[x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], tone));
    if (end) out.push(line([[x1, y0, z1], [x1, y1, z1], [x1, y1, z0]], "lo"), line([[x1, y1, z0], [x1, y0, z0], [x1, y0, z1]], tone));
    return out.join("");
  }

  // The part of a polyline (monotone in x) between x = a and x = b, and whether each end is a cut.
  function clipX(nodes, a, b) {
    const inside = (p) => p[0] >= a - 1e-9 && p[0] <= b + 1e-9;
    const lerp = (p, q, x) => {
      const t = (x - p[0]) / (q[0] - p[0]);
      return [x, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t];
    };
    const out = [];
    let cutStart = false;
    let cutEnd = false;
    for (let i = 0; i < nodes.length; i++) {
      const p = nodes[i];
      if (inside(p)) {
        if (!out.length && i > 0) {
          const q = nodes[i - 1];
          out.push(lerp(q, p, q[0] < a ? a : b));
          cutStart = true;
        }
        out.push(p);
      } else if (out.length) {
        const q = nodes[i - 1];
        out.push(lerp(q, p, p[0] < a ? a : b));
        cutEnd = true;
        break;
      } else if (i > 0) {
        const q = nodes[i - 1];
        const lo = Math.min(p[0], q[0]);
        const hi = Math.max(p[0], q[0]);
        if (lo < a && hi > b) {
          out.push(lerp(q, p, q[0] < p[0] ? a : b), lerp(q, p, q[0] < p[0] ? b : a));
          cutStart = cutEnd = true;
          break;
        }
      }
    }
    return { nodes: out, cutStart, cutEnd };
  }

  // A thin strip along a polyline, `width` wide along `across`.
  function strip(nodes, across, width, { start = true, end = true, tone = "hi" } = {}) {
    if (nodes.length < 2) return "";
    const h = across.map((v) => (v * width) / 2);
    const lo = nodes.map((p) => [p[0] - h[0], p[1] - h[1], p[2] - h[2]]);
    const hi = nodes.map((p) => [p[0] + h[0], p[1] + h[1], p[2] + h[2]]);
    const segs = [];
    for (let i = 0; i < nodes.length - 1; i++) {
      const s = [nodes[i + 1][0] - nodes[i][0], nodes[i + 1][1] - nodes[i][1], nodes[i + 1][2] - nodes[i][2]];
      let n = [s[1] * across[2] - s[2] * across[1], s[2] * across[0] - s[0] * across[2], s[0] * across[1] - s[1] * across[0]];
      if (!seen(n)) n = n.map((v) => -v);
      const mid = [(nodes[i][0] + nodes[i + 1][0]) / 2, (nodes[i][1] + nodes[i + 1][1]) / 2, (nodes[i][2] + nodes[i + 1][2]) / 2];
      segs.push({ depth: dot(mid, view), svg: face(n, [lo[i], lo[i + 1], hi[i + 1], hi[i]]) });
    }
    segs.sort((p, q) => p.depth - q.depth);
    const out = segs.map((s) => s.svg);
    out.push(line(lo, tone), line(hi, tone));
    if (start) out.push(line([lo[0], hi[0]], tone));
    if (end) out.push(line([lo[lo.length - 1], hi[hi.length - 1]], tone));
    return out.join("");
  }

  return { below, channel, box, clipX, strip };
}

// The plug's open shell and everything inside it, for the stretch of it on one side of the mouth (world x = 0).
// `side` is "in" (x < 0, inside the receptacle) or "out"; `layer` is "low" (under the tongue) or "high".
export function usbPlugSvg(geo, M, X, side, layer) {
  const len = M.len;
  const a = side === "in" ? 0 : Math.max(0, -X);
  const b = side === "in" ? Math.min(len, -X) : len;
  if (b - a < 0.05) return "";
  const x0 = a + X;
  const x1 = b + X;
  const start = a === 0;
  const za = M.za;
  const out = [];
  const shell = geo.channel({ x0, x1, za, w: M.w, h: M.h, wall: M.wall, cut: M.cut, start, tone: "lit" });
  const housing = (z0, z1) => {
    const h0 = Math.max(M.housing, a);
    if (h0 >= b) return "";
    return geo.box({ x0: h0 + X, x1: x1, y0: -M.housingHalf, y1: M.housingHalf, z0: za + z0, z1: za + z1, start: h0 === M.housing, end: false });
  };
  const beams = (sign) =>
    M.pads.map((y) => {
      const nodes = M.beam.map(([x, z]) => [x + X, y, za + sign * z]);
      const c = geo.clipX(nodes, x0, x1);
      return geo.strip(c.nodes, [0, 1, 0], M.beamWidth, { start: !c.cutStart, end: !c.cutEnd });
    });
  const latch = (sign) => {
    const nodes = M.latch.map(([x, y]) => [x + X, sign * y, za]);
    const c = geo.clipX(nodes, x0, x1);
    return geo.strip(c.nodes, [0, 0, 1], M.latchHeight, { start: !c.cutStart, end: !c.cutEnd, tone: "mid" });
  };
  if (layer === "low") {
    out.push(shell.far, latch(-1), ...beams(-1), housing(-M.h / 2 + M.wall, -M.housingInset));
  } else {
    out.push(...beams(1), housing(M.housingInset, M.cut), latch(1), shell.near);
  }
  return out.join("");
}
