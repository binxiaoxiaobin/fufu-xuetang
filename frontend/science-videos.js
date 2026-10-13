/* Original whiteboard science lessons. */
(() => {
  'use strict';
  const lessons = {
  "cloud-rain": {
    "title": "云为什么会变成雨？",
    "description": "从看不见的水蒸气，追踪一滴雨的旅行。",
    "videoUrl": "/assets/content/science-cloud-rain.mp4",
    "posterUrl": "/assets/learning/science/cloud-rain-card-v2.webp"
  },
  "seasons": {
    "title": "一年为什么有四季？",
    "description": "地球倾斜着绕太阳转，阳光的照射随季节变化。",
    "videoUrl": "/assets/content/science-seasons.mp4",
    "posterUrl": "/assets/learning/science/seasons-card-v2.webp"
  },
  "sound": {
    "title": "声音是怎样传到耳朵里的？",
    "description": "从一次振动开始，看空气如何接力传递声音。",
    "videoUrl": "/assets/content/science-sound.mp4",
    "posterUrl": "/assets/learning/science/sound-card-v2.webp"
  },
  "magnets": {
    "title": "磁铁为什么有时吸、有时推？",
    "description": "认识磁铁的两极，比较吸引与排斥。",
    "videoUrl": "/assets/content/science-magnets.mp4",
    "posterUrl": "/assets/learning/science/magnets-card-v2.webp"
  },
  "static-electricity": {
    "title": "气球为什么能粘在墙上？",
    "description": "摩擦后的气球，藏着看不见的电荷变化。",
    "videoUrl": "/assets/content/science-static-electricity.mp4",
    "posterUrl": "/assets/learning/science/static-electricity-card-v2.webp"
  },
  "shadows": {
    "title": "影子为什么会变大变小？",
    "description": "改变光源、物体和屏幕的位置，观察影子的变化。",
    "videoUrl": "/assets/content/science-shadows.mp4",
    "posterUrl": "/assets/learning/science/shadows-card-v2.webp"
  },
  "soap-bubbles": {
    "title": "泡泡为什么总是圆圆的？",
    "description": "一层薄薄的水膜，为什么喜欢围成球形？",
    "videoUrl": "/assets/content/science-soap-bubbles.mp4",
    "posterUrl": "/assets/learning/science/soap-bubbles-card-v2.webp"
  },
  "seed-sprout": {
    "title": "一颗种子怎样变成小苗？",
    "description": "水、空气和温度，怎样唤醒种子里的小生命？",
    "videoUrl": "/assets/content/science-seed-sprout.mp4",
    "posterUrl": "/assets/learning/science/seed-sprout-card-v2.webp"
  },
  "sky-blue": {
    "title": "为什么天空是蓝色的？",
    "description": "白光穿过空气，蓝色光为什么更容易散开？",
    "videoUrl": "/assets/content/science-sky-blue.mp4",
    "posterUrl": "/assets/learning/science/sky-blue-card-v2.webp"
  },
  "moon-phases": {
    "title": "月亮为什么会变样子？",
    "description": "月亮没有变形，变化的是我们看见的亮面。",
    "videoUrl": "/assets/content/science-moon-phases.mp4",
    "posterUrl": "/assets/learning/science/moon-phases-card-v2.webp"
  },
  "rainbow": {
    "title": "彩虹是怎样出现的？",
    "description": "阳光经过雨滴，折射和反射让颜色排成弧线。",
    "videoUrl": "/assets/content/science-rainbow.mp4",
    "posterUrl": "/assets/learning/science/rainbow-card-v2.webp"
  },
  "thunder": {
    "title": "闪电之后为什么会有雷声？",
    "description": "闪电把空气迅速加热，膨胀的空气发出声响。",
    "videoUrl": "/assets/content/science-thunder.mp4",
    "posterUrl": "/assets/learning/science/thunder-card-v2.webp"
  },
  "ice-floats": {
    "title": "冰为什么会浮在水面？",
    "description": "水结成冰后结构更疏，密度变小，于是浮起来。",
    "videoUrl": "/assets/content/science-ice-floats.mp4",
    "posterUrl": "/assets/learning/science/ice-floats-card-v2.webp"
  },
  "plant-light": {
    "title": "植物为什么会朝光生长？",
    "description": "嫩茎两侧生长速度不同，会让茎弯向光源。",
    "videoUrl": "/assets/content/science-plant-light.mp4",
    "posterUrl": "/assets/learning/science/plant-light-card-v2.webp"
  }
};
  function get(slug, title) { return lessons[slug] || Object.values(lessons).find(item => item.title === title) || null; }
  function markup(lesson) {
    if (!lesson || !lesson.videoUrl) return '';
    const esc = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    return `<section class="science-video science-video-film" data-science-video><div class="science-video-heading"><span>✎ 白板手绘小课堂</span><small>原创分镜 · 配音讲解</small></div><video class="science-video-player" controls playsinline preload="metadata"${lesson.posterUrl ? ` poster="${esc(lesson.posterUrl)}"` : ''} aria-label="${esc(lesson.title)}"><source src="${esc(lesson.videoUrl)}" type="video/mp4">当前浏览器暂不支持视频播放。</video></section>`;
  }
  function mount(root) {
    const film = root.querySelector('[data-science-video] video');
    return film ? () => film.pause() : () => {};
  }
  window.FufuScienceVideos = { get, markup, mount };
})();
