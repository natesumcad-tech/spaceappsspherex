// Coordinate maths for the Star Map.
//
// The map is a flat plane in degrees: x = right ascension (east to the LEFT, like the real sky),
// y = declination (north up). The origin (0, 0) is RA 0h, Dec 0°: the March equinox.
// In three.js the plane is XZ: world X = x, world Z = -y.

export const DEG = Math.PI / 180;
export const MAP_W = 360;
export const MAP_H = 180;

/** RA (deg) → map x in [-180, 180). */
export function raToX(ra: number) {
  let r = ((ra % 360) + 360) % 360;
  if (r >= 180) r -= 360;
  return -r;
}
/** Map x → RA in [0, 360). */
export function xToRa(x: number) {
  return (((-x) % 360) + 360) % 360;
}

const EPS = 23.4393 * DEG; // obliquity of the ecliptic (J2000)
const PRECESSION_DEG_PER_YEAR = 50.29 / 3600; // general precession in longitude

/**
 * Precession as a rotation about the ecliptic pole. Returns a 3×3 matrix (row-major) that takes a
 * J2000 equatorial unit vector to the equator of date `years` from 2000. Simplified (constant
 * obliquity) but good for showing how the sky drifts over thousands of years.
 */
export function precessionMatrix(years: number) {
  const d = PRECESSION_DEG_PER_YEAR * years * DEG;
  const ce = Math.cos(EPS), se = Math.sin(EPS), cd = Math.cos(d), sd = Math.sin(d);
  // R = Rx(-ε) · Rz(d) · Rx(ε)
  const rx = (s: number): number[][] => [
    [1, 0, 0],
    [0, ce, s * se],
    [0, -s * se, ce],
  ];
  const rz: number[][] = [
    [cd, -sd, 0],
    [sd, cd, 0],
    [0, 0, 1],
  ];
  return mul(mul(rx(-1), rz), rx(1));
}

export function mul(a: number[][], b: number[][]) {
  return a.map((row) => [0, 1, 2].map((j) => row[0] * b[0][j] + row[1] * b[1][j] + row[2] * b[2][j]));
}
export function transpose(m: number[][]) {
  return [0, 1, 2].map((i) => [m[0][i], m[1][i], m[2][i]]);
}
export function apply(m: number[][], v: [number, number, number]): [number, number, number] {
  return [
    m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
    m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
    m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
  ];
}
export function radecToUnit(ra: number, dec: number): [number, number, number] {
  const a = ra * DEG, d = dec * DEG;
  return [Math.cos(d) * Math.cos(a), Math.cos(d) * Math.sin(a), Math.sin(d)];
}
export function unitToRadec(v: [number, number, number]): [number, number] {
  const ra = (Math.atan2(v[1], v[0]) / DEG + 360) % 360;
  return [ra, Math.asin(Math.max(-1, Math.min(1, v[2]))) / DEG];
}

/** J2000 RA/Dec → map (x, y) for an epoch `years` from 2000. */
export function projector(years: number) {
  const m = precessionMatrix(years);
  return (ra: number, dec: number): [number, number] => {
    const [r, d] = years ? unitToRadec(apply(m, radecToUnit(ra, dec))) : [ra, dec];
    return [raToX(r), d];
  };
}
/** Map (x, y) at an epoch → J2000 RA/Dec. */
export function unprojector(years: number) {
  const m = transpose(precessionMatrix(years));
  return (x: number, y: number): [number, number] => (years ? unitToRadec(apply(m, radecToUnit(xToRa(x), y))) : [xToRa(x), y]);
}

/** IAU equatorial (J2000) → galactic rotation. */
export const EQ_TO_GAL = [
  [-0.0548755604, -0.8734370902, -0.4838350155],
  [0.4941094279, -0.44482963, 0.7469822445],
  [-0.867666149, -0.1980763734, 0.4559837762],
];

// ── Planets: JPL "Approximate Positions of the Planets", Table 1 (best 1800–2050) ──
// [a (au), e, I, L, long. perihelion, long. node] and their rates per Julian century.
type Elements = [number, number, number, number, number, number];
const PLANETS: Record<string, { el: Elements; rate: Elements; color: string }> = {
  Mercury: { el: [0.38709927, 0.20563593, 7.00497902, 252.2503235, 77.45779628, 48.33076593], rate: [0.00000037, 0.00001906, -0.00594749, 149472.67411175, 0.16047689, -0.12534081], color: "#c9c3b8" },
  Venus: { el: [0.72333566, 0.00677672, 3.39467605, 181.9790995, 131.60246718, 76.67984255], rate: [0.0000039, -0.00004107, -0.0007889, 58517.81538729, 0.00268329, -0.27769418], color: "#ffe9b0" },
  Earth: { el: [1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0], rate: [0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0], color: "#9fd0ff" },
  Mars: { el: [1.52371034, 0.0933941, 1.84969142, -4.55343205, -23.94362959, 49.55953891], rate: [0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343], color: "#ff9a7a" },
  Jupiter: { el: [5.202887, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909], rate: [-0.00011607, -0.00013253, -0.00183714, 3034.74612775, 0.21252668, 0.20469106], color: "#f3d3a8" },
  Saturn: { el: [9.53667594, 0.05386179, 2.48599187, 49.95424423, 92.59887831, 113.66242448], rate: [-0.0012506, -0.00050991, 0.00193609, 1222.49362201, -0.41897216, -0.28867794], color: "#f0deb0" },
  Uranus: { el: [19.18916464, 0.04725744, 0.77263783, 313.23810451, 170.9542763, 74.01692503], rate: [-0.00196176, -0.00004397, -0.00242939, 428.48202785, 0.40805281, 0.04240589], color: "#b8f0f0" },
  Neptune: { el: [30.06992276, 0.00859048, 1.77004347, -55.12002969, 44.96476227, 131.78422574], rate: [0.00026291, 0.00005105, 0.00035372, 218.45945325, -0.32241464, -0.00508664], color: "#a9c2ff" },
};

function heliocentric(name: string, T: number): [number, number, number] {
  const { el, rate } = PLANETS[name];
  const [a, e, I, L, wbar, node] = el.map((v, i) => v + rate[i] * T);
  const w = (wbar - node) * DEG, O = node * DEG, inc = I * DEG;
  let M = ((((L - wbar) % 360) + 540) % 360 - 180) * DEG;
  let E = M + e * Math.sin(M);
  for (let k = 0; k < 6; k++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
  const xp = a * (Math.cos(E) - e), yp = a * Math.sqrt(1 - e * e) * Math.sin(E);
  const cw = Math.cos(w), sw = Math.sin(w), cO = Math.cos(O), sO = Math.sin(O), cI = Math.cos(inc), sI = Math.sin(inc);
  return [
    (cw * cO - sw * sO * cI) * xp + (-sw * cO - cw * sO * cI) * yp,
    (cw * sO + sw * cO * cI) * xp + (-sw * sO + cw * cO * cI) * yp,
    sw * sI * xp + cw * sI * yp,
  ];
}

/** How far a planet is from the Sun and from Earth (AU), on a given (fractional) year. */
export function planetDistance(name: string, year: number) {
  const T = (year - 2000) / 100;
  const p = heliocentric(name, T), e = heliocentric("Earth", T);
  return { sunAU: Math.hypot(...p), earthAU: Math.hypot(p[0] - e[0], p[1] - e[1], p[2] - e[2]) };
}

/** Geocentric J2000 RA/Dec of the Sun and planets for a (fractional) year. */
export function planetPositions(year: number) {
  const T = (year - 2000) / 100;
  const earth = heliocentric("Earth", T);
  const toRadec = (g: [number, number, number]) => {
    const ce = Math.cos(EPS), se = Math.sin(EPS);
    return unitToRadec(normalize([g[0], g[1] * ce - g[2] * se, g[1] * se + g[2] * ce]));
  };
  const out: { name: string; ra: number; dec: number; color: string }[] = [];
  const [sra, sdec] = toRadec([-earth[0], -earth[1], -earth[2]]);
  out.push({ name: "Sun", ra: sra, dec: sdec, color: "#ffd66b" });
  for (const name of Object.keys(PLANETS)) {
    if (name === "Earth") continue;
    const p = heliocentric(name, T);
    const [ra, dec] = toRadec([p[0] - earth[0], p[1] - earth[1], p[2] - earth[2]]);
    out.push({ name, ra, dec, color: PLANETS[name].color });
  }
  return out;
}

function normalize(v: [number, number, number]): [number, number, number] {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

/** B−V color index → CSS color (black-body approximation). */
export function bvToCss(bv: number) {
  const k = 4600 * (1 / (0.92 * bv + 1.7) + 1 / (0.92 * bv + 0.62));
  const t = k / 100;
  let r: number, g: number, b: number;
  if (t <= 66) {
    r = 255;
    g = 99.47 * Math.log(t) - 161.12;
    b = t <= 19 ? 0 : 138.52 * Math.log(t - 10) - 305.04;
  } else {
    r = 329.7 * Math.pow(t - 60, -0.1332);
    g = 288.12 * Math.pow(t - 60, -0.0755);
    b = 255;
  }
  const c = (v: number) => Math.round(Math.max(0, Math.min(255, v)));
  return `rgb(${c(r)},${c(g)},${c(b)})`;
}
