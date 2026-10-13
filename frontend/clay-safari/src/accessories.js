// 动物园里的探险家配件：材质用 clay.js 的黏土材质，装配逻辑复用共用模块。
import * as THREE from 'three';
import { clayMaterial } from './clay.js?v=20260930-tuantuan-3';
import { setExplorerAccessories as kit } from './accessory-kit.js?v=20260930-tuantuan-3';

const materials = {
  pink: clayMaterial(0xf4a8b7),
  yellow: clayMaterial(0xffd969),
  cream: clayMaterial(0xfff0cf),
  brown: clayMaterial(0x9d6a43),
  leather: clayMaterial(0xd99464),
  red: clayMaterial(0xe88c8d),
  mint: clayMaterial(0x8ac7a6),
  shoeCream: clayMaterial(0xffe7bd),
  glassBlue: clayMaterial(0x76aeb5),
  bronze: clayMaterial(0xc89854),
};

export function setExplorerAccessories(model, equipment) {
  kit(THREE, model, equipment, materials);
}
