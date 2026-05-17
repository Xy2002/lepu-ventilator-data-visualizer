// Verbatim 192 bytes of src/docs/config_v1.bin, transcribed as hex.
// hexToBytes strips whitespace so the line/group formatting is purely cosmetic.
const CONFIG_V1_HEX = `
  cc000002 00000001 01000000 00000000
  fa000100 00010000 00000000 13000000
  02000e00 0d000000 00009441 00001841
  d20b0240 cdcc9441 cdcc2441 cdcc0441
  765e033d 00000000 00000000 00000000
  00000000 00000000 00000000 00000000
  03000114 02020003 01020301 0a031403
  00000041 00002041 00008040 00002041
  00008040 00006041 0000e040 00004040
  00008040 00002041 00008040 00002041
  00008040 00004040 053c0000 00000000
  00000000 00001400 020c4d00 000000b7
`;

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/\s+/g, '');
  if (clean.length % 2 !== 0) {
    throw new Error(`hex string length must be even (got ${clean.length})`);
  }
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export const CONFIG_V1_FIXTURE_BYTES: Uint8Array = hexToBytes(CONFIG_V1_HEX);
