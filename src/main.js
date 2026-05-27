import * as THREE from "three";
import "./styles.css";

const FT = 1;
const CEILING_HEIGHT = 8 * FT;
const EYE_HEIGHT = 6 * FT;
const WALL_THICKNESS = 0.32;
const DOOR_WIDTH = 3;

const ROOM_COLORS = {
  bedroom: 0xcdd8dd,
  bath: 0xd9e8ea,
  closet: 0xd8d2c4,
  living: 0xd7d9d2,
  dining: 0xe1d6c5,
  kitchen: 0xd6dde0,
  utility: 0xd2d4cf,
  patio: 0xc9d7c0,
};

const app = document.querySelector("#app");
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xaeb7bb);
scene.fog = new THREE.Fog(0xaeb7bb, 45, 90);

const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 160);
camera.position.set(20, EYE_HEIGHT, 7);
const planCamera = new THREE.OrthographicCamera(-30, 30, 18, -18, 0.05, 120);
planCamera.position.set(24.5, 60, 11.5);
planCamera.lookAt(24.5, 0, 11.5);
let activeCamera = camera;

const keys = new Set();
const colliders = [];
const clock = new THREE.Clock();
const playerRadius = 0.45;
const moveVector = new THREE.Vector3();
const viewForward = new THREE.Vector3();
const viewRight = new THREE.Vector3();
let isTopDown = false;
let fallbackLookActive = false;
let fallbackYaw = 0;
let fallbackPitch = 0;

const materials = {
  wall: new THREE.MeshStandardMaterial({ color: 0xf3f0e8, roughness: 0.92 }),
  wallTop: new THREE.MeshStandardMaterial({ color: 0x2c2f33, roughness: 0.8 }),
  door: new THREE.MeshStandardMaterial({ color: 0x8d6a4f, roughness: 0.62 }),
  trim: new THREE.MeshStandardMaterial({ color: 0x262626, roughness: 0.7 }),
  glass: new THREE.MeshStandardMaterial({ color: 0x9ec5d6, transparent: true, opacity: 0.42, roughness: 0.15 }),
  wood: new THREE.MeshStandardMaterial({ color: 0x9b6d4a, roughness: 0.65 }),
  fabric: new THREE.MeshStandardMaterial({ color: 0x657d89, roughness: 0.9 }),
  counter: new THREE.MeshStandardMaterial({ color: 0xe9e5db, roughness: 0.55 }),
  steel: new THREE.MeshStandardMaterial({ color: 0xb9bec2, metalness: 0.4, roughness: 0.38 }),
  black: new THREE.MeshStandardMaterial({ color: 0x1f2529, roughness: 0.55 }),
  white: new THREE.MeshStandardMaterial({ color: 0xf7f4ec, roughness: 0.5 }),
  water: new THREE.MeshStandardMaterial({ color: 0x8fc0cb, roughness: 0.25 }),
  plant: new THREE.MeshStandardMaterial({ color: 0x587b55, roughness: 0.8 }),
};

function makeBox(name, x, y, z, w, h, d, material, castShadow = true, receiveShadow = true) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.name = name;
  mesh.position.set(x, y + h / 2, z);
  mesh.castShadow = castShadow;
  mesh.receiveShadow = receiveShadow;
  scene.add(mesh);
  return mesh;
}

function addFloor(name, x, z, w, d, color) {
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.86 });
  const floor = makeBox(name, x + w / 2, -0.04, z + d / 2, w, 0.08, d, mat, false, true);
  floor.userData.room = name;
  return floor;
}

function addWall(x1, z1, x2, z2, name = "wall") {
  const dx = x2 - x1;
  const dz = z2 - z1;
  const length = Math.hypot(dx, dz);
  const angle = Math.atan2(dz, dx);
  const wall = makeBox(
    name,
    (x1 + x2) / 2,
    0,
    (z1 + z2) / 2,
    length,
    CEILING_HEIGHT,
    WALL_THICKNESS,
    materials.wall,
  );
  wall.rotation.y = -angle;
  wall.updateMatrixWorld();
  colliders.push(new THREE.Box3().setFromObject(wall));

  const cap = makeBox(`${name}-cap`, (x1 + x2) / 2, CEILING_HEIGHT + 0.02, (z1 + z2) / 2, length, 0.12, WALL_THICKNESS + 0.04, materials.wallTop, false, false);
  cap.rotation.y = -angle;
  return wall;
}

function addWindow(x, z, w, horizontal = true) {
  makeBox("window", x, 3.7, z, horizontal ? w : 0.08, 2.25, horizontal ? 0.08 : w, materials.glass, false, false);
  makeBox("window-trim", x, 3.65, z, horizontal ? w + 0.24 : 0.16, 2.45, horizontal ? 0.16 : w + 0.24, materials.trim, false, false);
}

function addDoorSwing(x, z, rotation, label = "door swing") {
  const curve = new THREE.ArcCurve(0, 0, 2.45, 0, Math.PI / 2, false);
  const points = curve.getPoints(28).map((p) => new THREE.Vector3(p.x, 0.03, p.y));
  const line = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(points),
    new THREE.LineBasicMaterial({ color: 0x292929 }),
  );
  line.name = label;
  line.position.set(x, 0.07, z);
  line.rotation.y = rotation;
  scene.add(line);
}

function addDoorLeaf(name, hingeX, hingeZ, width, rotation) {
  const axisX = Math.sin(rotation);
  const axisZ = Math.cos(rotation);
  const x = hingeX + axisX * width * 0.5;
  const z = hingeZ + axisZ * width * 0.5;
  const door = makeBox(name, x, 0, z, 0.14, 6.75, width, materials.door, true, true);
  door.rotation.y = rotation;
  makeBox(`${name}-handle`, hingeX + axisX * width * 0.82, 3.25, hingeZ + axisZ * width * 0.82, 0.14, 0.16, 0.14, materials.steel, true, false);
  return door;
}

function addLabel(text, x, z) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 192;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "rgba(248, 246, 238, 0.9)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = "#2f3437";
  ctx.lineWidth = 8;
  ctx.strokeRect(6, 6, canvas.width - 12, canvas.height - 12);
  ctx.fillStyle = "#1d2225";
  ctx.font = "700 34px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const lines = text.split("\n");
  lines.forEach((line, i) => ctx.fillText(line, canvas.width / 2, 72 + i * 44));

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshBasicMaterial({ map: texture, transparent: true });
  const label = new THREE.Mesh(new THREE.PlaneGeometry(4.8, 1.8), mat);
  label.position.set(x, 0.04, z);
  label.rotation.x = -Math.PI / 2;
  scene.add(label);
}

function addBed(x, z, rot = 0) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.rotation.y = rot;
  group.add(makeLocalBox("bed-base", 0, 0.25, 0, 5, 0.5, 6.6, materials.wood));
  group.add(makeLocalBox("mattress", 0, 0.72, 0, 4.8, 0.45, 6.3, materials.white));
  group.add(makeLocalBox("blanket", 0, 1.02, 0.9, 4.55, 0.25, 4.1, materials.fabric));
  group.add(makeLocalBox("pillow-a", -1.2, 1.12, -2.45, 1.5, 0.22, 0.75, materials.white));
  group.add(makeLocalBox("pillow-b", 1.2, 1.12, -2.45, 1.5, 0.22, 0.75, materials.white));
  scene.add(group);
}

function makeLocalBox(name, x, y, z, w, h, d, mat) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.name = name;
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function addSofa(x, z, rot = 0) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.rotation.y = rot;
  group.add(makeLocalBox("sofa-seat", 0, 0.6, 0, 6.1, 0.75, 2.2, materials.fabric));
  group.add(makeLocalBox("sofa-back", 0, 1.35, 0.95, 6.3, 1.7, 0.45, materials.fabric));
  group.add(makeLocalBox("sofa-left-arm", -3.35, 1, 0, 0.45, 1.4, 2.45, materials.fabric));
  group.add(makeLocalBox("sofa-right-arm", 3.35, 1, 0, 0.45, 1.4, 2.45, materials.fabric));
  scene.add(group);
}

function addTableSet(x, z) {
  makeBox("dining-table", x, 2.4, z, 4.2, 0.28, 2.8, materials.wood);
  for (const [cx, cz] of [[-2.7, 0], [2.7, 0], [0, -2], [0, 2]]) {
    makeBox("dining-chair", x + cx, 0.55, z + cz, 1.1, 0.28, 1.1, materials.wood);
    makeBox("dining-chair-back", x + cx, 1.25, z + cz + 0.42, 1.1, 1.2, 0.18, materials.wood);
  }
}

function addKitchen() {
  makeBox("kitchen-counter-north", 27.5, 0, 21.8, 8.2, 3, 2, materials.counter);
  makeBox("kitchen-island-sink", 27.3, 0, 14.9, 5.7, 3, 2.1, materials.counter);
  makeBox("sink-basin", 27.2, 3.02, 14.8, 1.35, 0.08, 0.8, materials.steel);
  makeBox("faucet", 27.2, 3.15, 14.15, 0.15, 0.8, 0.15, materials.steel);
  makeBox("stove", 30.7, 3.05, 21.8, 2.4, 0.12, 1.75, materials.black);
  for (const [x, z] of [[30.1, 21.4], [31.25, 21.4], [30.1, 22.15], [31.25, 22.15]]) {
    const burner = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.23, 0.05, 24), materials.steel);
    burner.position.set(x, 3.16, z);
    scene.add(burner);
  }
  makeBox("fridge", 35.1, 0, 21.1, 2.1, 6.6, 2.1, materials.steel);
  makeBox("dishwasher", 31.9, 0, 14.9, 1.7, 2.8, 1.8, materials.steel);
  makeBox("pantry", 35.8, 0, 15.8, 1.6, 7, 2.2, materials.wood);
  makeBox("washer", 38.8, 0, 21.8, 1.7, 2.8, 1.7, materials.white);
  makeBox("dryer", 38.8, 0, 16.2, 1.7, 2.8, 1.7, materials.white);
}

function addBath() {
  const tub = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 4.8, 32), materials.white);
  tub.name = "bathtub";
  tub.position.set(2.3, 1.05, 19.2);
  tub.scale.x = 0.62;
  tub.rotation.z = Math.PI / 2;
  tub.castShadow = true;
  scene.add(tub);
  makeBox("vanity", 10.2, 0, 21.2, 2.8, 2.8, 1.5, materials.counter);
  makeBox("bath-sink", 10.2, 2.86, 21.2, 1.25, 0.1, 0.75, materials.steel);
  const toilet = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.42, 0.45, 32), materials.white);
  toilet.position.set(6.4, 0.65, 21.2);
  scene.add(toilet);
  makeBox("toilet-tank", 6.4, 0.9, 21.85, 1.2, 1.1, 0.35, materials.white);
}

function addPatio() {
  makeBox("patio-table", 43.7, 1.6, 7.3, 2.8, 0.22, 2.8, materials.wood);
  for (const [x, z] of [[41.5, 7.3], [45.9, 7.3], [43.7, 5.1], [43.7, 9.5]]) {
    makeBox("patio-chair", x, 0.45, z, 1.25, 0.25, 1.25, materials.wood);
  }
  for (const [x, z] of [[40.2, 2.2], [47.8, 11.3]]) {
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.42, 0.9, 20), materials.wood);
    pot.position.set(x, 0.45, z);
    scene.add(pot);
    const plant = new THREE.Mesh(new THREE.ConeGeometry(0.9, 1.8, 24), materials.plant);
    plant.position.set(x, 1.8, z);
    plant.castShadow = true;
    scene.add(plant);
  }
}

function buildApartment() {
  addFloor("Bedroom 12'9 x 11'0", 0, 0, 13, 11, ROOM_COLORS.bedroom);
  addFloor("Bath", 0, 18, 13, 5, ROOM_COLORS.bath);
  addFloor("Walk-in closet", 0, 11, 13, 7, ROOM_COLORS.closet);
  addFloor("Living Room 13'0 x 8'2", 13, 0, 13, 14, ROOM_COLORS.living);
  addFloor("Dining Room 8'8 x 5'6", 13, 14, 8.67, 5.5, ROOM_COLORS.dining);
  addFloor("Kitchen", 21.67, 14, 16.33, 9, ROOM_COLORS.kitchen);
  addFloor("Service", 38, 14, 3, 9, ROOM_COLORS.utility);
  addFloor("Closet and storage", 34, 0, 4, 14, ROOM_COLORS.closet);
  addFloor("Patio / Balcony 10'11 x 13'5", 38, 0, 10.92, 13.42, ROOM_COLORS.patio);

  addWall(0, 0, 49, 0, "south exterior");
  addWall(0, 23, 41, 23, "north exterior");
  addWall(0, 0, 0, 23, "west exterior");
  addWall(49, 0, 49, 13.42, "east patio wall");
  addWall(38, 0, 38, 1.4, "patio divider low");
  addWall(38, 4.9, 38, 6, "patio divider middle");
  addWall(38, 9.5, 38, 10.2, "patio divider high");
  addWall(38, 13.42, 49, 13.42, "patio north wall");
  addWall(41, 14, 41, 23, "utility east");
  addWall(38, 13.42, 38, 14, "entry jog");

  addWall(13, 0, 13, 7.4, "bed living wall lower");
  addWall(13, 11.1, 13, 14.3, "bed living wall middle");
  addWall(0, 11, 3.6, 11, "bed closet wall a");
  addWall(6.7, 11, 10.2, 11, "bed closet wall b");
  addWall(12.8, 11, 13, 11, "bed closet wall c");
  addWall(0, 18, 7.4, 18, "closet bath wall a");
  addWall(10.4, 18, 13, 18, "closet bath wall b");
  addWall(13, 17.8, 13, 23, "dining west wall");
  addWall(19.5, 18, 19.5, 23, "dining kitchen nib");
  addWall(34, 14, 34, 23, "kitchen service wall");
  addWall(34, 14, 38, 14, "service hall wall");
  addWall(34, 11.2, 38, 11.2, "closet storage divider");
  addWall(34, 7.5, 38, 7.5, "storage water heater divider");
  addWall(34, 0, 34, 2, "living service wall lower");
  addWall(34, 5.4, 34, 7.8, "living storage wall lower");
  addWall(34, 10.9, 34, 11.4, "living closet wall middle");
  addWall(34, 13.6, 34, 14, "living closet wall upper");

  addWindow(6.5, 0.08, 9, true);
  addWindow(20.5, 0.08, 9, true);
  addWindow(47.7, 13.34, 2.2, true);
  addDoorSwing(3.6, 11, Math.PI / 2);
  addDoorSwing(10.4, 18, -Math.PI / 2);
  addDoorSwing(13, 7.4, 0);
  addDoorSwing(13, 14.3, 0);
  addDoorSwing(38, 10.4, Math.PI);
  addDoorSwing(38, 4.5, Math.PI);
  addDoorSwing(38, 13.42, -Math.PI / 2);
  addDoorSwing(41, 18.3, Math.PI);
  addDoorLeaf("water-heater-door", 34, 2, 2.8, -Math.PI / 2);
  addDoorLeaf("bedroom-living-door", 13, 7.4, 3.2, Math.PI / 2);
  addDoorLeaf("closet-dining-door", 13, 14.3, 3.1, Math.PI / 2);
  addDoorLeaf("storage-door", 34, 7.8, 2.8, -Math.PI / 2);
  addDoorLeaf("closet-door", 34, 11.4, 2.2, -Math.PI / 2);
  addDoorLeaf("patio-lower-door", 38, 1.4, 2.8, Math.PI / 2);
  addDoorLeaf("patio-middle-door", 38, 6, 2.8, Math.PI / 2);
  addDoorLeaf("patio-upper-door", 38, 10.2, 2.8, Math.PI / 2);

  addLabel("Bedroom\n12'9 x 11'0", 6.5, 5.4);
  addLabel("Living Room\n13'0 x 8'2", 20, 6.3);
  addLabel("Dining Room\n8'8 x 5'6", 17.3, 16.9);
  addLabel("Kitchen", 28.5, 18.2);
  addLabel("Bath", 6.5, 20.5);
  addLabel("Patio / Balcony\n10'11 x 13'5", 43.5, 6.8);

  addBed(5.8, 5.1, Math.PI / 2);
  makeBox("nightstand", 2.2, 0, 8.9, 1.4, 1.5, 1.4, materials.wood);
  makeBox("dresser", 11.3, 0, 3.4, 1.5, 3.3, 4.3, materials.wood);
  addSofa(19.3, 4.2, 0);
  makeBox("coffee-table", 20, 0, 7.5, 4.3, 1.1, 1.8, materials.wood);
  makeBox("tv-console", 25.2, 0, 4.2, 0.8, 1.6, 5.4, materials.wood);
  makeBox("tv", 25.65, 2.4, 4.2, 0.18, 2.2, 4.4, materials.black);
  addTableSet(17.4, 16.4);
  addKitchen();
  addBath();
  addPatio();
  makeBox("closet-shelf", 5.8, 0, 13.8, 0.7, 6.4, 4.3, materials.wood);
  makeBox("storage-shelf", 36, 0, 9.3, 2.6, 5.4, 0.8, materials.wood);
  makeBox("water-heater", 36, 0, 3.7, 1.4, 4.2, 1.4, materials.steel);
}

function addLights() {
  scene.add(new THREE.HemisphereLight(0xdfe9ff, 0x71705f, 1.45));
  const sun = new THREE.DirectionalLight(0xfff2d2, 2.2);
  sun.position.set(13, 24, -18);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 80;
  sun.shadow.camera.left = -40;
  sun.shadow.camera.right = 60;
  sun.shadow.camera.top = 45;
  sun.shadow.camera.bottom = -35;
  scene.add(sun);
  for (const [x, z] of [[6, 20], [19, 7], [28, 18], [43, 7], [6, 6]]) {
    const lamp = new THREE.PointLight(0xfff0d4, 0.9, 15);
    lamp.position.set(x, 7.5, z);
    scene.add(lamp);
  }
}

function createHud() {
  const hud = document.createElement("div");
  hud.className = "hud";
  hud.innerHTML = `
    <div class="title">Avalon apartment walkthrough</div>
    <div>Click to enter first-person view</div>
    <div>Move: WASD or arrow keys &nbsp; Look: mouse &nbsp; Exit: Esc &nbsp; Plan view: M</div>
    <div class="scale">Scale: 1 world unit = 1 ft. Eye height: 6 ft. Ceiling: 8 ft.</div>
  `;
  document.body.appendChild(hud);
  const crosshair = document.createElement("div");
  crosshair.className = "crosshair";
  document.body.appendChild(crosshair);
}

function wouldCollide(x, z) {
  const playerBox = new THREE.Box3(
    new THREE.Vector3(x - playerRadius, 0.15, z - playerRadius),
    new THREE.Vector3(x + playerRadius, 6.2, z + playerRadius),
  );
  return colliders.some((box) => box.intersectsBox(playerBox));
}

function updateMovement(delta) {
  if (isTopDown) return;
  const hasPointerLock = document.pointerLockElement === renderer.domElement;
  if (!hasPointerLock && !fallbackLookActive) return;

  const forward = Number(keys.has("KeyW") || keys.has("ArrowUp")) - Number(keys.has("KeyS") || keys.has("ArrowDown"));
  const right = Number(keys.has("KeyD") || keys.has("ArrowRight")) - Number(keys.has("KeyA") || keys.has("ArrowLeft"));
  if (forward === 0 && right === 0) return;

  const speed = keys.has("ShiftLeft") || keys.has("ShiftRight") ? 10 : 6;

  camera.getWorldDirection(viewForward);
  viewForward.y = 0;
  viewForward.normalize();
  viewRight.crossVectors(viewForward, camera.up).normalize();

  moveVector
    .copy(viewForward)
    .multiplyScalar(forward)
    .addScaledVector(viewRight, right);

  if (moveVector.lengthSq() > 0) {
    moveVector.normalize().multiplyScalar(speed * delta);
  }

  const start = camera.position.clone();
  camera.position.x = start.x + moveVector.x;
  if (wouldCollide(camera.position.x, camera.position.z)) camera.position.x = start.x;
  camera.position.z = start.z + moveVector.z;
  if (wouldCollide(camera.position.x, camera.position.z)) {
    camera.position.x = start.x;
    camera.position.z = start.z;
  }
  camera.position.y = EYE_HEIGHT;
}

function toggleTopDown() {
  isTopDown = !isTopDown;
  if (isTopDown) {
    fallbackLookActive = false;
    if (document.pointerLockElement) document.exitPointerLock();
    activeCamera = planCamera;
  } else {
    activeCamera = camera;
  }
}

buildApartment();
addLights();
createHud();

function updateCameraSizing() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  const aspect = window.innerWidth / window.innerHeight;
  const planHeight = 34;
  planCamera.left = (-planHeight * aspect) / 2;
  planCamera.right = (planHeight * aspect) / 2;
  planCamera.top = planHeight / 2;
  planCamera.bottom = -planHeight / 2;
  planCamera.updateProjectionMatrix();
}

updateCameraSizing();

renderer.domElement.addEventListener("click", () => {
  if (isTopDown) return;
  fallbackLookActive = true;
  const lockResult = renderer.domElement.requestPointerLock?.();
  if (lockResult?.catch) lockResult.catch(() => {
    fallbackLookActive = true;
  });
});

document.addEventListener("pointerlockchange", () => {
  fallbackLookActive = document.pointerLockElement !== renderer.domElement && !isTopDown;
});

document.addEventListener("pointerlockerror", () => {
  fallbackLookActive = !isTopDown;
});

document.addEventListener("mousemove", (event) => {
  if (isTopDown) return;
  if (!fallbackLookActive && document.pointerLockElement !== renderer.domElement) return;
  fallbackYaw -= event.movementX * 0.0022;
  fallbackPitch -= event.movementY * 0.0022;
  fallbackPitch = Math.max(-Math.PI / 2 + 0.05, Math.min(Math.PI / 2 - 0.05, fallbackPitch));
  camera.rotation.order = "YXZ";
  camera.rotation.set(fallbackPitch, fallbackYaw, 0);
});

document.addEventListener("keydown", (event) => {
  keys.add(event.code);
  if (event.code === "KeyM") toggleTopDown();
});

document.addEventListener("keyup", (event) => {
  keys.delete(event.code);
});

window.addEventListener("resize", () => {
  updateCameraSizing();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

function animate() {
  const delta = Math.min(clock.getDelta(), 0.05);
  updateMovement(delta);
  renderer.render(scene, activeCamera);
  requestAnimationFrame(animate);
}

animate();
