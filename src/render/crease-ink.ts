import * as THREE from "three";

/**
 * Crease ink: a prototype (2026-09-27, `?crease=1`, never saved) of the one post-process the drawn look wants. The
 * ink the buildings and cars have is an inverted hull, which draws a silhouette and nothing inside it: a roof's front
 * edge seen from above, a corner seen face-on, a kerb, is a crease between two faces of one surface and gets no line
 * (render/drawn-buildings.ts). This pass draws those.
 *
 * The frame is drawn exactly as it would be to the screen, into a target that keeps its depth and stencil. One
 * full-screen pass rebuilds each pixel's normal from that depth and inks it where the normal turns sharply between
 * neighbours. Where depth jumps it draws nothing: a silhouette is the hull's line. The lines fade with distance as the
 * fog takes the city.
 *
 * Not everything drawn is structure. Decals (anything drawn with `polygonOffset`: lane paint, markings, paving,
 * liveries) lie centimetres proud of what they cover, and lane paint far off read as black dashes; grass read as
 * speckle; traffic is not drawn; glows, hulls, cut-out lettering and the fronts' fine detail are not surfaces. So
 * every material stamps the stencil as it draws, 1 for those and 0 for structure: the last thing drawn at a pixel
 * decides it, and stencil writes change no colour or depth. A quad then clears the frame's alpha where the stencil is
 * 1, and the pass treats those pixels as nothing to ink and no neighbour to take a normal from.
 *
 * What was tried first, measured 2026-09-27 at 1350 x 622 on an RX 6800 XT. Taking decals and grass out of the depth
 * (depthWrite off) changed the frame: overlapping decals lost their order and grass its sorting. A second, depth-only
 * pass of the structure kept the frame but cost 6 ms a frame, all of it the city's draw calls again. Tone-mapping the
 * whole frame in this pass tone-mapped the glows that opt out. So the target is drawn as the screen is: three.js
 * tone-maps and sRGB-encodes a material only for the screen or an XR target, and the target carries that flag
 * (`isXRRenderTarget`, which three reads for those two decisions and the texture format, nothing else, in 0.186).
 */
export interface CreaseInk {
  render(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera): void;
  dispose(): void;
}

/** The ink's colour is the hull's (render/cel.ts); where a crease is judged, and where the lines fade out. */
export const CREASE = { ink: 0x06080d, turn: [.13, .26] as const, fade: [70, 240] as const, strength: .85 } as const;

/** Whether a drawn thing is solid structure, the surfaces creases are found in. */
export function isStructure(object: THREE.Object3D): boolean {
  if (!(object instanceof THREE.Mesh) || object instanceof THREE.InstancedMesh || Array.isArray(object.material)) return false;
  const material = object.material as THREE.Material;
  return !material.polygonOffset && !material.transparent && material.depthWrite && material.colorWrite && !material.alphaTest
    && material.side !== THREE.BackSide && material.name !== "grass-blades" && material.name !== "front-fine";
}

export function createCreaseInk(renderer: THREE.WebGLRenderer): CreaseInk {
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const depth = new THREE.DepthTexture(size.x, size.y, THREE.UnsignedInt248Type);
  depth.format = THREE.DepthStencilFormat;
  const target = new THREE.WebGLRenderTarget(size.x, size.y, {
    samples: 4, colorSpace: THREE.SRGBColorSpace, depthTexture: depth, stencilBuffer: true,
  });
  (target as THREE.WebGLRenderTarget & { isXRRenderTarget: boolean }).isXRRenderTarget = true;
  // Plain 8-bit storage for the encoded bytes, as the screen's: the flag makes the multisampled buffer so, but the
  // texture it resolves into would be sRGB-format and decode them again on reading (every pixel came out darker).
  target.texture.internalFormat = "RGBA8";
  // The frame arrives encoded, so the ink is mixed in encoded too: its sRGB bytes, not three's linear colour.
  const ink = new THREE.Vector3((CREASE.ink >> 16 & 255) / 255, (CREASE.ink >> 8 & 255) / 255, (CREASE.ink & 255) / 255);
  const material = new THREE.ShaderMaterial({
    name: "crease-ink",
    uniforms: {
      tColor: { value: target.texture }, tDepth: { value: target.depthTexture },
      texel: { value: new THREE.Vector2(1 / size.x, 1 / size.y) }, projectionInverse: { value: new THREE.Matrix4() },
      inkColor: { value: ink }, turn: { value: new THREE.Vector2(...CREASE.turn) },
      fade: { value: new THREE.Vector2(...CREASE.fade) }, strength: { value: CREASE.strength },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D tColor; uniform sampler2D tDepth; uniform vec2 texel; uniform mat4 projectionInverse;
      uniform vec3 inkColor; uniform vec2 turn; uniform vec2 fade; uniform float strength;
      varying vec2 vUv;
      vec3 viewAt(vec2 uv) {
        vec4 p = projectionInverse * vec4(uv * 2.0 - 1.0, texture2D(tDepth, uv).x * 2.0 - 1.0, 1.0);
        return p.xyz / p.w;
      }
      // Structure is what the stencil left opaque; decals, grass, traffic and the rest had their alpha cleared.
      bool solid(vec2 uv) { return texture2D(tColor, uv).a > 0.5; }
      // The normal from the nearer solid neighbour on each axis, so a pixel beside a silhouette, or beside paint,
      // takes its own surface's.
      vec3 normalAt(vec2 uv, vec3 p) {
        vec2 x = vec2(texel.x, 0.0), y = vec2(0.0, texel.y);
        vec3 l = viewAt(uv - x), r = viewAt(uv + x), b = viewAt(uv - y), t = viewAt(uv + y);
        float dl = solid(uv - x) ? abs(p.z - l.z) : 1e9, dr = solid(uv + x) ? abs(r.z - p.z) : 1e9;
        float db = solid(uv - y) ? abs(p.z - b.z) : 1e9, dt = solid(uv + y) ? abs(t.z - p.z) : 1e9;
        return normalize(cross(dr < dl ? r - p : p - l, dt < db ? t - p : p - b));
      }
      // One over distance, which runs straight across a flat surface on screen, so a fold is where it bends.
      float reach(vec2 uv) { return -1.0 / viewAt(uv).z; }
      // A fold's bend grows with how far out it is sampled; a feature a pixel or two wide bends as much one pixel out
      // as two, and is no fold.
      bool fold(vec2 axis, float w0) {
        float one = reach(vUv - axis) + reach(vUv + axis) - 2.0 * w0;
        float two = reach(vUv - 2.0 * axis) + reach(vUv + 2.0 * axis) - 2.0 * w0;
        return abs(two) > 1.5 * abs(one);
      }
      float bendAlong(vec2 axis, vec3 p, vec3 n) {
        float bend = 0.0;
        for (int s = 0; s < 2; s++) {
          vec2 uv = vUv + (s == 0 ? axis : -axis);
          if (!solid(uv)) continue;
          vec3 q = viewAt(uv);
          // A jump in depth is a silhouette, the hull's line: only a continuous surface that turns is a crease.
          if (abs(q.z - p.z) > 0.04 * -p.z + 0.08) continue;
          bend = max(bend, 1.0 - dot(n, normalAt(uv, q)));
        }
        return bend;
      }
      void main() {
        vec4 color = texture2D(tColor, vUv);
        float ink = 0.0;
        if (color.a > 0.5 && texture2D(tDepth, vUv).x < 0.99999) {
          vec3 p = viewAt(vUv), n = normalAt(vUv, p);
          float w0 = -1.0 / p.z;
          vec2 x = vec2(texel.x, 0.0), y = vec2(0.0, texel.y);
          float bend = max(fold(x, w0) ? bendAlong(x, p, n) : 0.0, fold(y, w0) ? bendAlong(y, p, n) : 0.0);
          ink = smoothstep(turn.x, turn.y, bend) * (1.0 - smoothstep(fade.x, fade.y, -p.z)) * strength;
        }
        gl_FragColor = vec4(mix(color.rgb, inkColor, ink), 1.0);
      }`,
    depthTest: false, depthWrite: false, toneMapped: false,
  });
  const screen = new THREE.Scene(), screenCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  quad.frustumCulled = false;
  screen.add(quad);
  // Where the stencil is 1, clear the frame's alpha and leave its colour: zero times the new colour plus the old,
  // and zero of either alpha.
  const clearing = new THREE.MeshBasicMaterial({
    color: 0, depthTest: false, depthWrite: false, toneMapped: false,
    blending: THREE.CustomBlending, blendSrc: THREE.ZeroFactor, blendDst: THREE.OneFactor,
    blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.ZeroFactor,
    stencilWrite: true, stencilRef: 1, stencilFunc: THREE.EqualStencilFunc,
    stencilFail: THREE.KeepStencilOp, stencilZFail: THREE.KeepStencilOp, stencilZPass: THREE.KeepStencilOp,
  });
  const mask = new THREE.Scene(), maskQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), clearing);
  maskQuad.frustumCulled = false;
  mask.add(maskQuad);
  const drawing = new THREE.Vector2();
  // Every material stamps the stencil as it draws, looked over once a second, since grass tiles and traffic come and
  // go. A material shared by structure and something that is not stamps 1: its structure goes uninked, never the reverse.
  let frames = 0;
  const stamp = (scene: THREE.Scene) => scene.traverse(object => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || Array.isArray(mesh.material)) return;
    const m = mesh.material as THREE.Material;
    m.stencilWrite = true; m.stencilFunc = THREE.AlwaysStencilFunc; m.stencilZPass = THREE.ReplaceStencilOp;
    if (!isStructure(mesh)) m.stencilRef = 1;
    else if (m.userData.creaseStamped !== frames) m.stencilRef = 0;
    m.userData.creaseStamped = frames;
  });
  return {
    render(renderer, scene, camera) {
      if (frames++ % 60 === 0) stamp(scene);
      renderer.getDrawingBufferSize(drawing);
      if (drawing.x !== target.width || drawing.y !== target.height) {
        target.setSize(drawing.x, drawing.y);
        material.uniforms.texel!.value.set(1 / drawing.x, 1 / drawing.y);
      }
      renderer.setRenderTarget(target);
      renderer.render(scene, camera);
      const autoClear = renderer.autoClear;
      renderer.autoClear = false;
      renderer.render(mask, screenCamera);
      renderer.autoClear = autoClear;
      renderer.setRenderTarget(null);
      material.uniforms.projectionInverse!.value.copy(camera.projectionMatrixInverse);
      renderer.render(screen, screenCamera);
    },
    dispose() { target.dispose(); material.dispose(); clearing.dispose(); quad.geometry.dispose(); maskQuad.geometry.dispose(); },
  };
}
