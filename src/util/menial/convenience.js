export function max(list, fn){
  let start = 0//Math.floor(Math.random()*list.length)
  let cur = start;
  let curfn = fn(list[cur]);
  for(let i=0; i<list.length; i++){
    let newfn = fn(list[i]);
    if(newfn>curfn){
      cur = i;
      curfn = newfn;
    }
  }
  return [list[cur], cur, curfn];
}
export function min(list, fn){
  let li = max(list, (a)=>-fn(a))
  return [li[0], li[1], -li[2]];
}

export function v_lop(){
  let c=new Float32Array(arguments[1].length);
  for(let i=0; i<arguments.length; i+=2){
    if(arguments[i+1].length!=c.length){
      throw new Error("invalid linear op- jagged inputs");
    }
    for(let j=0; j<c.length; j++){
      c[j]+=arguments[i+1][j]*arguments[i];
    }
  }
  return c;
}
export function v_red(fn, ...bufs){
  let c=new Float32Array(bufs[0].length);
  c.set(bufs[0])
  for(let i=1; i<bufs.length; i++){
    for(let j=0; j<bufs[0].length; j++){
      c[j]=fn(c[j],bufs[i][j])
    }
  }
  return c;
}

export function v3_uniform(n1,n2){
  let min=n1;
  let max=n2;
  if(n1===undefined){
    min=0; max=1;
  } else if(n2 === undefined){
    min=0; max=n1;
  }
  let dif = max-min;
  return new Float32Array([Math.random()*dif+min, Math.random()*dif+min, Math.random()*dif+min])
}

export function range(n){
  let c = new Uint32Array(n);
  for(let i=0; i<n; i++) c[i]=i;
  return c
}