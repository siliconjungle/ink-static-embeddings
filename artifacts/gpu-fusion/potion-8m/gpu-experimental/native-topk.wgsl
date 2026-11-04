// Authored experimental schedule. Not an Ink equality/profitability certificate.
fn better(a:u32,b:u32)->bool{if((a&0x7fffffffu)>0x7f800000u){return false;}if((b&0x7fffffffu)>0x7f800000u){return true;}return bitcast<f32>(a)>bitcast<f32>(b);}
@group(0) @binding(0) var<storage,read> scores:array<u32>;
@group(0) @binding(1) var<storage,read_write> results:array<u32>;
@group(0) @binding(2) var<uniform> shape:vec4<u32>;
@compute @workgroup_size(64) fn main(@builtin(global_invocation_id) gid:vec3<u32>){
 let a=gid.x;if(a>=shape.x){return;}var ids:array<u32,32>;var values:array<u32,32>;var used=0u;
 for(var b=0u;b<shape.y;b++){
  let value=scores[a*shape.y+b];var position=used;
  for(var i=0u;i<used;i++){if(better(value,values[i])){position=i;break;}}
  if(position<shape.z){var end=min(used,shape.z-1u);
   loop{if(end<=position){break;}values[end]=values[end-1u];ids[end]=ids[end-1u];end--;}
   values[position]=value;ids[position]=b;used=min(used+1u,shape.z);
  }
 }
 for(var i=0u;i<shape.z;i++){let p=(a*shape.z+i)*2u;results[p]=ids[i];results[p+1u]=values[i];}
}
