export const ARENA = Object.freeze({
  minX: -20,
  maxX: 20,
  minZ: -16,
  maxZ: 16,
  floorY: 0,
  ceilingY: 12
});

export const PROJECTILE = Object.freeze({
  gravity: -9.5,
  restitution: 0.86,
  airDrag: 0.04,
  tangentialRetention: 0.985,
  lifetime: 7,
  splatThreshold: 2,
  splatCooldown: 0.08,
  maxCollisionSubsteps: 8
});

export const PLAYER_PHYSICS = Object.freeze({
  eyeHeight: 1.6,
  headClearance: 0.14,
  gravity: -18,
  jumpSpeed: 11,
  terminalVelocity: -24,
  maxStepHeight: 0.42,
  groundSnap: 0.2
});

const EPSILON = 1e-8;
const COLLISION_SLOP = 1e-5;
const RAMP_SURFACE_CACHE = new WeakMap();

export function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function lengthSquared(vector) {
  return vector.x * vector.x + vector.y * vector.y + vector.z * vector.z;
}

export function normalize(vector) {
  const length = Math.sqrt(lengthSquared(vector));
  if (length <= EPSILON) return { x: 0, y: 1, z: 0 };
  return { x: vector.x / length, y: vector.y / length, z: vector.z / length };
}

export function resolveVelocity(velocity, normal, restitution, tangentialRetention) {
  const inwardSpeed = -(
    velocity.x * normal.x +
    velocity.y * normal.y +
    velocity.z * normal.z
  );
  if (inwardSpeed <= 0) return 0;

  const normalVelocity = {
    x: -inwardSpeed * normal.x,
    y: -inwardSpeed * normal.y,
    z: -inwardSpeed * normal.z
  };
  const tangentVelocity = {
    x: velocity.x - normalVelocity.x,
    y: velocity.y - normalVelocity.y,
    z: velocity.z - normalVelocity.z
  };

  velocity.x = tangentVelocity.x * tangentialRetention + inwardSpeed * restitution * normal.x;
  velocity.y = tangentVelocity.y * tangentialRetention + inwardSpeed * restitution * normal.y;
  velocity.z = tangentVelocity.z * tangentialRetention + inwardSpeed * restitution * normal.z;
  return inwardSpeed;
}

function pushCollision(collisions, ball, normal, penetration, surface) {
  if (!(penetration > 0)) return;
  ball.position.x += normal.x * (penetration + COLLISION_SLOP);
  ball.position.y += normal.y * (penetration + COLLISION_SLOP);
  ball.position.z += normal.z * (penetration + COLLISION_SLOP);
  const speed = resolveVelocity(
    ball.velocity,
    normal,
    PROJECTILE.restitution,
    PROJECTILE.tangentialRetention
  );
  collisions.push({
    normal,
    speed,
    surface,
    point: {
      x: ball.position.x - normal.x * ball.radius,
      y: ball.position.y - normal.y * ball.radius,
      z: ball.position.z - normal.z * ball.radius
    }
  });
}

export function resolveSphereArena(ball, arena = ARENA) {
  const collisions = [];
  const radius = ball.radius;

  if (ball.position.x - radius < arena.minX) {
    pushCollision(collisions, ball, { x: 1, y: 0, z: 0 }, arena.minX - (ball.position.x - radius), "wall");
  } else if (ball.position.x + radius > arena.maxX) {
    pushCollision(collisions, ball, { x: -1, y: 0, z: 0 }, ball.position.x + radius - arena.maxX, "wall");
  }

  if (ball.position.z - radius < arena.minZ) {
    pushCollision(collisions, ball, { x: 0, y: 0, z: 1 }, arena.minZ - (ball.position.z - radius), "wall");
  } else if (ball.position.z + radius > arena.maxZ) {
    pushCollision(collisions, ball, { x: 0, y: 0, z: -1 }, ball.position.z + radius - arena.maxZ, "wall");
  }

  if (ball.position.y - radius < arena.floorY) {
    pushCollision(collisions, ball, { x: 0, y: 1, z: 0 }, arena.floorY - (ball.position.y - radius), "floor");
  } else if (ball.position.y + radius > arena.ceilingY) {
    pushCollision(collisions, ball, { x: 0, y: -1, z: 0 }, ball.position.y + radius - arena.ceilingY, "ceiling");
  }

  return collisions;
}

function insideBoxCollision(ball, box) {
  const distances = [
    { distance: ball.position.x - box.min.x, normal: { x: -1, y: 0, z: 0 } },
    { distance: box.max.x - ball.position.x, normal: { x: 1, y: 0, z: 0 } },
    { distance: ball.position.y - box.min.y, normal: { x: 0, y: -1, z: 0 } },
    { distance: box.max.y - ball.position.y, normal: { x: 0, y: 1, z: 0 } },
    { distance: ball.position.z - box.min.z, normal: { x: 0, y: 0, z: -1 } },
    { distance: box.max.z - ball.position.z, normal: { x: 0, y: 0, z: 1 } }
  ];
  let closest = distances[0];
  for (let index = 1; index < distances.length; index += 1) {
    if (distances[index].distance < closest.distance) closest = distances[index];
  }
  return {
    normal: closest.normal,
    penetration: ball.radius + Math.max(0, closest.distance)
  };
}

export function resolveSphereAabb(ball, box) {
  const closest = {
    x: clamp(ball.position.x, box.min.x, box.max.x),
    y: clamp(ball.position.y, box.min.y, box.max.y),
    z: clamp(ball.position.z, box.min.z, box.max.z)
  };
  const difference = {
    x: ball.position.x - closest.x,
    y: ball.position.y - closest.y,
    z: ball.position.z - closest.z
  };
  const distanceSquared = lengthSquared(difference);
  if (distanceSquared >= ball.radius * ball.radius) return null;

  let collision;
  if (distanceSquared > EPSILON) {
    const distance = Math.sqrt(distanceSquared);
    collision = {
      normal: {
        x: difference.x / distance,
        y: difference.y / distance,
        z: difference.z / distance
      },
      penetration: ball.radius - distance
    };
  } else {
    collision = insideBoxCollision(ball, box);
  }

  const collisions = [];
  pushCollision(collisions, ball, collision.normal, collision.penetration, box.id || "obstacle");
  return collisions[0];
}

function rampBounds(ramp) {
  return {
    minX: ramp.minX ?? ramp.min?.x ?? 0,
    maxX: ramp.maxX ?? ramp.max?.x ?? 0,
    minZ: ramp.minZ ?? ramp.min?.z ?? 0,
    maxZ: ramp.maxZ ?? ramp.max?.z ?? 0,
    baseY: ramp.baseY ?? 0,
    lowY: ramp.lowY ?? ramp.baseY ?? 0,
    highY: ramp.highY ?? ramp.lowY ?? ramp.baseY ?? 0,
    axis: ramp.axis === "z" ? "z" : "x",
    direction: ramp.direction === -1 ? -1 : 1
  };
}

export function rampHeightAtXZ(ramp, x, z, clampToFootprint = false) {
  const bounds = rampBounds(ramp);
  if (!clampToFootprint && (
    x < bounds.minX || x > bounds.maxX || z < bounds.minZ || z > bounds.maxZ
  )) return null;

  const coordinate = bounds.axis === "x"
    ? clamp(x, bounds.minX, bounds.maxX)
    : clamp(z, bounds.minZ, bounds.maxZ);
  const minimum = bounds.axis === "x" ? bounds.minX : bounds.minZ;
  const maximum = bounds.axis === "x" ? bounds.maxX : bounds.maxZ;
  const span = Math.max(EPSILON, maximum - minimum);
  let amount = (coordinate - minimum) / span;
  if (bounds.direction < 0) amount = 1 - amount;
  return bounds.lowY + (bounds.highY - bounds.lowY) * amount;
}

export function rampNormal(ramp) {
  const bounds = rampBounds(ramp);
  const minimum = bounds.axis === "x" ? bounds.minX : bounds.minZ;
  const maximum = bounds.axis === "x" ? bounds.maxX : bounds.maxZ;
  const signedSlope = (bounds.highY - bounds.lowY) /
    Math.max(EPSILON, maximum - minimum) * bounds.direction;
  return normalize(bounds.axis === "x"
    ? { x: -signedSlope, y: 1, z: 0 }
    : { x: 0, y: 1, z: -signedSlope });
}

function subtract(a, b) {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function addScaled(origin, direction, amount) {
  return {
    x: origin.x + direction.x * amount,
    y: origin.y + direction.y * amount,
    z: origin.z + direction.z * amount
  };
}

function dot(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function closestPointOnSegment(point, start, end) {
  const segment = subtract(end, start);
  const denominator = lengthSquared(segment);
  if (denominator <= EPSILON) return { ...start };
  return addScaled(start, segment, clamp(dot(subtract(point, start), segment) / denominator, 0, 1));
}

function closestPointOnTriangle(point, a, b, c) {
  const ab = subtract(b, a);
  const ac = subtract(c, a);
  const areaVector = {
    x: ab.y * ac.z - ab.z * ac.y,
    y: ab.z * ac.x - ab.x * ac.z,
    z: ab.x * ac.y - ab.y * ac.x
  };
  if (lengthSquared(areaVector) <= EPSILON) {
    const candidates = [
      closestPointOnSegment(point, a, b),
      closestPointOnSegment(point, b, c),
      closestPointOnSegment(point, c, a)
    ];
    let closest = candidates[0];
    let closestDistance = lengthSquared(subtract(point, closest));
    for (let index = 1; index < candidates.length; index += 1) {
      const distance = lengthSquared(subtract(point, candidates[index]));
      if (distance < closestDistance) {
        closest = candidates[index];
        closestDistance = distance;
      }
    }
    return closest;
  }

  const ap = subtract(point, a);
  const d1 = dot(ab, ap);
  const d2 = dot(ac, ap);
  if (d1 <= 0 && d2 <= 0) return { ...a };

  const bp = subtract(point, b);
  const d3 = dot(ab, bp);
  const d4 = dot(ac, bp);
  if (d3 >= 0 && d4 <= d3) return { ...b };

  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    return addScaled(a, ab, d1 / (d1 - d3));
  }

  const cp = subtract(point, c);
  const d5 = dot(ab, cp);
  const d6 = dot(ac, cp);
  if (d6 >= 0 && d5 <= d6) return { ...c };

  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    return addScaled(a, ac, d2 / (d2 - d6));
  }

  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const bc = subtract(c, b);
    return addScaled(b, bc, (d4 - d3) / ((d4 - d3) + (d5 - d6)));
  }

  const denominator = 1 / (va + vb + vc);
  const v = vb * denominator;
  const w = vc * denominator;
  return {
    x: a.x + ab.x * v + ac.x * w,
    y: a.y + ab.y * v + ac.y * w,
    z: a.z + ab.z * v + ac.z * w
  };
}

function makeTriangle(a, b, c, normal) {
  return { a, b, c, normal };
}

function rampSurfaceTriangles(ramp) {
  if (ramp && typeof ramp === "object" && RAMP_SURFACE_CACHE.has(ramp)) {
    return RAMP_SURFACE_CACHE.get(ramp);
  }
  const bounds = rampBounds(ramp);
  const height = (x, z) => rampHeightAtXZ(ramp, x, z, true);
  const bottom = bounds.baseY;
  const p00 = { x: bounds.minX, y: height(bounds.minX, bounds.minZ), z: bounds.minZ };
  const p10 = { x: bounds.maxX, y: height(bounds.maxX, bounds.minZ), z: bounds.minZ };
  const p11 = { x: bounds.maxX, y: height(bounds.maxX, bounds.maxZ), z: bounds.maxZ };
  const p01 = { x: bounds.minX, y: height(bounds.minX, bounds.maxZ), z: bounds.maxZ };
  const b00 = { x: bounds.minX, y: bottom, z: bounds.minZ };
  const b10 = { x: bounds.maxX, y: bottom, z: bounds.minZ };
  const b11 = { x: bounds.maxX, y: bottom, z: bounds.maxZ };
  const b01 = { x: bounds.minX, y: bottom, z: bounds.maxZ };
  const topNormal = rampNormal(ramp);

  const triangles = [
    makeTriangle(p00, p10, p11, topNormal),
    makeTriangle(p00, p11, p01, topNormal),
    makeTriangle(b00, p00, p01, { x: -1, y: 0, z: 0 }),
    makeTriangle(b00, p01, b01, { x: -1, y: 0, z: 0 }),
    makeTriangle(b10, b11, p11, { x: 1, y: 0, z: 0 }),
    makeTriangle(b10, p11, p10, { x: 1, y: 0, z: 0 }),
    makeTriangle(b00, b10, p10, { x: 0, y: 0, z: -1 }),
    makeTriangle(b00, p10, p00, { x: 0, y: 0, z: -1 }),
    makeTriangle(b01, p01, p11, { x: 0, y: 0, z: 1 }),
    makeTriangle(b01, p11, b11, { x: 0, y: 0, z: 1 })
  ];
  if (ramp && typeof ramp === "object") RAMP_SURFACE_CACHE.set(ramp, triangles);
  return triangles;
}

function rampBroadphase(position, radius, ramp) {
  const bounds = rampBounds(ramp);
  const top = Math.max(bounds.baseY, bounds.lowY, bounds.highY);
  return position.x + radius >= bounds.minX && position.x - radius <= bounds.maxX &&
    position.z + radius >= bounds.minZ && position.z - radius <= bounds.maxZ &&
    position.y + radius >= bounds.baseY && position.y - radius <= top;
}

function pointInsideRamp(point, ramp) {
  const bounds = rampBounds(ramp);
  if (point.x < bounds.minX || point.x > bounds.maxX ||
      point.z < bounds.minZ || point.z > bounds.maxZ ||
      point.y < bounds.baseY) return false;
  return point.y <= rampHeightAtXZ(ramp, point.x, point.z, true) + EPSILON;
}

function nearestRampSurface(position, ramp) {
  const triangles = rampSurfaceTriangles(ramp);
  let nearest = null;
  for (const triangle of triangles) {
    const point = closestPointOnTriangle(position, triangle.a, triangle.b, triangle.c);
    const distanceSquared = lengthSquared(subtract(position, point));
    if (!nearest || distanceSquared < nearest.distanceSquared) {
      nearest = { point, distanceSquared, normal: triangle.normal };
    }
  }
  return nearest;
}

export function sphereIntersectsRamp(position, radius, ramp) {
  if (!rampBroadphase(position, radius, ramp)) return false;
  if (pointInsideRamp(position, ramp)) return true;
  const nearest = nearestRampSurface(position, ramp);
  return Boolean(nearest && nearest.distanceSquared < radius * radius);
}

export function resolveSphereRamp(ball, ramp) {
  if (!rampBroadphase(ball.position, ball.radius, ramp)) return null;
  const nearest = nearestRampSurface(ball.position, ramp);
  if (!nearest) return null;

  const inside = pointInsideRamp(ball.position, ramp);
  if (!inside && nearest.distanceSquared >= ball.radius * ball.radius) return null;
  const distance = Math.sqrt(Math.max(0, nearest.distanceSquared));
  const normal = inside || distance <= EPSILON
    ? nearest.normal
    : normalize(subtract(ball.position, nearest.point));
  const penetration = inside ? ball.radius + distance : ball.radius - distance;
  const collisions = [];
  pushCollision(collisions, ball, normal, penetration, ramp.id || "ramp");
  return collisions[0] || null;
}

function projectileSubstepCount(ball, delta) {
  const speed = Math.sqrt(lengthSquared(ball.velocity));
  const safeDistance = Math.max(ball.radius * 0.55, 0.04);
  return clamp(Math.ceil(speed * delta / safeDistance), 1, PROJECTILE.maxCollisionSubsteps);
}

export function stepProjectile(ball, delta, boxes = [], arena = ARENA, ramps = [], platforms = []) {
  const solids = boxes === platforms ? boxes : [...boxes, ...platforms];
  const substeps = projectileSubstepCount(ball, delta);
  const substep = delta / substeps;
  const collisions = [];

  for (let index = 0; index < substeps; index += 1) {
    const drag = Math.exp(-PROJECTILE.airDrag * substep);
    ball.velocity.y += PROJECTILE.gravity * substep;
    ball.velocity.x *= drag;
    ball.velocity.y *= drag;
    ball.velocity.z *= drag;
    ball.position.x += ball.velocity.x * substep;
    ball.position.y += ball.velocity.y * substep;
    ball.position.z += ball.velocity.z * substep;

    collisions.push(...resolveSphereArena(ball, arena));
    for (const box of solids) {
      const collision = resolveSphereAabb(ball, box);
      if (collision) collisions.push(collision);
    }
    for (const ramp of ramps) {
      const collision = resolveSphereRamp(ball, ramp);
      if (collision) collisions.push(collision);
    }
  }
  ball.age += delta;
  return collisions;
}

function overlapsExpandedBox(x, z, box, radius) {
  return x > box.min.x - radius && x < box.max.x + radius &&
    z > box.min.z - radius && z < box.max.z + radius;
}

export function movePlayer(position, velocity, delta, radius, boxes = [], arena = ARENA) {
  let nextX = clamp(position.x + velocity.x * delta, arena.minX + radius, arena.maxX - radius);
  for (const box of boxes) {
    if (!overlapsExpandedBox(nextX, position.z, box, radius)) continue;
    if (velocity.x > 0) nextX = box.min.x - radius;
    else if (velocity.x < 0) nextX = box.max.x + radius;
    else nextX = Math.abs(position.x - (box.min.x - radius)) < Math.abs(position.x - (box.max.x + radius))
      ? box.min.x - radius
      : box.max.x + radius;
    velocity.x = 0;
  }
  position.x = clamp(nextX, arena.minX + radius, arena.maxX - radius);

  let nextZ = clamp(position.z + velocity.z * delta, arena.minZ + radius, arena.maxZ - radius);
  for (const box of boxes) {
    if (!overlapsExpandedBox(position.x, nextZ, box, radius)) continue;
    if (velocity.z > 0) nextZ = box.min.z - radius;
    else if (velocity.z < 0) nextZ = box.max.z + radius;
    else nextZ = Math.abs(position.z - (box.min.z - radius)) < Math.abs(position.z - (box.max.z + radius))
      ? box.min.z - radius
      : box.max.z + radius;
    velocity.z = 0;
  }
  position.z = clamp(nextZ, arena.minZ + radius, arena.maxZ - radius);
  return position;
}

function horizontalContains(box, x, z) {
  return x >= box.min.x && x <= box.max.x && z >= box.min.z && z <= box.max.z;
}

export function groundSurfaceAt(
  x,
  z,
  boxes = [],
  ramps = [],
  platforms = [],
  arena = ARENA,
  maximumY = Infinity
) {
  let surface = {
    height: arena.floorY,
    normal: { x: 0, y: 1, z: 0 },
    id: "floor",
    type: "floor"
  };
  const solids = boxes === platforms ? boxes : [...boxes, ...platforms];
  for (const box of solids) {
    if (!horizontalContains(box, x, z) || box.max.y > maximumY + EPSILON) continue;
    if (box.max.y >= surface.height) {
      surface = {
        height: box.max.y,
        normal: { x: 0, y: 1, z: 0 },
        id: box.id || "platform",
        type: "platform"
      };
    }
  }
  for (const ramp of ramps) {
    const height = rampHeightAtXZ(ramp, x, z);
    if (height === null || height > maximumY + EPSILON || height < surface.height) continue;
    surface = {
      height,
      normal: rampNormal(ramp),
      id: ramp.id || "ramp",
      type: "ramp"
    };
  }
  return surface;
}

function volumeBlocksPlayer(volume, x, z, footY, headY, radius, grounded, currentSurface, settings) {
  if (!overlapsExpandedBox(x, z, volume, radius)) return false;
  if (footY >= volume.max.y - COLLISION_SLOP || headY <= volume.min.y + COLLISION_SLOP) return false;
  return !(grounded && volume.max.y - currentSurface <= settings.maxStepHeight + COLLISION_SLOP);
}

function rampBlocksPlayer(ramp, x, z, footY, headY, radius, grounded, currentSurface, settings) {
  const bounds = rampBounds(ramp);
  if (x <= bounds.minX - radius || x >= bounds.maxX + radius ||
      z <= bounds.minZ - radius || z >= bounds.maxZ + radius) return false;
  const height = rampHeightAtXZ(ramp, x, z, true);
  if (footY >= height - COLLISION_SLOP || headY <= bounds.baseY + COLLISION_SLOP) return false;
  return !(grounded && height - currentSurface <= settings.maxStepHeight + COLLISION_SLOP);
}

function horizontalMoveBlocked(
  x,
  z,
  footY,
  headY,
  radius,
  grounded,
  currentSurface,
  solids,
  ramps,
  settings
) {
  return solids.some((solid) => volumeBlocksPlayer(
    solid, x, z, footY, headY, radius, grounded, currentSurface, settings
  )) || ramps.some((ramp) => rampBlocksPlayer(
    ramp, x, z, footY, headY, radius, grounded, currentSurface, settings
  ));
}

function findCeiling(currentHead, nextHead, x, z, radius, solids, arena) {
  let ceiling = arena.ceilingY;
  for (const solid of solids) {
    if (!overlapsExpandedBox(x, z, solid, radius) || solid.min.y <= currentHead + COLLISION_SLOP) continue;
    if (nextHead >= solid.min.y - COLLISION_SLOP) ceiling = Math.min(ceiling, solid.min.y);
  }
  return ceiling;
}

export function stepPlayer(
  player,
  input,
  delta,
  radius,
  boxes = [],
  ramps = [],
  platforms = [],
  arena = ARENA,
  settings = PLAYER_PHYSICS
) {
  const solids = boxes === platforms ? boxes : [...boxes, ...platforms];
  const eyeHeight = input?.eyeHeight ?? settings.eyeHeight;
  const headClearance = input?.headClearance ?? settings.headClearance;
  const initialFoot = player.position.y - eyeHeight;
  const initialSurface = groundSurfaceAt(
    player.position.x,
    player.position.z,
    boxes,
    ramps,
    platforms,
    arena,
    initialFoot + settings.maxStepHeight
  );
  let grounded = player.grounded === true || (
    player.grounded === undefined && Math.abs(initialFoot - initialSurface.height) <= settings.groundSnap
  );
  const wasGrounded = grounded;
  let jumped = false;
  let landed = false;

  if (input?.jumpRequested && grounded) {
    player.velocity.y = settings.jumpSpeed;
    grounded = false;
    jumped = true;
  }

  const currentSurface = grounded ? initialSurface.height : initialFoot;
  const headY = player.position.y + headClearance;
  let nextX = clamp(
    player.position.x + player.velocity.x * delta,
    arena.minX + radius,
    arena.maxX - radius
  );
  if (horizontalMoveBlocked(
    nextX, player.position.z, initialFoot, headY, radius, grounded,
    currentSurface, solids, ramps, settings
  )) {
    nextX = player.position.x;
    player.velocity.x = 0;
  }
  player.position.x = nextX;

  let nextZ = clamp(
    player.position.z + player.velocity.z * delta,
    arena.minZ + radius,
    arena.maxZ - radius
  );
  if (horizontalMoveBlocked(
    player.position.x, nextZ, initialFoot, headY, radius, grounded,
    currentSurface, solids, ramps, settings
  )) {
    nextZ = player.position.z;
    player.velocity.z = 0;
  }
  player.position.z = nextZ;

  const support = groundSurfaceAt(
    player.position.x,
    player.position.z,
    boxes,
    ramps,
    platforms,
    arena,
    initialFoot + settings.maxStepHeight
  );

  if (grounded && !jumped) {
    const rise = support.height - initialFoot;
    if (rise <= settings.maxStepHeight + COLLISION_SLOP && rise >= -settings.groundSnap) {
      player.position.y = support.height + eyeHeight;
      player.velocity.y = 0;
    } else {
      grounded = false;
    }
  }

  if (!grounded) {
    const previousY = player.position.y;
    const previousFoot = previousY - eyeHeight;
    player.velocity.y = Math.max(
      settings.terminalVelocity ?? -Infinity,
      player.velocity.y + settings.gravity * delta
    );
    let nextY = previousY + player.velocity.y * delta;

    if (player.velocity.y > 0) {
      const ceiling = findCeiling(
        previousY + headClearance,
        nextY + headClearance,
        player.position.x,
        player.position.z,
        radius,
        solids,
        arena
      );
      if (nextY + headClearance >= ceiling) {
        nextY = ceiling - headClearance - COLLISION_SLOP;
        player.velocity.y = 0;
      }
    }

    player.position.y = nextY;
    const nextFoot = nextY - eyeHeight;
    const landingSurface = groundSurfaceAt(
      player.position.x,
      player.position.z,
      boxes,
      ramps,
      platforms,
      arena,
      previousFoot + settings.maxStepHeight
    );
    if (player.velocity.y <= 0 &&
        previousFoot >= landingSurface.height - settings.maxStepHeight &&
        nextFoot <= landingSurface.height + COLLISION_SLOP) {
      player.position.y = landingSurface.height + eyeHeight;
      player.velocity.y = 0;
      grounded = true;
      landed = !wasGrounded || jumped;
    }
  }

  player.grounded = grounded;
  const finalSurface = grounded
    ? groundSurfaceAt(
      player.position.x,
      player.position.z,
      boxes,
      ramps,
      platforms,
      arena,
      player.position.y - eyeHeight + settings.maxStepHeight
    )
    : null;
  return {
    grounded,
    landed,
    jumped,
    surfaceY: finalSurface?.height ?? null,
    surfaceNormal: finalSurface?.normal ?? null,
    surfaceId: finalSurface?.id ?? null
  };
}

export function sphereIntersectsBox(position, radius, box) {
  const closestX = clamp(position.x, box.min.x, box.max.x);
  const closestY = clamp(position.y, box.min.y, box.max.y);
  const closestZ = clamp(position.z, box.min.z, box.max.z);
  const x = position.x - closestX;
  const y = position.y - closestY;
  const z = position.z - closestZ;
  return x * x + y * y + z * z < radius * radius;
}

export function sphereIntersectsTerrain(position, radius, boxes = [], ramps = [], platforms = []) {
  const solids = boxes === platforms ? boxes : [...boxes, ...platforms];
  return solids.some((box) => sphereIntersectsBox(position, radius, box)) ||
    ramps.some((ramp) => sphereIntersectsRamp(position, radius, ramp));
}
