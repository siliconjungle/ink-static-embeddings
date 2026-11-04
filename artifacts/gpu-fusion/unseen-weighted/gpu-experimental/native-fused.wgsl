// Authored experimental schedule. Not an Ink equality/profitability certificate.
const D:u32=7u;
@group(0) @binding(0) var<storage,read> weights:array<f32>;
@group(0) @binding(1) var<storage,read> queries:array<u32>;
@group(0) @binding(2) var<storage,read_write> output:array<f32>;

var<workgroup> means:array<f32,7>;
var<workgroup> denominator:f32;
@compute @workgroup_size(64) fn main(@builtin(workgroup_id) group:vec3<u32>,@builtin(local_invocation_index) lane:u32){
 let document=group.x;let start=queries[document*2u];let count=queries[document*2u+1u];
 for(var dim=lane;dim<D;dim+=64u){
  var total=0.0;
  for(var token=0u;token<count;token++){total=(total+weights[queries[start+token]*D+dim]);}
  var mean=0.0;if(count!=0u){mean=(total/f32(count));}means[dim]=mean;
 }
 workgroupBarrier();
 if(lane==0u){var squared=0.0;
  for(var cursor=D;cursor>0u;cursor--){let v=means[cursor-1u];squared=((v*v)+squared);}
  denominator=(sqrt(squared)+bitcast<f32>(172994847u));
 }
 workgroupBarrier();
 for(var dim=lane;dim<D;dim+=64u){output[document*D+dim]=(means[dim]/denominator);}
}
