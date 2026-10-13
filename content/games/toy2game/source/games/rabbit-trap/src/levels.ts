import type { FeatureTile } from "./world";

export type RabbitLevel = {
  id: number;
  title: string;
  description: string;
  tip: string;
  start: number;
  shield: boolean;
  weather: boolean;
  holes: number;
  features: FeatureTile[];
};

// The original match remains available so existing saves keep their exact board.
export const CLASSIC: RabbitLevel = {
  id: 0, title: "自由花园", description: "原版完整路线，机关随机分布。",
  tip: "带领一只小兔登上山顶；也可以从选关开始新的冒险。",
  start: -1, shield: false, weather: true, holes: 3, features: [],
};
let levels: RabbitLevel[] = [];
export function installLevels(value: unknown[]) {
  if (value.length !== 6 || !value.every((item, index) => {
    const level = item as RabbitLevel;
    return level?.id === index + 1 && typeof level.title === "string" &&
      typeof level.description === "string" && typeof level.tip === "string" &&
      Number.isInteger(level.start) && level.start >= -1 && level.start < 28 &&
      Number.isInteger(level.holes) && level.holes >= 0 && level.holes <= 3 &&
      typeof level.shield === "boolean" && typeof level.weather === "boolean" &&
      Array.isArray(level.features) && level.features.every(tile =>
        Number.isInteger(tile.index) && tile.index > level.start && tile.index < 55 &&
        ["spring", "wind", "slide", "shield"].includes(tile.kind));
  })) throw new Error("小兔关卡数据不完整，请重新加载游戏");
  levels = value as RabbitLevel[];
}
export function rabbitLevels() { return levels; }
export function levelFor(id?: number) {
  return levels.find(level => level.id === id) ?? CLASSIC;
}
export function normalizeCompleted(value: unknown): number[] {
  return Array.isArray(value) ? [...new Set(value.filter(id =>
    Number.isInteger(id) && id >= 1 && id <= 6))].sort((a, b) => a - b) : [];
}
export function completedAfterWin(completed: number[], level: number | undefined,
  winner: string | undefined, reason: string | undefined, players: { bot: boolean }[]) {
  const id = Number(winner);
  return level && reason === "summit" && winner !== undefined && players[id] && !players[id].bot
    ? normalizeCompleted([...completed, level]) : completed;
}
