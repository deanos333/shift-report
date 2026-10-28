import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "../.claude/skills/anatomy/kit/iso-kit.mjs";
import * as G from "../.claude/skills/anatomy/kit/lathe.mjs";
import { kitScript } from "../.claude/skills/anatomy/scripts/inline-kit.mjs";
import { readFileSync } from "node:fs";
import { usbGeometry, usbPlugSvg } from "./channel.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const theme = process.argv.includes("--light") ? "light" : "dark";

// World units: 12 per millimetre. x is the mating axis (the plug travels toward -x), z is up.
const MM = 12;
const WIDTH = 640;
const HEIGHT = 400;

const PLATE = { x: -196, y: -96, w: 604, d: 192, r: 8 };
const PLATE_H = 12;
const FOOT_H = 5;

// Board on four stand-offs; the receptacle overhangs its front edge by 1 mm so an overmold clears it.
const BOARD = { x: -186, y: -72, w: 174, d: 144, r: 5 };
const BOARD_Z = 31;
const BOARD_TOP = BOARD_Z + 1.6 * MM;

// Receptacle: shell 8.94 x 3.26 mm, opening 8.34 x 2.56 mm, tongue 6.69 x 0.7 mm, 12 pads per side at 0.5 mm pitch.
const SHELL = { w: 8.94 * MM, h: 3.26 * MM };
const OPEN = { w: 8.34 * MM, h: 2.56 * MM };
const ZA = BOARD_TOP + SHELL.h / 2;
const SHELL_BACK = -88;
const CAVITY_BACK = -80;
const TONGUE = { tip: -26, back: CAVITY_BACK, half: 6.69 * MM / 2, thick: 0.7 * MM };
const PITCH = 0.5 * MM;
const PAD_W = 0.25 * MM;
const PADS = Array.from({ length: 12 }, (_, i) => (i - 5.5) * PITCH);
const POWER = new Set([0, 3, 8, 11]); // A1 GND, A4 VBUS, A9 VBUS, A12 GND
const PAD_START = { power: TONGUE.tip - 2, signal: TONGUE.tip - 6 };
const PAD_END = -66;

// Plug, built with its shell face at x = 0 and moved as one group with its carriage.
const PLUG = { w: 8.25 * MM, h: 2.4 * MM, len: 6.65 * MM };
const MOLD = { w: 128, h: 60, r: 14, from: PLUG.len, to: 200 };
const BOOT = { from: 200, to: 248, r0: 26, r1: 21 };
const CABLE = { from: 248, to: 300, r: 18 };
const CONTACT = 34; // plug contact points sit 2.8 mm behind the shell face
const CUT = 9; // both shells are cut away 0.75 mm above the axis, just over the tongue
const REST = 90;
const HOME = -PLUG.len; // overmold meets the receptacle shell: 6.65 mm in
const CARRIAGE = { x: 96, y: -78, w: 96, d: 156, r: 3 };
const CARRIAGE_Z = 5;
const CARRIAGE_TOP = 11;
const RAIL_Y = [-54, 48];
const RAIL_FROM = 8;
const RAIL_TO = 300;

const P = k.fitProjection(
  [
    ...k.boxCorners(PLATE, -PLATE_H - FOOT_H, 0),
    [BOARD.x, BOARD.y, BOARD_TOP + 8],
    [0, -SHELL.w / 2, ZA + SHELL.h / 2],
    [REST + CABLE.to, 0, ZA + CABLE.r],
    [REST + MOLD.to, -MOLD.w / 2, ZA + MOLD.h / 2],
  ],
  WIDTH,
  HEIGHT,
  { pad: 26, azimuth: 52 },
);

const V = G.viewOf(P);
const at = (point) => k.iso(point, P);
const S = (paths, style) => k.solidSvg(paths, style);
const L = (d, style) => k.lineSvg(d, style);
const D = (points, style) => k.dotsSvg(points, style);
const path = (points, closed = true) => k.pathOf(points.map(at), closed);
const byDepth = (points) => [...points].sort((a, b) => k.depthOf([a[0], a[1], 0], P) - k.depthOf([b[0], b[1], 0], P));

// A rounded rectangle in a cross-section plane, as [y, z] points about the axis.
function section(w, h, r, steps = 8) {
  const out = [];
  const rr = Math.min(r, w / 2, h / 2);
  const corners = [[w / 2 - rr, h / 2 - rr, 0], [-w / 2 + rr, h / 2 - rr, 90], [-w / 2 + rr, -h / 2 + rr, 180], [w / 2 - rr, -h / 2 + rr, 270]];
  for (const [cy, cz, start] of corners)
    for (let i = 0; i <= steps; i++) {
      const a = ((start + (90 * i) / steps) * Math.PI) / 180;
      out.push([cy + rr * Math.cos(a), cz + rr * Math.sin(a)]);
    }
  return out;
}
const stadium = (w, h, steps = 10) => section(w, h, h / 2, steps);
const XF = (x0 = 0) => G.frameOf([x0, 0, ZA], [1, 0, 0], [0, 1, 0], [0, 0, 1]);
const onSection = (x, poly) => poly.map(([y, z]) => [x, y, ZA + z]);

// ---------- bench ----------
function plate() {
  const out = [`<path class="iso-halo" d="${k.haloOf(PLATE, -PLATE_H - FOOT_H, PLATE_H, P)}"/>`];
  for (const [x, y] of byDepth(k.corners(PLATE, 24))) {
    out.push(S(k.cylinder(x, y, 7, -PLATE_H - FOOT_H, 1.6, P, 28), { tone: "lo" }));
    out.push(S(k.cylinder(x, y, 5.4, -PLATE_H - FOOT_H + 1.6, FOOT_H - 1.6, P, 28), { tone: "mid" }));
  }
  out.push(S(k.slabOf(PLATE, -PLATE_H, PLATE_H, P, 8, 1.6), { tone: "mid" }));
  out.push(L(k.planOutline(k.insetPlan(PLATE, 5), 0, P), { tone: "lo" }));
  const screws = k.corners(PLATE, 11);
  out.push(L(screws.map(([x, y]) => k.ring(x, y, 2.2, 0, P, 16)).join(""), { tone: "lo" }));
  out.push(D(screws.map(([x, y]) => at([x, y, 0])), { size: 0.5 }));
  // millimetre ruler along the near edge, zero at the receptacle's mouth
  const strip = { x: -40, y: PLATE.y + PLATE.d - 16, w: 340, d: 7, r: 1 };
  out.push(S(k.slabOf(strip, 0, 0.6, P, 3), { tone: "lo", crease: "none" }));
  const ticks = k.topTicks(strip.x + 4, strip.x + 4 + MM * 27, MM / 2, 2, strip.y + 0.8, 0.6, [1.6, 3.4], P);
  out.push(L(ticks.minor, { tone: "lo" }), L(ticks.major, { tone: "mid" }));
  out.push(D([at([strip.x + 2, strip.y + 3.5, 0.6]), at([strip.x + strip.w - 2, strip.y + 3.5, 0.6])], { size: 0.45 }));
  // label plate
  const label = { x: -176, y: PLATE.y + PLATE.d - 30, w: 56, d: 20, r: 1.5 };
  out.push(S(k.slabOf(label, 0, 0.8, P, 4), { tone: "lo", crease: "none" }));
  out.push(L(k.planOutline(k.insetPlan(label, 1.6), 0.8, P, 4), { tone: "faint" }));
  [[6, 40], [10, 28], [14, 34]].forEach(([dy, len]) => out.push(L(k.lineOnTop([label.x + 6, label.y + dy], [label.x + 6 + len, label.y + dy], 0.8, P), { tone: "lo", free: true })));
  out.push(D([at([label.x + label.w - 4, label.y + 4, 0.8]), at([label.x + label.w - 4, label.y + label.d - 4, 0.8])], { size: 0.4 }));
  return out.join("");
}

function rails() {
  const out = [];
  for (const y of RAIL_Y) {
    out.push(S(k.slabOf({ x: RAIL_FROM, y, w: RAIL_TO - RAIL_FROM, d: 6, r: 1 }, 0, CARRIAGE_Z, P, 3, 0.4), { tone: "mid" }));
    const bolts = Array.from({ length: 6 }, (_, i) => [RAIL_FROM + 20 + i * 50, y + 3]);
    out.push(D(bolts.map(([x, yy]) => at([x, yy, CARRIAGE_Z])), { size: 0.4 }));
  }
  for (const x of [RAIL_FROM - 6, RAIL_TO]) {
    out.push(S(k.slabOf({ x, y: RAIL_Y[0] - 4, w: 6, d: RAIL_Y[1] - RAIL_Y[0] + 14, r: 1.2 }, 0, 10, P, 3, 0.5), { tone: "mid" }));
    out.push(D(RAIL_Y.map((y) => at([x + 3, y + 3, 10])), { size: 0.45 }));
  }
  return out.join("");
}

// ---------- board ----------
const LEGS_A = PADS.map((y) => ({ x: SHELL_BACK - 12, y: y - PAD_W / 2 - 0.4, w: 12, d: PAD_W + 0.8, r: 0.3 }));
const LEGS_B = PADS.map((y) => ({ x: SHELL_BACK - 24, y: y + PITCH / 2 - PAD_W / 2 - 0.4, w: 12, d: PAD_W + 0.8, r: 0.3 }));
const R_CC1 = { x: -140, y: -30, w: 12, d: 6 };
const R_CC2 = { x: -140, y: -10, w: 12, d: 6 };
const CAP = { x: -140, y: 22, w: 12, d: 6 };
const LED = { x: -166, y: 42, w: 19, d: 10 };
const R_LED = { x: -140, y: 42, w: 12, d: 6 };

function chip({ x, y, w, d }, tone = "mid", h = 4) {
  const cap = Math.min(3, w / 4);
  const out = [];
  const padL = { x: x - 1, y: y - 1, w: cap + 2, d: d + 2, r: 0.5 };
  const padR = { x: x + w - cap - 1, y: y - 1, w: cap + 2, d: d + 2, r: 0.5 };
  out.push(S(k.slabOf(padL, BOARD_TOP, 0.4, P, 2), { tone: "lo", crease: "none" }));
  out.push(S(k.slabOf(padR, BOARD_TOP, 0.4, P, 2), { tone: "lo", crease: "none" }));
  out.push(S(k.slabOf({ x, y, w, d, r: 0.4 }, BOARD_TOP + 0.4, h, P, 2), { tone, crease: "lo" }));
  out.push(L(k.lineOnTop([x + cap, y], [x + cap, y + d], BOARD_TOP + 0.4 + h, P) + k.lineOnTop([x + w - cap, y], [x + w - cap, y + d], BOARD_TOP + 0.4 + h, P), { tone: "lo" }));
  return out.join("");
}
const padEnd = (p) => [p.x - 1, p.y + p.d / 2];

function board() {
  const out = [];
  for (const [x, y] of byDepth(k.corners(BOARD, 12))) {
    out.push(S(k.cylinder(x, y, 6, 0, BOARD_Z, P, 6), { tone: "mid" }));
  }
  out.push(`<path class="iso-halo" d="${k.haloOf(k.insetPlan(BOARD, 8), BOARD_Z, 1, P)}" style="filter:blur(6px);opacity:.5"/>`);
  out.push(S(k.slabOf(BOARD, BOARD_Z, BOARD_TOP - BOARD_Z, P, 6, 0.8), { tone: "mid", inner: L(k.sideSeam(BOARD, BOARD_Z + 0.8 * MM, P, 6), { tone: "faint" }) }));
  for (const [x, y] of k.corners(BOARD, 12)) {
    out.push(S(k.cylinder(x, y, 4.6, BOARD_TOP, 2.4, P, 24), { tone: "mid" }));
    out.push(L(k.lineOnTop([x - 3.2, y + 3.2], [x + 3.2, y - 3.2], BOARD_TOP + 2.4, P), { tone: "lo" }));
  }
  // silkscreen courtyard round the receptacle footprint
  out.push(L(k.planOutline({ x: SHELL_BACK - 30, y: -SHELL.w / 2 - 6, w: BOARD.x + BOARD.w - (SHELL_BACK - 30), d: SHELL.w + 12, r: 2 }, BOARD_TOP, P, 3), { tone: "faint" }));
  // SMT land pads under both leg rows
  for (const leg of [...LEGS_A, ...LEGS_B]) out.push(S(k.slabOf({ x: leg.x - 2, y: leg.y - 0.4, w: leg.w + 2, d: leg.d + 0.8, r: 0.3 }, BOARD_TOP, 0.3, P, 2), { tone: "lo", crease: "none" }));
  // traces: CC1 (A5) and CC2 (B5) to their 5.1 kOhm pull-downs, VBUS (A4) to the cap and the LED, GND (A1) to the cap
  const z = BOARD_TOP + 0.3;
  const from = (leg) => [leg.x - 2, leg.y + leg.d / 2];
  const trace = (points) => L(k.onTop(points, z, P), { tone: "mid" });
  const a5 = from(LEGS_A[4]);
  const b5 = from(LEGS_B[6]);
  const a4 = from(LEGS_A[3]);
  const a1 = from(LEGS_A[0]);
  out.push(trace([a5, [a5[0] - 4, a5[1]], [R_CC2.x + R_CC2.w + 14, R_CC2.y + R_CC2.d / 2], [R_CC2.x + R_CC2.w + 1, R_CC2.y + R_CC2.d / 2]]));
  out.push(trace([b5, [b5[0] - 6, b5[1]], [b5[0] - 6, 4], [R_CC1.x + R_CC1.w + 22, 4], [R_CC1.x + R_CC1.w + 22, R_CC1.y + R_CC1.d / 2], [R_CC1.x + R_CC1.w + 1, R_CC1.y + R_CC1.d / 2]]));
  out.push(trace([a1, [a1[0] - 10, a1[1]], [a1[0] - 10, -48], [R_CC1.x - 12, -48], [R_CC1.x - 12, R_CC1.y + R_CC1.d / 2], padEnd(R_CC1)]));
  out.push(trace([[R_CC1.x - 12, R_CC2.y + R_CC2.d / 2], padEnd(R_CC2)]));
  out.push(trace([[R_CC1.x - 12, R_CC2.y + R_CC2.d / 2], [R_CC1.x - 12, CAP.y + CAP.d / 2], padEnd(CAP)]));
  out.push(trace([a4, [a4[0] - 14, a4[1]], [a4[0] - 14, CAP.y + CAP.d / 2], [CAP.x + CAP.w + 1, CAP.y + CAP.d / 2]]));
  out.push(trace([[a4[0] - 14, CAP.y + CAP.d / 2], [a4[0] - 14, R_LED.y + R_LED.d / 2], [R_LED.x + R_LED.w + 1, R_LED.y + R_LED.d / 2]]));
  out.push(trace([padEnd(R_LED), [LED.x + LED.w + 1, LED.y + LED.d / 2]]));
  out.push(D([[R_CC1.x - 12, R_CC2.y + R_CC2.d / 2], [a4[0] - 14, CAP.y + CAP.d / 2]].map(([x, y]) => at([x, y, z])), { size: 0.9, tone: "mid" }));
  out.push(chip(R_CC1), chip(R_CC2), chip(CAP, "hi", 5), chip(R_LED));
  return out.join("");
}

function led() {
  return `<g data-part="led">${chip(LED, "hi", 6)}</g>`;
}

// ---------- receptacle ----------
const SHELL_POLY = stadium(SHELL.w, SHELL.h, 12);
const OPEN_POLY = stadium(OPEN.w, OPEN.h, 12);

function receptacleBack() {
  const out = [];
  // leg rows run out of the shell's rear cover onto their lands
  for (const leg of [...LEGS_B, ...LEGS_A]) out.push(S(k.slabOf(leg, BOARD_TOP + 0.3, 1.4, P, 2), { tone: "hi", crease: "none" }));
  // rear cover
  out.push(S(k.slabOf({ x: SHELL_BACK - 3, y: -SHELL.w / 2 + 8, w: 4, d: SHELL.w - 16, r: 1 }, BOARD_TOP, SHELL.h / 2 + CUT - 2, P, 3), { tone: "mid" }));
  // through-hole hold-down tabs on the far side
  for (const x of [-72, -26]) out.push(S(k.slabOf({ x, y: -SHELL.w / 2 - 2, w: 8, d: 2, r: 0.4 }, BOARD_TOP - 0.2, SHELL.h / 2, P, 2), { tone: "mid" }));
  return out.join("");
}

function receptacleWhole() {
  const out = [];
  const F = XF(0);
  const shell = G.prismOf(F, SHELL_POLY, SHELL_BACK, 0, P);
  const flare = L(path(onSection(0, stadium(OPEN.w + 3, OPEN.h + 3, 12))), { tone: "faint" });
  // two grounding springs pressed out of the top of the shell
  const springs = [-1, 1].map((side) => path([[-22, side * 12, ZA + SHELL.h / 2], [-8, side * 12, ZA + SHELL.h / 2], [-8, side * 22, ZA + SHELL.h / 2], [-22, side * 22, ZA + SHELL.h / 2]])).join("");
  const seam = path([[SHELL_BACK, 0, ZA + SHELL.h / 2], [0, 0, ZA + SHELL.h / 2]], false);
  out.push(S(shell, { tone: "hi", inner: flare + L(springs, { tone: "lo" }) + L(seam, { tone: "faint" }) }));
  // near-side hold-down tabs and their solder fillets
  for (const x of [-72, -26]) {
    out.push(S(k.slabOf({ x, y: SHELL.w / 2, w: 8, d: 2, r: 0.4 }, BOARD_TOP - 0.2, SHELL.h / 2, P, 2), { tone: "mid" }));
    out.push(S(k.slabOf({ x: x - 2, y: SHELL.w / 2 - 1, w: 12, d: 5, r: 2 }, BOARD_TOP, 0.8, P, 4), { tone: "lo", crease: "none" }));
  }
  out.push(cavity());
  return out.join("");
}

// What you see through the mouth: the far walls of the cavity, its back wall, and the tongue with its pads.
function cavity() {
  const parts = [];
  const n = OPEN_POLY.length;
  const toneClass = (normal) => {
    const band = G.toneOf(normal, P);
    return band === 4 ? `class="iso-top"` : `class="iso-shade" data-shade="${band}"`;
  };
  for (let j = 0; j < n; j++) {
    const [y0, z0] = OPEN_POLY[j];
    const [y1, z1] = OPEN_POLY[(j + 1) % n];
    const mid = [(y0 + y1) / 2, (z0 + z1) / 2];
    let normal = [0, -(z1 - z0), y1 - y0];
    if (normal[1] * -mid[0] + normal[2] * -mid[1] < 0) normal = normal.map((v) => -v);
    if (G.dot3(normal, V) <= 0) continue;
    parts.push(`<path ${toneClass(normal)} d="${path([[0, y0, ZA + z0], [0, y1, ZA + z1], [CAVITY_BACK, y1, ZA + z1], [CAVITY_BACK, y0, ZA + z0]])}"/>`);
  }
  parts.push(`<path ${toneClass([1, 0, 0])} d="${path(onSection(CAVITY_BACK, OPEN_POLY))}"/>`);
  parts.push(L(path(onSection(CAVITY_BACK, OPEN_POLY)), { tone: "faint" }));
  const lip = path(onSection(0, OPEN_POLY));
  return `<clipPath id="usb-mouth"><path d="${lip}"/></clipPath><g clip-path="url(#usb-mouth)"><g class="usb-cavity"><path class="iso-fill" d="${lip}"/>${parts.join("")}</g>${tongue()}</g>${L(lip, { tone: "lo" })}`;
}

// The tongue: notched at both sides for the plug's latches, the mid-plate showing on its edge, 12 pads on top.
function tongue() {
  const parts = [];
  const t = TONGUE;
  const notch = [t.tip - 16, t.tip - 9];
  const ring = [
    [t.back, -t.half], [notch[0], -t.half], [notch[0], -t.half + 3], [notch[1], -t.half + 3], [notch[1], -t.half], [t.tip - 2, -t.half], [t.tip, -t.half + 2],
    [t.tip, t.half - 2], [t.tip - 2, t.half], [notch[1], t.half], [notch[1], t.half - 3], [notch[0], t.half - 3], [notch[0], t.half], [t.back, t.half],
  ];
  const top = ZA + t.thick / 2;
  const tongue = k.extrude(ring, ZA - t.thick / 2, t.thick, P, { convex: false });
  parts.push(S(tongue, { tone: "hi", crease: "lo", inner: L(k.ringSeam(ring, ZA, P), { tone: "faint" }) }));
  PADS.forEach((y, i) => {
    const start = POWER.has(i) ? PAD_START.power : PAD_START.signal;
    parts.push(S(k.slabOf({ x: PAD_END, y: y - PAD_W / 2, w: start - PAD_END, d: PAD_W, r: 0.4 }, top, 0.3, P, 2), { tone: "hi", crease: "none" }));
  });
  return parts.join("");
}

// The receptacle cut open just above the tongue: `far` is the inside, `near` the near wall, rims and mouth.
const geo = usbGeometry({ P, iso: k.iso, pathOf: k.pathOf, light: G.lightOf(P), view: V });
function receptacleCut() {
  const wall = (SHELL.h - OPEN.h) / 2;
  const shell = geo.channel({ x0: SHELL_BACK, x1: 0, za: ZA, w: SHELL.w, h: SHELL.h, wall, cut: CUT, front: true, back: CAVITY_BACK, rear: SHELL_BACK });
  const near = [shell.near];
  for (const x of [-72, -26]) {
    near.push(S(k.slabOf({ x, y: SHELL.w / 2, w: 8, d: 2, r: 0.4 }, BOARD_TOP - 0.2, SHELL.h / 2, P, 2), { tone: "mid" }));
    near.push(S(k.slabOf({ x: x - 2, y: SHELL.w / 2 - 1, w: 12, d: 5, r: 2 }, BOARD_TOP, 0.8, P, 4), { tone: "lo", crease: "none" }));
  }
  return { far: `<g class="usb-cavity">${shell.far}</g>`, near: near.join("") };
}

// ---------- plug and carriage (local: shell face at x = 0) ----------
const PLUG_POLY = stadium(PLUG.w, PLUG.h, 12);
const MOLD_POLY = section(MOLD.w, MOLD.h, MOLD.r, 8);
const MOLD_TOP = ZA + MOLD.h / 2;
const MOLD_BOTTOM = ZA - MOLD.h / 2;
const JAW = { x: 110, w: 68, t: 8 };

function carriagePlate() {
  const out = [`<path class="iso-halo" d="${k.haloOf(k.insetPlan(CARRIAGE, 4), CARRIAGE_Z, 0.1, P)}" style="filter:blur(5px)"/>`];
  out.push(S(k.slabOf(CARRIAGE, CARRIAGE_Z, CARRIAGE_TOP - CARRIAGE_Z, P, 5, 0.6), { tone: "mid" }));
  for (const y of RAIL_Y)
    for (const x of [CARRIAGE.x + 6, CARRIAGE.x + CARRIAGE.w - 22]) {
      out.push(S(k.slabOf({ x, y: y - 3, w: 16, d: 12, r: 1.2 }, CARRIAGE_TOP, 4, P, 3, 0.4), { tone: "mid" }));
      out.push(D([at([x + 4, y + 3, CARRIAGE_TOP + 4]), at([x + 12, y + 3, CARRIAGE_TOP + 4])], { size: 0.4 }));
    }
  return out.join("");
}

function clampBack() {
  const out = [];
  // V-block the overmold rests in, and the far jaw
  out.push(S(k.slabOf({ x: JAW.x - 4, y: -MOLD.w / 2 + 6, w: JAW.w + 8, d: MOLD.w - 12, r: 2 }, CARRIAGE_TOP, MOLD_BOTTOM - CARRIAGE_TOP, P, 3, 0.5), { tone: "mid" }));
  out.push(S(k.slabOf({ x: JAW.x, y: -MOLD.w / 2 - JAW.t, w: JAW.w, d: JAW.t, r: 1.5 }, CARRIAGE_TOP, MOLD_TOP - 18 - CARRIAGE_TOP, P, 3, 0.5), { tone: "mid" }));
  return out.join("");
}

function plugShell() {
  const F = XF(0);
  const shell = G.prismOf(F, PLUG_POLY, 0, PLUG.len, P);
  const seam = path([[0, 0, ZA + PLUG.h / 2], [PLUG.len, 0, ZA + PLUG.h / 2]], false);
  return S(shell, { tone: "hi", lit: true, inner: L(seam, { tone: "faint" }) });
}

function overmold() {
  const out = [];
  const F = XF(0);
  const slots = Array.from({ length: 6 }, (_, i) => {
    const x = 138 + i * 9;
    return path([[x, MOLD.w / 2, ZA - 12], [x + 3, MOLD.w / 2, ZA - 12], [x + 3, MOLD.w / 2, ZA + 12], [x, MOLD.w / 2, ZA + 12]]);
  }).join("");
  const band = path(onSection(MOLD.from + 6, MOLD_POLY).filter(([, y, z]) => true), true);
  out.push(S(G.prismOf(F, MOLD_POLY, MOLD.from, MOLD.to, P), { tone: "hi", inner: L(slots, { tone: "lo" }) }));
  // the one engraved mark: printed on the A side only, so it shows which way up the plug is
  out.push(`<g data-part="mark">${k.faceTextSvg(k.topMatrix([118, 0], MOLD_TOP, P, "x"), "USB-C", { size: 9, tone: "lo", anchor: "middle" })}</g>`);
  void band;
  return out.join("");
}

function carriageFront() {
  const out = [];
  out.push(S(k.slabOf({ x: JAW.x, y: MOLD.w / 2, w: JAW.w, d: JAW.t, r: 1.5 }, CARRIAGE_TOP, MOLD_TOP - 18 - CARRIAGE_TOP, P, 3, 0.5), { tone: "mid" }));
  out.push(D([at([JAW.x + 6, MOLD.w / 2 + JAW.t / 2, MOLD_TOP - 18]), at([JAW.x + JAW.w - 6, MOLD.w / 2 + JAW.t / 2, MOLD_TOP - 18])], { size: 0.45 }));
  // thumb screw that clamps the overmold
  const cx = JAW.x + JAW.w / 2;
  const cz = (CARRIAGE_TOP + MOLD_TOP - 18) / 2 + 4;
  const F = G.frameOf([cx, MOLD.w / 2 + JAW.t, cz], [0, 1, 0], [1, 0, 0], [0, 0, 1]);
  out.push(S(G.disc(0, 4, 3.4, F, P), { tone: "mid" }));
  const knob = G.disc(4, 11, 8, F, P);
  out.push(S(knob, { tone: "mid", inner: k.fadedSvg(G.ribsOf(F, 4, 11, 8, 30, P, { fade: [0.1, 0.55] }), { tone: "lo" }) }));
  out.push(L(G.circleOf(F, 11, 2.2, P), { tone: "lo" }));
  return out.join("");
}

function bootAndCable() {
  const out = [];
  const F = XF(0);
  const slope = (BOOT.r1 - BOOT.r0) / (BOOT.to - BOOT.from);
  const radius = (s) => BOOT.r0 + slope * (s - BOOT.from);
  const ribs = [210, 220, 230, 240].map((s) => G.arcOf(F, s, radius(s), P, { slope })).join("");
  out.push(S(G.solidOf([[BOOT.from, BOOT.r0], [BOOT.to, BOOT.r1]], F, P), { tone: "hi", inner: L(ribs, { tone: "lo" }) }));
  out.push(S(G.disc(CABLE.from, CABLE.to, CABLE.r, F, P), { tone: "mid" }));
  // the cut end of the cable: jacket, braid, and the conductors inside
  const face = CABLE.to;
  const cut = [L(G.circleOf(F, face, CABLE.r - 2, P), { tone: "lo" }), L(G.circleOf(F, face, CABLE.r - 3.4, P), { tone: "faint" })];
  const wires = [[0, 8.4, 2.6], [0, -8.4, 2.6], [8.4, 0, 2.6], [-8.4, 0, 2.6], [6, 6, 1.8], [-6, 6, 1.8], [6, -6, 1.8], [-6, -6, 1.8], [0, 0, 1.6]];
  for (const [y, z, r] of wires) {
    const W = G.frameOf([0, y, ZA + z], [1, 0, 0], [0, 1, 0], [0, 0, 1]);
    cut.push(L(G.circleOf(W, face, r, P), { tone: r > 2 ? "mid" : "lo" }));
    cut.push(D([at([face, y, ZA + z])], { size: r > 2 ? 0.7 : 0.5, tone: "mid" }));
  }
  out.push(cut.join(""));
  return out.join("");
}

// The plug shell is clipped to the sweep of its own section from the mouth outward, so the part inside the receptacle disappears.
const SWEEP = G.hullOf([...onSection(0, stadium(PLUG.w + 2, PLUG.h + 2)), ...onSection(1200, stadium(PLUG.w + 2, PLUG.h + 2))].map(at));

const PLUG_MODEL = {
  len: PLUG.len, w: PLUG.w, h: PLUG.h, wall: 3, cut: CUT, za: ZA,
  housing: 46, housingHalf: 40, housingInset: 5.5, pads: PADS,
  beam: [[46, 7.5], [CONTACT, TONGUE.thick / 2 + 0.6], [29, 6.2]], beamWidth: 2.4,
  latch: [[76, 44], [46, 44], [42, 40], [38, 40], [35, 43]], latchHeight: 4,
};
const dyn = (name, side, layer) => `<g data-dyn="${name}">${usbPlugSvg(geo, PLUG_MODEL, REST, side, layer)}</g>`;
const REC = receptacleCut();

const moving = (part, svg) => `<g data-part="${part}" transform="${k.translateAlong(P, [REST, 0, 0])}">${svg}</g>`;

const svg = k.figureSvg({
  width: WIDTH,
  height: HEIGHT,
  label:
    "A USB-C receptacle soldered to a small circuit board, and a USB-C plug held in a clamp on a carriage that slides on two rails toward it. Through the receptacle's mouth you can see the tongue with its row of 12 gold pads; the four power pads are longer than the rest. The plug is a thin metal shell in a moulded body with a strain-relief boot and a cut cable showing its conductors.",
  body: [
    plate(),
    rails(),
    board(),
    led(),
    receptacleBack(),
    `<g class="usb-cut">${REC.far}${dyn("in-low", "in", "low")}${tongue()}${dyn("in-high", "in", "high")}${REC.near}</g>`,
    `<g class="usb-whole">${receptacleWhole()}</g>`,
    moving("carriage-plate", carriagePlate()),
    `<g class="usb-cut">${dyn("out-low", "out", "low")}${dyn("out-high", "out", "high")}</g>`,
    `<g class="usb-whole"><clipPath id="usb-sweep"><path d="${k.pathOf(SWEEP, true)}"/></clipPath><g clip-path="url(#usb-sweep)">${moving("shell", plugShell())}</g></g>`,
    moving("clamp-back", clampBack()),
    moving("mold", overmold()),
    moving("carriage-front", carriageFront()),
    moving("boot", bootAndCable()),
  ],
});

// ---------- live ----------
const shared = readFileSync(join(HERE, "channel.mjs"), "utf8").replace(/^export /gm, "");
const live = `
const P = ${JSON.stringify(P)};
const MM = ${MM}, REST = ${REST}, HOME = ${HOME};
const MAKE = { shell: -1 * MM, power: ${PAD_START.power - CONTACT}, signal: ${PAD_START.signal - CONTACT}, latch: HOME + 4 };
const MODEL = ${JSON.stringify(PLUG_MODEL)};
const geo = usbGeometry({ P, iso, pathOf, light: ${JSON.stringify(G.lightOf(P))}, view: ${JSON.stringify(V)} });
const stage = document.querySelector(".iso-stage");
const svg = stage.querySelector("svg");
const groups = [...svg.querySelectorAll("[data-part]")].filter((g) => !["led", "mark"].includes(g.dataset.part));
const dyns = [...svg.querySelectorAll("[data-dyn]")].map((g) => ({ g, side: g.dataset.dyn.split("-")[0], layer: g.dataset.dyn.split("-")[1] }));
const mark = svg.querySelector('[data-part="mark"]');
const ledSolid = svg.querySelector('[data-part="led"] .iso-solid:last-of-type');
const button = document.querySelector(".usb-mode");
const readout = document.querySelector("[data-readout]");
const still = matchMedia("(prefers-reduced-motion: reduce)");
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
let x = REST, target = REST, flipped = false, pendingFlip = false, cut = false, drawnAt = null;
let frame = 0, last = 0, clock = 0, touring = true, visible = false, idleTimer = 0;
function stateText() {
  const mm = (Math.max(0, -x) / MM).toFixed(2) + " mm in";
  if (x > 0) return "unplugged · " + (flipped ? "B side up" : "A side up");
  if (x > MAKE.shell) return mm + " · shell entering";
  if (x > MAKE.power) return mm + " · shells grounded";
  if (x > MAKE.signal) return mm + " · GND + VBUS made";
  if (x > MAKE.latch) return mm + " · data + CC made";
  return mm + " · latched · " + (flipped ? "CC2" : "CC1") + " sees 5.1 kΩ";
}
function setCut(next) {
  cut = next;
  stage.dataset.mode = cut ? "cut" : "whole";
  button.textContent = cut ? "Show whole" : "Cut away";
  button.setAttribute("aria-pressed", String(cut));
  drawnAt = null;
}
function draw() {
  const t = translateAlong(P, [x, 0, 0]);
  for (const g of groups) g.setAttribute("transform", t);
  if (cut && drawnAt !== x) {
    for (const d of dyns) d.g.innerHTML = usbPlugSvg(geo, MODEL, x, d.side, d.layer);
    drawnAt = x;
  }
  mark.style.display = flipped ? "none" : "";
  const powered = x <= MAKE.power;
  if (powered !== ledSolid.hasAttribute("data-lit")) ledSolid.toggleAttribute("data-lit", powered);
  const text = stateText();
  if (readout.textContent !== text) readout.textContent = text;
  stage.setAttribute("aria-valuenow", (Math.max(0, -x) / MM).toFixed(2));
  stage.setAttribute("aria-valuetext", text);
}
// idle tour: plug in whole, then cut away, then turn the plug over and plug it in again
const TOUR = [[0, "whole"], [0.6, HOME], [3.4, REST], [5.2, "cut"], [6.0, HOME], [9.4, REST], [11.2, "flip"], [12.0, HOME], [14.8, REST], [16.6, "flip"]];
const LOOP = 17.4;
let lastStep = -1;
function tourTarget(dt) {
  clock = (clock + dt) % LOOP;
  let step = 0;
  TOUR.forEach(([time], i) => { if (clock >= time) step = i; });
  if (step === lastStep) return;
  lastStep = step;
  const what = TOUR[step][1];
  if (what === "flip") flipped = !flipped;
  else if (what === "cut" || what === "whole") setCut(what === "cut");
  else target = what;
}
function tick(now) {
  const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60;
  last = now;
  if (touring) tourTarget(dt);
  x = still.matches ? target : x + (target - x) * (1 - Math.exp(-dt / 0.34));
  if (Math.abs(target - x) < 0.02) x = target;
  if (pendingFlip && x >= REST - 0.5) { flipped = !flipped; pendingFlip = false; target = HOME; }
  draw();
  const settled = !touring && x === target && !pendingFlip;
  frame = visible && !settled ? requestAnimationFrame(tick) : 0;
}
const run = () => { if (!frame && visible) { last = 0; frame = requestAnimationFrame(tick); } };
const quiet = () => { touring = false; clearTimeout(idleTimer); idleTimer = setTimeout(() => { touring = !still.matches; clock = 0; lastStep = -1; flipped = false; run(); }, 3600); };
const steer = (next) => { quiet(); target = clamp(next, HOME, REST); run(); };
const flip = () => { quiet(); pendingFlip = true; target = REST; run(); };
new IntersectionObserver((entries) => { visible = entries[entries.length - 1].isIntersecting; if (visible) run(); }, { rootMargin: "120px 0px" }).observe(stage);
if (still.matches) touring = false;
stage.addEventListener("pointermove", (event) => {
  const box = svg.getBoundingClientRect();
  const share = clamp(((event.clientX - box.left) / box.width - 0.3) / 0.45, 0, 1);
  steer(HOME + share * (REST - HOME));
});
stage.addEventListener("click", flip);
button.addEventListener("click", (event) => { event.stopPropagation(); quiet(); setCut(!cut); draw(); run(); });
stage.addEventListener("keydown", (event) => {
  let to = null;
  if (event.key === "ArrowLeft" || event.key === "ArrowUp") to = target - MM / 2;
  if (event.key === "ArrowRight" || event.key === "ArrowDown") to = target + MM / 2;
  if (event.key === "Home") to = HOME;
  if (event.key === "End") to = REST;
  if (event.key === "c") { quiet(); setCut(!cut); draw(); run(); return; }
  if (event.key === "f" || event.key === "Enter" || event.key === " ") { event.preventDefault(); flip(); return; }
  if (to === null) return;
  event.preventDefault();
  steer(to);
});
setCut(false);
draw();
`;

const body = k.plateHtml({
  fig: "Fig 1",
  title: "USB-C plug and receptacle",
  hint: "Hover to plug in · click to flip",
  readout: "unplugged · A side up",
  keys: [
    { mark: "lit", label: "Plug shell, 8.25 × 2.4 mm: goes 6.65 mm into the receptacle" },
    { mark: "raised", label: "Tongue: 12 pads a side at 0.5 mm pitch, the four power pads longer" },
    { mark: "flat", label: "Cut away: both shells opened just above the tongue" },
  ],
  caption:
    "A USB-C receptacle on a board, and a plug on a sliding clamp. The receptacle is a metal shell around a thin tongue with 12 pads on each face, mirrored so the plug fits either way up; the plug's spring contacts press on those pads from above and below, and two side latches catch the notches in the tongue. The power and ground pads reach closer to the tip, so they connect before data and CC. On the board each CC pin goes to ground through a 5.1 kΩ resistor, and the source finds it on CC1 or CC2, which tells it which way up the plug went in. The LED lights once VBUS connects. Contact distances follow this model, not a datasheet.",
  body: `<button class="usb-mode" type="button" aria-pressed="false">Cut away</button><div class="iso-stage" tabindex="0" role="slider" data-mode="whole" aria-label="USB-C plug: arrow keys slide it in and out, F flips it over, C cuts the shells open" aria-valuemin="0" aria-valuemax="6.65" aria-valuenow="0">${svg}</div>`,
});

const css = `<style>
.usb-whole .usb-cavity{--anatomy-paper:#070707;--anatomy-top:#121212;--anatomy-shade-0:#080808;--anatomy-shade-1:#0a0a0a;--anatomy-shade-2:#0c0c0c;--anatomy-shade-3:#0e0e0e}
.iso[data-theme="light"] .usb-whole .usb-cavity{--anatomy-paper:#a9a9a6;--anatomy-top:#c4c4c1;--anatomy-shade-0:#9c9c99;--anatomy-shade-1:#a4a4a1;--anatomy-shade-2:#acaca9;--anatomy-shade-3:#b4b4b1}
.usb-cut .usb-cavity{--anatomy-top:#151515;--anatomy-shade-0:#0b0b0b;--anatomy-shade-1:#0d0d0d;--anatomy-shade-2:#0f0f0f;--anatomy-shade-3:#121212}
.iso[data-theme="light"] .usb-cut .usb-cavity{--anatomy-top:#e2e2df;--anatomy-shade-0:#c9c9c6;--anatomy-shade-1:#d0d0cd;--anatomy-shade-2:#d7d7d4;--anatomy-shade-3:#dddddb}
.iso-stage[data-mode="cut"] .usb-whole,.iso-stage[data-mode="whole"] .usb-cut{display:none}
.iso-stage{cursor:pointer;outline:none}
.usb-mode{position:absolute;left:20px;top:38px;z-index:1;padding:3px 8px;border:0;border-radius:0;background:none;box-shadow:0 0 0 1px var(--anatomy-mid);color:var(--anatomy-text);font:10.5px/1.2 var(--anatomy-mono);letter-spacing:.04em;cursor:pointer}
.usb-mode:hover,.usb-mode[aria-pressed="true"]{color:var(--anatomy-strong);box-shadow:0 0 0 1px var(--anatomy-hi)}
.usb-mode:focus-visible{outline:2px solid var(--anatomy-hi);outline-offset:2px}
</style>`;

const file = theme === "light" ? "usb-c-light.html" : "usb-c.html";
writeFileSync(join(HERE, file), k.pageHtml({ title: "USB-C anatomy", theme, body: css + body, script: kitScript() + shared + live, width: 760 }));
console.log("wrote", file);
