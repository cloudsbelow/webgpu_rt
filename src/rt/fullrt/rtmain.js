import { sceneatmofns } from "../../modules/atmosphere.js";
import { globalResetBuffer } from "../../util/gpu/camera.js";
import * as ver from "../../util/gpu/verbose.js";
import { keys } from "../../util/util.js";
import { cgFuncs, randomFuncs } from "../headers/util.js";
import { scenematfns } from "./materialfns.js";
import { scenegeofns } from "./scenetrace.js";



function genCode(size){
return /*wgsl*/`

const width = ${size[0]};
const height = ${size[1]};
const maxSceneDist:f32 = 10000000000.;
const minSceneDist:f32 = 0.01;

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
${scenematfns(1,1)}

fn getRadiance(spos:vec3f, sdir:vec3f, depth:u32)->vec3f{
  var light = vec3f(0,0,0);
  var trans = vec3f(1,1,1);
  var pos = spos;
  var dir = sdir;
  for(var i:u32=0; i<depth; i++){
    let hit = raytrace(pos,dir,minSceneDist*(1+4*length(pos)),maxSceneDist);
    let atmo = atmosphereScatter(dir, pos, hit.dist);
    light+=trans*atmo.inscat;
    trans*=atmo.transmittance;
    if(!hit.didhit){
      return light;
    }
    let directSun = getSunPower(hit.wpos)*evaluatePhong(hit.normal, dir, sun.dir, hit.material);
    if(directSun.r>0){
      let shadowray = raytrace(hit.wpos, sun.dir, minSceneDist*(1+length(pos)),maxSceneDist).dist;
      if(shadowray>=maxSceneDist){
        light+=trans*directSun;
      }
    }
    let sample = sampleBRDF(hit.normal, dir, hit.material);
    light+=trans*sample.emit;
    if(sample.terminate){
      return light;
    }
    trans*=sample.through;
    dir=sample.dir;
    pos=hit.wpos;
    let importance = dot(trans, vec3(0.5,0.7,0.4));
    if(importance<0.4){
      trans*=2;
      if(unitRand()<0.5){
        return light;
      }
    }
  }
  return light;
}

${ver.screenVertexQuad}
@fragment
fn fragmentMain(@builtin(position) spos:vec4f)->@location(0) vec4f{
  let pixelcoord:vec2u = vec2u(floor(spos.xy));
  randState = pixelcoord.x+pixelcoord.y*width+textureLoad(randstatetx,pixelcoord).x;
  let ndc=vec4f((spos.xy-vec2(0.5,0.5)+vec2(unitRand(),unitRand()))*2/vec2f(width, -height)-vec2f(1,-1),1,1);
  let dirvec=normalize((cam.aInv*ndc).xyz);

  var out = vec4(getRadiance(cam.loc, dirvec, 20),1);

  textureStore(randstatetx,pixelcoord,vec4u(randState, 0,0,0));
  let pixidx = pixelcoord.x+pixelcoord.y*width;
  let acc = accumulator[pixidx]+out;
  accumulator[pixidx]=acc;
  return vec4(srgb(acc*sun.gain/acc.w).xyz+(unitRand()*0.01-0.005),select(1.,0.,dot(acc,vec4(1,1,1,1))>=0 || dot(acc,vec4(1,1,1,1))<0));
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
      if(keys.KeyR || globalResetBuffer.consume()) resetfn(encoder,size[0]*size[1]/32,1,1);
    },
    tx: outtx
  }
}