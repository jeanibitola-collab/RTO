import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

// ---------- Seeded random ----------
// Using a fixed seed means Lagos looks the same every time you load the game
function makeRandom(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = makeRandom(2026);

// ---------- Map layout ----------
// Mainland is west (x below 20), the lagoon runs north–south, the Island is east (x above 60)
const LAGOON = { minX: 20, maxX: 60 };
const BRIDGE = { z: 40, halfWidth: 5 };
const OCEAN_Z = -178; // south of this, on the Island side, is the Atlantic
const BEACH_Z = -160; // Lekki Beach sand starts here

// Each road is a rectangle: centre (x, z), width (w) and depth (d)
const ROADS = [
  // Mainland
  { x: -60, z: 0, w: 10, d: 380 }, // main north–south avenue
  { x: -85, z: 40, w: 210, d: 10 }, // east–west road leading to the bridge
  { x: -85, z: 125, w: 210, d: 10 }, // Ikeja road
  { x: -85, z: -70, w: 210, d: 10 }, // Yaba road
  // Third Mainland Bridge
  { x: 40, z: 40, w: 40, d: 10, bridge: true },
  // Island
  { x: 125, z: 40, w: 130, d: 10 }, // road from the bridge
  { x: 120, z: 10, w: 10, d: 300 }, // Island north–south road
  { x: 125, z: -130, w: 130, d: 10 }, // Lekki road
  // New connecting roads, so buses can loop round instead of turning back
  { x: 0, z: 82.5, w: 10, d: 95 }, // mainland link road (from the bridge road up to the Ikeja road)
  { x: 150, z: 150, w: 70, d: 10 }, // Island north road (past Marina)
  { x: 180, z: 10, w: 10, d: 290 }, // Island east road (down to Lekki)
];

// ---------- Roundabouts ----------
export const ROUNDABOUTS = [
  { name: "Yaba Roundabout", x: -60, z: 40 }, // mainland, where the avenue meets the bridge road
  { name: "Obalende Roundabout", x: 120, z: 40 }, // Island, at the end of the bridge
];
const RB_OUTER = 14; // radius of the roundabout's road (metres)
const RB_MIDDLE = 8; // radius of the raised middle

// Is a point within a certain distance of a roundabout's centre?
function nearRoundabout(x, z, distance) {
  return ROUNDABOUTS.some((rb) => Math.hypot(x - rb.x, z - rb.z) < distance);
}

// ---------- How each kind of building looks ----------
// Each facade picture shows a set number of floors and windows.
// tileW and tileH are the real size (in metres) that one copy of the picture covers.
const FACADES = {
  residential: {
    path: "/textures/facade-residential.png",
    tileW: 6,
    tileH: 6,
    floors: 2,
  },
  office: {
    path: "/textures/facade-office.png",
    tileW: 7.5,
    tileH: 6,
    floors: 2,
  },
  tower: {
    path: "/textures/facade-tower.png",
    tileW: 6,
    tileH: 10.5,
    floors: 3,
  },
  villa: {
    path: "/textures/facade-villa.png",
    tileW: 7,
    tileH: 3.5,
    floors: 1,
  },
  shops: {
    path: "/textures/facade-shops.png",
    tileW: 8,
    tileH: 3.5,
    floors: 1,
  },
};
const SHOP_HEIGHT = 3.5; // the shop floor at street level
const ROOF_TILE = 8; // metres covered by one copy of the roof picture
const ROAD_TILE = 6; // metres covered by one copy of the asphalt picture

const DISTRICTS = [
  {
    name: "Ikeja",
    minX: -195,
    maxX: 18,
    minZ: 46,
    maxZ: 195,
    minFloors: 2,
    maxFloors: 5,
    styles: ["office", "office", "residential"], // mostly offices
    shopsChance: 0.3, // some have shops underneath
    tints: [0xffffff, 0xf2e6d0, 0xe3eef5, 0xf5e1d5],
  },
  {
    name: "Yaba",
    minX: -195,
    maxX: 18,
    minZ: -195,
    maxZ: 34,
    minFloors: 1,
    maxFloors: 3,
    styles: ["residential"],
    shopsChance: 0.8, // most have shops underneath
    tints: [0xffffff, 0xf9d5c5, 0xd5ecd4, 0xd4e3f7, 0xf7eeb0], // colourful
  },
  {
    name: "Lagos Island",
    minX: 62,
    maxX: 195,
    minZ: 46,
    maxZ: 195,
    minFloors: 7,
    maxFloors: 16,
    styles: ["tower"],
    shopsChance: 0,
    tints: [0xffffff, 0xdfe8ef, 0xe8f0ea],
  },
  {
    name: "Lekki",
    minX: 62,
    maxX: 195,
    minZ: -160,
    maxZ: 34,
    minFloors: 1,
    maxFloors: 2,
    styles: ["villa"],
    shopsChance: 0,
    tints: [0xffffff, 0xfff6e8, 0xf0f0f0],
  },
];

// ---------- Making pictures repeat at the right size ----------
// Repeats a facade picture across a box's sides, so windows stay real-sized.
// Across: always whole windows. Up: exactly the building's number of floors.
function tileBoxUVs(geometry, w, h, d, tileW, tileH) {
  const uv = geometry.attributes.uv;
  // A box's faces, in order: +x, -x, top, bottom, +z, -z (4 corners each)
  const faces = [
    [d, h],
    [d, h],
    [w, d],
    [w, d],
    [w, h],
    [w, h],
  ];
  faces.forEach(([faceW, faceH], f) => {
    const across = Math.max(1, Math.round(faceW / tileW));
    const up = faceH / tileH;
    for (let i = 0; i < 4; i++) {
      const k = f * 4 + i;
      uv.setXY(k, uv.getX(k) * across, uv.getY(k) * up);
    }
  });
  uv.needsUpdate = true;
}

// Repeats a picture across a flat surface (roofs, roads)
function tilePlaneUVs(geometry, repeatX, repeatY) {
  const uv = geometry.attributes.uv;
  for (let k = 0; k < uv.count; k++) {
    uv.setXY(k, uv.getX(k) * repeatX, uv.getY(k) * repeatY);
  }
  uv.needsUpdate = true;
}

// Turn a picture a quarter turn on a surface (swap its across and up directions)
function swapUVs(geometry) {
  const uv = geometry.attributes.uv;
  for (let k = 0; k < uv.count; k++) {
    const u = uv.getX(k);
    uv.setXY(k, uv.getY(k), u);
  }
  uv.needsUpdate = true;
}

// ---------- Build the city ----------
export function buildLagos(scene) {
  const buildings = []; // saved for collisions
  const decorRand = makeRandom(7); // separate random numbers for decorations, so buildings don't move
  const roofSpots = []; // where rooftop water tanks go
  const villaPlots = []; // Lekki villas, for their compound walls

  // ---------- Pictures: each is loaded once and shared ----------
  const loader = new THREE.TextureLoader();
  const pictures = {}; // path -> { texture, waiting materials }

  // Give a material a picture. "whiten" turns its plain fallback colour white once the picture arrives.
  function usePicture(path, material, whiten = false) {
    if (!pictures[path]) {
      pictures[path] = { texture: null, waiting: [] };
      loader.load(
        path,
        (tex) => {
          tex.wrapS = THREE.RepeatWrapping;
          tex.wrapT = THREE.RepeatWrapping;
          tex.colorSpace = THREE.SRGBColorSpace;
          tex.anisotropy = 4; // sharper when seen at an angle
          pictures[path].texture = tex;
          pictures[path].waiting.forEach(({ mat, whiten: w }) => {
            mat.map = tex;
            if (w) mat.color.set(0xffffff);
            mat.needsUpdate = true;
          });
        },
        undefined,
        () => console.warn("Could not load", path),
      );
    }
    const pic = pictures[path];
    if (pic.texture) {
      material.map = pic.texture;
      if (whiten) material.color.set(0xffffff);
    } else {
      pic.waiting.push({ mat: material, whiten });
    }
  }

  const plain = {};
  const plainMat = (color) =>
    plain[color] || (plain[color] = new THREE.MeshStandardMaterial({ color }));

  // Helper: a flat rectangle on the ground
  function addPlane(minX, maxX, minZ, maxZ, y, material) {
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(maxX - minX, maxZ - minZ),
      material,
    );
    plane.rotation.x = -Math.PI / 2;
    plane.position.set((minX + maxX) / 2, y, (minZ + maxZ) / 2);
    scene.add(plane);
    return plane;
  }

  // ---------- Land, water and beach ----------
  const WATER_LEVEL = -3.5; // the lagoon sits below the land, so the bridge stands above it

  // Red earth ground, in two parts (mainland and Island), with a gap for the lagoon
  const GROUND_TILE = 10;
  const groundMaterial = new THREE.MeshStandardMaterial({
    color: 0x8a4527,
    roughness: 1,
  });
  usePicture("/textures/ground.png", groundMaterial, true);
  function addGround(minX, maxX, minZ, maxZ) {
    const geometry = new THREE.PlaneGeometry(maxX - minX, maxZ - minZ);
    tilePlaneUVs(
      geometry,
      (maxX - minX) / GROUND_TILE,
      (maxZ - minZ) / GROUND_TILE,
    );
    const mesh = new THREE.Mesh(geometry, groundMaterial);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set((minX + maxX) / 2, 0, (minZ + maxZ) / 2);
    scene.add(mesh);
  }
  addGround(-200, LAGOON.minX, -200, 200); // the mainland
  addGround(LAGOON.maxX, 200, OCEAN_Z, 200); // the Island, down to the beach

  // Water: a real water picture that slowly drifts, so it looks like it's moving
  const WATER_TILE = 12;
  const waterMaterial = new THREE.MeshStandardMaterial({
    color: 0x4f6b5a,
    roughness: 0.45,
    metalness: 0,
  });
  usePicture("/textures/water.png", waterMaterial, true);
  function addWater(minX, maxX, minZ, maxZ, y) {
    const geometry = new THREE.PlaneGeometry(maxX - minX, maxZ - minZ);
    tilePlaneUVs(
      geometry,
      (maxX - minX) / WATER_TILE,
      (maxZ - minZ) / WATER_TILE,
    );
    const mesh = new THREE.Mesh(geometry, waterMaterial);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set((minX + maxX) / 2, y, (minZ + maxZ) / 2);
    scene.add(mesh);
  }
  addWater(LAGOON.minX, LAGOON.maxX, -200, 200, WATER_LEVEL); // the lagoon, down below
  addWater(LAGOON.maxX, 200, -200, OCEAN_Z, -0.4); // the Atlantic, just below the beach

  // Lekki Beach sand
  addPlane(LAGOON.maxX, 200, OCEAN_Z, BEACH_Z, 0.015, plainMat(0xe8d3a2));

  // The lagoon's banks: weathered concrete walls from the water up to the land
  const bankMaterial = new THREE.MeshStandardMaterial({
    color: 0x7d7468,
    roughness: 0.95,
  });
  usePicture("/textures/bank-wall.png", bankMaterial, true);
  for (const bankX of [LAGOON.minX, LAGOON.maxX]) {
    const geometry = new THREE.BoxGeometry(0.5, -WATER_LEVEL, 400);
    tileBoxUVs(geometry, 0.5, -WATER_LEVEL, 400, 7, 3.5); // one copy every 7 m along the bank
    const bank = new THREE.Mesh(geometry, bankMaterial);
    bank.position.set(bankX, WATER_LEVEL / 2, 0);
    scene.add(bank);
  }

  // A concrete waterfront walkway along both banks, between the water and the buildings
  const walkway = new THREE.MeshStandardMaterial({
    color: 0xa8a39a,
    roughness: 0.9,
  });
  usePicture("/textures/floor.png", walkway, false); // the tile picture, tinted to concrete grey
  for (const [minX, maxX, fromZ] of [
    [LAGOON.minX - 6, LAGOON.minX, -200], // mainland side
    [LAGOON.maxX, LAGOON.maxX + 6, OCEAN_Z], // Island side
  ]) {
    const geometry = new THREE.PlaneGeometry(maxX - minX, 200 - fromZ);
    tilePlaneUVs(geometry, (maxX - minX) / 2, (200 - fromZ) / 2);
    const path = new THREE.Mesh(geometry, walkway);
    path.rotation.x = -Math.PI / 2;
    path.position.set((minX + maxX) / 2, 0.02, (fromZ + 200) / 2);
    scene.add(path);
  }

  // Railings along the lagoon's banks: the real railing picture, with a gap where the bridge starts
  const waterRailMaterial = new THREE.MeshStandardMaterial({
    color: 0x2f5d3a,
    alphaTest: 0.5,
    side: THREE.DoubleSide,
    roughness: 0.6,
  });
  usePicture("/textures/water-railing.png", waterRailMaterial, true);
  const banks = [
    { x: LAGOON.minX - 0.4, fromZ: -200 }, // the mainland bank
    { x: LAGOON.maxX + 0.4, fromZ: OCEAN_Z }, // the Island bank (stops at the sea)
  ];
  for (const bank of banks) {
    const stretches = [
      [bank.fromZ, BRIDGE.z - BRIDGE.halfWidth - 0.5],
      [BRIDGE.z + BRIDGE.halfWidth + 0.5, 200],
    ];
    for (const [z1, z2] of stretches) {
      const length = z2 - z1;
      const geometry = new THREE.PlaneGeometry(length, 1.1);
      tilePlaneUVs(geometry, length / 3.3, 1); // one copy every 3.3 m (the picture is 3:1)
      const railing = new THREE.Mesh(geometry, waterRailMaterial);
      railing.rotation.y = Math.PI / 2; // run along the bank
      railing.position.set(bank.x, 0.55, (z1 + z2) / 2);
      scene.add(railing);
    }
  }

  // A small sandy step where the beach meets the sea
  const step = new THREE.Mesh(
    new THREE.BoxGeometry(200 - LAGOON.maxX, 0.4, 0.5),
    plainMat(0xd9c08e),
  );
  step.position.set((LAGOON.maxX + 200) / 2, -0.2, OCEAN_Z);
  scene.add(step);

  // ---------- Third Mainland Bridge: a concrete deck on pillars, high above the lagoon ----------
  const bridgeConcrete = new THREE.MeshStandardMaterial({
    color: 0xa8a49c,
    roughness: 0.9,
  });
  usePicture("/textures/pole.png", bridgeConcrete, true);
  function buildBridge(r) {
    const minX = r.x - r.w / 2;
    const maxX = r.x + r.w / 2;
    const pillarMaterial = new THREE.MeshStandardMaterial({
      color: 0x9e9a92,
      roughness: 0.95,
    });
    usePicture("/textures/bridge-pillar.png", pillarMaterial, true);

    // The deck, 1.2 m thick, its top level with the roads
    const deckSide = new THREE.MeshStandardMaterial({
      color: 0xa8a49c,
      roughness: 0.9,
    });
    usePicture("/textures/bridge-side.png", deckSide, true);
    const deckGeometry = new THREE.BoxGeometry(r.w, 1.2, r.d + 1);
    tileBoxUVs(deckGeometry, r.w, 1.2, r.d + 1, 4.8, 1.2); // the side picture repeats along the bridge
    const deck = new THREE.Mesh(deckGeometry, deckSide);
    deck.position.set(r.x, -0.6, r.z);
    scene.add(deck);

    // Pairs of pillars every 8 m, standing in the water, with a beam across the top
    for (let x = minX + 4; x < maxX; x += 8) {
      for (const side of [-1, 1]) {
        const pillar = new THREE.Mesh(
          new THREE.CylinderGeometry(0.6, 0.7, -WATER_LEVEL, 12),
          pillarMaterial,
        );
        pillar.position.set(
          x,
          WATER_LEVEL / 2 - 0.6,
          r.z + side * (r.d / 2 - 1.2),
        );
        scene.add(pillar);
      }
      const beam = new THREE.Mesh(
        new THREE.BoxGeometry(1.4, 0.8, r.d),
        bridgeConcrete,
      );
      beam.position.set(x, -1.6, r.z);
      scene.add(beam);
    }

    // Parapets along both edges: the real parapet picture (see-through between the railing posts)
    const parapetMaterial = new THREE.MeshStandardMaterial({
      color: 0xbdbdbd,
      alphaTest: 0.5,
      side: THREE.DoubleSide,
      roughness: 0.8,
    });
    usePicture("/textures/bridge-parapet.png", parapetMaterial, true);
    for (const side of [-1, 1]) {
      const geometry = new THREE.PlaneGeometry(r.w, 1.2);
      tilePlaneUVs(geometry, r.w / 3.6, 1); // one copy every 3.6 m (the picture is 3:1)
      const parapet = new THREE.Mesh(geometry, parapetMaterial);
      parapet.position.set(r.x, 0.6, r.z + side * (r.d / 2 + 0.17));
      scene.add(parapet);
    }

    // The middle barrier, between the two directions of traffic
    const medianMaterial = new THREE.MeshStandardMaterial({
      color: 0xa8a49c,
      roughness: 0.9,
    });
    usePicture("/textures/bridge-median.png", medianMaterial, true);
    const medianGeometry = new THREE.BoxGeometry(r.w, 0.8, 0.6);
    tileBoxUVs(medianGeometry, r.w, 0.8, 0.6, 3.2, 0.8); // the picture repeats along the barrier
    const median = new THREE.Mesh(medianGeometry, medianMaterial);
    median.position.set(r.x, 0.4, r.z);
    scene.add(median);
    buildings.push({ minX, maxX, minZ: r.z - 0.35, maxZ: r.z + 0.35 }); // he can't walk through it
  }

  // ---------- Roads, with asphalt and dashed centre lines ----------
  const asphalt = new THREE.MeshStandardMaterial({
    color: 0x3a3a3a,
    roughness: 0.95,
  });
  usePicture("/textures/asphalt.png", asphalt, true);
  const dashGeometries = [];

  let roadIndex = 0; // each road sits a tiny bit higher than the last, so crossings don't flicker
  for (const r of ROADS) {
    roadIndex++;
    if (r.bridge) buildBridge(r); // the deck and pillars; it then gets asphalt and lane markings below
    const geometry = new THREE.PlaneGeometry(r.w, r.d);
    tilePlaneUVs(geometry, r.w / ROAD_TILE, r.d / ROAD_TILE);
    const road = new THREE.Mesh(geometry, asphalt);
    road.rotation.x = -Math.PI / 2;
    road.position.set(r.x, 0.03 + roadIndex * 0.005, r.z); // half a centimetre apart
    scene.add(road);

    // Dashes along the middle of the road, every 8 metres
    const alongX = r.w > r.d;
    const length = alongX ? r.w : r.d;
    for (let s = -length / 2 + 4; s < length / 2 - 2; s += 8) {
      if (
        nearRoundabout(
          alongX ? r.x + s : r.x,
          alongX ? r.z : r.z + s,
          RB_OUTER + 1,
        )
      )
        continue;
      const dash = new THREE.PlaneGeometry(
        alongX ? 3 : 0.25,
        alongX ? 0.25 : 3,
      );
      dash.rotateX(-Math.PI / 2);
      dash.translate(alongX ? r.x + s : r.x, 0.09, alongX ? r.z : r.z + s);
      dashGeometries.push(dash);
    }
  }
  scene.add(
    new THREE.Mesh(mergeGeometries(dashGeometries), plainMat(0xf2f2f2)),
  );

  // Shrink a building's plot so it stops neatly at the roadside (instead of leaving the plot empty)
  function fitBesideRoads(box, margin) {
    for (const r of ROADS) {
      const rMinX = r.x - r.w / 2 - margin;
      const rMaxX = r.x + r.w / 2 + margin;
      const rMinZ = r.z - r.d / 2 - margin;
      const rMaxZ = r.z + r.d / 2 + margin;
      const overlaps =
        box.maxX > rMinX &&
        box.minX < rMaxX &&
        box.maxZ > rMinZ &&
        box.minZ < rMaxZ;
      if (!overlaps) continue;

      // Trim whichever side of the building needs the smallest cut
      const cuts = [
        { side: "maxX", amount: box.maxX - rMinX },
        { side: "minX", amount: rMaxX - box.minX },
        { side: "maxZ", amount: box.maxZ - rMinZ },
        { side: "minZ", amount: rMaxZ - box.minZ },
      ];
      cuts.sort((a, b) => a.amount - b.amount);
      box[cuts[0].side] += cuts[0].side.startsWith("max")
        ? -cuts[0].amount
        : cuts[0].amount;
    }
    // Only build if there's still enough room for a building
    return box.maxX - box.minX >= 5 && box.maxZ - box.minZ >= 5;
  }

  // Does a rectangle overlap any road?
  function touchesRoad(minX, maxX, minZ, maxZ, margin) {
    return ROADS.some(
      (r) =>
        maxX > r.x - r.w / 2 - margin &&
        minX < r.x + r.w / 2 + margin &&
        maxZ > r.z - r.d / 2 - margin &&
        minZ < r.z + r.d / 2 + margin,
    );
  }

  // ---------- Buildings ----------
  // Buildings that look the same are collected together, then merged into one object (fast on phones)
  const groups = new Map(); // look -> { material, geometries }
  function addToGroup(lookKey, picturePath, tint, geometry) {
    if (!groups.has(lookKey)) {
      const material = new THREE.MeshStandardMaterial({
        color: tint,
        roughness: 0.85,
      });
      usePicture(picturePath, material); // the tint stays, so buildings come in different colours
      groups.set(lookKey, { material, geometries: [] });
    }
    groups.get(lookKey).geometries.push(geometry);
  }
  const roofGeometries = [];

  for (const d of DISTRICTS) {
    for (let x = d.minX + 7; x < d.maxX - 7; x += 14) {
      for (let z = d.minZ + 7; z < d.maxZ - 7; z += 14) {
        if (rand() < 0.08) continue; // the odd empty plot

        const style = d.styles[Math.floor(rand() * d.styles.length)];
        const facade = FACADES[style];
        const floorHeight = facade.tileH / facade.floors;
        const floors =
          d.minFloors + Math.floor(rand() * (d.maxFloors - d.minFloors + 1));
        const hasShops = rand() < d.shopsChance;
        const base = hasShops ? SHOP_HEIGHT : 0;
        const upperHeight = floors * floorHeight;
        const h = base + upperHeight;

        // Plan the plot, then trim it so it stops neatly at the roadside
        const planW = 9 + rand() * 3;
        const planD = 9 + rand() * 3;
        const cx = x + (rand() - 0.5) * 2;
        const cz = z + (rand() - 0.5) * 2;
        const box = {
          minX: cx - planW / 2,
          maxX: cx + planW / 2,
          minZ: cz - planD / 2,
          maxZ: cz + planD / 2,
        };
        if (!fitBesideRoads(box, 7.5)) continue;

        // Leave room around the roundabouts
        const tooCloseToRoundabout = ROUNDABOUTS.some((rb) => {
          const nx = Math.max(box.minX, Math.min(rb.x, box.maxX));
          const nz = Math.max(box.minZ, Math.min(rb.z, box.maxZ));
          return Math.hypot(nx - rb.x, nz - rb.z) < RB_OUTER + 4;
        });
        if (tooCloseToRoundabout) continue;

        // The building's final size and position, after trimming
        const w = box.maxX - box.minX;
        const dep = box.maxZ - box.minZ;
        const bx = (box.minX + box.maxX) / 2;
        const bz = (box.minZ + box.maxZ) / 2;

        const tint = d.tints[Math.floor(rand() * d.tints.length)];

        // Shops at street level
        if (hasShops) {
          const shops = new THREE.BoxGeometry(w, SHOP_HEIGHT, dep);
          tileBoxUVs(
            shops,
            w,
            SHOP_HEIGHT,
            dep,
            FACADES.shops.tileW,
            FACADES.shops.tileH,
          );
          shops.translate(bx, SHOP_HEIGHT / 2, bz);
          addToGroup("shops", FACADES.shops.path, 0xffffff, shops);
        }

        // The floors above
        const upper = new THREE.BoxGeometry(w, upperHeight, dep);
        tileBoxUVs(upper, w, upperHeight, dep, facade.tileW, facade.tileH);
        upper.translate(bx, base + upperHeight / 2, bz);
        addToGroup(`${style}-${tint}`, facade.path, tint, upper);

        // The roof
        const roof = new THREE.PlaneGeometry(w, dep);
        tilePlaneUVs(roof, w / ROOF_TILE, dep / ROOF_TILE);
        roof.rotateX(-Math.PI / 2);
        roof.translate(bx, h + 0.02, bz);
        roofGeometries.push(roof);

        // A black water tank on many roofs (not on the glass towers)
        if (style !== "tower" && decorRand() < 0.55) {
          roofSpots.push({ x: bx + w / 2 - 1.3, z: bz - dep / 2 + 1.3, y: h });
        }

        if (style === "villa") villaPlots.push({ ...box });
        buildings.push(box);
      }
    }
  }

  // Merge each look into one object
  for (const { material, geometries } of groups.values()) {
    scene.add(new THREE.Mesh(mergeGeometries(geometries), material));
  }
  const roofMaterial = new THREE.MeshStandardMaterial({
    color: 0x9e9e9e,
    roughness: 0.95,
  });
  usePicture("/textures/roof.png", roofMaterial, true);
  scene.add(new THREE.Mesh(mergeGeometries(roofGeometries), roofMaterial));

  // ================= Phase 2: street furniture and infrastructure =================
  const dummy = new THREE.Object3D();

  // Many copies of one shape for the cost of one
  function instanced(geometry, material, placements) {
    if (placements.length === 0) return null;
    const mesh = new THREE.InstancedMesh(geometry, material, placements.length);
    placements.forEach((p, i) => {
      dummy.position.set(p.x, p.y || 0, p.z);
      dummy.rotation.set(0, p.turn || 0, 0);
      dummy.scale.setScalar(p.scale || 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    scene.add(mesh);
    return mesh;
  }

  // A material with a real picture (plain colour until it loads)
  function picture(path, fallback, extra = {}) {
    const mat = new THREE.MeshStandardMaterial({
      color: fallback,
      roughness: 0.85,
      ...extra,
    });
    usePicture(path, mat, true);
    return mat;
  }

  // Is a point on a road other than the one we're following?
  function onAnotherRoad(x, z, ownRoad, pad) {
    return ROADS.some(
      (r) =>
        r !== ownRoad &&
        Math.abs(x - r.x) < r.w / 2 + pad &&
        Math.abs(z - r.z) < r.d / 2 + pad,
    );
  }

  // Points along the sides of every road: "offset" metres beyond the road's edge, every "spacing" metres.
  // "shift" moves the whole row along, so different things don't land on top of each other.
  function alongRoads(offset, spacing, sides = [-1, 1], shift = 0) {
    const points = [];
    for (const r of ROADS) {
      if (r.bridge) continue;
      const alongX = r.w > r.d;
      const length = alongX ? r.w : r.d;
      const half = (alongX ? r.d : r.w) / 2;
      for (const side of sides) {
        for (
          let s = -length / 2 + spacing / 2 + shift;
          s < length / 2;
          s += spacing
        ) {
          const x = alongX ? r.x + s : r.x + side * (half + offset);
          const z = alongX ? r.z + side * (half + offset) : r.z + s;
          if (onAnotherRoad(x, z, r, 1)) continue; // don't put things across junctions
          if (nearRoundabout(x, z, RB_OUTER + 4.5)) continue; // or on the roundabouts
          const dx = alongX ? 0 : -side; // the direction from this spot towards the road
          const dz = alongX ? -side : 0;
          points.push({
            x,
            z,
            road: r,
            alongX,
            side,
            dx,
            dz,
            towardsRoad: Math.atan2(dx, dz),
          });
        }
      }
    }
    return points;
  }

  // Solid areas, so he walks around things
  function addSolidBox(minX, maxX, minZ, maxZ) {
    buildings.push({ minX, maxX, minZ, maxZ });
  }
  function addSolid(x, z, size) {
    addSolidBox(x - size, x + size, z - size, z + size);
  }

  // Keep only spots that are at least minDistance apart
  function spaced(spots, minDistance) {
    const kept = [];
    for (const s of spots) {
      if (!kept.some((k) => Math.hypot(k.x - s.x, k.z - s.z) < minDistance))
        kept.push(s);
    }
    return kept;
  }

  const mainland = (p) => p.x < LAGOON.minX;
  const lekki = (p) => p.x > LAGOON.maxX && p.z < 34 && p.z > BEACH_Z;
  const near = (p, spots, dist) =>
    spots.some((q) => Math.hypot(p.x - q.x, p.z - q.z) < dist);

  // ---------- Rooftop water tanks ----------
  const tankGeometry = new THREE.CylinderGeometry(0.6, 0.65, 1.3, 16);
  tilePlaneUVs(tankGeometry, 3, 1); // ribs wrap round the tank
  tankGeometry.translate(0, 0.65, 0);
  instanced(
    tankGeometry,
    picture("/textures/tank.png", 0x1b1b1b, { roughness: 0.55 }),
    roofSpots,
  );

  // ---------- Road edges: painted kerb, then an open drain, then a concrete lip ----------
  // Each side of each road is one continuous stretch that stops exactly at junctions,
  // so the kerbs and drains of two roads meet neatly at the corner.
  function edgeRuns(offset, width) {
    const runs = [];
    for (const r of ROADS) {
      if (r.bridge) continue;
      const alongX = r.w > r.d;
      const start = alongX ? r.x - r.w / 2 : r.z - r.d / 2;
      const end = alongX ? r.x + r.w / 2 : r.z + r.d / 2;
      const half = (alongX ? r.d : r.w) / 2;

      for (const side of [-1, 1]) {
        const line = (alongX ? r.z : r.x) + side * (half + offset); // where this edge runs

        // The parts of this edge that other roads cross
        const blocked = [];
        for (const o of ROADS) {
          if (o === r) continue;
          const acrossMin = alongX ? o.z - o.d / 2 : o.x - o.w / 2;
          const acrossMax = alongX ? o.z + o.d / 2 : o.x + o.w / 2;
          if (line < acrossMin || line > acrossMax) continue; // this road doesn't cross this edge
          const alongMin = alongX ? o.x - o.w / 2 : o.z - o.d / 2;
          const alongMax = alongX ? o.x + o.w / 2 : o.z + o.d / 2;
          blocked.push([
            alongMin - offset + width / 2,
            alongMax + offset - width / 2,
          ]);
        }

        // ...and the roundabouts
        for (const rb of ROUNDABOUTS) {
          const h = Math.abs(line - (alongX ? rb.z : rb.x));
          const reach = RB_OUTER + offset; // stop exactly where this part's ring round the roundabout is
          if (h >= reach) continue;
          const half = Math.sqrt(reach * reach - h * h);
          const c = alongX ? rb.x : rb.z;
          blocked.push([c - half, c + half]);
        }

        // What's left becomes continuous stretches
        blocked.sort((a, b) => a[0] - b[0]);
        let from = start;
        for (const [b1, b2] of blocked) {
          if (b1 > from)
            runs.push({ alongX, line, from, to: Math.min(b1, end) });
          from = Math.max(from, b2);
        }
        if (from < end) runs.push({ alongX, line, from, to: end });
      }
    }
    return runs.filter((run) => run.to - run.from > 0.2);
  }

  // A long box along an edge stretch (for the kerb and the lip)
  function edgeBox(run, width, height, tileLength) {
    const length = run.to - run.from;
    const middle = (run.from + run.to) / 2;
    const w = run.alongX ? length : width;
    const d = run.alongX ? width : length;
    const geometry = new THREE.BoxGeometry(w, height, d);
    tileBoxUVs(geometry, w, height, d, tileLength, height); // the picture repeats along the stretch
    geometry.translate(
      run.alongX ? middle : run.line,
      height / 2,
      run.alongX ? run.line : middle,
    );
    return geometry;
  }

  const KERB_HEIGHT = 0.25;
  const LIP_HEIGHT = 0.2;

  // From the road outwards: kerb (0 to 0.2 m), drain (0.2 to 0.8 m), lip (0.8 to 0.9 m)
  const kerbGeometries = edgeRuns(0.1, 0.2).map((run, i) =>
    edgeBox(run, 0.2, KERB_HEIGHT + (i % 3) * 0.004, 2),
  );
  const lipGeometries = edgeRuns(3.45, 0.1).map((run, i) =>
    edgeBox(run, 0.1, LIP_HEIGHT + (i % 3) * 0.004, 3),
  );
  const gutterGeometries = edgeRuns(3.1, 0.6).map((run, i) => {
    const length = run.to - run.from;
    const middle = (run.from + run.to) / 2;
    const gutter = new THREE.PlaneGeometry(0.6, length);
    tilePlaneUVs(gutter, 1, Math.max(1, Math.round(length / 0.6)));
    swapUVs(gutter); // your picture's channel runs side to side, so turn it to run along the drain
    if (run.alongX) gutter.rotateZ(Math.PI / 2);
    gutter.rotateX(-Math.PI / 2);
    gutter.translate(
      run.alongX ? middle : run.line,
      0.05 + (i % 3) * 0.004,
      run.alongX ? run.line : middle,
    );
    return gutter;
  });

  const kerbMaterial = picture("/textures/kerb-paint.png", 0xbdbdb5, {
    side: THREE.DoubleSide,
  });
  const gutterMaterial = picture("/textures/gutter.png", 0x1f2a22, {
    roughness: 0.4,
  });
  const lipMaterial = picture("/textures/pole.png", 0x9e9a92, {
    side: THREE.DoubleSide,
  });
  const sidewalkMaterial = picture("/textures/sidewalk.png", 0xb0a89c, {
    side: THREE.DoubleSide,
  });
  const PAVING_TILE = 1.5; // metres covered by one copy of the paving picture

  // Pavements along every road: from the drain's lip back to the buildings
  const sidewalkGeometries = edgeRuns(1.5, 2.6).map((run, i) => {
    const length = run.to - run.from;
    const middle = (run.from + run.to) / 2;
    const pavement = new THREE.PlaneGeometry(2.6, length);
    tilePlaneUVs(pavement, 2.6 / PAVING_TILE, length / PAVING_TILE);
    if (run.alongX) pavement.rotateZ(Math.PI / 2);
    pavement.rotateX(-Math.PI / 2);
    pavement.translate(
      run.alongX ? middle : run.line,
      0.03 + (i % 3) * 0.004,
      run.alongX ? run.line : middle,
    );
    return pavement;
  });
  scene.add(
    new THREE.Mesh(mergeGeometries(sidewalkGeometries), sidewalkMaterial),
  );
  scene.add(new THREE.Mesh(mergeGeometries(kerbGeometries), kerbMaterial));

  const grassMaterial = picture("/textures/grass.png", 0x4e7d3a);
  const flowerSpots = [];
  const gardenWall = plainMat(0xeeeeea); // the low white garden wall
  const soil = plainMat(0x5b3a24); // dark soil in the flower beds
  const roadPaint = plainMat(0xf2f2f2); // white road markings
  const stone = picture("/textures/pole.png", 0xb5b0a6); // the statue's stone pedestal
  const PLINTH_TOP = 0.3 + 0.25 * 3; // the height of the top step, where the statue stands

  // ---------- Smooth curves for the roundabouts ----------
  // A flat curved band (a drain, a pavement, or the top of a kerb), between angles a1 and a2.
  // The picture runs along the curve, repeating every uLength metres.
  function arcBand(cx, cz, inner, outer, a1, a2, y, uLength, swapUV = false) {
    const segments = 32;
    const positions = [];
    const uvs = [];
    const indices = [];
    const arcLength = ((inner + outer) / 2) * (a2 - a1);
    for (let i = 0; i <= segments; i++) {
      const a = a1 + ((a2 - a1) * i) / segments;
      const u = (arcLength / uLength) * (i / segments);
      for (const [r, v] of [
        [inner, 0],
        [outer, 1],
      ]) {
        positions.push(cx + Math.cos(a) * r, y, cz + Math.sin(a) * r);
        uvs.push(...(swapUV ? [v, u] : [u, v]));
      }
    }
    for (let i = 0; i < segments; i++) {
      const p = i * 2;
      indices.push(p, p + 2, p + 1, p + 1, p + 2, p + 3); // facing up
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
  }

  // A curved upright wall (one face of a kerb or a lip), between angles a1 and a2
  function arcWall(cx, cz, radius, a1, a2, height, uLength) {
    const segments = 32;
    const positions = [];
    const uvs = [];
    const indices = [];
    const arcLength = radius * (a2 - a1);
    for (let i = 0; i <= segments; i++) {
      const a = a1 + ((a2 - a1) * i) / segments;
      const u = (arcLength / uLength) * (i / segments);
      for (const [y, v] of [
        [0, 0],
        [height, 1],
      ]) {
        positions.push(cx + Math.cos(a) * radius, y, cz + Math.sin(a) * radius);
        uvs.push(u, v);
      }
    }
    for (let i = 0; i < segments; i++) {
      const p = i * 2;
      indices.push(p, p + 2, p + 1, p + 1, p + 2, p + 3);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
  }

  // ---------- Roundabouts ----------
  for (const rb of ROUNDABOUTS) {
    // The circular road
    const disc = new THREE.CircleGeometry(RB_OUTER, 48);
    tilePlaneUVs(disc, (RB_OUTER * 2) / ROAD_TILE, (RB_OUTER * 2) / ROAD_TILE);
    disc.rotateX(-Math.PI / 2);
    disc.translate(rb.x, 0.085, rb.z);
    scene.add(new THREE.Mesh(disc, asphalt));

    // ----- The middle: painted kerb, paving, a low white wall, lawn, flower beds and a stone pedestal -----
    const FULL = Math.PI * 2;
    const middleParts = { kerb: [], pave: [], wall: [], soil: [] };

    // Painted kerb all round the middle
    middleParts.kerb.push(arcWall(rb.x, rb.z, RB_MIDDLE, 0, FULL, 0.3, 2));
    middleParts.kerb.push(
      arcBand(rb.x, rb.z, RB_MIDDLE - 0.25, RB_MIDDLE, 0, FULL, 0.3, 2),
    );

    // A ring of paving just inside the kerb
    middleParts.pave.push(
      arcBand(
        rb.x,
        rb.z,
        RB_MIDDLE - 1.2,
        RB_MIDDLE - 0.25,
        0,
        FULL,
        0.3,
        PAVING_TILE,
      ),
    );

    // A low white garden wall
    middleParts.wall.push(
      arcWall(rb.x, rb.z, RB_MIDDLE - 1.2, 0, FULL, 0.7, 3),
    );
    middleParts.wall.push(
      arcWall(rb.x, rb.z, RB_MIDDLE - 1.45, 0, FULL, 0.7, 3),
    );
    middleParts.wall.push(
      arcBand(rb.x, rb.z, RB_MIDDLE - 1.45, RB_MIDDLE - 1.2, 0, FULL, 0.7, 3),
    );

    // The lawn inside the wall
    const lawn = new THREE.CircleGeometry(RB_MIDDLE - 1.45, 48);
    tilePlaneUVs(
      lawn,
      ((RB_MIDDLE - 1.45) * 2) / 3,
      ((RB_MIDDLE - 1.45) * 2) / 3,
    );
    lawn.rotateX(-Math.PI / 2);
    lawn.translate(rb.x, 0.32, rb.z);
    scene.add(new THREE.Mesh(lawn, grassMaterial));

    // Outer flower bed: a ring of soil just inside the wall, packed with flowering bushes
    middleParts.soil.push(
      arcBand(rb.x, rb.z, RB_MIDDLE - 2.6, RB_MIDDLE - 1.45, 0, FULL, 0.34, 2),
    );
    for (let a = 0; a < FULL; a += 0.3) {
      flowerSpots.push({
        x: rb.x + Math.cos(a) * (RB_MIDDLE - 2),
        z: rb.z + Math.sin(a) * (RB_MIDDLE - 2),
        y: 0.34,
        turn: a,
      });
    }

    // Inner flower bed round the pedestal
    middleParts.soil.push(arcBand(rb.x, rb.z, 1.6, 2.6, 0, FULL, 0.34, 2));
    for (let a = 0; a < FULL; a += 0.55) {
      flowerSpots.push({
        x: rb.x + Math.cos(a) * 2.1,
        z: rb.z + Math.sin(a) * 2.1,
        y: 0.34,
        turn: a + 0.5,
      });
    }

    scene.add(new THREE.Mesh(mergeGeometries(middleParts.kerb), kerbMaterial));
    scene.add(
      new THREE.Mesh(mergeGeometries(middleParts.pave), sidewalkMaterial),
    );
    scene.add(new THREE.Mesh(mergeGeometries(middleParts.wall), gardenWall));
    scene.add(new THREE.Mesh(mergeGeometries(middleParts.soil), soil));

    // A stepped stone pedestal for the statue: three square steps, each smaller than the one below
    [3.2, 2.6, 2.0].forEach((size, step) => {
      const block = new THREE.Mesh(
        new THREE.BoxGeometry(size, 0.25, size),
        stone,
      );
      block.position.set(rb.x, 0.3 + 0.125 + step * 0.25, rb.z);
      scene.add(block);
    });

    addSolid(rb.x, rb.z, RB_MIDDLE * 0.75); // he can't walk through the middle

    // ----- Road markings: a white line round the middle, and dashed give-way lines where each road joins -----
    const markings = [];
    markings.push(
      arcBand(rb.x, rb.z, RB_MIDDLE + 0.3, RB_MIDDLE + 0.45, 0, FULL, 0.09, 4),
    );
    const joinOpening = Math.asin(Math.min(1, 5 / (RB_OUTER - 0.5)));
    for (const arm of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
      for (let a = arm - joinOpening; a < arm + joinOpening; a += 0.09) {
        markings.push(
          arcBand(
            rb.x,
            rb.z,
            RB_OUTER - 0.7,
            RB_OUTER - 0.4,
            a,
            a + 0.05,
            0.09,
            1,
          ),
        ); // one dash
      }
    }
    scene.add(new THREE.Mesh(mergeGeometries(markings), roadPaint));

    addSolid(rb.x, rb.z, RB_MIDDLE * 0.75); // he can't walk through the middle

    // Round the outside, in four smooth quarters between the roads:
    // painted kerb, pavement, drain and lip, in the same order as the straight roads
    const kerbParts = [];
    const paveParts = [];
    const drainParts = [];
    const lipParts = [];

    // Where each part's quarter starts and ends, so it meets its straight part exactly
    const quarters = (offset) => {
      const opening = Math.asin(
        Math.min(1, (5 + offset) / (RB_OUTER + offset)),
      );
      const list = [];
      for (let k = 0; k < 4; k++) {
        list.push([
          (k * Math.PI) / 2 + opening,
          ((k + 1) * Math.PI) / 2 - opening,
        ]);
      }
      return list;
    };

    // Painted kerb: a wall on each side and a top (from the road edge out to 0.2 m)
    for (const [a1, a2] of quarters(0.1)) {
      kerbParts.push(arcWall(rb.x, rb.z, RB_OUTER, a1, a2, KERB_HEIGHT, 2));
      kerbParts.push(
        arcWall(rb.x, rb.z, RB_OUTER + 0.2, a1, a2, KERB_HEIGHT, 2),
      );
      kerbParts.push(
        arcBand(rb.x, rb.z, RB_OUTER, RB_OUTER + 0.2, a1, a2, KERB_HEIGHT, 2),
      );
    }

    // Pavement (0.2 m to 2.8 m)
    for (const [a1, a2] of quarters(1.5)) {
      paveParts.push(
        arcBand(
          rb.x,
          rb.z,
          RB_OUTER + 0.2,
          RB_OUTER + 2.8,
          a1,
          a2,
          0.03,
          PAVING_TILE,
        ),
      );
    }

    // Drain (2.8 m to 3.4 m), with its water running along the curve
    for (const [a1, a2] of quarters(3.1)) {
      drainParts.push(
        arcBand(
          rb.x,
          rb.z,
          RB_OUTER + 2.8,
          RB_OUTER + 3.4,
          a1,
          a2,
          0.05,
          1.8,
          true,
        ),
      );
    }

    // Concrete lip (3.4 m to 3.5 m)
    for (const [a1, a2] of quarters(3.45)) {
      lipParts.push(arcWall(rb.x, rb.z, RB_OUTER + 3.4, a1, a2, LIP_HEIGHT, 3));
      lipParts.push(arcWall(rb.x, rb.z, RB_OUTER + 3.5, a1, a2, LIP_HEIGHT, 3));
      lipParts.push(
        arcBand(
          rb.x,
          rb.z,
          RB_OUTER + 3.4,
          RB_OUTER + 3.5,
          a1,
          a2,
          LIP_HEIGHT,
          3,
        ),
      );
    }

    scene.add(new THREE.Mesh(mergeGeometries(kerbParts), kerbMaterial));
    scene.add(new THREE.Mesh(mergeGeometries(paveParts), sidewalkMaterial));
    scene.add(new THREE.Mesh(mergeGeometries(drainParts), gutterMaterial));
    scene.add(new THREE.Mesh(mergeGeometries(lipParts), lipMaterial));
  }

  // The flowering bushes: two crossed pictures each, so they look full from every side
  const bushGeometry = mergeGeometries([
    new THREE.PlaneGeometry(1.5, 1).translate(0, 0.5, 0),
    new THREE.PlaneGeometry(1.5, 1).rotateY(Math.PI / 2).translate(0, 0.5, 0),
  ]);
  instanced(
    bushGeometry,
    picture("/textures/flowers.png", 0x3c8d2f, {
      alphaTest: 0.5,
      side: THREE.DoubleSide,
    }),
    flowerSpots,
  );

  // ---------- A statue in the middle of each roundabout ----------
  const STATUE_HEIGHT = 4.5; // metres, including its stone plinth
  new GLTFLoader().load(
    "/models/statue.glb",
    (gltf) => {
      const model = gltf.scene;
      model.traverse((obj) => {
        if (obj.isMesh) {
          obj.castShadow = true;
          obj.receiveShadow = true;
        }
      });

      // Size it, centre it, and stand it on the ground
      let box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      model.scale.multiplyScalar(STATUE_HEIGHT / size.y);
      box = new THREE.Box3().setFromObject(model);
      const center = box.getCenter(new THREE.Vector3());
      model.position.x -= center.x;
      model.position.z -= center.z;
      model.position.y -= box.min.y;

      for (const rb of ROUNDABOUTS) {
        const holder = new THREE.Group();
        holder.position.set(rb.x, PLINTH_TOP, rb.z); // on top of the stone pedestal
        // Each statue faces the bridge, so you see its front as you arrive
        holder.rotation.y = rb.x < LAGOON.minX ? Math.PI / 2 : -Math.PI / 2;
        holder.add(model.clone());
        scene.add(holder);
      }
    },
    undefined,
    () => console.warn("No statue.glb yet: the roundabouts have flowers only"),
  );

  scene.add(
    new THREE.Mesh(
      mergeGeometries(gutterGeometries),
      picture("/textures/gutter.png", 0x1f2a22, { roughness: 0.4 }),
    ),
  );
  scene.add(
    new THREE.Mesh(
      mergeGeometries(lipGeometries),
      picture("/textures/pole.png", 0x9e9a92),
    ),
  );

  // ---------- Electric poles and sagging power lines ----------
  const POLE_HEIGHT = 8.5;
  const poleMaterial = picture("/textures/pole.png", 0x9e9e98);
  const poleSpots = alongRoads(4.0, 25, [1]); // one side of each road, behind the drain
  poleSpots.forEach((p) => (p.turn = p.alongX ? Math.PI / 2 : 0)); // cross-arm across the road

  const poleGeometry = new THREE.CylinderGeometry(0.1, 0.16, POLE_HEIGHT, 8);
  tilePlaneUVs(poleGeometry, 1, 3);
  poleGeometry.translate(0, POLE_HEIGHT / 2, 0);
  instanced(poleGeometry, poleMaterial, poleSpots);
  const armGeometry = new THREE.BoxGeometry(1.6, 0.1, 0.1);
  armGeometry.translate(0, POLE_HEIGHT - 0.4, 0);
  instanced(armGeometry, poleMaterial, poleSpots);
  poleSpots.forEach((p) => addSolid(p.x, p.z, 0.2));

  const wirePoints = [];
  const WIRE_SAG = 0.6;
  for (let i = 1; i < poleSpots.length; i++) {
    const a = poleSpots[i - 1];
    const b = poleSpots[i];
    if (a.road !== b.road || Math.hypot(a.x - b.x, a.z - b.z) > 30) continue; // only neighbouring poles
    for (const along of [-0.7, 0, 0.7]) {
      const ox = a.alongX ? 0 : along;
      const oz = a.alongX ? along : 0;
      const top = POLE_HEIGHT - 0.35;
      for (let s = 0; s < 8; s++) {
        for (const t of [s / 8, (s + 1) / 8]) {
          const sag = WIRE_SAG * (1 - (2 * t - 1) ** 2);
          wirePoints.push(
            a.x + (b.x - a.x) * t + ox,
            top - sag,
            a.z + (b.z - a.z) * t + oz,
          );
        }
      }
    }
  }
  const wireGeometry = new THREE.BufferGeometry();
  wireGeometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(wirePoints, 3),
  );
  scene.add(
    new THREE.LineSegments(
      wireGeometry,
      new THREE.LineBasicMaterial({ color: 0x222222 }),
    ),
  );

  // ---------- Street lights (a cut-out picture, between the poles, arm reaching over the road) ----------
  const LIGHT_HEIGHT = 8;
  const LIGHT_WIDTH = LIGHT_HEIGHT / 3; // the picture is 1:3
  const LIGHT_POLE_AT = 0.2; // where the pole is across the picture (0 = left edge, 1 = right edge)
  const lightGeometry = new THREE.PlaneGeometry(LIGHT_WIDTH, LIGHT_HEIGHT);
  lightGeometry.translate(
    LIGHT_WIDTH * (0.5 - LIGHT_POLE_AT),
    LIGHT_HEIGHT / 2,
    0,
  );
  const lightSpots = alongRoads(2.6, 25, [1], 12.5); // on the pavement's outer edge, by the drain
  lightSpots.forEach((p) => (p.turn = Math.atan2(-p.dz, p.dx))); // the picture's arm points at the road
  const lightMaterial = picture("/textures/streetlight.png", 0x888888, {
    alphaTest: 0.5,
    side: THREE.DoubleSide,
  });
  instanced(lightGeometry, lightMaterial, lightSpots);

  // Street lights along the bridge too, every 12 m on one side
  const bridgeRoad = ROADS.find((r) => r.bridge);
  const bridgeLights = [];
  for (
    let x = bridgeRoad.x - bridgeRoad.w / 2 + 6;
    x < bridgeRoad.x + bridgeRoad.w / 2;
    x += 12
  ) {
    bridgeLights.push({
      x,
      z: bridgeRoad.z + bridgeRoad.d / 2 + 0.3,
      turn: Math.PI / 2,
    });
  }
  instanced(lightGeometry, lightMaterial, bridgeLights);
  lightSpots.forEach((p) => addSolid(p.x, p.z, 0.15));

  const PALM_SPACING = 40; // at least this many metres between roadside palms
  const palmSpots = spaced(
    alongRoads(4.0, 18, [-1]).filter(
      (p) => decorRand() < (p.x > LAGOON.maxX || p.z < -40 ? 0.6 : 0.3),
    ),
    PALM_SPACING,
  ).map((p) => ({
    x: p.x,
    z: p.z,
    turn: decorRand() * Math.PI * 2,
    scale: 0.85 + decorRand() * 0.35,
  }));
  for (let i = 0; i < 12; i++) {
    // a row of palms along Lekki Beach
    palmSpots.push({
      x: 70 + decorRand() * 120,
      z: BEACH_Z - 2 - decorRand() * 14,
      turn: decorRand() * Math.PI * 2,
      scale: 0.9 + decorRand() * 0.4,
    });
  }

  const trunkGeometry = new THREE.CylinderGeometry(0.14, 0.24, 6.5, 8);
  tilePlaneUVs(trunkGeometry, 1, 3);
  trunkGeometry.translate(0, 3.25, 0);
  instanced(
    trunkGeometry,
    picture("/textures/palm-trunk.png", 0x7a5c45),
    palmSpots,
  );

  const frondParts = [];
  for (let i = 0; i < 10; i++) {
    const frond = new THREE.PlaneGeometry(0.9, 2.8, 1, 8);
    frond.rotateX(Math.PI / 2); // lie flat
    frond.translate(0, 0, 1.4); // reach outwards from the trunk
    const pos = frond.attributes.position;
    for (let v = 0; v < pos.count; v++) {
      const z = pos.getZ(v);
      pos.setY(v, pos.getY(v) + 0.35 * z - 0.18 * z * z); // rise, then droop
    }
    frond.computeVertexNormals();
    frond.rotateZ((decorRand() - 0.5) * 0.3);
    frond.rotateY((i / 10) * Math.PI * 2 + decorRand() * 0.3);
    frond.translate(0, 6.4, 0);
    frondParts.push(frond);
  }
  instanced(
    mergeGeometries(frondParts),
    picture("/textures/palm-frond.png", 0x3c8d2f, {
      alphaTest: 0.5,
      side: THREE.DoubleSide,
      roughness: 0.8,
    }),
    palmSpots,
  );
  palmSpots.forEach((p) => addSolid(p.x, p.z, 0.3));

  // ---------- Billboards with made-up adverts, raised on legs, facing the road ----------
  const BOARD_W = 7;
  const BOARD_H = 3.5;
  const BOARD_BOTTOM = 5;
  const steel = plainMat(0x555555);
  const boardSpots = alongRoads(4.8, 85, [-1, 1], 40).filter((p) => !lekki(p));
  boardSpots.forEach((p) => (p.turn = p.towardsRoad));

  const boardGeometry = new THREE.PlaneGeometry(BOARD_W, BOARD_H);
  boardGeometry.translate(0, BOARD_BOTTOM + BOARD_H / 2, 0);
  const backGeometry = new THREE.BoxGeometry(
    BOARD_W + 0.3,
    BOARD_H + 0.3,
    0.15,
  );
  backGeometry.translate(0, BOARD_BOTTOM + BOARD_H / 2, -0.1);
  const legGeometry = new THREE.BoxGeometry(0.25, BOARD_BOTTOM, 0.25);
  const legsGeometry = mergeGeometries([
    legGeometry.clone().translate(-BOARD_W / 3, BOARD_BOTTOM / 2, -0.1),
    legGeometry.clone().translate(BOARD_W / 3, BOARD_BOTTOM / 2, -0.1),
  ]);
  instanced(backGeometry, steel, boardSpots);
  instanced(legsGeometry, steel, boardSpots);
  [1, 2, 3].forEach((n) => {
    instanced(
      boardGeometry,
      picture(`/textures/billboard-${n}.png`, 0xdddddd, { roughness: 0.6 }),
      boardSpots.filter((_, i) => i % 3 === n - 1), // the three adverts take turns
    );
  });
  boardSpots.forEach((p) => {
    const ax = p.alongX ? 1 : 0;
    const az = p.alongX ? 0 : 1;
    addSolid(p.x + ax * (BOARD_W / 3), p.z + az * (BOARD_W / 3), 0.2); // the two legs
    addSolid(p.x - ax * (BOARD_W / 3), p.z - az * (BOARD_W / 3), 0.2);
  });

  // ---------- Kiosks (real photos on the front and sides, zinc on top), facing the road ----------
  const KIOSK_SPACING = 45; // at least this many metres between kiosks
  const kioskSpots = spaced(
    alongRoads(4.4, 23, [-1, 1], 7).filter(
      (p) =>
        !lekki(p) &&
        !near(p, boardSpots, 5) &&
        decorRand() < (mainland(p) ? 0.5 : 0.15),
    ),
    KIOSK_SPACING,
  );
  // ---------- Kiosks: the real 3D model ----------
  const KIOSK_HEIGHT = 3.2; // metres from the ground to the top of its roof
  const KIOSK_TURN_FIX = 0; // change to Math.PI if the kiosks face away from the road
  new GLTFLoader().load(
    "/models/kiosk.glb",
    (gltf) => {
      const model = gltf.scene;
      model.traverse((obj) => {
        if (obj.isMesh) {
          obj.castShadow = true;
          obj.receiveShadow = true;
          const mats = Array.isArray(obj.material)
            ? obj.material
            : [obj.material];
          mats.forEach((m) => {
            m.metalness = Math.min(m.metalness ?? 0, 0.3);
          }); // not too shiny or dark
        }
      });

      // Size it, centre it, and stand it on the ground
      let box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      model.scale.multiplyScalar(KIOSK_HEIGHT / size.y);
      box = new THREE.Box3().setFromObject(model);
      const center = box.getCenter(new THREE.Vector3());
      model.position.x -= center.x;
      model.position.z -= center.z;
      model.position.y -= box.min.y;

      // A kiosk at every spot, facing the road
      for (const p of kioskSpots) {
        const holder = new THREE.Group();
        holder.position.set(p.x, 0, p.z);
        holder.rotation.y = (p.turn ?? 0) + KIOSK_TURN_FIX;
        holder.add(model.clone());
        scene.add(holder);
      }
    },
    undefined,
    () => console.warn("No kiosk.glb found: no kiosks shown"),
  );

  kioskSpots.forEach((p) => (p.turn = p.towardsRoad));
  kioskSpots.forEach((p) => {
    if (p.alongX) addSolidBox(p.x - 1.1, p.x + 1.1, p.z - 0.7, p.z + 0.7);
    else addSolidBox(p.x - 0.7, p.x + 0.7, p.z - 1.1, p.z + 1.1);
  });

  // ---------- Generators outside buildings, on the mainland ----------
  const genSide = plainMat(0x6e1a1a);
  const genMaterials = [
    genSide,
    genSide,
    genSide,
    genSide,
    picture("/textures/generator-front.png", 0x8b1e1e), // front, facing the road
    genSide,
  ];
  const genGeometry = new THREE.BoxGeometry(0.8, 0.6, 0.55);
  genGeometry.translate(0, 0.3, 0);
  const genSpots = alongRoads(3.1, 17, [-1, 1], 3).filter(
    (p) =>
      mainland(p) &&
      !near(p, kioskSpots, 2.5) &&
      !near(p, boardSpots, 4) &&
      decorRand() < 0,
  );
  genSpots.forEach((p) => (p.turn = p.towardsRoad));
  instanced(genGeometry, genMaterials, genSpots);
  genSpots.forEach((p) => addSolid(p.x, p.z, 0.45));

  // ---------- A compound wall with a gate in front of each Lekki villa, facing its nearest road ----------
  const FENCE_GAP = 1.8; // space between the villa and its front wall
  const GATE_WIDTH = 3;
  const WALL_HEIGHT = 2.4;
  const wallGeometries = [];
  const gateSpots = [];

  for (const v of villaPlots) {
    const cx = (v.minX + v.maxX) / 2;
    const cz = (v.minZ + v.maxZ) / 2;

    // Find the closest road this villa sits beside
    let best = null;
    for (const r of ROADS) {
      if (r.bridge) continue;
      const alongX = r.w > r.d;
      const beside = alongX
        ? cx > r.x - r.w / 2 && cx < r.x + r.w / 2
        : cz > r.z - r.d / 2 && cz < r.z + r.d / 2;
      const dist = alongX ? Math.abs(cz - r.z) : Math.abs(cx - r.x);
      if (beside && (!best || dist < best.dist)) best = { r, alongX, dist };
    }
    if (!best || best.dist > 30) continue; // not near a road: no front wall

    // The wall runs along the villa's front, between the villa and the road
    const { r, alongX } = best;
    const line = alongX
      ? r.z > cz
        ? v.maxZ + FENCE_GAP
        : v.minZ - FENCE_GAP
      : r.x > cx
        ? v.maxX + FENCE_GAP
        : v.minX - FENCE_GAP;
    const from = alongX ? v.minX : v.minZ;
    const to = alongX ? v.maxX : v.maxZ;
    const middle = (from + to) / 2;

    // Two stretches of wall, with the gate in the middle
    for (const [a, b] of [
      [from, middle - GATE_WIDTH / 2],
      [middle + GATE_WIDTH / 2, to],
    ]) {
      const length = b - a;
      if (length < 0.5) continue;
      const w = alongX ? length : 0.2;
      const d = alongX ? 0.2 : length;
      const wall = new THREE.BoxGeometry(w, WALL_HEIGHT, d);
      tileBoxUVs(wall, w, WALL_HEIGHT, d, 4.8, WALL_HEIGHT);
      const c = (a + b) / 2;
      wall.translate(alongX ? c : line, WALL_HEIGHT / 2, alongX ? line : c);
      wallGeometries.push(wall);
      if (alongX) addSolidBox(a, b, line - 0.15, line + 0.15);
      else addSolidBox(line - 0.15, line + 0.15, a, b);
    }
    gateSpots.push({
      x: alongX ? middle : line,
      z: alongX ? line : middle,
      turn: alongX ? 0 : Math.PI / 2,
    });
    addSolid(alongX ? middle : line, alongX ? line : middle, GATE_WIDTH / 2);
  }

  if (wallGeometries.length) {
    scene.add(
      new THREE.Mesh(
        mergeGeometries(wallGeometries),
        picture("/textures/fence-wall.png", 0xe8dcc0),
      ),
    );
  }
  const gateMat = picture("/textures/gate.png", 0x1a1a1a);
  const gateFrame = plainMat(0x1a1a1a);
  const gateGeometry = new THREE.BoxGeometry(GATE_WIDTH, WALL_HEIGHT, 0.25);
  gateGeometry.translate(0, WALL_HEIGHT / 2, 0);
  instanced(
    gateGeometry,
    [gateFrame, gateFrame, gateFrame, gateFrame, gateMat, gateMat],
    gateSpots,
  );

  // ---------- Collisions ----------
  // Returns true if a circle of radius r at (x, z) would hit something
  function isBlocked(x, z, r) {
    // Edge of the map
    if (Math.abs(x) > 198 - r || Math.abs(z) > 198 - r) return true;

    // The lagoon (unless you're on the bridge)
    const inLagoon = x + r > LAGOON.minX && x - r < LAGOON.maxX;
    const onBridge = Math.abs(z - BRIDGE.z) < BRIDGE.halfWidth - r;
    if (inLagoon && !onBridge) return true;

    // The Atlantic
    if (x + r > LAGOON.maxX && z - r < OCEAN_Z) return true;

    // Buildings
    return hitsBuilding(x, z, r);
  }

  // Is a circle at (x, z) touching a building? (also used by the camera)
  function hitsBuilding(x, z, r) {
    return buildings.some(
      (b) =>
        x + r > b.minX && x - r < b.maxX && z + r > b.minZ && z - r < b.maxZ,
    );
  }

  // ---------- Which district are you in? ----------
  function getDistrict(x, z) {
    if (x > LAGOON.minX && x < LAGOON.maxX) return "Third Mainland Bridge";
    if (x >= LAGOON.maxX && z < BEACH_Z) return "Lekki Beach";
    for (const rb of ROUNDABOUTS) {
      if (Math.hypot(x - rb.x, z - rb.z) < RB_OUTER) return rb.name;
    }
    for (const d of DISTRICTS) {
      if (
        x >= d.minX - 5 &&
        x <= d.maxX + 5 &&
        z >= d.minZ - 6 &&
        z <= d.maxZ + 6
      ) {
        return d.name;
      }
    }
    return "Lagos";
  }

  // The water slowly drifts, so it looks like it's moving
  function update(dt) {
    const water = pictures["/textures/water.png"];
    if (water && water.texture) {
      water.texture.offset.x += dt * 0.01;
      water.texture.offset.y += dt * 0.006;
    }
  }

  return {
    isBlocked,
    getDistrict,
    hitsBuilding,
    update,
    generatorSpots: genSpots, // where generators are, for their sound
    kioskSpots, // where kiosks are, for their music
  };
}
