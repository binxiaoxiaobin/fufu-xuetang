import * as THREE from './vendor/three.module.js';

// Paint expressions on the existing textured face surface. The source model's
// eyes and smile are part of one baked texture, so separate opaque disks leave
// visible rims and float in front of the cheeks.
export function installFaceShader(meshes) {
  const uniforms = {
    eyeClosed: { value: 0 },
    eyeSmile: { value: 0 },
    mouthSmile: { value: 0 },
    mouthO: { value: 0 },
    skin: { value: new THREE.Color(0xd9a079) },
    crease: { value: new THREE.Color(0x5c3024) },
    cavity: { value: new THREE.Color(0x4f2928) },
    tongue: { value: new THREE.Color(0xe8797a) },
    teeth: { value: new THREE.Color(0xffe9d5) },
  };
  for (const mesh of meshes) {
    const materials = [].concat(mesh.material);
    const rewritten = materials.map(original => {
      if (!original?.map) return original;
      const material = original.clone();
      material.onBeforeCompile = shader => {
        for (const [name, uniform] of Object.entries(uniforms)) {
          shader.uniforms[`uFace_${name}`] = uniform;
        }
        shader.vertexShader = shader.vertexShader
          .replace('void main() {', 'varying vec3 vFaceRest;\nvoid main() {')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\n vFaceRest = position;');
        shader.fragmentShader = shader.fragmentShader
          .replace('void main() {', `
            varying vec3 vFaceRest;
            uniform float uFace_eyeClosed;
            uniform float uFace_eyeSmile;
            uniform float uFace_mouthSmile;
            uniform float uFace_mouthO;
            uniform vec3 uFace_skin;
            uniform vec3 uFace_crease;
            uniform vec3 uFace_cavity;
            uniform vec3 uFace_tongue;
            uniform vec3 uFace_teeth;
            void main() {
          `)
          .replace('#include <color_fragment>', `
            #include <color_fragment>
            vec3 fp = vFaceRest;
            float faceFront = smoothstep(.30, .42, fp.z) * (1.0 - smoothstep(.88, .98, fp.z));
            if (faceFront > .001) {
              float eyeLine = 0.0;
              for (int side = 0; side < 2; side++) {
                float ex = side == 0 ? -.173 : .173;
                float dx = fp.x - ex;
                float dy = fp.y - 2.402;
                float r = length(vec2(dx / .152, dy / .158));
                float eyePaint = (1.0 - smoothstep(.75, 1.10, r)) * uFace_eyeClosed;
                vec3 localSkin = uFace_skin;
                #ifdef USE_MAP
                  localSkin = texture2D(map, side == 0 ? vec2(.8423, .2700) : vec2(.4951, .1200)).rgb;
                #endif
                diffuseColor.rgb = mix(diffuseColor.rgb, localSkin, eyePaint * faceFront);
                float arc = .009 + uFace_eyeSmile * .026 * (1.0 - clamp(dx * dx / (.087 * .087), 0.0, 1.0));
                float within = 1.0 - smoothstep(.075, .091, abs(dx));
                float line = (1.0 - smoothstep(.004, .011, abs(dy - arc))) * within;
                eyeLine = max(eyeLine, line * uFace_eyeClosed);
              }
              diffuseColor.rgb = mix(diffuseColor.rgb, uFace_crease, eyeLine * faceFront);

              float my = fp.y - 2.203;
              float mouthActive = max(uFace_mouthSmile, uFace_mouthO);
              float mouthRegion = 1.0 - smoothstep(.76, 1.10,
                length(vec2(fp.x / .171, my / .115)));
              diffuseColor.rgb = mix(diffuseColor.rgb, uFace_skin,
                mouthRegion * mouthActive * faceFront);
              float smileShape = 1.0 - smoothstep(.86, 1.02,
                length(vec2(fp.x / .121, (my + .015) / .064)));
              smileShape *= 1.0 - smoothstep(.026, .040, my);
              float oRadius = length(vec2(fp.x / .050, (my + .004) / .059));
              float oShape = 1.0 - smoothstep(.86, 1.06, oRadius);
              float lip = smoothstep(.78, .94, oRadius) *
                (1.0 - smoothstep(1.08, 1.27, oRadius));
              diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.47, .23, .19),
                lip * uFace_mouthO * faceFront * .33);
              float cavityMask = max(smileShape * uFace_mouthSmile, oShape * uFace_mouthO);
              vec3 oDepth = mix(uFace_cavity * .70, uFace_cavity * 1.20,
                smoothstep(-.047, .037, my));
              diffuseColor.rgb = mix(diffuseColor.rgb,
                mix(uFace_cavity, oDepth, uFace_mouthO), cavityMask * faceFront);
              float toothMask = 1.0 - smoothstep(.003, .009, abs(my - .015));
              toothMask *= 1.0 - smoothstep(.051, .065, abs(fp.x));
              diffuseColor.rgb = mix(diffuseColor.rgb, uFace_teeth,
                toothMask * smileShape * uFace_mouthSmile * faceFront);
              float tongueMask = 1.0 - smoothstep(.70, 1.05,
                length(vec2(fp.x / .047, (my + .046) / .017)));
              diffuseColor.rgb = mix(diffuseColor.rgb, uFace_tongue,
                tongueMask * smileShape * uFace_mouthSmile * faceFront);
              float oTongue = (1.0 - smoothstep(.48, .91,
                length(vec2(fp.x / .052, (my + .043) / .026)))) * uFace_mouthO;
              diffuseColor.rgb = mix(diffuseColor.rgb, uFace_tongue * .68,
                oTongue * oShape * faceFront * .65);
            }
          `);
      };
      material.customProgramCacheKey = () => 'tuantuan-expression-surface-v1';
      material.needsUpdate = true;
      return material;
    });
    mesh.material = Array.isArray(mesh.material) ? rewritten : rewritten[0];
  }
  return {
    update(eyeClosed, eyeSmile, mouthSmile, mouthO) {
      uniforms.eyeClosed.value = eyeClosed;
      uniforms.eyeSmile.value = eyeSmile;
      uniforms.mouthSmile.value = mouthSmile;
      uniforms.mouthO.value = mouthO;
    },
  };
}
