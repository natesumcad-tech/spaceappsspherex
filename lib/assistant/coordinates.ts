export type CoordinateDestination = { system: "map"; x: number; y: number } | { system: "equatorial"; ra: number; dec: number };
/** Only interpret explicit navigation or a bare coordinate pair, never a science question. */
export function coordinateDestination(text: string): CoordinateDestination | null {
  const number = "([+-]?\\d+(?:\\.\\d+)?)";
  const navigation = /\b(go|take|fly|navigate|jump|show|travel|zoom|center|centre)\b/i.test(text);
  const bare = /^\s*[+-]?\d+(?:\.\d+)?\s*[,;]\s*[+-]?\d+(?:\.\d+)?\s*$/.test(text);
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
