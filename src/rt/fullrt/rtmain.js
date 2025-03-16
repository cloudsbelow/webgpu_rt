import { sceneatmofns } from "../../modules/atmosphere.js";
import * as ver from "../../util/gpu/verbose.js";
import { keys } from "../../util/util.js";
import { cgFuncs, randomFuncs } from "../headers/util.js";
import { scenegeofns } from "./scenetrace.js";



function genCode(size){
return /*wgsl*/`

const width = ${size[0]};
const height = ${size[1]};

struct camStruct {
  pMatrix:mat4x4f,
  aInv:mat4x4f,
  loc:vec3f,
  np:f32,
}
@group(1) @binding(0) var<uniform> cam: camStruct;
@group(0) @binding(0) var randstatetx:texture_storage_2d<r32uint,read_write>;
@group(0) @binding(1) var<storage, read_write> accumulator:array<vec4f>;

${randomFuncs}
${cgFuncs}
${scenegeofns(2)}
${sceneatmofns(3)}


${ver.screenVertexQuad}
const maxSceneDist:f32 = 10000000000.;
@fragment
fn fragmentMain(@builtin(position) spos:vec4f)->@location(0) vec4f{
  let pixelcoord:vec2u = vec2u(floor(spos.xy));
  randState = pixelcoord.x+pixelcoord.y*width+textureLoad(randstatetx,pixelcoord).x;
  let ndc=vec4f((spos.xy-vec2(0.5,0.5)+vec2(unitRand(),unitRand()))*2/vec2f(width, -height)-vec2f(1,-1),1,1);
  let dirvec=normalize((cam.aInv*ndc).xyz);
  let dist:f32=raytrace(cam.loc, dirvec, 0.01,maxSceneDist);
  
  var out=vec4f(0,0,0,0); //= vec4f(1/dist,0,0,1);
  if(dist<maxSceneDist){
    out = vec4(1,1,0,1);
  }
  /*if(dist>=10000){
    out = vec4f(atmosphereScatter(dirvec, cam.loc, 100000000, vec3(0,0,0)),1);
  }*/
  out = vec4(atmosphereScatter(dirvec, cam.loc, dist, out.xyz),1);

  textureStore(randstatetx,pixelcoord,vec4u(randState, 0,0,0));
  let pixidx = pixelcoord.x+pixelcoord.y*width;
  let acc = accumulator[pixidx]+out;
  accumulator[pixidx]=acc;
  return srgb(acc/acc.w);
}
`
}










const resetCode = /*wgsl*/`
@group(0) @binding(0) var randstatetx:texture_storage_2d<r32uint,read_write>;
@group(0) @binding(1) var<storage, read_write> accumulator:array<vec4f>;
@compute
@workgroup_size(32,1,1)
fn main(@builtin(global_invocation_id) pix:vec3u){
  accumulator[pix.x]=vec4(0,0,0,0);
}
`

export function genrtpass(device,size,cambg,rtdat,atmodat){
  const outtx = ver.tx(device, "rt texture", size, "rgba16float", "ta");
  const randtx = ver.tx(device, "random state texture", size, "r32uint", "s");
  const accbuf = device.createBuffer({
    label: "accumulation buffer",
    size: 4*4*size[0]*size[1],
    usage: GPUBufferUsage.STORAGE,
  });
  

  const statebgl = ver.bgl(device, "rt state layout", [{r:'w',f:'r32uint',a:"b"},{r:'b',t:"s",v:"cf"}])
  const statebg = ver.bg(statebgl, "rt state group", [randtx.createView(),{buffer:accbuf}]);
  const rpfn = ver.rp(device, "raytracing shader", 
    [statebgl,cambg.bgl,rtdat.bgl,atmodat.bgl], 
  null, genCode(size), ['rgba16float'],null);
  
  const resetfn = ver.qcp(device, "reset group", resetCode, "main",[statebg]);

  window.rtcode = genCode(size);
  return {
    fn: (encoder)=>{
      rpfn(encoder, null, 6, null, [outtx], [statebg,cambg, rtdat.bg, atmodat.bg])
      if(keys.KeyR) resetfn(encoder,size[0]*size[1]/32,1,1);
    },
    tx: outtx
  }
}