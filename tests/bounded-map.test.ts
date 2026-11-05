import assert from "node:assert/strict";
import {test} from "node:test";
import {mapInBatches} from "../src/lib/bounded-map";

test("bounded mapper keeps page order even when tasks finish out of order",async()=>{
  let active=0,maxActive=0;
  const progress:number[]=[];
  const result=await mapInBatches(Array.from({length:21},(_,i)=>i+1),3,async page=>{
    active++;maxActive=Math.max(maxActive,active);
    try{
      await new Promise(done=>setTimeout(done,(page%3===0?1:page%3===1?9:5)));
      return {page,value:"p"+page};
    }finally{active--;}
  },(done,total)=>{
    assert.equal(total,21);
    progress.push(done);
  });
  assert.ok(maxActive>1&&maxActive<=3,"expected bounded parallelism, got "+maxActive);
  assert.deepEqual(result.map(x=>x.page),Array.from({length:21},(_,i)=>i+1));
  assert.deepEqual(progress,Array.from({length:21},(_,i)=>i+1));
});

test("one failure prevents a new batch from starting",async()=>{
  const started:number[]=[];
  await assert.rejects(()=>mapInBatches([1,2,3,4,5],2,async n=>{
    started.push(n);
    if(n===2)throw new Error("bad PDF page");
    return n;
  }),/bad PDF page/);
  assert.deepEqual(started,[1,2]);
});

test("empty input and invalid concurrency are handled safely",async()=>{
  assert.deepEqual(await mapInBatches([],3,async n=>n),[]);
  for(const value of [0,-1,1.5,17,Infinity,NaN]){
    await assert.rejects(()=>mapInBatches([1],value,async n=>n),/đồng thời/);
  }
});
