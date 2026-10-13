/** Fit every box corner inside the perspective frustum at the chosen orbit angle. */
export function boxViewDistance(width, height, depth, fov, aspect, azimuth, elevation, padding = 1.08) {
  const tan = Math.tan(fov * Math.PI / 360);
  const sa = Math.sin(azimuth), ca = Math.cos(azimuth);
  const se = Math.sin(elevation), ce = Math.cos(elevation);
  let distance = 0;
  for (const x of [-width / 2, width / 2]) for (const y of [-height / 2, height / 2]) for (const z of [-depth / 2, depth / 2]) {
    const right = x * ca - z * sa;
    const up = -x * sa * se + y * ce - z * ca * se;
    const towardCamera = x * sa * ce + y * se + z * ca * ce;
    distance = Math.max(distance, towardCamera + Math.abs(right) * padding / (tan * Math.max(0.2, aspect)), towardCamera + Math.abs(up) * padding / tan);
  }
  return distance;
}

/** Asset-local calibration. Dimensions are measured after the up-axis correction. */
export function modelScaleFactor(size, spec) {
  const height = Number(spec.fitHeightM);
  const length = Number(spec.fitLengthM);
  const target = height > 0 ? height : length;
  if (!(target > 0)) return 1;
  const axis = height > 0 ? 'y' : spec.lengthAxis;
  const measured = ['x','y','z'].includes(axis) ? size[axis] : Math.max(size.x, size.z);
  return Number.isFinite(measured) && measured > 0.0001 ? target / measured : 1;
}
