// S3O models for the renderer (docs/game-files.md). index.html loads this module for a model whose file name ends with .s3o (import('./s3o_loader.js')); the
// Collada models have dae_loader.js. Both give the same: loadModel(url, hidden) -> THREE.BufferGeometry with position, normal, uv and an index, all pieces in ONE geometry,
// Y up, the front of the unit at +z. `hidden`: the names (lower case) of the pieces whose own triangles are left out (their children are drawn all the same).
import * as THREE from 'three';

export async function loadModel(url, hidden = new Set()) {
  return parseS3O(await (await fetch(url)).arrayBuffer(), hidden);
}

// positions as they are (no mirroring)
function parseS3O(buf, hidden) {
  const dv = new DataView(buf);
  const u32 = o => dv.getUint32(o, true), f32 = o => dv.getFloat32(o, true);
  const pos = [], nor = [], uv = [];
  function piece(off, ox, oy, oz) {
    const nChild = u32(off + 4), childOff = u32(off + 8);
    const nameOff = u32(off); let nameEnd = nameOff; while (dv.getUint8(nameEnd)) nameEnd++;
    const isHidden = hidden.has(new TextDecoder('latin1').decode(new Uint8Array(buf, nameOff, nameEnd - nameOff)).toLowerCase());   // its children are drawn all the same
    const nV = isHidden ? 0 : u32(off + 12), vOff = u32(off + 16), primType = u32(off + 24), nIdx = isHidden ? 0 : u32(off + 28), idxOff = u32(off + 32);
    const px = ox + f32(off + 40), py = oy + f32(off + 44), pz = oz + f32(off + 48);
    const base = pos.length / 3;
    for (let i = 0; i < nV; i++) {
      const o = vOff + i * 32;
      pos.push(f32(o) + px, f32(o + 4) + py, f32(o + 8) + pz);
      nor.push(f32(o + 12), f32(o + 16), f32(o + 20));
      uv.push(f32(o + 24), f32(o + 28));
    }
    const idx = [];
    const I = k => u32(idxOff + k * 4) + base;
    if (primType === 0) for (let i = 0; i + 2 < nIdx; i += 3) idx.push(I(i), I(i + 1), I(i + 2));
    else if (primType === 1) for (let i = 0; i + 2 < nIdx; i++) { if (i % 2) idx.push(I(i + 1), I(i), I(i + 2)); else idx.push(I(i), I(i + 1), I(i + 2)); }
    else if (primType === 2) for (let i = 0; i + 3 < nIdx; i += 4) idx.push(I(i), I(i + 1), I(i + 2), I(i), I(i + 2), I(i + 3));
    const all = [idx];
    for (let c = 0; c < nChild; c++) all.push(piece(u32(childOff + c * 4), px, py, pz));
    return all.flat();
  }
  const index = piece(u32(12 + 4 + 8 + 12), 0, 0, 0);   // root piece offset: after "Spring unit\0", version, radius, height, midX/Y/Z
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(index);
  return g;
}

