import * as ver from "../util/gpu/verbose.js"

const code = /*wgsl*/`
@group(0) @binding(0) var<uniform> cameraMat: mat4x4f;
@group(1) @binding(0) var samp: sampler;
@group(1) @binding(1) var normalmap: texture_2d<f32>;

struct VertexInput {
  @location(0) pos: vec3f,
  @location(1) uv: vec2f,
};
struct VertexOutput {
  @builtin(position) pos: vec4f,
  @location(0) uv: vec2f,
};
struct FragmentOutput{
  @location(0) norm: vec4f,
}
@vertex
  fn vertexMain(input: VertexInput) -> VertexOutput {
    let nPos = cameraMat*(vec4f(input.pos.xyz, 1));

    var output: VertexOutput;
    output.pos = nPos; 
    output.uv = input.uv;
    return output;
  }

@fragment
  fn fragmentMain(input: VertexOutput, @builtin(front_facing) front:bool) -> FragmentOutput {
    var output:FragmentOutput;
    //output.uv = input.uv;
    //output.norm = vec4f(input.uv,0,1);//normalize(input.pos)*select(1.0,-1.0,front);
    output.norm = (textureSampleLevel(normalmap, samp, vec2f(input.uv.x,1-input.uv.y), 0).xzyw*2-1)*select(-1.,1.,front);
    return output;
  }
`;

export function mpipe(device, size, bgs, vbuf, ibuf){
  const dfn = ver.rp(device, "Gbuffer pipe", bgs.map(x=>x.bgl), {
    arrayStride: 16,
    attributes:[
      {shaderLocation:0, offset:0, format:"float32x3"},
      {shaderLocation:1, offset:12, format:"unorm16x2"}
    ]
  },code, ["rgba16float"])

  const depthTexture = device.createTexture({
    size:size,
    format: 'depth32float',
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
  });
  const normalTexture = device.createTexture({
    size: size,
    format: 'rgba16float',
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
  });
  const vb = device.createBuffer({
    label: "Vertex buffer",
    size: vbuf.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(vb, 0, vbuf);
  const ib = device.createBuffer({
    label: "Index buffer",
    size: ibuf.byteLength,
    usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
  })
  ib.num = ibuf.byteLength/4;
  device.queue.writeBuffer(ib, 0, ibuf);
  console.log(ib.num/3+ " tris")

  const bgl = ver.bgl(device, "gbuffers layout",[
    {r:"t",t:"d"},{r:"t"}
  ])
  const bg = ver.bg(bgl, "gbuffers bindgroup",[
    depthTexture.createView(),
    normalTexture.createView(),
  ])
  return {
    draw:(encoder, {_ib=ib}={})=>{
      dfn(encoder, vb, _ib, depthTexture, [normalTexture], bgs)
    },
    depth:depthTexture,
    normal:normalTexture,
    vertex: vb,
    index: ib,
    size:size,
    bgl:bgl, bg:bg,
    wgsl:(group)=>/*wgsl*/`
      @group(${group}) @binding(0) var gbuf_d:texture_depth_2d;
      @group(${group}) @binding(1) var gbuf_n:texture_2d<f32>;
    `,
  }
}