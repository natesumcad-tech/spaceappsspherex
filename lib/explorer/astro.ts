import * as THREE from "three";

export const DEG = Math.PI / 180;

/**
 * Celestial sphere → 3D, seen from the inside.
 * +y is the north celestial pole; RA increases to the east (to the left when you face the sky).
 */
export function radecToVec(ra: number, dec: number, r = 1, out = new THREE.Vector3()) {
  const a = ra * DEG;
  const d = dec * DEG;
  return out.set(Math.cos(d) * Math.cos(a) * r, Math.sin(d) * r, -Math.cos(d) * Math.sin(a) * r);
}

/** Camera yaw/pitch (rotation order YXZ, camera looks down -z) that points at `dir`. */
export function dirToYawPitch(dir: THREE.Vector3) {
  const d = dir.clone().normalize();
  return { yaw: Math.atan2(-d.x, -d.z), pitch: Math.asin(THREE.MathUtils.clamp(d.y, -1, 1)) };
}

export function yawPitchToDir(yaw: number, pitch: number, out = new THREE.Vector3()) {
  return out.set(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
}

// Galactic (l, b) → equatorial J2000 unit vector (in radecToVec's frame).
// Rows of the standard IAU equatorial→galactic rotation matrix.
const T = [
  [-0.0548755604, -0.8734370902, -0.4838350155],
  [0.4941094279, -0.44482963, 0.7469822445],
  [-0.867666149, -0.1980763734, 0.4559837762],
];
export function galacticToRaDec(lDeg: number, bDeg: number) {
  const l = lDeg * DEG;
  const b = bDeg * DEG;
  const g = [Math.cos(b) * Math.cos(l), Math.cos(b) * Math.sin(l), Math.sin(b)];
  // equatorial = Tᵀ · galactic
  const x = T[0][0] * g[0] + T[1][0] * g[1] + T[2][0] * g[2];
  const y = T[0][1] * g[0] + T[1][1] * g[1] + T[2][1] * g[2];
  const z = T[0][2] * g[0] + T[1][2] * g[1] + T[2][2] * g[2];
  const ra = (Math.atan2(y, x) / DEG + 360) % 360;
  const dec = Math.asin(z) / DEG;
  return { ra, dec };
}

/** B−V color index → effective temperature (Ballesteros 2012). */
export function bvToKelvin(bv: number) {
  return 4600 * (1 / (0.92 * bv + 1.7) + 1 / (0.92 * bv + 0.62));
}

/** Black-body temperature → approximate sRGB (0..1). */
export function kelvinToRGB(k: number): [number, number, number] {
  const t = k / 100;
  let r: number, g: number, b: number;
  if (t <= 66) {
    r = 255;
    g = 99.4708025861 * Math.log(t) - 161.1195681661;
    b = t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  } else {
    r = 329.698727446 * Math.pow(t - 60, -0.1332047592);
    g = 288.1221695283 * Math.pow(t - 60, -0.0755148492);
    b = 255;
  }
  const c = (v: number) => THREE.MathUtils.clamp(v, 0, 255) / 255;
  return [c(r), c(g), c(b)];
}

export type SkyData = {
  stars: [number, number, number, number, number][]; // ra, dec, mag, bv, distance in parsecs (0 = unknown)
  named: { hip: number; i: number; con: string; names: Record<string, string> }[];
  constellations: {
    id: string;
    rank: number;
    names: Record<string, string>;
    center: [number, number];
    lines: [number, number][][];
  }[];
};

/**
 * A constellation's stick figure flattened onto a plane (gnomonic projection around its center),
 * oriented as it looks in the sky (east left, north up) and scaled to fit in [-1, 1].
 */
export function constellationFigure(con: SkyData["constellations"][number]) {
  const center = radecToVec(con.center[0], con.center[1]);
  const east = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), center).normalize();
  const north = new THREE.Vector3().crossVectors(center, east).normalize();
  const lines = con.lines.map((line) =>
    line.map(([ra, dec]) => {
      const v = radecToVec(ra, dec);
      const d = v.dot(center);
      return [-v.dot(east) / d, -v.dot(north) / d] as [number, number]; // screen coords: x right, y down
    }),
  );
  const ext = Math.max(...lines.flat().map(([x, y]) => Math.max(Math.abs(x), Math.abs(y)))) || 1;
  return lines.map((line) => line.map(([x, y]) => [x / ext, y / ext] as [number, number]));
}
