// Collada (.dae) models for the renderer: the only model format besides S3O that BAR units use (objects3d/raptors/raptorartillery.dae). Kept in its own module so that the
// S3O path does not depend on it; index.html loads it only for a model whose file name ends with .dae (import('./dae_loader.js')).
//
// loadModel(url, hidden) gives a THREE.BufferGeometry like loadModel of s3o_loader.js: all meshes of the file in ONE geometry (position, normal, uv, index), in the rest pose,
// in the world of the scene (Y up, the front of the unit at +z, as with S3O). `hidden`: the names (lower case) of the nodes whose own mesh is left out.
import * as THREE from 'three';
import { ColladaLoader } from 'three/addons/loaders/ColladaLoader.js';

export async function loadModel(url, hidden = new Set()) {
  return parseDAE(await (await fetch(url)).text(), hidden);
}

function parseDAE(text, hidden) {
  // The ColladaLoader reads the file, turns Z_UP files into Y up (a rotation, no mirroring) and builds the scene graph with its (skinned) meshes. Its texture requests
  // (the file names inside the .dae do not exist: the textures of the unit are the ones of the game's unit definition, see dae_model.py) are not used.
  const scene = new ColladaLoader().parse(text, '').scene;
  scene.updateMatrixWorld(true);
  const pos = [], nor = [], uv = [], index = [];
  const v = new THREE.Vector3(), n = new THREE.Vector3();
  scene.traverse(o => {
    if (!(o.isMesh || o.isSkinnedMesh) || hidden.has(o.name.toLowerCase())) return;
    const g = o.geometry, p = g.attributes.position, nr = g.attributes.normal, t = g.attributes.uv;
    const base = pos.length / 3, normalMatrix = new THREE.Matrix3().getNormalMatrix(o.matrixWorld);
    if (o.isSkinnedMesh) o.skeleton.update();
    for (let i = 0; i < p.count; i++) {
      if (o.isSkinnedMesh) o.getVertexPosition(i, v); else v.fromBufferAttribute(p, i);   // the vertex in the pose the file has (rest pose: nothing is animated)
      v.applyMatrix4(o.matrixWorld);
      pos.push(v.x, v.y, v.z);
      if (nr) { n.fromBufferAttribute(nr, i).applyMatrix3(normalMatrix).normalize(); nor.push(n.x, n.y, n.z); } else nor.push(0, 1, 0);
      uv.push(t ? t.getX(i) : 0, t ? t.getY(i) : 0);
    }
    if (g.index) for (let i = 0; i < g.index.count; i++) index.push(g.index.getX(i) + base);
    else for (let i = 0; i < p.count; i++) index.push(i + base);
  });
  if (!pos.length) throw new Error('no mesh in the Collada file');
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(index);
  return geo;
}
