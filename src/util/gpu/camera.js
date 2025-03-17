import {b_cc, keys} from "./../util.js";

function m4_ident(){
  return new Float32Array([
    1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1
  ]);
}
function m4_t(a){
  return new Float32Array([ //strictly faster than a forloop but actually I'm just lazy
    a[0],a[4],a[8],a[12],
    a[1],a[5],a[9],a[13],
    a[2],a[6],a[10],a[14],
    a[3],a[7],a[11],a[15]
  ]);
}
function m4_mul(a,b){
  let c=new Float32Array(16);
  for(let i=0; i<4; i++){
    for(let j=0; j<4; j++){
      let s=0;
      for(let k=0; k<4; k++){
        s+=a[i*4+k]*b[j+k*4]
      }
      c[i*4+j]=s;
    }
  }
  return c;
}
function m4_transf(x,y,z){
  return new Float32Array([
    1, 0, 0, x, 0, 1, 0, y, 0, 0, 1, z, 0, 0, 0, 1
  ]);
}
function m4_tprot(theta, phi){
  return m4_mul(new Float32Array([
    1,0,0,0,
    0,Math.cos(phi),-Math.sin(phi),0,
    0,Math.sin(phi),Math.cos(phi),0,
    0,0,0,1,
  ]), new Float32Array([
    Math.cos(theta),0,-Math.sin(theta),0,
    0,1,0,0,
    Math.sin(theta),0,Math.cos(theta),0,
    0,0,0,1,
  ]));
}

function m4_pers({
  loc=[0,0,0],
  vdir=[0,0],
  fov=1,
  ar=canvas.height/canvas.width,
  np=1,
  t=false,
}={}){
  const perM = new Float32Array([
    ar*fov,0,0,0,
    0,fov,0,0,
    0,0,0,np,
    0,0,1,0
  ]);
  const transM = m4_transf(-loc[0], -loc[1], -loc[2]);
  const rotM = m4_tprot(vdir[0], vdir[1]);
  return (t? m4_t:(x)=>x)(m4_mul(perM,m4_mul(rotM, transM)));
}
function m4_invpersl({
  vdir=[0,0],
  fov=1,
  ar=canvas.height/canvas.width,
  np=1,
  t=false,
}={}){
  const perM = new Float32Array([
    1/(ar*fov),0,0,0,
    0,1/fov,0,0,
    0,0,0,1,
    0,0,1/np,0
  ]);
  const rotM = m4_t(m4_tprot(vdir[0], vdir[1]));
  return (t? m4_t:(x)=>x)(m4_mul(rotM, perM));
}


class simpleBuffer{
  constructor(){
    this.buffered = false
  }
  consume(){
    if(this.buffered){
      this.buffered = false;
      return true;
    }
  }
  buffer(){
    this.buffered=true;
  }
}
export const globalResetBuffer = new simpleBuffer()

export class Camera{
  constructor(loc, vdir, {fov=0.8, ar=1, np=0.1, t=true, keybinds = {
    forward:'KeyW', left:'KeyA', right:'KeyD', back:'KeyS', up:'Space', down:'ShiftLeft',
    lookUp:'KeyO',lookDown:'KeyL',lookLeft:'KeyK',lookRight:'Semicolon',
  }}={}){
    this.params = {
      loc:loc, vdir:vdir,
      fov:fov, ar:ar, np:np, t:t
    }
    this.lu = Date.now()
    this.binds = keybinds
  }
}


Camera.prototype.update = function(){
  let dt=Math.min(100, Date.now()-this.lu);
  this.lu=Date.now();
  let ms=5;
  let as=1.5;

  if(true){
    let dir=(keys[this.binds.lookLeft]?1:0)-(keys[this.binds.lookRight]?1:0);
    if(dir)globalResetBuffer.buffer()
    this.params.vdir[0]+=-dir*dt*0.005*as;
  }
  if(true){
    let dir=(keys[this.binds.lookUp]?1:0)-(keys[this.binds.lookDown]?1:0);
    if(dir)globalResetBuffer.buffer()
    this.params.vdir[1]+=dir*dt*0.005*as;
  }
  
  if(true){
    let dir=(keys[this.binds.forward]?1:0)-(keys[this.binds.back]?1:0);
    if(dir)globalResetBuffer.buffer()
    this.params.loc[2]+=dir*Math.cos(this.params.vdir[0])*dt*0.005*ms;
    this.params.loc[0]+=dir*Math.sin(this.params.vdir[0])*dt*0.005*ms;
  }
  if(true){
    let dir=(keys[this.binds.left]?1:0)-(keys[this.binds.right]?1:0);
    if(dir)globalResetBuffer.buffer()
    this.params.loc[0]+=-dir*Math.cos(this.params.vdir[0])*dt*0.005*ms;
    this.params.loc[2]+=dir*Math.sin(this.params.vdir[0])*dt*0.005*ms;
  }
  if(true){
    let dir=(keys[this.binds.up]?1:0)-(keys[this.binds.down]?1:0);
    if(dir)globalResetBuffer.buffer()
    this.params.loc[1]+=dir*dt*0.005*ms;
  }
}
Camera.prototype.genbuffers = function(){
  return b_cc(
    m4_pers(this.params),
    m4_invpersl(this.params), 
    new Float32Array(this.params.loc),
    new Float32Array([this.params.np])
  )
}
Camera.prototype.matrices = function(){
  return [m4_pers(this.params), m4_invpersl(this.params)]
}
Camera.prototype.verify = function(){
  return m4_mul(m4_pers(this.params), m4_invpersl(this.params))
}

