// Authored experimental schedule. Not an Ink equality/profitability certificate.
const D:u32=1025u;
@group(0) @binding(0) var<storage,read> means:array<f32>;
@group(0) @binding(1) var<storage,read> norms:array<f32>;
@group(0) @binding(2) var<storage,read_write> output:array<f32>;
@compute @workgroup_size(64) fn main(@builtin(global_invocation_id) gid:vec3<u32>){
 let p=gid.x;if(p>=arrayLength(&output)){return;}output[p]=(means[p]/norms[p/D]);
}
