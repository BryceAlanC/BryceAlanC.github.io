(function (root, factory) {
  "use strict";

  const dynamics = root.PendulumDynamics
    || (typeof require === "function" ? require("./dynamics.js") : null);
  const api = factory(dynamics);
  root.PendulumController = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (dynamics) {
  "use strict";

  if (!dynamics) throw new Error("PendulumDynamics must be loaded before PendulumController.");

  const SAMPLE_TIME = 0.02;
  const SWING_DURATION = 2;
  const SAMPLE_COUNT = 100;
  const STATE_SIZE = 6;

  const ENCODED_NOMINAL_STATES = "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";
  const ENCODED_NOMINAL_ACCELERATIONS = "mVJDQY9LOUFpuC5BHaMjQaYcGEFhPgxB7ykAQWMO6EDiANBAjXq4QCG7oUDc64tADTtuQNWXRkDGyiBAu1D5P7gdtD+W0WM/QH7LPtaQiL2IZv6+Q8xiv+/inL9D/8C/8cPcvx52779Zvfi/ocr4v1l68L//ZuG/xuDNv0bCuL+CJaW/xAmWv9wBjr/O/Y6/XTaav4c0sL8M6dC/Zsn7v/b1F8CvEDbARoZXwHCce8Doy5DAomKkwHBAuMD4HMzA+7nfwHfi8sBotALBG5ILwcX2E8H9zRvBtgAjwaFzKcEeBi/B2pIzwenzNsGSDTnBAuM5wa+yOcF8BznB0Jg4wU3qOMEv6znBvO86wfb+OsGRIznBqJA0wQahLMGBxiDBPngQwUVV9sAVysDANUqAwBou3r9NtRM/4k8qQOedi0Arb7VAyE7UQOtT6kAwXvlAb3sBQXQrBEE/OgVBJwgFQWTgA0Gk/QFBWRv/QHxo+UCdGvNAlV3sQNtT5UCaGN5ASsHWQPFez0AT/8dAcKzAQA==";
  const ENCODED_TRACKING_GAINS = "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";

  const UPRIGHT_GAIN = Object.freeze([
    0.8164966,
    2.5149697,
    -159.2230313,
    -14.8673235,
    183.4051909,
    38.3436298
  ]);

  const VALIDATION = Object.freeze({
    integrator: "fixed-step RK4 at 0.0025 s with 0.0350/0.0175 N·m·s/rad pivot/elbow damping and force limited to ±30 N",
    defaultFinalAt10Seconds: Object.freeze([
      0.00984, 0.03912, -0.00534, 0.00395, -0.00546, 0.00396
    ]),
    testedPerturbations: "Empirically recovered by t = 20 s from ±2 N·s cart impulses applied at t = 4 s during balance.",
    caveat: "Nominal trajectory tracking is not a globally stabilizing autonomous swing-up law."
  });

  function binaryToFloat32(encoded) {
    let binary;
    if (typeof atob === "function") {
      binary = atob(encoded);
    } else if (typeof Buffer !== "undefined") {
      binary = Buffer.from(encoded, "base64").toString("binary");
    } else {
      throw new Error("No base64 decoder is available.");
    }

    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    const view = new DataView(bytes.buffer);
    const values = new Float32Array(bytes.byteLength / 4);
    for (let i = 0; i < values.length; i += 1) {
      values[i] = view.getFloat32(i * 4, true);
    }
    return values;
  }

  const nominalStates = binaryToFloat32(ENCODED_NOMINAL_STATES);
  const nominalAccelerations = binaryToFloat32(ENCODED_NOMINAL_ACCELERATIONS);
  const trackingGains = binaryToFloat32(ENCODED_TRACKING_GAINS);

  if (nominalStates.length !== (SAMPLE_COUNT + 1) * STATE_SIZE) {
    throw new Error("Unexpected nominal-state table length.");
  }
  if (nominalAccelerations.length !== SAMPLE_COUNT) {
    throw new Error("Unexpected nominal-acceleration table length.");
  }
  if (trackingGains.length !== SAMPLE_COUNT * STATE_SIZE) {
    throw new Error("Unexpected tracking-gain table length.");
  }

  function trackingAcceleration(state, time) {
    const sample = Math.min(SAMPLE_COUNT - 1, Math.max(0, Math.floor(time / SAMPLE_TIME)));
    const offset = sample * STATE_SIZE;
    let desired = nominalAccelerations[sample];

    for (let i = 0; i < STATE_SIZE; i += 1) {
      let error = state[i] - nominalStates[offset + i];
      if (i === 2 || i === 4) error = dynamics.wrapAngle(error);
      desired -= trackingGains[offset + i] * error;
    }
    return dynamics.clamp(
      desired,
      -dynamics.DEFAULT_PARAMETERS.accelerationLimit,
      dynamics.DEFAULT_PARAMETERS.accelerationLimit
    );
  }

  function balanceAcceleration(state) {
    const error = [
      state[0],
      state[1],
      dynamics.wrapAngle(state[2]),
      state[3],
      dynamics.wrapAngle(state[4]),
      state[5]
    ];
    let desired = 0;
    for (let i = 0; i < STATE_SIZE; i += 1) desired -= UPRIGHT_GAIN[i] * error[i];
    return dynamics.clamp(
      desired,
      -dynamics.DEFAULT_PARAMETERS.accelerationLimit,
      dynamics.DEFAULT_PARAMETERS.accelerationLimit
    );
  }

  function desiredAcceleration(state, time, enabled) {
    if (!enabled) return null;
    return time < SWING_DURATION
      ? trackingAcceleration(state, time)
      : balanceAcceleration(state);
  }

  function modeAt(time, enabled) {
    if (!enabled) return "Controller off";
    return time < SWING_DURATION
      ? "Trajectory tracking"
      : "Upright LQR";
  }

  function nominalStateAt(time) {
    const sample = Math.min(SAMPLE_COUNT, Math.max(0, Math.round(time / SAMPLE_TIME)));
    const offset = sample * STATE_SIZE;
    return new Float64Array(nominalStates.slice(offset, offset + STATE_SIZE));
  }

  return Object.freeze({
    SAMPLE_TIME,
    SWING_DURATION,
    SAMPLE_COUNT,
    UPRIGHT_GAIN,
    VALIDATION,
    desiredAcceleration,
    trackingAcceleration,
    balanceAcceleration,
    modeAt,
    nominalStateAt
  });
});
