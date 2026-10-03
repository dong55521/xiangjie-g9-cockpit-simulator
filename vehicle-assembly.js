import * as THREE from 'three';

// 原座舱采用放大教学比例。本变换将其装入外观坐标系，并非原厂尺寸标定。
const INTERIOR_SCALE = [.76, .70, .68];
const INTERIOR_POSITION = [0, .09, .30];
const DOORS = ['driver', 'passenger', 'rearLeft', 'rearRight'];
const ASSEMBLIES = new WeakMap();

function descendantOf(object, root) {
  for (let item = object; item; item = item.parent) if (item === root) return true;
  return false;
}

function materialList(object) {
  return Array.isArray(object.material) ? object.material : object.material ? [object.material] : [];
}

function point(value) {
  return value?.isVector3 ? value.clone() : new THREE.Vector3(...value);
}

/** 装配一个可进入、可开门的实体车辆，门与窗的动画引用仅保留一套。 */
export function assembleVehicle(cabin, exterior) {
  if (!cabin.root || !exterior?.root) throw new Error('缺少内饰或外观根节点');
  if (ASSEMBLIES.has(cabin.root)) return ASSEMBLIES.get(cabin.root);
  for (const id of DOORS) {
    if (!cabin.refs.doors[id]?.innerPanelRoot || !exterior.doors?.[id]?.root || !exterior.windows?.[id]?.root) {
      throw new Error(`车辆装配缺少 ${id} 的内门板、外门或车窗`);
    }
  }
  if (!exterior.chargePort) throw new Error('车辆装配缺少外观充电口');

  const vehicleRoot = new THREE.Group();
  vehicleRoot.name = '内外一体车辆';
  vehicleRoot.userData.assemblyRole = 'vehicle';
  const interiorRoot = cabin.root;
  interiorRoot.name = '同一车辆的详细内饰';
  interiorRoot.scale.set(...INTERIOR_SCALE);
  interiorRoot.position.set(...INTERIOR_POSITION);
  interiorRoot.visible = exterior.root.visible = true;
  vehicleRoot.add(exterior.root, interiorRoot);
  cabin.scene.add(vehicleRoot);

  const discarded = [], doorReport = [];
  const detach = object => {
    if (!object?.parent) return;
    object.removeFromParent(); discarded.push(object);
  };
  for (const id of DOORS) {
    const old = cabin.refs.doors[id], outer = exterior.doors[id], window = exterior.windows[id];
    const front = !id.startsWith('rear'), oldLength = front ? 1.48 : 1.64;
    const length = outer.end - outer.start;
    if (!(length > 0)) throw new Error(`外门 ${id} 的铰链长度无效`);
    const liner = old.innerPanelRoot;
    outer.root.add(liner);
    liner.position.set(-outer.side * .04, .45, .015);
    // 留出末端装配缝，避免内板穿过外门后缘。
    // 后门扶手/肩线最高点约 .792；.978 倍使其同样落在外窗下沿 1.224 附近。
    liner.scale.set(.76, front ? .80 : .978, (length - .030) / oldLength);
    liner.rotation.set(0, 0, 0);
    liner.userData.target = id; liner.userData.domain = 'door';
    outer.root.userData.shellSide = outer.side;
    old.root.userData.assemblyDiscard = '已由同一外门铰链替换';
    detach(old.root);
    cabin.refs.doors[id] = { ...outer, inner: old.inner, innerPanelRoot: liner };
    cabin.refs.windows[id] = window;
    cabin.selectables?.set(`door:${id}`, outer.root);
    cabin.selectables?.set(`window:${id}`, window.root);
    doorReport.push({ id, oldLength, assembledLength: length, linerScale: liner.scale.toArray() });
  }

  // 只清理 model-body 显式标记的旧外皮/玻璃，不猜测座椅或仪表台材质。
  const oldExterior = [];
  interiorRoot.traverse(object => {
    if (object.userData.assemblyDiscard || materialList(object).some(mat => mat.userData.assemblyDiscard)) oldExterior.push(object);
  });
  oldExterior.forEach(detach);
  cabin.refs.chargePort = exterior.chargePort;
  cabin.refs.windshield = exterior.windshield;
  if (cabin.refs.rearGlass && !descendantOf(cabin.refs.rearGlass, vehicleRoot)) delete cabin.refs.rearGlass;
  cabin.selectables?.set('chargePort:all', exterior.chargePort);
  cabin.refs.shellParts = (cabin.refs.shellParts || []).filter(part => descendantOf(part.object, vehicleRoot));
  if (cabin.selectables) {
    for (const [key, object] of cabin.selectables) if (!descendantOf(object, vehicleRoot)) cabin.selectables.delete(key);
  }

  // 已拆件不留作隐藏的第二辆车；只释放未被现用部件共享的资源。
  const activeGeometry = new Set(), activeMaterial = new Set();
  cabin.scene.traverse(object => {
    if (object.geometry) activeGeometry.add(object.geometry);
    materialList(object).forEach(mat => activeMaterial.add(mat));
  });
  const disposedGeometry = new Set(), disposedMaterial = new Set();
  for (const root of discarded) root.traverse(object => {
    if (object.geometry && !activeGeometry.has(object.geometry) && !disposedGeometry.has(object.geometry)) {
      object.geometry.dispose(); disposedGeometry.add(object.geometry);
    }
    for (const mat of materialList(object)) if (!activeMaterial.has(mat) && !disposedMaterial.has(mat)) {
      mat.dispose(); disposedMaterial.add(mat);
    }
  });

  const outsideRoof = exterior.roofParts || [], outsideGlass = exterior.glassParts || [], outsideShell = exterior.shellParts || [];
  const interiorSides = [];
  interiorRoot.traverse(object => { if (object.userData.shellSide) interiorSides.push(object); });
  const interiorRoof = cabin.refs.shellParts.filter(part => part.hideInXray).map(part => part.object);
  const controlled = [...new Set([...outsideRoof, ...outsideGlass, ...outsideShell, ...interiorSides, ...interiorRoof])];
  const originalVisibility = new Map(controlled.map(object => [object, object.visible]));

  const assembly = {
    vehicleRoot,
    root: vehicleRoot,
    interiorRoot,
    exteriorRoot: exterior.root,
    doors: cabin.refs.doors,
    windows: cabin.refs.windows,
    report: {
      interiorScale: [...INTERIOR_SCALE], interiorPosition: [...INTERIOR_POSITION],
      doors: doorReport, doorCount: DOORS.length, windowCount: DOORS.length,
      discardedRoots: discarded.length, disposedGeometries: disposedGeometry.size,
      evidence: '程序化装配比例；非原厂工程尺寸',
    },
    toWorld(value) {
      interiorRoot.updateWorldMatrix(true, false);
      return interiorRoot.localToWorld(point(value));
    },
    fromWorld(value) {
      interiorRoot.updateWorldMatrix(true, false);
      return interiorRoot.worldToLocal(point(value));
    },
    setCutaway(enabled, view = 'overview') {
      const cutaway = Boolean(enabled);
      for (const [object, visible] of originalVisibility) object.visible = visible;
      vehicleRoot.visible = interiorRoot.visible = exterior.root.visible = true;
      if (cutaway) {
        outsideRoof.forEach(object => { object.visible = false; });
        outsideGlass.forEach(object => { object.visible = false; });
        interiorRoof.forEach(object => { object.visible = false; });
        // 默认观察位置在左侧，移除同侧实体以露出仍在车内的座椅和门板。
        const nearSide = view === 'passenger' ? 1 : -1;
        outsideShell.forEach(object => { if (object.userData.shellSide === nearSide) object.visible = false; });
        interiorSides.forEach(object => { if (object.userData.shellSide === nearSide) object.visible = false; });
      }
      vehicleRoot.userData.cutaway = cutaway;
      return { cutaway, view, hiddenParts: controlled.filter(object => !object.visible).length };
    },
  };
  ASSEMBLIES.set(interiorRoot, assembly);
  vehicleRoot.updateMatrixWorld(true);
  assembly.setCutaway(false);
  return assembly;
}
