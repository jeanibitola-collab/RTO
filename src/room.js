import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

// His room sits away from the city. Walking out of the door takes him onto the street.
const ROOM_X = 0;
const ROOM_Z = 400;
const WIDTH = 5; // metres, left to right
const DEPTH = 4; // metres, back wall to door
const HEIGHT = 2.8;
const WALL = 0.1; // wall thickness

// If a Tripo model faces the wrong way, change its number by Math.PI / 2 at a time
const BED_TURN = 0;
const CHAIR_TURN = 0;
const FAN_TURN = 0;

export function buildRoom(scene) {
  const minX = ROOM_X - WIDTH / 2;
  const maxX = ROOM_X + WIDTH / 2;
  const minZ = ROOM_Z - DEPTH / 2;
  const maxZ = ROOM_Z + DEPTH / 2;

  // ---------- Loading pictures (plain colours until each one loads) ----------
  const textureLoader = new THREE.TextureLoader();
  function loadTexture(material, path, repeatX = 1, repeatY = 1) {
    textureLoader.load(
      path,
      (tex) => {
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(repeatX, repeatY);
        tex.colorSpace = THREE.SRGBColorSpace;
        material.map = tex;
        material.color.set(0xffffff);
        material.needsUpdate = true;
      },
      undefined,
      () => console.warn("Could not load", path),
    );
  }

  // A material showing a real picture. "glow" makes it bright, like daylight or a screen.
  function photo(path, fallbackColor, repeatX = 1, repeatY = 1, glow = false) {
    const mat = glow
      ? new THREE.MeshBasicMaterial({ color: fallbackColor })
      : new THREE.MeshStandardMaterial({
          color: fallbackColor,
          roughness: 0.65,
        });
    loadTexture(mat, path, repeatX, repeatY);
    return mat;
  }

  // ---------- Building blocks ----------
  // A box with slightly rounded edges that casts and receives shadows
  function addBox(w, h, d, x, y, z, material, parent = scene) {
    const radius = Math.min(0.03, Math.min(w, h, d) * 0.2);
    const mesh = new THREE.Mesh(
      new RoundedBoxGeometry(w, h, d, 2, radius),
      material,
    );
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  // A box with a real photo on its front face
  const FACE = { towardsDoor: 4, towardsBed: 5 };
  function addPhotoBox(w, h, d, x, y, z, frontMat, sideMat, facing) {
    const materials = [sideMat, sideMat, sideMat, sideMat, sideMat, sideMat];
    materials[FACE[facing]] = frontMat;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), materials);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    return mesh;
  }

  // A flat picture (window, curtain, calendar, portrait, TV picture)
  function addPicture(w, h, x, y, z, turnY, material) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
    mesh.position.set(x, y, z);
    mesh.rotation.y = turnY;
    mesh.receiveShadow = true;
    scene.add(mesh);
    return mesh;
  }

  // Load a Tripo model, size it, stand it on the floor at (x, z)
  const gltfLoader = new GLTFLoader();
  function loadModel(path, size, sizeBy, x, z, turn, onLoaded, obstacle) {
    gltfLoader.load(
      path,
      (gltf) => {
        const model = gltf.scene;
        model.rotation.y = turn;
        model.traverse((obj) => {
          if (obj.isMesh) {
            obj.castShadow = true;
            obj.receiveShadow = true;
            const mats = Array.isArray(obj.material)
              ? obj.material
              : [obj.material];
            mats.forEach((m) => {
              m.metalness = 0;
              m.roughness = Math.max(m.roughness ?? 0.7, 0.5);
            });
          }
        });
        let box = new THREE.Box3().setFromObject(model);
        let s = box.getSize(new THREE.Vector3());
        if (sizeBy === "fit") {
          // Turn it so its long side runs from the wall into the room, then fit it in size.w × size.d
          if (s.x > s.z) {
            model.rotation.y += Math.PI / 2;
            box = new THREE.Box3().setFromObject(model);
            s = box.getSize(new THREE.Vector3());
          }
          model.scale.multiplyScalar(Math.min(size.w / s.x, size.d / s.z));
        } else {
          const current = sizeBy === "height" ? s.y : Math.max(s.x, s.z);
          model.scale.multiplyScalar(size / current);
        }
        box = new THREE.Box3().setFromObject(model);
        const c = box.getCenter(new THREE.Vector3());
        model.position.x += x - c.x;
        model.position.z += z - c.z;
        model.position.y -= box.min.y;
        scene.add(model);

        // Make the collision box match the real model exactly
        if (obstacle) {
          box = new THREE.Box3().setFromObject(model);
          obstacle.minX = box.min.x;
          obstacle.maxX = box.max.x;
          obstacle.minZ = box.min.z;
          obstacle.maxZ = box.max.z;
        }

        if (onLoaded) onLoaded(model);
      },
      undefined,
      () =>
        console.warn("Could not load", path, "- keeping the simple version"),
    );
  }

  // ---------- Materials ----------
  const bedWood = photo("/textures/wood.png", 0x4a2a17, 1, 1);
  bedWood.roughness = 0.7;
  const black = new THREE.MeshStandardMaterial({
    color: 0x151515,
    roughness: 0.4,
  });
  const darkGrey = new THREE.MeshStandardMaterial({
    color: 0x2b2b2b,
    roughness: 0.5,
  });
  const fabric = photo("/textures/ankara.png", 0xc8551f, 1, 1.4);

  // Things he can't walk through
  const obstacles = [];
  function addObstacle(cx, cz, w, d) {
    const obstacle = {
      minX: cx - w / 2,
      maxX: cx + w / 2,
      minZ: cz - d / 2,
      maxZ: cz + d / 2,
    };
    obstacles.push(obstacle);
    return obstacle;
  }

  // ---------- Floor and ceiling ----------
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(WIDTH, DEPTH),
    photo("/textures/floor.png", 0xd9b98a, WIDTH / 2, DEPTH / 2), // tiles about 50 cm
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(ROOM_X, 0, ROOM_Z);
  floor.receiveShadow = true;
  scene.add(floor);

  const ceiling = new THREE.Mesh(
    new THREE.PlaneGeometry(WIDTH, DEPTH),
    new THREE.MeshStandardMaterial({ color: 0xf3eee2 }),
  );
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(ROOM_X, HEIGHT, ROOM_Z);
  scene.add(ceiling);

  // ---------- Walls ----------
  const wallFor = (widthMetres) => {
    const mat = photo(
      "/textures/wall.png",
      0xefe0bf,
      widthMetres / 2,
      HEIGHT / 2,
    );
    mat.roughness = 0.9;
    return mat;
  };
  addBox(
    WIDTH,
    HEIGHT,
    WALL,
    ROOM_X,
    HEIGHT / 2,
    minZ - WALL / 2,
    wallFor(WIDTH),
  ); // back
  addBox(
    WIDTH,
    HEIGHT,
    WALL,
    ROOM_X,
    HEIGHT / 2,
    maxZ + WALL / 2,
    wallFor(WIDTH),
  ); // door wall
  addBox(
    WALL,
    HEIGHT,
    DEPTH,
    minX - WALL / 2,
    HEIGHT / 2,
    ROOM_Z,
    wallFor(DEPTH),
  ); // window wall
  addBox(
    WALL,
    HEIGHT,
    DEPTH,
    maxX + WALL / 2,
    HEIGHT / 2,
    ROOM_Z,
    wallFor(DEPTH),
  ); // right wall

  // ---------- Door, with a wooden frame around it ----------
  const doorX = ROOM_X;
  addPhotoBox(
    0.95,
    2.1,
    0.05,
    doorX,
    1.05,
    maxZ - 0.03,
    photo("/textures/door.png", 0x5a3520),
    bedWood,
    "towardsBed",
  );
  addBox(0.08, 2.18, 0.08, doorX - 0.515, 1.09, maxZ - 0.04, bedWood); // left of frame
  addBox(0.08, 2.18, 0.08, doorX + 0.515, 1.09, maxZ - 0.04, bedWood); // right of frame
  addBox(1.11, 0.08, 0.08, doorX, 2.18, maxZ - 0.04, bedWood); // top of frame

  // ---------- Louvre window, with burglar-proof bars in front ----------
  addPicture(
    1.0,
    1.2,
    minX + 0.01,
    1.6,
    ROOM_Z + 0.5,
    Math.PI / 2,
    photo("/textures/window.png", 0xcfe9ff, 1, 1, true),
  );
  const bars = new THREE.MeshStandardMaterial({ color: 0x3b3b3b });
  for (let i = 0; i < 5; i++) {
    addBox(0.04, 1.2, 0.03, minX + 0.04, 1.6, ROOM_Z + 0.1 + i * 0.2, bars);
  }
  addBox(0.06, 0.06, 1.1, minX + 0.04, 2.23, ROOM_Z + 0.5, bars); // top of frame
  addBox(0.06, 0.06, 1.1, minX + 0.04, 0.97, ROOM_Z + 0.5, bars); // bottom of frame

  // Black curtain beside the window, and its rod
  const curtainMat = photo("/textures/curtain.png", 0x1a1a1a);
  curtainMat.side = THREE.DoubleSide;
  addPicture(
    0.5,
    1.5,
    minX + 0.07,
    1.55,
    ROOM_Z + 1.35,
    Math.PI / 2,
    curtainMat,
  );
  addBox(0.03, 0.03, 1.8, minX + 0.08, 2.32, ROOM_Z + 0.65, black);

  // ---------- The bed (Tripo model, with a simple version until it loads) ----------
  const bedX = maxX - 0.85;
  const bedZ = minZ + 1.08;
  const simpleBed = new THREE.Group();
  scene.add(simpleBed);
  addBox(1.5, 0.25, 2.1, bedX, 0.275, bedZ, bedWood, simpleBed); // frame
  addBox(1.5, 0.9, 0.08, bedX, 0.85, minZ + 0.04, bedWood, simpleBed); // headboard
  addBox(1.4, 0.2, 1.95, bedX, 0.5, bedZ + 0.05, fabric, simpleBed); // mattress
  addBox(0.6, 0.12, 0.35, bedX, 0.66, minZ + 0.35, fabric, simpleBed); // pillow

  // Where he sits at the start: on the side of the bed facing the room
  const SIT_INSET = 0.3; // how far onto the mattress he sits (bigger = further onto the bed)
  const sitSpot = {
    x: bedX - 0.75 + SIT_INSET,
    z: bedZ + 0.2,
    rotation: -Math.PI / 2,
  };

  const bedObstacle = addObstacle(bedX, bedZ, 1.5, 2.1);
  loadModel(
    "/models/bed.glb",
    { w: 1.5, d: 2.1 },
    "fit",
    bedX,
    bedZ,
    BED_TURN,
    () => {
      simpleBed.visible = false;
      // Move his sitting spot to the real edge of the Tripo bed
      sitSpot.x = bedObstacle.minX + SIT_INSET;
      sitSpot.z = (bedObstacle.minZ + bedObstacle.maxZ) / 2 + 0.2;
    },
    bedObstacle,
  );

  // ---------- Wardrobe (back wall, left-hand corner), with a real photo on the front ----------
  const wardrobeX = minX + 0.6;
  const wardrobeZ = minZ + 0.32;
  addPhotoBox(
    1.1,
    2.0,
    0.6,
    wardrobeX,
    1.0,
    wardrobeZ,
    photo("/textures/wardrobe.png", 0x4a2a17),
    bedWood,
    "towardsDoor",
  );
  addObstacle(wardrobeX, wardrobeZ, 1.1, 0.6);

  // ---------- Small wooden table under the window ----------
  const tableX = minX + 0.32;
  const tableZ = ROOM_Z + 0.5;
  addBox(0.6, 0.04, 1.0, tableX, 0.75, tableZ, bedWood); // table top
  for (const [lx, lz] of [
    [-0.25, -0.45],
    [0.25, -0.45],
    [-0.25, 0.45],
    [0.25, 0.45],
  ]) {
    addBox(0.04, 0.73, 0.04, tableX + lx, 0.365, tableZ + lz, bedWood); // legs
  }
  addObstacle(tableX, tableZ, 0.6, 1.0);

  // Rechargeable lamp (with its glowing front) and his phone
  addBox(
    0.12,
    0.18,
    0.1,
    tableX,
    0.86,
    tableZ - 0.3,
    new THREE.MeshStandardMaterial({ color: 0x1e88e5 }),
  );
  addBox(
    0.01,
    0.08,
    0.08,
    tableX + 0.065,
    0.88,
    tableZ - 0.3,
    new THREE.MeshBasicMaterial({ color: 0xfff6d5 }),
  );
  addBox(0.08, 0.01, 0.16, tableX + 0.05, 0.775, tableZ + 0.15, black); // phone

  // ---------- Plastic chair, facing the table (Tripo model) ----------
  const chairX = tableX + 0.65;
  const chairZ = tableZ;
  const simpleChair = new THREE.Group();
  scene.add(simpleChair);
  const plastic = new THREE.MeshStandardMaterial({
    color: 0xf2f2f2,
    roughness: 0.5,
  });
  addBox(0.45, 0.04, 0.45, chairX, 0.45, chairZ, plastic, simpleChair); // seat
  addBox(0.04, 0.45, 0.45, chairX + 0.22, 0.7, chairZ, plastic, simpleChair); // backrest
  for (const [lx, lz] of [
    [-0.2, -0.2],
    [0.2, -0.2],
    [-0.2, 0.2],
    [0.2, 0.2],
  ]) {
    addBox(
      0.04,
      0.45,
      0.04,
      chairX + lx,
      0.225,
      chairZ + lz,
      plastic,
      simpleChair,
    ); // legs
  }
  const chairObstacle = addObstacle(chairX, chairZ, 0.55, 0.55);
  loadModel(
    "/models/chair.glb",
    0.85,
    "height",
    chairX,
    chairZ,
    -Math.PI / 2 + CHAIR_TURN,
    () => {
      simpleChair.visible = false;
    },
    chairObstacle,
  );

  // ---------- Standing fan (front left-hand corner), facing the room (Tripo model) ----------
  const fanX = minX + 0.35;
  const fanZ = maxZ - 0.35;
  const fanFacing = Math.atan2(ROOM_X - fanX, ROOM_Z - fanZ); // towards the middle of the room
  const simpleFan = new THREE.Group();
  scene.add(simpleFan);
  const fanMat = new THREE.MeshStandardMaterial({
    color: 0xdedede,
    roughness: 0.5,
  });
  const fanPole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.02, 0.02, 1.1, 8),
    fanMat,
  );
  fanPole.position.set(fanX, 0.57, fanZ);
  simpleFan.add(fanPole);
  const fanHead = new THREE.Group();
  fanHead.position.set(fanX, 1.15, fanZ);
  fanHead.rotation.y = fanFacing;
  simpleFan.add(fanHead);
  const fanBlades = new THREE.Group();
  fanHead.add(fanBlades);
  for (let i = 0; i < 3; i++) {
    const pivot = new THREE.Group();
    pivot.rotation.z = (i * Math.PI * 2) / 3;
    const blade = new THREE.Mesh(
      new THREE.BoxGeometry(0.07, 0.18, 0.01),
      new THREE.MeshStandardMaterial({ color: 0x4fc3f7 }),
    );
    blade.position.y = 0.1;
    pivot.add(blade);
    fanBlades.add(pivot);
  }
  const fanObstacle = addObstacle(fanX, fanZ, 0.45, 0.45);
  loadModel(
    "/models/fan.glb",
    1.35,
    "height",
    fanX,
    fanZ,
    fanFacing + FAN_TURN,
    () => {
      simpleFan.visible = false;
    },
    fanObstacle,
  );

  // ---------- "Ghana Must Go" bag at the foot of the bed ----------
  const bagX = bedX - 0.2;
  const bagZ = bedZ + 1.35;
  addBox(
    0.7,
    0.42,
    0.38,
    bagX,
    0.21,
    bagZ,
    photo("/textures/bag.png", 0xdddddd),
  );
  addBox(0.3, 0.03, 0.04, bagX, 0.44, bagZ, black); // handles
  addObstacle(bagX, bagZ, 0.7, 0.38);

  // ---------- Rug in the middle of the floor ----------
  addBox(
    1.6,
    0.01,
    1.1,
    ROOM_X - 0.3,
    0.005,
    ROOM_Z + 0.7,
    photo("/textures/rug.png", 0x7b1e2b),
  );

  // ---------- Calendar above the bed ----------
  addPicture(
    0.4,
    0.55,
    maxX - 0.01,
    1.75,
    bedZ + 0.6,
    -Math.PI / 2,
    photo("/textures/calendar.png", 0xffffff),
  );

  // ---------- Family portrait on the back wall, between the wardrobe and the bed ----------
  const portraitX = ROOM_X - 0.2;
  const portraitY = 1.65;
  const portraitW = 0.55;
  const portraitH = portraitW * (1448 / 1086); // matches the image's shape
  addBox(
    portraitW,
    portraitH,
    0.02,
    portraitX,
    portraitY,
    minZ + 0.01,
    new THREE.MeshStandardMaterial({ color: 0x3a1f12 }),
  ); // thin backing, so it sits off the wall
  addPicture(
    portraitW,
    portraitH,
    portraitX,
    portraitY,
    minZ + 0.025,
    0,
    photo("/textures/portrait.png", 0xcfd8dc),
  );

  // ---------- Plasma TV and home theatre (door wall, facing the bed) ----------
  const tvX = maxX - 1.0;
  const tvZ = maxZ - 0.22;
  addBox(1.2, 0.5, 0.4, tvX, 0.25, tvZ, bedWood); // TV stand
  addBox(0.25, 0.05, 0.15, tvX, 0.525, tvZ, black); // the TV's foot
  addPhotoBox(
    1.0,
    0.6,
    0.06,
    tvX,
    0.85,
    tvZ,
    photo("/textures/tvframe.png", 0x111111),
    black,
    "towardsBed",
  ); // the TV
  addPicture(
    0.86,
    0.48,
    tvX,
    0.86,
    tvZ - 0.032,
    Math.PI,
    photo("/textures/tv.png", 0x2e7d32, 1, 1, true),
  ); // what's on: the football match

  // Home theatre player on the stand, and two tall speakers either side
  addPhotoBox(
    0.4,
    0.07,
    0.3,
    tvX - 0.35,
    0.535,
    tvZ,
    photo("/textures/player.png", 0x2b2b2b),
    darkGrey,
    "towardsBed",
  );
  const speakerFront = photo("/textures/speaker.png", 0x151515);
  for (const sx of [tvX - 0.75, tvX + 0.75]) {
    addPhotoBox(
      0.22,
      0.95,
      0.25,
      sx,
      0.475,
      tvZ,
      speakerFront,
      black,
      "towardsBed",
    );
  }
  addObstacle(tvX, tvZ, 1.85, 0.45);

  // ---------- Ceiling light: a shadow-casting lamp, plus a soft fill ----------
  const lamp = new THREE.SpotLight(0xffe2b0, 15, 12, 1.2, 0.6, 2);
  lamp.position.set(ROOM_X, HEIGHT - 0.05, ROOM_Z);
  lamp.target.position.set(ROOM_X, 0, ROOM_Z);
  lamp.castShadow = true;
  lamp.shadow.mapSize.set(1024, 1024);
  lamp.shadow.bias = -0.0005;
  scene.add(lamp, lamp.target);

  const fill = new THREE.PointLight(0xffe2b0, 1.5, 10, 2); // softens the darkest shadows
  fill.position.set(ROOM_X, HEIGHT - 0.3, ROOM_Z);
  scene.add(fill);

  // ---------- Collisions ----------
  function hitsWall(x, z, r) {
    return x - r < minX || x + r > maxX || z - r < minZ || z + r > maxZ;
  }

  function isBlocked(x, z, r) {
    if (hitsWall(x, z, r)) return true;
    return obstacles.some(
      (o) =>
        x + r > o.minX && x - r < o.maxX && z + r > o.minZ && z - r < o.maxZ,
    );
  }

  // Is he standing by the door?
  function nearDoor(position) {
    return Math.hypot(position.x - doorX, position.z - (maxZ - 0.5)) < 1.3;
  }

  // Things in the room that move (only the simple fan, if the Tripo fan didn't load)
  function update(dt) {
    fanBlades.rotation.z += dt * 15;
  }

  return {
    spawn: { x: bedX - 1.15, z: bedZ, rotation: 0 }, // beside the bed, facing the door
    sitSpot, // on the side of the bed (moves to the real bed's edge once it loads)
    outside: { x: -30, z: 33.5, rotation: 0 }, // on the pavement, by the Ikeja bus stop
    isBlocked,
    hitsWall,
    nearDoor,
    update,
  };
}
