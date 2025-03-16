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
lib.util=util
lib.ver=ver
lib.debugTex=debugTex
lib.bvhlib = bvhlib


const f = new util.FileContextRemote("f");

ver.startWebGPU((device)=>{
  const cam = objs.cam = new Camera([0,2,0],[0,0],{np:0.1, fov:0.8});
  const camUnif = device.createBuffer({
    label: "Camera Uniform",
    size: 16*4*2+16,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(camUnif, 0, cam.genbuffers());
  const ubgl = ver.bgl(device, "unifom buffers",[{r:"b"}])
  const ubg = ver.bg(ubgl, "unifom buffers", [{buffer:camUnif}])

  const atmoparams = skyFn(device);
  
  const cb = new util.Allcb(()=>{
    console.log("here");
    const size = [512, 512]

    const bvh = objs.bvh = bvhlib.parsebvh(
      vbuffile.content, ibuffile.content
    ).makeRoot({method: bvhlib.sahsplit})//.t[1].t[1].t[0].t[0].t[1]//.t[1]//.t[0]//.t[1]

    const gbs = objs.gbs = Gbuffers.mpipe(device, size, [
      ubg, normmap.simplebg()
    ], vbuffile.content, bvh.mIndex().buffer)
    //const db_n = debugTex(device, [256,256], gbs.normal)
    //const db_d = debugTex(device, [256,256], gbs.depth, {ttype:"texture_depth_2d",disp:"vec4(info,info*4,info*16,0)",etype:{r:"t",t:"d"}})

    const bvhst = bvh.prepare(device)
    const deferedpass = lpass.genpass(device, bvhst, gbs, ubg)
    const rtpass = genrtpass(device, size, ubg, bvhst, atmoparams)
    const db_p = debugTex(device, size, deferedpass.tx)
    const rt_p = debugTex(device, size, rtpass.tx)

    const frame = ()=>{
      cam.update();
      device.queue.writeBuffer(camUnif, 0, cam.genbuffers());
      ver.enc(device, gbs.draw, deferedpass.fn, rtpass.fn)
      //db_n(); db_d(); 
      db_p();
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