import { beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { Client } from "boardgame.io/client";
import { RabbitGame, resolveLanding, chooseToken, type RabbitState } from "../src/game";
import { installLevels, rabbitLevels, levelFor, completedAfterWin, normalizeCompleted } from "../src/levels";
import { FINISH, TRAPS } from "../src/world";

beforeAll(() => installLevels(JSON.parse(readFileSync(new URL("../../../../rabbit-levels.json", import.meta.url), "utf8"))));
const create = (id: number) => {
  const client = Client<RabbitState>({game: {...RabbitGame, seed: "levels"}, numPlayers: 3, debug: false});
  client.moves.configureLevel(id);
  return client;
};
describe("Fufu rabbit chapters", () => {
  it("uses progressively longer routes and reproducible boards", () => {
    expect(rabbitLevels().map(level => FINISH - level.start)).toEqual([28,32,36,40,48,56]);
    for (const level of rabbitLevels()) {
      const G = create(level.id).getState()!.G;
      expect(G.tokens.every(token => token.position === level.start && token.shield === level.shield)).toBe(true);
      expect(G.features).toEqual(level.features);
      expect(G.weather.enabled).toBe(level.weather);
      expect(G.features.every(tile => !TRAPS.includes(tile.index))).toBe(true);
      expect(create(level.id).getState()!.G).toEqual(G);
    }
  });
  it("keeps the chapter's pit limit after every mechanism rotation", () => {
    for (const level of rabbitLevels()) {
      const client = create(level.id);
      for (let turn = 0; turn < 8; turn++) {
        const state = structuredClone(client.store.getState());
        state.G.stage = "rotate"; state.G.card = "carrot";
        client.store.dispatch({type: "RESET", state, clientOnly: true});
        client.moves.rotate();
        expect(client.getState()!.G.holes.length).toBeLessThanOrEqual(level.holes);
      }
    }
  });
  it("cannot slide or blow a rabbit behind the chapter's starting point", () => {
    const G = structuredClone(create(4).getState()!.G);
    G.features = [{index: 16, kind: "wind"}];
    expect(resolveLanding(G, {...G.tokens[0], shield: false}, 16).position).toBe(15);
    G.features = [{index: 17, kind: "slide"}];
    expect(resolveLanding(G, {...G.tokens[0], shield: false}, 17).position).toBe(16);
  });
  it("restores the exact chapter state without applying setup twice", () => {
    const client = create(3), state = structuredClone(client.store.getState());
    state.G.tokens[0].position = 30; state.G.tokens[0].shield = false;
    const restored = create(1);
    restored.store.dispatch({type: "RESET", state, clientOnly: true});
    expect(restored.getState()!.G).toEqual(state.G);
    const error = console.error; console.error = () => {};
    try { restored.moves.configureLevel(6); expect(restored.getState()!.G.levelId).toBe(3); }
    finally { console.error = error; }
  });
  it("leaves classic saves and rules compatible", () => {
    expect(levelFor(undefined).id).toBe(0);
    const client = Client<RabbitState>({game: RabbitGame, numPlayers: 3, debug: false});
    expect(client.getState()!.G.tokens.every(token => token.position === -1)).toBe(true);
    expect(client.getState()!.G.levelId).toBeUndefined();
  });
  it("records a human summit win once, never a bot win or survival", () => {
    const players = [{bot:false},{bot:true},{bot:true}];
    expect(completedAfterWin([1],2,"0","summit",players)).toEqual([1,2]);
    expect(completedAfterWin([1,2],2,"0","summit",players)).toEqual([1,2]);
    expect(completedAfterWin([],2,"1","summit",players)).toEqual([]);
    expect(completedAfterWin([],2,"0","survivor",players)).toEqual([]);
    expect(normalizeCompleted([1,1,7,-1,"2",3.5,null,6])).toEqual([1,6]);
  });
  it("can finish every chapter through legal draws, moves and rotations", () => {
    for (const level of rabbitLevels()) {
      const client = create(level.id);
      for (let step = 0; step < 3000 && !client.getState()!.ctx.gameover; step++) {
        const {G, ctx} = client.getState()!;
        if (G.stage === "draw") client.moves.draw();
        else if (G.stage === "rotate") client.moves.rotate();
        else client.moves.hop(chooseToken(G, Number(ctx.currentPlayer))!);
      }
      expect(client.getState()!.ctx.gameover, `chapter ${level.id}`).toBeTruthy();
    }
  });
});
