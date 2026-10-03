import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { createStudioMaterials, installStudioLighting, installStudioRenderer, TRIMS } from './studio.js';
import { buildSeat } from './model-seats.js';
import { buildDashboard } from './model-dashboard.js';
import { buildExterior } from './model-exterior.js';
import { assembleVehicle } from './vehicle-assembly.js';
import { paintVehicleScreen, SCREEN_PAGES } from './screen-ui.js';
import { buildFoundation, buildDoors, buildRoof, buildCabinDetails } from './model-body.js';

// 原创参数化展示模型。比例、几何和保护策略用于教学，不是原厂 CAD。
const TARGET_NAMES = {
  driver: '主驾', passenger: '副驾', rearLeft: '二排左侧', rearRight: '二排右侧',
  thirdLeft: '三排左侧', thirdRight: '三排右侧',
};
const DOMAIN_NAMES = {
  seat: '座椅', window: '车窗', door: '车门', reading: '阅读灯',
  ambient: '氛围灯', temperature: '空调', climate: '空调', fan: '风量',
  rearScreen: '后排屏', shade: '遮阳帘', media: '影音', childLock: '儿童锁',
  chargePort: '充电口', fragrance: '香氛', oxygen: '制氧',
};
const SEATS = [
  ['driver', -.64, -.64], ['passenger', .64, -.64],
  ['rearLeft', -.65, .93], ['rearRight', .65, .93],
  ['thirdLeft', -.58, 2.35], ['thirdRight', .58, 2.35],
];
const clamp = (v, a, b) => Math.max(a, Math.min(b, Number(v) || 0));
const mix = (a, b, t) => a + (b - a) * t;

export class CabinScene {
  constructor(container, { onSelect = () => {}, onReady = () => {}, onScreenAction = () => {}, onScreenPage = () => {}, onScreenUI = () => {}, onScreenCommand = () => {} } = {}) {
    if (!container) throw new Error('缺少三维座舱容器');
    this.container = container;
    this.onSelect = onSelect;this.onScreenAction=onScreenAction;this.onScreenPage=onScreenPage;this.onScreenUI=onScreenUI;this.onScreenCommand=onScreenCommand;this.screenPage='home';this.screenUI={};
    this.state = null;
    this.disposed = false;
    this.xray = false;this.view='showcase';this.trim='olive';this.mood='day';this.selectionEnabled=false;
    this.refs = { seats: {}, doors: {}, windows: {}, reading: {}, ambient: [], airflow: [], screens: [] };
    this.selectables = new Map();
    this.textures = new Set();
    this.time = 0;
    this.lastFrame = performance.now();
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#111b2c');
    this.scene.fog = new THREE.Fog('#111b2c', 15, 34);
    this.camera = new THREE.PerspectiveCamera(60, 1, .025, 90);
    this.camera.position.set(.04,1.72,-.01);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.03;
    this.renderer.domElement.className = 'cabin-canvas';
    this.renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;touch-action:none;outline:none';
    this.renderer.domElement.setAttribute('aria-label', '可旋转的六座三维座舱。拖动旋转，滚轮缩放，点击选择部件。');
    this.renderer.domElement.setAttribute('role', 'img');
    container.appendChild(this.renderer.domElement);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = .07;
    this.controls.minDistance = .65;
    this.controls.maxDistance = 16;
    this.controls.maxPolarAngle = Math.PI * .49;
    this.controls.target.set(0,1.32,-1.62);
    this.controls.enablePan = true;
    this.controls.panSpeed = .65;
    this.materials = this.makeMaterials();
    this.createLights();
    this.root = new THREE.Group();
    this.scene.add(this.root);
    this.createFoundation();
    this.createDashboard();
    SEATS.forEach(([id, x, z], index) => this.createSeat(id, x, z, index));
    this.createDoors();
    this.createRoof();
    this.createCabinDetails();
    this.exterior = buildExterior(this);
    this.vehicle = assembleVehicle(this, this.exterior);
    this.createSelection();
    this.setTrim('olive');
    this.setXray(false);
    installStudioRenderer(this);
    this.setView('showcase',true);
    this.raycaster = new THREE.Raycaster();
    this.raycaster.params.Line.threshold=.003;this.raycaster.params.Points.threshold=.003;
    this.pointer = new THREE.Vector2();
    this.pointerStart = null;
    this.boundPointerDown = event => { this.pointerStart = { x: event.clientX, y: event.clientY };const d=this.controls.target.clone().sub(this.camera.position).normalize();this.lookStart={yaw:Math.atan2(d.x,-d.z),pitch:Math.asin(d.y)}; };
    this.boundPointerUp = event => this.pick(event);
    this.boundPointerMove = event => {this.lookAround(event);this.hover(event);};
    this.boundWheel=event=>{if(this.interiorView){event.preventDefault();this.camera.fov=clamp(this.camera.fov+event.deltaY*.025,this.view==='display'?18:42,90);this.camera.updateProjectionMatrix();}};
    this.renderer.domElement.addEventListener('pointerdown', this.boundPointerDown);
    this.renderer.domElement.addEventListener('pointerup', this.boundPointerUp);
    this.renderer.domElement.addEventListener('pointermove', this.boundPointerMove);
    this.renderer.domElement.addEventListener('wheel',this.boundWheel,{passive:false});
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
    this.animate = this.animate.bind(this);
    this.frame = requestAnimationFrame(this.animate);
    onReady(this);
  }

  makeMaterials() {return createStudioMaterials(this);}

  box(width, height, depth, material, parent, x = 0, y = 0, z = 0, radius = .04) {
    const min = Math.min(width, height, depth);
    const geometry = radius > 0 ? new RoundedBoxGeometry(width, height, depth, 3, Math.min(radius, min * .44)) : new THREE.BoxGeometry(width, height, depth);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true;
    parent.add(mesh); return mesh;
  }

  cylinder(radiusTop, radiusBottom, height, material, parent, x, y, z, segments = 24) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments), material);
    mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
  }

  tube(points, radius, material, parent, closed = false) {
    const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)), closed);
    const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(12, points.length * 5), radius, 5, closed), material);
    mesh.castShadow = false; parent.add(mesh); return mesh;
  }

  register(object, target, domain) {
    object.userData.target = target; object.userData.domain = domain;
    const key = `${domain}:${target || 'all'}`;
    if (!this.selectables.has(key)) this.selectables.set(key, object);
    return object;
  }

  createLights() {installStudioLighting(this);}
  createFoundation() {buildFoundation(this);}
  createDashboard() {buildDashboard(this);}
  createSeat(id,x,z,index) {buildSeat(this,id,x,z,index);}
  createDoors() {buildDoors(this);}
  createRoof() {buildRoof(this);}
  createCabinDetails() {buildCabinDetails(this);}

  createDisplay(width, height, parent, x, y, z, type, domain) {
    const display = new THREE.Group(); display.position.set(x, y, z); parent.add(display);
    this.box(width, height, .045, this.materials.black, display, 0, 0, 0, .02);
    const canvas = document.createElement('canvas'); canvas.width = type === 'instrument' ? 1024 : 1536; canvas.height = Math.round(canvas.width * height / width);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = Math.min(this.renderer.capabilities.getMaxAnisotropy(), 8); this.textures.add(texture);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(width - .025, height - .025), new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }));
    screen.position.z = .024; display.add(screen);
    const displayRef={ canvas, texture, type, screen, page:'home',pageHistory:['home'],hitRegions:[] };
    screen.userData.displayRef=displayRef;
    this.refs.screens.push(displayRef);
    if (domain) this.register(display, domain === 'climate' ? 'driver' : 'all', domain);
    this.paintScreen(this.refs.screens[this.refs.screens.length - 1]);
    return display;
  }

  paintScreen(ref) {
    const page=ref.type==='navigation'?this.screenPage:ref.page||'home';
    const result=paintVehicleScreen(ref.canvas,ref.type,this.state||{}, {page,time:'20:26',theme:'dark',ui:this.screenUI});
    ref.hitRegions=result?.hitRegions||[];
    ref.screen.material.color.setScalar(.45+(this.screenUI?.brightness??80)/100*.69);
    ref.texture.needsUpdate=true;
  }

  setScreenPage(page, notify=true) {
    if(!SCREEN_PAGES.includes(page))return;
    this.screenPage=page;
    this.refs.screens.forEach(ref=>this.paintScreen(ref));
    if(notify)this.onScreenPage(page);
  }

  setScreenUI(ui) {this.screenUI=ui||{};this.refs.screens.forEach(ref=>this.paintScreen(ref));}

  resetScreenPages(){this.refs.screens.forEach(ref=>{ref.page='home';ref.pageHistory=['home'];});this.setScreenPage('home',false);}

  activateScreen(ref,uv) {
    const x=uv.x*ref.canvas.width,y=(1-uv.y)*ref.canvas.height;
    const region=[...ref.hitRegions].reverse().find(r=>x>=r.x&&x<=r.x+r.width&&y>=r.y&&y<=r.y+r.height);
    const secondary=ref.type!=='navigation'&&ref.type!=='instrument';
    if(region?.ui?.type==='back'&&secondary){
      ref.pageHistory??=['home'];if(ref.pageHistory.length>1)ref.pageHistory.pop();ref.page=ref.pageHistory.at(-1);this.paintScreen(ref);
    } else if(region?.ui)this.onScreenUI?.(region.ui);
    if(region?.range){
      const range=region.range,ratio=clamp((x-region.x)/region.width,0,1),step=range.step||1;
      const value=clamp(Math.round((range.min+ratio*(range.max-range.min))/step)*step,range.min,range.max);
      if(range.key)this.onScreenUI?.({type:'set',key:range.key,value});
      else if(range.action)this.onScreenAction({...range.action,value});
    }
    if(region?.page){
      if(secondary){
        ref.pageHistory??=['home'];if(region.page==='home')ref.pageHistory=['home'];else if(region.page!==ref.page)ref.pageHistory.push(region.page);
        ref.page=region.page;this.paintScreen(ref);
      }else this.setScreenPage(region.page);
    }
    if(region?.action)this.onScreenAction(region.action);
    if(region?.command)this.onScreenCommand?.(region.command);
  }

  paintOxygen() {
    const oxygen = this.refs.oxygen;
    if (!oxygen) return;
    const configured = this.state?.capabilities?.oxygen === true;
    const enabled = configured && this.state?.oxygen === true;
    const c = oxygen.canvas.getContext('2d');
    c.fillStyle = '#17212b'; c.fillRect(0, 0, 512, 160);
    c.textBaseline = 'middle'; c.textAlign = 'left';
    c.font = '500 55px system-ui, sans-serif'; c.fillStyle = '#d2ddd9'; c.fillText('制氧', 20, 77);
    c.font = '38px system-ui, sans-serif'; c.fillStyle = enabled ? '#8ff0d5' : '#86959e';
    c.fillText(!configured ? '未配置' : enabled ? '模拟开启' : '已关闭', 190, 80);
    oxygen.texture.needsUpdate = true;
  }

  createSelection() {
    this.selectionBox = new THREE.Box3();
    this.selectionHelper = new THREE.Box3Helper(this.selectionBox, new THREE.Color('#a8e8da'));
    this.selectionHelper.material.transparent = true; this.selectionHelper.material.opacity = .48; this.selectionHelper.material.depthTest = false;
    this.selectionHelper.renderOrder = 10; this.selectionHelper.visible = false; this.scene.add(this.selectionHelper);
    const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 112;
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; this.textures.add(texture);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false, toneMapped: false }));
    sprite.scale.set(1.35, .295, 1); sprite.renderOrder = 11; sprite.visible = false; this.scene.add(sprite);
    this.selectionLabel = { canvas, texture, sprite };
  }

  setSelection(target, domain) {
    this.selectionEnabled=true;this.selectedDomain=domain;
    if(['ambient','shade','rearScreen','media','fragrance','oxygen','chargePort'].includes(domain))target='all';
    let object = this.selectables.get(`${domain}:${target || 'all'}`) || this.selectables.get(`${domain}:all`);
    if (!object && ['temperature', 'climate', 'fan'].includes(domain)) object = this.selectables.get(`fan:${target}`) || this.selectables.get('climate:driver');
    this.selected = object || null;
    this.selectionHelper.visible = !!object && !this.interiorView && this.view!=='exterior'; this.selectionLabel.sprite.visible = !!object && this.view==='overview';
    if (object) {
      const { canvas, texture } = this.selectionLabel; const c = canvas.getContext('2d');
      c.clearRect(0, 0, canvas.width, canvas.height); c.fillStyle = 'rgba(10,30,43,.95)';
      c.beginPath(); c.roundRect(6, 7, 500, 95, 24); c.fill(); c.strokeStyle = '#8ed3c5'; c.lineWidth = 2; c.stroke();
      c.font = '500 37px system-ui, sans-serif'; c.fillStyle = '#d9f5ed'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(`${TARGET_NAMES[target] || '全车'} · ${DOMAIN_NAMES[domain] || '控制'}`, 256, 57); texture.needsUpdate = true;
    }
  }

  clearSelection() {
    this.selectionEnabled=false;this.selected=null;this.selectedDomain=null;
    this.selectionHelper.visible=false;this.selectionLabel.sprite.visible=false;
  }

  update(state, { target, domain } = {}) {
    this.state = state;
    if (this.selectionEnabled&&(target || domain)) this.setSelection(target || 'all', domain);
    this.refs.screens.forEach(screen => this.paintScreen(screen));
    this.paintOxygen();
  }

  setXray(value) {
    this.xray=Boolean(value);
    this.vehicle?.setCutaway(this.xray,this.view);
  }

  setTrim(trim) {
    const palette=TRIMS[trim]||TRIMS.olive;this.trim=trim;
    for(const [key,value] of Object.entries(palette))this.materials[key].color.set(value);
    (this.vehicle?.root||this.root).traverse(object=>{
      for(const material of object.material?(Array.isArray(object.material)?object.material:[object.material]):[]){
        const color=palette[material.userData?.trimRole];if(color)material.color?.set(color);
      }
    });
  }

  setMood(mood) {
    this.mood=mood;const night=mood==='night',lights=this.studioLights;
    lights.hemisphere.intensity=night ? .22:.75;lights.key.intensity=night ? .38:2.5;
    lights.fill.intensity=night ? .28:.65;lights.rim.intensity=night ? .6:.45;lights.ceiling.intensity=night ? .12:.25;
    this.scene.environmentIntensity=night ? .25:.55;this.scene.background.set(night?'#121b20':'#aab2b2');this.scene.fog.color.copy(this.scene.background);
    this.renderer.toneMappingExposure=night?1.05:1.03;
  }

  setView(view,immediate=false) {
    const views={
      showcase:{position:[0,1.43,.26],target:[0,1.17,-.87],fov:60,horizontalFov:100},
      overview:{position:[-4.0,3.6,-4.5],target:[0,.97,.25],fov:43},
      driver:{position:[-.49,1.43,-.08],target:[-.24,1.22,-1.10],fov:65},
      passenger:{position:[.49,1.43,-.08],target:[.24,1.22,-1.10],fov:65},
      rear:{position:[0,1.48,1.28],target:[0,1.31,-.46],fov:65},
      seat:{position:[-2.5,1.98,-.50],target:[-.15,1.0,.82],fov:49},
      display:{position:[0,1.17,-.20],target:[0,1.095,-.79],fov:40,horizontalFov:63},
      exterior:{position:[-5.3,2.05,-5.8],target:[0,.97,0],fov:40,horizontalFov:51},
    };
    const next=views[view]||views.showcase;this.view=view;
    this.framingHorizontalFov=next.horizontalFov||null;
    const nextFov=this.framingHorizontalFov?THREE.MathUtils.radToDeg(2*Math.atan(Math.tan(THREE.MathUtils.degToRad(this.framingHorizontalFov/2))/this.camera.aspect)):next.fov;
    // 内外始终使用同一装配，视角只移动相机；剖面展示是显式显示模式。
    this.vehicle.root.visible=true;
    this.interiorView=['showcase','driver','passenger','rear','display'].includes(view);
    this.selectionHelper.visible=!!this.selected&&!this.interiorView&&view!=='exterior';this.selectionLabel.sprite.visible=!!this.selected&&view==='overview';
    this.controls.enableRotate=!this.interiorView;this.controls.enablePan=!this.interiorView;this.controls.enableZoom=!this.interiorView;
    this.controls.minPolarAngle=this.interiorView ? .05:0;this.controls.maxPolarAngle=this.interiorView?Math.PI-.05:Math.PI*.48;
    this.setXray(!this.interiorView&&view!=='exterior');
    const position=new THREE.Vector3(...next.position),target=new THREE.Vector3(...next.target);
    if(immediate){this.camera.position.copy(position);this.controls.target.copy(target);this.camera.fov=nextFov;this.camera.updateProjectionMatrix();this.cameraMove=null;}
    else this.cameraMove={position,target,fov:nextFov};
  }

  lookAround(event) {
    if(!this.interiorView||!this.pointerStart||!event.buttons)return;
    this.cameraMove=null;
    const dx=event.clientX-this.pointerStart.x,dy=event.clientY-this.pointerStart.y;
    const yaw=this.lookStart.yaw-dx*.0035,pitch=clamp(this.lookStart.pitch+dy*.0035,-1.10,1.12);
    const direction=new THREE.Vector3(Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),-Math.cos(yaw)*Math.cos(pitch));
    this.controls.target.copy(this.camera.position).addScaledVector(direction,1.6);
  }

  setExteriorAngle(angle) {
    const positions={front:[-5.3,2.05,-5.8],side:[-7.3,1.65,0],rear:[-5.3,2.05,5.8]};
    if(this.view!=='exterior'||!positions[angle])return;
    this.cameraMove={position:new THREE.Vector3(...positions[angle]),target:new THREE.Vector3(0,.97,0),fov:this.camera.fov};
  }

  resize() {
    if (this.disposed) return;
    const width = Math.max(1, this.container.clientWidth), height = Math.max(1, this.container.clientHeight || 600);
    this.renderer.setSize(width, height, false);this.composer?.setSize(width,height); this.camera.aspect = width / height;
    if(this.framingHorizontalFov){this.camera.fov=THREE.MathUtils.radToDeg(2*Math.atan(Math.tan(THREE.MathUtils.degToRad(this.framingHorizontalFov/2))/this.camera.aspect));if(this.cameraMove)this.cameraMove.fov=this.camera.fov;}
    this.camera.updateProjectionMatrix();
  }

  hit(event) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObject(this.vehicle.root, true);
    for (const hit of hits) {
      if(hit.object.isLine||hit.object.isPoints)continue;
      if(hit.object.material?.transparent&&hit.object.material.opacity<.01)continue;
      let object = hit.object;
      let ancestor=object,visible=true;while(ancestor){if(!ancestor.visible){visible=false;break;}ancestor=ancestor.parent;}
      if (!visible) continue;
      // 剖视中的透明遮阳帘不抢占座椅/车窗选择。
      if (this.xray && object.parent === this.refs.shade.root) continue;
      if (this.xray && object.material?.transparent && object.material.opacity < .1) continue;
      if(hit.object.userData.displayRef)return {display:hit.object.userData.displayRef,uv:hit.uv};
      while (object && object !== this.vehicle.root) {
        if (object.userData.domain) return { target: object.userData.target, domain: object.userData.domain };
        object = object.parent;
      }
      const mat=hit.object.material;
      if(mat&&!Array.isArray(mat)&&(!mat.transparent||mat.opacity>.96))return null;
    }
    return null;
  }

  pick(event) {
    if (!this.pointerStart || Math.hypot(event.clientX - this.pointerStart.x, event.clientY - this.pointerStart.y) > 6) return;
    const hit = this.hit(event);
    if (hit?.display&&hit.uv)this.activateScreen(hit.display,hit.uv);
    else if (hit) { this.setSelection(hit.target, hit.domain); this.onSelect(hit); }
    this.pointerStart = null;
  }

  hover(event) {
    if (event.buttons) { this.renderer.domElement.style.cursor = 'grabbing'; return; }
    this.renderer.domElement.style.cursor = this.hit(event) ? 'pointer' : 'grab';
  }

  animate(now) {
    if (this.disposed) return;
    const dt = Math.min((now - this.lastFrame) / 1000, .05); this.lastFrame = now; this.time += dt;
    const t = 1 - Math.exp(-dt * 7.5); const s = this.state;
    if (this.cameraMove) {
      this.camera.position.lerp(this.cameraMove.position, t * .72);
      this.controls.target.lerp(this.cameraMove.target, t * .72);
      this.camera.fov = mix(this.camera.fov, this.cameraMove.fov, t * .72); this.camera.updateProjectionMatrix();
      if (this.camera.position.distanceTo(this.cameraMove.position) < .012 && Math.abs(this.camera.fov - this.cameraMove.fov) < .1) this.cameraMove = null;
    }
    if (s) {
      this.exterior?.update(s,dt);
      for (const [id, refs] of Object.entries(this.refs.seats)) {
        const seat = s.seats?.[id] || {};
        // 引擎正值表示向前；统一车辆的车头朝 -Z。
        refs.root.position.z = mix(refs.root.position.z, refs.z - clamp(seat.position, -1, 1) * .25, t);
        refs.back.rotation.x = mix(refs.back.rotation.x, .105 + clamp(seat.recline, 0, 1) * .64, t);
        const heating = Number(seat.heat || 0), ventilation = Number(seat.vent || 0);
        const color = heating ? '#ecae65' : ventilation ? '#6fcff0' : '#68cfc5';
        refs.effect.material.color.set(color); refs.effect.material.emissive.set(color);
        refs.effect.material.opacity = mix(refs.effect.material.opacity, heating || ventilation ? .70 : 0, t);
        refs.massage.material.opacity = seat.massage ? .13 + Math.sin(this.time * 4.5) * .085 : 0;
        refs.airflow.visible = !!ventilation;
        refs.airflow.children.forEach(p => { const phase = (this.time * .6 + p.userData.phase) % 1; p.position.y = .5 + phase * .5; p.material.opacity = Math.sin(phase * Math.PI) * .55; });
      }
      for (const [id, refs] of Object.entries(this.refs.doors)) refs.root.rotation.y = mix(refs.root.rotation.y, s.doors?.[id] ? refs.side * 1.05 : 0, t * .62);
      for (const [id, refs] of Object.entries(this.refs.windows)) {
        const open = clamp(s.windows?.[id], 0, 100) / 100;
        refs.root.scale.y = mix(refs.root.scale.y, Math.max(.018, 1 - open), t * .75);
      }
      for (const [id, refs] of Object.entries(this.refs.reading)) {
        const lit = !!s.lights?.reading?.[id]; refs.lamp.material.emissiveIntensity = mix(refs.lamp.material.emissiveIntensity, lit ? 2.8 : .05, t);
        refs.light.intensity = mix(refs.light.intensity, lit ? 1.15 : 0, t);
      }
      const ambient = !!s.lights?.ambient;
      const ambientColor = s.lights?.color || '#9bcbc5';
      this.materials.glow.color.set(ambientColor); this.materials.glow.emissive.set(ambientColor);
      const ambientLevel=clamp(this.screenUI?.ambientBrightness??70,0,100)/70;
      this.materials.glow.emissiveIntensity = mix(this.materials.glow.emissiveIntensity, ambient ? 2.3*ambientLevel : .015, t);
      this.materials.glow.color.multiplyScalar(ambient ? 1 : .2);
      this.refs.ambientLight.color.set(ambientColor); this.refs.ambientLight.intensity = mix(this.refs.ambientLight.intensity, ambient ? 1.7*ambientLevel : 0, t);
      this.refs.airflow.forEach(flow => {
        flow.visible = this.selectionEnabled && ['temperature','climate','fan'].includes(this.selectedDomain) && s.climate?.power !== false && Number(s.climate?.fan || 0) > 0;
        flow.children.forEach(trace => {
          const phase = (this.time * (.35 + clamp(s.climate?.fan, 0, 7) * .12) + trace.userData.phase) % 1;
          trace.position.z = .06 + phase * .4; trace.material.opacity = Math.sin(phase * Math.PI) * .36;
        });
      });
      this.refs.rearScreen.rotation.x = mix(this.refs.rearScreen.rotation.x, s.rearScreen ? .06 : -Math.PI / 2, t * .7);
      const shade = this.refs.shade;
      shade.amount = mix(shade.amount, clamp(s.shade, 0, 100) / 100, t * .65);
      const len = mix(2.52, .09, shade.amount);
      shade.sheet.scale.z = len / 2.52; shade.sheet.position.z = -.37 + len / 2;
      shade.rail.position.z = -.37 + len;
      shade.slats.forEach((slat, index) => { slat.position.z = -.37 + (index / 10) * len; });
      this.refs.chargePort.rotation.y = mix(this.refs.chargePort.rotation.y, s.chargePort ? 1.12 : 0, t);
      this.refs.fragrance.material = s.fragrance ? this.materials.glow : this.materials.gold;
      const oxygenEnabled = s.capabilities?.oxygen === true && s.oxygen === true;
      this.refs.oxygen.lamp.material.color.set(oxygenEnabled ? '#9cebd8' : '#617078');
      this.refs.oxygen.lamp.material.emissiveIntensity = mix(this.refs.oxygen.lamp.material.emissiveIntensity, oxygenEnabled ? 1.8 : .025, t);
    }
    if (this.selected) {
      this.selectionBox.setFromObject(this.selected);
      this.selectionBox.expandByScalar(.025);
      const center = this.selectionBox.getCenter(new THREE.Vector3());
      this.selectionLabel.sprite.position.set(center.x, this.selectionBox.max.y + .21, center.z);
    }
    this.controls.update();if(this.composer)this.composer.render();else this.renderer.render(this.scene,this.camera);
    this.frame = requestAnimationFrame(this.animate);
  }

  dispose() {
    this.disposed = true; cancelAnimationFrame(this.frame); this.resizeObserver.disconnect(); this.controls.dispose();
    this.renderer.domElement.removeEventListener('pointerdown', this.boundPointerDown);
    this.renderer.domElement.removeEventListener('pointerup', this.boundPointerUp);
    this.renderer.domElement.removeEventListener('pointermove', this.boundPointerMove);
    this.renderer.domElement.removeEventListener('wheel',this.boundWheel);
    this.composer?.passes.forEach(p=>p.dispose?.());this.composer?.dispose();this.environmentTarget?.dispose();
    const geometries = new Set(), materials = new Set();
    this.scene.traverse(node => {
      if (node.geometry) geometries.add(node.geometry);
      if (node.material) (Array.isArray(node.material) ? node.material : [node.material]).forEach(m => materials.add(m));
    });
    geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); this.textures.forEach(t => t.dispose());
    this.renderer.dispose(); this.renderer.domElement.remove();
  }
}
