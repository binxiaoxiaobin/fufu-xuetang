// All timestamps come from the authenticated farm API; no browser clock starts a crop.
export function paddyStage(paddy, now) {
  if (paddy.plantedAt === null) return 0;
  if (paddy.readyAt === null) return 1;
  const progress = paddyProgress(paddy,now);
  return progress < .1 ? 2 : progress < 1/3 ? 3 : progress < 2/3 ? 4 : progress < 1 ? 5 : 6;
}
export function paddyProgress(paddy,now){
  if(paddy.plantedAt===null)return 0;
  const start=paddy.growthStartedAt??paddy.wateredAt??paddy.plantedAt;
  const duration=paddy.baseDurationMs??(paddy.readyAt-start);
  return Math.max(0,Math.min(1,(now-start+(paddy.boostMs||0))/duration));
}
export function beijingDay(now){return new Date(now+8*3600000).toISOString().slice(0,10);}
export const PADDY_STAGES = ['等待播种','已播种 · 等待浇水','嫩绿稻苗','青绿新叶','深绿稻株','稻穗渐黄','金黄稻谷 · 可以收获'];
