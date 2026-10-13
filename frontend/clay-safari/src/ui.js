import { TITLE, CLAY_TITLE_COLORS, ITEMS, ANIMAL_IDS } from './data.js?v=20260930-clay-world-1';

const $ = (id) => document.getElementById(id);

export function puffyTitle(el, text, colors = CLAY_TITLE_COLORS) {
  el.innerHTML = '';
  [...text].forEach((ch, i) => {
    const s = document.createElement('span');
    s.textContent = ch;
    s.style.color = ch === '《' || ch === '》' ? '#8c6b4b' : colors[i % colors.length];
    s.style.animationDelay = `${-(i * 0.17)}s`;
    el.appendChild(s);
  });
}

export class UI {
  constructor(unlockedAnimalIds = new Set(ANIMAL_IDS), unlockedIds = unlockedAnimalIds) {
    puffyTitle($('title'), TITLE);
    puffyTitle($('titlechip'), TITLE);
    puffyTitle($('celebrate-title'), '探险完成！');
    this.found = new Set();
    this.unlockedAnimalIds = new Set(unlockedAnimalIds);
    this.unlockedIds = new Set(unlockedIds);
    $('bookcount').textContent = `0/${this.unlockedAnimalIds.size}`;
    this.stickers = {};
    const st = $('stickers');
    for (const id of ANIMAL_IDS.filter(id => this.unlockedAnimalIds.has(id))) {
      const it = ITEMS.find(i => i.id === id);
      if (!it) continue;
      const d = document.createElement('div');
      d.className = 'sticker'; d.textContent = it.emoji; d.title = `${it.cn} ${it.en}`;
      st.appendChild(d); this.stickers[id] = d;
    }
    this.card = $('card');
    this.toastT = null;
    $('help-close').onclick = () => { $('help').hidden = true; };
    $('btn-help').onclick = () => this.showGuide();
    $('guide-close').onclick = () => { $('guide').hidden = true; };
    $('guide').addEventListener('click', (event) => { if (event.target === $('guide')) $('guide').hidden = true; });
    $('guide-help').onclick = () => { $('guide').hidden = true; $('help').hidden = false; };
    this.renderGuide();
    $('celebrate-close').onclick = () => { $('celebrate').hidden = true; };
    this.isTouch = matchMedia('(pointer: coarse)').matches;
    if (this.isTouch) $('joy').hidden = false;
  }
  progress(p, text) { $('barfill').style.width = `${Math.round(p * 100)}%`; if (text) $('bartext').textContent = text; }
  ready(onStart) {
    const b = $('start');
    b.disabled = false; $('bartext').textContent = '黏土捏好啦！';
    b.onclick = () => { $('loader').style.transition = 'opacity .6s'; $('loader').style.opacity = '0'; setTimeout(() => { $('loader').hidden = true; }, 600); $('hud').hidden = false; onStart(); };
  }
  showCard(item, handlers) {
    $('card-cn').textContent = item.cn; $('card-py').textContent = item.py; $('card-en').textContent = item.en;
    this.card.hidden = false;
    this.card.style.animation = 'none'; void this.card.offsetWidth; this.card.style.animation = '';
    $('say-en').onclick = handlers.en; $('say-cn').onclick = handlers.cn; $('say-sound').onclick = handlers.sound;
    clearTimeout(this.cardT);
    // 英文 + 叫声 + 中文要连着念完，卡片要留够时间
    this.cardT = setTimeout(() => { this.card.hidden = true; }, 13000);
  }
  hideCard() { this.card.hidden = true; clearTimeout(this.cardT); }
  setSpeaking(which) { for (const id of ['say-en', 'say-cn', 'say-sound']) $(id).classList.toggle('speaking', id === which); }
  // 兑换新动物后：手册里补一张贴纸，并刷新进度
  addSticker(id) {
    if (this.stickers[id] || !this.unlockedAnimalIds.has(id)) return;
    const it = ITEMS.find(i => i.id === id);
    if (!it) return;
    const d = document.createElement('div');
    d.className = 'sticker'; d.textContent = it.emoji; d.title = `${it.cn} ${it.en}`;
    d.classList.add('pop');
    $('stickers').appendChild(d);
    this.stickers[id] = d;
    setTimeout(() => d.classList.remove('pop'), 700);
    $('bookcount').textContent = `${this.found.size}/${this.unlockedAnimalIds.size}`;
  }
  addUnlockedItem(id) {
    if (this.unlockedIds.has(id)) return;
    this.unlockedIds.add(id);
    this.renderGuide();
  }
  renderGuide() {
    const root = $('guide-items');
    root.replaceChildren();
    const items = ITEMS.filter(item => this.unlockedIds.has(item.id));
    $('guide-count').textContent = `已解锁 ${items.length} 项`;
    if (!items.length) {
      const empty = document.createElement('div');
      empty.className = 'guide-empty';
      empty.textContent = '还没有解锁内容，去积分商店请新朋友来吧。';
      root.appendChild(empty);
      return;
    }
    const kinds = { animal: '动物伙伴', prop: '探险物品', scene: '地图场景' };
    for (const item of items) {
      const card = document.createElement('article');
      card.className = 'guide-item';
      const emoji = document.createElement('span'); emoji.className = 'guide-item-emoji'; emoji.textContent = item.emoji;
      const name = document.createElement('strong'); name.className = 'guide-item-name'; name.textContent = item.cn;
      const kind = document.createElement('span'); kind.className = 'guide-item-kind'; kind.textContent = kinds[item.kind] || '探险发现';
      card.append(emoji, name, kind);
      root.appendChild(card);
    }
  }
  showGuide() { this.renderGuide(); $('guide').hidden = false; }
  markFound(id) {
    if (this.found.has(id)) return false;
    this.found.add(id);
    const s = this.stickers[id]; if (s) { s.classList.add('found', 'pop'); setTimeout(() => s.classList.remove('pop'), 700); }
    $('bookcount').textContent = `${this.found.size}/${this.unlockedAnimalIds.size}`;
    return true;
  }
  allFound() { return this.unlockedAnimalIds.size > 0 && this.found.size >= this.unlockedAnimalIds.size; }
  celebrate() { $('celebrate').hidden = false; }
  toast(text, ms = 2600) {
    const t = $('toast'); t.textContent = text; t.hidden = false;
    clearTimeout(this.toastT); this.toastT = setTimeout(() => { t.hidden = true; }, ms);
  }
  setTour(on) { $('btn-tour').classList.toggle('on', on); $('tourbanner').hidden = !on; }
  setOverview(on) { $('btn-view').classList.toggle('on', on); }
  setLabels(on) { $('btn-labels').classList.toggle('on', !on); $('btn-labels').style.opacity = on ? '' : '.75'; }
  setSound(on) { $('btn-sound').textContent = on ? '🔊' : '🔇'; $('btn-sound').classList.toggle('on', !on); }
  // virtual joystick: returns a Vector2-like {x, y} in [-1,1]
  bindJoystick(onMove) {
    const joy = $('joy'), knob = $('joyknob');
    let active = false, cx = 0, cy = 0, pid = null;
    const R = 40;
    const set = (dx, dy) => { const l = Math.hypot(dx, dy) || 1, k = Math.min(1, l / R); const nx = dx / l * k, ny = dy / l * k; knob.style.transform = `translate(${nx * R}px, ${ny * R}px)`; onMove(nx, ny); };
    joy.addEventListener('pointerdown', (e) => { active = true; pid = e.pointerId; const r = joy.getBoundingClientRect(); cx = r.left + r.width / 2; cy = r.top + r.height / 2; set(e.clientX - cx, e.clientY - cy); joy.setPointerCapture(pid); e.stopPropagation(); });
    joy.addEventListener('pointermove', (e) => { if (!active || e.pointerId !== pid) return; set(e.clientX - cx, e.clientY - cy); e.stopPropagation(); });
    const end = () => { if (!active) return; active = false; knob.style.transform = ''; onMove(0, 0); };
    joy.addEventListener('pointerup', end); joy.addEventListener('pointercancel', end);
  }
}
