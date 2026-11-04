// Authored experimental schedule. Not an Ink equality/profitability certificate.
const D:u32=1025u;
@group(0) @binding(0) var<storage,read> weights:array<f32>;
@group(0) @binding(1) var<storage,read> queries:array<u32>;
@group(0) @binding(2) var<storage,read_write> output:array<f32>;

@compute @workgroup_size(64) fn main(@builtin(global_invocation_id) gid:vec3<u32>){
 let p=gid.x;if(p>=arrayLength(&output)){return;}let document=p/D;let dim=p%D;
 let start=queries[document*2u];let count=queries[document*2u+1u];var total=0.0;
 for(var token=0u;token<count;token++){total=(total+weights[queries[start+token]*D+dim]);}
 var mean=0.0;if(count!=0u){mean=(total/f32(count));}output[p]=mean;
}
