import assert from 'node:assert/strict';
import {paddyStage,paddyProgress,beijingDay} from '../frontend/clay-safari/src/paddy-cycle.js';
const day=86400000,now=1790990000000;
const paddy={plantedAt:null,wateredAt:null,readyAt:null};
assert.equal(paddyStage(paddy,now),0);
paddy.plantedAt=now;
assert.equal(paddyStage(paddy,now+365*day),1);
paddy.wateredAt=now;paddy.readyAt=now+30*day;
for(const [days,stage] of [[0,2],[2.99,2],[3,3],[9.99,3],[10,4],[19.99,4],[20,5],[29.99,5],[30,6],[365,6]]){
  assert.equal(paddyStage(paddy,now+days*day),stage);
}
console.log('Paddy stage checks passed: empty, seeded, sprout, green, deep green, yellow, gold, and offline maturity.');
const growing={plantedAt:now,wateredAt:null,growthStartedAt:now,baseDurationMs:30*day,readyAt:now+30*day,boostMs:0};
assert.equal(paddyStage(growing,now),2);
growing.boostMs=6*3600000;growing.readyAt-=growing.boostMs;
assert.equal(paddyProgress(growing,now),.25/30);
assert.equal(paddyStage(growing,growing.readyAt),6);
assert.equal(beijingDay(Date.parse('2026-10-03T15:59:59Z')),'2026-10-03');
assert.equal(beijingDay(Date.parse('2026-10-03T16:00:00Z')),'2026-10-04');
console.log('Daily water checks passed: natural growth, acceleration progress, mature color, Beijing midnight.');
