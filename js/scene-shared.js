// ---------- GPU-driven particle systems ----------
// All per-particle motion below runs in vertex shaders (a pure function of a
// uTime uniform + per-particle attributes) instead of rewriting Float32Arrays
// on the CPU every frame. That was the bottleneck in the previous version —
// ~15,000 particles had their positions recomputed in a JS loop 60x/sec. Moving
// that math onto the GPU keeps the CPU nearly idle regardless of particle count,
// which is what actually matters for phone battery/thermal behavior.
let reactorPulse = 1;          // set higher while "thinking"/speaking (drives the breathing pulse)
let reactorListening = false;  // true while the mic is actively capturing speech (drives a cool tint)
let partField = () => {};      // reassigned once the field boots; called on tab open/close
let coreResize = () => {};     // reassigned once the core boots; called when the core stage becomes visible again

// live render stats, written by the two render loops each frame and read by
// the diagnostics HUD in ui.js (updated on a slower interval there)
const HUD_STATS = {
  frameMs: 16.7,   // smoothed frame time (EMA), measured in the field loop
  fieldCalls: 0,   // draw calls per frame, background field renderer
  coreCalls: 0,    // draw calls per frame, core reactor renderer
  points: 0,       // total particles across both scenes (filled in as systems boot)
};

// shared soft circular glow sprite — still used for the corona/ring sprites
function makeGlowSprite(){
  const size = 128; // higher-res gradient — less banding/pixelation when the sprite is scaled up
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

// desktops (fine pointer, plugged into power) can afford a sharper render
// target than phones (coarse pointer, battery-constrained) — so cap pixel
// ratio higher on the former and keep the safer cap on the latter.
const IS_COARSE_POINTER = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
const MAX_PIXEL_RATIO = IS_COARSE_POINTER ? 2 : 3;

// screen-space point size that matches THREE.PointsMaterial's own
// sizeAttenuation formula, computed once per resize (not per-particle).
function computePerspective(renderer, camera){
  const size = new THREE.Vector2();
  renderer.getSize(size);
  const heightPx = size.y * renderer.getPixelRatio();
  return heightPx / (2 * Math.tan((camera.fov * Math.PI / 180) / 2));
}
