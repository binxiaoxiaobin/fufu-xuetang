import { Color, Material, Vector3, type IUniform, type WebGLProgramParametersWithUniforms } from 'three';

/**
 * Uniforms shared by every patched material, so one write per frame drives
 * caustics, sway and day/night across the whole scene.
 */
export const globalUniforms = {
  uTime: { value: 0 } as IUniform<number>,
  uNight: { value: 0 } as IUniform<number>,
  uCaustic: { value: 1 } as IUniform<number>,
  uSunDir: { value: new Vector3(0.3, 1, 0.2).normalize() } as IUniform<Vector3>,
  uCausticColor: { value: new Color('#bff7ff') } as IUniform<Color>,
  uSurfaceY: { value: 40 } as IUniform<number>,
};

/** Tileable animated water caustic (after joltz0r's classic shadertoy), returns ~0..1. */
export const CAUSTIC_GLSL = /* glsl */ `
float causticLayer(vec2 uv, float t) {
  vec2 p = mod(uv * 6.28318, 6.28318) - 250.0;
  vec2 i = p;
  float c = 1.0;
  float inten = 0.005;
  for (int n = 0; n < 4; n++) {
    float tt = t * (1.0 - (3.5 / float(n + 1)));
    i = p + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
    vec2 q = vec2(p.x / (sin(i.x + tt) / inten), p.y / (cos(i.y + tt) / inten));
    c += 1.0 / max(length(q), 1e-3);
  }
  c /= 4.0;
  c = 1.17 - pow(clamp(c, 0.0, 8.0), 1.4);
  return clamp(pow(abs(c), 8.0), 0.0, 1.5);
}
float caustics(vec3 wp, float t) {
  vec2 uv = wp.xz * 0.045 + uSunDirXZ(wp.y);
  float a = causticLayer(uv, t * 0.45);
  float b = causticLayer(uv * 1.7 + 0.37, t * 0.38 + 3.0);
  return (a * 0.65 + b * 0.35);
}
`;

const CAUSTIC_PARS = /* glsl */ `
uniform float uTime;
uniform float uNight;
uniform float uCaustic;
uniform vec3 uSunDir;
uniform vec3 uCausticColor;
uniform float uSurfaceY;
varying vec3 vFxWorld;
varying vec3 vFxNormal;
vec2 uSunDirXZ(float y) { return uSunDir.xz / max(uSunDir.y, 0.2) * (uSurfaceY - y) * 0.045; }
${CAUSTIC_GLSL}
`;

export interface WorldFxOptions {
  caustics?: boolean;
  /** Vertex sway for plants: strength in metres at the top of the mesh (uses uv.y as height). */
  sway?: number;
  /** Extra GLSL added to the vertex shader after sway (has `transformed`). */
  vertexExtra?: string;
  /** Fluorescent self-glow at night, as a multiple of the albedo. */
  nightGlow?: number;
  /** Dither plants away when the camera is inside them, so kelp never blinds the player. */
  nearFade?: boolean;
  key?: string;
}

/**
 * Patches a built-in material in place: optional plant sway in the vertex
 * stage, projected caustics added to emissive light in the fragment stage.
 * Keeps all of three's lighting, shadows and fog.
 */
export function applyWorldFx<M extends Material>(material: M, opts: WorldFxOptions = {}): M {
  const { caustics = true, sway = 0, vertexExtra = '', nightGlow = 0, nearFade = false } = opts;
  material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    Object.assign(shader.uniforms, globalUniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${CAUSTIC_PARS}`)
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        ${sway > 0 ? `
        {
          vec3 base = vec3(0.0);
          #ifdef USE_INSTANCING
            base = instanceMatrix[3].xyz;
          #endif
          float hgt = clamp(uv.y, 0.0, 1.0);
          float ph = base.x * 0.37 + base.z * 0.23;
          float bend = hgt * hgt * ${sway.toFixed(3)};
          transformed.x += sin(uTime * 0.9 + ph + hgt * 2.2) * bend;
          transformed.z += cos(uTime * 0.7 + ph * 1.3 + hgt * 1.7) * bend * 0.6;
        }` : ''}
        ${vertexExtra}`,
      )
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        {
          vec4 fxw = vec4(transformed, 1.0);
          vec3 fxn = objectNormal;
          #ifdef USE_INSTANCING
            fxw = instanceMatrix * fxw;
            fxn = mat3(instanceMatrix) * fxn;
          #endif
          fxw = modelMatrix * fxw;
          vFxWorld = fxw.xyz;
          vFxNormal = normalize(mat3(modelMatrix) * fxn);
        }`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${CAUSTIC_PARS}`)
      .replace(
        '#include <clipping_planes_fragment>',
        `#include <clipping_planes_fragment>
        ${nearFade ? `
        {
          float camD = distance(vFxWorld, cameraPosition);
          float keep = smoothstep(2.0, 6.0, camD);
          float n = fract(sin(dot(floor(gl_FragCoord.xy), vec2(12.9898, 78.233))) * 43758.5453);
          if (n > keep) discard;
        }` : ''}`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        ${caustics ? `
        {
          float up = clamp(dot(normalize(vFxNormal), uSunDir) * 0.8 + 0.2, 0.0, 1.0);
          float depthFade = clamp(1.0 - (uSurfaceY - vFxWorld.y) / 70.0, 0.25, 1.0);
          float c = caustics(vFxWorld, uTime);
          totalEmissiveRadiance += diffuseColor.rgb * uCausticColor * c * up * depthFade * uCaustic * (1.0 - uNight * 0.85) * 1.6;
        }` : ''}
        ${nightGlow > 0 ? `totalEmissiveRadiance += diffuseColor.rgb * uNight * ${nightGlow.toFixed(3)};` : ''}`,
      );
  };
  const prevKey = material.customProgramCacheKey.bind(material);
  material.customProgramCacheKey = () => `${prevKey()}|fx:${caustics ? 1 : 0}:${sway}:${nightGlow}:${nearFade ? 1 : 0}:${opts.key ?? ''}`;
  return material;
}
