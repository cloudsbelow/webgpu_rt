import { globalResetBuffer } from "../util/gpu/camera.js";
import { debugTex } from "../util/gpu/debugtex.js";
import * as ver from "../util/gpu/verbose.js"

const skyParams = /*wgsl*/`
const PI=3.14159265;

const scaleFactor = 0.000001; //10^-6 for earth
const rScat = vec3f(5.802, 13.558, 33.1)*scaleFactor;
const rExt = rScat;
const mScat = 1.5*scaleFactor; //reduced because it looked trash (from 3.996)
const mAbs = 4.40*scaleFactor;
const mExt = mScat+mAbs;
const mAsym = 0.8; //'g'
const oAbs = vec3f(0.650, 1.881, 0.085)*scaleFactor;
const oExt = oAbs;

const gRad = 6340000; //6340 km
const aWidth = 100000; //100 km
const aRad = gRad+aWidth;

const gAlbedo = vec3f(0.5,0.5,0.5);
`;

const rAt = /*wgsl*/`let rAt=exp(-salt/8000);`;
const mAt = /*wgsl*/`let mAt=exp(-salt/2000);`;
const oAt = /*wgsl*/`let oAt=max(0, 1-abs(salt-25000)/15000);`;
const eAt = /*wgsl*/`let eAt=rAt*rExt+mAt*mExt+oAt*oExt;`;

export class AtmosphereConsts{
  constructor(device){
    this.device = device;
    this.gpubuf = device.createBuffer({
      label: "Sky Uniform",
      size: 8*4,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.cpubuf = new Float32Array(8);
    this.theta=0;
    this.phi=1;
    this.alt=0;
    this.alt=100;
    this.gain = 1;
    this.setSunPos()
    this.setSunColor(5,5,5);
    this.setGain()
  }
  setSunPos(alt, phi, theta=undefined){
    this.theta = (theta = theta??this.theta);
    this.phi = (phi = phi??this.phi);
    this.alt = (alt = alt??this.alt)
    this.cpubuf[0]=Math.cos(theta)*Math.cos(phi);
    this.cpubuf[1]=Math.sin(phi);
    this.cpubuf[2]=Math.sin(theta)*Math.cos(phi);
    this.cpubuf[3]=alt;
    this.device.queue.writeBuffer(this.gpubuf, 0, this.cpubuf);
    globalResetBuffer.buffer()
  }
  setSunColor(r,g,b){
    this.cpubuf[4]=r;
    this.cpubuf[5]=g;
    this.cpubuf[6]=b;
    this.device.queue.writeBuffer(this.gpubuf, 0, this.cpubuf);
    globalResetBuffer.buffer()
  }
  setGain(g){
    this.gain = (g=g??this.gain);
    this.cpubuf[7]=g
    this.device.queue.writeBuffer(this.gpubuf, 0, this.cpubuf);
    globalResetBuffer.buffer()
  }
}

export function sceneatmofns(group){
  return skyParams+/*wgsl*/`
    @group(${group}) @binding(0) var trans:texture_2d<f32>;
    @group(${group}) @binding(1) var mscat:texture_2d<f32>;
    @group(${group}) @binding(2) var fsampler:sampler;
    struct sunStruct {
      dir:vec3f, //MUST BE UNIT
      alt:f32,
      col:vec3f,
      gain:f32,
    }
    @group(${group}) @binding(3) var<uniform> sun:sunStruct;
    
    struct atmosphereResult{
      inscat:vec3f,
      transmittance:vec3f,
    }

    fn atmosphereScatter(dir:vec3f, rpos:vec3f, maxdist:f32)->atmosphereResult{
      const sampleCount = 20.;
      var pos=vec3f(0,sun.alt+gRad,0)+rpos;
      let ct=dot(dir,sun.dir);
      let cts=ct*ct;
      let rphase:f32 = fma(cts, 3./16./PI, 3./16./PI); 
      const thing = (3./(8.*PI))*(1.-mAsym*mAsym)/(2.+mAsym*mAsym); //average const 
      let csdenom=pow(fma(ct, -2.*mAsym, 1.+mAsym*mAsym),3./2.);
      let mphase=fma(cts, thing, thing)/csdenom;

      let hcos = dot(pos,dir); //lol prolly should put this in a block
      let sqrtval = hcos*hcos-dot(pos,pos);
      let aedge = -hcos+sqrt(sqrtval+aRad*aRad);
      let ghit = -hcos-sqrt(sqrtval+gRad*gRad-gRad*aWidth/2);
      let dist = min(maxdist, select(aedge,ghit,ghit>0));
      let stepsize = dist/sampleCount;
      let step = dir*stepsize;
      pos+=step*unitRand();

      //return vec3(rphase,mphase,abs(sun.alt)+1);
      var transmittance=vec3f(1,1,1);
      var light=vec3f(0,0,0);
      for(var i=0.; i<sampleCount; i+=1){
        let salt = length(pos)-gRad;
        ${rAt+mAt+oAt+eAt}
        let scoords = vec2f(
          acos(dot(pos,sun.dir)/length(pos))/PI,
          salt/aWidth
        );
        let rAc = min(rAt, 1);
        let mAc = min(mAt, 1);

        let inoutscat=(
          //first-order scattering
          textureSampleLevel(trans, fsampler, scoords, 0).rgb*
            (rScat*rAc*rphase+mScat*mAc*mphase)+
          //higher-order scattering
          textureSampleLevel(mscat, fsampler, scoords,0).rgb*
            (rScat*rAc+mScat*mAc)/4/PI
        )/eAt;
        let segtrans = exp(-stepsize*eAt);
        light += (-inoutscat*segtrans+inoutscat)*transmittance;
        transmittance *= segtrans;
        pos+=step;
      }
      var ret:atmosphereResult;
      ret.inscat = light*sun.col;
      ret.transmittance = transmittance;
      return ret;
    }

    fn getSunPower(rpos:vec3f)->vec3f{
      let pos=vec3f(0,sun.alt+gRad,0)+rpos;
      let salt = length(pos)-gRad;
      let scoords = vec2f(
        acos(dot(pos, sun.dir)/length(pos))/PI,
        salt/aWidth
      );
      return textureSampleLevel(trans, fsampler, scoords, 0).xyz*sun.col;
    }
  `
}

export function skyFn(device){
  const transDim=[256,64];
  const transCode=/*wgsl*/`
    @group(0) @binding(0) var trans:texture_storage_2d<rgba16float, write>;

    const sampleCount=40f;
    ${skyParams}

    @compute
    @workgroup_size(8,8)
    fn main(
      @builtin(global_invocation_id) pix:vec3u,
    ){
      var pos = vec2f(0,1+gRad+f32(pix.y)*aWidth/${transDim[1]});
      let theta = f32(pix.x)*PI/${transDim[0]};
      let dir = vec2f(sin(theta),cos(theta));

      let hcos = pos.y*dir.y;
      let sqrtval = hcos*hcos-pos.y*pos.y; //compiler insecurity
      let dist = -hcos+sqrt(sqrtval+aRad*aRad); //circle-interior ray
      let stepsize = dist/sampleCount;
      let step = dir*stepsize/2;

      //ground zeroing (technically superflous)
      if(-hcos-sqrt(sqrtval+gRad*gRad)>0){
        textureStore(trans, pix.xy, vec4f(0,0,0,0));
        return;
      }

      var absorption = vec3f(0,0,0);
      for(var i=0f; i<sampleCount; i+=1){
        pos+=step;
        let salt = length(pos)-gRad;
        ${rAt+mAt+oAt+eAt}
        absorption+=eAt*stepsize;
        pos+=step;
      }

      textureStore(trans, pix.xy, vec4f(exp(-absorption),1));
    }
  `;

  const mscatDim = [64,32];
  const mscatCode = /*wgsl*/`
    @group(0) @binding(0) var mscat:texture_storage_2d<rgba16float, write>;
    @group(0) @binding(1) var trans:texture_2d<f32>;
    @group(0) @binding(2) var fsampler:sampler;

    const sampleRays = 64f;
    const sampleCount = 16f; //killll meeeeee
    ${skyParams}

    @compute
    @workgroup_size(${mscatDim[0]},1)
    fn main(
      @builtin(global_invocation_id) pix:vec3u
    ){
      let sunzenith = f32(pix.x)*PI/${mscatDim[0]};
      let sundir = vec3f(sin(sunzenith),cos(sunzenith),0);
      let alt = 1+f32(pix.y)*aWidth/${mscatDim[1]};

      var inscat = vec3f(0,0,0);
      var fms = vec3f(0,0,0); //only needs to be computed by alt but is virutally free
      //OPTIMIZATION TODO: replace this loop by z-depth in workgroup for stronger cards
      for(var i=0.5f; i<sampleRays; i+=1){
        //let i=f32(pix.x)+0.5;
        let phi = asin(2*i/(sampleRays)-1);
        let theta = 1.92*i;
        let dir=vec3f(
          cos(phi)*cos(theta),
          sin(phi),
          cos(phi)*sin(theta)
        );
        var pos = vec3f(0,alt+gRad,0);
        var transmittance = vec3f(1,1,1);

        let hcos = pos.y*dir.y; //contrary to popular belief (coordinate space woes)
        let sqrtval = hcos*hcos-pos.y*pos.y;
        let aedge = -hcos+sqrt(sqrtval+aRad*aRad);
        let ghit = -hcos-sqrt(sqrtval+gRad*gRad);
        let dist = select(aedge,ghit,ghit>0);
        let stepsize = dist/sampleCount;
        let step = dir*stepsize/2;
        
        for(var j=0f; j<sampleCount; j+=1){
          pos+=step; //again, midpoint sampling
          let salt = length(pos)-gRad;
          ${rAt+mAt+oAt+eAt}
          //absorption+=eAt*stepsize;
          //let scat=(rScat*rAt+mScat*mAt)*exp(-absorption);
          let strans = textureSampleLevel(trans, fsampler, vec2f(
            acos(dot(pos,sundir)/length(pos))/PI,
            (salt-gRad)/aWidth
          ), 0).rgb;
          //inscat+=scat*stepsize*strans;
          //fms+=scat*stepsize;
          let inoutscat = (rAt*rScat+mScat*mAt)/eAt;
          let segtrans = exp(-stepsize*eAt);
          inscat += (-inoutscat*segtrans+inoutscat)*transmittance*strans;
          fms += (-inoutscat*segtrans+inoutscat)*transmittance;
          
          transmittance *= segtrans;
          pos+=step;
        }
        if(ghit>0){
          let cthit = dot(pos,sundir)/length(pos);
          inscat+=textureSampleLevel(trans, fsampler, vec2f(
            acos(cthit)/PI,0
          ), 0).rgb*transmittance*cthit*gAlbedo/PI;
        }
      }
      //Renormalize fms and inscat at the end
      //Remember: integration->1 so if sampled, dA negates pu
      textureStore(mscat, pix.xy, vec4f(
        inscat/(1-fms/sampleRays)/sampleRays
      ,1));
    }
  `;

  const transTex = ver.tx(device, "transmittance tx", transDim, 'rgba16float','ts');
  const transBGL = ver.bgl(device, "transmittance generation BGL", [{r:"w", f:"rgba16float", v:"c"}]);
  const transBG = ver.bg(transBGL, "transmittance generation BG", [transTex.createView()]);

  const bbsam=device.createSampler({
    magFilter: "linear",
    minFilter: 'linear',
  });
  const mscatTex = ver.tx(device, "mscat tx", mscatDim, 'rgba16float','ts');
  const mscatBGL = ver.bgl(device, "multiple scattering BGL", [
    {r:"w", f:"rgba16float", v:"c"}, {r:"t"}, {r:"s"}
  ]);
  const mscatBG = ver.bg(mscatBGL, "multiple scattering BG", [
    mscatTex.createView(), transTex.createView(), bbsam
  ]);
  
  const encoder = device.createCommandEncoder();
  ver.qcp(device, "transmittance generation pipe", transCode, "main", [transBG])
    (encoder,transDim[0]/8,transDim[1]/8);
  ver.qcp(device, "multiple scattering pipe", mscatCode, "main", [mscatBG])
    (encoder,1,mscatDim[1]);
  device.queue.submit([encoder.finish()]);

  const sun = new AtmosphereConsts(device);

  if(false){
    debugTex(device, [256,256], transTex)()
    debugTex(device, [256,256], mscatTex)()
  }

  const fbg=ver.bg(ver.bgl(device, "atmosphere scattering layout",[
    {r:"t"},{r:"t"},{r:"s"},{r:"b"}
  ]),"atmosphere scattering bindgroup",[
    transTex.createView(),
    mscatTex.createView(),
    bbsam, {buffer:sun.gpubuf}
  ]);

  return {
    params:sun,
    bg:fbg,
    bgl:fbg.bgl,
    transtx:transTex,
    mscattx:mscatTex,
  }
}
