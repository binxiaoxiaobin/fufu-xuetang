// A cancelled touch or a two-finger gesture must never become a scene tap.
export class PointerGesture {
  constructor() { this.points = new Map(); this.start = null; this.dragged = false; this.pinch = 0; }
  down(event) {
    this.points.set(event.pointerId, {x:event.clientX, y:event.clientY});
    if (this.points.size === 1) {
      this.start = {x:event.clientX, y:event.clientY, threshold:event.pointerType === 'touch' ? 14 : 6};
      this.dragged = false;
    } else {
      this.dragged = true;
      const [a,b] = this.points.values(); this.pinch = Math.hypot(a.x-b.x,a.y-b.y);
    }
  }
  move(event) {
    const point = this.points.get(event.pointerId);
    if (!point) return null;
    const dx=event.clientX-point.x, dy=event.clientY-point.y;
    point.x=event.clientX; point.y=event.clientY;
    if (this.points.size === 1) {
      if (Math.hypot(point.x-this.start.x,point.y-this.start.y)>this.start.threshold) this.dragged=true;
      return this.dragged ? {orbit:{dx,dy}} : {};
    }
    const [a,b]=this.points.values(), distance=Math.hypot(a.x-b.x,a.y-b.y);
    const zoom=this.pinch>0 && distance>0 ? this.pinch/distance : null;
    this.pinch=distance;
    return {zoom};
  }
  end(event, cancelled=false) {
    if (!this.points.has(event.pointerId)) return false;
    if (cancelled) this.dragged=true;
    // Some browsers coalesce a quick move into pointerup without pointermove.
    if (this.start && Math.hypot(event.clientX-this.start.x,event.clientY-this.start.y)>this.start.threshold) this.dragged=true;
    this.points.delete(event.pointerId);
    const tap=this.points.size===0 && this.start && !this.dragged;
    if (this.points.size===0) {this.start=null;this.pinch=0;}
    return Boolean(tap);
  }
}
