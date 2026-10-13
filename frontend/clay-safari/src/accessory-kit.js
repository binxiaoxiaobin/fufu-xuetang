// 黏土配件装配（共用模块）
//
// 原来 pet3d.js（首页的团团）和 clay-safari/src/accessories.js（动物园里的探险家）
// 各复制了一份几乎相同的配件代码，改一处很容易漏掉另一处。
// 现在两边都调用这里；THREE 和材质由调用方传入，所以本文件不依赖任何模块。

export function setExplorerAccessories(THREE, model, equipment, materials) {
  if (!THREE || !model) return;
  // 先清掉上一次的配件（材质是共享的，只释放几何体）
  for (const previous of model.userData.clayAccessories || []) {
    previous.removeFromParent();
    previous.traverse(object => { if (object.isMesh) object.geometry.dispose(); });
  }
  for (const anchor of model.userData.clayAccessoryAnchors || []) anchor.removeFromParent();
  const groups = [];
  const anchors = [];
  const addGroup = parent => { const group = new THREE.Group(); parent.add(group); groups.push(group); return group; };
  const blob = (parent, x, y, z, sx, sy, sz, material) => {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), material);
    mesh.position.set(x, y, z);
    mesh.scale.set(sx, sy, sz);
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  };
  const {
    pink, yellow, cream, brown, leather, red, mint, shoeCream, glassBlue, bronze,
  } = materials;

  const rigged = !!model.userData.claySafariRigged;
  const boneAnchor = (boneName, x, y, z) => {
    const bone = model.getObjectByName(boneName);
    if (!bone) return model;
    model.updateMatrixWorld(true);
    const anchor = new THREE.Group();
    const point = model.localToWorld(new THREE.Vector3(x, y, z));
    const facing = model.getWorldQuaternion(new THREE.Quaternion());
    bone.add(anchor);
    anchor.position.copy(bone.worldToLocal(point));
    anchor.quaternion.copy(bone.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(facing));
    anchors.push(anchor);
    return anchor;
  };
  const head = rigged ? boneAnchor('mixamorig:Head', 0, 1.14, 0) : model.getObjectByName('head');
  const body = rigged ? boneAnchor('mixamorig:Spine2', 0, .35, 0) : model;
  for (const accessory of Object.values(equipment || {})) {
    if (accessory === '👟') {
      // The imported character already wears clay shoes.
      if (rigged) continue;
      for (const leg of [model.getObjectByName('leg-1'), model.getObjectByName('leg1')]) {
        if (!leg) continue;
        const shoe = addGroup(leg);
        blob(shoe, 0, -.25, .035, .095, .07, .13, shoeCream);
        blob(shoe, 0, -.3, .05, .1, .027, .14, mint);
        blob(shoe, 0, -.21, .135, .06, .018, .012, cream);
      }
      continue;
    }
    // Scarf and backpack are already part of the source mesh; duplicating them looks broken.
    if (rigged && ['🧣', '🎒'].includes(accessory)) continue;
    const group = addGroup(['🎀', '🌼', '🧢', '🕶️'].includes(accessory) && head ? head : body);
    if (accessory === '🎀' && head) {
      group.position.set(-.18, .55, .12);
      blob(group, -.085, 0, 0, .11, .075, .045, pink).rotation.z = .38;
      blob(group, .085, 0, 0, .11, .075, .045, pink).rotation.z = -.38;
      blob(group, 0, 0, .045, .045, .05, .035, yellow);
    } else if (accessory === '🌼' && head) {
      group.position.set(.22, .55, .13);
      for (let i = 0; i < 5; i++) {
        const angle = i * Math.PI * 2 / 5;
        blob(group, Math.cos(angle) * .07, Math.sin(angle) * .07, 0, .055, .07, .035, cream);
      }
      blob(group, 0, 0, .03, .05, .05, .04, yellow);
    } else if (accessory === '🧢' && head) {
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(.37, .35, .04, 32), mint);
      brim.position.y = .54; brim.castShadow = true;
      group.add(brim);
      blob(group, 0, .64, 0, .29, .15, .29, mint);
      const band = new THREE.Mesh(new THREE.TorusGeometry(.285, .025, 8, 32), yellow);
      band.rotation.x = Math.PI / 2; band.position.y = .555;
      group.add(band);
    } else if (accessory === '🕶️' && head) {
      for (const x of [-.105, .105]) {
        const rim = new THREE.Mesh(new THREE.TorusGeometry(.098, .018, 8, 28), bronze);
        rim.position.set(x, .27, .31);
        group.add(rim);
        blob(group, x, .27, .31, .078, .078, .012, glassBlue);
      }
      blob(group, 0, .275, .32, .04, .018, .018, bronze);
    } else if (accessory === '🧣') {
      const wrap = new THREE.Mesh(new THREE.TorusGeometry(.17, .047, 10, 32), pink);
      wrap.rotation.x = Math.PI / 2; wrap.position.y = .76;
      group.add(wrap);
      blob(group, -.045, .62, .175, .055, .15, .035, yellow);
      blob(group, .06, .58, .18, .05, .18, .035, mint);
    } else if (accessory === '🌟') {
      const shape = new THREE.Shape();
      for (let i = 0; i < 10; i++) {
        const angle = i * Math.PI / 5 - Math.PI / 2;
        const radius = i % 2 ? .055 : .12;
        const x = Math.cos(angle) * radius, y = Math.sin(angle) * radius;
        if (i === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
      }
      shape.closePath();
      const star = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, {
        depth: .035, bevelEnabled: true, bevelSize: .012, bevelThickness: .012, bevelSegments: 2,
      }), yellow);
      star.position.set(.08, .63, .205);
      star.castShadow = true;
      group.add(star);
    } else if (accessory === '🎒') {
      blob(group, 0, .57, -.19, .19, .23, .12, leather);
      blob(group, 0, .69, -.31, .125, .055, .03, yellow);
      blob(group, 0, .48, -.31, .055, .055, .03, cream);
    } else if (accessory === '🔔') {
      blob(group, 0, .67, .205, .09, .09, .06, yellow);
      blob(group, 0, .596, .255, .025, .025, .02, brown);
    } else if (accessory === '🦸') {
      const shape = new THREE.Shape();
      shape.moveTo(-.2, .68); shape.lineTo(.2, .68); shape.lineTo(.29, .13);
      shape.quadraticCurveTo(0, .03, -.29, .13); shape.closePath();
      const cape = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, {
        depth: .025, bevelEnabled: true, bevelSize: .012, bevelThickness: .012, bevelSegments: 2,
      }), red);
      cape.position.z = -.22;
      cape.castShadow = true;
      group.add(cape);
      const mark = new THREE.Shape();
      for (let i = 0; i < 10; i++) {
        const angle = i * Math.PI / 5 - Math.PI / 2;
        const radius = i % 2 ? .024 : .056;
        const x = Math.cos(angle) * radius, y = Math.sin(angle) * radius;
        if (i === 0) mark.moveTo(x, y); else mark.lineTo(x, y);
      }
      mark.closePath();
      const emblem = new THREE.Mesh(new THREE.ShapeGeometry(mark), yellow);
      emblem.position.set(0, .38, -.255);
      emblem.material.side = THREE.DoubleSide;
      group.add(emblem);
      blob(group, 0, .68, -.24, .06, .035, .03, yellow);
    }
  }
  model.userData.clayAccessories = groups;
  model.userData.clayAccessoryAnchors = anchors;
}
