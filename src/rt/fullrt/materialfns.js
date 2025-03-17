import { globalResetBuffer } from "../../util/gpu/camera.js";




export class Material{
  constructor({
    diffuseCol = [0.5,0.5,0.5],
    diffuseStr = 1,
    specularCol = [0.5,0.5,0.5],
    specularHardness = 400, //SPECULAR HARDNESS. I NAME THING DUMB
    reflectCol = [0.9,0.9,0.9],
    reflectStr = 0,
    emissionCol = [0,0,0], 
    absorbCol = [0.2,0.2,0.2],
    transmitCol = [1,1,1],
    transness = 0,
    ior = 1,
  }={}){
    this.diffuseCol = new Float32Array([diffuseCol[0],diffuseCol[1],diffuseCol[2]]);
    this.diffuseStr = diffuseStr;
    this.specularCol = new Float32Array([specularCol[0],specularCol[1],specularCol[2]]);
    this.specularHardness = specularHardness
    this.reflectCol = new Float32Array([reflectCol[0],reflectCol[1],reflectCol[2]]);
    this.reflectStr = reflectStr
    this.emitCol = new Float32Array([emissionCol[0],emissionCol[1],emissionCol[2]]);
    this.transness = transness
    this.transCol = new Float32Array([transmitCol[0],transmitCol[1],transmitCol[2]]);
    this.ior = ior
    this.absorbCol = new Float32Array([absorbCol[0],absorbCol[1],absorbCol[2]])
  }
  static GPUStride = 6;
  static stride = 6*16;
  static diffuseGO = 0
  static diffuseColOffset = 0
  static diffuseStrOffset = 3

  static specularGO = 1
  static specularColOffset = 4
  static specularHardnessOffset = 7
  
  static reflectGO = 2
  static reflectColOffset = 8
  static reflectStrOffset = 11
  
  static emitGO = 3
  static emitColOffset = 12
  static transnessOffset = 15

  static transGO = 4
  static transColOffset = 16
  static iorOffset = 19

  static absorbGO = 5
  static absorbColOffset = 20
  
  static vecparams = ["diffuseCol","specularCol","reflectCol","emitCol", "transCol","absorbCol"]
  static singleparams = ["diffuseStr","specularHardness","reflectStr","transness","ior"]
  /**
   * 
   * @param {DataView} v 
   */
  toView(v,offset){
    Material.vecparams.forEach((f)=>{
      for(let i=0; i<3; i++){
        v.setFloat32(Material[f+"Offset"]*4+i*4+offset,this[f][i],true)
      }
    })
    Material.singleparams.forEach((f)=>{
      v.setFloat32(Material[f+"Offset"]*4+offset,this[f],true)
    })
  }
  valueOf(){
    return this.idx;
  }
}
export class MaterialRegistry{
  constructor(){
    this.materials = []
  }
  register(mat){
    if(mat instanceof Material){
      let idx = this.materials.length;
      this.materials.push(mat)
      mat.idx = idx;
      return mat;
    }
    return 0
  }
  upload(device){
    const cpubuf = this.cpu = new Float32Array(this.materials.length*Material.GPUStride*4)
    let v = new DataView(cpubuf.buffer);
    this.materials.forEach((m,i)=>m.toView(v,i*Material.stride))
    globalResetBuffer.buffer();

    if((device == undefined || this.device == device) && this.gpubuf){
      this.device.queue.writeBuffer(this.gpubuf, 0, cpubuf)
      return this.gpubuf
    }
    this.device = device;
    const gpubuf = this.gpubuf = device.createBuffer({
      label: "Material Uniform",
      size: Material.stride*MaterialRegistry.MAXSLOTS,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(gpubuf, 0, cpubuf);
    return gpubuf;
  }
  static MAXSLOTS = 16
}

export function scenematfns(group, binding){
  return /*wgsl*/`

  @group(${group}) @binding(${binding}) var<uniform> materials:array<vec4f, ${Material.GPUStride*MaterialRegistry.MAXSLOTS}>;
  
  struct bsdfsample{
    through:vec3f,
    terminate:bool,
    dir:vec3f,
    emit:vec3f,
    absorb:vec3f,
    transmitsign:i32,
  }
  fn materialVec(matind:u32, offset:u32)->vec4f{
    return materials[matind*${Material.GPUStride}+offset];
  }
  fn sampleBRDF(normal:vec3f, dir:vec3f, id:u32)->bsdfsample{
    var r=unitRand();
    var b:bsdfsample;
    let emitInfo = materialVec(id, ${Material.emitGO});
    let reflectDir = normalize(dir-2*dot(dir,normal)*normal);
    b.emit = emitInfo.xyz;
    b.terminate = false;
    b.transmitsign = 0;
    b.absorb = vec3f(0,0,0);
    
    r-=emitInfo.w;
    if(r<0){
      let transInfo = materialVec(id, ${Material.transGO});
      let term1 = ((1-transInfo.w)/(1+transInfo.w));
      let rsch = term1*term1;
      let ct = clamp(dot(-dir,normal),-1,1);
      let fresreflect = rsch+(1-rsch)*pow(1-abs(ct),5);
      let nrat = select(transInfo.w, 1/transInfo.w, ct>0);
      let sq_trm = 1-nrat*nrat*(1-ct*ct);
      // if(ct<0){
      //   b.terminate = true;
      //   b.emit=vec3f(sq_trm,-sq_trm,0);
      // }
      if(sq_trm<=0 || unitRand()<fresreflect){
        b.through = transInfo.rgb;
        b.dir = reflectDir;
        b.emit = vec3(0,0,0);
        //b.terminate=true;
        return b;
      } else {
        b.through = transInfo.rgb;
        b.dir = normalize(dir*nrat+normal*(nrat*abs(ct)-sqrt(sq_trm)));
        b.transmitsign = select(-1,1,ct>0);
        b.absorb = vec3f(0,0,0);
        return b;
      }
    }

    let reflectInfo = materialVec(id, ${Material.reflectGO});
    r-=reflectInfo.w;
    if(r<0){
      b.through = reflectInfo.xyz;
      b.dir = reflectDir;
      return b;
    }


    let diffuseInfo = materialVec(id, ${Material.diffuseGO});
    r-=diffuseInfo.w;
    if(r<0){
      var outdir:vec3f;
      var pdf:f32;
      if(unitRand()<sun.sundiskshare){
        outdir = coneRandDir(sun.suntheta, sun.sunphi, sun.sundisk);
        pdf = sun.sundiskshare/(1-cos(sun.sundisk));
      } else {
        outdir = hemisphereRand(normal);
        pdf = (1-sun.sundiskshare)/(2*PI);
      }

      //diffuse
      var brdf = max(0,dot(normal, outdir))*diffuseInfo.rgb/(2*PI);
      //specular
      let specularInfo = materialVec(id, ${Material.specularGO});
      brdf += pow(max(0,dot(reflectDir, outdir)),specularInfo.w)*specularInfo.rgb;

      b.dir = outdir;
      b.through = max(brdf/pdf,vec3f(0,0,0));
      if(dot(outdir, normal)<=0){
        b.terminate = true;
      }
      return b;
    }
    b.terminate = true;
    return b;
  }
  fn evaluatePhong(normal:vec3f, dir:vec3f, outdir:vec3f, id:u32)->vec3f{
    let diffuseInfo = materialVec(id, ${Material.diffuseGO});
    let specularInfo = materialVec(id, ${Material.specularGO});
    let halfvec = normalize(-dir+outdir);
    return diffuseInfo.w*max(0,dot(outdir,normal))*diffuseInfo.xyz + 
           pow(max(0,dot(halfvec, normal)),specularInfo.w)*specularInfo.xyz;
  }
  
  
  `
}

const registry = new MaterialRegistry();
const basic = new Material(); registry.register(basic);
const mirror = new Material({
  diffuseStr:0, reflectStr:0.99, reflectCol:[1,1,0.5]
}); registry.register(mirror);
export const materials = window.materials = {
  basic:basic, 
  mirror:mirror,
  glass: registry.register(new Material({
    diffuseStr:0, transness:1, transmitCol:[1,1,1],ior:1.3
  })),
  glow: registry.register(new Material({
    emissionCol:[1,1,1]
  })),
  glowglass: registry.register(new Material({
    diffuseStr:0, transness:1, transmitCol:[1,1,1],ior:1.3,emissionCol:[1,0,0]
  })),
  registry:registry,
}