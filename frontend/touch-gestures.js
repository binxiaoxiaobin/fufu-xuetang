/* 触摸手势增强层（平板 / 手机）
 *
 * 背景：站内所有三维画布都是各模块自己写的控制器 ——
 *   pointerdown / move / up 负责旋转，wheel 负责缩放。
 *   可平板没有滚轮，所以"双指捏合缩放"一直没人实现，
 *   表现为用户反馈的：地球仪点不到国家、双手没法放大缩小。
 *
 * 做法：不入侵任何模块。在 document 的捕获阶段接管双指手势，
 *   把两指的间距变化换算成 wheel 事件，原样派发回同一个元素。
 *   各模块本来就用 wheel 缩放，于是零改动就获得了捏合缩放。
 *
 * 两个关键细节：
 *   1) 第二根手指按下时，第一根手指已经在模块里登记成"正在拖动"了。
 *      这里派发一个合成的 pointercancel —— 所有模块的 pointercancel
 *      都只做清理（drag = null），不会误触发"点击选中"。
 *   2) 合成事件会走捕获阶段、被本文件自己的监听器收到，所以打了
 *      __fufuSynthetic 标记把自己摘出去。
 */
(function () {
  'use strict';

  // 这些画布有自己的操作逻辑，双指手势不接管
  var SKIP = '#gameCanvas, #mazeCanvas';
  // 捏合灵敏度：比值变化超过这个幅度才派发一次 wheel
  var STEP = 0.012;
  // 每一次 wheel 的强度，对应各模块 wheel 分支里的缩放步长
  var WHEEL_DELTA = 110;

  // 各个三维舞台的容器。舞台上方都压着浮层（标题条、提示语、图例），
  // 两根手指极少能同时落在"裸露的画布"上 —— 只要有一根落在浮层上，
  // 以前就会判定"这里不归我管"直接放弃。所以落在舞台范围内就先找到它的画布。
  var STAGES = [
    '.globe-stage',
    '#dinoModelHost',
    '#engineeringCanvasHost',
    '#solarCanvasHost',
    '#moonCanvasHost',
    '#lunarCanvasHost',
    '#landmarkCanvasHost',
    '#pet3dHost',
  ].join(', ');
  // 真正要点击的控件别抢
  var CONTROLS = 'button, a, input, select, textarea, label, [role="button"]';

  var active = null; // { el, ids: [], pts: {}, startDist, lastScale, engaged }

  function canvasOf(node) {
    if (!node || node.nodeType !== 1) return null;
    if (!node.closest) return null;
    if (node.closest(SKIP)) return null;
    // 落在按钮 / 输入框上：那是想点，不是想捏
    if (node.closest(CONTROLS)) return null;
    if (node.tagName === 'CANVAS') return node;
    // 地标实景照片查看器不是 canvas，但同样用 wheel 缩放
    var viewer = node.closest('.real-tour-viewer');
    if (viewer) return viewer;
    var stage = node.closest(STAGES);
    if (!stage) return null;
    return stage.tagName === 'CANVAS' ? stage : stage.querySelector('canvas');
  }

  function gap(a, b) {
    var dx = a.x - b.x;
    var dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function livePoints(gesture) {
    var out = [];
    for (var i = 0; i < gesture.ids.length; i++) {
      var point = gesture.pts[gesture.ids[i]];
      if (point) out.push(point);
    }
    return out;
  }

  function spin(el, deltaY) {
    var event;
    try {
      event = new WheelEvent('wheel', {
        deltaY: deltaY, deltaMode: 0, bubbles: true, cancelable: true,
      });
    } catch (error) {
      try {
        event = document.createEvent('MouseEvents');
        event.initEvent('wheel', true, true);
        event.deltaY = deltaY;
      } catch (legacyError) {
        return;
      }
    }
    try { el.dispatchEvent(event); } catch (error) {}
  }

  // 告诉模块"这次拖动作废"——各模块的 pointercancel 分支都只清理状态
  function cancelDrag(el, pointerId) {
    var event;
    try {
      event = new PointerEvent('pointercancel', {
        pointerId: pointerId, bubbles: true, cancelable: false, isPrimary: true,
      });
      event.__fufuSynthetic = true;
      el.dispatchEvent(event);
    } catch (error) {
      // 没有 PointerEvent 构造器时不派发，模块下次按下会自然重置
    }
  }

  function reset() { active = null; }

  document.addEventListener('pointerdown', function (event) {
    if (event.__fufuSynthetic) return;
    var el = canvasOf(event.target);
    if (!el) { reset(); return; }
    if (active && active.el !== el) reset();
    if (!active) {
      active = { el: el, ids: [], pts: {}, startDist: 0, lastScale: 1, engaged: false };
    }
    if (active.ids.indexOf(event.pointerId) >= 0) return;
    active.ids.push(event.pointerId);
    active.pts[event.pointerId] = { x: event.clientX, y: event.clientY };
    if (active.ids.length < 2) return;

    var pair = livePoints(active);
    if (pair.length < 2) return;
    active.startDist = Math.max(1, gap(pair[0], pair[1]));
    active.lastScale = 1;
    if (!active.engaged) {
      active.engaged = true;
      cancelDrag(el, active.ids[0]);
    }
    event.stopPropagation();
    if (event.cancelable) event.preventDefault();
  }, true);

  document.addEventListener('pointermove', function (event) {
    if (!active || event.__fufuSynthetic) return;
    if (!Object.prototype.hasOwnProperty.call(active.pts, event.pointerId)) return;
    active.pts[event.pointerId] = { x: event.clientX, y: event.clientY };
    if (!active.engaged) return;
    var pair = livePoints(active);
    if (pair.length < 2) return;
    event.stopPropagation();
    var scale = gap(pair[0], pair[1]) / active.startDist;
    if (!isFinite(scale) || scale <= 0) return;
    if (Math.abs(scale / active.lastScale - 1) < STEP) return;
    active.lastScale = scale;
    // 两指张开 = 放大；各模块都是 deltaY > 0 时拉远，所以方向相反
    spin(active.el, scale > 1 ? -WHEEL_DELTA : WHEEL_DELTA);
  }, { capture: true, passive: false });

  ['pointerup', 'pointercancel'].forEach(function (type) {
    document.addEventListener(type, function (event) {
      if (!active || event.__fufuSynthetic) return;
      if (!Object.prototype.hasOwnProperty.call(active.pts, event.pointerId)) return;
      delete active.pts[event.pointerId];
      active.ids = active.ids.filter(function (id) { return id !== event.pointerId; });
      if (active.engaged) {
        event.stopPropagation();
        if (!active.ids.length) { reset(); return; }
        // 还剩一根手指：捏合结束，等它重新按下再旋转，避免残留拖动量导致的跳动
        active.engaged = false;
        active.startDist = 0;
        active.lastScale = 1;
        return;
      }
      if (!active.ids.length) reset();
    }, true);
  });
})();
