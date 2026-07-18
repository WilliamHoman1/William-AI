// ---------- GPU-driven particle systems ----------
// All per-particle motion below runs in vertex shaders (a pure function of a
// uTime uniform + per-particle attributes) instead of rewriting Float32Arrays
// on the CPU every frame. That was the bottleneck in the previous version —
// ~15,000 particles had their positions recomputed in a JS loop 60x/sec. Moving
// that math onto the GPU keeps the CPU nearly idle regardless of particle count,
// which is what actually matters for phone battery/thermal behavior.
let reactorPulse = 1;      // set higher while "thinking" (drives the breathing pulse)
let partField = () => {};  // reassigned once the field boots; called on tab open/close

// shared soft circular glow sprite — still used for the corona/ring sprites
function makeGlowSprite(){
  const size = 64;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const grad = ctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/2);
  grad.addColorStop(0,   'rgba(255,255,255,1)');
  grad.addColorStop(0.35,'rgba(255,255,255,0.7)');
  grad.addColorStop(1,   'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(c);
}
const glowSprite = makeGlowSprite();

// shared soft-circle fragment shader for every GPU-driven Points system —
// draws the same glowing dot as the old canvas sprite, but with zero texture
// sampling and per-vertex color already computed on the GPU.
const DOT_FRAGMENT_SHADER = `
  varying vec3 vColor;
  uniform float uOpacity;
  void main(){
    vec2 uv = gl_PointCoord - vec2(0.5);
    float d = length(uv) * 2.0;
    float alpha = smoothstep(1.0, 0.0, d);
    alpha = pow(alpha, 1.7);
    gl_FragColor = vec4(vColor, alpha * uOpacity);
  }
`;

// screen-space point size that matches THREE.PointsMaterial's own
// sizeAttenuation formula, computed once per resize (not per-particle).
function computePerspective(renderer, camera){
  const size = new THREE.Vector2();
  renderer.getSize(size);
  const heightPx = size.y * renderer.getPixelRatio();
  return heightPx / (2 * Math.tan((camera.fov * Math.PI / 180) / 2));
}
