import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { createStudioMaterials } from '../studio.js';
import { buildFoundation, buildDoors, buildRoof, buildCabinDetails } from '../model-body.js';
import { buildDashboard } from '../model-dashboard.js';
import { buildSeat } from '../model-seats.js';
import { buildExterior } from '../model-exterior.js';
import { assembleVehicle } from '../vehicle-assembly.js';
import { createInitialState } from '../engine.js';

// 使用真实三维构造函数，只模拟 Canvas 绘图与屏幕面片；不代表浏览器视觉验收。
function constructFixture() {
  const saved = ['document', 'Path2D'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]);
  const context = new Proxy({}, {
    get(target, key) { return key in target ? target[key] : () => key.startsWith('create') ? { addColorStop() {} } : undefined; },
    set(target, key, value) { target[key] = value; return true; },
  });
  globalThis.document = { createElement() { return { width: 0, height: 0, getContext: () => context }; } };
  globalThis.Path2D = class { moveTo() {} lineTo() {} closePath() {} };
  try {
    const cabin = {
      scene: new THREE.Scene(), root: new THREE.Group(), selectables: new Map(), textures: new Set(),
      refs: { seats: {}, doors: {}, windows: {}, reading: {}, ambient: [], airflow: [], screens: [] },
      renderer: { capabilities: { getMaxAnisotropy: () => 4 } }, state: null, mood: 'day',
      box(w, h, d, material, parent, x = 0, y = 0, z = 0, radius = .04) {
        const mesh = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, Math.min(radius, Math.min(w, h, d) * .44)), material);
        mesh.position.set(x, y, z); parent.add(mesh); return mesh;
      },
      tube(points, radius, material, parent, closed = false) {
        const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)), closed);
        const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(12, points.length * 5), radius, 5, closed), material);
        parent.add(mesh); return mesh;
      },
      cylinder(a, b, h, material, parent, x, y, z, segments = 24) {
        const mesh = new THREE.Mesh(new THREE.CylinderGeometry(a, b, h, segments), material);
        mesh.position.set(x, y, z); parent.add(mesh); return mesh;
      },
      register(object, target, domain) {
        Object.assign(object.userData, { target, domain });
        const key = `${domain}:${target}`; if (!this.selectables.has(key)) this.selectables.set(key, object);
      },
      createDisplay(w, h, parent, x, y, z, type, domain) {
        const group = new THREE.Group(); group.position.set(x, y, z); parent.add(group);
        const screen = this.box(w, h, .01, this.materials.black, group);
        this.refs.screens.push({ type, screen });
        if (domain) this.register(group, domain === 'climate' ? 'driver' : 'all', domain);
        return group;
      },
      paintOxygen() {},
    };
    cabin.scene.add(cabin.root); cabin.materials = createStudioMaterials(cabin);
    buildFoundation(cabin); buildDashboard(cabin);
    [['driver', -.64, -.64], ['passenger', .64, -.64], ['rearLeft', -.65, .93], ['rearRight', .65, .93], ['thirdLeft', -.58, 2.35], ['thirdRight', .58, 2.35]]
      .forEach(([id, x, z], index) => buildSeat(cabin, id, x, z, index));
    buildDoors(cabin); buildRoof(cabin); buildCabinDetails(cabin);
    const oldDoors = Object.values(cabin.refs.doors).map(ref => ref.root);
    const oldWindows = Object.values(cabin.refs.windows).map(ref => ref.root);
    const groundPosition = cabin.refs.studioGround.position.clone();
    const exterior = buildExterior(cabin), vehicle = assembleVehicle(cabin, exterior);
    return { cabin, exterior, vehicle, oldDoors, oldWindows, groundPosition };
  } finally {
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
    }
  }
}

let fixture;
before(() => { fixture = constructFixture(); });
after(() => {
  const geometries = new Set(), materials = new Set();
  fixture?.cabin.scene.traverse(object => {
    if (object.geometry) geometries.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : object.material ? [object.material] : []) materials.add(material);
  });
  geometries.forEach(item => item.dispose()); materials.forEach(item => item.dispose());
  fixture?.cabin.textures.forEach(item => item.dispose());
});

function inside(object, root) { for (; object; object = object.parent) if (object === root) return true; return false; }
function visible(object) { for (; object; object = object.parent) if (!object.visible) return false; return true; }
function relative(parent, child) {
  fixture.vehicle.root.updateMatrixWorld(true);
  return parent.matrixWorld.clone().invert().multiply(child.matrixWorld);
}
function closeMatrix(a, b) { assert(Math.max(...a.elements.map((v, i) => Math.abs(v - b.elements[i]))) < 1e-12); }

test('整车装配：六座、四门、四窗共享同一车辆且重复装配不复制', () => {
  const { cabin, exterior, vehicle } = fixture;
  const seats = []; vehicle.root.traverse(object => { if (object.name.startsWith('座椅-')) seats.push(object); });
  assert.equal(seats.length, 6); assert.equal(Object.keys(cabin.refs.seats).length, 6);
  assert.equal(Object.keys(cabin.refs.doors).length, 4); assert.equal(Object.keys(cabin.refs.windows).length, 4);
  assert.equal(new Set(Object.values(cabin.refs.doors).map(ref => ref.root)).size, 4);
  assert.equal(new Set(Object.values(cabin.refs.windows).map(ref => ref.root)).size, 4);
  assert.equal(cabin.root.parent, vehicle.root); assert.equal(exterior.root.parent, vehicle.root);
  assert.equal(vehicle.root.children.length, 2); assert.equal(assembleVehicle(cabin, exterior), vehicle);
  for (const [id, ref] of Object.entries(cabin.refs.doors)) {
    assert.equal(ref.root, exterior.doors[id].root);
    assert.equal(cabin.refs.windows[id].root, exterior.windows[id].root);
    assert.equal(ref.innerPanelRoot.parent, ref.root);
    assert.equal(cabin.refs.windows[id].root.parent, ref.root);
  }
  for (const ref of Object.values(cabin.refs.seats)) assert(inside(ref.root, vehicle.root));
});

test('整车装配：旧门窗与旧外皮移除，拾取引用不指向已拆部件', () => {
  const { cabin, vehicle, oldDoors, oldWindows } = fixture;
  assert([...oldDoors, ...oldWindows].every(object => !inside(object, vehicle.root)));
  vehicle.root.traverse(object => {
    assert(!object.userData.assemblyDiscard);
    const materials = Array.isArray(object.material) ? object.material : object.material ? [object.material] : [];
    assert(materials.every(material => !material.userData.assemblyDiscard));
  });
  for (const object of cabin.selectables.values()) assert(inside(object, vehicle.root));
  for (const object of [cabin.refs.rearScreen, cabin.refs.shade.root, cabin.refs.chargePort]) assert(inside(object, vehicle.root));
});

test('整车装配：反复开合时内门板相对铰链不漂移', t => {
  const { cabin } = fixture;
  t.after(() => { for (const ref of Object.values(cabin.refs.doors)) ref.root.rotation.y = 0; });
  for (const ref of Object.values(cabin.refs.doors)) {
    const expected = relative(ref.root, ref.innerPanelRoot);
    const closed = ref.innerPanelRoot.getWorldPosition(new THREE.Vector3());
    for (const amount of [1, .4, 0, 1, 0]) {
      ref.root.rotation.y = ref.side * 1.05 * amount;
      closeMatrix(expected, relative(ref.root, ref.innerPanelRoot));
      if (amount === 1) assert(ref.innerPanelRoot.getWorldPosition(new THREE.Vector3()).distanceTo(closed) > .02);
    }
  }
});

test('整车装配：外灯更新不得二次驱动车门车窗或修改车辆状态', t => {
  const { cabin, exterior } = fixture;
  t.after(() => {
    for (const ref of Object.values(cabin.refs.doors)) ref.root.rotation.y = 0;
    for (const ref of Object.values(cabin.refs.windows)) ref.root.scale.y = 1;
    cabin.refs.chargePort.rotation.y = 0;
  });
  const state = createInitialState(), original = structuredClone(state);
  for (const ref of Object.values(cabin.refs.doors)) ref.root.rotation.y = ref.side * .63;
  for (const ref of Object.values(cabin.refs.windows)) ref.root.scale.y = .32;
  cabin.refs.chargePort.rotation.y = .7;
  for (let i = 0; i < 30; i++) exterior.update(state, 1 / 60);
  for (const ref of Object.values(cabin.refs.doors)) assert.equal(ref.root.rotation.y, ref.side * .63);
  for (const ref of Object.values(cabin.refs.windows)) assert.equal(ref.root.scale.y, .32);
  assert.equal(cabin.refs.chargePort.rotation.y, .7); assert.deepEqual(state, original);
});

test('整车装配：剖视退出恢复全部显隐，内外始终共存', t => {
  const { cabin, exterior, vehicle } = fixture;
  t.after(() => vehicle.setCutaway(false));
  const baseline = new Map(); vehicle.root.traverse(object => baseline.set(object, object.visible));
  for (const view of ['overview', 'seat', 'passenger']) {
    assert(vehicle.setCutaway(true, view).hiddenParts > 0);
    assert(vehicle.root.visible && cabin.root.visible && exterior.root.visible);
    for (const ref of Object.values(cabin.refs.seats)) assert(visible(ref.root));
    vehicle.setCutaway(false, 'exterior');
    for (const [object, wasVisible] of baseline) assert.equal(object.visible, wasVisible);
  }
});

test('整车装配：摄影棚地面不参与缩放，内舱坐标转换可往返', () => {
  const { cabin, vehicle, groundPosition } = fixture, ground = cabin.refs.studioGround;
  assert.equal(ground.parent, cabin.scene); assert.deepEqual(ground.scale.toArray(), [1, 1, 1]);
  assert.deepEqual(ground.position.toArray(), groundPosition.toArray());
  const point = new THREE.Vector3(.2, 1.5, -.7);
  assert(vehicle.fromWorld(vehicle.toWorld(point)).distanceTo(point) < 1e-12);
});

test('整车装配：内门板范围有限且不穿出外门窗下沿', () => {
  const { cabin, vehicle } = fixture; vehicle.root.updateMatrixWorld(true);
  for (const ref of Object.values(cabin.refs.doors)) {
    const bounds = new THREE.Box3().setFromObject(ref.innerPanelRoot);
    assert([...bounds.min.toArray(), ...bounds.max.toArray()].every(Number.isFinite));
    assert(bounds.min.y > .49 && bounds.max.y < 1.24);
    assert(bounds.min.z > ref.start && bounds.max.z < ref.end);
  }
});

test('整车装配：遮阳帘收起后天幕中央没有实心车顶遮挡', t => {
  const { cabin, exterior, vehicle } = fixture, shade = cabin.refs.shade;
  const parts = [shade.sheet, shade.rail, ...shade.slats];
  const original = parts.map(object => ({ object, position: object.position.clone(), scale: object.scale.clone() }));
  t.after(() => original.forEach(({ object, position, scale }) => { object.position.copy(position); object.scale.copy(scale); }));
  shade.sheet.scale.z = .09 / 2.52; shade.sheet.position.z = -.37 + .09 / 2;
  shade.rail.position.z = -.37 + .09;
  shade.slats.forEach((slat, index) => { slat.position.z = -.37 + index / 10 * .09; });
  vehicle.setCutaway(false); vehicle.root.updateMatrixWorld(true);
  const ray = new THREE.Raycaster(new THREE.Vector3(0, 1.45, 1), new THREE.Vector3(0, 1, 0), 0, 1);
  // 默认线段拾取半径为 1 米，会把远处座椅缝线算成命中；此处只查实体屋顶。
  ray.params.Line.threshold = .001;
  const hits = ray.intersectObject(vehicle.root, true).filter(hit => hit.object.isMesh && visible(hit.object));
  assert(hits.length > 0); assert(hits.some(hit => exterior.glassParts.includes(hit.object)));
  assert(hits.every(hit => hit.object.material.transparent && hit.object.material.opacity < .5), '天幕中央存在不透明实体');
});

test('连续软包：UV接缝两侧受光法线连续且不存在无效法线', () => {
  const geometries = new Set();
  fixture.vehicle.root.traverse(object => { if (object.geometry?.userData.continuousSurface) geometries.add(object.geometry); });
  assert(geometries.size > 0);
  let duplicateVertices = 0;
  for (const geometry of geometries) {
    const position = geometry.attributes.position, normal = geometry.attributes.normal, atPosition = new Map();
    for (let i = 0; i < position.count; i++) {
      const n = new THREE.Vector3().fromBufferAttribute(normal, i);
      assert(Number.isFinite(n.lengthSq()) && Math.abs(n.lengthSq() - 1) < .0001);
      const key = [position.getX(i), position.getY(i), position.getZ(i)].map(value => Math.round(value * 1e6)).join(',');
      if (atPosition.has(key)) { assert(n.distanceTo(atPosition.get(key)) < .0001, '同一连续曲面位置出现硬折面'); duplicateVertices++; }
      else atPosition.set(key, n);
    }
  }
  assert(duplicateVertices > 0);
});
