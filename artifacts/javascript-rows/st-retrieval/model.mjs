const __recordElisions=new Set([]);
const __nativeF32=true;
// Representation conversion only. Callers supply values matching metadata.
const __view = new DataView(new ArrayBuffer(4));
const __float = bits => { __view.setUint32(0, bits, true); return __view.getFloat32(0, true); };
const __bits = number => { if(Number.isNaN(number))return 0x7fc00000; __view.setFloat32(0, number, true); return __view.getUint32(0, true); };
// Binary64 uses native Numbers for finite arithmetic and immutable private
// tags only where a NaN's exact payload must survive non-arithmetic operations.
const __doubleView=new DataView(new ArrayBuffer(8));
const __double=bits=>{__doubleView.setBigUint64(0,bits,true);return __doubleView.getFloat64(0,true);};
const __doubleBits=number=>{if(Number.isNaN(number))return 0x7ff8000000000000n;__doubleView.setFloat64(0,number,true);return __doubleView.getBigUint64(0,true);};
const __dfNumber=value=>typeof value==='number'?value:__double(BigInt(value.F64Bits));
const __dfBits=value=>typeof value==='number'?__doubleBits(value):BigInt(value.F64Bits);
const __dfFromBits=bits=>(bits&0x7fffffffffffffffn)>0x7ff0000000000000n?Object.freeze({F64Bits:bits.toString()}):__double(bits);
const __dfInput=value=>typeof value==='number'?value:__dfFromBits(BigInt(value.F64Bits));
const __dfNeg=value=>typeof value==='number'&&!Number.isNaN(value)?-value:__dfFromBits(__dfBits(value)^0x8000000000000000n);
const __dfOutput=value=>{const n=__dfNumber(value);return Number.isFinite(n)?n:{F64Bits:__dfBits(value).toString()};};
const __dfCapture=value=>{
 if(typeof value==='number'&&Number.isFinite(value))return value;
 if(!value||typeof value!=='object'||Object.keys(value).length!==1||!Object.hasOwn(value,'F64Bits'))throw Error('invalid f64');const text=value.F64Bits;
 if(typeof text!=='string'||text.length>20||!/^(0|[1-9][0-9]*)$/.test(text))throw Error('invalid f64');
 const bits=BigInt(text);if(bits>18446744073709551615n)throw Error('invalid F64Bits');return __dfFromBits(bits);
};
// Native binary32 lane for pure modules. Explicit NaN payloads remain tagged;
// arithmetic canonicalizes NaNs just as __bits does in the exact-bit lane.
// Host tags are captured once at a typed read. Only private immutable tags
// may pass through normalization without consulting a host property again.
const __nfTagged = new WeakSet();
const __nfValue = value => typeof value === 'number' ? Math.fround(value) : __nfTagged.has(value) ? value : __nfFromBits(value.F32Bits);
// Number operands have already been normalised at their typed read or producer.
const __nfNumber = value => typeof value === 'number' ? value : __float(value.F32Bits);
const __nfBits = value => typeof value === 'number' ? __bits(value) : value.F32Bits;
const __nfFromBits = bits => {
  if((bits & 0x7fffffff)<=0x7f800000)return __float(bits);
  const value=Object.freeze({F32Bits:bits});__nfTagged.add(value);return value;
};
const __nfNeg = value => typeof value === 'number' && !Number.isNaN(value) ? -value : __nfFromBits((__nfBits(value) ^ 0x80000000) >>> 0);
const __nfOutput = value => {const n=typeof value==='number'?Math.fround(value):__float(value.F32Bits);return Number.isFinite(n)?n:{F32Bits:__nfBits(value)};};
const __identity = value => value;
// Intern declared conversion schemas once. An invocation owns one WeakMap per
// schema instead of allocating a Map for every converted record/list node.
const __conversionKeys = new Map();
function __representation(type, output, capture=false) {
  const convert=__representationRaw(type,output,capture);
  if(convert===__identity)return convert;
  // Conversion identity is invocation-local: callers may reuse a mutable host
  // object in a later call. Distinct declared schemas have distinct memo keys.
  const schema=(output?'out:':capture?'capture:':'in:')+JSON.stringify(type);
  let key=__conversionKeys.get(schema);
  if(!key){key={};__conversionKeys.set(schema,key);}
  return (value,context)=>{
    if(!context||!value||typeof value!=='object')return convert(value,context);
    let entries=context.get(key);
    if(!entries){entries=new WeakMap();context.set(key,entries);}
    if(entries.has(value))return entries.get(value);
    const result=convert(value,context);
    entries.set(value,result);return result;
  };
}
function __representationRaw(type, output, capture) {
  switch (type.kind) {
    case 'ref': {
      let resolved;
      return (value,context)=>(resolved??=__representation(__namedTypes[type.name],output,capture))(value,context);
    }
    case 'id': return value=>value.toLowerCase();
    case 'int': return output ? value=>({Int:value.toString()}) : value=>BigInt(value && typeof value==='object' ? value.Int : value);
    case 'option': {
      const item=__representation(type.element,output,capture);
      return item===__identity?__identity:(value,context)=>Object.hasOwn(value,'Some')?{Some:item(value.Some,context)}:{None:null};
    }
    case 'result': {
      const ok=__representation(type.ok,output,capture),err=__representation(type.error,output,capture);
      const key=typeof __sumSpecs==='undefined'?null:__sumKey(type),flat=key!==null&&__sumSpecs.has(key);
      if(flat)return output?(value,context)=>{const v=__sumView(key,value);return Object.hasOwn(v,'Ok')?{Ok:ok(v.Ok,context)}:{Err:err(v.Err,context)};}:(v,context)=>Object.hasOwn(v,'Ok')?__sumMake(key,true,ok(v.Ok,context)):__sumMake(key,false,err(v.Err,context));
      return ok===__identity&&err===__identity?__identity:(value,context)=>Object.hasOwn(value,'Ok')?{Ok:ok(value.Ok,context)}:{Err:err(value.Err,context)};
    }
    case 'f64':return output?__dfOutput:__dfInput;
    case 'f32': if(typeof __nativeF32!=='undefined'&&__nativeF32)return output?__nfOutput:capture?__nfValue:__identity;
      return output ? value => {
      const number = __float(value);
      return Number.isFinite(number) ? number : {F32Bits:value};
    } : value => typeof value === 'number' ? __bits(value) : value.F32Bits;
    case 'list': case 'vector': {
      const element = __representation(type.element, output,capture);
      return element === __identity ? __identity : (value,context) => Array.from(value, item=>element(item,context));
    }
    case 'record': {
      if((typeof __recordElisions!=='undefined'&&__recordElisions.has(type.name))){
        if(!type.fields.length)return ()=>undefined; // lexically unconsumed projected input
        const field=type.fields[0],child=__representation(field.type,output,capture);
        return output?(value,context)=>({[field.name]:child(value,context)}):(value,context)=>child(value[field.name],context);
      }
      const fields = type.fields.map(field => [field.name, __representation(field.type, output,capture)]);
      return fields.every(([,convert]) => convert === __identity) ? __identity :
        (value,context) => {
          const result={};
          for(const [name,convert] of fields){
            const field=convert(value[name],context);
            // Assignment treats __proto__ specially; records require an own
            // ordinary writable data property, as Object.fromEntries supplied.
            if(name==='__proto__')Object.defineProperty(result,name,{value:field,writable:true,enumerable:true,configurable:true});
            else result[name]=field;
          }
          return result;
        };
    }
    default: return __identity;
  }
}
// Fixed primitives; no cross-invocation host caches.
function __ink_round_even(x){if(!Number.isFinite(x)||Math.abs(x)>=8388608)return x;const a=Math.abs(x),i=Math.floor(a),r=a-i;const y=i+Number(r>0.5||(r===0.5&&i%2===1));return x<0||Object.is(x,-0)?-y:y;}
function __ink_round_even_f64(x){if(!Number.isFinite(x)||Math.abs(x)>=4503599627370496)return x;const a=Math.abs(x),i=Math.floor(a),r=a-i;const y=i+Number(r>0.5||(r===0.5&&i%2===1));return x<0||Object.is(x,-0)?-y:y;}
// Direct BigInt -> binary32 avoids double rounding through binary64.
function __ink_big_float(x){if(x===0n)return 0;const neg=x<0n;if(neg)x=-x;let e=x.toString(2).length-1;if(e<=23)return Number(neg?-x:x);const shift=BigInt(e-23),mask=(1n<<shift)-1n;let q=x>>shift;const rem=x&mask,half=1n<<(shift-1n);if(rem>half||(rem===half&&(q&1n)!==0n))q++;if(q===16777216n){q>>=1n;e++;}if(e>127)return neg?-Infinity:Infinity;return (neg?-1:1)*Number(q)*2**(e-23);}
function __ink_from_float(x,t){x=Math.trunc(x);if(!Number.isFinite(x))return {None:null};const valid=t==='i32'?x>=-2147483648&&x<2147483648:x>=0&&x<(t==='u32'?4294967296:18446744073709551616);return valid?{Some:t==='u64'?BigInt(x):x===0?0:x}:{None:null};}
function __ink_count(x,n,width){if(width===64){x=BigInt.asUintN(64,x);if(n==='popcount'){let count=0;while(x){x&=x-1n;count++;}return count;}if(x===0n)return 64;if(n==='leading_zeros')return 64-x.toString(2).length;let count=0;while((x&1n)===0n){x>>=1n;count++;}return count;}x>>>=0;if(n==='leading_zeros')return Math.clz32(x);if(n==='trailing_zeros')return x===0?32:31-Math.clz32((x&-x)>>>0);x=x-((x>>>1)&0x55555555);x=(x&0x33333333)+((x>>>2)&0x33333333);return Math.imul((x+(x>>>4))&0x0f0f0f0f,0x01010101)>>>24;}
const __ink_encoder=new TextEncoder(),__ink_decoder=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true});
const __ink_bytes=s=>__ink_encoder.encode(s);
// Count UTF-8 bytes directly; valid Ink strings contain Unicode scalar values.
// Preserve TextEncoder's replacement width for a lone surrogate at trusted hosts.
function __ink_byte_len(s,start=0,end=s.length){let n=0;for(let i=start;i<end;i++){const c=s.charCodeAt(i);if(c<128)n++;else if(c<2048)n+=2;else if(c>=0xd800&&c<=0xdbff&&i+1<end&&s.charCodeAt(i+1)>=0xdc00&&s.charCodeAt(i+1)<=0xdfff){n+=4;i++;}else n+=3;}return n;}
const __ink_boundary=(b,i)=>i<=b.length&&(i===b.length||(b[i]&0xc0)!==0x80);
function __ink_byte_at(s,i){const b=__ink_bytes(s);return i<b.length?{Some:b[i]}:{None:null};}
function __ink_slice(s,a,z){const b=__ink_bytes(s);return a<=z&&__ink_boundary(b,a)&&__ink_boundary(b,z)?{Some:__ink_decoder.decode(b.subarray(a,z))}:{None:null};}
function __ink_concat(a,b){const s=a+b;if(__ink_byte_len(s)>4294967295)throw Error('String exceeds U32 byte length');return s;}
function __ink_find(s,needle,from){let unit=0,bytes=0;while(bytes<from&&unit<s.length){const c=s.charCodeAt(unit++);if(c<128)bytes++;else if(c<2048)bytes+=2;else if(c>=0xd800&&c<=0xdbff&&unit<s.length&&s.charCodeAt(unit)>=0xdc00&&s.charCodeAt(unit)<=0xdfff){bytes+=4;unit++;}else bytes+=3;}if(bytes!==from)return {None:null};const at=s.indexOf(needle,unit);return at<0?{None:null}:{Some:bytes+__ink_byte_len(s,unit,at)};}

function __ink_int_from_float(x){return Number.isFinite(x)?{Some:BigInt(Math.trunc(x))}:{None:null};}
// Affine buffers expose bounded disjoint ranges over one allocation. Source
// ownership prevents retaining a parent; growth detaches shared ranges.
// Elements cannot own temporary storage: they are immutable logical values.
// Copy the slot array when acquiring ownership, never the reachable records.
class __InkBuffer {
 constructor(data,start=0,end=data.length,shared=false){this.data=data;this.start=start;this.end=end;this.shared=shared;}
 get length(){return this.end-this.start;}
 set length(n){this.end=this.start+Math.min(this.length,n);if(!this.shared&&this.start===0&&Array.isArray(this.data))this.data.length=this.end;}
 item(i){return this.data[this.start+i];}
 range(start,count){const begin=this.start+Math.min(start,this.length);return new __InkBuffer(this.data,begin,begin+Math.min(count,this.end-begin),true);}
 set(i,v){if(i<this.length){if(typeof v!=='number'&&!Array.isArray(this.data))this.detach();this.data[this.start+i]=v;}return this;}
 swap(a,b){if(a<this.length&&b<this.length){const x=this.item(a);this.set(a,this.item(b));this.set(b,x);}return this;}
 fill_range(start,count,value){start=Math.min(start,this.length);count=Math.min(count,this.length-start);if(count&&typeof value!=='number'&&!Array.isArray(this.data))this.detach();this.data.fill(value,this.start+start,this.start+start+count);return this;}
 copy_within(source,destination,count){source=Math.min(source,this.length);destination=Math.min(destination,this.length);count=Math.min(count,this.length-source,this.length-destination);this.data.copyWithin(this.start+destination,this.start+source,this.start+source+count);return this;}
 detach(){if(this.shared||this.start!==0||this.end!==this.data.length||!Array.isArray(this.data)){this.data=Array.isArray(this.data)?this.data.slice(this.start,this.end):Array.from(this.data.subarray(this.start,this.end));this.start=0;this.end=this.data.length;this.shared=false;}}
 push(v){if(this.length>=4294967295)throw Error('buffer length exhausted');this.detach();this.data.push(v);this.end++;return this;}
 pop(){this.length=Math.max(0,this.length-1);return this;}
 truncate(n){this.length=Math.min(this.length,n);return this;}
 slice(start=0,end=this.length){return Array.isArray(this.data)?this.data.slice(this.start+start,this.start+Math.min(end,this.length)):Array.from(this.data.subarray(this.start+start,this.start+Math.min(end,this.length)));}
 freeze(){return Array.isArray(this.data)?(this.start===0&&this.end===this.data.length?this.data:this.data.slice(this.start,this.end)):Array.from(this.data.subarray(this.start,this.end));}
 *[Symbol.iterator](){for(let i=this.start;i<this.end;i++)yield this.data[i];}
}
function __bufferSplit(x,at){const cut=x.start+Math.min(at,x.length);x.shared=true;return [new __InkBuffer(x.data,x.start,cut,true),new __InkBuffer(x.data,cut,x.end,true)];}
function __bufferAppend(a,b){
 if(a.length+b.length>4294967295)throw Error('buffer length exhausted');
 if(a.data===b.data&&a.end===b.start)return new __InkBuffer(a.data,a.start,b.end,a.start!==0||b.end!==a.data.length);
 a.detach();for(const item of b)a.push(item);return a;
}

function __repeat_until(limit,acc,stop,step){for(let i=0;i<limit;i++){if(stop(acc))break;acc=step(i,acc);}return acc;}
function __bufferFill(n,v){return new __InkBuffer(new Array(n).fill(v));}
// Normalized native F32 Numbers fit a dense private carrier. Exact NaN tags
// retain slot arrays; a later tagged write promotes only that owner's range.
function __bufferFillF32(n,v){return new __InkBuffer(typeof v==='number'?new Float32Array(n).fill(v):new Array(n).fill(v));}
function __mapGet(m,k,f){return m.has(k)?m.get(k):f();}
function __mapEntries(m,keys){return [...m.entries()].sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,v])=>keys?k:v);}
function __tempSet(x,k,v,map){x.set(k,v);return x;}
function __bufferSwap(x,a,b){return x.swap(a,b);}
function __tempEdit(x,op,...args){if(op==='push'){x.push(args[0]);}else if(op==='pop')x.pop();else if(op==='truncate')x.truncate(args[0]);else if(op==='remove')x.delete(args[0]);return x;}
function __fn0(){
const v0=0;
const v1=1;
const v2=2;
const v3=3;
const v4=4;
const v5=5;
const v6=6;
const v7=7;
const v8=[v0,v1,v2,v3,v4,v5,v6,v7];
const v9=8;
const v10=9;
const v11=10;
const v12=11;
const v13=12;
const v14=13;
const v15=14;
const v16=15;
const v17=[v9,v10,v11,v12,v13,v14,v15,v16];
const v18=v8.length;
const v19=v17.length;
const v20=new Array(v18+v19);
for(let v21=0;v21<v18;v21++){v20[v21]=v8[v21];}
for(let v22=0;v22<v19;v22++){v20[v18+v22]=v17[v22];}
const v23=16;
const v24=17;
const v25=18;
const v26=19;
const v27=20;
const v28=21;
const v29=22;
const v30=23;
const v31=[v23,v24,v25,v26,v27,v28,v29,v30];
const v32=24;
const v33=25;
const v34=26;
const v35=27;
const v36=28;
const v37=29;
const v38=30;
const v39=31;
const v40=[v32,v33,v34,v35,v36,v37,v38,v39];
const v41=v31.length;
const v42=v40.length;
const v43=new Array(v41+v42);
for(let v44=0;v44<v41;v44++){v43[v44]=v31[v44];}
for(let v45=0;v45<v42;v45++){v43[v41+v45]=v40[v45];}
const v46=v20.length;
const v47=v43.length;
const v48=new Array(v46+v47);
for(let v49=0;v49<v46;v49++){v48[v49]=v20[v49];}
for(let v50=0;v50<v47;v50++){v48[v46+v50]=v43[v50];}
const v51=32;
const v52=33;
const v53=34;
const v54=35;
const v55=36;
const v56=37;
const v57=38;
const v58=39;
const v59=[v51,v52,v53,v54,v55,v56,v57,v58];
const v60=40;
const v61=41;
const v62=42;
const v63=43;
const v64=44;
const v65=45;
const v66=46;
const v67=47;
const v68=[v60,v61,v62,v63,v64,v65,v66,v67];
const v69=v59.length;
const v70=v68.length;
const v71=new Array(v69+v70);
for(let v72=0;v72<v69;v72++){v71[v72]=v59[v72];}
for(let v73=0;v73<v70;v73++){v71[v69+v73]=v68[v73];}
const v74=48;
const v75=49;
const v76=50;
const v77=51;
const v78=52;
const v79=53;
const v80=54;
const v81=55;
const v82=[v74,v75,v76,v77,v78,v79,v80,v81];
const v83=56;
const v84=57;
const v85=58;
const v86=59;
const v87=60;
const v88=61;
const v89=62;
const v90=63;
const v91=[v83,v84,v85,v86,v87,v88,v89,v90];
const v92=v82.length;
const v93=v91.length;
const v94=new Array(v92+v93);
for(let v95=0;v95<v92;v95++){v94[v95]=v82[v95];}
for(let v96=0;v96<v93;v96++){v94[v92+v96]=v91[v96];}
const v97=v71.length;
const v98=v94.length;
const v99=new Array(v97+v98);
for(let v100=0;v100<v97;v100++){v99[v100]=v71[v100];}
for(let v101=0;v101<v98;v101++){v99[v97+v101]=v94[v101];}
const v102=v48.length;
const v103=v99.length;
const v104=new Array(v102+v103);
for(let v105=0;v105<v102;v105++){v104[v105]=v48[v105];}
for(let v106=0;v106<v103;v106++){v104[v102+v106]=v99[v106];}
const v107=64;
const v108=65;
const v109=66;
const v110=67;
const v111=68;
const v112=69;
const v113=70;
const v114=71;
const v115=[v107,v108,v109,v110,v111,v112,v113,v114];
const v116=72;
const v117=73;
const v118=74;
const v119=75;
const v120=76;
const v121=77;
const v122=78;
const v123=79;
const v124=[v116,v117,v118,v119,v120,v121,v122,v123];
const v125=v115.length;
const v126=v124.length;
const v127=new Array(v125+v126);
for(let v128=0;v128<v125;v128++){v127[v128]=v115[v128];}
for(let v129=0;v129<v126;v129++){v127[v125+v129]=v124[v129];}
const v130=80;
const v131=81;
const v132=82;
const v133=83;
const v134=84;
const v135=85;
const v136=86;
const v137=87;
const v138=[v130,v131,v132,v133,v134,v135,v136,v137];
const v139=88;
const v140=89;
const v141=90;
const v142=91;
const v143=92;
const v144=93;
const v145=94;
const v146=95;
const v147=[v139,v140,v141,v142,v143,v144,v145,v146];
const v148=v138.length;
const v149=v147.length;
const v150=new Array(v148+v149);
for(let v151=0;v151<v148;v151++){v150[v151]=v138[v151];}
for(let v152=0;v152<v149;v152++){v150[v148+v152]=v147[v152];}
const v153=v127.length;
const v154=v150.length;
const v155=new Array(v153+v154);
for(let v156=0;v156<v153;v156++){v155[v156]=v127[v156];}
for(let v157=0;v157<v154;v157++){v155[v153+v157]=v150[v157];}
const v158=96;
const v159=97;
const v160=98;
const v161=99;
const v162=100;
const v163=101;
const v164=102;
const v165=103;
const v166=[v158,v159,v160,v161,v162,v163,v164,v165];
const v167=104;
const v168=105;
const v169=106;
const v170=107;
const v171=108;
const v172=109;
const v173=110;
const v174=111;
const v175=[v167,v168,v169,v170,v171,v172,v173,v174];
const v176=v166.length;
const v177=v175.length;
const v178=new Array(v176+v177);
for(let v179=0;v179<v176;v179++){v178[v179]=v166[v179];}
for(let v180=0;v180<v177;v180++){v178[v176+v180]=v175[v180];}
const v181=112;
const v182=113;
const v183=114;
const v184=115;
const v185=116;
const v186=117;
const v187=118;
const v188=119;
const v189=[v181,v182,v183,v184,v185,v186,v187,v188];
const v190=120;
const v191=121;
const v192=122;
const v193=123;
const v194=124;
const v195=125;
const v196=126;
const v197=127;
const v198=[v190,v191,v192,v193,v194,v195,v196,v197];
const v199=v189.length;
const v200=v198.length;
const v201=new Array(v199+v200);
for(let v202=0;v202<v199;v202++){v201[v202]=v189[v202];}
for(let v203=0;v203<v200;v203++){v201[v199+v203]=v198[v203];}
const v204=v178.length;
const v205=v201.length;
const v206=new Array(v204+v205);
for(let v207=0;v207<v204;v207++){v206[v207]=v178[v207];}
for(let v208=0;v208<v205;v208++){v206[v204+v208]=v201[v208];}
const v209=v155.length;
const v210=v206.length;
const v211=new Array(v209+v210);
for(let v212=0;v212<v209;v212++){v211[v212]=v155[v212];}
for(let v213=0;v213<v210;v213++){v211[v209+v213]=v206[v213];}
const v214=v104.length;
const v215=v211.length;
const v216=new Array(v214+v215);
for(let v217=0;v217<v214;v217++){v216[v217]=v104[v217];}
for(let v218=0;v218<v215;v218++){v216[v214+v218]=v211[v218];}
const v219=128;
const v220=129;
const v221=130;
const v222=131;
const v223=132;
const v224=133;
const v225=134;
const v226=135;
const v227=[v219,v220,v221,v222,v223,v224,v225,v226];
const v228=136;
const v229=137;
const v230=138;
const v231=139;
const v232=140;
const v233=141;
const v234=142;
const v235=143;
const v236=[v228,v229,v230,v231,v232,v233,v234,v235];
const v237=v227.length;
const v238=v236.length;
const v239=new Array(v237+v238);
for(let v240=0;v240<v237;v240++){v239[v240]=v227[v240];}
for(let v241=0;v241<v238;v241++){v239[v237+v241]=v236[v241];}
const v242=144;
const v243=145;
const v244=146;
const v245=147;
const v246=148;
const v247=149;
const v248=150;
const v249=151;
const v250=[v242,v243,v244,v245,v246,v247,v248,v249];
const v251=152;
const v252=153;
const v253=154;
const v254=155;
const v255=156;
const v256=157;
const v257=158;
const v258=159;
const v259=[v251,v252,v253,v254,v255,v256,v257,v258];
const v260=v250.length;
const v261=v259.length;
const v262=new Array(v260+v261);
for(let v263=0;v263<v260;v263++){v262[v263]=v250[v263];}
for(let v264=0;v264<v261;v264++){v262[v260+v264]=v259[v264];}
const v265=v239.length;
const v266=v262.length;
const v267=new Array(v265+v266);
for(let v268=0;v268<v265;v268++){v267[v268]=v239[v268];}
for(let v269=0;v269<v266;v269++){v267[v265+v269]=v262[v269];}
const v270=160;
const v271=161;
const v272=162;
const v273=163;
const v274=164;
const v275=165;
const v276=166;
const v277=167;
const v278=[v270,v271,v272,v273,v274,v275,v276,v277];
const v279=168;
const v280=169;
const v281=170;
const v282=171;
const v283=172;
const v284=173;
const v285=174;
const v286=175;
const v287=[v279,v280,v281,v282,v283,v284,v285,v286];
const v288=v278.length;
const v289=v287.length;
const v290=new Array(v288+v289);
for(let v291=0;v291<v288;v291++){v290[v291]=v278[v291];}
for(let v292=0;v292<v289;v292++){v290[v288+v292]=v287[v292];}
const v293=176;
const v294=177;
const v295=178;
const v296=179;
const v297=180;
const v298=181;
const v299=182;
const v300=183;
const v301=[v293,v294,v295,v296,v297,v298,v299,v300];
const v302=184;
const v303=185;
const v304=186;
const v305=187;
const v306=188;
const v307=189;
const v308=190;
const v309=191;
const v310=[v302,v303,v304,v305,v306,v307,v308,v309];
const v311=v301.length;
const v312=v310.length;
const v313=new Array(v311+v312);
for(let v314=0;v314<v311;v314++){v313[v314]=v301[v314];}
for(let v315=0;v315<v312;v315++){v313[v311+v315]=v310[v315];}
const v316=v290.length;
const v317=v313.length;
const v318=new Array(v316+v317);
for(let v319=0;v319<v316;v319++){v318[v319]=v290[v319];}
for(let v320=0;v320<v317;v320++){v318[v316+v320]=v313[v320];}
const v321=v267.length;
const v322=v318.length;
const v323=new Array(v321+v322);
for(let v324=0;v324<v321;v324++){v323[v324]=v267[v324];}
for(let v325=0;v325<v322;v325++){v323[v321+v325]=v318[v325];}
const v326=192;
const v327=193;
const v328=194;
const v329=195;
const v330=196;
const v331=197;
const v332=198;
const v333=199;
const v334=[v326,v327,v328,v329,v330,v331,v332,v333];
const v335=200;
const v336=201;
const v337=202;
const v338=203;
const v339=204;
const v340=205;
const v341=206;
const v342=207;
const v343=[v335,v336,v337,v338,v339,v340,v341,v342];
const v344=v334.length;
const v345=v343.length;
const v346=new Array(v344+v345);
for(let v347=0;v347<v344;v347++){v346[v347]=v334[v347];}
for(let v348=0;v348<v345;v348++){v346[v344+v348]=v343[v348];}
const v349=208;
const v350=209;
const v351=210;
const v352=211;
const v353=212;
const v354=213;
const v355=214;
const v356=215;
const v357=[v349,v350,v351,v352,v353,v354,v355,v356];
const v358=216;
const v359=217;
const v360=218;
const v361=219;
const v362=220;
const v363=221;
const v364=222;
const v365=223;
const v366=[v358,v359,v360,v361,v362,v363,v364,v365];
const v367=v357.length;
const v368=v366.length;
const v369=new Array(v367+v368);
for(let v370=0;v370<v367;v370++){v369[v370]=v357[v370];}
for(let v371=0;v371<v368;v371++){v369[v367+v371]=v366[v371];}
const v372=v346.length;
const v373=v369.length;
const v374=new Array(v372+v373);
for(let v375=0;v375<v372;v375++){v374[v375]=v346[v375];}
for(let v376=0;v376<v373;v376++){v374[v372+v376]=v369[v376];}
const v377=224;
const v378=225;
const v379=226;
const v380=227;
const v381=228;
const v382=229;
const v383=230;
const v384=231;
const v385=[v377,v378,v379,v380,v381,v382,v383,v384];
const v386=232;
const v387=233;
const v388=234;
const v389=235;
const v390=236;
const v391=237;
const v392=238;
const v393=239;
const v394=[v386,v387,v388,v389,v390,v391,v392,v393];
const v395=v385.length;
const v396=v394.length;
const v397=new Array(v395+v396);
for(let v398=0;v398<v395;v398++){v397[v398]=v385[v398];}
for(let v399=0;v399<v396;v399++){v397[v395+v399]=v394[v399];}
const v400=240;
const v401=241;
const v402=242;
const v403=243;
const v404=244;
const v405=245;
const v406=246;
const v407=247;
const v408=[v400,v401,v402,v403,v404,v405,v406,v407];
const v409=248;
const v410=249;
const v411=250;
const v412=251;
const v413=252;
const v414=253;
const v415=254;
const v416=255;
const v417=[v409,v410,v411,v412,v413,v414,v415,v416];
const v418=v408.length;
const v419=v417.length;
const v420=new Array(v418+v419);
for(let v421=0;v421<v418;v421++){v420[v421]=v408[v421];}
for(let v422=0;v422<v419;v422++){v420[v418+v422]=v417[v422];}
const v423=v397.length;
const v424=v420.length;
const v425=new Array(v423+v424);
for(let v426=0;v426<v423;v426++){v425[v426]=v397[v426];}
for(let v427=0;v427<v424;v427++){v425[v423+v427]=v420[v427];}
const v428=v374.length;
const v429=v425.length;
const v430=new Array(v428+v429);
for(let v431=0;v431<v428;v431++){v430[v431]=v374[v431];}
for(let v432=0;v432<v429;v432++){v430[v428+v432]=v425[v432];}
const v433=v323.length;
const v434=v430.length;
const v435=new Array(v433+v434);
for(let v436=0;v436<v433;v436++){v435[v436]=v323[v436];}
for(let v437=0;v437<v434;v437++){v435[v433+v437]=v430[v437];}
const v438=v216.length;
const v439=v435.length;
const v440=new Array(v438+v439);
for(let v441=0;v441<v438;v441++){v440[v441]=v216[v441];}
for(let v442=0;v442<v439;v442++){v440[v438+v442]=v435[v442];}
const v443=256;
const v444=257;
const v445=258;
const v446=259;
const v447=260;
const v448=261;
const v449=262;
const v450=263;
const v451=[v443,v444,v445,v446,v447,v448,v449,v450];
const v452=264;
const v453=265;
const v454=266;
const v455=267;
const v456=268;
const v457=269;
const v458=270;
const v459=271;
const v460=[v452,v453,v454,v455,v456,v457,v458,v459];
const v461=v451.length;
const v462=v460.length;
const v463=new Array(v461+v462);
for(let v464=0;v464<v461;v464++){v463[v464]=v451[v464];}
for(let v465=0;v465<v462;v465++){v463[v461+v465]=v460[v465];}
const v466=272;
const v467=273;
const v468=274;
const v469=275;
const v470=276;
const v471=277;
const v472=278;
const v473=279;
const v474=[v466,v467,v468,v469,v470,v471,v472,v473];
const v475=280;
const v476=281;
const v477=282;
const v478=283;
const v479=284;
const v480=285;
const v481=286;
const v482=287;
const v483=[v475,v476,v477,v478,v479,v480,v481,v482];
const v484=v474.length;
const v485=v483.length;
const v486=new Array(v484+v485);
for(let v487=0;v487<v484;v487++){v486[v487]=v474[v487];}
for(let v488=0;v488<v485;v488++){v486[v484+v488]=v483[v488];}
const v489=v463.length;
const v490=v486.length;
const v491=new Array(v489+v490);
for(let v492=0;v492<v489;v492++){v491[v492]=v463[v492];}
for(let v493=0;v493<v490;v493++){v491[v489+v493]=v486[v493];}
const v494=288;
const v495=289;
const v496=290;
const v497=291;
const v498=292;
const v499=293;
const v500=294;
const v501=295;
const v502=[v494,v495,v496,v497,v498,v499,v500,v501];
const v503=296;
const v504=297;
const v505=298;
const v506=299;
const v507=300;
const v508=301;
const v509=302;
const v510=303;
const v511=[v503,v504,v505,v506,v507,v508,v509,v510];
const v512=v502.length;
const v513=v511.length;
const v514=new Array(v512+v513);
for(let v515=0;v515<v512;v515++){v514[v515]=v502[v515];}
for(let v516=0;v516<v513;v516++){v514[v512+v516]=v511[v516];}
const v517=304;
const v518=305;
const v519=306;
const v520=307;
const v521=308;
const v522=309;
const v523=310;
const v524=311;
const v525=[v517,v518,v519,v520,v521,v522,v523,v524];
const v526=312;
const v527=313;
const v528=314;
const v529=315;
const v530=316;
const v531=317;
const v532=318;
const v533=319;
const v534=[v526,v527,v528,v529,v530,v531,v532,v533];
const v535=v525.length;
const v536=v534.length;
const v537=new Array(v535+v536);
for(let v538=0;v538<v535;v538++){v537[v538]=v525[v538];}
for(let v539=0;v539<v536;v539++){v537[v535+v539]=v534[v539];}
const v540=v514.length;
const v541=v537.length;
const v542=new Array(v540+v541);
for(let v543=0;v543<v540;v543++){v542[v543]=v514[v543];}
for(let v544=0;v544<v541;v544++){v542[v540+v544]=v537[v544];}
const v545=v491.length;
const v546=v542.length;
const v547=new Array(v545+v546);
for(let v548=0;v548<v545;v548++){v547[v548]=v491[v548];}
for(let v549=0;v549<v546;v549++){v547[v545+v549]=v542[v549];}
const v550=320;
const v551=321;
const v552=322;
const v553=323;
const v554=324;
const v555=325;
const v556=326;
const v557=327;
const v558=[v550,v551,v552,v553,v554,v555,v556,v557];
const v559=328;
const v560=329;
const v561=330;
const v562=331;
const v563=332;
const v564=333;
const v565=334;
const v566=335;
const v567=[v559,v560,v561,v562,v563,v564,v565,v566];
const v568=v558.length;
const v569=v567.length;
const v570=new Array(v568+v569);
for(let v571=0;v571<v568;v571++){v570[v571]=v558[v571];}
for(let v572=0;v572<v569;v572++){v570[v568+v572]=v567[v572];}
const v573=336;
const v574=337;
const v575=338;
const v576=339;
const v577=340;
const v578=341;
const v579=342;
const v580=343;
const v581=[v573,v574,v575,v576,v577,v578,v579,v580];
const v582=344;
const v583=345;
const v584=346;
const v585=347;
const v586=348;
const v587=349;
const v588=350;
const v589=351;
const v590=[v582,v583,v584,v585,v586,v587,v588,v589];
const v591=v581.length;
const v592=v590.length;
const v593=new Array(v591+v592);
for(let v594=0;v594<v591;v594++){v593[v594]=v581[v594];}
for(let v595=0;v595<v592;v595++){v593[v591+v595]=v590[v595];}
const v596=v570.length;
const v597=v593.length;
const v598=new Array(v596+v597);
for(let v599=0;v599<v596;v599++){v598[v599]=v570[v599];}
for(let v600=0;v600<v597;v600++){v598[v596+v600]=v593[v600];}
const v601=352;
const v602=353;
const v603=354;
const v604=355;
const v605=356;
const v606=357;
const v607=358;
const v608=359;
const v609=[v601,v602,v603,v604,v605,v606,v607,v608];
const v610=360;
const v611=361;
const v612=362;
const v613=363;
const v614=364;
const v615=365;
const v616=366;
const v617=367;
const v618=[v610,v611,v612,v613,v614,v615,v616,v617];
const v619=v609.length;
const v620=v618.length;
const v621=new Array(v619+v620);
for(let v622=0;v622<v619;v622++){v621[v622]=v609[v622];}
for(let v623=0;v623<v620;v623++){v621[v619+v623]=v618[v623];}
const v624=368;
const v625=369;
const v626=370;
const v627=371;
const v628=372;
const v629=373;
const v630=374;
const v631=375;
const v632=[v624,v625,v626,v627,v628,v629,v630,v631];
const v633=376;
const v634=377;
const v635=378;
const v636=379;
const v637=380;
const v638=381;
const v639=382;
const v640=383;
const v641=[v633,v634,v635,v636,v637,v638,v639,v640];
const v642=v632.length;
const v643=v641.length;
const v644=new Array(v642+v643);
for(let v645=0;v645<v642;v645++){v644[v645]=v632[v645];}
for(let v646=0;v646<v643;v646++){v644[v642+v646]=v641[v646];}
const v647=v621.length;
const v648=v644.length;
const v649=new Array(v647+v648);
for(let v650=0;v650<v647;v650++){v649[v650]=v621[v650];}
for(let v651=0;v651<v648;v651++){v649[v647+v651]=v644[v651];}
const v652=v598.length;
const v653=v649.length;
const v654=new Array(v652+v653);
for(let v655=0;v655<v652;v655++){v654[v655]=v598[v655];}
for(let v656=0;v656<v653;v656++){v654[v652+v656]=v649[v656];}
const v657=v547.length;
const v658=v654.length;
const v659=new Array(v657+v658);
for(let v660=0;v660<v657;v660++){v659[v660]=v547[v660];}
for(let v661=0;v661<v658;v661++){v659[v657+v661]=v654[v661];}
const v662=384;
const v663=385;
const v664=386;
const v665=387;
const v666=388;
const v667=389;
const v668=390;
const v669=391;
const v670=[v662,v663,v664,v665,v666,v667,v668,v669];
const v671=392;
const v672=393;
const v673=394;
const v674=395;
const v675=396;
const v676=397;
const v677=398;
const v678=399;
const v679=[v671,v672,v673,v674,v675,v676,v677,v678];
const v680=v670.length;
const v681=v679.length;
const v682=new Array(v680+v681);
for(let v683=0;v683<v680;v683++){v682[v683]=v670[v683];}
for(let v684=0;v684<v681;v684++){v682[v680+v684]=v679[v684];}
const v685=400;
const v686=401;
const v687=402;
const v688=403;
const v689=404;
const v690=405;
const v691=406;
const v692=407;
const v693=[v685,v686,v687,v688,v689,v690,v691,v692];
const v694=408;
const v695=409;
const v696=410;
const v697=411;
const v698=412;
const v699=413;
const v700=414;
const v701=415;
const v702=[v694,v695,v696,v697,v698,v699,v700,v701];
const v703=v693.length;
const v704=v702.length;
const v705=new Array(v703+v704);
for(let v706=0;v706<v703;v706++){v705[v706]=v693[v706];}
for(let v707=0;v707<v704;v707++){v705[v703+v707]=v702[v707];}
const v708=v682.length;
const v709=v705.length;
const v710=new Array(v708+v709);
for(let v711=0;v711<v708;v711++){v710[v711]=v682[v711];}
for(let v712=0;v712<v709;v712++){v710[v708+v712]=v705[v712];}
const v713=416;
const v714=417;
const v715=418;
const v716=419;
const v717=420;
const v718=421;
const v719=422;
const v720=423;
const v721=[v713,v714,v715,v716,v717,v718,v719,v720];
const v722=424;
const v723=425;
const v724=426;
const v725=427;
const v726=428;
const v727=429;
const v728=430;
const v729=431;
const v730=[v722,v723,v724,v725,v726,v727,v728,v729];
const v731=v721.length;
const v732=v730.length;
const v733=new Array(v731+v732);
for(let v734=0;v734<v731;v734++){v733[v734]=v721[v734];}
for(let v735=0;v735<v732;v735++){v733[v731+v735]=v730[v735];}
const v736=432;
const v737=433;
const v738=434;
const v739=435;
const v740=436;
const v741=437;
const v742=438;
const v743=439;
const v744=[v736,v737,v738,v739,v740,v741,v742,v743];
const v745=440;
const v746=441;
const v747=442;
const v748=443;
const v749=444;
const v750=445;
const v751=446;
const v752=447;
const v753=[v745,v746,v747,v748,v749,v750,v751,v752];
const v754=v744.length;
const v755=v753.length;
const v756=new Array(v754+v755);
for(let v757=0;v757<v754;v757++){v756[v757]=v744[v757];}
for(let v758=0;v758<v755;v758++){v756[v754+v758]=v753[v758];}
const v759=v733.length;
const v760=v756.length;
const v761=new Array(v759+v760);
for(let v762=0;v762<v759;v762++){v761[v762]=v733[v762];}
for(let v763=0;v763<v760;v763++){v761[v759+v763]=v756[v763];}
const v764=v710.length;
const v765=v761.length;
const v766=new Array(v764+v765);
for(let v767=0;v767<v764;v767++){v766[v767]=v710[v767];}
for(let v768=0;v768<v765;v768++){v766[v764+v768]=v761[v768];}
const v769=448;
const v770=449;
const v771=450;
const v772=451;
const v773=452;
const v774=453;
const v775=454;
const v776=455;
const v777=[v769,v770,v771,v772,v773,v774,v775,v776];
const v778=456;
const v779=457;
const v780=458;
const v781=459;
const v782=460;
const v783=461;
const v784=462;
const v785=463;
const v786=[v778,v779,v780,v781,v782,v783,v784,v785];
const v787=v777.length;
const v788=v786.length;
const v789=new Array(v787+v788);
for(let v790=0;v790<v787;v790++){v789[v790]=v777[v790];}
for(let v791=0;v791<v788;v791++){v789[v787+v791]=v786[v791];}
const v792=464;
const v793=465;
const v794=466;
const v795=467;
const v796=468;
const v797=469;
const v798=470;
const v799=471;
const v800=[v792,v793,v794,v795,v796,v797,v798,v799];
const v801=472;
const v802=473;
const v803=474;
const v804=475;
const v805=476;
const v806=477;
const v807=478;
const v808=479;
const v809=[v801,v802,v803,v804,v805,v806,v807,v808];
const v810=v800.length;
const v811=v809.length;
const v812=new Array(v810+v811);
for(let v813=0;v813<v810;v813++){v812[v813]=v800[v813];}
for(let v814=0;v814<v811;v814++){v812[v810+v814]=v809[v814];}
const v815=v789.length;
const v816=v812.length;
const v817=new Array(v815+v816);
for(let v818=0;v818<v815;v818++){v817[v818]=v789[v818];}
for(let v819=0;v819<v816;v819++){v817[v815+v819]=v812[v819];}
const v820=480;
const v821=481;
const v822=482;
const v823=483;
const v824=484;
const v825=485;
const v826=486;
const v827=487;
const v828=[v820,v821,v822,v823,v824,v825,v826,v827];
const v829=488;
const v830=489;
const v831=490;
const v832=491;
const v833=492;
const v834=493;
const v835=494;
const v836=495;
const v837=[v829,v830,v831,v832,v833,v834,v835,v836];
const v838=v828.length;
const v839=v837.length;
const v840=new Array(v838+v839);
for(let v841=0;v841<v838;v841++){v840[v841]=v828[v841];}
for(let v842=0;v842<v839;v842++){v840[v838+v842]=v837[v842];}
const v843=496;
const v844=497;
const v845=498;
const v846=499;
const v847=500;
const v848=501;
const v849=502;
const v850=503;
const v851=[v843,v844,v845,v846,v847,v848,v849,v850];
const v852=504;
const v853=505;
const v854=506;
const v855=507;
const v856=508;
const v857=509;
const v858=510;
const v859=511;
const v860=[v852,v853,v854,v855,v856,v857,v858,v859];
const v861=v851.length;
const v862=v860.length;
const v863=new Array(v861+v862);
for(let v864=0;v864<v861;v864++){v863[v864]=v851[v864];}
for(let v865=0;v865<v862;v865++){v863[v861+v865]=v860[v865];}
const v866=v840.length;
const v867=v863.length;
const v868=new Array(v866+v867);
for(let v869=0;v869<v866;v869++){v868[v869]=v840[v869];}
for(let v870=0;v870<v867;v870++){v868[v866+v870]=v863[v870];}
const v871=v817.length;
const v872=v868.length;
const v873=new Array(v871+v872);
for(let v874=0;v874<v871;v874++){v873[v874]=v817[v874];}
for(let v875=0;v875<v872;v875++){v873[v871+v875]=v868[v875];}
const v876=v766.length;
const v877=v873.length;
const v878=new Array(v876+v877);
for(let v879=0;v879<v876;v879++){v878[v879]=v766[v879];}
for(let v880=0;v880<v877;v880++){v878[v876+v880]=v873[v880];}
const v881=v659.length;
const v882=v878.length;
const v883=new Array(v881+v882);
for(let v884=0;v884<v881;v884++){v883[v884]=v659[v884];}
for(let v885=0;v885<v882;v885++){v883[v881+v885]=v878[v885];}
const v886=v440.length;
const v887=v883.length;
const v888=new Array(v886+v887);
for(let v889=0;v889<v886;v889++){v888[v889]=v440[v889];}
for(let v890=0;v890<v887;v890++){v888[v886+v890]=v883[v890];}
const v891=512;
const v892=513;
const v893=514;
const v894=515;
const v895=516;
const v896=517;
const v897=518;
const v898=519;
const v899=[v891,v892,v893,v894,v895,v896,v897,v898];
const v900=520;
const v901=521;
const v902=522;
const v903=523;
const v904=524;
const v905=525;
const v906=526;
const v907=527;
const v908=[v900,v901,v902,v903,v904,v905,v906,v907];
const v909=v899.length;
const v910=v908.length;
const v911=new Array(v909+v910);
for(let v912=0;v912<v909;v912++){v911[v912]=v899[v912];}
for(let v913=0;v913<v910;v913++){v911[v909+v913]=v908[v913];}
const v914=528;
const v915=529;
const v916=530;
const v917=531;
const v918=532;
const v919=533;
const v920=534;
const v921=535;
const v922=[v914,v915,v916,v917,v918,v919,v920,v921];
const v923=536;
const v924=537;
const v925=538;
const v926=539;
const v927=540;
const v928=541;
const v929=542;
const v930=543;
const v931=[v923,v924,v925,v926,v927,v928,v929,v930];
const v932=v922.length;
const v933=v931.length;
const v934=new Array(v932+v933);
for(let v935=0;v935<v932;v935++){v934[v935]=v922[v935];}
for(let v936=0;v936<v933;v936++){v934[v932+v936]=v931[v936];}
const v937=v911.length;
const v938=v934.length;
const v939=new Array(v937+v938);
for(let v940=0;v940<v937;v940++){v939[v940]=v911[v940];}
for(let v941=0;v941<v938;v941++){v939[v937+v941]=v934[v941];}
const v942=544;
const v943=545;
const v944=546;
const v945=547;
const v946=548;
const v947=549;
const v948=550;
const v949=551;
const v950=[v942,v943,v944,v945,v946,v947,v948,v949];
const v951=552;
const v952=553;
const v953=554;
const v954=555;
const v955=556;
const v956=557;
const v957=558;
const v958=559;
const v959=[v951,v952,v953,v954,v955,v956,v957,v958];
const v960=v950.length;
const v961=v959.length;
const v962=new Array(v960+v961);
for(let v963=0;v963<v960;v963++){v962[v963]=v950[v963];}
for(let v964=0;v964<v961;v964++){v962[v960+v964]=v959[v964];}
const v965=560;
const v966=561;
const v967=562;
const v968=563;
const v969=564;
const v970=565;
const v971=566;
const v972=567;
const v973=[v965,v966,v967,v968,v969,v970,v971,v972];
const v974=568;
const v975=569;
const v976=570;
const v977=571;
const v978=572;
const v979=573;
const v980=574;
const v981=575;
const v982=[v974,v975,v976,v977,v978,v979,v980,v981];
const v983=v973.length;
const v984=v982.length;
const v985=new Array(v983+v984);
for(let v986=0;v986<v983;v986++){v985[v986]=v973[v986];}
for(let v987=0;v987<v984;v987++){v985[v983+v987]=v982[v987];}
const v988=v962.length;
const v989=v985.length;
const v990=new Array(v988+v989);
for(let v991=0;v991<v988;v991++){v990[v991]=v962[v991];}
for(let v992=0;v992<v989;v992++){v990[v988+v992]=v985[v992];}
const v993=v939.length;
const v994=v990.length;
const v995=new Array(v993+v994);
for(let v996=0;v996<v993;v996++){v995[v996]=v939[v996];}
for(let v997=0;v997<v994;v997++){v995[v993+v997]=v990[v997];}
const v998=576;
const v999=577;
const v1000=578;
const v1001=579;
const v1002=580;
const v1003=581;
const v1004=582;
const v1005=583;
const v1006=[v998,v999,v1000,v1001,v1002,v1003,v1004,v1005];
const v1007=584;
const v1008=585;
const v1009=586;
const v1010=587;
const v1011=588;
const v1012=589;
const v1013=590;
const v1014=591;
const v1015=[v1007,v1008,v1009,v1010,v1011,v1012,v1013,v1014];
const v1016=v1006.length;
const v1017=v1015.length;
const v1018=new Array(v1016+v1017);
for(let v1019=0;v1019<v1016;v1019++){v1018[v1019]=v1006[v1019];}
for(let v1020=0;v1020<v1017;v1020++){v1018[v1016+v1020]=v1015[v1020];}
const v1021=592;
const v1022=593;
const v1023=594;
const v1024=595;
const v1025=596;
const v1026=597;
const v1027=598;
const v1028=599;
const v1029=[v1021,v1022,v1023,v1024,v1025,v1026,v1027,v1028];
const v1030=600;
const v1031=601;
const v1032=602;
const v1033=603;
const v1034=604;
const v1035=605;
const v1036=606;
const v1037=607;
const v1038=[v1030,v1031,v1032,v1033,v1034,v1035,v1036,v1037];
const v1039=v1029.length;
const v1040=v1038.length;
const v1041=new Array(v1039+v1040);
for(let v1042=0;v1042<v1039;v1042++){v1041[v1042]=v1029[v1042];}
for(let v1043=0;v1043<v1040;v1043++){v1041[v1039+v1043]=v1038[v1043];}
const v1044=v1018.length;
const v1045=v1041.length;
const v1046=new Array(v1044+v1045);
for(let v1047=0;v1047<v1044;v1047++){v1046[v1047]=v1018[v1047];}
for(let v1048=0;v1048<v1045;v1048++){v1046[v1044+v1048]=v1041[v1048];}
const v1049=608;
const v1050=609;
const v1051=610;
const v1052=611;
const v1053=612;
const v1054=613;
const v1055=614;
const v1056=615;
const v1057=[v1049,v1050,v1051,v1052,v1053,v1054,v1055,v1056];
const v1058=616;
const v1059=617;
const v1060=618;
const v1061=619;
const v1062=620;
const v1063=621;
const v1064=622;
const v1065=623;
const v1066=[v1058,v1059,v1060,v1061,v1062,v1063,v1064,v1065];
const v1067=v1057.length;
const v1068=v1066.length;
const v1069=new Array(v1067+v1068);
for(let v1070=0;v1070<v1067;v1070++){v1069[v1070]=v1057[v1070];}
for(let v1071=0;v1071<v1068;v1071++){v1069[v1067+v1071]=v1066[v1071];}
const v1072=624;
const v1073=625;
const v1074=626;
const v1075=627;
const v1076=628;
const v1077=629;
const v1078=630;
const v1079=631;
const v1080=[v1072,v1073,v1074,v1075,v1076,v1077,v1078,v1079];
const v1081=632;
const v1082=633;
const v1083=634;
const v1084=635;
const v1085=636;
const v1086=637;
const v1087=638;
const v1088=639;
const v1089=[v1081,v1082,v1083,v1084,v1085,v1086,v1087,v1088];
const v1090=v1080.length;
const v1091=v1089.length;
const v1092=new Array(v1090+v1091);
for(let v1093=0;v1093<v1090;v1093++){v1092[v1093]=v1080[v1093];}
for(let v1094=0;v1094<v1091;v1094++){v1092[v1090+v1094]=v1089[v1094];}
const v1095=v1069.length;
const v1096=v1092.length;
const v1097=new Array(v1095+v1096);
for(let v1098=0;v1098<v1095;v1098++){v1097[v1098]=v1069[v1098];}
for(let v1099=0;v1099<v1096;v1099++){v1097[v1095+v1099]=v1092[v1099];}
const v1100=v1046.length;
const v1101=v1097.length;
const v1102=new Array(v1100+v1101);
for(let v1103=0;v1103<v1100;v1103++){v1102[v1103]=v1046[v1103];}
for(let v1104=0;v1104<v1101;v1104++){v1102[v1100+v1104]=v1097[v1104];}
const v1105=v995.length;
const v1106=v1102.length;
const v1107=new Array(v1105+v1106);
for(let v1108=0;v1108<v1105;v1108++){v1107[v1108]=v995[v1108];}
for(let v1109=0;v1109<v1106;v1109++){v1107[v1105+v1109]=v1102[v1109];}
const v1110=640;
const v1111=641;
const v1112=642;
const v1113=643;
const v1114=644;
const v1115=645;
const v1116=646;
const v1117=647;
const v1118=[v1110,v1111,v1112,v1113,v1114,v1115,v1116,v1117];
const v1119=648;
const v1120=649;
const v1121=650;
const v1122=651;
const v1123=652;
const v1124=653;
const v1125=654;
const v1126=655;
const v1127=[v1119,v1120,v1121,v1122,v1123,v1124,v1125,v1126];
const v1128=v1118.length;
const v1129=v1127.length;
const v1130=new Array(v1128+v1129);
for(let v1131=0;v1131<v1128;v1131++){v1130[v1131]=v1118[v1131];}
for(let v1132=0;v1132<v1129;v1132++){v1130[v1128+v1132]=v1127[v1132];}
const v1133=656;
const v1134=657;
const v1135=658;
const v1136=659;
const v1137=660;
const v1138=661;
const v1139=662;
const v1140=663;
const v1141=[v1133,v1134,v1135,v1136,v1137,v1138,v1139,v1140];
const v1142=664;
const v1143=665;
const v1144=666;
const v1145=667;
const v1146=668;
const v1147=669;
const v1148=670;
const v1149=671;
const v1150=[v1142,v1143,v1144,v1145,v1146,v1147,v1148,v1149];
const v1151=v1141.length;
const v1152=v1150.length;
const v1153=new Array(v1151+v1152);
for(let v1154=0;v1154<v1151;v1154++){v1153[v1154]=v1141[v1154];}
for(let v1155=0;v1155<v1152;v1155++){v1153[v1151+v1155]=v1150[v1155];}
const v1156=v1130.length;
const v1157=v1153.length;
const v1158=new Array(v1156+v1157);
for(let v1159=0;v1159<v1156;v1159++){v1158[v1159]=v1130[v1159];}
for(let v1160=0;v1160<v1157;v1160++){v1158[v1156+v1160]=v1153[v1160];}
const v1161=672;
const v1162=673;
const v1163=674;
const v1164=675;
const v1165=676;
const v1166=677;
const v1167=678;
const v1168=679;
const v1169=[v1161,v1162,v1163,v1164,v1165,v1166,v1167,v1168];
const v1170=680;
const v1171=681;
const v1172=682;
const v1173=683;
const v1174=684;
const v1175=685;
const v1176=686;
const v1177=687;
const v1178=[v1170,v1171,v1172,v1173,v1174,v1175,v1176,v1177];
const v1179=v1169.length;
const v1180=v1178.length;
const v1181=new Array(v1179+v1180);
for(let v1182=0;v1182<v1179;v1182++){v1181[v1182]=v1169[v1182];}
for(let v1183=0;v1183<v1180;v1183++){v1181[v1179+v1183]=v1178[v1183];}
const v1184=688;
const v1185=689;
const v1186=690;
const v1187=691;
const v1188=692;
const v1189=693;
const v1190=694;
const v1191=695;
const v1192=[v1184,v1185,v1186,v1187,v1188,v1189,v1190,v1191];
const v1193=696;
const v1194=697;
const v1195=698;
const v1196=699;
const v1197=700;
const v1198=701;
const v1199=702;
const v1200=703;
const v1201=[v1193,v1194,v1195,v1196,v1197,v1198,v1199,v1200];
const v1202=v1192.length;
const v1203=v1201.length;
const v1204=new Array(v1202+v1203);
for(let v1205=0;v1205<v1202;v1205++){v1204[v1205]=v1192[v1205];}
for(let v1206=0;v1206<v1203;v1206++){v1204[v1202+v1206]=v1201[v1206];}
const v1207=v1181.length;
const v1208=v1204.length;
const v1209=new Array(v1207+v1208);
for(let v1210=0;v1210<v1207;v1210++){v1209[v1210]=v1181[v1210];}
for(let v1211=0;v1211<v1208;v1211++){v1209[v1207+v1211]=v1204[v1211];}
const v1212=v1158.length;
const v1213=v1209.length;
const v1214=new Array(v1212+v1213);
for(let v1215=0;v1215<v1212;v1215++){v1214[v1215]=v1158[v1215];}
for(let v1216=0;v1216<v1213;v1216++){v1214[v1212+v1216]=v1209[v1216];}
const v1217=704;
const v1218=705;
const v1219=706;
const v1220=707;
const v1221=708;
const v1222=709;
const v1223=710;
const v1224=711;
const v1225=[v1217,v1218,v1219,v1220,v1221,v1222,v1223,v1224];
const v1226=712;
const v1227=713;
const v1228=714;
const v1229=715;
const v1230=716;
const v1231=717;
const v1232=718;
const v1233=719;
const v1234=[v1226,v1227,v1228,v1229,v1230,v1231,v1232,v1233];
const v1235=v1225.length;
const v1236=v1234.length;
const v1237=new Array(v1235+v1236);
for(let v1238=0;v1238<v1235;v1238++){v1237[v1238]=v1225[v1238];}
for(let v1239=0;v1239<v1236;v1239++){v1237[v1235+v1239]=v1234[v1239];}
const v1240=720;
const v1241=721;
const v1242=722;
const v1243=723;
const v1244=724;
const v1245=725;
const v1246=726;
const v1247=727;
const v1248=[v1240,v1241,v1242,v1243,v1244,v1245,v1246,v1247];
const v1249=728;
const v1250=729;
const v1251=730;
const v1252=731;
const v1253=732;
const v1254=733;
const v1255=734;
const v1256=735;
const v1257=[v1249,v1250,v1251,v1252,v1253,v1254,v1255,v1256];
const v1258=v1248.length;
const v1259=v1257.length;
const v1260=new Array(v1258+v1259);
for(let v1261=0;v1261<v1258;v1261++){v1260[v1261]=v1248[v1261];}
for(let v1262=0;v1262<v1259;v1262++){v1260[v1258+v1262]=v1257[v1262];}
const v1263=v1237.length;
const v1264=v1260.length;
const v1265=new Array(v1263+v1264);
for(let v1266=0;v1266<v1263;v1266++){v1265[v1266]=v1237[v1266];}
for(let v1267=0;v1267<v1264;v1267++){v1265[v1263+v1267]=v1260[v1267];}
const v1268=736;
const v1269=737;
const v1270=738;
const v1271=739;
const v1272=740;
const v1273=741;
const v1274=742;
const v1275=743;
const v1276=[v1268,v1269,v1270,v1271,v1272,v1273,v1274,v1275];
const v1277=744;
const v1278=745;
const v1279=746;
const v1280=747;
const v1281=748;
const v1282=749;
const v1283=750;
const v1284=751;
const v1285=[v1277,v1278,v1279,v1280,v1281,v1282,v1283,v1284];
const v1286=v1276.length;
const v1287=v1285.length;
const v1288=new Array(v1286+v1287);
for(let v1289=0;v1289<v1286;v1289++){v1288[v1289]=v1276[v1289];}
for(let v1290=0;v1290<v1287;v1290++){v1288[v1286+v1290]=v1285[v1290];}
const v1291=752;
const v1292=753;
const v1293=754;
const v1294=755;
const v1295=756;
const v1296=757;
const v1297=758;
const v1298=759;
const v1299=[v1291,v1292,v1293,v1294,v1295,v1296,v1297,v1298];
const v1300=760;
const v1301=761;
const v1302=762;
const v1303=763;
const v1304=764;
const v1305=765;
const v1306=766;
const v1307=767;
const v1308=[v1300,v1301,v1302,v1303,v1304,v1305,v1306,v1307];
const v1309=v1299.length;
const v1310=v1308.length;
const v1311=new Array(v1309+v1310);
for(let v1312=0;v1312<v1309;v1312++){v1311[v1312]=v1299[v1312];}
for(let v1313=0;v1313<v1310;v1313++){v1311[v1309+v1313]=v1308[v1313];}
const v1314=v1288.length;
const v1315=v1311.length;
const v1316=new Array(v1314+v1315);
for(let v1317=0;v1317<v1314;v1317++){v1316[v1317]=v1288[v1317];}
for(let v1318=0;v1318<v1315;v1318++){v1316[v1314+v1318]=v1311[v1318];}
const v1319=v1265.length;
const v1320=v1316.length;
const v1321=new Array(v1319+v1320);
for(let v1322=0;v1322<v1319;v1322++){v1321[v1322]=v1265[v1322];}
for(let v1323=0;v1323<v1320;v1323++){v1321[v1319+v1323]=v1316[v1323];}
const v1324=v1214.length;
const v1325=v1321.length;
const v1326=new Array(v1324+v1325);
for(let v1327=0;v1327<v1324;v1327++){v1326[v1327]=v1214[v1327];}
for(let v1328=0;v1328<v1325;v1328++){v1326[v1324+v1328]=v1321[v1328];}
const v1329=v1107.length;
const v1330=v1326.length;
const v1331=new Array(v1329+v1330);
for(let v1332=0;v1332<v1329;v1332++){v1331[v1332]=v1107[v1332];}
for(let v1333=0;v1333<v1330;v1333++){v1331[v1329+v1333]=v1326[v1333];}
const v1334=768;
const v1335=769;
const v1336=770;
const v1337=771;
const v1338=772;
const v1339=773;
const v1340=774;
const v1341=775;
const v1342=[v1334,v1335,v1336,v1337,v1338,v1339,v1340,v1341];
const v1343=776;
const v1344=777;
const v1345=778;
const v1346=779;
const v1347=780;
const v1348=781;
const v1349=782;
const v1350=783;
const v1351=[v1343,v1344,v1345,v1346,v1347,v1348,v1349,v1350];
const v1352=v1342.length;
const v1353=v1351.length;
const v1354=new Array(v1352+v1353);
for(let v1355=0;v1355<v1352;v1355++){v1354[v1355]=v1342[v1355];}
for(let v1356=0;v1356<v1353;v1356++){v1354[v1352+v1356]=v1351[v1356];}
const v1357=784;
const v1358=785;
const v1359=786;
const v1360=787;
const v1361=788;
const v1362=789;
const v1363=790;
const v1364=791;
const v1365=[v1357,v1358,v1359,v1360,v1361,v1362,v1363,v1364];
const v1366=792;
const v1367=793;
const v1368=794;
const v1369=795;
const v1370=796;
const v1371=797;
const v1372=798;
const v1373=799;
const v1374=[v1366,v1367,v1368,v1369,v1370,v1371,v1372,v1373];
const v1375=v1365.length;
const v1376=v1374.length;
const v1377=new Array(v1375+v1376);
for(let v1378=0;v1378<v1375;v1378++){v1377[v1378]=v1365[v1378];}
for(let v1379=0;v1379<v1376;v1379++){v1377[v1375+v1379]=v1374[v1379];}
const v1380=v1354.length;
const v1381=v1377.length;
const v1382=new Array(v1380+v1381);
for(let v1383=0;v1383<v1380;v1383++){v1382[v1383]=v1354[v1383];}
for(let v1384=0;v1384<v1381;v1384++){v1382[v1380+v1384]=v1377[v1384];}
const v1385=800;
const v1386=801;
const v1387=802;
const v1388=803;
const v1389=804;
const v1390=805;
const v1391=806;
const v1392=807;
const v1393=[v1385,v1386,v1387,v1388,v1389,v1390,v1391,v1392];
const v1394=808;
const v1395=809;
const v1396=810;
const v1397=811;
const v1398=812;
const v1399=813;
const v1400=814;
const v1401=815;
const v1402=[v1394,v1395,v1396,v1397,v1398,v1399,v1400,v1401];
const v1403=v1393.length;
const v1404=v1402.length;
const v1405=new Array(v1403+v1404);
for(let v1406=0;v1406<v1403;v1406++){v1405[v1406]=v1393[v1406];}
for(let v1407=0;v1407<v1404;v1407++){v1405[v1403+v1407]=v1402[v1407];}
const v1408=816;
const v1409=817;
const v1410=818;
const v1411=819;
const v1412=820;
const v1413=821;
const v1414=822;
const v1415=823;
const v1416=[v1408,v1409,v1410,v1411,v1412,v1413,v1414,v1415];
const v1417=824;
const v1418=825;
const v1419=826;
const v1420=827;
const v1421=828;
const v1422=829;
const v1423=830;
const v1424=831;
const v1425=[v1417,v1418,v1419,v1420,v1421,v1422,v1423,v1424];
const v1426=v1416.length;
const v1427=v1425.length;
const v1428=new Array(v1426+v1427);
for(let v1429=0;v1429<v1426;v1429++){v1428[v1429]=v1416[v1429];}
for(let v1430=0;v1430<v1427;v1430++){v1428[v1426+v1430]=v1425[v1430];}
const v1431=v1405.length;
const v1432=v1428.length;
const v1433=new Array(v1431+v1432);
for(let v1434=0;v1434<v1431;v1434++){v1433[v1434]=v1405[v1434];}
for(let v1435=0;v1435<v1432;v1435++){v1433[v1431+v1435]=v1428[v1435];}
const v1436=v1382.length;
const v1437=v1433.length;
const v1438=new Array(v1436+v1437);
for(let v1439=0;v1439<v1436;v1439++){v1438[v1439]=v1382[v1439];}
for(let v1440=0;v1440<v1437;v1440++){v1438[v1436+v1440]=v1433[v1440];}
const v1441=832;
const v1442=833;
const v1443=834;
const v1444=835;
const v1445=836;
const v1446=837;
const v1447=838;
const v1448=839;
const v1449=[v1441,v1442,v1443,v1444,v1445,v1446,v1447,v1448];
const v1450=840;
const v1451=841;
const v1452=842;
const v1453=843;
const v1454=844;
const v1455=845;
const v1456=846;
const v1457=847;
const v1458=[v1450,v1451,v1452,v1453,v1454,v1455,v1456,v1457];
const v1459=v1449.length;
const v1460=v1458.length;
const v1461=new Array(v1459+v1460);
for(let v1462=0;v1462<v1459;v1462++){v1461[v1462]=v1449[v1462];}
for(let v1463=0;v1463<v1460;v1463++){v1461[v1459+v1463]=v1458[v1463];}
const v1464=848;
const v1465=849;
const v1466=850;
const v1467=851;
const v1468=852;
const v1469=853;
const v1470=854;
const v1471=855;
const v1472=[v1464,v1465,v1466,v1467,v1468,v1469,v1470,v1471];
const v1473=856;
const v1474=857;
const v1475=858;
const v1476=859;
const v1477=860;
const v1478=861;
const v1479=862;
const v1480=863;
const v1481=[v1473,v1474,v1475,v1476,v1477,v1478,v1479,v1480];
const v1482=v1472.length;
const v1483=v1481.length;
const v1484=new Array(v1482+v1483);
for(let v1485=0;v1485<v1482;v1485++){v1484[v1485]=v1472[v1485];}
for(let v1486=0;v1486<v1483;v1486++){v1484[v1482+v1486]=v1481[v1486];}
const v1487=v1461.length;
const v1488=v1484.length;
const v1489=new Array(v1487+v1488);
for(let v1490=0;v1490<v1487;v1490++){v1489[v1490]=v1461[v1490];}
for(let v1491=0;v1491<v1488;v1491++){v1489[v1487+v1491]=v1484[v1491];}
const v1492=864;
const v1493=865;
const v1494=866;
const v1495=867;
const v1496=868;
const v1497=869;
const v1498=870;
const v1499=871;
const v1500=[v1492,v1493,v1494,v1495,v1496,v1497,v1498,v1499];
const v1501=872;
const v1502=873;
const v1503=874;
const v1504=875;
const v1505=876;
const v1506=877;
const v1507=878;
const v1508=879;
const v1509=[v1501,v1502,v1503,v1504,v1505,v1506,v1507,v1508];
const v1510=v1500.length;
const v1511=v1509.length;
const v1512=new Array(v1510+v1511);
for(let v1513=0;v1513<v1510;v1513++){v1512[v1513]=v1500[v1513];}
for(let v1514=0;v1514<v1511;v1514++){v1512[v1510+v1514]=v1509[v1514];}
const v1515=880;
const v1516=881;
const v1517=882;
const v1518=883;
const v1519=884;
const v1520=885;
const v1521=886;
const v1522=887;
const v1523=[v1515,v1516,v1517,v1518,v1519,v1520,v1521,v1522];
const v1524=888;
const v1525=889;
const v1526=890;
const v1527=891;
const v1528=892;
const v1529=893;
const v1530=894;
const v1531=895;
const v1532=[v1524,v1525,v1526,v1527,v1528,v1529,v1530,v1531];
const v1533=v1523.length;
const v1534=v1532.length;
const v1535=new Array(v1533+v1534);
for(let v1536=0;v1536<v1533;v1536++){v1535[v1536]=v1523[v1536];}
for(let v1537=0;v1537<v1534;v1537++){v1535[v1533+v1537]=v1532[v1537];}
const v1538=v1512.length;
const v1539=v1535.length;
const v1540=new Array(v1538+v1539);
for(let v1541=0;v1541<v1538;v1541++){v1540[v1541]=v1512[v1541];}
for(let v1542=0;v1542<v1539;v1542++){v1540[v1538+v1542]=v1535[v1542];}
const v1543=v1489.length;
const v1544=v1540.length;
const v1545=new Array(v1543+v1544);
for(let v1546=0;v1546<v1543;v1546++){v1545[v1546]=v1489[v1546];}
for(let v1547=0;v1547<v1544;v1547++){v1545[v1543+v1547]=v1540[v1547];}
const v1548=v1438.length;
const v1549=v1545.length;
const v1550=new Array(v1548+v1549);
for(let v1551=0;v1551<v1548;v1551++){v1550[v1551]=v1438[v1551];}
for(let v1552=0;v1552<v1549;v1552++){v1550[v1548+v1552]=v1545[v1552];}
const v1553=896;
const v1554=897;
const v1555=898;
const v1556=899;
const v1557=900;
const v1558=901;
const v1559=902;
const v1560=903;
const v1561=[v1553,v1554,v1555,v1556,v1557,v1558,v1559,v1560];
const v1562=904;
const v1563=905;
const v1564=906;
const v1565=907;
const v1566=908;
const v1567=909;
const v1568=910;
const v1569=911;
const v1570=[v1562,v1563,v1564,v1565,v1566,v1567,v1568,v1569];
const v1571=v1561.length;
const v1572=v1570.length;
const v1573=new Array(v1571+v1572);
for(let v1574=0;v1574<v1571;v1574++){v1573[v1574]=v1561[v1574];}
for(let v1575=0;v1575<v1572;v1575++){v1573[v1571+v1575]=v1570[v1575];}
const v1576=912;
const v1577=913;
const v1578=914;
const v1579=915;
const v1580=916;
const v1581=917;
const v1582=918;
const v1583=919;
const v1584=[v1576,v1577,v1578,v1579,v1580,v1581,v1582,v1583];
const v1585=920;
const v1586=921;
const v1587=922;
const v1588=923;
const v1589=924;
const v1590=925;
const v1591=926;
const v1592=927;
const v1593=[v1585,v1586,v1587,v1588,v1589,v1590,v1591,v1592];
const v1594=v1584.length;
const v1595=v1593.length;
const v1596=new Array(v1594+v1595);
for(let v1597=0;v1597<v1594;v1597++){v1596[v1597]=v1584[v1597];}
for(let v1598=0;v1598<v1595;v1598++){v1596[v1594+v1598]=v1593[v1598];}
const v1599=v1573.length;
const v1600=v1596.length;
const v1601=new Array(v1599+v1600);
for(let v1602=0;v1602<v1599;v1602++){v1601[v1602]=v1573[v1602];}
for(let v1603=0;v1603<v1600;v1603++){v1601[v1599+v1603]=v1596[v1603];}
const v1604=928;
const v1605=929;
const v1606=930;
const v1607=931;
const v1608=932;
const v1609=933;
const v1610=934;
const v1611=935;
const v1612=[v1604,v1605,v1606,v1607,v1608,v1609,v1610,v1611];
const v1613=936;
const v1614=937;
const v1615=938;
const v1616=939;
const v1617=940;
const v1618=941;
const v1619=942;
const v1620=943;
const v1621=[v1613,v1614,v1615,v1616,v1617,v1618,v1619,v1620];
const v1622=v1612.length;
const v1623=v1621.length;
const v1624=new Array(v1622+v1623);
for(let v1625=0;v1625<v1622;v1625++){v1624[v1625]=v1612[v1625];}
for(let v1626=0;v1626<v1623;v1626++){v1624[v1622+v1626]=v1621[v1626];}
const v1627=944;
const v1628=945;
const v1629=946;
const v1630=947;
const v1631=948;
const v1632=949;
const v1633=950;
const v1634=951;
const v1635=[v1627,v1628,v1629,v1630,v1631,v1632,v1633,v1634];
const v1636=952;
const v1637=953;
const v1638=954;
const v1639=955;
const v1640=956;
const v1641=957;
const v1642=958;
const v1643=959;
const v1644=[v1636,v1637,v1638,v1639,v1640,v1641,v1642,v1643];
const v1645=v1635.length;
const v1646=v1644.length;
const v1647=new Array(v1645+v1646);
for(let v1648=0;v1648<v1645;v1648++){v1647[v1648]=v1635[v1648];}
for(let v1649=0;v1649<v1646;v1649++){v1647[v1645+v1649]=v1644[v1649];}
const v1650=v1624.length;
const v1651=v1647.length;
const v1652=new Array(v1650+v1651);
for(let v1653=0;v1653<v1650;v1653++){v1652[v1653]=v1624[v1653];}
for(let v1654=0;v1654<v1651;v1654++){v1652[v1650+v1654]=v1647[v1654];}
const v1655=v1601.length;
const v1656=v1652.length;
const v1657=new Array(v1655+v1656);
for(let v1658=0;v1658<v1655;v1658++){v1657[v1658]=v1601[v1658];}
for(let v1659=0;v1659<v1656;v1659++){v1657[v1655+v1659]=v1652[v1659];}
const v1660=960;
const v1661=961;
const v1662=962;
const v1663=963;
const v1664=964;
const v1665=965;
const v1666=966;
const v1667=967;
const v1668=[v1660,v1661,v1662,v1663,v1664,v1665,v1666,v1667];
const v1669=968;
const v1670=969;
const v1671=970;
const v1672=971;
const v1673=972;
const v1674=973;
const v1675=974;
const v1676=975;
const v1677=[v1669,v1670,v1671,v1672,v1673,v1674,v1675,v1676];
const v1678=v1668.length;
const v1679=v1677.length;
const v1680=new Array(v1678+v1679);
for(let v1681=0;v1681<v1678;v1681++){v1680[v1681]=v1668[v1681];}
for(let v1682=0;v1682<v1679;v1682++){v1680[v1678+v1682]=v1677[v1682];}
const v1683=976;
const v1684=977;
const v1685=978;
const v1686=979;
const v1687=980;
const v1688=981;
const v1689=982;
const v1690=983;
const v1691=[v1683,v1684,v1685,v1686,v1687,v1688,v1689,v1690];
const v1692=984;
const v1693=985;
const v1694=986;
const v1695=987;
const v1696=988;
const v1697=989;
const v1698=990;
const v1699=991;
const v1700=[v1692,v1693,v1694,v1695,v1696,v1697,v1698,v1699];
const v1701=v1691.length;
const v1702=v1700.length;
const v1703=new Array(v1701+v1702);
for(let v1704=0;v1704<v1701;v1704++){v1703[v1704]=v1691[v1704];}
for(let v1705=0;v1705<v1702;v1705++){v1703[v1701+v1705]=v1700[v1705];}
const v1706=v1680.length;
const v1707=v1703.length;
const v1708=new Array(v1706+v1707);
for(let v1709=0;v1709<v1706;v1709++){v1708[v1709]=v1680[v1709];}
for(let v1710=0;v1710<v1707;v1710++){v1708[v1706+v1710]=v1703[v1710];}
const v1711=992;
const v1712=993;
const v1713=994;
const v1714=995;
const v1715=996;
const v1716=997;
const v1717=998;
const v1718=999;
const v1719=[v1711,v1712,v1713,v1714,v1715,v1716,v1717,v1718];
const v1720=1000;
const v1721=1001;
const v1722=1002;
const v1723=1003;
const v1724=1004;
const v1725=1005;
const v1726=1006;
const v1727=1007;
const v1728=[v1720,v1721,v1722,v1723,v1724,v1725,v1726,v1727];
const v1729=v1719.length;
const v1730=v1728.length;
const v1731=new Array(v1729+v1730);
for(let v1732=0;v1732<v1729;v1732++){v1731[v1732]=v1719[v1732];}
for(let v1733=0;v1733<v1730;v1733++){v1731[v1729+v1733]=v1728[v1733];}
const v1734=1008;
const v1735=1009;
const v1736=1010;
const v1737=1011;
const v1738=1012;
const v1739=1013;
const v1740=1014;
const v1741=1015;
const v1742=[v1734,v1735,v1736,v1737,v1738,v1739,v1740,v1741];
const v1743=1016;
const v1744=1017;
const v1745=1018;
const v1746=1019;
const v1747=1020;
const v1748=1021;
const v1749=1022;
const v1750=1023;
const v1751=[v1743,v1744,v1745,v1746,v1747,v1748,v1749,v1750];
const v1752=v1742.length;
const v1753=v1751.length;
const v1754=new Array(v1752+v1753);
for(let v1755=0;v1755<v1752;v1755++){v1754[v1755]=v1742[v1755];}
for(let v1756=0;v1756<v1753;v1756++){v1754[v1752+v1756]=v1751[v1756];}
const v1757=v1731.length;
const v1758=v1754.length;
const v1759=new Array(v1757+v1758);
for(let v1760=0;v1760<v1757;v1760++){v1759[v1760]=v1731[v1760];}
for(let v1761=0;v1761<v1758;v1761++){v1759[v1757+v1761]=v1754[v1761];}
const v1762=v1708.length;
const v1763=v1759.length;
const v1764=new Array(v1762+v1763);
for(let v1765=0;v1765<v1762;v1765++){v1764[v1765]=v1708[v1765];}
for(let v1766=0;v1766<v1763;v1766++){v1764[v1762+v1766]=v1759[v1766];}
const v1767=v1657.length;
const v1768=v1764.length;
const v1769=new Array(v1767+v1768);
for(let v1770=0;v1770<v1767;v1770++){v1769[v1770]=v1657[v1770];}
for(let v1771=0;v1771<v1768;v1771++){v1769[v1767+v1771]=v1764[v1771];}
const v1772=v1550.length;
const v1773=v1769.length;
const v1774=new Array(v1772+v1773);
for(let v1775=0;v1775<v1772;v1775++){v1774[v1775]=v1550[v1775];}
for(let v1776=0;v1776<v1773;v1776++){v1774[v1772+v1776]=v1769[v1776];}
const v1777=v1331.length;
const v1778=v1774.length;
const v1779=new Array(v1777+v1778);
for(let v1780=0;v1780<v1777;v1780++){v1779[v1780]=v1331[v1780];}
for(let v1781=0;v1781<v1778;v1781++){v1779[v1777+v1781]=v1774[v1781];}
const v1782=v888.length;
const v1783=v1779.length;
const v1784=new Array(v1782+v1783);
for(let v1785=0;v1785<v1782;v1785++){v1784[v1785]=v888[v1785];}
for(let v1786=0;v1786<v1783;v1786++){v1784[v1782+v1786]=v1779[v1786];}
return v1784;}
function __fn1(v1787,v1788,v1789,v1790,v1791,v1792,v1793,v1794,v1795,v1796,v1797,v1798,v1799,v1800,v1801,v1802,v1803,v1804,v1805,v1806,v1807,v1808,v1809,v1810,v1811,v1812,v1813,v1814,v1815,v1816,v1817,v1818,v1819){
const v1820=15584;
let v1821;if(((v1819) < (v1820))){
const v1822=7792;
let v1823;if(((v1819) < (v1822))){
const v1824=3896;
let v1825;if(((v1819) < (v1824))){
const v1826=1948;
let v1827;if(((v1819) < (v1826))){
const v1828=974;
let v1829;if(((v1819) < (v1828))){
const v1830=0;
const v1831=(((v1819) - (v1830)) >>> 0);
let v1832;if(v1831<v1787.length){v1832=v1787[v1831];}else{
v1832=[];}
v1829=v1832;}else{
const v1833=974;
const v1834=(((v1819) - (v1833)) >>> 0);
let v1835;if(v1834<v1788.length){v1835=v1788[v1834];}else{
v1835=[];}
v1829=v1835;}
v1827=v1829;}else{
const v1836=2922;
let v1837;if(((v1819) < (v1836))){
const v1838=1948;
const v1839=(((v1819) - (v1838)) >>> 0);
let v1840;if(v1839<v1789.length){v1840=v1789[v1839];}else{
v1840=[];}
v1837=v1840;}else{
const v1841=2922;
const v1842=(((v1819) - (v1841)) >>> 0);
let v1843;if(v1842<v1790.length){v1843=v1790[v1842];}else{
v1843=[];}
v1837=v1843;}
v1827=v1837;}
v1825=v1827;}else{
const v1844=5844;
let v1845;if(((v1819) < (v1844))){
const v1846=4870;
let v1847;if(((v1819) < (v1846))){
const v1848=3896;
const v1849=(((v1819) - (v1848)) >>> 0);
let v1850;if(v1849<v1791.length){v1850=v1791[v1849];}else{
v1850=[];}
v1847=v1850;}else{
const v1851=4870;
const v1852=(((v1819) - (v1851)) >>> 0);
let v1853;if(v1852<v1792.length){v1853=v1792[v1852];}else{
v1853=[];}
v1847=v1853;}
v1845=v1847;}else{
const v1854=6818;
let v1855;if(((v1819) < (v1854))){
const v1856=5844;
const v1857=(((v1819) - (v1856)) >>> 0);
let v1858;if(v1857<v1793.length){v1858=v1793[v1857];}else{
v1858=[];}
v1855=v1858;}else{
const v1859=6818;
const v1860=(((v1819) - (v1859)) >>> 0);
let v1861;if(v1860<v1794.length){v1861=v1794[v1860];}else{
v1861=[];}
v1855=v1861;}
v1845=v1855;}
v1825=v1845;}
v1823=v1825;}else{
const v1862=11688;
let v1863;if(((v1819) < (v1862))){
const v1864=9740;
let v1865;if(((v1819) < (v1864))){
const v1866=8766;
let v1867;if(((v1819) < (v1866))){
const v1868=7792;
const v1869=(((v1819) - (v1868)) >>> 0);
let v1870;if(v1869<v1795.length){v1870=v1795[v1869];}else{
v1870=[];}
v1867=v1870;}else{
const v1871=8766;
const v1872=(((v1819) - (v1871)) >>> 0);
let v1873;if(v1872<v1796.length){v1873=v1796[v1872];}else{
v1873=[];}
v1867=v1873;}
v1865=v1867;}else{
const v1874=10714;
let v1875;if(((v1819) < (v1874))){
const v1876=9740;
const v1877=(((v1819) - (v1876)) >>> 0);
let v1878;if(v1877<v1797.length){v1878=v1797[v1877];}else{
v1878=[];}
v1875=v1878;}else{
const v1879=10714;
const v1880=(((v1819) - (v1879)) >>> 0);
let v1881;if(v1880<v1798.length){v1881=v1798[v1880];}else{
v1881=[];}
v1875=v1881;}
v1865=v1875;}
v1863=v1865;}else{
const v1882=13636;
let v1883;if(((v1819) < (v1882))){
const v1884=12662;
let v1885;if(((v1819) < (v1884))){
const v1886=11688;
const v1887=(((v1819) - (v1886)) >>> 0);
let v1888;if(v1887<v1799.length){v1888=v1799[v1887];}else{
v1888=[];}
v1885=v1888;}else{
const v1889=12662;
const v1890=(((v1819) - (v1889)) >>> 0);
let v1891;if(v1890<v1800.length){v1891=v1800[v1890];}else{
v1891=[];}
v1885=v1891;}
v1883=v1885;}else{
const v1892=14610;
let v1893;if(((v1819) < (v1892))){
const v1894=13636;
const v1895=(((v1819) - (v1894)) >>> 0);
let v1896;if(v1895<v1801.length){v1896=v1801[v1895];}else{
v1896=[];}
v1893=v1896;}else{
const v1897=14610;
const v1898=(((v1819) - (v1897)) >>> 0);
let v1899;if(v1898<v1802.length){v1899=v1802[v1898];}else{
v1899=[];}
v1893=v1899;}
v1883=v1893;}
v1863=v1883;}
v1823=v1863;}
v1821=v1823;}else{
const v1900=23376;
let v1901;if(((v1819) < (v1900))){
const v1902=19480;
let v1903;if(((v1819) < (v1902))){
const v1904=17532;
let v1905;if(((v1819) < (v1904))){
const v1906=16558;
let v1907;if(((v1819) < (v1906))){
const v1908=15584;
const v1909=(((v1819) - (v1908)) >>> 0);
let v1910;if(v1909<v1803.length){v1910=v1803[v1909];}else{
v1910=[];}
v1907=v1910;}else{
const v1911=16558;
const v1912=(((v1819) - (v1911)) >>> 0);
let v1913;if(v1912<v1804.length){v1913=v1804[v1912];}else{
v1913=[];}
v1907=v1913;}
v1905=v1907;}else{
const v1914=18506;
let v1915;if(((v1819) < (v1914))){
const v1916=17532;
const v1917=(((v1819) - (v1916)) >>> 0);
let v1918;if(v1917<v1805.length){v1918=v1805[v1917];}else{
v1918=[];}
v1915=v1918;}else{
const v1919=18506;
const v1920=(((v1819) - (v1919)) >>> 0);
let v1921;if(v1920<v1806.length){v1921=v1806[v1920];}else{
v1921=[];}
v1915=v1921;}
v1905=v1915;}
v1903=v1905;}else{
const v1922=21428;
let v1923;if(((v1819) < (v1922))){
const v1924=20454;
let v1925;if(((v1819) < (v1924))){
const v1926=19480;
const v1927=(((v1819) - (v1926)) >>> 0);
let v1928;if(v1927<v1807.length){v1928=v1807[v1927];}else{
v1928=[];}
v1925=v1928;}else{
const v1929=20454;
const v1930=(((v1819) - (v1929)) >>> 0);
let v1931;if(v1930<v1808.length){v1931=v1808[v1930];}else{
v1931=[];}
v1925=v1931;}
v1923=v1925;}else{
const v1932=22402;
let v1933;if(((v1819) < (v1932))){
const v1934=21428;
const v1935=(((v1819) - (v1934)) >>> 0);
let v1936;if(v1935<v1809.length){v1936=v1809[v1935];}else{
v1936=[];}
v1933=v1936;}else{
const v1937=22402;
const v1938=(((v1819) - (v1937)) >>> 0);
let v1939;if(v1938<v1810.length){v1939=v1810[v1938];}else{
v1939=[];}
v1933=v1939;}
v1923=v1933;}
v1903=v1923;}
v1901=v1903;}else{
const v1940=27272;
let v1941;if(((v1819) < (v1940))){
const v1942=25324;
let v1943;if(((v1819) < (v1942))){
const v1944=24350;
let v1945;if(((v1819) < (v1944))){
const v1946=23376;
const v1947=(((v1819) - (v1946)) >>> 0);
let v1948;if(v1947<v1811.length){v1948=v1811[v1947];}else{
v1948=[];}
v1945=v1948;}else{
const v1949=24350;
const v1950=(((v1819) - (v1949)) >>> 0);
let v1951;if(v1950<v1812.length){v1951=v1812[v1950];}else{
v1951=[];}
v1945=v1951;}
v1943=v1945;}else{
const v1952=26298;
let v1953;if(((v1819) < (v1952))){
const v1954=25324;
const v1955=(((v1819) - (v1954)) >>> 0);
let v1956;if(v1955<v1813.length){v1956=v1813[v1955];}else{
v1956=[];}
v1953=v1956;}else{
const v1957=26298;
const v1958=(((v1819) - (v1957)) >>> 0);
let v1959;if(v1958<v1814.length){v1959=v1814[v1958];}else{
v1959=[];}
v1953=v1959;}
v1943=v1953;}
v1941=v1943;}else{
const v1960=29220;
let v1961;if(((v1819) < (v1960))){
const v1962=28246;
let v1963;if(((v1819) < (v1962))){
const v1964=27272;
const v1965=(((v1819) - (v1964)) >>> 0);
let v1966;if(v1965<v1815.length){v1966=v1815[v1965];}else{
v1966=[];}
v1963=v1966;}else{
const v1967=28246;
const v1968=(((v1819) - (v1967)) >>> 0);
let v1969;if(v1968<v1816.length){v1969=v1816[v1968];}else{
v1969=[];}
v1963=v1969;}
v1961=v1963;}else{
const v1970=30194;
let v1971;if(((v1819) < (v1970))){
const v1972=29220;
const v1973=(((v1819) - (v1972)) >>> 0);
let v1974;if(v1973<v1817.length){v1974=v1817[v1973];}else{
v1974=[];}
v1971=v1974;}else{
const v1975=30194;
const v1976=(((v1819) - (v1975)) >>> 0);
let v1977;if(v1976<v1818.length){v1977=v1818[v1976];}else{
v1977=[];}
v1971=v1977;}
v1961=v1971;}
v1941=v1961;}
v1901=v1941;}
v1821=v1901;}
return v1821;}
function __fn2(v1978,v1979){
let v1982=v1979.data,v1983=v1979.start;const v1984=v1979.length;for(let v1980=0;v1980<v1984;v1980++){
const v1985=v1982[v1983+v1980];
const v1986=__nfValue(v1985);
const v1987=(v1980>>>0);
let v1988;if(v1987<v1978.length){v1988=v1978[v1987];}else{
v1988=0.0;}
const v1989=__nfValue(v1988);
const v1990=Math.fround(__nfNumber(v1986) + __nfNumber(v1989));
if(typeof v1990!=='number'&&!Array.isArray(v1982)){v1979.detach();v1982=v1979.data;v1983=v1979.start;}v1982[v1983+v1980]=v1990;}
return v1979;}
function __fn3(v1991,v1992,v1993,v1994,v1995,v1996,v1997,v1998,v1999,v2000,v2001,v2002,v2003,v2004,v2005,v2006,v2007,v2008,v2009,v2010,v2011,v2012,v2013,v2014,v2015,v2016,v2017,v2018,v2019,v2020,v2021,v2022,v2023){
const v2024=v2023.length;
const v2025=new Array(v2024);
for(let v2026=0;v2026<v2024;v2026++){
const v2027=(v2023[v2026]>>>0);
v2025[v2026]=__fn1(v1991,v1992,v1993,v1994,v1995,v1996,v1997,v1998,v1999,v2000,v2001,v2002,v2003,v2004,v2005,v2006,v2007,v2008,v2009,v2010,v2011,v2012,v2013,v2014,v2015,v2016,v2017,v2018,v2019,v2020,v2021,v2022,v2027);
}
const v2028=Math.fround((v2023).length);
const v2029=__fn0();
const v2030=v2029.length;
const v2031=new Array(v2030);
for(let v2032=0;v2032<v2030;v2032++){
const v2033=(v2029[v2032]>>>0);
let v2034=0.0;
for(let v2035=0;v2035<v2025.length;v2035++){
const v2036=v2025[v2035];
const v2037=v2034;
let v2038;if(v2033<v2036.length){v2038=v2036[v2033];}else{
v2038=0.0;}
const v2039=__nfValue(v2038);
v2034=Math.fround(__nfNumber(v2037) + __nfNumber(v2039));
}
v2031[v2032]=Math.fround((__nfNumber(v2034))/(__nfNumber(v2028)));
}
return v2031;}
function __fn4(v2040,v2041,v2042,v2043,v2044,v2045,v2046,v2047,v2048,v2049,v2050,v2051,v2052,v2053,v2054,v2055,v2056,v2057,v2058,v2059,v2060,v2061,v2062,v2063,v2064,v2065,v2066,v2067,v2068,v2069,v2070,v2071,v2072){
let v2073=__bufferFillF32(1024,0.0);
for(let v2074=0;v2074<v2072.length;v2074++){
const v2075=(v2072[v2074]>>>0);
const v2076=__fn1(v2040,v2041,v2042,v2043,v2044,v2045,v2046,v2047,v2048,v2049,v2050,v2051,v2052,v2053,v2054,v2055,v2056,v2057,v2058,v2059,v2060,v2061,v2062,v2063,v2064,v2065,v2066,v2067,v2068,v2069,v2070,v2071,v2075);
const v2077=v2073;
let v2080=v2077.data,v2081=v2077.start;const v2082=v2077.length;for(let v2078=0;v2078<v2082;v2078++){
const v2083=v2080[v2081+v2078];
const v2084=__nfValue(v2083);
const v2085=(v2078>>>0);
let v2086;if(v2085<v2076.length){v2086=v2076[v2085];}else{
v2086=0.0;}
const v2087=__nfValue(v2086);
const v2088=Math.fround(__nfNumber(v2084) + __nfNumber(v2087));
if(typeof v2088!=='number'&&!Array.isArray(v2080)){v2077.detach();v2080=v2077.data;v2081=v2077.start;}v2080[v2081+v2078]=v2088;}
v2073=v2077;
}
const v2089=v2073;
const v2090=Math.fround((v2072).length);
const v2091=v2089.freeze();
const v2092=v2091.length;
const v2093=new Array(v2092);
for(let v2094=0;v2094<v2092;v2094++){
const v2095=v2091[v2094];
v2093[v2094]=Math.fround((__nfNumber(__nfValue(v2095)))/(__nfNumber(v2090)));
}
return v2093;}
function __fn5(v2096,v2097,v2098,v2099,v2100,v2101,v2102,v2103,v2104,v2105,v2106,v2107,v2108,v2109,v2110,v2111,v2112,v2113,v2114,v2115,v2116,v2117,v2118,v2119,v2120,v2121,v2122,v2123,v2124,v2125,v2126,v2127,v2128){
const v2129=(v2128).length;
const v2130=0;
let v2131;if((v2129===v2130)){
const v2132=__fn0();
const v2133=v2132.length;
const v2134=new Array(v2133);
for(let v2135=0;v2135<v2133;v2135++){
const v2136=(v2132[v2135]>>>0);
v2134[v2135]=0.0;
}
v2131=v2134;}else{
const v2137=(v2128).length;
const v2138=16;
let v2139;if(((v2137) <= (v2138))){
v2139=__fn3(v2096,v2097,v2098,v2099,v2100,v2101,v2102,v2103,v2104,v2105,v2106,v2107,v2108,v2109,v2110,v2111,v2112,v2113,v2114,v2115,v2116,v2117,v2118,v2119,v2120,v2121,v2122,v2123,v2124,v2125,v2126,v2127,v2128);}else{
v2139=__fn4(v2096,v2097,v2098,v2099,v2100,v2101,v2102,v2103,v2104,v2105,v2106,v2107,v2108,v2109,v2110,v2111,v2112,v2113,v2114,v2115,v2116,v2117,v2118,v2119,v2120,v2121,v2122,v2123,v2124,v2125,v2126,v2127,v2128);}
const v2140=v2139;
v2131=v2140;}
return v2131;}
function __into0(v2141){
const v2142=0;
const v2143=1;
const v2144=2;
const v2145=3;
const v2146=4;
const v2147=5;
const v2148=6;
const v2149=7;
const v2150=[v2142,v2143,v2144,v2145,v2146,v2147,v2148,v2149];
const v2151=8;
const v2152=9;
const v2153=10;
const v2154=11;
const v2155=12;
const v2156=13;
const v2157=14;
const v2158=15;
const v2159=[v2151,v2152,v2153,v2154,v2155,v2156,v2157,v2158];
const v2160=v2150.length;
const v2161=v2159.length;
const v2162=new Array(v2160+v2161);
for(let v2163=0;v2163<v2160;v2163++){v2162[v2163]=v2150[v2163];}
for(let v2164=0;v2164<v2161;v2164++){v2162[v2160+v2164]=v2159[v2164];}
const v2165=16;
const v2166=17;
const v2167=18;
const v2168=19;
const v2169=20;
const v2170=21;
const v2171=22;
const v2172=23;
const v2173=[v2165,v2166,v2167,v2168,v2169,v2170,v2171,v2172];
const v2174=24;
const v2175=25;
const v2176=26;
const v2177=27;
const v2178=28;
const v2179=29;
const v2180=30;
const v2181=31;
const v2182=[v2174,v2175,v2176,v2177,v2178,v2179,v2180,v2181];
const v2183=v2173.length;
const v2184=v2182.length;
const v2185=new Array(v2183+v2184);
for(let v2186=0;v2186<v2183;v2186++){v2185[v2186]=v2173[v2186];}
for(let v2187=0;v2187<v2184;v2187++){v2185[v2183+v2187]=v2182[v2187];}
const v2188=v2162.length;
const v2189=v2185.length;
const v2190=new Array(v2188+v2189);
for(let v2191=0;v2191<v2188;v2191++){v2190[v2191]=v2162[v2191];}
for(let v2192=0;v2192<v2189;v2192++){v2190[v2188+v2192]=v2185[v2192];}
const v2193=32;
const v2194=33;
const v2195=34;
const v2196=35;
const v2197=36;
const v2198=37;
const v2199=38;
const v2200=39;
const v2201=[v2193,v2194,v2195,v2196,v2197,v2198,v2199,v2200];
const v2202=40;
const v2203=41;
const v2204=42;
const v2205=43;
const v2206=44;
const v2207=45;
const v2208=46;
const v2209=47;
const v2210=[v2202,v2203,v2204,v2205,v2206,v2207,v2208,v2209];
const v2211=v2201.length;
const v2212=v2210.length;
const v2213=new Array(v2211+v2212);
for(let v2214=0;v2214<v2211;v2214++){v2213[v2214]=v2201[v2214];}
for(let v2215=0;v2215<v2212;v2215++){v2213[v2211+v2215]=v2210[v2215];}
const v2216=48;
const v2217=49;
const v2218=50;
const v2219=51;
const v2220=52;
const v2221=53;
const v2222=54;
const v2223=55;
const v2224=[v2216,v2217,v2218,v2219,v2220,v2221,v2222,v2223];
const v2225=56;
const v2226=57;
const v2227=58;
const v2228=59;
const v2229=60;
const v2230=61;
const v2231=62;
const v2232=63;
const v2233=[v2225,v2226,v2227,v2228,v2229,v2230,v2231,v2232];
const v2234=v2224.length;
const v2235=v2233.length;
const v2236=new Array(v2234+v2235);
for(let v2237=0;v2237<v2234;v2237++){v2236[v2237]=v2224[v2237];}
for(let v2238=0;v2238<v2235;v2238++){v2236[v2234+v2238]=v2233[v2238];}
const v2239=v2213.length;
const v2240=v2236.length;
const v2241=new Array(v2239+v2240);
for(let v2242=0;v2242<v2239;v2242++){v2241[v2242]=v2213[v2242];}
for(let v2243=0;v2243<v2240;v2243++){v2241[v2239+v2243]=v2236[v2243];}
const v2244=v2190.length;
const v2245=v2241.length;
const v2246=new Array(v2244+v2245);
for(let v2247=0;v2247<v2244;v2247++){v2246[v2247]=v2190[v2247];}
for(let v2248=0;v2248<v2245;v2248++){v2246[v2244+v2248]=v2241[v2248];}
const v2249=64;
const v2250=65;
const v2251=66;
const v2252=67;
const v2253=68;
const v2254=69;
const v2255=70;
const v2256=71;
const v2257=[v2249,v2250,v2251,v2252,v2253,v2254,v2255,v2256];
const v2258=72;
const v2259=73;
const v2260=74;
const v2261=75;
const v2262=76;
const v2263=77;
const v2264=78;
const v2265=79;
const v2266=[v2258,v2259,v2260,v2261,v2262,v2263,v2264,v2265];
const v2267=v2257.length;
const v2268=v2266.length;
const v2269=new Array(v2267+v2268);
for(let v2270=0;v2270<v2267;v2270++){v2269[v2270]=v2257[v2270];}
for(let v2271=0;v2271<v2268;v2271++){v2269[v2267+v2271]=v2266[v2271];}
const v2272=80;
const v2273=81;
const v2274=82;
const v2275=83;
const v2276=84;
const v2277=85;
const v2278=86;
const v2279=87;
const v2280=[v2272,v2273,v2274,v2275,v2276,v2277,v2278,v2279];
const v2281=88;
const v2282=89;
const v2283=90;
const v2284=91;
const v2285=92;
const v2286=93;
const v2287=94;
const v2288=95;
const v2289=[v2281,v2282,v2283,v2284,v2285,v2286,v2287,v2288];
const v2290=v2280.length;
const v2291=v2289.length;
const v2292=new Array(v2290+v2291);
for(let v2293=0;v2293<v2290;v2293++){v2292[v2293]=v2280[v2293];}
for(let v2294=0;v2294<v2291;v2294++){v2292[v2290+v2294]=v2289[v2294];}
const v2295=v2269.length;
const v2296=v2292.length;
const v2297=new Array(v2295+v2296);
for(let v2298=0;v2298<v2295;v2298++){v2297[v2298]=v2269[v2298];}
for(let v2299=0;v2299<v2296;v2299++){v2297[v2295+v2299]=v2292[v2299];}
const v2300=96;
const v2301=97;
const v2302=98;
const v2303=99;
const v2304=100;
const v2305=101;
const v2306=102;
const v2307=103;
const v2308=[v2300,v2301,v2302,v2303,v2304,v2305,v2306,v2307];
const v2309=104;
const v2310=105;
const v2311=106;
const v2312=107;
const v2313=108;
const v2314=109;
const v2315=110;
const v2316=111;
const v2317=[v2309,v2310,v2311,v2312,v2313,v2314,v2315,v2316];
const v2318=v2308.length;
const v2319=v2317.length;
const v2320=new Array(v2318+v2319);
for(let v2321=0;v2321<v2318;v2321++){v2320[v2321]=v2308[v2321];}
for(let v2322=0;v2322<v2319;v2322++){v2320[v2318+v2322]=v2317[v2322];}
const v2323=112;
const v2324=113;
const v2325=114;
const v2326=115;
const v2327=116;
const v2328=117;
const v2329=118;
const v2330=119;
const v2331=[v2323,v2324,v2325,v2326,v2327,v2328,v2329,v2330];
const v2332=120;
const v2333=121;
const v2334=122;
const v2335=123;
const v2336=124;
const v2337=125;
const v2338=126;
const v2339=127;
const v2340=[v2332,v2333,v2334,v2335,v2336,v2337,v2338,v2339];
const v2341=v2331.length;
const v2342=v2340.length;
const v2343=new Array(v2341+v2342);
for(let v2344=0;v2344<v2341;v2344++){v2343[v2344]=v2331[v2344];}
for(let v2345=0;v2345<v2342;v2345++){v2343[v2341+v2345]=v2340[v2345];}
const v2346=v2320.length;
const v2347=v2343.length;
const v2348=new Array(v2346+v2347);
for(let v2349=0;v2349<v2346;v2349++){v2348[v2349]=v2320[v2349];}
for(let v2350=0;v2350<v2347;v2350++){v2348[v2346+v2350]=v2343[v2350];}
const v2351=v2297.length;
const v2352=v2348.length;
const v2353=new Array(v2351+v2352);
for(let v2354=0;v2354<v2351;v2354++){v2353[v2354]=v2297[v2354];}
for(let v2355=0;v2355<v2352;v2355++){v2353[v2351+v2355]=v2348[v2355];}
const v2356=v2246.length;
const v2357=v2353.length;
const v2358=new Array(v2356+v2357);
for(let v2359=0;v2359<v2356;v2359++){v2358[v2359]=v2246[v2359];}
for(let v2360=0;v2360<v2357;v2360++){v2358[v2356+v2360]=v2353[v2360];}
const v2361=128;
const v2362=129;
const v2363=130;
const v2364=131;
const v2365=132;
const v2366=133;
const v2367=134;
const v2368=135;
const v2369=[v2361,v2362,v2363,v2364,v2365,v2366,v2367,v2368];
const v2370=136;
const v2371=137;
const v2372=138;
const v2373=139;
const v2374=140;
const v2375=141;
const v2376=142;
const v2377=143;
const v2378=[v2370,v2371,v2372,v2373,v2374,v2375,v2376,v2377];
const v2379=v2369.length;
const v2380=v2378.length;
const v2381=new Array(v2379+v2380);
for(let v2382=0;v2382<v2379;v2382++){v2381[v2382]=v2369[v2382];}
for(let v2383=0;v2383<v2380;v2383++){v2381[v2379+v2383]=v2378[v2383];}
const v2384=144;
const v2385=145;
const v2386=146;
const v2387=147;
const v2388=148;
const v2389=149;
const v2390=150;
const v2391=151;
const v2392=[v2384,v2385,v2386,v2387,v2388,v2389,v2390,v2391];
const v2393=152;
const v2394=153;
const v2395=154;
const v2396=155;
const v2397=156;
const v2398=157;
const v2399=158;
const v2400=159;
const v2401=[v2393,v2394,v2395,v2396,v2397,v2398,v2399,v2400];
const v2402=v2392.length;
const v2403=v2401.length;
const v2404=new Array(v2402+v2403);
for(let v2405=0;v2405<v2402;v2405++){v2404[v2405]=v2392[v2405];}
for(let v2406=0;v2406<v2403;v2406++){v2404[v2402+v2406]=v2401[v2406];}
const v2407=v2381.length;
const v2408=v2404.length;
const v2409=new Array(v2407+v2408);
for(let v2410=0;v2410<v2407;v2410++){v2409[v2410]=v2381[v2410];}
for(let v2411=0;v2411<v2408;v2411++){v2409[v2407+v2411]=v2404[v2411];}
const v2412=160;
const v2413=161;
const v2414=162;
const v2415=163;
const v2416=164;
const v2417=165;
const v2418=166;
const v2419=167;
const v2420=[v2412,v2413,v2414,v2415,v2416,v2417,v2418,v2419];
const v2421=168;
const v2422=169;
const v2423=170;
const v2424=171;
const v2425=172;
const v2426=173;
const v2427=174;
const v2428=175;
const v2429=[v2421,v2422,v2423,v2424,v2425,v2426,v2427,v2428];
const v2430=v2420.length;
const v2431=v2429.length;
const v2432=new Array(v2430+v2431);
for(let v2433=0;v2433<v2430;v2433++){v2432[v2433]=v2420[v2433];}
for(let v2434=0;v2434<v2431;v2434++){v2432[v2430+v2434]=v2429[v2434];}
const v2435=176;
const v2436=177;
const v2437=178;
const v2438=179;
const v2439=180;
const v2440=181;
const v2441=182;
const v2442=183;
const v2443=[v2435,v2436,v2437,v2438,v2439,v2440,v2441,v2442];
const v2444=184;
const v2445=185;
const v2446=186;
const v2447=187;
const v2448=188;
const v2449=189;
const v2450=190;
const v2451=191;
const v2452=[v2444,v2445,v2446,v2447,v2448,v2449,v2450,v2451];
const v2453=v2443.length;
const v2454=v2452.length;
const v2455=new Array(v2453+v2454);
for(let v2456=0;v2456<v2453;v2456++){v2455[v2456]=v2443[v2456];}
for(let v2457=0;v2457<v2454;v2457++){v2455[v2453+v2457]=v2452[v2457];}
const v2458=v2432.length;
const v2459=v2455.length;
const v2460=new Array(v2458+v2459);
for(let v2461=0;v2461<v2458;v2461++){v2460[v2461]=v2432[v2461];}
for(let v2462=0;v2462<v2459;v2462++){v2460[v2458+v2462]=v2455[v2462];}
const v2463=v2409.length;
const v2464=v2460.length;
const v2465=new Array(v2463+v2464);
for(let v2466=0;v2466<v2463;v2466++){v2465[v2466]=v2409[v2466];}
for(let v2467=0;v2467<v2464;v2467++){v2465[v2463+v2467]=v2460[v2467];}
const v2468=192;
const v2469=193;
const v2470=194;
const v2471=195;
const v2472=196;
const v2473=197;
const v2474=198;
const v2475=199;
const v2476=[v2468,v2469,v2470,v2471,v2472,v2473,v2474,v2475];
const v2477=200;
const v2478=201;
const v2479=202;
const v2480=203;
const v2481=204;
const v2482=205;
const v2483=206;
const v2484=207;
const v2485=[v2477,v2478,v2479,v2480,v2481,v2482,v2483,v2484];
const v2486=v2476.length;
const v2487=v2485.length;
const v2488=new Array(v2486+v2487);
for(let v2489=0;v2489<v2486;v2489++){v2488[v2489]=v2476[v2489];}
for(let v2490=0;v2490<v2487;v2490++){v2488[v2486+v2490]=v2485[v2490];}
const v2491=208;
const v2492=209;
const v2493=210;
const v2494=211;
const v2495=212;
const v2496=213;
const v2497=214;
const v2498=215;
const v2499=[v2491,v2492,v2493,v2494,v2495,v2496,v2497,v2498];
const v2500=216;
const v2501=217;
const v2502=218;
const v2503=219;
const v2504=220;
const v2505=221;
const v2506=222;
const v2507=223;
const v2508=[v2500,v2501,v2502,v2503,v2504,v2505,v2506,v2507];
const v2509=v2499.length;
const v2510=v2508.length;
const v2511=new Array(v2509+v2510);
for(let v2512=0;v2512<v2509;v2512++){v2511[v2512]=v2499[v2512];}
for(let v2513=0;v2513<v2510;v2513++){v2511[v2509+v2513]=v2508[v2513];}
const v2514=v2488.length;
const v2515=v2511.length;
const v2516=new Array(v2514+v2515);
for(let v2517=0;v2517<v2514;v2517++){v2516[v2517]=v2488[v2517];}
for(let v2518=0;v2518<v2515;v2518++){v2516[v2514+v2518]=v2511[v2518];}
const v2519=224;
const v2520=225;
const v2521=226;
const v2522=227;
const v2523=228;
const v2524=229;
const v2525=230;
const v2526=231;
const v2527=[v2519,v2520,v2521,v2522,v2523,v2524,v2525,v2526];
const v2528=232;
const v2529=233;
const v2530=234;
const v2531=235;
const v2532=236;
const v2533=237;
const v2534=238;
const v2535=239;
const v2536=[v2528,v2529,v2530,v2531,v2532,v2533,v2534,v2535];
const v2537=v2527.length;
const v2538=v2536.length;
const v2539=new Array(v2537+v2538);
for(let v2540=0;v2540<v2537;v2540++){v2539[v2540]=v2527[v2540];}
for(let v2541=0;v2541<v2538;v2541++){v2539[v2537+v2541]=v2536[v2541];}
const v2542=240;
const v2543=241;
const v2544=242;
const v2545=243;
const v2546=244;
const v2547=245;
const v2548=246;
const v2549=247;
const v2550=[v2542,v2543,v2544,v2545,v2546,v2547,v2548,v2549];
const v2551=248;
const v2552=249;
const v2553=250;
const v2554=251;
const v2555=252;
const v2556=253;
const v2557=254;
const v2558=255;
const v2559=[v2551,v2552,v2553,v2554,v2555,v2556,v2557,v2558];
const v2560=v2550.length;
const v2561=v2559.length;
const v2562=new Array(v2560+v2561);
for(let v2563=0;v2563<v2560;v2563++){v2562[v2563]=v2550[v2563];}
for(let v2564=0;v2564<v2561;v2564++){v2562[v2560+v2564]=v2559[v2564];}
const v2565=v2539.length;
const v2566=v2562.length;
const v2567=new Array(v2565+v2566);
for(let v2568=0;v2568<v2565;v2568++){v2567[v2568]=v2539[v2568];}
for(let v2569=0;v2569<v2566;v2569++){v2567[v2565+v2569]=v2562[v2569];}
const v2570=v2516.length;
const v2571=v2567.length;
const v2572=new Array(v2570+v2571);
for(let v2573=0;v2573<v2570;v2573++){v2572[v2573]=v2516[v2573];}
for(let v2574=0;v2574<v2571;v2574++){v2572[v2570+v2574]=v2567[v2574];}
const v2575=v2465.length;
const v2576=v2572.length;
const v2577=new Array(v2575+v2576);
for(let v2578=0;v2578<v2575;v2578++){v2577[v2578]=v2465[v2578];}
for(let v2579=0;v2579<v2576;v2579++){v2577[v2575+v2579]=v2572[v2579];}
const v2580=v2358.length;
const v2581=v2577.length;
const v2582=new Array(v2580+v2581);
for(let v2583=0;v2583<v2580;v2583++){v2582[v2583]=v2358[v2583];}
for(let v2584=0;v2584<v2581;v2584++){v2582[v2580+v2584]=v2577[v2584];}
const v2585=256;
const v2586=257;
const v2587=258;
const v2588=259;
const v2589=260;
const v2590=261;
const v2591=262;
const v2592=263;
const v2593=[v2585,v2586,v2587,v2588,v2589,v2590,v2591,v2592];
const v2594=264;
const v2595=265;
const v2596=266;
const v2597=267;
const v2598=268;
const v2599=269;
const v2600=270;
const v2601=271;
const v2602=[v2594,v2595,v2596,v2597,v2598,v2599,v2600,v2601];
const v2603=v2593.length;
const v2604=v2602.length;
const v2605=new Array(v2603+v2604);
for(let v2606=0;v2606<v2603;v2606++){v2605[v2606]=v2593[v2606];}
for(let v2607=0;v2607<v2604;v2607++){v2605[v2603+v2607]=v2602[v2607];}
const v2608=272;
const v2609=273;
const v2610=274;
const v2611=275;
const v2612=276;
const v2613=277;
const v2614=278;
const v2615=279;
const v2616=[v2608,v2609,v2610,v2611,v2612,v2613,v2614,v2615];
const v2617=280;
const v2618=281;
const v2619=282;
const v2620=283;
const v2621=284;
const v2622=285;
const v2623=286;
const v2624=287;
const v2625=[v2617,v2618,v2619,v2620,v2621,v2622,v2623,v2624];
const v2626=v2616.length;
const v2627=v2625.length;
const v2628=new Array(v2626+v2627);
for(let v2629=0;v2629<v2626;v2629++){v2628[v2629]=v2616[v2629];}
for(let v2630=0;v2630<v2627;v2630++){v2628[v2626+v2630]=v2625[v2630];}
const v2631=v2605.length;
const v2632=v2628.length;
const v2633=new Array(v2631+v2632);
for(let v2634=0;v2634<v2631;v2634++){v2633[v2634]=v2605[v2634];}
for(let v2635=0;v2635<v2632;v2635++){v2633[v2631+v2635]=v2628[v2635];}
const v2636=288;
const v2637=289;
const v2638=290;
const v2639=291;
const v2640=292;
const v2641=293;
const v2642=294;
const v2643=295;
const v2644=[v2636,v2637,v2638,v2639,v2640,v2641,v2642,v2643];
const v2645=296;
const v2646=297;
const v2647=298;
const v2648=299;
const v2649=300;
const v2650=301;
const v2651=302;
const v2652=303;
const v2653=[v2645,v2646,v2647,v2648,v2649,v2650,v2651,v2652];
const v2654=v2644.length;
const v2655=v2653.length;
const v2656=new Array(v2654+v2655);
for(let v2657=0;v2657<v2654;v2657++){v2656[v2657]=v2644[v2657];}
for(let v2658=0;v2658<v2655;v2658++){v2656[v2654+v2658]=v2653[v2658];}
const v2659=304;
const v2660=305;
const v2661=306;
const v2662=307;
const v2663=308;
const v2664=309;
const v2665=310;
const v2666=311;
const v2667=[v2659,v2660,v2661,v2662,v2663,v2664,v2665,v2666];
const v2668=312;
const v2669=313;
const v2670=314;
const v2671=315;
const v2672=316;
const v2673=317;
const v2674=318;
const v2675=319;
const v2676=[v2668,v2669,v2670,v2671,v2672,v2673,v2674,v2675];
const v2677=v2667.length;
const v2678=v2676.length;
const v2679=new Array(v2677+v2678);
for(let v2680=0;v2680<v2677;v2680++){v2679[v2680]=v2667[v2680];}
for(let v2681=0;v2681<v2678;v2681++){v2679[v2677+v2681]=v2676[v2681];}
const v2682=v2656.length;
const v2683=v2679.length;
const v2684=new Array(v2682+v2683);
for(let v2685=0;v2685<v2682;v2685++){v2684[v2685]=v2656[v2685];}
for(let v2686=0;v2686<v2683;v2686++){v2684[v2682+v2686]=v2679[v2686];}
const v2687=v2633.length;
const v2688=v2684.length;
const v2689=new Array(v2687+v2688);
for(let v2690=0;v2690<v2687;v2690++){v2689[v2690]=v2633[v2690];}
for(let v2691=0;v2691<v2688;v2691++){v2689[v2687+v2691]=v2684[v2691];}
const v2692=320;
const v2693=321;
const v2694=322;
const v2695=323;
const v2696=324;
const v2697=325;
const v2698=326;
const v2699=327;
const v2700=[v2692,v2693,v2694,v2695,v2696,v2697,v2698,v2699];
const v2701=328;
const v2702=329;
const v2703=330;
const v2704=331;
const v2705=332;
const v2706=333;
const v2707=334;
const v2708=335;
const v2709=[v2701,v2702,v2703,v2704,v2705,v2706,v2707,v2708];
const v2710=v2700.length;
const v2711=v2709.length;
const v2712=new Array(v2710+v2711);
for(let v2713=0;v2713<v2710;v2713++){v2712[v2713]=v2700[v2713];}
for(let v2714=0;v2714<v2711;v2714++){v2712[v2710+v2714]=v2709[v2714];}
const v2715=336;
const v2716=337;
const v2717=338;
const v2718=339;
const v2719=340;
const v2720=341;
const v2721=342;
const v2722=343;
const v2723=[v2715,v2716,v2717,v2718,v2719,v2720,v2721,v2722];
const v2724=344;
const v2725=345;
const v2726=346;
const v2727=347;
const v2728=348;
const v2729=349;
const v2730=350;
const v2731=351;
const v2732=[v2724,v2725,v2726,v2727,v2728,v2729,v2730,v2731];
const v2733=v2723.length;
const v2734=v2732.length;
const v2735=new Array(v2733+v2734);
for(let v2736=0;v2736<v2733;v2736++){v2735[v2736]=v2723[v2736];}
for(let v2737=0;v2737<v2734;v2737++){v2735[v2733+v2737]=v2732[v2737];}
const v2738=v2712.length;
const v2739=v2735.length;
const v2740=new Array(v2738+v2739);
for(let v2741=0;v2741<v2738;v2741++){v2740[v2741]=v2712[v2741];}
for(let v2742=0;v2742<v2739;v2742++){v2740[v2738+v2742]=v2735[v2742];}
const v2743=352;
const v2744=353;
const v2745=354;
const v2746=355;
const v2747=356;
const v2748=357;
const v2749=358;
const v2750=359;
const v2751=[v2743,v2744,v2745,v2746,v2747,v2748,v2749,v2750];
const v2752=360;
const v2753=361;
const v2754=362;
const v2755=363;
const v2756=364;
const v2757=365;
const v2758=366;
const v2759=367;
const v2760=[v2752,v2753,v2754,v2755,v2756,v2757,v2758,v2759];
const v2761=v2751.length;
const v2762=v2760.length;
const v2763=new Array(v2761+v2762);
for(let v2764=0;v2764<v2761;v2764++){v2763[v2764]=v2751[v2764];}
for(let v2765=0;v2765<v2762;v2765++){v2763[v2761+v2765]=v2760[v2765];}
const v2766=368;
const v2767=369;
const v2768=370;
const v2769=371;
const v2770=372;
const v2771=373;
const v2772=374;
const v2773=375;
const v2774=[v2766,v2767,v2768,v2769,v2770,v2771,v2772,v2773];
const v2775=376;
const v2776=377;
const v2777=378;
const v2778=379;
const v2779=380;
const v2780=381;
const v2781=382;
const v2782=383;
const v2783=[v2775,v2776,v2777,v2778,v2779,v2780,v2781,v2782];
const v2784=v2774.length;
const v2785=v2783.length;
const v2786=new Array(v2784+v2785);
for(let v2787=0;v2787<v2784;v2787++){v2786[v2787]=v2774[v2787];}
for(let v2788=0;v2788<v2785;v2788++){v2786[v2784+v2788]=v2783[v2788];}
const v2789=v2763.length;
const v2790=v2786.length;
const v2791=new Array(v2789+v2790);
for(let v2792=0;v2792<v2789;v2792++){v2791[v2792]=v2763[v2792];}
for(let v2793=0;v2793<v2790;v2793++){v2791[v2789+v2793]=v2786[v2793];}
const v2794=v2740.length;
const v2795=v2791.length;
const v2796=new Array(v2794+v2795);
for(let v2797=0;v2797<v2794;v2797++){v2796[v2797]=v2740[v2797];}
for(let v2798=0;v2798<v2795;v2798++){v2796[v2794+v2798]=v2791[v2798];}
const v2799=v2689.length;
const v2800=v2796.length;
const v2801=new Array(v2799+v2800);
for(let v2802=0;v2802<v2799;v2802++){v2801[v2802]=v2689[v2802];}
for(let v2803=0;v2803<v2800;v2803++){v2801[v2799+v2803]=v2796[v2803];}
const v2804=384;
const v2805=385;
const v2806=386;
const v2807=387;
const v2808=388;
const v2809=389;
const v2810=390;
const v2811=391;
const v2812=[v2804,v2805,v2806,v2807,v2808,v2809,v2810,v2811];
const v2813=392;
const v2814=393;
const v2815=394;
const v2816=395;
const v2817=396;
const v2818=397;
const v2819=398;
const v2820=399;
const v2821=[v2813,v2814,v2815,v2816,v2817,v2818,v2819,v2820];
const v2822=v2812.length;
const v2823=v2821.length;
const v2824=new Array(v2822+v2823);
for(let v2825=0;v2825<v2822;v2825++){v2824[v2825]=v2812[v2825];}
for(let v2826=0;v2826<v2823;v2826++){v2824[v2822+v2826]=v2821[v2826];}
const v2827=400;
const v2828=401;
const v2829=402;
const v2830=403;
const v2831=404;
const v2832=405;
const v2833=406;
const v2834=407;
const v2835=[v2827,v2828,v2829,v2830,v2831,v2832,v2833,v2834];
const v2836=408;
const v2837=409;
const v2838=410;
const v2839=411;
const v2840=412;
const v2841=413;
const v2842=414;
const v2843=415;
const v2844=[v2836,v2837,v2838,v2839,v2840,v2841,v2842,v2843];
const v2845=v2835.length;
const v2846=v2844.length;
const v2847=new Array(v2845+v2846);
for(let v2848=0;v2848<v2845;v2848++){v2847[v2848]=v2835[v2848];}
for(let v2849=0;v2849<v2846;v2849++){v2847[v2845+v2849]=v2844[v2849];}
const v2850=v2824.length;
const v2851=v2847.length;
const v2852=new Array(v2850+v2851);
for(let v2853=0;v2853<v2850;v2853++){v2852[v2853]=v2824[v2853];}
for(let v2854=0;v2854<v2851;v2854++){v2852[v2850+v2854]=v2847[v2854];}
const v2855=416;
const v2856=417;
const v2857=418;
const v2858=419;
const v2859=420;
const v2860=421;
const v2861=422;
const v2862=423;
const v2863=[v2855,v2856,v2857,v2858,v2859,v2860,v2861,v2862];
const v2864=424;
const v2865=425;
const v2866=426;
const v2867=427;
const v2868=428;
const v2869=429;
const v2870=430;
const v2871=431;
const v2872=[v2864,v2865,v2866,v2867,v2868,v2869,v2870,v2871];
const v2873=v2863.length;
const v2874=v2872.length;
const v2875=new Array(v2873+v2874);
for(let v2876=0;v2876<v2873;v2876++){v2875[v2876]=v2863[v2876];}
for(let v2877=0;v2877<v2874;v2877++){v2875[v2873+v2877]=v2872[v2877];}
const v2878=432;
const v2879=433;
const v2880=434;
const v2881=435;
const v2882=436;
const v2883=437;
const v2884=438;
const v2885=439;
const v2886=[v2878,v2879,v2880,v2881,v2882,v2883,v2884,v2885];
const v2887=440;
const v2888=441;
const v2889=442;
const v2890=443;
const v2891=444;
const v2892=445;
const v2893=446;
const v2894=447;
const v2895=[v2887,v2888,v2889,v2890,v2891,v2892,v2893,v2894];
const v2896=v2886.length;
const v2897=v2895.length;
const v2898=new Array(v2896+v2897);
for(let v2899=0;v2899<v2896;v2899++){v2898[v2899]=v2886[v2899];}
for(let v2900=0;v2900<v2897;v2900++){v2898[v2896+v2900]=v2895[v2900];}
const v2901=v2875.length;
const v2902=v2898.length;
const v2903=new Array(v2901+v2902);
for(let v2904=0;v2904<v2901;v2904++){v2903[v2904]=v2875[v2904];}
for(let v2905=0;v2905<v2902;v2905++){v2903[v2901+v2905]=v2898[v2905];}
const v2906=v2852.length;
const v2907=v2903.length;
const v2908=new Array(v2906+v2907);
for(let v2909=0;v2909<v2906;v2909++){v2908[v2909]=v2852[v2909];}
for(let v2910=0;v2910<v2907;v2910++){v2908[v2906+v2910]=v2903[v2910];}
const v2911=448;
const v2912=449;
const v2913=450;
const v2914=451;
const v2915=452;
const v2916=453;
const v2917=454;
const v2918=455;
const v2919=[v2911,v2912,v2913,v2914,v2915,v2916,v2917,v2918];
const v2920=456;
const v2921=457;
const v2922=458;
const v2923=459;
const v2924=460;
const v2925=461;
const v2926=462;
const v2927=463;
const v2928=[v2920,v2921,v2922,v2923,v2924,v2925,v2926,v2927];
const v2929=v2919.length;
const v2930=v2928.length;
const v2931=new Array(v2929+v2930);
for(let v2932=0;v2932<v2929;v2932++){v2931[v2932]=v2919[v2932];}
for(let v2933=0;v2933<v2930;v2933++){v2931[v2929+v2933]=v2928[v2933];}
const v2934=464;
const v2935=465;
const v2936=466;
const v2937=467;
const v2938=468;
const v2939=469;
const v2940=470;
const v2941=471;
const v2942=[v2934,v2935,v2936,v2937,v2938,v2939,v2940,v2941];
const v2943=472;
const v2944=473;
const v2945=474;
const v2946=475;
const v2947=476;
const v2948=477;
const v2949=478;
const v2950=479;
const v2951=[v2943,v2944,v2945,v2946,v2947,v2948,v2949,v2950];
const v2952=v2942.length;
const v2953=v2951.length;
const v2954=new Array(v2952+v2953);
for(let v2955=0;v2955<v2952;v2955++){v2954[v2955]=v2942[v2955];}
for(let v2956=0;v2956<v2953;v2956++){v2954[v2952+v2956]=v2951[v2956];}
const v2957=v2931.length;
const v2958=v2954.length;
const v2959=new Array(v2957+v2958);
for(let v2960=0;v2960<v2957;v2960++){v2959[v2960]=v2931[v2960];}
for(let v2961=0;v2961<v2958;v2961++){v2959[v2957+v2961]=v2954[v2961];}
const v2962=480;
const v2963=481;
const v2964=482;
const v2965=483;
const v2966=484;
const v2967=485;
const v2968=486;
const v2969=487;
const v2970=[v2962,v2963,v2964,v2965,v2966,v2967,v2968,v2969];
const v2971=488;
const v2972=489;
const v2973=490;
const v2974=491;
const v2975=492;
const v2976=493;
const v2977=494;
const v2978=495;
const v2979=[v2971,v2972,v2973,v2974,v2975,v2976,v2977,v2978];
const v2980=v2970.length;
const v2981=v2979.length;
const v2982=new Array(v2980+v2981);
for(let v2983=0;v2983<v2980;v2983++){v2982[v2983]=v2970[v2983];}
for(let v2984=0;v2984<v2981;v2984++){v2982[v2980+v2984]=v2979[v2984];}
const v2985=496;
const v2986=497;
const v2987=498;
const v2988=499;
const v2989=500;
const v2990=501;
const v2991=502;
const v2992=503;
const v2993=[v2985,v2986,v2987,v2988,v2989,v2990,v2991,v2992];
const v2994=504;
const v2995=505;
const v2996=506;
const v2997=507;
const v2998=508;
const v2999=509;
const v3000=510;
const v3001=511;
const v3002=[v2994,v2995,v2996,v2997,v2998,v2999,v3000,v3001];
const v3003=v2993.length;
const v3004=v3002.length;
const v3005=new Array(v3003+v3004);
for(let v3006=0;v3006<v3003;v3006++){v3005[v3006]=v2993[v3006];}
for(let v3007=0;v3007<v3004;v3007++){v3005[v3003+v3007]=v3002[v3007];}
const v3008=v2982.length;
const v3009=v3005.length;
const v3010=new Array(v3008+v3009);
for(let v3011=0;v3011<v3008;v3011++){v3010[v3011]=v2982[v3011];}
for(let v3012=0;v3012<v3009;v3012++){v3010[v3008+v3012]=v3005[v3012];}
const v3013=v2959.length;
const v3014=v3010.length;
const v3015=new Array(v3013+v3014);
for(let v3016=0;v3016<v3013;v3016++){v3015[v3016]=v2959[v3016];}
for(let v3017=0;v3017<v3014;v3017++){v3015[v3013+v3017]=v3010[v3017];}
const v3018=v2908.length;
const v3019=v3015.length;
const v3020=new Array(v3018+v3019);
for(let v3021=0;v3021<v3018;v3021++){v3020[v3021]=v2908[v3021];}
for(let v3022=0;v3022<v3019;v3022++){v3020[v3018+v3022]=v3015[v3022];}
const v3023=v2801.length;
const v3024=v3020.length;
const v3025=new Array(v3023+v3024);
for(let v3026=0;v3026<v3023;v3026++){v3025[v3026]=v2801[v3026];}
for(let v3027=0;v3027<v3024;v3027++){v3025[v3023+v3027]=v3020[v3027];}
const v3028=v2582.length;
const v3029=v3025.length;
const v3030=new Array(v3028+v3029);
for(let v3031=0;v3031<v3028;v3031++){v3030[v3031]=v2582[v3031];}
for(let v3032=0;v3032<v3029;v3032++){v3030[v3028+v3032]=v3025[v3032];}
const v3033=512;
const v3034=513;
const v3035=514;
const v3036=515;
const v3037=516;
const v3038=517;
const v3039=518;
const v3040=519;
const v3041=[v3033,v3034,v3035,v3036,v3037,v3038,v3039,v3040];
const v3042=520;
const v3043=521;
const v3044=522;
const v3045=523;
const v3046=524;
const v3047=525;
const v3048=526;
const v3049=527;
const v3050=[v3042,v3043,v3044,v3045,v3046,v3047,v3048,v3049];
const v3051=v3041.length;
const v3052=v3050.length;
const v3053=new Array(v3051+v3052);
for(let v3054=0;v3054<v3051;v3054++){v3053[v3054]=v3041[v3054];}
for(let v3055=0;v3055<v3052;v3055++){v3053[v3051+v3055]=v3050[v3055];}
const v3056=528;
const v3057=529;
const v3058=530;
const v3059=531;
const v3060=532;
const v3061=533;
const v3062=534;
const v3063=535;
const v3064=[v3056,v3057,v3058,v3059,v3060,v3061,v3062,v3063];
const v3065=536;
const v3066=537;
const v3067=538;
const v3068=539;
const v3069=540;
const v3070=541;
const v3071=542;
const v3072=543;
const v3073=[v3065,v3066,v3067,v3068,v3069,v3070,v3071,v3072];
const v3074=v3064.length;
const v3075=v3073.length;
const v3076=new Array(v3074+v3075);
for(let v3077=0;v3077<v3074;v3077++){v3076[v3077]=v3064[v3077];}
for(let v3078=0;v3078<v3075;v3078++){v3076[v3074+v3078]=v3073[v3078];}
const v3079=v3053.length;
const v3080=v3076.length;
const v3081=new Array(v3079+v3080);
for(let v3082=0;v3082<v3079;v3082++){v3081[v3082]=v3053[v3082];}
for(let v3083=0;v3083<v3080;v3083++){v3081[v3079+v3083]=v3076[v3083];}
const v3084=544;
const v3085=545;
const v3086=546;
const v3087=547;
const v3088=548;
const v3089=549;
const v3090=550;
const v3091=551;
const v3092=[v3084,v3085,v3086,v3087,v3088,v3089,v3090,v3091];
const v3093=552;
const v3094=553;
const v3095=554;
const v3096=555;
const v3097=556;
const v3098=557;
const v3099=558;
const v3100=559;
const v3101=[v3093,v3094,v3095,v3096,v3097,v3098,v3099,v3100];
const v3102=v3092.length;
const v3103=v3101.length;
const v3104=new Array(v3102+v3103);
for(let v3105=0;v3105<v3102;v3105++){v3104[v3105]=v3092[v3105];}
for(let v3106=0;v3106<v3103;v3106++){v3104[v3102+v3106]=v3101[v3106];}
const v3107=560;
const v3108=561;
const v3109=562;
const v3110=563;
const v3111=564;
const v3112=565;
const v3113=566;
const v3114=567;
const v3115=[v3107,v3108,v3109,v3110,v3111,v3112,v3113,v3114];
const v3116=568;
const v3117=569;
const v3118=570;
const v3119=571;
const v3120=572;
const v3121=573;
const v3122=574;
const v3123=575;
const v3124=[v3116,v3117,v3118,v3119,v3120,v3121,v3122,v3123];
const v3125=v3115.length;
const v3126=v3124.length;
const v3127=new Array(v3125+v3126);
for(let v3128=0;v3128<v3125;v3128++){v3127[v3128]=v3115[v3128];}
for(let v3129=0;v3129<v3126;v3129++){v3127[v3125+v3129]=v3124[v3129];}
const v3130=v3104.length;
const v3131=v3127.length;
const v3132=new Array(v3130+v3131);
for(let v3133=0;v3133<v3130;v3133++){v3132[v3133]=v3104[v3133];}
for(let v3134=0;v3134<v3131;v3134++){v3132[v3130+v3134]=v3127[v3134];}
const v3135=v3081.length;
const v3136=v3132.length;
const v3137=new Array(v3135+v3136);
for(let v3138=0;v3138<v3135;v3138++){v3137[v3138]=v3081[v3138];}
for(let v3139=0;v3139<v3136;v3139++){v3137[v3135+v3139]=v3132[v3139];}
const v3140=576;
const v3141=577;
const v3142=578;
const v3143=579;
const v3144=580;
const v3145=581;
const v3146=582;
const v3147=583;
const v3148=[v3140,v3141,v3142,v3143,v3144,v3145,v3146,v3147];
const v3149=584;
const v3150=585;
const v3151=586;
const v3152=587;
const v3153=588;
const v3154=589;
const v3155=590;
const v3156=591;
const v3157=[v3149,v3150,v3151,v3152,v3153,v3154,v3155,v3156];
const v3158=v3148.length;
const v3159=v3157.length;
const v3160=new Array(v3158+v3159);
for(let v3161=0;v3161<v3158;v3161++){v3160[v3161]=v3148[v3161];}
for(let v3162=0;v3162<v3159;v3162++){v3160[v3158+v3162]=v3157[v3162];}
const v3163=592;
const v3164=593;
const v3165=594;
const v3166=595;
const v3167=596;
const v3168=597;
const v3169=598;
const v3170=599;
const v3171=[v3163,v3164,v3165,v3166,v3167,v3168,v3169,v3170];
const v3172=600;
const v3173=601;
const v3174=602;
const v3175=603;
const v3176=604;
const v3177=605;
const v3178=606;
const v3179=607;
const v3180=[v3172,v3173,v3174,v3175,v3176,v3177,v3178,v3179];
const v3181=v3171.length;
const v3182=v3180.length;
const v3183=new Array(v3181+v3182);
for(let v3184=0;v3184<v3181;v3184++){v3183[v3184]=v3171[v3184];}
for(let v3185=0;v3185<v3182;v3185++){v3183[v3181+v3185]=v3180[v3185];}
const v3186=v3160.length;
const v3187=v3183.length;
const v3188=new Array(v3186+v3187);
for(let v3189=0;v3189<v3186;v3189++){v3188[v3189]=v3160[v3189];}
for(let v3190=0;v3190<v3187;v3190++){v3188[v3186+v3190]=v3183[v3190];}
const v3191=608;
const v3192=609;
const v3193=610;
const v3194=611;
const v3195=612;
const v3196=613;
const v3197=614;
const v3198=615;
const v3199=[v3191,v3192,v3193,v3194,v3195,v3196,v3197,v3198];
const v3200=616;
const v3201=617;
const v3202=618;
const v3203=619;
const v3204=620;
const v3205=621;
const v3206=622;
const v3207=623;
const v3208=[v3200,v3201,v3202,v3203,v3204,v3205,v3206,v3207];
const v3209=v3199.length;
const v3210=v3208.length;
const v3211=new Array(v3209+v3210);
for(let v3212=0;v3212<v3209;v3212++){v3211[v3212]=v3199[v3212];}
for(let v3213=0;v3213<v3210;v3213++){v3211[v3209+v3213]=v3208[v3213];}
const v3214=624;
const v3215=625;
const v3216=626;
const v3217=627;
const v3218=628;
const v3219=629;
const v3220=630;
const v3221=631;
const v3222=[v3214,v3215,v3216,v3217,v3218,v3219,v3220,v3221];
const v3223=632;
const v3224=633;
const v3225=634;
const v3226=635;
const v3227=636;
const v3228=637;
const v3229=638;
const v3230=639;
const v3231=[v3223,v3224,v3225,v3226,v3227,v3228,v3229,v3230];
const v3232=v3222.length;
const v3233=v3231.length;
const v3234=new Array(v3232+v3233);
for(let v3235=0;v3235<v3232;v3235++){v3234[v3235]=v3222[v3235];}
for(let v3236=0;v3236<v3233;v3236++){v3234[v3232+v3236]=v3231[v3236];}
const v3237=v3211.length;
const v3238=v3234.length;
const v3239=new Array(v3237+v3238);
for(let v3240=0;v3240<v3237;v3240++){v3239[v3240]=v3211[v3240];}
for(let v3241=0;v3241<v3238;v3241++){v3239[v3237+v3241]=v3234[v3241];}
const v3242=v3188.length;
const v3243=v3239.length;
const v3244=new Array(v3242+v3243);
for(let v3245=0;v3245<v3242;v3245++){v3244[v3245]=v3188[v3245];}
for(let v3246=0;v3246<v3243;v3246++){v3244[v3242+v3246]=v3239[v3246];}
const v3247=v3137.length;
const v3248=v3244.length;
const v3249=new Array(v3247+v3248);
for(let v3250=0;v3250<v3247;v3250++){v3249[v3250]=v3137[v3250];}
for(let v3251=0;v3251<v3248;v3251++){v3249[v3247+v3251]=v3244[v3251];}
const v3252=640;
const v3253=641;
const v3254=642;
const v3255=643;
const v3256=644;
const v3257=645;
const v3258=646;
const v3259=647;
const v3260=[v3252,v3253,v3254,v3255,v3256,v3257,v3258,v3259];
const v3261=648;
const v3262=649;
const v3263=650;
const v3264=651;
const v3265=652;
const v3266=653;
const v3267=654;
const v3268=655;
const v3269=[v3261,v3262,v3263,v3264,v3265,v3266,v3267,v3268];
const v3270=v3260.length;
const v3271=v3269.length;
const v3272=new Array(v3270+v3271);
for(let v3273=0;v3273<v3270;v3273++){v3272[v3273]=v3260[v3273];}
for(let v3274=0;v3274<v3271;v3274++){v3272[v3270+v3274]=v3269[v3274];}
const v3275=656;
const v3276=657;
const v3277=658;
const v3278=659;
const v3279=660;
const v3280=661;
const v3281=662;
const v3282=663;
const v3283=[v3275,v3276,v3277,v3278,v3279,v3280,v3281,v3282];
const v3284=664;
const v3285=665;
const v3286=666;
const v3287=667;
const v3288=668;
const v3289=669;
const v3290=670;
const v3291=671;
const v3292=[v3284,v3285,v3286,v3287,v3288,v3289,v3290,v3291];
const v3293=v3283.length;
const v3294=v3292.length;
const v3295=new Array(v3293+v3294);
for(let v3296=0;v3296<v3293;v3296++){v3295[v3296]=v3283[v3296];}
for(let v3297=0;v3297<v3294;v3297++){v3295[v3293+v3297]=v3292[v3297];}
const v3298=v3272.length;
const v3299=v3295.length;
const v3300=new Array(v3298+v3299);
for(let v3301=0;v3301<v3298;v3301++){v3300[v3301]=v3272[v3301];}
for(let v3302=0;v3302<v3299;v3302++){v3300[v3298+v3302]=v3295[v3302];}
const v3303=672;
const v3304=673;
const v3305=674;
const v3306=675;
const v3307=676;
const v3308=677;
const v3309=678;
const v3310=679;
const v3311=[v3303,v3304,v3305,v3306,v3307,v3308,v3309,v3310];
const v3312=680;
const v3313=681;
const v3314=682;
const v3315=683;
const v3316=684;
const v3317=685;
const v3318=686;
const v3319=687;
const v3320=[v3312,v3313,v3314,v3315,v3316,v3317,v3318,v3319];
const v3321=v3311.length;
const v3322=v3320.length;
const v3323=new Array(v3321+v3322);
for(let v3324=0;v3324<v3321;v3324++){v3323[v3324]=v3311[v3324];}
for(let v3325=0;v3325<v3322;v3325++){v3323[v3321+v3325]=v3320[v3325];}
const v3326=688;
const v3327=689;
const v3328=690;
const v3329=691;
const v3330=692;
const v3331=693;
const v3332=694;
const v3333=695;
const v3334=[v3326,v3327,v3328,v3329,v3330,v3331,v3332,v3333];
const v3335=696;
const v3336=697;
const v3337=698;
const v3338=699;
const v3339=700;
const v3340=701;
const v3341=702;
const v3342=703;
const v3343=[v3335,v3336,v3337,v3338,v3339,v3340,v3341,v3342];
const v3344=v3334.length;
const v3345=v3343.length;
const v3346=new Array(v3344+v3345);
for(let v3347=0;v3347<v3344;v3347++){v3346[v3347]=v3334[v3347];}
for(let v3348=0;v3348<v3345;v3348++){v3346[v3344+v3348]=v3343[v3348];}
const v3349=v3323.length;
const v3350=v3346.length;
const v3351=new Array(v3349+v3350);
for(let v3352=0;v3352<v3349;v3352++){v3351[v3352]=v3323[v3352];}
for(let v3353=0;v3353<v3350;v3353++){v3351[v3349+v3353]=v3346[v3353];}
const v3354=v3300.length;
const v3355=v3351.length;
const v3356=new Array(v3354+v3355);
for(let v3357=0;v3357<v3354;v3357++){v3356[v3357]=v3300[v3357];}
for(let v3358=0;v3358<v3355;v3358++){v3356[v3354+v3358]=v3351[v3358];}
const v3359=704;
const v3360=705;
const v3361=706;
const v3362=707;
const v3363=708;
const v3364=709;
const v3365=710;
const v3366=711;
const v3367=[v3359,v3360,v3361,v3362,v3363,v3364,v3365,v3366];
const v3368=712;
const v3369=713;
const v3370=714;
const v3371=715;
const v3372=716;
const v3373=717;
const v3374=718;
const v3375=719;
const v3376=[v3368,v3369,v3370,v3371,v3372,v3373,v3374,v3375];
const v3377=v3367.length;
const v3378=v3376.length;
const v3379=new Array(v3377+v3378);
for(let v3380=0;v3380<v3377;v3380++){v3379[v3380]=v3367[v3380];}
for(let v3381=0;v3381<v3378;v3381++){v3379[v3377+v3381]=v3376[v3381];}
const v3382=720;
const v3383=721;
const v3384=722;
const v3385=723;
const v3386=724;
const v3387=725;
const v3388=726;
const v3389=727;
const v3390=[v3382,v3383,v3384,v3385,v3386,v3387,v3388,v3389];
const v3391=728;
const v3392=729;
const v3393=730;
const v3394=731;
const v3395=732;
const v3396=733;
const v3397=734;
const v3398=735;
const v3399=[v3391,v3392,v3393,v3394,v3395,v3396,v3397,v3398];
const v3400=v3390.length;
const v3401=v3399.length;
const v3402=new Array(v3400+v3401);
for(let v3403=0;v3403<v3400;v3403++){v3402[v3403]=v3390[v3403];}
for(let v3404=0;v3404<v3401;v3404++){v3402[v3400+v3404]=v3399[v3404];}
const v3405=v3379.length;
const v3406=v3402.length;
const v3407=new Array(v3405+v3406);
for(let v3408=0;v3408<v3405;v3408++){v3407[v3408]=v3379[v3408];}
for(let v3409=0;v3409<v3406;v3409++){v3407[v3405+v3409]=v3402[v3409];}
const v3410=736;
const v3411=737;
const v3412=738;
const v3413=739;
const v3414=740;
const v3415=741;
const v3416=742;
const v3417=743;
const v3418=[v3410,v3411,v3412,v3413,v3414,v3415,v3416,v3417];
const v3419=744;
const v3420=745;
const v3421=746;
const v3422=747;
const v3423=748;
const v3424=749;
const v3425=750;
const v3426=751;
const v3427=[v3419,v3420,v3421,v3422,v3423,v3424,v3425,v3426];
const v3428=v3418.length;
const v3429=v3427.length;
const v3430=new Array(v3428+v3429);
for(let v3431=0;v3431<v3428;v3431++){v3430[v3431]=v3418[v3431];}
for(let v3432=0;v3432<v3429;v3432++){v3430[v3428+v3432]=v3427[v3432];}
const v3433=752;
const v3434=753;
const v3435=754;
const v3436=755;
const v3437=756;
const v3438=757;
const v3439=758;
const v3440=759;
const v3441=[v3433,v3434,v3435,v3436,v3437,v3438,v3439,v3440];
const v3442=760;
const v3443=761;
const v3444=762;
const v3445=763;
const v3446=764;
const v3447=765;
const v3448=766;
const v3449=767;
const v3450=[v3442,v3443,v3444,v3445,v3446,v3447,v3448,v3449];
const v3451=v3441.length;
const v3452=v3450.length;
const v3453=new Array(v3451+v3452);
for(let v3454=0;v3454<v3451;v3454++){v3453[v3454]=v3441[v3454];}
for(let v3455=0;v3455<v3452;v3455++){v3453[v3451+v3455]=v3450[v3455];}
const v3456=v3430.length;
const v3457=v3453.length;
const v3458=new Array(v3456+v3457);
for(let v3459=0;v3459<v3456;v3459++){v3458[v3459]=v3430[v3459];}
for(let v3460=0;v3460<v3457;v3460++){v3458[v3456+v3460]=v3453[v3460];}
const v3461=v3407.length;
const v3462=v3458.length;
const v3463=new Array(v3461+v3462);
for(let v3464=0;v3464<v3461;v3464++){v3463[v3464]=v3407[v3464];}
for(let v3465=0;v3465<v3462;v3465++){v3463[v3461+v3465]=v3458[v3465];}
const v3466=v3356.length;
const v3467=v3463.length;
const v3468=new Array(v3466+v3467);
for(let v3469=0;v3469<v3466;v3469++){v3468[v3469]=v3356[v3469];}
for(let v3470=0;v3470<v3467;v3470++){v3468[v3466+v3470]=v3463[v3470];}
const v3471=v3249.length;
const v3472=v3468.length;
const v3473=new Array(v3471+v3472);
for(let v3474=0;v3474<v3471;v3474++){v3473[v3474]=v3249[v3474];}
for(let v3475=0;v3475<v3472;v3475++){v3473[v3471+v3475]=v3468[v3475];}
const v3476=768;
const v3477=769;
const v3478=770;
const v3479=771;
const v3480=772;
const v3481=773;
const v3482=774;
const v3483=775;
const v3484=[v3476,v3477,v3478,v3479,v3480,v3481,v3482,v3483];
const v3485=776;
const v3486=777;
const v3487=778;
const v3488=779;
const v3489=780;
const v3490=781;
const v3491=782;
const v3492=783;
const v3493=[v3485,v3486,v3487,v3488,v3489,v3490,v3491,v3492];
const v3494=v3484.length;
const v3495=v3493.length;
const v3496=new Array(v3494+v3495);
for(let v3497=0;v3497<v3494;v3497++){v3496[v3497]=v3484[v3497];}
for(let v3498=0;v3498<v3495;v3498++){v3496[v3494+v3498]=v3493[v3498];}
const v3499=784;
const v3500=785;
const v3501=786;
const v3502=787;
const v3503=788;
const v3504=789;
const v3505=790;
const v3506=791;
const v3507=[v3499,v3500,v3501,v3502,v3503,v3504,v3505,v3506];
const v3508=792;
const v3509=793;
const v3510=794;
const v3511=795;
const v3512=796;
const v3513=797;
const v3514=798;
const v3515=799;
const v3516=[v3508,v3509,v3510,v3511,v3512,v3513,v3514,v3515];
const v3517=v3507.length;
const v3518=v3516.length;
const v3519=new Array(v3517+v3518);
for(let v3520=0;v3520<v3517;v3520++){v3519[v3520]=v3507[v3520];}
for(let v3521=0;v3521<v3518;v3521++){v3519[v3517+v3521]=v3516[v3521];}
const v3522=v3496.length;
const v3523=v3519.length;
const v3524=new Array(v3522+v3523);
for(let v3525=0;v3525<v3522;v3525++){v3524[v3525]=v3496[v3525];}
for(let v3526=0;v3526<v3523;v3526++){v3524[v3522+v3526]=v3519[v3526];}
const v3527=800;
const v3528=801;
const v3529=802;
const v3530=803;
const v3531=804;
const v3532=805;
const v3533=806;
const v3534=807;
const v3535=[v3527,v3528,v3529,v3530,v3531,v3532,v3533,v3534];
const v3536=808;
const v3537=809;
const v3538=810;
const v3539=811;
const v3540=812;
const v3541=813;
const v3542=814;
const v3543=815;
const v3544=[v3536,v3537,v3538,v3539,v3540,v3541,v3542,v3543];
const v3545=v3535.length;
const v3546=v3544.length;
const v3547=new Array(v3545+v3546);
for(let v3548=0;v3548<v3545;v3548++){v3547[v3548]=v3535[v3548];}
for(let v3549=0;v3549<v3546;v3549++){v3547[v3545+v3549]=v3544[v3549];}
const v3550=816;
const v3551=817;
const v3552=818;
const v3553=819;
const v3554=820;
const v3555=821;
const v3556=822;
const v3557=823;
const v3558=[v3550,v3551,v3552,v3553,v3554,v3555,v3556,v3557];
const v3559=824;
const v3560=825;
const v3561=826;
const v3562=827;
const v3563=828;
const v3564=829;
const v3565=830;
const v3566=831;
const v3567=[v3559,v3560,v3561,v3562,v3563,v3564,v3565,v3566];
const v3568=v3558.length;
const v3569=v3567.length;
const v3570=new Array(v3568+v3569);
for(let v3571=0;v3571<v3568;v3571++){v3570[v3571]=v3558[v3571];}
for(let v3572=0;v3572<v3569;v3572++){v3570[v3568+v3572]=v3567[v3572];}
const v3573=v3547.length;
const v3574=v3570.length;
const v3575=new Array(v3573+v3574);
for(let v3576=0;v3576<v3573;v3576++){v3575[v3576]=v3547[v3576];}
for(let v3577=0;v3577<v3574;v3577++){v3575[v3573+v3577]=v3570[v3577];}
const v3578=v3524.length;
const v3579=v3575.length;
const v3580=new Array(v3578+v3579);
for(let v3581=0;v3581<v3578;v3581++){v3580[v3581]=v3524[v3581];}
for(let v3582=0;v3582<v3579;v3582++){v3580[v3578+v3582]=v3575[v3582];}
const v3583=832;
const v3584=833;
const v3585=834;
const v3586=835;
const v3587=836;
const v3588=837;
const v3589=838;
const v3590=839;
const v3591=[v3583,v3584,v3585,v3586,v3587,v3588,v3589,v3590];
const v3592=840;
const v3593=841;
const v3594=842;
const v3595=843;
const v3596=844;
const v3597=845;
const v3598=846;
const v3599=847;
const v3600=[v3592,v3593,v3594,v3595,v3596,v3597,v3598,v3599];
const v3601=v3591.length;
const v3602=v3600.length;
const v3603=new Array(v3601+v3602);
for(let v3604=0;v3604<v3601;v3604++){v3603[v3604]=v3591[v3604];}
for(let v3605=0;v3605<v3602;v3605++){v3603[v3601+v3605]=v3600[v3605];}
const v3606=848;
const v3607=849;
const v3608=850;
const v3609=851;
const v3610=852;
const v3611=853;
const v3612=854;
const v3613=855;
const v3614=[v3606,v3607,v3608,v3609,v3610,v3611,v3612,v3613];
const v3615=856;
const v3616=857;
const v3617=858;
const v3618=859;
const v3619=860;
const v3620=861;
const v3621=862;
const v3622=863;
const v3623=[v3615,v3616,v3617,v3618,v3619,v3620,v3621,v3622];
const v3624=v3614.length;
const v3625=v3623.length;
const v3626=new Array(v3624+v3625);
for(let v3627=0;v3627<v3624;v3627++){v3626[v3627]=v3614[v3627];}
for(let v3628=0;v3628<v3625;v3628++){v3626[v3624+v3628]=v3623[v3628];}
const v3629=v3603.length;
const v3630=v3626.length;
const v3631=new Array(v3629+v3630);
for(let v3632=0;v3632<v3629;v3632++){v3631[v3632]=v3603[v3632];}
for(let v3633=0;v3633<v3630;v3633++){v3631[v3629+v3633]=v3626[v3633];}
const v3634=864;
const v3635=865;
const v3636=866;
const v3637=867;
const v3638=868;
const v3639=869;
const v3640=870;
const v3641=871;
const v3642=[v3634,v3635,v3636,v3637,v3638,v3639,v3640,v3641];
const v3643=872;
const v3644=873;
const v3645=874;
const v3646=875;
const v3647=876;
const v3648=877;
const v3649=878;
const v3650=879;
const v3651=[v3643,v3644,v3645,v3646,v3647,v3648,v3649,v3650];
const v3652=v3642.length;
const v3653=v3651.length;
const v3654=new Array(v3652+v3653);
for(let v3655=0;v3655<v3652;v3655++){v3654[v3655]=v3642[v3655];}
for(let v3656=0;v3656<v3653;v3656++){v3654[v3652+v3656]=v3651[v3656];}
const v3657=880;
const v3658=881;
const v3659=882;
const v3660=883;
const v3661=884;
const v3662=885;
const v3663=886;
const v3664=887;
const v3665=[v3657,v3658,v3659,v3660,v3661,v3662,v3663,v3664];
const v3666=888;
const v3667=889;
const v3668=890;
const v3669=891;
const v3670=892;
const v3671=893;
const v3672=894;
const v3673=895;
const v3674=[v3666,v3667,v3668,v3669,v3670,v3671,v3672,v3673];
const v3675=v3665.length;
const v3676=v3674.length;
const v3677=new Array(v3675+v3676);
for(let v3678=0;v3678<v3675;v3678++){v3677[v3678]=v3665[v3678];}
for(let v3679=0;v3679<v3676;v3679++){v3677[v3675+v3679]=v3674[v3679];}
const v3680=v3654.length;
const v3681=v3677.length;
const v3682=new Array(v3680+v3681);
for(let v3683=0;v3683<v3680;v3683++){v3682[v3683]=v3654[v3683];}
for(let v3684=0;v3684<v3681;v3684++){v3682[v3680+v3684]=v3677[v3684];}
const v3685=v3631.length;
const v3686=v3682.length;
const v3687=new Array(v3685+v3686);
for(let v3688=0;v3688<v3685;v3688++){v3687[v3688]=v3631[v3688];}
for(let v3689=0;v3689<v3686;v3689++){v3687[v3685+v3689]=v3682[v3689];}
const v3690=v3580.length;
const v3691=v3687.length;
const v3692=new Array(v3690+v3691);
for(let v3693=0;v3693<v3690;v3693++){v3692[v3693]=v3580[v3693];}
for(let v3694=0;v3694<v3691;v3694++){v3692[v3690+v3694]=v3687[v3694];}
const v3695=896;
const v3696=897;
const v3697=898;
const v3698=899;
const v3699=900;
const v3700=901;
const v3701=902;
const v3702=903;
const v3703=[v3695,v3696,v3697,v3698,v3699,v3700,v3701,v3702];
const v3704=904;
const v3705=905;
const v3706=906;
const v3707=907;
const v3708=908;
const v3709=909;
const v3710=910;
const v3711=911;
const v3712=[v3704,v3705,v3706,v3707,v3708,v3709,v3710,v3711];
const v3713=v3703.length;
const v3714=v3712.length;
const v3715=new Array(v3713+v3714);
for(let v3716=0;v3716<v3713;v3716++){v3715[v3716]=v3703[v3716];}
for(let v3717=0;v3717<v3714;v3717++){v3715[v3713+v3717]=v3712[v3717];}
const v3718=912;
const v3719=913;
const v3720=914;
const v3721=915;
const v3722=916;
const v3723=917;
const v3724=918;
const v3725=919;
const v3726=[v3718,v3719,v3720,v3721,v3722,v3723,v3724,v3725];
const v3727=920;
const v3728=921;
const v3729=922;
const v3730=923;
const v3731=924;
const v3732=925;
const v3733=926;
const v3734=927;
const v3735=[v3727,v3728,v3729,v3730,v3731,v3732,v3733,v3734];
const v3736=v3726.length;
const v3737=v3735.length;
const v3738=new Array(v3736+v3737);
for(let v3739=0;v3739<v3736;v3739++){v3738[v3739]=v3726[v3739];}
for(let v3740=0;v3740<v3737;v3740++){v3738[v3736+v3740]=v3735[v3740];}
const v3741=v3715.length;
const v3742=v3738.length;
const v3743=new Array(v3741+v3742);
for(let v3744=0;v3744<v3741;v3744++){v3743[v3744]=v3715[v3744];}
for(let v3745=0;v3745<v3742;v3745++){v3743[v3741+v3745]=v3738[v3745];}
const v3746=928;
const v3747=929;
const v3748=930;
const v3749=931;
const v3750=932;
const v3751=933;
const v3752=934;
const v3753=935;
const v3754=[v3746,v3747,v3748,v3749,v3750,v3751,v3752,v3753];
const v3755=936;
const v3756=937;
const v3757=938;
const v3758=939;
const v3759=940;
const v3760=941;
const v3761=942;
const v3762=943;
const v3763=[v3755,v3756,v3757,v3758,v3759,v3760,v3761,v3762];
const v3764=v3754.length;
const v3765=v3763.length;
const v3766=new Array(v3764+v3765);
for(let v3767=0;v3767<v3764;v3767++){v3766[v3767]=v3754[v3767];}
for(let v3768=0;v3768<v3765;v3768++){v3766[v3764+v3768]=v3763[v3768];}
const v3769=944;
const v3770=945;
const v3771=946;
const v3772=947;
const v3773=948;
const v3774=949;
const v3775=950;
const v3776=951;
const v3777=[v3769,v3770,v3771,v3772,v3773,v3774,v3775,v3776];
const v3778=952;
const v3779=953;
const v3780=954;
const v3781=955;
const v3782=956;
const v3783=957;
const v3784=958;
const v3785=959;
const v3786=[v3778,v3779,v3780,v3781,v3782,v3783,v3784,v3785];
const v3787=v3777.length;
const v3788=v3786.length;
const v3789=new Array(v3787+v3788);
for(let v3790=0;v3790<v3787;v3790++){v3789[v3790]=v3777[v3790];}
for(let v3791=0;v3791<v3788;v3791++){v3789[v3787+v3791]=v3786[v3791];}
const v3792=v3766.length;
const v3793=v3789.length;
const v3794=new Array(v3792+v3793);
for(let v3795=0;v3795<v3792;v3795++){v3794[v3795]=v3766[v3795];}
for(let v3796=0;v3796<v3793;v3796++){v3794[v3792+v3796]=v3789[v3796];}
const v3797=v3743.length;
const v3798=v3794.length;
const v3799=new Array(v3797+v3798);
for(let v3800=0;v3800<v3797;v3800++){v3799[v3800]=v3743[v3800];}
for(let v3801=0;v3801<v3798;v3801++){v3799[v3797+v3801]=v3794[v3801];}
const v3802=960;
const v3803=961;
const v3804=962;
const v3805=963;
const v3806=964;
const v3807=965;
const v3808=966;
const v3809=967;
const v3810=[v3802,v3803,v3804,v3805,v3806,v3807,v3808,v3809];
const v3811=968;
const v3812=969;
const v3813=970;
const v3814=971;
const v3815=972;
const v3816=973;
const v3817=974;
const v3818=975;
const v3819=[v3811,v3812,v3813,v3814,v3815,v3816,v3817,v3818];
const v3820=v3810.length;
const v3821=v3819.length;
const v3822=new Array(v3820+v3821);
for(let v3823=0;v3823<v3820;v3823++){v3822[v3823]=v3810[v3823];}
for(let v3824=0;v3824<v3821;v3824++){v3822[v3820+v3824]=v3819[v3824];}
const v3825=976;
const v3826=977;
const v3827=978;
const v3828=979;
const v3829=980;
const v3830=981;
const v3831=982;
const v3832=983;
const v3833=[v3825,v3826,v3827,v3828,v3829,v3830,v3831,v3832];
const v3834=984;
const v3835=985;
const v3836=986;
const v3837=987;
const v3838=988;
const v3839=989;
const v3840=990;
const v3841=991;
const v3842=[v3834,v3835,v3836,v3837,v3838,v3839,v3840,v3841];
const v3843=v3833.length;
const v3844=v3842.length;
const v3845=new Array(v3843+v3844);
for(let v3846=0;v3846<v3843;v3846++){v3845[v3846]=v3833[v3846];}
for(let v3847=0;v3847<v3844;v3847++){v3845[v3843+v3847]=v3842[v3847];}
const v3848=v3822.length;
const v3849=v3845.length;
const v3850=new Array(v3848+v3849);
for(let v3851=0;v3851<v3848;v3851++){v3850[v3851]=v3822[v3851];}
for(let v3852=0;v3852<v3849;v3852++){v3850[v3848+v3852]=v3845[v3852];}
const v3853=992;
const v3854=993;
const v3855=994;
const v3856=995;
const v3857=996;
const v3858=997;
const v3859=998;
const v3860=999;
const v3861=[v3853,v3854,v3855,v3856,v3857,v3858,v3859,v3860];
const v3862=1000;
const v3863=1001;
const v3864=1002;
const v3865=1003;
const v3866=1004;
const v3867=1005;
const v3868=1006;
const v3869=1007;
const v3870=[v3862,v3863,v3864,v3865,v3866,v3867,v3868,v3869];
const v3871=v3861.length;
const v3872=v3870.length;
const v3873=new Array(v3871+v3872);
for(let v3874=0;v3874<v3871;v3874++){v3873[v3874]=v3861[v3874];}
for(let v3875=0;v3875<v3872;v3875++){v3873[v3871+v3875]=v3870[v3875];}
const v3876=1008;
const v3877=1009;
const v3878=1010;
const v3879=1011;
const v3880=1012;
const v3881=1013;
const v3882=1014;
const v3883=1015;
const v3884=[v3876,v3877,v3878,v3879,v3880,v3881,v3882,v3883];
const v3885=1016;
const v3886=1017;
const v3887=1018;
const v3888=1019;
const v3889=1020;
const v3890=1021;
const v3891=1022;
const v3892=1023;
const v3893=[v3885,v3886,v3887,v3888,v3889,v3890,v3891,v3892];
const v3894=v3884.length;
const v3895=v3893.length;
const v3896=new Array(v3894+v3895);
for(let v3897=0;v3897<v3894;v3897++){v3896[v3897]=v3884[v3897];}
for(let v3898=0;v3898<v3895;v3898++){v3896[v3894+v3898]=v3893[v3898];}
const v3899=v3873.length;
const v3900=v3896.length;
const v3901=new Array(v3899+v3900);
for(let v3902=0;v3902<v3899;v3902++){v3901[v3902]=v3873[v3902];}
for(let v3903=0;v3903<v3900;v3903++){v3901[v3899+v3903]=v3896[v3903];}
const v3904=v3850.length;
const v3905=v3901.length;
const v3906=new Array(v3904+v3905);
for(let v3907=0;v3907<v3904;v3907++){v3906[v3907]=v3850[v3907];}
for(let v3908=0;v3908<v3905;v3908++){v3906[v3904+v3908]=v3901[v3908];}
const v3909=v3799.length;
const v3910=v3906.length;
const v3911=new Array(v3909+v3910);
for(let v3912=0;v3912<v3909;v3912++){v3911[v3912]=v3799[v3912];}
for(let v3913=0;v3913<v3910;v3913++){v3911[v3909+v3913]=v3906[v3913];}
const v3914=v3692.length;
const v3915=v3911.length;
const v3916=new Array(v3914+v3915);
for(let v3917=0;v3917<v3914;v3917++){v3916[v3917]=v3692[v3917];}
for(let v3918=0;v3918<v3915;v3918++){v3916[v3914+v3918]=v3911[v3918];}
const v3919=v3473.length;
const v3920=v3916.length;
const v3921=new Array(v3919+v3920);
for(let v3922=0;v3922<v3919;v3922++){v3921[v3922]=v3473[v3922];}
for(let v3923=0;v3923<v3920;v3923++){v3921[v3919+v3923]=v3916[v3923];}
const v3924=v3030.length;
const v3925=v3921.length;
for(let v3926=0;v3926<v3924;v3926++){
v2141[0+v3926]=v3030[v3926];
}
for(let v3927=0;v3927<v3925;v3927++){
v2141[v3924+v3927]=v3921[v3927];
}
const v3928=v3924+v3925;
return v3928;}
function __into1(v3929,v3930,v3931,v3932,v3933,v3934,v3935,v3936,v3937,v3938,v3939,v3940,v3941,v3942,v3943,v3944,v3945,v3946,v3947,v3948,v3949,v3950,v3951,v3952,v3953,v3954,v3955,v3956,v3957,v3958,v3959,v3960,v3961,v3962){
const v3963=15584;
let v3964;if(((v3961) < (v3963))){
const v3965=7792;
let v3966;if(((v3961) < (v3965))){
const v3967=3896;
let v3968;if(((v3961) < (v3967))){
const v3969=1948;
let v3970;if(((v3961) < (v3969))){
const v3971=974;
let v3972;if(((v3961) < (v3971))){
const v3973=0;
const v3974=(((v3961) - (v3973)) >>> 0);
let v3975;if(v3974<v3929.length){v3975=v3929[v3974];}else{
v3975=[];}
const v3976=v3975;
const v3977=v3976.length;
for(let v3978=0;v3978<v3977;v3978++){
v3962[v3978]=__intoOutput1(v3976[v3978]);
}
v3972=v3977;}else{
const v3979=974;
const v3980=(((v3961) - (v3979)) >>> 0);
let v3981;if(v3980<v3930.length){v3981=v3930[v3980];}else{
v3981=[];}
const v3982=v3981;
const v3983=v3982.length;
for(let v3984=0;v3984<v3983;v3984++){
v3962[v3984]=__intoOutput1(v3982[v3984]);
}
v3972=v3983;}
v3970=v3972;}else{
const v3985=2922;
let v3986;if(((v3961) < (v3985))){
const v3987=1948;
const v3988=(((v3961) - (v3987)) >>> 0);
let v3989;if(v3988<v3931.length){v3989=v3931[v3988];}else{
v3989=[];}
const v3990=v3989;
const v3991=v3990.length;
for(let v3992=0;v3992<v3991;v3992++){
v3962[v3992]=__intoOutput1(v3990[v3992]);
}
v3986=v3991;}else{
const v3993=2922;
const v3994=(((v3961) - (v3993)) >>> 0);
let v3995;if(v3994<v3932.length){v3995=v3932[v3994];}else{
v3995=[];}
const v3996=v3995;
const v3997=v3996.length;
for(let v3998=0;v3998<v3997;v3998++){
v3962[v3998]=__intoOutput1(v3996[v3998]);
}
v3986=v3997;}
v3970=v3986;}
v3968=v3970;}else{
const v3999=5844;
let v4000;if(((v3961) < (v3999))){
const v4001=4870;
let v4002;if(((v3961) < (v4001))){
const v4003=3896;
const v4004=(((v3961) - (v4003)) >>> 0);
let v4005;if(v4004<v3933.length){v4005=v3933[v4004];}else{
v4005=[];}
const v4006=v4005;
const v4007=v4006.length;
for(let v4008=0;v4008<v4007;v4008++){
v3962[v4008]=__intoOutput1(v4006[v4008]);
}
v4002=v4007;}else{
const v4009=4870;
const v4010=(((v3961) - (v4009)) >>> 0);
let v4011;if(v4010<v3934.length){v4011=v3934[v4010];}else{
v4011=[];}
const v4012=v4011;
const v4013=v4012.length;
for(let v4014=0;v4014<v4013;v4014++){
v3962[v4014]=__intoOutput1(v4012[v4014]);
}
v4002=v4013;}
v4000=v4002;}else{
const v4015=6818;
let v4016;if(((v3961) < (v4015))){
const v4017=5844;
const v4018=(((v3961) - (v4017)) >>> 0);
let v4019;if(v4018<v3935.length){v4019=v3935[v4018];}else{
v4019=[];}
const v4020=v4019;
const v4021=v4020.length;
for(let v4022=0;v4022<v4021;v4022++){
v3962[v4022]=__intoOutput1(v4020[v4022]);
}
v4016=v4021;}else{
const v4023=6818;
const v4024=(((v3961) - (v4023)) >>> 0);
let v4025;if(v4024<v3936.length){v4025=v3936[v4024];}else{
v4025=[];}
const v4026=v4025;
const v4027=v4026.length;
for(let v4028=0;v4028<v4027;v4028++){
v3962[v4028]=__intoOutput1(v4026[v4028]);
}
v4016=v4027;}
v4000=v4016;}
v3968=v4000;}
v3966=v3968;}else{
const v4029=11688;
let v4030;if(((v3961) < (v4029))){
const v4031=9740;
let v4032;if(((v3961) < (v4031))){
const v4033=8766;
let v4034;if(((v3961) < (v4033))){
const v4035=7792;
const v4036=(((v3961) - (v4035)) >>> 0);
let v4037;if(v4036<v3937.length){v4037=v3937[v4036];}else{
v4037=[];}
const v4038=v4037;
const v4039=v4038.length;
for(let v4040=0;v4040<v4039;v4040++){
v3962[v4040]=__intoOutput1(v4038[v4040]);
}
v4034=v4039;}else{
const v4041=8766;
const v4042=(((v3961) - (v4041)) >>> 0);
let v4043;if(v4042<v3938.length){v4043=v3938[v4042];}else{
v4043=[];}
const v4044=v4043;
const v4045=v4044.length;
for(let v4046=0;v4046<v4045;v4046++){
v3962[v4046]=__intoOutput1(v4044[v4046]);
}
v4034=v4045;}
v4032=v4034;}else{
const v4047=10714;
let v4048;if(((v3961) < (v4047))){
const v4049=9740;
const v4050=(((v3961) - (v4049)) >>> 0);
let v4051;if(v4050<v3939.length){v4051=v3939[v4050];}else{
v4051=[];}
const v4052=v4051;
const v4053=v4052.length;
for(let v4054=0;v4054<v4053;v4054++){
v3962[v4054]=__intoOutput1(v4052[v4054]);
}
v4048=v4053;}else{
const v4055=10714;
const v4056=(((v3961) - (v4055)) >>> 0);
let v4057;if(v4056<v3940.length){v4057=v3940[v4056];}else{
v4057=[];}
const v4058=v4057;
const v4059=v4058.length;
for(let v4060=0;v4060<v4059;v4060++){
v3962[v4060]=__intoOutput1(v4058[v4060]);
}
v4048=v4059;}
v4032=v4048;}
v4030=v4032;}else{
const v4061=13636;
let v4062;if(((v3961) < (v4061))){
const v4063=12662;
let v4064;if(((v3961) < (v4063))){
const v4065=11688;
const v4066=(((v3961) - (v4065)) >>> 0);
let v4067;if(v4066<v3941.length){v4067=v3941[v4066];}else{
v4067=[];}
const v4068=v4067;
const v4069=v4068.length;
for(let v4070=0;v4070<v4069;v4070++){
v3962[v4070]=__intoOutput1(v4068[v4070]);
}
v4064=v4069;}else{
const v4071=12662;
const v4072=(((v3961) - (v4071)) >>> 0);
let v4073;if(v4072<v3942.length){v4073=v3942[v4072];}else{
v4073=[];}
const v4074=v4073;
const v4075=v4074.length;
for(let v4076=0;v4076<v4075;v4076++){
v3962[v4076]=__intoOutput1(v4074[v4076]);
}
v4064=v4075;}
v4062=v4064;}else{
const v4077=14610;
let v4078;if(((v3961) < (v4077))){
const v4079=13636;
const v4080=(((v3961) - (v4079)) >>> 0);
let v4081;if(v4080<v3943.length){v4081=v3943[v4080];}else{
v4081=[];}
const v4082=v4081;
const v4083=v4082.length;
for(let v4084=0;v4084<v4083;v4084++){
v3962[v4084]=__intoOutput1(v4082[v4084]);
}
v4078=v4083;}else{
const v4085=14610;
const v4086=(((v3961) - (v4085)) >>> 0);
let v4087;if(v4086<v3944.length){v4087=v3944[v4086];}else{
v4087=[];}
const v4088=v4087;
const v4089=v4088.length;
for(let v4090=0;v4090<v4089;v4090++){
v3962[v4090]=__intoOutput1(v4088[v4090]);
}
v4078=v4089;}
v4062=v4078;}
v4030=v4062;}
v3966=v4030;}
v3964=v3966;}else{
const v4091=23376;
let v4092;if(((v3961) < (v4091))){
const v4093=19480;
let v4094;if(((v3961) < (v4093))){
const v4095=17532;
let v4096;if(((v3961) < (v4095))){
const v4097=16558;
let v4098;if(((v3961) < (v4097))){
const v4099=15584;
const v4100=(((v3961) - (v4099)) >>> 0);
let v4101;if(v4100<v3945.length){v4101=v3945[v4100];}else{
v4101=[];}
const v4102=v4101;
const v4103=v4102.length;
for(let v4104=0;v4104<v4103;v4104++){
v3962[v4104]=__intoOutput1(v4102[v4104]);
}
v4098=v4103;}else{
const v4105=16558;
const v4106=(((v3961) - (v4105)) >>> 0);
let v4107;if(v4106<v3946.length){v4107=v3946[v4106];}else{
v4107=[];}
const v4108=v4107;
const v4109=v4108.length;
for(let v4110=0;v4110<v4109;v4110++){
v3962[v4110]=__intoOutput1(v4108[v4110]);
}
v4098=v4109;}
v4096=v4098;}else{
const v4111=18506;
let v4112;if(((v3961) < (v4111))){
const v4113=17532;
const v4114=(((v3961) - (v4113)) >>> 0);
let v4115;if(v4114<v3947.length){v4115=v3947[v4114];}else{
v4115=[];}
const v4116=v4115;
const v4117=v4116.length;
for(let v4118=0;v4118<v4117;v4118++){
v3962[v4118]=__intoOutput1(v4116[v4118]);
}
v4112=v4117;}else{
const v4119=18506;
const v4120=(((v3961) - (v4119)) >>> 0);
let v4121;if(v4120<v3948.length){v4121=v3948[v4120];}else{
v4121=[];}
const v4122=v4121;
const v4123=v4122.length;
for(let v4124=0;v4124<v4123;v4124++){
v3962[v4124]=__intoOutput1(v4122[v4124]);
}
v4112=v4123;}
v4096=v4112;}
v4094=v4096;}else{
const v4125=21428;
let v4126;if(((v3961) < (v4125))){
const v4127=20454;
let v4128;if(((v3961) < (v4127))){
const v4129=19480;
const v4130=(((v3961) - (v4129)) >>> 0);
let v4131;if(v4130<v3949.length){v4131=v3949[v4130];}else{
v4131=[];}
const v4132=v4131;
const v4133=v4132.length;
for(let v4134=0;v4134<v4133;v4134++){
v3962[v4134]=__intoOutput1(v4132[v4134]);
}
v4128=v4133;}else{
const v4135=20454;
const v4136=(((v3961) - (v4135)) >>> 0);
let v4137;if(v4136<v3950.length){v4137=v3950[v4136];}else{
v4137=[];}
const v4138=v4137;
const v4139=v4138.length;
for(let v4140=0;v4140<v4139;v4140++){
v3962[v4140]=__intoOutput1(v4138[v4140]);
}
v4128=v4139;}
v4126=v4128;}else{
const v4141=22402;
let v4142;if(((v3961) < (v4141))){
const v4143=21428;
const v4144=(((v3961) - (v4143)) >>> 0);
let v4145;if(v4144<v3951.length){v4145=v3951[v4144];}else{
v4145=[];}
const v4146=v4145;
const v4147=v4146.length;
for(let v4148=0;v4148<v4147;v4148++){
v3962[v4148]=__intoOutput1(v4146[v4148]);
}
v4142=v4147;}else{
const v4149=22402;
const v4150=(((v3961) - (v4149)) >>> 0);
let v4151;if(v4150<v3952.length){v4151=v3952[v4150];}else{
v4151=[];}
const v4152=v4151;
const v4153=v4152.length;
for(let v4154=0;v4154<v4153;v4154++){
v3962[v4154]=__intoOutput1(v4152[v4154]);
}
v4142=v4153;}
v4126=v4142;}
v4094=v4126;}
v4092=v4094;}else{
const v4155=27272;
let v4156;if(((v3961) < (v4155))){
const v4157=25324;
let v4158;if(((v3961) < (v4157))){
const v4159=24350;
let v4160;if(((v3961) < (v4159))){
const v4161=23376;
const v4162=(((v3961) - (v4161)) >>> 0);
let v4163;if(v4162<v3953.length){v4163=v3953[v4162];}else{
v4163=[];}
const v4164=v4163;
const v4165=v4164.length;
for(let v4166=0;v4166<v4165;v4166++){
v3962[v4166]=__intoOutput1(v4164[v4166]);
}
v4160=v4165;}else{
const v4167=24350;
const v4168=(((v3961) - (v4167)) >>> 0);
let v4169;if(v4168<v3954.length){v4169=v3954[v4168];}else{
v4169=[];}
const v4170=v4169;
const v4171=v4170.length;
for(let v4172=0;v4172<v4171;v4172++){
v3962[v4172]=__intoOutput1(v4170[v4172]);
}
v4160=v4171;}
v4158=v4160;}else{
const v4173=26298;
let v4174;if(((v3961) < (v4173))){
const v4175=25324;
const v4176=(((v3961) - (v4175)) >>> 0);
let v4177;if(v4176<v3955.length){v4177=v3955[v4176];}else{
v4177=[];}
const v4178=v4177;
const v4179=v4178.length;
for(let v4180=0;v4180<v4179;v4180++){
v3962[v4180]=__intoOutput1(v4178[v4180]);
}
v4174=v4179;}else{
const v4181=26298;
const v4182=(((v3961) - (v4181)) >>> 0);
let v4183;if(v4182<v3956.length){v4183=v3956[v4182];}else{
v4183=[];}
const v4184=v4183;
const v4185=v4184.length;
for(let v4186=0;v4186<v4185;v4186++){
v3962[v4186]=__intoOutput1(v4184[v4186]);
}
v4174=v4185;}
v4158=v4174;}
v4156=v4158;}else{
const v4187=29220;
let v4188;if(((v3961) < (v4187))){
const v4189=28246;
let v4190;if(((v3961) < (v4189))){
const v4191=27272;
const v4192=(((v3961) - (v4191)) >>> 0);
let v4193;if(v4192<v3957.length){v4193=v3957[v4192];}else{
v4193=[];}
const v4194=v4193;
const v4195=v4194.length;
for(let v4196=0;v4196<v4195;v4196++){
v3962[v4196]=__intoOutput1(v4194[v4196]);
}
v4190=v4195;}else{
const v4197=28246;
const v4198=(((v3961) - (v4197)) >>> 0);
let v4199;if(v4198<v3958.length){v4199=v3958[v4198];}else{
v4199=[];}
const v4200=v4199;
const v4201=v4200.length;
for(let v4202=0;v4202<v4201;v4202++){
v3962[v4202]=__intoOutput1(v4200[v4202]);
}
v4190=v4201;}
v4188=v4190;}else{
const v4203=30194;
let v4204;if(((v3961) < (v4203))){
const v4205=29220;
const v4206=(((v3961) - (v4205)) >>> 0);
let v4207;if(v4206<v3959.length){v4207=v3959[v4206];}else{
v4207=[];}
const v4208=v4207;
const v4209=v4208.length;
for(let v4210=0;v4210<v4209;v4210++){
v3962[v4210]=__intoOutput1(v4208[v4210]);
}
v4204=v4209;}else{
const v4211=30194;
const v4212=(((v3961) - (v4211)) >>> 0);
let v4213;if(v4212<v3960.length){v4213=v3960[v4212];}else{
v4213=[];}
const v4214=v4213;
const v4215=v4214.length;
for(let v4216=0;v4216<v4215;v4216++){
v3962[v4216]=__intoOutput1(v4214[v4216]);
}
v4204=v4215;}
v4188=v4204;}
v4156=v4188;}
v4092=v4156;}
v3964=v4092;}
return v3964;}
function __into3(v4217,v4218,v4219,v4220,v4221,v4222,v4223,v4224,v4225,v4226,v4227,v4228,v4229,v4230,v4231,v4232,v4233,v4234,v4235,v4236,v4237,v4238,v4239,v4240,v4241,v4242,v4243,v4244,v4245,v4246,v4247,v4248,v4249,v4250){
const v4251=v4249.length;
const v4252=new Array(v4251);
for(let v4253=0;v4253<v4251;v4253++){
const v4254=(v4249[v4253]>>>0);
v4252[v4253]=__fn1(v4217,v4218,v4219,v4220,v4221,v4222,v4223,v4224,v4225,v4226,v4227,v4228,v4229,v4230,v4231,v4232,v4233,v4234,v4235,v4236,v4237,v4238,v4239,v4240,v4241,v4242,v4243,v4244,v4245,v4246,v4247,v4248,v4254);
}
const v4255=Math.fround((v4249).length);
const v4256=__fn0();
const v4257=v4256.length;
for(let v4259=0;v4259<v4257;v4259++){
const v4260=(v4256[v4259]>>>0);
let v4261=0.0;
for(let v4262=0;v4262<v4252.length;v4262++){
const v4263=v4252[v4262];
const v4264=v4261;
let v4265;if(v4260<v4263.length){v4265=v4263[v4260];}else{
v4265=0.0;}
const v4266=__nfValue(v4265);
v4261=Math.fround(__nfNumber(v4264) + __nfNumber(v4266));
}
v4250[v4259]=__intoOutput3(Math.fround((__nfNumber(v4261))/(__nfNumber(v4255))));
}
return v4257;}
function __into4(v4267,v4268,v4269,v4270,v4271,v4272,v4273,v4274,v4275,v4276,v4277,v4278,v4279,v4280,v4281,v4282,v4283,v4284,v4285,v4286,v4287,v4288,v4289,v4290,v4291,v4292,v4293,v4294,v4295,v4296,v4297,v4298,v4299,v4300){
let v4301=__bufferFillF32(1024,0.0);
for(let v4302=0;v4302<v4299.length;v4302++){
const v4303=(v4299[v4302]>>>0);
const v4304=__fn1(v4267,v4268,v4269,v4270,v4271,v4272,v4273,v4274,v4275,v4276,v4277,v4278,v4279,v4280,v4281,v4282,v4283,v4284,v4285,v4286,v4287,v4288,v4289,v4290,v4291,v4292,v4293,v4294,v4295,v4296,v4297,v4298,v4303);
const v4305=v4301;
let v4308=v4305.data,v4309=v4305.start;const v4310=v4305.length;for(let v4306=0;v4306<v4310;v4306++){
const v4311=v4308[v4309+v4306];
const v4312=__nfValue(v4311);
const v4313=(v4306>>>0);
let v4314;if(v4313<v4304.length){v4314=v4304[v4313];}else{
v4314=0.0;}
const v4315=__nfValue(v4314);
const v4316=Math.fround(__nfNumber(v4312) + __nfNumber(v4315));
if(typeof v4316!=='number'&&!Array.isArray(v4308)){v4305.detach();v4308=v4305.data;v4309=v4305.start;}v4308[v4309+v4306]=v4316;}
v4301=v4305;
}
const v4317=v4301;
const v4318=Math.fround((v4299).length);
const v4319=v4317.freeze();
const v4320=v4319.length;
for(let v4322=0;v4322<v4320;v4322++){
const v4323=v4319[v4322];
v4300[v4322]=__intoOutput4(Math.fround((__nfNumber(__nfValue(v4323)))/(__nfNumber(v4318))));
}
return v4320;}
function __into5(v4324,v4325,v4326,v4327,v4328,v4329,v4330,v4331,v4332,v4333,v4334,v4335,v4336,v4337,v4338,v4339,v4340,v4341,v4342,v4343,v4344,v4345,v4346,v4347,v4348,v4349,v4350,v4351,v4352,v4353,v4354,v4355,v4356,v4357){
const v4358=(v4356).length;
const v4359=0;
let v4360;if((v4358===v4359)){
const v4361=__fn0();
const v4362=v4361.length;
for(let v4364=0;v4364<v4362;v4364++){
const v4365=(v4361[v4364]>>>0);
v4357[v4364]=__intoOutput5(0.0);
}
v4360=v4362;}else{
const v4366=(v4356).length;
const v4367=16;
let v4368;if(((v4366) <= (v4367))){
const v4369=__into3(v4324,v4325,v4326,v4327,v4328,v4329,v4330,v4331,v4332,v4333,v4334,v4335,v4336,v4337,v4338,v4339,v4340,v4341,v4342,v4343,v4344,v4345,v4346,v4347,v4348,v4349,v4350,v4351,v4352,v4353,v4354,v4355,v4356,v4357);
v4368=v4369;}else{
const v4370=__into4(v4324,v4325,v4326,v4327,v4328,v4329,v4330,v4331,v4332,v4333,v4334,v4335,v4336,v4337,v4338,v4339,v4340,v4341,v4342,v4343,v4344,v4345,v4346,v4347,v4348,v4349,v4350,v4351,v4352,v4353,v4354,v4355,v4356,v4357);
v4368=v4370;}
v4360=v4368;}
return v4360;}
const __namedTypes={};
export const metadata = {"abi":"ink-javascript-trusted-values-v2","backend":"javascript","core_semantics":"ink-executable-core-v11","core_sha256":"80b54ac4e3b669b6b8ff1685bcd9b1bba5f685b841ff746571dcc71cc15e4b26","destination_abi":{"aliasing":"destination-disjoint-from-all-reachable-inputs","capacity":"trusted","count_unit":"elements","name":"ink-javascript-into-v1","ownership":"caller-owned","tail":"unwritten"},"f32_computation":"native-number-with-exact-nonfinite-tags","f32_storage":"native-number-with-exact-nonfinite-tags","functions":[{"destination":{"abi":"ink-javascript-into-v1","count_unit":"elements","ownership":"caller-owned"},"index":0,"internal":false,"name":"coordinates","parallel":false,"params":[],"precondition":null,"result":{"element":{"kind":"u32"},"kind":"list"}},{"destination":{"abi":"ink-javascript-into-v1","count_unit":"elements","ownership":"caller-owned"},"index":1,"internal":false,"name":"row","parallel":false,"params":[{"name":"rows_0","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_1","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_2","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_3","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_4","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_5","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_6","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_7","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_8","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_9","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_10","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_11","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_12","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_13","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_14","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_15","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_16","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_17","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_18","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_19","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_20","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_21","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_22","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_23","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_24","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_25","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_26","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_27","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_28","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_29","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_30","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_31","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"id","type":{"kind":"u32"}}],"precondition":null,"result":{"element":{"kind":"f32"},"kind":"list"}},{"destination":null,"index":2,"internal":true,"name":"add","parallel":false,"params":[{"name":"values","type":{"element":{"kind":"f32"},"kind":"list"}},{"name":"sums","type":{"kind":"temporary"}}],"precondition":null,"result":{"kind":"temporary"}},{"destination":{"abi":"ink-javascript-into-v1","count_unit":"elements","ownership":"caller-owned"},"index":3,"internal":false,"name":"short_mean","parallel":false,"params":[{"name":"rows_0","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_1","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_2","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_3","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_4","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_5","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_6","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_7","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_8","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_9","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_10","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_11","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_12","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_13","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_14","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_15","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_16","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_17","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_18","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_19","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_20","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_21","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_22","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_23","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_24","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_25","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_26","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_27","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_28","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_29","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_30","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_31","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"ids","type":{"element":{"kind":"u32"},"kind":"list"}}],"precondition":null,"result":{"element":{"kind":"f32"},"kind":"list"}},{"destination":{"abi":"ink-javascript-into-v1","count_unit":"elements","ownership":"caller-owned"},"index":4,"internal":false,"name":"long_mean","parallel":false,"params":[{"name":"rows_0","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_1","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_2","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_3","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_4","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_5","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_6","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_7","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_8","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_9","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_10","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_11","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_12","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_13","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_14","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_15","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_16","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_17","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_18","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_19","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_20","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_21","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_22","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_23","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_24","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_25","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_26","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_27","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_28","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_29","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_30","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_31","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"ids","type":{"element":{"kind":"u32"},"kind":"list"}}],"precondition":null,"result":{"element":{"kind":"f32"},"kind":"list"}},{"destination":{"abi":"ink-javascript-into-v1","count_unit":"elements","ownership":"caller-owned"},"index":5,"internal":false,"name":"encode","parallel":false,"params":[{"name":"rows_0","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_1","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_2","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_3","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_4","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_5","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_6","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_7","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_8","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_9","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_10","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_11","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_12","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_13","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_14","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_15","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_16","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_17","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_18","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_19","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_20","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_21","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_22","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_23","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_24","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_25","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_26","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_27","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_28","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_29","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_30","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_31","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"ids","type":{"element":{"kind":"u32"},"kind":"list"}}],"precondition":null,"result":{"element":{"kind":"f32"},"kind":"list"}}],"named_types":{},"prepared_compiled":{"destination":{"call":"callPreparedCompiledInto","capacity":"trusted","failure":"destination may be partially written","float_values":"trusted public representation","inputs":"sealed compiled values","ownership":"caller-owned","structured_elements":"detached","tail":"unwritten"},"evaluation":"lazy source-order; successful bindings only","functions":[{"factory":false,"function":"coordinates","reason":"no reusable captured work"},{"factory":false,"function":"row","reason":"no reusable captured work"},{"factory":false,"function":"add","reason":"prepared residual requires a bounded pure value entry"},{"delegated_calls":0,"factory":true,"function":"short_mean","retained_bindings":1},{"factory":false,"function":"long_mean","reason":"no reusable lexical bindings"},{"delegated_calls":2,"factory":true,"function":"encode","retained_bindings":1}],"lifetime":"prepared token","semantics":"sealed-value-residual-v1"},"private_record_elisions":[],"private_sum_spines":[],"schema":1,"state":null,"wire":{"format":"ink-value-wire-v1","functions":{"add":{"unsupported":"unsupported wire descriptor"},"coordinates":{"arguments":{"format":"ink-value-wire-v1","identity":"3720cf83cb9a672c0c70e7f80cfe0abe0bf9b7df73d40a9def0c7436234026b2","named":{},"root":{"fields":[],"kind":"record","name":"arguments"}},"result":{"format":"ink-value-wire-v1","identity":"69ebf947aa59a2546656d1976b0baa6e56e7182d989425379b31e3bff74168ca","named":{},"root":{"element":{"kind":"u32"},"kind":"list"}}},"encode":{"arguments":{"format":"ink-value-wire-v1","identity":"baeaebfaf694181bf21d44f3c83a967ce01b09e05e19587bc82be91ad3a20ec0","named":{},"root":{"fields":[{"name":"rows_0","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_1","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_2","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_3","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_4","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_5","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_6","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_7","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_8","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_9","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_10","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_11","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_12","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_13","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_14","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_15","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_16","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_17","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_18","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_19","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_20","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_21","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_22","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_23","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_24","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_25","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_26","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_27","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_28","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_29","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_30","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_31","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"ids","type":{"element":{"kind":"u32"},"kind":"list"}}],"kind":"record","name":"arguments"}},"result":{"format":"ink-value-wire-v1","identity":"0cbb9d1ff6b72318080ea11a6297b384d97178624f821e3901cca51ec8ad4477","named":{},"root":{"element":{"kind":"f32"},"kind":"list"}}},"long_mean":{"arguments":{"format":"ink-value-wire-v1","identity":"baeaebfaf694181bf21d44f3c83a967ce01b09e05e19587bc82be91ad3a20ec0","named":{},"root":{"fields":[{"name":"rows_0","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_1","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_2","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_3","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_4","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_5","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_6","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_7","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_8","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_9","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_10","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_11","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_12","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_13","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_14","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_15","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_16","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_17","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_18","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_19","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_20","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_21","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_22","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_23","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_24","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_25","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_26","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_27","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_28","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_29","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_30","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_31","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"ids","type":{"element":{"kind":"u32"},"kind":"list"}}],"kind":"record","name":"arguments"}},"result":{"format":"ink-value-wire-v1","identity":"0cbb9d1ff6b72318080ea11a6297b384d97178624f821e3901cca51ec8ad4477","named":{},"root":{"element":{"kind":"f32"},"kind":"list"}}},"row":{"arguments":{"format":"ink-value-wire-v1","identity":"f28e13bdfbaf75f5cf9ef80af0daf0b9f7f96a9393d0b099ca1a4df64e64a1b5","named":{},"root":{"fields":[{"name":"rows_0","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_1","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_2","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_3","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_4","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_5","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_6","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_7","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_8","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_9","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_10","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_11","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_12","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_13","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_14","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_15","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_16","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_17","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_18","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_19","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_20","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_21","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_22","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_23","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_24","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_25","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_26","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_27","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_28","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_29","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_30","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_31","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"id","type":{"kind":"u32"}}],"kind":"record","name":"arguments"}},"result":{"format":"ink-value-wire-v1","identity":"0cbb9d1ff6b72318080ea11a6297b384d97178624f821e3901cca51ec8ad4477","named":{},"root":{"element":{"kind":"f32"},"kind":"list"}}},"short_mean":{"arguments":{"format":"ink-value-wire-v1","identity":"baeaebfaf694181bf21d44f3c83a967ce01b09e05e19587bc82be91ad3a20ec0","named":{},"root":{"fields":[{"name":"rows_0","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_1","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_2","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_3","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_4","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_5","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_6","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_7","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_8","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_9","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_10","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_11","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_12","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_13","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_14","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_15","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_16","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_17","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_18","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_19","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_20","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_21","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_22","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_23","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_24","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_25","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_26","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_27","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_28","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_29","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_30","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"rows_31","type":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},{"name":"ids","type":{"element":{"kind":"u32"},"kind":"list"}}],"kind":"record","name":"arguments"}},"result":{"format":"ink-value-wire-v1","identity":"0cbb9d1ff6b72318080ea11a6297b384d97178624f821e3901cca51ec8ad4477","named":{},"root":{"element":{"kind":"f32"},"kind":"list"}}}}}};
const __implementations=[__fn0,__fn1,__fn2,__fn3,__fn4,__fn5];

function __freeze(v) { if(v && typeof v==='object') {Object.values(v).forEach(__freeze);Object.freeze(v);} return v; }
__freeze(metadata);
const __inputTypes=[{"capture":[],"types":[]},{"capture":[true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true],"types":[{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"},{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"},{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"},{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"},{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"},{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"},{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"},{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"},{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"},{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"},{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"},{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"},{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"},{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"},{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"},{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"},{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"},{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"},{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"},{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"},{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"},{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"},{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"},{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"},{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"},{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"},{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"},{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"},{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"},{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"},{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"},{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"},{"kind":"u32"}]},{"capture":[true,true],"types":[{"element":{"kind":"f32"},"kind":"list"},{"kind":"temporary"}]},{"capture":[true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true],"types":[{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"},{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"},{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"},{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"},{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"},{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"},{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"},{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"},{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"},{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"},{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"},{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"},{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"},{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"},{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"},{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"},{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"},{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"},{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"},{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"},{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"},{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"},{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"},{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"},{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"},{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"},{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"},{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"},{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"},{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"},{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"},{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"},{"element":{"kind":"u32"},"kind":"list"}]},{"capture":[true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true],"types":[{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"},{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"},{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"},{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"},{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"},{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"},{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"},{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"},{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"},{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"},{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"},{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"},{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"},{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"},{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"},{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"},{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"},{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"},{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"},{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"},{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"},{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"},{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"},{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"},{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"},{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"},{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"},{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"},{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"},{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"},{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"},{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"},{"element":{"kind":"u32"},"kind":"list"}]},{"capture":[true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true],"types":[{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"},{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"},{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"},{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"},{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"},{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"},{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"},{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"},{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"},{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"},{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"},{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"},{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"},{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"},{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"},{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"},{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"},{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"},{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"},{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"},{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"},{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"},{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"},{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"},{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"},{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"},{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"},{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"},{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"},{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"},{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"},{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"},{"element":{"kind":"u32"},"kind":"list"}]}];
export const functions=Object.freeze({...Object.freeze(Object.fromEntries(metadata.functions.filter(f=>!f.internal).map(f=> {
  const input=__inputTypes[f.index].types.map((t,i)=>__representation(t,false,__inputTypes[f.index].capture[i]));
  const output=__representation(f.result,true);
  const body=__implementations[f.index];
  const implementation=f.precondition==null?body:(...args)=>{if(__implementations[f.precondition](...args)!==true)throw Error('contract precondition failed');return body(...args);};
  const needsInput=input.some(c=>c!==__identity);
  const entry=!needsInput && output===__identity ? implementation :
    (...args)=>{const context=new WeakMap();return output(implementation(...(needsInput ? args.map((v,i)=>input[i](v,context)) : args)),context);};
  return [f.name,entry];
}))),...Object.freeze(Object.fromEntries([]))});
export function call(name,args) {switch(name){case "add":throw new Error('temporary storage is internal to a pure invocation');}return functions[name](...args);}
// Shared bounded binary codec; generated code supplies exact descriptors.
export const valueWireFormat='ink-value-wire-v1';
// A connection agrees on the complete value schema before using this format.
// Version byte + schema-directed fields; schema identity is out of band.
export const compactValueWireFormat='ink-value-session-v1';
const wireMagic=Uint8Array.of(73,78,75,86,65,76,0,1);
const wireEncoder=new TextEncoder(),wireDecoder=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true});
const wireDefaults=Object.freeze({bytes:16777216,nodes:1000000,depth:128}),wireDefaultOptions=Object.freeze({});
const wireDecimal=s=>typeof s==='string'&&/^(0|[1-9][0-9]*|-[1-9][0-9]*)$/.test(s);
function wireLimits(options){if(options===wireDefaultOptions||options===wireDefaults)return wireDefaults;const l={...wireDefaults,...options};for(const k of ['bytes','nodes','depth'])if(!Number.isSafeInteger(l[k])||l[k]<0||l[k]>wireDefaults[k])throw Error('wire hard resource limit');return l;}
const wireFloat=new DataView(new ArrayBuffer(4));
function wireDecodeText(bytes,start,end){
 if(end-start<=16){let text='';for(let i=start;i<end;i++){const byte=bytes[i];if(byte>=128)return wireDecoder.decode(bytes.subarray(start,end));text+=String.fromCharCode(byte);}return text;}
 return wireDecoder.decode(bytes.subarray(start,end));
}
function wireUtf8Length(text){let bytes=0;for(let i=0;i<text.length;i++){const c=text.charCodeAt(i);if(c<128)bytes++;else if(c<2048)bytes+=2;else if(c>=0xd800&&c<=0xdbff){bytes+=4;i++;}else bytes+=3;}return bytes;}
const wireOwn=(v,k)=>v!==null&&typeof v==='object'&&Object.hasOwn(v,k);
const wireTagged=(v,k)=>wireOwn(v,k)&&Object.keys(v).length===1;
const wireDouble=new DataView(new ArrayBuffer(8));
function wireF64Bits(v){
 if(typeof v==='number'&&Number.isFinite(v)){wireDouble.setFloat64(0,v,true);return wireDouble.getBigUint64(0,true);}
 if(!wireTagged(v,'F64Bits'))wireInvalidValue();const text=v.F64Bits;
 if(typeof text!=='string'||text.length>20||!/^(0|[1-9][0-9]*)$/.test(text))wireInvalidValue();
 const bits=BigInt(text);if(bits>18446744073709551615n)wireInvalidValue();return bits;
}
const wireCanonical=v=>Array.isArray(v)?'['+v.map(wireCanonical).join(',')+']':v&&typeof v==='object'?'{'+Object.keys(v).sort((a,b)=>{const x=Array.from(a,c=>c.codePointAt(0)),y=Array.from(b,c=>c.codePointAt(0));for(let i=0;i<Math.min(x.length,y.length);i++)if(x[i]!==y[i])return x[i]-y[i];return x.length-y.length;}).map(k=>JSON.stringify(k)+':'+wireCanonical(v[k])).join(',')+'}':JSON.stringify(v);
export async function createValueCodec(root,named={}){
 const used=new Set(),budget={nodes:100000};
 function check(t,d=0){
  if(d>64||--budget.nodes<0)throw Error('wire descriptor limit');
  const keys={u32:['kind'],u64:['kind'],i32:['kind'],f32:['kind'],f64:['kind'],bool:['kind'],unit:['kind'],string:['kind'],int:['kind'],id:['kind','name'],ref:['kind','name'],enum:['kind','name','variants'],record:['kind','name','fields'],list:['kind','element'],option:['kind','element'],vector:['kind','element','size'],result:['kind','ok','error']}[t?.kind];
  if(!keys||Object.keys(t).length!==keys.length||keys.some(k=>!Object.hasOwn(t,k)))throw Error('invalid wire descriptor');
  if(keys.includes('name')&&(typeof t.name!=='string'||!t.name.isWellFormed()))throw Error('invalid descriptor name');
  if(t.kind==='ref'){if(!used.has(t.name)){used.add(t.name);if(named[t.name]?.kind!=='record'||named[t.name].name!==t.name)throw Error('unresolved wire reference');check(named[t.name],d+1);}}
  if(t.kind==='record'){if(!Array.isArray(t.fields))throw Error('wire fields');const names=new Set();for(const f of t.fields){if(Object.keys(f).length!==2||typeof f.name!=='string'||!f.name.isWellFormed()||names.has(f.name))throw Error('duplicate wire field');names.add(f.name);check(f.type,d+1);}}
  if(t.kind==='enum'&&(!Array.isArray(t.variants)||!t.variants.length||t.variants.length>64||t.variants.some(v=>typeof v!=='string'||!v.isWellFormed())||new Set(t.variants).size!==t.variants.length))throw Error('wire enum');
  if(['list','vector','option'].includes(t.kind)){if(t.kind==='vector'&&(!Number.isInteger(t.size)||t.size<1||t.size>64))throw Error('wire vector');check(t.element,d+1);}
  if(t.kind==='result'){check(t.ok,d+1);check(t.error,d+1);}
 }
 check(root);const names=Object.fromEntries([...used].sort().map(k=>[k,named[k]]));
 const hash=new Uint8Array(await crypto.subtle.digest('SHA-256',wireEncoder.encode(wireCanonical({format:valueWireFormat,root,named:names}))));
 return new ValueCodec({format:valueWireFormat,root,named:names,identity:Array.from(hash,b=>b.toString(16).padStart(2,'0')).join('')});
}
// Resolve immutable descriptor edges once. Logical validation traverses the
// literal schema; single-child nodes use a loop rather than recursive closures.
function wireValuePlan(codec){
 const seen=new WeakMap();let remaining=100000;
 const build=type=>{
  const t=codec.resolve(type);if(seen.has(t))return seen.get(t);
  if(--remaining<0)throw Error('wire descriptor limit');const p={kind:t.kind,type:t,decode:null,decodeCompact:null};seen.set(t,p);
  if(t.kind==='record')p.fields=t.fields.map(f=>({name:f.name,plan:build(f.type)}));
  if(t.kind==='list'||t.kind==='vector'||t.kind==='option')p.element=build(t.element);
  if(t.kind==='result'){p.ok=build(t.ok);p.error=build(t.error);}
  return p;
 };return build(codec.descriptor.root);
}
function wireBindDecodePlan(root,compact=false){
 const seen=new Set(),pending=[root];let flags=0;
 while(pending.length){
  const p=pending.pop();if(seen.has(p))continue;seen.add(p);if(compact)p.decodeCompact=compactDecodeOperation(p);else p.decode=wireDecodeOperation(p);
  if(p.fields?.length>4)flags|=1;
  if(p.kind==='u32'||p.kind==='i32'||p.kind==='u64'||p.kind==='f32'||p.kind==='f64')flags|=2;
  if(p.fields)for(const f of p.fields)pending.push(f.plan);
  if(p.element)pending.push(p.element);
  if(p.ok){pending.push(p.ok);pending.push(p.error);}
 }
 return flags|4;
}
// Select literal descriptor operations once, without runtime source generation
// or eval. Recursive edges call the completed plan. The generic scanner remains
// the visitor/validation path and an independent materialisation implementation.
function wireReadOperation(p){
 const t=p.type;
 let read;
 switch(p.kind){
  case 'unit':read=(r,end)=>{r.size(end,0);return null;};break;
  case 'bool':read=(r,end)=>{r.size(end,1);const b=r.bytes[r.cursor++];if(b>1)throw Error('invalid wire Bool');return !!b;};break;
  case 'u32':read=(r,end)=>{r.size(end,4);const n=r.view.getUint32(r.cursor,true);r.cursor=end;return n;};break;
  case 'i32':read=(r,end)=>{r.size(end,4);const n=r.view.getInt32(r.cursor,true);r.cursor=end;return n;};break;
  case 'f32':read=(r,end)=>{r.size(end,4);const value={F32Bits:r.view.getUint32(r.cursor,true)};r.cursor=end;return value;};break;
  case 'f64':read=(r,end)=>{r.size(end,8);const value={F64Bits:r.view.getBigUint64(r.cursor,true).toString()};r.cursor=end;return value;};break;
  case 'u64':read=(r,end)=>{r.size(end,8);const value=r.view.getBigUint64(r.cursor,true);r.cursor=end;return value;};break;
  case 'string':read=(r,end)=>r.text(end);break;
  case 'int':read=(r,end)=>{const text=r.text(end);if(!wireDecimal(text))throw Error('malformed wire text');return {Int:text};};break;
  case 'id':read=(r,end)=>{const text=r.text(end);if(!/^[0-9a-f]{32}$/.test(text))throw Error('malformed wire text');return text;};break;
  case 'enum':read=(r,end)=>{const text=r.text(end);if(!t.variants.includes(text))throw Error('malformed wire text');return text;};break;
  case 'list':case 'vector':{
   const element=p.element,size=p.kind==='vector'?t.size:null;
   read=(r,end,d)=>{
    if(r.cursor+4>end)throw Error('wire list count');const n=r.view.getUint32(r.cursor,true);r.cursor+=4;
    if(n>r.remaining||n>Math.floor((end-r.cursor)/4)||size!==null&&n!==size)throw Error('wire sequence size');
    const values=new Array(n);for(let i=0;i<n;i++)values[i]=element.decode(r,end,d+1);return values;
   };break;
  }
  case 'record':{
   const fs=p.fields;
   switch(fs.length){
    case 0:read=()=>({});break;
    case 1:read=(r,end,d)=>({[fs[0].name]:fs[0].plan.decode(r,end,d+1)});break;
    case 2:read=(r,end,d)=>({[fs[0].name]:fs[0].plan.decode(r,end,d+1),[fs[1].name]:fs[1].plan.decode(r,end,d+1)});break;
    case 3:read=(r,end,d)=>({[fs[0].name]:fs[0].plan.decode(r,end,d+1),[fs[1].name]:fs[1].plan.decode(r,end,d+1),[fs[2].name]:fs[2].plan.decode(r,end,d+1)});break;
    case 4:read=(r,end,d)=>({[fs[0].name]:fs[0].plan.decode(r,end,d+1),[fs[1].name]:fs[1].plan.decode(r,end,d+1),[fs[2].name]:fs[2].plan.decode(r,end,d+1),[fs[3].name]:fs[3].plan.decode(r,end,d+1)});break;
    default:read=(r,end,d)=>{const value={};for(const f of fs){r.property.value=f.plan.decode(r,end,d+1);Object.defineProperty(value,f.name,r.property);}return value;};
   }break;
  }
  case 'option':read=(r,end,d)=>{const tag=r.tag(end);return tag?{Some:p.element.decode(r,end,d+1)}:{None:null};};break;
  case 'result':read=(r,end,d)=>r.tag(end)?{Err:p.error.decode(r,end,d+1)}:{Ok:p.ok.decode(r,end,d+1)};break;
  default:read=()=>{throw Error('unsupported wire kind');};
 }
 return read;
}
function wireDecodeOperation(p){
 if(p.kind==='record'&&p.fields.length===1){
  const field=p.fields[0],read=wireReadOperation(field.plan),name=field.name;
  return (r,parentEnd,d)=>{const end=r.enter(parentEnd,d),childEnd=r.enter(end,d+1),item=read(r,childEnd,d+1);if(r.cursor!==childEnd)throw Error('trailing wire frame bytes');const value={[name]:item};if(r.cursor!==end)throw Error('trailing wire frame bytes');return value;};
 }
 const read=wireReadOperation(p);
 return (r,parentEnd,d)=>{const end=r.enter(parentEnd,d),value=read(r,end,d);if(r.cursor!==end)throw Error('trailing wire frame bytes');return value;};
}
class WireDecodeCursor{
 constructor(bytes,view,limits){this.bytes=bytes;this.view=view;this.cursor=40;this.remaining=limits.nodes;this.depth=limits.depth;this.property=null;}
 enter(parentEnd,d){
  if(d>this.depth||--this.remaining<0||this.cursor+4>parentEnd)throw Error('wire node, depth or length limit');
  const start=this.cursor+4,end=start+this.view.getUint32(this.cursor,true);if(end>parentEnd)throw Error('truncated wire frame');this.cursor=start;return end;
 }
 size(end,n){if(end-this.cursor!==n)throw Error('malformed wire scalar');}
 tag(end){if(this.cursor===end||this.bytes[this.cursor]>1)throw Error('wire sum tag');return this.bytes[this.cursor++];}
 text(end){const text=wireDecodeText(this.bytes,this.cursor,end);this.cursor=end;return text;}
}
// Bind literal validation and postorder visitation once for every descriptor.
// No logical carriers are allocated; projection still validates every child.
function wireScanPlan(root){
 const seen=new WeakMap();
 const build=source=>{
  if(seen.has(source))return seen.get(source);
  const p={kind:source.kind,type:source.type,scan:null};seen.set(source,p);
  if(source.fields)p.fields=source.fields.map(f=>({plan:build(f.plan)}));
  if(source.element)p.element=build(source.element);
  if(source.ok){p.ok=build(source.ok);p.error=build(source.error);}
  p.scan=wireScanOperation(p);return p;
 };
 return build(root);
}
function wireScanOperation(p){
 const t=p.type;let read;
 switch(p.kind){
  case 'unit':read=(r,end)=>{r.size(end,0);return null;};break;
  case 'bool':read=(r,end)=>{r.size(end,1);const b=r.bytes[r.cursor++];if(b>1)throw Error('invalid wire Bool');return !!b;};break;
  case 'u32':read=(r,end)=>{r.size(end,4);const n=r.view.getUint32(r.cursor,true);r.cursor=end;return n;};break;
  case 'i32':read=(r,end)=>{r.size(end,4);const n=r.view.getInt32(r.cursor,true);r.cursor=end;return n;};break;
  case 'f32':case 'f64':case 'u64':{const size=p.kind==='f32'?4:8;read=(r,end)=>{r.size(end,size);r.cursor=end;};break;}
  case 'string':read=(r,end)=>{let i=r.cursor;while(i<end&&r.bytes[i]<128)i++;if(i<end)wireDecoder.decode(r.bytes.subarray(r.cursor,end));r.cursor=end;};break;
  case 'int':case 'id':case 'enum':read=(r,end)=>{const text=r.text(end);if(p.kind==='int'&&!wireDecimal(text)||p.kind==='id'&&!/^[0-9a-f]{32}$/.test(text)||p.kind==='enum'&&!t.variants.includes(text))throw Error('malformed wire text');};break;
  case 'list':case 'vector':{
   const element=p.element,size=p.kind==='vector'?t.size:null;
   read=(r,end,d)=>{if(r.cursor+4>end)throw Error('wire list count');const n=r.view.getUint32(r.cursor,true);r.cursor+=4;if(n>r.remaining||n>Math.floor((end-r.cursor)/4)||size!==null&&n!==size)throw Error('wire sequence size');for(let i=0;i<n;i++)element.scan(r,end,d+1);};break;
  }
  case 'record':{
   const fs=p.fields;
   switch(fs.length){
    case 0:read=()=>{};break;
    case 1:read=(r,end,d)=>{fs[0].plan.scan(r,end,d+1);};break;
    case 2:read=(r,end,d)=>{fs[0].plan.scan(r,end,d+1);fs[1].plan.scan(r,end,d+1);};break;
    case 3:read=(r,end,d)=>{fs[0].plan.scan(r,end,d+1);fs[1].plan.scan(r,end,d+1);fs[2].plan.scan(r,end,d+1);};break;
    case 4:read=(r,end,d)=>{fs[0].plan.scan(r,end,d+1);fs[1].plan.scan(r,end,d+1);fs[2].plan.scan(r,end,d+1);fs[3].plan.scan(r,end,d+1);};break;
    default:read=(r,end,d)=>{for(const f of fs)f.plan.scan(r,end,d+1);};
   }break;
  }
  case 'option':read=(r,end,d)=>{if(r.tag(end))p.element.scan(r,end,d+1);};break;
  case 'result':read=(r,end,d)=>{(r.tag(end)?p.error:p.ok).scan(r,end,d+1);};break;
  default:read=()=>{throw Error('unsupported wire kind');};
 }
 return (r,parentEnd,d)=>{
  const end=r.enter(parentEnd,d),start=r.cursor,value=read(r,end,d);if(r.cursor!==end)throw Error('trailing wire frame bytes');
  const visitor=r.visitor;if(visitor&&(!r.selected||r.selected.has(t.name))){if(r.spans)visitor(t,r.bytes,start,end,d);else visitor(t,r.bytes.subarray(start,end),d);}
  return value;
 };
}
// Separate methods keep decoding's cursor callsites monomorphic. Both cursors
// are checked against the independent generic scanner and malformed fixtures.
class WireScanCursor{
 constructor(bytes,view,limits,visitor,selected,spans){this.bytes=bytes;this.view=view;this.cursor=40;this.remaining=limits.nodes;this.depth=limits.depth;this.visitor=visitor;this.selected=selected;this.spans=spans;}
 enter(parentEnd,d){
  if(d>this.depth||--this.remaining<0||this.cursor+4>parentEnd)throw Error('wire node, depth or length limit');
  const start=this.cursor+4,end=start+this.view.getUint32(this.cursor,true);if(end>parentEnd)throw Error('truncated wire frame');this.cursor=start;return end;
 }
 size(end,n){if(end-this.cursor!==n)throw Error('malformed wire scalar');}
 tag(end){if(this.cursor===end||this.bytes[this.cursor]>1)throw Error('wire sum tag');return this.bytes[this.cursor++];}
 text(end){const text=wireDecodeText(this.bytes,this.cursor,end);this.cursor=end;return text;}
}
function compactReadOperation(p){
 const t=p.type;let read;
 switch(p.kind){
  case 'unit':read=()=>null;break;
  case 'bool':read=r=>{r.require(1);const b=r.bytes[r.cursor++];if(b>1)throw Error('invalid wire Bool');return !!b;};break;
  case 'u32':case 'i32':read=r=>{r.require(4);const n=p.kind==='u32'?r.view.getUint32(r.cursor,true):r.view.getInt32(r.cursor,true);r.cursor+=4;return n;};break;
  case 'f32':read=r=>{r.require(4);const n=r.view.getUint32(r.cursor,true);r.cursor+=4;return {F32Bits:n};};break;
  case 'f64':read=r=>{r.require(8);const n=r.view.getBigUint64(r.cursor,true);r.cursor+=8;return {F64Bits:n.toString()};};break;
  case 'u64':read=r=>{r.require(8);const n=r.view.getBigUint64(r.cursor,true);r.cursor+=8;return n;};break;
  case 'string':read=r=>r.text();break;
  case 'int':read=r=>{const text=r.text();if(!wireDecimal(text))throw Error('malformed wire text');return {Int:text};};break;
  case 'id':read=r=>{const text=r.text();if(!/^[0-9a-f]{32}$/.test(text))throw Error('malformed wire text');return text;};break;
  case 'enum':read=r=>{const text=r.text();if(!t.variants.includes(text))throw Error('malformed wire text');return text;};break;
  case 'list':case 'vector':read=(r,d)=>{const n=r.count();if(n>r.remaining||p.kind==='vector'&&n!==t.size)throw Error('wire sequence size');const values=new Array(n);for(let i=0;i<n;i++)values[i]=p.element.decodeCompact(r,d+1);return values;};break;
  case 'record':{
   const fs=p.fields;
   switch(fs.length){
    case 0:read=()=>({});break;
    case 1:read=(r,d)=>({[fs[0].name]:fs[0].plan.decodeCompact(r,d+1)});break;
    case 2:read=(r,d)=>({[fs[0].name]:fs[0].plan.decodeCompact(r,d+1),[fs[1].name]:fs[1].plan.decodeCompact(r,d+1)});break;
    case 3:read=(r,d)=>({[fs[0].name]:fs[0].plan.decodeCompact(r,d+1),[fs[1].name]:fs[1].plan.decodeCompact(r,d+1),[fs[2].name]:fs[2].plan.decodeCompact(r,d+1)});break;
    case 4:read=(r,d)=>({[fs[0].name]:fs[0].plan.decodeCompact(r,d+1),[fs[1].name]:fs[1].plan.decodeCompact(r,d+1),[fs[2].name]:fs[2].plan.decodeCompact(r,d+1),[fs[3].name]:fs[3].plan.decodeCompact(r,d+1)});break;
    default:read=(r,d)=>{const value={};for(const f of fs){r.property.value=f.plan.decodeCompact(r,d+1);Object.defineProperty(value,f.name,r.property);}return value;};
   }break;
  }
  case 'option':read=(r,d)=>r.tag()?{Some:p.element.decodeCompact(r,d+1)}:{None:null};break;
  case 'result':read=(r,d)=>r.tag()?{Err:p.error.decodeCompact(r,d+1)}:{Ok:p.ok.decodeCompact(r,d+1)};break;
  default:read=()=>{throw Error('unsupported wire kind');};
 }
 return read;
}
function compactDecodeOperation(p){
 if(p.kind==='record'&&p.fields.length===1){
  const field=p.fields[0],read=compactReadOperation(field.plan),name=field.name;
  return (r,d)=>{if(d>r.depth||--r.remaining<0)throw Error('wire node or depth limit');if(d+1>r.depth||--r.remaining<0)throw Error('wire node or depth limit');return {[name]:read(r,d+1)};};
 }
 const read=compactReadOperation(p);
 return (r,d)=>{if(d>r.depth||--r.remaining<0)throw Error('wire node or depth limit');return read(r,d);};
}
class CompactDecodeCursor{
 constructor(bytes,limits,flags){this.bytes=bytes;this.view=flags&2?new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength):null;this.cursor=1;this.remaining=limits.nodes;this.depth=limits.depth;this.property=null;}
 require(n){if(n>this.bytes.length-this.cursor)throw Error('truncated compact value');}
 count(){
  if(this.cursor>=this.bytes.length)throw Error('truncated compact value');
  const first=this.bytes[this.cursor++];if(first<128)return first;
  let value=first&127,scale=128;
  for(let i=1;i<5;i++){if(this.cursor>=this.bytes.length)throw Error('truncated compact value');const byte=this.bytes[this.cursor++];if(i===4&&byte>15)throw Error('compact count overflow');value+=(byte&127)*scale;if(byte<128){if(byte===0)throw Error('noncanonical compact count');return value;}scale*=128;}throw Error('compact count overflow');
 }
 tag(){if(this.cursor>=this.bytes.length)throw Error('truncated compact value');const tag=this.bytes[this.cursor++];if(tag>1)throw Error('wire sum tag');return tag;}
 text(){const n=this.count();this.require(n);const start=this.cursor;this.cursor+=n;return wireDecodeText(this.bytes,start,this.cursor);}
}
function wireInvalidValue(){throw Error('invalid value for wire schema');}
// Capture has the canonical logical meaning of decode(encode(value)), without
// allocating wire bytes. A separate plan leaves validation/decoder hot shapes
// unchanged and never retains host input containers between calls.
function wireCapturePlan(root,checked=true){
 const seen=new WeakMap();
 const build=source=>{
  if(seen.has(source))return seen.get(source);
  const p={kind:source.kind,type:source.type,capture:null};seen.set(source,p);
  if(source.fields)p.fields=source.fields.map(f=>({name:f.name,plan:build(f.plan)}));
  if(source.element)p.element=build(source.element);
  if(source.ok){p.ok=build(source.ok);p.error=build(source.error);}
  p.capture=checked?wireCaptureOperation(p):wireCopyOperation(p);return p;
 };return build(root);
}
function wireCaptureOperation(p){
 const t=p.type;let copy;
 switch(p.kind){
  case 'unit':copy=v=>{if(v!==null)wireInvalidValue();return null;};break;
  case 'bool':copy=(v,r)=>{if(typeof v!=='boolean')wireInvalidValue();r.add(1);return v;};break;
  case 'u32':case 'i32':{
   const min=p.kind==='u32'?0:-2147483648,max=p.kind==='u32'?4294967295:2147483647;
   copy=(v,r)=>{if(typeof v!=='number'||!Number.isInteger(v)||v<min||v>max)wireInvalidValue();r.add(4);return v===0?0:v;};break;
  }
  case 'u64':copy=(v,r)=>{const kind=typeof v;if(kind==='number'&&!Number.isSafeInteger(v)||kind!=='bigint'&&kind!=='number'&&kind!=='string'||kind==='string'&&(!wireDecimal(v)||v.startsWith('-')))wireInvalidValue();const n=BigInt(v);if(n<0n||n>18446744073709551615n)wireInvalidValue();r.add(8);return n;};break;
  case 'f32':copy=(v,r)=>{let bits;if(typeof v==='number'&&Number.isFinite(v)){wireFloat.setFloat32(0,v,true);if(!Number.isFinite(wireFloat.getFloat32(0,true)))wireInvalidValue();bits=wireFloat.getUint32(0,true);}else{if(!wireTagged(v,'F32Bits'))wireInvalidValue();bits=v.F32Bits;if(!Number.isInteger(bits)||bits<0||bits>4294967295)wireInvalidValue();}r.add(4);return {F32Bits:bits===0?0:bits};};break;
  case 'f64':copy=(v,r)=>{const bits=wireF64Bits(v);r.add(8);return {F64Bits:bits.toString()};};break;
  case 'string':case 'int':case 'id':case 'enum':copy=(v,r)=>{const text=p.kind==='int'?(typeof v==='bigint'?v.toString():wireTagged(v,'Int')?v.Int:null):v;if(typeof text!=='string'||!text.isWellFormed()||text.length>r.limit)wireInvalidValue();if(p.kind==='int'&&!wireDecimal(text)||p.kind==='id'&&!/^[0-9a-f]{32}$/.test(text)||p.kind==='enum'&&!t.variants.includes(text))wireInvalidValue();r.add(wireUtf8Length(text));return p.kind==='int'?{Int:text}:text;};break;
  case 'list':case 'vector':{
   const element=p.element,size=p.kind==='vector'?t.size:null;
   copy=(v,r,d)=>{if(!Array.isArray(v)&&!(ArrayBuffer.isView(v)&&!(v instanceof DataView)))wireInvalidValue();const n=v.length;if(n>r.remaining||size!==null&&n!==size)wireInvalidValue();r.add(4);const out=new Array(n);for(let i=0;i<n;i++)out[i]=element.capture(v[i],r,d+1);return out;};break;
  }
  case 'record':{
   const fs=p.fields;let fields;
   switch(fs.length){
    case 0:fields=()=>({});break;
    case 1:fields=(v,r,d)=>({[fs[0].name]:fs[0].plan.capture(v[fs[0].name],r,d+1)});break;
    case 2:fields=(v,r,d)=>({[fs[0].name]:fs[0].plan.capture(v[fs[0].name],r,d+1),[fs[1].name]:fs[1].plan.capture(v[fs[1].name],r,d+1)});break;
    case 3:fields=(v,r,d)=>({[fs[0].name]:fs[0].plan.capture(v[fs[0].name],r,d+1),[fs[1].name]:fs[1].plan.capture(v[fs[1].name],r,d+1),[fs[2].name]:fs[2].plan.capture(v[fs[2].name],r,d+1)});break;
    case 4:fields=(v,r,d)=>({[fs[0].name]:fs[0].plan.capture(v[fs[0].name],r,d+1),[fs[1].name]:fs[1].plan.capture(v[fs[1].name],r,d+1),[fs[2].name]:fs[2].plan.capture(v[fs[2].name],r,d+1),[fs[3].name]:fs[3].plan.capture(v[fs[3].name],r,d+1)});break;
    default:fields=(v,r,d)=>{const out={};for(const f of fs){const value=f.plan.capture(v[f.name],r,d+1);Object.defineProperty(out,f.name,{value,enumerable:true,writable:true,configurable:true});}return out;};
   }
   copy=(v,r,d)=>{if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).length!==fs.length)wireInvalidValue();for(const f of fs)if(!wireOwn(v,f.name))wireInvalidValue();return fields(v,r,d);};break;
  }
  case 'option':copy=(v,r,d)=>{r.add(1);if(wireTagged(v,'None')&&v.None===null)return {None:null};if(wireTagged(v,'Some'))return {Some:p.element.capture(v.Some,r,d+1)};wireInvalidValue();};break;
  case 'result':copy=(v,r,d)=>{r.add(1);if(wireTagged(v,'Ok'))return {Ok:p.ok.capture(v.Ok,r,d+1)};if(wireTagged(v,'Err'))return {Err:p.error.capture(v.Err,r,d+1)};wireInvalidValue();};break;
  default:copy=()=>{throw Error('unsupported wire kind');};
 }
 return (v,r,d)=>{if(d>r.depth||--r.remaining<0)throw Error('wire node or depth limit');r.add(4);return copy(v,r,d);};
}
class WireCaptureCursor{
 constructor(limits){this.remaining=limits.nodes;this.depth=limits.depth;this.limit=limits.bytes;this.bytes=40;this.add(0);}
 add(n){this.bytes+=n;if(this.bytes>this.limit)throw Error('wire byte limit');}
 enter(depth,bytes){if(depth>this.depth||--this.remaining<0)throw Error('wire node or depth limit');this.add(bytes);}
 text(value){if(value.length>this.limit)throw Error('wire byte limit');this.add(wireUtf8Length(value));}
}
// Literal lowerers share this fixed resource policy with logical capture.
export function createValueCaptureBudget(options=wireDefaultOptions){return new WireCaptureCursor(wireLimits(options));}
// The trusted-value API has the same canonical copy and ownership semantics.
// Its caller supplies a stable value accepted by validateValue. Shape/range
// checks remain at external capture boundaries; resource limits still apply.
function wireCopyOperation(p){
 let copy;
 switch(p.kind){
  case 'unit':copy=()=>null;break;
  case 'bool':copy=(v,r)=>{r.add(1);return v;};break;
  case 'u32':copy=(v,r)=>{r.add(4);return v>>>0;};break;
  case 'i32':copy=(v,r)=>{r.add(4);return v|0;};break;
  case 'u64':copy=(v,r)=>{r.add(8);return BigInt(v);};break;
  case 'f32':copy=(v,r)=>{let bits;if(typeof v==='number'){wireFloat.setFloat32(0,v,true);bits=wireFloat.getUint32(0,true);}else bits=v.F32Bits;r.add(4);return {F32Bits:bits===0?0:bits};};break;
  case 'f64':copy=(v,r)=>{const bits=wireF64Bits(v);r.add(8);return {F64Bits:bits.toString()};};break;
  case 'string':case 'id':case 'enum':copy=(v,r)=>{r.add(wireUtf8Length(v));return v;};break;
  case 'int':copy=(v,r)=>{const text=typeof v==='bigint'?v.toString():v.Int;r.add(wireUtf8Length(text));return {Int:text};};break;
  case 'list':case 'vector':copy=(v,r,d)=>{const n=v.length;if(n>r.remaining)throw Error('wire sequence size');r.add(4);const out=new Array(n);for(let i=0;i<n;i++)out[i]=p.element.capture(v[i],r,d+1);return out;};break;
  case 'record':{
   const fs=p.fields;
   switch(fs.length){
    case 0:copy=()=>({});break;
    case 1:copy=(v,r,d)=>({[fs[0].name]:fs[0].plan.capture(v[fs[0].name],r,d+1)});break;
    case 2:copy=(v,r,d)=>({[fs[0].name]:fs[0].plan.capture(v[fs[0].name],r,d+1),[fs[1].name]:fs[1].plan.capture(v[fs[1].name],r,d+1)});break;
    case 3:copy=(v,r,d)=>({[fs[0].name]:fs[0].plan.capture(v[fs[0].name],r,d+1),[fs[1].name]:fs[1].plan.capture(v[fs[1].name],r,d+1),[fs[2].name]:fs[2].plan.capture(v[fs[2].name],r,d+1)});break;
    case 4:copy=(v,r,d)=>({[fs[0].name]:fs[0].plan.capture(v[fs[0].name],r,d+1),[fs[1].name]:fs[1].plan.capture(v[fs[1].name],r,d+1),[fs[2].name]:fs[2].plan.capture(v[fs[2].name],r,d+1),[fs[3].name]:fs[3].plan.capture(v[fs[3].name],r,d+1)});break;
    default:copy=(v,r,d)=>{const out={};for(const f of fs){const value=f.plan.capture(v[f.name],r,d+1);Object.defineProperty(out,f.name,{value,enumerable:true,writable:true,configurable:true});}return out;};
   }break;
  }
  case 'option':copy=(v,r,d)=>{r.add(1);return Object.hasOwn(v,'None')&&v.None===null?{None:null}:{Some:p.element.capture(v.Some,r,d+1)};};break;
  case 'result':copy=(v,r,d)=>{r.add(1);return Object.hasOwn(v,'Ok')?{Ok:p.ok.capture(v.Ok,r,d+1)}:{Err:p.error.capture(v.Err,r,d+1)};};break;
  default:copy=()=>{throw Error('unsupported wire kind');};
 }
 return (v,r,d)=>{if(d>r.depth||--r.remaining<0)throw Error('wire node or depth limit');r.add(4);return copy(v,r,d);};
}
// Emit the cached literal schema with one forward writer. Each value is checked
// where it is consumed; byte bounds belong to the writer, not a second size walk.
function wireEncodeValue(root,value,l,w){
 let remaining=l.nodes;const depthLimit=l.depth;
 const node=(p,v,d)=>{
  if(d>depthLimit||--remaining<0)throw Error('wire node or depth limit');
  const t=p.type,start=w.beginNode();
  switch(p.kind){
   case 'unit':if(v!==null)wireInvalidValue();break;
   case 'bool':if(typeof v!=='boolean')wireInvalidValue();w.byte(+v);break;
   case 'u32':case 'i32':{
    const min=p.kind==='u32'?0:-2147483648,max=p.kind==='u32'?4294967295:2147483647;
    if(typeof v!=='number'||!Number.isInteger(v)||v<min||v>max)wireInvalidValue();w.word(v>>>0);break;
   }
   case 'u64':{
    const kind=typeof v;
    if(kind==='number'&&!Number.isSafeInteger(v)||kind!=='bigint'&&kind!=='number'&&kind!=='string'||kind==='string'&&(!wireDecimal(v)||v.startsWith('-')))wireInvalidValue();
    const n=BigInt(v);if(n<0n||n>18446744073709551615n)wireInvalidValue();w.wide(n);break;
   }
   case 'f64':w.wide(wireF64Bits(v));break;
   case 'f32':{
    let bits;
    if(typeof v==='number'&&Number.isFinite(v)){wireFloat.setFloat32(0,v,true);if(!Number.isFinite(wireFloat.getFloat32(0,true)))wireInvalidValue();bits=wireFloat.getUint32(0,true);}
    else{if(!wireTagged(v,'F32Bits'))wireInvalidValue();bits=v.F32Bits;if(!Number.isInteger(bits)||bits<0||bits>4294967295)wireInvalidValue();}
    w.word(bits);break;
   }
   case 'string':case 'int':case 'id':case 'enum':{
    const text=p.kind==='int'?(typeof v==='bigint'?v.toString():wireTagged(v,'Int')?v.Int:null):v;
    if(p.kind==='int'&&!wireDecimal(text)||p.kind==='id'&&(typeof text!=='string'||!/^[0-9a-f]{32}$/.test(text))||p.kind==='enum'&&!t.variants.includes(text))wireInvalidValue();
    w.text(text);break;
   }
   case 'list':case 'vector':{
    if(!Array.isArray(v)&&!(ArrayBuffer.isView(v)&&!(v instanceof DataView)))wireInvalidValue();
    if(v.length>remaining||p.kind==='vector'&&v.length!==t.size)wireInvalidValue();
    w.count(v.length);for(let i=0;i<v.length;i++)node(p.element,v[i],d+1);break;
   }
   case 'record':{
    const fs=p.fields;
    if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).length!==fs.length)wireInvalidValue();
    for(let i=0;i<fs.length;i++)if(!wireOwn(v,fs[i].name))wireInvalidValue();
    for(let i=0;i<fs.length;i++){const f=fs[i];node(f.plan,v[f.name],d+1);}break;
   }
   case 'option':{
    if(wireTagged(v,'None')&&v.None===null)w.byte(0);
    else if(wireTagged(v,'Some')){w.byte(1);node(p.element,v.Some,d+1);}else wireInvalidValue();break;
   }
   case 'result':{
    if(wireTagged(v,'Ok')){w.byte(0);node(p.ok,v.Ok,d+1);}
    else if(wireTagged(v,'Err')){w.byte(1);node(p.error,v.Err,d+1);}else wireInvalidValue();break;
   }
   default:throw Error('unsupported wire kind');
  }
  w.endNode(start);
 };
 node(root,value,0);
}
function wireCheckValue(root,value,l){
 let remaining=l.nodes,total=40;
 const add=n=>{total+=n;if(total>l.bytes)throw Error('wire byte limit');};
 const node=(p,v,d)=>{
  while(true){
   if(d>l.depth||--remaining<0)throw Error('wire node or depth limit');
   const t=p.type;
   switch(p.kind){
    case 'unit':if(v!==null)wireInvalidValue();add(4);return;
    case 'bool':if(typeof v!=='boolean')wireInvalidValue();add(5);return;
    case 'u32':case 'i32':{
     const min=p.kind==='u32'?0:-2147483648,max=p.kind==='u32'?4294967295:2147483647;
     if(typeof v!=='number'||!Number.isInteger(v)||v<min||v>max)wireInvalidValue();add(8);return;
    }
    case 'u64':{
     const kind=typeof v;
     if(kind==='number'&&!Number.isSafeInteger(v)||kind!=='bigint'&&kind!=='number'&&kind!=='string'||kind==='string'&&(!wireDecimal(v)||v.startsWith('-')))wireInvalidValue();
     const n=BigInt(v);if(n<0n||n>18446744073709551615n)wireInvalidValue();add(12);return;
    }
    case 'f64':wireF64Bits(v);add(12);return;
    case 'f32':{
     if(typeof v==='number'&&Number.isFinite(v)){wireFloat.setFloat32(0,v,true);if(!Number.isFinite(wireFloat.getFloat32(0,true)))wireInvalidValue();}
     else{if(!wireTagged(v,'F32Bits'))wireInvalidValue();const bits=v.F32Bits;if(!Number.isInteger(bits)||bits<0||bits>4294967295)wireInvalidValue();}
     add(8);return;
    }
    case 'string':case 'int':case 'id':case 'enum':{
     const text=p.kind==='int'?(typeof v==='bigint'?v.toString():wireTagged(v,'Int')?v.Int:null):v;
     if(typeof text!=='string'||!text.isWellFormed()||text.length>l.bytes)wireInvalidValue();
     if(p.kind==='int'&&!wireDecimal(text)||p.kind==='id'&&!/^[0-9a-f]{32}$/.test(text)||p.kind==='enum'&&!t.variants.includes(text))wireInvalidValue();
     add(4+wireUtf8Length(text));return;
    }
    case 'list':case 'vector':{
     if(!Array.isArray(v)&&!(ArrayBuffer.isView(v)&&!(v instanceof DataView)))wireInvalidValue();
     if(v.length>remaining||p.kind==='vector'&&v.length!==t.size)wireInvalidValue();
     add(8);for(let i=0;i<v.length;i++)node(p.element,v[i],d+1);return;
    }
    case 'record':{
     const fs=p.fields;
     if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).length!==fs.length)wireInvalidValue();
     for(let i=0;i<fs.length;i++)if(!wireOwn(v,fs[i].name))wireInvalidValue();
     add(4);if(!fs.length)return;
     for(let i=0;i<fs.length-1;i++)node(fs[i].plan,v[fs[i].name],d+1);
     const f=fs[fs.length-1];p=f.plan;v=v[f.name];d++;continue;
    }
    case 'option':{
     if(wireTagged(v,'None')&&v.None===null){add(5);return;}
     if(!wireTagged(v,'Some'))wireInvalidValue();add(5);p=p.element;v=v.Some;d++;continue;
    }
    case 'result':{
     if(wireTagged(v,'Ok')){add(5);p=p.ok;v=v.Ok;}
     else if(wireTagged(v,'Err')){add(5);p=p.error;v=v.Err;}else wireInvalidValue();
     d++;continue;
    }
    default:throw Error('unsupported wire kind');
   }
  }
 };
 node(root,value,0);if(total>l.bytes)throw Error('wire byte limit');
}
// A single cursor replaces per-node child closures and {end,value} temporaries.
// Projection filters limit callback materialisation, never schema validation.
function wireScanValue(root,bytes,view,l,materialize,visitor,selected,spans){
 let cursor=40,remaining=l.nodes;
 const property={value:null,enumerable:true,writable:true,configurable:true};
 const node=(p,parentEnd,d)=>{
  if(d>l.depth||--remaining<0||cursor+4>parentEnd)throw Error('wire node, depth or length limit');
  const t=p.type,start=cursor+4,end=start+view.getUint32(cursor,true);if(end>parentEnd)throw Error('truncated wire frame');cursor=start;let value;
  switch(p.kind){
   case 'unit':if(end-start!==0)throw Error('malformed wire scalar');value=null;break;
   case 'bool':if(end-start!==1)throw Error('malformed wire scalar');if(bytes[start]>1)throw Error('invalid wire Bool');value=!!bytes[start];cursor=end;break;
   case 'u32':case 'i32':if(end-start!==4)throw Error('malformed wire scalar');value=p.kind==='u32'?view.getUint32(start,true):view.getInt32(start,true);cursor=end;break;
   case 'f32':if(end-start!==4)throw Error('malformed wire scalar');if(materialize)value={F32Bits:view.getUint32(start,true)};cursor=end;break;
   case 'f64':if(end-start!==8)throw Error('malformed wire scalar');if(materialize)value={F64Bits:view.getBigUint64(start,true).toString()};cursor=end;break;
   case 'u64':if(end-start!==8)throw Error('malformed wire scalar');if(materialize)value=view.getBigUint64(start,true);cursor=end;break;
   case 'string':case 'int':case 'id':case 'enum':{
    if(p.kind==='string'&&!materialize){let i=start;while(i<end&&bytes[i]<128)i++;if(i<end)wireDecoder.decode(bytes.subarray(start,end));}
    else{const text=wireDecodeText(bytes,start,end);if(p.kind==='int'&&!wireDecimal(text)||p.kind==='id'&&!/^[0-9a-f]{32}$/.test(text)||p.kind==='enum'&&!t.variants.includes(text))throw Error('malformed wire text');if(materialize)value=p.kind==='int'?{Int:text}:text;}
    cursor=end;break;
   }
   case 'list':case 'vector':{
    if(start+4>end)throw Error('wire list count');const n=view.getUint32(start,true);cursor+=4;
    if(n>remaining||n>Math.floor((end-cursor)/4)||p.kind==='vector'&&n!==t.size)throw Error('wire sequence size');
    if(materialize)value=[];for(let i=0;i<n;i++){const child=node(p.element,end,d+1);if(materialize)value.push(child);}break;
   }
   case 'record':{
    const fs=p.fields;
    // Computed literal keys create own data properties even for __proto__ or
    // prototype setters. Common small records need no descriptor allocations.
    if(materialize&&fs.length<=4){
     switch(fs.length){case 0:value={};break;case 1:value={[fs[0].name]:node(fs[0].plan,end,d+1)};break;case 2:value={[fs[0].name]:node(fs[0].plan,end,d+1),[fs[1].name]:node(fs[1].plan,end,d+1)};break;case 3:value={[fs[0].name]:node(fs[0].plan,end,d+1),[fs[1].name]:node(fs[1].plan,end,d+1),[fs[2].name]:node(fs[2].plan,end,d+1)};break;case 4:value={[fs[0].name]:node(fs[0].plan,end,d+1),[fs[1].name]:node(fs[1].plan,end,d+1),[fs[2].name]:node(fs[2].plan,end,d+1),[fs[3].name]:node(fs[3].plan,end,d+1)};break;}
    }else{if(materialize)value={};for(const f of fs){const child=node(f.plan,end,d+1);if(materialize){property.value=child;Object.defineProperty(value,f.name,property);}}}break;
   }
   case 'option':case 'result':{
    if(start===end||bytes[cursor]>1)throw Error('wire sum tag');const tag=bytes[cursor++];
    if(p.kind==='option'&&tag===0){if(materialize)value={None:null};}
    else{const label=p.kind==='option'?'Some':tag===0?'Ok':'Err',child=node(p.kind==='option'?p.element:tag===0?p.ok:p.error,end,d+1);if(materialize)value={[label]:child};}break;
   }
   default:throw Error('unsupported wire kind');
  }
  if(cursor!==end)throw Error('trailing wire frame bytes');
  if(visitor&&(!selected||selected.has(t.name))){if(spans)visitor(t,bytes,start,end,d);else visitor(t,bytes.subarray(start,end),d);}
  return value;
 };
 const result=node(root,bytes.length,0);if(cursor!==bytes.length)throw Error('trailing wire bytes');return result;
}
export class ValueCodec{
 #hash;
 #header;
 #headerWords;
 #descriptor;
 #valuePlan;
 #compactCodec;
 #encoder;
 #decodeBound=0;
 #scanPlan=null;
 #capturePlan=null;
 #copyPlan=null;
 get descriptor(){return this.#descriptor;}
 constructor(descriptor){
  // This synchronous path is for compiler-generated immutable metadata. For
  // untrusted descriptors use createValueCodec and compare the computed identity.
  if(descriptor?.format!==valueWireFormat||!/^[0-9a-f]{64}$/.test(descriptor.identity))throw Error('invalid wire schema');
  this.#descriptor=structuredClone(descriptor);this.#hash=Uint8Array.from(descriptor.identity.match(/../g),s=>parseInt(s,16));
  this.#header=new Uint8Array(40);this.#header.set(wireMagic);this.#header.set(this.#hash,8);
  const headerView=new DataView(this.#header.buffer);this.#headerWords=Array.from({length:10},(_,i)=>headerView.getUint32(i*4,true));
  const freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}};freeze(this.descriptor);this.#valuePlan=wireValuePlan(this);
 }
 resolve(t){for(let i=0;i<64;i++){if(t.kind!=='ref')return t;t=this.descriptor.named[t.name];if(!t)throw Error('wire reference');}throw Error('wire reference cycle');}
 validateValue(value,options=wireDefaultOptions){wireCheckValue(this.#valuePlan,value,wireLimits(options));return true;}
 capture(value,options=wireDefaultOptions){const limits=wireLimits(options);this.#capturePlan??=wireCapturePlan(this.#valuePlan);return this.#capturePlan.capture(value,new WireCaptureCursor(limits),0);}
 copy(value,options=wireDefaultOptions){const limits=wireLimits(options);this.#copyPlan??=wireCapturePlan(this.#valuePlan,false);return this.#copyPlan.capture(value,new WireCaptureCursor(limits),0);}
 compact(){return this.#compactCodec??=new CompactValueCodec(this);}
 encode(value,options=wireDefaultOptions){
  const l=wireLimits(options),w=this.#encoder&&!this.#encoder.active?this.#encoder:new WireEncoder(l);
  this.#encoder??=w;w.reset(l);
  try{w.bytes(this.#header);wireEncodeValue(this.#valuePlan,value,l,w);return w.finish();}
  finally{w.active=false;if(w.capacity>4096&&this.#encoder===w)this.#encoder=undefined;}
 }
 encodeWith(emit,options=wireDefaultOptions){
  const w=new WireEncoder(options);w.bytes(wireMagic);w.bytes(this.#hash);emit(w);const bytes=w.finish();this.validate(bytes,options);return bytes;
 }
 scan(bytes,options=wireDefaultOptions,materialize=false,visitor=null,names=null,spans=false){
  const l=wireLimits(options);if(!(bytes instanceof Uint8Array)||typeof SharedArrayBuffer==='function'&&bytes.buffer instanceof SharedArrayBuffer||bytes.length<44||bytes.length>l.bytes)throw Error('wire byte limit or header');
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  for(let i=0;i<10;i++)if(view.getUint32(i*4,true)!==this.#headerWords[i])throw Error('wire format or schema mismatch');
  if(names!==null&&(!Array.isArray(names)||names.length>100000||names.some(n=>typeof n!=='string')))throw Error('wire visitor names');
  if(materialize&&!visitor){this.#decodeBound||=wireBindDecodePlan(this.#valuePlan);const cursor=new WireDecodeCursor(bytes,view,l);if(this.#decodeBound&1)cursor.property={value:null,enumerable:true,writable:true,configurable:true};const value=this.#valuePlan.decode(cursor,bytes.length,0);if(cursor.cursor!==bytes.length)throw Error('trailing wire bytes');return value;}
  if(!materialize){this.#scanPlan??=wireScanPlan(this.#valuePlan);const cursor=new WireScanCursor(bytes,view,l,visitor,names===null?null:new Set(names),spans),value=this.#scanPlan.scan(cursor,bytes.length,0);if(cursor.cursor!==bytes.length)throw Error('trailing wire bytes');return value;}
  return wireScanValue(this.#valuePlan,bytes,view,l,materialize,visitor,names===null?null:new Set(names),spans);
 }
 visit(bytes,visitor,options=wireDefaultOptions,names=null){if(typeof visitor!=='function')throw Error('wire visitor required');this.scan(bytes,options,false,visitor,names);}
 visitSpans(bytes,visitor,options=wireDefaultOptions,names=null){if(typeof visitor!=='function')throw Error('wire visitor required');this.scan(bytes,options,false,visitor,names,true);}
 validate(bytes,options=wireDefaultOptions){this.scan(bytes,options,false);return true;}
 decode(bytes,options=wireDefaultOptions){return this.scan(bytes,options,true);}
}

// Bounded forward emission avoids building and repeatedly joining child buffers.
class WireEncoder{
 #data=new Uint8Array(256);#view=new DataView(this.#data.buffer);#at=0;#remaining;#depth=0;#byteLimit;#depthLimit;
 active=false;
 constructor(options){this.reset(options);}
 reset(options){const limits=wireLimits(options);this.#byteLimit=limits.bytes;this.#depthLimit=limits.depth;this.#remaining=limits.nodes;this.#depth=0;this.#at=0;this.active=true;}
 get capacity(){return this.#data.length;}
 get position(){return this.#at;}
 beginNode(){const at=this.#at;this.word(0);return at;}
 endNode(at){this.patchWord(at,this.#at-at-4);}
 count(n){this.word(n);}
 beginCount(){const at=this.position;this.count(0);return at;}
 endCount(at,n){this.patchWord(at,n);}
 #reserve(size){
  const end=this.#at+size;if(end>this.#byteLimit)throw Error('wire byte limit');
  if(end>this.#data.length){const next=new Uint8Array(Math.min(this.#byteLimit,Math.max(end,this.#data.length*2)));next.set(this.#data.subarray(0,this.#at));this.#data=next;this.#view=new DataView(next.buffer);}
  return end;
 }
 bytes(bytes){const end=this.#reserve(bytes.length);this.#data.set(bytes,this.#at);this.#at=end;}
 byte(n){if(!Number.isInteger(n)||n<0||n>255)throw Error('wire byte range');this.#reserve(1);this.#data[this.#at++]=n;}
 word(n){if(!Number.isInteger(n)||n<0||n>4294967295)throw Error('wire word range');const end=this.#reserve(4);this.#view.setUint32(this.#at,n,true);this.#at=end;}
 wide(n){if(typeof n!=='bigint'||n<0n||n>18446744073709551615n)throw Error('wire wide range');const end=this.#reserve(8);this.#view.setBigUint64(this.#at,n,true);this.#at=end;}
 text(text,count=false){
  if(typeof text!=='string')throw Error('wire Unicode');
  if(text.length<=16){
   let ascii=true;for(let i=0;i<text.length;i++)if(text.charCodeAt(i)>=128){ascii=false;break;}
   if(ascii){if(count)this.count(text.length);const end=this.#reserve(text.length);for(let i=0;i<text.length;i++)this.#data[this.#at+i]=text.charCodeAt(i);this.#at=end;return;}
  }
  if(!text.isWellFormed())throw Error('wire Unicode');const size=wireUtf8Length(text);if(count)this.count(size);
  const end=this.#reserve(size),r=wireEncoder.encodeInto(text,this.#data.subarray(this.#at,end));if(r.read!==text.length||r.written!==size)throw Error('wire UTF-8 size');this.#at=end;
 }
 patchWord(at,n){if(!Number.isInteger(at)||at<0||at+4>this.#at||!Number.isInteger(n)||n<0||n>4294967295)throw Error('wire patch offset');this.#view.setUint32(at,n,true);}
 patchByte(at,n){if(!Number.isInteger(at)||at<0||at>=this.#at||!Number.isInteger(n)||n<0||n>255)throw Error('wire patch offset');this.#data[at]=n;}
 replace(at,removed,bytes){
  if(!Number.isInteger(at)||!Number.isInteger(removed)||at<0||removed<0||at+removed>this.#at||!(bytes instanceof Uint8Array))throw Error('wire replacement range');
  const extra=bytes.length-removed,end=extra>0?this.#reserve(extra):this.#at+extra;
  this.#data.copyWithin(at+bytes.length,at+removed,this.#at);this.#data.set(bytes,at);this.#at=end;
 }
 // Literal generated writers use balanced frames without per-node callbacks.
 // An exception abandons this invocation; encodeWith never reuses its writer.
 openFrame(){if(this.#depth>this.#depthLimit||--this.#remaining<0)throw Error('wire node or depth limit');const at=this.beginNode();this.#depth++;return at;}
 closeFrame(at){if(this.#depth===0)throw Error('wire frame boundary');this.#depth--;this.endNode(at);}
 frame(emit){if(this.#depth>this.#depthLimit||--this.#remaining<0)throw Error('wire node or depth limit');const at=this.beginNode();this.#depth++;try{emit(this);}finally{this.#depth--;}this.endNode(at);}
 reorder(start,spans){
  const sorted=spans.slice().sort((a,b)=>a[0]-b[0]);let at=start;
  for(const [a,b] of sorted){if(!Number.isInteger(a)||!Number.isInteger(b)||a!==at||b<a)throw Error('wire span permutation');at=b;}
  if(start<0||start>this.#at||at!==this.#at)throw Error('wire span permutation');
  if(spans.every((s,i)=>s===sorted[i]))return;
  const copy=this.#data.slice(start,this.#at);at=start;for(const [a,b] of spans){this.#data.set(copy.subarray(a-start,b-start),at);at+=b-a;}
 }
 finish(){if(this.#depth!==0)throw Error('wire frame boundary');return this.#data.slice(0,this.#at);}
}

class CompactWireEncoder extends WireEncoder{
 beginNode(){return 0;}
 endNode(){}
 endCount(at,n){
  if(!Number.isInteger(n)||n<0||n>4294967295)throw Error('compact count range');
  if(n<128){this.patchByte(at,n);return;}
  const bytes=[];while(n>=128){bytes.push(n%128+128);n=Math.floor(n/128);}bytes.push(n);this.replace(at,1,Uint8Array.from(bytes));
 }
 count(n){
  if(!Number.isInteger(n)||n<0||n>4294967295)throw Error('compact count range');
  while(n>=128){this.byte(n%128+128);n=Math.floor(n/128);}this.byte(n);
 }
 text(text){super.text(text,true);}
}

function compactScanValue(root,bytes,l,materialize){
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let cursor=1,remaining=l.nodes;
 const require=n=>{if(n>bytes.length-cursor)throw Error('truncated compact value');};
 const count=()=>{
  let value=0,scale=1;
  for(let i=0;i<5;i++){
   require(1);const byte=bytes[cursor++];
   if(i===4&&byte>15)throw Error('compact count overflow');
   value+=(byte&127)*scale;
   if(byte<128){if(i>0&&byte===0)throw Error('noncanonical compact count');return value;}
   scale*=128;
  }throw Error('compact count overflow');
 };
 const property={value:null,enumerable:true,writable:true,configurable:true};
 const node=(p,d)=>{
  if(d>l.depth||--remaining<0)throw Error('wire node or depth limit');
  const t=p.type;let value;
  switch(p.kind){
   case 'unit':return null;
   case 'bool':require(1);if(bytes[cursor]>1)throw Error('invalid wire Bool');return !!bytes[cursor++];
   case 'u32':case 'i32':require(4);value=p.kind==='u32'?view.getUint32(cursor,true):view.getInt32(cursor,true);cursor+=4;return value;
   case 'f32':require(4);if(materialize)value={F32Bits:view.getUint32(cursor,true)};cursor+=4;return value;
   case 'f64':require(8);if(materialize)value={F64Bits:view.getBigUint64(cursor,true).toString()};cursor+=8;return value;
   case 'u64':require(8);if(materialize)value=view.getBigUint64(cursor,true);cursor+=8;return value;
   case 'string':case 'int':case 'id':case 'enum':{
    const n=count();require(n);const start=cursor;cursor+=n;
    if(p.kind==='string'&&!materialize){let i=start;while(i<cursor&&bytes[i]<128)i++;if(i<cursor)wireDecoder.decode(bytes.subarray(start,cursor));}
    else{const text=wireDecodeText(bytes,start,cursor);if(p.kind==='int'&&!wireDecimal(text)||p.kind==='id'&&!/^[0-9a-f]{32}$/.test(text)||p.kind==='enum'&&!t.variants.includes(text))throw Error('malformed wire text');if(materialize)value=p.kind==='int'?{Int:text}:text;}
    return value;
   }
   case 'list':case 'vector':{
    const n=count();if(n>remaining||p.kind==='vector'&&n!==t.size)throw Error('wire sequence size');
    if(materialize)value=[];for(let i=0;i<n;i++){const child=node(p.element,d+1);if(materialize)value.push(child);}return value;
   }
   case 'record':{
    const fs=p.fields;
    if(materialize&&fs.length<=4){
     switch(fs.length){case 0:return {};case 1:return {[fs[0].name]:node(fs[0].plan,d+1)};case 2:return {[fs[0].name]:node(fs[0].plan,d+1),[fs[1].name]:node(fs[1].plan,d+1)};case 3:return {[fs[0].name]:node(fs[0].plan,d+1),[fs[1].name]:node(fs[1].plan,d+1),[fs[2].name]:node(fs[2].plan,d+1)};case 4:return {[fs[0].name]:node(fs[0].plan,d+1),[fs[1].name]:node(fs[1].plan,d+1),[fs[2].name]:node(fs[2].plan,d+1),[fs[3].name]:node(fs[3].plan,d+1)};}
    }
    if(materialize)value={};for(const f of fs){const child=node(f.plan,d+1);if(materialize){property.value=child;Object.defineProperty(value,f.name,property);}}return value;
   }
   case 'option':case 'result':{
    require(1);const tag=bytes[cursor++];if(tag>1)throw Error('wire sum tag');
    if(p.kind==='option'&&tag===0)return materialize?{None:null}:undefined;
    const label=p.kind==='option'?'Some':tag===0?'Ok':'Err',child=node(p.kind==='option'?p.element:tag===0?p.ok:p.error,d+1);
    return materialize?{[label]:child}:undefined;
   }
   default:throw Error('unsupported wire kind');
  }
 };
 const value=node(root,0);if(cursor!==bytes.length)throw Error('trailing compact bytes');return value;
}

// General transport codec, independent of source rewrites and checkpoints.
// The sender/receiver must negotiate this exact identity and format. There is
// deliberately no claim that the bytes themselves identify their schema.
export class CompactValueCodec{
 #source;#plan;#encoder;#decodeBound=0;
 get format(){return compactValueWireFormat;}
 get identity(){return this.#source.descriptor.identity;}
 constructor(valueCodec){if(!(valueCodec instanceof ValueCodec))throw Error('compact codec requires a checked value codec');this.#source=valueCodec;this.#plan=wireValuePlan(valueCodec);}
 encode(value,options=wireDefaultOptions){
  const l=wireLimits(options),w=this.#encoder&&!this.#encoder.active?this.#encoder:new CompactWireEncoder(l);
  this.#encoder??=w;w.reset(l);
  try{w.byte(1);wireEncodeValue(this.#plan,value,l,w);return w.finish();}
  finally{w.active=false;if(w.capacity>4096&&this.#encoder===w)this.#encoder=undefined;}
 }
 encodeWith(emit,options=wireDefaultOptions){
  const w=new CompactWireEncoder(options);w.byte(1);emit(w);const bytes=w.finish();this.validate(bytes,options);return bytes;
 }
 #scan(bytes,options,materialize){
  const l=wireLimits(options);
  if(!(bytes instanceof Uint8Array)||typeof SharedArrayBuffer==='function'&&bytes.buffer instanceof SharedArrayBuffer||bytes.length<1||bytes.length>l.bytes)throw Error('wire byte limit or header');
  if(bytes[0]!==1)throw Error('compact format mismatch');
  if(materialize){this.#decodeBound||=wireBindDecodePlan(this.#plan,true);const cursor=new CompactDecodeCursor(bytes,l,this.#decodeBound);if(this.#decodeBound&1)cursor.property={value:null,enumerable:true,writable:true,configurable:true};const value=this.#plan.decodeCompact(cursor,0);if(cursor.cursor!==bytes.length)throw Error('trailing compact bytes');return value;}
  return compactScanValue(this.#plan,bytes,l,materialize);
 }
 decode(bytes,options=wireDefaultOptions){return this.#scan(bytes,options,true);}
 validate(bytes,options=wireDefaultOptions){this.#scan(bytes,options,false);return true;}
}

// Compiler materialisers consume already validated bytes synchronously. This
// factory is for trusted emitted code, not untrusted descriptor/callback data.
// The complete generic validator runs before any compiler reader is invoked.
class ValidatedValueReader{
 constructor(bytes,compact){this.bytes=bytes;this.view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);this.cursor=compact?1:40;this.compact=compact;}
 frame(){if(this.compact)return 0;const end=this.cursor+4+this.view.getUint32(this.cursor,true);this.cursor+=4;return end;}
 finish(end){if(!this.compact&&this.cursor!==end)throw Error('compiled reader frame mismatch');}
 byte(){return this.bytes[this.cursor++];}
 word(){const n=this.view.getUint32(this.cursor,true);this.cursor+=4;return n;}
 signed(){const n=this.view.getInt32(this.cursor,true);this.cursor+=4;return n;}
 wide(){const n=this.view.getBigUint64(this.cursor,true);this.cursor+=8;return n;}
 count(){if(!this.compact)return this.word();let n=0,scale=1,byte;do{byte=this.byte();n+=(byte&127)*scale;scale*=128;}while(byte>=128);return n;}
 text(end){const n=this.compact?this.count():end-this.cursor,start=this.cursor;this.cursor+=n;return wireDecodeText(this.bytes,start,this.cursor);}
}
class CompiledCompactValueCodec extends CompactValueCodec{
 #read;
 constructor(source,read){super(source);this.#read=read;}
 decode(bytes,options=wireDefaultOptions){super.validate(bytes,options);const reader=new ValidatedValueReader(bytes,true),value=this.#read(reader);if(reader.cursor!==bytes.length)throw Error('compiled reader trailing bytes');return value;}
}
class CompiledValueCodec extends ValueCodec{
 #read;#compiledCompact=null;
 constructor(descriptor,read){super(descriptor);this.#read=read;}
 decode(bytes,options=wireDefaultOptions){super.validate(bytes,options);const reader=new ValidatedValueReader(bytes,false),value=this.#read(reader);if(reader.cursor!==bytes.length)throw Error('compiled reader trailing bytes');return value;}
 compact(){return this.#compiledCompact??=new CompiledCompactValueCodec(this,this.#read);}
}
export function createCompiledValueCodec(descriptor,read){if(typeof read!=='function')throw Error('compiled value reader required');return new CompiledValueCodec(descriptor,read);}

// Trusted literal materialisers may use this checked reader to validate and
// construct in one traversal. The emitter must use frame/finish at every source
// node, typed text reads and counted sequence reads; arbitrary callbacks do not
// establish a schema correspondence proof. The independent scanner remains the
// validation oracle and the original factory retains its pre-validation path.
function literalValueHeader(identity){
 const bytes=new Uint8Array(40);bytes.set(wireMagic);
 for(let i=0;i<32;i++)bytes[i+8]=parseInt(identity.slice(i*2,i*2+2),16);
 const view=new DataView(bytes.buffer),words=new Uint32Array(10);
 for(let i=0;i<10;i++)words[i]=view.getUint32(i*4,true);
 return words;
}
class CheckedLiteralValueReader {
 constructor(bytes,header,compact,limits){
  if(!(bytes instanceof Uint8Array)||typeof SharedArrayBuffer==='function'&&bytes.buffer instanceof SharedArrayBuffer||bytes.length<(compact?1:44)||bytes.length>limits.bytes)throw Error('wire byte limit or header');
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  if(compact){if(bytes[0]!==1)throw Error('compact format mismatch');}
  else for(let i=0;i<10;i++)if(view.getUint32(i*4,true)!==header[i])throw Error('wire format or schema mismatch');
  this.bytes=bytes;this.view=view;
  this.cursor=compact?1:40;this.compact=compact;this.remaining=limits.nodes;this.depth=limits.depth;this.ends=[];
 }
 require(n){if(this.cursor+n>(this.ends.at(-1)??this.bytes.length))throw Error('truncated wire frame');}
 frame(){
  if(this.ends.length>this.depth||--this.remaining<0)throw Error('wire node or depth limit');
  let end=this.bytes.length;
  if(!this.compact){this.require(4);end=this.cursor+4+this.view.getUint32(this.cursor,true);this.require(end-this.cursor);this.cursor+=4;}
  this.ends.push(end);return this.compact?0:end;
 }
 finish(end){
  if(!this.ends.length||!this.compact&&(this.ends.at(-1)!==end||this.cursor!==end))throw Error('compiled reader frame mismatch');
  this.ends.pop();
 }
 byte(){this.require(1);const value=this.bytes[this.cursor++];if(value>1)throw Error('wire sum tag or Bool');return value;}
 word(){this.require(4);const value=this.view.getUint32(this.cursor,true);this.cursor+=4;return value;}
 signed(){this.require(4);const value=this.view.getInt32(this.cursor,true);this.cursor+=4;return value;}
 wide(){this.require(8);const value=this.view.getBigUint64(this.cursor,true);this.cursor+=8;return value;}
 rawCount(){
  if(!this.compact)return this.word();
  let value=0,scale=1;
  for(let i=0;i<5;i++){
   this.require(1);const byte=this.bytes[this.cursor++];
   if(i===4&&byte>15)throw Error('compact count overflow');
   value+=(byte&127)*scale;
   if(byte<128){if(i>0&&byte===0)throw Error('noncanonical compact count');return value;}
   scale*=128;
  }
  throw Error('compact count overflow');
 }
 count(size){
  const value=this.rawCount();
  if(value>this.remaining||size!==undefined&&value!==size)throw Error('wire sequence size');
  return value;
 }
 text(end,kind='string',variants){
  const size=this.compact?this.rawCount():end-this.cursor;
  this.require(size);const start=this.cursor;this.cursor+=size;
  const value=wireDecodeText(this.bytes,start,this.cursor);
  if(kind==='int'&&!wireDecimal(value)||kind==='id'&&!/^[0-9a-f]{32}$/.test(value)||kind==='enum'&&!variants.includes(value))throw Error('malformed wire text');
  return value;
 }
 complete(){if(this.ends.length||this.cursor!==this.bytes.length)throw Error('compiled reader trailing bytes');}
}
// Compact source nodes have no individual frame ends: retain the same checked
// depth/node order using a counter, with bounds against the complete buffer.
class CheckedCompactLiteralValueReader extends CheckedLiteralValueReader {
 constructor(bytes,limits){super(bytes,null,true,limits);this.level=0;}
 require(n){if(this.cursor+n>this.bytes.length)throw Error('truncated wire frame');}
 frame(){if(this.level>this.depth||--this.remaining<0)throw Error('wire node or depth limit');this.level++;return 0;}
 finish(_end){if(!this.level)throw Error('compiled reader frame mismatch');this.level--;}
 complete(){if(this.level||this.cursor!==this.bytes.length)throw Error('compiled reader trailing bytes');}
}
class FusedCompactValueCodec extends CompactValueCodec {
 #read;
 constructor(source,read){super(source);this.#read=read;}
 decode(bytes,options=wireDefaultOptions){
  const limits=wireLimits(options);
  try{const reader=new CheckedCompactLiteralValueReader(bytes,limits),value=this.#read(reader);reader.complete();return value;}
  catch(error){super.validate(bytes,limits);throw error;}
 }
}
class FusedValueCodec extends ValueCodec {
 #read;#header;#fusedCompact=null;
 constructor(descriptor,read){super(descriptor);this.#read=read;this.#header=literalValueHeader(this.descriptor.identity);}
 decode(bytes,options=wireDefaultOptions){
  const limits=wireLimits(options);
  try{const reader=new CheckedLiteralValueReader(bytes,this.#header,false,limits),value=this.#read(reader);reader.complete();return value;}
  catch(error){super.validate(bytes,limits);throw error;}
 }
 compact(){return this.#fusedCompact??=new FusedCompactValueCodec(this,this.#read);}
}
export function createFusedValueCodec(descriptor,read){if(typeof read!=='function')throw Error('compiled value reader required');return new FusedValueCodec(descriptor,read);}
// JSON text is a boundary adapter to an ordinary recursive Ink datatype.
// No JavaScript Number conversion occurs for JSON numeric tokens.
export function jsonNumberToken(s){return typeof s==='string'&&/^-?(0|[1-9][0-9]*)(\.[0-9]+)?([eE][+-]?[0-9]+)?$/.test(s);}
// JSON numeric tokens have an ASCII grammar. Check validated UTF-8 spans
// directly, preserving exact lexemes without allocating a decoded String.
function jsonNumberSpan(bytes,lo,hi){
 let at=lo;if(bytes[at]===45)at++;
 if(at>=hi)return false;
 if(bytes[at]===48)at++;
 else{if(bytes[at]<49||bytes[at]>57)return false;do{at++;}while(at<hi&&bytes[at]>=48&&bytes[at]<=57);}
 if(at<hi&&bytes[at]===46){const start=++at;while(at<hi&&bytes[at]>=48&&bytes[at]<=57)at++;if(at===start)return false;}
 if(at<hi&&(bytes[at]===69||bytes[at]===101)){at++;if(at<hi&&(bytes[at]===43||bytes[at]===45))at++;const start=at;while(at<hi&&bytes[at]>=48&&bytes[at]<=57)at++;if(at===start)return false;}
 return at===hi;
}
const jsonWireEncoder=new TextEncoder();
// Scalar conversion completes before writer callbacks; no per-value byte array.
const jsonFloatScratch=new DataView(new ArrayBuffer(4));
function jsonUtf8Length(text){if(text.length>16&&!/[^\x00-\x7f]/.test(text))return text.length;let bytes=0;for(let i=0;i<text.length;i++){const c=text.charCodeAt(i);if(c<128)bytes++;else if(c<2048)bytes+=2;else if(c>=0xd800&&c<=0xdbff){bytes+=4;i++;}else bytes+=3;}return bytes;}
const jsonLimits={bytes:16777216,nodes:1000000,depth:128};
const jsonQuoters=new WeakSet();
/** Explicit, bounded reuse of immutable JSON string quotes. Cache payload bytes
 * are UTF-16 storage estimates; entry caps bound separate Map/object overhead.
 * Logical output budgets are charged again on every use, including cache hits.
 */
export function createJsonQuoter({maxEntries=1024,maxBytes=131072}={}){
 if(!Number.isSafeInteger(maxEntries)||maxEntries<0||maxEntries>65536||!Number.isSafeInteger(maxBytes)||maxBytes<0||maxBytes>16777216)throw Error('JSON quote cache budget');
 const entries=new Map();let bytes=0,hits=0,misses=0;
 const token=value=>{
  const prior=entries.get(value);if(prior!==undefined){hits++;return prior;}
  if(typeof value!=='string'||!value.isWellFormed())throw Error('invalid JSON String');
  misses++;const text=JSON.stringify(value),size=2*(value.length+text.length),quoted=Object.freeze({text,utf8Bytes:jsonUtf8Length(text)});
  if(maxEntries&&size<=maxBytes){
   while(entries.size&&(entries.size>=maxEntries||bytes+size>maxBytes)){const key=entries.keys().next().value;bytes-=2*(key.length+entries.get(key).text.length);entries.delete(key);}
   entries.set(value,quoted);bytes+=size;
  }
  return quoted;
 };
 const quoter=Object.freeze({
  token,
  quote(value){return token(value).text;},
  clear(){entries.clear();bytes=0;},
  stats(){return {entries:entries.size,payload_bytes:bytes,hits,misses};},
 });jsonQuoters.add(quoter);return quoter;
}
function checkedJsonLimits(options){const l={...jsonLimits,...options};for(const k of ['bytes','nodes','depth'])if(!Number.isSafeInteger(l[k])||l[k]<0||l[k]>jsonLimits[k])throw Error('JSON hard resource limit');return l;}
function jsonVariant(index,item){let payload=index===0?{}:{item0:item};if(index<5)payload={Ok:payload};for(let i=0;i<index;i++)payload={Err:payload};return {payload};}
export function parseJson(text,options={}){return parseJsonValue(text,options,null);}
function parseJsonValue(text,options,boundary){
 const p=new JsonWireReader(text,options);
 const value=(d,wireDepth=0)=>{
  p.node(d);const c=p.peek();
  if(c==='n'&&text.startsWith('null',p.at)){boundary?.node(0,wireDepth);p.at+=4;return jsonVariant(0,null);}if(c==='t'&&text.startsWith('true',p.at)){boundary?.node(1,wireDepth);p.at+=4;return jsonVariant(1,true);}if(c==='f'&&text.startsWith('false',p.at)){boundary?.node(1,wireDepth);p.at+=5;return jsonVariant(1,false);}
  if(c==='"'){boundary?.node(3,wireDepth);const item=p.string();boundary?.text(item);return jsonVariant(3,item);}
  if(c==='['){boundary?.node(4,wireDepth);p.at++;const xs=[];if(!p.eat(']'))while(true){xs.push(value(d+1,wireDepth+8));if(p.eat(']'))break;if(!p.eat(','))throw Error('JSON array separator');}return jsonVariant(4,xs);}
  if(c==='{'){boundary?.node(5,wireDepth);p.at++;const xs=[],seen=new Set();if(!p.eat('}'))while(true){const key=p.string();if(seen.has(key))throw Error('duplicate JSON object key');seen.add(key);boundary?.member(key,wireDepth);if(!p.eat(':'))throw Error('JSON object colon');xs.push({key,value:value(d+1,wireDepth+9)});if(p.eat('}'))break;if(!p.eat(','))throw Error('JSON object separator');}return jsonVariant(5,xs);}
  if(c==='-'||c>='0'&&c<='9'){const token=p.number();boundary?.node(2,wireDepth);boundary?.text(token);return jsonVariant(2,token);}
  throw Error('invalid JSON value');
 };
 const out=value(0);p.finish();return out;
}
export function stringifyJson(value,options={}){return stringifyJsonValue(value,options,null);}
function stringifyJsonValue(value,options,boundary){
 const l=checkedJsonLimits(options);let remaining=l.nodes,bytes=0,output='';
 const emit=s=>{bytes+=jsonUtf8Length(s);if(bytes>l.bytes)throw Error('JSON byte limit');output+=s;};
 const write=(v,d,wireDepth=0)=>{
  if(d>l.depth||--remaining<0)throw Error('JSON node or depth limit');if(!v||Object.keys(v).length!==1||!Object.hasOwn(v,'payload'))throw Error('invalid JSON record');let p=v.payload,index=0;
  while(index<5&&p&&Object.hasOwn(p,'Err')){if(Object.keys(p).length!==1||boundary&&Object.hasOwn(p,'Ok'))throw Error('invalid JSON sum');p=p.Err;index++;}
  if(index<5){if(!p||Object.keys(p).length!==1||!Object.hasOwn(p,'Ok'))throw Error('invalid JSON sum');p=p.Ok;}
  if(!p||Object.keys(p).length!==(index===0?0:1)||index>0&&!Object.hasOwn(p,'item0'))throw Error('invalid JSON payload');const item=p.item0;boundary?.node(index,wireDepth);
  switch(index){
   case 0:emit('null');break;
   case 1:if(typeof item!=='boolean')throw Error('invalid JSON Boolean');emit(item?'true':'false');break;
   case 2:if(!jsonNumberToken(item))throw Error('invalid JSON number');boundary?.text(item);emit(item);break;
   case 3:if(typeof item!=='string'||!item.isWellFormed())throw Error('invalid JSON String');boundary?.text(item);emit(JSON.stringify(item));break;
   case 4:{if(!Array.isArray(item)||item.length>remaining)throw Error('invalid JSON Array');const count=item.length;let visited=0;emit('[');item.forEach((x,i)=>{visited++;if(i)emit(',');write(x,d+1,wireDepth+8);});if(visited!==count)throw Error('invalid JSON Array');emit(']');break;}
   case 5:{if(!Array.isArray(item)||item.length>remaining)throw Error('invalid JSON Object');const count=item.length,seen=new Set();let visited=0;emit('{');item.forEach((m,i)=>{visited++;if(!m||Object.keys(m).length!==2||typeof m.key!=='string'||!m.key.isWellFormed()||!Object.hasOwn(m,'value')||boundary&&!Object.hasOwn(m,'key'))throw Error('invalid JSON member');if(seen.has(m.key))throw Error('duplicate JSON object key');seen.add(m.key);boundary?.member(m.key,wireDepth);if(i)emit(',');emit(JSON.stringify(m.key));emit(':');write(m.value,d+1,wireDepth+9);});if(visited!==count)throw Error('invalid JSON Object');emit('}');break;}
  }
 };write(value,0);return output;
}
// The adapter's schema is the fixed recursive JSON library shape checked by
// JsonCodec. Charge its ordinary record/sum/list wire nodes while parsing or
// rendering, rather than interpreting and walking the completed tree again.
function jsonBoundaryBudget(options){
 const l=checkedJsonLimits(options);let remaining=l.nodes,total=40;
 const charge=(nodes,bytes,depth)=>{remaining-=nodes;total+=bytes;if(remaining<0||depth>l.depth)throw Error('wire node or depth limit');if(total>l.bytes)throw Error('wire byte limit');};
 return {
  node(index,depth){charge(index===0?3:index<4?index+4:8,index===0?13:index===1?23:index===2?27:index===3?32:41,depth+(index===0?2:index<4?index+3:7));},
  text(text){charge(0,jsonUtf8Length(text),0);},
  member(key,depth){charge(2,8+jsonUtf8Length(key),depth+9);},
 };
}
function jsonSameSchema(a,b){
 if(a===b)return true;if(!a||!b||typeof a!=='object'||typeof b!=='object'||Array.isArray(a)!==Array.isArray(b))return false;
 const keys=Object.keys(a);return keys.length===Object.keys(b).length&&keys.every(k=>Object.hasOwn(b,k)&&jsonSameSchema(a[k],b[k]));
}
// Host-object conversion is opt-in and JavaScript-only. Inspect data properties
// rather than invoking getters/toJSON; reflection is not a sandbox for proxies.
function jsonJSKeys(value){
 if(!value||typeof value!=='object')throw Error('expected a plain JavaScript object');
 const prototype=Object.getPrototypeOf(value);
 if(prototype!==Object.prototype&&prototype!==null)throw Error('expected a plain JavaScript object');
 const keys=Reflect.ownKeys(value);
 if(keys.some(k=>typeof k!=='string'))throw Error('JavaScript symbol keys are unsupported');
 return keys;
}
function jsonJSData(value,key){
 const property=Object.getOwnPropertyDescriptor(value,key);
 if(!property||!property.enumerable||!Object.hasOwn(property,'value'))throw Error('expected an enumerable own data property');
 return property.value;
}
function jsonJSRecord(value,names){
 const keys=jsonJSKeys(value);
 if(keys.length!==names.length||keys.some(k=>!names.includes(k)))throw Error('invalid JSON record or variant');
}
function jsonJSArray(value,remaining){
 if(!Array.isArray(value)||Object.getPrototypeOf(value)!==Array.prototype)throw Error('expected a plain JavaScript array');
 const length=value.length;
 if(length>remaining)throw Error('JSON node limit');
 const keys=Reflect.ownKeys(value);
 if(keys.length!==length+1||keys.some(k=>typeof k!=='string'||k!=='length'&&(!/^(0|[1-9][0-9]*)$/.test(k)||Number(k)>=length)))throw Error('sparse or decorated JavaScript arrays are unsupported');
 return length;
}
function jsonFromJS(value,options){
 const limits=checkedJsonLimits(options),boundary=jsonBoundaryBudget(limits),active=new WeakSet();let remaining=limits.nodes;
 const text=value=>{if(!value.isWellFormed())throw Error('invalid JSON Unicode');boundary.text(value);return value;};
 const visit=(value,depth,wireDepth)=>{
  if(depth>limits.depth||--remaining<0)throw Error('JSON node or depth limit');
  if(value===null){boundary.node(0,wireDepth);return jsonVariant(0);}
  switch(typeof value){
   case 'boolean':boundary.node(1,wireDepth);return jsonVariant(1,value);
   case 'string':boundary.node(3,wireDepth);return jsonVariant(3,text(value));
   case 'number':
    if(!Number.isFinite(value))throw Error('non-finite JavaScript numbers are unsupported');
    boundary.node(2,wireDepth);return jsonVariant(2,text(Object.is(value,-0)?'-0':String(value)));
   case 'bigint':boundary.node(2,wireDepth);return jsonVariant(2,text(String(value)));
   case 'object':break;
   default:throw Error('unsupported JavaScript value');
  }
  if(active.has(value))throw Error('cyclic JavaScript value');
  active.add(value);
  try{
   if(Array.isArray(value)){
    boundary.node(4,wireDepth);const count=jsonJSArray(value,remaining),items=[];
    for(let i=0;i<count;i++)items.push(visit(jsonJSData(value,String(i)),depth+1,wireDepth+8));
    return jsonVariant(4,items);
   }
   boundary.node(5,wireDepth);const keys=jsonJSKeys(value),members=[];
   if(keys.length>remaining)throw Error('JSON node limit');
   for(const key of keys){
    if(!key.isWellFormed())throw Error('invalid JSON Unicode');
    boundary.member(key,wireDepth);
    members.push({key,value:visit(jsonJSData(value,key),depth+1,wireDepth+9)});
   }
   return jsonVariant(5,members);
  }finally{active.delete(value);}
 };
 return visit(value,0,0);
}
function jsonDecimalKey(token){
 const [,sign,whole,fraction='',exponent='0']=/^(-?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(token);
 const digits=(whole+fraction).replace(/^0+/,'');
 if(!digits)return '0';
 const trimmed=digits.replace(/0+$/,'');
 return sign+trimmed+'e'+(Number(exponent)-fraction.length+digits.length-trimmed.length);
}
function jsonToJS(value,options){
 const limits=checkedJsonLimits(options),boundary=jsonBoundaryBudget(limits),mode=options?.numbers??'number',active=new WeakSet();let remaining=limits.nodes;
 if(!['number','bigint','string'].includes(mode))throw Error('unknown JavaScript number policy');
 const number=token=>{
  if(!jsonNumberToken(token))throw Error('invalid JSON number');
  boundary.text(token);
  if(mode==='string')return token;
  if(mode==='bigint')return BigInt(jsonInteger(token,4096));
  const result=Number(token);
  if(!Number.isFinite(result)||jsonDecimalKey(token)!==jsonDecimalKey(String(result)))throw Error('JSON number loses precision as JavaScript Number; choose numbers: bigint or string');
  return result;
 };
 const visit=(value,depth,wireDepth)=>{
  if(depth>limits.depth||--remaining<0)throw Error('JSON node or depth limit');
  jsonJSRecord(value,['payload']);
  if(active.has(value))throw Error('cyclic JSON value');
  active.add(value);
  try{
   let payload=jsonJSData(value,'payload'),index=0;
   while(index<5&&Object.hasOwn(payload,'Err')){jsonJSRecord(payload,['Err']);payload=jsonJSData(payload,'Err');index++;}
   if(index<5){jsonJSRecord(payload,['Ok']);payload=jsonJSData(payload,'Ok');}
   jsonJSRecord(payload,index===0?[]:['item0']);boundary.node(index,wireDepth);
   const item=index===0?null:jsonJSData(payload,'item0');
   if(index===0)return null;
   if(index===1){if(typeof item!=='boolean')throw Error('invalid JSON Boolean');return item;}
   if(index===2)return number(item);
   if(index===3){if(typeof item!=='string'||!item.isWellFormed())throw Error('invalid JSON String');boundary.text(item);return item;}
   const count=jsonJSArray(item,remaining);
   if(index===4){const out=[];for(let i=0;i<count;i++)out.push(visit(jsonJSData(item,String(i)),depth+1,wireDepth+8));return out;}
   const out={},seen=new Set();
   for(let i=0;i<count;i++){
    const member=jsonJSData(item,String(i));jsonJSRecord(member,['key','value']);const key=jsonJSData(member,'key');
    if(typeof key!=='string'||!key.isWellFormed())throw Error('invalid JSON member key');
    if(seen.has(key))throw Error('duplicate JSON object key');seen.add(key);boundary.member(key,wireDepth);
    Object.defineProperty(out,key,{value:visit(jsonJSData(member,'value'),depth+1,wireDepth+9),enumerable:true,writable:true,configurable:true});
   }
   return out;
  }finally{active.delete(value);}
 };
 return visit(value,0,0);
}
const jsonConstructionPaths=Object.freeze(Array.from({length:6},(_,index)=>Object.freeze([0,...Array(index).fill(1),...(index<5?[0]:[]),0])));
function parseJsonConstructed(text,options,builder){
 const p=new JsonWireReader(text,options);
 const paths=jsonConstructionPaths;
 const fused=typeof builder.openPath==='function';
 const begin=index=>{if(fused){builder.openPath(paths[index]);return;}for(const choice of paths[index])builder.open(choice);};
 const end=index=>{for(let i=0;i<(fused?1:index<5?index+3:7);i++)builder.close();};
 const leaf=(index,item)=>{if(typeof builder.scalarPath==='function'){builder.scalarPath(paths[index],item);return;}begin(index);builder.scalar(item);end(index);};
 const value=d=>{
  p.node(d);const c=p.peek();
  if(c==='n'&&text.startsWith('null',p.at)){p.at+=4;if(typeof builder.emptyPath==='function')builder.emptyPath(paths[0]);else{begin(0);end(0);}return;}
  if(c==='t'&&text.startsWith('true',p.at)){p.at+=4;leaf(1,true);return;}
  if(c==='f'&&text.startsWith('false',p.at)){p.at+=5;leaf(1,false);return;}
  if(c==='"'){leaf(3,p.string());return;}
  if(c==='['){begin(4);builder.open(0);p.at++;if(!p.eat(']'))while(true){value(d+1);if(p.eat(']'))break;if(!p.eat(','))throw Error('JSON array separator');}builder.close();end(4);return;}
  if(c==='{'){begin(5);builder.open(0);p.at++;const seen=new Set();if(!p.eat('}'))while(true){const key=p.string();if(seen.has(key))throw Error('duplicate JSON object key');seen.add(key);if(!p.eat(':'))throw Error('JSON object colon');builder.open(0);builder.scalar(key);value(d+1);builder.close();if(p.eat('}'))break;if(!p.eat(','))throw Error('JSON object separator');}builder.close();end(5);return;}
  if(c==='-'||c>='0'&&c<='9'){const token=p.number();leaf(2,token);return;}
  throw Error('invalid JSON value');
 };
 value(0);p.finish();return builder.finish();
}
const jsonCompiledRenderers=new WeakMap();
function compiledJsonRenderer(json,codec,unwrap){
 if(typeof codec?.reducer!=='function')throw Error('compiled JSON reduction unavailable');
 const source=codec.resolve(codec.descriptor.root),root=json.values.descriptor.root;
 const selected=unwrap&&source.kind==='result'?codec.resolve(source.ok):source;
 if(!jsonSameSchema(root,selected)||unwrap&&source.kind!=='result')throw Error('compiled JSON schema mismatch');
 let variants=root.fields[0].type;const roles=new Map([[root.name,'root']]);
 let member;
 for(let index=0;index<6;index++){
  const branch=index<5?variants.ok:variants;roles.set(branch.name,index);
  if(index===5){member=branch.fields[0].type.element.name;roles.set(member,'member');}
  if(index<5)variants=variants.error;
 }
 const nodeRoles=new Map();
 return codec.reducer((node,index)=>{
  const role=roles.get(node.name);nodeRoles.set(index,role);
  if(node.kind==='record'){
   if(role==='root')return value=>value;
   if(role==='member')return (key,value,context)=>{
    const text=(context.quoter?context.quote(key,true):context.add(JSON.stringify(key)+':'))+value,seen=context.members;
    if(seen.has(key))throw Error('duplicate JSON object key');seen.add(key);return text;
   };
   if(role===0)return context=>context.add('null');
   if(role===1)return (value,context)=>context.add(value?'true':'false');
   if(role===2)return (token,context)=>{if(!jsonNumberToken(token))throw Error('invalid JSON number');return context.add(token);};
   if(role===3)return (value,context)=>context.quoter?context.quote(value,false):context.add(JSON.stringify(value));
   if(role===4)return (value,context)=>{context.add('[]');return '['+value+']';};
   if(role===5)return (value,context)=>{context.add('{}');return '{'+value+'}';};
   return ()=>null;
  }
  if(node.kind==='list'||node.kind==='vector'){
   const members=nodeRoles.get(node.children[0])==='member';
   return {
    start:(_length,context)=>{
     const out={text:'',parent:members?context.members:null};
     if(members)context.members=new Set();return out;
    },
    step:(out,value,index,context)=>{out.text+=(index?context.add(','):'')+value;return out;},
    finish:(out,context)=>{if(members)context.members=out.parent;return out.text;},
   };
  }
  if(node.kind==='result'){
   // A Result<Json,E> boundary is explicitly requested by the caller. Ordinary
   // JSON's own sums only propagate an already rendered branch.
   if(unwrap&&nodeRoles.get(node.children[0])==='root')return (tag,value)=>{if(tag)throw Error('JSON result is Err');return value;};
   return (_tag,value)=>value;
  }
  if(node.kind==='string')return value=>{if(!value.isWellFormed())throw Error('invalid JSON String');return value;};
  return value=>value;
 });
}
export class JsonCodec{
 constructor(valueCodec){
  const root=valueCodec.descriptor.root,fields=root.fields;if(root.kind!=='record'||!Array.isArray(fields)||fields.length!==1||fields[0].name!=='payload')throw Error('JSON schema payload');let sum=fields[0].type;
  for(let i=0;i<6;i++){
   if(i<5&&sum.kind!=='result')throw Error('JSON schema sum');const branch=i<5?sum.ok:sum,fs=branch.fields;
   if(branch.kind!=='record'||!Array.isArray(fs)||fs.length!==(i?1:0)||i&&fs[0].name!=='item0')throw Error('JSON schema branch');
   if(i){const t=fs[0].type;if(i===1&&t.kind!=='bool'||(i===2||i===3)&&t.kind!=='string'||i===4&&(t.kind!=='list'||t.element.kind!=='ref'||t.element.name!==root.name))throw Error('JSON schema variant');if(i===5){const mf=t.element?.fields;if(t.kind!=='list'||t.element?.kind!=='record'||!Array.isArray(mf)||mf.length!==2||mf[0].name!=='key'||mf[0].type.kind!=='string'||mf[1].name!=='value'||mf[1].type.kind!=='ref'||mf[1].type.name!==root.name)throw Error('JSON schema member');}}
   if(i===2)this.numberBranch=branch.name;if(i===5)this.objectBranch=branch.name;
   if(i<5)sum=sum.error;
  }if(!jsonSameSchema(root,valueCodec.resolve({kind:'ref',name:root.name})))throw Error('JSON recursive schema mismatch');this.values=valueCodec;
 }
 parse(text,options={}){return parseJsonValue(text,options,jsonBoundaryBudget(options));}
 parseCompiled(codec,text,options={}){
  if(codec?.identity!==this.values.descriptor.identity||typeof codec.builder!=='function')throw Error('compiled JSON schema mismatch');
  const builder=codec.builder(options);try{return parseJsonConstructed(text,options,builder);}catch(error){builder.abort();throw error;}
 }
 stringify(value,options={}){return stringifyJsonValue(value,options,jsonBoundaryBudget(options));}
 stringifyCompiled(codec,handle,options={}){
  const limits=checkedJsonLimits(options),unwrap=options.unwrapResult===true;
  const quoter=options.quoter;if(quoter!==undefined&&!jsonQuoters.has(quoter))throw Error('JSON quote cache owner mismatch');
  let codecs=jsonCompiledRenderers.get(this);if(!codecs)jsonCompiledRenderers.set(this,codecs=new WeakMap());
  let renderers=codecs.get(codec);if(!renderers)codecs.set(codec,renderers=new Map());
  let render=renderers.get(unwrap);if(!render)renderers.set(unwrap,render=compiledJsonRenderer(this,codec,unwrap));
  let bytes=0;const context={
   quoter,
   add(text){bytes+=jsonUtf8Length(text);if(bytes>limits.bytes)throw Error('JSON byte limit');return text;},
   quote(value,colon){
    if(!quoter)return this.add(JSON.stringify(value)+(colon?':':''));
    const token=quoter.token(value);bytes+=token.utf8Bytes+(colon?1:0);if(bytes>limits.bytes)throw Error('JSON byte limit');return token.text+(colon?':':'');
   },
  };
  const text=render(handle,context,limits);
  return text;
 }
 fromJS(value,options={}){return jsonFromJS(value,options);}
 toJS(value,options={}){return jsonToJS(value,options);}
 parseBinary(text,options={}){return streamJsonBinary(this.values,text,options,false);}
 parseCompact(text,options={}){return streamJsonBinary(this.values,text,options,false,true);}
 stringifyBinary(bytes,options={}){return streamWireJsonText(this.values,bytes,options,true);}
 validateBinary(bytes,options={}){
  const decoder=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true});let view;
  this.values.visitSpans(bytes,(type,data,start,end)=>{
   view??=new DataView(data.buffer,data.byteOffset,data.byteLength);
   if(type.name===this.numberBranch){const length=view.getUint32(start,true);if(!jsonNumberSpan(data,start+4,start+4+length))throw Error('invalid JSON number token');}
   if(type.name===this.objectBranch){const listEnd=start+4+view.getUint32(start,true),count=view.getUint32(start+4,true),seen=new Set();let at=start+8;for(let i=0;i<count;i++){const memberEnd=at+4+view.getUint32(at,true),keyStart=at+8,keyEnd=keyStart+view.getUint32(at+4,true),key=decoder.decode(data.subarray(keyStart,keyEnd));if(seen.has(key))throw Error('duplicate JSON object key');seen.add(key);at=memberEnd;}if(at!==listEnd)throw Error('invalid JSON object frame');}
  },options,[this.numberBranch,this.objectBranch]);return true;

 }
}
function jsonUnpack(value){let p=value.payload,i=0;while(i<5&&Object.hasOwn(p,'Err')){p=p.Err;i++;}return [i,(i<5?p.Ok:p).item0];}
function jsonInteger(token,limit){
 if(!jsonNumberToken(token))throw Error('invalid JSON number');const negative=token[0]==='-',raw=negative?token.slice(1):token,[mantissa,exp='0']=raw.split(/[eE]/);let digits=mantissa.replace('.','');if(/^0+$/.test(digits))return '0';const exponent=Number(exp),fraction=mantissa.includes('.')?mantissa.length-mantissa.indexOf('.')-1:0,shift=exponent-fraction;
 if(!Number.isSafeInteger(exponent)||!Number.isSafeInteger(shift))throw Error('JSON integer exponent limit');
 if(shift<0){const cut=-shift;if(cut>=digits.length||!/^[0]+$/.test(digits.slice(-cut)))throw Error('JSON number is not an integer');digits=digits.slice(0,-cut);}else{if(digits.length+shift>limit)throw Error('JSON integer magnitude limit');digits+='0'.repeat(shift);}
 digits=digits.replace(/^0+/,'');if(digits.length>limit)throw Error('JSON integer magnitude limit');return (negative?'-':'')+digits;
}
function jsonBinary64Value(v){
 if(typeof v==='number')return v;
 const text=v.F64Bits;
 if(typeof text!=='string'||text.length>20||!/^(0|[1-9][0-9]*)$/.test(text))throw Error('invalid F64Bits');
 const bits=BigInt(text);if(bits>18446744073709551615n)throw Error('invalid F64Bits');
 const b=new DataView(new ArrayBuffer(8));b.setBigUint64(0,bits,true);return b.getFloat64(0,true);
}
export class TypedJsonCodec{
 constructor(valueCodec){this.values=valueCodec;}
 decode(document,options={}){
  // Validate JSON-specific invariants before interpreting any tagged/record
  // shape, including duplicated names and malformed numeric tokens.
  stringifyJson(document,options);const l=checkedJsonLimits(options);let remaining=l.nodes;
  const read=(type,value,d)=>{
   if(d>l.depth||--remaining<0)throw Error('typed JSON resource limit');const t=this.values.resolve(type),[kind,item]=jsonUnpack(value);const fail=()=>{throw Error('JSON does not match '+t.kind);};
   switch(t.kind){
    case 'unit':if(kind!==0)fail();return null;
    case 'bool':if(kind!==1)fail();return item;
    case 'u32':case 'u64':case 'i32':case 'int':{if(kind!==2)fail();const text=jsonInteger(item,t.kind==='int'?4096:t.kind==='u64'?20:10);return t.kind==='int'?{Int:text}:t.kind==='u64'?BigInt(text):Number(text);}
    case 'f64':{if(kind!==2)fail();const n=Number(item),b=new DataView(new ArrayBuffer(8));if(!Number.isFinite(n))throw Error('JSON f64 overflow');b.setFloat64(0,n,true);return {F64Bits:b.getBigUint64(0,true).toString()};}
    case 'f32':{if(kind!==2)fail();const n=Number(item),b=new DataView(new ArrayBuffer(4));b.setFloat32(0,n,true);if(!Number.isFinite(b.getFloat32(0,true)))throw Error('JSON f32 overflow');return {F32Bits:b.getUint32(0,true)};}
    case 'string':case 'enum':case 'id':if(kind!==3)fail();return item;
    case 'list':case 'vector':if(kind!==4)fail();return item.map(x=>read(t.element,x,d+1));
    case 'record':{if(kind!==5||item.length!==t.fields.length)throw Error('unknown or missing JSON record field');const fields=new Map(item.map(m=>[m.key,m.value])),out={};for(const f of t.fields){if(!fields.has(f.name))throw Error('missing JSON record field');Object.defineProperty(out,f.name,{value:read(f.type,fields.get(f.name),d+1),writable:true,enumerable:true,configurable:true});}return out;}
    case 'option':case 'result':{if(kind!==5||item.length!==1)fail();const m=item[0];if(t.kind==='option'&&m.key==='None'&&jsonUnpack(m.value)[0]===0)return {None:null};const child=t.kind==='option'&&m.key==='Some'?t.element:t.kind==='result'&&m.key==='Ok'?t.ok:t.kind==='result'&&m.key==='Err'?t.error:null;if(!child)fail();return {[m.key]:read(child,m.value,d+1)};}
    default:fail();
   }
  };
  const out=read(this.values.descriptor.root,document,0);this.values.validateValue(out,options);return out;
 }
 encode(value,options={}){
  this.values.validateValue(value,options);const l=checkedJsonLimits(options);let remaining=l.nodes;
  const write=(type,v,d)=>{
   if(d>l.depth||--remaining<0)throw Error('typed JSON resource limit');const t=this.values.resolve(type);
   switch(t.kind){
    case 'unit':return jsonVariant(0);
    case 'bool':return jsonVariant(1,v);
    case 'u32':case 'u64':case 'i32':return jsonVariant(2,String(v));
    case 'int':return jsonVariant(2,typeof v==='bigint'?String(v):v.Int);
    case 'f64':{const n=jsonBinary64Value(v);if(!Number.isFinite(n))throw Error('non-finite f64 cannot encode as JSON');return jsonVariant(2,Object.is(n,-0)?'-0':String(n));}
    case 'f32':{let n;if(typeof v==='number')n=Math.fround(v);else{const b=new DataView(new ArrayBuffer(4));b.setUint32(0,v.F32Bits,true);n=b.getFloat32(0,true);}if(!Number.isFinite(n))throw Error('non-finite f32 cannot encode as JSON');return jsonVariant(2,Object.is(n,-0)?'-0':String(n));}
    case 'string':case 'id':case 'enum':return jsonVariant(3,v);
    case 'list':case 'vector':return jsonVariant(4,Array.from(v,x=>write(t.element,x,d+1)));
    case 'record':return jsonVariant(5,t.fields.map(f=>({key:f.name,value:write(f.type,v[f.name],d+1)})));
    case 'option':return jsonVariant(5,[Object.hasOwn(v,'Some')?{key:'Some',value:write(t.element,v.Some,d+1)}:{key:'None',value:jsonVariant(0)}]);
    case 'result':return jsonVariant(5,[Object.hasOwn(v,'Ok')?{key:'Ok',value:write(t.ok,v.Ok,d+1)}:{key:'Err',value:write(t.error,v.Err,d+1)}]);
    default:throw Error('unsupported typed JSON descriptor');
   }
  };return write(this.values.descriptor.root,value,0);
 }
 parse(text,options={}){return this.decode(parseJson(text,options),options);}
 stringify(value,options={}){return stringifyJson(this.encode(value,options),options);}
 parseBinary(text,options={}){return streamJsonBinary(this.values,text,options,true);}
 parseCompact(text,options={}){return streamJsonBinary(this.values,text,options,true,true);}
 stringifyBinary(bytes,options={}){return streamWireJsonText(this.values,bytes,options,false);}
}

// Token reader shared by schema-directed and arbitrary-JSON wire emission.
class JsonWireReader{
 constructor(text,options){this.l=checkedJsonLimits(options);if(typeof text!=='string'||!text.isWellFormed()||text.length>this.l.bytes||jsonUtf8Length(text)>this.l.bytes)throw Error('JSON byte or Unicode limit');this.text=text;this.at=0;this.remaining=this.l.nodes;}
 ws(){while(this.at<this.text.length){const c=this.text.charCodeAt(this.at);if(c!==32&&c!==9&&c!==10&&c!==13)break;this.at++;}}
 peek(){this.ws();return this.text[this.at];}
 eat(c){this.ws();if(this.text[this.at]===c){this.at++;return true;}return false;}
 node(d){if(d>this.l.depth||--this.remaining<0)throw Error('JSON node or depth limit');}
 string(){
  this.ws();const start=this.at;if(this.text[start]!=='"')throw Error('expected JSON string');
  const end=this.text.indexOf('"',start+1);if(end<0)throw Error('unterminated JSON string');
  const raw=this.text.slice(start+1,end);
  if(!raw.includes('\\')&&!/[\x00-\x1f]/.test(raw)){this.at=end+1;return raw;}
  this.at=start+1;while(this.at<this.text.length){if(this.text[this.at]==='"'){this.at++;const v=JSON.parse(this.text.slice(start,this.at));if(!v.isWellFormed())throw Error('invalid JSON Unicode');return v;}if(this.text[this.at]==='\\')this.at+=2;else this.at++;}throw Error('unterminated JSON string');
 }
 number(){const start=this.at;while(this.at<this.text.length){const c=this.text.charCodeAt(this.at);if(!(c>=48&&c<=57||c===45||c===43||c===46||c===101||c===69))break;this.at++;}const token=this.text.slice(start,this.at);if(!jsonNumberToken(token))throw Error('invalid JSON number');return token;}
 leaf(d){this.node(d);const c=this.peek();if(c==='n'&&this.text.startsWith('null',this.at)){this.at+=4;return null;}if(c==='t'&&this.text.startsWith('true',this.at)){this.at+=4;return true;}if(c==='f'&&this.text.startsWith('false',this.at)){this.at+=5;return false;}if(c==='"')return this.string();if(c==='-'||c>='0'&&c<='9')return this.number();throw Error('invalid JSON scalar');}
 finish(){this.ws();if(this.at!==this.text.length)throw Error('trailing JSON text');}
}
function streamJsonBinary(values,text,options,typed,compact=false){
 const p=new JsonWireReader(text,options),utf8=jsonWireEncoder;
 const list=(w,open,close,item)=>{if(!p.eat(open))throw Error('JSON container shape');const at=w.beginCount();let count=0;if(!p.eat(close))while(true){item(w);count++;if(p.eat(close))break;if(!p.eat(','))throw Error('JSON container separator');}w.endCount(at,count);};
 const variant=(w,index,level,emit)=>{if(level<index)w.frame(w=>{w.byte(1);variant(w,index,level+1,emit);});else if(index<5)w.frame(w=>{w.byte(0);w.frame(emit);});else w.frame(emit);};
 const json=(w,d)=>{
  const ch=p.peek(),index=ch==='n'?0:ch==='t'||ch==='f'?1:ch==='-'||ch>='0'&&ch<='9'?2:ch==='"'?3:ch==='['?4:ch==='{'?5:-1;if(index<0)throw Error('invalid JSON value');
  const leaf=index<4?p.leaf(d):null;if(index>=4)p.node(d);
  w.frame(w=>variant(w,index,0,w=>{
   if(index===0)return;if(index===1){w.frame(w=>w.byte(+leaf));return;}
   if(index===2||index===3){w.frame(w=>w.text(leaf));return;}
   w.frame(w=>{if(index===4)list(w,'[',']',w=>json(w,d+1));else{const seen=new Set();list(w,'{','}',w=>{const key=p.string();if(seen.has(key))throw Error('duplicate JSON object key');seen.add(key);if(!p.eat(':'))throw Error('JSON object colon');w.frame(w=>{w.frame(w=>w.text(key));json(w,d+1);});});}});
  }));
 };
 const read=(type,w,d)=>{
  const t=values.resolve(type);w.frame(w=>{
   if(t.kind==='list'||t.kind==='vector'){p.node(d);list(w,'[',']',w=>read(t.element,w,d+1));return;}
   if(t.kind==='record'){
    p.node(d);if(!p.eat('{'))throw Error('expected JSON record');const start=w.position,spans=new Array(t.fields.length).fill(null);
    if(!p.eat('}'))while(true){const key=p.string(),i=t.fields.findIndex(f=>f.name===key);if(i<0)throw Error('unknown JSON record field');if(spans[i])throw Error('duplicate JSON record field');if(!p.eat(':'))throw Error('JSON record colon');const at=w.position;read(t.fields[i].type,w,d+1);spans[i]=[at,w.position];if(p.eat('}'))break;if(!p.eat(','))throw Error('JSON record separator');}
    if(spans.some(s=>s===null))throw Error('missing JSON record field');w.reorder(start,spans);return;
   }
   if(t.kind==='option'||t.kind==='result'){
    p.node(d);if(!p.eat('{'))throw Error('expected JSON tagged value');const key=p.string();if(!p.eat(':'))throw Error('JSON tag colon');
    if(t.kind==='option'&&key==='None'){if(p.leaf(d+1)!==null)throw Error('JSON None payload');w.byte(0);}
    else{const child=t.kind==='option'&&key==='Some'?t.element:t.kind==='result'&&key==='Ok'?t.ok:t.kind==='result'&&key==='Err'?t.error:null;if(!child)throw Error('invalid JSON tag');w.byte(key==='Ok'?0:1);read(child,w,d+1);}
    if(!p.eat('}'))throw Error('expected exactly one JSON tag');return;
   }
   const ch=p.peek(),v=p.leaf(d),bad=()=>{throw Error('JSON does not match '+t.kind);};
   if(t.kind==='unit'){if(v!==null)bad();return;}
   if(t.kind==='bool'){if(typeof v!=='boolean')bad();w.byte(+v);return;}
   if(['string','id','enum'].includes(t.kind)){if(ch!=='"')bad();w.text(v);return;}
   if(ch!=='-'&&!(ch>='0'&&ch<='9'))bad();
   if(t.kind==='int'){w.text(jsonInteger(v,4096));return;}
   if(t.kind==='f64'){const n=Number(v);if(!Number.isFinite(n))throw Error('JSON f64 overflow');const b=new DataView(new ArrayBuffer(8));b.setFloat64(0,n,true);w.wide(b.getBigUint64(0,true));}
   else if(t.kind==='f32'){jsonFloatScratch.setFloat32(0,Number(v),true);if(!Number.isFinite(jsonFloatScratch.getFloat32(0,true)))throw Error('JSON f32 overflow');w.word(jsonFloatScratch.getUint32(0,true));}
   else{const n=BigInt(jsonInteger(v,t.kind==='u64'?20:10));if(t.kind==='u64'){if(n<0n||n>18446744073709551615n)bad();w.wide(n);}else if(t.kind==='u32'){if(n<0n||n>4294967295n)bad();w.word(Number(n));}else if(t.kind==='i32'){if(n< -2147483648n||n>2147483647n)bad();w.word(Number(n)>>>0);}else bad();}
  });
 };
 return (compact?values.compact():values).encodeWith(w=>{if(typed)read(values.descriptor.root,w,0);else json(w,0);p.finish();},options);
}

// Render validated bytes in a single traversal; only the final text is owned.
function streamWireJsonText(values,bytes,options,library){
 values.validate(bytes,options);const l=checkedJsonLimits(options),parts=[];let size=0,remaining=l.nodes;const dv=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),decoder=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true});
 const emit=s=>{size+=jsonUtf8Length(s);if(size>l.bytes)throw Error('JSON byte limit');parts.push(s);};
 const string=s=>emit(JSON.stringify(s));const node=d=>{if(d>l.depth||--remaining<0)throw Error('JSON node or depth limit');};
 const frame=(type,at)=>{const t=values.resolve(type),start=at+4,end=start+dv.getUint32(at,true);return{t,start,end};};
 const json=(type,at,d)=>{
  node(d);let root=frame(type,at),sum=frame(root.t.fields[0].type,root.start),index=0;
  while(index<5){const err=bytes[sum.start];sum=frame(err?sum.t.error:sum.t.ok,sum.start+1);if(!err)break;index++;}
  if(index===0){emit('null');return root.end;}
  const item=frame(sum.t.fields[0].type,sum.start);
  if(index===1)emit(bytes[item.start]?'true':'false');
  else if(index===2){const token=decoder.decode(bytes.subarray(item.start,item.end));if(!jsonNumberToken(token))throw Error('invalid JSON number token');emit(token);}
  else if(index===3)string(decoder.decode(bytes.subarray(item.start,item.end)));
  else{const count=dv.getUint32(item.start,true);let p=item.start+4;emit(index===4?'[':'{');const seen=new Set();for(let i=0;i<count;i++){if(i)emit(',');if(index===4)p=json(item.t.element,p,d+1);else{const member=frame(item.t.element,p),key=frame(member.t.fields[0].type,member.start),name=decoder.decode(bytes.subarray(key.start,key.end));if(seen.has(name))throw Error('duplicate JSON object key');seen.add(name);string(name);emit(':');json(member.t.fields[1].type,key.end,d+1);p=member.end;}}emit(index===4?']':'}');}
  return root.end;
 };
 const typed=(type,at,d)=>{
  node(d);const f=frame(type,at),t=f.t;let p=f.start;
  switch(t.kind){
   case 'unit':emit('null');break;
   case 'bool':emit(bytes[p]?'true':'false');break;
   case 'u32':emit(String(dv.getUint32(p,true)));break;
   case 'u64':emit(String(dv.getBigUint64(p,true)));break;
   case 'i32':emit(String(dv.getInt32(p,true)));break;
   case 'f64':{const n=dv.getFloat64(p,true);if(!Number.isFinite(n))throw Error('non-finite f64 cannot encode as JSON');emit(Object.is(n,-0)?'-0':String(n));break;}
   case 'f32':{const n=dv.getFloat32(p,true);if(!Number.isFinite(n))throw Error('non-finite f32 cannot encode as JSON');emit(Object.is(n,-0)?'-0':String(n));break;}
   case 'int':emit(decoder.decode(bytes.subarray(p,f.end)));break;
   case 'string':case 'id':case 'enum':string(decoder.decode(bytes.subarray(p,f.end)));break;
   case 'list':case 'vector':{const n=dv.getUint32(p,true);p+=4;emit('[');for(let i=0;i<n;i++){if(i)emit(',');p=typed(t.element,p,d+1);}emit(']');break;}
   case 'record':emit('{');for(let i=0;i<t.fields.length;i++){if(i)emit(',');const field=t.fields[i];string(field.name);emit(':');p=typed(field.type,p,d+1);}emit('}');break;
   case 'option':case 'result':{const tag=bytes[p++],key=t.kind==='option'?(tag?'Some':'None'):tag?'Err':'Ok';emit('{');string(key);emit(':');if(t.kind==='option'&&!tag){node(d+1);emit('null');}else typed(t.kind==='option'?t.element:tag?t.error:t.ok,p,d+1);emit('}');break;}
   default:throw Error('unsupported typed JSON descriptor');
  }return f.end;
 };
 if(library)json(values.descriptor.root,40,0);else typed(values.descriptor.root,40,0);return parts.join('');
}

/** Owned, optional read view of arbitrary JSON. Auxiliary indexes contain member
 * offsets only. Logical order, exact number tokens and missing/null remain intact.
 * This does not transparently replace any compiled Ink action or its state.
 */
export function createJsonLookup(text,{stepEntries=16,minReads=4,maxEntries=4096,maxObjects=64,maxIndexBytes=262144,...limits}={}){
 for(const [v,max]of [[stepEntries,4096],[minReads,1000000],[maxEntries,1000000],[maxObjects,256],[maxIndexBytes,16777216]])if(!Number.isSafeInteger(v)||v<0||v>max)throw Error('JSON index budget');
 let root=parseJson(text,limits),indexes=new Map(),entries=0,indexBytes=0;
 const stats={reads:0,writes:0,scanned_members:0,index_hits:0,built_entries:0,invalidations:0};
 function parts(path){
  if(!Array.isArray(path))throw Error('JSON lookup path');const n=path.length;if(n>128)throw Error('JSON lookup path');
  const owned=[];for(let i=0;i<n;i++){const d=Object.getOwnPropertyDescriptor(path,String(i));if(!d||!Object.hasOwn(d,'value'))throw Error('JSON lookup path');const p=d.value;if(!(typeof p==='string'&&p.isWellFormed()&&p.length<=4096)&&!(Number.isSafeInteger(p)&&p>=0))throw Error('JSON lookup path');owned.push(p);}return owned;
 }
 function variant(value){let p=value.payload,index=0;while(index<5&&Object.hasOwn(p,'Err')){p=p.Err;index++;}return {index,item:(index<5?p.Ok:p).item0};}
 function resolve(document,path,indexed){
  let value=document,budget=stepEntries;
  for(let depth=0;depth<path.length;depth++){
   const part=path[depth],v=variant(value);
   if(typeof part==='number'){
    if(v.index!==4)throw Error('expected JSON array');if(part>=v.item.length)return {found:false};value=v.item[part];continue;
   }
   if(v.index!==5)throw Error('expected JSON object');
   const prefix=path.slice(0,depth),key=JSON.stringify(prefix),overhead=128+prefix.reduce((n,p)=>n+(typeof p==='string'?16+p.length*2:8),0);let idx=indexed?indexes.get(key):null;
   if(indexed&&!idx&&indexes.size<maxObjects&&indexBytes+overhead<=maxIndexBytes){idx={path:prefix,reads:0,cursor:0,keys:new Map(),bytes:overhead};indexes.set(key,idx);indexBytes+=overhead;}
   if(idx){
    idx.reads++;
    if(idx.reads>=minReads)while(budget>0&&idx.cursor<v.item.length&&entries<maxEntries){
     const member=v.item[idx.cursor],bytes=64+member.key.length*2;
     if(indexBytes+bytes>maxIndexBytes)break;
     idx.keys.set(member.key,idx.cursor++);idx.bytes+=bytes;indexBytes+=bytes;entries++;stats.built_entries++;budget--;
    }
    if(idx.keys.has(part)){stats.index_hits++;value=v.item[idx.keys.get(part)].value;continue;}
   }
   let found=false;
   for(let i=idx?.cursor??0;i<v.item.length;i++){if(indexed)stats.scanned_members++;if(v.item[i].key===part){value=v.item[i].value;found=true;break;}}
   if(!found)return {found:false};
  }
  return {found:true,value};
 }
 return {
  lookup(path){stats.reads++;const r=resolve(root,parts(path),true);return r.found?{found:true,value:structuredClone(r.value)}:r;},
  set(path,key,text){
   path=parts(path);if(typeof key!=='string'||!key.isWellFormed())throw Error('JSON object key');
   const replacement=parseJson(text,limits),next=structuredClone(root),r=resolve(next,path,false);
   if(!r.found)throw Error('JSON update path missing');const object=variant(r.value);if(object.index!==5)throw Error('expected JSON object');
   const members=[{key,value:replacement},...object.item.filter(m=>m.key!==key)];
   // Validate the complete resulting document before publishing a write.
   let payload=r.value.payload;for(let i=0;i<5;i++)payload=payload.Err;payload.item0=members;
   stringifyJson(next,limits);root=next;stats.writes++;
   for(const [id,idx]of indexes)if(idx.path.length>=path.length&&path.every((p,i)=>p===idx.path[i])){entries-=idx.keys.size;indexBytes-=idx.bytes;indexes.delete(id);stats.invalidations++;}
  },
  replace(text){const next=parseJson(text,limits);root=next;stats.writes++;stats.invalidations+=indexes.size;indexes.clear();entries=0;indexBytes=0;},
  stringify(){return stringifyJson(root,limits);},
  stats(){return {...stats,index_entries:entries,index_objects:indexes.size,index_bytes:indexBytes};}
 };
}
function __ownedValue2(value,budget,depth){budget.enter(depth,8);const n=value.length;if(n>budget.remaining)throw Error('wire sequence size');const out=new Array(n);for(let i=0;i<n;i++)out[i]=__ownedValue3(value[i],budget,depth+1);return out;}
function __ownedValue0(value,budget,depth){budget.enter(depth,8);const n=value.length;if(n>budget.remaining)throw Error('wire sequence size');const out=new Array(n);for(let i=0;i<n;i++)out[i]=__ownedValue1(value[i],budget,depth+1);return out;}
function __ownedValue3(value,budget,depth){budget.enter(depth,8);const bits=typeof value==='number'?__bits(value):value.F32Bits;return {F32Bits:bits===0?0:bits};}
function __ownedValue1(value,budget,depth){budget.enter(depth,8);return value>>>0;}
const __ownedFunctions=Object.freeze(Object.fromEntries([["coordinates",__ownedValue0],["row",__ownedValue2],["short_mean",__ownedValue2],["long_mean",__ownedValue2],["encode",__ownedValue2]]));
function __wireValue4(reader){const end=reader.frame();const n=reader.count(),value=new Array(n);for(let i=0;i<n;i++)value[i]=__wireValue5(reader);reader.finish(end);return value;}
function __wireValue5(reader){const end=reader.frame();const n=reader.count(),value=new Array(n);for(let i=0;i<n;i++)value[i]=__wireValue6(reader);reader.finish(end);return value;}
function __wireValue1(reader){const end=reader.frame();const n=reader.count(),value=new Array(n);for(let i=0;i<n;i++)value[i]=__wireValue2(reader);reader.finish(end);return value;}
function __wireValue0(reader){const end=reader.frame();const value={};reader.finish(end);return value;}
function __wireValue7(reader){const end=reader.frame();const value={["rows_0"]:__wireValue4(reader),["rows_1"]:__wireValue4(reader),["rows_2"]:__wireValue4(reader),["rows_3"]:__wireValue4(reader),["rows_4"]:__wireValue4(reader),["rows_5"]:__wireValue4(reader),["rows_6"]:__wireValue4(reader),["rows_7"]:__wireValue4(reader),["rows_8"]:__wireValue4(reader),["rows_9"]:__wireValue4(reader),["rows_10"]:__wireValue4(reader),["rows_11"]:__wireValue4(reader),["rows_12"]:__wireValue4(reader),["rows_13"]:__wireValue4(reader),["rows_14"]:__wireValue4(reader),["rows_15"]:__wireValue4(reader),["rows_16"]:__wireValue4(reader),["rows_17"]:__wireValue4(reader),["rows_18"]:__wireValue4(reader),["rows_19"]:__wireValue4(reader),["rows_20"]:__wireValue4(reader),["rows_21"]:__wireValue4(reader),["rows_22"]:__wireValue4(reader),["rows_23"]:__wireValue4(reader),["rows_24"]:__wireValue4(reader),["rows_25"]:__wireValue4(reader),["rows_26"]:__wireValue4(reader),["rows_27"]:__wireValue4(reader),["rows_28"]:__wireValue4(reader),["rows_29"]:__wireValue4(reader),["rows_30"]:__wireValue4(reader),["rows_31"]:__wireValue4(reader),["id"]:__wireValue2(reader)};reader.finish(end);return value;}
function __wireValue3(reader){const end=reader.frame();const value={["rows_0"]:__wireValue4(reader),["rows_1"]:__wireValue4(reader),["rows_2"]:__wireValue4(reader),["rows_3"]:__wireValue4(reader),["rows_4"]:__wireValue4(reader),["rows_5"]:__wireValue4(reader),["rows_6"]:__wireValue4(reader),["rows_7"]:__wireValue4(reader),["rows_8"]:__wireValue4(reader),["rows_9"]:__wireValue4(reader),["rows_10"]:__wireValue4(reader),["rows_11"]:__wireValue4(reader),["rows_12"]:__wireValue4(reader),["rows_13"]:__wireValue4(reader),["rows_14"]:__wireValue4(reader),["rows_15"]:__wireValue4(reader),["rows_16"]:__wireValue4(reader),["rows_17"]:__wireValue4(reader),["rows_18"]:__wireValue4(reader),["rows_19"]:__wireValue4(reader),["rows_20"]:__wireValue4(reader),["rows_21"]:__wireValue4(reader),["rows_22"]:__wireValue4(reader),["rows_23"]:__wireValue4(reader),["rows_24"]:__wireValue4(reader),["rows_25"]:__wireValue4(reader),["rows_26"]:__wireValue4(reader),["rows_27"]:__wireValue4(reader),["rows_28"]:__wireValue4(reader),["rows_29"]:__wireValue4(reader),["rows_30"]:__wireValue4(reader),["rows_31"]:__wireValue4(reader),["ids"]:__wireValue1(reader)};reader.finish(end);return value;}
function __wireValue6(reader){const end=reader.frame();const value={F32Bits:reader.word()};reader.finish(end);return value;}
function __wireValue2(reader){const end=reader.frame();const value=reader.word();reader.finish(end);return value;}
const __wireReaders=Object.freeze(Object.fromEntries([["coordinates",[__wireValue0,__wireValue1]],["encode",[__wireValue3,__wireValue5]],["long_mean",[__wireValue3,__wireValue5]],["row",[__wireValue7,__wireValue5]],["short_mean",[__wireValue3,__wireValue5]]]));
const __ownedImplementations=Object.freeze(Object.fromEntries([["coordinates",(()=>{const input=[],needsInput=input.some(c=>c!==__identity);const needsContext=false;if(true)return __fn0;const fallback=(...args)=>{const context=new WeakMap();const values=needsInput?args.map((v,i)=>input[i](v,context)):args;return __fn0(...values);};return function(){if(arguments.length!==0)return fallback(...arguments);const context=(needsContext)?new WeakMap():null;return __fn0();};})()],
["row",(()=>{const c0=__representation(__inputTypes[1].types[0],false,__inputTypes[1].capture[0]);const c1=__representation(__inputTypes[1].types[1],false,__inputTypes[1].capture[1]);const c2=__representation(__inputTypes[1].types[2],false,__inputTypes[1].capture[2]);const c3=__representation(__inputTypes[1].types[3],false,__inputTypes[1].capture[3]);const c4=__representation(__inputTypes[1].types[4],false,__inputTypes[1].capture[4]);const c5=__representation(__inputTypes[1].types[5],false,__inputTypes[1].capture[5]);const c6=__representation(__inputTypes[1].types[6],false,__inputTypes[1].capture[6]);const c7=__representation(__inputTypes[1].types[7],false,__inputTypes[1].capture[7]);const c8=__representation(__inputTypes[1].types[8],false,__inputTypes[1].capture[8]);const c9=__representation(__inputTypes[1].types[9],false,__inputTypes[1].capture[9]);const c10=__representation(__inputTypes[1].types[10],false,__inputTypes[1].capture[10]);const c11=__representation(__inputTypes[1].types[11],false,__inputTypes[1].capture[11]);const c12=__representation(__inputTypes[1].types[12],false,__inputTypes[1].capture[12]);const c13=__representation(__inputTypes[1].types[13],false,__inputTypes[1].capture[13]);const c14=__representation(__inputTypes[1].types[14],false,__inputTypes[1].capture[14]);const c15=__representation(__inputTypes[1].types[15],false,__inputTypes[1].capture[15]);const c16=__representation(__inputTypes[1].types[16],false,__inputTypes[1].capture[16]);const c17=__representation(__inputTypes[1].types[17],false,__inputTypes[1].capture[17]);const c18=__representation(__inputTypes[1].types[18],false,__inputTypes[1].capture[18]);const c19=__representation(__inputTypes[1].types[19],false,__inputTypes[1].capture[19]);const c20=__representation(__inputTypes[1].types[20],false,__inputTypes[1].capture[20]);const c21=__representation(__inputTypes[1].types[21],false,__inputTypes[1].capture[21]);const c22=__representation(__inputTypes[1].types[22],false,__inputTypes[1].capture[22]);const c23=__representation(__inputTypes[1].types[23],false,__inputTypes[1].capture[23]);const c24=__representation(__inputTypes[1].types[24],false,__inputTypes[1].capture[24]);const c25=__representation(__inputTypes[1].types[25],false,__inputTypes[1].capture[25]);const c26=__representation(__inputTypes[1].types[26],false,__inputTypes[1].capture[26]);const c27=__representation(__inputTypes[1].types[27],false,__inputTypes[1].capture[27]);const c28=__representation(__inputTypes[1].types[28],false,__inputTypes[1].capture[28]);const c29=__representation(__inputTypes[1].types[29],false,__inputTypes[1].capture[29]);const c30=__representation(__inputTypes[1].types[30],false,__inputTypes[1].capture[30]);const c31=__representation(__inputTypes[1].types[31],false,__inputTypes[1].capture[31]);const c32=__representation(__inputTypes[1].types[32],false,__inputTypes[1].capture[32]);const input=[c0,c1,c2,c3,c4,c5,c6,c7,c8,c9,c10,c11,c12,c13,c14,c15,c16,c17,c18,c19,c20,c21,c22,c23,c24,c25,c26,c27,c28,c29,c30,c31,c32],needsInput=input.some(c=>c!==__identity);const needsContext=(c0!==__identity||c1!==__identity||c2!==__identity||c3!==__identity||c4!==__identity||c5!==__identity||c6!==__identity||c7!==__identity||c8!==__identity||c9!==__identity||c10!==__identity||c11!==__identity||c12!==__identity||c13!==__identity||c14!==__identity||c15!==__identity||c16!==__identity||c17!==__identity||c18!==__identity||c19!==__identity||c20!==__identity||c21!==__identity||c22!==__identity||c23!==__identity||c24!==__identity||c25!==__identity||c26!==__identity||c27!==__identity||c28!==__identity||c29!==__identity||c30!==__identity||c31!==__identity);if(c0===__identity&&c1===__identity&&c2===__identity&&c3===__identity&&c4===__identity&&c5===__identity&&c6===__identity&&c7===__identity&&c8===__identity&&c9===__identity&&c10===__identity&&c11===__identity&&c12===__identity&&c13===__identity&&c14===__identity&&c15===__identity&&c16===__identity&&c17===__identity&&c18===__identity&&c19===__identity&&c20===__identity&&c21===__identity&&c22===__identity&&c23===__identity&&c24===__identity&&c25===__identity&&c26===__identity&&c27===__identity&&c28===__identity&&c29===__identity&&c30===__identity&&c31===__identity&&c32===__identity)return __fn1;const fallback=(...args)=>{const context=new WeakMap();const values=needsInput?args.map((v,i)=>input[i](v,context)):args;return __fn1(...values);};return function(a0,a1,a2,a3,a4,a5,a6,a7,a8,a9,a10,a11,a12,a13,a14,a15,a16,a17,a18,a19,a20,a21,a22,a23,a24,a25,a26,a27,a28,a29,a30,a31,a32){if(arguments.length!==33)return fallback(...arguments);const context=(needsContext||(Number(c0!==__identity&&a0!==null&&typeof a0==='object')+Number(c1!==__identity&&a1!==null&&typeof a1==='object')+Number(c2!==__identity&&a2!==null&&typeof a2==='object')+Number(c3!==__identity&&a3!==null&&typeof a3==='object')+Number(c4!==__identity&&a4!==null&&typeof a4==='object')+Number(c5!==__identity&&a5!==null&&typeof a5==='object')+Number(c6!==__identity&&a6!==null&&typeof a6==='object')+Number(c7!==__identity&&a7!==null&&typeof a7==='object')+Number(c8!==__identity&&a8!==null&&typeof a8==='object')+Number(c9!==__identity&&a9!==null&&typeof a9==='object')+Number(c10!==__identity&&a10!==null&&typeof a10==='object')+Number(c11!==__identity&&a11!==null&&typeof a11==='object')+Number(c12!==__identity&&a12!==null&&typeof a12==='object')+Number(c13!==__identity&&a13!==null&&typeof a13==='object')+Number(c14!==__identity&&a14!==null&&typeof a14==='object')+Number(c15!==__identity&&a15!==null&&typeof a15==='object')+Number(c16!==__identity&&a16!==null&&typeof a16==='object')+Number(c17!==__identity&&a17!==null&&typeof a17==='object')+Number(c18!==__identity&&a18!==null&&typeof a18==='object')+Number(c19!==__identity&&a19!==null&&typeof a19==='object')+Number(c20!==__identity&&a20!==null&&typeof a20==='object')+Number(c21!==__identity&&a21!==null&&typeof a21==='object')+Number(c22!==__identity&&a22!==null&&typeof a22==='object')+Number(c23!==__identity&&a23!==null&&typeof a23==='object')+Number(c24!==__identity&&a24!==null&&typeof a24==='object')+Number(c25!==__identity&&a25!==null&&typeof a25==='object')+Number(c26!==__identity&&a26!==null&&typeof a26==='object')+Number(c27!==__identity&&a27!==null&&typeof a27==='object')+Number(c28!==__identity&&a28!==null&&typeof a28==='object')+Number(c29!==__identity&&a29!==null&&typeof a29==='object')+Number(c30!==__identity&&a30!==null&&typeof a30==='object')+Number(c31!==__identity&&a31!==null&&typeof a31==='object')+Number(c32!==__identity&&a32!==null&&typeof a32==='object'))>1)?new WeakMap():null;const v0=c0(a0,context);const v1=c1(a1,context);const v2=c2(a2,context);const v3=c3(a3,context);const v4=c4(a4,context);const v5=c5(a5,context);const v6=c6(a6,context);const v7=c7(a7,context);const v8=c8(a8,context);const v9=c9(a9,context);const v10=c10(a10,context);const v11=c11(a11,context);const v12=c12(a12,context);const v13=c13(a13,context);const v14=c14(a14,context);const v15=c15(a15,context);const v16=c16(a16,context);const v17=c17(a17,context);const v18=c18(a18,context);const v19=c19(a19,context);const v20=c20(a20,context);const v21=c21(a21,context);const v22=c22(a22,context);const v23=c23(a23,context);const v24=c24(a24,context);const v25=c25(a25,context);const v26=c26(a26,context);const v27=c27(a27,context);const v28=c28(a28,context);const v29=c29(a29,context);const v30=c30(a30,context);const v31=c31(a31,context);const v32=c32(a32,context);return __fn1(v0,v1,v2,v3,v4,v5,v6,v7,v8,v9,v10,v11,v12,v13,v14,v15,v16,v17,v18,v19,v20,v21,v22,v23,v24,v25,v26,v27,v28,v29,v30,v31,v32);};})()],
["short_mean",(()=>{const c0=__representation(__inputTypes[3].types[0],false,__inputTypes[3].capture[0]);const c1=__representation(__inputTypes[3].types[1],false,__inputTypes[3].capture[1]);const c2=__representation(__inputTypes[3].types[2],false,__inputTypes[3].capture[2]);const c3=__representation(__inputTypes[3].types[3],false,__inputTypes[3].capture[3]);const c4=__representation(__inputTypes[3].types[4],false,__inputTypes[3].capture[4]);const c5=__representation(__inputTypes[3].types[5],false,__inputTypes[3].capture[5]);const c6=__representation(__inputTypes[3].types[6],false,__inputTypes[3].capture[6]);const c7=__representation(__inputTypes[3].types[7],false,__inputTypes[3].capture[7]);const c8=__representation(__inputTypes[3].types[8],false,__inputTypes[3].capture[8]);const c9=__representation(__inputTypes[3].types[9],false,__inputTypes[3].capture[9]);const c10=__representation(__inputTypes[3].types[10],false,__inputTypes[3].capture[10]);const c11=__representation(__inputTypes[3].types[11],false,__inputTypes[3].capture[11]);const c12=__representation(__inputTypes[3].types[12],false,__inputTypes[3].capture[12]);const c13=__representation(__inputTypes[3].types[13],false,__inputTypes[3].capture[13]);const c14=__representation(__inputTypes[3].types[14],false,__inputTypes[3].capture[14]);const c15=__representation(__inputTypes[3].types[15],false,__inputTypes[3].capture[15]);const c16=__representation(__inputTypes[3].types[16],false,__inputTypes[3].capture[16]);const c17=__representation(__inputTypes[3].types[17],false,__inputTypes[3].capture[17]);const c18=__representation(__inputTypes[3].types[18],false,__inputTypes[3].capture[18]);const c19=__representation(__inputTypes[3].types[19],false,__inputTypes[3].capture[19]);const c20=__representation(__inputTypes[3].types[20],false,__inputTypes[3].capture[20]);const c21=__representation(__inputTypes[3].types[21],false,__inputTypes[3].capture[21]);const c22=__representation(__inputTypes[3].types[22],false,__inputTypes[3].capture[22]);const c23=__representation(__inputTypes[3].types[23],false,__inputTypes[3].capture[23]);const c24=__representation(__inputTypes[3].types[24],false,__inputTypes[3].capture[24]);const c25=__representation(__inputTypes[3].types[25],false,__inputTypes[3].capture[25]);const c26=__representation(__inputTypes[3].types[26],false,__inputTypes[3].capture[26]);const c27=__representation(__inputTypes[3].types[27],false,__inputTypes[3].capture[27]);const c28=__representation(__inputTypes[3].types[28],false,__inputTypes[3].capture[28]);const c29=__representation(__inputTypes[3].types[29],false,__inputTypes[3].capture[29]);const c30=__representation(__inputTypes[3].types[30],false,__inputTypes[3].capture[30]);const c31=__representation(__inputTypes[3].types[31],false,__inputTypes[3].capture[31]);const c32=__representation(__inputTypes[3].types[32],false,__inputTypes[3].capture[32]);const input=[c0,c1,c2,c3,c4,c5,c6,c7,c8,c9,c10,c11,c12,c13,c14,c15,c16,c17,c18,c19,c20,c21,c22,c23,c24,c25,c26,c27,c28,c29,c30,c31,c32],needsInput=input.some(c=>c!==__identity);const needsContext=(c0!==__identity||c1!==__identity||c2!==__identity||c3!==__identity||c4!==__identity||c5!==__identity||c6!==__identity||c7!==__identity||c8!==__identity||c9!==__identity||c10!==__identity||c11!==__identity||c12!==__identity||c13!==__identity||c14!==__identity||c15!==__identity||c16!==__identity||c17!==__identity||c18!==__identity||c19!==__identity||c20!==__identity||c21!==__identity||c22!==__identity||c23!==__identity||c24!==__identity||c25!==__identity||c26!==__identity||c27!==__identity||c28!==__identity||c29!==__identity||c30!==__identity||c31!==__identity||c32!==__identity);if(c0===__identity&&c1===__identity&&c2===__identity&&c3===__identity&&c4===__identity&&c5===__identity&&c6===__identity&&c7===__identity&&c8===__identity&&c9===__identity&&c10===__identity&&c11===__identity&&c12===__identity&&c13===__identity&&c14===__identity&&c15===__identity&&c16===__identity&&c17===__identity&&c18===__identity&&c19===__identity&&c20===__identity&&c21===__identity&&c22===__identity&&c23===__identity&&c24===__identity&&c25===__identity&&c26===__identity&&c27===__identity&&c28===__identity&&c29===__identity&&c30===__identity&&c31===__identity&&c32===__identity)return __fn3;const fallback=(...args)=>{const context=new WeakMap();const values=needsInput?args.map((v,i)=>input[i](v,context)):args;return __fn3(...values);};return function(a0,a1,a2,a3,a4,a5,a6,a7,a8,a9,a10,a11,a12,a13,a14,a15,a16,a17,a18,a19,a20,a21,a22,a23,a24,a25,a26,a27,a28,a29,a30,a31,a32){if(arguments.length!==33)return fallback(...arguments);const context=(needsContext||(Number(c0!==__identity&&a0!==null&&typeof a0==='object')+Number(c1!==__identity&&a1!==null&&typeof a1==='object')+Number(c2!==__identity&&a2!==null&&typeof a2==='object')+Number(c3!==__identity&&a3!==null&&typeof a3==='object')+Number(c4!==__identity&&a4!==null&&typeof a4==='object')+Number(c5!==__identity&&a5!==null&&typeof a5==='object')+Number(c6!==__identity&&a6!==null&&typeof a6==='object')+Number(c7!==__identity&&a7!==null&&typeof a7==='object')+Number(c8!==__identity&&a8!==null&&typeof a8==='object')+Number(c9!==__identity&&a9!==null&&typeof a9==='object')+Number(c10!==__identity&&a10!==null&&typeof a10==='object')+Number(c11!==__identity&&a11!==null&&typeof a11==='object')+Number(c12!==__identity&&a12!==null&&typeof a12==='object')+Number(c13!==__identity&&a13!==null&&typeof a13==='object')+Number(c14!==__identity&&a14!==null&&typeof a14==='object')+Number(c15!==__identity&&a15!==null&&typeof a15==='object')+Number(c16!==__identity&&a16!==null&&typeof a16==='object')+Number(c17!==__identity&&a17!==null&&typeof a17==='object')+Number(c18!==__identity&&a18!==null&&typeof a18==='object')+Number(c19!==__identity&&a19!==null&&typeof a19==='object')+Number(c20!==__identity&&a20!==null&&typeof a20==='object')+Number(c21!==__identity&&a21!==null&&typeof a21==='object')+Number(c22!==__identity&&a22!==null&&typeof a22==='object')+Number(c23!==__identity&&a23!==null&&typeof a23==='object')+Number(c24!==__identity&&a24!==null&&typeof a24==='object')+Number(c25!==__identity&&a25!==null&&typeof a25==='object')+Number(c26!==__identity&&a26!==null&&typeof a26==='object')+Number(c27!==__identity&&a27!==null&&typeof a27==='object')+Number(c28!==__identity&&a28!==null&&typeof a28==='object')+Number(c29!==__identity&&a29!==null&&typeof a29==='object')+Number(c30!==__identity&&a30!==null&&typeof a30==='object')+Number(c31!==__identity&&a31!==null&&typeof a31==='object')+Number(c32!==__identity&&a32!==null&&typeof a32==='object'))>1)?new WeakMap():null;const v0=c0(a0,context);const v1=c1(a1,context);const v2=c2(a2,context);const v3=c3(a3,context);const v4=c4(a4,context);const v5=c5(a5,context);const v6=c6(a6,context);const v7=c7(a7,context);const v8=c8(a8,context);const v9=c9(a9,context);const v10=c10(a10,context);const v11=c11(a11,context);const v12=c12(a12,context);const v13=c13(a13,context);const v14=c14(a14,context);const v15=c15(a15,context);const v16=c16(a16,context);const v17=c17(a17,context);const v18=c18(a18,context);const v19=c19(a19,context);const v20=c20(a20,context);const v21=c21(a21,context);const v22=c22(a22,context);const v23=c23(a23,context);const v24=c24(a24,context);const v25=c25(a25,context);const v26=c26(a26,context);const v27=c27(a27,context);const v28=c28(a28,context);const v29=c29(a29,context);const v30=c30(a30,context);const v31=c31(a31,context);const v32=c32(a32,context);return __fn3(v0,v1,v2,v3,v4,v5,v6,v7,v8,v9,v10,v11,v12,v13,v14,v15,v16,v17,v18,v19,v20,v21,v22,v23,v24,v25,v26,v27,v28,v29,v30,v31,v32);};})()],
["long_mean",(()=>{const c0=__representation(__inputTypes[4].types[0],false,__inputTypes[4].capture[0]);const c1=__representation(__inputTypes[4].types[1],false,__inputTypes[4].capture[1]);const c2=__representation(__inputTypes[4].types[2],false,__inputTypes[4].capture[2]);const c3=__representation(__inputTypes[4].types[3],false,__inputTypes[4].capture[3]);const c4=__representation(__inputTypes[4].types[4],false,__inputTypes[4].capture[4]);const c5=__representation(__inputTypes[4].types[5],false,__inputTypes[4].capture[5]);const c6=__representation(__inputTypes[4].types[6],false,__inputTypes[4].capture[6]);const c7=__representation(__inputTypes[4].types[7],false,__inputTypes[4].capture[7]);const c8=__representation(__inputTypes[4].types[8],false,__inputTypes[4].capture[8]);const c9=__representation(__inputTypes[4].types[9],false,__inputTypes[4].capture[9]);const c10=__representation(__inputTypes[4].types[10],false,__inputTypes[4].capture[10]);const c11=__representation(__inputTypes[4].types[11],false,__inputTypes[4].capture[11]);const c12=__representation(__inputTypes[4].types[12],false,__inputTypes[4].capture[12]);const c13=__representation(__inputTypes[4].types[13],false,__inputTypes[4].capture[13]);const c14=__representation(__inputTypes[4].types[14],false,__inputTypes[4].capture[14]);const c15=__representation(__inputTypes[4].types[15],false,__inputTypes[4].capture[15]);const c16=__representation(__inputTypes[4].types[16],false,__inputTypes[4].capture[16]);const c17=__representation(__inputTypes[4].types[17],false,__inputTypes[4].capture[17]);const c18=__representation(__inputTypes[4].types[18],false,__inputTypes[4].capture[18]);const c19=__representation(__inputTypes[4].types[19],false,__inputTypes[4].capture[19]);const c20=__representation(__inputTypes[4].types[20],false,__inputTypes[4].capture[20]);const c21=__representation(__inputTypes[4].types[21],false,__inputTypes[4].capture[21]);const c22=__representation(__inputTypes[4].types[22],false,__inputTypes[4].capture[22]);const c23=__representation(__inputTypes[4].types[23],false,__inputTypes[4].capture[23]);const c24=__representation(__inputTypes[4].types[24],false,__inputTypes[4].capture[24]);const c25=__representation(__inputTypes[4].types[25],false,__inputTypes[4].capture[25]);const c26=__representation(__inputTypes[4].types[26],false,__inputTypes[4].capture[26]);const c27=__representation(__inputTypes[4].types[27],false,__inputTypes[4].capture[27]);const c28=__representation(__inputTypes[4].types[28],false,__inputTypes[4].capture[28]);const c29=__representation(__inputTypes[4].types[29],false,__inputTypes[4].capture[29]);const c30=__representation(__inputTypes[4].types[30],false,__inputTypes[4].capture[30]);const c31=__representation(__inputTypes[4].types[31],false,__inputTypes[4].capture[31]);const c32=__representation(__inputTypes[4].types[32],false,__inputTypes[4].capture[32]);const input=[c0,c1,c2,c3,c4,c5,c6,c7,c8,c9,c10,c11,c12,c13,c14,c15,c16,c17,c18,c19,c20,c21,c22,c23,c24,c25,c26,c27,c28,c29,c30,c31,c32],needsInput=input.some(c=>c!==__identity);const needsContext=(c0!==__identity||c1!==__identity||c2!==__identity||c3!==__identity||c4!==__identity||c5!==__identity||c6!==__identity||c7!==__identity||c8!==__identity||c9!==__identity||c10!==__identity||c11!==__identity||c12!==__identity||c13!==__identity||c14!==__identity||c15!==__identity||c16!==__identity||c17!==__identity||c18!==__identity||c19!==__identity||c20!==__identity||c21!==__identity||c22!==__identity||c23!==__identity||c24!==__identity||c25!==__identity||c26!==__identity||c27!==__identity||c28!==__identity||c29!==__identity||c30!==__identity||c31!==__identity||c32!==__identity);if(c0===__identity&&c1===__identity&&c2===__identity&&c3===__identity&&c4===__identity&&c5===__identity&&c6===__identity&&c7===__identity&&c8===__identity&&c9===__identity&&c10===__identity&&c11===__identity&&c12===__identity&&c13===__identity&&c14===__identity&&c15===__identity&&c16===__identity&&c17===__identity&&c18===__identity&&c19===__identity&&c20===__identity&&c21===__identity&&c22===__identity&&c23===__identity&&c24===__identity&&c25===__identity&&c26===__identity&&c27===__identity&&c28===__identity&&c29===__identity&&c30===__identity&&c31===__identity&&c32===__identity)return __fn4;const fallback=(...args)=>{const context=new WeakMap();const values=needsInput?args.map((v,i)=>input[i](v,context)):args;return __fn4(...values);};return function(a0,a1,a2,a3,a4,a5,a6,a7,a8,a9,a10,a11,a12,a13,a14,a15,a16,a17,a18,a19,a20,a21,a22,a23,a24,a25,a26,a27,a28,a29,a30,a31,a32){if(arguments.length!==33)return fallback(...arguments);const context=(needsContext||(Number(c0!==__identity&&a0!==null&&typeof a0==='object')+Number(c1!==__identity&&a1!==null&&typeof a1==='object')+Number(c2!==__identity&&a2!==null&&typeof a2==='object')+Number(c3!==__identity&&a3!==null&&typeof a3==='object')+Number(c4!==__identity&&a4!==null&&typeof a4==='object')+Number(c5!==__identity&&a5!==null&&typeof a5==='object')+Number(c6!==__identity&&a6!==null&&typeof a6==='object')+Number(c7!==__identity&&a7!==null&&typeof a7==='object')+Number(c8!==__identity&&a8!==null&&typeof a8==='object')+Number(c9!==__identity&&a9!==null&&typeof a9==='object')+Number(c10!==__identity&&a10!==null&&typeof a10==='object')+Number(c11!==__identity&&a11!==null&&typeof a11==='object')+Number(c12!==__identity&&a12!==null&&typeof a12==='object')+Number(c13!==__identity&&a13!==null&&typeof a13==='object')+Number(c14!==__identity&&a14!==null&&typeof a14==='object')+Number(c15!==__identity&&a15!==null&&typeof a15==='object')+Number(c16!==__identity&&a16!==null&&typeof a16==='object')+Number(c17!==__identity&&a17!==null&&typeof a17==='object')+Number(c18!==__identity&&a18!==null&&typeof a18==='object')+Number(c19!==__identity&&a19!==null&&typeof a19==='object')+Number(c20!==__identity&&a20!==null&&typeof a20==='object')+Number(c21!==__identity&&a21!==null&&typeof a21==='object')+Number(c22!==__identity&&a22!==null&&typeof a22==='object')+Number(c23!==__identity&&a23!==null&&typeof a23==='object')+Number(c24!==__identity&&a24!==null&&typeof a24==='object')+Number(c25!==__identity&&a25!==null&&typeof a25==='object')+Number(c26!==__identity&&a26!==null&&typeof a26==='object')+Number(c27!==__identity&&a27!==null&&typeof a27==='object')+Number(c28!==__identity&&a28!==null&&typeof a28==='object')+Number(c29!==__identity&&a29!==null&&typeof a29==='object')+Number(c30!==__identity&&a30!==null&&typeof a30==='object')+Number(c31!==__identity&&a31!==null&&typeof a31==='object')+Number(c32!==__identity&&a32!==null&&typeof a32==='object'))>1)?new WeakMap():null;const v0=c0(a0,context);const v1=c1(a1,context);const v2=c2(a2,context);const v3=c3(a3,context);const v4=c4(a4,context);const v5=c5(a5,context);const v6=c6(a6,context);const v7=c7(a7,context);const v8=c8(a8,context);const v9=c9(a9,context);const v10=c10(a10,context);const v11=c11(a11,context);const v12=c12(a12,context);const v13=c13(a13,context);const v14=c14(a14,context);const v15=c15(a15,context);const v16=c16(a16,context);const v17=c17(a17,context);const v18=c18(a18,context);const v19=c19(a19,context);const v20=c20(a20,context);const v21=c21(a21,context);const v22=c22(a22,context);const v23=c23(a23,context);const v24=c24(a24,context);const v25=c25(a25,context);const v26=c26(a26,context);const v27=c27(a27,context);const v28=c28(a28,context);const v29=c29(a29,context);const v30=c30(a30,context);const v31=c31(a31,context);const v32=c32(a32,context);return __fn4(v0,v1,v2,v3,v4,v5,v6,v7,v8,v9,v10,v11,v12,v13,v14,v15,v16,v17,v18,v19,v20,v21,v22,v23,v24,v25,v26,v27,v28,v29,v30,v31,v32);};})()],
["encode",(()=>{const c0=__representation(__inputTypes[5].types[0],false,__inputTypes[5].capture[0]);const c1=__representation(__inputTypes[5].types[1],false,__inputTypes[5].capture[1]);const c2=__representation(__inputTypes[5].types[2],false,__inputTypes[5].capture[2]);const c3=__representation(__inputTypes[5].types[3],false,__inputTypes[5].capture[3]);const c4=__representation(__inputTypes[5].types[4],false,__inputTypes[5].capture[4]);const c5=__representation(__inputTypes[5].types[5],false,__inputTypes[5].capture[5]);const c6=__representation(__inputTypes[5].types[6],false,__inputTypes[5].capture[6]);const c7=__representation(__inputTypes[5].types[7],false,__inputTypes[5].capture[7]);const c8=__representation(__inputTypes[5].types[8],false,__inputTypes[5].capture[8]);const c9=__representation(__inputTypes[5].types[9],false,__inputTypes[5].capture[9]);const c10=__representation(__inputTypes[5].types[10],false,__inputTypes[5].capture[10]);const c11=__representation(__inputTypes[5].types[11],false,__inputTypes[5].capture[11]);const c12=__representation(__inputTypes[5].types[12],false,__inputTypes[5].capture[12]);const c13=__representation(__inputTypes[5].types[13],false,__inputTypes[5].capture[13]);const c14=__representation(__inputTypes[5].types[14],false,__inputTypes[5].capture[14]);const c15=__representation(__inputTypes[5].types[15],false,__inputTypes[5].capture[15]);const c16=__representation(__inputTypes[5].types[16],false,__inputTypes[5].capture[16]);const c17=__representation(__inputTypes[5].types[17],false,__inputTypes[5].capture[17]);const c18=__representation(__inputTypes[5].types[18],false,__inputTypes[5].capture[18]);const c19=__representation(__inputTypes[5].types[19],false,__inputTypes[5].capture[19]);const c20=__representation(__inputTypes[5].types[20],false,__inputTypes[5].capture[20]);const c21=__representation(__inputTypes[5].types[21],false,__inputTypes[5].capture[21]);const c22=__representation(__inputTypes[5].types[22],false,__inputTypes[5].capture[22]);const c23=__representation(__inputTypes[5].types[23],false,__inputTypes[5].capture[23]);const c24=__representation(__inputTypes[5].types[24],false,__inputTypes[5].capture[24]);const c25=__representation(__inputTypes[5].types[25],false,__inputTypes[5].capture[25]);const c26=__representation(__inputTypes[5].types[26],false,__inputTypes[5].capture[26]);const c27=__representation(__inputTypes[5].types[27],false,__inputTypes[5].capture[27]);const c28=__representation(__inputTypes[5].types[28],false,__inputTypes[5].capture[28]);const c29=__representation(__inputTypes[5].types[29],false,__inputTypes[5].capture[29]);const c30=__representation(__inputTypes[5].types[30],false,__inputTypes[5].capture[30]);const c31=__representation(__inputTypes[5].types[31],false,__inputTypes[5].capture[31]);const c32=__representation(__inputTypes[5].types[32],false,__inputTypes[5].capture[32]);const input=[c0,c1,c2,c3,c4,c5,c6,c7,c8,c9,c10,c11,c12,c13,c14,c15,c16,c17,c18,c19,c20,c21,c22,c23,c24,c25,c26,c27,c28,c29,c30,c31,c32],needsInput=input.some(c=>c!==__identity);const needsContext=(c0!==__identity||c1!==__identity||c2!==__identity||c3!==__identity||c4!==__identity||c5!==__identity||c6!==__identity||c7!==__identity||c8!==__identity||c9!==__identity||c10!==__identity||c11!==__identity||c12!==__identity||c13!==__identity||c14!==__identity||c15!==__identity||c16!==__identity||c17!==__identity||c18!==__identity||c19!==__identity||c20!==__identity||c21!==__identity||c22!==__identity||c23!==__identity||c24!==__identity||c25!==__identity||c26!==__identity||c27!==__identity||c28!==__identity||c29!==__identity||c30!==__identity||c31!==__identity||c32!==__identity);if(c0===__identity&&c1===__identity&&c2===__identity&&c3===__identity&&c4===__identity&&c5===__identity&&c6===__identity&&c7===__identity&&c8===__identity&&c9===__identity&&c10===__identity&&c11===__identity&&c12===__identity&&c13===__identity&&c14===__identity&&c15===__identity&&c16===__identity&&c17===__identity&&c18===__identity&&c19===__identity&&c20===__identity&&c21===__identity&&c22===__identity&&c23===__identity&&c24===__identity&&c25===__identity&&c26===__identity&&c27===__identity&&c28===__identity&&c29===__identity&&c30===__identity&&c31===__identity&&c32===__identity)return __fn5;const fallback=(...args)=>{const context=new WeakMap();const values=needsInput?args.map((v,i)=>input[i](v,context)):args;return __fn5(...values);};return function(a0,a1,a2,a3,a4,a5,a6,a7,a8,a9,a10,a11,a12,a13,a14,a15,a16,a17,a18,a19,a20,a21,a22,a23,a24,a25,a26,a27,a28,a29,a30,a31,a32){if(arguments.length!==33)return fallback(...arguments);const context=(needsContext||(Number(c0!==__identity&&a0!==null&&typeof a0==='object')+Number(c1!==__identity&&a1!==null&&typeof a1==='object')+Number(c2!==__identity&&a2!==null&&typeof a2==='object')+Number(c3!==__identity&&a3!==null&&typeof a3==='object')+Number(c4!==__identity&&a4!==null&&typeof a4==='object')+Number(c5!==__identity&&a5!==null&&typeof a5==='object')+Number(c6!==__identity&&a6!==null&&typeof a6==='object')+Number(c7!==__identity&&a7!==null&&typeof a7==='object')+Number(c8!==__identity&&a8!==null&&typeof a8==='object')+Number(c9!==__identity&&a9!==null&&typeof a9==='object')+Number(c10!==__identity&&a10!==null&&typeof a10==='object')+Number(c11!==__identity&&a11!==null&&typeof a11==='object')+Number(c12!==__identity&&a12!==null&&typeof a12==='object')+Number(c13!==__identity&&a13!==null&&typeof a13==='object')+Number(c14!==__identity&&a14!==null&&typeof a14==='object')+Number(c15!==__identity&&a15!==null&&typeof a15==='object')+Number(c16!==__identity&&a16!==null&&typeof a16==='object')+Number(c17!==__identity&&a17!==null&&typeof a17==='object')+Number(c18!==__identity&&a18!==null&&typeof a18==='object')+Number(c19!==__identity&&a19!==null&&typeof a19==='object')+Number(c20!==__identity&&a20!==null&&typeof a20==='object')+Number(c21!==__identity&&a21!==null&&typeof a21==='object')+Number(c22!==__identity&&a22!==null&&typeof a22==='object')+Number(c23!==__identity&&a23!==null&&typeof a23==='object')+Number(c24!==__identity&&a24!==null&&typeof a24==='object')+Number(c25!==__identity&&a25!==null&&typeof a25==='object')+Number(c26!==__identity&&a26!==null&&typeof a26==='object')+Number(c27!==__identity&&a27!==null&&typeof a27==='object')+Number(c28!==__identity&&a28!==null&&typeof a28==='object')+Number(c29!==__identity&&a29!==null&&typeof a29==='object')+Number(c30!==__identity&&a30!==null&&typeof a30==='object')+Number(c31!==__identity&&a31!==null&&typeof a31==='object')+Number(c32!==__identity&&a32!==null&&typeof a32==='object'))>1)?new WeakMap():null;const v0=c0(a0,context);const v1=c1(a1,context);const v2=c2(a2,context);const v3=c3(a3,context);const v4=c4(a4,context);const v5=c5(a5,context);const v6=c6(a6,context);const v7=c7(a7,context);const v8=c8(a8,context);const v9=c9(a9,context);const v10=c10(a10,context);const v11=c11(a11,context);const v12=c12(a12,context);const v13=c13(a13,context);const v14=c14(a14,context);const v15=c15(a15,context);const v16=c16(a16,context);const v17=c17(a17,context);const v18=c18(a18,context);const v19=c19(a19,context);const v20=c20(a20,context);const v21=c21(a21,context);const v22=c22(a22,context);const v23=c23(a23,context);const v24=c24(a24,context);const v25=c25(a25,context);const v26=c26(a26,context);const v27=c27(a27,context);const v28=c28(a28,context);const v29=c29(a29,context);const v30=c30(a30,context);const v31=c31(a31,context);const v32=c32(a32,context);return __fn5(v0,v1,v2,v3,v4,v5,v6,v7,v8,v9,v10,v11,v12,v13,v14,v15,v16,v17,v18,v19,v20,v21,v22,v23,v24,v25,v26,v27,v28,v29,v30,v31,v32);};})()]]));

export const valueCodecs=(()=>{const codecs={};for(const [name,s] of Object.entries(metadata.wire.functions)){if(s.unsupported)continue;let value;Object.defineProperty(codecs,name,{enumerable:true,get:()=>value??=(Object.freeze(Object.hasOwn(__wireReaders,name)?{arguments:createCompiledValueCodec(s.arguments,__wireReaders[name][0]),result:createCompiledValueCodec(s.result,__wireReaders[name][1])}:{arguments:new ValueCodec(s.arguments),result:new ValueCodec(s.result)}))});}return Object.freeze(codecs);})();
function __callEncoded(name,bytes,limits,compact){
 const f=metadata.functions.find(f=>f.name===name&&!f.internal),codecs=valueCodecs[name];
 if(!f||!codecs)throw Error('unsupported binary function');
 const input=compact?codecs.arguments.compact():codecs.arguments,output=compact?codecs.result.compact():codecs.result;
 const entry=__compiledEntries.get(name);
 if(entry){
  const slot=compact?1:0;
  entry.argumentCodecs[slot]??=(entry.boundaryReaders[slot]?createFusedValueCodec:createCompiledValueCodec)(metadata.wire.functions[name].arguments,entry.arguments);
  const decoder=entry.argumentCodecs[slot];
  const values=(compact?decoder.compact():decoder).decode(bytes,limits),args=f.params.map(p=>values[p.name]);
  if(entry.precondition!==null&&__implementations[entry.precondition](...args)!==true)throw Error('contract precondition failed');
  return __compiledEncodeResult(entry,__implementations[entry.index](...args),limits,compact);
 }
 const values=input.decode(bytes,limits);
 const result=call(name,f.params.map(p=>values[p.name]));
 return output.encode(result,limits);
}
export function callBinary(name,bytes,limits={}){return __callEncoded(name,bytes,limits,false);}
export function callCompact(name,bytes,limits={}){return __callEncoded(name,bytes,limits,true);}
// Same stable, well-typed caller inputs as call; the result owns every container.
// The checked source return type justifies trusted copying, not arbitrary input.
export function callOwned(name,args,limits={}){
 if(!Object.hasOwn(__ownedFunctions,name)||!Object.hasOwn(functions,name))throw Error('unsupported owned function');
 const result=__ownedImplementations[name](...args);return __ownedFunctions[name](result,createValueCaptureBudget(limits),0);
}
function __privateCapture2(value,budget,depth=0){budget.enter(depth,4);if(!Array.isArray(value)&&!(ArrayBuffer.isView(value)&&!(value instanceof DataView))){throw Error('invalid value for wire schema');}const n=value.length;if(n>budget.remaining){throw Error('invalid value for wire schema');}budget.add(4);const out=new Array(n);for(let i=0;i<n;i++)out[i]=__privateCapture3(value[i],budget,depth+1);return out;}
function __privateCapture3(value,budget,depth=0){budget.enter(depth,4);if(!Array.isArray(value)&&!(ArrayBuffer.isView(value)&&!(value instanceof DataView))){throw Error('invalid value for wire schema');}const n=value.length;if(n>budget.remaining){throw Error('invalid value for wire schema');}budget.add(4);const out=new Array(n);for(let i=0;i<n;i++)out[i]=__privateCapture4(value[i],budget,depth+1);return out.every(x=>typeof x==='number')?Float32Array.from(out):out;}
function __privateCapture0(value,budget,depth=0){budget.enter(depth,4);if(!Array.isArray(value)&&!(ArrayBuffer.isView(value)&&!(value instanceof DataView))){throw Error('invalid value for wire schema');}const n=value.length;if(n>budget.remaining){throw Error('invalid value for wire schema');}budget.add(4);const out=new Array(n);for(let i=0;i<n;i++)out[i]=__privateCapture1(value[i],budget,depth+1);return out;}
function __privateCapture4(value,budget,depth=0){budget.enter(depth,4);let bits;if(typeof value==='number'&&Number.isFinite(value)){bits=__bits(value);if(!Number.isFinite(__float(bits))){throw Error('invalid value for wire schema');}}else{if(!(value!==null&&typeof value==='object'&&Object.hasOwn(value,'F32Bits')&&Object.keys(value).length===1)){throw Error('invalid value for wire schema');}bits=value.F32Bits;if(!Number.isInteger(bits)||bits<0||bits>4294967295){throw Error('invalid value for wire schema');}}budget.add(4);return __nfFromBits(bits);}
function __privateCapture1(value,budget,depth=0){budget.enter(depth,4);if(typeof value!=='number'||!Number.isInteger(value)||value<0||value>4294967295){throw Error('invalid value for wire schema');}budget.add(4);return value===0?0:value;}
function __privateWireValue3(reader){const end=reader.frame();const n=reader.count(),value=new Array(n);for(let i=0;i<n;i++)value[i]=__privateWireValue4(reader);reader.finish(end);return value;}
function __privateWireValue4(reader){const end=reader.frame();const n=reader.count(),value=new Array(n);for(let i=0;i<n;i++)value[i]=__privateWireValue5(reader);reader.finish(end);return value;}
function __privateWireValue0(reader){const end=reader.frame();const n=reader.count(),value=new Array(n);for(let i=0;i<n;i++)value[i]=__privateWireValue1(reader);reader.finish(end);return value;}
function __privateWireValue2(reader){const end=reader.frame();const value={};reader.finish(end);return value;}
function __privateWireValue6(reader){const end=reader.frame();const value={["rows_0"]:__privateWireValue3(reader),["rows_1"]:__privateWireValue3(reader),["rows_2"]:__privateWireValue3(reader),["rows_3"]:__privateWireValue3(reader),["rows_4"]:__privateWireValue3(reader),["rows_5"]:__privateWireValue3(reader),["rows_6"]:__privateWireValue3(reader),["rows_7"]:__privateWireValue3(reader),["rows_8"]:__privateWireValue3(reader),["rows_9"]:__privateWireValue3(reader),["rows_10"]:__privateWireValue3(reader),["rows_11"]:__privateWireValue3(reader),["rows_12"]:__privateWireValue3(reader),["rows_13"]:__privateWireValue3(reader),["rows_14"]:__privateWireValue3(reader),["rows_15"]:__privateWireValue3(reader),["rows_16"]:__privateWireValue3(reader),["rows_17"]:__privateWireValue3(reader),["rows_18"]:__privateWireValue3(reader),["rows_19"]:__privateWireValue3(reader),["rows_20"]:__privateWireValue3(reader),["rows_21"]:__privateWireValue3(reader),["rows_22"]:__privateWireValue3(reader),["rows_23"]:__privateWireValue3(reader),["rows_24"]:__privateWireValue3(reader),["rows_25"]:__privateWireValue3(reader),["rows_26"]:__privateWireValue3(reader),["rows_27"]:__privateWireValue3(reader),["rows_28"]:__privateWireValue3(reader),["rows_29"]:__privateWireValue3(reader),["rows_30"]:__privateWireValue3(reader),["rows_31"]:__privateWireValue3(reader),["id"]:__privateWireValue1(reader)};reader.finish(end);return value;}
function __privateWireValue7(reader){const end=reader.frame();const value={["rows_0"]:__privateWireValue3(reader),["rows_1"]:__privateWireValue3(reader),["rows_2"]:__privateWireValue3(reader),["rows_3"]:__privateWireValue3(reader),["rows_4"]:__privateWireValue3(reader),["rows_5"]:__privateWireValue3(reader),["rows_6"]:__privateWireValue3(reader),["rows_7"]:__privateWireValue3(reader),["rows_8"]:__privateWireValue3(reader),["rows_9"]:__privateWireValue3(reader),["rows_10"]:__privateWireValue3(reader),["rows_11"]:__privateWireValue3(reader),["rows_12"]:__privateWireValue3(reader),["rows_13"]:__privateWireValue3(reader),["rows_14"]:__privateWireValue3(reader),["rows_15"]:__privateWireValue3(reader),["rows_16"]:__privateWireValue3(reader),["rows_17"]:__privateWireValue3(reader),["rows_18"]:__privateWireValue3(reader),["rows_19"]:__privateWireValue3(reader),["rows_20"]:__privateWireValue3(reader),["rows_21"]:__privateWireValue3(reader),["rows_22"]:__privateWireValue3(reader),["rows_23"]:__privateWireValue3(reader),["rows_24"]:__privateWireValue3(reader),["rows_25"]:__privateWireValue3(reader),["rows_26"]:__privateWireValue3(reader),["rows_27"]:__privateWireValue3(reader),["rows_28"]:__privateWireValue3(reader),["rows_29"]:__privateWireValue3(reader),["rows_30"]:__privateWireValue3(reader),["rows_31"]:__privateWireValue3(reader),["ids"]:__privateWireValue0(reader)};reader.finish(end);return value;}
function __privateWireValue5(reader){const end=reader.frame();const value=__nfFromBits(reader.word());reader.finish(end);return value;}
function __privateWireValue1(reader){const end=reader.frame();const value=reader.word();reader.finish(end);return value;}
function __compiledOwnedValue2(value,budget,depth){budget.enter(depth,8);const n=value.length;if(n>budget.remaining)throw Error('wire sequence size');const out=new Array(n);for(let i=0;i<n;i++)out[i]=__compiledOwnedValue3(value[i],budget,depth+1);return out;}
function __compiledOwnedValue3(value,budget,depth){budget.enter(depth,8);const n=value.length;if(n>budget.remaining)throw Error('wire sequence size');const out=new Array(n);for(let i=0;i<n;i++)out[i]=__compiledOwnedValue4(value[i],budget,depth+1);return out;}
function __compiledOwnedValue0(value,budget,depth){budget.enter(depth,8);const n=value.length;if(n>budget.remaining)throw Error('wire sequence size');const out=new Array(n);for(let i=0;i<n;i++)out[i]=__compiledOwnedValue1(value[i],budget,depth+1);return out;}
function __compiledOwnedValue4(value,budget,depth){budget.enter(depth,8);const bits=typeof value==='number'?__bits(value):value.F32Bits;return {F32Bits:bits===0?0:bits};}
function __compiledOwnedValue1(value,budget,depth){budget.enter(depth,8);return value>>>0;}
function __destinationOwnedValue1(value,budget,depth){budget.enter(depth,8);return __nfOutput(value);}
function __destinationOwnedValue0(value,budget,depth){budget.enter(depth,8);return value>>>0;}
function __privateWireWrite2(writer,value,compact){const frame=writer.openFrame();writer.count(value.length);for(let i=0;i<value.length;i++)__privateWireWrite3(writer,value[i],compact);writer.closeFrame(frame);}
function __privateWireWrite3(writer,value,compact){const frame=writer.openFrame();writer.count(value.length);for(let i=0;i<value.length;i++)__privateWireWrite4(writer,value[i],compact);writer.closeFrame(frame);}
function __privateWireWrite0(writer,value,compact){const frame=writer.openFrame();writer.count(value.length);for(let i=0;i<value.length;i++)__privateWireWrite1(writer,value[i],compact);writer.closeFrame(frame);}
function __privateWireWrite4(writer,value,compact){const frame=writer.openFrame();writer.word(__nfBits(value));writer.closeFrame(frame);}
function __privateWireWrite1(writer,value,compact){const frame=writer.openFrame();writer.word(value);writer.closeFrame(frame);}
// Handles have no mutable private payload surface. Membership and type identity
// are checked by this module's closure; copied/foreign objects cannot forge them.
const __compiledHandles=new WeakMap();
const __compiledBindings=new WeakMap();
function __compiledHandle(identity,value,guaranteed=false){
 const handle=Object.freeze(Object.create(null));
 __compiledHandles.set(handle,{identity,value,guaranteed});return handle;
}
function __compiledEntry(handle,identity){
 const entry=__compiledHandles.get(handle);
 if(!entry||entry.identity!==identity)throw Error('compiled value type or owner mismatch');
 return entry;
}
function __compiledUnwrap(handle,identity){return __compiledEntry(handle,identity).value;}
// Emit the portable schema's framing/scalar events without creating a buffer
// or exposing private composite nodes. Only this wrapper receives callbacks
// from the literal writer; host visitors never receive those closures.
function __compiledValueEvents(sink,limits){
 const methods=['begin','end','byte','word','wide','text','count'];
 for(const name of methods)if(typeof sink?.[name]!=='function')throw Error('compiled value visitor method: '+name);
 const budget=createValueCaptureBudget(limits);let depth=0,closed=false;
 const active=()=>{if(closed)throw Error('compiled value visitor is closed');};
 const writer=Object.freeze({
  openFrame(){active();budget.enter(depth,4);depth++;sink.begin();return 0;}
  ,closeFrame(){active();if(depth===0)throw Error('wire frame boundary');try{sink.end();}finally{depth--;}}
  ,frame(emit){active();budget.enter(depth,4);depth++;sink.begin();try{emit();sink.end();}finally{depth--;}}
  ,byte(value){active();budget.add(1);sink.byte(value);}
  ,word(value){active();budget.add(4);sink.word(value);}
  ,wide(value){active();budget.add(8);sink.wide(value);}
  ,text(value){active();budget.text(value);sink.text(value);}
  ,count(value){active();budget.add(4);if(value>budget.remaining)throw Error('wire sequence size');sink.count(value);}
 });
 return {writer,close(){closed=true;}};
}
function __compiledReduction(factory,root,reduce,identity){
 if(typeof factory!=='function')throw Error('compiled reduction factory');
 const reducers=[],seen=new Set(),nodes=__reductionNodes();
 const prepare=index=>{
  if(seen.has(index))return;seen.add(index);
  const node=nodes[index];
  for(const child of node.children)prepare(child);
  const reducer=factory(node,index);
  if(node.kind==='list'||node.kind==='vector'){
   const start=reducer?.start,step=reducer?.step,finish=reducer?.finish;
   if(typeof start!=='function'||typeof step!=='function'||typeof finish!=='function')throw Error('compiled collection reduction');
   reducers[index]=Object.freeze({start,step,finish});
  }else{
   if(typeof reducer!=='function')throw Error('compiled value reduction');
   reducers[index]=reducer;
  }
 };
 prepare(root);Object.freeze(reducers);
 return Object.freeze(function(handle,context,limits={}){
  const value=__compiledUnwrap(handle,identity),budget=createValueCaptureBudget(limits);
  return reduce(value,reducers,budget,0,context);
 });
}
function __compiledCodec(schema,capture,read,write,copy,constructorRoot,reductionRoot,reduce,portableFused=false,compactFused=false){
 const privateCodec=createCompiledValueCodec(schema,read),publicCodec=privateCodec;
 let fusedCodec;const fused=()=>fusedCodec??=createFusedValueCodec(schema,read);
 const identity=schema.identity;
 const codec=Object.freeze({
  identity,
  descriptor:publicCodec.descriptor,
  resolve(type){return publicCodec.resolve(type);},
  capture(value,limits={}){
   return __compiledHandle(identity,capture(value,createValueCaptureBudget(limits),0));
  },
  decode(bytes,limits={}){return __compiledHandle(identity,(portableFused?fused():privateCodec).decode(bytes,limits));},
  decodeCompact(bytes,limits={}){return __compiledHandle(identity,(compactFused?fused():privateCodec).compact().decode(bytes,limits));},
  decodeFused(bytes,limits={}){return __compiledHandle(identity,fused().decode(bytes,limits));},
  decodeCompactFused(bytes,limits={}){return __compiledHandle(identity,fused().compact().decode(bytes,limits));},
  encode(handle,limits={}){const value=__compiledUnwrap(handle,identity);return publicCodec.encodeWith(writer=>write(writer,value,false),limits);},
  encodeCompact(handle,limits={}){const value=__compiledUnwrap(handle,identity);return publicCodec.compact().encodeWith(writer=>write(writer,value,true),limits);},
  materialize(handle,limits={}){return copy(__compiledUnwrap(handle,identity),createValueCaptureBudget(limits),0);},
  builder(limits={}){return __valueBuilder(__constructorNodes(),constructorRoot,identity,limits);},
  reducer(factory){return __compiledReduction(factory,reductionRoot,reduce,identity);},
  visit(handle,sink,limits={}){
   const value=__compiledUnwrap(handle,identity),events=__compiledValueEvents(sink,limits);
   try{write(events.writer,value,false);}finally{events.close();}
  },
 });
 __compiledBindings.set(codec,{publicCodec,write,capture});return codec;
}

function __compiledEncodeResult(entry,value,limits,compact){
 const {publicCodec,write}=__compiledBindings.get(entry.result());
 return (compact?publicCodec.compact():publicCodec).encodeWith(writer=>write(writer,value,compact),limits);
}
let __constructorNodesValue;function __constructorNodes(){return __constructorNodesValue??=[{kind:"list",patterns:[{bytes:8,label:"sequence",children:[1],childDepth:1,sequence:true,charge:(budget,depth)=>{budget.enter(depth,8);},make:values=>(values)}]},{kind:"u32",scalar:__privateCapture1},{kind:"list",patterns:[{bytes:8,label:"sequence",children:[3],childDepth:1,sequence:true,charge:(budget,depth)=>{budget.enter(depth,8);},make:values=>(values)}]},{kind:"list",patterns:[{bytes:8,label:"sequence",children:[4],childDepth:1,sequence:true,charge:(budget,depth)=>{budget.enter(depth,8);},make:values=>(values)}]},{kind:"f32",scalar:__privateCapture4}];}
// Typed input construction only: plans contain literal constructor/capture
// functions emitted from source schemas. No source expression evaluator.
// All frames and private values remain in this closure; callers receive only
// an owned opaque handle after one complete, well-typed root is constructed.
const __constructorPaths=new WeakMap();
function __valueBuilder(nodes,root,identity,limits){
 const budget=createValueCaptureBudget(limits),frames=[];
 let result,targetNode,targetDepth,complete=false,closed=false,failed=false,busy=false;
 const fail=message=>{failed=true;frames.length=0;result=undefined;throw Error(message);};
 const active=()=>{if(failed||closed)throw Error('value builder is closed');};
 const expected=()=>{
  if(!frames.length){if(complete)fail('value builder root already complete');targetNode=root;targetDepth=0;return;}
  const frame=frames.at(-1),position=frame.values.length;
  if(!frame.pattern.sequence&&position>=frame.pattern.children.length)fail('value builder constructor is full');
  targetNode=frame.pattern.sequence?frame.pattern.children[0]:frame.pattern.children[position];targetDepth=frame.depth+frame.pattern.childDepth;
 };
 const accept=value=>{
  if(frames.length)frames.at(-1).values.push(value);
  else{result=value;complete=true;}
 };
 const execute=(operation,first,second)=>{
  active();if(busy)throw Error('value builder operation already active');busy=true;
  try{return operation(first,second);}catch(error){failed=true;frames.length=0;result=undefined;throw error;}finally{busy=false;}
 };
 // Compile and cache constructor paths independently of the session's values.
 const pathPlan=(choices,startNode,startDepth)=>{
   if(!Array.isArray(choices)||choices.length===0||choices.length>128)fail('invalid value builder path');
   let cache=__constructorPaths.get(nodes);if(!cache){cache=new WeakMap();__constructorPaths.set(nodes,cache);}
   let entries=cache.get(choices),saved=entries?.get(startNode);
   if(saved)return saved;
   const path=[],charges=[];let node=startNode,depth=startDepth;
   for(let i=0;i<choices.length;i++){
    const choice=choices[i],patterns=nodes[node].patterns;
    if(!Number.isSafeInteger(choice)||choice<0||!patterns||choice>=patterns.length)fail('invalid value builder constructor');
    const pattern=patterns[choice];charges.push([pattern,depth-startDepth]);path.push({pattern,node:nodes[node]});
    if(i+1<choices.length){if(pattern.sequence||pattern.children.length!==1)fail('value builder path is not unary');node=pattern.children[0];depth+=pattern.childDepth;}
   }
   const terminal=path.at(-1).pattern;
   // Compose literal constructor functions once per path, instead of
   // allocating and interpreting another recursive closure for every value.
   const compose=at=>{
    const {pattern,node}=path[at];
    if(node.flat){
     let index=0,last=at;
     while(last<path.length&&path[last].node.kind==='result'){
      if(path[last].pattern.sumBranch===0)break;
      index++;last++;
     }
     if(last===path.length){
      let make=args=>args[0];
      for(let i=path.length-1;i>=at;i--){const inner=make,p=path[i].pattern;make=args=>p.make([inner(args)]);}
      return make;
     }
     const payload=path[last].node.kind==='result'?(last+1<path.length?compose(last+1):args=>args[0]):compose(last);
     return args=>node.flat(index,payload(args));
    }
    const inner=at+1<path.length?compose(at+1):null;
    if(pattern.transparent)return inner??(args=>args[0]);
    return inner?args=>pattern.make([inner(args)]):pattern.make;
   };
   const make=compose(0);
   // Scalar paths use the same literal constructors, but pass the leaf
   // directly through erased records and flat sums. No temporary argument
   // array is needed at those edges. Ordinary constructors keep their array
   // calling convention; no private value reaches the public builder API.
   const composeScalar=at=>{
    const {pattern,node}=path[at];
    if(node.flat){
     let index=0,last=at;
     while(last<path.length&&path[last].node.kind==='result'){
      if(path[last].pattern.sumBranch===0)break;
      index++;last++;
     }
     if(last===path.length){
      let make=value=>value;
      for(let i=path.length-1;i>=at;i--){const inner=make,p=path[i].pattern;make=value=>p.make([inner(value)]);}
      return make;
     }
     const payload=path[last].node.kind==='result'?(last+1<path.length?composeScalar(last+1):value=>value):composeScalar(last);
     return value=>node.flat(index,payload(value));
    }
    const inner=at+1<path.length?composeScalar(at+1):null;
    if(pattern.transparent)return inner??(value=>value);
    return inner?value=>pattern.make([inner(value)]):value=>pattern.make([value]);
   };
   const scalar=composeScalar(0);
   const pattern={...terminal,make};
   // Only frozen arrays of ordinary data properties can key reusable plans.
   // Mutable arrays and frozen accessor arrays retain checked per-call paths.
   const fixed=charges.every(([p])=>Number.isSafeInteger(p.bytes)&&p.bytes>=4);
   const plan={pattern,scalar,charges,offset:depth-startDepth,bytes:fixed?charges.reduce((n,[p])=>n+p.bytes,0):null};
   let reusable=Object.isFrozen(choices);
   for(let i=0;reusable&&i<choices.length;i++){const field=Object.getOwnPropertyDescriptor(choices,String(i));reusable=!!field&&Object.hasOwn(field,'value');}
   if(reusable){
    if(!entries){entries=new Map();cache.set(choices,entries);}entries.set(startNode,plan);
   }
   return plan;
 };
 const chargePath=(plan,depth)=>{
  // Each emitted constructor consumes one node and a fixed frame/tag cost.
  // Only take the combined charge when every original check would succeed.
  // Replaying the original order retains the exact first failure otherwise.
  if(plan.bytes!==null&&depth+plan.offset<=budget.depth&&plan.charges.length<=budget.remaining&&budget.bytes+plan.bytes<=budget.limit){
   budget.remaining-=plan.charges.length;budget.bytes+=plan.bytes;return;
  }
  for(const [pattern,offset]of plan.charges)pattern.charge(budget,depth+offset);
 };
 // Operations are allocated once per session, and share expected-node
 // scratch only while the existing reentrancy guard is held.
 const openOperation=(choice)=>{
   expected();const node=nodes[targetNode];
   if(!Number.isSafeInteger(choice)||choice<0||!node.patterns||choice>=node.patterns.length)fail('invalid value builder constructor');
   const pattern=node.patterns[choice];pattern.charge(budget,targetDepth);
   frames.push({pattern,depth:targetDepth,values:[]});
 };
 const openPathOperation=(choices)=>{
   expected();const plan=pathPlan(choices,targetNode,targetDepth);
   chargePath(plan,targetDepth);
   frames.push({pattern:plan.pattern,depth:targetDepth+plan.offset,values:[]});
 };
 const scalarPathOperation=(choices,value)=>{
   expected();const plan=pathPlan(choices,targetNode,targetDepth),pattern=plan.pattern;
   if(pattern.sequence||pattern.children.length!==1)fail('value builder path has no scalar leaf');
   const capture=nodes[pattern.children[0]].scalar;
   if(typeof capture!=='function')fail('value builder path has no scalar leaf');
   chargePath(plan,targetDepth);
   const leaf=capture(value,budget,targetDepth+plan.offset+pattern.childDepth);
   accept(plan.scalar(leaf));
 };
 const emptyPathOperation=(choices)=>{
   expected();const plan=pathPlan(choices,targetNode,targetDepth),pattern=plan.pattern;
   if(pattern.sequence||pattern.children.length!==0)fail('value builder path is not empty');
   chargePath(plan,targetDepth);accept(pattern.make([]));
 };
 const scalarOperation=(value)=>{
   expected();const capture=nodes[targetNode].scalar;
   if(typeof capture!=='function')fail('value builder expects a constructor');
   accept(capture(value,budget,targetDepth));
 };
 const closeOperation=()=>{
   if(!frames.length)fail('value builder has no open constructor');
   const frame=frames.at(-1),pattern=frame.pattern,count=frame.values.length;
   if(!pattern.sequence&&count!==pattern.children.length||pattern.size!==undefined&&count!==pattern.size)fail('value builder constructor arity');
   if(pattern.sequence&&count>budget.limit)fail('wire sequence size');
   const value=pattern.make(frame.values);
   frames.pop();accept(value);
 };
 const finishOperation=()=>{
   if(frames.length||!complete)fail('value builder root is incomplete');
   closed=true;const handle=__compiledHandle(identity,result);result=undefined;return handle;
 };
 const api=Object.freeze({
  open(choice){return execute(openOperation,choice);},
  // Charge every source constructor even when unary paths share one frame.
  openPath(choices){return execute(openPathOperation,choices);},
  // Complete the path and leaf without intermediate session frames.
  scalarPath(choices,value){return execute(scalarPathOperation,choices,value);},
  emptyPath(choices){return execute(emptyPathOperation,choices);},
  scalar(value){return execute(scalarOperation,value);},
  close(){return execute(closeOperation);},
  finish(){return execute(finishOperation);},
  abort(){if(busy)throw Error('value builder operation already active');failed=true;frames.length=0;result=undefined;},
 });
 return api;
}
function __reduceValue0(value,r,b,d,c){b.enter(d,8);const n=value.length;if(n>b.remaining)throw Error('wire sequence size');const a=r[0];let out=a.start(n,c);for(let i=0;i<n;i++)out=a.step(out,__reduceValue1(value[i],r,b,d+1,c),i,c);return a.finish(out,c);}
function __reduceValue1(value,r,b,d,c){b.enter(d,8);return r[1](value,c);}
function __reduceValue2(value,r,b,d,c){b.enter(d,8);const n=value.length;if(n>b.remaining)throw Error('wire sequence size');const a=r[2];let out=a.start(n,c);for(let i=0;i<n;i++)out=a.step(out,__reduceValue3(value[i],r,b,d+1,c),i,c);return a.finish(out,c);}
function __reduceValue3(value,r,b,d,c){b.enter(d,8);const n=value.length;if(n>b.remaining)throw Error('wire sequence size');const a=r[3];let out=a.start(n,c);for(let i=0;i<n;i++)out=a.step(out,__reduceValue4(value[i],r,b,d+1,c),i,c);return a.finish(out,c);}
function __reduceValue4(value,r,b,d,c){b.enter(d,8);return r[4]({F32Bits:__nfBits(value)},c);}
let __reductionNodeCache;function __reductionNodes(){return __reductionNodeCache??=Object.freeze([Object.freeze({"children":Object.freeze([1]),"kind":"list"}),Object.freeze({"children":Object.freeze([]),"kind":"u32"}),Object.freeze({"children":Object.freeze([3]),"kind":"list"}),Object.freeze({"children":Object.freeze([4]),"kind":"list"}),Object.freeze({"children":Object.freeze([]),"kind":"f32"})]);}
function __compiledNamed0(){return {};}
let __compiledCodec0Value;function __compiledCodec0(){return __compiledCodec0Value??=__compiledCodec({"format":"ink-value-wire-v1","identity":"69ebf947aa59a2546656d1976b0baa6e56e7182d989425379b31e3bff74168ca","named":__compiledNamed0(),"root":{"element":{"kind":"u32"},"kind":"list"}},__privateCapture0,__privateWireValue0,__privateWireWrite0,__compiledOwnedValue0,0,0,__reduceValue0,false,false);}
let __compiledCodec1Value;function __compiledCodec1(){return __compiledCodec1Value??=__compiledCodec({"format":"ink-value-wire-v1","identity":"10f1dcead19744e0a592fb45cc3a7937377e3d50ca1c195e603898f63e9b4264","named":__compiledNamed0(),"root":{"element":{"element":{"kind":"f32"},"kind":"list"},"kind":"list"}},__privateCapture2,__privateWireValue3,__privateWireWrite2,__compiledOwnedValue2,2,2,__reduceValue2,false,false);}
let __compiledCodec2Value;function __compiledCodec2(){return __compiledCodec2Value??=__compiledCodec({"format":"ink-value-wire-v1","identity":"51f75af7953a9d922f9ada927ffd8d0c8c476597ed69294f0a0425f75b052cff","named":__compiledNamed0(),"root":{"kind":"u32"}},__privateCapture1,__privateWireValue1,__privateWireWrite1,__compiledOwnedValue1,1,1,__reduceValue1,false,false);}
let __compiledCodec3Value;function __compiledCodec3(){return __compiledCodec3Value??=__compiledCodec({"format":"ink-value-wire-v1","identity":"0cbb9d1ff6b72318080ea11a6297b384d97178624f821e3901cca51ec8ad4477","named":__compiledNamed0(),"root":{"element":{"kind":"f32"},"kind":"list"}},__privateCapture3,__privateWireValue4,__privateWireWrite3,__compiledOwnedValue3,3,3,__reduceValue3,false,false);}
const __compiledEntries=new Map([["coordinates",{index:0,params:[],result:__compiledCodec0,destination:{copy:__destinationOwnedValue0,direct:__into0},arguments:__privateWireValue2,argumentCodecs:[null,null],boundaryReaders:[false,false],onlyTypeGuards:false,needsInvariants:[],precondition:null}],["row",{index:1,params:[__compiledCodec1,__compiledCodec1,__compiledCodec1,__compiledCodec1,__compiledCodec1,__compiledCodec1,__compiledCodec1,__compiledCodec1,__compiledCodec1,__compiledCodec1,__compiledCodec1,__compiledCodec1,__compiledCodec1,__compiledCodec1,__compiledCodec1,__compiledCodec1,__compiledCodec1,__compiledCodec1,__compiledCodec1,__compiledCodec1,__compiledCodec1,__compiledCodec1,__compiledCodec1,__compiledCodec1,__compiledCodec1,__compiledCodec1,__compiledCodec1,__compiledCodec1,__compiledCodec1,__compiledCodec1,__compiledCodec1,__compiledCodec1,__compiledCodec2],result:__compiledCodec3,destination:{copy:__destinationOwnedValue1,direct:__into1},arguments:__privateWireValue6,argumentCodecs:[null,null],boundaryReaders:[false,false],onlyTypeGuards:false,needsInvariants:[false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false],precondition:null}],["short_mean",{index:3,params:[__compiledCodec1,__compiledCodec1,__compiledCodec1,__compiledCodec1,__compiledCodec1,__compiledCodec1,__compiledCodec1,__compiledCodec1,__compiledCodec1,__compiledCodec1,__compiledCodec1,__compiledCodec1,__compiledCodec1,__compiledCodec1,__compiledCodec1,__compiledCodec1,__compiledCodec1,__compiledCodec1,__compiledCodec1,__compiledCodec1,__compiledCodec1,__compiledCodec1,__compiledCodec1,__compiledCodec1,__compiledCodec1,__compiledCodec1,__compiledCodec1,__compiledCodec1,__compiledCodec1,__compiledCodec1,__compiledCodec1,__compiledCodec1,__compiledCodec0],result:__compiledCodec3,destination:{copy:__destinationOwnedValue1,direct:__into3},arguments:__privateWireValue7,argumentCodecs:[null,null],boundaryReaders:[false,false],onlyTypeGuards:false,needsInvariants:[false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false],precondition:null}],["long_mean",{index:4,params:[__compiledCodec1,__compiledCodec1,__compiledCodec1,__compiledCodec1,__compiledCodec1,__compiledCodec1,__compiledCodec1,__compiledCodec1,__compiledCodec1,__compiledCodec1,__compiledCodec1,__compiledCodec1,__compiledCodec1,__compiledCodec1,__compiledCodec1,__compiledCodec1,__compiledCodec1,__compiledCodec1,__compiledCodec1,__compiledCodec1,__compiledCodec1,__compiledCodec1,__compiledCodec1,__compiledCodec1,__compiledCodec1,__compiledCodec1,__compiledCodec1,__compiledCodec1,__compiledCodec1,__compiledCodec1,__compiledCodec1,__compiledCodec1,__compiledCodec0],result:__compiledCodec3,destination:{copy:__destinationOwnedValue1,direct:__into4},arguments:__privateWireValue7,argumentCodecs:[null,null],boundaryReaders:[false,false],onlyTypeGuards:false,needsInvariants:[false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false],precondition:null}],["encode",{index:5,params:[__compiledCodec1,__compiledCodec1,__compiledCodec1,__compiledCodec1,__compiledCodec1,__compiledCodec1,__compiledCodec1,__compiledCodec1,__compiledCodec1,__compiledCodec1,__compiledCodec1,__compiledCodec1,__compiledCodec1,__compiledCodec1,__compiledCodec1,__compiledCodec1,__compiledCodec1,__compiledCodec1,__compiledCodec1,__compiledCodec1,__compiledCodec1,__compiledCodec1,__compiledCodec1,__compiledCodec1,__compiledCodec1,__compiledCodec1,__compiledCodec1,__compiledCodec1,__compiledCodec1,__compiledCodec1,__compiledCodec1,__compiledCodec1,__compiledCodec0],result:__compiledCodec3,destination:{copy:__destinationOwnedValue1,direct:__into5},arguments:__privateWireValue7,argumentCodecs:[null,null],boundaryReaders:[false,false],onlyTypeGuards:false,needsInvariants:[false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false],precondition:null}]]);

export const compiledValues=Object.freeze(Object.fromEntries([...__compiledEntries].map(([name,entry])=>[name,Object.freeze({get params(){return Object.freeze(entry.params.map(codec=>codec()));},get result(){return entry.result();}})])));
function __compiledValidate(entry,owned){
 const values=owned.map(v=>v.value);
 const established=entry.onlyTypeGuards&&entry.needsInvariants.every((needed,i)=>!needed||owned[i].guaranteed);
 if(entry.precondition!==null&&!established){
  if(__implementations[entry.precondition](...values)!==true)throw Error('contract precondition failed');
  for(let i=0;i<owned.length;i++)if(entry.needsInvariants[i])owned[i].guaranteed=true;
 }
 return values;
}
export function callCompiled(name,args){
 const entry=__compiledEntries.get(name);
 if(!entry||!Array.isArray(args)||args.length!==entry.params.length)throw Error('unsupported compiled call');
 const owned=entry.params.map((codec,i)=>__compiledEntry(args[i],codec().identity)),values=__compiledValidate(entry,owned);
 // Checked source outputs satisfy their declared value interfaces. Private
 // handles expose only detached copies and never retain mutable host inputs.
 return __compiledHandle(entry.result().identity,__implementations[entry.index](...values),true);
}

// Explicit sealed-value partial application. Each token owns a bounded set of
// lexical caches; no mutable host object, global memo table or error is retained.
const __preparedCompiled=new WeakMap();
export function prepareCompiled(name,bindings){
 const entry=__compiledEntries.get(name);
 if(!entry||!Array.isArray(bindings)||bindings.length>entry.params.length)throw Error('unsupported prepared compiled call');
 const captured=new Array(entry.params.length),fixed=new Array(entry.params.length).fill(false);
 for(const binding of bindings){
  if(!Array.isArray(binding)||binding.length!==2)throw Error('prepared compiled binding');
  const [index,handle]=binding;
  if(!Number.isInteger(index)||index<0||index>=fixed.length||fixed[index])throw Error('prepared compiled parameter');
  captured[index]=__compiledEntry(handle,entry.params[index]().identity);fixed[index]=true;
 }
 const remaining=fixed.flatMap((yes,i)=>yes?[]:[i]);
 const factory=__preparedFactories.get(entry.index);
 const run=factory?factory(fixed):__implementations[entry.index];
 const token=Object.freeze(Object.create(null));
 __preparedCompiled.set(token,{entry,captured,remaining,run});return token;
}
export function callPreparedCompiled(token,args){
 const prepared=__preparedCompiled.get(token);
 if(!prepared||!Array.isArray(args)||args.length!==prepared.remaining.length)throw Error('invalid prepared compiled call');
 const {entry,captured,remaining,run}=prepared,owned=captured.slice();
 for(let i=0;i<remaining.length;i++){const at=remaining[i];owned[at]=__compiledEntry(args[i],entry.params[at]().identity);}
 const values=__compiledValidate(entry,owned);
 return __compiledHandle(entry.result().identity,run(...values),true);
}
// The caller owns sufficiently large, disjoint destination storage. This is
// the trusted Into ABI, not a bounded wire/materialization operation. Private
// retained containers never escape: structured elements are deeply detached.
const __destinationBudget=Object.freeze({remaining:Infinity,enter(){},text(){}});
export function callPreparedCompiledInto(token,args,destination){
 const prepared=__preparedCompiled.get(token);
 if(!prepared||!prepared.entry.destination||!Array.isArray(args)||args.length!==prepared.remaining.length)throw Error('invalid prepared compiled destination call');
 const {entry,captured,remaining,run}=prepared,owned=captured.slice();
 for(let i=0;i<remaining.length;i++){const at=remaining[i];owned[at]=__compiledEntry(args[i],entry.params[at]().identity);}
 const values=__compiledValidate(entry,owned),into=entry.destination;
 // Ordinary scalar-list bodies can write the terminal stage directly. A
 // residual body keeps its lexical caches and copies only its final elements.
 if(into.direct&&run===__implementations[entry.index])return into.direct(...values,destination);
 const result=run(...values),n=result.length;
 for(let i=0;i<n;i++)destination[i]=into.copy(result[i],__destinationBudget,0);
 return n;
}
const __intoOutput1=__representation(metadata.functions[1].result.element,true);
const __intoOutput3=__representation(metadata.functions[3].result.element,true);
const __intoOutput4=__representation(metadata.functions[4].result.element,true);
const __intoOutput5=__representation(metadata.functions[5].result.element,true);
const __intoImplementations=[__into0,__into1,null,__into3,__into4,__into5];
export const functionsInto=Object.freeze(Object.fromEntries([["coordinates",(()=>{const input=[],needsInput=input.some(c=>c!==__identity);const needsContext=false;if(true)return __into0;const fallback=(...args)=>{const context=new WeakMap();const values=input.map((convert,i)=>convert(args[i],context));return __into0(...values,args[0]);};return function(destination){if(arguments.length!==1)return fallback(...arguments);const context=(needsContext)?new WeakMap():null;return __into0(destination);};})()],
["row",(()=>{const c0=__representation(__inputTypes[1].types[0],false,__inputTypes[1].capture[0]);const c1=__representation(__inputTypes[1].types[1],false,__inputTypes[1].capture[1]);const c2=__representation(__inputTypes[1].types[2],false,__inputTypes[1].capture[2]);const c3=__representation(__inputTypes[1].types[3],false,__inputTypes[1].capture[3]);const c4=__representation(__inputTypes[1].types[4],false,__inputTypes[1].capture[4]);const c5=__representation(__inputTypes[1].types[5],false,__inputTypes[1].capture[5]);const c6=__representation(__inputTypes[1].types[6],false,__inputTypes[1].capture[6]);const c7=__representation(__inputTypes[1].types[7],false,__inputTypes[1].capture[7]);const c8=__representation(__inputTypes[1].types[8],false,__inputTypes[1].capture[8]);const c9=__representation(__inputTypes[1].types[9],false,__inputTypes[1].capture[9]);const c10=__representation(__inputTypes[1].types[10],false,__inputTypes[1].capture[10]);const c11=__representation(__inputTypes[1].types[11],false,__inputTypes[1].capture[11]);const c12=__representation(__inputTypes[1].types[12],false,__inputTypes[1].capture[12]);const c13=__representation(__inputTypes[1].types[13],false,__inputTypes[1].capture[13]);const c14=__representation(__inputTypes[1].types[14],false,__inputTypes[1].capture[14]);const c15=__representation(__inputTypes[1].types[15],false,__inputTypes[1].capture[15]);const c16=__representation(__inputTypes[1].types[16],false,__inputTypes[1].capture[16]);const c17=__representation(__inputTypes[1].types[17],false,__inputTypes[1].capture[17]);const c18=__representation(__inputTypes[1].types[18],false,__inputTypes[1].capture[18]);const c19=__representation(__inputTypes[1].types[19],false,__inputTypes[1].capture[19]);const c20=__representation(__inputTypes[1].types[20],false,__inputTypes[1].capture[20]);const c21=__representation(__inputTypes[1].types[21],false,__inputTypes[1].capture[21]);const c22=__representation(__inputTypes[1].types[22],false,__inputTypes[1].capture[22]);const c23=__representation(__inputTypes[1].types[23],false,__inputTypes[1].capture[23]);const c24=__representation(__inputTypes[1].types[24],false,__inputTypes[1].capture[24]);const c25=__representation(__inputTypes[1].types[25],false,__inputTypes[1].capture[25]);const c26=__representation(__inputTypes[1].types[26],false,__inputTypes[1].capture[26]);const c27=__representation(__inputTypes[1].types[27],false,__inputTypes[1].capture[27]);const c28=__representation(__inputTypes[1].types[28],false,__inputTypes[1].capture[28]);const c29=__representation(__inputTypes[1].types[29],false,__inputTypes[1].capture[29]);const c30=__representation(__inputTypes[1].types[30],false,__inputTypes[1].capture[30]);const c31=__representation(__inputTypes[1].types[31],false,__inputTypes[1].capture[31]);const c32=__representation(__inputTypes[1].types[32],false,__inputTypes[1].capture[32]);const input=[c0,c1,c2,c3,c4,c5,c6,c7,c8,c9,c10,c11,c12,c13,c14,c15,c16,c17,c18,c19,c20,c21,c22,c23,c24,c25,c26,c27,c28,c29,c30,c31,c32],needsInput=input.some(c=>c!==__identity);const needsContext=(c0!==__identity||c1!==__identity||c2!==__identity||c3!==__identity||c4!==__identity||c5!==__identity||c6!==__identity||c7!==__identity||c8!==__identity||c9!==__identity||c10!==__identity||c11!==__identity||c12!==__identity||c13!==__identity||c14!==__identity||c15!==__identity||c16!==__identity||c17!==__identity||c18!==__identity||c19!==__identity||c20!==__identity||c21!==__identity||c22!==__identity||c23!==__identity||c24!==__identity||c25!==__identity||c26!==__identity||c27!==__identity||c28!==__identity||c29!==__identity||c30!==__identity||c31!==__identity);if(c0===__identity&&c1===__identity&&c2===__identity&&c3===__identity&&c4===__identity&&c5===__identity&&c6===__identity&&c7===__identity&&c8===__identity&&c9===__identity&&c10===__identity&&c11===__identity&&c12===__identity&&c13===__identity&&c14===__identity&&c15===__identity&&c16===__identity&&c17===__identity&&c18===__identity&&c19===__identity&&c20===__identity&&c21===__identity&&c22===__identity&&c23===__identity&&c24===__identity&&c25===__identity&&c26===__identity&&c27===__identity&&c28===__identity&&c29===__identity&&c30===__identity&&c31===__identity&&c32===__identity)return __into1;const fallback=(...args)=>{const context=new WeakMap();const values=input.map((convert,i)=>convert(args[i],context));return __into1(...values,args[33]);};return function(a0,a1,a2,a3,a4,a5,a6,a7,a8,a9,a10,a11,a12,a13,a14,a15,a16,a17,a18,a19,a20,a21,a22,a23,a24,a25,a26,a27,a28,a29,a30,a31,a32,destination){if(arguments.length!==34)return fallback(...arguments);const context=(needsContext||(Number(c0!==__identity&&a0!==null&&typeof a0==='object')+Number(c1!==__identity&&a1!==null&&typeof a1==='object')+Number(c2!==__identity&&a2!==null&&typeof a2==='object')+Number(c3!==__identity&&a3!==null&&typeof a3==='object')+Number(c4!==__identity&&a4!==null&&typeof a4==='object')+Number(c5!==__identity&&a5!==null&&typeof a5==='object')+Number(c6!==__identity&&a6!==null&&typeof a6==='object')+Number(c7!==__identity&&a7!==null&&typeof a7==='object')+Number(c8!==__identity&&a8!==null&&typeof a8==='object')+Number(c9!==__identity&&a9!==null&&typeof a9==='object')+Number(c10!==__identity&&a10!==null&&typeof a10==='object')+Number(c11!==__identity&&a11!==null&&typeof a11==='object')+Number(c12!==__identity&&a12!==null&&typeof a12==='object')+Number(c13!==__identity&&a13!==null&&typeof a13==='object')+Number(c14!==__identity&&a14!==null&&typeof a14==='object')+Number(c15!==__identity&&a15!==null&&typeof a15==='object')+Number(c16!==__identity&&a16!==null&&typeof a16==='object')+Number(c17!==__identity&&a17!==null&&typeof a17==='object')+Number(c18!==__identity&&a18!==null&&typeof a18==='object')+Number(c19!==__identity&&a19!==null&&typeof a19==='object')+Number(c20!==__identity&&a20!==null&&typeof a20==='object')+Number(c21!==__identity&&a21!==null&&typeof a21==='object')+Number(c22!==__identity&&a22!==null&&typeof a22==='object')+Number(c23!==__identity&&a23!==null&&typeof a23==='object')+Number(c24!==__identity&&a24!==null&&typeof a24==='object')+Number(c25!==__identity&&a25!==null&&typeof a25==='object')+Number(c26!==__identity&&a26!==null&&typeof a26==='object')+Number(c27!==__identity&&a27!==null&&typeof a27==='object')+Number(c28!==__identity&&a28!==null&&typeof a28==='object')+Number(c29!==__identity&&a29!==null&&typeof a29==='object')+Number(c30!==__identity&&a30!==null&&typeof a30==='object')+Number(c31!==__identity&&a31!==null&&typeof a31==='object')+Number(c32!==__identity&&a32!==null&&typeof a32==='object'))>1)?new WeakMap():null;const v0=c0(a0,context);const v1=c1(a1,context);const v2=c2(a2,context);const v3=c3(a3,context);const v4=c4(a4,context);const v5=c5(a5,context);const v6=c6(a6,context);const v7=c7(a7,context);const v8=c8(a8,context);const v9=c9(a9,context);const v10=c10(a10,context);const v11=c11(a11,context);const v12=c12(a12,context);const v13=c13(a13,context);const v14=c14(a14,context);const v15=c15(a15,context);const v16=c16(a16,context);const v17=c17(a17,context);const v18=c18(a18,context);const v19=c19(a19,context);const v20=c20(a20,context);const v21=c21(a21,context);const v22=c22(a22,context);const v23=c23(a23,context);const v24=c24(a24,context);const v25=c25(a25,context);const v26=c26(a26,context);const v27=c27(a27,context);const v28=c28(a28,context);const v29=c29(a29,context);const v30=c30(a30,context);const v31=c31(a31,context);const v32=c32(a32,context);return __into1(v0,v1,v2,v3,v4,v5,v6,v7,v8,v9,v10,v11,v12,v13,v14,v15,v16,v17,v18,v19,v20,v21,v22,v23,v24,v25,v26,v27,v28,v29,v30,v31,v32,destination);};})()],
["short_mean",(()=>{const c0=__representation(__inputTypes[3].types[0],false,__inputTypes[3].capture[0]);const c1=__representation(__inputTypes[3].types[1],false,__inputTypes[3].capture[1]);const c2=__representation(__inputTypes[3].types[2],false,__inputTypes[3].capture[2]);const c3=__representation(__inputTypes[3].types[3],false,__inputTypes[3].capture[3]);const c4=__representation(__inputTypes[3].types[4],false,__inputTypes[3].capture[4]);const c5=__representation(__inputTypes[3].types[5],false,__inputTypes[3].capture[5]);const c6=__representation(__inputTypes[3].types[6],false,__inputTypes[3].capture[6]);const c7=__representation(__inputTypes[3].types[7],false,__inputTypes[3].capture[7]);const c8=__representation(__inputTypes[3].types[8],false,__inputTypes[3].capture[8]);const c9=__representation(__inputTypes[3].types[9],false,__inputTypes[3].capture[9]);const c10=__representation(__inputTypes[3].types[10],false,__inputTypes[3].capture[10]);const c11=__representation(__inputTypes[3].types[11],false,__inputTypes[3].capture[11]);const c12=__representation(__inputTypes[3].types[12],false,__inputTypes[3].capture[12]);const c13=__representation(__inputTypes[3].types[13],false,__inputTypes[3].capture[13]);const c14=__representation(__inputTypes[3].types[14],false,__inputTypes[3].capture[14]);const c15=__representation(__inputTypes[3].types[15],false,__inputTypes[3].capture[15]);const c16=__representation(__inputTypes[3].types[16],false,__inputTypes[3].capture[16]);const c17=__representation(__inputTypes[3].types[17],false,__inputTypes[3].capture[17]);const c18=__representation(__inputTypes[3].types[18],false,__inputTypes[3].capture[18]);const c19=__representation(__inputTypes[3].types[19],false,__inputTypes[3].capture[19]);const c20=__representation(__inputTypes[3].types[20],false,__inputTypes[3].capture[20]);const c21=__representation(__inputTypes[3].types[21],false,__inputTypes[3].capture[21]);const c22=__representation(__inputTypes[3].types[22],false,__inputTypes[3].capture[22]);const c23=__representation(__inputTypes[3].types[23],false,__inputTypes[3].capture[23]);const c24=__representation(__inputTypes[3].types[24],false,__inputTypes[3].capture[24]);const c25=__representation(__inputTypes[3].types[25],false,__inputTypes[3].capture[25]);const c26=__representation(__inputTypes[3].types[26],false,__inputTypes[3].capture[26]);const c27=__representation(__inputTypes[3].types[27],false,__inputTypes[3].capture[27]);const c28=__representation(__inputTypes[3].types[28],false,__inputTypes[3].capture[28]);const c29=__representation(__inputTypes[3].types[29],false,__inputTypes[3].capture[29]);const c30=__representation(__inputTypes[3].types[30],false,__inputTypes[3].capture[30]);const c31=__representation(__inputTypes[3].types[31],false,__inputTypes[3].capture[31]);const c32=__representation(__inputTypes[3].types[32],false,__inputTypes[3].capture[32]);const input=[c0,c1,c2,c3,c4,c5,c6,c7,c8,c9,c10,c11,c12,c13,c14,c15,c16,c17,c18,c19,c20,c21,c22,c23,c24,c25,c26,c27,c28,c29,c30,c31,c32],needsInput=input.some(c=>c!==__identity);const needsContext=(c0!==__identity||c1!==__identity||c2!==__identity||c3!==__identity||c4!==__identity||c5!==__identity||c6!==__identity||c7!==__identity||c8!==__identity||c9!==__identity||c10!==__identity||c11!==__identity||c12!==__identity||c13!==__identity||c14!==__identity||c15!==__identity||c16!==__identity||c17!==__identity||c18!==__identity||c19!==__identity||c20!==__identity||c21!==__identity||c22!==__identity||c23!==__identity||c24!==__identity||c25!==__identity||c26!==__identity||c27!==__identity||c28!==__identity||c29!==__identity||c30!==__identity||c31!==__identity||c32!==__identity);if(c0===__identity&&c1===__identity&&c2===__identity&&c3===__identity&&c4===__identity&&c5===__identity&&c6===__identity&&c7===__identity&&c8===__identity&&c9===__identity&&c10===__identity&&c11===__identity&&c12===__identity&&c13===__identity&&c14===__identity&&c15===__identity&&c16===__identity&&c17===__identity&&c18===__identity&&c19===__identity&&c20===__identity&&c21===__identity&&c22===__identity&&c23===__identity&&c24===__identity&&c25===__identity&&c26===__identity&&c27===__identity&&c28===__identity&&c29===__identity&&c30===__identity&&c31===__identity&&c32===__identity)return __into3;const fallback=(...args)=>{const context=new WeakMap();const values=input.map((convert,i)=>convert(args[i],context));return __into3(...values,args[33]);};return function(a0,a1,a2,a3,a4,a5,a6,a7,a8,a9,a10,a11,a12,a13,a14,a15,a16,a17,a18,a19,a20,a21,a22,a23,a24,a25,a26,a27,a28,a29,a30,a31,a32,destination){if(arguments.length!==34)return fallback(...arguments);const context=(needsContext||(Number(c0!==__identity&&a0!==null&&typeof a0==='object')+Number(c1!==__identity&&a1!==null&&typeof a1==='object')+Number(c2!==__identity&&a2!==null&&typeof a2==='object')+Number(c3!==__identity&&a3!==null&&typeof a3==='object')+Number(c4!==__identity&&a4!==null&&typeof a4==='object')+Number(c5!==__identity&&a5!==null&&typeof a5==='object')+Number(c6!==__identity&&a6!==null&&typeof a6==='object')+Number(c7!==__identity&&a7!==null&&typeof a7==='object')+Number(c8!==__identity&&a8!==null&&typeof a8==='object')+Number(c9!==__identity&&a9!==null&&typeof a9==='object')+Number(c10!==__identity&&a10!==null&&typeof a10==='object')+Number(c11!==__identity&&a11!==null&&typeof a11==='object')+Number(c12!==__identity&&a12!==null&&typeof a12==='object')+Number(c13!==__identity&&a13!==null&&typeof a13==='object')+Number(c14!==__identity&&a14!==null&&typeof a14==='object')+Number(c15!==__identity&&a15!==null&&typeof a15==='object')+Number(c16!==__identity&&a16!==null&&typeof a16==='object')+Number(c17!==__identity&&a17!==null&&typeof a17==='object')+Number(c18!==__identity&&a18!==null&&typeof a18==='object')+Number(c19!==__identity&&a19!==null&&typeof a19==='object')+Number(c20!==__identity&&a20!==null&&typeof a20==='object')+Number(c21!==__identity&&a21!==null&&typeof a21==='object')+Number(c22!==__identity&&a22!==null&&typeof a22==='object')+Number(c23!==__identity&&a23!==null&&typeof a23==='object')+Number(c24!==__identity&&a24!==null&&typeof a24==='object')+Number(c25!==__identity&&a25!==null&&typeof a25==='object')+Number(c26!==__identity&&a26!==null&&typeof a26==='object')+Number(c27!==__identity&&a27!==null&&typeof a27==='object')+Number(c28!==__identity&&a28!==null&&typeof a28==='object')+Number(c29!==__identity&&a29!==null&&typeof a29==='object')+Number(c30!==__identity&&a30!==null&&typeof a30==='object')+Number(c31!==__identity&&a31!==null&&typeof a31==='object')+Number(c32!==__identity&&a32!==null&&typeof a32==='object'))>1)?new WeakMap():null;const v0=c0(a0,context);const v1=c1(a1,context);const v2=c2(a2,context);const v3=c3(a3,context);const v4=c4(a4,context);const v5=c5(a5,context);const v6=c6(a6,context);const v7=c7(a7,context);const v8=c8(a8,context);const v9=c9(a9,context);const v10=c10(a10,context);const v11=c11(a11,context);const v12=c12(a12,context);const v13=c13(a13,context);const v14=c14(a14,context);const v15=c15(a15,context);const v16=c16(a16,context);const v17=c17(a17,context);const v18=c18(a18,context);const v19=c19(a19,context);const v20=c20(a20,context);const v21=c21(a21,context);const v22=c22(a22,context);const v23=c23(a23,context);const v24=c24(a24,context);const v25=c25(a25,context);const v26=c26(a26,context);const v27=c27(a27,context);const v28=c28(a28,context);const v29=c29(a29,context);const v30=c30(a30,context);const v31=c31(a31,context);const v32=c32(a32,context);return __into3(v0,v1,v2,v3,v4,v5,v6,v7,v8,v9,v10,v11,v12,v13,v14,v15,v16,v17,v18,v19,v20,v21,v22,v23,v24,v25,v26,v27,v28,v29,v30,v31,v32,destination);};})()],
["long_mean",(()=>{const c0=__representation(__inputTypes[4].types[0],false,__inputTypes[4].capture[0]);const c1=__representation(__inputTypes[4].types[1],false,__inputTypes[4].capture[1]);const c2=__representation(__inputTypes[4].types[2],false,__inputTypes[4].capture[2]);const c3=__representation(__inputTypes[4].types[3],false,__inputTypes[4].capture[3]);const c4=__representation(__inputTypes[4].types[4],false,__inputTypes[4].capture[4]);const c5=__representation(__inputTypes[4].types[5],false,__inputTypes[4].capture[5]);const c6=__representation(__inputTypes[4].types[6],false,__inputTypes[4].capture[6]);const c7=__representation(__inputTypes[4].types[7],false,__inputTypes[4].capture[7]);const c8=__representation(__inputTypes[4].types[8],false,__inputTypes[4].capture[8]);const c9=__representation(__inputTypes[4].types[9],false,__inputTypes[4].capture[9]);const c10=__representation(__inputTypes[4].types[10],false,__inputTypes[4].capture[10]);const c11=__representation(__inputTypes[4].types[11],false,__inputTypes[4].capture[11]);const c12=__representation(__inputTypes[4].types[12],false,__inputTypes[4].capture[12]);const c13=__representation(__inputTypes[4].types[13],false,__inputTypes[4].capture[13]);const c14=__representation(__inputTypes[4].types[14],false,__inputTypes[4].capture[14]);const c15=__representation(__inputTypes[4].types[15],false,__inputTypes[4].capture[15]);const c16=__representation(__inputTypes[4].types[16],false,__inputTypes[4].capture[16]);const c17=__representation(__inputTypes[4].types[17],false,__inputTypes[4].capture[17]);const c18=__representation(__inputTypes[4].types[18],false,__inputTypes[4].capture[18]);const c19=__representation(__inputTypes[4].types[19],false,__inputTypes[4].capture[19]);const c20=__representation(__inputTypes[4].types[20],false,__inputTypes[4].capture[20]);const c21=__representation(__inputTypes[4].types[21],false,__inputTypes[4].capture[21]);const c22=__representation(__inputTypes[4].types[22],false,__inputTypes[4].capture[22]);const c23=__representation(__inputTypes[4].types[23],false,__inputTypes[4].capture[23]);const c24=__representation(__inputTypes[4].types[24],false,__inputTypes[4].capture[24]);const c25=__representation(__inputTypes[4].types[25],false,__inputTypes[4].capture[25]);const c26=__representation(__inputTypes[4].types[26],false,__inputTypes[4].capture[26]);const c27=__representation(__inputTypes[4].types[27],false,__inputTypes[4].capture[27]);const c28=__representation(__inputTypes[4].types[28],false,__inputTypes[4].capture[28]);const c29=__representation(__inputTypes[4].types[29],false,__inputTypes[4].capture[29]);const c30=__representation(__inputTypes[4].types[30],false,__inputTypes[4].capture[30]);const c31=__representation(__inputTypes[4].types[31],false,__inputTypes[4].capture[31]);const c32=__representation(__inputTypes[4].types[32],false,__inputTypes[4].capture[32]);const input=[c0,c1,c2,c3,c4,c5,c6,c7,c8,c9,c10,c11,c12,c13,c14,c15,c16,c17,c18,c19,c20,c21,c22,c23,c24,c25,c26,c27,c28,c29,c30,c31,c32],needsInput=input.some(c=>c!==__identity);const needsContext=(c0!==__identity||c1!==__identity||c2!==__identity||c3!==__identity||c4!==__identity||c5!==__identity||c6!==__identity||c7!==__identity||c8!==__identity||c9!==__identity||c10!==__identity||c11!==__identity||c12!==__identity||c13!==__identity||c14!==__identity||c15!==__identity||c16!==__identity||c17!==__identity||c18!==__identity||c19!==__identity||c20!==__identity||c21!==__identity||c22!==__identity||c23!==__identity||c24!==__identity||c25!==__identity||c26!==__identity||c27!==__identity||c28!==__identity||c29!==__identity||c30!==__identity||c31!==__identity||c32!==__identity);if(c0===__identity&&c1===__identity&&c2===__identity&&c3===__identity&&c4===__identity&&c5===__identity&&c6===__identity&&c7===__identity&&c8===__identity&&c9===__identity&&c10===__identity&&c11===__identity&&c12===__identity&&c13===__identity&&c14===__identity&&c15===__identity&&c16===__identity&&c17===__identity&&c18===__identity&&c19===__identity&&c20===__identity&&c21===__identity&&c22===__identity&&c23===__identity&&c24===__identity&&c25===__identity&&c26===__identity&&c27===__identity&&c28===__identity&&c29===__identity&&c30===__identity&&c31===__identity&&c32===__identity)return __into4;const fallback=(...args)=>{const context=new WeakMap();const values=input.map((convert,i)=>convert(args[i],context));return __into4(...values,args[33]);};return function(a0,a1,a2,a3,a4,a5,a6,a7,a8,a9,a10,a11,a12,a13,a14,a15,a16,a17,a18,a19,a20,a21,a22,a23,a24,a25,a26,a27,a28,a29,a30,a31,a32,destination){if(arguments.length!==34)return fallback(...arguments);const context=(needsContext||(Number(c0!==__identity&&a0!==null&&typeof a0==='object')+Number(c1!==__identity&&a1!==null&&typeof a1==='object')+Number(c2!==__identity&&a2!==null&&typeof a2==='object')+Number(c3!==__identity&&a3!==null&&typeof a3==='object')+Number(c4!==__identity&&a4!==null&&typeof a4==='object')+Number(c5!==__identity&&a5!==null&&typeof a5==='object')+Number(c6!==__identity&&a6!==null&&typeof a6==='object')+Number(c7!==__identity&&a7!==null&&typeof a7==='object')+Number(c8!==__identity&&a8!==null&&typeof a8==='object')+Number(c9!==__identity&&a9!==null&&typeof a9==='object')+Number(c10!==__identity&&a10!==null&&typeof a10==='object')+Number(c11!==__identity&&a11!==null&&typeof a11==='object')+Number(c12!==__identity&&a12!==null&&typeof a12==='object')+Number(c13!==__identity&&a13!==null&&typeof a13==='object')+Number(c14!==__identity&&a14!==null&&typeof a14==='object')+Number(c15!==__identity&&a15!==null&&typeof a15==='object')+Number(c16!==__identity&&a16!==null&&typeof a16==='object')+Number(c17!==__identity&&a17!==null&&typeof a17==='object')+Number(c18!==__identity&&a18!==null&&typeof a18==='object')+Number(c19!==__identity&&a19!==null&&typeof a19==='object')+Number(c20!==__identity&&a20!==null&&typeof a20==='object')+Number(c21!==__identity&&a21!==null&&typeof a21==='object')+Number(c22!==__identity&&a22!==null&&typeof a22==='object')+Number(c23!==__identity&&a23!==null&&typeof a23==='object')+Number(c24!==__identity&&a24!==null&&typeof a24==='object')+Number(c25!==__identity&&a25!==null&&typeof a25==='object')+Number(c26!==__identity&&a26!==null&&typeof a26==='object')+Number(c27!==__identity&&a27!==null&&typeof a27==='object')+Number(c28!==__identity&&a28!==null&&typeof a28==='object')+Number(c29!==__identity&&a29!==null&&typeof a29==='object')+Number(c30!==__identity&&a30!==null&&typeof a30==='object')+Number(c31!==__identity&&a31!==null&&typeof a31==='object')+Number(c32!==__identity&&a32!==null&&typeof a32==='object'))>1)?new WeakMap():null;const v0=c0(a0,context);const v1=c1(a1,context);const v2=c2(a2,context);const v3=c3(a3,context);const v4=c4(a4,context);const v5=c5(a5,context);const v6=c6(a6,context);const v7=c7(a7,context);const v8=c8(a8,context);const v9=c9(a9,context);const v10=c10(a10,context);const v11=c11(a11,context);const v12=c12(a12,context);const v13=c13(a13,context);const v14=c14(a14,context);const v15=c15(a15,context);const v16=c16(a16,context);const v17=c17(a17,context);const v18=c18(a18,context);const v19=c19(a19,context);const v20=c20(a20,context);const v21=c21(a21,context);const v22=c22(a22,context);const v23=c23(a23,context);const v24=c24(a24,context);const v25=c25(a25,context);const v26=c26(a26,context);const v27=c27(a27,context);const v28=c28(a28,context);const v29=c29(a29,context);const v30=c30(a30,context);const v31=c31(a31,context);const v32=c32(a32,context);return __into4(v0,v1,v2,v3,v4,v5,v6,v7,v8,v9,v10,v11,v12,v13,v14,v15,v16,v17,v18,v19,v20,v21,v22,v23,v24,v25,v26,v27,v28,v29,v30,v31,v32,destination);};})()],
["encode",(()=>{const c0=__representation(__inputTypes[5].types[0],false,__inputTypes[5].capture[0]);const c1=__representation(__inputTypes[5].types[1],false,__inputTypes[5].capture[1]);const c2=__representation(__inputTypes[5].types[2],false,__inputTypes[5].capture[2]);const c3=__representation(__inputTypes[5].types[3],false,__inputTypes[5].capture[3]);const c4=__representation(__inputTypes[5].types[4],false,__inputTypes[5].capture[4]);const c5=__representation(__inputTypes[5].types[5],false,__inputTypes[5].capture[5]);const c6=__representation(__inputTypes[5].types[6],false,__inputTypes[5].capture[6]);const c7=__representation(__inputTypes[5].types[7],false,__inputTypes[5].capture[7]);const c8=__representation(__inputTypes[5].types[8],false,__inputTypes[5].capture[8]);const c9=__representation(__inputTypes[5].types[9],false,__inputTypes[5].capture[9]);const c10=__representation(__inputTypes[5].types[10],false,__inputTypes[5].capture[10]);const c11=__representation(__inputTypes[5].types[11],false,__inputTypes[5].capture[11]);const c12=__representation(__inputTypes[5].types[12],false,__inputTypes[5].capture[12]);const c13=__representation(__inputTypes[5].types[13],false,__inputTypes[5].capture[13]);const c14=__representation(__inputTypes[5].types[14],false,__inputTypes[5].capture[14]);const c15=__representation(__inputTypes[5].types[15],false,__inputTypes[5].capture[15]);const c16=__representation(__inputTypes[5].types[16],false,__inputTypes[5].capture[16]);const c17=__representation(__inputTypes[5].types[17],false,__inputTypes[5].capture[17]);const c18=__representation(__inputTypes[5].types[18],false,__inputTypes[5].capture[18]);const c19=__representation(__inputTypes[5].types[19],false,__inputTypes[5].capture[19]);const c20=__representation(__inputTypes[5].types[20],false,__inputTypes[5].capture[20]);const c21=__representation(__inputTypes[5].types[21],false,__inputTypes[5].capture[21]);const c22=__representation(__inputTypes[5].types[22],false,__inputTypes[5].capture[22]);const c23=__representation(__inputTypes[5].types[23],false,__inputTypes[5].capture[23]);const c24=__representation(__inputTypes[5].types[24],false,__inputTypes[5].capture[24]);const c25=__representation(__inputTypes[5].types[25],false,__inputTypes[5].capture[25]);const c26=__representation(__inputTypes[5].types[26],false,__inputTypes[5].capture[26]);const c27=__representation(__inputTypes[5].types[27],false,__inputTypes[5].capture[27]);const c28=__representation(__inputTypes[5].types[28],false,__inputTypes[5].capture[28]);const c29=__representation(__inputTypes[5].types[29],false,__inputTypes[5].capture[29]);const c30=__representation(__inputTypes[5].types[30],false,__inputTypes[5].capture[30]);const c31=__representation(__inputTypes[5].types[31],false,__inputTypes[5].capture[31]);const c32=__representation(__inputTypes[5].types[32],false,__inputTypes[5].capture[32]);const input=[c0,c1,c2,c3,c4,c5,c6,c7,c8,c9,c10,c11,c12,c13,c14,c15,c16,c17,c18,c19,c20,c21,c22,c23,c24,c25,c26,c27,c28,c29,c30,c31,c32],needsInput=input.some(c=>c!==__identity);const needsContext=(c0!==__identity||c1!==__identity||c2!==__identity||c3!==__identity||c4!==__identity||c5!==__identity||c6!==__identity||c7!==__identity||c8!==__identity||c9!==__identity||c10!==__identity||c11!==__identity||c12!==__identity||c13!==__identity||c14!==__identity||c15!==__identity||c16!==__identity||c17!==__identity||c18!==__identity||c19!==__identity||c20!==__identity||c21!==__identity||c22!==__identity||c23!==__identity||c24!==__identity||c25!==__identity||c26!==__identity||c27!==__identity||c28!==__identity||c29!==__identity||c30!==__identity||c31!==__identity||c32!==__identity);if(c0===__identity&&c1===__identity&&c2===__identity&&c3===__identity&&c4===__identity&&c5===__identity&&c6===__identity&&c7===__identity&&c8===__identity&&c9===__identity&&c10===__identity&&c11===__identity&&c12===__identity&&c13===__identity&&c14===__identity&&c15===__identity&&c16===__identity&&c17===__identity&&c18===__identity&&c19===__identity&&c20===__identity&&c21===__identity&&c22===__identity&&c23===__identity&&c24===__identity&&c25===__identity&&c26===__identity&&c27===__identity&&c28===__identity&&c29===__identity&&c30===__identity&&c31===__identity&&c32===__identity)return __into5;const fallback=(...args)=>{const context=new WeakMap();const values=input.map((convert,i)=>convert(args[i],context));return __into5(...values,args[33]);};return function(a0,a1,a2,a3,a4,a5,a6,a7,a8,a9,a10,a11,a12,a13,a14,a15,a16,a17,a18,a19,a20,a21,a22,a23,a24,a25,a26,a27,a28,a29,a30,a31,a32,destination){if(arguments.length!==34)return fallback(...arguments);const context=(needsContext||(Number(c0!==__identity&&a0!==null&&typeof a0==='object')+Number(c1!==__identity&&a1!==null&&typeof a1==='object')+Number(c2!==__identity&&a2!==null&&typeof a2==='object')+Number(c3!==__identity&&a3!==null&&typeof a3==='object')+Number(c4!==__identity&&a4!==null&&typeof a4==='object')+Number(c5!==__identity&&a5!==null&&typeof a5==='object')+Number(c6!==__identity&&a6!==null&&typeof a6==='object')+Number(c7!==__identity&&a7!==null&&typeof a7==='object')+Number(c8!==__identity&&a8!==null&&typeof a8==='object')+Number(c9!==__identity&&a9!==null&&typeof a9==='object')+Number(c10!==__identity&&a10!==null&&typeof a10==='object')+Number(c11!==__identity&&a11!==null&&typeof a11==='object')+Number(c12!==__identity&&a12!==null&&typeof a12==='object')+Number(c13!==__identity&&a13!==null&&typeof a13==='object')+Number(c14!==__identity&&a14!==null&&typeof a14==='object')+Number(c15!==__identity&&a15!==null&&typeof a15==='object')+Number(c16!==__identity&&a16!==null&&typeof a16==='object')+Number(c17!==__identity&&a17!==null&&typeof a17==='object')+Number(c18!==__identity&&a18!==null&&typeof a18==='object')+Number(c19!==__identity&&a19!==null&&typeof a19==='object')+Number(c20!==__identity&&a20!==null&&typeof a20==='object')+Number(c21!==__identity&&a21!==null&&typeof a21==='object')+Number(c22!==__identity&&a22!==null&&typeof a22==='object')+Number(c23!==__identity&&a23!==null&&typeof a23==='object')+Number(c24!==__identity&&a24!==null&&typeof a24==='object')+Number(c25!==__identity&&a25!==null&&typeof a25==='object')+Number(c26!==__identity&&a26!==null&&typeof a26==='object')+Number(c27!==__identity&&a27!==null&&typeof a27==='object')+Number(c28!==__identity&&a28!==null&&typeof a28==='object')+Number(c29!==__identity&&a29!==null&&typeof a29==='object')+Number(c30!==__identity&&a30!==null&&typeof a30==='object')+Number(c31!==__identity&&a31!==null&&typeof a31==='object')+Number(c32!==__identity&&a32!==null&&typeof a32==='object'))>1)?new WeakMap():null;const v0=c0(a0,context);const v1=c1(a1,context);const v2=c2(a2,context);const v3=c3(a3,context);const v4=c4(a4,context);const v5=c5(a5,context);const v6=c6(a6,context);const v7=c7(a7,context);const v8=c8(a8,context);const v9=c9(a9,context);const v10=c10(a10,context);const v11=c11(a11,context);const v12=c12(a12,context);const v13=c13(a13,context);const v14=c14(a14,context);const v15=c15(a15,context);const v16=c16(a16,context);const v17=c17(a17,context);const v18=c18(a18,context);const v19=c19(a19,context);const v20=c20(a20,context);const v21=c21(a21,context);const v22=c22(a22,context);const v23=c23(a23,context);const v24=c24(a24,context);const v25=c25(a25,context);const v26=c26(a26,context);const v27=c27(a27,context);const v28=c28(a28,context);const v29=c29(a29,context);const v30=c30(a30,context);const v31=c31(a31,context);const v32=c32(a32,context);return __into5(v0,v1,v2,v3,v4,v5,v6,v7,v8,v9,v10,v11,v12,v13,v14,v15,v16,v17,v18,v19,v20,v21,v22,v23,v24,v25,v26,v27,v28,v29,v30,v31,v32,destination);};})()]]));
export function callInto(name,args,destination){switch(name){case "add":throw new Error('temporary storage is internal to a pure invocation');}return functionsInto[name](...args,destination);}

function __preparedPart(mask,path){
 for(const field of path){
  if(mask===true)return true;
  if(!mask || typeof mask!=="object")return false;
  mask=Object.hasOwn(mask.fields,field)?mask.fields[field]:false;
 }
 return mask;
}
function __preparedStable(mask,path){const part=__preparedPart(mask,path);return part===true || (!!part && part.all===true);}
function __prepareFn3(fixed,depth=0){if(depth>=16||!((__preparedStable(fixed[0],[])&&__preparedStable(fixed[1],[])&&__preparedStable(fixed[2],[])&&__preparedStable(fixed[3],[])&&__preparedStable(fixed[4],[])&&__preparedStable(fixed[5],[])&&__preparedStable(fixed[6],[])&&__preparedStable(fixed[7],[])&&__preparedStable(fixed[8],[])&&__preparedStable(fixed[9],[])&&__preparedStable(fixed[10],[])&&__preparedStable(fixed[11],[])&&__preparedStable(fixed[12],[])&&__preparedStable(fixed[13],[])&&__preparedStable(fixed[14],[])&&__preparedStable(fixed[15],[])&&__preparedStable(fixed[16],[])&&__preparedStable(fixed[17],[])&&__preparedStable(fixed[18],[])&&__preparedStable(fixed[19],[])&&__preparedStable(fixed[20],[])&&__preparedStable(fixed[21],[])&&__preparedStable(fixed[22],[])&&__preparedStable(fixed[23],[])&&__preparedStable(fixed[24],[])&&__preparedStable(fixed[25],[])&&__preparedStable(fixed[26],[])&&__preparedStable(fixed[27],[])&&__preparedStable(fixed[28],[])&&__preparedStable(fixed[29],[])&&__preparedStable(fixed[30],[])&&__preparedStable(fixed[31],[])&&__preparedStable(fixed[32],[]))))return __fn3;const v4440=__preparedStable(fixed[0],[])&&__preparedStable(fixed[1],[])&&__preparedStable(fixed[2],[])&&__preparedStable(fixed[3],[])&&__preparedStable(fixed[4],[])&&__preparedStable(fixed[5],[])&&__preparedStable(fixed[6],[])&&__preparedStable(fixed[7],[])&&__preparedStable(fixed[8],[])&&__preparedStable(fixed[9],[])&&__preparedStable(fixed[10],[])&&__preparedStable(fixed[11],[])&&__preparedStable(fixed[12],[])&&__preparedStable(fixed[13],[])&&__preparedStable(fixed[14],[])&&__preparedStable(fixed[15],[])&&__preparedStable(fixed[16],[])&&__preparedStable(fixed[17],[])&&__preparedStable(fixed[18],[])&&__preparedStable(fixed[19],[])&&__preparedStable(fixed[20],[])&&__preparedStable(fixed[21],[])&&__preparedStable(fixed[22],[])&&__preparedStable(fixed[23],[])&&__preparedStable(fixed[24],[])&&__preparedStable(fixed[25],[])&&__preparedStable(fixed[26],[])&&__preparedStable(fixed[27],[])&&__preparedStable(fixed[28],[])&&__preparedStable(fixed[29],[])&&__preparedStable(fixed[30],[])&&__preparedStable(fixed[31],[])&&__preparedStable(fixed[32],[]);
let v4439=false,v4438;
return function(v4404,v4405,v4406,v4407,v4408,v4409,v4410,v4411,v4412,v4413,v4414,v4415,v4416,v4417,v4418,v4419,v4420,v4421,v4422,v4423,v4424,v4425,v4426,v4427,v4428,v4429,v4430,v4431,v4432,v4433,v4434,v4435,v4436){let v4437;if(v4440&&v4439){v4437=v4438;}else{
const v4441=[];for(let v4442=0;v4442<v4436.length;v4442++){
const v4443=(v4436[v4442]>>>0);
v4441.push(__fn1(v4404,v4405,v4406,v4407,v4408,v4409,v4410,v4411,v4412,v4413,v4414,v4415,v4416,v4417,v4418,v4419,v4420,v4421,v4422,v4423,v4424,v4425,v4426,v4427,v4428,v4429,v4430,v4431,v4432,v4433,v4434,v4435,v4443));}
v4437=v4441;if(v4440){v4438=v4437;v4439=true;}}
const v4444=Math.fround((v4436).length);
const v4445=__fn0();
const v4446=[];for(let v4447=0;v4447<v4445.length;v4447++){
const v4448=(v4445[v4447]>>>0);
const v4449=v4437;
let v4450=0.0;
for(let v4451=0;v4451<v4449.length;v4451++){
const v4452=v4449[v4451];
const v4453=v4450;
let v4454;if(v4448<v4452.length){v4454=v4452[v4448];}else{
v4454=0.0;}
const v4455=__nfValue(v4454);
v4450=Math.fround(__nfNumber(v4453) + __nfNumber(v4455));
}
v4446.push(Math.fround((__nfNumber(v4450))/(__nfNumber(__nfValue(v4444)))));}
return v4446;};}
function __prepareFn5(fixed,depth=0){if(depth>=16||!((__preparedStable(fixed[0],[])&&__preparedStable(fixed[1],[])&&__preparedStable(fixed[2],[])&&__preparedStable(fixed[3],[])&&__preparedStable(fixed[4],[])&&__preparedStable(fixed[5],[])&&__preparedStable(fixed[6],[])&&__preparedStable(fixed[7],[])&&__preparedStable(fixed[8],[])&&__preparedStable(fixed[9],[])&&__preparedStable(fixed[10],[])&&__preparedStable(fixed[11],[])&&__preparedStable(fixed[12],[])&&__preparedStable(fixed[13],[])&&__preparedStable(fixed[14],[])&&__preparedStable(fixed[15],[])&&__preparedStable(fixed[16],[])&&__preparedStable(fixed[17],[])&&__preparedStable(fixed[18],[])&&__preparedStable(fixed[19],[])&&__preparedStable(fixed[20],[])&&__preparedStable(fixed[21],[])&&__preparedStable(fixed[22],[])&&__preparedStable(fixed[23],[])&&__preparedStable(fixed[24],[])&&__preparedStable(fixed[25],[])&&__preparedStable(fixed[26],[])&&__preparedStable(fixed[27],[])&&__preparedStable(fixed[28],[])&&__preparedStable(fixed[29],[])&&__preparedStable(fixed[30],[])&&__preparedStable(fixed[31],[])&&__preparedStable(fixed[32],[]))))return __fn5;const v4556=__preparedStable(fixed[0],[])&&__preparedStable(fixed[1],[])&&__preparedStable(fixed[2],[])&&__preparedStable(fixed[3],[])&&__preparedStable(fixed[4],[])&&__preparedStable(fixed[5],[])&&__preparedStable(fixed[6],[])&&__preparedStable(fixed[7],[])&&__preparedStable(fixed[8],[])&&__preparedStable(fixed[9],[])&&__preparedStable(fixed[10],[])&&__preparedStable(fixed[11],[])&&__preparedStable(fixed[12],[])&&__preparedStable(fixed[13],[])&&__preparedStable(fixed[14],[])&&__preparedStable(fixed[15],[])&&__preparedStable(fixed[16],[])&&__preparedStable(fixed[17],[])&&__preparedStable(fixed[18],[])&&__preparedStable(fixed[19],[])&&__preparedStable(fixed[20],[])&&__preparedStable(fixed[21],[])&&__preparedStable(fixed[22],[])&&__preparedStable(fixed[23],[])&&__preparedStable(fixed[24],[])&&__preparedStable(fixed[25],[])&&__preparedStable(fixed[26],[])&&__preparedStable(fixed[27],[])&&__preparedStable(fixed[28],[])&&__preparedStable(fixed[29],[])&&__preparedStable(fixed[30],[])&&__preparedStable(fixed[31],[])&&__preparedStable(fixed[32],[]);
let v4555=false,v4554;
const v4563=depth<15&&__preparedFactories.has(3)&&((__preparedStable(fixed[0],[])&&__preparedStable(fixed[1],[])&&__preparedStable(fixed[2],[])&&__preparedStable(fixed[3],[])&&__preparedStable(fixed[4],[])&&__preparedStable(fixed[5],[])&&__preparedStable(fixed[6],[])&&__preparedStable(fixed[7],[])&&__preparedStable(fixed[8],[])&&__preparedStable(fixed[9],[])&&__preparedStable(fixed[10],[])&&__preparedStable(fixed[11],[])&&__preparedStable(fixed[12],[])&&__preparedStable(fixed[13],[])&&__preparedStable(fixed[14],[])&&__preparedStable(fixed[15],[])&&__preparedStable(fixed[16],[])&&__preparedStable(fixed[17],[])&&__preparedStable(fixed[18],[])&&__preparedStable(fixed[19],[])&&__preparedStable(fixed[20],[])&&__preparedStable(fixed[21],[])&&__preparedStable(fixed[22],[])&&__preparedStable(fixed[23],[])&&__preparedStable(fixed[24],[])&&__preparedStable(fixed[25],[])&&__preparedStable(fixed[26],[])&&__preparedStable(fixed[27],[])&&__preparedStable(fixed[28],[])&&__preparedStable(fixed[29],[])&&__preparedStable(fixed[30],[])&&__preparedStable(fixed[31],[])&&__preparedStable(fixed[32],[])));
let v4561;
const v4567=depth<15&&__preparedFactories.has(4)&&((__preparedStable(fixed[0],[])&&__preparedStable(fixed[1],[])&&__preparedStable(fixed[2],[])&&__preparedStable(fixed[3],[])&&__preparedStable(fixed[4],[])&&__preparedStable(fixed[5],[])&&__preparedStable(fixed[6],[])&&__preparedStable(fixed[7],[])&&__preparedStable(fixed[8],[])&&__preparedStable(fixed[9],[])&&__preparedStable(fixed[10],[])&&__preparedStable(fixed[11],[])&&__preparedStable(fixed[12],[])&&__preparedStable(fixed[13],[])&&__preparedStable(fixed[14],[])&&__preparedStable(fixed[15],[])&&__preparedStable(fixed[16],[])&&__preparedStable(fixed[17],[])&&__preparedStable(fixed[18],[])&&__preparedStable(fixed[19],[])&&__preparedStable(fixed[20],[])&&__preparedStable(fixed[21],[])&&__preparedStable(fixed[22],[])&&__preparedStable(fixed[23],[])&&__preparedStable(fixed[24],[])&&__preparedStable(fixed[25],[])&&__preparedStable(fixed[26],[])&&__preparedStable(fixed[27],[])&&__preparedStable(fixed[28],[])&&__preparedStable(fixed[29],[])&&__preparedStable(fixed[30],[])&&__preparedStable(fixed[31],[])&&__preparedStable(fixed[32],[])));
let v4565;
return function(v4512,v4513,v4514,v4515,v4516,v4517,v4518,v4519,v4520,v4521,v4522,v4523,v4524,v4525,v4526,v4527,v4528,v4529,v4530,v4531,v4532,v4533,v4534,v4535,v4536,v4537,v4538,v4539,v4540,v4541,v4542,v4543,v4544){const v4545=(v4544).length;
const v4546=0;
const v4547=(v4545===v4546);
let v4548;if(v4547){
const v4549=__fn0();
const v4550=[];for(let v4551=0;v4551<v4549.length;v4551++){
const v4552=(v4549[v4551]>>>0);
v4550.push(0.0);}
v4548=v4550;}else{
let v4553;if(v4556&&v4555){v4553=v4554;}else{
const v4557=(v4544).length;
const v4558=16;
const v4559=((v4557) <= (v4558));
let v4560;if(v4559){
let v4564;if(v4563){if(!v4561){const v4562=__preparedFactories.get(3);v4561=v4562([fixed[0],fixed[1],fixed[2],fixed[3],fixed[4],fixed[5],fixed[6],fixed[7],fixed[8],fixed[9],fixed[10],fixed[11],fixed[12],fixed[13],fixed[14],fixed[15],fixed[16],fixed[17],fixed[18],fixed[19],fixed[20],fixed[21],fixed[22],fixed[23],fixed[24],fixed[25],fixed[26],fixed[27],fixed[28],fixed[29],fixed[30],fixed[31],fixed[32]],depth+1);}v4564=v4561(v4512,v4513,v4514,v4515,v4516,v4517,v4518,v4519,v4520,v4521,v4522,v4523,v4524,v4525,v4526,v4527,v4528,v4529,v4530,v4531,v4532,v4533,v4534,v4535,v4536,v4537,v4538,v4539,v4540,v4541,v4542,v4543,v4544);}else{v4564=__fn3(v4512,v4513,v4514,v4515,v4516,v4517,v4518,v4519,v4520,v4521,v4522,v4523,v4524,v4525,v4526,v4527,v4528,v4529,v4530,v4531,v4532,v4533,v4534,v4535,v4536,v4537,v4538,v4539,v4540,v4541,v4542,v4543,v4544);}
v4560=v4564;}else{
let v4568;if(v4567){if(!v4565){const v4566=__preparedFactories.get(4);v4565=v4566([fixed[0],fixed[1],fixed[2],fixed[3],fixed[4],fixed[5],fixed[6],fixed[7],fixed[8],fixed[9],fixed[10],fixed[11],fixed[12],fixed[13],fixed[14],fixed[15],fixed[16],fixed[17],fixed[18],fixed[19],fixed[20],fixed[21],fixed[22],fixed[23],fixed[24],fixed[25],fixed[26],fixed[27],fixed[28],fixed[29],fixed[30],fixed[31],fixed[32]],depth+1);}v4568=v4565(v4512,v4513,v4514,v4515,v4516,v4517,v4518,v4519,v4520,v4521,v4522,v4523,v4524,v4525,v4526,v4527,v4528,v4529,v4530,v4531,v4532,v4533,v4534,v4535,v4536,v4537,v4538,v4539,v4540,v4541,v4542,v4543,v4544);}else{v4568=__fn4(v4512,v4513,v4514,v4515,v4516,v4517,v4518,v4519,v4520,v4521,v4522,v4523,v4524,v4525,v4526,v4527,v4528,v4529,v4530,v4531,v4532,v4533,v4534,v4535,v4536,v4537,v4538,v4539,v4540,v4541,v4542,v4543,v4544);}
v4560=v4568;}
v4553=v4560;if(v4556){v4554=v4553;v4555=true;}}
v4548=v4553;}
return v4548;};}
const __preparedFactories=new Map([[3,__prepareFn3],[5,__prepareFn5]]);
