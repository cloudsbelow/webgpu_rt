export function b_cc(...bufs){
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

export class Allcb{
  constructor(cb, count = 1){
    this.cb=cb
    this.count=count
    this.c = this.c.bind(this)
    this.ex = this.ex.bind(this)
  }
  c=function(){
    this.count--
    if(this.count==0) this.cb();
    return this.count;
  }
  ex=function(){
    this.count++
    return this.c
  }
  rem=function(){
    return this.count
  }
}

export class Queue{
  constructor(){
    this.first = null;
    this.last = null;
  }
  enqueue(item){
    const link = {
      n:null,
      d:item,
    }
    if(this.first == null) this.first = link;
    else this.last.n = link;
    this.last = link;
  }
  peak(){
    return this.first;
  }
  dequeue(){
    const link = this.first;
    if(!link) return null;
    this.first = link.n
    return link.d;
  }
}

export class BAsyncObj{
  constructor(unrest=1){
    this._u=unrest;
    this._f=null
    this._l=null
    this.settle = this.settle.bind(this);
    this.unsettle = this.unsettle.bind(this);
    this.when = this.when.bind(this);
  }
  when(fn){
    if(this.unrest==0&&!this._f) fn(this);
    else {
      let temp=[fn,null]
      if(this._f){
        this._l[1]=temp
        this._l=temp
      } else {
        this._f=temp
        this._l=temp
      }
    }
    return this
  }
  settle(){
    this._u--;
    while(this._u==0 && this._f){
      this._f[0](this)
      this._f=this._f[1]
    }
  }
  unsettle(){
    this._u++;
  }
}

export class StreamCache{
  constructor(){
    this.first = null
    this.last = null
    this.enqueued = 0
    this.waitfirst = null
    this.waitlast = null
    this.enqueue = this.enqueue.bind(this)
  }
  isReadable(num){
    return this.enqueued>=num
  }
  enqueue(buf){
    const link = {
      data: buf,
      next: null
    }
    if(this.first == null) this.first = link
    else this.last.next = link
    this.last = link
    this.enqueued += buf.byteLength
    while(this.enqueued>=this.waitfirst?.size){
      this.waitfirst.cb(this.readnow(this.waitfirst.size))
      this.waitfirst = this.waitfirst.next
    }
    return this.enqueued
  }
  readnow(size){
    if(!this.isReadable(size)) return null;
    if(size == 0) size = this.enqueued
    let c = new Uint8Array(size)
    let offset = 0;
    while(size-offset && size-offset>=this.first.data.byteLength){
      c.set(this.first.data, offset)
      offset += this.first.data.byteLength
      this.first = this.first.next
    }
    if(size-offset>0){
      c.set(this.first.data.subarray(0,size-offset))
      this.first.data = this.first.data.subarray(size-offset)
    }
    this.enqueued -= size
    return c
  }
  read(size,cb){
    if(size<=this.enqueued && this.waitfirst == null && this.enqueued!=0){
      cb(this.readnow(size))
    } 
    else {
      const link = {
        cb:cb,
        size:size,
        next:null,
      }
      if(this.waitfirst == null) this.waitfirst = link
      else this.waitlast.next = link
      this.waitlast = link
    }
  }
}


export class File extends BAsyncObj{
  constructor(context, path, cb){
    super()
    this.found = false;
    context.getfile(path, this.foundcb)
    this.when(cb);
  }
  foundcb = (err, content)=>{
    this.content = content
    this.found = err == 0;
    this.settle()
  }
}

export class FileContextRemote{
  constructor(basepath){
    this.base = basepath+"/"
  }
  getfile=(file, cb)=>{
    const xhr = new XMLHttpRequest();
    xhr.timeout = 0;
    xhr.responseType = "arraybuffer";
    xhr.onreadystatechange = ()=>{
      if(xhr.readyState === XMLHttpRequest.DONE){
        if(xhr.status === 200) {
          cb(0, xhr.response);
        } else cb(xhr.status, null)
      }
    }
    xhr.open('GET',this.base+file)
    xhr.send() 
  }
}

export class FileContextServer extends BAsyncObj{
  constructor(url, basepath){
    super()
    this.url = url;
    this.base = basepath;
    this.fs = undefined;
    import('fs').then((fs)=>{this.settle(); this.fs=fs})
  }
  getfile=(file, cb)=>{
    const filepath = this.base+file;
    this.when(()=>{
      this.fs.access(filepath, this.fs.constants.R_OK, (err)=>{
        console.log(err, filepath)
        if(err) return cb(err);
        this.fs.readFile(filepath, (err, data)=>{
          if(err) return cb(err, null);
          cb(0,data)
        })
      })
    });
  }
  processRequest=(req, res)=>{
    const spath = req.url.split('/');
    if(spath[1]!=this.url) return false
    this.getfile(req.url.slice(1+this.base.length),(err, data)=>{
      if(err){
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        return res.end()
      }
      res.writeHead(200, {'Content-Type': 'application/octet-stream'})
      res.write(data)
      res.end()
    })
  }
}

function initializingHandler(constr,remap=null){
  return {get:(targ,p,rec)=>{
    if(remap) p=remap(p)
    if(targ[p] === undefined){
      targ[p] = constr()
    }
    return targ[p]
  }}
}
const onfns = {
  down:{label:"down"},
  up:{label:"up"}
}
const remapkey = (key)=>{
  if(key.length == 1) return "Key"+key.toUpperCase();
  return key;
}
export const keys = {
  on: new Proxy(onfns.down,initializingHandler(()=>new Set(),remapkey)),
  onup: new Proxy(onfns.up,initializingHandler(()=>new Set(),remapkey))
}
window.addEventListener("keydown",(ev)=>{
  keys[ev.code]=Date.now();
  let m;
  if(m=onfns.down[ev.code]){
    m.forEach(f=>f(ev))
  }
})
window.addEventListener("keyup",(ev)=>{
  let delt = Date.now()-keys[ev.key];
  keys[ev.code]=0;
  let m;
  if(m=onfns.up[ev.code]){
    m.forEach(f=>f(ev,delt))
  }
})

export const mouseClientPos={x:0,y:0};
window.addEventListener("mousemove",(ev)=>{
  mouseClientPos.x=ev.clientX
  mouseClientPos.y=ev.clientY
})

export function clamp(f,l,h){
  return f<l?l:(f>h?h:f)
}
window.keys = keys