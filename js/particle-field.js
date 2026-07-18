(function initField(){
  const canvas = document.getElementById('particleField');
  const renderer = new THREE.WebGLRenderer({ canvas, alpha:true, antialias:true });
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(0, 0, 14);

  // cheap bloom: a small offscreen-resolution 2D canvas redrawn from this
  // WebGL canvas each frame, then blurred/brightened via CSS (see style.css)
  const glowCanvas = document.getElementById('particleFieldGlow');
  const glowCtx = glowCanvas.getContext('2d');
  const GLOW_SCALE = 0.32;

  let uPerspective = 1;
  function resize(){
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    uPerspective = computePerspective(renderer, camera);
    if(mat) mat.uniforms.uPerspective.value = uPerspective;
    glowCanvas.width = Math.max(1, Math.round(window.innerWidth * GLOW_SCALE));
    glowCanvas.height = Math.max(1, Math.round(window.innerHeight * GLOW_SCALE));
  }

  // purple-leaning nebula palette (weighted toward violet/indigo, blue rim, rare white sparks)
  const palette = [0xb98bff, 0xb98bff, 0x8a6bff, 0x8a6bff, 0x5ad7ff, 0xf4f8ff];

  // ----- bounds the field lives in / wraps within, so it reads as endless -----
  // Z_NEAR is kept well short of the camera (z=14) so particles wrap away
  // before ever passing through it — letting them reach the camera makes
  // their on-screen point size blow up as distance approaches zero.
  const HALF_X = 16, HALF_Y = 16, Z_NEAR = 9, Z_FAR = -34;
  const FIELD_SPEED = 0.18; // units/sec forward drift (matches old per-frame terminal velocity)

  // clustered nebula / cosmic-web look — clumps of particles around a handful of
  // centers (with a thin scatter of lone stars), instead of flat uniform noise.
  // still no mouse interaction: the only pointer-reactive element is the core reactor.
  const COUNT = 13000;
  const CLUSTER_COUNT = 6;
  const clusterCenters = [];
  for(let c=0;c<CLUSTER_COUNT;c++){
    clusterCenters.push([
      (Math.random()-0.5) * HALF_X * 1.3,
      (Math.random()-0.5) * HALF_Y * 1.3,
      Z_FAR + Math.random() * (Z_NEAR - Z_FAR),
    ]);
  }
  function gaussian(){
    const u = Math.random() || 1e-6, v = Math.random();
    return Math.sqrt(-2*Math.log(u)) * Math.cos(2*Math.PI*v);
  }

  const basePos = new Float32Array(COUNT * 3);
  const colors = new Float32Array(COUNT * 3);
  const tmpColor = new THREE.Color();

  for(let i=0;i<COUNT;i++){
    const idx = i*3;
    if(Math.random() < 0.82){
      const c = clusterCenters[i % CLUSTER_COUNT];
      basePos[idx]   = c[0] + gaussian() * 2.6;
      basePos[idx+1] = c[1] + gaussian() * 2.6;
      basePos[idx+2] = c[2] + gaussian() * 2.6;
    } else {
      basePos[idx]   = (Math.random()-0.5) * HALF_X * 2;
      basePos[idx+1] = (Math.random()-0.5) * HALF_Y * 2;
      basePos[idx+2] = Z_FAR + Math.random() * (Z_NEAR - Z_FAR);
    }
    tmpColor.set(palette[(Math.random()*palette.length)|0]);
    colors[idx]=tmpColor.r; colors[idx+1]=tmpColor.g; colors[idx+2]=tmpColor.b;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(basePos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime:        { value: 0 },
      uSpeed:       { value: FIELD_SPEED },
      uZNear:       { value: Z_NEAR },
      uZFar:        { value: Z_FAR },
      uPartTime:    { value: -999 },
      uSize:        { value: 0.075 },
      uPerspective: { value: 1 },
      uOpacity:     { value: 0.55 },
    },
    vertexShader: `
      uniform float uTime, uSpeed, uZNear, uZFar, uPartTime, uSize, uPerspective;
      varying vec3 vColor;
      attribute vec3 color;
      void main(){
        vColor = color;
        float range = uZNear - uZFar;
        float rel = mod((uZNear - position.z) + uTime * uSpeed, range);
        vec3 pos = vec3(position.x, position.y, uZNear - rel);

        // particles part outward in a one-shot ripple when a tab opens/closes
        float dt = uTime - uPartTime;
        if(dt >= 0.0 && dt < 3.0){
          vec3 dir = normalize(position + vec3(0.0001));
          pos += dir * exp(-dt * 1.6) * 1.6;
        }

        vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
        gl_PointSize = uSize * (uPerspective / -mvPosition.z);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: DOT_FRAGMENT_SHADER,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const field = new THREE.Points(geo, mat);
  field.frustumCulled = false;
  scene.add(field);

  resize();
  window.addEventListener('resize', resize);

  // ----- faint connecting filaments between nearby particles, cosmic-web style -----
  // sampled positions are recomputed on the CPU (cheap — only ~160 points) using
  // the same time-based formula the vertex shader uses for the full field.
  const SAMPLE_COUNT = 160;
  const SAMPLE_STRIDE = Math.floor(COUNT / SAMPLE_COUNT);
  const LINK_WINDOW = 8;
  const MAX_LINKS = SAMPLE_COUNT * LINK_WINDOW;
  const LINK_DIST = 1.7;
  const linkPositions = new Float32Array(MAX_LINKS * 2 * 3);
  const sampleZ = new Float32Array(SAMPLE_COUNT);
  const linkGeo = new THREE.BufferGeometry();
  const linkAttr = new THREE.BufferAttribute(linkPositions, 3);
  linkAttr.setUsage(THREE.DynamicDrawUsage);
  linkGeo.setAttribute('position', linkAttr);
  linkGeo.setDrawRange(0, 0);
  const linkMat = new THREE.LineBasicMaterial({
    color:0x9d85ff, transparent:true, opacity:0.26,
    blending:THREE.AdditiveBlending, depthWrite:false,
  });
  const links = new THREE.LineSegments(linkGeo, linkMat);
  links.frustumCulled = false;
  scene.add(links);

  function fieldZ(baseZ, timeSec){
    const range = Z_NEAR - Z_FAR;
    let rel = ((Z_NEAR - baseZ) + timeSec * FIELD_SPEED) % range;
    if(rel < 0) rel += range;
    return Z_NEAR - rel;
  }

  function updateLinks(timeSec){
    for(let s=0; s<SAMPLE_COUNT; s++){
      const i = s * SAMPLE_STRIDE;
      sampleZ[s] = fieldZ(basePos[i*3+2], timeSec);
    }
    let n = 0;
    for(let s=0; s<SAMPLE_COUNT && n<MAX_LINKS; s++){
      const i = s * SAMPLE_STRIDE;
      const ix = i*3;
      for(let w=1; w<=LINK_WINDOW && n<MAX_LINKS; w++){
        const sj = (s+w) % SAMPLE_COUNT;
        const j = sj * SAMPLE_STRIDE;
        const jx = j*3;
        const dx = basePos[ix]-basePos[jx], dy = basePos[ix+1]-basePos[jx+1], dz = sampleZ[s]-sampleZ[sj];
        const d2 = dx*dx+dy*dy+dz*dz;
        if(d2 < LINK_DIST*LINK_DIST){
          const o = n*6;
          linkPositions[o]   = basePos[ix];   linkPositions[o+1] = basePos[ix+1]; linkPositions[o+2] = sampleZ[s];
          linkPositions[o+3] = basePos[jx];   linkPositions[o+4] = basePos[jx+1]; linkPositions[o+5] = sampleZ[sj];
          n++;
        }
      }
    }
    linkAttr.needsUpdate = true;
    linkGeo.setDrawRange(0, n*2);
  }

  // ----- particles part and reform when opening/closing tabs -----
  partField = function(){
    mat.uniforms.uPartTime.value = mat.uniforms.uTime.value;
  };

  const clock = new THREE.Clock();
  let linkFrame = 0;
  function animate(){
    requestAnimationFrame(animate);
    const timeSec = clock.getElapsedTime();
    mat.uniforms.uTime.value = timeSec;

    if(++linkFrame % 5 === 0) updateLinks(timeSec);

    renderer.render(scene, camera);
    glowCtx.clearRect(0, 0, glowCanvas.width, glowCanvas.height);
    glowCtx.drawImage(canvas, 0, 0, glowCanvas.width, glowCanvas.height);
  }
  animate();
})();
