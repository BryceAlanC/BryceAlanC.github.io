export const ARENA = Object.freeze({
  minX: -14,
  maxX: 14,
  minZ: -11,
  maxZ: 11,
  floorY: 0,
  ceilingY: 8
});

export const PROJECTILE = Object.freeze({
  gravity: -9.5,
  restitution: 0.86,
  airDrag: 0.04,
  tangentialRetention: 0.985,
  lifetime: 12,
  splatThreshold: 2,
  splatCooldown: 0.08
});

const EPSILON = 1e-8;

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
  if (penetration <= 0) return;
  ball.position.x += normal.x * (penetration + 1e-5);
  ball.position.y += normal.y * (penetration + 1e-5);
  ball.position.z += normal.z * (penetration + 1e-5);
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

export function stepProjectile(ball, delta, boxes = [], arena = ARENA) {
  const drag = Math.exp(-PROJECTILE.airDrag * delta);
  ball.velocity.y += PROJECTILE.gravity * delta;
  ball.velocity.x *= drag;
  ball.velocity.y *= drag;
  ball.velocity.z *= drag;
  ball.position.x += ball.velocity.x * delta;
  ball.position.y += ball.velocity.y * delta;
  ball.position.z += ball.velocity.z * delta;
  ball.age += delta;

  const collisions = resolveSphereArena(ball, arena);
  for (const box of boxes) {
    const collision = resolveSphereAabb(ball, box);
    if (collision) collisions.push(collision);
  }
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

export function sphereIntersectsBox(position, radius, box) {
  const closestX = clamp(position.x, box.min.x, box.max.x);
  const closestY = clamp(position.y, box.min.y, box.max.y);
  const closestZ = clamp(position.z, box.min.z, box.max.z);
  const x = position.x - closestX;
  const y = position.y - closestY;
  const z = position.z - closestZ;
  return x * x + y * y + z * z < radius * radius;
}
