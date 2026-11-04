@group(0) @binding(0) var<storage,read> a:array<u32>;
@group(0) @binding(1) var<storage,read> b:array<u32>;
@group(0) @binding(2) var<storage,read_write> out:array<u32>;
@compute @workgroup_size(256) fn main(@builtin(local_invocation_id) lid:vec3<u32>,@builtin(workgroup_id) wid:vec3<u32>,@builtin(num_workgroups) nwg:vec3<u32>){
let n1=a[0];let n2=b[0];let i=wid.x*256u+lid.x;
if(i==0u){out[0]=n1+n2;}
if(i<n1){for(var k=0u;k<1u;k++){out[1u+i*1u+k]=a[1u+i*1u+k];}}
else if(i<n1+n2){let j=i-n1;for(var k=0u;k<1u;k++){out[1u+i*1u+k]=b[1u+j*1u+k];}}
}
