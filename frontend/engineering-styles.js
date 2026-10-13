// 工程探索页（含"小小建造场"子页）的**样式**。
//
// 每一条都是照着远古生命馆抄的。对应关系（数值直接取自 frontend/style.css 里
// .learning-lab / .lab-heading / .dino-* 那批规则，以及 exploration-modules.js 的
// injectSizeStyles()）：
//
//   .dino-hero             → .eng-hero        同高度 380 / 圆角 22 / 同一族投影
//   .dino-forest           → .eng-ambience    底部排开的模糊剪影
//   .dino-era-chip         → .eng-chip
//   .dino-model-host       → .eng-host
//   .dino-model-hint/reset → .eng-hint / .eng-reset
//   .dino-hero-caption     → .eng-caption
//   .dino-habitats         → （已删）图内切换胶囊 20260930 移除，换机器只靠名册卡片
//   .dino-layout           → .eng-layout      两栏
//   .dino-roster           → .eng-roster / .eng-tools / .eng-profile  （同一张白卡）
//   .dino-picks / .dino-pick → .eng-picks / .eng-pick
//   .dino-animal-logo      → .eng-mark        同一个米黄渐变圆牌
//   .dino-size 全家        → .eng-size 全家   「它有多大」卡片，数值逐条相同
//   .dino-read             → .eng-read
//
// 为什么不直接套 .dino-* 的类名：那批规则在压缩过的 style.css 里，读取工具每行
// 只给得到前 2000 字符，抄不全。与其引用一个我读不完的文件、赌某个类名长什么样，
// 不如把要用的值抄一份放在这里——这个页面的外观就只有一个来源。
//
// 共享框架类（.learning-lab / .lab-heading / .lab-back / .eyebrow）仍然复用。

const STYLE_ID = 'engineeringExploreStyles';

export function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
  .eng-wrap{display:flex;flex-direction:column}

  /* ── 整幅舞台（对应 .dino-hero）── */
  .eng-hero{height:380px;position:relative;overflow:hidden;border-radius:22px;background:radial-gradient(ellipse at 70% 47%,#a8bd8d,#5f7a52 58%,#3a5140);box-shadow:0 18px 38px #233a2d25;transition:background .25s ease}
  .eng-hero[data-scene="high"]{background:radial-gradient(ellipse at 70% 47%,#adb8a4,#667263 58%,#404c45)}
  .eng-hero[data-scene="ik"]{background:radial-gradient(ellipse at 70% 47%,#a9b7c1,#61707c 58%,#3b4a55)}
  /* 背景模糊 emoji 剪影按需求移除（20260930），保留纯色舞台 */
  .eng-ambience{display:none}
  .eng-chip{position:absolute;z-index:2;top:20px;left:22px;border:1px solid #ffffff50;border-radius:20px;padding:8px 12px;background:#333829b8;color:#f4f2dc;font-size:10px}
  .eng-host{position:absolute;inset:0;z-index:1}
  .eng-host canvas{display:block;width:100%;height:100%;cursor:grab;touch-action:none}
  .eng-host canvas:active{cursor:grabbing}
  .eng-hint,.eng-reset,.eng-refbtn{position:absolute;z-index:2;right:22px;border:1px solid #ffffff6e;border-radius:18px;background:#333829a8;color:#f2f3e0;padding:8px 11px;font-size:9px;backdrop-filter:blur(8px);font-family:inherit}
  .eng-hint{top:21px;pointer-events:none}
  .eng-reset{top:58px;cursor:pointer}
  .eng-refbtn{top:95px;cursor:pointer}
  .eng-reset:hover,.eng-refbtn:hover{background:#454a36}
  .eng-refbtn[aria-pressed="true"]{background:#f1d58e;border-color:#f1d58e;color:#425536;font-weight:800}
  .eng-caption{position:absolute;z-index:2;left:23px;bottom:64px;display:grid;gap:4px;color:#fff;max-width:58%}
  .eng-caption small{color:#e6ecd4;font-size:9px}
  .eng-caption b{font-size:21px}
  .eng-caption span{font-size:10px;color:#f0f2e0}
  .eng-legend{position:absolute;z-index:2;left:23px;bottom:19px;color:#eef1de;font-size:9px;line-height:1.6;text-shadow:0 1px 4px #26301f66}
  /* 图内切换胶囊已删（20260930）：换机器只靠名册卡片，舞台不再放第二套按钮 */
  .eng-loading{position:absolute;z-index:3;left:50%;top:48%;transform:translate(-50%,-50%);padding:10px 14px;border:1px solid #ffffff55;border-radius:18px;background:#333829c0;color:#f3f3df;font-size:10px;white-space:nowrap}
  .eng-loading[hidden]{display:none!important}
  .eng-loading.is-error{background:#71493ddd}

  /* ── 舞台下的两栏（对应 .dino-layout）──
     分工：左栏 = 挑机器 + 动手玩；右栏 = 读资料 + 量大小。
     这样两栏高度接近，不会一边长一边空。 */
  .eng-layout{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(292px,.7fr);gap:15px;align-items:start;margin-top:15px}
  .eng-col{display:grid;gap:15px;min-width:0}

  /* 三张卡共用同一套白卡外观（对应 .dino-roster） */
  .eng-roster,.eng-tools,.eng-profile{padding:18px;border:1px solid #e7ebe1;border-radius:17px;background:#fff}
  .eng-profile{padding:21px;border-color:#e8e9df;background:linear-gradient(155deg,#fff,#f7f8f0);box-shadow:0 9px 24px #41533f0b}

  /* 左栏：名册 */
  .eng-roster-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}
  .eng-roster-head h2{margin:6px 0 0;font-size:19px;color:#2f473e}
  .eng-roster-head p{max-width:460px;margin:7px 0 0;color:#85917f;font-size:10px;line-height:1.65}
  .eng-roster-head>span{flex:none;padding-top:5px;color:#9aa79b;font-size:10px;white-space:nowrap}
  .eng-picks{display:grid;grid-template-columns:repeat(auto-fill,minmax(154px,1fr));gap:9px;margin-top:14px}
  .eng-pick{position:relative;display:grid;justify-items:center;align-content:start;gap:2px;min-height:132px;padding:13px 9px;border:1px solid #e3eae0;border-radius:14px;background:#fbfdf9;color:#41543f;text-align:center;cursor:pointer;font-family:inherit;transition:transform .16s ease,border-color .16s ease,background .16s ease}
  .eng-pick:hover{transform:translateY(-2px);border-color:#c6d6c1}
  .eng-pick.active{background:#f3f8ee;border-color:#a9c19e;box-shadow:0 0 0 2px #a9c19e33}
  .eng-pick b{font-size:12px;font-weight:700}
  .eng-pick small{font-size:9px;color:#9aa79b;line-height:1.5}
  .eng-pick-size{color:#8b9a80!important}
  .eng-badge{position:absolute;top:7px;right:7px;padding:2px 5px;border-radius:5px;background:#e4efdd;color:#4d7a52;font-style:normal;font-size:8px}
  .eng-mark{display:grid;place-items:center;width:42px;height:42px;margin-bottom:4px;border-radius:50%;background:linear-gradient(145deg,#f8edcf,#e7d6ab);color:#66744e;font-size:21px;box-shadow:inset 0 0 0 1px #ffffffb8,0 2px 6px #55442818}

  /* 左栏：动手玩（工作三步 / 部件观察） */
  .eng-tools{display:flex;flex-direction:column}
  .eng-block{margin-top:0;padding-top:0}
  .eng-block+.eng-block{margin-top:16px;padding-top:15px;border-top:1px dashed rgba(120,100,70,.22)}
  .eng-block h3{margin:0 0 9px;font-size:15px;letter-spacing:.01em;color:#4a3c2c}
  .eng-block p{margin:9px 0 0;font-size:12px;line-height:1.85;color:#4b4032}
  .eng-chips{display:flex;flex-wrap:wrap;gap:6px}
  .eng-chips button{padding:5px 11px;border-radius:999px;border:1px solid rgba(120,100,70,.22);background:#fff;color:#5b4a33;font-size:12px;line-height:1.3;cursor:pointer;font-family:inherit}
  .eng-chips button:hover{border-color:rgba(120,100,70,.5)}
  .eng-chips button.active{background:#faeeda;border-color:rgba(133,79,11,.5);color:#633806;font-weight:700}

  /* 右栏：档案卡 */
  .eng-profile h2{margin:10px 0;font-size:22px;line-height:1.4;color:#30453b}
  .eng-lede{margin:0;font-size:12px;line-height:1.85;color:#697a70}
  .eng-facts{display:grid;gap:7px;margin:14px 0}
  .eng-facts div{display:grid;grid-template-columns:auto minmax(0,1fr);gap:9px;padding:9px 11px;border-radius:11px;background:#f2f6ec;font-size:11px;line-height:1.6;color:#5b6b58}
  .eng-facts b{color:#7d8f78;font-weight:700;white-space:nowrap}
  .eng-read{display:block;width:100%;margin-top:4px;padding:12px;border:0;border-radius:10px;background:#557c62;color:#fff;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit}
  .eng-read:hover{background:#476a54}
  .eng-credit{margin:16px 0 0;padding-top:14px;border-top:1px dashed rgba(120,100,70,.22);font-size:11px;line-height:1.75;color:#9c8a6d}
  .eng-credit a{color:#8b6a3a;text-underline-offset:2px}

  /* 「它有多大」卡 —— 数值与做法同远古生命馆的 .dino-size ── */
  .eng-size{margin-top:14px;padding:14px 16px 16px;border-radius:18px;background:rgba(255,255,255,.72);border:1px solid rgba(120,100,70,.18)}
  .eng-size h3{margin:0 0 10px;font-size:15px;letter-spacing:.01em;color:#4a3c2c}
  .eng-metrics{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:22px}
  .eng-metrics span{font-size:13px;color:#5b4a33;background:rgba(255,243,206,.95);border-radius:999px;padding:4px 10px}
  .eng-track{position:relative;height:12px;border-radius:999px;background:rgba(255,232,178,.75);margin:0 6px 6px 0}
  .eng-fill{position:absolute;left:0;top:0;bottom:0;border-radius:999px;background:linear-gradient(90deg,#8ed07a,#3f9d55)}
  .eng-tick{position:absolute;top:16px;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;line-height:1.35;white-space:nowrap}
  .eng-tick:before{content:'';position:absolute;top:-16px;width:1px;height:14px;background:rgba(120,100,70,.5)}
  .eng-tick b{font-size:11px;font-weight:600;color:#6b5a41}
  .eng-tick em{font-size:10px;font-style:normal;color:#9c8a6d}
  .eng-scale{margin:34px 0 0;font-size:11px;color:#9c8a6d}
  .eng-compare{margin:10px 0 0;font-size:13px;line-height:1.75;color:#4b4032}
  .eng-note{margin:8px 0 0;font-size:12px;line-height:1.7;color:#8b7a5f}

  /* ── 通往"小小建造场"的入口横幅 ──
     长得像一条链接：整行可点、末尾一个箭头。用的是首页那几条 banner 的样子
     （style.css 的 .globe-home-banner 一族），换成工地色。 */
  .eng-actions{display:flex;align-items:center;gap:15px;width:100%;margin-top:15px;padding:18px 21px;border:1px solid #e6dfc9;border-radius:17px;background:#f7f2e2;color:#4a3c2c;text-align:left;cursor:pointer;font-family:inherit}
  .eng-actions:hover{background:#f3ecd7;border-color:#ddd2b4}
  .eng-actions>span{font-size:34px;line-height:1}
  .eng-actions>div{display:grid;gap:3px;min-width:0}
  .eng-actions b{font-size:15px;color:#3f3225}
  .eng-actions small{font-size:11px;color:#8e8067;line-height:1.6}
  .eng-actions i{margin-left:auto;flex:none;font-style:normal;font-size:11px;font-weight:700;color:#8a6a35;white-space:nowrap}

  /* ── 小小建造场：它自己的页面 ── */
  .eng-yard-head{display:flex;justify-content:space-between;align-items:flex-end;gap:14px;flex-wrap:wrap}
  .eng-yard-stage{position:relative;width:100%;height:clamp(420px,62vh,720px);margin-top:15px;border-radius:18px;background:#1d1a17;overflow:hidden}
  .eng-yard-stage{height:auto!important;background:#e5ede4;border:1px solid #dce5d8;box-shadow:0 18px 40px #304c3420}
  .eng-yard-stage canvas{display:block;width:100%;height:clamp(420px,62vh,720px);cursor:grab}
  .eng-yard-stage canvas:active{cursor:grabbing}
  .yard-controls{position:relative;padding:16px 20px;background:#fffdf5;border-top:1px solid #dce5d8}
  .yard-stages{display:flex;flex-wrap:wrap;gap:6px;width:100%;padding-bottom:10px;border-bottom:1px solid #e4e9dd;margin-bottom:4px}
  .yard-controls button[aria-pressed="true"]{background:#36594d!important;color:#fff8df!important;border-color:#36594d!important}
  .yard-controls button:focus-visible{outline:3px solid #e9ad47;outline-offset:2px}
  @media(max-width:650px){.eng-yard-stage canvas{height:400px}.yard-controls{padding:12px;gap:6px!important}.yard-controls button{min-height:36px}}
  .eng-yard-msg{position:absolute;inset:0;display:grid;place-items:center;padding:26px;text-align:center;color:#ddd6c8;font-size:12px;line-height:1.8}
  .eng-yard-foot{margin:12px 0 0;font-size:11px;line-height:1.75;color:#8b7a5f}

  @media(max-width:1000px){
    .eng-layout{grid-template-columns:1fr}
    /* 舞台钉在屏幕上方（20260930 用户反馈：往下滚去按「认部件/怎么干活」的按钮
       就看不到画布了）。sticky 只在 .eng-main 里生效，滚过两栏自然松开。 */
    .eng-hero{position:sticky;top:0;z-index:6}
    /* 窄屏先看到动手玩的按钮，再看到名册 */
    .eng-tools{order:-1}
  }
  @media(max-width:650px){
    .eng-hero{height:300px;border-radius:16px}
    .eng-chip{top:12px;left:12px;font-size:8px}
    .eng-hint,.eng-reset,.eng-refbtn{right:12px;padding:7px 9px;font-size:8px}
    .eng-hint{top:12px}.eng-reset{top:45px}.eng-refbtn{top:78px}
    .eng-caption{left:14px;bottom:62px;max-width:66%}
    .eng-caption b{font-size:17px}
    .eng-caption span{font-size:9px}
    .eng-legend{left:14px;bottom:16px;font-size:8px}
    .eng-layout{gap:10px;margin-top:10px}
    .eng-col{gap:10px}
    .eng-roster,.eng-tools{padding:14px}
    .eng-picks{grid-template-columns:repeat(auto-fill,minmax(128px,1fr));gap:7px}
    .eng-pick{min-height:118px;padding:10px 7px}
    .eng-pick b{font-size:11px}
    .eng-profile{padding:16px}
    .eng-profile h2{font-size:19px}
    .eng-actions{gap:11px;padding:14px}
    .eng-actions>span{font-size:27px}
    .eng-actions b{font-size:12px}
    .eng-actions small{font-size:9px}
    .eng-actions i{font-size:9px}
    .eng-yard-stage{height:clamp(340px,56vh,520px);border-radius:14px}
  }
  /* 机械馆：选车在上，操作紧挨展台，档案与动作并排。 */
  .eng-main{display:grid;grid-template-columns:minmax(0,1.65fr) minmax(285px,1fr);gap:18px;margin-top:18px;align-items:start}
  .eng-stage-col{display:grid;gap:15px;min-width:0}
  .eng-main .eng-hero{scroll-margin-top:12px}
  .eng-main .eng-hero{height:360px;position:relative;top:auto;z-index:1;background:radial-gradient(ellipse at 60% 40%,#f2efe1,#d3ded0 68%,#b9cbbd);box-shadow:0 12px 32px #233a2d14}
  .eng-main .eng-hero[data-scene="high"],.eng-main .eng-hero[data-scene="ik"]{background:radial-gradient(ellipse at 60% 40%,#f1efdf,#d4dfd1 68%,#bccdc1)}
  .eng-chip{background:#36574ddd;border:0;color:#fff6d9;font-size:11px}
  .eng-hint,.eng-reset,.eng-refbtn{background:#ffffffd9;color:#36574d;border-color:#ccd8c9;font-size:10px}
  .eng-caption{color:#304e41;bottom:46px;pointer-events:none;max-width:62%}
  .eng-caption small,.eng-caption span{color:#536e5f}
  .eng-legend{color:#536e5f;text-shadow:none;font-size:10px;bottom:15px;right:15px}
  .eng-caption b{font-size:23px}
  .eng-picks{display:flex;overflow-x:auto;gap:9px;scroll-snap-type:x proximity;padding:4px 2px 10px;margin-top:10px}
  .eng-pick{flex:0 0 128px;min-height:120px;scroll-snap-align:start;gap:4px;padding:9px 8px}
  .eng-pick[hidden]{display:none!important}
  .eng-pick[aria-pressed="true"]{background:#eaf2e5;border-color:#6b9871;box-shadow:0 0 0 2px #6b987125}
  .eng-pick small{font-size:10px}
  .eng-pick-size{display:none}
  .eng-machine-thumb{width:124px;height:78px;display:block;pointer-events:none}
  .eng-mark{height:64px;width:64px;margin:7px 0}
  .eng-roster-head p{font-size:12px;max-width:none}
  .eng-filters,.eng-demo-actions{display:flex;flex-wrap:wrap;gap:7px;margin-top:13px}
  .eng-filters button,.eng-demo-actions button{font-family:inherit;font-size:12px;line-height:1.4;cursor:pointer;border:1px solid #dae3d3;border-radius:9px;background:#f9fbf5;padding:8px 12px;color:#45614c}
  .eng-filters button[aria-pressed="true"]{background:#36574d;color:#fff8dd;border-color:#36574d}
  .eng-demo-actions{margin:0 0 18px}
  .eng-demo-actions button:first-child{background:#d9aa3b;border-color:#d9aa3b;color:#342b16;font-weight:700}
  .eng-demo-actions button:disabled{opacity:.5;cursor:default}
  .eng-filters button:focus-visible,.eng-pick:focus-visible,.eng-demo-actions button:focus-visible{outline:3px solid #dda841;outline-offset:2px}
  .eng-main .eng-profile h2{font-size:24px}
  .eng-lede,.eng-facts div{font-size:13px}
  .eng-roster{background:#fffdf6}
  .eng-chips button{min-height:36px}
  @media(max-width:900px){.eng-main{grid-template-columns:1fr}.eng-main .eng-hero{height:360px;top:auto}.eng-profile{margin-top:0}.eng-pick{flex-basis:126px}}
  @media(max-width:650px){.eng-main .eng-hero{height:300px}.eng-caption b{font-size:20px}.eng-caption{bottom:52px;left:15px}.eng-legend{font-size:9px;left:15px;line-height:1.5}.eng-filters{gap:5px}.eng-filters button{font-size:11px;padding:7px 9px}.eng-main{gap:12px}}
  `;
  const backdrops = document.querySelector('link[href*="scene-backdrops.css"]');
  if (backdrops) backdrops.before(style);
  else document.head.append(style);
}
