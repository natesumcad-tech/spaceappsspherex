export type CoordinateDestination = { system: "map"; x: number; y: number } | { system: "equatorial"; ra: number; dec: number };
/** Only interpret explicit navigation or a bare coordinate pair, never a science question. */
export function coordinateDestination(text: string): CoordinateDestination | null {
  const number = "([+-]?\\d+(?:\\.\\d+)?)";
  const navigation = /\b(go|take|fly|navigate|jump|show|travel|zoom|center|centre)\b/i.test(text);
  const bare = /^\s*[+-]?\d+(?:\.\d+)?\s*[,;]\s*[+-]?\d+(?:\.\d+)?\s*$/.test(text);
  const hms = text.match(/(?:\bRA\s*[:=]?\s*)?(\d{1,2})[h:]\s*(\d{1,2})[m:]\s*(\d{1,2}(?:\.\d+)?)s?\s*[,;]?\s*(?:Dec\s*[:=]?\s*)?([+-]?\d{1,2})[°d:]\s*(\d{1,2})['′m:]\s*(\d{1,2}(?:\.\d+)?)["″s]?/i);
  if (hms && (navigation || hms[0].trim() === text.trim())) {
    const h = Number(hms[1]), m = Number(hms[2]), sec = Number(hms[3]);
    const d = Math.abs(Number(hms[4])), dm = Number(hms[5]), ds = Number(hms[6]);
    if (h >= 24 || m >= 60 || sec >= 60 || d > 90 || dm >= 60 || ds >= 60 || (d === 90 && (dm || ds))) return null;
    return { system: "equatorial", ra: (h + m / 60 + sec / 3600) * 15, dec: (hms[4].startsWith("-") ? -1 : 1) * (d + dm / 60 + ds / 3600) };
  }
  if (!navigation && !bare) return null;
  const map = text.match(new RegExp(`\\bx\\s*(?:=|:)?\\s*${number}\\s*°?\\s*[,;]?\\s*(?:and\\s+)?y\\s*(?:=|:)?\\s*${number}`, "i"));
  if (map) {
    const x = Number(map[1]), y = Number(map[2]);
    return Math.abs(x) <= 180 && Math.abs(y) <= 90 ? { system: "map", x, y } : null;
  }
  const equatorial = text.match(new RegExp(`\\bra\\s*(?:=|:)?\\s*${number}\\s*(?:°|degrees)?\\s*[,;]?\\s*(?:and\\s+)?dec\\s*(?:=|:)?\\s*${number}`, "i"));
  const pair = bare ? text.match(new RegExp(`^\\s*${number}\\s*[,;]\\s*${number}\\s*$`)) : null;
  const match = equatorial ?? pair;
  if (!match) return null;
  const ra = Number(match[1]), dec = Number(match[2]);
  return ra >= 0 && ra < 360 && Math.abs(dec) <= 90 ? { system: "equatorial", ra, dec } : null;
}

/** Extract coordinates for an informational question without requesting navigation. */
export function coordinateQuestion(text: string): CoordinateDestination | null {
  if (!/\b(what|which|identify|explain|tell|describe)\b/i.test(text)) return null;
  return coordinateDestination(`go to ${text}`);
}
