import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

/** 原创外观重建，视觉依据：享界 G9 纯电版手册 G9OM26C1 第 15—16 页。
 * https://hima.auto/xiangjie/service/
 * 汽车之家配置 78750 已核实为 2026 款纯电 Ultra+ 六座；未下载其三维资产。
 * 本轮外观细节另参考用户全景截图：2026 款增程 Ultra+ 六座（细多辐轮毂）。
 * 这是跨动力版本的外观观察，不能据此认定纯电版本的全部选装和外形细节相同。
 * 外形、曲面、接缝、轮毂及运动机构是观察图示后的程序近似，并非原厂 CAD。
 * 使用约 2.05 m 宽、5.2 m 车身、3.16 m 轴距的展示比例；外挂箱另占尾部空间。
 * 坐标：车头 -z，左侧 -x，地面 y=-.08；此坐标作为内外统一装配的车辆坐标。
 * 不自行加入场景，不写 cabin.refs；门窗、充电口由装配层接入唯一的状态动画。
 * update 只处理外灯日夜展示，不增加实车控制能力。
 */
const WHEELS = [-1.58, 1.58];
const AXLE_Y = .3705, TIRE_R = .4505, ARCH_R = .505;
const clamp = (v, a, b) => Math.max(a, Math.min(b, Number(v) || 0));

function put(parent, geometry, material, name = '') {
  const obj = new THREE.Mesh(geometry, material); obj.name = name;
  obj.castShadow = true; obj.receiveShadow = true; parent.add(obj); return obj;
}
function box(parent, w, h, d, material, x, y, z, r = .025) {
  const geo = r > 0 ? new RoundedBoxGeometry(w, h, d, 4, Math.min(r, Math.min(w, h, d) * .46)) : new THREE.BoxGeometry(w, h, d);
  const obj = put(parent, geo, material); obj.position.set(x, y, z); return obj;
}
function tube(parent, points, radius, material, closed = false) {
  const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)), closed, 'centripetal');
  return put(parent, new THREE.TubeGeometry(curve, Math.max(20, points.length * 6), radius, 8, closed), material);
}
function cylinder(parent, radius, depth, material, x, y, z, axis = 'x', segments = 64) {
  const obj = put(parent, new THREE.CylinderGeometry(radius, radius, depth, segments), material);
  if (axis === 'x') obj.rotation.z = Math.PI / 2;
  if (axis === 'z') obj.rotation.x = Math.PI / 2;
  obj.position.set(x, y, z); return obj;
}
function ring(parent, radius, thick, material, x, y, z, axis = 'z') {
  const obj = put(parent, new THREE.TorusGeometry(radius, thick, 10, 72), material);
  if (axis === 'x') obj.rotation.y = Math.PI / 2;
  if (axis === 'y') obj.rotation.x = Math.PI / 2;
  obj.position.set(x, y, z); return obj;
}
function patch(parent, points, material, name = '') {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(points.flat(), 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
  g.setIndex([0, 1, 2, 0, 2, 3]); g.computeVertexNormals(); return put(parent, g, material, name);
}
function beam(parent, a, b, width, depth, material) {
  const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b);
  const obj = box(parent, width, start.distanceTo(end), depth, material, 0, 0, 0, .035);
  obj.position.copy(start).add(end).multiplyScalar(.5);
  obj.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.sub(start).normalize()); return obj;
}
function register(obj, target, domain) { obj.userData.target = target; obj.userData.domain = domain; return obj; }
function sideWidth(y, z) {
  const belly = .949 + .075 * Math.sin(clamp((y - .35) / .90, 0, 1) * Math.PI * .78);
  const corner = Math.max(0, Math.abs(z) - 2.25) / .35;
  return belly - .063 * corner * corner;
}
function bottomAt(z) {
  let h = .355;
  for (const axle of WHEELS) {
    const d = z - axle;
    if (Math.abs(d) < ARCH_R) h = Math.max(h, AXLE_Y + Math.sqrt(ARCH_R * ARCH_R - d * d));
  }
  return h;
}

// 分片连续曲面：底边真实绕开车轮，内外两层由侧壁连接，而非贴黑圆假装轮拱。
function sidePanel(parent, side, start, end, material, origin = [0, 0, 0]) {
  const divisions = Math.max(26, Math.ceil((end - start) * 55));
  // 门缝附近加密而非全板堆面数，让折回的钣金边缘形成窄而连续的高光。
  const sections = [start, start + .003, start + .010];
  for(let i=1;i<divisions;i++){const z=THREE.MathUtils.lerp(start,end,i/divisions);if(z>start+.010&&z<end-.010)sections.push(z);}
  sections.push(end-.010,end-.003,end);
  const heights=[0,.008,.028,.08,.16,.26,.38,.50,.62,.74,.84,.92,.972,.992,1];
  const nz = sections.length-1, ny = heights.length-1;
  const pos = [], idx = [], stride = ny + 1, layerSize = (nz + 1) * stride;
  for (let layer = 0; layer < 2; layer++) for (let i = 0; i <= nz; i++) {
    const z = sections[i], low = bottomAt(z);
    for (let j = 0; j <= ny; j++) {
      const y = THREE.MathUtils.lerp(low, 1.228, heights[j]);
      const edgeDistance=Math.min(z-start,end-z,y-low,1.228-y);
      const rolledEdge=layer===0?.006*(1-THREE.MathUtils.smoothstep(edgeDistance,0,.012)):0;
      const x = side * (sideWidth(y, z) - layer * .048 - rolledEdge);
      pos.push(x - origin[0], y - origin[1], z - origin[2]);
    }
  }
  const quad = (a, b, c, d, reverse = false) => reverse ? idx.push(a, c, b, b, c, d) : idx.push(a, b, c, b, d, c);
  for (let layer = 0; layer < 2; layer++) for (let i = 0; i < nz; i++) for (let j = 0; j < ny; j++) {
    const a = layer * layerSize + i * stride + j;
    quad(a, a + stride, a + 1, a + stride + 1, side > 0 !== layer > 0);
  }
  const edges = [];
  for (let i = 0; i <= nz; i++) edges.push(i * stride);
  for (let j = 1; j <= ny; j++) edges.push(nz * stride + j);
  for (let i = nz - 1; i >= 0; i--) edges.push(i * stride + ny);
  for (let j = ny - 1; j > 0; j--) edges.push(j);
  for (let i = 0; i < edges.length; i++) {
    const a = edges[i], b = edges[(i + 1) % edges.length];
    quad(a, a + layerSize, b, b + layerSize, side > 0);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  return put(parent, g, material, '分片曲面车身');
}
function archTrim(parent, side, axle, start, end, material, origin = [0, 0, 0]) {
  const from = Math.max(start, axle - .557), to = Math.min(end, axle + .557);
  if (from >= to) return;
  const t0 = Math.acos(clamp((axle - from) / .557, -1, 1));
  const t1 = Math.acos(clamp((axle - to) / .557, -1, 1));
  const pos = [], idx = [], n = 64;
  const profile=[[.500,1.012],[.503,1.027],[.510,1.041],[.520,1.050],[.535,1.053],[.548,1.048],[.558,1.037],[.564,1.024]];
  for (let i = 0; i <= n; i++) {
    const a = THREE.MathUtils.lerp(t0, t1, i / n);
    for (const [r, x] of profile) {
      pos.push(side * x - origin[0], AXLE_Y + Math.sin(a) * r - origin[1], axle - Math.cos(a) * r - origin[2]);
    }
  }
  const stride=profile.length;
  for (let i = 0; i < n; i++) for (let j = 0; j < stride-1; j++) {
    const a = i * stride + j;
    if (side < 0) idx.push(a, a + 1, a + stride, a + 1, a + stride + 1, a + stride);
    else idx.push(a, a + stride, a + 1, a + 1, a + stride, a + stride + 1);
  }
  const g = new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setIndex(idx);g.computeVertexNormals();
  return put(parent,g,material,'立体轮拱护板');
}
function bodyPanel(parent, side, a, b, material, archMaterial, origin = [0, 0, 0]) {
  const obj = sidePanel(parent, side, a, b, material, origin);
  WHEELS.forEach(axle => archTrim(parent, side, axle, a, b, archMaterial, origin)); return obj;
}
// 曲面前脸的边缘沿纵向收回，平整中部与圆角侧部平滑衔接。
function frontSurface(parent, material, low, high, front, curve, name, halfWidth = 1.012) {
  const points = [], indices = [], nx = 56, ny = 16;
  for (let iy = 0; iy <= ny; iy++) for (let ix = 0; ix <= nx; ix++) {
    const v = iy / ny, u = ix / nx * 2 - 1;
    const fullPanel = high-low>.18;
    const corner = (fullPanel?.040:.028) * Math.pow(Math.abs(v * 2 - 1), 8);
    const x = u * (halfWidth - corner);
    const y = THREE.MathUtils.lerp(low, high, v);
    // 大面板上下边柔和收回，正面与圆角侧包围形成同一受光曲面。
    const shoulder=fullPanel?.020*Math.pow(Math.abs(v*2-1),8):0;
    const z = front + curve * Math.pow(Math.abs(u), 5) + .013 * Math.pow(Math.abs(v * 2 - 1), 6) + shoulder;
    points.push(x, y, z);
  }
  for (let iy = 0; iy < ny; iy++) for (let ix = 0; ix < nx; ix++) {
    const a = iy * (nx + 1) + ix;
    indices.push(a, a + nx + 1, a + 1, a + 1, a + nx + 1, a + nx + 2);
  }
  const g = new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(points,3));g.setIndex(indices);g.computeVertexNormals();
  return put(parent,g,material,name);
}
function sideInlay(parent, side, material) {
  const shape = new THREE.Shape();
  // 浅浮雕式宽扁侧裙，而非悬空圆杆；前后端以斜角收口。
  shape.moveTo(-1.026,.429);shape.lineTo(-.984,.594);shape.lineTo(.943,.594);
  shape.quadraticCurveTo(1.011,.581,1.036,.526);shape.lineTo(1.027,.430);
  shape.quadraticCurveTo(.976,.410,.899,.410);shape.lineTo(-.946,.410);shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape,{depth:.018,bevelEnabled:true,bevelSize:.007,bevelThickness:.003,bevelSegments:3,curveSegments:12});
  g.rotateY(-Math.PI / 2);g.translate(side*1.027,0,0);
  if(side>0)g.translate(.019,0,0);
  return put(parent,g,material,'宽扁贴合侧裙饰面');
}
function buildWheel(parent, side, z, m) {
  const wheel = new THREE.Group();wheel.name='实景参考细多辐轮毂与轮胎';wheel.position.set(side*.91,AXLE_Y,z);parent.add(wheel);
  wheel.scale.set(1.035,TIRE_R/.425,TIRE_R/.425);
  // 旋转体轮胎有平缓胎面、圆润胎肩、收敛胎唇。
  const profile=[new THREE.Vector2(.303,-.142),new THREE.Vector2(.363,-.151),new THREE.Vector2(.405,-.132),new THREE.Vector2(.423,-.092),new THREE.Vector2(.425,.092),new THREE.Vector2(.405,.132),new THREE.Vector2(.363,.151),new THREE.Vector2(.303,.142)];
  const tire=put(wheel,new THREE.LatheGeometry(profile,96),m.tire,'真实轮胎轮廓');tire.rotation.z=Math.PI/2;
  const barrel=put(wheel,new THREE.CylinderGeometry(.308,.308,.285,64,1,true),m.wheelDark,'敞口轮辋桶');barrel.rotation.z=Math.PI/2;
  const faceX=side*.154;
  // 实景为密集细辐轮圈；辐条间留出真正开口，能看见刹车盘和红色卡钳。
  cylinder(wheel,.255,.010,m.brakeDisc,faceX-side*.019,0,0);
  ring(wheel,.224,.002,m.hub,faceX-side*.011,0,0,'x');
  const caliper=box(wheel,.037,.164,.064,m.caliper,faceX-side*.002,.055,-.198,.020);
  caliper.rotation.x=.22;caliper.name='可见红色制动卡钳';
  const shape=new THREE.Shape();
  shape.moveTo(-.009,.065);shape.lineTo(-.009,.232);shape.lineTo(-.014,.295);
  shape.lineTo(.012,.298);shape.lineTo(.013,.235);shape.lineTo(.008,.069);shape.closePath();
  const spokeGeometry=new THREE.ExtrudeGeometry(shape,{depth:.013,bevelEnabled:true,bevelThickness:.002,bevelSize:.0018,bevelSegments:2,curveSegments:6});
  const spokes=new THREE.InstancedMesh(spokeGeometry,m.metal,20),spokePose=new THREE.Object3D();
  spokes.name='二十条细辐原创近似';
  for(let i=0;i<20;i++){
    const a=i*Math.PI/10+(i%2?.018:-.018);
    spokePose.position.set(faceX+side*.025,0,0);spokePose.rotation.set(a,side*Math.PI/2,0);spokePose.updateMatrix();spokes.setMatrixAt(i,spokePose.matrix);
  }
  spokes.castShadow=true;spokes.receiveShadow=true;wheel.add(spokes);
  ring(wheel,.305,.008,m.metal,faceX+side*.020,0,0,'x');
  ring(wheel,.287,.0035,m.metal,faceX+side*.024,0,0,'x');
  cylinder(wheel,.071,.026,m.metal,faceX+side*.026,0,0);
  cylinder(wheel,.047,.031,m.hub,faceX+side*.032,0,0);
  ring(wheel,.050,.003,m.metal,faceX+side*.050,0,0,'x');
  for(let i=0;i<6;i++){const a=i*Math.PI/3;cylinder(wheel,.006,.008,m.wheelDark,faceX+side*.045,Math.cos(a)*.059,Math.sin(a)*.059);}
  // 胎面纹理是实例化胎块与周向槽，非图片贴图。
  const tread=new THREE.InstancedMesh(new THREE.BoxGeometry(.048,.009,.026),m.tireEdge,80*4),dummy=new THREE.Object3D();
  for(let i=0;i<80;i++)for(let row=0;row<4;row++){
    const a=(i+(row%2)*.36)/80*Math.PI*2;
    dummy.position.set((row-1.5)*.057,Math.cos(a)*.425,Math.sin(a)*.425);dummy.rotation.set(a,0,(row<2?1:-1)*.21);dummy.updateMatrix();tread.setMatrixAt(i*4+row,dummy.matrix);
  }
  tread.castShadow=true;tread.receiveShadow=true;wheel.add(tread);
  for(const x of [-.097,-.034,.034,.097])ring(wheel,.424,.0025,m.tireGroove,x,0,0,'x');
  ring(wheel,.385,.0015,m.tireEdge,side*.144,0,0,'x');ring(wheel,.304,.0016,m.tireEdge,side*.147,0,0,'x');
  return wheel;
}

export function buildExterior(cabin) {
  const root=new THREE.Group();root.name='享界 G9 统一车辆外壳';root.visible=true;
  const clone=(name,changes={})=>{
    const result=cabin.materials[name].clone();delete result.userData.trimRole;
    for(const[key,value]of Object.entries(changes)){if(result[key]?.isColor)result[key].set(value);else result[key]=value;}return result;
  };
  const m={
    paint:clone('body',{color:'#242a2b',metalness:.66,roughness:.28,clearcoat:.92,clearcoatRoughness:.21,transparent:false,opacity:1,envMapIntensity:.95}),
    roof:clone('body',{color:'#222829',metalness:.58,roughness:.24,transparent:false,opacity:1}),
    black:clone('black',{color:'#111617',roughness:.42}),
    arch:clone('black',{color:'#161a1b',roughness:.59,metalness:.10}),
    tire:clone('black',{color:'#17191a',roughness:.89,metalness:0}),
    tireEdge:clone('black',{color:'#252829',roughness:.88,metalness:0}),
    tireGroove:clone('black',{color:'#080a0b',roughness:1,metalness:0}),
    metal:clone('metal',{color:'#b7bbbc',roughness:.29,metalness:.88,envMapIntensity:1.1}),
    silver:clone('metal',{color:'#a2a7a7',roughness:.43,metalness:.68,envMapIntensity:.88}),
    sideSatin:clone('metal',{color:'#adb2b1',roughness:.43,metalness:.64,envMapIntensity:.8}),
    brakeDisc:clone('metal',{color:'#656c6e',roughness:.56,metalness:.73}),
    caliper:clone('black',{color:'#a12725',roughness:.4,metalness:.30}),
    wheelDark:clone('black',{color:'#252b2e',metalness:.6,roughness:.34}),
    hub:clone('metal',{color:'#777f82',metalness:.88,roughness:.3}),
    glass:new THREE.MeshPhysicalMaterial({color:'#607777',metalness:.12,roughness:.105,transparent:true,opacity:.24,clearcoat:1,clearcoatRoughness:.075,side:THREE.DoubleSide,depthWrite:false,envMapIntensity:.9}),
    headlight:new THREE.MeshPhysicalMaterial({color:'#1c252b',metalness:.28,roughness:.18,clearcoat:1,clearcoatRoughness:.13,envMapIntensity:.85,side:THREE.DoubleSide}),
    lens:new THREE.MeshPhysicalMaterial({color:'#a8bfca',metalness:.17,roughness:.12,transparent:true,opacity:.26,side:THREE.DoubleSide,depthWrite:false,clearcoat:1}),
    drl:new THREE.MeshStandardMaterial({color:'#e9f1f1',emissive:'#d9efff',emissiveIntensity:.75,roughness:.28}),
    tail:new THREE.MeshStandardMaterial({color:'#b94446',emissive:'#ec2533',emissiveIntensity:.3,roughness:.25}),
    reflector:new THREE.MeshStandardMaterial({color:'#8d282c',roughness:.24,metalness:.2}),
  };
  const doors={},windows={},roofParts=[],glassParts=[],shellParts=[];
  // 纯 Object3D 数组供装配层剖视。两侧和门根带 shellSide，部件不隐式复制。
  const roofPart=obj=>{obj.userData.hideInXray=true;roofParts.push(obj);return obj;};
  const glassPart=obj=>{obj.castShadow=false;obj.receiveShadow=false;glassParts.push(obj);return obj;};
  // 只保留真实车底厚度；座椅、仪表台、地毯、中岛均由同一份详细内饰提供。
  box(root,1.87,.13,4.69,m.black,0,.315,.04,.06).name='车辆承载底板';
  for(const side of [-1,1]){
    const sideRoot=new THREE.Group();sideRoot.name=side<0?'左侧固定外壳':'右侧固定外壳';sideRoot.userData.shellSide=side;root.add(sideRoot);shellParts.push(sideRoot);
    bodyPanel(sideRoot,side,-2.49,-1.139,m.paint,m.arch);
    bodyPanel(sideRoot,side,1.363,2.50,m.paint,m.arch);
    WHEELS.forEach(z=>buildWheel(sideRoot,side,z,m));
    sideInlay(sideRoot,side,m.sideSatin);
    box(sideRoot,.003,.009,1.82,m.silver,side*1.049,.545,-.01,.001);
    box(sideRoot,.003,.005,1.81,m.hub,side*1.050,.525,-.01,.001);
    box(sideRoot,.005,.158,.004,m.black,side*1.051,.498,.130,.001);
    // 踏板独立于贴合侧裙，较薄深色台面压低反光。
    box(sideRoot,.134,.037,2.09,m.black,side*1.065,.361,-.01,.013);
    box(sideRoot,.125,.006,1.97,m.hub,side*1.067,.383,-.01,.002);
    for(let i=0;i<4;i++)box(sideRoot,.005,.003,1.87,m.black,side*(1.019+i*.028),.387,0,0);
    for(const [id,start,end]of [[side<0?'driver':'passenger',-1.132,.125],[side<0?'rearLeft':'rearRight',.136,1.355]]){
      const front=!id.startsWith('rear'),hinge=[side*.995,0,start];
      const door=new THREE.Group();door.name=`${id} 外门铰链`;door.position.set(...hinge);door.userData.shellSide=side;root.add(door);shellParts.push(door);register(door,id,'door');
      bodyPanel(door,side,start+.002,end-.002,m.paint,m.arch,hinge);
      const local=p=>[p[0]-hinge[0],p[1],p[2]-start];
      tube(door,[[side*sideWidth(bottomAt(end)+.01,end),bottomAt(end)+.01,end],[side*1.015,.97,end],[side*.998,1.228,end]].map(local),.0028,m.black);
      tube(door,[[side*sideWidth(bottomAt(start)+.015,start),bottomAt(start)+.015,start],[side*1.015,1.0,start],[side*.998,1.228,start]].map(local),.0028,m.black);
      const bottom=1.247,top=1.706,topStart=front?-.749:start+.032;
      const glassRoot=new THREE.Group();glassRoot.position.set(0,bottom,0);door.add(glassRoot);register(glassRoot,id,'window');
      const points=[[side*.987-hinge[0],0,.025],[side*.987-hinge[0],0,end-start-.021],[side*.91-hinge[0],top-bottom,end-start-.029],[side*.91-hinge[0],top-bottom,topStart-start]];
      const glass=glassPart(patch(glassRoot,points,m.glass,'统一可升降车窗'));windows[id]={root:glassRoot,glass};
      const framePoints=[[side*.997,bottom-.015,start+.016],[side*.919,top+.004,topStart-.014],[side*.919,top+.004,end-.016],[side*.997,bottom-.015,end-.008]];
      const frame=tube(door,framePoints.map(local),.010,m.black);frame.name=`${id} 单一车窗框`; 
      tube(door,[[side*1.010,1.228,start+.014],[side*1.010,1.228,end-.009]].map(local),.0055,m.silver);
      const handleZ=end-.198;
      box(door,.018,.063,.236,m.black,side*.024,1.070,handleZ-start,.020);
      const handle=box(door,.022,.040,.211,m.silver,side*.038,1.085,handleZ-start,.014);register(handle,id,'door');
      box(door,.015,.019,.154,m.black,side*.052,1.064,handleZ-start,.008);
      // 详细内门板由装配层挂到本铰链；外壳不生成第二套门内饰。
      doors[id]={root:door,side,start,end,frame,outerHandle:handle};
      if(front){
        const mirror=new THREE.Group();mirror.position.set(side*.997-hinge[0],1.249,-1.012-start);door.add(mirror);
        beam(mirror,[0,-.02,0],[side*.085,.044,-.04],.045,.074,m.black);
        box(mirror,.205,.155,.162,m.paint,side*.137,.074,-.04,.065);
        box(mirror,.177,.112,.017,m.hub,side*.143,.077,.044,.023);
        tube(mirror,[[side*.075,.062,-.124],[side*.16,.062,-.13],[side*.231,.070,-.108]],.005,m.drl);
      }
    }
    // 前翼子板的侧向传感器/装饰，轮拱与前门之间独立布局。
    box(sideRoot,.025,.11,.185,m.black,side*1.024,1.047,-1.384,.030);
    box(sideRoot,.032,.035,.169,m.silver,side*1.043,1.080,-1.393,.016);
    // 实景中浅色 D 柱位于尾侧窗前缘之后，后方还保留明显黑色后侧饰面。
    glassPart(patch(sideRoot,[[side*.987,1.251,1.391],[side*.981,1.251,2.117],[side*.906,1.697,2.070],[side*.91,1.704,1.391]],m.glass,'第三排固定侧窗'));
    tube(sideRoot,[[side*1.010,1.229,1.374],[side*1.002,1.232,2.136],[side*.928,1.707,2.066],[side*.919,1.722,1.37]],.008,m.silver);
    patch(sideRoot,[[side*1.002,1.232,2.002],[side*.987,1.239,2.224],[side*.923,1.732,2.091],[side*.917,1.726,1.905]],m.silver,'实景参考倾斜宽 D 柱');
    patch(sideRoot,[[side*.986,1.238,2.224],[side*.955,1.257,2.471],[side*.890,1.679,2.349],[side*.921,1.725,2.091]],m.roof,'D 柱后黑色饰面');
    tube(sideRoot,[[side*.999,1.232,2.217],[side*.975,1.237,2.458]],.007,m.silver);
    beam(sideRoot,[side*.996,1.211,-1.147],[side*.910,1.732,-.771],.075,.059,m.paint);
    beam(sideRoot,[side*.998,1.219,.130],[side*.915,1.722,.130],.050,.058,m.black);
    beam(sideRoot,[side*.998,1.219,1.370],[side*.915,1.722,1.370],.052,.057,m.black);
    roofPart(tube(sideRoot,[[side*.895,1.768,-.81],[side*.914,1.77,.40],[side*.902,1.766,2.20]],.009,m.roof)).name='车顶侧边接缝';
    // 双轨行李架，截面小、末端收束，与平顶分开。
    roofPart(tube(sideRoot,[[side*.755,1.783,-.61],[side*.785,1.826,-.43],[side*.787,1.835,1.78],[side*.757,1.786,2.05]],.014,m.black)).name='车顶行李架';
    for(const z of[-.41,1.76])roofPart(box(sideRoot,.053,.023,.075,m.black,side*.785,1.797,z,.010)).name='行李架支座';
  }
  // 发动机舱盖采用双向细分曲面与两侧隆起筋，不是厚方块。
  const hp=[],hi=[],nx=32,nz=30;
  for(let i=0;i<=nz;i++)for(let j=0;j<=nx;j++){
    const progress=i/nz, x=THREE.MathUtils.lerp(-.961,.961,j/nx);
    const z=THREE.MathUtils.lerp(-2.603,-1.139,progress)+.094*Math.pow(Math.abs(x)/.961,6)*Math.exp(-progress*8);
    const ridge=Math.exp(-(((Math.abs(x)-.73)/.10)**2))*.023;
    const y=1.242-.010*(Math.abs(x)/.961)**5+.008*progress+ridge*.50;
    hp.push(x,y,z);
  }
  for(let i=0;i<nz;i++)for(let j=0;j<nx;j++){const a=i*(nx+1)+j;hi.push(a,a+nx+1,a+1,a+1,a+nx+1,a+nx+2);}
  const hood=new THREE.BufferGeometry();hood.setAttribute('position',new THREE.Float32BufferAttribute(hp,3));hood.setIndex(hi);hood.computeVertexNormals();put(root,hood,m.paint,'曲面机盖');
  for(const side of[-1,1])tube(root,[[side*.967,1.232,-2.505],[side*.98,1.233,-1.91],[side*.975,1.238,-1.18]],.0018,m.black);
  // 前后风挡共用透明材质；天幕中央是真实开孔，不能再以玻璃覆盖实心整块车顶。
  const windshield=glassPart(patch(root,[[-.946,1.238,-1.159],[.946,1.238,-1.159],[.874,1.733,-.798],[-.874,1.733,-.798]],m.glass,'统一前风挡'));
  tube(root,[[-.942,1.238,-1.168],[0,1.23,-1.179],[.942,1.238,-1.168]],.008,m.black);
  for(const[x,z]of[[-.31,-1.165],[.39,-1.16]])tube(root,[[x-.22,1.244,z],[x+.17,1.247,z+.025]],.006,m.black);
  // 四段实体围合，内孔宽 1.57、z=-.49…1.826；没有与天幕重叠的实心底板。
  for(const side of[-1,1]){
    const rail=roofPart(box(root,.1515,.069,3.116,m.roof,side*.86075,1.750,.722,.024));
    rail.name='天幕两侧实体顶梁';rail.userData.shellSide=side;
  }
  roofPart(box(root,1.57,.069,.346,m.roof,0,1.750,-.663,.024)).name='前部车顶蒙皮';
  roofPart(box(root,1.57,.069,.454,m.roof,0,1.750,2.053,.024)).name='后部车顶蒙皮';
  const panoramic=glassPart(patch(root,[[-.785,1.782,-.49],[-.785,1.782,1.826],[.785,1.782,1.826],[.785,1.782,-.49]],m.glass,'真实开孔透明天幕'));
  roofPart(panoramic);
  roofPart(box(root,.189,.071,.137,m.black,0,1.804,-.695,.032)).name='车顶激光雷达外壳';
  roofPart(box(root,.148,.027,.010,m.hub,0,1.813,-.767,.009)).name='激光雷达前窗';
  glassPart(patch(root,[[-.945,1.250,2.512],[.945,1.250,2.512],[.870,1.697,2.287],[-.870,1.697,2.287]],m.glass,'统一后风挡'));
  roofPart(box(root,1.832,.060,.199,m.paint,0,1.713,2.323,.026)).name='尾部车顶扰流边';
  roofPart(box(root,.226,.013,.014,m.tail,0,1.689,2.419,.004)).name='高位刹车灯';
  for(let i=0;i<7;i++){const f=(i+1)/9;tube(root,[[-.85,1.250+.447*f,2.516-.225*f],[.85,1.250+.447*f,2.516-.225*f]],.0012,m.hub);}
  // 前脸面板分为封闭中央、两侧竖灯舱、宽银色包围和下格栅。
  box(root,1.985,.705,.288,m.paint,0,.878,-2.435,.117).name='圆润前脸侧包角';
  frontSurface(root,m.paint,.668,1.230,-2.632,.139,'连续圆角前脸');
  frontSurface(root,m.silver,1.213,1.228,-2.638,.141,'扁平前脸横饰条',.991);
  box(root,1.938,.237,.188,m.silver,0,.565,-2.470,.080).name='宽面前保险杠';
  frontSurface(root,m.silver,.456,.691,-2.646,.148,'弧面铝色前保险杠');
  box(root,1.201,.130,.071,m.black,0,.389,-2.536,.034).name='下部进气口';
  box(root,.967,.074,.029,m.black,0,.727,-2.637,.012);
  for(let i=0;i<13;i++)box(root,.005,.052,.015,m.hub,-.438+i*.073,.727,-2.656,.002);
  for(const y of[.357,.397,.430])box(root,1.030,.007,.017,m.hub,0,y,-2.578,.003);
  // 下护板两侧向内收口，中间保留明确的深色开口。
  for(const side of[-1,1]){
    patch(root,[[side*.653,.456,-2.635],[side*.959,.464,-2.535],[side*.841,.345,-2.543],[side*.616,.345,-2.610]],m.silver,'下包围侧翼');
  }
  box(root,.483,.144,.026,m.silver,0,.570,-2.662,.013);
  for(const x of[-.186,.186])cylinder(root,.005,.003,m.black,x,.617,-2.677,'z',12);
  // 品牌中心仅以原创小几何标记表达，不复制官方商标图。
  const badge=box(root,.043,.072,.012,m.silver,0,.972,-2.640,.015);badge.rotation.z=-.12;
  for(const side of[-1,1]){
    // 灯罩直接沿前脸曲面取样，避免用突出的矩形盒包住双圆灯组。
    const noseZ=(x,y)=>{
      const height=Math.abs((y-.668)/.562*2-1),halfWidth=1.012-.040*Math.pow(height,8);
      return -2.632+.139*Math.pow(Math.abs(x)/halfWidth,5)+.013*Math.pow(height,6)+.020*Math.pow(height,8);
    };
    const positions=[],indices=[],nx=18,ny=24;
    for(let row=0;row<=ny;row++)for(let col=0;col<=nx;col++){
      const v=row/ny,y=THREE.MathUtils.lerp(.744,1.202,v);
      const hw=.144-.015*Math.pow(Math.abs(v*2-1),8),x=side*.8+(col/nx*2-1)*hw;
      positions.push(x,y,noseZ(x,y)-.0035);
    }
    for(let row=0;row<ny;row++)for(let col=0;col<nx;col++){
      const i=row*(nx+1)+col;indices.push(i,i+nx+1,i+1,i+1,i+nx+1,i+nx+2);
    }
    const coverGeometry=new THREE.BufferGeometry();coverGeometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));coverGeometry.setIndex(indices);coverGeometry.computeVertexNormals();
    put(root,coverGeometry,m.headlight,'贴合前脸的曲面灯罩');
    for(const[y,r]of[[1.052,.083],[.865,.068]]){
      const lamp=new THREE.Group();lamp.name='嵌入式圆灯组';lamp.position.set(side*.800,y,noseZ(side*.800,y)-.009);lamp.rotation.y=-side*.275;root.add(lamp);
      cylinder(lamp,r+.010,.008,m.hub,0,0,0,'z');
      cylinder(lamp,r-.007,.009,m.black,0,0,-.005,'z');
      ring(lamp,r,.0055,m.drl,0,0,-.013);
      cylinder(lamp,r*.38,.006,m.lens,0,0,-.017,'z');
    }
    box(root,.131,.053,.010,m.hub,side*.782,.565,-2.611,.004);
    for(const y of[.653,.693])box(root,.026,.006,.034,m.black,side*.977,y,-2.33,.002);
  }
  // 尾门与小书包。图示称“尾门小书包”，不将其建成裸露备胎。
  box(root,1.924,.724,.150,m.paint,0,.890,2.487,.057);
  box(root,1.544,.561,.033,m.paint,0,.932,2.576,.018);
  tube(root,[[-.788,.612,2.593],[-.803,1.236,2.568],[.798,1.236,2.568],[.790,.612,2.593]],.003,m.black);
  box(root,1.981,.209,.188,m.silver,0,.493,2.481,.041);
  box(root,1.09,.055,.097,m.black,0,.365,2.47,.022);
  box(root,.454,.125,.023,m.silver,0,.511,2.592,.013);
  for(const side of[-1,1]){
    box(root,.217,.441,.045,m.silver,side*.861,.988,2.572,.025);
    for(const y of[1.087,.902]){
      cylinder(root,.078,.019,m.hub,side*.861,y,2.604,'z');
      cylinder(root,.059,.021,m.black,side*.861,y,2.620,'z');
      ring(root,.065,.008,m.tail,side*.861,y,2.638);
      cylinder(root,.048,.014,m.lens,side*.861,y,2.638,'z');
    }
    box(root,.318,.027,.013,m.reflector,side*.671,.563,2.586,.006);
  }
  const pack=new THREE.Group();pack.name='尾门圆形小书包';pack.position.set(.252,1.086,2.682);root.add(pack);
  cylinder(pack,.402,.212,m.paint,0,0,0,'z',96);
  cylinder(pack,.379,.047,m.roof,0,0,.122,'z',96);
  ring(pack,.384,.017,m.black,0,0,.139);
  box(pack,.729,.071,.023,m.silver,0,.005,.156,.013);
  box(root,.059,.142,.024,m.black,-.656,.983,2.607,.016);
  box(root,.017,.090,.020,m.hub,-.676,.988,2.623,.006);
  cylinder(root,.032,.039,m.black,0,.315,2.54,'z',24);
  // 独立充电口盖置于手册后侧视图所示的左后侧围；原状态仅提供全局开关。
  const charge=new THREE.Group();charge.position.set(-1.021,1.080,1.638);charge.name='外观充电口盖';root.add(charge);register(charge,'all','chargePort');
  box(root,.016,.144,.187,m.black,-1.020,1.077,1.723,.029);
  const flap=box(charge,.018,.148,.196,m.paint,-.012,0,.087,.025);register(flap,'all','chargePort');
  cylinder(root,.031,.014,m.wheelDark,-1.031,1.078,1.729,'x',24);
  charge.userData.shellSide=-1;charge.userData.openAngle=1.12;
  // 状态动画只有 scene 一位所有者；此模块绝不重复驱动门、车窗或充电口。
  const update=(_state={},_dt=1/60)=>{
    // 现有状态不含真实大灯控制，外灯只随展示日夜氛围变化。
    m.drl.emissiveIntensity=cabin.mood==='night'?2.2:.65;
    m.tail.emissiveIntensity=cabin.mood==='night'?1.6:.22;
  };
  update(cabin.state||{},0);
  root.userData.reference='G9OM26C1 使用手册，第15—16页；原创近似模型';
  return {root,doors,windows,chargePort:charge,windshield,roofParts,glassParts,shellParts,update};
}
