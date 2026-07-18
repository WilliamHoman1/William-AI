// ---------- the "core" — a large floating 3D particle reactor with orbiting rings ----------
(function initCore(){
  const canvas = document.getElementById('coreParticles');
  const wrap = canvas.parentElement;
  const renderer = new THREE.WebGLRenderer({ canvas, alpha:true, antialias:true });
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 30);
  camera.position.z = 9.5;

  let uPerspective = 1;
  function resize(){
    const s = wrap.clientWidth;
    renderer.setSize(s, s, false);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    camera.aspect = 1;
    camera.updateProjectionMatrix();
    uPerspective = computePerspective(renderer, camera);
    if(coreMat) coreMat.uniforms.uPerspective.value = uPerspective;
    if(flareMat) flareMat.uniforms.uPerspective.value = uPerspective;
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
  const CORE_COUNT = 3800;
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
    },
    vertexShader: `
      uniform float uTime, uSpread, uSize, uPerspective;
      attribute float aSeed;
      attribute vec3 color;
      varying vec3 vColor;
      float hash11(float n){ return fract(sin(n) * 43758.5453123); }
      void main(){
        vColor = color;

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
  const FLARE_COUNT = 900;
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
    },
    vertexShader: `
      uniform float uTime, uPulse, uSize, uPerspective;
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
        vColor = color * (fade * (0.5 + uPulse * 0.5));
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

  // orbiting halo rings, tilted at different angles — the JARVIS-reactor look
  // (small static particle counts rotated via their pivot — already cheap, left as-is)
  const ringConfigs = [
    { radius:1.9, count:760, tiltX:0.15,  tiltZ:0.05,  speed: 0.006,  colorIdx:0 },
    { radius:2.25,count:820, tiltX:1.15,  tiltZ:0.35,  speed:-0.0045, colorIdx:1 },
    { radius:2.55,count:880, tiltX:0.55,  tiltZ:-0.85, speed: 0.0038, colorIdx:2 },
    { radius:2.85,count:700, tiltX:-0.75, tiltZ:0.6,   speed:-0.0052, colorIdx:0 },
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

  const clock = new THREE.Clock();
  let curPulse = 1;
  function animate(){
    requestAnimationFrame(animate);
    const t = clock.getElapsedTime() * 0.72; // matches the old ~0.012/frame @60fps pace
    curHover += (hover - curHover) * 0.08;
    curPulse += (reactorPulse - curPulse) * 0.05;
    curPtr.x += (ptr.x - curPtr.x) * 0.04;
    curPtr.y += (ptr.y - curPtr.y) * 0.04;

    flareMat.uniforms.uTime.value = t;
    flareMat.uniforms.uPulse.value = curPulse;

    // corona breathes with the reactor's pulse
    const coronaPulse = 1 + Math.sin(t*1.1) * 0.08 + (curPulse-1) * 0.25;
    corona.scale.setScalar(4.4 * coronaPulse);
    coronaMat.opacity = 0.4 * Math.min(curPulse, 1.8);
    coronaInner.scale.setScalar(2.6 * (1 + Math.sin(t*1.4)*0.06));
    coronaMat2.opacity = 0.55 * Math.min(curPulse, 1.6);

    coreMat.uniforms.uTime.value = t;
    coreMat.uniforms.uSpread.value = 1 + curHover * 0.3 + Math.sin(t*1.6)*0.04*curPulse;
    coreMat.uniforms.uSize.value = 0.045 * (1 + Math.sin(t*1.4)*0.18*curPulse);

    coreSphere.rotation.y += 0.003 + curHover*0.004;

    const ringSpread = 1 + curHover * 0.2;
    rings.forEach(r => {
      r.points.rotation.z += r.speed * (1 + curHover*1.5 + curPulse*0.3);
      r.points.scale.setScalar(ringSpread);
    });

    // the whole reactor tilts to follow the cursor/finger, like it's tracking you
    reactor.rotation.y = Math.sin(t*0.25) * 0.1 + curPtr.x * 0.45;
    reactor.rotation.x = -curPtr.y * 0.3;

    renderer.render(scene, camera);
  }
  animate();
})();
