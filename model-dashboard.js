import * as THREE from 'three';
import { mergeGeometries, toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';

function smoothBevelNormals(geometry) {
  // Three.js 此工具固定以约 1cm 精度识别共点，仪表按键的倒角却仅有毫米级。
  // 只放大计算用 position，随后恢复原属性，UV、尺寸与拓扑都不改动。
  const position=geometry.attributes.position, precisePosition=position.clone();
  for(let i=0;i<precisePosition.array.length;i++)precisePosition.array[i]*=1000;
  geometry.setAttribute('position',precisePosition);
  toCreasedNormals(geometry,Math.PI*.44);
  geometry.setAttribute('position',position);
  return geometry;
}

// 依据 G9 公开使用说明书第 17、18 页的可见轮廓与布局重建。
// 比例仍未经实车测量；原始手册和图片不作为模型资产打包。
export function buildDashboard(cabin) {
  const m = cabin.materials;
  const root = new THREE.Group(); root.name = '按手册轮廓重建的前舱'; cabin.root.add(root);
  const satin = m.metal.clone(); satin.roughness = .54; satin.metalness = .73; satin.envMapIntensity = .35;
  const dark = m.darkLeather.clone(); dark.userData = { ...dark.userData, trimRole: 'darkLeather' };
  const glass = new THREE.MeshPhysicalMaterial({ color: '#111719', roughness: .32, metalness: .02, clearcoat: .65, clearcoatRoughness: .26, envMapIntensity: .27 });
  const recess = new THREE.MeshStandardMaterial({ color: '#101414', roughness: .84 });

  // 屏下前缘近乎平直；副驾侧在同一曲面内下落、后收，形成手套箱轮廓。
  const sideProfile = [[1.285,-2.045],[1.312,-1.900],[1.267,-1.700],[1.203,-1.552],[1.178,-1.535],[1.100,-1.560],[1.061,-1.625],[1.034,-1.772],[1.075,-2.053]];
  const cross = new THREE.CatmullRomCurve3(sideProfile.map(([y,z]) => new THREE.Vector3(0,y,z)),true,'centripetal');
  const dashboardPoint = (x,t) => {
    const p=cross.getPoint(t), edge=Math.pow(Math.abs(x)/1.15,4);
    const glovebox=THREE.MathUtils.smoothstep(x,.20,.48)*(1-THREE.MathUtils.smoothstep(x,.98,1.15));
    const lower=THREE.MathUtils.smoothstep(1.203-p.y,0,.125);
    return new THREE.Vector3(x,p.y-edge*.025-glovebox*lower*.074,p.z-edge*.025-glovebox*lower*.033);
  };
  const rows=48, columns=48, positions=[], uvs=[], indices=[];
  for(let i=0;i<=rows;i++) {
    const x=-1.15+2.3*i/rows;
    for(let j=0;j<=columns;j++) {const p=dashboardPoint(x,j/columns);positions.push(p.x,p.y,p.z);uvs.push(i/rows,j/columns);}
  }
  gridIndices(rows,columns,indices,true);
  geometryMesh(positions,uvs,indices,dark,root).name='连续下仪表台';

  // 一整片扁平黑玻璃嵌入浅色外框，两端竖风口与外框一体排列。
  const deck=new THREE.Group();deck.name='贯通三屏面板';deck.position.set(0,1.434,-1.618);deck.rotation.x=-.025;root.add(deck);
  const surround=roundedShape(2.32,.458,.091);surround.holes.push(roundedShape(2.063,.354,.031));
  const bezelGeometry=new THREE.ExtrudeGeometry(surround,{depth:.098,bevelEnabled:true,bevelThickness:.005,bevelSize:.005,bevelSegments:3,curveSegments:16});
  bezelGeometry.translate(0,0,-.024);
  smoothBevelNormals(bezelGeometry);
  const bezel=new THREE.Mesh(bezelGeometry,m.leather);bezel.castShadow=true;bezel.receiveShadow=true;deck.add(bezel);
  face(2.06,.351,.014,.033,glass,deck,0,.001,.078);
  cabin.createDisplay(.590,.318,deck,-.718,.001,.065,'instrument');
  cabin.createDisplay(.736,.318,deck,-.035,.001,.065,'navigation','climate');
  cabin.createDisplay(.652,.318,deck,.687,.001,.065,'passenger','media');
  face(2.22,.011,.015,.005,satin,deck,0,-.224,.080);
  // 薄遮光沿贴合外框，不再使用悬空厚横梁。
  // 遮光沿略向中间拱起，前缘收薄；保留原安装范围并消除平板盖子的观感。
  const hood=face(2.286,.390,.035,.086,dark,root,0,1.658,-1.775);hood.rotation.x=-Math.PI/2;
  const hoodPosition=hood.geometry.attributes.position;
  for(let i=0;i<hoodPosition.count;i++){
    const x=hoodPosition.getX(i),y=hoodPosition.getY(i),z=hoodPosition.getZ(i);
    hoodPosition.setZ(i,z+.017*Math.max(0,1-(x/1.143)**2)*Math.max(0,1-(y/.195)**2));
  }
  smoothBevelNormals(hood.geometry);
  const ambient=face(2.105,.0045,.008,.002,m.glow,root,0,1.199,-1.532);
  cabin.refs.ambient.push(ambient);cabin.register(ambient,'all','ambient');
  for(const side of [-1,1]) {
    const vent=new THREE.Group();vent.position.set(side*1.098,-.009,.084);deck.add(vent);
    face(.073,.211,.023,.024,satin,vent);face(.058,.193,.013,.018,recess,vent,0,0,.015);
    for(const dx of [-.014,.014])face(.007,.154,.005,.003,dark,vent,dx,0,.025);
    face(.011,.074,.012,.004,satin,vent,0,-.003,.030);
    cabin.register(vent,side<0?'driver':'passenger','fan');addAirflow(cabin,vent,.024);
  }
  const gloveboxSeam=[];
  for(let i=0;i<=24;i++){const t=i/24,p=dashboardPoint(.34+t*.77,.46+.098*Math.pow(Math.sin(t*Math.PI),.6));p.z+=.0012;gloveboxSeam.push(p.toArray());}
  cabin.tube(gloveboxSeam,.0008,recess,root);
  buildScreenKeys(cabin,root,satin,recess);
  buildWheel(cabin,root,satin,recess);
  buildConsole(cabin,root,satin,recess);
  addStateProxies(cabin,root);
  mergeStaticDecoration(root,new Set([...cabin.refs.airflow,...cabin.refs.screens.map(item=>item.screen.parent),cabin.refs.fragrance,cabin.refs.oxygen.root]));
  return root;
}

function roundedShape(width,height,radius) {
  const w=width/2,h=height/2,r=Math.min(radius,w,h),s=new THREE.Shape();
  s.moveTo(-w+r,-h);s.lineTo(w-r,-h);s.quadraticCurveTo(w,-h,w,-h+r);
  s.lineTo(w,h-r);s.quadraticCurveTo(w,h,w-r,h);
  s.lineTo(-w+r,h);s.quadraticCurveTo(-w,h,-w,h-r);
  s.lineTo(-w,-h+r);s.quadraticCurveTo(-w,-h,-w+r,-h);return s;
}
function face(width,height,depth,radius,material,parent,x=0,y=0,z=0) {
  const bevel=Math.min(depth*.16,.003);
  const geometry=new THREE.ExtrudeGeometry(roundedShape(width-bevel*2,height-bevel*2,radius),{depth:depth-bevel*2,bevelEnabled:true,bevelThickness:bevel,bevelSize:bevel,bevelSegments:2,curveSegments:12});
  geometry.translate(0,0,-(depth-bevel*2)/2);
  // 挤出几何每个三角形默认独立；仅平滑圆角相邻面，保留真正的硬折边。
  smoothBevelNormals(geometry);
  const mesh=new THREE.Mesh(geometry,material);mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;
}
function geometryMesh(positions,uvs,indices,material,parent) {
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geometry.setIndex(indices);geometry.computeVertexNormals();
  // 周期截面的首尾仍保留独立 UV，但法线必须跨接缝连续。
  const p=geometry.attributes.position,n=geometry.attributes.normal,groups=new Map();
  for(let i=0;i<p.count;i++){const key=[p.getX(i),p.getY(i),p.getZ(i)].map(v=>Math.round(v*1e6)).join(',');if(!groups.has(key))groups.set(key,[]);groups.get(key).push(i);}
  for(const ids of groups.values())if(ids.length>1){const sum=new THREE.Vector3();ids.forEach(i=>sum.add(new THREE.Vector3().fromBufferAttribute(n,i)));sum.normalize();ids.forEach(i=>n.setXYZ(i,sum.x,sum.y,sum.z));}
  geometry.userData.continuousSurface=true;
  const mesh=new THREE.Mesh(geometry,material);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;
}
function gridIndices(rows,columns,indices,flip=false) {
  for(let i=0;i<rows;i++)for(let j=0;j<columns;j++){const a=i*(columns+1)+j,b=a+columns+1;if(flip)indices.push(a,b+1,b,a,a+1,b+1);else indices.push(a,b,b+1,a,b+1,a+1);}
}
function addAirflow(cabin,parent,spacing) {
  const flow=new THREE.Group();parent.add(flow);
  for(let i=0;i<3;i++){const material=new THREE.MeshBasicMaterial({color:'#a3dfec',transparent:true,opacity:.3,depthWrite:false});const trace=cabin.box(.004,.004,.09,material,flow,(i-1)*spacing,0,.12,.001);trace.userData.phase=i/3;}
  cabin.refs.airflow.push(flow);
}
function buildScreenKeys(cabin,root,satin,recess) {
  const keys=new THREE.Group();keys.position.set(0,1.199,-1.45);keys.rotation.x=-.25;root.add(keys);
  face(.404,.033,.034,.010,satin,keys);face(.377,.023,.024,.007,recess,keys,0,.006,.010);
  for(let i=0;i<5;i++)face(.069,.019,.019,.005,satin,keys,(i-2)*.074,-.001,.024);
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=40;
  const c=canvas.getContext('2d');c.clearRect(0,0,512,40);c.strokeStyle='#414742';c.lineWidth=2;
  for(let i=0;i<5;i++){const x=50+i*103;c.beginPath();if(i===2){c.moveTo(x,11);c.lineTo(x-10,29);c.lineTo(x+10,29);c.closePath();}else{c.roundRect(x-9,13,18,14,3);c.moveTo(x-5,20);c.lineTo(x+5,20);}c.stroke();}
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;cabin.textures.add(texture);
  const glyph=new THREE.Mesh(new THREE.PlaneGeometry(.372,.025),new THREE.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false,toneMapped:false}));glyph.position.set(0,0,.035);keys.add(glyph);
}
function buildWheel(cabin,root,satin,recess) {
  const m=cabin.materials,wheel=new THREE.Group();wheel.name='圆形三辐方向盘';wheel.position.set(-.717,1.391,-1.094);wheel.rotation.x=-.16;root.add(wheel);
  const column=face(.145,.132,.319,.042,m.darkLeather,root,-.717,1.32,-1.355);column.rotation.x=-.15;
  const positions=[],uvs=[],indices=[],around=96,radial=14;
  for(let i=0;i<=around;i++){const angle=i/around*Math.PI*2,grip=.003*Math.pow(Math.abs(Math.cos(angle)),10);for(let j=0;j<=radial;j++){const v=j/radial*Math.PI*2,r=.213+(.025+grip)*Math.cos(v);positions.push(r*Math.cos(angle),r*Math.sin(angle),.024*Math.sin(v));uvs.push(i/around,j/radial);}}
  gridIndices(around,radial,indices);geometryMesh(positions,uvs,indices,m.leather,wheel);
  const seam=new THREE.Mesh(new THREE.TorusGeometry(.195,.0009,4,96),m.stitch);seam.position.z=.017;wheel.add(seam);
  // 圆气囊采用旋转剖面，双侧短辐与下面 V 形开口辐按图排列。
  const airbagProfile=[[0,-.023],[.070,-.023],[.091,-.015],[.099,0],[.099,.014],[.089,.027],[.073,.032],[.070,.032],[.069,.0305],[.068,.0308],[.066,.033],[.056,.0347],[0,.035]].map(p=>new THREE.Vector2(...p));
  const airbag=new THREE.Mesh(new THREE.LatheGeometry(airbagProfile,64),m.leather);airbag.rotation.x=Math.PI/2;airbag.position.set(0,-.004,.010);airbag.castShadow=true;wheel.add(airbag);
  const airbagSeam=new THREE.Mesh(new THREE.TorusGeometry(.087,.0011,4,64),m.stitch);airbagSeam.position.set(0,-.004,.039);wheel.add(airbagSeam);
  const innerSeam=new THREE.Mesh(new THREE.TorusGeometry(.069,.00045,4,64),m.stitch);innerSeam.position.set(0,-.004,.041);wheel.add(innerSeam);
  // 下辐以一片连贯的 U 形薄面连接轮圈，保留中央开口。
  const lower=new THREE.Shape();lower.moveTo(-.122,-.040);
  lower.bezierCurveTo(-.120,-.120,-.100,-.190,-.069,-.205);lower.quadraticCurveTo(0,-.212,.069,-.205);
  lower.bezierCurveTo(.100,-.190,.120,-.120,.122,-.040);lower.lineTo(.087,-.060);
  lower.bezierCurveTo(.081,-.100,.074,-.151,.050,-.171);lower.quadraticCurveTo(0,-.181,-.050,-.171);
  lower.bezierCurveTo(-.074,-.151,-.081,-.100,-.087,-.060);lower.closePath();
  sculptedSpoke(lower,m.leather,wheel,-.001,.011,.003);
  cabin.tube([[-.110,-.055,.016],[-.094,-.134,.016],[-.064,-.188,.016],[0,-.195,.016],[.064,-.188,.016],[.094,-.134,.016],[.110,-.055,.016]],.0018,satin,wheel);
  for(const side of [-1,1]){
    const spoke=new THREE.Shape();spoke.moveTo(side*.070,.048);spoke.quadraticCurveTo(side*.150,.050,side*.201,.027);spoke.lineTo(side*.204,-.013);spoke.quadraticCurveTo(side*.145,-.033,side*.071,-.044);spoke.closePath();sculptedSpoke(spoke,m.leather,wheel,.010);
    const buttons=face(.070,.035,.009,.014,m.soft,wheel,side*.144,.009,.028);cabin.cylinder(.010,.010,.026,satin,buttons,side*.012,.004,.007,24).rotation.x=Math.PI/2;
    const stalk=face(.073,.021,.032,.009,m.darkLeather,wheel,side*.272,.026,-.070);face(.014,.015,.005,.004,satin,stalk,side*.018,0,.018);
  }
  cabin.register(wheel,'driver','media');
}
function sculptedSpoke(shape,material,parent,z,depth=.015,bevel=.006) {
  const geometry=new THREE.ExtrudeGeometry(shape,{depth,bevelEnabled:true,bevelThickness:bevel,bevelSize:bevel,bevelSegments:4,curveSegments:16});
  smoothBevelNormals(geometry);
  const mesh=new THREE.Mesh(geometry,material);mesh.position.z=z;mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;
}
function consoleHeight(z){return 1.021+Math.max(0,-z-.49)*.129;}
function buildConsole(cabin,root,satin,recess) {
  const m=cabin.materials,console=new THREE.Group();console.name='按手册次序排列的中岛';root.add(console);
  // 连续截面由后向前收窄并抬高，构造完整侧面，而非几块厚板拼叠。
  const profile=roundedShape(2,2,.39).getSpacedPoints(48),positions=[],uvs=[],indices=[],rows=48,columns=profile.length-1;
  for(let i=0;i<=rows;i++){const t=i/rows,z=.028-t*1.476,width=.449-.089*Math.pow(t,3),top=consoleHeight(z),bottom=.599+.288*Math.pow(t,4);for(let j=0;j<=columns;j++){const p=profile[j];positions.push(p.x*width/2,(top+bottom)/2+p.y*(top-bottom)/2,z);uvs.push(j/columns,t);}}
  gridIndices(rows,columns,indices);geometryMesh(positions,uvs,indices,m.darkLeather,console);
  const vents=new THREE.Group();vents.position.set(0,1.156,-1.401);vents.rotation.x=-.24;console.add(vents);
  face(.342,.093,.044,.031,satin,vents);face(.319,.075,.031,.024,recess,vents,0,0,.018);
  for(const side of [-1,1]){
    const vent=new THREE.Group();vent.position.set(side*.080,0,.038);vents.add(vent);face(.144,.056,.017,.016,m.darkLeather,vent);face(.130,.042,.017,.012,recess,vent,0,0,.010);
    for(const y of [-.01,.009])face(.112,.0035,.006,.0015,satin,vent,0,y,.024);face(.032,.007,.009,.003,satin,vent,0,0,.027);
    cabin.register(vent,side<0?'driver':'passenger','fan');addAirflow(cabin,vent,.038);
  }
  // 前双充电板 → 中央旋钮及四拨键 → 储物盖 → 双扶手，沿用图示次序。
  const top=new THREE.Group();top.position.set(0,consoleHeight(-.953)+.003,-.953);top.rotation.x=.128;console.add(top);
  const topPlate=face(.389,.824,.011,.050,satin,top);topPlate.rotation.x=-Math.PI/2;
  const charging=new THREE.Group();charging.position.set(0,.008,-.137);top.add(charging);
  const well=face(.338,.319,.006,.039,recess,charging);well.rotation.x=-Math.PI/2;
  for(const side of [-1,1]){const pad=face(.164,.313,.005,.034,m.soft,charging,side*.084,.0027,0);pad.rotation.x=-Math.PI/2;cabin.box(.113,.003,.006,recess,charging,side*.084,.006,.134,.002);}
  cabin.box(.008,.005,.088,satin,charging,0,.007,.016,.002);
  const controller=new THREE.Group();controller.position.set(0,.006,.105);top.add(controller);
  const knobProfile=[[0,0],[.039,0],[.044,.003],[.044,.011],[.0415,.014],[.036,.014],[.035,.010],[0,.010]].map(p=>new THREE.Vector2(...p));
  controller.add(new THREE.Mesh(new THREE.LatheGeometry(knobProfile,48),satin));cabin.cylinder(.034,.034,.002,recess,controller,0,.0115,0,48);
  const knobRing=new THREE.Mesh(new THREE.TorusGeometry(.027,.0008,4,48),satin);knobRing.rotation.x=-Math.PI/2;knobRing.position.y=.013;controller.add(knobRing);cabin.register(controller,'driver','media');
  for(const x of [-.150,-.089,.089,.150]){const base=face(.041,.048,.003,.009,recess,top,x,.007,.109);base.rotation.x=-Math.PI/2;const key=face(.036,.039,.005,.007,satin,top,x,.012,.106);key.rotation.x=-Math.PI/2+.10;}
  const storage=face(.343,.187,.012,.038,m.soft,top,0,.009,.288);storage.rotation.x=-Math.PI/2;cabin.box(.115,.004,.008,satin,top,0,.019,.228,.003);
  for(const side of [-1,1]){const arm=face(.209,.418,.074,.061,m.leather,console,side*.106,1.057,-.220);arm.rotation.x=-Math.PI/2;cabin.tube([[side*.185,1.093,-.364],[side*.195,1.097,-.215],[side*.186,1.093,-.073]],.0009,m.stitch,console);}
  const latch=face(.079,.039,.009,.012,satin,console,0,1.033,-.442);latch.rotation.x=-.85;
  const rearPanel=face(.256,.093,.015,.026,recess,console,0,.786,.037);cabin.register(rearPanel,'rearLeft','temperature');
}
function addStateProxies(cabin,parent) {
  // 参考图不能确认的设备保留不可见代理，不把自行设计的面板放进实车造型。
  const scent=cabin.cylinder(.014,.014,.01,cabin.materials.gold,parent,.153,.984,-.460,12);scent.visible=false;cabin.refs.fragrance=scent;cabin.register(scent,'all','fragrance');
  const oxygen=new THREE.Group();oxygen.position.set(0,.638,.025);oxygen.visible=false;parent.add(oxygen);cabin.register(oxygen,'all','oxygen');
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=160;const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;cabin.textures.add(texture);
  const lamp=new THREE.Mesh(new THREE.SphereGeometry(.009,8,6),new THREE.MeshStandardMaterial({color:'#617078',emissive:'#67dccc',emissiveIntensity:.025}));oxygen.add(lamp);cabin.refs.oxygen={root:oxygen,canvas,texture,lamp};cabin.paintOxygen();
}
function mergeStaticDecoration(group,preserved) {
  if(preserved.has(group))return;for(const child of [...group.children])if(child.isGroup)mergeStaticDecoration(child,preserved);
  const batches=new Map();for(const child of group.children){if(!child.isMesh||child.isInstancedMesh||child.children.length||preserved.has(child)||child.userData.domain||!child.visible||Array.isArray(child.material))continue;if(!batches.has(child.material))batches.set(child.material,[]);batches.get(child.material).push(child);}
  for(const [material,meshes]of batches){if(meshes.length<2)continue;const geometries=meshes.map(mesh=>{mesh.updateMatrix();const geometry=mesh.geometry.index?mesh.geometry.toNonIndexed():mesh.geometry.clone();geometry.applyMatrix4(mesh.matrix);return geometry;});const geometry=mergeGeometries(geometries,false);geometries.forEach(item=>item.dispose());if(!geometry)continue;const merged=new THREE.Mesh(geometry,material);merged.name='静态装饰';merged.castShadow=meshes.some(mesh=>mesh.castShadow);merged.receiveShadow=meshes.some(mesh=>mesh.receiveShadow);meshes.forEach(mesh=>{group.remove(mesh);mesh.geometry.dispose();});group.add(merged);}
}
