import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { SSAOPass } from 'three/addons/postprocessing/SSAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// 全部材质由本项目生成，既不下载汽车网站的模型，也不分发其内饰照片。
export function createStudioMaterials(cabin) {
  let seed=427;
  const random=()=>{seed=(seed*16807)%2147483647;return seed/2147483647;};
  const texture=(width,height,draw,color=false,repeat=1)=>{
    const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
    draw(canvas.getContext('2d'),width,height);
    const map=new THREE.CanvasTexture(canvas);
    if(color)map.colorSpace=THREE.SRGBColorSpace;
    map.wrapS=map.wrapT=THREE.RepeatWrapping;map.repeat.set(repeat,repeat);
    map.anisotropy=Math.min(8,cabin.renderer.capabilities.getMaxAnisotropy());
    cabin.textures.add(map);return map;
  };
  const grain=texture(512,512,(c,w,h)=>{
    c.fillStyle='#888';c.fillRect(0,0,w,h);
    for(let i=0;i<35000;i++){const v=Math.round(90+random()*70);c.fillStyle=`rgb(${v},${v},${v})`;c.beginPath();c.ellipse(random()*w,random()*h,.35+random()*.65,.5+random(),random()*Math.PI,0,Math.PI*2);c.fill();}
  },false,3);
  // 粗糙度贴图与材质参数相乘；浅底保留皮革本来的哑光，避免被灰底意外抛光。
  const rough=texture(256,256,(c,w,h)=>{c.fillStyle='#ededed';c.fillRect(0,0,w,h);for(let i=0;i<6000;i++){c.fillStyle=`rgba(160,160,160,${random()*.10})`;c.fillRect(random()*w,random()*h,1,1);}},false,2);
  const brushed=texture(256,256,(c,w,h)=>{c.fillStyle='#eeeeee';c.fillRect(0,0,w,h);for(let y=0;y<h;y++){c.fillStyle=`rgba(120,120,120,${.015+random()*.055})`;c.fillRect(0,y,w,1);}},false,2);
  const wood=texture(1024,256,(c,w,h)=>{
    c.fillStyle='#4e3829';c.fillRect(0,0,w,h);
    for(let i=0;i<800;i++){
      const y=random()*h;c.strokeStyle=i%3===0?'rgba(19,12,9,.16)':'rgba(188,145,96,.12)';c.lineWidth=.3+random()*1.5;c.beginPath();
      const shift=random()*8;for(let x=0;x<=w;x+=6){const yy=y+Math.sin(x*.007+shift)*2.5+Math.sin(x*.018+shift)*.5;x?c.lineTo(x,yy):c.moveTo(x,yy);}c.stroke();
    }
  },true);
  const carpet=texture(256,256,(c,w,h)=>{c.fillStyle='#59544c';c.fillRect(0,0,w,h);for(let i=0;i<24000;i++){c.strokeStyle=i%2?'#6b6356':'#45433b';const x=random()*w,y=random()*h;c.beginPath();c.moveTo(x,y);c.lineTo(x+random()*2,y+random()*3);c.stroke();}},true,5);
  const p=(color,extra={})=>new THREE.MeshPhysicalMaterial({color,roughness:.65,metalness:0,envMapIntensity:.65,...extra});
  return {
    leather:p('#bdb5a3',{bumpMap:grain,bumpScale:.0007,roughnessMap:rough,roughness:.78,sheen:.16,sheenColor:new THREE.Color('#ece9e3'),sheenRoughness:.84}),
    soft:p('#a59d8b',{bumpMap:grain,bumpScale:.00055,roughness:.87,sheen:.18,sheenColor:new THREE.Color('#e4dfd7'),sheenRoughness:.90}),
    darkLeather:p('#383b38',{bumpMap:grain,bumpScale:.0007,roughness:.87}),
    stitch:p('#d3c8b4',{roughness:.92}),
    metal:p('#aaaead',{metalness:.75,roughness:.49,roughnessMap:brushed}),
    gold:p('#a89b7e',{metalness:.70,roughness:.47,roughnessMap:brushed}),
    black:p('#131919',{roughness:.48}),
    carpet:p('#8c877e',{map:carpet,bumpMap:grain,bumpScale:.003,roughness:1}),
    floor:p('#262b28',{roughness:.98}),
    wood:p('#d9bb92',{map:wood,roughness:.61,clearcoat:.08,clearcoatRoughness:.56}),
    body:p('#464e4b',{metalness:.7,roughness:.25,clearcoat:.8,clearcoatRoughness:.16,transparent:true,opacity:1}),
    glass:p('#b3c3c4',{roughness:.08,metalness:.15,transparent:true,opacity:.18,side:THREE.DoubleSide,depthWrite:false,envMapIntensity:.55}),
    glow:p('#f0c28c',{emissive:'#f0c28c',emissiveIntensity:1.1,roughness:.3}),
    screen:new THREE.MeshBasicMaterial({color:'#80bbb7',toneMapped:false}),
  };
}

export function installStudioLighting(cabin) {
  const {scene,renderer}=cabin;
  scene.background=new THREE.Color('#aab2b2');scene.fog=new THREE.Fog('#aab2b2',17,50);
  const room=new RoomEnvironment(),pmrem=new THREE.PMREMGenerator(renderer);
  cabin.environmentTarget=pmrem.fromScene(room,.035);scene.environment=cabin.environmentTarget.texture;scene.environmentIntensity=.55;
  room.dispose();pmrem.dispose();
  const hemisphere=new THREE.HemisphereLight('#eef2f5','#373b3e',.75);scene.add(hemisphere);
  const key=new THREE.DirectionalLight('#fff9ef',2.5);key.position.set(-4,7,-3);key.castShadow=true;
  key.shadow.mapSize.set(2048,2048);Object.assign(key.shadow.camera,{left:-4,right:4,top:5,bottom:-4,near:.5,far:20});key.shadow.bias=-.0002;key.shadow.normalBias=.015;key.shadow.radius=3;scene.add(key);
  const fill=new THREE.DirectionalLight('#d6e5ed',.65);fill.position.set(5,4,1);scene.add(fill);
  const rim=new THREE.DirectionalLight('#f1f0eb',.45);rim.position.set(-2,4,6);scene.add(rim);
  const ceiling=new THREE.DirectionalLight('#fff9ef',.25);ceiling.position.set(0,5,0);scene.add(ceiling);
  const ambient=new THREE.PointLight('#d6b288',.6,5,2);ambient.position.set(0,1,.1);scene.add(ambient);cabin.refs.ambientLight=ambient;
  cabin.studioLights={hemisphere,key,fill,rim,ceiling};
}

// 透明玻璃、功能光效和选中标识不参与遮蔽，避免车内视角被假阴影盖住。
class CabinAO extends SSAOPass {
  _overrideVisibility(){
    super._overrideVisibility();
    this.scene.traverse(o=>{if(!o.visible)return;const mats=o.material?(Array.isArray(o.material)?o.material:[o.material]):[];
      if(o.isSprite||mats.some(m=>m.transparent&&m.opacity<.98)){this._visibilityCache.push(o);o.visible=false;}
    });
  }
}

export function installStudioRenderer(cabin) {
  const target=new THREE.WebGLRenderTarget(1,1,{type:THREE.HalfFloatType,samples:4});
  const composer=new EffectComposer(cabin.renderer,target);
  composer.addPass(new RenderPass(cabin.scene,cabin.camera));
  const ao=new CabinAO(cabin.scene,cabin.camera,512,512,16);ao.kernelRadius=.18;ao.minDistance=.0004;ao.maxDistance=.045;
  composer.addPass(ao);composer.addPass(new OutputPass());
  cabin.composer=composer;cabin.aoPass=ao;
}

export const TRIMS={
  olive:{leather:'#bdb5a3',soft:'#a59d8b',darkLeather:'#383b38',stitch:'#d3c8b4'},
  saddle:{leather:'#946442',soft:'#805538',darkLeather:'#302825',stitch:'#c4986c'},
  blue:{leather:'#aebfc4',soft:'#94a9af',darkLeather:'#2b363e',stitch:'#d1dce1'},
};
