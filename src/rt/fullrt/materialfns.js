import { globalResetBuffer } from "../../util/gpu/camera.js";




export class Material{
  constructor({
    diffuse = [0.5,0.5,0.5],
    diffusestr = 1,
    specular = [0.5,0.5,0.5],
    specstr = 400, //SPECULAR HARDNESS. I NAME THING DUMB
    reflectcolor = [0.9,0.9,0.9],
    reflectivity = 0,
    emission = [0,0,0],
    ior = 0,
  }={}){
    this.diffuseCol = new Float32Array([diffuse[0],diffuse[1],diffuse[2]]);
    this.diffuseStr = diffusestr;
    this.specularCol = new Float32Array([specular[0],specular[1],specular[2]]);
    this.specularStr = specstr
    this.reflectCol = new Float32Array([reflectcolor[0],reflectcolor[1],reflectcolor[2]]);
    this.reflectStr = reflectivity
    this.emitCol = new Float32Array([emission[0],emission[1],emission[2]]);
  }
  static stride = 64;
  static GPUStride = 64/16;
  static diffuseGO = 0
  static diffuseColOffset = 0
  static diffuseStrOffset = 3

  static specularGO = 1
  static specularColOffset = 4
  static specularStrOffset = 7
  
  static reflectGO = 2
  static reflectColOffset = 8
  static reflectStrOffset = 11
  
  static emitGO = 3
  static emitColOffset = 12
  
  static vecparams = ["diffuseCol","specularCol","reflectCol","emitCol"]
  static singleparams = ["diffuseStr","specularStr","reflectStr"]
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
      return idx;
    }
    return 0
  }
  upload(device){
    const cpubuf = this.cpu = new Uint8Array(this.materials.length*Material.stride)
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
  static MAXSLOTS = 4
}

export function scenematfns(group, binding){
  return /*wgsl*/`

  @group(${group}) @binding(${binding}) var<uniform> materials:array<vec4f, ${Material.GPUStride*MaterialRegistry.MAXSLOTS}>;
  
  struct bsdfsample{
    through:vec3f,
    dir:vec3f,
    emit:vec3f,
    terminate:bool,
  }
  fn materialVec(matind:u32, offset:u32)->vec4f{
    return materials[matind*${Material.GPUStride}+offset];
  }
  fn sampleBRDF(normal:vec3f, dir:vec3f, id:u32)->bsdfsample{
    var r=unitRand();
    var b:bsdfsample;
    b.emit = materialVec(id, ${Material.emitGO}).xyz;
    b.terminate = false;

    let reflectInfo = materialVec(id, ${Material.reflectGO});
    r-=reflectInfo.w;
    let reflectDir = normalize(dir-2*dot(dir,normal)*normal);
    if(r<0){
      b.through = reflectInfo.xyz;
      b.dir = reflectDir;
      return b;
    }
    let diffuseInfo = materialVec(id, ${Material.diffuseGO});
    r-=diffuseInfo.w;
    if(r<0){
      let outdir = hemisphereRand(normal);
      //diffuse
      var color = max(0,dot(normal, outdir))*diffuseInfo.xyz;
      //specular
      let specularInfo = materialVec(id, ${Material.specularGO});
      color += pow(max(0,dot(reflectDir, outdir)),specularInfo.w)*specularInfo.xyz;
      b.dir = outdir;
      b.through = color;
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
export const materials = window.materials = {
  basic:basic, 
  
  registry:registry,
}