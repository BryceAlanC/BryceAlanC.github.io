(function (root, factory) {
  "use strict";

  const api = factory();
  root.PendulumDynamics = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const DEFAULT_PARAMETERS = Object.freeze({
    cartMass: 1.2,
    link1Mass: 0.32,
    link2Mass: 0.2,
    link1Length: 0.9,
    link2Length: 0.72,
    // Revolute-joint viscous damping coefficients, in N·m·s/rad.
    pivotDamping: 0.035,
    elbowDamping: 0.0175,
    gravity: 9.81,
    forceLimit: 30,
    accelerationLimit: 16
  });

  function createParameters(overrides) {
    return Object.assign({}, DEFAULT_PARAMETERS, overrides || {});
  }

  function clamp(value, lower, upper) {
    return Math.max(lower, Math.min(upper, value));
  }

  function wrapAngle(angle) {
    let wrapped = (angle + Math.PI) % (2 * Math.PI);
    if (wrapped < 0) wrapped += 2 * Math.PI;
    return wrapped - Math.PI;
  }

  function solve3(matrix, vector) {
    const a = [matrix[0].slice(), matrix[1].slice(), matrix[2].slice()];
    const b = vector.slice();

    for (let column = 0; column < 3; column += 1) {
      let pivot = column;
      for (let row = column + 1; row < 3; row += 1) {
        if (Math.abs(a[row][column]) > Math.abs(a[pivot][column])) pivot = row;
      }
      if (Math.abs(a[pivot][column]) < 1e-12) throw new Error("Singular pendulum mass matrix.");
      if (pivot !== column) {
        [a[column], a[pivot]] = [a[pivot], a[column]];
        [b[column], b[pivot]] = [b[pivot], b[column]];
      }

      const scale = a[column][column];
      for (let j = column; j < 3; j += 1) a[column][j] /= scale;
      b[column] /= scale;

      for (let row = 0; row < 3; row += 1) {
        if (row === column) continue;
        const factor = a[row][column];
        for (let j = column; j < 3; j += 1) a[row][j] -= factor * a[column][j];
        b[row] -= factor * b[column];
      }
    }
    return b;
  }

  // State order: [x, xDot, theta1, theta1Dot, theta2, theta2Dot].
  // Both link angles are absolute and measured from the upright position.
  function massMatrix(state, parameters) {
    const p = parameters || DEFAULT_PARAMETERS;
    const theta1 = state[2];
    const theta2 = state[4];
    const firstMoment = (p.link1Mass + p.link2Mass) * p.link1Length;
    const secondMoment = p.link2Mass * p.link2Length;
    const firstInertia = (p.link1Mass + p.link2Mass) * p.link1Length * p.link1Length;
    const coupling = p.link2Mass * p.link1Length * p.link2Length;
    const secondInertia = p.link2Mass * p.link2Length * p.link2Length;

    return [
      [
        p.cartMass + p.link1Mass + p.link2Mass,
        firstMoment * Math.cos(theta1),
        secondMoment * Math.cos(theta2)
      ],
      [
        firstMoment * Math.cos(theta1),
        firstInertia,
        coupling * Math.cos(theta1 - theta2)
      ],
      [
        secondMoment * Math.cos(theta2),
        coupling * Math.cos(theta1 - theta2),
        secondInertia
      ]
    ];
  }

  function derivative(state, appliedForce, parameters) {
    const p = parameters || DEFAULT_PARAMETERS;
    const theta1 = state[2];
    const omega1 = state[3];
    const theta2 = state[4];
    const omega2 = state[5];
    const firstMoment = (p.link1Mass + p.link2Mass) * p.link1Length;
    const secondMoment = p.link2Mass * p.link2Length;
    const coupling = p.link2Mass * p.link1Length * p.link2Length;
    const difference = theta1 - theta2;
    // Viscous losses at the two physical revolute joints. Because theta1 and
    // theta2 are absolute angles, the elbow's relative angular rate is
    // omega2 - omega1. These terms are the generalized torques obtained from
    // R = 1/2 * pivotDamping * omega1^2
    //   + 1/2 * elbowDamping * (omega2 - omega1)^2.
    const elbowRelativeRate = omega2 - omega1;
    const pivotDampingTorque = -p.pivotDamping * omega1;
    const elbowDampingTorque = -p.elbowDamping * elbowRelativeRate;

    const acceleration = solve3(massMatrix(state, p), [
      appliedForce
        + firstMoment * Math.sin(theta1) * omega1 * omega1
        + secondMoment * Math.sin(theta2) * omega2 * omega2,
      firstMoment * p.gravity * Math.sin(theta1)
        - coupling * Math.sin(difference) * omega2 * omega2
        + pivotDampingTorque - elbowDampingTorque,
      secondMoment * p.gravity * Math.sin(theta2)
        + coupling * Math.sin(difference) * omega1 * omega1
        + elbowDampingTorque
    ]);

    return new Float64Array([
      state[1], acceleration[0], omega1, acceleration[1], omega2, acceleration[2]
    ]);
  }

  function rk4Step(state, appliedForce, stepSize, parameters) {
    const p = parameters || DEFAULT_PARAMETERS;
    const k1 = derivative(state, appliedForce, p);
    const y2 = new Float64Array(6);
    const y3 = new Float64Array(6);
    const y4 = new Float64Array(6);

    for (let i = 0; i < 6; i += 1) y2[i] = state[i] + 0.5 * stepSize * k1[i];
    const k2 = derivative(y2, appliedForce, p);
    for (let i = 0; i < 6; i += 1) y3[i] = state[i] + 0.5 * stepSize * k2[i];
    const k3 = derivative(y3, appliedForce, p);
    for (let i = 0; i < 6; i += 1) y4[i] = state[i] + stepSize * k3[i];
    const k4 = derivative(y4, appliedForce, p);

    const next = new Float64Array(6);
    for (let i = 0; i < 6; i += 1) {
      next[i] = state[i] + stepSize * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]) / 6;
    }
    return next;
  }

  // The controller specifies desired cart acceleration. The input map is affine
  // in force, so two dynamics evaluations recover the force exactly up to
  // floating-point roundoff before the actuator limit is applied.
  function forceForAcceleration(state, desiredAcceleration, parameters) {
    const p = parameters || DEFAULT_PARAMETERS;
    const accelerationAtZero = derivative(state, 0, p)[1];
    const accelerationAtOne = derivative(state, 1, p)[1];
    const inputGain = accelerationAtOne - accelerationAtZero;
    if (Math.abs(inputGain) < 1e-12) return 0;
    return clamp((desiredAcceleration - accelerationAtZero) / inputGain, -p.forceLimit, p.forceLimit);
  }

  function applyCartImpulse(state, impulse, parameters) {
    const p = parameters || DEFAULT_PARAMETERS;
    const velocityJump = solve3(massMatrix(state, p), [impulse, 0, 0]);
    const disturbed = new Float64Array(state);
    disturbed[1] += velocityJump[0];
    disturbed[3] += velocityJump[1];
    disturbed[5] += velocityJump[2];
    return disturbed;
  }

  return Object.freeze({
    DEFAULT_PARAMETERS,
    createParameters,
    clamp,
    wrapAngle,
    solve3,
    massMatrix,
    derivative,
    rk4Step,
    forceForAcceleration,
    applyCartImpulse
  });
});
