


export function scenematfns(group){
  return /*wgsl*/`
  
  
  `
}
export class Material{
  constructor({
    diffuse = [0.5,0.5,0.5],
    diffusestr = 1,
    specular = [0.5,0.5,0.5],
    specstr = 0,
    reflectcolor = [0.9,0.9,0.9],
    reflectivity = 0,
    emission = [0,0,0],
    ior = 0,
  }){
    this.diffuseCol = new Float32Array([diffuse[0],diffuse[1],diffuse[2]]);
    this.diffuseStr = diffusestr;
    this.specularCol = new Float32Array([specular[0],specular[1],specular[2]]);
    this.specularStr = specstr
    this.reflectCol = new Float32Array([reflectcolor[0],reflectcolor[1],reflectcolor[2]]);
    this.reflectStr = reflectivity

  }
  static diffuseColOffset = 0
  static diffuseStrOffset = 12
  static specularColOffset = 16
  static specularStrOffset = 28
  static reflectColOffset = 32
  static reflectStrOffset = 44
  /**
   * 
   * @param {DataView} v 
   */
  toView(v){

  }
}
export class MaterialRegistry{
  constructor(){
    this.materials = []
  }
  register(mat){
    if(mat instanceof Material){
      this.materials.push(mat)
      return this.materials.length-1;
    }
    return 0
  }
}