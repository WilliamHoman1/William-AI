// ---------- the "core" — a large floating 3D particle reactor with orbiting rings ----------
(function initCore(){
  const canvas = document.getElementById('coreParticles');
  const wrap = canvas.parentElement;
  const renderer = new THREE.WebGLRenderer({ canvas, alpha:true, antialias:true });
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 30);
  camera.position.z = 9.5;

  // cheap bloom: a small offscreen-resolution 2D canvas redrawn from this
  // WebGL canvas each frame, then blurred/brightened via CSS (see style.css)
  const glowCanvas = document.getElementById('coreParticlesGlow');
  const glowCtx = glowCanvas.getContext('2d');
  const GLOW_SCALE = 0.4;

  let uPerspective = 1;
  function resize(){
    const s = wrap.clientWidth;
    // wrap (#coreStage) is display:none while an info panel is open, so a
    // resize event firing in that window (e.g. toggling video fullscreen)
    // would read 0 here and shrink the renderer to nothing permanently,
    // since no further resize event fires once the core is shown again.
    // coreResize() (called from closePanel) covers that recovery case.
    if(!s) return;
    renderer.setSize(s, s, false);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
    camera.aspect = 1;
    camera.updateProjectionMatrix();
    uPerspective = computePerspective(renderer, camera);
    if(coreMat) coreMat.uniforms.uPerspective.value = uPerspective;
    if(flareMat) flareMat.uniforms.uPerspective.value = uPerspective;
    glowCanvas.width = Math.max(1, Math.round(s * GLOW_SCALE));
    glowCanvas.height = Math.max(1, Math.round(s * GLOW_SCALE));
  }

  // sun palette — white-hot core fading through gold to a deep orange rim
  const palette = [0xfff2cc, 0xffcf7a, 0xff9d3d];
  const tmpColor = new THREE.Color();
  const reactor = new THREE.Group();
  scene.add(reactor);

  // soft corona glow behind the core — a big additive sprite that pulses,
  // giving the reactor a sun-like halo instead of a hard particle edge
  const coronaMat = new THREE.SpriteMaterial({
    map:glowSprite, color:0xff9d3d, transparent:true, opacity:0.4,
    blending:THREE.AdditiveBlending, depthWrite:false,
  });
  const corona = new THREE.Sprite(coronaMat);
  corona.scale.set(4.4, 4.4, 1);
  reactor.add(corona);
  const coronaMat2 = new THREE.SpriteMaterial({
    map:glowSprite, color:0xffe2a8, transparent:true, opacity:0.55,
    blending:THREE.AdditiveBlending, depthWrite:false,
  });
  const coronaInner = new THREE.Sprite(coronaMat2);
  coronaInner.scale.set(2.6, 2.6, 1);
  reactor.add(coronaInner);

  // dense glowing core sphere — GPU-driven wobble (position is a pure function
  // of uTime + a per-particle phase seed, no CPU per-vertex loop anymore)
  const CORE_COUNT = 5200;
  const corePos = new Float32Array(CORE_COUNT * 3);
  const coreSeed = new Float32Array(CORE_COUNT);
  const coreCol = new Float32Array(CORE_COUNT * 3);
  for(let i=0;i<CORE_COUNT;i++){
    const idx = i*3;
    const t = i / CORE_COUNT;
    const inclination = Math.acos(1 - 2*t);
    const azimuth = Math.PI * (1 + Math.sqrt(5)) * i;
    const r = 1.0 + (Math.random()-0.5) * 0.35;
    corePos[idx]   = r * Math.sin(inclination) * Math.cos(azimuth);
    corePos[idx+1] = r * Math.sin(inclination) * Math.sin(azimuth);
    corePos[idx+2] = r * Math.cos(inclination);
    coreSeed[i] = i;
    tmpColor.set(palette[i % palette.length]);
    coreCol[idx]=tmpColor.r; coreCol[idx+1]=tmpColor.g; coreCol[idx+2]=tmpColor.b;
  }
  const coreGeo = new THREE.BufferGeometry();
  coreGeo.setAttribute('position', new THREE.BufferAttribute(corePos, 3));
  coreGeo.setAttribute('aSeed', new THREE.BufferAttribute(coreSeed, 1));
  coreGeo.setAttribute('color', new THREE.BufferAttribute(coreCol, 3));
  const coreMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 }, uSpread: { value: 1 }, uSize: { value: 0.045 },
      uPerspective: { value: 1 }, uOpacity: { value: 1 },
      uTint: { value: new THREE.Vector3(1, 1, 1) }, // shifts cool/blue while listening, neutral otherwise
    },
    vertexShader: `
      uniform float uTime, uSpread, uSize, uPerspective;
      uniform vec3 uTint;
      attribute float aSeed;
      attribute vec3 color;
      varying vec3 vColor;
      float hash11(float n){ return fract(sin(n) * 43758.5453123); }
      void main(){
        vColor = color * uTint;

        // each particle gets its own frequency + phase (via hashed seeds) instead
        // of sharing one global sine, so the surface churns like plasma rather
        // than breathing in perfect lockstep
        float h1 = hash11(aSeed * 12.9898);
        float h2 = hash11(aSeed * 78.233);
        float h3 = hash11(aSeed * 37.719);
        float n = sin(uTime * (0.6 + h1*0.9) + h1*6.2831853) * 0.5
                + sin(uTime * (1.3 + h2*1.4) + h2*6.2831853) * 0.3
                + sin(uTime * (2.1 + h3*2.0) + h3*6.2831853) * 0.2;

        // static per-particle radial bias breaks the perfect fibonacci shell
        float bias = 1.0 + (h1 - 0.5) * 0.3;
        vec3 pos = position * (1.0 + n * 0.14) * bias * uSpread;

        // small independent drift off the shell, in a random per-particle direction
        vec3 driftDir = normalize(vec3(h1, h2, h3) - 0.5 + 0.0001);
        pos += driftDir * n * 0.16 * uSpread;

        vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
        gl_PointSize = uSize * (0.7 + h2 * 0.6) * (uPerspective / -mvPosition.z);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: DOT_FRAGMENT_SHADER,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const coreSphere = new THREE.Points(coreGeo, coreMat);
  coreSphere.frustumCulled = false;
  reactor.add(coreSphere);

  // ----- solar flares: jets of particles that erupt from the surface and fall back -----
  // fully GPU-driven: each particle's loop count, life, and burst direction are
  // derived from uTime + a hash function, so there is zero CPU work per frame
  // regardless of FLARE_COUNT.
  const FLARE_COUNT = 1200;
  const flareDummy = new Float32Array(FLARE_COUNT * 3); // unused position slot, geometry needs one
  const flareSeed = new Float32Array(FLARE_COUNT);
  const flareSpeedAttr = new Float32Array(FLARE_COUNT);
  const flarePhase = new Float32Array(FLARE_COUNT);
  const flareCol = new Float32Array(FLARE_COUNT * 3);
  const flareColorBase = [0xffe2a8, 0xffb35c, 0xff7a33];
  for(let i=0;i<FLARE_COUNT;i++){
    flareSeed[i] = Math.random() * 1000;
    flareSpeedAttr[i] = 0.25 + Math.random() * 0.45;
    flarePhase[i] = Math.random() * 10;
    tmpColor.set(flareColorBase[i % flareColorBase.length]);
    flareCol[i*3]=tmpColor.r; flareCol[i*3+1]=tmpColor.g; flareCol[i*3+2]=tmpColor.b;
  }
  const flareGeo = new THREE.BufferGeometry();
  flareGeo.setAttribute('position', new THREE.BufferAttribute(flareDummy, 3));
  flareGeo.setAttribute('aSeed', new THREE.BufferAttribute(flareSeed, 1));
  flareGeo.setAttribute('aSpeed', new THREE.BufferAttribute(flareSpeedAttr, 1));
  flareGeo.setAttribute('aPhase', new THREE.BufferAttribute(flarePhase, 1));
  flareGeo.setAttribute('color', new THREE.BufferAttribute(flareCol, 3));
  const flareMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 }, uPulse: { value: 1 }, uSize: { value: 0.06 },
      uPerspective: { value: 1 }, uOpacity: { value: 1 },
      uTint: { value: new THREE.Vector3(1, 1, 1) },
    },
    vertexShader: `
      uniform float uTime, uPulse, uSize, uPerspective;
      uniform vec3 uTint;
      attribute float aSeed, aSpeed, aPhase;
      attribute vec3 color;
      varying vec3 vColor;
      float hash(float n){ return fract(sin(n) * 43758.5453123); }
      vec3 hashDir(float n){
        float u = hash(n), v = hash(n + 17.17);
        float theta = 6.28318530718 * u;
        float phi = acos(2.0 * v - 1.0);
        return vec3(sin(phi)*cos(theta), sin(phi)*sin(theta), cos(phi));
      }
      void main(){
        float raw = uTime * aSpeed * uPulse + aPhase;
        float loopCount = floor(raw);
        float life = fract(raw);
        vec3 dir = hashDir(aSeed * 97.13 + loopCount * 13.37);
        float reach = 1.0 + pow(sin(life * 3.14159265), 0.7) * 1.35;
        float fade = sin(life * 3.14159265);
        vColor = color * uTint * (fade * (0.5 + uPulse * 0.5));
        vec3 pos = dir * reach;
        vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
        gl_PointSize = uSize * (uPerspective / -mvPosition.z);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: DOT_FRAGMENT_SHADER,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const flares = new THREE.Points(flareGeo, flareMat);
  flares.frustumCulled = false;
  reactor.add(flares);

  resize();
  window.addEventListener('resize', resize);
  coreResize = resize;

  // orbiting halo rings, tilted at different angles — the JARVIS-reactor look
  // (small static particle counts rotated via their pivot — already cheap, left as-is)
  const ringConfigs = [
    { radius:1.9, count:920, tiltX:0.15,  tiltZ:0.05,  speed: 0.006,  colorIdx:0 },
    { radius:2.25,count:980, tiltX:1.15,  tiltZ:0.35,  speed:-0.0045, colorIdx:1 },
    { radius:2.55,count:1050,tiltX:0.55,  tiltZ:-0.85, speed: 0.0038, colorIdx:2 },
    { radius:2.85,count:840, tiltX:-0.75, tiltZ:0.6,   speed:-0.0052, colorIdx:0 },
  ];
  const rings = ringConfigs.map(cfg => {
    const positions = new Float32Array(cfg.count * 3);
    const cols = new Float32Array(cfg.count * 3);
    tmpColor.set(palette[cfg.colorIdx]);
    for(let i=0;i<cfg.count;i++){
      const idx = i*3;
      const a = (i / cfg.count) * Math.PI * 2;
      const r = cfg.radius + (Math.random()-0.5) * 0.05;
      positions[idx]   = Math.cos(a) * r;
      positions[idx+1] = Math.sin(a) * r;
      positions[idx+2] = (Math.random()-0.5) * 0.05;
      cols[idx]=tmpColor.r; cols[idx+1]=tmpColor.g; cols[idx+2]=tmpColor.b;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    const mat = new THREE.PointsMaterial({
      map:glowSprite, size:0.07, vertexColors:true, transparent:true, opacity:0.9,
      blending:THREE.AdditiveBlending, depthWrite:false,
    });
    const points = new THREE.Points(geo, mat);
    const pivot = new THREE.Object3D();
    pivot.rotation.set(cfg.tiltX, 0, cfg.tiltZ);
    pivot.add(points);
    reactor.add(pivot);
    return { points, speed: cfg.speed };
  });

  // ----- electric "plasma" filaments: jagged blue-violet lightning arcs
  // radiating from near the center out past the core shell, layered on top
  // of the warm particle sphere/rings above. Bolt shapes are baked in on the
  // CPU (random per-segment jaggedness, once) — the shader only adds a small
  // live wiggle + a per-bolt on/off flicker, so it reads as "alive" electricity
  // without recomputing geometry every frame. Intensity ties into curPulse/
  // curListen below, so it visibly flares while the orb listens or speaks.
  const BOLT_COUNT = 22;
  const SEG_COUNT = 9; // 9 segments -> 10 points per bolt
  // real GL line width is capped at 1px on most browsers/drivers, so a single
  // strand per bolt reads as an invisible hairline — fake thickness/glow by
  // drawing 3 parallel strands per bolt (bright core + two dimmer side rails)
  const STRAND_OFFSETS = [-0.045, 0, 0.045];
  const STRAND_WEIGHTS = [0.55, 1.0, 0.55];
  const boltPalette = [0x5ad7ff, 0x8ec9ff, 0xb98bff, 0x9fe8ff];
  const boltPositions = [], boltSeedAttr = [], boltTAttr = [], boltPerpAttr = [], boltColAttr = [];
  for(let b=0; b<BOLT_COUNT; b++){
    const u = Math.random(), v = Math.random();
    const theta = 2*Math.PI*u, phi = Math.acos(2*v-1);
    const dir = new THREE.Vector3(Math.sin(phi)*Math.cos(theta), Math.sin(phi)*Math.sin(theta), Math.cos(phi));
    const up = Math.abs(dir.y) < 0.99 ? new THREE.Vector3(0,1,0) : new THREE.Vector3(1,0,0);
    const perp1 = new THREE.Vector3().crossVectors(dir, up).normalize();
    const perp2 = new THREE.Vector3().crossVectors(dir, perp1).normalize();

    const r0 = 0.18, r1 = 1.75 + Math.random()*0.95;
    const jitterAmp = 0.32 + Math.random()*0.28;
    tmpColor.set(boltPalette[b % boltPalette.length]);

    const pts = [];
    for(let s=0; s<=SEG_COUNT; s++){
      const t = s / SEG_COUNT;
      const r = r0 + (r1-r0) * t;
      const envelope = Math.sin(t * Math.PI); // tapers jaggedness to 0 at both ends
      const j1 = (Math.random()-0.5) * jitterAmp * envelope;
      const j2 = (Math.random()-0.5) * jitterAmp * envelope;
      pts.push({ base: dir.clone().multiplyScalar(r).addScaledVector(perp1, j1).addScaledVector(perp2, j2), envelope });
    }
    STRAND_OFFSETS.forEach((off, si) => {
      const weight = STRAND_WEIGHTS[si];
      for(let s=0; s<SEG_COUNT; s++){
        const tA = s / SEG_COUNT, tB = (s+1) / SEG_COUNT;
        [[pts[s], tA], [pts[s+1], tB]].forEach(([pt, t]) => {
          const p = pt.base.clone().addScaledVector(perp2, off * pt.envelope);
          boltPositions.push(p.x, p.y, p.z);
          boltSeedAttr.push(b);
          boltTAttr.push(t);
          boltPerpAttr.push(perp1.x, perp1.y, perp1.z);
          boltColAttr.push(tmpColor.r * weight, tmpColor.g * weight, tmpColor.b * weight);
        });
      }
    });
  }
  const lightningGeo = new THREE.BufferGeometry();
  lightningGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(boltPositions), 3));
  lightningGeo.setAttribute('aSeed', new THREE.BufferAttribute(new Float32Array(boltSeedAttr), 1));
  lightningGeo.setAttribute('aT', new THREE.BufferAttribute(new Float32Array(boltTAttr), 1));
  lightningGeo.setAttribute('aPerp', new THREE.BufferAttribute(new Float32Array(boltPerpAttr), 3));
  lightningGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(boltColAttr), 3));
  const lightningMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uPulse: { value: 0.4 }, uOpacity: { value: 1.6 } },
    vertexShader: `
      uniform float uTime, uPulse, uOpacity;
      attribute float aSeed, aT;
      attribute vec3 aPerp;
      attribute vec3 color;
      varying vec3 vColor;
      varying float vAlpha;
      float hash11(float n){ return fract(sin(n) * 43758.5453123); }
      void main(){
        float h = hash11(aSeed * 13.7 + 4.21);
        // each bolt flips on/off a few times a second, offset by its own seed —
        // reads as chaotic sparking rather than one synced pulse
        float flickerPhase = floor(uTime * 3.0 + h * 10.0);
        float flicker = step(0.3, hash11(flickerPhase + aSeed * 91.7));
        float envelope = pow(sin(clamp(aT, 0.0, 1.0) * 3.14159265), 0.6);
        float wiggle = sin(uTime * 2.2 + aT * 8.0 + h * 6.283185) * 0.07 * envelope;
        vec3 pos = position + aPerp * wiggle;
        vAlpha = flicker * envelope * uOpacity * uPulse;
        vColor = color;
        vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      varying float vAlpha;
      void main(){ gl_FragColor = vec4(vColor, clamp(vAlpha, 0.0, 1.0)); }
    `,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const lightning = new THREE.LineSegments(lightningGeo, lightningMat);
  lightning.frustumCulled = false;
  reactor.add(lightning);

  // ----- "seeker" bolts: unlike the ambient sparks above (baked-in random
  // directions), these continuously re-aim toward wherever the cursor/finger
  // currently is — direction comes from a uSeekDir uniform recomputed every
  // frame in animate() below, not from baked geometry, so only jitter/strand
  // offsets are baked in here. Added directly to the scene (not `reactor`)
  // so the reactor's own rotation doesn't compound with the aim direction.
  const SEEKER_COUNT = 2;
  const seekerColors = [0x9fe8ff, 0xc9a9ff];
  const seekPositions = [], seekSeedAttr = [], seekTAttr = [], seekJ1Attr = [], seekJ2Attr = [], seekColAttr = [];
  for(let b=0; b<SEEKER_COUNT; b++){
    tmpColor.set(seekerColors[b % seekerColors.length]);
    const boltBiasJ1 = (b - (SEEKER_COUNT-1)/2) * 0.12; // spreads multiple seeker bolts apart slightly
    const pts = [];
    for(let s=0; s<=SEG_COUNT; s++){
      const t = s / SEG_COUNT;
      const envelope = Math.sin(t * Math.PI);
      pts.push({
        t,
        j1: boltBiasJ1 + (Math.random()-0.5) * 0.35 * envelope,
        j2: (Math.random()-0.5) * 0.35 * envelope,
        envelope,
      });
    }
    STRAND_OFFSETS.forEach((off, si) => {
      const weight = STRAND_WEIGHTS[si];
      for(let s=0; s<SEG_COUNT; s++){
        [pts[s], pts[s+1]].forEach(pt => {
          seekPositions.push(0, 0, 0);
          seekSeedAttr.push(b);
          seekTAttr.push(pt.t);
          seekJ1Attr.push(pt.j1);
          seekJ2Attr.push(pt.j2 + off * pt.envelope);
          seekColAttr.push(tmpColor.r * weight, tmpColor.g * weight, tmpColor.b * weight);
        });
      }
    });
  }
  const seekGeo = new THREE.BufferGeometry();
  seekGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(seekPositions), 3));
  seekGeo.setAttribute('aSeed', new THREE.BufferAttribute(new Float32Array(seekSeedAttr), 1));
  seekGeo.setAttribute('aT', new THREE.BufferAttribute(new Float32Array(seekTAttr), 1));
  seekGeo.setAttribute('aJ1', new THREE.BufferAttribute(new Float32Array(seekJ1Attr), 1));
  seekGeo.setAttribute('aJ2', new THREE.BufferAttribute(new Float32Array(seekJ2Attr), 1));
  seekGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(seekColAttr), 3));
  const seekMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 }, uPulse: { value: 0.9 }, uOpacity: { value: 1.7 },
      uSeekDir: { value: new THREE.Vector3(0, 0, 1) },
    },
    vertexShader: `
      uniform float uTime, uPulse, uOpacity;
      uniform vec3 uSeekDir;
      attribute float aSeed, aT, aJ1, aJ2;
      attribute vec3 color;
      varying vec3 vColor;
      varying float vAlpha;
      float hash11(float n){ return fract(sin(n) * 43758.5453123); }
      void main(){
        vec3 dir = normalize(uSeekDir);
        vec3 up = abs(dir.y) < 0.99 ? vec3(0.0,1.0,0.0) : vec3(1.0,0.0,0.0);
        vec3 perp1 = normalize(cross(dir, up));
        vec3 perp2 = normalize(cross(dir, perp1));
        float t = clamp(aT, 0.0, 1.0);
        float r = mix(0.2, 3.3, t);
        float h = hash11(aSeed * 13.7 + 4.21);
        float wiggle = sin(uTime * 2.6 + t * 8.0 + h * 6.283185) * 0.05;
        vec3 pos = dir * r + perp1 * (aJ1 + wiggle) + perp2 * aJ2;
        float envelope = pow(sin(t * 3.14159265), 0.4);
        vAlpha = envelope * uOpacity * uPulse;
        vColor = color;
        vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      varying float vAlpha;
      void main(){ gl_FragColor = vec4(vColor, clamp(vAlpha, 0.0, 1.0)); }
    `,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const seekerBolts = new THREE.LineSegments(seekGeo, seekMat);
  seekerBolts.frustumCulled = false;
  scene.add(seekerBolts);
  const seekWorld = new THREE.Vector3();

  // the core reactor is the ONLY particle system that tracks the pointer —
  // continuous follow (not just a hover boolean), tracked globally so it keeps
  // responding even as the cursor/finger moves across the whole screen.
  let hover = 0, curHover = 0;
  const ptr = {x:0, y:0}, curPtr = {x:0, y:0};
  wrap.addEventListener('mouseenter', () => { hover = 1; });
  wrap.addEventListener('mouseleave', () => { hover = 0; });
  wrap.addEventListener('touchstart', () => { hover = 1; }, {passive:true});
  wrap.addEventListener('touchend', () => { hover = 0; });
  window.addEventListener('mousemove', e => {
    ptr.x = (e.clientX / window.innerWidth) * 2 - 1;
    ptr.y = -(e.clientY / window.innerHeight) * 2 + 1;
  });
  window.addEventListener('touchmove', e => {
    if(!e.touches.length) return;
    ptr.x = (e.touches[0].clientX / window.innerWidth) * 2 - 1;
    ptr.y = -(e.touches[0].clientY / window.innerHeight) * 2 + 1;
  }, {passive:true});

  // baseline (sun) vs. listening (cool cyan) colors for the corona sprites —
  // lerped live in animate() based on curListen, alongside the core/flare uTint
  const coronaBase = new THREE.Color(0xff9d3d);
  const coronaListen = new THREE.Color(0x5ad7ff);
  const coronaBase2 = new THREE.Color(0xffe2a8);
  const coronaListen2 = new THREE.Color(0x9fe8ff);
  const tintNeutral = new THREE.Vector3(1, 1, 1);
  const tintListen = new THREE.Vector3(0.55, 0.85, 1.3);
  const curTint = new THREE.Vector3(1, 1, 1);

  const clock = new THREE.Clock();
  let curPulse = 1;
  let curListen = 0;
  function animate(){
    requestAnimationFrame(animate);
    const t = clock.getElapsedTime() * 0.72; // matches the old ~0.012/frame @60fps pace
    curHover += (hover - curHover) * 0.08;
    curPulse += (reactorPulse - curPulse) * 0.05;
    curListen += ((reactorListening ? 1 : 0) - curListen) * 0.08;
    curPtr.x += (ptr.x - curPtr.x) * 0.04;
    curPtr.y += (ptr.y - curPtr.y) * 0.04;

    // idle/speaking = warm sun palette, listening = cool cyan tint — gives the
    // orb a visibly distinct "I'm hearing you" state versus "I'm responding"
    const targetTint = curListen > 0.001 ? tintListen : tintNeutral;
    curTint.lerp(targetTint, 0.08);
    coreMat.uniforms.uTint.value.copy(curTint);
    flareMat.uniforms.uTint.value.copy(curTint);
    coronaMat.color.copy(coronaBase).lerp(coronaListen, curListen);
    coronaMat2.color.copy(coronaBase2).lerp(coronaListen2, curListen);

    flareMat.uniforms.uTime.value = t;
    flareMat.uniforms.uPulse.value = curPulse;

    // corona breathes with the reactor's pulse
    const coronaPulse = 1 + Math.sin(t*1.1) * 0.08 + (curPulse-1) * 0.25;
    corona.scale.setScalar(4.4 * coronaPulse);
    coronaMat.opacity = 0.4 * Math.min(curPulse, 1.8);
    coronaInner.scale.setScalar(2.6 * (1 + Math.sin(t*1.4)*0.06));
    coronaMat2.opacity = 0.55 * Math.min(curPulse, 1.6);

    coreMat.uniforms.uTime.value = t;
    coreMat.uniforms.uSpread.value = 1 + curHover * 0.3 + curListen * 0.18 + Math.sin(t*1.6)*0.04*curPulse;
    coreMat.uniforms.uSize.value = 0.045 * (1 + Math.sin(t*1.4)*0.18*curPulse);

    coreSphere.rotation.y += 0.003 + curHover*0.004;

    // ambient sparking at idle, flaring brighter while listening/speaking
    lightningMat.uniforms.uTime.value = t;
    lightningMat.uniforms.uPulse.value = 0.75 + Math.min(curPulse - 1, 2.5) * 0.7 + curListen * 0.6;

    // seeker bolts re-aim toward the cursor/finger every frame
    seekWorld.set(curPtr.x, curPtr.y, 0.5).unproject(camera);
    seekMat.uniforms.uSeekDir.value.copy(seekWorld.sub(camera.position).normalize());
    seekMat.uniforms.uTime.value = t;
    seekMat.uniforms.uPulse.value = lightningMat.uniforms.uPulse.value;

    const ringSpread = 1 + curHover * 0.2;
    rings.forEach(r => {
      r.points.rotation.z += r.speed * (1 + curHover*1.5 + curPulse*0.3);
      r.points.scale.setScalar(ringSpread);
    });

    // the whole reactor tilts to follow the cursor/finger, like it's tracking you
    reactor.rotation.y = Math.sin(t*0.25) * 0.1 + curPtr.x * 0.45;
    reactor.rotation.x = -curPtr.y * 0.3;

    renderer.render(scene, camera);
    glowCtx.clearRect(0, 0, glowCanvas.width, glowCanvas.height);
    glowCtx.drawImage(canvas, 0, 0, glowCanvas.width, glowCanvas.height);
  }
  animate();
})();
