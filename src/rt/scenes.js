import { affineTransform, discretechoice } from "../util/menial/convenience.js";
import { FileContextRemote, Mesh } from "../util/util.js";
import { Material, materials } from "./fullrt/materialfns.js";
import { BVHContext } from "./splitter.js";






const assets = new FileContextRemote("f/assets/scene1/");

const registry = materials.registry
const blueGlass = registry.register(new Material({
  diffuseStr:0, transness:1, transmitCol:[1,1,1],ior:1.3,emissionCol:[0.01,0.03,0.05],absorbCol:[0.02,0.02,0.015],roughness:0.03
}))
const warmGlass = registry.register(new Material({
  diffuseStr:0, transness:1, transmitCol:[1,1,1],ior:1.3,emissionCol:[0.1,0.08,0.04],absorbCol:[0.02,0.02,0.02],roughness:0.03
}))
const darkmirror = registry.register(new Material({
  reflectStr:1, reflectCol:[0.5,0.5,0.5]
}))



if(registry.device) registry.upload();
/**
 * @param {BVHContext} bvhctx 
 */
export const Dragons = async function(bvhctx){
  const dragon = new Mesh(assets, "pillars-dragon");
  const pillars = new Mesh(assets, "pillars-pillar");
  await dragon;
  await pillars;

  bvhctx.addMesh(dragon, blueGlass, affineTransform({xrot:-Math.PI/2, offset:[-4,0,-6]}))
  bvhctx.addMesh(dragon, materials.glowglass, affineTransform({xrot:-Math.PI/2,yrot:3,offset:[4,0,6]}))
  
  bvhctx.addMesh(pillars, 0, affineTransform({scale:3,offset:[0,-3,0]}));

  bvhctx.addCircle([0,-302,0],300,darkmirror);

  for(let i=0; i<60; i++){
    const theta = Math.random()*2*Math.PI;
    const r = Math.random()*10+25
    const h = Math.random()*20-1
    const rad = Math.random()+1
    bvhctx.addCircle([Math.cos(theta)*r,h,Math.sin(theta)*r],rad,discretechoice([1],[warmGlass]))
  }
  for(let i=0; i<20; i++){
    const theta = Math.random()*2*Math.PI;
    const r = Math.random()*10+25
    const h = Math.random()*10+20
    const rad = Math.random()+1
    bvhctx.addCircle([Math.cos(theta)*r,h,Math.sin(theta)*r],rad,discretechoice([1],[warmGlass]))
  }
  for(let i=0; i<20; i++){
    const theta = Math.random()*2*Math.PI;
    const r = Math.random()*10+25
    const h = Math.random()*20+30
    const rad = Math.random()+1
    bvhctx.addCircle([Math.cos(theta)*r,h,Math.sin(theta)*r],rad,discretechoice([1],[warmGlass]))
  }
  // for(let i=0; i<70; i++){
  //   const theta = Math.random()*2*Math.PI;
  //   const r = Math.sqrt(Math.random())*70
  //   const h = Math.random()*30+20
  //   const rad = Math.random()*2+2
  //   bvhctx.addCircle([Math.cos(theta)*r,h,Math.sin(theta)*r],rad,discretechoice([1],[materials.glass]))
  // }
}