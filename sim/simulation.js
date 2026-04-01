import { createThreeScene } from "./threeScene.js";

const MODES = ["baseline", "centralized", "swarm", "hybrid"];

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

function rand(a, b) {
  return a + Math.random() * (b - a);
}

function choice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function nowSeconds() {
  return performance.now() / 1000;
}

function fmtReason({ t, id, code, detail }) {
  const ts = `${t.toFixed(1)}s`;
  return `[${ts}] SAT-${String(id).padStart(3, "0")} · ${code} · ${detail}`;
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

function vecLen(v) {
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

function normalize(v) {
  const L = vecLen(v) || 1;
  return { x: v.x / L, y: v.y / L, z: v.z / L };
}

function add(a, b) {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function sub(a, b) {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function mul(v, s) {
  return { x: v.x * s, y: v.y * s, z: v.z * s };
}

function angleOnXZ(pos) {
  return Math.atan2(pos.z, pos.x);
}

function ringPos(radius, angle, inc = 0) {
  // Simple inclination: rotate around X axis
  const x = radius * Math.cos(angle);
  const z = radius * Math.sin(angle);
  const y = z * Math.sin(inc);
  const zz = z * Math.cos(inc);
  return { x, y, z: zz };
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function createApp({ canvas, onReasonLine, onMetrics }) {
  const scene = createThreeScene({ canvas });

  let running = false;
  let mode = "swarm";
  let speedMult = 1;
  let params = {
    objectCount: 120,
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
    agents: [],
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
    events: [],
    metricSeries: [],
    logicAccum: 0,
    lastReasonAt: -1e9,
  };

  const baseTimeScale = 0.06; // motion scale at 1.0x
  const baseLogicIntervalSec = 10; // target: about 1 decision/log wave every 10 seconds at 1.0x

  function effectiveLogicIntervalSec() {
    // Higher speed => more frequent decisions/logs in wall-clock time
    return baseLogicIntervalSec / speedMult;
  }

  function setSpeed(next) {
    const v = clamp(Number(next) || 1, 0.25, 3);
    speedMult = v;
    pushEvent("speed_set", { speedMult: v });
  }

  function logReason(obj) {
    if (!onReasonLine) return;
    const t = time();
    // Keep reason feed calm: only one message per ~10s (except mode/event/reset)
    const allowBurstCodes = new Set(["MODE", "EVENT"]);
    const interval = effectiveLogicIntervalSec();
    if (!allowBurstCodes.has(obj.code) && t - world.lastReasonAt < interval) return;
    world.lastReasonAt = t;
    onReasonLine(fmtReason(obj));
  }

  function pushEvent(type, detail = {}) {
    world.events.push({ t: time(), type, detail });
    // keep bounded
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

  function setMode(next) {
    if (!MODES.includes(next)) return;
    mode = next;
    logReason({ t: time(), id: 0, code: "MODE", detail: `switched_to=${next}` });
    pushEvent("mode_switch", { mode: next });
  }

  function setParams(next) {
    params = { ...params, ...next, overlays: { ...params.overlays, ...(next.overlays || {}) } };
    world.protected.enabled = Boolean(params.overlays.protectedZone);
    scene.setCellsOverlay({
      enabled: Boolean(params.overlays.showCells),
      ringRadius: world.ringRadius,
      sectors: world.sectors,
      color: 0x6df2d8,
    });
    scene.setOverlaysVisible({ showCells: params.overlays.showCells, showIntents: params.overlays.showIntents });
  }

  function time() {
    return nowSeconds() - world.t0;
  }

  function initAgents(n) {
    world.agents = [];
    const rings = [world.ringRadius2, world.ringRadius, world.ringRadius3];
    for (let i = 0; i < n; i++) {
      const radius = choice(rings);
      const baseSpeed = radius === world.ringRadius ? 0.42 : radius === world.ringRadius2 ? 0.52 : 0.36;
      const angle = rand(0, Math.PI * 2);
      const inc = rand(-0.18, 0.18);
      const priority = Math.random() < 0.06 ? "high" : "standard";
      const a = {
        id: i + 1,
        radius,
        baseRadius: radius,
        angle,
        inc,
        speed: baseSpeed * rand(0.92, 1.08),
        targetRadius: radius,
        cooldown: 0,
        priority,
        // “intent” is a short-lived plan line
        intent: null,
        // internal
        _phase: rand(0, 10),
      };
      world.agents.push(a);
    }
  }

  function injectDebris() {
    // A drifting debris arc crossing the main ring near a random sector
    const sector = Math.floor(rand(0, world.sectors));
    const centerAngle = ((sector + 0.35) / world.sectors) * Math.PI * 2;
    world.debris = {
      centerAngle,
      width: 0.42,
      radius: world.ringRadius,
      tStart: time(),
      ttl: 30,
    };
    logReason({ t: time(), id: 0, code: "EVENT", detail: `debris_in_cell=${sector}` });
    pushEvent("debris_injected", { sector, centerAngle, width: world.debris.width, radius: world.debris.radius });
  }

  function reset(nextParams) {
    world.t0 = nowSeconds();
    world.lastT = nowSeconds();
    world.tick = 0;
    world.debris = null;
    world.intentLines = [];
    world.events = [];
    world.metricSeries = [];
    resetMetrics();

    setParams(nextParams || params);
    scene.setSatelliteCount(params.objectCount);
    initAgents(params.objectCount);
    running = true;
    pushEvent("reset", { objectCount: params.objectCount });
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
    if (Math.abs(radius - d.radius) > 6) return false;
    const da = Math.atan2(Math.sin(angle - d.centerAngle), Math.cos(angle - d.centerAngle));
    return Math.abs(da) < d.width;
  }

  function nearestNeighbors(agent, positions, maxN = 8) {
    const me = positions[agent.id - 1];
    const arr = [];
    for (let i = 0; i < world.agents.length; i++) {
      if (i === agent.id - 1) continue;
      const p = positions[i];
      const d2 = dist2(me, p);
      arr.push({ idx: i, d2 });
    }
    arr.sort((a, b) => a.d2 - b.d2);
    return arr.slice(0, maxN);
  }

  function step(dt) {
    const n = world.agents.length;
    const positions = new Array(n);

    // Base motion
    for (const a of world.agents) {
      a.angle += a.speed * dt * (baseTimeScale * speedMult);
      a._phase += dt;
      // mild station-keeping wobble
      const wobble = Math.sin(a._phase * 0.9) * 0.12;
      const wobble2 = Math.cos(a._phase * 0.6) * 0.08;
      const r = a.radius + wobble;
      positions[a.id - 1] = ringPos(r, a.angle + wobble2, a.inc);
    }

    // Logic updates are intentionally slow (about once per 10s)
    world.logicAccum += dt;
    world.intentLines = [];
    const interval = effectiveLogicIntervalSec();
    if (world.logicAccum >= interval) {
      world.logicAccum = 0;

      // Overlays: cell boundaries, protected zone and debris are “policy constraints”
      // Coordination decisions are simplified: satellites can temporarily change radius to “lane change”.
      const minSep = lerp(2.2, 3.4, 1 - params.riskTolerance); // lower riskTolerance => larger separation
      const minSep2 = minSep * minSep;

      // Conflict detection + coordination
      for (const a of world.agents) {
        if (a.cooldown > 0) a.cooldown -= interval;

        const myPos = positions[a.id - 1];
        const myAngle = angleOnXZ(myPos);
        const myCell = computeCellIndex(myAngle, world.sectors);

        const near = nearestNeighbors(a, positions, 7);
        let tooClose = null;
        for (const nb of near) {
          if (nb.d2 < minSep2) {
            tooClose = nb;
            break;
          }
        }

        const hazard = inProtectedZone(myAngle) || inDebris(myAngle, a.radius);

        // Baseline: do nothing special
        if (mode === "baseline") {
          if (tooClose && Math.random() < 0.04) world.metrics.nearMisses++;
          continue;
        }

        // Centralized: pretend there is a global planner with latency (slower reaction)
        if (mode === "centralized") {
          if (world.tick % 14 !== 0) {
            if (tooClose && Math.random() < 0.06) world.metrics.nearMisses++;
            continue;
          }
        }

        // Swarm/Hybrid: local rules + (hybrid) efficiency suggestion
        if ((tooClose || hazard) && a.cooldown <= 0) {
          const shouldYield =
            a.priority !== "high" && (tooClose ? world.agents[tooClose.idx].priority === "high" : false);

          // Intent message (if comms work)
          const msgOk = shouldSendMessage();
          if (msgOk) bumpMsgCount();

          // Choose a lane change (radius) to increase separation
          const laneUp = a.radius < world.ringRadius3 - 1 ? a.radius + 13 : a.radius - 13;
          const laneDown = a.radius > world.ringRadius2 + 1 ? a.radius - 13 : a.radius + 13;
          let nextRadius = a.radius;

          // Simple rule: if protected zone or debris, get out of main ring; if conflict, split directions
          if (hazard) {
            nextRadius = a.radius === world.ringRadius ? laneUp : a.radius; // move away from station ring
          } else if (tooClose) {
            // if yield, prefer a smaller maneuver (stay) otherwise lane change
            nextRadius = shouldYield ? a.radius : (Math.random() < 0.5 ? laneUp : laneDown);
          }

          // Hybrid “efficiency suggestion”: avoid maneuver if comms are good and separation is barely violated
          if (mode === "hybrid" && tooClose && msgOk) {
            const d = Math.sqrt(tooClose.d2);
            if (d > minSep * 0.9) {
              // “learned” suggestion: wait and coordinate
              nextRadius = a.radius;
              logReason({ t: time(), id: a.id, code: "HYBRID_WAIT", detail: `cell=${myCell} d=${d.toFixed(2)}` });
            }
          }

          if (nextRadius !== a.radius) {
            a.radius = nextRadius;
            a.cooldown = 1.2;
            world.metrics.maneuvers++;
            world.metrics.deltaV += Math.abs(nextRadius - a.baseRadius) * 0.05;

            const code = hazard ? "AVOID_HAZARD" : "SEPARATION";
            const detail = hazard
              ? `reroute cell=${myCell} protected=${inProtectedZone(myAngle)} debris=${inDebris(myAngle, a.radius)}`
              : `lane_change cell=${myCell} minSep=${minSep.toFixed(1)}`;
            logReason({ t: time(), id: a.id, code, detail });

            if (params.overlays.showIntents && msgOk) {
              world.intentLines.push({
                a: myPos,
                b: ringPos(nextRadius, a.angle + 0.25, a.inc),
              });
            }
          } else if (tooClose) {
            // no maneuver but close approach exists -> count as near-miss occasionally (demo proxy)
            if (Math.random() < 0.16) world.metrics.nearMisses++;
            if (shouldYield) {
              logReason({
                t: time(),
                id: a.id,
                code: "YIELD",
                detail: `to=SAT-${String(tooClose.idx + 1).padStart(3, "0")} cell=${myCell}`,
              });
            }
          }
        }
      }

      // Throughput proxy: count how many agents pass a “checkpoint” sector
      const checkpointCell = 2;
      for (const a of world.agents) {
        const p = positions[a.id - 1];
        const c = computeCellIndex(angleOnXZ(p), world.sectors);
        if (c === checkpointCell && Math.random() < 0.012) world.metrics.throughput++;
      }
    }

    // Render
    scene.setCellsOverlay({
      enabled: Boolean(params.overlays.showCells),
      ringRadius: world.ringRadius,
      sectors: world.sectors,
      color: 0x6df2d8,
    });
    scene.setIntentLines(world.intentLines, { enabled: Boolean(params.overlays.showIntents) });
    scene.setSatelliteTransforms(positions);

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

  // Start loop
  running = true;
  requestAnimationFrame(loop);

  return {
    setMode,
    setParams,
    setSpeed,
    reset,
    injectDebris,
    getRunExport: () => ({
      mode,
      params,
      summary: { ...world.metrics },
      metrics: world.metricSeries.slice(),
      events: world.events.slice(),
    }),
  };
}

