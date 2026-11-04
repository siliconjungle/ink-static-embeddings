"""Explicit experimental GPU schedules; these are not Ink optimizer rewrites."""
import struct


def shaders(manifest: dict, helpers: str, native: bool = False) -> dict[str, str]:
    d = manifest['dimensions']
    if not isinstance(d, int) or not 1 <= d <= 4096:
        raise ValueError('dimensions must be 1..4096')
    policy = manifest['normalization']
    if policy['kind'] not in ('none', 'l2-add-epsilon', 'l2-clamp'):
        raise ValueError('unsupported normalization')
    epsilon = struct.unpack('<I', struct.pack('<f', float(policy.get('epsilon', 0))))[0]
    lane = 'f32' if native else 'u32'
    zero, one = ('0.0', '1.0') if native else ('0u', '0x3f800000u')
    add = (lambda a, b: f'({a}+{b})') if native else (lambda a, b: f'ink_f32_add({a},{b})')
    mul = (lambda a, b: f'({a}*{b})') if native else (lambda a, b: f'ink_f32_mul({a},{b})')
    div = (lambda a, b: f'({a}/{b})') if native else (lambda a, b: f'ink_f32_div({a},{b})')
    root = 'sqrt(squared)' if native else 'ink_f32_sqrt(squared)'
    eps = f'bitcast<f32>({epsilon}u)' if native else f'{epsilon}u'
    norm = one if policy['kind'] == 'none' else (
        add(root, eps) if policy['kind'] == 'l2-add-epsilon' else
        (f'max({root},{eps})' if native else f'select({root},{eps},ink_f32_lt({root},{eps}))'))
    prefix = '// Authored experimental schedule. Not an Ink equality/profitability certificate.\n' + ('' if native else helpers)
    declarations = f'''const D:u32={d}u;
@group(0) @binding(0) var<storage,read> weights:array<{lane}>;
@group(0) @binding(1) var<storage,read> queries:array<u32>;
@group(0) @binding(2) var<storage,read_write> output:array<{lane}>;
'''
    count_float = 'f32(count)' if native else 'ink_f32_from_u64(InkU64(count,0u))'
    # One workgroup per document. Each dimension's token accumulation remains
    # sequential; lane zero retains the reverse dimension reduction order.
    fused = prefix + declarations + f'''
var<workgroup> means:array<{lane},{d}>;
var<workgroup> denominator:{lane};
@compute @workgroup_size(64) fn main(@builtin(workgroup_id) group:vec3<u32>,@builtin(local_invocation_index) lane:u32){{
 let document=group.x;let start=queries[document*2u];let count=queries[document*2u+1u];
 for(var dim=lane;dim<D;dim+=64u){{
  var total={zero};
  for(var token=0u;token<count;token++){{total={add('total', 'weights[queries[start+token]*D+dim]')};}}
  var mean={zero};if(count!=0u){{mean={div('total', count_float)};}}means[dim]=mean;
 }}
 workgroupBarrier();
 if(lane==0u){{var squared={zero};
  for(var cursor=D;cursor>0u;cursor--){{let v=means[cursor-1u];squared={add(mul('v','v'), 'squared')};}}
  denominator={norm};
 }}
 workgroupBarrier();
 for(var dim=lane;dim<D;dim+=64u){{output[document*D+dim]={div('means[dim]', 'denominator')};}}
}}
'''
    # A matched three-dispatch control uses the same arithmetic helpers and
    # host/buffer ABI as fusion, isolating schedule from runtime/ABI changes.
    split_pool = prefix + declarations + f'''
@compute @workgroup_size(64) fn main(@builtin(global_invocation_id) gid:vec3<u32>){{
 let p=gid.x;if(p>=arrayLength(&output)){{return;}}let document=p/D;let dim=p%D;
 let start=queries[document*2u];let count=queries[document*2u+1u];var total={zero};
 for(var token=0u;token<count;token++){{total={add('total','weights[queries[start+token]*D+dim]')};}}
 var mean={zero};if(count!=0u){{mean={div('total',count_float)};}}output[p]=mean;
}}
'''
    split_norm = prefix + f'''const D:u32={d}u;
@group(0) @binding(0) var<storage,read> means:array<{lane}>;
@group(0) @binding(1) var<storage,read_write> norms:array<{lane}>;
@compute @workgroup_size(64) fn main(@builtin(global_invocation_id) gid:vec3<u32>){{
 let document=gid.x;if(document>=arrayLength(&norms)){{return;}}var squared={zero};
 for(var cursor=D;cursor>0u;cursor--){{let v=means[document*D+cursor-1u];squared={add(mul('v','v'),'squared')};}}
 norms[document]={norm};
}}
'''
    split_output = prefix + f'''const D:u32={d}u;
@group(0) @binding(0) var<storage,read> means:array<{lane}>;
@group(0) @binding(1) var<storage,read> norms:array<{lane}>;
@group(0) @binding(2) var<storage,read_write> output:array<{lane}>;
@compute @workgroup_size(64) fn main(@builtin(global_invocation_id) gid:vec3<u32>){{
 let p=gid.x;if(p>=arrayLength(&output)){{return;}}output[p]={div('means[p]','norms[p/D]')};
}}
'''
    scores = prefix + f'''const D:u32={d}u;
@group(0) @binding(0) var<storage,read> left:array<{lane}>;
@group(0) @binding(1) var<storage,read> right:array<{lane}>;
@group(0) @binding(2) var<storage,read_write> scores:array<{lane}>;
@group(0) @binding(3) var<uniform> shape:vec4<u32>;
@compute @workgroup_size(64) fn main(@builtin(global_invocation_id) gid:vec3<u32>){{
 let p=gid.x;if(p>=shape.x*shape.y){{return;}}let a=p/shape.y;let b=p%shape.y;var total={zero};
 for(var dim=0u;dim<D;dim++){{total={add('total',mul('left[a*D+dim]','right[b*D+dim]'))};}}scores[p]=total;
}}
'''
    # Scores are ordered descending, equal scores retain lower document index.
    # NaNs sort last, with stable index ordering among NaNs and equal scores.
    topk = '''
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
'''
    better = ('fn better(a:u32,b:u32)->bool{if((a&0x7fffffffu)>0x7f800000u){return false;}if((b&0x7fffffffu)>0x7f800000u){return true;}return bitcast<f32>(a)>bitcast<f32>(b);}' if native else
              'fn better(a:u32,b:u32)->bool{if(ink_f32_nan(a)){return false;}if(ink_f32_nan(b)){return true;}return ink_f32_lt(b,a);}')
    return {'fused': fused, 'pool': split_pool, 'norm': split_norm, 'output': split_output,
            'scores': scores, 'topk': prefix + better + topk}
