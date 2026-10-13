/* 地球仪的国家命中判定 —— 纯几何，不碰 DOM，也不碰 canvas。
 *
 * 为什么单独拆一份：
 *   1) 原来用 ctx.isPointInPath() 做命中判定，它**没有容差** —— 点必须精确落在
 *      国家轮廓里才算中。可屏幕上像德国、英国、南非这种国家只有二三十像素，
 *      而平板上的指腹直径约 50 CSS 像素（比国家还宽），于是"想点却点不中"。
 *   2) isPointInPath 在 setTransform(dpr,0,0,dpr) 下 x/y 该不该再乘 dpr，
 *      各家说法并不一致（WHATWG 邮件列表里 Apple 的解释是要乘，MDN 的参数
 *      说明写着"不受当前变换影响"，Firefox 还在 2011 年朝反方向改过一次）。
 *      把命中判定建在这种有分歧的 API 上，等于把结果交给浏览器实现差异。
 *   3) 拆出来之后，"点到哪个国家"完全由这份代码决定，可以用 Node 直接跑测试
 *      （scripts/verify_globe_hit.js），不用靠人在平板上反复试。
 *
 * 判定用的是**屏幕上的多边形**，而不是经纬度：
 *   一开始试过"把点击位置反投影回经纬度、再做点在多边形内测试"。测试量出来
 *   这个思路在球缘附近是病态的 —— 正投影在 ρ=0.96 处 **1 个像素等于 0.8 度经度**，
 *   半像素的误差就能让判定错掉好几个国家。而初始视角下英国、意大利、法国、
 *   西班牙恰好都落在那一圈上。
 *   所以改成：把国家轮廓按 globe.js 绘制的同一套做法（裁到朝向观察者的那一半、
 *   再投影到屏幕）变成平面多边形，直接判点。这样"点到什么"与"看到什么"必然一致 ——
 *   globe.js 的绘制也调用本模块的 projectRing()，只有一份实现。
 *
 * 容差也不做采样：直接量"到最近陆地边界的距离"。最初用"绕点击点撒一圈采样点"，
 * 测试当场发现采样点之间有空隙，1.9px 的小岛落在空隙里就被漏掉了。
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FufuGlobeHit = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var RAD = Math.PI / 180;
  var DEG = 180 / Math.PI;

  /* 容差（屏幕像素）。指腹约 50px 宽，取半径 22px 大约相当于"指尖范围内"。
   * 鼠标是精确指针对，给 10px 只是为了容忍手抖。 */
  var TOUCH_TOLERANCE = 22;
  var PEN_TOLERANCE = 14;
  var MOUSE_TOLERANCE = 10;

  function wrap(lon) { return ((lon + 180) % 360 + 360) % 360 - 180; }

  /* world.geojson 把英国拆成了 England（含苏格兰、威尔士），站里统一叫 United Kingdom */
  var ALIASES = { England: 'United Kingdom' };
  function normalizeName(name) { return ALIASES[name] || name; }

  /* 球面正投影：经纬度 -> 单位球面坐标，z > 0 表示朝向观察者 */
  function project(lon, lat, centerLon, centerLat) {
    var l = wrap(lon - centerLon) * RAD;
    var p = lat * RAD;
    var c = centerLat * RAD;
    var cosP = Math.cos(p);
    return [
      cosP * Math.sin(l),
      Math.sin(p) * Math.cos(c) - cosP * Math.cos(l) * Math.sin(c),
      Math.sin(p) * Math.sin(c) + cosP * Math.cos(l) * Math.cos(c)
    ];
  }

  /* 反投影：单位圆内的 (x, y) -> [经度, 纬度]；落在圆外返回 null。
   * ⚠️ 球缘附近非常病态（ρ=0.96 处 1 像素≈0.8 度经度），只适合做诊断，不要拿来做判定。 */
  function unproject(x, y, centerLon, centerLat) {
    var d2 = x * x + y * y;
    if (d2 > 1) return null;
    var z = Math.sqrt(1 - d2);
    var c = centerLat * RAD;
    return [
      wrap(centerLon + Math.atan2(x, z * Math.cos(c) - y * Math.sin(c)) * DEG),
      Math.asin(z * Math.sin(c) + y * Math.cos(c)) * DEG
    ];
  }

  /* 一个经纬度环 -> 屏幕上的多边形顶点（[x, y] 数组）。
   * 这就是 globe.js 绘制国家时用的同一套做法：跨越球缘（z=0）的边先插出交点，
   * 把背面的部分切掉，再投影。绘制与命中都走这里，保证"看到什么就能点到什么"。 */
  function projectRing(ring, view) {
    var out = [];
    var n = ring ? ring.length : 0;
    if (n < 3) return out;
    var cx = view.width / 2, cy = view.height / 2, r = view.radius;
    var i, a, b;
    for (i = 0; i < n; i++) {
      a = ring[i];
      b = ring[(i + 1) % n];
      var pa = project(a[0], a[1], view.centerLon, view.centerLat);
      var pb = project(b[0], b[1], view.centerLon, view.centerLat);
      var av = pa[2] >= 0, bv = pb[2] >= 0;
      if (av) out.push([cx + pa[0] * r, cy - pa[1] * r]);
      if (av !== bv) {
        var t = pa[2] / (pa[2] - pb[2]);
        out.push([
          cx + (pa[0] + t * (pb[0] - pa[0])) * r,
          cy - (pa[1] + t * (pb[1] - pa[1])) * r
        ]);
      }
    }
    return out;
  }

  /* 点到线段的距离平方（屏幕坐标） */
  function segmentDistance2(px, py, ax, ay, bx, by) {
    var dx = bx - ax, dy = by - ay;
    var len2 = dx * dx + dy * dy;
    var t = len2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
    if (t < 0) t = 0; else if (t > 1) t = 1;
    var qx = ax + t * dx - px, qy = ay + t * dy - py;
    return qx * qx + qy * qy;
  }

  function create(features) {
    var entries = [];
    for (var i = 0; i < features.length; i++) {
      var feature = features[i];
      if (!feature || !feature.geometry || !feature.properties) continue;
      var name = normalizeName(feature.properties.name);
      if (!name) continue;
      var geometry = feature.geometry;
      var polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
      var rings = [];
      for (var p = 0; p < polygons.length; p++) {
        for (var q = 0; q < polygons[p].length; q++) {
          var ring = polygons[p][q];
          if (ring && ring.length >= 3) rings.push(ring);
        }
      }
      if (rings.length) entries.push({ name: name, rings: rings });
    }

    /* 屏幕多边形按视角缓存：一次点击只算一次，连续点击（视角没动）直接复用 */
    var cacheKey = null;
    var cacheList = null;

    function prepare(view) {
      var key = [view.width, view.height, view.radius, view.centerLon, view.centerLat].join('|');
      if (key === cacheKey) return cacheList;
      var list = [];
      for (var i = 0; i < entries.length; i++) {
        var entry = entries[i];
        var rings = [];
        var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (var k = 0; k < entry.rings.length; k++) {
          var points = projectRing(entry.rings[k], view);
          if (points.length < 3) continue;
          rings.push(points);
          for (var v = 0; v < points.length; v++) {
            var x = points[v][0], y = points[v][1];
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
        if (rings.length) list.push({
          name: entry.name, rings: rings,
          minX: minX, minY: minY, maxX: maxX, maxY: maxY,
        });
      }
      cacheKey = key;
      cacheList = list;
      return list;
    }

    /* 点是否在某个环内（屏幕坐标，射线法） */
    function ringHits(ring, x, y) {
      var inside = false;
      for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        var a = ring[i], b = ring[j];
        if ((a[1] > y) !== (b[1] > y)
          && x < a[0] + (y - a[1]) / (b[1] - a[1]) * (b[0] - a[0])) {
          inside = !inside;
        }
      }
      return inside;
    }

    /* 与绘制一致：一个国家的所有环叠在一起按奇偶规则算。
     * ⚠️ 必须把所有环都数一遍 —— 踩过坑：写成"一旦命中就跳出"会让
     * 落到两个环里的点也算命中，而奇偶规则下这种点应当相互抵消。
     * 北极附近的群岛环本来就会互相重叠，球缘那一圈因此会差出几个像素。 */
    function containsPoint(entry, x, y) {
      if (x < entry.minX || x > entry.maxX || y < entry.minY || y > entry.maxY) return false;
      var inside = false;
      for (var k = 0; k < entry.rings.length; k++) {
        if (ringHits(entry.rings[k], x, y)) inside = !inside;
      }
      return inside;
    }

    /* 容差范围内最近的陆地。包围盒距离是真实距离的下界，可以安全地用它剪枝。 */
    function nearestLand(view, x, y, tolerance) {
      var list = prepare(view);
      var bestName = null;
      var bestD2 = tolerance * tolerance;
      for (var i = 0; i < list.length; i++) {
        var entry = list[i];
        var dx = x < entry.minX ? entry.minX - x : (x > entry.maxX ? x - entry.maxX : 0);
        var dy = y < entry.minY ? entry.minY - y : (y > entry.maxY ? y - entry.maxY : 0);
        if (dx * dx + dy * dy > bestD2) continue;
        for (var k = 0; k < entry.rings.length; k++) {
          var ring = entry.rings[k];
          for (var v = 0; v < ring.length; v++) {
            var a = ring[v], b = ring[(v + 1) % ring.length];
            var d2 = segmentDistance2(x, y, a[0], a[1], b[0], b[1]);
            if (d2 < bestD2) { bestD2 = d2; bestName = entry.name; }
          }
        }
      }
      if (!bestName) return null;
      return { name: bestName, distance: Math.sqrt(bestD2) };
    }

    /* 屏幕点 -> 国家。
     * view: { width, height, radius, centerLon, centerLat }（都是 CSS 像素，未经 dpr 放大）
     * 返回 { name, distance, exact } 或 null；
     * exact=true 表示手指正落在自己看到的陆地上，否则 distance 是离最近陆地的像素距离。*/
    function pick(view, x, y, tolerance) {
      if (!view || !(view.radius > 0) || !(view.width > 0)) return null;
      var list = prepare(view);
      // 反向遍历：与原实现"从后往前扫路径"一致，重叠处（110m 地图里小国会盖住邻居）
      // 取后出现的那个，实测更接近真实边界
      for (var i = list.length - 1; i >= 0; i--) {
        if (containsPoint(list[i], x, y)) {
          return { name: list[i].name, distance: 0, exact: true };
        }
      }
      if (!(tolerance > 0)) return null;
      var near = nearestLand(view, x, y, tolerance);
      return near ? { name: near.name, distance: near.distance, exact: false } : null;
    }

    return {
      pick: pick,
      nearestLand: nearestLand,
      containsPoint: containsPoint,
      prepare: prepare,
      entries: entries,
      count: entries.length,
    };
  }

  return {
    create: create,
    project: project,
    projectRing: projectRing,
    unproject: unproject,
    segmentDistance2: segmentDistance2,
    normalizeName: normalizeName,
    toleranceFor: function (pointerType) {
      if (pointerType === 'touch') return TOUCH_TOLERANCE;
      if (pointerType === 'pen') return PEN_TOLERANCE;
      return MOUSE_TOLERANCE;
    },
    TOUCH_TOLERANCE: TOUCH_TOLERANCE,
    PEN_TOLERANCE: PEN_TOLERANCE,
    MOUSE_TOLERANCE: MOUSE_TOLERANCE,
  };
});
