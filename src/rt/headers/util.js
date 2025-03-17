


export const randomFuncs = /*wgsl*/`
var<private> randState:u32=0;
fn unitRand() -> f32 {
  var x = randState * 747796405u + 2891336453u;
  x ^= x >> 16;
  x *= 0x85ebca6bu;
  x ^= x >> 13;
  x *= 0xc2b2ae35u;
  x ^= x >> 16;
  randState = x;
  return f32(randState) / 4294967296.0;
}

fn hemisphereRand(center:vec3f)->vec3f{
  let theta = 2*PI*unitRand();
  let v = 2*unitRand()-1;
  let phi = acos(v);
  let sp = sin(phi);
  let d = vec3(sin(theta)*sp,v,cos(theta)*sp);
  return d*select(1.,-1.,dot(center,d)<0);
}

fn coneRandUpX(angle:f32)->vec3f{
  let ca = cos(angle);
  let alt = unitRand()*(1-ca)+ca;
  let scomp = sqrt(1-alt*alt);
  let theta = unitRand()*2*PI;
  return vec3(alt, scomp*cos(theta),scomp*sin(theta));
}
fn coneRandDir(theta:f32, phi:f32, angle:f32)->vec3f{
  let v = coneRandUpX(angle);
  let vp = vec3(cos(phi)*v.x-sin(phi)*v.y, sin(phi)*v.x+cos(phi)*v.y, v.z);
  return vec3(cos(theta)*vp.x+sin(theta)*vp.z,vp.y,-sin(theta)*vp.x+cos(theta)*vp.z);
}
fn coneSize(angle:f32)->f32{
  let ca = cos(angle);
  return 2*PI*(1-ca);
}

`



export const cgFuncs = /*wgsl*/`

fn srgb(v:vec4f) -> vec4f{
  let nv=clamp(v,vec4(0,0,0,0),vec4(1,1,1,1));
  return select(12.92*nv, pow(nv, vec4(1,1,1,1)/2.4)*1.055-0.055, nv>=0.0031308*vec4(1,1,1,1));
}
  //return np.where(v <= 0.0031308, 12.92 * v, 1.055 * (v ** (1/2.4)) - 0.055)
`