import {debugTex} from "./util/gpu/debugtex.js";
import * as util from "./util/util.js"
import * as ver from "./util/gpu/verbose.js"
import {Camera} from "./util/gpu/camera.js"
import * as Gbuffers from "./passes/gbuffers.js"
import { BasicImageTx } from "./util/gpu/textureHelper.js";
import * as bvhlib from "./rt/splitter.js";
import * as lpass from "./passes/simpledirect/sdmain.js"
import { genrtpass } from "./rt/fullrt/rtmain.js";
import { AtmosphereConsts, skyFn } from "./modules/atmosphere.js";
import { materials } from "./rt/fullrt/materialfns.js";
import { discretedist, v3_uniform } from "./util/menial/convenience.js";
lib.util=util
lib.ver=ver
lib.debugTex=debugTex
lib.bvhlib = bvhlib


const f = new util.FileContextRemote("f");

ver.startWebGPU((device)=>{
  const size = [1024, 720]
  const cam = objs.cam = new Camera([0,2,0],[0,0],{np:0.1, fov:0.8, ar:size[1]/size[0]});
  const camUnif = device.createBuffer({
    label: "Camera Uniform",
    size: 16*4*2+16+16,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(camUnif, 0, cam.genbuffers());

  const matbuf = materials.registry.upload(device)

  const ubgl = ver.bgl(device, "unifom buffers",[{r:"b"}, {r:"b"}])
  const ubg = ver.bg(ubgl, "unifom buffers", [{buffer:camUnif},{buffer:matbuf}])

  const atmoparams = skyFn(device);
  window.sun = atmoparams.params;
  
  const cb = new util.Allcb(()=>{
    const bvhctx = window.bvhctx = new bvhlib.BVHContext()
    bvhctx.addTris(vbuffile.content, ibuffile.content)
    for(let i=0; i<40; i++){
      //bvhctx.addCircle(v3_uniform(-10,10),1+Math.random(),discretedist([0,1,0,0,3]));
    }
    bvhctx.addCircle([0,5,0],1,materials.glow);
    //bvhctx.addTris(vbuffile.content,ibuffile.content,materials.glowglass,{vshift: [10,0,20]})
    const bvh = window.bvh = bvhctx.makeRoot({method: bvhlib.sahsplit})

    // const gbs = objs.gbs = Gbuffers.mpipe(device, size, [
    //   ubg, normmap.simplebg()
    // ], vbuffile.content, bvh.mIndex().buffer)

    const bvhst = bvh.prepare(device)
    //const deferedpass = lpass.genpass(device, bvhst, gbs, ubg)
    const rtpass = genrtpass(device, size, ubg, bvhst, atmoparams)
    //const db_p = debugTex(device, size, deferedpass.tx)
    const rt_p = debugTex(device, size, rtpass.tx)
    onDoneLoad()

    const frame = ()=>{
      cam.update();
      device.queue.writeBuffer(camUnif, 0, cam.genbuffers());
      ver.enc(device, rtpass.fn)
      rt_p();
      if(!objs.stop) requestAnimationFrame(frame)
    }
    requestAnimationFrame(frame)
  },3)
  const spath = "/assets/scene1/";
  const bpath = "pillars-pillar"
  const ipath = "Normal_map.png"
  const vbuffile = new util.File(f, spath+bpath+".ver", cb.c)
  const ibuffile = new util.File(f, spath+bpath+".ind", cb.c)
  const normmap = new BasicImageTx(f, spath+ipath, device, cb.c)
  //normmap.when(()=>debugTex(device, [256, 256], normmap)())
})
console.log(ver)



function onDoneLoad(){
  sun.setSunPos(0,-1)
}