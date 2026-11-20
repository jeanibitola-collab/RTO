import * as THREE from "three";
import "./style.css";
import { buildLagos, ROUNDABOUTS } from "./lagos.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";
import { buildRoom } from "./room.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

// ---------- Scene, camera, renderer ----------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xe8c48f); // harmattan haze
scene.fog = new THREE.Fog(0xe8c48f, 40, 160);

const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.25, // nearest it can see (a little further = sharper depth, less flicker)
  300, // furthest it can see (the fog hides everything past about 160 m anyway)
);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
document.body.appendChild(renderer.domElement);

// More natural colours and soft, bouncing light (like light reflecting off walls)
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.75; // a little darker, less washed out
renderer.shadowMap.enabled = true; // turn on shadows
renderer.shadowMap.type = THREE.PCFSoftShadowMap; // soft-edged shadows
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

// ---------- Lights ----------
const skyLight = new THREE.HemisphereLight(0xfff2d6, 0x8a5a3c, 1.5);
scene.add(skyLight);
const sun = new THREE.DirectionalLight(0xffffff, 2);
sun.position.set(30, 50, 20);
scene.add(sun);

// ---------- Build Lagos ----------
const lagos = buildLagos(scene);
const room = buildRoom(scene);
let inRoom = true; // the game starts in his room
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
      if (bus.name) continue; // kekes and big buses get their own model
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

// ---------- Other rides you can board: kekes and big buses ----------
const RIDES = {
  keke: {
    model: "/models/keke.glb",
    count: 6,
    length: 2.8,
    width: 1.4,
    speed: 9,
    seats: 3,
    fare: 300,
    turnFix: 0,
    color: 0xfbc02d,
    lift: 0,
    call: (stop) => `Keke man: "${stop}? Enter, enter!"`,
  },
  bus: {
    model: "/models/bus.glb",
    count: 4,
    length: 6,
    width: 2.1,
    speed: 13,
    seats: 14,
    fare: 600,
    turnFix: 0,
    color: 0xeeeeee,
    lift: 0,
    call: (stop) => `Conductor: "${stop}! ${stop}! Coaster dey go, enter!"`,
  },
};

for (const [name, ride] of Object.entries(RIDES)) {
  const made = [];
  for (let i = 0; i < ride.count; i++) {
    const vehicle = new THREE.Group();
    vehicle.name = name; // 'keke' or 'bus'
    const placeholder = new THREE.Mesh(
      new THREE.BoxGeometry(ride.width, 1.8, ride.length),
      new THREE.MeshStandardMaterial({ color: ride.color }),
    );
    placeholder.position.y = 1;
    vehicle.add(placeholder);
    scene.add(vehicle);
    // Slot it in at a random place among the danfos, so they're spread along the route
    buses.splice(Math.floor(Math.random() * (buses.length + 1)), 0, vehicle);
    made.push(vehicle);
  }

  // Load the real model, size it, and give each vehicle of this kind a copy
  loader.load(
    ride.model,
    (gltf) => {
      const model = gltf.scene;
      model.rotation.y = ride.turnFix;
      model.traverse((obj) => {
        if (obj.isMesh) {
          const mats = Array.isArray(obj.material)
            ? obj.material
            : [obj.material];
          mats.forEach((m) => {
            m.metalness = Math.min(m.metalness ?? 0, 0.3);
          });
        }
      });
      let box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      model.scale.multiplyScalar(ride.length / Math.max(size.x, size.z));
      box = new THREE.Box3().setFromObject(model);
      const center = box.getCenter(new THREE.Vector3());
      model.position.x -= center.x;
      model.position.z -= center.z;
      model.position.y -= box.min.y;

      for (const v of made) {
        v.children.forEach((child) => {
          if (!child.userData.isSeat) child.visible = false;
        });
        v.add(model.clone());
      }
    },
    undefined,
    (error) => console.error("Could not load", ride.model, error),
  );
}

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
const SIT_LIFT = 0.1; // raises him to the height of the bed (adjust if he floats or sinks)
player.position.set(room.sitSpot.x, SIT_LIFT, room.sitSpot.z); // sitting on the bed
player.rotation.y = room.sitSpot.rotation;
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
        obj.castShadow = true; // he casts a shadow in his room
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
    // Start sitting on the bed, or standing beside it if there's no sitting animation
    if (playerState === "sitting") {
      if (playerActions["sit"]) {
        playAction("sit");
      } else {
        playerState = "free";
        player.position.set(room.spawn.x, 0, room.spawn.z);
        player.rotation.y = room.spawn.rotation;
      }
    }
  },
  undefined,
  (error) => {
    console.error("Could not load player.glb:", error);
  },
);

// ---------- Controls ----------
const ON_TOUCH =
  window.matchMedia("(pointer: coarse)").matches || "ontouchstart" in window;
const keys = {};
let joyX = 0; // joystick left/right, from -1 to 1 (0 when not touched)
let joyY = 0; // joystick up/down, from -1 to 1
window.addEventListener("keydown", (e) => {
  keys[e.key.toLowerCase()] = true;
});
window.addEventListener("keyup", (e) => {
  keys[e.key.toLowerCase()] = false;
});

const UP = new THREE.Vector3(0, 1, 0);
const PLAYER_RADIUS = 0.7;
const ROOM_RADIUS = 0.35; // smaller collision circle indoors, where things are close together
// ---------- Sitting on the bed at the start ----------
let playerState = "sitting"; // 'sitting' → 'standingUp' → 'free'
let standTimer = 0;
let standDuration = 1;
const STAND_FORWARD = 0.5; // how far he moves off the bed while standing up

function startStandingUp() {
  if (playerState !== "sitting") return;
  const standup = playerActions["standup"];
  if (!standup) {
    // No stand-up animation: just stand
    playerState = "free";
    player.position.y = 0;
    return;
  }
  playerState = "standingUp";
  standup.setLoop(THREE.LoopOnce, 1);
  standup.clampWhenFinished = true;
  playAction("standup");
  standDuration = standup.getClip().duration;
  standTimer = standDuration;
}
let currentBus = null; // the bus he's riding, or null when on foot
let boardCooldown = 0; // seconds before he can board again after getting off

// ---------- Bus collisions ----------
// Each danfo can face any direction, so we check in its own "local" space
const DANFO_HALF_WIDTH = 1.3;
const DANFO_HALF_LENGTH = DANFO_LENGTH / 2 + 0.2;

function hitsBus(bus, x, z, r) {
  const halfW = bus.userData.halfW ?? DANFO_HALF_WIDTH; // each vehicle has its own size
  const halfL = bus.userData.halfL ?? DANFO_HALF_LENGTH;
  const dx = x - bus.position.x;
  const dz = z - bus.position.z;
  const angle = bus.rotation.y;
  const localX = dx * Math.cos(angle) - dz * Math.sin(angle);
  const localZ = dx * Math.sin(angle) + dz * Math.cos(angle);
  return Math.abs(localX) < halfW + r && Math.abs(localZ) < halfL + r;
}

function hitsAnyBus(x, z, r) {
  return (
    buses.some((bus) => hitsBus(bus, x, z, r)) ||
    traffic.some((v) => hitsBus(v, x, z, r))
  );
}

// Move an object, sliding along walls instead of passing through them
function tryMove(obj, dx, dz, radius, avoidBuses = false) {
  // If a bus has driven onto him, let him walk out of it
  const insideBus =
    avoidBuses && hitsAnyBus(obj.position.x, obj.position.z, radius);
  const checkBuses = avoidBuses && !insideBus;

  const blocked = (x, z) =>
    (inRoom ? room.isBlocked(x, z, radius) : lagos.isBlocked(x, z, radius)) ||
    (checkBuses && hitsAnyBus(x, z, radius));

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

// ---------- Joystick feel ----------
const STICK_DEAD_ZONE = 0.2; // ignore small movements near the centre
const TOUCH_TURN_FACTOR = 0.6; // turn slower on the joystick than on the keyboard

// Gives fine control near the centre and full speed at the edge
function stickCurve(value) {
  const amount = Math.abs(value);
  if (amount < STICK_DEAD_ZONE) return 0;
  const scaled = (amount - STICK_DEAD_ZONE) / (1 - STICK_DEAD_ZONE);
  return Math.sign(value) * scaled * scaled;
}

// ---------- Safety net: never let him get stuck inside something ----------
// If he's inside furniture, a wall or a building, move him to the nearest free spot
function unstickPlayer() {
  const r = inRoom ? ROOM_RADIUS : PLAYER_RADIUS;
  const blockedAt = (x, z) =>
    inRoom ? room.isBlocked(x, z, r) : lagos.isBlocked(x, z, r);
  if (!blockedAt(player.position.x, player.position.z)) return; // not stuck

  // Search in growing circles around him for the closest free spot
  for (let dist = 0.1; dist <= 3; dist += 0.1) {
    for (let i = 0; i < 16; i++) {
      const angle = (i / 16) * Math.PI * 2;
      const x = player.position.x + Math.sin(angle) * dist;
      const z = player.position.z + Math.cos(angle) * dist;
      if (!blockedAt(x, z)) {
        player.position.x = x;
        player.position.z = z;
        return;
      }
    }
  }
}

function updatePlayer(dt) {
  const forward = keys["arrowup"] || keys["w"];
  const back = keys["arrowdown"] || keys["s"];
  const left = keys["arrowleft"] || keys["a"];
  const right = keys["arrowright"] || keys["d"];
  const running = keys["shift"];
  const moveSpeed = running ? RUN_SPEED : WALK_SPEED;

  // Sitting on the bed: only the Get up button (or E) makes him stand
  if (playerState === "sitting") {
    playAction("sit");
    // Stay exactly on the bed's edge (it moves once the real bed has loaded)
    player.position.set(room.sitSpot.x, SIT_LIFT, room.sitSpot.z);
    player.rotation.y = room.sitSpot.rotation;
    return;
  }

  // Standing up: play the animation, lower him to the floor, and step off the bed
  if (playerState === "standingUp") {
    standTimer -= dt;
    player.position.y = SIT_LIFT * Math.max(0, standTimer / standDuration);
    const step = (STAND_FORWARD * dt) / standDuration;
    player.position.x += Math.sin(player.rotation.y) * step;
    player.position.z += Math.cos(player.rotation.y) * step;
    if (standTimer <= 0) {
      playerState = "free";
      player.position.y = 0;
      // Make sure he's completely clear of the bed before he can walk
      for (
        let i = 0;
        i < 40 &&
        room.isBlocked(player.position.x, player.position.z, ROOM_RADIUS);
        i++
      ) {
        player.position.x += Math.sin(player.rotation.y) * 0.05;
        player.position.z += Math.cos(player.rotation.y) * 0.05;
      }
    }
    return;
  }

  // Free to move: first make sure he isn't stuck inside anything
  unstickPlayer();

  let turn = (left ? 1 : 0) - (right ? 1 : 0);
  let move = (forward ? 1 : 0) - (back ? 0.5 : 0); // walking backwards is slower

  // Joystick: gentle and gradual (push further to turn or walk faster)
  if (joyX !== 0 || joyY !== 0) {
    turn = -stickCurve(joyX) * TOUCH_TURN_FACTOR;
    move = -stickCurve(joyY);
    if (move < 0) move *= 0.5; // stepping back is slower
  }

  player.rotation.y += turn * PLAYER_TURN_SPEED * dt;
  const dx = Math.sin(player.rotation.y) * move * moveSpeed * dt;
  const dz = Math.cos(player.rotation.y) * move * moveSpeed * dt;
  tryMove(player, dx, dz, inRoom ? ROOM_RADIUS : PLAYER_RADIUS, true);

  // Pick the right animation
  if (move !== 0) {
    // Slower walking plays the animation slower, so his feet match
    playAction(
      running ? "run" : "walk",
      Math.sign(move) * Math.max(0.5, Math.abs(move)),
    );
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

// ---------- Driving round a roundabout (keeping the middle on the left) ----------
const RB_LANE_RADIUS = 11; // the circle the danfos drive round on
const RB_LANE_SHIFT = 2.5; // the same as driving on the right-hand side of the road

// The points a danfo drives through to go round a roundabout:
// arriving in direction inDir, leaving in direction outDir (each [x, z])
function roundabout(rb, inDir, outDir) {
  const right = ([fx, fz]) => [-fz, fx];
  const [irx, irz] = right(inDir);
  const [orx, orz] = right(outDir);
  const entryAngle = Math.atan2(
    -inDir[1] * RB_LANE_RADIUS + irz * RB_LANE_SHIFT,
    -inDir[0] * RB_LANE_RADIUS + irx * RB_LANE_SHIFT,
  );
  let exitAngle = Math.atan2(
    outDir[1] * RB_LANE_RADIUS + orz * RB_LANE_SHIFT,
    outDir[0] * RB_LANE_RADIUS + orx * RB_LANE_SHIFT,
  );
  while (exitAngle >= entryAngle) exitAngle -= Math.PI * 2; // always go round the same way

  const points = [];
  for (let a = entryAngle; a > exitAngle; a -= 0.4) {
    points.push({
      x: rb.x + Math.cos(a) * RB_LANE_RADIUS,
      z: rb.z + Math.sin(a) * RB_LANE_RADIUS,
      noLane: true,
    });
  }
  points.push({
    x: rb.x + Math.cos(exitAngle) * RB_LANE_RADIUS,
    z: rb.z + Math.sin(exitAngle) * RB_LANE_RADIUS,
    noLane: true,
  });
  return points;
}

const YABA_RB = ROUNDABOUTS[0];
const OBALENDE_RB = ROUNDABOUTS[1];

// A loop that only ever drives forward, going round the roundabouts
const DANFO_ROUTE = [
  { x: -30, z: 40, stop: "Ikeja" }, // well clear of Yaba Roundabout
  ...roundabout(YABA_RB, [-1, 0], [0, 1]), // round Yaba Roundabout, then up the avenue
  { x: -60, z: 125 }, // along the Ikeja road
  { x: 0, z: 125 }, // down the link road
  { x: 0, z: 40 }, // towards the bridge
  ...roundabout(OBALENDE_RB, [1, 0], [0, 1]), // over the bridge, round Obalende Roundabout, towards Marina
  { x: 120, z: 110, stop: "Marina" },
  { x: 120, z: 150 }, // along the north road
  { x: 180, z: 150 }, // down the east road
  { x: 180, z: -130 }, // along the Lekki road
  { x: 120, z: -130 }, // up the Island road
  { x: 120, z: -115, stop: "Lekki" },
  ...roundabout(OBALENDE_RB, [0, 1], [-1, 0]), // round Obalende Roundabout, back towards the bridge
];

const BUS_GAP = 8; // a bus stops if another bus is this close ahead (metres)
const BUS_SPEED = 14; // metres per second, about 50 km/h
const BUS_WAIT = 8; // seconds at each stop
const LANE_OFFSET = 2.5; // drive on the right-hand side of the road
const DANFO_FARE = 500; // naira

// Each ride's own seats, fare and driver's call (danfos use the danfo values)
const seatsOf = (bus) => bus.userData.seats ?? BUS_SEATS;
const fareOf = (bus) => bus.userData.fare ?? DANFO_FARE;
function rideCall(bus, stop) {
  const ride = RIDES[bus.name];
  return ride
    ? ride.call(stop)
    : `Conductor: "${stop}! ${stop}! Enter with your change!"`;
}

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
  const start = pointAlongRoute((i / buses.length) * routeTotal);
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

// Kekes and big buses: their own seats, fare, speed and size, and no danfo seat figures
for (const bus of buses) {
  const ride = RIDES[bus.name];
  if (!ride) continue; // a danfo
  bus.userData.seatGroup.clear();
  bus.userData.seatFigures = [];
  Object.assign(bus.userData, {
    seats: ride.seats,
    fare: ride.fare,
    speed: ride.speed * (0.9 + Math.random() * 0.2),
    halfW: ride.width / 2,
    halfL: ride.length / 2,
    passengers: Math.floor(Math.random() * ride.seats * 0.6),
  });
}

// ---------- Traffic: is there another bus close ahead in the same lane? ----------
function busAhead(bus) {
  return vehicleAhead(bus); // danfos now queue behind cars and trucks too
}

// ================= Traffic: cars, jeeps and trucks =================
// They drive the same roads as the danfos, but never stop at bus stops
const TRAFFIC_TYPES = [
  {
    name: "sedan",
    model: "/models/sedan.glb",
    length: 4.5,
    width: 1.8,
    count: 6,
    speed: 16,
    turnFix: 0,
    color: 0x1e88e5,
  },
  {
    name: "jeep",
    model: "/models/jeep.glb",
    length: 4.8,
    width: 1.9,
    count: 4,
    speed: 15,
    turnFix: 0,
    color: 0x424242,
  },
  {
    name: "truck",
    model: "/models/truck.glb",
    length: 8,
    width: 2.4,
    count: 2,
    speed: 9,
    turnFix: 0,
    color: 0xc62828,
  },
];
const traffic = [];

TRAFFIC_TYPES.forEach((type) => {
  // A simple coloured box for each vehicle, until its real model loads
  for (let i = 0; i < type.count; i++) {
    const vehicle = new THREE.Group();
    const placeholder = new THREE.Mesh(
      new THREE.BoxGeometry(type.width, 1.6, type.length),
      new THREE.MeshStandardMaterial({ color: type.color }),
    );
    placeholder.position.y = 0.9;
    vehicle.add(placeholder);
    vehicle.userData = {
      type: type.name,
      speed: type.speed * (0.9 + Math.random() * 0.2), // each driver a little faster or slower
      halfW: type.width / 2,
      halfL: type.length / 2,
      routeIndex: 0,
    };
    scene.add(vehicle);
    traffic.push(vehicle);
  }

  // Load the real model, size it, and give every vehicle of this type a copy
  loader.load(
    type.model,
    (gltf) => {
      const model = gltf.scene;
      model.rotation.y = type.turnFix;
      model.traverse((obj) => {
        if (obj.isMesh) {
          const mats = Array.isArray(obj.material)
            ? obj.material
            : [obj.material];
          mats.forEach((m) => {
            m.metalness = Math.min(m.metalness ?? 0, 0.3);
          }); // not too shiny or black
        }
      });

      let box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      model.scale.multiplyScalar(type.length / Math.max(size.x, size.z));
      box = new THREE.Box3().setFromObject(model);
      const center = box.getCenter(new THREE.Vector3());
      model.position.x -= center.x;
      model.position.z -= center.z;
      model.position.y -= box.min.y;

      for (const v of traffic) {
        if (v.userData.type !== type.name) continue;
        v.children.forEach((child) => {
          if (!child.userData.isSeat) child.visible = false; // keep the driver
        });
        v.add(model.clone());
      }
    },
    undefined,
    (error) => console.error("Could not load", type.model, error),
  );
});

// Spread the traffic along the route, between the danfos
traffic.forEach((v, i) => {
  const start = pointAlongRoute(((i + 0.5) / traffic.length) * routeTotal);
  v.position.set(
    start.x - Math.cos(start.angle) * LANE_OFFSET,
    0,
    start.z + Math.sin(start.angle) * LANE_OFFSET,
  );
  v.rotation.y = start.angle;
  v.userData.routeIndex = start.nextIndex;
});

const allVehicles = buses.concat(traffic);

// Is any vehicle close ahead in the same lane? (works for danfos, cars and trucks)
function vehicleAhead(v) {
  const fx = Math.sin(v.rotation.y);
  const fz = Math.cos(v.rotation.y);
  const myHalf = v.userData.halfL ?? DANFO_LENGTH / 2;
  for (const other of allVehicles) {
    if (other === v) continue;
    const dx = other.position.x - v.position.x;
    const dz = other.position.z - v.position.z;
    const ahead = dx * fx + dz * fz; // how far in front
    const side = Math.abs(dx * fz - dz * fx); // how far to the side
    const sameWay =
      Math.sin(other.rotation.y) * fx + Math.cos(other.rotation.y) * fz > 0.3;
    const gap = myHalf + (other.userData.halfL ?? DANFO_LENGTH / 2) + 2.5; // bumper to bumper, plus a little space
    if (sameWay && ahead > 0 && ahead < gap && side < 1.8) return true;
  }
  return false;
}

// Drive a car or truck along the route (it never stops at bus stops)
function updateTrafficVehicle(v, dt) {
  const target = laneTarget(v);
  const dx = target.x - v.position.x;
  const dz = target.z - v.position.z;
  const dist = Math.hypot(dx, dz);

  if (dist < 3) {
    v.userData.routeIndex = (v.userData.routeIndex + 1) % DANFO_ROUTE.length;
    return;
  }
  if (vehicleAhead(v)) return; // wait in traffic

  const desired = Math.atan2(dx, dz);
  let diff = desired - v.rotation.y;
  diff = Math.atan2(Math.sin(diff), Math.cos(diff));
  v.rotation.y += diff * Math.min(1, 2.5 * dt);

  const step = v.userData.speed * (Math.abs(diff) > 0.4 ? 0.25 : 1) * dt;
  v.position.x += Math.sin(v.rotation.y) * step;
  v.position.z += Math.cos(v.rotation.y) * step;

  // On the bridge, always stay on your own side of the middle barrier
  if (v.position.x > 20 && v.position.x < 60) {
    const keep = 0.3 + v.userData.halfW + 0.1;
    const headingWest = Math.sin(v.rotation.y) < 0;
    v.position.z = headingWest
      ? Math.min(v.position.z, 40 - keep)
      : Math.max(v.position.z, 40 + keep);
  }
}

// ---------- Real passenger models ----------
const PASSENGER_MODELS = [
  "/models/passenger-dansiki.glb",
  "/models/passenger-marketwoman.glb",
  "/models/passenger-office.glb",
  "/models/passenger-streetboy.glb",
];
const PASSENGER_HEIGHT = 1.5; // how tall a seated passenger is, in metres
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

// ---------- A driver in every vehicle ----------
// Where he sits in each kind of vehicle (metres): x = left/right, z = forward/back, floor = seat height
const DRIVER_SEATS = {
  danfo: { x: DRIVER_SEAT[0], z: 1.8, floor: PASSENGER_FLOOR, scale: 1.3 },
  keke: { x: 0, z: 0.8, floor: 0.35, scale: 1.0 },
  bus: { x: 0.55, z: 2.0, floor: 0.55, scale: 1.3 },
  sedan: { x: 0.38, z: 0.5, floor: 0.2, scale: 1.05 },
  jeep: { x: 0.42, z: 0.7, floor: 0.45, scale: 1.3 },
  truck: { x: 0.55, z: 3.0, floor: 1.1, scale: 1.5 },
};
const DRIVER_SCALE = 1.3; // how much bigger the drivers are than the passengers
const drivers = [];
const kindOf = (v) => v.userData.type || v.name || "danfo";

loader.load(
  "/models/driver.glb",
  (gltf) => {
    const template = preparePassenger(bakePose(gltf, "/models/driver.glb")); // frozen in his driving pose
    allVehicles.forEach((v, i) => {
      const seat = DRIVER_SEATS[kindOf(v)];
      if (!seat) return;
      const driver = template.clone();
      const scale = seat.scale ?? DRIVER_SCALE; // this vehicle's driver size
      driver.scale.setScalar(scale);
      if (typeof varyLook === "function") varyLook(driver); // a different shirt colour, if the colour helper exists
      driver.position.set(seat.x, seat.floor - PASSENGER_FLOOR * scale, seat.z);
      driver.userData.isSeat = true; // so the vehicle loaders don't hide him
      v.add(driver);
      drivers.push({ vehicle: v, driver });

      // In the danfos, he replaces the passenger who was sitting at the wheel
      if (kindOf(v) === "danfo") {
        const oldDriver = v.userData.seatGroup?.children.at(-1);
        if (oldDriver) oldDriver.visible = false;
      }
    });
    console.log("Drivers placed:", drivers.length);
  },
  undefined,
  (error) => console.error("Could not load driver.glb", error),
);

// The point a vehicle is driving towards, shifted onto the right-hand lane.
// At corners, it's where the lane you're leaving meets the lane you're joining.
function laneTarget(bus) {
  const len = DANFO_ROUTE.length;
  const i = bus.userData.routeIndex;
  const target = DANFO_ROUTE[i];
  if (target.noLane) return target; // roundabout points are already in the right place

  const prev = DANFO_ROUTE[(i - 1 + len) % len];
  const next = DANFO_ROUTE[(i + 1) % len];
  const unit = (ax, az, bx, bz) => {
    const d = Math.hypot(bx - ax, bz - az) || 1;
    return [(bx - ax) / d, (bz - az) / d];
  };
  const [inX, inZ] = unit(prev.x, prev.z, target.x, target.z); // the way in
  const [outX, outZ] = unit(target.x, target.z, next.x, next.z); // the way out

  // Keep to the right of the way in
  let offsetX = -inZ * LANE_OFFSET;
  let offsetZ = inX * LANE_OFFSET;

  // Turning a corner? Also move across to the right of the way out
  const turning = inX * outX + inZ * outZ < 0.85; // more than about 30 degrees
  if (turning) {
    offsetX += -outZ * LANE_OFFSET;
    offsetZ += outX * LANE_OFFSET;
  }

  return { x: target.x + offsetX, z: target.z + offsetZ, stop: target.stop };
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
  d.passengers = Math.min(seatsOf(bus) - playerSeat, d.passengers + getOn);
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
  const step = (d.speed ?? BUS_SPEED) * (sharpTurn ? 0.25 : 1) * dt;
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
    for (const side of [-2.2, 2.2]) {
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
        stopRadio();
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
    if (bus.userData.passengers >= seatsOf(bus)) {
      showMessage("This danfo is full! Wait for the next one.", 2.5);
      return;
    }
    if (!spendMoney(fareOf(bus))) {
      showMessage(`You need ₦${fareOf(bus)} for the fare`, 2.5);
      return;
    }
    currentBus = bus;
    player.visible = false;
    startRadio(); // the driver's music comes on
    updateSeatFigures(bus);
    showMessage(`Paid ₦${fareOf(bus)}. Next stop: ${nextStopName(bus)}`, 2.5);
  }
});
// ---------- Passers-by and bus-goers ----------
const NPC_MODELS = [
  "/models/npc-office.glb",
  "/models/npc-marketwoman.glb",
  "/models/npc-dansiki.glb",
  "/models/npc-police.glb",
  "/models/npc-streetboy.glb",
  "/models/npc-seller.glb",
  "/models/npc-artisan.glb",
];
const PEDESTRIAN_COUNT = 50; // how many people walk the streets
const NPC_HEIGHT = 1.7; // metres
const NPC_TURN_FIX = 0; // change to Math.PI if they walk backwards
const SIDEWALK_OFFSET = 6; // how far from the middle of the road they walk
const MAX_WAITING = 4; // most people waiting at one bus stop
const JOIN_STOP_CHANCE = 0.2; // chance per second that a walker passing a stop waits there

// The middle line of each road: [x1, z1, x2, z2]
const ROAD_LINES = [
  [-180, 40, 15, 40], // mainland road to the bridge
  [-60, -180, -60, 180], // mainland avenue
  [-180, 125, 15, 125], // Ikeja road
  [-180, -70, 15, -70], // Yaba road
  [65, 40, 185, 40], // Island road from the bridge
  [120, -140, 120, 160], // Island north-south road
  [65, -130, 185, -130], // Lekki road
  [0, 40, 0, 125], // mainland link road
  [120, 150, 180, 150], // Island north road
  [180, -130, 180, 150], // Island east road
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
    x: point.x + rightX * 6.2,
    z: point.z + rightZ * 6.2,
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
    seatsOf(bus) -
    d.passengers -
    (d.boarding || 0) -
    (currentBus === bus ? 1 : 0)
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
    const back = -0.3 + Math.random() * 0.9; // some at the kerb's edge, some under the shelter
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

  const sameColour = hueGap < 1.0; // colours too close
  const bothLight = a.look.brightness > 1 && b.look.brightness > 1; // both light shades
  const sameShade = shadeGap < 0.12; // shades too close
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
  // Faster walkers step faster, so their feet don't slide
  const NPC_WALK_PACE = 1.3; // the walking speed (m/s) the animation was made for

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

  if (actions.walk) actions.walk.timeScale = p.speed / NPC_WALK_PACE;

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
            seatsOf(bus),
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

const signMaterial = new THREE.MeshStandardMaterial({
  color: 0x1565c0,
  alphaTest: 0.5,
  side: THREE.FrontSide, // each face only shows from its own side
});

new THREE.TextureLoader().load("/textures/busstop-sign.png", (tex) => {
  tex.colorSpace = THREE.SRGBColorSpace;
  signMaterial.map = tex;
  signMaterial.color.set(0xffffff);
  signMaterial.needsUpdate = true;
});

for (const stop of BUS_STOPS) {
  const sign = new THREE.Group();

  // Front face, readable from the road
  const front = new THREE.Mesh(new THREE.PlaneGeometry(1, 3), signMaterial);
  sign.add(front);

  // Back face, turned round so it also reads the right way from behind
  const back = new THREE.Mesh(new THREE.PlaneGeometry(1, 3), signMaterial);
  back.rotation.y = Math.PI;
  back.position.z = -0.01; // a hair behind the front, so they don't flicker
  sign.add(back);

  sign.position.set(
    stop.x - Math.sin(stop.faceRoad) * 0.9 + stop.alongX * 3, // just behind the waiting area, to one side
    1.5,
    stop.z - Math.cos(stop.faceRoad) * 0.9 + stop.alongZ * 3,
  );
  sign.rotation.y = stop.faceRoad; // facing the road
  scene.add(sign);
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

// ================= Sound =================
const listener = new THREE.AudioListener();
camera.add(listener); // we hear the world from the camera
const audioLoader = new THREE.AudioLoader();
const sounds = {}; // loaded sound files, by name

const SOUND_FILES = [
  "city-ambience",
  "room-ambience",
  "tv-football",
  "danfo-engine",
  "danfo-horn",
  "generator",
  "kiosk-music",
  "pay",
  "door",
];
SOUND_FILES.forEach((name) => {
  audioLoader.load(
    `/sounds/${name}.mp3`,
    (buffer) => {
      sounds[name] = buffer;
    },
    undefined,
    () => console.warn("Could not load sound", name),
  );
});

// Phones only allow sound after the first touch or key press
let soundStarted = false;
function startSound() {
  if (soundStarted) return;
  soundStarted = true;
  listener.context.resume();
}
window.addEventListener("pointerdown", startSound);
window.addEventListener("keydown", startSound);

// Start a looping sound if its file has loaded, or stop one
function ensurePlaying(audio, name) {
  if (!soundStarted || !sounds[name]) return;
  if (!audio.buffer) audio.setBuffer(sounds[name]);
  if (!audio.isPlaying) audio.play();
}
function ensureStopped(audio) {
  if (audio.isPlaying) audio.stop();
}

// Play a short sound once (paying, the door)
function playOnce(name, volume = 0.8) {
  if (!soundStarted || !sounds[name]) return;
  const sound = new THREE.Audio(listener);
  sound.setBuffer(sounds[name]);
  sound.setVolume(volume);
  sound.play();
}

// ---------- Background loops (the same everywhere) ----------
function makeLoop(name, volume) {
  const audio = new THREE.Audio(listener);
  audio.setLoop(true);
  audio.setVolume(0);
  return { audio, name, volume };
}
const loops = {
  city: makeLoop("city-ambience", 0.5),
  room: makeLoop("room-ambience", 0.4),
  tv: makeLoop("tv-football", 0.15),
};

// Fade a loop in or out smoothly
function fadeLoop(loop, on, dt) {
  ensurePlaying(loop.audio, loop.name);
  const current = loop.audio.getVolume();
  const target = on ? loop.volume : 0;
  loop.audio.setVolume(current + (target - current) * Math.min(1, dt * 2));
}

// ---------- Sounds that come from a place (louder when you're close) ----------
function makePositional(name, closeDistance, volume, loop = true) {
  const audio = new THREE.PositionalAudio(listener);
  audio.setRefDistance(closeDistance); // full volume within this distance
  audio.setRolloffFactor(1.5); // how quickly it fades with distance
  audio.setVolume(volume);
  audio.setLoop(loop);
  const holder = new THREE.Object3D();
  holder.add(audio);
  scene.add(holder);
  return { audio, holder, name, target: null };
}

// Only a few of each play at once: the nearest ones
const enginePool = [0, 1, 2, 3].map(() =>
  makePositional("danfo-engine", 4, 0.6),
);
const hornPool = [0, 1].map(() => makePositional("danfo-horn", 6, 0.8, false));
const generatorPool = [0, 1, 2].map(() => makePositional("generator", 3, 0.5));
const kioskPool = [0, 1].map(() => makePositional("kiosk-music", 3, 0.5));
const musicKiosks = lagos.kioskSpots.filter((_, i) => i % 3 === 0); // one in three kiosks plays music

// Point a pool of sounds at the nearest few places
function assignNearest(pool, spots, maxDistance) {
  const from = camera.position;
  const nearest = spots
    .map((s) => ({ s, d: Math.hypot(s.x - from.x, s.z - from.z) }))
    .filter((e) => e.d < maxDistance)
    .sort((a, b) => a.d - b.d)
    .slice(0, pool.length);
  pool.forEach((slot, i) => {
    const entry = nearest[i];
    if (entry) {
      slot.target = entry.s;
      slot.holder.position.set(entry.s.x, 1, entry.s.z);
      ensurePlaying(slot.audio, slot.name);
    } else {
      slot.target = null;
      ensureStopped(slot.audio);
    }
  });
}

// ---------- Update all sound, every frame ----------
let soundCheckTimer = 0;
let hornTimer = 5;

function updateSound(dt) {
  if (!soundStarted) return;

  // Street noise outside, fan and TV inside
  fadeLoop(loops.city, !inRoom, dt);
  fadeLoop(loops.room, inRoom, dt);
  fadeLoop(loops.tv, inRoom, dt);

  // Twice a second, find the nearest engines, generators and kiosks
  soundCheckTimer -= dt;
  if (soundCheckTimer <= 0) {
    soundCheckTimer = 0.5;
    const busSpots = inRoom
      ? []
      : allVehicles.map((b) => ({ x: b.position.x, z: b.position.z, bus: b }));
    assignNearest(enginePool, busSpots, 45);
    assignNearest(generatorPool, inRoom ? [] : lagos.generatorSpots, 30);
    // No kiosk music in his room, or while riding (the danfo radio is playing)
    assignNearest(kioskPool, inRoom || currentBus ? [] : musicKiosks, 25);
  }

  // Engine sounds follow their buses as they drive
  for (const slot of enginePool) {
    if (slot.target && slot.target.bus) {
      slot.holder.position.copy(slot.target.bus.position).setY(1);
    }
  }

  // Now and then, a nearby moving danfo sounds its horn
  hornTimer -= dt;
  if (hornTimer <= 0 && !inRoom) {
    hornTimer = 6 + Math.random() * 10;
    const nearby = buses.filter(
      (b) => !b.userData.stop && b.position.distanceTo(camera.position) < 50,
    );
    const slot = hornPool.find((s) => !s.audio.isPlaying);
    if (nearby.length && slot && sounds["danfo-horn"]) {
      const bus = nearby[Math.floor(Math.random() * nearby.length)];
      slot.holder.position.copy(bus.position).setY(1);
      if (!slot.audio.buffer) slot.audio.setBuffer(sounds["danfo-horn"]);
      slot.audio.play();
    }
  }
}

// ---------- Danfo radio: shuffled music whenever you're riding ----------
// Give each track a title (you can make these up, like a real radio station)
const RADIO_STATION = "Danfo FM";
const RADIO_TRACKS = [
  { file: "/sounds/radio/radio-1.mp3", title: "Lagos Groove" },
  { file: "/sounds/radio/radio-2.mp3", title: "Highlife Sunday" },
  { file: "/sounds/radio/radio-3.mp3", title: "Amapiano Nights" },
  { file: "/sounds/radio/radio-4.mp3", title: "Owambe Vibes" },
  { file: "/sounds/radio/radio-5.mp3", title: "Third Mainland Drive" },
  { file: "/sounds/radio/radio-6.mp3", title: "Morning Praise" },
];
const RADIO_VOLUME = 0.6;

const radio = new Audio(); // streams the song, so it doesn't load all of it at once
radio.volume = RADIO_VOLUME;
let radioOrder = [];
let radioIndex = 0;

// Mix up the order of the songs (a fair shuffle)
function shuffleRadio() {
  radioOrder = RADIO_TRACKS.map((_, i) => i);
  for (let i = radioOrder.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [radioOrder[i], radioOrder[j]] = [radioOrder[j], radioOrder[i]];
  }
  radioIndex = 0;
}

function playNextTrack(showTitleAfter = 0) {
  if (radioIndex >= radioOrder.length) shuffleRadio(); // played them all: shuffle again
  const track = RADIO_TRACKS[radioOrder[radioIndex++]];
  radio.src = track.file;
  radio.play().catch(() => {}); // ignore if the phone hasn't allowed sound yet
  setTimeout(() => {
    if (currentBus) showMessage(`📻 ${RADIO_STATION} · ${track.title}`, 3);
  }, showTitleAfter);
}

// When a song ends, play the next one
radio.addEventListener("ended", () => {
  if (currentBus) playNextTrack();
});

function startRadio() {
  shuffleRadio();
  playNextTrack(2600); // wait until the "Paid" message has shown before naming the song
}

function stopRadio() {
  radio.pause();
}

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
    const hitsSomething = inRoom
      ? room.hitsWall(x, z, 0.3)
      : lagos.hitsBuilding(x, z, 0.3);
    if (hitsSomething || (avoidBuses && hitsAnyBus(x, z, 0.3))) {
      safeDistance = Math.max(d - 0.5, inRoom ? 0.6 : 1.5); // closer indoors, so it never ends up in a wall
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
camera.position.set(player.position.x, 2.2, player.position.z - 2); // inside his room

// ---------- Game loop ----------
const hud = document.getElementById("hud");
const messageBox = document.getElementById("message");
const clock = new THREE.Clock();

// ---------- FPS counter ----------
const fpsDisplay = document.getElementById("fps");
let fpsFrames = 0;
let fpsTime = 0;

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  // Count frames, and update the FPS display once a second
  fpsFrames++;
  if (performance.now() - (window.lastFpsUpdate || 0) > 1000) {
    fpsDisplay.textContent = `FPS: ${fpsFrames}`;
    fpsFrames = 0;
    window.lastFpsUpdate = performance.now();
  }
  if (playerMixer) playerMixer.update(dt);
  keepPlayerCentred();
  for (const bus of buses) updateBus(bus, dt); // the danfos drive themselves
  for (const v of traffic) updateTrafficVehicle(v, dt); // cars, jeeps and trucks
  for (const { vehicle, driver } of drivers) {
    driver.visible = vehicle.position.distanceTo(camera.position) < 60;
  }
  updatePedestrians(dt); // passers-by walk along the footpaths
  lagos.update(dt); // the lagoon and ocean drift
  updateSound(dt); // street noise, engines, horns, generators, music
  if (inRoom) room.update(dt); // the fan spins

  // Indoors is darker than outdoors
  const INDOOR_LIGHT = 0.3; // lower = darker room, higher = brighter (0 to 1)
  skyLight.intensity = inRoom ? 1.5 * INDOOR_LIGHT : 1.5;
  sun.intensity = inRoom ? 2 * INDOOR_LIGHT : 2;
  scene.environmentIntensity = inRoom ? INDOOR_LIGHT : 1;

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
      ? `${area}  ·  ${d.stop} bus stop  ·  ${ON_TOUCH ? "Tap Get off" : "E to get off"}`
      : `${area}  ·  On the danfo  ·  Next stop: ${nextStopName(currentBus)}`;
  } else {
    updatePlayer(dt);
    updateCamera(
      player,
      inRoom ? 3.5 : 6,
      inRoom ? 2.2 : 3,
      inRoom ? 1.3 : 1.5,
      true,
    );
    const area = lagos.getDistrict(player.position.x, player.position.z);
    const bus = nearestBus(5);
    if (bus && bus.userData.stop) {
      const seatsLeft = seatsOf(bus) - bus.userData.passengers;
      const stopName = nextStopName(bus);
      hud.textContent =
        seatsLeft > 0
          ? `${rideCall(bus, stopName)}  ·  ${seatsLeft} seats left  ·  ${ON_TOUCH ? "Tap Board" : "E to board"} (₦${fareOf(bus)})`
          : `Conductor: "E don full! Wait for the next one!"`;
    } else if (bus) {
      hud.textContent = `${area}  ·  The danfo is moving`;
    } else {
      hud.textContent = `${area}  ·  On foot  ·  ${ON_TOUCH ? "Push the stick to the edge to run" : "Shift to run"}`;
    }
  }

  // Inside his room
  if (inRoom && !currentBus) {
    hud.textContent =
      playerState === "sitting"
        ? ON_TOUCH
          ? "Tap Get up when you are ready"
          : "Press E when you are ready to get up"
        : room.nearDoor(player.position)
          ? ON_TOUCH
            ? "Tap Go out to leave the house"
            : "Press E to go outside"
          : "My room";
  }
  // Tidy the HUD: each part on its own line (the first line is the heading)
  hud.textContent = hud.textContent.replace(/\s+·\s+/g, "\n");

  // Thoughts and messages go in their own box, which fades in and out
  if (messageTimer > 0) {
    messageTimer -= dt;
    messageBox.textContent = messageText;
    messageBox.classList.add("show");
  } else {
    messageBox.classList.remove("show");
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
  playOnce("pay", 0.7); // the sound of money changing hands
}

updateMoneyDisplay();

// TEST KEYS (remove later): M = spend ₦500, N = earn ₦1,000
window.addEventListener("keydown", (e) => {
  const key = e.key.toLowerCase();
  if (key === "m" && !spendMoney(500)) console.log("Not enough money!");
  if (key === "n") earnMoney(1000);
});

// ---------- Touch controls (phones and tablets) ----------
const isTouch =
  window.matchMedia("(pointer: coarse)").matches || "ontouchstart" in window;
if (isTouch) document.body.classList.add("touch");

const joystick = document.getElementById("joystick");
const knob = document.getElementById("joystick-knob");
// How far the knob can move, in pixels (fits whatever size the joystick is)
const joyRadius = () => joystick.clientWidth / 2 - 15;
let joyPointer = null;

// Turn the knob's position into the same keys the keyboard uses
function setJoystick(dx, dy) {
  const dist = Math.hypot(dx, dy);
  const radius = joyRadius();
  if (dist > radius) {
    dx = (dx / dist) * radius;
    dy = (dy / dist) * radius;
  }
  knob.style.transform = `translate(${dx}px, ${dy}px)`;

  const x = dx / radius;
  const y = dy / radius;
  joyX = x; // smooth left/right
  joyY = y; // smooth up/down
  keys["shift"] = Math.hypot(x, y) > 0.9; // pushed to the edge: run
}

function moveJoystick(e) {
  const rect = joystick.getBoundingClientRect();
  setJoystick(
    e.clientX - (rect.left + rect.width / 2),
    e.clientY - (rect.top + rect.height / 2),
  );
}

joystick.addEventListener("pointerdown", (e) => {
  joyPointer = e.pointerId;
  joystick.setPointerCapture(e.pointerId);
  moveJoystick(e);
});

joystick.addEventListener("pointermove", (e) => {
  if (e.pointerId === joyPointer) moveJoystick(e);
});

function endJoystick(e) {
  if (e.pointerId !== joyPointer) return;
  joyPointer = null;
  setJoystick(0, 0); // let go: stop
}
joystick.addEventListener("pointerup", endJoystick);
joystick.addEventListener("pointercancel", endJoystick);

// Action button: does exactly what pressing E does
const actionButton = document.getElementById("action-button");
actionButton.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "e" }));
});

// Keep the button's label up to date, and only show it when there's something to do
setInterval(() => {
  actionButton.textContent = inRoom
    ? playerState === "sitting"
      ? "Get up"
      : "Go out"
    : currentBus
      ? "Get off"
      : "Board";

  const canAct = inRoom
    ? playerState === "sitting" || room.nearDoor(player.position) // get up, or go out
    : currentBus !== null || nearestBus(5) !== null; // get off, or board
  actionButton.style.visibility = canAct ? "visible" : "hidden";
}, 200);

// ---------- Leaving his room ----------
window.addEventListener("keydown", (e) => {
  if (e.key.toLowerCase() !== "e" || e.repeat || !inRoom) return;
  if (playerState === "sitting") {
    startStandingUp(); // the action button (or E) makes him get up
    return;
  }
  if (!room.nearDoor(player.position)) return;
  inRoom = false;
  playOnce("door", 0.8);
  player.position.set(room.outside.x, 0, room.outside.z);
  player.rotation.y = room.outside.rotation;
  camera.position.set(player.position.x, 3, player.position.z - 6);
  showMessage("Lagos. Time to go.", 2.5);
});

// ---------- His thoughts at the start ----------
const OPENING_THOUGHTS = [
  "My cousin's wedding is in Lagos...",
  "Everything for the owambe is scattered across all 36 states and Abuja.",
  `And all I have is ₦${STARTING_MONEY.toLocaleString("en-NG")}.`,
  "Okay. Let's go.",
];
OPENING_THOUGHTS.forEach((line, i) => {
  setTimeout(() => showMessage(line, 3.5), 500 + i * 3800);
});

// ---------- Landscape: full screen and locked sideways on the first tap (Android) ----------
function goLandscape() {
  const page = document.documentElement;
  if (!document.fullscreenElement && page.requestFullscreen) {
    page
      .requestFullscreen()
      .then(() => {
        if (screen.orientation && screen.orientation.lock) {
          screen.orientation.lock("landscape").catch(() => {});
        }
      })
      .catch(() => {});
  }
}
if (ON_TOUCH)
  window.addEventListener("pointerdown", goLandscape, { once: true });
