import * as THREE from 'three';

// 原创近似造型：前排结合汽车之家公开实拍校准软包轮廓；六座布局沿用原任务基线。
// 不是原厂 CAD，不加载或复制汽车网站的三维模型、照片贴图。
const sharedAssets = new WeakMap();
// 在超椭球指数小于 1 时，浮点三角函数的极小残差会被放大；极点须精确重合。
const signedPower = (value, power) => Math.abs(value) < 1e-12 ? 0 : Math.sign(value) * Math.pow(Math.abs(value), power);
const mix = (a, b, t) => a + (b - a) * t;

function smoothCoincidentNormals(geometry) {
  const p = geometry.attributes.position, groups = new Map(), groupIds = new Uint32Array(p.count);
  // 仅合并法线累积量，不合并顶点，因此经度两侧的独立 UV 得到保留。
  for (let i = 0; i < p.count; i++) {
    const key = [p.getX(i), p.getY(i), p.getZ(i)].map(v => Math.round(v * 1e7)).join(',');
    if (!groups.has(key)) groups.set(key, groups.size);
    groupIds[i] = groups.get(key);
  }
  const sums = new Float64Array(groups.size * 3), index = geometry.index.array;
  for (let i = 0; i < index.length; i += 3) {
    const a = index[i], b = index[i + 1], c = index[i + 2];
    const bx = p.getX(b) - p.getX(a), by = p.getY(b) - p.getY(a), bz = p.getZ(b) - p.getZ(a);
    const cx = p.getX(c) - p.getX(a), cy = p.getY(c) - p.getY(a), cz = p.getZ(c) - p.getZ(a);
    const nx = by * cz - bz * cy, ny = bz * cx - bx * cz, nz = bx * cy - by * cx;
    if (nx * nx + ny * ny + nz * nz < 1e-24) continue;
    for (const v of [a, b, c]) { const group = groupIds[v] * 3; sums[group] += nx; sums[group + 1] += ny; sums[group + 2] += nz; }
  }
  const normals = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const g = groupIds[i] * 3, length = Math.hypot(sums[g], sums[g + 1], sums[g + 2]);
    if (length > 1e-15) { normals[i * 3] = sums[g] / length; normals[i * 3 + 1] = sums[g + 1] / length; normals[i * 3 + 2] = sums[g + 2] / length; }
    else normals[i * 3 + 1] = 1;
  }
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
}

function makeGeometry(positions, uvs, indices, smoothSeams = false) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  if (smoothSeams) smoothCoincidentNormals(geometry); else geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

// 超椭球泡棉：所有主受光面连续弯曲，避免方盒子加倒角的平板感。
function pillowGeometry(verticalExponent = .53, horizontalExponent = .52, variant = 'normal') {
  const positions = [], uvs = [], indices = [];
  const feature = variant === 'head' || variant === 'shoulder', rows = feature ? 28 : 24, columns = feature ? 56 : 48;
  for (let row = 0; row <= rows; row++) {
    const latitude = -Math.PI / 2 + row / rows * Math.PI;
    for (let column = 0; column <= columns; column++) {
      const longitude = column / columns * Math.PI * 2;
      let x = signedPower(Math.cos(latitude), verticalExponent) * signedPower(Math.cos(longitude), horizontalExponent) * .5;
      let y = signedPower(Math.sin(latitude), verticalExponent) * .5;
      let z = signedPower(Math.cos(latitude), verticalExponent) * signedPower(Math.sin(longitude), horizontalExponent) * .5;
      if (variant === 'cushion') {
        x *= .94 - z * .07; // 坐垫前宽后收。
        y += .045 * Math.cos(z * Math.PI * 1.6) * (1 - Math.pow(x * 1.8, 2));
      } else if (variant === 'wing') {
        x *= .84 + Math.sin((y + .5) * Math.PI) * .16;
        z -= .17 * Math.sin((y + .5) * Math.PI); // 腰部厚，肩部顺势收回。
      } else if (variant === 'head') {
        z -= .12 * (1 - Math.pow(x * 2, 2));
        x *= .93 + (y + .5) * .07;
      } else if (variant === 'shoulder') {
        z -= .10 * (1 - Math.pow(x * 2, 2));
        y += .04 * Math.cos(x * Math.PI * 2);
      }
      positions.push(x, y, z); uvs.push(column / columns, row / rows);
      if (row < rows && column < columns) {
        const a = row * (columns + 1) + column, b = a + columns + 1;
        if (row > 0) indices.push(a, b, a + 1);
        if (row < rows - 1) indices.push(b, b + 1, a + 1);
      }
    }
  }
  const geometry = makeGeometry(positions, uvs, indices, true);
  geometry.userData.continuousSurface = true;
  return geometry;
}

function profileAt(keys, y) {
  for (let i = 0; i < keys.length - 1; i++) {
    if (y <= keys[i + 1][0]) {
      const a = keys[i], b = keys[i + 1]; let t = (y - a[0]) / (b[0] - a[0]);
      t = Math.max(0, Math.min(1, t)); t = t * t * (3 - 2 * t);
      return [mix(a[1], b[1], t), mix(a[2], b[2], t), mix(a[3], b[3], t)];
    }
  }
  return keys.at(-1).slice(1);
}

function shellGeometry(width) {
  const keys = [[0, .31, .045, .04], [.07, .37, .081, .038], [.22, .355, .088, .045],
    [.43, .33, .073, .039], [.60, .382, .075, .032], [.71, .397, .067, .028],
    [.78, .31, .038, .030], [.805, .23, .008, .030]];
  const positions = [], uvs = [], indices = [], rows = 36, columns = 48;
  for (let row = 0; row <= rows; row++) {
    const y = .805 * row / rows, [halfWidth, halfDepth, center] = profileAt(keys, y);
    for (let col = 0; col <= columns; col++) {
      const theta = col / columns * Math.PI * 2;
      positions.push(signedPower(Math.cos(theta), .56) * halfWidth * width / .84, y,
        center + signedPower(Math.sin(theta), .65) * halfDepth);
      uvs.push(col / columns, row / rows);
      if (row < rows && col < columns) {
        const a = row * (columns + 1) + col, b = a + columns + 1;
        indices.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
  }
  // 两端封口隐藏在坐垫和肩托中，避免空心背壳露出。
  const bottom = positions.length / 3; positions.push(0, 0, .04); uvs.push(.5, 0);
  const top = positions.length / 3; positions.push(0, .805, .03); uvs.push(.5, 1);
  for (let col = 0; col < columns; col++) {
    indices.push(bottom, col, col + 1);
    const a = rows * (columns + 1) + col; indices.push(top, a + 1, a);
  }
  return makeGeometry(positions, uvs, indices, true);
}

// 有厚度的曲面镶片，正面朝向由 normal 指定，周边封闭。
function panelGeometry(point, normal = 'front', thickness = .028, rows = 28, columns = 24) {
  const positions = [], uvs = [], indices = [], stride = columns + 1;
  const move = normal === 'top' ? [0, -thickness, 0] : normal === 'rear' ? [0, 0, -thickness] : [0, 0, thickness];
  for (let face = 0; face < 2; face++) for (let row = 0; row <= rows; row++) for (let col = 0; col <= columns; col++) {
    const p = point(col / columns * 2 - 1, row / rows);
    positions.push(p[0] + move[0] * face, p[1] + move[1] * face, p[2] + move[2] * face);
    uvs.push(col / columns, 1 - row / rows);
  }
  const faceCount = stride * (rows + 1), flip = normal !== 'rear';
  for (let face = 0; face < 2; face++) for (let row = 0; row < rows; row++) for (let col = 0; col < columns; col++) {
    const a = face * faceCount + row * stride + col, b = a + stride;
    if ((face === 0) === flip) indices.push(a, b, a + 1, b, b + 1, a + 1);
    else indices.push(a, a + 1, b, b, a + 1, b + 1);
  }
  const boundary = [];
  for (let col = 0; col <= columns; col++) boundary.push(col);
  for (let row = 1; row <= rows; row++) boundary.push(row * stride + columns);
  for (let col = columns - 1; col >= 0; col--) boundary.push(rows * stride + col);
  for (let row = rows - 1; row > 0; row--) boundary.push(row * stride);
  for (let i = 0; i < boundary.length; i++) {
    const a = boundary[i], b = boundary[(i + 1) % boundary.length];
    indices.push(a, b, a + faceCount, b, b + faceCount, a + faceCount);
  }
  return makeGeometry(positions, uvs, indices);
}

function texture(cabin, canvas, color = true) {
  const map = new THREE.CanvasTexture(canvas);
  if (color) map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = Math.min(cabin.renderer?.capabilities?.getMaxAnisotropy?.() || 4, 8);
  cabin.textures.add(map); return map;
}

function trimMaterial(material, role) {
  // 外部 setTrim 可遍历网格及线段，根据语义角色统一更新克隆材质。
  material.userData = { ...material.userData, trimRole: role };
  return material;
}

function assets(cabin) {
  if (sharedAssets.has(cabin)) return sharedAssets.get(cabin);
  // 同时标记原始材质：座椅阅读灯外壳等直接使用这些对象，并非全部克隆。
  for (const role of ['leather', 'soft', 'darkLeather', 'stitch']) {
    if (cabin.materials[role]) trimMaterial(cabin.materials[role], role);
  }
  const color = document.createElement('canvas'), bump = document.createElement('canvas');
  color.width = color.height = bump.width = bump.height = 1024;
  const c = color.getContext('2d'), b = bump.getContext('2d');
  // 中性色深浅只表达纹理；内饰色相完全由 trimRole 对应的调色板提供。
  c.fillStyle = '#e6e6e6'; c.fillRect(0, 0, 1024, 1024);
  b.fillStyle = '#858585'; b.fillRect(0, 0, 1024, 1024);
  // 三列大菱形采用偏移裁剪，纹理正好包覆座椅曲面，而非额外贴浮线条。
  const sx = 328, sy = 254;
  for (let row = -2; row < 7; row++) for (let col = -2; col < 6; col++) {
    const x = col * sx + (row % 2 ? sx / 2 : 0), y = row * sy;
    const diamond = new Path2D(); diamond.moveTo(x, y - sy); diamond.lineTo(x + sx / 2, y);
    diamond.lineTo(x, y + sy); diamond.lineTo(x - sx / 2, y); diamond.closePath();
    const gradient = c.createRadialGradient(x - 25, y - 35, 12, x, y, sy);
    gradient.addColorStop(0, 'rgba(255,255,255,.12)'); gradient.addColorStop(1, 'rgba(90,90,90,.04)');
    c.fillStyle = gradient; c.fill(diamond); c.strokeStyle = 'rgba(110,110,110,.28)'; c.lineWidth = 5; c.stroke(diamond);
    c.strokeStyle = 'rgba(244,244,244,.94)'; c.lineWidth = 1.7; c.setLineDash([5, 3.6]); c.stroke(diamond); c.setLineDash([]);
    const height = b.createRadialGradient(x, y, 0, x, y, sy); height.addColorStop(0, '#bcbcbc'); height.addColorStop(1, '#808080');
    b.fillStyle = height; b.fill(diamond); b.strokeStyle = '#555'; b.lineWidth = 5; b.stroke(diamond);
  }
  for (let y = 9; y < 1024; y += 13) for (let x = 9; x < 1024; x += 13) {
    c.fillStyle = 'rgba(75,75,75,.23)'; c.beginPath(); c.arc(x + ((y / 13 | 0) % 2 ? 5 : 0), y, 1.25, 0, Math.PI * 2); c.fill();
    b.fillStyle = '#6b6b6b'; b.fillRect(x, y, 1.2, 1.2);
  }
  const map = texture(cabin, color), bumpMap = texture(cabin, bump, false);
  const quilt = trimMaterial(new THREE.MeshStandardMaterial({ color: '#fff9ed', map, bumpMap, bumpScale: .0019, metalness: .018, roughness: .79 }), 'soft');
  const leather = trimMaterial(cabin.materials.leather.clone(), 'leather'); leather.color.set('#e5dbc9'); leather.roughness = .76;
  const perforationCanvas = document.createElement('canvas'); perforationCanvas.width = perforationCanvas.height = 256;
  const perforation = perforationCanvas.getContext('2d'); perforation.fillStyle = '#f4f4f4'; perforation.fillRect(0,0,256,256);
  for(let y=4;y<256;y+=8) for(let x=4;x<256;x+=8){perforation.fillStyle='rgba(62,62,62,.38)';perforation.beginPath();perforation.arc(x+(y%16?0:4),y,.85,0,Math.PI*2);perforation.fill();}
  const perforated = trimMaterial(leather.clone(),'leather'); perforated.map=texture(cabin,perforationCanvas);perforated.roughness=.83;
  const shell = trimMaterial(cabin.materials.soft.clone(), 'soft'); shell.color.set('#d5c9b3'); shell.roughness = .86;
  // 包边跟随皮革本色，只有细小针脚使用线色，避免整条轮廓像亮金属管。
  const piping = trimMaterial(new THREE.MeshStandardMaterial({ color: '#d3c6b3', roughness: .96 }), 'leather');
  const thread = trimMaterial(new THREE.LineBasicMaterial({ color: '#f0e2c6', transparent: true, opacity: .64 }), 'stitch');
  const assets = {
    quilt, leather, perforated, shell, piping, thread,
    pillows: { normal: pillowGeometry(), cushion: pillowGeometry(.54, .46, 'cushion'),
      wing: pillowGeometry(.65, .57, 'wing'), head: pillowGeometry(.70, .67, 'head'), frontHead: pillowGeometry(.77, .65, 'head'), shoulder: pillowGeometry(.57, .49, 'shoulder') },
    buckle: new THREE.MeshStandardMaterial({ color: '#a9352e', roughness: .66 }),
  };
  sharedAssets.set(cabin, assets); return assets;
}

function addMesh(geometry, material, parent, position = [0, 0, 0]) {
  const mesh = new THREE.Mesh(geometry, material); mesh.position.set(...position);
  mesh.castShadow = mesh.receiveShadow = true; parent.add(mesh); return mesh;
}

function pillow(shared, parent, dimensions, position, material = shared.leather, variant = 'normal') {
  const mesh = addMesh(shared.pillows[variant], material, parent, position); mesh.scale.set(...dimensions); return mesh;
}

function stitchLine(parent, shared, points, { closed = false, radius = .00075, normal = [0, 0, -1] } = {}) {
  const curve = new THREE.CatmullRomCurve3(points.map(point => new THREE.Vector3(...point)), closed, 'centripetal');
  const pipe = addMesh(new THREE.TubeGeometry(curve, Math.max(30, points.length * 5), radius, 4, closed), shared.piping, parent);
  pipe.castShadow = false;
  const dashed = [], samples = Math.max(40, Math.floor(curve.getLength() / .004));
  for (let i = 0; i < samples - 1; i += 2) {
    const a = curve.getPoint(i / samples), b = curve.getPoint((i + 1) / samples);
    const offset = radius + .00015;
    dashed.push(a.x + normal[0] * offset, a.y + normal[1] * offset, a.z + normal[2] * offset,
      b.x + normal[0] * offset, b.y + normal[1] * offset, b.z + normal[2] * offset);
  }
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(dashed, 3));
  const stitches = new THREE.LineSegments(geometry, shared.thread); parent.add(stitches); return pipe;
}

export function buildSeat(cabin, id, x, z, index) {
  const m = cabin.materials, a = assets(cabin), third = index > 3, captain = index === 2 || index === 3, front = index < 2;
  const width = third ? .77 : .84;
  const seat = new THREE.Group(); seat.name = `座椅-${id}`; seat.position.set(x, .45, z); cabin.root.add(seat); cabin.register(seat, id, 'seat');
  [-.23, .23].forEach(rx => {
    cabin.box(.043, .055, .80, m.metal, seat, rx, .047, -.04, .012);
    cabin.box(.058, .05, .40, m.black, seat, rx, .093, -.04, .011);
  });
  pillow(a, seat, [width - .05, .19, .76], [0, .208, -.055], a.shell, 'cushion');
  pillow(a, seat, [width, .205, .82], [0, .329, -.095], a.leather, 'cushion');
  const cushionPoint = (u, v) => {
    const px = u * (width * .325 + .008 * Math.sin(v * Math.PI)), pz = -.424 + v * .61;
    // 使用底层同一个超椭球的上包络，保证整个镶片至少高出泡棉 5mm。
    const zn = (pz + .095) / .82, xn = (px / width) / (.94 - zn * .07);
    const radial = Math.pow(Math.abs(xn) * 2, 2 / .46) + Math.pow(Math.abs(zn) * 2, 2 / .46);
    const yn = .5 * Math.pow(Math.max(0, 1 - Math.pow(radial, .46 / .54)), .54 / 2);
    const swell = .045 * Math.cos(zn * Math.PI * 1.6) * (1 - Math.pow(px / width * 1.8, 2));
    const foamTop = .329 + .205 * (yn + swell);
    const designY = .447 + .012 * Math.cos(v * Math.PI) + .011 * (1 - u * u) - .007 * Math.sin(v * Math.PI);
    return [px, Math.max(designY, foamTop + .005), pz];
  };
  addMesh(panelGeometry(cushionPoint, 'top', .035), a.quilt, seat);
  [-1, 1].forEach(side => {
    const bolster = pillow(a, seat, [.145, .14, .73], [side * (width / 2 - .055), .405, -.09], a.leather, 'cushion');
    bolster.rotation.z = side * -.055;
    stitchLine(seat, a, [[side * (width / 2 - .13), .442, -.422], [side * (width / 2 - .105), .478, -.29],
      [side * (width / 2 - .111), .48, -.03], [side * (width / 2 - .12), .437, .22]], { normal: [0, 1, 0] });
  });
  // 前端瀑布边与连续围边缝线。
  stitchLine(seat, a, [[-width * .35, .33, -.496], [-width * .17, .35, -.51], [0, .354, -.513], [width * .17, .35, -.51], [width * .35, .33, -.496]]);
  const back = new THREE.Group(); back.position.set(0, .39, .25); back.rotation.x = .105; seat.add(back);
  addMesh(shellGeometry(width), a.shell, back);
  const frontPoint = (u, v) => {
    const halfWidth = width * (.30 + .012 * Math.sin(v * Math.PI));
    const lumbar = .038 * Math.exp(-Math.pow((v - .27) / .24, 2));
    return [u * halfWidth, .063 + v * .503, -.083 - .027 * (1 - u * u) - lumbar + .012 * Math.pow(Math.abs(u), 4)];
  };
  const frontGeometry = panelGeometry(frontPoint, 'front', .035); addMesh(frontGeometry, a.quilt, back);
  // 两侧腰翼独立鼓起，肩托横贯上部；间隙对应真实分件，而非黑色平板。
  [-1, 1].forEach(side => {
    const wing = pillow(a, back, front ? [.132,.586,.188] : [.145,.64,.235], [side * (width / 2 - .08), .32, front ? -.035 : -.047], a.leather, 'wing');
    wing.rotation.z = side * -.065;
    stitchLine(back, a, [[side * (width / 2 - .142), .06, -.129], [side * (width / 2 - .118), .22, -.17],
      [side * (width / 2 - .116), .43, -.166], [side * (width / 2 - .14), .598, -.115]]);
  });
  if(front){
    // 单片宽肩软包顺接背壳，底边下沉成浅 V，不再叠放一条方枕。
    const shoulderPoint=(u,v)=>[u*width*(.32+.055*Math.sin(v*Math.PI)),.548+v*.241+.044*u*u*(1-v),-.115+.116*v*v-.034*(1-u*u)*Math.sin(v*Math.PI)+.033*Math.pow(u,4)*Math.sin(v*Math.PI)];
    addMesh(panelGeometry(shoulderPoint,'front',.022,24,32),a.leather,back);
    stitchLine(back,a,Array.from({length:17},(_,i)=>shoulderPoint(i/8-1,0)),{radius:.00085});
  }else{
    // 后排肩托包覆背壳：中段鼓起、边缘收拢，替代横放在靠背上的独立厚枕。
    const shoulderPoint=(u,v)=>[u*width*(.35+.10*Math.sin(v*Math.PI)),.548+v*.244+.050*u*u*(1-v),
      -.112+.114*v*v-.044*(1-u*u)*Math.sin(v*Math.PI)+.030*Math.pow(u,4)*Math.sin(v*Math.PI)];
    addMesh(panelGeometry(shoulderPoint,'front',.027,24,32),a.leather,back);
    stitchLine(back,a,Array.from({length:17},(_,i)=>shoulderPoint(i/8-1,0)));
  }
  // 徽饰放在肩托与镶片的分件缝隙前方，避免嵌进皮革形成深度闪烁。
  cabin.box(.14, .010, .007, m.metal, back, 0, .578, -.143, .003);
  // 同色曲面背壳和隆起储物袋，后排看见的也具有皮革结构。
  const pocketPoint = (u, v) => [u * (width * .335 - .018 * v), .077 + v * .215,
    .121 + .026 * (1 - u * u) * Math.sin(v * Math.PI * .76) + .008 * v];
  addMesh(panelGeometry(pocketPoint, 'rear', .018, 14, 24), a.leather, back);
  const pocketRim = Array.from({ length: 11 }, (_, i) => pocketPoint(i / 5 - 1, 1));
  stitchLine(back, a, pocketRim, { radius: .0011, normal: [0, 0, 1] });
  [-1, 1].forEach(side => stitchLine(back, a, [[side * width * .34, .07, .115], [side * width * .345, .33, .12], [side * width * .315, .54, .113], [side * width * .34, .70, .087]], { normal: [0, 0, 1] }));
  // 双金属导柱与有侧向承托的头枕。
  [-.104, .104].forEach(hx => {
    cabin.cylinder(.011, .011, .158, m.metal, back, hx, .839, .015, 12);
    cabin.cylinder(.021, .020, .018, a.shell, back, hx, .777, .015, 14);
  });
  const headWidth = third ? .41 : front ? .412 : .46;
  if(front){
    pillow(a,back,[headWidth,.307,.18],[0,.963,-.013],a.leather,'frontHead');
    // 镶片沿同一超椭球表面展开：中央竖条与两侧穿孔面，不另叠头枕方块。
    const headSurface=(u,v)=>{
      const yn=(v-.5)*.88,radial=.5*Math.pow(Math.sqrt(Math.max(0,1-Math.pow(Math.abs(yn)*2,2/.77))),.77);
      const xn=u*radial*.92,cosine=Math.pow(Math.abs(xn/radial),1/.65);
      const zn=-radial*Math.pow(Math.sqrt(Math.max(0,1-cosine*cosine)),.65)-.12*(1-Math.pow(xn*2,2));
      return [xn*(.93+(yn+.5)*.07)*headWidth,.963+yn*.307,-.013+zn*.18-.001];
    };
    for(const side of [-1,1]){
      const patch=(u,v)=>headSurface((side<0?-1:.17)+(u+1)*.415,v);
      addMesh(panelGeometry(patch,'front',.002,24,16),a.perforated,back);
      stitchLine(back,a,Array.from({length:15},(_,i)=>headSurface(side*.17,i/14)),{radius:.00065});
    }
  }else{
    pillow(a, back, [headWidth, .258, .208], [0, .957, -.013], a.leather, 'head');
    // 同一泡棉表面的分缝，不再叠加中央小枕与左右三块独立头垫。
    const headSurface=(u,v)=>{
      const yn=(v-.5)*.86,radial=.5*Math.pow(Math.sqrt(Math.max(0,1-Math.pow(Math.abs(yn)*2,2/.70))),.70);
      const xn=u*radial*.92,cosine=Math.pow(Math.abs(xn/radial),1/.67);
      const zn=-radial*Math.pow(Math.sqrt(Math.max(0,1-cosine*cosine)),.67)-.12*(1-Math.pow(xn*2,2));
      return [xn*(.93+(yn+.5)*.07)*headWidth,.957+yn*.258,-.013+zn*.208-.0012];
    };
    for(const side of [-1,1])stitchLine(back,a,Array.from({length:19},(_,i)=>headSurface(side*.61,i/18)),{radius:.0006});
    stitchLine(back,a,Array.from({length:17},(_,i)=>headSurface((i/8-1)*.61,.055)),{radius:.0006});
  }
  // 仅六座基线的第二排独立座椅保留双扶手，前排使用车门和中岛扶手。
  if (captain) [-1, 1].forEach(side => {
    const armX = side * (width / 2 + (captain ? .037 : .017));
    const armZ = captain ? -.003 : .053, length = captain ? .62 : .48;
    pillow(a, seat, [captain ? .146 : .102, .123, length], [armX, .584, armZ], a.leather, 'cushion');
    pillow(a, seat, [captain ? .136 : .093, .103, length * .88], [armX, .511, armZ + .025], a.shell, 'cushion');
    cabin.box(captain ? .13 : .085, .013, length * .86, m.metal, seat, armX, .523, armZ + .008, .005);
    cabin.box(.034, .19, .063, m.metal, seat, armX, .405, .213, .014);
    stitchLine(seat, a, [[armX - .036, .616, armZ - length * .42], [armX + .024, .638, armZ - length * .29], [armX + .044, .639, armZ + length * .27]], { normal: [0, 1, 0] });
    if (captain && side === (x < 0 ? 1 : -1)) {
      cabin.box(.075, .018, .11, m.black, seat, armX, .648, armZ + .14, .009);
      for (let i = 0; i < 3; i++) cabin.box(.038, .007, .008, m.metal, seat, armX, .66, armZ + .114 + i * .024, .003);
    }
  });
  if (captain) {
    // 腿托只作折叠造型，不新增状态，也不宣称真实电动执行。
    const leg = new THREE.Group(); leg.position.set(0, .32, -.45); leg.rotation.x = -.36; seat.add(leg);
    pillow(a, leg, [width * .71, .247, .103], [0, -.075, -.016], a.leather, 'cushion');
    stitchLine(leg, a, [[-width * .25, -.14, -.069], [0, -.176, -.073], [width * .25, -.14, -.069]]);
    [-.19, .19].forEach(lx => cabin.box(.035, .13, .04, m.metal, leg, lx, -.027, .042, .01));
  }
  const outer = x < 0 ? -1 : 1;
  const controls = cabin.box(.019, .084, .27, a.shell, seat, outer * (width / 2 -.006), .23, -.135, .008);
  controls.castShadow = false;
  cabin.box(.023, .025, .112, m.metal, seat, outer * (width / 2 + .007), .233, -.18, .01);
  cabin.box(.025, .050, .034, m.metal, seat, outer * (width / 2 + .007), .24, -.078, .01);
  if(front){
    // 实拍可见的前排靠背内侧电动拨键，以薄椭圆嵌框表达。
    const side=-outer,controlX=side*(width*.42+.003);
    pillow(a,back,[.012,.185,.131],[controlX,.265,.030],m.metal);
    pillow(a,back,[.010,.168,.115],[controlX+side*.006,.265,.030],m.black);
    cabin.box(.012,.025,.061,m.metal,back,controlX+side*.013,.226,.009,.005);
    const reclineKey=cabin.box(.012,.055,.023,m.metal,back,controlX+side*.013,.298,.054,.005);reclineKey.rotation.x=-.19;
  }
  const buckleX = -outer * (width / 2 + .018);
  cabin.box(.044, .078, .058, m.black, seat, buckleX, .4, .179, .009);
  cabin.box(.032, .016, .035, a.buckle, seat, buckleX, .443, .172, .005);
  // 原动画契约保持不变：effect.material、massage.material、六个 airflow 子节点。
  const effectMat = new THREE.MeshStandardMaterial({ color: '#69cfc9', emissive: '#69cfc9', emissiveIntensity: 1, transparent: true, opacity: .1, roughness: .5, depthWrite: false });
  const effect = cabin.box(width -.09, .012, .66, effectMat, seat, 0, .126, -.063, .005);
  const massageMaterial = new THREE.MeshBasicMaterial({ color: '#d5c89c', transparent: true, opacity: 0, depthWrite: false });
  const massage = addMesh(frontGeometry.clone(), massageMaterial, back, [0, 0, -.0018]); massage.castShadow = massage.receiveShadow = false;
  const airflow = new THREE.Group(); seat.add(airflow); airflow.visible = false;
  for (let i = 0; i < 6; i++) {
    const puff = cabin.box(.008, .065, .008, new THREE.MeshBasicMaterial({ color: '#85dbf5', transparent: true, opacity: .6, depthWrite: false }), airflow, (i % 3 - 1) * .15, .56, i < 3 ? -.28 : -.07, .003);
    puff.castShadow = false; puff.userData.phase = i * .15;
  }
  cabin.refs.seats[id] = { root: seat, back, z, effect, massage, airflow };
  const reading = new THREE.Group(); reading.position.set(x, 2.12, z -.26); cabin.root.add(reading);
  const housing = cabin.box(.152, .024, .077, m.darkLeather, reading, 0, 0, 0, .013);
  const lampMat = new THREE.MeshStandardMaterial({ color: '#adab97', emissive: '#ffe4ac', emissiveIntensity: .05 });
  const lamp = cabin.box(.096, .009, .034, lampMat, reading, 0, -.018, 0, .004);
  const light = new THREE.PointLight('#ffdb9e', 0, 1.7, 2); light.position.y = -.10; reading.add(light);
  cabin.register(housing, id, 'reading'); cabin.register(lamp, id, 'reading');
  cabin.refs.reading[id] = { root: reading, lamp, light };
  return seat;
}
