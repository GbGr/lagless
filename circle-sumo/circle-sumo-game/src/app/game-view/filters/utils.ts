export function setVec3FromHex(out: Float32Array, hex: number): void {
  const r = ((hex >> 16) & 0xff) / 255;
  const g = ((hex >> 8) & 0xff) / 255;
  const b = (hex & 0xff) / 255;
  out[0] = r;
  out[1] = g;
  out[2] = b;
}
