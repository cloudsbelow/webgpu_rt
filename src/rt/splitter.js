import * as ch from "../util/menial/convenience.js"
import {b_cc} from "../util/util.js"
import { rtshader } from "./rtshader.js"
import * as ver from "../util/gpu/verbose.js"
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
  //console.log(sasc, sdesc)
  const opt = ch.min(ch.range(o.length-1), idx=>sasc[idx]+sdesc[idx])
  return [opt[1]+1,opt[2]]
}
export function sahsplit(c,idxs){
  let bestsplit=[];
  let bestscore = Infinity;
  for(let d=0; d<3; d++){
    const order = idxs.toSorted((a,b)=>c.h[a][d]-c.h[b][d])
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
      this.tris = Array.from(idxs);
    } 
    else {
      this.t = method(c, idxs).map(split=>new BVHNode(c, split, arguments[2]))
    }
    this.ctx=c;
    if(this.leaf){
      this.aabbl = this.tris.map(x=>c.l[x]).reduce(v3_min)
      this.aabbh = this.tris.map(x=>c.h[x]).reduce(v3_max)
    } else {
      this.aabbl = v3_min(this.t[0].aabbl, this.t[1].aabbl)
      this.aabbh = v3_max(this.t[0].aabbh, this.t[1].aabbh)
    }
    this.aabb=[this.aabbl, this.aabbh]
  }
}
BVHNode.prototype.mIndex = function(){
  if(this.leaf) return b_cc(...this.tris.map(idx=>this.ctx.x[idx]));
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
  function add(node){
    let idx = vbuf.length;
    let repr = new Uint8Array(64)
    const v = new DataView(repr.buffer)
    vbuf.push(repr)
    if(node.leaf){ //should have used b_cc lmao
      v.setUint32(0, node.tris.length, true)
      node.tris.forEach((i, j)=>{
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
BVHNode.prototype.prepare = function(device, vertexbuf = null){
  const bufcont = this.bvhbuf()
  const gpuibuf = device.createBuffer({
    label:"BVH buffer", size:bufcont.byteLength, 
    usage:GPUBufferUsage.COPY_DST | GPUBufferUsage.STORAGE
  })
  device.queue.writeBuffer(gpuibuf, 0, bufcont)
  if(!vertexbuf){
    const vbufcpu = b_cc(...this.ctx.v)
    vertexbuf = device.createBuffer({
      label:"vertex buffer", size:vbufcpu.byteLength,
      usage:GPUBufferUsage.COPY_DST | GPUBufferUsage.STORAGE
    })
    device.queue.writeBuffer(vertexbuf, 0, vbufcpu)
  }
  const bgl = ver.bgl(device, "rt layout", [{r:'b',t:'r'},{r:'b',t:'r'}])
  const bg = ver.bg(bgl, "rt bindgroup", [{buffer:vertexbuf},{buffer:gpuibuf}])
  objs.bbuf = bufcont;
  return {
    wgsl:rtshader,
    bgl:bgl,
    bg:bg,
    cpuibuf:bufcont,
  }
}

class BVHContext{
  constructor(v, indices){
    this.v=v; this.x = indices;
    this.c = indices.map(([i1,i2,i3])=>{
      return ch.v_lop(1/3, v[i1], 1/3, v[i2], 1/3, v[i3])
    })
    this.l = indices.map(([i1,i2,i3])=>{
      return ch.v_red(Math.min, v[i1], v[i2], v[i3]).map(x=>x-0.001);
    })
    this.h = indices.map(([i1,i2,i3])=>{
      return ch.v_red(Math.max, v[i1], v[i2], v[i3]).map(x=>x+0.001)
    })
    this.n = this.x.length
  }
  makeRoot(options={}){
    return new BVHNode(this, ch.range(this.n),options)
  }
}

export function parsebvh(vbuf, ibuf, {
  posoffset=0, vstride=16,
  istride = 12, idtype = Uint32Array
}={}){
  let v=[];
  for(let i=0; i<vbuf.byteLength/vstride; i++){
    v.push(new Float32Array(vbuf, i*vstride+posoffset, 3))
  }
  let indices=[];
  for(let i=0; i<ibuf.byteLength/istride; i++){
    indices.push(new idtype(ibuf, i*istride, 3))
  }
  return new BVHContext(v, indices)
}