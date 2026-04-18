import * as THREE from "https://esm.sh/three@0.160.0";
import { OrbitControls } from "https://esm.sh/three@0.160.0/examples/jsm/controls/OrbitControls.js";

function devicePixelRatio() {
  return Math.min(2, window.devicePixelRatio || 1);
}

function createSatelliteTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#07101d";
  ctx.fillRect(0, 0, 256, 256);

  const gradient = ctx.createLinearGradient(0, 0, 256, 256);
  gradient.addColorStop(0, "#214f77");
  gradient.addColorStop(1, "#0b2234");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 256, 256);

  ctx.strokeStyle = "rgba(165, 220, 255, 0.38)";
  ctx.lineWidth = 3;
  for (let i = 12; i <= 244; i += 26) {
    ctx.beginPath();
    ctx.moveTo(i, 12);
    ctx.lineTo(i, 244);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(12, i);
    ctx.lineTo(244, i);
    ctx.stroke();
  }

  ctx.fillStyle = "#d8dde5";
  ctx.fillRect(86, 84, 84, 88);
  ctx.fillStyle = "#8fa4b6";
  ctx.fillRect(96, 94, 64, 68);
  ctx.strokeStyle = "#53ffd2";
  ctx.lineWidth = 6;
  ctx.strokeRect(82, 80, 92, 96);

  ctx.fillStyle = "#f5d36e";
  ctx.beginPath();
  ctx.arc(128, 128, 20, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#2be6b4";
  ctx.fillRect(22, 110, 48, 36);
  ctx.fillRect(186, 110, 48, 36);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createAsteroidTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#62666e";
  ctx.fillRect(0, 0, 256, 256);

  for (let i = 0; i < 650; i++) {
    const x = Math.random() * 256;
    const y = Math.random() * 256;
    const size = Math.random() * 18 + 4;
    const alpha = Math.random() * 0.35 + 0.12;
    const shade = Math.floor(90 + Math.random() * 95);
    ctx.fillStyle = `rgba(${shade},${shade},${shade + 10},${alpha})`;
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fill();
  }

  for (let i = 0; i < 18; i++) {
    ctx.strokeStyle = "rgba(220,220,230,0.12)";
    ctx.lineWidth = Math.random() * 4 + 1;
    ctx.beginPath();
    ctx.arc(Math.random() * 256, Math.random() * 256, Math.random() * 28 + 6, 0, Math.PI * 2);
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function createThreeScene({ canvas, onObjectSelect }) {
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

  scene.add(new THREE.AmbientLight(0xffffff, 0.35));
  const key = new THREE.DirectionalLight(0xffffff, 1.1);
  key.position.set(80, 40, 90);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x8ab6ff, 0.55);
  rim.position.set(-120, 10, -90);
  scene.add(rim);

  const tex = new THREE.TextureLoader();
  const earthDay = tex.load("./assets/textures/earth_day.png");
  const earthNight = tex.load("./assets/textures/earth_night.jpg");
  earthDay.colorSpace = THREE.SRGBColorSpace;
  earthNight.colorSpace = THREE.SRGBColorSpace;

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

  const atmoGeo = new THREE.SphereGeometry(18.7, 64, 64);
  const atmoMat = new THREE.MeshBasicMaterial({
    color: 0x6df2d8,
    transparent: true,
    opacity: 0.08,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  scene.add(new THREE.Mesh(atmoGeo, atmoMat));

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
  const stars = new THREE.Points(
    starsGeo,
    new THREE.PointsMaterial({ color: 0xffffff, size: 0.8, opacity: 0.85, transparent: true })
  );
  scene.add(stars);

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
  addRing(55, 0x6df2d8, 0.1);
  addRing(70, 0xff6b8a, 0.07);

  const panelColor = createSatelliteTexture();
  const satGeo = new THREE.BoxGeometry(1.2, 0.65, 0.9);
  const satMat = new THREE.MeshStandardMaterial({
    map: panelColor,
    color: 0xe7fff8,
    roughness: 0.34,
    metalness: 0.48,
    emissive: 0x0f2d26,
    emissiveIntensity: 0.22,
  });
  const asteroidGeo = new THREE.IcosahedronGeometry(1.2, 1);
  const asteroidMat = new THREE.MeshStandardMaterial({
    map: createAsteroidTexture(),
    color: 0xc8a47b,
    roughness: 0.96,
    metalness: 0.02,
    emissive: 0x17110a,
    emissiveIntensity: 0.12,
  });

  let satMesh = new THREE.InstancedMesh(satGeo, satMat, 1);
  satMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  satMesh.frustumCulled = false;
  scene.add(satMesh);

  let asteroidMesh = new THREE.InstancedMesh(asteroidGeo, asteroidMat, 1);
  asteroidMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  asteroidMesh.frustumCulled = false;
  scene.add(asteroidMesh);

  const cellGroup = new THREE.Group();
  scene.add(cellGroup);

  const intentGroup = new THREE.Group();
  scene.add(intentGroup);

  const satelliteOrbitGroup = new THREE.Group();
  scene.add(satelliteOrbitGroup);

  const impactMarkerGroup = new THREE.Group();
  scene.add(impactMarkerGroup);

  const selectedPathGroup = new THREE.Group();
  scene.add(selectedPathGroup);

  const satBodies = [];
  const asteroidBodies = [];
  const bodyPositions = new Map();
  let selectedId = null;
  let focusId = null;

  const tempMatrix = new THREE.Matrix4();
  const tempQuat = new THREE.Quaternion();
  const tempEuler = new THREE.Euler();
  const tempPos = new THREE.Vector3();
  const tempScale = new THREE.Vector3(1, 1, 1);
  const tempColor = new THREE.Color();
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let pointerDown = null;

  function resize() {
    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function rebuildMesh(kind, count) {
    const mesh = kind === "satellite" ? satMesh : asteroidMesh;
    const geometry = kind === "satellite" ? satGeo : asteroidGeo;
    const material = kind === "satellite" ? satMat : asteroidMat;
    if (mesh.count === count) return;
    scene.remove(mesh);
    mesh.dispose?.();
    const nextMesh = new THREE.InstancedMesh(geometry, material, Math.max(1, count));
    nextMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    nextMesh.frustumCulled = false;
    scene.add(nextMesh);
    if (kind === "satellite") satMesh = nextMesh;
    else asteroidMesh = nextMesh;
  }

  function poseMesh(mesh, body, index) {
    tempPos.set(body.position.x, body.position.y, body.position.z);
    tempEuler.set(body.spin * 0.22, body.spin * 0.35, body.spin * 0.18);
    tempQuat.setFromEuler(tempEuler);
    const baseScale = body.kind === "satellite" ? 1 : 1.12;
    const selectedScale = body.selected ? 1.3 : 1;
    tempScale.setScalar(baseScale * selectedScale);
    tempMatrix.compose(tempPos, tempQuat, tempScale);
    mesh.setMatrixAt(index, tempMatrix);
    tempColor.set(body.kind === "satellite" ? (body.selected ? 0x6df2d8 : 0xffffff) : body.selected ? 0xffb86b : 0xceb793);
    mesh.setColorAt(index, tempColor);
  }

  function setBodies(bodies) {
    satBodies.length = 0;
    asteroidBodies.length = 0;
    bodyPositions.clear();
    for (const body of bodies) {
      bodyPositions.set(body.id, body.position);
      if (body.kind === "satellite") satBodies.push(body);
      else asteroidBodies.push(body);
    }

    rebuildMesh("satellite", satBodies.length);
    rebuildMesh("asteroid", asteroidBodies.length);

    for (let i = 0; i < satBodies.length; i++) poseMesh(satMesh, satBodies[i], i);
    for (let i = 0; i < asteroidBodies.length; i++) poseMesh(asteroidMesh, asteroidBodies[i], i);

    satMesh.count = satBodies.length;
    asteroidMesh.count = asteroidBodies.length;
    satMesh.instanceMatrix.needsUpdate = true;
    asteroidMesh.instanceMatrix.needsUpdate = true;
    if (satMesh.instanceColor) satMesh.instanceColor.needsUpdate = true;
    if (asteroidMesh.instanceColor) asteroidMesh.instanceColor.needsUpdate = true;
  }

  function setSelectedObject(id) {
    selectedId = id ?? null;
  }

  function setSatelliteOrbits(orbits, { selectedId: highlightedId = null } = {}) {
    while (satelliteOrbitGroup.children.length) satelliteOrbitGroup.remove(satelliteOrbitGroup.children[0]);
    for (const orbit of orbits || []) {
      const selected = orbit.id === highlightedId;
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(orbit.points.map((p) => new THREE.Vector3(p.x, p.y, p.z))),
        new THREE.LineBasicMaterial({
          color: 0x41ff85,
          transparent: true,
          opacity: selected ? 0.95 : 0.42,
        })
      );
      satelliteOrbitGroup.add(line);
    }
  }

  function setImpactMarkers(markers) {
    while (impactMarkerGroup.children.length) impactMarkerGroup.remove(impactMarkerGroup.children[0]);
    for (const marker of markers || []) {
      const outer = new THREE.Mesh(
        new THREE.SphereGeometry(1.15, 20, 20),
        new THREE.MeshBasicMaterial({ color: 0xff8b5b, transparent: true, opacity: 0.42 })
      );
      outer.position.set(marker.position.x, marker.position.y, marker.position.z);
      impactMarkerGroup.add(outer);

      const inner = new THREE.Mesh(
        new THREE.SphereGeometry(0.46, 16, 16),
        new THREE.MeshBasicMaterial({ color: 0xffec9b, transparent: true, opacity: 0.96 })
      );
      inner.position.copy(outer.position);
      impactMarkerGroup.add(inner);
    }
  }

  function setPredictedPath(points, { kind = null } = {}) {
    while (selectedPathGroup.children.length) selectedPathGroup.remove(selectedPathGroup.children[0]);
    if (!points?.length) return;
    const color = kind === "asteroid" ? 0xffb86b : 0x6df2d8;
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(points.map((p) => new THREE.Vector3(p.x, p.y, p.z))),
      new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.95 })
    );
    selectedPathGroup.add(line);
    const end = points[points.length - 1];
    const marker = new THREE.Mesh(
      new THREE.SphereGeometry(0.9, 18, 18),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 })
    );
    marker.position.set(end.x, end.y, end.z);
    selectedPathGroup.add(marker);
  }

  function setCameraFocus(id) {
    focusId = id ?? null;
  }

  function clearCameraFocus() {
    focusId = null;
    controls.target.lerp(new THREE.Vector3(0, 0, 0), 0.5);
  }

  function setCellsOverlay({ enabled, ringRadius = 55, sectors = 12, color = 0x6df2d8 }) {
    cellGroup.visible = Boolean(enabled);
    if (!enabled) return;
    while (cellGroup.children.length) cellGroup.remove(cellGroup.children[0]);
    const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.22 });
    for (let i = 0; i < sectors; i++) {
      const a = (i / sectors) * Math.PI * 2;
      const b = ((i + 1) / sectors) * Math.PI * 2;
      const g = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(ringRadius * Math.cos(a), 0, ringRadius * Math.sin(a)),
        new THREE.Vector3((ringRadius + 16) * Math.cos(a), 0, (ringRadius + 16) * Math.sin(a)),
      ]);
      cellGroup.add(new THREE.Line(g, mat));

      const arcPts = [];
      for (let j = 0; j <= 10; j++) {
        const t = j / 10;
        const ang = a + (b - a) * t;
        arcPts.push(new THREE.Vector3((ringRadius + 16) * Math.cos(ang), 0, (ringRadius + 16) * Math.sin(ang)));
      }
      cellGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(arcPts), mat));
    }
  }

  function setIntentLines(lines, { enabled } = { enabled: false }) {
    intentGroup.visible = Boolean(enabled);
    while (intentGroup.children.length) intentGroup.remove(intentGroup.children[0]);
    if (!enabled) return;
    const mat = new THREE.LineBasicMaterial({ color: 0xffb86b, transparent: true, opacity: 0.5 });
    for (const ln of lines) {
      intentGroup.add(
        new THREE.Line(
          new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(ln.a.x, ln.a.y, ln.a.z),
            new THREE.Vector3(ln.b.x, ln.b.y, ln.b.z),
          ]),
          mat
        )
      );
    }
  }

  function pickBody(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects([satMesh, asteroidMesh], false);
    if (!hits.length) {
      onObjectSelect?.(null);
      return;
    }
    const hit = hits[0];
    const instanceId = hit.instanceId ?? -1;
    if (hit.object === satMesh && satBodies[instanceId]) {
      onObjectSelect?.(satBodies[instanceId].id);
      return;
    }
    if (hit.object === asteroidMesh && asteroidBodies[instanceId]) {
      onObjectSelect?.(asteroidBodies[instanceId].id);
      return;
    }
    onObjectSelect?.(null);
  }

  canvas.addEventListener("pointerdown", (event) => {
    pointerDown = { x: event.clientX, y: event.clientY };
  });

  canvas.addEventListener("pointerup", (event) => {
    if (!pointerDown) return;
    const dx = event.clientX - pointerDown.x;
    const dy = event.clientY - pointerDown.y;
    pointerDown = null;
    if (Math.hypot(dx, dy) > 6) return;
    pickBody(event.clientX, event.clientY);
  });

  function render() {
    if (focusId && bodyPositions.has(focusId)) {
      const pos = bodyPositions.get(focusId);
      const target = new THREE.Vector3(pos.x, pos.y, pos.z);
      const offset = camera.position.clone().sub(controls.target);
      if (offset.lengthSq() < 0.001) offset.set(8, 4, 8);
      offset.normalize().multiplyScalar(12);
      offset.y += 2.6;
      controls.target.lerp(target, 0.16);
      camera.position.lerp(target.clone().add(offset), 0.14);
    }
    controls.update();
    earth.rotation.y += 0.0013;
    stars.rotation.y += 0.00025;
    selectedPathGroup.visible = selectedId != null;
    renderer.render(scene, camera);
  }

  resize();
  window.addEventListener("resize", resize);

  return {
    THREE,
    resize,
    render,
    setBodies,
    setSelectedObject,
    setSatelliteOrbits,
    setImpactMarkers,
    setPredictedPath,
    setCameraFocus,
    clearCameraFocus,
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

