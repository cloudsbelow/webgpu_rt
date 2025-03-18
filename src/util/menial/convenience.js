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

export function discretedist(arr=[1,1]){
  let sum = arr.reduce((a,b)=>a+b);
  let r=Math.random()*sum;
  for(let i=0; i<arr.length-1; i++){
    r-=arr[i];
    if(r<0) return i;
  }
  return arr.length-1;
}
export function discretechoice(probs, options){
  return options[discretedist(probs)]
}

export function range(n){
  let c = new Uint32Array(n);
  for(let i=0; i<n; i++) c[i]=i;
  return c
}


function m3_mul(a,b){
  let c=new Float32Array(9);
  for(let i=0; i<3; i++){
    for(let j=0; j<3; j++){
      let s=0;
      for(let k=0; k<3; k++){
        s+=a[i*3+k]*b[j+k*3]
      }
      c[i*3+j]=s;
    }
  }
  return c;
}

export function affineTransform({
  xrot=0, yrot=0, zrot=0, rot=[0,0,0],
  xscale=1, yscale=1, zscale=1, scale=[1,1,1],
  xmove=0, ymove=0, zmove=0, offset=[0,0,0] 
}){
  if(typeof scale == 'number') scale = [scale,scale,scale]
  xrot+=rot[0]; yrot+=rot[1]; zrot+=rot[2]
  const xrotm = new Float32Array([1,0,0,  0,Math.cos(xrot),-Math.sin(xrot),  0,Math.sin(xrot),Math.cos(xrot)]);
  const yrotm = new Float32Array([Math.cos(yrot),0,Math.sin(yrot),  0,1,0,  -Math.sin(yrot),0,Math.cos(yrot)]);
  const zrotm = new Float32Array([Math.cos(zrot),-Math.sin(zrot),0,  Math.sin(zrot),Math.cos(zrot),0,  0,0,1]);
  const scalem = new Float32Array([scale[0]*xscale,0,0,  0,scale[1]*yscale,0,  0,0,scale[2]*zscale]);
  const mat =  m3_mul(yrotm, m3_mul(zrotm, m3_mul(xrotm, scalem)));
  return eval(`(()=>{
    return function(x,y,z){
      return [
        ${mat[0]!=0?mat[0]+"*x+":""}${mat[1]!=0?mat[1]+"*y+":""}${mat[2]!=0?mat[2]+"*z+":""}${xmove+offset[0]},
        ${mat[3]!=0?mat[3]+"*x+":""}${mat[4]!=0?mat[4]+"*y+":""}${mat[5]!=0?mat[5]+"*z+":""}${ymove+offset[1]},
        ${mat[6]!=0?mat[6]+"*x+":""}${mat[7]!=0?mat[7]+"*y+":""}${mat[8]!=0?mat[8]+"*z+":""}${zmove+offset[2]}
      ]
    }
  })()`)

}

window.aft = affineTransform