import { createThreeScene } from "./threeScene.js?v=orbit-selection-v3";

const MODES = ["baseline", "centralized", "swarm", "hybrid"];
const SATELLITE_COUNT = 3;
const ASTEROID_COUNT = 2;

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

function rand(a, b) {
  return a + Math.random() * (b - a);
}

function nowSeconds() {
  return performance.now() / 1000;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function lerpPoint(a, b, t) {
  return {
    x: lerp(a.x, b.x, t),
    y: lerp(a.y, b.y, t),
    z: lerp(a.z, b.z, t),
  };
}

function angleOnXZ(pos) {
  return Math.atan2(pos.z, pos.x);
}

function ringPos(radius, angle, inc = 0) {
  const x = radius * Math.cos(angle);
  const z = radius * Math.sin(angle);
  const y = z * Math.sin(inc);
  const zz = z * Math.cos(inc);
  return { x, y, z: zz };
}

function computeCellIndex(angle, sectors) {
  let a = angle % (Math.PI * 2);
  if (a < 0) a += Math.PI * 2;
  const idx = Math.floor((a / (Math.PI * 2)) * sectors);
  return clamp(idx, 0, sectors - 1);
}

function dist2(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return dx * dx + dy * dy + dz * dz;
}

function sampleLoopPath(points, progress) {
  if (!points?.length) return { x: 0, y: 0, z: 0 };
  const wrapped = ((progress % 1) + 1) % 1;
  const scaled = wrapped * points.length;
  const idx = Math.floor(scaled) % points.length;
  const nextIdx = (idx + 1) % points.length;
  return lerpPoint(points[idx], points[nextIdx], scaled - Math.floor(scaled));
}

function buildCircularOrbitPoints(radius, inc, steps = 84) {
  const points = [];
  for (let i = 0; i <= steps; i++) {
    const angle = (i / steps) * Math.PI * 2;
    points.push(ringPos(radius, angle, inc));
  }
  return points;
}

function buildRandomAsteroidPath(baseRadius, altitudeBias, yBias) {
  const points = [];
  const pointCount = 7;
  for (let i = 0; i < pointCount; i++) {
    const angle = (i / pointCount) * Math.PI * 2 + rand(-0.25, 0.25);
    const radius = baseRadius + rand(-11, 11) + altitudeBias;
    points.push({
      x: Math.cos(angle) * radius,
      y: yBias + rand(-10, 10),
      z: Math.sin(angle) * (radius + rand(-8, 8)),
    });
  }
  return points;
}

function fmtReason({ t, label, code, detail }) {
  const ts = `${t.toFixed(1)}s`;
  return `[${ts}] ${label} · ${code} · ${detail}`;
}

function orbitLabel(obj, world) {
  if (obj.kind === "asteroid") return "Random drift path";
  if (Math.abs(obj.radius - world.ringRadius2) < 4) return "Inner orbit";
  if (Math.abs(obj.radius - world.ringRadius) < 4) return "Primary orbit";
  if (Math.abs(obj.radius - world.ringRadius3) < 4) return "Outer orbit";
  return "Transfer orbit";
}

function buildObjectLabel(obj) {
  return obj.kind === "satellite" ? `SAT-${String(obj.id).padStart(3, "0")}` : `AST-${String(obj.id).padStart(3, "0")}`;
}

export function createApp({ canvas, onReasonLine, onMetrics, onSelectionChange }) {
  const scene = createThreeScene({
    canvas,
    onObjectSelect: (id) => selectObject(id),
  });

  let running = false;
  let mode = "swarm";
  let speedMult = 1;
  let params = {
    satelliteCount: SATELLITE_COUNT,
    asteroidCount: ASTEROID_COUNT,
    sensorNoise: 0.15,
    commsReliability: 0.85,
    riskTolerance: 0.35,
    overlays: { showCells: true, showIntents: false, protectedZone: true },
  };

  const world = {
    t0: nowSeconds(),
    lastT: nowSeconds(),
    tick: 0,
    sectors: 12,
    ringRadius: 55,
    ringRadius2: 42,
    ringRadius3: 70,
    protected: { enabled: true, centerAngle: 1.2, width: 0.5, radius: 55 },
    debris: null,
    objects: [],
    positions: [],
    metrics: {
      nearMisses: 0,
      maneuvers: 0,
      deltaV: 0,
      throughput: 0,
      msgRate: 0,
      _msgCount: 0,
      _lastMsgT: 0,
    },
    intentLines: [],
    impactMarkers: [],
    events: [],
    metricSeries: [],
    logicAccum: 0,
    lastReasonAt: -1e9,
    selectedId: null,
    focusedId: null,
  };

  const baseTimeScale = 0.09;
  const baseLogicIntervalSec = 10;

  function effectiveLogicIntervalSec() {
    return baseLogicIntervalSec / speedMult;
  }

  function time() {
    return nowSeconds() - world.t0;
  }

  function pushEvent(type, detail = {}) {
    world.events.push({ t: time(), type, detail });
    if (world.events.length > 200) world.events.shift();
  }

  function resetMetrics() {
    world.metrics.nearMisses = 0;
    world.metrics.maneuvers = 0;
    world.metrics.deltaV = 0;
    world.metrics.throughput = 0;
    world.metrics.msgRate = 0;
    world.metrics._msgCount = 0;
    world.metrics._lastMsgT = nowSeconds();
  }

  function logReason(obj) {
    if (!onReasonLine) return;
    const allowBurstCodes = new Set(["MODE", "EVENT", "SELECT", "FOCUS"]);
    const interval = effectiveLogicIntervalSec();
    if (!allowBurstCodes.has(obj.code) && time() - world.lastReasonAt < interval) return;
    world.lastReasonAt = time();
    onReasonLine(fmtReason(obj));
  }

  function getObjectById(id) {
    return world.objects.find((obj) => obj.id === id) || null;
  }

  function getSelectionSummary(obj) {
    if (!obj) return null;
    return {
      id: obj.id,
      kind: obj.kind,
      name: buildObjectLabel(obj),
      title: obj.name,
      orbitLabel: orbitLabel(obj, world),
      radius: obj.radius,
      speed: obj.speed * (obj.speedFactor ?? 1),
      baseSpeed: obj.speed,
      focused: world.focusedId === obj.id,
      description: obj.description,
    };
  }

  function listObjects() {
    return world.objects.map((obj) => getSelectionSummary(obj));
  }

  function buildPredictedPath(obj) {
    if (!obj) return [];
    if (obj.kind === "satellite") {
      return buildCircularOrbitPoints(obj.radius, obj.inc, 90);
    }

    const points = [];
    for (let i = 0; i <= 96; i++) {
      const progress = obj.pathProgress + (i / 96) * 0.85;
      points.push(sampleLoopPath(obj.pathPoints, progress));
    }
    return points;
  }

  function buildSatelliteOrbitPaths() {
    return world.objects
      .filter((obj) => obj.kind === "satellite")
      .map((obj) => ({
        id: obj.id,
        points: buildCircularOrbitPoints(obj.radius, obj.inc, 72),
      }));
  }

  function updateSelectionVisuals() {
    const selected = getObjectById(world.selectedId);
    scene.setSelectedObject(world.selectedId);
    scene.setSatelliteOrbits(buildSatelliteOrbitPaths(), { selectedId: world.selectedId });
    scene.setImpactMarkers(world.impactMarkers);
    scene.setPredictedPath(selected ? buildPredictedPath(selected) : [], { kind: selected?.kind || null });
    scene.setCameraFocus(world.focusedId);
  }

  function emitSelectionChange() {
    onSelectionChange?.({
      selected: getSelectionSummary(getObjectById(world.selectedId)),
      objects: listObjects(),
      focusedId: world.focusedId,
      speedMult,
    });
  }

  function focusSelected() {
    if (!world.selectedId) return;
    world.focusedId = world.selectedId;
    scene.setCameraFocus(world.focusedId);
    const obj = getObjectById(world.focusedId);
    if (obj) {
      logReason({
        t: time(),
        label: buildObjectLabel(obj),
        code: "FOCUS",
        detail: "close_view_enabled",
      });
    }
    emitSelectionChange();
  }

  function clearFocus() {
    world.focusedId = null;
    scene.clearCameraFocus();
    emitSelectionChange();
  }

  function selectObject(id) {
    world.selectedId = Number.isFinite(Number(id)) ? Number(id) : null;
    if (world.focusedId && world.focusedId !== world.selectedId) {
      world.focusedId = null;
      scene.clearCameraFocus();
    }
    const selected = getObjectById(world.selectedId);
    updateSelectionVisuals();
    emitSelectionChange();
    if (selected) {
      logReason({
        t: time(),
        label: buildObjectLabel(selected),
        code: "SELECT",
        detail: selected.kind === "satellite" ? "showing_circular_orbit_path" : "showing_random_path_prediction",
      });
    }
  }

  function setSpeed(next) {
    const v = clamp(Number(next) || 1, 0.25, 4);
    speedMult = v;
    pushEvent("speed_set", { speedMult: v });
    emitSelectionChange();
  }

  function setMode(next) {
    if (!MODES.includes(next)) return;
    mode = next;
    logReason({ t: time(), label: "SYSTEM", code: "MODE", detail: `switched_to=${next}` });
    pushEvent("mode_switch", { mode: next });
  }

  function setParams(next) {
    params = {
      ...params,
      ...next,
      satelliteCount: SATELLITE_COUNT,
      asteroidCount: ASTEROID_COUNT,
      overlays: { ...params.overlays, ...(next.overlays || {}) },
    };
    world.protected.enabled = Boolean(params.overlays.protectedZone);
    scene.setCellsOverlay({
      enabled: Boolean(params.overlays.showCells),
      ringRadius: world.ringRadius,
      sectors: world.sectors,
      color: 0x6df2d8,
    });
    scene.setOverlaysVisible({ showCells: params.overlays.showCells, showIntents: params.overlays.showIntents });
  }

  function shouldSendMessage() {
    return Math.random() < params.commsReliability;
  }

  function bumpMsgCount() {
    world.metrics._msgCount++;
  }

  function updateMsgRate() {
    const t = nowSeconds();
    const dt = t - world.metrics._lastMsgT;
    if (dt > 0.9) {
      world.metrics.msgRate = world.metrics._msgCount / dt;
      world.metrics._msgCount = 0;
      world.metrics._lastMsgT = t;
    }
  }

  function inProtectedZone(angle) {
    if (!world.protected.enabled) return false;
    const da = Math.atan2(Math.sin(angle - world.protected.centerAngle), Math.cos(angle - world.protected.centerAngle));
    return Math.abs(da) < world.protected.width;
  }

  function inDebris(angle, radius) {
    const d = world.debris;
    if (!d) return false;
    const alive = time() - d.tStart < d.ttl;
    if (!alive) return false;
    if (Math.abs(radius - d.radius) > 7) return false;
    const da = Math.atan2(Math.sin(angle - d.centerAngle), Math.cos(angle - d.centerAngle));
    return Math.abs(da) < d.width;
  }

  function nearestObjects(agent, positions, maxN = 6) {
    const me = positions[agent._index];
    const arr = [];
    for (const other of world.objects) {
      if (other.id === agent.id) continue;
      arr.push({ object: other, d2: dist2(me, positions[other._index]) });
    }
    arr.sort((a, b) => a.d2 - b.d2);
    return arr.slice(0, maxN);
  }

  function predictAsteroidConflict(satellite, asteroid, horizonSec = 18, samples = 18) {
    let best = { minD2: Infinity, timeToClosest: 0 };
    for (let i = 1; i <= samples; i++) {
      const future = (horizonSec / samples) * i;
      const satAngle = satellite.angle + satellite.speed * (satellite.speedFactor ?? 1) * future * (baseTimeScale * speedMult);
      const satPos = ringPos(satellite.radius, satAngle, satellite.inc);
      const asteroidProgress = asteroid.pathProgress + asteroid.speed * future * (baseTimeScale * speedMult);
      const asteroidPos = sampleLoopPath(asteroid.pathPoints, asteroidProgress);
      const d2 = dist2(satPos, asteroidPos);
      if (d2 < best.minD2) {
        best = { minD2: d2, timeToClosest: future };
      }
    }
    return {
      asteroid,
      minDistance: Math.sqrt(best.minD2),
      timeToClosest: best.timeToClosest,
    };
  }

  function initObjects() {
    const configs = [
      {
        id: 101,
        kind: "satellite",
        name: "Sentinel One",
        description: "Earth observation satellite on the inner orbit.",
        radius: world.ringRadius2,
        angle: 0.25,
        inc: 0.06,
        speed: 0.52,
        priority: "high",
      },
      {
        id: 102,
        kind: "satellite",
        name: "Relay Two",
        description: "Communications satellite on the primary orbit.",
        radius: world.ringRadius,
        angle: 2.1,
        inc: -0.08,
        speed: 0.42,
        priority: "standard",
      },
      {
        id: 103,
        kind: "satellite",
        name: "Mapper Three",
        description: "Survey satellite on the outer orbit.",
        radius: world.ringRadius3,
        angle: 4.25,
        inc: 0.12,
        speed: 0.36,
        priority: "standard",
      },
      {
        id: 201,
        kind: "asteroid",
        name: "Aster Drift",
        description: "Random drifting asteroid with a non-circular prediction path.",
        radius: 49,
        speed: 0.16,
        priority: "hazard",
        pathPoints: buildRandomAsteroidPath(48, -2, 3),
        pathProgress: rand(0.1, 0.6),
      },
      {
        id: 202,
        kind: "asteroid",
        name: "Borealis Rock",
        description: "Fast-moving asteroid on a second random path.",
        radius: 63,
        speed: 0.12,
        priority: "hazard",
        pathPoints: buildRandomAsteroidPath(63, 4, -4),
        pathProgress: rand(0.2, 0.9),
      },
    ];

    world.objects = configs.map((cfg, idx) => ({
      ...cfg,
      baseRadius: cfg.radius,
      cooldown: 0,
      _phase: rand(0, 10),
      _index: idx,
      speedFactor: cfg.kind === "satellite" ? 1 : undefined,
      slowTimer: 0,
    }));
    world.selectedId = world.objects.find((obj) => obj.kind === "satellite")?.id ?? world.objects[0]?.id ?? null;
    world.focusedId = null;
  }

  function injectDebris() {
    const sector = Math.floor(rand(0, world.sectors));
    const centerAngle = ((sector + 0.35) / world.sectors) * Math.PI * 2;
    world.debris = {
      centerAngle,
      width: 0.42,
      radius: world.ringRadius,
      tStart: time(),
      ttl: 30,
    };
    logReason({ t: time(), label: "SYSTEM", code: "EVENT", detail: `debris_in_cell=${sector}` });
    pushEvent("debris_injected", { sector, centerAngle, width: world.debris.width, radius: world.debris.radius });
  }

  function reset(nextParams) {
    world.t0 = nowSeconds();
    world.lastT = nowSeconds();
    world.tick = 0;
    world.debris = null;
    world.intentLines = [];
    world.impactMarkers = [];
    world.events = [];
    world.metricSeries = [];
    world.logicAccum = 0;
    resetMetrics();

    setParams(nextParams || params);
    initObjects();
    running = true;
    pushEvent("reset", {
      satelliteCount: SATELLITE_COUNT,
      asteroidCount: ASTEROID_COUNT,
      sensorNoise: params.sensorNoise,
      commsReliability: params.commsReliability,
      riskTolerance: params.riskTolerance,
      speedMult,
    });
    updateSelectionVisuals();
    emitSelectionChange();
  }

  function step(dt) {
    const positions = new Array(world.objects.length);
    for (const obj of world.objects) {
      obj._phase += dt;
      if (obj.kind === "satellite") {
        if (obj.slowTimer > 0) {
          obj.slowTimer = Math.max(0, obj.slowTimer - dt);
          if (obj.slowTimer === 0) obj.speedFactor = 1;
        }
        obj.angle += obj.speed * (obj.speedFactor ?? 1) * dt * (baseTimeScale * speedMult);
        positions[obj._index] = ringPos(obj.radius, obj.angle, obj.inc);
      } else {
        obj.pathProgress = (obj.pathProgress + obj.speed * dt * (baseTimeScale * speedMult)) % 1;
        positions[obj._index] = sampleLoopPath(obj.pathPoints, obj.pathProgress);
      }
    }
    world.positions = positions;

    world.logicAccum += dt;
    world.intentLines = [];
    world.impactMarkers = [];
    const interval = effectiveLogicIntervalSec();
    if (world.logicAccum >= interval) {
      world.logicAccum = 0;
      const minSep = lerp(2.2, 3.4, 1 - params.riskTolerance);
      const minSep2 = minSep * minSep;

      for (const obj of world.objects) {
        if (obj.kind !== "satellite") continue;
        if (obj.cooldown > 0) obj.cooldown -= interval;

        const myPos = positions[obj._index];
        const myAngle = angleOnXZ(myPos);
        const myCell = computeCellIndex(myAngle, world.sectors);
        const near = nearestObjects(obj, positions, 5);
        const asteroidWarnings = near
          .filter((entry) => entry.object.kind === "asteroid")
          .map((entry) => predictAsteroidConflict(obj, entry.object))
          .sort((a, b) => a.minDistance - b.minDistance);
        const asteroidThreat = asteroidWarnings.find((entry) => entry.minDistance < 8.5 && entry.timeToClosest < 16) || null;
        if (asteroidThreat) {
          const futureAngle =
            obj.angle + obj.speed * (obj.speedFactor ?? 1) * asteroidThreat.timeToClosest * (baseTimeScale * speedMult);
          const warningPos = ringPos(obj.radius, futureAngle, obj.inc);
          world.impactMarkers.push({
            id: `${obj.id}-${asteroidThreat.asteroid.id}`,
            satelliteId: obj.id,
            asteroidId: asteroidThreat.asteroid.id,
            position: warningPos,
          });
        }

        let tooClose = null;
        for (const nb of near) {
          const scaledMinSep2 = nb.object.kind === "asteroid" ? minSep2 * 2.5 : minSep2;
          if (nb.d2 < scaledMinSep2) {
            tooClose = nb;
            break;
          }
        }

        const hazard = inProtectedZone(myAngle) || inDebris(myAngle, obj.radius);
        if (mode === "baseline") {
          if ((tooClose || hazard || asteroidThreat) && Math.random() < 0.08) world.metrics.nearMisses++;
          continue;
        }

        if (mode === "centralized" && world.tick % 14 !== 0) {
          if ((tooClose || hazard || asteroidThreat) && Math.random() < 0.09) world.metrics.nearMisses++;
          continue;
        }

        if ((tooClose || hazard || asteroidThreat) && obj.cooldown <= 0) {
          const shouldYield =
            obj.priority !== "high" && tooClose?.object?.kind === "satellite" && tooClose.object.priority === "high";
          const msgOk = shouldSendMessage();
          if (msgOk) bumpMsgCount();

          if (asteroidThreat) {
            if ((obj.speedFactor ?? 1) >= 0.99) {
              obj.speedFactor = mode === "hybrid" ? 0.5 : 0.62;
              obj.slowTimer = 8;
              obj.cooldown = 1.6;
              world.metrics.maneuvers++;
              world.metrics.deltaV += 0.35;
              logReason({
                t: time(),
                label: `${buildObjectLabel(obj)} (${obj.name})`,
                code: "SPEED_REDUCTION",
                detail: `reduced speed to avoid impact with ${asteroidThreat.asteroid.name}`,
              });
              pushEvent("speed_reduction", {
                satelliteId: obj.id,
                satelliteName: obj.name,
                asteroidId: asteroidThreat.asteroid.id,
                asteroidName: asteroidThreat.asteroid.name,
                minDistance: asteroidThreat.minDistance,
                timeToClosest: asteroidThreat.timeToClosest,
              });
            }
            if (params.overlays.showIntents && msgOk) {
              world.intentLines.push({
                a: myPos,
                b: ringPos(obj.radius, obj.angle + 0.18, obj.inc),
              });
            }
          } else if (tooClose && Math.random() < 0.18) {
            if (shouldYield) {
              logReason({
                t: time(),
                label: `${buildObjectLabel(obj)} (${obj.name})`,
                code: "YIELD",
                detail: `holding speed for ${tooClose.object.name} in cell=${myCell}`,
              });
            }
            world.metrics.nearMisses++;
          } else if (hazard && Math.random() < 0.1) {
            world.metrics.nearMisses++;
          }
        }
      }

      const checkpointCell = 2;
      for (const obj of world.objects) {
        if (obj.kind !== "satellite") continue;
        const c = computeCellIndex(angleOnXZ(positions[obj._index]), world.sectors);
        if (c === checkpointCell && Math.random() < 0.04) world.metrics.throughput++;
      }
    }

    scene.setCellsOverlay({
      enabled: Boolean(params.overlays.showCells),
      ringRadius: world.ringRadius,
      sectors: world.sectors,
      color: 0x6df2d8,
    });
    scene.setIntentLines(world.intentLines, { enabled: Boolean(params.overlays.showIntents) });
    scene.setBodies(
      world.objects.map((obj) => ({
        id: obj.id,
        kind: obj.kind,
        position: positions[obj._index],
        selected: world.selectedId === obj.id,
        spin: obj._phase,
      }))
    );
    updateSelectionVisuals();

    updateMsgRate();
    onMetrics?.(world.metrics);
    world.metricSeries.push({
      t: time(),
      nearMisses: world.metrics.nearMisses,
      maneuvers: world.metrics.maneuvers,
      deltaV: world.metrics.deltaV,
      throughput: world.metrics.throughput,
      msgRate: world.metrics.msgRate,
    });
    if (world.metricSeries.length > 600) world.metricSeries.shift();
    world.tick++;
  }

  function loop() {
    if (!running) return;
    const t = nowSeconds();
    const dt = clamp(t - world.lastT, 0.001, 0.05);
    world.lastT = t;
    step(dt);
    scene.render();
    requestAnimationFrame(loop);
  }

  running = true;
  requestAnimationFrame(loop);

  return {
    setMode,
    setParams,
    setSpeed,
    reset,
    injectDebris,
    selectObject,
    focusSelected,
    clearFocus,
    getSelectionState: () => ({
      selected: getSelectionSummary(getObjectById(world.selectedId)),
      objects: listObjects(),
      focusedId: world.focusedId,
      speedMult,
    }),
    getRunExport: () => ({
      mode,
      params: {
        ...params,
        satelliteCount: SATELLITE_COUNT,
        asteroidCount: ASTEROID_COUNT,
        speedMult,
        objects: listObjects(),
      },
      summary: { ...world.metrics },
      metrics: world.metricSeries.slice(),
      events: world.events.slice(),
    }),
  };
}

