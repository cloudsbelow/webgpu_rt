export function rtshader(group, vertexstride = 12){
  if(vertexstride != 12) return new Error("bad vertexstride (we only support 12 - fix raytri func)");
  return /*wgsl*/`

@group(${group}) @binding(0) var<storage> rt_vertices:array<f32>;
@group(${group}) @binding(1) var<storage> rt_bvh:array<f32>;
fn raytri(pos:vec3f, dir:vec3f, triidx:vec3u)->f32{
  //don't you just love data marshling? After 'hte incident' I don't trust struct alignment <3
  let p1 = vec3f(rt_vertices[triidx.x*3+0],rt_vertices[triidx.x*3+1],rt_vertices[triidx.x*3+2]);
  let p2 = vec3f(rt_vertices[triidx.y*3+0],rt_vertices[triidx.y*3+1],rt_vertices[triidx.y*3+2]);
  let p3 = vec3f(rt_vertices[triidx.z*3+0],rt_vertices[triidx.z*3+1],rt_vertices[triidx.z*3+2]);
  //let p1 = vec3f(0,0,0);
  //let p2 = vec3f(0,0,1);
  //let p3 = vec3f(1,0,0);

  //taken from wikipedia
  let e1 = p2-p1;
  let e2 = p3-p1;
  let cr = cross(dir, e2);
  let det = dot(e1, cr);
  let idet = 1/det;
  let dp = pos-p1;
  let u = idet*dot(dp,cr);
  let cs = cross(dp, e1);
  let v = idet*dot(dir, cs);
  let t = idet*dot(e2,cs);
  return select(10000, t, u>0 && v>0 && u+v<1 && t>0.0001);
}
fn b(b:bool)->f32{
  return select(0.,1.,b);
}
fn raytrace(pos:vec3f, dir:vec3f, tlim:f32)->f32{
  var searchstack:array<u32, 24>;
  var stackidx:u32 = 1;
  searchstack[0] = 0;
  var i:u32=0;
  var t = tlim;
  while(stackidx!=0 && i<100){
    i++;
    stackidx--;//noprefix so sad I am actually devestated
    let idx = searchstack[stackidx];
    let offset = idx*16;
    let v1 = vec3f(rt_bvh[offset+1],rt_bvh[offset+2],rt_bvh[offset+3]);
    let v2 = vec3f(rt_bvh[offset+4],rt_bvh[offset+5],rt_bvh[offset+6]);
    let v3 = vec3f(rt_bvh[offset+7],rt_bvh[offset+8],rt_bvh[offset+9]);
    let v4 = vec3f(rt_bvh[offset+10],rt_bvh[offset+11],rt_bvh[offset+12]);
    let dinv = 1/dir;

    if(bitcast<u32>(rt_bvh[offset])==0){ //non-leaf node
      //return vec4f(0,1,1,0);
      var tmin:array<f32,2>;
      var tmax:array<f32,2>;
      {
        let t1:vec3f=(v1-pos)*dinv;
        let t2:vec3f=(v2-pos)*dinv;
        let th = max(t1,t2);
        let ts = min(t1,t2);
        tmin[0] = max(max(0, ts.x),max(ts.y,ts.z));
        tmax[0] = min(min(t, th.x),min(th.y,th.z));
      }
      {
        let t1:vec3f=(v3-pos)*dinv;
        let t2:vec3f=(v4-pos)*dinv;
        let th = max(t1,t2);
        let ts = min(t1,t2);
        tmin[1] = max(max(0, ts.x),max(ts.y,ts.z));
        tmax[1] = min(min(t, th.x),min(th.y,th.z));
      }
      let smaller:u32 = select(0u,1u,tmin[1]<tmin[0] && tmin[1]<tmax[1]);
      if(tmin[1-smaller]<tmax[1-smaller]){
        searchstack[stackidx]=bitcast<u32>(rt_bvh[offset+15-smaller]);
        stackidx++;
      }
      if(tmin[smaller]<tmax[smaller]){
        searchstack[stackidx]=bitcast<u32>(rt_bvh[offset+14+smaller]);
        stackidx++;
      }
      //return vec4f(b(tmin[0]<tmax[0]),b(tmin[1]<tmax[1]),0,0);
    } else {//leaf code (We are unrolling for loops with this one)
      t=min(raytri(pos, dir, bitcast<vec3<u32>>(v1)),t);
      t=min(raytri(pos, dir, bitcast<vec3<u32>>(v2)),t);
      t=min(raytri(pos, dir, bitcast<vec3<u32>>(v3)),t);
      t=min(raytri(pos, dir, bitcast<vec3<u32>>(v4)),t);
    }
  }
  /*if(t<tlim && t<10000){
    return vec4f(255,f32(i)/10, f32(i)/50,f32(i)/200);
  }
  return vec4f(0,f32(i)/30,f32(i)/100,t);*/
  return t;
}
  `;
}