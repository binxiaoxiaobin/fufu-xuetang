const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const context={window:{}};vm.createContext(context);vm.runInContext(fs.readFileSync('frontend/reader-round.js','utf8'),context);
for(const size of [1,2,3,5]){
  for(const random of [()=>0,()=>.99,Math.random]){
    for(let trial=0;trial<40;trial++){
      const orders=context.window.FufuReaderRound.plan(Array.from({length:size},(_,i)=>({question_id:i+1})),random);
      assert.equal(orders.length,4);
      orders.forEach(order=>assert.deepEqual(Array.from(order).sort(),Array.from({length:size},(_,i)=>i+1)));
      if(size>1)for(let phase=1;phase<4;phase++){
        orders[phase].forEach((id,i)=>assert.notEqual(id,orders[phase-1][i]));
        if(size>2)assert.notEqual(orders[phase][0],orders[phase-1].at(-1));
      }
    }
  }
}
console.log('Same unique group in all four stages; shuffled positions; no immediate boundary repeat: passed');
