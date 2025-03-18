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
import { affineTransform, discretedist, v3_uniform, v_lop } from "./util/menial/convenience.js";
import { Dragons } from "./rt/scenes.js";
lib.util=util
lib.ver=ver
lib.debugTex=debugTex
lib.bvhlib = bvhlib


const f = new util.FileContextRemote("f/assets/scene1/");
var scene;
ver.startWebGPU((device)=>{
  const size = [1024, 720]
  const cam = objs.cam = new Camera([0,2,0],[0,0],{np:0.1, fov:0.8, ar:size[1]/size[0]});
  const camUnif = device.createBuffer({
    label: "Camera Uniform",
    size: 16*4*2+16+16,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(camUnif, 0, cam.genbuffers());
  cam.addControls(document.getElementById("cameraui"))

  const matbuf = materials.registry.upload(device)
  const ubgl = ver.bgl(device, "unifom buffers",[{r:"b"}, {r:"b"}])
  const ubg = ver.bg(ubgl, "unifom buffers", [{buffer:camUnif},{buffer:matbuf}])

  const atmoparams = skyFn(device);
  atmoparams.params.addControls(document.getElementById("sunui"));
  window.sun = atmoparams.params;
  
  const cb = new util.Allcb(async ()=>{
    const bvhctx = window.bvhctx = new bvhlib.BVHContext()
    //bvhctx.addMesh(mesh,0,affineTransform({xrot:-Math.PI/2}))
    await scene(bvhctx);
    const bvh = window.bvh = bvhctx.makeRoot({method: bvhlib.sahsplit})
    const depth = bvh.depth();
    console.log(`Made bvh with ${bvhctx.x.length} primatives and depth ${depth}`)
    if(depth>32) console.warn("depth>32 may result in errors (change the number in scenegeo if u want). You have been warned.")

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
  },1)
  const mesh = new util.Mesh(f,"pillars-dragon",cb.ex());
  cb.c()
  //normmap.when(()=>debugTex(device, [256, 256], normmap)())
})

scene = Dragons

function onDoneLoad(){
}