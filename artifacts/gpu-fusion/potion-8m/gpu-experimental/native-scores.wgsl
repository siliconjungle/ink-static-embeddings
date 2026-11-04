// Authored experimental schedule. Not an Ink equality/profitability certificate.
const D:u32=256u;
@group(0) @binding(0) var<storage,read> left:array<f32>;
@group(0) @binding(1) var<storage,read> right:array<f32>;
@group(0) @binding(2) var<storage,read_write> scores:array<f32>;
@group(0) @binding(3) var<uniform> shape:vec4<u32>;
@compute @workgroup_size(64) fn main(@builtin(global_invocation_id) gid:vec3<u32>){
 let p=gid.x;if(p>=shape.x*shape.y){return;}let a=p/shape.y;let b=p%shape.y;var total=0.0;
 for(var dim=0u;dim<D;dim++){total=(total+(left[a*D+dim]*right[b*D+dim]));}scores[p]=total;
}
