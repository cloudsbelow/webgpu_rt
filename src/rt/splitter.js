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
  const opt = ch.min(ch.range(o.length-1), idx=>sasc[idx]+sdesc[idx])
  return [opt[1]+1,opt[2]]
}
export function sahsplit(c,idxs){
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
  const mbuf = new Uint32Array(this.ctx.m.length);
  this.ctx.m.forEach((m,i)=>mbuf[i]=m+0)
  const gpumbuf = device.createBuffer({
    label:"Material buffer", size:mbuf.byteLength,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.STORAGE
  })
  device.queue.writeBuffer(gpumbuf, 0, mbuf);
  const bgl = ver.bgl(device, "rt layout", [{r:'b',t:'r'},{r:'b',t:'r'},{r:'b',t:'r'}])
  const bg = ver.bg(bgl, "rt bindgroup", [{buffer:vertexbuf},{buffer:gpuibuf},{buffer:gpumbuf}])
  objs.bbuf = bufcont;
  return {
    wgsl:rtshader,
    bgl:bgl,
    bg:bg,
    cpuibuf:bufcont,
  }
}

export class BVHContext{
  constructor(){
    this.v = []
    this.l = []
    this.h = []
    this.c = []
    this.x = []
    this.m = []
    this.triset = new Set()
    /*this.v=v; 
    this.triidxs = triindices;
    this.cidxs = circleindices; 
    this.c = triindices.map(([i1,i2,i3])=>{
      return ch.v_lop(1/3, v[i1], 1/3, v[i2], 1/3, v[i3])
    })
    this.l = triindices.map(([i1,i2,i3])=>{
      return ch.v_red(Math.min, v[i1], v[i2], v[i3]).map(x=>x-0.001);
    })
    this.h = triindices.map(([i1,i2,i3])=>{
      return ch.v_red(Math.max, v[i1], v[i2], v[i3]).map(x=>x+0.001)
    })
    for(let i=0; i<circleindices.length; i++){
      let [center, span, rotation] = circleindices[i]
      this.c.push(ch.v_lop(1,v[center]))
      this.l.push(ch.v_lop(1,v[center],-1,v[span]))
      this.h.push(ch.v_lop(1,v[center],-1,v[span]))
    }
    this.x = this.triidxs.concat(this.cidxs)*/
  }
  makeRoot(options={}){
    this.n = this.x.length;
    return this.bvh= new BVHNode(this, ch.range(this.n),options)
  }
  isTri(idx){
    return this.triset.has(idx);
  }
  addTris(vbuf, ibuf, material=0, {
    posoffset=0, vstride=16,
    istride = 12, idtype = Uint32Array, vshift = [0,0,0]
  }={}){
    let vo = this.v.length;
    if(vbuf instanceof ArrayBuffer){
      let vs = new Float32Array(vshift)
      for(let i=0; i<vbuf.byteLength/vstride; i++){
        this.v.push(ch.v_lop(1,new Float32Array(vbuf, i*vstride+posoffset, 3),1,vs))
        this.m.push(material);
      }
    } else for(let i=0; i<vbuf.length; i+=3){
      this.v.push(new Float32Array([vbuf[0+i]+vshift[0],vbuf[1+i]+vshift[1],vbuf[2+i]+vshift[2]]))
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
}

export function parsebvh(vbuf, ibuf, carr=[], {
  posoffset=0, vstride=16,
  istride = 12, idtype = Uint32Array
}={}){
  let v=[];
  
  let indices=[];
  if(ibuf instanceof ArrayBuffer){
    for(let i=0; i<ibuf.byteLength/istride; i++){
      indices.push(new idtype(ibuf, i*istride, 3))
    }
  } else {
    
  }
  let cindices = []
  for(let i=0; i<carr.length; i++){
    let nums = [carr[i][0],carr[i][1],carr[i][2]]
    cindices.push(new idtype(nums))
  }
  return new BVHContext(v, indices,cindices)
}