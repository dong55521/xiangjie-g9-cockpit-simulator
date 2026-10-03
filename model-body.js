import * as THREE from 'three';

// 原创车内剖切展示几何；比例与运动路径为教学近似，不是原厂工程数据。
// 主场景仍负责动画。本模块不改变门铰链、升窗、遮阳和后屏的引用协议。
// shellParts 需在旧 setXray 逻辑后处理：
// { object, material, fullOpacity, xrayOpacity, hideInXray }
// object.visible = !(xray && hideInXray)，再应用对应 opacity/depthWrite。

const SEATS = [
  ['driver', -.64, -.64], ['passenger', .64, -.64],
  ['rearLeft', -.65, .93], ['rearRight', .65, .93],
  ['thirdLeft', -.58, 2.35], ['thirdRight', .58, 2.35],
];

function material(cabin, name, changes = {}) {
  const copy = cabin.materials[name].clone();
  delete copy.userData.trimRole;
  // 独立座舱展示用的外皮/玻璃，整车装配时由唯一外观壳体替代。
  if (name === 'body' || name === 'glass') copy.userData.assemblyDiscard = true;
  if (['leather', 'soft', 'darkLeather', 'stitch'].includes(name)
      && !Object.prototype.hasOwnProperty.call(changes, 'color')) {
    copy.userData.trimRole = name;
  }
  for (const [key, value] of Object.entries(changes)) {
    if (copy[key]?.isColor) copy[key].set(value);
    else copy[key] = value;
  }
  return copy;
}

// 只给车身侧围根节点标侧别；座椅、独立灯具与中央顶控保持独立。
// 主场景遍历 shellSide 标记即可在特写中隐藏近侧包围，子件随根节点隐藏。
function sideGroup(parent, side) {
  const group = new THREE.Group();
  group.userData.shellSide = side;
  parent.add(group);
  return group;
}

function shell(cabin, object, xrayOpacity = .65, hideInXray = false, fullOpacity = 1) {
  const mat = object.material;
  mat.transparent = true;
  cabin.refs.shellParts ??= [];
  cabin.refs.shellParts.push({ object, material: mat, fullOpacity, xrayOpacity, hideInXray });
  return object;
}

function mesh(cabin, geometry, mat, parent) {
  const result = new THREE.Mesh(geometry, mat);
  result.castShadow = true;
  result.receiveShadow = true;
  parent.add(result);
  return result;
}

function legacyExterior(object, reason) {
  object.userData.assemblyDiscard = reason;
  return object;
}

// 在门板的纵向/高度平面勾勒轮廓，再向车外挤出厚度。
function sidePanel(cabin, parent, side, points, thickness, mat, x = 0, y = 0, z = 0, bevel = .014) {
  const shape = new THREE.Shape();
  points.forEach(([along, height], index) => {
    if (!index) shape.moveTo(-side * along, height);
    else shape.lineTo(-side * along, height);
  });
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: thickness, steps: 1, curveSegments: 12,
    bevelEnabled: bevel > 0, bevelThickness: Math.min(bevel, thickness * .3),
    bevelSize: bevel, bevelSegments: 3,
  });
  geometry.rotateY(side * Math.PI / 2);
  const result = mesh(cabin, geometry, mat, parent);
  result.position.set(x, y, z);
  return result;
}

function floorPanel(cabin, points, thickness, mat, y) {
  const shape = new THREE.Shape();
  points.forEach(([x, z], index) => index ? shape.lineTo(x, -z) : shape.moveTo(x, -z));
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: thickness, steps: 1, bevelEnabled: true,
    bevelSize: .045, bevelThickness: .025, bevelSegments: 3,
  });
  geometry.rotateX(-Math.PI / 2);
  const result = mesh(cabin, geometry, mat, cabin.root);
  result.position.y = y;
  return result;
}

function beam(cabin, parent, start, end, width, depth, mat, radius = .025) {
  const a = new THREE.Vector3(...start), b = new THREE.Vector3(...end);
  const result = cabin.box(width, a.distanceTo(b), depth, mat, parent, 0, 0, 0, radius);
  result.position.copy(a).add(b).multiplyScalar(.5);
  result.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.sub(a).normalize());
  return result;
}

function glassQuad(cabin, parent, points, mat) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points.flat(), 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  geometry.computeVertexNormals();
  const result = mesh(cabin, geometry, mat, parent);
  result.castShadow = false;
  return result;
}

// 实例化小孔提供近看细节，避免逐孔产生大量绘制调用。
function speaker(cabin, parent, side, x, y, z, width = .27, height = .22) {
  const m = cabin.materials;
  const housing = new THREE.Group();
  housing.position.set(x, y, z);
  parent.add(housing);
  const back = cabin.box(.025, height + .035, width + .035, m.darkLeather, housing, 0, 0, 0, .022);
  const face = cabin.box(.012, height, width, material(cabin, 'metal', { roughness: .42 }), housing, -side * .021, 0, 0, .021);
  const centers = [];
  const step = .0105;
  for (let row = -Math.floor(height / step / 2); row <= Math.floor(height / step / 2); row++) {
    for (let column = -Math.floor(width / step / 2); column <= Math.floor(width / step / 2); column++) {
      const py = row * step, pz = (column + (row % 2 ? .5 : 0)) * step;
      if ((py / (height * .47)) ** 6 + (pz / (width * .47)) ** 6 < 1) centers.push([py, pz]);
    }
  }
  const holes = new THREE.InstancedMesh(new THREE.CircleGeometry(.00235, 6), m.black, centers.length);
  const transform = new THREE.Object3D();
  transform.rotation.y = -side * Math.PI / 2;
  centers.forEach(([py, pz], index) => {
    transform.position.set(-side * .028, py, pz);
    transform.updateMatrix();
    holes.setMatrixAt(index, transform.matrix);
  });
  holes.instanceMatrix.needsUpdate = true;
  holes.castShadow = false;
  holes.receiveShadow = true;
  housing.add(holes);
  back.userData.detail = face.userData.detail = '原创金属扬声器饰面';
  return housing;
}

// 前排门板使用连续曲面；木饰面与肩线分别遵循实拍可见轮廓。
function curvedDoorBand(cabin, parent, side, { start, end, bottom, top, inset, bulge = .015, thickness = .045 }, mat) {
  const positions = [], uvs = [], indices = [], columns = 36, rows = 16;
  const stride = columns + 1, count = stride * (rows + 1);
  for (let face = 0; face < 2; face++) for (let row = 0; row <= rows; row++) for (let col = 0; col <= columns; col++) {
    const u = col / columns, v = row / rows, low = bottom(u), high = top(u);
    const inward = inset + bulge * Math.sin(v * Math.PI) * Math.sin(u * Math.PI);
    positions.push(-side * (inward - thickness * face), low + (high - low) * v, start + (end - start) * u);
    uvs.push(u, v);
  }
  for (let face = 0; face < 2; face++) for (let row = 0; row < rows; row++) for (let col = 0; col < columns; col++) {
    const a = face * count + row * stride + col, b = a + stride;
    if ((side < 0) === (face === 0)) indices.push(a, b, a + 1, b, b + 1, a + 1);
    else indices.push(a, a + 1, b, b, a + 1, b + 1);
  }
  const boundary = [];
  for (let col = 0; col <= columns; col++) boundary.push(col);
  for (let row = 1; row <= rows; row++) boundary.push(row * stride + columns);
  for (let col = columns - 1; col >= 0; col--) boundary.push(rows * stride + col);
  for (let row = rows - 1; row > 0; row--) boundary.push(row * stride);
  for (let i = 0; i < boundary.length; i++) {
    const a = boundary[i], b = boundary[(i + 1) % boundary.length];
    if (side < 0) indices.push(a, b, a + count, b, b + count, a + count);
    else indices.push(a, a + count, b, b, a + count, b + count);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  return mesh(cabin, geometry, mat, parent);
}

function roundDoorSpeaker(cabin, parent, side, z, y, radius, mat) {
  const group = new THREE.Group(); group.position.set(-side * .179, y, z); parent.add(group);
  const backing = new THREE.Mesh(new THREE.CircleGeometry(radius + .003, 64), cabin.materials.black);
  backing.rotation.y = -side * Math.PI / 2; group.add(backing);
  const face = new THREE.Mesh(new THREE.CircleGeometry(radius, 64), mat);
  face.rotation.y = -side * Math.PI / 2; face.position.x = -side * .0019; face.receiveShadow = true; group.add(face);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, .0015, 7, 64), mat);
  ring.rotation.y = -side * Math.PI / 2; ring.position.x = -side * .003; group.add(ring);
  const centers = [], spacing = radius > .07 ? .0074 : .0062;
  for (let row = -Math.ceil(radius / spacing); row <= Math.ceil(radius / spacing); row++) {
    for (let col = -Math.ceil(radius / spacing); col <= Math.ceil(radius / spacing); col++) {
      const py = row * spacing, pz = (col + (row % 2 ? .5 : 0)) * spacing;
      if (Math.hypot(py, pz) < radius * .94) centers.push([py, pz]);
    }
  }
  const holes = new THREE.InstancedMesh(new THREE.CircleGeometry(.00155, 6), cabin.materials.black, centers.length);
  const dummy = new THREE.Object3D(); dummy.rotation.y = -side * Math.PI / 2;
  centers.forEach(([py, pz], index) => { dummy.position.set(-side * .004, py, pz); dummy.updateMatrix(); holes.setMatrixAt(index, dummy.matrix); });
  holes.castShadow = false; group.add(holes);
  group.name = radius > .07 ? '前门大圆扬声器' : '前门小圆扬声器';
  return group;
}

function frontDoorTrim(cabin, door, id, side, length) {
  const m = cabin.materials;
  const satin = material(cabin, 'metal', { color: '#737a78', metalness: .48, roughness: .62, envMapIntensity: .28 });
  const buttonMat = material(cabin, 'darkLeather', { roughness: .82 });
  const transition = u => .727 + .063 * (u * u * (3 - 2 * u));
  const inner = curvedDoorBand(cabin, door, side, {
    start: .048, end: length - .047, bottom: u => .10 + .018 * Math.sin(u * Math.PI),
    top: u => transition(u) + .012, inset: .151, bulge: .020,
  }, m.leather);
  inner.name = '前门浅色连续软包';
  const upper = curvedDoorBand(cabin, door, side, {
    start: .033, end: length - .036, bottom: transition, top: u => .942 + .015 * Math.sin(u * Math.PI),
    inset: .145, bulge: .012, thickness: .065,
  }, m.darkLeather);
  upper.name = '前门深色宽肩线';
  cabin.box(.12, .043, length - .065, m.darkLeather, door, -side * .086, .946, length / 2, .018);
  // 门前端一大一小两枚圆扬声器，薄的低反射轮缘贴入深色软面。
  roundDoorSpeaker(cabin, door, side, .176, .812, .088, satin);
  roundDoorSpeaker(cabin, door, side, .377, .826, .053, satin);
  // 汽车之家前舱实拍：肩线下是窄浅色包边，木饰面前窄后宽。
  const lightRail = curvedDoorBand(cabin, door, side, {
    start: .079, end: length - .048, bottom: u => transition(u) - .043,
    top: u => transition(u) + .002, inset: .188, bulge: .004, thickness: .024,
  }, m.leather);
  lightRail.name = '前门肩线下浅色窄包边';
  const woodMat = material(cabin, 'wood', { color: '#c4c0bb', roughness: .67, clearcoat: .06, clearcoatRoughness: .70 });
  const woodPanel = curvedDoorBand(cabin, door, side, {
    start: .159, end: length - .062,
    bottom: u => .630 - .123 * Math.sin(u * Math.PI / 2),
    top: u => transition((.080 + (length - .221) * u) / (length - .127)) - .049,
    inset: .180, bulge: .007, thickness: .017,
  }, woodMat);
  woodPanel.name = '前门前窄后宽木纹饰板';
  // 细缝与隐藏灯带沿木饰板上缘，避免在板面中央横插发光条。
  const seamPoints = Array.from({ length: 15 }, (_, i) => {
    const u = i / 14; return [-side * .192, transition(u) + .004, .079 + (length -.127) * u];
  });
  cabin.tube(seamPoints, .0014, m.stitch, door);
  const ambient = cabin.tube(Array.from({ length: 12 }, (_, i) => {
    const z = .54 + (length - .65) * i / 11, u = (z - .079) / (length - .127);
    return [-side * .190, transition(u) - .045, z];
  }), .0015, m.glow, door);
  cabin.refs.ambient.push(ambient); cabin.register(ambient, 'all', 'ambient');
  // 扶手以软包面为主，窗键细小并嵌入上表面。
  const arm = cabin.box(.184, .083, .815, m.leather, door, -side * .222, .473, .88, .035); arm.rotation.x = -.035;
  cabin.tube([[-side * .309, .498, .52], [-side * .314, .517, .88], [-side * .306, .522, 1.21]], .0016, m.stitch, door);
  const controls = cabin.box(.089, .012, id === 'driver' ? .151 : .077, m.soft, door, -side * .25, .524, .734, .005);
  const count = id === 'driver' ? 4 : 1;
  for (let i = 0; i < count; i++) {
    const button = cabin.box(.045, .009, .026, buttonMat, controls, 0, .010, (i - (count - 1) / 2) * .032, .004);
    cabin.box(.029, .002, .004, satin, button, 0, .0055, -.005, .001);
    cabin.register(button, id, 'window');
  }
  // 实拍拉手为斜置扁平包皮桥：矩形宽面、圆润边角，后方留出握持空间。
  const grip = beam(cabin, door, [-side * .281, .486, .584], [-side * .267, .720, .446], .070, .100, m.leather, .022);
  grip.name = '前门斜置扁平包皮桥式拉手';
  beam(cabin, door, [-side * .194, .727, .441], [-side * .267, .709, .453], .074, .096, m.leather, .019);
  beam(cabin, door, [-side * .221, .480, .582], [-side * .281, .493, .580], .068, .103, m.leather, .018);
  const openSwitch = cabin.box(.013, .028, .042, m.soft, door, -side * .238, .742, .444, .007);
  cabin.box(.002, .008, .020, buttonMat, openSwitch, -side * .008, .001, 0, .002);
  cabin.register(openSwitch, id, 'door');
  // 内开应急把手位于扶手前端，使用浅色凹槽和小型暗色拉片。
  const release = cabin.box(.019, .068, .14, m.soft, door, -side * .292, .478, .363, .022);
  release.rotation.x = -.20;
  const pull = cabin.box(.012, .027, .083, buttonMat, release, -side * .012, .001, 0, .009);
  cabin.register(pull, id, 'door');
  // 门袋的阴影与窄软边替代下部金属装饰。
  cabin.box(.025, .092, .515, m.darkLeather, door, -side * .172, .215, .941, .020);
  cabin.box(.058, .036, .535, m.leather, door, -side * .194, .165, .941, .016);
  return inner;
}

function softAPillar(cabin, parent, a, b, mat) {
  const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b), axis = end.clone().sub(start).normalize();
  const cross = new THREE.Vector3(1, 0, 0).addScaledVector(axis, -axis.x).normalize();
  const depth = new THREE.Vector3().crossVectors(axis, cross).normalize();
  const positions = [], uvs = [], indices = [], rows = 28, columns = 40;
  for (let row = 0; row <= rows; row++) {
    const t = row / rows, center = start.clone().lerp(end, t);
    const width = .079 + .012 * Math.sin(t * Math.PI), thick = .027 + .006 * Math.sin(t * Math.PI);
    for (let col = 0; col <= columns; col++) {
      const angle = col / columns * Math.PI * 2;
      const c = Math.abs(Math.cos(angle)) < 1e-10 ? 0 : Math.cos(angle), s = Math.abs(Math.sin(angle)) < 1e-10 ? 0 : Math.sin(angle);
      const point = center.clone().addScaledVector(cross, Math.sign(c) * Math.pow(Math.abs(c), .62) * width)
        .addScaledVector(depth, Math.sign(s) * Math.pow(Math.abs(s), .66) * thick);
      positions.push(point.x, point.y, point.z); uvs.push(col / columns, t);
      if (row < rows && col < columns) { const i = row * (columns + 1) + col, j = i + columns + 1; indices.push(i, i + 1, j, j, i + 1, j + 1); }
    }
  }
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); geometry.setIndex(indices); geometry.computeVertexNormals();
  const normals = geometry.attributes.normal;
  for (let row = 0; row <= rows; row++) {
    const first = row * (columns + 1), last = first + columns;
    const normal = new THREE.Vector3().fromBufferAttribute(normals, first).add(new THREE.Vector3().fromBufferAttribute(normals, last)).normalize();
    normals.setXYZ(first, normal.x, normal.y, normal.z); normals.setXYZ(last, normal.x, normal.y, normal.z);
  }
  return mesh(cabin, geometry, mat, parent);
}

export function buildFoundation(cabin) {
  const m = cabin.materials;
  cabin.refs.shellParts ??= [];
  // 中性摄影棚地面，无旋转台、发光圆环或地面文字。
  const groundMat = material(cabin, 'floor', { color: '#18191c', roughness: .98, metalness: 0 });
  const ground = mesh(cabin, new THREE.PlaneGeometry(160, 160), groundMat, cabin.scene);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -.08;
  ground.castShadow = false;
  cabin.refs.studioGround = ground;

  // 自生成柔边接触影，不依赖外部图片。
  const size = 128, data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const nx = (x / (size - 1) - .5) / .36, ny = (y / (size - 1) - .5) / .39;
    const alpha = Math.exp(-1.6 * (nx ** 6 + ny ** 6));
    data[(y * size + x) * 4 + 3] = Math.round(alpha * 130);
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.magFilter = texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  cabin.textures.add(texture);
  const contactMat = material(cabin, 'black', { map: texture, transparent: true, opacity: .52, depthWrite: false, roughness: 1, metalness: 0 });
  const contact = mesh(cabin, new THREE.PlaneGeometry(3.75, 7.0), contactMat, cabin.scene);
  contact.rotation.x = -Math.PI / 2;
  contact.position.set(0, -.071, .36);
  contact.castShadow = contact.receiveShadow = false;

  const outline = [[-1.06, -2.4], [1.06, -2.4], [1.24, -2.13], [1.34, -1.25], [1.34, 1.6], [1.23, 2.99], [1.08, 3.18], [-1.08, 3.18], [-1.23, 2.99], [-1.34, 1.6], [-1.34, -1.25], [-1.24, -2.13]];
  floorPanel(cabin, outline, .16, material(cabin, 'body', { opacity: 1 }), .17);
  floorPanel(cabin, outline.map(([x, z]) => [x * .94, (z - .35) * .97 + .35]), .045, m.floor, .37);
  cabin.box(2.32, .032, 4.97, m.carpet, cabin.root, 0, .447, .5, .05);

  [-1, 1].forEach(side => {
    const sideRoot = sideGroup(cabin.root, side);
    // 不同层次的门槛、密封和金属踏面形成实体车身边缘。
    const sill = sidePanel(cabin, sideRoot, side, [[-2.10, .24], [2.98, .24], [3.03, .45], [1.58, .51], [-1.62, .51], [-2.13, .44]], .13, m.darkLeather, side * 1.22, 0, 0, .026);
    sill.userData.detail = '门槛内护板';
    cabin.tube([[side * 1.225, .526, -1.61], [side * 1.236, .526, -.15], [side * 1.235, .526, 1.53]], .012, m.black, sideRoot);
    [[-.885, 1.36], [.73, 1.49]].forEach(([z, length]) => {
      cabin.box(.13, .016, length, m.metal, sideRoot, side * 1.175, .511, z, .011);
      for (let i = 0; i < 4; i++) cabin.box(.003, .004, length - .1, m.darkLeather, sideRoot, side * (1.14 + i * .024), .522, z, 0);
    });
    // 前围位于仪表台之后，封住脚部与挡风玻璃之间的大缝。
    sidePanel(cabin, sideRoot, side, [[-2.30, .40], [-1.67, .40], [-1.67, 1.16], [-2.12, 1.30], [-2.30, 1.06]], .10, m.darkLeather, side * 1.12, 0, 0, .024);
  });
  cabin.box(2.16, .78, .18, m.darkLeather, cabin.root, 0, .81, -2.24, .075);
  cabin.box(2.18, .06, .58, m.black, cabin.root, 0, 1.215, -2.06, .05);

  SEATS.forEach(([, x, z]) => {
    cabin.box(.73, .015, .59, m.darkLeather, cabin.root, x, .472, z - .54, .04);
    cabin.tube([[x - .32, .482, z - .8], [x + .32, .482, z - .8], [x + .32, .482, z - .28], [x - .32, .482, z - .28], [x - .32, .482, z - .8]], .0035, m.stitch, cabin.root);
    for (let i = 0; i < 7; i++) cabin.box(.59, .004, .006, m.carpet, cabin.root, x, .484, z - .75 + i * .065, 0);
  });
  const pedals = new THREE.Group();
  pedals.position.set(-.69, .61, -1.69);
  cabin.root.add(pedals);
  const brake = cabin.box(.17, .035, .21, m.metal, pedals, -.09, 0, 0, .016);
  brake.rotation.x = .9;
  const accelerator = cabin.box(.066, .035, .27, m.metal, pedals, .12, -.018, .01, .016);
  accelerator.rotation.x = .85;
  for (let i = 0; i < 4; i++) cabin.box(.14, .003, .008, m.black, brake, 0, .019, -.07 + i * .045, .002);
  // 踏板连接至脚舱前壁，避免只见两片悬浮金属。
  for (const px of [-.09,.12]) cabin.tube([[px,-.03,-.02],[px,.03,-.16],[px,.16,-.23]],.012,m.black,pedals);
  cabin.refs.floorLabel = null;
}

export function buildDoors(cabin) {
  const m = cabin.materials;
  cabin.refs.pillars = [];
  const definitions = [['driver', -1, -1.62, 1.48], ['passenger', 1, -1.62, 1.48], ['rearLeft', -1, -.09, 1.64], ['rearRight', 1, -.09, 1.64]];
  definitions.forEach(([id, side, front, length]) => {
    const frontRow = id === 'driver' || id === 'passenger';
    const door = new THREE.Group();
    door.userData.shellSide = side;
    door.position.set(side * 1.245, .48, front);
    cabin.root.add(door);
    cabin.register(door, id, 'door');
    const outerMat = material(cabin, 'body', { opacity: 1 });
    const outer = sidePanel(cabin, door, side,
      [[.025, .08], [.02, frontRow ? .82 : .60], [.075, frontRow ? .945 : .735], [length - .08, frontRow ? .935 : .725], [length, frontRow ? .84 : .64], [length - .015, .14], [length - .14, .05]],
      .14, outerMat, -side * .035, 0, 0, .028);
    shell(cabin, outer, .46);
    const linerStart = door.children.length;
    let inner;
    if (frontRow) {
      inner = frontDoorTrim(cabin, door, id, side, length);
    } else {
    inner = sidePanel(cabin, door, side,
      [[.05, .12], [.04, .56], [.16, .667], [length - .115, .653], [length - .05, .56], [length - .085, .13], [length - .2, .085]],
      .072, m.leather, -side * .115, 0, 0, .021);
    // 下部深色护板和后向抬升的皮革嵌片。
    sidePanel(cabin, door, side,
      [[.11, .115], [.10, .31], [length * .31, .38], [length * .68, .35], [length - .11, .42], [length - .11, .15]],
      .048, m.darkLeather, -side * .151, 0, 0, .021);
    sidePanel(cabin, door, side,
      [[.14, .48], [.22, .605], [length - .16, .61], [length - .135, .50], [length * .70, .425], [.29, .435]],
      .035, m.soft, -side * .157, 0, 0, .019);

    const belt = cabin.box(.145, .105, length - .085, m.darkLeather, door, -side * .023, .735, length / 2, .03);
    belt.rotation.z = -side * .06;
    sidePanel(cabin, door, side,
      [[.13, .634], [length - .16, .615], [length - .14, .665], [.14, .693]],
      .018, m.wood, -side * .151, 0, 0, .007);
    const trim = cabin.tube([
      [-side * .174, .686, .13], [-side * .18, .69, length * .35],
      [-side * .176, .667, length * .74], [-side * .15, .65, length - .16],
    ], .006, m.glow, door);
    cabin.refs.ambient.push(trim);
    cabin.register(trim, 'all', 'ambient');

    // 雕塑形扶手向舱内悬挑，按钮区嵌入上表面。
    sidePanel(cabin, door, side,
      [[length * .27, .395], [length * .79, .395], [length * .88, .455], [length * .81, .51], [length * .51, .555], [length * .32, .52]],
      .19, m.leather, -side * .29, 0, 0, .024);
    cabin.tube([
      [-side * .303, .473, length * .33], [-side * .31, .522, length * .52],
      [-side * .30, .489, length * .79],
    ], .0035, m.stitch, door);
    const switches = cabin.box(.11, .024, .225, m.black, door, -side * .234, .545, length * .40, .018);
    switches.rotation.x = -.04;
    const switchCount = id === 'driver' ? 4 : 1;
    for (let i = 0; i < switchCount; i++) {
      const button = cabin.box(.059, .012, .035, m.metal, switches, 0, .016, (i - (switchCount - 1) / 2) * .046, .006);
      cabin.register(button, id, 'window');
    }
    const pullRecess = cabin.box(.026, .062, .24, m.black, door, -side * .183, .584, length * .25, .02);
    pullRecess.rotation.x = -.10;
    const latch = cabin.box(.028, .024, .18, m.metal, door, -side * .207, .598, length * .25, .011);
    latch.rotation.x = -.1;
    cabin.register(latch, id, 'door');

    speaker(cabin, door, side, -side * .166, .215, length * .20, .285, .205);
    const pocket = cabin.box(.032, .12, length * .42, m.black, door, -side * .185, .225, length * .66, .031);
    pocket.rotation.x = -.07;
    cabin.box(.077, .064, length * .45, m.darkLeather, door, -side * .222, .161, length * .66, .026);
    cabin.tube([
      [-side * .248, .245, length * .44], [-side * .258, .235, length * .61], [-side * .235, .245, length * .865],
    ], .011, m.soft, door);
    }

    // 将详细内门板显式归组，整车装配时可迁移到外门的同一铰链。
    const innerPanelRoot = new THREE.Group();
    innerPanelRoot.name = `${id} 详细内门板`;
    innerPanelRoot.userData.assemblyRole = 'doorLiner';
    const linerParts = door.children.slice(linerStart);
    door.add(innerPanelRoot);
    linerParts.forEach(part => innerPanelRoot.add(part));
    // 完整窗线向舱内收窄，玻璃从腰线向上生长，保留旧 scale.y 升降。
    const window = new THREE.Group();
    window.position.set(side * .013, .757, .055);
    door.add(window);
    cabin.register(window, id, 'window');
    const glassMat = material(cabin, 'glass', { opacity: .25, side: THREE.DoubleSide, depthWrite: false });
    const glass = glassQuad(cabin, window, [
      [0, 0, .02], [0, 0, length - .16], [-side * .155, .945, length - .16], [-side * .148, .913, .18],
    ], glassMat);
    const glassTop = cabin.tube([
      [-side * .148, .918, .18], [-side * .155, .95, length * .55], [-side * .155, .948, length - .16],
    ], .006, frontRow ? m.darkLeather : m.metal, window);
    glassTop.castShadow = false;
    const frameMat = material(cabin, 'darkLeather', { transparent: true });
    const frame = cabin.tube([
      [side * .012, .747, .035], [-side * .137, 1.678, .225],
      [-side * .143, 1.715, length * .55], [-side * .142, 1.705, length - .09],
      [side * .013, .748, length - .015],
    ], .025, frameMat, door);
    shell(cabin, frame, .58);
    cabin.tube([
      [side * .025, .765, .035], [-side * .119, 1.70, .225],
      [-side * .121, 1.735, length - .09], [side * .025, .765, length - .015],
    ], .006, frontRow ? m.darkLeather : m.metal, door);
    const outerHandle = cabin.box(.027, .044, .255, m.metal, door, side * .124, .55, length * .745, .012);
    cabin.refs.doors[id] = { root: door, side, shell: outer, inner, innerPanelRoot, frame, outerHandle };
    cabin.refs.windows[id] = { root: window, glass, top: glassTop };
  });

  // 风挡、A/B/C/D 柱形成连续车顶边界。
  const windshield = glassQuad(cabin, cabin.root, [
    [-1.175, 1.26, -2.26], [1.175, 1.26, -2.26],
    [1.105, 2.23, -1.51], [-1.105, 2.23, -1.51],
  ], material(cabin, 'glass', { opacity: .24, side: THREE.DoubleSide, depthWrite: false }));
  cabin.refs.windshield = windshield;
  legacyExterior(cabin.tube([[-1.175, 1.26, -2.26], [0, 1.23, -2.30], [1.175, 1.26, -2.26]], .024, m.black, cabin.root), '旧前风挡下框');
  [-1, 1].forEach(side => {
    const sideRoot = sideGroup(cabin.root, side);
    const pillars = [
      [[side * 1.22, 1.10, -2.28], [side * 1.10, 2.245, -1.50], .115, .115],
      [[side * 1.24, .48, -.145], [side * 1.10, 2.265, -.16], .12, .115],
      [[side * 1.25, .47, 1.59], [side * 1.10, 2.26, 1.53], .145, .145],
      [[side * 1.18, .77, 3.065], [side * 1.055, 2.22, 2.80], .17, .17],
    ];
    pillars.forEach(([a, b, width, depth], index) => {
      const pillarMat = material(cabin, index ? 'soft' : 'leather', { transparent: true, roughness: .90 });
      const pillar = index ? beam(cabin, sideRoot, a, b, width, depth, pillarMat, .036) : softAPillar(cabin, sideRoot, a, b, pillarMat);
      shell(cabin, pillar, .73);
      cabin.refs.pillars.push(pillar);
      // 内侧密封条强化轮廓，剖切时依然能读出整车包围关系。
      cabin.tube([[a[0] - side * .053, a[1] + .07, a[2]], [b[0] - side * .046, b[1] - .055, b[2]]], index ? .011 : .0055, m.black, sideRoot);
      if (index === 0) {
        // 前舱实拍的同色 A 柱拉手，跟随侧围剖切；只补可见实体。
        const handle = new THREE.Group(); handle.name = 'A柱同色辅助拉手'; sideRoot.add(handle);
        const handleMat = material(cabin, 'leather', { transparent: true, roughness: .88 });
        const pieces = [
          beam(cabin, handle, [side * 1.070, 1.603, -1.932], [side * 1.044, 1.843, -1.773], .047, .061, handleMat, .018),
          beam(cabin, handle, [side * 1.172, 1.558, -1.969], [side * 1.070, 1.611, -1.926], .051, .063, handleMat, .018),
          beam(cabin, handle, [side * 1.135, 1.867, -1.753], [side * 1.044, 1.835, -1.778], .051, .064, handleMat, .018),
        ];
        pieces.forEach(piece => shell(cabin, piece, .73));
      }
      if (index === 0 && side < 0) {
        // 图示主驾 A 柱疲劳监测摄像头，仅补几何，不注册新功能。
        const cameraMount = cabin.box(.032, .026, .021, m.darkLeather, sideRoot, -1.07, 2.012, -1.675, .008);
        const lens = cabin.cylinder(.0055, .0055, .002, m.black, cameraMount, .005, -.001, .013, 16);
        lens.rotation.x = Math.PI / 2;
      }
    });
    // B/C 柱安全带、导环及下部通风口。
    [-.145, 1.59].forEach((z, index) => {
      const upperX = side * 1.018, lowerX = side * 1.16;
      const belt = beam(cabin, sideRoot, [upperX, 1.87, z + .035], [lowerX, .62, z + .06], .045, .006, m.darkLeather, .003);
      belt.castShadow = false;
      cabin.box(.083, .105, .022, m.metal, sideRoot, upperX, 1.84, z + .055, .026);
      cabin.box(.051, .07, .028, m.black, sideRoot, upperX, 1.835, z + .071, .016);
      if (index === 0) {
        const vent = cabin.box(.018, .245, .082, m.black, sideRoot, side * 1.095, 1.0, z + .032, .018);
        for (let i = 0; i < 7; i++) cabin.box(.024, .007, .061, m.metal, sideRoot, side * 1.079, .915 + i * .027, z + .032, .002);
        cabin.register(vent, side < 0 ? 'rearLeft' : 'rearRight', 'fan');
      }
    });
  });
}

export function buildRoof(cabin) {
  const m = cabin.materials;
  const roof = new THREE.Group();
  cabin.root.add(roof);
  const roofMat = material(cabin, 'leather', { transparent: true, roughness: .97 });
  cabin.refs.roofMat = roofMat;
  // 厚实边框与中间天幕分开；剖视只隐藏大面积顶棚。
  [-1, 1].forEach(side => {
    const sideRoot = sideGroup(roof, side);
    const edge = cabin.box(.145, .075, 4.46, material(cabin, 'soft', { transparent: true }), sideRoot, side * 1.088, 2.237, .59, .042);
    shell(cabin, edge, .76);
    cabin.tube([[side * 1.145, 2.256, -1.58], [side * 1.145, 2.29, .56], [side * 1.084, 2.254, 2.79]], .018, m.darkLeather, sideRoot);
    cabin.tube([[side * 1.02, 2.208, -1.5], [side * 1.027, 2.205, .7], [side * 1.006, 2.202, 2.71]], .007, m.stitch, sideRoot);
  });
  const frontHeader = cabin.box(2.1, .08, .24, material(cabin, 'soft', { transparent: true }), roof, 0, 2.222, -1.525, .042);
  shell(cabin, frontHeader, .72);
  const rearHeader = cabin.box(2.06, .08, .20, material(cabin, 'soft', { transparent: true }), roof, 0, 2.218, 2.745, .043);
  shell(cabin, rearHeader, .72);

  const frontLiner = cabin.box(2.025, .061, 1.10, roofMat, roof, 0, 2.278, -.97, .046);
  shell(cabin, frontLiner, .05, true);
  const rearLiner = cabin.box(2.025, .061, .54, roofMat, roof, 0, 2.278, 2.46, .043);
  shell(cabin, rearLiner, .05, true);
  const topGlass = cabin.box(2.02, .012, 2.72, material(cabin, 'glass', { opacity: .28, color: '#81928f', side: THREE.DoubleSide, depthWrite: false }), roof, 0, 2.301, .89, .006);
  topGlass.castShadow = false;
  shell(cabin, topGlass, .025, true, .28);

  // 遮阳帘坐标沿用动画契约：初始长 2.52，起点 z=-0.37。
  const shade = new THREE.Group();
  roof.add(shade);
  cabin.register(shade, 'all', 'shade');
  const shadeMat = material(cabin, 'soft', { transparent: true, opacity: .92, roughness: 1, side: THREE.DoubleSide });
  const sheet = cabin.box(2.00, .012, 2.52, shadeMat, shade, 0, 2.258, .89, .004);
  sheet.castShadow = false;
  shell(cabin, sheet, .035, true, .92);
  const slats = [];
  for (let i = 0; i < 11; i++) {
    const slat = cabin.box(1.99, .005, .004, shadeMat, shade, 0, 2.251, -.37 + i * .252, .001);
    slat.castShadow = false;
    shell(cabin, slat, .035, true, .92);
    slats.push(slat);
  }
  const rail = cabin.box(2.005, .024, .038, material(cabin, 'metal', { transparent: true }), shade, 0, 2.252, 2.15, .01);
  shell(cabin, rail, .5);
  cabin.refs.shade = { root: shade, sheet, slats, rail, mat: shadeMat, amount: 0 };

  // 前排遮阳板与实体顶控台，剖切时隐藏大板而保留小件轮廓。
  [-1, 1].forEach(side => {
    const sideRoot = sideGroup(roof, side);
    const visor = cabin.box(.76, .043, .32, material(cabin, 'soft', { transparent: true }), sideRoot, side * .585, 2.18, -1.31, .035);
    visor.rotation.x = -.05;
    shell(cabin, visor, .03, true);
    const cover = cabin.box(.37, .006, .16, material(cabin, 'leather', { transparent: true }), visor, 0, -.025, -.015, .012);
    shell(cabin, cover, .03, true);
    [-.18, .73, 2.02].forEach(z => {
      cabin.tube([[side * .99, 2.17, z - .16], [side * .96, 2.09, z - .10], [side * .96, 2.09, z + .10], [side * .99, 2.17, z + .16]], .018, m.soft, sideRoot);
      cabin.box(.058, .05, .07, m.leather, sideRoot, side * 1.002, 2.173, z - .155, .015);
      cabin.box(.058, .05, .07, m.leather, sideRoot, side * 1.002, 2.173, z + .155, .015);
    });
  });
  // 手册18页：上方盖板、五枚横排按钮、下方三组控制。仅表达可见几何。
  const overhead = cabin.box(.38, .058, .55, m.leather, roof, 0, 2.188, -1.20, .045);
  overhead.name = '五键三分区顶控面板';
  const overheadSatin = material(cabin, 'metal', { metalness: .45, roughness: .62, envMapIntensity: .25 });
  cabin.box(.338, .007, .214, m.darkLeather, overhead, 0, -.032, -.137, .024);
  cabin.box(.328, .012, .204, m.leather, overhead, 0, -.039, -.137, .023);
  cabin.box(.093, .003, .008, overheadSatin, overhead, 0, -.047, -.166, .002);
  cabin.box(.337, .008, .076, m.soft, overhead, 0, -.034, .024, .012);
  for (let i = 0; i < 5; i++) {
    const x = (i - 2) * .062;
    cabin.box(.045, .011, .052, m.darkLeather, overhead, x, -.043, .024, .009);
    cabin.box(.031, .007, .037, m.soft, overhead, x, -.052, .024, .007);
    cabin.box(.013, .0015, .003, overheadSatin, overhead, x, -.057, .028, .001);
  }
  cabin.box(.339, .010, .184, m.darkLeather, overhead, 0, -.038, .161, .024);
  for (const side of [-1, 1]) {
    cabin.box(.067, .007, .078, m.black, overhead, side * .088, -.047, .138, .014);
    cabin.box(.047, .006, .058, m.soft, overhead, side * .088, -.053, .138, .010);
  }
  cabin.box(.068, .009, .087, m.black, overhead, 0, -.047, .138, .014);
  for (const side of [-1, 1]) cabin.box(.025, .007, .061, m.soft, overhead, side * .016, -.055, .138, .006);
  cabin.cylinder(.007, .007, .003, m.black, overhead, 0, -.048, .232, 20);
  const mirror = cabin.box(.33, .078, .029, m.black, roof, 0, 1.995, -1.51, .023);
  cabin.box(.295, .054, .004, m.metal, mirror, 0, 0, .017, .015);
  beam(cabin, roof, [0, 2.196, -1.55], [0, 2.025, -1.53], .045, .04, m.black, .012);

  // 后排屏仍绕横向铰链旋转：关闭 -π/2，展开约 0.06。
  const hinge = new THREE.Group();
  hinge.position.set(0, 2.205, .30);
  hinge.rotation.x = -Math.PI / 2;
  roof.add(hinge);
  cabin.register(hinge, 'all', 'rearScreen');
  const mount = cabin.box(.44, .048, .11, m.darkLeather, roof, 0, 2.205, .30, .023);
  cabin.register(mount, 'all', 'rearScreen');
  const rearDisplay = cabin.createDisplay(1.10, .62, hinge, 0, -.30, 0, 'rear', 'rearScreen');
  rearDisplay.rotation.x = 0;
  cabin.box(1.07, .585, .017, m.darkLeather, rearDisplay, 0, 0, -.036, .025);
  cabin.refs.rearScreen = hinge;
}

export function buildCabinDetails(cabin) {
  const m = cabin.materials;
  // 完整第三排侧围：窗台、收窄的尾窗、肩部扶手、轮罩和行李厢侧壁。
  [-1, 1].forEach(side => {
    const sideRoot = sideGroup(cabin.root, side);
    const quarter = sidePanel(cabin, sideRoot, side,
      [[1.60, .44], [3.09, .44], [3.11, 1.25], [2.70, 1.33], [1.61, 1.235]],
      .11, material(cabin, 'body', { opacity: 1 }), side * 1.18, 0, 0, .036);
    shell(cabin, quarter, .45);
    const inner = sidePanel(cabin, sideRoot, side,
      [[1.63, .47], [3.03, .47], [3.04, 1.19], [2.68, 1.265], [1.64, 1.18]],
      .065, m.leather, side * 1.102, 0, 0, .025);
    inner.userData.detail = '第三排侧围';
    sidePanel(cabin, sideRoot, side,
      [[1.67, .49], [2.86, .49], [2.80, .78], [2.67, .87], [1.80, .87], [1.66, .77]],
      .095, m.darkLeather, side * 1.00, 0, 0, .035);
    cabin.box(.22, .08, 1.06, m.soft, sideRoot, side * 1.012, 1.023, 2.245, .035);
    cabin.box(.18, .029, .96, m.wood, sideRoot, side * 1.015, 1.078, 2.265, .018);
    cabin.cylinder(.062, .057, .012, m.metal, sideRoot, side * 1.005, 1.096, 2.13, 40);
    cabin.cylinder(.053, .049, .018, m.black, sideRoot, side * 1.005, 1.105, 2.13, 40);
    const ambient = cabin.tube([[side * .900, 1.070, 1.78], [side * .902, 1.074, 2.18], [side * .906, 1.074, 2.65]], .006, m.glow, sideRoot);
    cabin.refs.ambient.push(ambient);
    cabin.register(ambient, 'all', 'ambient');
    speaker(cabin, sideRoot, side, side * 1.08, .88, 2.81, .21, .18);

    const quarterGlass = glassQuad(cabin, sideRoot, [
      [side * 1.23, 1.28, 1.66], [side * 1.175, 1.325, 2.986],
      [side * 1.044, 2.17, 2.765], [side * 1.101, 2.195, 1.62],
    ], material(cabin, 'glass', { opacity: .23, side: THREE.DoubleSide, depthWrite: false }));
    shell(cabin, quarterGlass, .085, false, .23);
    legacyExterior(cabin.tube([
      [side * 1.22, 1.263, 1.64], [side * 1.173, 1.303, 3.004],
      [side * 1.036, 2.19, 2.79], [side * 1.094, 2.215, 1.605], [side * 1.22, 1.263, 1.64],
    ], .022, m.darkLeather, sideRoot), '旧固定侧窗框');
    legacyExterior(cabin.tube([[side * 1.237, 1.285, 1.645], [side * 1.19, 1.33, 3.004]], .008, m.metal, sideRoot), '旧固定侧窗亮条');
    // 第三排安全带上固定点及行李挂钩。
    beam(cabin, sideRoot, [side * 1.012, 1.905, 2.89], [side * .998, .79, 2.82], .04, .006, m.darkLeather, .003);
    cabin.box(.085, .076, .018, m.metal, sideRoot, side * 1.016, 1.89, 2.91, .02);
    cabin.box(.035, .055, .087, m.metal, sideRoot, side * 1.082, .81, 2.95, .01);
  });

  // 尾门下饰板与尾窗收拢成完整包围，不再留下开放式船尾。
  const tail = cabin.box(2.15, .79, .12, material(cabin, 'body', { opacity: 1 }), cabin.root, 0, .86, 3.08, .07);
  shell(cabin, tail, .45);
  cabin.box(2.065, .61, .07, m.leather, cabin.root, 0, .92, 2.995, .055);
  cabin.box(2.085, .09, .13, m.darkLeather, cabin.root, 0, 1.267, 3.02, .028);
  cabin.box(.26, .055, .022, m.black, cabin.root, 0, 1.01, 2.945, .018);
  cabin.box(2.07, .025, .37, m.carpet, cabin.root, 0, .477, 2.97, .026);
  const rearGlass = glassQuad(cabin, cabin.root, [
    [-1.145, 1.313, 3.105], [1.145, 1.313, 3.105],
    [1.022, 2.175, 2.815], [-1.022, 2.175, 2.815],
  ], material(cabin, 'glass', { opacity: .25, side: THREE.DoubleSide, depthWrite: false }));
  shell(cabin, rearGlass, .075, false, .25);
  cabin.refs.rearGlass = rearGlass;
  legacyExterior(cabin.tube([[-1.155, 1.30, 3.116], [-1.037, 2.203, 2.819], [1.037, 2.203, 2.819], [1.155, 1.30, 3.116]], .027, m.darkLeather, cabin.root), '旧后风挡框');
  // 细加热线强调尾窗平面与真实尺度。
  for (let i = 1; i < 7; i++) {
    const a = i / 8, half = THREE.MathUtils.lerp(1.14, 1.023, a);
    legacyExterior(cabin.tube([[-half, 1.313 + .862 * a, 3.109 - .29 * a], [half, 1.313 + .862 * a, 3.109 - .29 * a]], .0017, m.gold, cabin.root), '旧后窗加热线');
  }

  // 充电盖采用真实铰链原点，仍暴露 rotation.y 给现有动画。
  const chargePort = new THREE.Group();
  chargePort.userData.shellSide = 1;
  chargePort.position.set(1.308, .76, 2.77);
  cabin.root.add(chargePort);
  cabin.register(chargePort, 'all', 'chargePort');
  const cover = cabin.box(.025, .175, .21, m.body, chargePort, 0, 0, -.095, .022);
  cabin.register(cover, 'all', 'chargePort');
  const inset = cabin.box(.018, .137, .172, m.black, cabin.root, 1.294, .76, 2.68, .019);
  inset.userData.shellSide = 1;
  cabin.register(inset, 'all', 'chargePort');
  cabin.refs.chargePort = chargePort;
  legacyExterior(chargePort, '旧充电盖');
  legacyExterior(inset, '旧充电口凹槽');
  cabin.refs.floorLabel = null;
}
