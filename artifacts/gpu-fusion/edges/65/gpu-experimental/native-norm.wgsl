// Authored experimental schedule. Not an Ink equality/profitability certificate.
const D:u32=65u;
@group(0) @binding(0) var<storage,read> means:array<f32>;
@group(0) @binding(1) var<storage,read_write> norms:array<f32>;
@compute @workgroup_size(64) fn main(@builtin(global_invocation_id) gid:vec3<u32>){
 let document=gid.x;if(document>=arrayLength(&norms)){return;}var squared=0.0;
 for(var cursor=D;cursor>0u;cursor--){let v=means[document*D+cursor-1u];squared=((v*v)+squared);}
 norms[document]=max(sqrt(squared),bitcast<f32>(730643660u));
}
