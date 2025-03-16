import * as ver from "../../util/gpu/verbose.js";

const code = /*wgsl*/`

struct camStruct {
  pMatrix:mat4x4f,
  aInv:mat4x4f,
  loc:vec3f,
  np:f32,
}
@group(2) @binding(0) var<uniform> cam: camStruct;

${ver.screenVertexQuad}
const sundir = normalize(vec3(0.3,1,0.6));
const suncolor = vec3(1,0.9,0.7);
const ambient = vec3(0.1,0.1,0.1);

@fragment
fn fragmentMain(@builtin(position) spos:vec4f)->@location(0) vec4f{

  let normtex:vec4f = textureLoad(gbuf_n, vec2u(floor(spos.xy)),0);
  let norm = normalize(normtex.xyz);
  let ndc=vec4f(spos.xy*2/vec2f(width, -height)-vec2f(1,-1),1,1);
  let dirvec=(cam.aInv*ndc).xyz;
  let depth = cam.np/textureLoad(gbuf_d, vec2u(floor(spos.xy)), 0);
  let worldpos = dirvec*depth+cam.loc;

  if(depth>1000){
    //return vec4(2*ambient,0);
  } 
  let shadow = raytrace(worldpos+0.001*norm, sundir, 100);
  let intensity = max(0,dot(norm,sundir))*b(shadow>=100);

  
  //its hard to care about code efficiency with rt squatting in the bg
  let dirnorm = normalize(dirvec); 
  let ct = dot(dirnorm, cam.loc-vec3f(0,2,0));
  let det = sqrt(ct*ct-dot(cam.loc-vec3f(0,2,0), cam.loc-vec3f(0,2,0))+8.5*8.5);
  if((-ct-det)<depth*length(dirvec) && (-ct-det)>0){
    let coord = cam.loc+dirnorm*(-ct-det);
    if(atan2(coord.z,coord.x)>2){
      return vec4(1,1,0,0);
    }
  }
  if((-ct+det)<depth*length(dirvec) && (-ct+det)>0){
    let coord = cam.loc+dirnorm*(-ct+det);
    if(atan2(coord.z,coord.x)>2){
      return vec4(1,0,0,0);
    }
  }
  


  return vec4(intensity*suncolor+ambient,0);
  //vec4(dirvec,cam.loc.y/10);
  //vec4(worldpos/5,0);
}
`;

export function genpass(device, rtdat, gbufs, camerabg){
  const prefix = /*wgsl*/`
    const width = ${gbufs.size[0]};
    const height = ${gbufs.size[1]};
  `+ gbufs.wgsl(0)+rtdat.wgsl(1)
  const rpfn = ver.rp(
    device, "Simple defered shadows",
    [gbufs.bgl, rtdat.bgl, camerabg.bgl],null,
    prefix+code,
    ['rgba16float'],null
  );
  const outtx = ver.tx(device, "color texture out(raw)", gbufs.size, "rgba16float", "ta")
  return {
    fn:(encoder)=>{
      rpfn(encoder, null, 6, null, [outtx], [gbufs.bg, rtdat.bg, camerabg])
    },
    tx:outtx
  }
}