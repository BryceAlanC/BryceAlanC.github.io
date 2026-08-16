import {
  PLAYER_PHYSICS,
  PROJECTILE,
  clamp,
  resolveVelocity
} from "./physics.mjs";

const EPSILON = 1e-8;
const COLLISION_SLOP = 1e-5;
const TOPOLOGY_EPSILON = 1e-5;
const DEFAULT_INRADIUS = 20;
const PLAYER_SOLVER_PASSES = 6;
const SPHERE_SOLVER_PASSES = 4;

export function dot3(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function cross3(a, b) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x
  };
}

export function scale3(vector, amount) {
  return {
    x: vector.x * amount,
    y: vector.y * amount,
    z: vector.z * amount
  };
}

export function add3(a, b) {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

export function subtract3(a, b) {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

export function lengthSquared3(vector) {
  return dot3(vector, vector);
}

export function length3(vector) {
  return Math.sqrt(lengthSquared3(vector));
}

export function normalize3(vector, fallback = { x: 0, y: 1, z: 0 }) {
  const magnitude = length3(vector);
  if (magnitude > EPSILON) return scale3(vector, 1 / magnitude);
  const fallbackMagnitude = length3(fallback);
  if (fallbackMagnitude > EPSILON) return scale3(fallback, 1 / fallbackMagnitude);
  return { x: 0, y: 1, z: 0 };
}

export function projectToPlane(vector, normal) {
  const unitNormal = normalize3(normal);
  return subtract3(vector, scale3(unitNormal, dot3(vector, unitNormal)));
}

export function rotateVectorAroundAxis(vector, axis, angle) {
  const unitAxis = normalize3(axis);
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return add3(
    add3(
      scale3(vector, cosine),
      scale3(cross3(unitAxis, vector), sine)
    ),
    scale3(unitAxis, dot3(unitAxis, vector) * (1 - cosine))
  );
}

function rotateFromTo(vector, from, to) {
  const source = normalize3(from);
  const target = normalize3(to);
  const cosine = clamp(dot3(source, target), -1, 1);
  if (cosine > 1 - 1e-12) return { ...vector };
  if (cosine < -1 + 1e-12) {
    const reference = Math.abs(source.x) < 0.8
      ? { x: 1, y: 0, z: 0 }
      : { x: 0, y: 0, z: 1 };
    return rotateVectorAroundAxis(vector, cross3(source, reference), Math.PI);
  }
  const axis = cross3(source, target);
  return rotateVectorAroundAxis(vector, axis, Math.acos(cosine));
}

function triplePlaneIntersection(first, second, third) {
  const cross23 = cross3(second.normal, third.normal);
  const denominator = dot3(first.normal, cross23);
  if (Math.abs(denominator) <= EPSILON) return null;
  const cross31 = cross3(third.normal, first.normal);
  const cross12 = cross3(first.normal, second.normal);
  return scale3(
    add3(
      add3(
        scale3(cross23, first.offset),
        scale3(cross31, second.offset)
      ),
      scale3(cross12, third.offset)
    ),
    1 / denominator
  );
}

function canonicalNormalKey(vector) {
  return [vector.x, vector.y, vector.z].map(function (value) {
    return Math.round(value * 1e12) / 1e12;
  }).join(",");
}

function deterministicFaceBasis(normal, isFloor) {
  if (isFloor) {
    return {
      u: { x: 1, y: 0, z: 0 },
      v: { x: 0, y: 0, z: 1 }
    };
  }
  const references = [
    { x: 1, y: 0, z: 0 },
    { x: 0, y: 1, z: 0 },
    { x: 0, y: 0, z: 1 }
  ].sort(function (a, b) {
    return Math.abs(dot3(a, normal)) - Math.abs(dot3(b, normal));
  });
  const u = normalize3(cross3(references[0], normal));
  return { u, v: normalize3(cross3(normal, u)) };
}

const FACE_STYLES = [
  ["Golden floor", 0xf3cf72],
  ["Coral face", 0xf28a72],
  ["Lagoon face", 0x64c7bd],
  ["Sky face", 0x78a9e8],
  ["Lilac face", 0xb69ae8],
  ["Mint face", 0x89c99b],
  ["Amber face", 0xe8ad5e],
  ["Rose face", 0xe989ad],
  ["Aqua face", 0x74cddd],
  ["Blue face", 0x7995d8],
  ["Plum face", 0xa882ba],
  ["Sage face", 0x9ab77d]
];

export function makeDodecaArena(inradius = DEFAULT_INRADIUS) {
  const phi = (1 + Math.sqrt(5)) / 2;
  const rawNormals = [];
  for (const first of [-1, 1]) {
    for (const second of [-1, 1]) rawNormals.push({ x: 0, y: first, z: second * phi });
  }
  for (const first of [-1, 1]) {
    for (const second of [-1, 1]) rawNormals.push({ x: first, y: second * phi, z: 0 });
  }
  for (const first of [-1, 1]) {
    for (const second of [-1, 1]) rawNormals.push({ x: first * phi, y: 0, z: second });
  }

  const floorSource = normalize3({ x: 0, y: -1, z: -phi });
  const floorTarget = { x: 0, y: -1, z: 0 };
  const rotated = rawNormals.map(function (normal) {
    return normalize3(rotateFromTo(normalize3(normal), floorSource, floorTarget));
  });
  const floorIndex = rotated.findIndex(function (normal) {
    return dot3(normal, floorTarget) > 1 - 1e-10;
  });
  const orderedNormals = [rotated[floorIndex]].concat(
    rotated.filter(function (_normal, index) { return index !== floorIndex; })
  );
  orderedNormals[0] = { x: 0, y: -1, z: 0 };

  // Defend against accidental duplicate normals if this generator is extended.
  const normalKeys = new Set(orderedNormals.map(canonicalNormalKey));
  if (normalKeys.size !== 12) throw new Error("Dodecahedral room requires 12 unique face normals.");

  const faces = orderedNormals.map(function (normal, index) {
    const basis = deterministicFaceBasis(normal, index === 0);
    const style = FACE_STYLES[index];
    return {
      id: "face-" + String(index).padStart(2, "0"),
      index,
      label: style[0],
      color: style[1],
      normal,
      inwardNormal: scale3(normal, -1),
      offset: inradius,
      origin: scale3(normal, inradius),
      center: scale3(normal, inradius),
      u: basis.u,
      v: basis.v,
      vertexIds: [],
      vertices: [],
      neighbors: []
    };
  });

  const foundVertices = [];
  for (let first = 0; first < faces.length - 2; first += 1) {
    for (let second = first + 1; second < faces.length - 1; second += 1) {
      for (let third = second + 1; third < faces.length; third += 1) {
        const point = triplePlaneIntersection(faces[first], faces[second], faces[third]);
        if (!point) continue;
        const inside = faces.every(function (face) {
          return dot3(face.normal, point) <= face.offset + TOPOLOGY_EPSILON;
        });
        if (!inside) continue;
        if (foundVertices.some(function (candidate) {
          return lengthSquared3(subtract3(candidate, point)) < TOPOLOGY_EPSILON * TOPOLOGY_EPSILON;
        })) continue;
        foundVertices.push(point);
      }
    }
  }
  foundVertices.sort(function (a, b) {
    if (Math.abs(a.x - b.x) > TOPOLOGY_EPSILON) return a.x - b.x;
    if (Math.abs(a.y - b.y) > TOPOLOGY_EPSILON) return a.y - b.y;
    return a.z - b.z;
  });
  const vertices = foundVertices.map(function (position, index) {
    return { id: "vertex-" + String(index).padStart(2, "0"), index, position };
  });

  for (const face of faces) {
    const onFace = vertices.filter(function (vertex) {
      return Math.abs(dot3(face.normal, vertex.position) - face.offset) <= TOPOLOGY_EPSILON * 4;
    });
    const center = scale3(onFace.reduce(function (sum, vertex) {
      return add3(sum, vertex.position);
    }, { x: 0, y: 0, z: 0 }), 1 / Math.max(1, onFace.length));
    face.center = center;
    face.origin = center;
    onFace.sort(function (a, b) {
      const relativeA = subtract3(a.position, center);
      const relativeB = subtract3(b.position, center);
      const angleA = Math.atan2(dot3(relativeA, face.v), dot3(relativeA, face.u));
      const angleB = Math.atan2(dot3(relativeB, face.v), dot3(relativeB, face.u));
      return angleA - angleB;
    });
    face.vertexIds = onFace.map(function (vertex) { return vertex.id; });
    face.vertices = onFace.map(function (vertex) { return vertex.position; });
  }

  const edgeMap = new Map();
  for (const face of faces) {
    for (let index = 0; index < face.vertexIds.length; index += 1) {
      const first = face.vertexIds[index];
      const second = face.vertexIds[(index + 1) % face.vertexIds.length];
      const pair = [first, second].sort();
      const key = pair.join("|");
      if (!edgeMap.has(key)) edgeMap.set(key, { vertexIds: pair, faceIds: [] });
      edgeMap.get(key).faceIds.push(face.id);
    }
  }
  const edges = Array.from(edgeMap.values()).sort(function (a, b) {
    return a.vertexIds.join("|").localeCompare(b.vertexIds.join("|"));
  }).map(function (edge, index) {
    return {
      id: "edge-" + String(index).padStart(2, "0"),
      index,
      vertexIds: edge.vertexIds,
      vertices: edge.vertexIds.map(function (id) {
        return vertices.find(function (vertex) { return vertex.id === id; }).position;
      }),
      faceIds: edge.faceIds.slice().sort()
    };
  });
  for (const edge of edges) {
    if (edge.faceIds.length !== 2) continue;
    const first = faces.find(function (face) { return face.id === edge.faceIds[0]; });
    const second = faces.find(function (face) { return face.id === edge.faceIds[1]; });
    first.neighbors.push(second.id);
    second.neighbors.push(first.id);
  }
  for (const face of faces) face.neighbors.sort();

  const faceById = Object.fromEntries(faces.map(function (face) { return [face.id, face]; }));
  const vertexById = Object.fromEntries(vertices.map(function (vertex) { return [vertex.id, vertex]; }));
  return {
    kind: "convex-room",
    inradius,
    center: { x: 0, y: 0, z: 0 },
    floorFaceId: faces[0].id,
    faces,
    faceById,
    vertices,
    vertexById,
    edges,
    circumradius: vertices.reduce(function (maximum, vertex) {
      return Math.max(maximum, length3(vertex.position));
    }, 0)
  };
}

export const DODECA_ARENA = makeDodecaArena(DEFAULT_INRADIUS);

export function makeConvexSolid(room, options = {}) {
  if (!room?.faces?.length || !room?.vertices?.length) {
    throw new Error("A convex solid requires a populated convex room definition.");
  }
  const id = options.id || "convex-solid";
  const faceIdPrefix = options.faceIdPrefix || id + "-";
  const roomCenter = room.center || { x: 0, y: 0, z: 0 };
  const center = options.center || roomCenter;
  const translation = subtract3(center, roomCenter);
  const faceIdMap = Object.fromEntries(room.faces.map(function (face) {
    return [face.id, faceIdPrefix + face.id];
  }));
  const faces = room.faces.map(function (face) {
    const vertices = face.vertices.map(function (point) { return add3(point, translation); });
    const solidFace = {
      ...face,
      id: faceIdMap[face.id],
      sourceFaceId: face.id,
      solidId: id,
      offset: face.offset + dot3(face.normal, translation),
      origin: add3(face.origin, translation),
      center: add3(face.center, translation),
      vertices,
      neighbors: face.neighbors.map(function (neighborId) { return faceIdMap[neighborId]; }),
      triangles: []
    };
    for (let index = 1; index < vertices.length - 1; index += 1) {
      solidFace.triangles.push({
        a: vertices[0],
        b: vertices[index],
        c: vertices[index + 1],
        faceId: solidFace.id,
        normal: solidFace.normal
      });
    }
    return solidFace;
  });
  return {
    id,
    kind: "convex-solid",
    center: { ...center },
    inradius: room.inradius,
    circumradius: room.circumradius,
    faces,
    faceById: Object.fromEntries(faces.map(function (face) { return [face.id, face]; })),
    triangles: faces.flatMap(function (face) { return face.triangles; })
  };
}

function resolveFace(room, faceOrId) {
  if (faceOrId && typeof faceOrId === "object" && faceOrId.normal) return faceOrId;
  if (room?.faceById?.[faceOrId]) return room.faceById[faceOrId];
  return room?.faces?.find(function (face) { return face.id === faceOrId; }) || null;
}

export function facePoint(face, u = 0, v = 0, height = 0) {
  return add3(
    add3(
      add3(face.center || face.origin, scale3(face.u, u)),
      scale3(face.v, v)
    ),
    scale3(face.inwardNormal || scale3(face.normal, -1), height)
  );
}

export function faceLocalCoordinates(face, point) {
  const relative = subtract3(point, face.center || face.origin);
  return {
    u: dot3(relative, face.u),
    v: dot3(relative, face.v),
    height: dot3(relative, face.inwardNormal || scale3(face.normal, -1))
  };
}

export function facesAreAdjacent(room, firstFace, secondFace) {
  const first = resolveFace(room, firstFace);
  const second = resolveFace(room, secondFace);
  if (!first || !second || first.id === second.id) return false;
  return first.neighbors.includes(second.id);
}

export function makeFaceObstacle(room, faceOrId, options = {}) {
  const face = resolveFace(room, faceOrId);
  if (!face) throw new Error("Unknown arena face for obstacle: " + String(faceOrId));
  const width = Math.max(0.05, Number(options.width) || 3);
  const depth = Math.max(0.05, Number(options.depth) || 3);
  const height = Math.max(0.05, Number(options.height) || 1);
  const baseHeight = Math.max(0, Number(options.baseHeight) || 0);
  const localU = Number(options.u) || 0;
  const localV = Number(options.v) || 0;
  const up = face.inwardNormal;
  const center = facePoint(face, localU, localV, baseHeight + height / 2);
  const halfExtents = { u: width / 2, up: height / 2, v: depth / 2 };
  const corners = [];
  for (const uSign of [-1, 1]) {
    for (const upSign of [-1, 1]) {
      for (const vSign of [-1, 1]) {
        corners.push(add3(
          add3(
            add3(center, scale3(face.u, halfExtents.u * uSign)),
            scale3(up, halfExtents.up * upSign)
          ),
          scale3(face.v, halfExtents.v * vSign)
        ));
      }
    }
  }
  return {
    id: options.id || face.id + "-obstacle",
    kind: "obb",
    faceId: face.id,
    center,
    axes: { u: face.u, up, v: face.v },
    halfExtents,
    dimensions: { width, height, depth },
    baseHeight,
    local: { u: localU, v: localV },
    color: options.color ?? face.color,
    corners,
    boundingRadius: Math.hypot(halfExtents.u, halfExtents.up, halfExtents.v)
  };
}

function worldObstacles(world) {
  return world?.obstacles || world?.solids || [];
}

function worldConvexSolids(world) {
  return world?.convexSolids || [];
}

function localPointInObb(point, obstacle) {
  const relative = subtract3(point, obstacle.center);
  return {
    u: dot3(relative, obstacle.axes.u),
    up: dot3(relative, obstacle.axes.up),
    v: dot3(relative, obstacle.axes.v)
  };
}

function worldVectorFromObbLocal(local, obstacle) {
  return add3(
    add3(scale3(obstacle.axes.u, local.u), scale3(obstacle.axes.up, local.up)),
    scale3(obstacle.axes.v, local.v)
  );
}

function closestLocalPointInObb(local, obstacle) {
  return {
    u: clamp(local.u, -obstacle.halfExtents.u, obstacle.halfExtents.u),
    up: clamp(local.up, -obstacle.halfExtents.up, obstacle.halfExtents.up),
    v: clamp(local.v, -obstacle.halfExtents.v, obstacle.halfExtents.v)
  };
}

function sphereObbContact(position, radius, obstacle) {
  if (lengthSquared3(subtract3(position, obstacle.center)) >
      (obstacle.boundingRadius + radius) * (obstacle.boundingRadius + radius)) return null;
  const local = localPointInObb(position, obstacle);
  const closest = closestLocalPointInObb(local, obstacle);
  const difference = {
    u: local.u - closest.u,
    up: local.up - closest.up,
    v: local.v - closest.v
  };
  const distanceSquared = difference.u * difference.u +
    difference.up * difference.up + difference.v * difference.v;
  if (distanceSquared >= radius * radius) return null;

  let localNormal;
  let penetration;
  let localPoint = closest;
  if (distanceSquared > EPSILON) {
    const distance = Math.sqrt(distanceSquared);
    localNormal = {
      u: difference.u / distance,
      up: difference.up / distance,
      v: difference.v / distance
    };
    penetration = radius - distance;
  } else {
    const candidates = [
      { distance: obstacle.halfExtents.u - local.u, normal: { u: 1, up: 0, v: 0 }, point: { u: obstacle.halfExtents.u, up: local.up, v: local.v } },
      { distance: obstacle.halfExtents.u + local.u, normal: { u: -1, up: 0, v: 0 }, point: { u: -obstacle.halfExtents.u, up: local.up, v: local.v } },
      { distance: obstacle.halfExtents.up - local.up, normal: { u: 0, up: 1, v: 0 }, point: { u: local.u, up: obstacle.halfExtents.up, v: local.v } },
      { distance: obstacle.halfExtents.up + local.up, normal: { u: 0, up: -1, v: 0 }, point: { u: local.u, up: -obstacle.halfExtents.up, v: local.v } },
      { distance: obstacle.halfExtents.v - local.v, normal: { u: 0, up: 0, v: 1 }, point: { u: local.u, up: local.up, v: obstacle.halfExtents.v } },
      { distance: obstacle.halfExtents.v + local.v, normal: { u: 0, up: 0, v: -1 }, point: { u: local.u, up: local.up, v: -obstacle.halfExtents.v } }
    ];
    candidates.sort(function (a, b) { return a.distance - b.distance; });
    localNormal = candidates[0].normal;
    localPoint = candidates[0].point;
    penetration = radius + Math.max(0, candidates[0].distance);
  }
  const normal = normalize3(worldVectorFromObbLocal(localNormal, obstacle));
  return {
    normal,
    penetration,
    point: add3(obstacle.center, worldVectorFromObbLocal(localPoint, obstacle))
  };
}

function closestPointOnTriangle(point, triangle) {
  const ab = subtract3(triangle.b, triangle.a);
  const ac = subtract3(triangle.c, triangle.a);
  const ap = subtract3(point, triangle.a);
  const d1 = dot3(ab, ap);
  const d2 = dot3(ac, ap);
  if (d1 <= 0 && d2 <= 0) return { ...triangle.a };

  const bp = subtract3(point, triangle.b);
  const d3 = dot3(ab, bp);
  const d4 = dot3(ac, bp);
  if (d3 >= 0 && d4 <= d3) return { ...triangle.b };

  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const amount = d1 / (d1 - d3);
    return add3(triangle.a, scale3(ab, amount));
  }

  const cp = subtract3(point, triangle.c);
  const d5 = dot3(ab, cp);
  const d6 = dot3(ac, cp);
  if (d6 >= 0 && d5 <= d6) return { ...triangle.c };

  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const amount = d2 / (d2 - d6);
    return add3(triangle.a, scale3(ac, amount));
  }

  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const edge = subtract3(triangle.c, triangle.b);
    const amount = (d4 - d3) / ((d4 - d3) + (d5 - d6));
    return add3(triangle.b, scale3(edge, amount));
  }

  const denominator = 1 / (va + vb + vc);
  const v = vb * denominator;
  const w = vc * denominator;
  return add3(triangle.a, add3(scale3(ab, v), scale3(ac, w)));
}

function sphereConvexSolidContact(position, radius, solid) {
  const broadphaseRadius = solid.circumradius + radius;
  if (lengthSquared3(subtract3(position, solid.center)) > broadphaseRadius * broadphaseRadius) return null;

  let nearestFace = solid.faces[0];
  let maximumSignedDistance = -Infinity;
  let inside = true;
  for (const face of solid.faces) {
    const signedDistance = dot3(face.normal, position) - face.offset;
    if (signedDistance > maximumSignedDistance) {
      maximumSignedDistance = signedDistance;
      nearestFace = face;
    }
    if (signedDistance > EPSILON) inside = false;
  }
  if (inside) {
    const touchingFaceIds = solid.faces.filter(function (face) {
      const signedDistance = dot3(face.normal, position) - face.offset;
      return signedDistance >= maximumSignedDistance - 1e-6;
    }).map(function (face) { return face.id; });
    return {
      normal: nearestFace.normal,
      penetration: radius - maximumSignedDistance,
      point: subtract3(position, scale3(nearestFace.normal, maximumSignedDistance)),
      face: nearestFace,
      faceIds: touchingFaceIds
    };
  }

  let closest = null;
  let closestFace = null;
  let minimumDistanceSquared = Infinity;
  const touchingFaceIds = [];
  for (const face of solid.faces) {
    let faceDistanceSquared = Infinity;
    let faceClosest = null;
    for (const triangle of face.triangles) {
      const candidate = closestPointOnTriangle(position, triangle);
      const difference = subtract3(position, candidate);
      const distanceSquared = lengthSquared3(difference);
      if (distanceSquared < faceDistanceSquared) {
        faceDistanceSquared = distanceSquared;
        faceClosest = candidate;
      }
    }
    if (faceDistanceSquared < radius * radius) touchingFaceIds.push(face.id);
    if (faceDistanceSquared < minimumDistanceSquared) {
      minimumDistanceSquared = faceDistanceSquared;
      closest = faceClosest;
      closestFace = face;
    }
  }
  if (!(minimumDistanceSquared < radius * radius)) return null;
  const distance = Math.sqrt(Math.max(0, minimumDistanceSquared));
  return {
    normal: distance > EPSILON
      ? scale3(subtract3(position, closest), 1 / distance)
      : closestFace.normal,
    penetration: radius - distance,
    point: closest,
    face: closestFace,
    faceIds: touchingFaceIds.length ? touchingFaceIds : [closestFace.id]
  };
}

function roomSphereViolation(position, radius, face) {
  return dot3(face.normal, position) + radius - face.offset;
}

function resolveBallContact(ball, contact, metadata, settings, collisions) {
  ball.position.x += contact.normal.x * (contact.penetration + COLLISION_SLOP);
  ball.position.y += contact.normal.y * (contact.penetration + COLLISION_SLOP);
  ball.position.z += contact.normal.z * (contact.penetration + COLLISION_SLOP);
  const speed = resolveVelocity(
    ball.velocity,
    contact.normal,
    settings.restitution,
    settings.tangentialRetention
  );
  collisions.push({
    kind: metadata.kind,
    surface: metadata.surfaceId,
    surfaceId: metadata.surfaceId,
    faceId: metadata.faceId ?? null,
    obstacleId: metadata.obstacleId ?? null,
    normal: contact.normal,
    point: contact.point || {
      x: ball.position.x - contact.normal.x * ball.radius,
      y: ball.position.y - contact.normal.y * ball.radius,
      z: ball.position.z - contact.normal.z * ball.radius
    },
    speed
  });
}

export function resolveSphereRoom(ball, room, collisions = [], settings = PROJECTILE) {
  let seenMask = 0;
  for (let pass = 0; pass < SPHERE_SOLVER_PASSES; pass += 1) {
    let resolved = false;
    for (const face of room.faces) {
      const penetration = roomSphereViolation(ball.position, ball.radius, face);
      if (!(penetration > 0)) continue;
      const normal = face.inwardNormal;
      const point = add3(ball.position, scale3(face.normal, ball.radius - penetration));
      if ((seenMask & (1 << face.index)) === 0) {
        resolveBallContact(
          ball,
          { normal, penetration, point },
          { kind: "room", surfaceId: face.id, faceId: face.id },
          settings,
          collisions
        );
        seenMask |= 1 << face.index;
      } else {
        ball.position.x += normal.x * (penetration + COLLISION_SLOP);
        ball.position.y += normal.y * (penetration + COLLISION_SLOP);
        ball.position.z += normal.z * (penetration + COLLISION_SLOP);
        resolveVelocity(ball.velocity, normal, settings.restitution, settings.tangentialRetention);
      }
      resolved = true;
    }
    if (!resolved) break;
  }
  return collisions;
}

export function resolveSphereObstacle(ball, obstacle, collisions = [], settings = PROJECTILE) {
  const contact = sphereObbContact(ball.position, ball.radius, obstacle);
  if (!contact) return collisions;
  resolveBallContact(
    ball,
    contact,
    {
      kind: "obstacle",
      surfaceId: obstacle.id,
      faceId: obstacle.faceId,
      obstacleId: obstacle.id
    },
    settings,
    collisions
  );
  return collisions;
}

export function resolveSphereConvexSolid(ball, solid, collisions = [], settings = PROJECTILE) {
  const contact = sphereConvexSolidContact(ball.position, ball.radius, solid);
  if (!contact) return collisions;
  resolveBallContact(
    ball,
    contact,
    {
      kind: "solid",
      surfaceId: contact.face.id,
      faceId: contact.face.id
    },
    settings,
    collisions
  );
  return collisions;
}

export function resolveSphereWorld(ball, world, collisions = [], settings = PROJECTILE) {
  const room = world?.room || DODECA_ARENA;
  resolveSphereRoom(ball, room, collisions, settings);
  for (const obstacle of worldObstacles(world)) {
    resolveSphereObstacle(ball, obstacle, collisions, settings);
  }
  for (const solid of worldConvexSolids(world)) {
    resolveSphereConvexSolid(ball, solid, collisions, settings);
  }
  return collisions;
}

export function sphereIntersectsWorld(position, radius, world) {
  const room = world?.room || DODECA_ARENA;
  if (room.faces.some(function (face) {
    return roomSphereViolation(position, radius, face) >= 0;
  })) return true;
  if (worldObstacles(world).some(function (obstacle) {
    return Boolean(sphereObbContact(position, radius, obstacle));
  })) return true;
  return worldConvexSolids(world).some(function (solid) {
    return Boolean(sphereConvexSolidContact(position, radius, solid));
  });
}

function projectileSubstepCount(ball, delta, settings) {
  const speed = length3(ball.velocity);
  const safeDistance = Math.max(ball.radius * 0.55, 0.04);
  return clamp(Math.ceil(speed * delta / safeDistance), 1, settings.maxCollisionSubsteps || 8);
}

function gravityAcceleration(gravity, defaultMagnitude) {
  if (gravity?.direction) {
    return scale3(
      normalize3(gravity.direction, { x: 0, y: -1, z: 0 }),
      Math.max(0, Number.isFinite(gravity.magnitude) ? gravity.magnitude : defaultMagnitude)
    );
  }
  const direction = gravity && typeof gravity === "object"
    ? gravity
    : { x: 0, y: -1, z: 0 };
  return scale3(
    normalize3(direction, { x: 0, y: -1, z: 0 }),
    Math.max(0, Number.isFinite(direction.magnitude) ? direction.magnitude : defaultMagnitude)
  );
}

export function stepProjectileWorld(
  ball,
  delta,
  world = { room: DODECA_ARENA, obstacles: [] },
  gravityDirection = { x: 0, y: -1, z: 0 }
) {
  const room = world?.room || DODECA_ARENA;
  const obstacles = worldObstacles(world);
  const solids = worldConvexSolids(world);
  const settings = { ...PROJECTILE, ...(world?.projectileSettings || {}) };
  const acceleration = gravityAcceleration(gravityDirection, Math.abs(settings.gravity));
  const substeps = projectileSubstepCount(ball, delta, settings);
  const substep = delta / substeps;
  const collisions = [];
  for (let index = 0; index < substeps; index += 1) {
    const drag = Math.exp(-settings.airDrag * substep);
    ball.velocity.x = (ball.velocity.x + acceleration.x * substep) * drag;
    ball.velocity.y = (ball.velocity.y + acceleration.y * substep) * drag;
    ball.velocity.z = (ball.velocity.z + acceleration.z * substep) * drag;
    ball.position.x += ball.velocity.x * substep;
    ball.position.y += ball.velocity.y * substep;
    ball.position.z += ball.velocity.z * substep;
    resolveSphereRoom(ball, room, collisions, settings);
    for (const obstacle of obstacles) resolveSphereObstacle(ball, obstacle, collisions, settings);
    for (const solid of solids) resolveSphereConvexSolid(ball, solid, collisions, settings);
  }
  ball.age = (ball.age || 0) + delta;
  return collisions;
}

function playerCapsule(player, up, radius, eyeHeight, headClearance) {
  return {
    first: add3(player.position, scale3(up, -(eyeHeight - radius))),
    second: add3(player.position, scale3(up, headClearance - radius))
  };
}

function capsuleRoomContact(player, up, radius, eyeHeight, headClearance, face) {
  const capsule = playerCapsule(player, up, radius, eyeHeight, headClearance);
  const firstDistance = dot3(face.normal, capsule.first);
  const secondDistance = dot3(face.normal, capsule.second);
  const endpoint = firstDistance >= secondDistance ? capsule.first : capsule.second;
  const penetration = Math.max(firstDistance, secondDistance) + radius - face.offset;
  if (!(penetration > 0)) return null;
  return {
    normal: face.inwardNormal,
    penetration,
    point: add3(endpoint, scale3(face.normal, radius - penetration))
  };
}

function pointObbDistanceSquaredAt(localFirst, localDelta, amount, obstacle) {
  const point = {
    u: localFirst.u + localDelta.u * amount,
    up: localFirst.up + localDelta.up * amount,
    v: localFirst.v + localDelta.v * amount
  };
  const closest = closestLocalPointInObb(point, obstacle);
  const du = point.u - closest.u;
  const dup = point.up - closest.up;
  const dv = point.v - closest.v;
  return { distanceSquared: du * du + dup * dup + dv * dv, point, closest };
}

function capsuleObbContact(player, up, radius, eyeHeight, headClearance, obstacle) {
  const capsule = playerCapsule(player, up, radius, eyeHeight, headClearance);
  if (lengthSquared3(subtract3(player.position, obstacle.center)) >
      (obstacle.boundingRadius + eyeHeight + radius) ** 2) return null;
  const localFirst = localPointInObb(capsule.first, obstacle);
  const localSecond = localPointInObb(capsule.second, obstacle);
  const localDelta = {
    u: localSecond.u - localFirst.u,
    up: localSecond.up - localFirst.up,
    v: localSecond.v - localFirst.v
  };
  let low = 0;
  let high = 1;
  // Squared distance to a convex box along a segment is convex. A fixed-count
  // ternary search is deterministic and inexpensive for the handful of props.
  for (let iteration = 0; iteration < 18; iteration += 1) {
    const third = (high - low) / 3;
    const left = low + third;
    const right = high - third;
    const leftDistance = pointObbDistanceSquaredAt(localFirst, localDelta, left, obstacle).distanceSquared;
    const rightDistance = pointObbDistanceSquaredAt(localFirst, localDelta, right, obstacle).distanceSquared;
    if (leftDistance <= rightDistance) high = right;
    else low = left;
  }
  const amounts = [0, 1, (low + high) / 2];
  let nearest = pointObbDistanceSquaredAt(localFirst, localDelta, amounts[0], obstacle);
  for (let index = 1; index < amounts.length; index += 1) {
    const candidate = pointObbDistanceSquaredAt(localFirst, localDelta, amounts[index], obstacle);
    if (candidate.distanceSquared < nearest.distanceSquared) nearest = candidate;
  }
  if (nearest.distanceSquared >= radius * radius) return null;

  let localNormal;
  let penetration;
  let localSurface = nearest.closest;
  if (nearest.distanceSquared > EPSILON) {
    const distance = Math.sqrt(nearest.distanceSquared);
    localNormal = {
      u: (nearest.point.u - nearest.closest.u) / distance,
      up: (nearest.point.up - nearest.closest.up) / distance,
      v: (nearest.point.v - nearest.closest.v) / distance
    };
    penetration = radius - distance;
  } else {
    const local = nearest.point;
    const candidates = [
      { distance: obstacle.halfExtents.u - local.u, normal: { u: 1, up: 0, v: 0 }, point: { u: obstacle.halfExtents.u, up: local.up, v: local.v } },
      { distance: obstacle.halfExtents.u + local.u, normal: { u: -1, up: 0, v: 0 }, point: { u: -obstacle.halfExtents.u, up: local.up, v: local.v } },
      { distance: obstacle.halfExtents.up - local.up, normal: { u: 0, up: 1, v: 0 }, point: { u: local.u, up: obstacle.halfExtents.up, v: local.v } },
      { distance: obstacle.halfExtents.up + local.up, normal: { u: 0, up: -1, v: 0 }, point: { u: local.u, up: -obstacle.halfExtents.up, v: local.v } },
      { distance: obstacle.halfExtents.v - local.v, normal: { u: 0, up: 0, v: 1 }, point: { u: local.u, up: local.up, v: obstacle.halfExtents.v } },
      { distance: obstacle.halfExtents.v + local.v, normal: { u: 0, up: 0, v: -1 }, point: { u: local.u, up: local.up, v: -obstacle.halfExtents.v } }
    ].sort(function (a, b) { return a.distance - b.distance; });
    localNormal = candidates[0].normal;
    localSurface = candidates[0].point;
    penetration = radius + Math.max(0, candidates[0].distance);
  }
  return {
    normal: normalize3(worldVectorFromObbLocal(localNormal, obstacle)),
    penetration,
    point: add3(obstacle.center, worldVectorFromObbLocal(localSurface, obstacle))
  };
}

function capsuleConvexSolidContact(player, up, radius, eyeHeight, headClearance, solid) {
  const broadphaseRadius = solid.circumradius + eyeHeight + radius;
  if (lengthSquared3(subtract3(player.position, solid.center)) > broadphaseRadius * broadphaseRadius) return null;
  const capsule = playerCapsule(player, up, radius, eyeHeight, headClearance);
  const delta = subtract3(capsule.second, capsule.first);
  let deepest = null;
  const touchingFaceIds = new Set();
  // The capsule axis is only about one world unit long. Nine deterministic
  // samples keep adjacent centers much closer than the player radius, so a
  // convex face or edge cannot slip between samples at the fixed game step.
  for (let index = 0; index <= 8; index += 1) {
    const amount = index / 8;
    const point = add3(capsule.first, scale3(delta, amount));
    const contact = sphereConvexSolidContact(point, radius, solid);
    if (!contact) continue;
    contact.faceIds.forEach(function (faceId) { touchingFaceIds.add(faceId); });
    if (!deepest || contact.penetration > deepest.penetration) deepest = contact;
  }
  if (!deepest) return null;
  deepest.faceIds = Array.from(touchingFaceIds).sort();
  return deepest;
}

function clipPlayerVelocity(player, normal) {
  const inwardSpeed = dot3(player.velocity, normal);
  if (inwardSpeed >= 0) return;
  player.velocity.x -= normal.x * inwardSpeed;
  player.velocity.y -= normal.y * inwardSpeed;
  player.velocity.z -= normal.z * inwardSpeed;
}

function addPlayerContact(contacts, metadata, contact) {
  const existing = contacts.find(function (candidate) {
    return candidate.kind === metadata.kind && candidate.surfaceId === metadata.surfaceId;
  });
  if (existing) {
    if (contact.penetration > existing.penetration) existing.penetration = contact.penetration;
    return;
  }
  contacts.push({
    kind: metadata.kind,
    surface: metadata.surfaceId,
    surfaceId: metadata.surfaceId,
    faceId: metadata.faceId ?? null,
    obstacleId: metadata.obstacleId ?? null,
    normal: contact.normal,
    point: contact.point,
    penetration: contact.penetration,
    speed: 0
  });
}

function resolvePlayerWorldContacts(player, up, radius, eyeHeight, headClearance, world, contacts) {
  const room = world?.room || DODECA_ARENA;
  const obstacles = worldObstacles(world);
  const solids = worldConvexSolids(world);
  for (let pass = 0; pass < PLAYER_SOLVER_PASSES; pass += 1) {
    let resolved = false;
    for (const face of room.faces) {
      const contact = capsuleRoomContact(player, up, radius, eyeHeight, headClearance, face);
      if (!contact) continue;
      player.position.x += contact.normal.x * (contact.penetration + COLLISION_SLOP);
      player.position.y += contact.normal.y * (contact.penetration + COLLISION_SLOP);
      player.position.z += contact.normal.z * (contact.penetration + COLLISION_SLOP);
      clipPlayerVelocity(player, contact.normal);
      addPlayerContact(contacts, { kind: "room", surfaceId: face.id, faceId: face.id }, contact);
      resolved = true;
    }
    for (const obstacle of obstacles) {
      const contact = capsuleObbContact(player, up, radius, eyeHeight, headClearance, obstacle);
      if (!contact) continue;
      player.position.x += contact.normal.x * (contact.penetration + COLLISION_SLOP);
      player.position.y += contact.normal.y * (contact.penetration + COLLISION_SLOP);
      player.position.z += contact.normal.z * (contact.penetration + COLLISION_SLOP);
      clipPlayerVelocity(player, contact.normal);
      addPlayerContact(contacts, {
        kind: "obstacle",
        surfaceId: obstacle.id,
        faceId: obstacle.faceId,
        obstacleId: obstacle.id
      }, contact);
      resolved = true;
    }
    for (const solid of solids) {
      const contact = capsuleConvexSolidContact(player, up, radius, eyeHeight, headClearance, solid);
      if (!contact) continue;
      player.position.x += contact.normal.x * (contact.penetration + COLLISION_SLOP);
      player.position.y += contact.normal.y * (contact.penetration + COLLISION_SLOP);
      player.position.z += contact.normal.z * (contact.penetration + COLLISION_SLOP);
      const faceIds = contact.faceIds?.length ? contact.faceIds : [contact.face.id];
      faceIds.forEach(function (faceId) {
        const face = solid.faceById[faceId] || contact.face;
        clipPlayerVelocity(player, face.normal);
        addPlayerContact(contacts, {
          kind: "solid",
          surfaceId: face.id,
          faceId: face.id
        }, {
          ...contact,
          normal: face.normal
        });
      });
      resolved = true;
    }
    if (!resolved) break;
  }
}

export function stepPlayerWorld(
  player,
  input = {},
  delta,
  radius,
  world = { room: DODECA_ARENA, obstacles: [] },
  settings = PLAYER_PHYSICS
) {
  const config = settings === PLAYER_PHYSICS
    ? PLAYER_PHYSICS
    : { ...PLAYER_PHYSICS, ...(settings || {}) };
  const gravityDirection = normalize3(
    input.gravityDirection || player.gravityDirection || { x: 0, y: -1, z: 0 },
    { x: 0, y: -1, z: 0 }
  );
  const up = scale3(gravityDirection, -1);
  const previousGravity = player.gravityDirection
    ? normalize3(player.gravityDirection, gravityDirection)
    : gravityDirection;
  const gravityChanged = dot3(previousGravity, gravityDirection) < 1 - 1e-8;
  const eyeHeight = input.eyeHeight ?? config.eyeHeight;
  const headClearance = input.headClearance ?? config.headClearance;
  let grounded = !gravityChanged && player.grounded === true;
  const wasGrounded = grounded;
  let jumped = false;

  if (input.jumpRequested && grounded) {
    const upwardSpeed = dot3(player.velocity, up);
    const jumpSpeed = input.jumpSpeed ?? config.jumpSpeed;
    player.velocity.x += up.x * (jumpSpeed - upwardSpeed);
    player.velocity.y += up.y * (jumpSpeed - upwardSpeed);
    player.velocity.z += up.z * (jumpSpeed - upwardSpeed);
    grounded = false;
    jumped = true;
  }

  const gravityMagnitude = Math.abs(config.gravity ?? PLAYER_PHYSICS.gravity);
  player.velocity.x += gravityDirection.x * gravityMagnitude * delta;
  player.velocity.y += gravityDirection.y * gravityMagnitude * delta;
  player.velocity.z += gravityDirection.z * gravityMagnitude * delta;
  const terminalSpeed = Math.abs(config.terminalVelocity ?? PLAYER_PHYSICS.terminalVelocity);
  const downwardSpeed = dot3(player.velocity, gravityDirection);
  if (downwardSpeed > terminalSpeed) {
    const excess = downwardSpeed - terminalSpeed;
    player.velocity.x -= gravityDirection.x * excess;
    player.velocity.y -= gravityDirection.y * excess;
    player.velocity.z -= gravityDirection.z * excess;
  }

  player.position.x += player.velocity.x * delta;
  player.position.y += player.velocity.y * delta;
  player.position.z += player.velocity.z * delta;
  const contacts = [];
  resolvePlayerWorldContacts(player, up, radius, eyeHeight, headClearance, world, contacts);

  const minimumGroundDot = input.minimumGroundDot ?? 0.55;
  const supportContacts = contacts.filter(function (contact) {
    return dot3(contact.normal, up) >= minimumGroundDot;
  });
  grounded = supportContacts.length > 0;
  const support = supportContacts.sort(function (a, b) {
    const alignment = dot3(b.normal, up) - dot3(a.normal, up);
    return Math.abs(alignment) > 1e-8
      ? alignment
      : a.surfaceId.localeCompare(b.surfaceId);
  })[0] || null;
  const sideRoomFaces = Array.from(new Set(contacts.filter(function (contact) {
    return contact.kind === "room" && (!support || contact.faceId !== support.faceId) &&
      dot3(contact.normal, up) < minimumGroundDot;
  }).map(function (contact) { return contact.faceId; }))).sort();

  player.grounded = grounded;
  player.gravityDirection = { ...gravityDirection };
  player.supportFaceId = support?.faceId || null;
  return {
    grounded,
    landed: grounded && !wasGrounded && !jumped,
    jumped,
    surfaceId: support?.surfaceId || null,
    surfaceNormal: support?.normal || null,
    surfacePoint: support?.point || null,
    contacts,
    sideRoomFaces,
    gravityDirection: { ...gravityDirection },
    up
  };
}
