import * as THREE from "https://esm.sh/three@0.160.0";
import { OrbitControls } from "https://esm.sh/three@0.160.0/examples/jsm/controls/OrbitControls.js";

function devicePixelRatio() {
  return Math.min(2, window.devicePixelRatio || 1);
}

export function createThreeScene({ canvas }) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: "high-performance",
  });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(devicePixelRatio());

  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 2000);
  camera.position.set(0, 42, 120);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.minDistance = 55;
  controls.maxDistance = 220;
  controls.target.set(0, 0, 0);
  controls.update();

  // Lighting
  scene.add(new THREE.AmbientLight(0xffffff, 0.35));
  const key = new THREE.DirectionalLight(0xffffff, 1.1);
  key.position.set(80, 40, 90);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x8ab6ff, 0.55);
  rim.position.set(-120, 10, -90);
  scene.add(rim);

  // Textures (real-world)
  const tex = new THREE.TextureLoader();
  const earthDay = tex.load("./assets/textures/earth_day.png");
  const earthNight = tex.load("./assets/textures/earth_night.jpg");
  earthDay.colorSpace = THREE.SRGBColorSpace;
  earthNight.colorSpace = THREE.SRGBColorSpace;

  // Earth (textured)
  const earthGeo = new THREE.SphereGeometry(18, 64, 64);
  const earthMat = new THREE.MeshStandardMaterial({
    map: earthDay,
    emissiveMap: earthNight,
    emissive: new THREE.Color(0xffffff),
    emissiveIntensity: 0.65,
    roughness: 0.92,
    metalness: 0.02,
  });
  const earth = new THREE.Mesh(earthGeo, earthMat);
  scene.add(earth);

  // Atmosphere glow
  const atmoGeo = new THREE.SphereGeometry(18.7, 64, 64);
  const atmoMat = new THREE.MeshBasicMaterial({
    color: 0x6df2d8,
    transparent: true,
    opacity: 0.08,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const atmo = new THREE.Mesh(atmoGeo, atmoMat);
  scene.add(atmo);

  // Stars
  const starCount = 1200;
  const starPos = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    const r = 700 * Math.pow(Math.random(), 0.35) + 140;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    starPos[i * 3 + 0] = r * Math.sin(phi) * Math.cos(theta);
    starPos[i * 3 + 1] = r * Math.cos(phi);
    starPos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
  }
  const starsGeo = new THREE.BufferGeometry();
  starsGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
  const starsMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.8, opacity: 0.85, transparent: true });
  const stars = new THREE.Points(starsGeo, starsMat);
  scene.add(stars);

  // Orbital rings
  const ringGroup = new THREE.Group();
  scene.add(ringGroup);
  function addRing(radius, color, opacity) {
    const g = new THREE.RingGeometry(radius - 0.06, radius + 0.06, 256);
    const m = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(g, m);
    mesh.rotation.x = Math.PI / 2;
    ringGroup.add(mesh);
  }
  addRing(42, 0x8ab6ff, 0.12);
  addRing(55, 0x6df2d8, 0.10);
  addRing(70, 0xff6b8a, 0.07);

  // Satellites (instanced) with “real” panel texture
  const panelColor = tex.load("./assets/textures/SolarPanel003_1K/SolarPanel003_1K-JPG_Color.jpg");
  panelColor.colorSpace = THREE.SRGBColorSpace;

  const satGeo = new THREE.IcosahedronGeometry(0.7, 0);
  const satMat = new THREE.MeshStandardMaterial({
    map: panelColor,
    color: 0xe8f1ff,
    roughness: 0.45,
    metalness: 0.35,
    emissive: 0x071020,
    emissiveIntensity: 0.35,
  });
  let satMesh = new THREE.InstancedMesh(satGeo, satMat, 1);
  satMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  satMesh.frustumCulled = false;
  scene.add(satMesh);

  // Cells overlay (line segments)
  const cellGroup = new THREE.Group();
  scene.add(cellGroup);

  // Intent lines overlay
  const intentGroup = new THREE.Group();
  scene.add(intentGroup);

  function resize() {
    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function setSatelliteCount(n) {
    if (satMesh.count === n) return;
    scene.remove(satMesh);
    satMesh.dispose?.();
    satMesh = new THREE.InstancedMesh(satGeo, satMat, n);
    satMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    satMesh.frustumCulled = false;
    scene.add(satMesh);
  }

  function setSatelliteTransforms(positions, colors = null) {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3(1, 1, 1);
    for (let i = 0; i < positions.length; i++) {
      const p = positions[i];
      m.compose(new THREE.Vector3(p.x, p.y, p.z), q, s);
      satMesh.setMatrixAt(i, m);
      if (colors) satMesh.setColorAt(i, colors[i]);
    }
    satMesh.instanceMatrix.needsUpdate = true;
    if (colors) satMesh.instanceColor.needsUpdate = true;
  }

  function setCellsOverlay({ enabled, ringRadius = 55, sectors = 12, color = 0x6df2d8 }) {
    cellGroup.visible = Boolean(enabled);
    if (!enabled) return;
    while (cellGroup.children.length) cellGroup.remove(cellGroup.children[0]);

    const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.22 });
    for (let i = 0; i < sectors; i++) {
      const a = (i / sectors) * Math.PI * 2;
      const b = ((i + 1) / sectors) * Math.PI * 2;
      // radial boundary line
      const g = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(ringRadius * Math.cos(a), 0, ringRadius * Math.sin(a)),
        new THREE.Vector3((ringRadius + 16) * Math.cos(a), 0, (ringRadius + 16) * Math.sin(a)),
      ]);
      const line = new THREE.Line(g, mat);
      line.rotation.x = 0;
      cellGroup.add(line);

      // small arc tick to hint the sector
      const arcPts = [];
      const steps = 10;
      for (let j = 0; j <= steps; j++) {
        const t = j / steps;
        const ang = a + (b - a) * t;
        arcPts.push(new THREE.Vector3((ringRadius + 16) * Math.cos(ang), 0, (ringRadius + 16) * Math.sin(ang)));
      }
      const arcG = new THREE.BufferGeometry().setFromPoints(arcPts);
      const arc = new THREE.Line(arcG, mat);
      cellGroup.add(arc);
    }
  }

  function setIntentLines(lines, { enabled } = { enabled: false }) {
    intentGroup.visible = Boolean(enabled);
    while (intentGroup.children.length) intentGroup.remove(intentGroup.children[0]);
    if (!enabled) return;
    const mat = new THREE.LineBasicMaterial({ color: 0xffb86b, transparent: true, opacity: 0.5 });
    for (const ln of lines) {
      const g = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(ln.a.x, ln.a.y, ln.a.z),
        new THREE.Vector3(ln.b.x, ln.b.y, ln.b.z),
      ]);
      intentGroup.add(new THREE.Line(g, mat));
    }
  }

  function render() {
    controls.update();
    earth.rotation.y += 0.0013;
    stars.rotation.y += 0.00025;
    renderer.render(scene, camera);
  }

  resize();
  window.addEventListener("resize", resize);

  return {
    THREE,
    resize,
    render,
    setSatelliteCount,
    setSatelliteTransforms,
    setCellsOverlay,
    setIntentLines,
    setOverlaysVisible: ({ showCells, showIntents }) => {
      cellGroup.visible = Boolean(showCells);
      intentGroup.visible = Boolean(showIntents);
    },
    dispose: () => {
      window.removeEventListener("resize", resize);
      renderer.dispose();
    },
  };
}

