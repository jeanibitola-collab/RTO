import * as THREE from "three";

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
];

const DISTRICTS = [
  {
    name: "Ikeja",
    minX: -195,
    maxX: 18,
    minZ: 46,
    maxZ: 195,
    minH: 6,
    maxH: 16,
    colors: [0xd7ccc8, 0xbcaaa4, 0xffe0b2, 0xc5cae9, 0xe0e0e0, 0xa5d6a7],
  },
  {
    name: "Yaba",
    minX: -195,
    maxX: 18,
    minZ: -195,
    maxZ: 34,
    minH: 3,
    maxH: 9,
    colors: [
      0xef5350, 0x42a5f5, 0x66bb6a, 0xffca28, 0xab47bc, 0xff7043, 0xffffff,
    ],
  },
  {
    name: "Lagos Island",
    minX: 62,
    maxX: 195,
    minZ: 46,
    maxZ: 195,
    minH: 20,
    maxH: 55,
    colors: [0x90a4ae, 0x78909c, 0x4fc3f7, 0xb0bec5, 0x546e7a],
  },
  {
    name: "Lekki",
    minX: 62,
    maxX: 195,
    minZ: -160,
    maxZ: 34,
    minH: 4,
    maxH: 9,
    colors: [0xfafafa, 0xfff8e1, 0xf5f5dc, 0xffe0b2],
  },
];

// ---------- Build the city ----------
export function buildLagos(scene) {
  const buildings = []; // saved for collisions
  const materials = {};
  const mat = (color) =>
    materials[color] ||
    (materials[color] = new THREE.MeshStandardMaterial({ color }));

  // Helper: a flat rectangle on the ground
  function addPlane(minX, maxX, minZ, maxZ, y, color) {
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(maxX - minX, maxZ - minZ),
      mat(color),
    );
    plane.rotation.x = -Math.PI / 2;
    plane.position.set((minX + maxX) / 2, y, (minZ + maxZ) / 2);
    scene.add(plane);
  }

  // Land, water and beach
  addPlane(-200, 200, -200, 200, 0, 0xb5653a); // red earth
  addPlane(LAGOON.minX, LAGOON.maxX, -200, 200, 0.02, 0x2e6f8e); // the lagoon
  addPlane(LAGOON.maxX, 200, -200, OCEAN_Z, 0.02, 0x1f5f8b); // Atlantic Ocean
  addPlane(LAGOON.maxX, 200, OCEAN_Z, BEACH_Z, 0.015, 0xe8d3a2); // Lekki Beach

  // Roads
  for (const r of ROADS) {
    addPlane(
      r.x - r.w / 2,
      r.x + r.w / 2,
      r.z - r.d / 2,
      r.z + r.d / 2,
      r.bridge ? 0.05 : 0.03,
      r.bridge ? 0x6b6b6b : 0x3a3a3a,
    );
  }

  // Bridge railings
  for (const side of [-1, 1]) {
    const rail = new THREE.Mesh(
      new THREE.BoxGeometry(LAGOON.maxX - LAGOON.minX, 1, 0.4),
      mat(0xdddddd),
    );
    rail.position.set(
      (LAGOON.minX + LAGOON.maxX) / 2,
      0.5,
      BRIDGE.z + side * (BRIDGE.halfWidth + 0.2),
    );
    scene.add(rail);
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

  // Buildings: fill each district on a grid, skipping roads and some empty plots
  for (const d of DISTRICTS) {
    for (let x = d.minX + 7; x < d.maxX - 7; x += 14) {
      for (let z = d.minZ + 7; z < d.maxZ - 7; z += 14) {
        if (rand() < 0.25) continue; // empty plot

        const w = 6 + rand() * 5;
        const dep = 6 + rand() * 5;
        const h = d.minH + rand() * (d.maxH - d.minH);
        const bx = x + (rand() - 0.5) * 2;
        const bz = z + (rand() - 0.5) * 2;
        const box = {
          minX: bx - w / 2,
          maxX: bx + w / 2,
          minZ: bz - dep / 2,
          maxZ: bz + dep / 2,
        };
        if (touchesRoad(box.minX, box.maxX, box.minZ, box.maxZ, 2)) continue;

        const color = d.colors[Math.floor(rand() * d.colors.length)];
        const building = new THREE.Mesh(
          new THREE.BoxGeometry(w, h, dep),
          mat(color),
        );
        building.position.set(bx, h / 2, bz);
        scene.add(building);
        buildings.push(box);
      }
    }
  }

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
    return buildings.some(
      (b) =>
        x + r > b.minX && x - r < b.maxX && z + r > b.minZ && z - r < b.maxZ,
    );
  }

  // ---------- Which district are you in? ----------
  function getDistrict(x, z) {
    if (x > LAGOON.minX && x < LAGOON.maxX) return "Third Mainland Bridge";
    if (x >= LAGOON.maxX && z < BEACH_Z) return "Lekki Beach";
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

  // Is a circle at (x, z) touching a building? (used by the camera)
  function hitsBuilding(x, z, r) {
    return buildings.some(
      (b) =>
        x + r > b.minX && x - r < b.maxX && z + r > b.minZ && z - r < b.maxZ,
    );
  }

  return { isBlocked, getDistrict, hitsBuilding };
}
