const code = `
function max(list, fn){
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
function min(list, fn){
  let li = max(list, (a)=>-fn(a))
  return [li[0], li[1], -li[2]];
}
const ch = {}
function b_cc(...bufs){
  let offsets = [];
  let coff = 0
  for(let i=0; i<bufs.length; i++){
    offsets.push(coff);
    coff+=bufs[i].byteLength
  }
  let res = new Uint8Array(coff)
  for(let i=0; i<bufs.length; i++){
    res.set(new Uint8Array(bufs[i].buffer, bufs[i].byteOffset, bufs[i].byteLength),offsets[i])
  }
  return res
}
ch.max = function(list, fn){
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
ch.min = function(list, fn){
  let li = max(list, (a)=>-fn(a))
  return [li[0], li[1], -li[2]];
}

ch.v_lop = function(){
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
ch.v_red = function(fn, ...bufs){
  let c=new Float32Array(bufs[0].length);
  c.set(bufs[0])
  for(let i=1; i<bufs.length; i++){
    for(let j=0; j<bufs[0].length; j++){
      c[j]=fn(c[j],bufs[i][j])
    }
  }
  return c;
}
ch.range=function(n){
  let c = new Uint32Array(n);
  for(let i=0; i<n; i++) c[i]=i;
  return c
}

ch.affineTransform=function({
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
  return eval(\`(()=>{
    return function(x,y,z){
      return [
        \${mat[0]!=0?mat[0]+"*x+":""}\${mat[1]!=0?mat[1]+"*y+":""}\${mat[2]!=0?mat[2]+"*z+":""}\${xmove+offset[0]},
        \${mat[3]!=0?mat[3]+"*x+":""}\${mat[4]!=0?mat[4]+"*y+":""}\${mat[5]!=0?mat[5]+"*z+":""}\${ymove+offset[1]},
        \${mat[6]!=0?mat[6]+"*x+":""}\${mat[7]!=0?mat[7]+"*y+":""}\${mat[8]!=0?mat[8]+"*z+":""}\${zmove+offset[2]}
      ]
    }
  })()\`)

}

function v3_max(v1,v2){
  return new Float32Array([
    Math.max(v1[0],v2[0]),Math.max(v1[1],v2[1]),Math.max(v1[2],v2[2])
  ])
}
function v3_min(v1,v2){
  return new Float32Array([
    Math.min(v1[0],v2[0]),Math.min(v1[1],v2[1]),Math.min(v1[2],v2[2])
  ])
}
function v3_sa(v1,v2){
  let x = v1[0]-v2[0];
  let y = v1[1]-v2[1];
  let z = v1[2]-v2[2];
  return x*y+y*z+x*z
}


function sahbestsplit(c, o){
  let sasc = new Float32Array(o.length-1)
  let sdesc = new Float32Array(o.length-1)
  let amin = c.l[o[0]];
  let amax = c.h[o[0]];
  let dmin = c.l[o[o.length-1]];
  let dmax = c.h[o[o.length-1]];

  for(let i=1; i<o.length; i++){
    sasc[i-1]=v3_sa(amin,amax)*i;
    amin = v3_min(amin, c.l[o[i]])
    amax = v3_max(amax, c.h[o[i]])
    sdesc[o.length-i-1]=v3_sa(dmin,dmax)*i
    dmin = v3_min(dmin, c.l[o[o.length-i-1]])
    dmax = v3_max(dmax, c.h[o[o.length-i-1]])
  }
  const opt = ch.min(ch.range(o.length-1), idx=>sasc[idx]+sdesc[idx])
  return [opt[1]+1,opt[2]]
}
function sahsplit(c,idxs){
  let bestsplit=[];
  let bestscore = Infinity;
  for(let d=0; d<3; d++){
    const order = idxs.toSorted((a,b)=>c.c[a][d]-c.c[b][d])
    let [splitidx, score] = sahbestsplit(c,order)
    if(score<bestscore){
      bestscore = score;
      bestsplit = [order.subarray(0,splitidx), order.subarray(splitidx)]
    }
  }
  return bestsplit;
}

class BVHNode{
  constructor(c, idxs, {method=sahsplit, leafsize=4}){
    this.leaf = false;
    this.count = idxs.length
    if(idxs.length<=leafsize){
      this.leaf = true;
      this.prims = Array.from(idxs);
    } 
    else {
      this.t = method(c, idxs).map(split=>new BVHNode(c, split, arguments[2]))
    }
    this.ctx=c;
    if(this.leaf){
      this.aabbl = this.prims.map(x=>c.l[x]).reduce(v3_min)
      this.aabbh = this.prims.map(x=>c.h[x]).reduce(v3_max)
    } else {
      this.aabbl = v3_min(this.t[0].aabbl, this.t[1].aabbl)
      this.aabbh = v3_max(this.t[0].aabbh, this.t[1].aabbh)
    }
    this.aabb=[this.aabbl, this.aabbh]
  }
}
BVHNode.prototype.mIndex = function(){
  if(this.leaf) return b_cc(...this.prims.map(idx=>this.ctx.isTri(idx)?this.ctx.x[idx]:new Uint8Array(0)));
  return b_cc(this.t[0].mIndex(), this.t[1].mIndex())
}
BVHNode.prototype.depth = function(){
  if(this.leaf) return 1;
  return Math.max(this.t[0].depth(),this.t[1].depth())+1
}
BVHNode.prototype.treesize = function(){
  return this.leaf? 1: 1+this.t[0].treesize()+this.t[1].treesize();
}
BVHNode.prototype.bvhbuf = function(){
  /* 
  A node stores up to 16 words/64 bytes:
  1x leaf indicator (number of tris in leaf)
  if leaf:
    5x 3-uint vertex index for tri
  else:
    2x 3x2-float aabb of children
    2x uint child 
  */
  let vbuf = [];
  const ctx = this.ctx;
  function add(node){
    let idx = vbuf.length;
    let repr = new Uint8Array(64)
    const v = new DataView(repr.buffer)
    vbuf.push(repr)
    if(node.leaf){ //should have used b_cc lmao
      let flags = node.prims.length
      for(let i=0; i<node.prims.length; i++){
        flags+=(!ctx.isTri(node.prims[i]))?(1<<8+i):0
      }
      v.setUint32(0, flags, true)
      node.prims.forEach((i, j)=>{
        const vs = node.ctx.x[i];
        //console.log(vs)
        v.setUint32(4+j*12, vs[0], true)
        v.setUint32(8+j*12, vs[1], true)
        v.setUint32(12+j*12, vs[2], true)
      })
    } else {
      [...node.t[0].aabb, ...node.t[1].aabb].forEach((vec,j)=>{
        v.setFloat32(4+j*12, vec[0], true)
        v.setFloat32(8+j*12, vec[1], true)
        v.setFloat32(12+j*12, vec[2], true)
      })
      v.setUint32(56,add(node.t[0]),true)
      v.setUint32(60,add(node.t[1]),true)
    }
    return idx;
  }
  add(this);
  return b_cc(...vbuf)
}

class BVHContext{
  constructor(){
    this.v = []
    this.l = []
    this.h = []
    this.c = []
    this.x = []
    this.m = []
    this.triset = new Set()
  }
  makeRoot(options={}){
    if(this.x.length == 0) this.addCircle([0,-2,0],1,0);
    this.n = this.x.length;
    return this.bvh= new BVHNode(this, ch.range(this.n),options)
  }
  isTri(idx){
    return this.triset.has(idx);
  }
  addTris(vbuf, ibuf, material=0, {
    posoffset=0, vstride=16,
    istride = 12, idtype = Uint32Array, transform = ch.affineTransform({})
  }={}){
  
    let vo = this.v.length;
    if(vbuf instanceof ArrayBuffer){
      for(let i=0; i<vbuf.byteLength/vstride; i++){
        const point = new Float32Array(vbuf, i*vstride+posoffset, 3)
        this.v.push(new Float32Array(transform(point[0],point[1],point[2])))
        this.m.push(material);
      }
    } else for(let i=0; i<vbuf.length; i+=3){
      //[vbuf[0+i]+vshift[0],vbuf[1+i]+vshift[1],vbuf[2+i]+vshift[2]]
      this.v.push(new Float32Array(transform(vbuf[0+i],vbuf[1+i],vbuf[2+i])))
      this.m.push(material);
    }
    
    if(ibuf instanceof ArrayBuffer) ibuf = new idtype(ibuf);
    let v=this.v;
    for(let i=0; i<ibuf.length; i+=3){
      let indices = new Uint32Array([ibuf[0+i]+vo,ibuf[1+i]+vo,ibuf[2+i]+vo])
      let [i1,i2,i3] = indices
      this.triset.add(this.x.length);
      this.x.push(indices)
      this.c.push(ch.v_lop(1/3, v[i1], 1/3, v[i2], 1/3, v[i3]))
      this.l.push(ch.v_red(Math.min, v[i1], v[i2], v[i3]).map(x=>x-0.001))
      this.h.push(ch.v_red(Math.max, v[i1], v[i2], v[i3]).map(x=>x+0.001))
    }
    this.n = this.x.length;
  }
  addCircle(loc, radius, material=0){
    let center = this.v.length;
    let span = center+1;
    this.v.push(new Float32Array([loc[0],loc[1],loc[2]]))
    this.v.push(new Float32Array([radius,radius, radius]))
    this.m.push(material, material)

    const v=this.v
    this.x.push(new Uint32Array([center,span,0]));
    this.c.push(ch.v_lop(1,v[center]))
    this.l.push(ch.v_lop(1,v[center],-1,v[span]))
    this.h.push(ch.v_lop(1,v[center],1,v[span]))
    this.n = this.x.length;
  }
  /**
   * 
   * @param {Mesh} mesh 
   * @param {*} transform 
   */
  addMesh(mesh, material, transform = ch.affineTransform({})){
  
    this.addTris(mesh.vbuf.content,mesh.ibuf.content,material,{transform:transform})
  }
  getBuffers(device){
    if(this.x.length == 0) this.addCircle([0,-2,0],1,0);
    const root = this.makeRoot({method: sahsplit})
    const tbuf = root.bvhbuf();
    const vbuf = b_cc(...this.v)
    const mbuf = new Uint32Array(this.m.length);
    this.m.forEach((m,i)=>mbuf[i]=m+0);
    self.postMessage({
      tbuf:tbuf, vbuf:vbuf, mbuf:mbuf
    },[tbuf.buffer,vbuf.buffer,mbuf.buffer])
  }
}



const b = new BVHContext()
const meshes = {}

self.onmessage = (e) => {
  const o = e.data;
  //console.log(o);
  if(!o.op) return;
  if(o.op == "clear"){
    b.clear();
  } else if(o.op=="print"){
    console.log(b, meshes) 
  } else if(o.op == "circle"){
    b.addCircle(o.loc,o.rad,o.m) 
  } else if(o.op == "tris"){
    //b.addTris(o.vbuf, o.ibuf, o.m) 
  } else if(o.op == "mesh"){
    const mesh = meshes[o.mesh.midx]??=o.mesh
    console.log(mesh)
    b.addMesh(mesh, o.m,eval(o.ts))
  } else if(o.op == "build"){
    b.getBuffers() 
  }
};
`;

const blob = new Blob([code], { type: 'application/javascript' });
const url = URL.createObjectURL(blob);

export class BGSplitter{
  constructor(ctx){
    this.ctx=ctx;
    try{
      this.worker = new Worker(url);
      this.worker.onmessage = (e) => {
        console.log('Main thread received:', e.data);
        ctx.assignBuffers(e.data.tbuf,e.data.vbuf,e.data.mbuf);
      };
      this.good = true;
    }catch(e){
      this.good = false;
    }
    this.meshids = 1;
    window.bgs = this;
  }
  post(obj,ownership = null,cb=null){
    if(!this.good) return;
    this.worker.postMessage(obj,ownership)
  }
  meshToPostable(mesh){
    if(mesh.wobj) return [{midx:mesh.wobj.midx},null];
    const wobj = {
      ibuf:{content:mesh.ibuf.content},
      vbuf:{content:mesh.vbuf.content},
      midx:this.meshids++
    }
    mesh.wobj = wobj;
    return [wobj, [mesh.ibuf.content, mesh.vbuf.content]]
  }
}

