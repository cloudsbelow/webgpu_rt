import * as ver from "./verbose.js"
export function debugTex(device, size, texture, {
  disp = /*wgsl*/`vec4(info.rgba)`,
  info = /*wgsl*/`textureSampleLevel(tex, samp, coords, 0);`,
  ttype = /*wgsl*/`texture_2d<f32>`,
  etype = {r:"t"},
  inv = false,
}={}){
  if(size[0]%64!=0){ // alignment check
    return new Error("size x value MUST be multiple of 64");
  }

  const elem = document.getElementById("debugWrapper");
  const cont = document.createElement("div");
  cont.style.position = 'relative';
  cont.style.display = 'inline-block';
  elem.appendChild(cont);

  const tab = document.createElement("div");
  tab.textContent = 'Hovered Content';
  tab.style.visibility='hidden'
  tab.className="debugTab"
  cont.appendChild(tab);

  const canvas = document.createElement("canvas");
  canvas.width = size[0];
  canvas.height = size[1];
  canvas.style.border = "1px solid white";
  cont.appendChild(canvas);
  

  const canvCont = canvas.getContext('webgpu');
  let canvasFormat = navigator.gpu.getPreferredCanvasFormat();
  canvCont.configure({
    device: device,
    format: canvasFormat,
    usage: GPUTextureUsage.COPY_SRC | GPUTextureUsage.RENDER_ATTACHMENT,
  });

  const debugShader = device.createShaderModule({
    label: "debug shader",
    code: /*wgsl*/`
      @group(0) @binding(1) var tex: ${ttype};

      @group(0) @binding(0) var samp: sampler;

      ${ver.screenVertexQuad}
      
      @fragment
        fn fragmentMain(
          @builtin(position) pos: vec4<f32>
        )->@location(0) vec4f{
          let coords = vec2f(pos.x/${size[0]}, ${inv?"1-":""}pos.y/${size[1]});
          let info = ${info};
          return ${disp};
        }
    `
  });

  const samBgl = ver.bgl(device, "debug BGL", [{r:"s", t:"n"},etype]);
  const samBG = ver.bg(samBgl, "debug BG", [
    device.createSampler({
      
    }), texture.createView()
  ]);
  const debugPipe = device.createRenderPipeline({
    label:"debug pipe",
    layout: device.createPipelineLayout({
      label: "debug rendering pipe layout",
      bindGroupLayouts:[samBgl],
    }),
    vertex: {
      module: debugShader,
      entryPoint: 'vertexMain'
    },
    fragment:{
      module: debugShader,
      entryPoint: 'fragmentMain',
      targets: [{
        format: canvasFormat,
      }]
    },
  });

  let cpuBuf = new Uint8Array(4*size[0]*size[1])
  let updated = false;
  let mousein = false;

  const fill = (copy=true)=>{
    updated=copy;
    const encoder = device.createCommandEncoder();
    
    const canvTex=canvCont.getCurrentTexture();
    const pass = encoder.beginRenderPass({
      colorAttachments:[{
        view: canvTex.createView(),
        loadOp: "clear",
        clearValue:[0,0,0.4,1],
        storeOp: "store",
      }]
    });
    pass.setPipeline(debugPipe);
    pass.setBindGroup(0, samBG);
    pass.draw(6);
    pass.end();

    let buffer;
    if(copy){
      buffer = device.createBuffer({
        size: 4*size[0]*size[1],
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
      });
      encoder.copyTextureToBuffer({
        texture: canvTex,
        origin: {x:0, y:0},
      },{
        buffer:buffer,
        bytesPerRow:size[0]*4
      }, {width:size[0],height:size[1]});
    }

    device.queue.submit([encoder.finish()]);

    if(copy){
      const arrayBuffer = buffer.mapAsync(GPUMapMode.READ,0,4*size[0]*size[1]).then(()=>{
        const buf = buffer.getMappedRange(0,4*size[0]*size[1]);
        cpuBuf.set(new Uint8Array(buf));
        buffer.destroy();
      });
    }
  }

  canvas.onclick=()=>{
    console.log("refreshing");
    fill(true);
  }
  
  const rect = canvas.getBoundingClientRect();
  let x,y;
  function getMousePos(event) { 
    //via GPT (tyty)
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const mouseX = (event.clientX - rect.left) * scaleX;
    const mouseY = (event.clientY - rect.top) * scaleY;
    x=Math.floor(mouseX); 
    y= Math.floor(mouseY);
  }
  function settab(){
    if(x>size[0]||x<0||y>size[1]||y<0) return;
    const pixel = [2,1,0,3].map(i=>cpuBuf[(y*size[0]+x)*4+i]);
    //console.log(pixel);
    tab.style.visibility = "visible";
    tab.innerHTML = pixel.map((c)=>"<div>"+c+"</div>").reduce((x,y)=>x+y);
    tab.style.backgroundColor = `rgb(${pixel[0]},${pixel[1]},${pixel[2]})`;
  }
  canvas.onmousemove=(e)=>{
    if(!updated) fill(true);
    getMousePos(e);
    settab()
    mousein=true;
  }
  canvas.onmouseleave=()=>{
    tab.style.visibility="hidden";
    mousein=false;
  }

  return ()=>{
    fill(mousein);
    if(mousein) settab();
  }
}