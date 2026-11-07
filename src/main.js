import * as THREE from "three";
import "./style.css";
import { buildLagos } from "./lagos.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";

// ---------- Scene, camera, renderer ----------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xe8c48f); // harmattan haze
scene.fog = new THREE.Fog(0xe8c48f, 40, 160);

const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  500,
);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);

// ---------- Lights ----------
scene.add(new THREE.HemisphereLight(0xfff2d6, 0x8a5a3c, 1.5));
const sun = new THREE.DirectionalLight(0xffffff, 2);
sun.position.set(30, 50, 20);
scene.add(sun);

// ---------- Build Lagos ----------
const lagos = buildLagos(scene);
// ---------- The danfo (placeholder until the real model loads) ----------
function createDanfo() {
  const danfo = new THREE.Group();

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(2.2, 2, 5),
    new THREE.MeshStandardMaterial({ color: 0xffc400 }),
  );
  body.position.y = 1.4;
  danfo.add(body);

  const stripe = new THREE.Mesh(
    new THREE.BoxGeometry(2.25, 0.25, 5.05),
    new THREE.MeshStandardMaterial({ color: 0x111111 }),
  );
  stripe.position.y = 1.1;
  danfo.add(stripe);

  const windscreen = new THREE.Mesh(
    new THREE.BoxGeometry(1.9, 0.8, 0.05),
    new THREE.MeshStandardMaterial({ color: 0x223344 }),
  );
  windscreen.position.set(0, 1.9, 2.51);
  danfo.add(windscreen);

  const wheelGeo = new THREE.CylinderGeometry(0.45, 0.45, 0.4, 16);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
  [
    [-1.1, 1.6],
    [1.1, 1.6],
    [-1.1, -1.6],
    [1.1, -1.6],
  ].forEach(([x, z]) => {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x, 0.45, z);
    danfo.add(wheel);
  });

  return danfo;
}

// ---------- The buses ----------
const BUS_COUNT = 5;
const buses = [];
for (let i = 0; i < BUS_COUNT; i++) {
  const bus = createDanfo();
  scene.add(bus);
  buses.push(bus);
}
const danfo = buses[0]; // the first bus

// ---------- Load the real danfo model, and give every bus a copy ----------
const DANFO_LENGTH = 5; // how long a danfo is in the game
const DANFO_TURN_FIX = 0; // change this if the danfo faces the wrong way

const loader = new GLTFLoader();
loader.load(
  "/models/danfo.glb",
  (gltf) => {
    const model = gltf.scene;
    model.rotation.y = DANFO_TURN_FIX;

    // Scale it so its longest side is DANFO_LENGTH
    let box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());

    model.scale.setScalar(DANFO_LENGTH / Math.max(size.x, size.z));

    // Centre it, and put the wheels on the ground
    box = new THREE.Box3().setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    model.position.x -= center.x;
    model.position.z -= center.z;
    model.position.y -= box.min.y;

    // Hide each bus's placeholder boxes (but not the passengers) and add a copy of the real danfo
    for (const bus of buses) {
      bus.children.forEach((child) => {
        if (!child.userData.isSeat) child.visible = false;
      });
      bus.add(model.clone());
    }
  },
  undefined,
  (error) => {
    console.error("Could not load danfo.glb:", error);
  },
);

// ---------- The player (placeholder until the real model loads) ----------
function createPlayer() {
  const player = new THREE.Group();

  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.4, 0.9, 4, 12),
    new THREE.MeshStandardMaterial({ color: 0x008751 }),
  );
  body.position.y = 0.85;
  player.add(body);

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.3, 16, 16),
    new THREE.MeshStandardMaterial({ color: 0x5a3825 }),
  );
  head.position.y = 1.95;
  player.add(head);

  return player;
}

const player = createPlayer();
player.position.set(-50, 0, 34); // at the roadside by the Ikeja bus stop
player.rotation.y = Math.PI / 2;
scene.add(player);

// ---------- Load the real player model ----------
const PLAYER_HEIGHT = 1.8; // metres
const PLAYER_TURN_FIX = 0; // change if he faces the wrong way

let playerMixer = null; // plays his animations
let playerModel = null; // the loaded character
let playerHips = null; // his hip bone, used to keep him centred
const playerActions = {}; // idle, walk, run, dance...
let currentAction = null;

// Smoothly switch to another animation
function playAction(name, timeScale = 1) {
  const next = playerActions[name];
  if (!next) return;
  next.timeScale = timeScale;
  if (next === currentAction) return;
  next.reset().fadeIn(0.2).play();
  if (currentAction) currentAction.fadeOut(0.2);
  currentAction = next;
}

loader.load(
  "/models/player.glb",
  (gltf) => {
    const model = gltf.scene;
    model.rotation.y = PLAYER_TURN_FIX;

    // Fix his materials, and stop him vanishing at the edges of the screen
    model.traverse((obj) => {
      if (obj.isMesh) {
        obj.frustumCulled = false;
        const materials = Array.isArray(obj.material)
          ? obj.material
          : [obj.material];
        materials.forEach((mat) => {
          mat.metalness = 0; // skin and cloth aren't metal
          mat.roughness = 0.8; // soft, matte look
          mat.transparent = false; // he's solid, not see-through
          mat.opacity = 1;
          mat.alphaTest = 0;
          mat.depthWrite = true;
          mat.side = THREE.FrontSide;
        });
      }
    });

    // Set up his animations first, so we measure him standing, not lying down
    playerMixer = new THREE.AnimationMixer(model);
    for (const clip of gltf.animations) {
      const shortName = clip.name.split("|").pop();
      playerActions[shortName] = playerMixer.clipAction(clip);
    }
    const idle = playerActions["idle"];
    if (idle) {
      idle.play();
      currentAction = idle;
    }
    playerMixer.update(0);

    // Measure him using his skeleton
    function measureBones() {
      model.updateMatrixWorld(true);
      const bonesBox = new THREE.Box3();
      const point = new THREE.Vector3();
      model.traverse((obj) => {
        if (obj.isBone) bonesBox.expandByPoint(obj.getWorldPosition(point));
      });
      return bonesBox;
    }

    // Scale him to PLAYER_HEIGHT
    let box = measureBones();
    const size = box.getSize(new THREE.Vector3());

    model.scale.multiplyScalar(PLAYER_HEIGHT / size.y);

    // Centre him and put his feet on the ground
    box = measureBones();
    const center = box.getCenter(new THREE.Vector3());
    model.position.x -= center.x;
    model.position.z -= center.z;
    model.position.y -= box.min.y;

    // Hide the placeholder and add the real character
    player.children.forEach((child) => (child.visible = false));
    player.add(model);

    // Remember the model and find his hip bone
    playerModel = model;
    model.traverse((obj) => {
      if (
        !playerHips &&
        obj.isBone &&
        obj.name.toLowerCase().includes("hips")
      ) {
        playerHips = obj;
      }
    });
  },
  undefined,
  (error) => {
    console.error("Could not load player.glb:", error);
  },
);

// ---------- Controls ----------
const keys = {};
window.addEventListener("keydown", (e) => {
  keys[e.key.toLowerCase()] = true;
});
window.addEventListener("keyup", (e) => {
  keys[e.key.toLowerCase()] = false;
});

const UP = new THREE.Vector3(0, 1, 0);
const PLAYER_RADIUS = 0.7;
let currentBus = null; // the bus he's riding, or null when on foot
let boardCooldown = 0; // seconds before he can board again after getting off

// ---------- Bus collisions ----------
// Each danfo can face any direction, so we check in its own "local" space
const DANFO_HALF_WIDTH = 1.3;
const DANFO_HALF_LENGTH = DANFO_LENGTH / 2 + 0.2;

function hitsBus(bus, x, z, r) {
  const dx = x - bus.position.x;
  const dz = z - bus.position.z;
  const angle = bus.rotation.y;
  const localX = dx * Math.cos(angle) - dz * Math.sin(angle);
  const localZ = dx * Math.sin(angle) + dz * Math.cos(angle);
  return (
    Math.abs(localX) < DANFO_HALF_WIDTH + r &&
    Math.abs(localZ) < DANFO_HALF_LENGTH + r
  );
}

function hitsAnyBus(x, z, r) {
  return buses.some((bus) => hitsBus(bus, x, z, r));
}

// Move an object, sliding along walls instead of passing through them
function tryMove(obj, dx, dz, radius, avoidBuses = false) {
  // If a bus has driven onto him, let him walk out of it
  const insideBus =
    avoidBuses && hitsAnyBus(obj.position.x, obj.position.z, radius);
  const checkBuses = avoidBuses && !insideBus;
  const blocked = (x, z) =>
    lagos.isBlocked(x, z, radius) || (checkBuses && hitsAnyBus(x, z, radius));

  let moved = true;
  if (!blocked(obj.position.x + dx, obj.position.z)) {
    obj.position.x += dx;
  } else {
    moved = false;
  }
  if (!blocked(obj.position.x, obj.position.z + dz)) {
    obj.position.z += dz;
  } else {
    moved = false;
  }
  return moved;
}

// ---------- Walking ----------
const WALK_SPEED = 2.2; // slower, so his feet match the walk animation
const RUN_SPEED = 6;
const PLAYER_TURN_SPEED = 3;

function updatePlayer(dt) {
  const forward = keys["arrowup"] || keys["w"];
  const back = keys["arrowdown"] || keys["s"];
  const left = keys["arrowleft"] || keys["a"];
  const right = keys["arrowright"] || keys["d"];
  const running = keys["shift"];
  const moveSpeed = running ? RUN_SPEED : WALK_SPEED;

  const turn = (left ? 1 : 0) - (right ? 1 : 0);
  player.rotation.y += turn * PLAYER_TURN_SPEED * dt;

  const move = (forward ? 1 : 0) - (back ? 0.5 : 0); // walking backwards is slower
  const dx = Math.sin(player.rotation.y) * move * moveSpeed * dt;
  const dz = Math.cos(player.rotation.y) * move * moveSpeed * dt;
  tryMove(player, dx, dz, PLAYER_RADIUS, true);

  // Pick the right animation
  if (move !== 0) {
    playAction(running ? "run" : "walk", move < 0 ? -1 : 1);
  } else {
    playAction("idle");
  }
}

// ---------- Keep his body over his collision circle ----------
// Walk and run animations push his hips forward, so slide him back every frame
const hipsPosition = new THREE.Vector3();

function keepPlayerCentred() {
  if (!playerModel || !playerHips) return;
  player.updateMatrixWorld(true);
  playerHips.getWorldPosition(hipsPosition);
  player.worldToLocal(hipsPosition);
  playerModel.position.x -= hipsPosition.x;
  playerModel.position.z -= hipsPosition.z;
}

// ---------- On-screen messages ----------
let messageText = "";
let messageTimer = 0;

function showMessage(text, seconds) {
  messageText = text;
  messageTimer = seconds;
}

// ---------- Passengers inside the buses ----------
// Simple seated figures for now; real low-poly NPC models come later
const SEAT_POSITIONS = [
  [-0.5, 1.2], // front passenger seat
  [-0.6, 0.3],
  [0, 0.3],
  [0.6, 0.3], // row 1
  [-0.6, -0.6],
  [0, -0.6],
  [0.6, -0.6], // row 2
  [-0.6, -1.5],
  [0, -1.5],
  [0.6, -1.5], // row 3
];

const DRIVER_SEAT = [0.5, 1.2]; // driver on the left (left-hand drive)
const BUS_SEATS = SEAT_POSITIONS.length; // 10 passengers
const SEAT_LIFT = 0; // raise or lower all passengers if they look wrong

const SHIRT_COLOURS = [
  0xe53935, 0x1e88e5, 0x43a047, 0xfdd835, 0x8e24aa, 0xfb8c00, 0xffffff,
  0x6d4c41,
];
const torsoGeometry = new THREE.BoxGeometry(0.45, 0.55, 0.28);
const headGeometry = new THREE.SphereGeometry(0.13, 12, 12);
const skinMaterial = new THREE.MeshStandardMaterial({ color: 0x5a3825 });
const shirtMaterials = SHIRT_COLOURS.map(
  (color) => new THREE.MeshStandardMaterial({ color }),
);

function makeSeatedPerson(colourIndex) {
  const person = new THREE.Group();
  const torso = new THREE.Mesh(
    torsoGeometry,
    shirtMaterials[colourIndex % shirtMaterials.length],
  );
  torso.position.y = 1.25;
  const head = new THREE.Mesh(headGeometry, skinMaterial);
  head.position.y = 1.67;
  person.add(torso, head);
  person.userData.isSeat = true; // so the danfo loader doesn't hide it
  return person;
}

// Show one figure per person on board
function updateSeatFigures(bus) {
  const count = bus.userData.passengers + (currentBus === bus ? 1 : 0);
  bus.userData.seatFigures.forEach((figure, i) => {
    figure.visible = i < count;
  });
}

// ---------- The danfo route ----------
const DANFO_ROUTE = [
  { x: -50, z: 40, stop: "Ikeja" },
  { x: 120, z: 40 }, // across the bridge
  { x: 120, z: 110, stop: "Marina" },
  { x: 120, z: 40 },
  { x: 120, z: -125, stop: "Lekki" },
  { x: 120, z: 40 }, // back towards the bridge
];
const BUS_GAP = 8; // a bus stops if another bus is this close ahead (metres)
const BUS_SPEED = 14; // metres per second, about 50 km/h
const BUS_WAIT = 8; // seconds at each stop
const LANE_OFFSET = 2.5; // drive on the right-hand side of the road
const DANFO_FARE = 500; // naira

// ---------- Spread the buses evenly along the whole route ----------
const routeLengths = DANFO_ROUTE.map((point, i) => {
  const next = DANFO_ROUTE[(i + 1) % DANFO_ROUTE.length];
  return Math.hypot(next.x - point.x, next.z - point.z);
});
const routeTotal = routeLengths.reduce((a, b) => a + b, 0);

// A position a certain distance along the route
function pointAlongRoute(distance) {
  let d = distance % routeTotal;
  for (let i = 0; i < DANFO_ROUTE.length; i++) {
    if (d <= routeLengths[i]) {
      const a = DANFO_ROUTE[i];
      const b = DANFO_ROUTE[(i + 1) % DANFO_ROUTE.length];
      const t = d / routeLengths[i];
      return {
        x: a.x + (b.x - a.x) * t,
        z: a.z + (b.z - a.z) * t,
        nextIndex: (i + 1) % DANFO_ROUTE.length,
        angle: Math.atan2(b.x - a.x, b.z - a.z),
      };
    }
    d -= routeLengths[i];
  }
}

// Set up each bus: its place on the route, its passengers and driver
buses.forEach((bus, i) => {
  const start = pointAlongRoute((i / BUS_COUNT) * routeTotal);
  bus.position.set(
    start.x - Math.cos(start.angle) * LANE_OFFSET, // on the right-hand lane
    0,
    start.z + Math.sin(start.angle) * LANE_OFFSET,
  );
  bus.rotation.y = start.angle;

  // Passengers and driver sit in their own group, so far-away buses can hide them
  const seatGroup = new THREE.Group();
  seatGroup.userData.isSeat = true;
  bus.add(seatGroup);

  const seatFigures = SEAT_POSITIONS.map(([x, z], s) => {
    const figure = makeSeatedPerson(i * 3 + s);
    figure.position.set(x, SEAT_LIFT, z);
    seatGroup.add(figure);
    return figure;
  });

  const driver = makeSeatedPerson(i);
  driver.position.set(DRIVER_SEAT[0], SEAT_LIFT, DRIVER_SEAT[1]);
  seatGroup.add(driver);

  bus.userData = {
    routeIndex: start.nextIndex,
    wait: 0,
    stop: null,
    passengers: 2 + Math.floor(Math.random() * 6),
    seatFigures,
    seatGroup,
  };
  updateSeatFigures(bus);
});

// ---------- Traffic: is there another bus close ahead in the same lane? ----------
function busAhead(bus) {
  const fx = Math.sin(bus.rotation.y);
  const fz = Math.cos(bus.rotation.y);
  for (const other of buses) {
    if (other === bus) continue;
    const dx = other.position.x - bus.position.x;
    const dz = other.position.z - bus.position.z;
    const ahead = dx * fx + dz * fz; // how far in front
    const side = Math.abs(dx * fz - dz * fx); // how far to the side
    const sameWay =
      Math.sin(other.rotation.y) * fx + Math.cos(other.rotation.y) * fz > 0.3;
    if (sameWay && ahead > 0 && ahead < BUS_GAP && side < 1.8) return true;
  }
  return false;
}
// ---------- Real passenger models ----------
const PASSENGER_MODELS = [
  "/models/passenger-dansiki.glb",
  "/models/passenger-marketwoman.glb",
  "/models/passenger-office.glb",
];
const PASSENGER_HEIGHT = 1.3; // how tall a seated passenger is, in metres
const PASSENGER_MAX_WIDTH = 0.6; // no passenger wider than this, so they fit inside
const PASSENGER_FLOOR = 0.45; // height of the danfo's floor
const PASSENGER_TURN_FIX = 0; // change to Math.PI if passengers face backwards
const PASSENGER_TILT_FIX = 0; // the freeze below handles their direction
const passengerModels = [];

// Freeze a passenger into a still model, in the first frame of his animation (e.g. sitting)
function bakePose(gltf, path) {
  const root = gltf.scene;
  console.log(
    "PASSENGER FILE:",
    path,
    "| animations:",
    gltf.animations.map((a) => a.name),
  );

  // If the file has an animation, pose him in its first frame
  if (gltf.animations.length > 0) {
    const mixer = new THREE.AnimationMixer(root);
    mixer.clipAction(gltf.animations[0]).play();
    mixer.update(0);
  }
  root.updateMatrixWorld(true);

  // Copy every body part into a plain mesh, in exactly the pose it's drawn in
  const baked = new THREE.Group();
  const vertex = new THREE.Vector3();
  root.traverse((obj) => {
    if (!obj.isMesh) return;
    const geometry = obj.geometry.clone();
    const positions = geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      vertex.fromBufferAttribute(positions, i);
      if (obj.isSkinnedMesh) obj.applyBoneTransform(i, vertex); // apply the skeleton's pose
      vertex.applyMatrix4(obj.matrixWorld);
      positions.setXYZ(i, vertex.x, vertex.y, vertex.z);
    }
    geometry.deleteAttribute("skinIndex");
    geometry.deleteAttribute("skinWeight");
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    baked.add(new THREE.Mesh(geometry, obj.material));
  });
  return baked;
}
// Fix a passenger's materials, size and position, ready to be copied into seats
function preparePassenger(model, path) {
  model.rotation.x = PASSENGER_TILT_FIX;

  // Fix materials, and count how many visible parts the file has
  let meshCount = 0;
  model.traverse((obj) => {
    if (obj.isMesh) {
      meshCount++;
      const materials = Array.isArray(obj.material)
        ? obj.material
        : [obj.material];
      materials.forEach((mat) => {
        mat.metalness = 0;
        mat.roughness = 0.8;
        mat.transparent = false;
        mat.opacity = 1;
        mat.depthWrite = true;
        mat.side = THREE.FrontSide;
      });
    }
  });

  // Measure him
  let box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  console.log(
    "PASSENGER CHECK:",
    path,
    "| parts:",
    meshCount,
    "| width:",
    size.x.toFixed(2),
    "| height:",
    size.y.toFixed(2),
    "| depth:",
    size.z.toFixed(2),
  );

  // An empty file can't be used
  if (meshCount === 0 || !isFinite(size.y) || size.y === 0) {
    console.warn(
      "PASSENGER CHECK:",
      path,
      "has no body in it. Re-export it from Blender.",
    );
    return null;
  }

  // Scale to a seated height, but never wider than PASSENGER_MAX_WIDTH
  const scale = Math.min(
    PASSENGER_HEIGHT / size.y,
    PASSENGER_MAX_WIDTH / size.x,
  );
  model.scale.multiplyScalar(scale);

  // Centre on the seat, with feet on the danfo floor
  box = new THREE.Box3().setFromObject(model);
  const center = box.getCenter(new THREE.Vector3());
  model.position.x -= center.x;
  model.position.z -= center.z;
  model.position.y += PASSENGER_FLOOR - box.min.y;

  // Wrap it, so these adjustments are kept when we copy it
  const wrapper = new THREE.Group();
  wrapper.add(model);
  wrapper.rotation.y = PASSENGER_TURN_FIX; // face the front of the danfo
  return wrapper;
}

// Replace every placeholder figure (passengers and drivers) with a real passenger
function swapInRealPassengers() {
  const models = passengerModels.filter(Boolean);
  if (models.length === 0) return;
  console.log("Swapping in", models.length, "passenger model(s)");
  buses.forEach((bus, b) => {
    bus.userData.seatGroup.children.forEach((figure, i) => {
      figure.clear(); // remove the box and ball
      figure.add(models[(i + b) % models.length].clone());
    });
  });
}

// Load all the passenger files, then swap them in
let passengersDone = 0;
function passengerFinished() {
  passengersDone++;
  swapInRealPassengers(); // use whichever passengers have loaded so far
}

PASSENGER_MODELS.forEach((path, i) => {
  loader.load(
    path,
    (gltf) => {
      passengerModels[i] = preparePassenger(bakePose(gltf, path), path);
      passengerFinished();
    },
    undefined,
    (error) => {
      console.error("Could not load", path, error);
      passengerFinished();
    },
  );
});

// The point a bus is driving towards, shifted onto the right-hand lane
function laneTarget(bus) {
  const len = DANFO_ROUTE.length;
  const target = DANFO_ROUTE[bus.userData.routeIndex];
  const prev = DANFO_ROUTE[(bus.userData.routeIndex - 1 + len) % len];
  const dx = target.x - prev.x;
  const dz = target.z - prev.z;
  const d = Math.hypot(dx, dz) || 1;
  return {
    x: target.x - (dz / d) * LANE_OFFSET,
    z: target.z + (dx / d) * LANE_OFFSET,
    stop: target.stop,
  };
}

// The name of this bus's next stop
function nextStopName(bus) {
  for (let i = 0; i < DANFO_ROUTE.length; i++) {
    const point =
      DANFO_ROUTE[(bus.userData.routeIndex + i) % DANFO_ROUTE.length];
    if (point.stop) return point.stop;
  }
  return "";
}

// At each stop, a few passengers get off and a few get on
function exchangePassengers(bus) {
  const d = bus.userData;
  const playerSeat = currentBus === bus ? 1 : 0;
  const getOff = Math.floor(Math.random() * 4);
  const getOn = Math.floor(Math.random() * 4);
  d.passengers = Math.max(0, d.passengers - getOff);
  d.passengers = Math.min(BUS_SEATS - playerSeat, d.passengers + getOn);
  updateSeatFigures(bus);
}

function updateBus(bus, dt) {
  const d = bus.userData;

  // Waiting at a stop
  if (d.wait > 0) {
    d.wait -= dt;
    if (d.wait <= 0) d.stop = null; // time to go
    return;
  }

  const target = laneTarget(bus);
  const dx = target.x - bus.position.x;
  const dz = target.z - bus.position.z;
  const dist = Math.hypot(dx, dz);

  // Reached this point: stop if it's a bus stop, then head for the next one
  if (dist < 3) {
    d.routeIndex = (d.routeIndex + 1) % DANFO_ROUTE.length;
    if (target.stop) {
      d.stop = target.stop;
      d.wait = BUS_WAIT;
      exchangePassengers(bus);
    }
    return;
  }

  // Wait if there's a bus close ahead (traffic!)
  if (busAhead(bus)) return;
  // Turn smoothly towards the target
  const desired = Math.atan2(dx, dz);
  let diff = desired - bus.rotation.y;
  diff = Math.atan2(Math.sin(diff), Math.cos(diff)); // shortest way round
  bus.rotation.y += diff * Math.min(1, 2.5 * dt);

  // Slow down for sharp turns
  const sharpTurn = Math.abs(diff) > 0.4;
  const step = BUS_SPEED * (sharpTurn ? 0.25 : 1) * dt;
  bus.position.x += Math.sin(bus.rotation.y) * step;
  bus.position.z += Math.cos(bus.rotation.y) * step;
}

// The closest bus within maxDistance of the player, or null
function nearestBus(maxDistance) {
  let best = null;
  let bestDistance = maxDistance;
  for (const bus of buses) {
    const distance = player.position.distanceTo(bus.position);
    if (distance < bestDistance) {
      best = bus;
      bestDistance = distance;
    }
  }
  return best;
}

// ---------- Press E to board or get off ----------
window.addEventListener("keydown", (e) => {
  if (e.key.toLowerCase() !== "e") return;
  if (e.repeat) return; // holding E shouldn't press it again and again

  if (currentBus) {
    // Getting off: only when the danfo is at a stop
    const stop = currentBus.userData.stop;
    if (!stop) {
      showMessage("Wait until the danfo stops!", 2);
      return;
    }
    // Get off on the door side first, then the other side
    for (const side of [-2.2, -2.2]) {
      const offset = new THREE.Vector3(side, 0, 0).applyAxisAngle(
        UP,
        currentBus.rotation.y,
      );
      const spot = currentBus.position.clone().add(offset);
      if (!lagos.isBlocked(spot.x, spot.z, PLAYER_RADIUS)) {
        player.position.copy(spot);
        player.rotation.y = currentBus.rotation.y;
        player.visible = true;
        const leftBus = currentBus;
        currentBus = null;
        updateSeatFigures(leftBus);
        boardCooldown = 3;
        showMessage(`You got off at ${stop}`, 2.5);
        return;
      }
    }
  } else {
    // Boarding: the nearest bus must be stopped, have a seat, and he must have the fare
    const bus = nearestBus(5);
    if (!bus || boardCooldown > 0) return;
    if (!bus.userData.stop) {
      showMessage("The danfo is moving. Wait for it to stop!", 2);
      return;
    }
    if (bus.userData.passengers >= BUS_SEATS) {
      showMessage("This danfo is full! Wait for the next one.", 2.5);
      return;
    }
    if (!spendMoney(DANFO_FARE)) {
      showMessage(`You need ₦${DANFO_FARE} for the fare`, 2.5);
      return;
    }
    currentBus = bus;
    player.visible = false;
    updateSeatFigures(bus);
    showMessage(`Paid ₦${DANFO_FARE}. Next stop: ${nextStopName(bus)}`, 2.5);
  }
});
// ---------- Passers-by and bus-goers ----------
const NPC_MODELS = [
  "/models/npc-office.glb",
  "/models/npc-marketwoman.glb",
  "/models/npc-dansiki.glb",
];
const PEDESTRIAN_COUNT = 60; // how many people walk the streets
const NPC_HEIGHT = 1.7; // metres
const NPC_TURN_FIX = 0; // change to Math.PI if they walk backwards
const SIDEWALK_OFFSET = 6; // how far from the middle of the road they walk
const MAX_WAITING = 6; // most people waiting at one bus stop
const JOIN_STOP_CHANCE = 0.3; // chance per second that a walker passing a stop waits there

// The middle line of each road: [x1, z1, x2, z2]
const ROAD_LINES = [
  [-180, 40, 15, 40], // mainland road to the bridge
  [-60, -180, -60, 180], // mainland avenue
  [-180, 125, 15, 125], // Ikeja road
  [-180, -70, 15, -70], // Yaba road
  [65, 40, 185, 40], // Island road from the bridge
  [120, -140, 120, 160], // Island north-south road
  [65, -130, 185, -130], // Lekki road
];

// Turn each road into two footpaths, one on each side
const FOOTPATHS = [];
for (const [x1, z1, x2, z2] of ROAD_LINES) {
  const length = Math.hypot(x2 - x1, z2 - z1);
  const sideX = -(z2 - z1) / length;
  const sideZ = (x2 - x1) / length;
  for (const side of [-1, 1]) {
    const ox = sideX * SIDEWALK_OFFSET * side;
    const oz = sideZ * SIDEWALK_OFFSET * side;
    FOOTPATHS.push({
      x1: x1 + ox,
      z1: z1 + oz,
      x2: x2 + ox,
      z2: z2 + oz,
      length,
    });
  }
}

// ---------- Where people wait at each bus stop (on the pavement, door side) ----------
const BUS_STOPS = [];
DANFO_ROUTE.forEach((point, i) => {
  if (!point.stop) return;
  const prev = DANFO_ROUTE[(i - 1 + DANFO_ROUTE.length) % DANFO_ROUTE.length];
  const dx = point.x - prev.x;
  const dz = point.z - prev.z;
  const d = Math.hypot(dx, dz);
  const rightX = -dz / d;
  const rightZ = dx / d;
  BUS_STOPS.push({
    name: point.stop,
    x: point.x + rightX * 5.5,
    z: point.z + rightZ * 5.5,
    alongX: dx / d,
    alongZ: dz / d,
    faceRoad: Math.atan2(-rightX, -rightZ),
  });
});

const pedestrians = [];

// ---------- Helpers ----------
// The closest point on any footpath to (x, z)
function nearestFootpathPoint(x, z) {
  let best = null;
  for (const path of FOOTPATHS) {
    const dx = path.x2 - path.x1;
    const dz = path.z2 - path.z1;
    let t = ((x - path.x1) * dx + (z - path.z1) * dz) / (dx * dx + dz * dz);
    t = Math.max(0, Math.min(1, t));
    const px = path.x1 + dx * t;
    const pz = path.z1 + dz * t;
    const d = Math.hypot(px - x, pz - z);
    if (!best || d < best.d) best = { path, t, x: px, z: pz, d };
  }
  return best;
}

// How many people are waiting at (or walking to) a bus stop
function waitingAt(stop) {
  return pedestrians.filter(
    (p) => p.stop === stop && (p.state === "toStop" || p.state === "waiting"),
  ).length;
}

// Free seats on a bus, counting people already walking to it and the player
function seatsFree(bus) {
  const d = bus.userData;
  return (
    BUS_SEATS - d.passengers - (d.boarding || 0) - (currentBus === bus ? 1 : 0)
  );
}

// The sliding door, on the kerb side (the right) of the danfo
function busDoor(bus) {
  const a = bus.rotation.y;
  return {
    x: bus.position.x - Math.cos(a) * 1.7,
    z: bus.position.z + Math.sin(a) * 1.7,
  };
}

// Smoothly switch a person's animation
function setAnim(p, name) {
  const next = p.actions[name];
  if (!next || next === p.current) return;
  next.reset().fadeIn(0.25).play();
  if (p.current) p.current.fadeOut(0.25);
  p.current = next;
}

// Walk a person towards (tx, tz). Returns true when they've arrived.
function walkTowards(p, tx, tz, dt) {
  const dx = tx - p.group.position.x;
  const dz = tz - p.group.position.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 0.3) return true;
  const step = Math.min(dist, p.speed * dt);
  p.group.position.x += (dx / dist) * step;
  p.group.position.z += (dz / dist) * step;
  p.group.rotation.y = Math.atan2(dx, dz);
  return false;
}
// Send a person to wait at a bus stop (instantly, or by walking there)
function startWaiting(p, stop, instant) {
  p.stop = stop;

  // Pick a spot that isn't too close to anyone else waiting here
  let tx = stop.x;
  let tz = stop.z;
  for (let tries = 0; tries < 10; tries++) {
    const along = (Math.random() - 0.5) * 7; // spread along the road, unevenly
    const back = -0.5 + Math.random() * 1.7; // some at the kerb's edge, some further back
    tx = stop.x + stop.alongX * along - Math.sin(stop.faceRoad) * back;
    tz = stop.z + stop.alongZ * along - Math.cos(stop.faceRoad) * back;

    const crowded = pedestrians.some(
      (q) =>
        q !== p &&
        q.stop === stop &&
        (q.state === "waiting" || q.state === "toStop") &&
        Math.hypot(q.tx - tx, q.tz - tz) < 0.8,
    );
    if (!crowded) break; // found a free spot
  }
  p.tx = tx;
  p.tz = tz;

  // Not everyone faces exactly the same way
  p.faceAngle = stop.faceRoad + (Math.random() - 0.5) * 1.2;

  if (instant) {
    p.group.position.set(tx, 0, tz);
    p.group.rotation.y = p.faceAngle;
    p.state = "waiting";
    setAnim(p, "idle");
  } else {
    p.state = "toStop";
    setAnim(p, "walk");
  }
}

// ---------- Get a loaded NPC ready to be copied ----------
function prepareNpcTemplate(gltf, path) {
  const model = gltf.scene;
  model.rotation.y = NPC_TURN_FIX;

  model.traverse((obj) => {
    if (obj.isMesh) {
      obj.frustumCulled = false;
      const materials = Array.isArray(obj.material)
        ? obj.material
        : [obj.material];
      materials.forEach((mat) => {
        mat.metalness = 0;
        mat.roughness = 0.8;
        mat.transparent = false;
        mat.opacity = 1;
        mat.depthWrite = true;
        mat.side = THREE.FrontSide;
      });
    }
  });

  // Find the animations by name
  const clips = {};
  for (const clip of gltf.animations) clips[clip.name.split("|").pop()] = clip;
  if (!clips.idle && clips.stand) clips.idle = clips.stand; // "stand" works as the idle too
  console.log("NPC loaded:", path, "| animations:", Object.keys(clips));

  // Pose them standing, so we measure them upright
  const mixer = new THREE.AnimationMixer(model);
  if (clips.idle) mixer.clipAction(clips.idle).play();
  mixer.update(0);

  function measureBones() {
    model.updateMatrixWorld(true);
    const bonesBox = new THREE.Box3();
    const point = new THREE.Vector3();
    model.traverse((obj) => {
      if (obj.isBone) bonesBox.expandByPoint(obj.getWorldPosition(point));
    });
    return bonesBox;
  }

  // Scale to NPC_HEIGHT, centre, and put their feet on the ground
  let box = measureBones();
  const size = box.getSize(new THREE.Vector3());
  model.scale.multiplyScalar(NPC_HEIGHT / size.y);
  box = measureBones();
  const center = box.getCenter(new THREE.Vector3());
  model.position.x -= center.x;
  model.position.z -= center.z;
  model.position.y -= box.min.y;

  return { model, clips };
}

// Would these two people look like twins standing side by side?
// Different characters are always fine together.
// Two of the same character must wear clearly different colours and shades.
function looksSimilar(a, b) {
  if (a.type !== b.type) return false; // different characters: no problem

  let hueGap = Math.abs(a.look.hue - b.look.hue) % (Math.PI * 2);
  if (hueGap > Math.PI) hueGap = Math.PI * 2 - hueGap;
  const shadeGap = Math.abs(a.look.brightness - b.look.brightness);

  const sameColour = hueGap < 1.0;                                   // colours too close
  const bothLight = a.look.brightness > 1 && b.look.brightness > 1;  // both light shades
  const sameShade = shadeGap < 0.12;                                  // shades too close
  return sameColour || bothLight || sameShade;
}

// ---------- Give each person a slightly different look ----------
// Shifts clothing colours (but not skin) and brightness, per person
function varyLook(model) {
  const hue = (Math.random() - 0.5) * Math.PI * 1.4; // how far to shift clothing colours
  const brightness = 0.85 + Math.random() * 0.3; // slightly lighter or darker overall

  model.traverse((obj) => {
    if (!obj.isMesh) return;
    const original = Array.isArray(obj.material)
      ? obj.material
      : [obj.material];
    const varied = original.map((m) => {
      const mat = m.clone(); // their own copy, so others aren't affected
      mat.onBeforeCompile = (shader) => {
        shader.uniforms.uHue = { value: hue };
        shader.uniforms.uBright = { value: brightness };
        shader.fragmentShader =
          "uniform float uHue;\nuniform float uBright;\n" +
          shader.fragmentShader.replace(
            "#include <map_fragment>",
            `#include <map_fragment>
            {
              vec3 c = diffuseColor.rgb;
              float maxC = max(c.r, max(c.g, c.b));
              float minC = min(c.r, min(c.g, c.b));
              float d = maxC - minC;
              float sat = maxC > 0.0 ? d / maxC : 0.0;

              // Work out the hue (0 to 1 around the colour wheel)
              float h = 0.0;
              if (d > 0.0) {
                if (maxC == c.r) h = mod((c.g - c.b) / d, 6.0);
                else if (maxC == c.g) h = (c.b - c.r) / d + 2.0;
                else h = (c.r - c.g) / d + 4.0;
                h /= 6.0;
              }

              // Skin tones are all reds, oranges and browns, so never shift those.
              // Also skip near-greys (hair, eyes, black and white clothes).
              bool skin = h < 0.125 || h > 0.97;
              bool grey = sat < 0.12;
              if (!skin && !grey) {
                const vec3 k = vec3(0.57735);
                float cosA = cos(uHue);
                c = c * cosA + cross(k, c) * sin(uHue) + k * dot(k, c) * (1.0 - cosA);
              }
              diffuseColor.rgb = clamp(c, 0.0, 1.0) * uBright;
            }`,
          );
      };
      mat.customProgramCacheKey = () => "npc-vary"; // all share one shader program (fast)
      return mat;
    });
    obj.material = Array.isArray(obj.material) ? varied : varied[0];
  });
}

// ---------- Make one person from a template ----------
function spawnPedestrian(template) {
  const model = SkeletonUtils.clone(template.model);
  varyLook(model); // different clothing colours and brightness

  const group = new THREE.Group();
  group.add(model);
  const heightScale = 0.92 + Math.random() * 0.16; // some taller, some shorter
  group.scale.setScalar(heightScale);
  scene.add(group);

  const mixer = new THREE.AnimationMixer(model);
  const actions = {};
  if (template.clips.walk) actions.walk = mixer.clipAction(template.clips.walk);
  if (template.clips.idle) actions.idle = mixer.clipAction(template.clips.idle);

  let hips = null;
  model.traverse((obj) => {
    if (!hips && obj.isBone && obj.name.toLowerCase().includes("hips"))
      hips = obj;
  });

  const p = {
    group,
    model,
    mixer,
    hips,
    actions,
    current: null,
    state: "walking",
    path: FOOTPATHS[Math.floor(Math.random() * FOOTPATHS.length)],
    t: Math.random(), // how far along the footpath (0 to 1)
    dir: Math.random() < 0.5 ? 1 : -1, // which way they're walking
    speed: 1.1 + Math.random() * 0.4, // metres per second
    stop: null,
    bus: null,
    tx: 0,
    tz: 0,
  };

  // Every fourth person starts out already waiting at a bus stop
  if (pedestrians.length % 4 === 0) {
    const stop = BUS_STOPS[Math.floor(Math.random() * BUS_STOPS.length)];
    if (waitingAt(stop) < MAX_WAITING) startWaiting(p, stop, true);
  }
  if (p.state === "walking") setAnim(p, "walk");
  if (p.current) p.current.time = Math.random() * p.current.getClip().duration; // not all in step

  pedestrians.push(p);
}

// ---------- Update everyone, every frame ----------
const pedHips = new THREE.Vector3();

function updatePedestrians(dt) {
  for (const p of pedestrians) {
    if (p.state === "walking") {
      // Stroll along the footpath, turning around at the end
      p.t += (p.dir * p.speed * dt) / p.path.length;
      if (p.t > 1) {
        p.t = 1;
        p.dir = -1;
      }
      if (p.t < 0) {
        p.t = 0;
        p.dir = 1;
      }
      const { x1, z1, x2, z2 } = p.path;
      p.group.position.set(x1 + (x2 - x1) * p.t, 0, z1 + (z2 - z1) * p.t);
      p.group.rotation.y = Math.atan2((x2 - x1) * p.dir, (z2 - z1) * p.dir);

      // Passing a bus stop? Sometimes stop and wait for a danfo
      for (const stop of BUS_STOPS) {
        const d = Math.hypot(
          stop.x - p.group.position.x,
          stop.z - p.group.position.z,
        );
        if (
          d < 12 &&
          Math.random() < JOIN_STOP_CHANCE * dt &&
          waitingAt(stop) < MAX_WAITING
        ) {
          startWaiting(p, stop, false);
          break;
        }
      }
    } else if (p.state === "toStop") {
      if (walkTowards(p, p.tx, p.tz, dt)) {
        p.state = "waiting";
        p.group.rotation.y = p.faceAngle;
        setAnim(p, "idle");
        // Start their idle at a random moment, so they don't all sway together
        if (p.current)
          p.current.time = Math.random() * p.current.getClip().duration;
      }
    } else if (p.state === "waiting") {
      // Is a danfo stopped here with a free seat?
      const bus = buses.find(
        (b) =>
          b.userData.stop === p.stop.name &&
          Math.hypot(b.position.x - p.stop.x, b.position.z - p.stop.z) < 15 &&
          seatsFree(b) > 0,
      );
      if (bus) {
        p.state = "boarding";
        p.bus = bus;
        bus.userData.boarding = (bus.userData.boarding || 0) + 1; // save them a seat
        setAnim(p, "walk");
      }
    } else if (p.state === "boarding") {
      const bus = p.bus;
      if (!bus.userData.stop) {
        // The danfo left without them: go back and wait
        bus.userData.boarding--;
        p.bus = null;
        startWaiting(p, p.stop, false);
      } else {
        const door = busDoor(bus);
        if (walkTowards(p, door.x, door.z, dt)) {
          // In they go
          bus.userData.boarding--;
          bus.userData.passengers = Math.min(
            BUS_SEATS,
            bus.userData.passengers + 1,
          );
          updateSeatFigures(bus);
          p.state = "inBus";
          p.bus = null;
          p.stop = null;
        }
      }
    } else if (p.state === "leaving") {
      // Just got off: walk to the footpath, then carry on as a walker
      if (walkTowards(p, p.tx, p.tz, dt)) p.state = "walking";
    }

    // Only show and animate people near the camera
    const near =
      p.state !== "inBus" && p.group.position.distanceTo(camera.position) < 80;
    p.group.visible = near;
    if (!near) continue;
    p.mixer.update(dt);

    // Keep their body over their position, like the player
    if (p.hips) {
      p.group.updateMatrixWorld(true);
      p.hips.getWorldPosition(pedHips);
      p.group.worldToLocal(pedHips);
      p.model.position.x -= pedHips.x;
      p.model.position.z -= pedHips.z;
    }
  }
}

// ---------- Load each NPC and spawn their share of people ----------
NPC_MODELS.forEach((path) => {
  loader.load(
    path,
    (gltf) => {
      const template = prepareNpcTemplate(gltf, path);
      const share = Math.ceil(PEDESTRIAN_COUNT / NPC_MODELS.length);
      for (let i = 0; i < share; i++) spawnPedestrian(template);
    },
    undefined,
    (error) => {
      console.error("Could not load", path, error);
    },
  );
});

// ---------- Camera follow (moves closer if something is in the way) ----------
function updateCamera(target, distance, height, lookHeight, avoidBuses) {
  const angle = target.rotation.y;
  const dirX = -Math.sin(angle);
  const dirZ = -Math.cos(angle);

  // Step backwards from the target until we hit a building (or a bus)
  let safeDistance = distance;
  for (let d = 0.5; d <= distance; d += 0.25) {
    const x = target.position.x + dirX * d;
    const z = target.position.z + dirZ * d;
    if (
      lagos.hitsBuilding(x, z, 0.3) ||
      (avoidBuses && hitsAnyBus(x, z, 0.3))
    ) {
      safeDistance = Math.max(d - 0.5, 1.5);
      break;
    }
  }

  const desired = new THREE.Vector3(
    target.position.x + dirX * safeDistance,
    height,
    target.position.z + dirZ * safeDistance,
  );

  // Move quickly when blocked, smoothly otherwise
  const blocked = safeDistance < distance;
  camera.position.lerp(desired, blocked ? 0.3 : 0.1);
  camera.lookAt(
    target.position.x,
    target.position.y + lookHeight,
    target.position.z,
  );
}

// Start the camera behind the player
camera.position.set(player.position.x - 6, 3, player.position.z);

// ---------- Game loop ----------
const hud = document.getElementById("hud");
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  if (playerMixer) playerMixer.update(dt);
  keepPlayerCentred();
  for (const bus of buses) updateBus(bus, dt); // the danfos drive themselves
  updatePedestrians(dt); // passers-by walk along the footpaths
  // Only draw passengers in buses near the camera
  for (const bus of buses) {
    bus.userData.seatGroup.visible =
      bus.position.distanceTo(camera.position) < 60;
  }
  if (boardCooldown > 0) boardCooldown -= dt;

  if (currentBus) {
    updateCamera(currentBus, 12, 6, 1.5, false);
    const d = currentBus.userData;
    const area = lagos.getDistrict(
      currentBus.position.x,
      currentBus.position.z,
    );
    hud.textContent = d.stop
      ? `${area}  ·  ${d.stop} bus stop  ·  E to get off`
      : `${area}  ·  On the danfo  ·  Next stop: ${nextStopName(currentBus)}`;
  } else {
    updatePlayer(dt);
    updateCamera(player, 6, 3, 1.5, true);
    const area = lagos.getDistrict(player.position.x, player.position.z);
    const bus = nearestBus(5);
    if (bus && bus.userData.stop) {
      const seatsLeft = BUS_SEATS - bus.userData.passengers;
      const stopName = nextStopName(bus);
      hud.textContent =
        seatsLeft > 0
          ? `Conductor: "${stopName}! ${stopName}! Enter with your change!"  ·  ${seatsLeft} seats left  ·  E to board (₦${DANFO_FARE})`
          : `Conductor: "E don full! Wait for the next one!"`;
    } else if (bus) {
      hud.textContent = `${area}  ·  The danfo is moving`;
    } else {
      hud.textContent = `${area}  ·  On foot  ·  Shift to run`;
    }
  }

  // A temporary message overrides the HUD
  if (messageTimer > 0) {
    messageTimer -= dt;
    hud.textContent = messageText;
  }

  renderer.render(scene, camera);
}
animate();

// ---------- Handle window resizing ----------
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------- Money ----------
const STARTING_MONEY = 50000; // naira, change this to balance the game
let money = STARTING_MONEY;
const moneyDisplay = document.getElementById("money");

function updateMoneyDisplay() {
  moneyDisplay.textContent = "₦" + money.toLocaleString("en-NG");
}

// Briefly flash the counter red (spend) or gold (earn)
function flashMoney(type) {
  moneyDisplay.classList.add(type);
  setTimeout(() => moneyDisplay.classList.remove(type), 500);
}

// Pay for something. Returns false if he can't afford it.
function spendMoney(amount) {
  if (money < amount) return false;
  money -= amount;
  updateMoneyDisplay();
  flashMoney("spend");
  return true;
}

// Earn money from a job or a win
function earnMoney(amount) {
  money += amount;
  updateMoneyDisplay();
  flashMoney("earn");
}

updateMoneyDisplay();

// TEST KEYS (remove later): M = spend ₦500, N = earn ₦1,000
window.addEventListener("keydown", (e) => {
  const key = e.key.toLowerCase();
  if (key === "m" && !spendMoney(500)) console.log("Not enough money!");
  if (key === "n") earnMoney(1000);
});
