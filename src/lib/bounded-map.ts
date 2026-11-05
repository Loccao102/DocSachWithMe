/**
 * Run independent tasks in ordered batches so large documents never queue
 * unbounded PDF page work. Completion updates are monotonic even if pages
 * finish out of order; output preserves the original input positions.
 */
export async function mapInBatches<T,R>(
  items:readonly T[],
  concurrency:number,
  task:(item:T,index:number)=>Promise<R>,
  onComplete?:(completed:number,total:number)=>void
):Promise<R[]>{
  if(!Number.isSafeInteger(concurrency)||concurrency<1||concurrency>16)
    throw new Error("Số tác vụ đồng thời không hợp lệ.");
  const result:R[]=new Array(items.length);
  let finished=0;
  for(let start=0;start<items.length;start+=concurrency){
    const batch=await Promise.all(items.slice(start,start+concurrency).map(async(item,offset)=>{
      const value=await task(item,start+offset);
      onComplete?.(++finished,items.length);
      return value;
    }));
    batch.forEach((value,offset)=>{result[start+offset]=value;});
  }
  return result;
}
