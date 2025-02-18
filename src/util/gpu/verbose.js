export function startWebGPU(callback, verbose = false){
  if (!navigator.gpu) {
    throw new Error("WebGPU not supported on this browser.");
  }
  navigator.gpu.requestAdapter().then((adapter)=>{
    if (!adapter) {
      throw new Error("No appropriate GPUAdapter found.");
    }
    adapter.requestDevice().then((device)=>{
      if(verbose) console.log(adapter.limits)
      if(typeof(objs) == 'object') objs.device = device;
      callback(device);
    });
  });
}

export function linkCanvas(device, canvas){
  const context = canvas.getContext("webgpu");
  canvasFormat = navigator.gpu.getPreferredCanvasFormat();
  context.configure({
    device: device,
    format: canvasFormat,
  });
  return [context, canvas];
}

function c_bgle(entry, i){
  let e={};
  e.binding=i;
  if(typeof(entry.v) == 'string'){
    e.visibility=0;
    if(entry.v.indexOf("c")!=-1)
      e.visibility |= GPUShaderStage.COMPUTE;
    if(entry.v.indexOf("f")!=-1)
      e.visibility |= GPUShaderStage.FRAGMENT;
    if(entry.v.indexOf("v")!=-1)
      e.visibility |= GPUShaderStage.VERTEX;
  } else if(typeof(entry.v) == 'number'){
    e.visibility=entry.v;
  } else {
    e.visibility=entry.r=="w"?6:7;
  }
    

  const ttypes = {
    f:"float",
    n:"unfilterable-float",
    d:"depth",
    s:"sint",
    u:"uint"
  }
  const tdimensions = {
    1:"1d", 2:"2d", 3:"3d",
    c:"cube", a:"2d-array", ca:"cube-array"
  }
  if(entry.r=="t"){ //tdm
    e.texture={
      sampleType: ttypes[entry.t]??entry.t??"float",
      viewDimension: tdimensions[entry.d]??entry.d??"2d",
      multisampled: entry.m??false,
    };
    
    
  }
  if(entry.r=="w"){ //fd
    e.storageTexture={
      format: entry.f,
      viewDimension: tdimensions[entry.d]??entry.d??"2d",
    };
  }

  const stypes = {
    f:"filtering",
    n:"non-filtering",
    c:"comparison"
  }
  if(entry.r=="s"){ //t
    e.sampler = {
      type:stypes[entry.t]??entry.t??"filtering",
    }
  }

  const btypes = {
    u:"uniform",
    r:"read-only-storage",
    s:"storage",
  }
  if(entry.r=="b"){ //tos
    e.buffer = {
      type: btypes[entry.t]??entry.t??"uniform",
      hasDynamicOffset: entry.o??false,
      minBindingSize: entry.s??0,
    }
  }

  return e
}
export function bgl(device, label, entries){
  const bgl = device.createBindGroupLayout({
    label:label,
    entries:entries.map(c_bgle)
  });
  bgl.device=device;
  return bgl
}

export function bg(bgl, label, entries){
  const bg = bgl.device.createBindGroup({
    label:label,
    layout:bgl,
    entries:entries.map((x,i)=>{return {binding:i, resource:x}})
  });
  bg.bgl=bgl;
  return bg;
}
const TextureUsageMap = {
  c: GPUTextureUsage.COPY_SRC,
  d: GPUTextureUsage.COPY_DST,
  t: GPUTextureUsage.TEXTURE_BINDING,
  s: GPUTextureUsage.STORAGE_BINDING,
  a: GPUTextureUsage.RENDER_ATTACHMENT,
}
export function tx(device, label, dim, format, usage, opt={}){
  let u = 0;
  for(let i=0; i<usage.length; i++) u|=TextureUsageMap[usage[i]];
  return device.createTexture({
    label:label,
    size:dim,
    dimension:opt.arr?"2d":dim.length+"d",
    mipLevelCount:opt.m??1,
    sampleCount:opt.s??1,
    format:format,
    usage: u
  })
}

export function qcp(device, label, code, entry, bgs){
  const smodule = device.createShaderModule({
    label: label+" shader",
    code: code,
  });
  const cpipe = device.createComputePipeline({
    label: label+" pipeline",
    layout:device.createPipelineLayout({
      bindGroupLayouts:bgs.map(x=>x.bgl)
    }),
    compute: {
      module: smodule,
      entryPoint: entry,
    }
  });
  return (encoder, sizeX, sizeY=1, sizeZ=1)=>{
    const pass = encoder.beginComputePass();
    pass.setPipeline(cpipe);
    bgs.forEach((bg, i) => {
      pass.setBindGroup(i,bg);
    });
    pass.dispatchWorkgroups(sizeX, sizeY, sizeZ);
    pass.end();
  }
}
export function qcpl(device, label, code, entry, bgls){
  const smodule = device.createShaderModule({
    label: label+" shader",
    code: code,
  });
  const cpipe = device.createComputePipeline({
    label: label+" pipeline",
    layout:device.createPipelineLayout({
      bindGroupLayouts:bgls
    }),
    compute: {
      module: smodule,
      entryPoint: entry,
    }
  });
  return (encoder, bgs, sizeX, sizeY=1, sizeZ=1)=>{
    const pass = encoder.beginComputePass();
    pass.setPipeline(cpipe);
    bgs.forEach((bg, i) => {
      pass.setBindGroup(i,bg);
    });
    pass.dispatchWorkgroups(sizeX, sizeY, sizeZ);
    pass.end();
  }
}
//assumes inverted z buffer (well nothing else is acceptable anyways)
export function rp(device, label, layouts, vertexbuflayout, code, targets, depth='greater'){
  const module = device.createShaderModule({
    label:label+" shader module",
    code:code
  })
  const fpipe = device.createRenderPipeline({
    label:label,
    layout:device.createPipelineLayout({
      bindGroupLayouts:layouts
    }),
    vertex: {
      module:module,
      entryPoint:"vertexMain",
      buffers:[vertexbuflayout]
    },
    fragment:{
      module:module,
      entryPoint:"fragmentMain",
      targets:targets.map((x)=>({format:x}))
    },
    depthStencil:depth?{
      depthWriteEnabled: true,
      depthCompare: depth,
      format: 'depth32float'
    }:undefined
  })
  return (encoder, vertexbuf, indexbuf, depth, attachments, bgs)=>{
    const pass = encoder.beginRenderPass({
      colorAttachments: attachments.map(a=>({
        view: a.createView(),
        loadOp: "clear",
        clearValue:[0,0,0,0.1],
        storeOp: "store"
      })),
      depthStencilAttachment: depth?{
        view: depth.createView(),
        depthClearValue: 0.0,
        depthLoadOp: 'clear',
        depthStoreOp: 'store',
      }:undefined
    })
    pass.setPipeline(fpipe);
    if(vertexbuf){
      pass.setVertexBuffer(0, vertexbuf);
    }
    bgs.forEach((bg, i)=>{
      pass.setBindGroup(i,bg)
    })
    if(typeof indexbuf == 'number'){
      pass.draw(indexbuf)
    }else{
      pass.setIndexBuffer(indexbuf, "uint32")
      pass.drawIndexed(indexbuf.num); 
    }
    pass.end();
  }
}


export function enc(device, ){
  const encoder = device.createCommandEncoder();
  for(let i=1; i<arguments.length; i++){
    arguments[i](encoder);
  }
  device.queue.submit([encoder.finish()]);
}

export function ObjectCollection(){ //just to aboid GPU GC
  this.items = arguments;
}
ObjectCollection.prototype.destroy = function(){
  for(let i=0; i<this.items.length; i++){
    this.items[i].destroy()
  }
}

export const screenVertexQuad = /*wgsl*/`
  @vertex
  fn vertexMain(
    @builtin(vertex_index) VertexIndex : u32
  ) -> @builtin(position) vec4<f32> {
    const pos = array(
      vec2(-1.0, -1.0), vec2(1.0, -1.0), vec2(-1.0, 1.0),
      vec2(-1.0, 1.0), vec2(1.0, -1.0), vec2(1.0, 1.0),
    );

    return vec4<f32>(pos[VertexIndex], 0.0, 1.0);
  }
`;

if(typeof(wgsl) == 'object'){
  wgsl.mathConsts = /*wgsl*/`
    const PI:f32 = 3.14159265359;
  `;
}
