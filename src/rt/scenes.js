import { files } from "../../assets/scene1.js";
import { affineTransform, discretechoice } from "../util/menial/convenience.js";
import { FileContextRemote, Mesh } from "../util/util.js";
import { Material, materials } from "./fullrt/materialfns.js";
import { BVHContext } from "./splitter.js";




class FakeFiles{
  constructor(){
    this.files=files;
  }
  getfile(path,cb){
    const binstr = atob(this.files[path])
    const buf =new TextEncoder().encode(binstr);
    cb(null,buf.buffer)
  }
}

const assets = new FileContextRemote("f/assets/scene1/pillars-");

const registry = materials.registry

// const warmGlass = registry.register(new Material({
//   diffuseStr:0, transness:1, transmitCol:[1,1,1],ior:1.3,emissionCol:[0.1,0.08,0.04],absorbCol:[0.02,0.02,0.02],roughness:0.03
// }))
const darkmirror = registry.register(new Material({
  reflectStr:1, reflectCol:[0.5,0.5,0.5]
}))
// const foggyglass = registry.register(new Material({
//   reflectStr:1, transness:1, transmitCol:[1,1,1],ior:1.3,absorbCol:[0.02,0.02,0.02],roughness:0.03
// }))


if(registry.device) registry.upload();
/**
 * @param {BVHContext} bvhctx 
 */
export const Dragons = async function(bvhctx){}



export async function buildScene(bvhctx, str){
  (async ()=>{
    await 3;
    console.log("here")
    registry.materials.length = 7;
    const dragon = await new Mesh(assets, "dragon");
    const pillars = await new Mesh(assets, "pillar");
    const cube = await new Mesh(assets, "cube");
    console.log(dragon);
    eval(str);
    bvhctx.make();
  })()

}
export const teststr = `


  bvhctx.addMesh(dragon, materials.glowglass, affineTransform({xrot:-Math.PI/2,yrot:3,offset:[4,0,6]}))
  bvhctx.addMesh(pillars, darkmirror, affineTransform({scale:3,offset:[0,-3,0]}));

  for(let i=0; i<100; i++){
    let theta = Math.random()*Math.PI*2;
    let h = Math.random()*Math.random()*50-3
    let r = Math.random()+1;
    let d = Math.random()*15+20;
    bvhctx.addCircle([Math.cos(theta)*d,h,-Math.sin(theta)*d],r,discretechoice([1,1],[materials.glass,materials.glowglass]))
  }

`