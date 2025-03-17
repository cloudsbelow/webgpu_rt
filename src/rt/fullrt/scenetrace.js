export function scenegeofns(group, vertexstride = 12){
  if(vertexstride != 12) return new Error("bad vertexstride (we only support 12 - fix raytri func)");
  return /*wgsl*/`

@group(${group}) @binding(0) var<storage> rt_vertices:array<f32>;
@group(${group}) @binding(1) var<storage> rt_bvh:array<f32>;

struct disthit{
  dist:f32,
  address:u32
}
fn closeHit(a:disthit, b:disthit)->disthit{
  var ret:disthit;
  ret.dist = min(a.dist,b.dist);
  ret.address = select(a.address, b.address, b.dist<a.dist);
  return ret;
}
fn raytri(pos:vec3f, dir:vec3f, triidx:vec3u, tmin:f32, tmax:f32, address:u32, iscircle:bool)->disthit{
  let p1 = vec3f(rt_vertices[triidx.x*3+0],rt_vertices[triidx.x*3+1],rt_vertices[triidx.x*3+2]);
  let p2 = vec3f(rt_vertices[triidx.y*3+0],rt_vertices[triidx.y*3+1],rt_vertices[triidx.y*3+2]);
  let p3 = vec3f(rt_vertices[triidx.z*3+0],rt_vertices[triidx.z*3+1],rt_vertices[triidx.z*3+2]);

  var ret:disthit;
  ret.address = address;
  ret.dist = tmax;
  if(!iscircle){
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
    if(u>0 && v>0 && u+v<1 && t>tmin && t<tmax){
      ret.dist = t;
    }
    return ret;
  } else {
    let l = pos-p1;
    let ct = dot(dir, l);
    let det = sqrt(ct*ct-dot(l,l)+1);
    let nearhit = -ct-det;
    if(-ct-det<tmax && -ct-det>tmin){
      ret.dist = -ct-det;
      return ret;
    }
    if(-ct+det<tmax && -ct+det>tmin){
      ret.dist = -ct+det;
      return ret;
    }
  }
  return ret;
}
fn b(b:bool)->f32{
  return select(0.,1.,b);
}

struct hitInfo{
  dist:f32,
  normal: vec3f,
  wpos: vec3f,
  material: u32,
  didhit:bool,
}
fn recoverHitinfo(h:disthit, pos:vec3f, dir:vec3f)->hitInfo{
  let leafidx = h.address >> 2;
  let subidx = h.address & 3;
  let idx = leafidx*16+3*subidx;
  let triidx = bitcast<vec3<u32>>(vec3f(
    rt_bvh[idx+1], rt_bvh[idx+2], rt_bvh[idx+3]
  ));
  let p1 = vec3f(rt_vertices[triidx.x*3+0],rt_vertices[triidx.x*3+1],rt_vertices[triidx.x*3+2]);
  let p2 = vec3f(rt_vertices[triidx.y*3+0],rt_vertices[triidx.y*3+1],rt_vertices[triidx.y*3+2]);
  let p3 = vec3f(rt_vertices[triidx.z*3+0],rt_vertices[triidx.z*3+1],rt_vertices[triidx.z*3+2]);
  let iscircle:bool = (bitcast<u32>(rt_bvh[leafidx*16])&(0x100u<<subidx))!=0;

  var ret:hitInfo;
  ret.dist = h.dist;
  ret.wpos = h.dist*dir+pos;
  ret.didhit = true;

  if(iscircle){
    ret.normal = normalize(ret.wpos-p1);
  } else {
    let e1 = p2-p1;
    let e2 = p3-p1;
    ret.normal = normalize(cross(e2,e1));
    ret.material = 0;
  }
  //ret.normal = vec3(f32(leafidx)+0.1,f32(subidx)/)
  return ret;
}

fn raytrace(pos:vec3f, dir:vec3f, tmin_:f32, tmax_:f32)->hitInfo{
  var searchstack:array<u32, 24>;
  var stackidx:u32 = 1;
  searchstack[0] = 0;
  var i:u32=0;
  var bhit:disthit;
  bhit.dist = tmax_;
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

    let info = bitcast<u32>(rt_bvh[offset]);
    if(info==0){ //non-leaf node
      //return vec4f(0,1,1,0);
      var tmin:array<f32,2>;
      var tmax:array<f32,2>;
      {
        let t1:vec3f=(v1-pos)*dinv;
        let t2:vec3f=(v2-pos)*dinv;
        let th = max(t1,t2);
        let ts = min(t1,t2);
        tmin[0] = max(max(tmin_, ts.x),max(ts.y,ts.z));
        tmax[0] = min(min(bhit.dist, th.x),min(th.y,th.z));
      }
      {
        let t1:vec3f=(v3-pos)*dinv;
        let t2:vec3f=(v4-pos)*dinv;
        let th = max(t1,t2);
        let ts = min(t1,t2);
        tmin[1] = max(max(tmin_, ts.x),max(ts.y,ts.z));
        tmax[1] = min(min(bhit.dist, th.x),min(th.y,th.z));
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
    } else {
      // t=min(raytri(pos, dir, bitcast<vec3<u32>>(v1)),t);
      // t=min(raytri(pos, dir, bitcast<vec3<u32>>(v2)),t);
      // t=min(raytri(pos, dir, bitcast<vec3<u32>>(v3)),t);
      // t=min(raytri(pos, dir, bitcast<vec3<u32>>(v4)),t);
      var addrcomp = idx*4;
      bhit=closeHit(bhit, raytri(pos, dir, bitcast<vec3<u32>>(v1), tmin_, tmax_, addrcomp+0, (info&0x100)!=0));
      bhit=closeHit(bhit, raytri(pos, dir, bitcast<vec3<u32>>(v2), tmin_, tmax_, addrcomp+1, (info&0x200)!=0));
      bhit=closeHit(bhit, raytri(pos, dir, bitcast<vec3<u32>>(v3), tmin_, tmax_, addrcomp+2, (info&0x400)!=0));
      bhit=closeHit(bhit, raytri(pos, dir, bitcast<vec3<u32>>(v4), tmin_, tmax_, addrcomp+3, (info&0x800)!=0));
    }
  }
  if(bhit.dist<tmax_){
    return recoverHitinfo(bhit,pos,dir);
  }
  var a:hitInfo;
  a.dist = tmax_;
  a.didhit = false;
  return a;
}
  `;
}