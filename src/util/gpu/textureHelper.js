import * as util from "../util.js"
import * as ver from "./verbose.js"

export class BasicImageTx extends util.File{
  constructor(filecontext, path, device, cb){
    super(filecontext, path, ()=>{
      this.unsettle()
      if(!this.found) return new Error("could not resolve texture file");
      const blob = new Blob([this.content], { type: 'image/png' })
      createImageBitmap(blob).then(bitmap=>{
        const canvas = document.createElement('canvas');
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(bitmap, 0,0);
        const buf = ctx.getImageData(0,0,bitmap.width, bitmap.height).data
        this.tx = ver.tx(device, "image texture: "+path, [bitmap.width,bitmap.height],"rgba8unorm", "dat")
        
        device.queue.writeTexture({
          texture:this.tx
        }, buf, {
          bytesPerRow:bitmap.width*4,
          rowsPerImage:bitmap.height,
        }, {width:bitmap.width, height:bitmap.height})
        /*device.queue.copyExternalImageToTexture({
          source: bitmap,
        }, {
          texture:this.tx
        },{
          width:bitmap.width, height:bitmap.heigth
        })*/
        canvas.remove()
        this.settle()
      })
    })
    this.path = path;
    this.device = device;
    this.when(cb);
  }
  createView(){
    return this.tx.createView()
  }
  //Texture on binding 0, sampler on binding 1
  simplebg(){
    const samBgl = ver.bgl(this.device, "basic bgl: "+this.path, [
      {r:"s", t:"n"},{r:"t"},
    ]);
    const samBG = ver.bg(samBgl, "debug BG", [
      this.device.createSampler({}),this.tx.createView(),
    ]);
    return samBG
  }
}