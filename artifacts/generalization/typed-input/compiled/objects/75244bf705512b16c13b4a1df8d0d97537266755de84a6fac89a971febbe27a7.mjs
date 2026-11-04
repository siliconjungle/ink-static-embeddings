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
return v440;}
function __fn1(v443,v444){
let v445;if(v444<v443.length){v445=v443[v444];}else{
v445=0.0;}
return __nfValue(v445);}
function __fn2(v446,v447,v448){
const v449=v447.length;
const v450=new Array(v449);
for(let v451=0;v451<v449;v451++){
const v452=(v447[v451]>>>0);
const v453=256;
const v454=(Math.imul(v452,v453) >>> 0);
const v455=(((v454) + (v448)) >>> 0);
let v456;if(v455<v446.length){v456=v446[v455];}else{
v456=0.0;}
v450[v451]=__nfValue(v456);
}
let v457=0.0;
for(let v458=0;v458<v450.length;v458++){
const v459=v450[v458];
const v460=v457;
const v461=__nfValue(v459);
v457=Math.fround(__nfNumber(v460) + __nfNumber(v461));
}
const v462=v457;
return Math.fround((__nfNumber(v462))/(__nfNumber(Math.fround((v447).length))));}
function __fn3(v463,v464){
const v465=__fn0();
const v466=(v464).length;
const v467=0;
let v468;if((v466===v467)){
const v469=v465.length;
const v470=new Array(v469);
for(let v471=0;v471<v469;v471++){
const v472=(v465[v471]>>>0);
v470[v471]=0.0;
}
v468=v470;}else{
const v473=v465.length;
const v474=new Array(v473);
for(let v475=0;v475<v473;v475++){
const v476=(v465[v475]>>>0);
const v477=v464.length;
const v478=new Array(v477);
for(let v479=0;v479<v477;v479++){
const v480=(v464[v479]>>>0);
const v481=256;
const v482=(Math.imul(v480,v481) >>> 0);
const v483=(((v482) + (v476)) >>> 0);
let v484;if(v483<v463.length){v484=v463[v483];}else{
v484=0.0;}
v478[v479]=__nfValue(v484);
}
let v485=0.0;
for(let v486=0;v486<v478.length;v486++){
const v487=v478[v486];
const v488=v485;
const v489=__nfValue(v487);
v485=Math.fround(__nfNumber(v488) + __nfNumber(v489));
}
const v490=v485;
v474[v475]=Math.fround((__nfNumber(v490))/(__nfNumber(Math.fround((v464).length))));
}
const v491=v474.length;
const v492=new Array(v491);
for(let v493=0;v493<v491;v493++){
const v494=v474[v493];
const v495=__nfValue(v494);
const v496=__nfValue(v494);
v492[v493]=Math.fround(__nfNumber(v495) * __nfNumber(v496));
}
let v497=0.0;
for(let v498=v492.length-1;v498>=0;v498--){
const v499=v492[v498];
const v500=__nfValue(v499);
const v501=v497;
v497=Math.fround(__nfNumber(v500) + __nfNumber(v501));
}
const v502=Math.fround(Math.sqrt(__nfNumber(v497)));
const v503=1.000000023742228e-32;
const v504=Math.fround(v502 + v503);
const v505=v474.length;
const v506=new Array(v505);
for(let v507=0;v507<v505;v507++){
const v508=v474[v507];
v506[v507]=Math.fround((__nfNumber(__nfValue(v508)))/(__nfNumber(v504)));
}
v468=v506;}
return v468;}
function __fn4(v509,v510,v511,v512,v513){
const v514=256;
let v515;if(v514===0 ){
v515=0;}else{
v515=(Math.trunc(v513/v514)+0);}
const v516=v515;
const v517=256;
let v518;if(v517===0 ){
v518=0;}else{
v518=((v513%v517)+0);}
const v519=v518;
let v520;if(v516<v512.length){v520=v512[v516];}else{
v520=0;}
const v521=v520;
let v522;if(v516<v511.length){v522=v511[v516];}else{
v522=0;}
const v523=v522;
const v524=4096;
const v525=0;
const v526=0.0;
let v527=v525;
let v528=v526;
for(let v530=0;v530<v524;v530++){
const v531=v527;
if(((v531) >= (v521))){break;}
const v532=(v530>>>0);
const v533=v527;
const v534=1;
const v535=(((v533) + (v534)) >>> 0);
const v536=__nfValue(v528);
const v537=(((v523) + (v532)) >>> 0);
let v538;if(v537<v510.length){v538=v510[v537];}else{
v538=0;}
const v539=v538;
const v540=256;
const v541=(Math.imul(v539,v540) >>> 0);
const v542=(((v541) + (v519)) >>> 0);
let v543;if(v542<v509.length){v543=v509[v542];}else{
v543=0.0;}
const v544=__nfValue(v543);
const v545=Math.fround(__nfNumber(v536) + __nfNumber(v544));
v527=v535;
v528=v545;
}
const v547=0;
let v548;if((v521===v547)){
v548=0.0;}else{
v548=Math.fround((__nfNumber(__nfValue(v528)))/(__nfNumber(Math.fround(v521))));}
return v548;}
function __fn5(v549,v550,v551,v552,v553){
const v554=v553.length;
const v555=new Array(v554);
for(let v556=0;v556<v554;v556++){
const v557=(v553[v556]>>>0);
const v558=256;
let v559;if(v558===0 ){
v559=0;}else{
v559=(Math.trunc(v557/v558)+0);}
const v560=v559;
const v561=256;
let v562;if(v561===0 ){
v562=0;}else{
v562=((v557%v561)+0);}
const v563=v562;
let v564;if(v560<v552.length){v564=v552[v560];}else{
v564=0;}
const v565=v564;
let v566;if(v560<v551.length){v566=v551[v560];}else{
v566=0;}
const v567=v566;
const v568=4096;
const v569=0;
const v570=0.0;
let v571=v569;
let v572=v570;
for(let v574=0;v574<v568;v574++){
const v575=v571;
if(((v575) >= (v565))){break;}
const v576=(v574>>>0);
const v577=v571;
const v578=1;
const v579=(((v577) + (v578)) >>> 0);
const v580=__nfValue(v572);
const v581=(((v567) + (v576)) >>> 0);
let v582;if(v581<v550.length){v582=v550[v581];}else{
v582=0;}
const v583=v582;
const v584=256;
const v585=(Math.imul(v583,v584) >>> 0);
const v586=(((v585) + (v563)) >>> 0);
let v587;if(v586<v549.length){v587=v549[v586];}else{
v587=0.0;}
const v588=__nfValue(v587);
const v589=Math.fround(__nfNumber(v580) + __nfNumber(v588));
v571=v579;
v572=v589;
}
const v591=0;
let v592;if((v565===v591)){
v592=0.0;}else{
v592=Math.fround((__nfNumber(__nfValue(v572)))/(__nfNumber(Math.fround(v565))));}
v555[v556]=v592;
}
return v555;}
function __fn6(v593,v594){
let v595=0.0;
for(let v596=0;v596<256;v596++){
const v597=(v596>>>0);
const v598=256;
const v599=(Math.imul(v594,v598) >>> 0);
const v600=255;
const v601=(((v599) + (v600)) >>> 0);
const v602=(((v601) - (v597)) >>> 0);
let v603;if(v602<v593.length){v603=v593[v602];}else{
v603=0.0;}
const v604=__nfValue(v603);
const v605=256;
const v606=(Math.imul(v594,v605) >>> 0);
const v607=255;
const v608=(((v606) + (v607)) >>> 0);
const v609=(((v608) - (v597)) >>> 0);
let v610;if(v609<v593.length){v610=v593[v609];}else{
v610=0.0;}
const v611=__nfValue(v610);
const v612=Math.fround(__nfNumber(v604) * __nfNumber(v611));
const v613=v595;
v595=Math.fround(v612 + __nfNumber(v613));}
const v614=v595;
const v615=Math.fround(Math.sqrt(__nfNumber(v614)));
const v616=1.000000023742228e-32;
return Math.fround(v615 + v616);}
function __fn7(v617,v618){
const v619=v618.length;
const v620=new Array(v619);
for(let v621=0;v621<v619;v621++){
const v622=(v618[v621]>>>0);
let v623=0.0;
for(let v624=0;v624<256;v624++){
const v625=(v624>>>0);
const v626=256;
const v627=(Math.imul(v622,v626) >>> 0);
const v628=255;
const v629=(((v627) + (v628)) >>> 0);
const v630=(((v629) - (v625)) >>> 0);
let v631;if(v630<v617.length){v631=v617[v630];}else{
v631=0.0;}
const v632=__nfValue(v631);
const v633=256;
const v634=(Math.imul(v622,v633) >>> 0);
const v635=255;
const v636=(((v634) + (v635)) >>> 0);
const v637=(((v636) - (v625)) >>> 0);
let v638;if(v637<v617.length){v638=v617[v637];}else{
v638=0.0;}
const v639=__nfValue(v638);
const v640=Math.fround(__nfNumber(v632) * __nfNumber(v639));
const v641=v623;
v623=Math.fround(v640 + __nfNumber(v641));}
const v642=v623;
const v643=Math.fround(Math.sqrt(__nfNumber(v642)));
const v644=1.000000023742228e-32;
v620[v621]=Math.fround(v643 + v644);
}
return v620;}
function __fn8(v645,v646,v647){
const v648=v647.length;
const v649=new Array(v648);
for(let v650=0;v650<v648;v650++){
const v651=(v647[v650]>>>0);
let v652;if(v651<v645.length){v652=v645[v651];}else{
v652=0.0;}
const v653=256;
let v654;if(v653===0 ){
v654=0;}else{
v654=(Math.trunc(v651/v653)+0);}
const v655=v654;
let v656;if(v655<v646.length){v656=v646[v655];}else{
v656=1.0;}
v649[v650]=Math.fround((__nfNumber(__nfValue(v652)))/(__nfNumber(__nfValue(v656))));
}
return v649;}
function __into0(v657){
const v658=0;
const v659=1;
const v660=2;
const v661=3;
const v662=4;
const v663=5;
const v664=6;
const v665=7;
const v666=[v658,v659,v660,v661,v662,v663,v664,v665];
const v667=8;
const v668=9;
const v669=10;
const v670=11;
const v671=12;
const v672=13;
const v673=14;
const v674=15;
const v675=[v667,v668,v669,v670,v671,v672,v673,v674];
const v676=v666.length;
const v677=v675.length;
const v678=new Array(v676+v677);
for(let v679=0;v679<v676;v679++){v678[v679]=v666[v679];}
for(let v680=0;v680<v677;v680++){v678[v676+v680]=v675[v680];}
const v681=16;
const v682=17;
const v683=18;
const v684=19;
const v685=20;
const v686=21;
const v687=22;
const v688=23;
const v689=[v681,v682,v683,v684,v685,v686,v687,v688];
const v690=24;
const v691=25;
const v692=26;
const v693=27;
const v694=28;
const v695=29;
const v696=30;
const v697=31;
const v698=[v690,v691,v692,v693,v694,v695,v696,v697];
const v699=v689.length;
const v700=v698.length;
const v701=new Array(v699+v700);
for(let v702=0;v702<v699;v702++){v701[v702]=v689[v702];}
for(let v703=0;v703<v700;v703++){v701[v699+v703]=v698[v703];}
const v704=v678.length;
const v705=v701.length;
const v706=new Array(v704+v705);
for(let v707=0;v707<v704;v707++){v706[v707]=v678[v707];}
for(let v708=0;v708<v705;v708++){v706[v704+v708]=v701[v708];}
const v709=32;
const v710=33;
const v711=34;
const v712=35;
const v713=36;
const v714=37;
const v715=38;
const v716=39;
const v717=[v709,v710,v711,v712,v713,v714,v715,v716];
const v718=40;
const v719=41;
const v720=42;
const v721=43;
const v722=44;
const v723=45;
const v724=46;
const v725=47;
const v726=[v718,v719,v720,v721,v722,v723,v724,v725];
const v727=v717.length;
const v728=v726.length;
const v729=new Array(v727+v728);
for(let v730=0;v730<v727;v730++){v729[v730]=v717[v730];}
for(let v731=0;v731<v728;v731++){v729[v727+v731]=v726[v731];}
const v732=48;
const v733=49;
const v734=50;
const v735=51;
const v736=52;
const v737=53;
const v738=54;
const v739=55;
const v740=[v732,v733,v734,v735,v736,v737,v738,v739];
const v741=56;
const v742=57;
const v743=58;
const v744=59;
const v745=60;
const v746=61;
const v747=62;
const v748=63;
const v749=[v741,v742,v743,v744,v745,v746,v747,v748];
const v750=v740.length;
const v751=v749.length;
const v752=new Array(v750+v751);
for(let v753=0;v753<v750;v753++){v752[v753]=v740[v753];}
for(let v754=0;v754<v751;v754++){v752[v750+v754]=v749[v754];}
const v755=v729.length;
const v756=v752.length;
const v757=new Array(v755+v756);
for(let v758=0;v758<v755;v758++){v757[v758]=v729[v758];}
for(let v759=0;v759<v756;v759++){v757[v755+v759]=v752[v759];}
const v760=v706.length;
const v761=v757.length;
const v762=new Array(v760+v761);
for(let v763=0;v763<v760;v763++){v762[v763]=v706[v763];}
for(let v764=0;v764<v761;v764++){v762[v760+v764]=v757[v764];}
const v765=64;
const v766=65;
const v767=66;
const v768=67;
const v769=68;
const v770=69;
const v771=70;
const v772=71;
const v773=[v765,v766,v767,v768,v769,v770,v771,v772];
const v774=72;
const v775=73;
const v776=74;
const v777=75;
const v778=76;
const v779=77;
const v780=78;
const v781=79;
const v782=[v774,v775,v776,v777,v778,v779,v780,v781];
const v783=v773.length;
const v784=v782.length;
const v785=new Array(v783+v784);
for(let v786=0;v786<v783;v786++){v785[v786]=v773[v786];}
for(let v787=0;v787<v784;v787++){v785[v783+v787]=v782[v787];}
const v788=80;
const v789=81;
const v790=82;
const v791=83;
const v792=84;
const v793=85;
const v794=86;
const v795=87;
const v796=[v788,v789,v790,v791,v792,v793,v794,v795];
const v797=88;
const v798=89;
const v799=90;
const v800=91;
const v801=92;
const v802=93;
const v803=94;
const v804=95;
const v805=[v797,v798,v799,v800,v801,v802,v803,v804];
const v806=v796.length;
const v807=v805.length;
const v808=new Array(v806+v807);
for(let v809=0;v809<v806;v809++){v808[v809]=v796[v809];}
for(let v810=0;v810<v807;v810++){v808[v806+v810]=v805[v810];}
const v811=v785.length;
const v812=v808.length;
const v813=new Array(v811+v812);
for(let v814=0;v814<v811;v814++){v813[v814]=v785[v814];}
for(let v815=0;v815<v812;v815++){v813[v811+v815]=v808[v815];}
const v816=96;
const v817=97;
const v818=98;
const v819=99;
const v820=100;
const v821=101;
const v822=102;
const v823=103;
const v824=[v816,v817,v818,v819,v820,v821,v822,v823];
const v825=104;
const v826=105;
const v827=106;
const v828=107;
const v829=108;
const v830=109;
const v831=110;
const v832=111;
const v833=[v825,v826,v827,v828,v829,v830,v831,v832];
const v834=v824.length;
const v835=v833.length;
const v836=new Array(v834+v835);
for(let v837=0;v837<v834;v837++){v836[v837]=v824[v837];}
for(let v838=0;v838<v835;v838++){v836[v834+v838]=v833[v838];}
const v839=112;
const v840=113;
const v841=114;
const v842=115;
const v843=116;
const v844=117;
const v845=118;
const v846=119;
const v847=[v839,v840,v841,v842,v843,v844,v845,v846];
const v848=120;
const v849=121;
const v850=122;
const v851=123;
const v852=124;
const v853=125;
const v854=126;
const v855=127;
const v856=[v848,v849,v850,v851,v852,v853,v854,v855];
const v857=v847.length;
const v858=v856.length;
const v859=new Array(v857+v858);
for(let v860=0;v860<v857;v860++){v859[v860]=v847[v860];}
for(let v861=0;v861<v858;v861++){v859[v857+v861]=v856[v861];}
const v862=v836.length;
const v863=v859.length;
const v864=new Array(v862+v863);
for(let v865=0;v865<v862;v865++){v864[v865]=v836[v865];}
for(let v866=0;v866<v863;v866++){v864[v862+v866]=v859[v866];}
const v867=v813.length;
const v868=v864.length;
const v869=new Array(v867+v868);
for(let v870=0;v870<v867;v870++){v869[v870]=v813[v870];}
for(let v871=0;v871<v868;v871++){v869[v867+v871]=v864[v871];}
const v872=v762.length;
const v873=v869.length;
const v874=new Array(v872+v873);
for(let v875=0;v875<v872;v875++){v874[v875]=v762[v875];}
for(let v876=0;v876<v873;v876++){v874[v872+v876]=v869[v876];}
const v877=128;
const v878=129;
const v879=130;
const v880=131;
const v881=132;
const v882=133;
const v883=134;
const v884=135;
const v885=[v877,v878,v879,v880,v881,v882,v883,v884];
const v886=136;
const v887=137;
const v888=138;
const v889=139;
const v890=140;
const v891=141;
const v892=142;
const v893=143;
const v894=[v886,v887,v888,v889,v890,v891,v892,v893];
const v895=v885.length;
const v896=v894.length;
const v897=new Array(v895+v896);
for(let v898=0;v898<v895;v898++){v897[v898]=v885[v898];}
for(let v899=0;v899<v896;v899++){v897[v895+v899]=v894[v899];}
const v900=144;
const v901=145;
const v902=146;
const v903=147;
const v904=148;
const v905=149;
const v906=150;
const v907=151;
const v908=[v900,v901,v902,v903,v904,v905,v906,v907];
const v909=152;
const v910=153;
const v911=154;
const v912=155;
const v913=156;
const v914=157;
const v915=158;
const v916=159;
const v917=[v909,v910,v911,v912,v913,v914,v915,v916];
const v918=v908.length;
const v919=v917.length;
const v920=new Array(v918+v919);
for(let v921=0;v921<v918;v921++){v920[v921]=v908[v921];}
for(let v922=0;v922<v919;v922++){v920[v918+v922]=v917[v922];}
const v923=v897.length;
const v924=v920.length;
const v925=new Array(v923+v924);
for(let v926=0;v926<v923;v926++){v925[v926]=v897[v926];}
for(let v927=0;v927<v924;v927++){v925[v923+v927]=v920[v927];}
const v928=160;
const v929=161;
const v930=162;
const v931=163;
const v932=164;
const v933=165;
const v934=166;
const v935=167;
const v936=[v928,v929,v930,v931,v932,v933,v934,v935];
const v937=168;
const v938=169;
const v939=170;
const v940=171;
const v941=172;
const v942=173;
const v943=174;
const v944=175;
const v945=[v937,v938,v939,v940,v941,v942,v943,v944];
const v946=v936.length;
const v947=v945.length;
const v948=new Array(v946+v947);
for(let v949=0;v949<v946;v949++){v948[v949]=v936[v949];}
for(let v950=0;v950<v947;v950++){v948[v946+v950]=v945[v950];}
const v951=176;
const v952=177;
const v953=178;
const v954=179;
const v955=180;
const v956=181;
const v957=182;
const v958=183;
const v959=[v951,v952,v953,v954,v955,v956,v957,v958];
const v960=184;
const v961=185;
const v962=186;
const v963=187;
const v964=188;
const v965=189;
const v966=190;
const v967=191;
const v968=[v960,v961,v962,v963,v964,v965,v966,v967];
const v969=v959.length;
const v970=v968.length;
const v971=new Array(v969+v970);
for(let v972=0;v972<v969;v972++){v971[v972]=v959[v972];}
for(let v973=0;v973<v970;v973++){v971[v969+v973]=v968[v973];}
const v974=v948.length;
const v975=v971.length;
const v976=new Array(v974+v975);
for(let v977=0;v977<v974;v977++){v976[v977]=v948[v977];}
for(let v978=0;v978<v975;v978++){v976[v974+v978]=v971[v978];}
const v979=v925.length;
const v980=v976.length;
const v981=new Array(v979+v980);
for(let v982=0;v982<v979;v982++){v981[v982]=v925[v982];}
for(let v983=0;v983<v980;v983++){v981[v979+v983]=v976[v983];}
const v984=192;
const v985=193;
const v986=194;
const v987=195;
const v988=196;
const v989=197;
const v990=198;
const v991=199;
const v992=[v984,v985,v986,v987,v988,v989,v990,v991];
const v993=200;
const v994=201;
const v995=202;
const v996=203;
const v997=204;
const v998=205;
const v999=206;
const v1000=207;
const v1001=[v993,v994,v995,v996,v997,v998,v999,v1000];
const v1002=v992.length;
const v1003=v1001.length;
const v1004=new Array(v1002+v1003);
for(let v1005=0;v1005<v1002;v1005++){v1004[v1005]=v992[v1005];}
for(let v1006=0;v1006<v1003;v1006++){v1004[v1002+v1006]=v1001[v1006];}
const v1007=208;
const v1008=209;
const v1009=210;
const v1010=211;
const v1011=212;
const v1012=213;
const v1013=214;
const v1014=215;
const v1015=[v1007,v1008,v1009,v1010,v1011,v1012,v1013,v1014];
const v1016=216;
const v1017=217;
const v1018=218;
const v1019=219;
const v1020=220;
const v1021=221;
const v1022=222;
const v1023=223;
const v1024=[v1016,v1017,v1018,v1019,v1020,v1021,v1022,v1023];
const v1025=v1015.length;
const v1026=v1024.length;
const v1027=new Array(v1025+v1026);
for(let v1028=0;v1028<v1025;v1028++){v1027[v1028]=v1015[v1028];}
for(let v1029=0;v1029<v1026;v1029++){v1027[v1025+v1029]=v1024[v1029];}
const v1030=v1004.length;
const v1031=v1027.length;
const v1032=new Array(v1030+v1031);
for(let v1033=0;v1033<v1030;v1033++){v1032[v1033]=v1004[v1033];}
for(let v1034=0;v1034<v1031;v1034++){v1032[v1030+v1034]=v1027[v1034];}
const v1035=224;
const v1036=225;
const v1037=226;
const v1038=227;
const v1039=228;
const v1040=229;
const v1041=230;
const v1042=231;
const v1043=[v1035,v1036,v1037,v1038,v1039,v1040,v1041,v1042];
const v1044=232;
const v1045=233;
const v1046=234;
const v1047=235;
const v1048=236;
const v1049=237;
const v1050=238;
const v1051=239;
const v1052=[v1044,v1045,v1046,v1047,v1048,v1049,v1050,v1051];
const v1053=v1043.length;
const v1054=v1052.length;
const v1055=new Array(v1053+v1054);
for(let v1056=0;v1056<v1053;v1056++){v1055[v1056]=v1043[v1056];}
for(let v1057=0;v1057<v1054;v1057++){v1055[v1053+v1057]=v1052[v1057];}
const v1058=240;
const v1059=241;
const v1060=242;
const v1061=243;
const v1062=244;
const v1063=245;
const v1064=246;
const v1065=247;
const v1066=[v1058,v1059,v1060,v1061,v1062,v1063,v1064,v1065];
const v1067=248;
const v1068=249;
const v1069=250;
const v1070=251;
const v1071=252;
const v1072=253;
const v1073=254;
const v1074=255;
const v1075=[v1067,v1068,v1069,v1070,v1071,v1072,v1073,v1074];
const v1076=v1066.length;
const v1077=v1075.length;
const v1078=new Array(v1076+v1077);
for(let v1079=0;v1079<v1076;v1079++){v1078[v1079]=v1066[v1079];}
for(let v1080=0;v1080<v1077;v1080++){v1078[v1076+v1080]=v1075[v1080];}
const v1081=v1055.length;
const v1082=v1078.length;
const v1083=new Array(v1081+v1082);
for(let v1084=0;v1084<v1081;v1084++){v1083[v1084]=v1055[v1084];}
for(let v1085=0;v1085<v1082;v1085++){v1083[v1081+v1085]=v1078[v1085];}
const v1086=v1032.length;
const v1087=v1083.length;
const v1088=new Array(v1086+v1087);
for(let v1089=0;v1089<v1086;v1089++){v1088[v1089]=v1032[v1089];}
for(let v1090=0;v1090<v1087;v1090++){v1088[v1086+v1090]=v1083[v1090];}
const v1091=v981.length;
const v1092=v1088.length;
const v1093=new Array(v1091+v1092);
for(let v1094=0;v1094<v1091;v1094++){v1093[v1094]=v981[v1094];}
for(let v1095=0;v1095<v1092;v1095++){v1093[v1091+v1095]=v1088[v1095];}
const v1096=v874.length;
const v1097=v1093.length;
for(let v1098=0;v1098<v1096;v1098++){
v657[0+v1098]=v874[v1098];
}
for(let v1099=0;v1099<v1097;v1099++){
v657[v1096+v1099]=v1093[v1099];
}
const v1100=v1096+v1097;
return v1100;}
function __into3(v1101,v1102,v1103){
const v1104=__fn0();
const v1105=(v1102).length;
const v1106=0;
let v1107;if((v1105===v1106)){
const v1108=v1104.length;
for(let v1110=0;v1110<v1108;v1110++){
const v1111=(v1104[v1110]>>>0);
v1103[v1110]=__intoOutput3(0.0);
}
v1107=v1108;}else{
const v1112=v1104.length;
const v1113=new Array(v1112);
for(let v1114=0;v1114<v1112;v1114++){
const v1115=(v1104[v1114]>>>0);
const v1116=v1102.length;
const v1117=new Array(v1116);
for(let v1118=0;v1118<v1116;v1118++){
const v1119=(v1102[v1118]>>>0);
const v1120=256;
const v1121=(Math.imul(v1119,v1120) >>> 0);
const v1122=(((v1121) + (v1115)) >>> 0);
let v1123;if(v1122<v1101.length){v1123=v1101[v1122];}else{
v1123=0.0;}
v1117[v1118]=__nfValue(v1123);
}
let v1124=0.0;
for(let v1125=0;v1125<v1117.length;v1125++){
const v1126=v1117[v1125];
const v1127=v1124;
const v1128=__nfValue(v1126);
v1124=Math.fround(__nfNumber(v1127) + __nfNumber(v1128));
}
const v1129=v1124;
v1113[v1114]=Math.fround((__nfNumber(v1129))/(__nfNumber(Math.fround((v1102).length))));
}
const v1130=v1113.length;
const v1131=new Array(v1130);
for(let v1132=0;v1132<v1130;v1132++){
const v1133=v1113[v1132];
const v1134=__nfValue(v1133);
const v1135=__nfValue(v1133);
v1131[v1132]=Math.fround(__nfNumber(v1134) * __nfNumber(v1135));
}
let v1136=0.0;
for(let v1137=v1131.length-1;v1137>=0;v1137--){
const v1138=v1131[v1137];
const v1139=__nfValue(v1138);
const v1140=v1136;
v1136=Math.fround(__nfNumber(v1139) + __nfNumber(v1140));
}
const v1141=Math.fround(Math.sqrt(__nfNumber(v1136)));
const v1142=1.000000023742228e-32;
const v1143=Math.fround(v1141 + v1142);
const v1144=v1113.length;
for(let v1146=0;v1146<v1144;v1146++){
const v1147=v1113[v1146];
v1103[v1146]=__intoOutput3(Math.fround((__nfNumber(__nfValue(v1147)))/(__nfNumber(v1143))));
}
v1107=v1144;}
return v1107;}
function __into5(v1148,v1149,v1150,v1151,v1152,v1153){
const v1154=v1152.length;
for(let v1156=0;v1156<v1154;v1156++){
const v1157=(v1152[v1156]>>>0);
const v1158=256;
let v1159;if(v1158===0 ){
v1159=0;}else{
v1159=(Math.trunc(v1157/v1158)+0);}
const v1160=v1159;
const v1161=256;
let v1162;if(v1161===0 ){
v1162=0;}else{
v1162=((v1157%v1161)+0);}
const v1163=v1162;
let v1164;if(v1160<v1151.length){v1164=v1151[v1160];}else{
v1164=0;}
const v1165=v1164;
let v1166;if(v1160<v1150.length){v1166=v1150[v1160];}else{
v1166=0;}
const v1167=v1166;
const v1168=4096;
const v1169=0;
const v1170=0.0;
let v1171=v1169;
let v1172=v1170;
for(let v1174=0;v1174<v1168;v1174++){
const v1175=v1171;
if(((v1175) >= (v1165))){break;}
const v1176=(v1174>>>0);
const v1177=v1171;
const v1178=1;
const v1179=(((v1177) + (v1178)) >>> 0);
const v1180=__nfValue(v1172);
const v1181=(((v1167) + (v1176)) >>> 0);
let v1182;if(v1181<v1149.length){v1182=v1149[v1181];}else{
v1182=0;}
const v1183=v1182;
const v1184=256;
const v1185=(Math.imul(v1183,v1184) >>> 0);
const v1186=(((v1185) + (v1163)) >>> 0);
let v1187;if(v1186<v1148.length){v1187=v1148[v1186];}else{
v1187=0.0;}
const v1188=__nfValue(v1187);
const v1189=Math.fround(__nfNumber(v1180) + __nfNumber(v1188));
v1171=v1179;
v1172=v1189;
}
const v1191=0;
let v1192;if((v1165===v1191)){
v1192=0.0;}else{
v1192=Math.fround((__nfNumber(__nfValue(v1172)))/(__nfNumber(Math.fround(v1165))));}
v1153[v1156]=__intoOutput5(v1192);
}
return v1154;}
function __into7(v1193,v1194,v1195){
const v1196=v1194.length;
for(let v1198=0;v1198<v1196;v1198++){
const v1199=(v1194[v1198]>>>0);
let v1200=0.0;
for(let v1201=0;v1201<256;v1201++){
const v1202=(v1201>>>0);
const v1203=256;
const v1204=(Math.imul(v1199,v1203) >>> 0);
const v1205=255;
const v1206=(((v1204) + (v1205)) >>> 0);
const v1207=(((v1206) - (v1202)) >>> 0);
let v1208;if(v1207<v1193.length){v1208=v1193[v1207];}else{
v1208=0.0;}
const v1209=__nfValue(v1208);
const v1210=256;
const v1211=(Math.imul(v1199,v1210) >>> 0);
const v1212=255;
const v1213=(((v1211) + (v1212)) >>> 0);
const v1214=(((v1213) - (v1202)) >>> 0);
let v1215;if(v1214<v1193.length){v1215=v1193[v1214];}else{
v1215=0.0;}
const v1216=__nfValue(v1215);
const v1217=Math.fround(__nfNumber(v1209) * __nfNumber(v1216));
const v1218=v1200;
v1200=Math.fround(v1217 + __nfNumber(v1218));}
const v1219=v1200;
const v1220=Math.fround(Math.sqrt(__nfNumber(v1219)));
const v1221=1.000000023742228e-32;
v1195[v1198]=__intoOutput7(Math.fround(v1220 + v1221));
}
return v1196;}
function __into8(v1222,v1223,v1224,v1225){
const v1226=v1224.length;
for(let v1228=0;v1228<v1226;v1228++){
const v1229=(v1224[v1228]>>>0);
let v1230;if(v1229<v1222.length){v1230=v1222[v1229];}else{
v1230=0.0;}
const v1231=256;
let v1232;if(v1231===0 ){
v1232=0;}else{
v1232=(Math.trunc(v1229/v1231)+0);}
const v1233=v1232;
let v1234;if(v1233<v1223.length){v1234=v1223[v1233];}else{
v1234=1.0;}
v1225[v1228]=__intoOutput8(Math.fround((__nfNumber(__nfValue(v1230)))/(__nfNumber(__nfValue(v1234)))));
}
return v1226;}
const __namedTypes={"Accumulator":{"fields":[{"name":"index","type":{"kind":"u32"}},{"name":"total","type":{"kind":"f32"}}],"kind":"record","name":"Accumulator"}};
export const metadata = {"abi":"ink-javascript-trusted-values-v2","backend":"javascript","core_semantics":"ink-executable-core-v11","core_sha256":"d3677b4a238693c6b74aec8399e79ab9782bdefe1c991b05402ee19bcf0f9959","destination_abi":{"aliasing":"destination-disjoint-from-all-reachable-inputs","capacity":"trusted","count_unit":"elements","name":"ink-javascript-into-v1","ownership":"caller-owned","tail":"unwritten"},"f32_computation":"native-number-with-exact-nonfinite-tags","f32_storage":"native-number-with-exact-nonfinite-tags","functions":[{"destination":{"abi":"ink-javascript-into-v1","count_unit":"elements","ownership":"caller-owned"},"index":0,"internal":false,"name":"coordinates","parallel":false,"params":[],"precondition":null,"result":{"element":{"kind":"u32"},"kind":"list"}},{"destination":null,"index":1,"internal":false,"name":"lookup","parallel":false,"params":[{"name":"weights","type":{"element":{"kind":"f32"},"kind":"list"}},{"name":"position","type":{"kind":"u32"}}],"precondition":null,"result":{"kind":"f32"}},{"destination":null,"index":2,"internal":false,"name":"coordinate","parallel":false,"params":[{"name":"weights","type":{"element":{"kind":"f32"},"kind":"list"}},{"name":"ids","type":{"element":{"kind":"u32"},"kind":"list"}},{"name":"dimension","type":{"kind":"u32"}}],"precondition":null,"result":{"kind":"f32"}},{"destination":{"abi":"ink-javascript-into-v1","count_unit":"elements","ownership":"caller-owned"},"index":3,"internal":false,"name":"encode","parallel":false,"params":[{"name":"weights","type":{"element":{"kind":"f32"},"kind":"list"}},{"name":"ids","type":{"element":{"kind":"u32"},"kind":"list"}}],"precondition":null,"result":{"element":{"kind":"f32"},"kind":"list"}},{"destination":null,"index":4,"internal":false,"name":"pool_one","parallel":false,"params":[{"name":"weights","type":{"element":{"kind":"f32"},"kind":"list"}},{"name":"tokens","type":{"element":{"kind":"u32"},"kind":"list"}},{"name":"starts","type":{"element":{"kind":"u32"},"kind":"list"}},{"name":"lengths","type":{"element":{"kind":"u32"},"kind":"list"}},{"name":"position","type":{"kind":"u32"}}],"precondition":null,"result":{"kind":"f32"}},{"destination":{"abi":"ink-javascript-into-v1","count_unit":"elements","ownership":"caller-owned"},"index":5,"internal":false,"name":"pool_batch","parallel":false,"params":[{"name":"weights","type":{"element":{"kind":"f32"},"kind":"list"}},{"name":"tokens","type":{"element":{"kind":"u32"},"kind":"list"}},{"name":"starts","type":{"element":{"kind":"u32"},"kind":"list"}},{"name":"lengths","type":{"element":{"kind":"u32"},"kind":"list"}},{"name":"positions","type":{"element":{"kind":"u32"},"kind":"list"}}],"precondition":null,"result":{"element":{"kind":"f32"},"kind":"list"}},{"destination":null,"index":6,"internal":false,"name":"norm_one","parallel":false,"params":[{"name":"means","type":{"element":{"kind":"f32"},"kind":"list"}},{"name":"document","type":{"kind":"u32"}}],"precondition":null,"result":{"kind":"f32"}},{"destination":{"abi":"ink-javascript-into-v1","count_unit":"elements","ownership":"caller-owned"},"index":7,"internal":false,"name":"norm_batch","parallel":false,"params":[{"name":"means","type":{"element":{"kind":"f32"},"kind":"list"}},{"name":"documents","type":{"element":{"kind":"u32"},"kind":"list"}}],"precondition":null,"result":{"element":{"kind":"f32"},"kind":"list"}},{"destination":{"abi":"ink-javascript-into-v1","count_unit":"elements","ownership":"caller-owned"},"index":8,"internal":false,"name":"normalize_batch","parallel":false,"params":[{"name":"means","type":{"element":{"kind":"f32"},"kind":"list"}},{"name":"norms","type":{"element":{"kind":"f32"},"kind":"list"}},{"name":"positions","type":{"element":{"kind":"u32"},"kind":"list"}}],"precondition":null,"result":{"element":{"kind":"f32"},"kind":"list"}}],"named_types":{"Accumulator":{"fields":[{"name":"index","type":{"kind":"u32"}},{"name":"total","type":{"kind":"f32"}}],"kind":"record","name":"Accumulator"}},"prepared_compiled":{"destination":{"call":"callPreparedCompiledInto","capacity":"trusted","failure":"destination may be partially written","float_values":"trusted public representation","inputs":"sealed compiled values","ownership":"caller-owned","structured_elements":"detached","tail":"unwritten"},"evaluation":"lazy source-order; successful bindings only","functions":[{"factory":false,"function":"coordinates","reason":"no reusable captured work"},{"factory":false,"function":"lookup","reason":"no reusable captured work"},{"delegated_calls":0,"factory":true,"function":"coordinate","retained_bindings":1},{"delegated_calls":0,"factory":true,"function":"encode","retained_bindings":3},{"delegated_calls":0,"factory":true,"function":"pool_one","retained_bindings":1},{"factory":false,"function":"pool_batch","reason":"no reusable captured work"},{"factory":false,"function":"norm_one","reason":"no reusable captured work"},{"factory":false,"function":"norm_batch","reason":"no reusable captured work"},{"factory":false,"function":"normalize_batch","reason":"no reusable captured work"}],"lifetime":"prepared token","semantics":"sealed-value-residual-v1"},"private_record_elisions":[],"private_sum_spines":[],"schema":1,"state":null,"wire":{"format":"ink-value-wire-v1","functions":{"coordinate":{"arguments":{"format":"ink-value-wire-v1","identity":"5db5d7579dcfaf2743aec51d57b838fad45c3640904b8d397db6ea18f95a6d20","named":{},"root":{"fields":[{"name":"weights","type":{"element":{"kind":"f32"},"kind":"list"}},{"name":"ids","type":{"element":{"kind":"u32"},"kind":"list"}},{"name":"dimension","type":{"kind":"u32"}}],"kind":"record","name":"arguments"}},"result":{"format":"ink-value-wire-v1","identity":"fde3b27ba939906c22dbea906c407580e89648dd4d5a55c4f4001e45157ebe45","named":{},"root":{"kind":"f32"}}},"coordinates":{"arguments":{"format":"ink-value-wire-v1","identity":"3720cf83cb9a672c0c70e7f80cfe0abe0bf9b7df73d40a9def0c7436234026b2","named":{},"root":{"fields":[],"kind":"record","name":"arguments"}},"result":{"format":"ink-value-wire-v1","identity":"69ebf947aa59a2546656d1976b0baa6e56e7182d989425379b31e3bff74168ca","named":{},"root":{"element":{"kind":"u32"},"kind":"list"}}},"encode":{"arguments":{"format":"ink-value-wire-v1","identity":"52f976941e79f0070d35cc31ade4645a48d4b845dc29ce0f3580aea8b22af5c7","named":{},"root":{"fields":[{"name":"weights","type":{"element":{"kind":"f32"},"kind":"list"}},{"name":"ids","type":{"element":{"kind":"u32"},"kind":"list"}}],"kind":"record","name":"arguments"}},"result":{"format":"ink-value-wire-v1","identity":"0cbb9d1ff6b72318080ea11a6297b384d97178624f821e3901cca51ec8ad4477","named":{},"root":{"element":{"kind":"f32"},"kind":"list"}}},"lookup":{"arguments":{"format":"ink-value-wire-v1","identity":"5d9cf4151df36b52a5113a37cc9f3e07a1338831f163bddcaacbaa2df6a26c23","named":{},"root":{"fields":[{"name":"weights","type":{"element":{"kind":"f32"},"kind":"list"}},{"name":"position","type":{"kind":"u32"}}],"kind":"record","name":"arguments"}},"result":{"format":"ink-value-wire-v1","identity":"fde3b27ba939906c22dbea906c407580e89648dd4d5a55c4f4001e45157ebe45","named":{},"root":{"kind":"f32"}}},"norm_batch":{"arguments":{"format":"ink-value-wire-v1","identity":"4006eec9db14c303ad8be89dfcadb07733365c43ff2c45b768284691991378c0","named":{},"root":{"fields":[{"name":"means","type":{"element":{"kind":"f32"},"kind":"list"}},{"name":"documents","type":{"element":{"kind":"u32"},"kind":"list"}}],"kind":"record","name":"arguments"}},"result":{"format":"ink-value-wire-v1","identity":"0cbb9d1ff6b72318080ea11a6297b384d97178624f821e3901cca51ec8ad4477","named":{},"root":{"element":{"kind":"f32"},"kind":"list"}}},"norm_one":{"arguments":{"format":"ink-value-wire-v1","identity":"a2747c9fc9074f532462d28a925c3e2c609c8aff9c933eef98e99344cd2e8dea","named":{},"root":{"fields":[{"name":"means","type":{"element":{"kind":"f32"},"kind":"list"}},{"name":"document","type":{"kind":"u32"}}],"kind":"record","name":"arguments"}},"result":{"format":"ink-value-wire-v1","identity":"fde3b27ba939906c22dbea906c407580e89648dd4d5a55c4f4001e45157ebe45","named":{},"root":{"kind":"f32"}}},"normalize_batch":{"arguments":{"format":"ink-value-wire-v1","identity":"37ed4d2bc0c73b6b901739518e77cc9a32bf42a5cea9a5a22b322cbdd77bd413","named":{},"root":{"fields":[{"name":"means","type":{"element":{"kind":"f32"},"kind":"list"}},{"name":"norms","type":{"element":{"kind":"f32"},"kind":"list"}},{"name":"positions","type":{"element":{"kind":"u32"},"kind":"list"}}],"kind":"record","name":"arguments"}},"result":{"format":"ink-value-wire-v1","identity":"0cbb9d1ff6b72318080ea11a6297b384d97178624f821e3901cca51ec8ad4477","named":{},"root":{"element":{"kind":"f32"},"kind":"list"}}},"pool_batch":{"arguments":{"format":"ink-value-wire-v1","identity":"ddadf6beffbc9045b63cea0bfff0074a68c141bf796b482f13238a0b95e88217","named":{},"root":{"fields":[{"name":"weights","type":{"element":{"kind":"f32"},"kind":"list"}},{"name":"tokens","type":{"element":{"kind":"u32"},"kind":"list"}},{"name":"starts","type":{"element":{"kind":"u32"},"kind":"list"}},{"name":"lengths","type":{"element":{"kind":"u32"},"kind":"list"}},{"name":"positions","type":{"element":{"kind":"u32"},"kind":"list"}}],"kind":"record","name":"arguments"}},"result":{"format":"ink-value-wire-v1","identity":"0cbb9d1ff6b72318080ea11a6297b384d97178624f821e3901cca51ec8ad4477","named":{},"root":{"element":{"kind":"f32"},"kind":"list"}}},"pool_one":{"arguments":{"format":"ink-value-wire-v1","identity":"b9388922ac8bca163fda433f9b68e33ab6dbca5368e0041959f1760ef1d65d60","named":{},"root":{"fields":[{"name":"weights","type":{"element":{"kind":"f32"},"kind":"list"}},{"name":"tokens","type":{"element":{"kind":"u32"},"kind":"list"}},{"name":"starts","type":{"element":{"kind":"u32"},"kind":"list"}},{"name":"lengths","type":{"element":{"kind":"u32"},"kind":"list"}},{"name":"position","type":{"kind":"u32"}}],"kind":"record","name":"arguments"}},"result":{"format":"ink-value-wire-v1","identity":"fde3b27ba939906c22dbea906c407580e89648dd4d5a55c4f4001e45157ebe45","named":{},"root":{"kind":"f32"}}}}}};
const __implementations=[__fn0,__fn1,__fn2,__fn3,__fn4,__fn5,__fn6,__fn7,__fn8];

function __freeze(v) { if(v && typeof v==='object') {Object.values(v).forEach(__freeze);Object.freeze(v);} return v; }
__freeze(metadata);
const __inputTypes=[{"capture":[],"types":[]},{"capture":[true,true],"types":[{"element":{"kind":"f32"},"kind":"list"},{"kind":"u32"}]},{"capture":[true,true,true],"types":[{"element":{"kind":"f32"},"kind":"list"},{"element":{"kind":"u32"},"kind":"list"},{"kind":"u32"}]},{"capture":[true,true],"types":[{"element":{"kind":"f32"},"kind":"list"},{"element":{"kind":"u32"},"kind":"list"}]},{"capture":[true,true,true,true,true],"types":[{"element":{"kind":"f32"},"kind":"list"},{"element":{"kind":"u32"},"kind":"list"},{"element":{"kind":"u32"},"kind":"list"},{"element":{"kind":"u32"},"kind":"list"},{"kind":"u32"}]},{"capture":[true,true,true,true,true],"types":[{"element":{"kind":"f32"},"kind":"list"},{"element":{"kind":"u32"},"kind":"list"},{"element":{"kind":"u32"},"kind":"list"},{"element":{"kind":"u32"},"kind":"list"},{"element":{"kind":"u32"},"kind":"list"}]},{"capture":[true,true],"types":[{"element":{"kind":"f32"},"kind":"list"},{"kind":"u32"}]},{"capture":[true,true],"types":[{"element":{"kind":"f32"},"kind":"list"},{"element":{"kind":"u32"},"kind":"list"}]},{"capture":[true,true,true],"types":[{"element":{"kind":"f32"},"kind":"list"},{"element":{"kind":"f32"},"kind":"list"},{"element":{"kind":"u32"},"kind":"list"}]}];
export const functions=Object.freeze({...Object.freeze(Object.fromEntries(metadata.functions.filter(f=>!f.internal).map(f=> {
  const input=__inputTypes[f.index].types.map((t,i)=>__representation(t,false,__inputTypes[f.index].capture[i]));
  const output=__representation(f.result,true);
  const body=__implementations[f.index];
  const implementation=f.precondition==null?body:(...args)=>{if(__implementations[f.precondition](...args)!==true)throw Error('contract precondition failed');return body(...args);};
  const needsInput=input.some(c=>c!==__identity);
  const entry=!needsInput && output===__identity ? implementation :
    (...args)=>{const context=new WeakMap();return output(implementation(...(needsInput ? args.map((v,i)=>input[i](v,context)) : args)),context);};
  return [f.name,entry];
}))),...Object.freeze(Object.fromEntries([["lookup",(()=>{const c0=__representation(__inputTypes[1].types[0],false,__inputTypes[1].capture[0]);const c1=__representation(__inputTypes[1].types[1],false,__inputTypes[1].capture[1]);const output=__representation(metadata.functions[1].result,true);const input=[c0,c1],needsInput=input.some(c=>c!==__identity);const needsContext=(c0!==__identity);if(c0===__identity&&c1===__identity&&output===__identity)return __fn1;const fallback=(...args)=>{const context=new WeakMap();const values=needsInput?args.map((v,i)=>input[i](v,context)):args;return output(__fn1(...values),context);};return function(a0,a1){if(arguments.length!==2)return fallback(...arguments);const context=(needsContext||(Number(c0!==__identity&&a0!==null&&typeof a0==='object')+Number(c1!==__identity&&a1!==null&&typeof a1==='object'))>1)?new WeakMap():null;const v0=c0(a0,context);const v1=c1(a1,context);return output(__fn1(v0,v1),context);};})()],
["coordinate",(()=>{const c0=__representation(__inputTypes[2].types[0],false,__inputTypes[2].capture[0]);const c1=__representation(__inputTypes[2].types[1],false,__inputTypes[2].capture[1]);const c2=__representation(__inputTypes[2].types[2],false,__inputTypes[2].capture[2]);const output=__representation(metadata.functions[2].result,true);const input=[c0,c1,c2],needsInput=input.some(c=>c!==__identity);const needsContext=(c0!==__identity||c1!==__identity);if(c0===__identity&&c1===__identity&&c2===__identity&&output===__identity)return __fn2;const fallback=(...args)=>{const context=new WeakMap();const values=needsInput?args.map((v,i)=>input[i](v,context)):args;return output(__fn2(...values),context);};return function(a0,a1,a2){if(arguments.length!==3)return fallback(...arguments);const context=(needsContext||(Number(c0!==__identity&&a0!==null&&typeof a0==='object')+Number(c1!==__identity&&a1!==null&&typeof a1==='object')+Number(c2!==__identity&&a2!==null&&typeof a2==='object'))>1)?new WeakMap():null;const v0=c0(a0,context);const v1=c1(a1,context);const v2=c2(a2,context);return output(__fn2(v0,v1,v2),context);};})()],
["pool_one",(()=>{const c0=__representation(__inputTypes[4].types[0],false,__inputTypes[4].capture[0]);const c1=__representation(__inputTypes[4].types[1],false,__inputTypes[4].capture[1]);const c2=__representation(__inputTypes[4].types[2],false,__inputTypes[4].capture[2]);const c3=__representation(__inputTypes[4].types[3],false,__inputTypes[4].capture[3]);const c4=__representation(__inputTypes[4].types[4],false,__inputTypes[4].capture[4]);const output=__representation(metadata.functions[4].result,true);const input=[c0,c1,c2,c3,c4],needsInput=input.some(c=>c!==__identity);const needsContext=(c0!==__identity||c1!==__identity||c2!==__identity||c3!==__identity);if(c0===__identity&&c1===__identity&&c2===__identity&&c3===__identity&&c4===__identity&&output===__identity)return __fn4;const fallback=(...args)=>{const context=new WeakMap();const values=needsInput?args.map((v,i)=>input[i](v,context)):args;return output(__fn4(...values),context);};return function(a0,a1,a2,a3,a4){if(arguments.length!==5)return fallback(...arguments);const context=(needsContext||(Number(c0!==__identity&&a0!==null&&typeof a0==='object')+Number(c1!==__identity&&a1!==null&&typeof a1==='object')+Number(c2!==__identity&&a2!==null&&typeof a2==='object')+Number(c3!==__identity&&a3!==null&&typeof a3==='object')+Number(c4!==__identity&&a4!==null&&typeof a4==='object'))>1)?new WeakMap():null;const v0=c0(a0,context);const v1=c1(a1,context);const v2=c2(a2,context);const v3=c3(a3,context);const v4=c4(a4,context);return output(__fn4(v0,v1,v2,v3,v4),context);};})()],
["norm_one",(()=>{const c0=__representation(__inputTypes[6].types[0],false,__inputTypes[6].capture[0]);const c1=__representation(__inputTypes[6].types[1],false,__inputTypes[6].capture[1]);const output=__representation(metadata.functions[6].result,true);const input=[c0,c1],needsInput=input.some(c=>c!==__identity);const needsContext=(c0!==__identity);if(c0===__identity&&c1===__identity&&output===__identity)return __fn6;const fallback=(...args)=>{const context=new WeakMap();const values=needsInput?args.map((v,i)=>input[i](v,context)):args;return output(__fn6(...values),context);};return function(a0,a1){if(arguments.length!==2)return fallback(...arguments);const context=(needsContext||(Number(c0!==__identity&&a0!==null&&typeof a0==='object')+Number(c1!==__identity&&a1!==null&&typeof a1==='object'))>1)?new WeakMap():null;const v0=c0(a0,context);const v1=c1(a1,context);return output(__fn6(v0,v1),context);};})()]]))});
export function call(name,args) { return functions[name](...args); }
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
function __ownedValue3(value,budget,depth){budget.enter(depth,8);const n=value.length;if(n>budget.remaining)throw Error('wire sequence size');const out=new Array(n);for(let i=0;i<n;i++)out[i]=__ownedValue2(value[i],budget,depth+1);return out;}
function __ownedValue0(value,budget,depth){budget.enter(depth,8);const n=value.length;if(n>budget.remaining)throw Error('wire sequence size');const out=new Array(n);for(let i=0;i<n;i++)out[i]=__ownedValue1(value[i],budget,depth+1);return out;}
function __ownedValue2(value,budget,depth){budget.enter(depth,8);const bits=typeof value==='number'?__bits(value):value.F32Bits;return {F32Bits:bits===0?0:bits};}
function __ownedValue1(value,budget,depth){budget.enter(depth,8);return value>>>0;}
const __ownedFunctions=Object.freeze(Object.fromEntries([["coordinates",__ownedValue0],["lookup",__ownedValue2],["coordinate",__ownedValue2],["encode",__ownedValue3],["pool_one",__ownedValue2],["pool_batch",__ownedValue3],["norm_one",__ownedValue2],["norm_batch",__ownedValue3],["normalize_batch",__ownedValue3]]));
function __wireValue1(reader){const end=reader.frame();const n=reader.count(),value=new Array(n);for(let i=0;i<n;i++)value[i]=__wireValue2(reader);reader.finish(end);return value;}
function __wireValue3(reader){const end=reader.frame();const n=reader.count(),value=new Array(n);for(let i=0;i<n;i++)value[i]=__wireValue4(reader);reader.finish(end);return value;}
function __wireValue5(reader){const end=reader.frame();const value={};reader.finish(end);return value;}
function __wireValue9(reader){const end=reader.frame();const value={["means"]:__wireValue1(reader),["document"]:__wireValue4(reader)};reader.finish(end);return value;}
function __wireValue8(reader){const end=reader.frame();const value={["means"]:__wireValue1(reader),["documents"]:__wireValue3(reader)};reader.finish(end);return value;}
function __wireValue10(reader){const end=reader.frame();const value={["means"]:__wireValue1(reader),["norms"]:__wireValue1(reader),["positions"]:__wireValue3(reader)};reader.finish(end);return value;}
function __wireValue0(reader){const end=reader.frame();const value={["weights"]:__wireValue1(reader),["ids"]:__wireValue3(reader),["dimension"]:__wireValue4(reader)};reader.finish(end);return value;}
function __wireValue6(reader){const end=reader.frame();const value={["weights"]:__wireValue1(reader),["ids"]:__wireValue3(reader)};reader.finish(end);return value;}
function __wireValue7(reader){const end=reader.frame();const value={["weights"]:__wireValue1(reader),["position"]:__wireValue4(reader)};reader.finish(end);return value;}
function __wireValue12(reader){const end=reader.frame();const value={["weights"]:__wireValue1(reader),["tokens"]:__wireValue3(reader),["starts"]:__wireValue3(reader),["lengths"]:__wireValue3(reader),["position"]:__wireValue4(reader)};reader.finish(end);return value;}
function __wireValue11(reader){const end=reader.frame();const value={["weights"]:__wireValue1(reader),["tokens"]:__wireValue3(reader),["starts"]:__wireValue3(reader),["lengths"]:__wireValue3(reader),["positions"]:__wireValue3(reader)};reader.finish(end);return value;}
function __wireValue2(reader){const end=reader.frame();const value={F32Bits:reader.word()};reader.finish(end);return value;}
function __wireValue4(reader){const end=reader.frame();const value=reader.word();reader.finish(end);return value;}
const __wireReaders=Object.freeze(Object.fromEntries([["coordinate",[__wireValue0,__wireValue2]],["coordinates",[__wireValue5,__wireValue3]],["encode",[__wireValue6,__wireValue1]],["lookup",[__wireValue7,__wireValue2]],["norm_batch",[__wireValue8,__wireValue1]],["norm_one",[__wireValue9,__wireValue2]],["normalize_batch",[__wireValue10,__wireValue1]],["pool_batch",[__wireValue11,__wireValue1]],["pool_one",[__wireValue12,__wireValue2]]]));
const __ownedImplementations=Object.freeze(Object.fromEntries([["coordinates",(()=>{const input=[],needsInput=input.some(c=>c!==__identity);const needsContext=false;if(true)return __fn0;const fallback=(...args)=>{const context=new WeakMap();const values=needsInput?args.map((v,i)=>input[i](v,context)):args;return __fn0(...values);};return function(){if(arguments.length!==0)return fallback(...arguments);const context=(needsContext)?new WeakMap():null;return __fn0();};})()],
["lookup",(()=>{const c0=__representation(__inputTypes[1].types[0],false,__inputTypes[1].capture[0]);const c1=__representation(__inputTypes[1].types[1],false,__inputTypes[1].capture[1]);const input=[c0,c1],needsInput=input.some(c=>c!==__identity);const needsContext=(c0!==__identity);if(c0===__identity&&c1===__identity)return __fn1;const fallback=(...args)=>{const context=new WeakMap();const values=needsInput?args.map((v,i)=>input[i](v,context)):args;return __fn1(...values);};return function(a0,a1){if(arguments.length!==2)return fallback(...arguments);const context=(needsContext||(Number(c0!==__identity&&a0!==null&&typeof a0==='object')+Number(c1!==__identity&&a1!==null&&typeof a1==='object'))>1)?new WeakMap():null;const v0=c0(a0,context);const v1=c1(a1,context);return __fn1(v0,v1);};})()],
["coordinate",(()=>{const c0=__representation(__inputTypes[2].types[0],false,__inputTypes[2].capture[0]);const c1=__representation(__inputTypes[2].types[1],false,__inputTypes[2].capture[1]);const c2=__representation(__inputTypes[2].types[2],false,__inputTypes[2].capture[2]);const input=[c0,c1,c2],needsInput=input.some(c=>c!==__identity);const needsContext=(c0!==__identity||c1!==__identity);if(c0===__identity&&c1===__identity&&c2===__identity)return __fn2;const fallback=(...args)=>{const context=new WeakMap();const values=needsInput?args.map((v,i)=>input[i](v,context)):args;return __fn2(...values);};return function(a0,a1,a2){if(arguments.length!==3)return fallback(...arguments);const context=(needsContext||(Number(c0!==__identity&&a0!==null&&typeof a0==='object')+Number(c1!==__identity&&a1!==null&&typeof a1==='object')+Number(c2!==__identity&&a2!==null&&typeof a2==='object'))>1)?new WeakMap():null;const v0=c0(a0,context);const v1=c1(a1,context);const v2=c2(a2,context);return __fn2(v0,v1,v2);};})()],
["encode",(()=>{const c0=__representation(__inputTypes[3].types[0],false,__inputTypes[3].capture[0]);const c1=__representation(__inputTypes[3].types[1],false,__inputTypes[3].capture[1]);const input=[c0,c1],needsInput=input.some(c=>c!==__identity);const needsContext=(c0!==__identity||c1!==__identity);if(c0===__identity&&c1===__identity)return __fn3;const fallback=(...args)=>{const context=new WeakMap();const values=needsInput?args.map((v,i)=>input[i](v,context)):args;return __fn3(...values);};return function(a0,a1){if(arguments.length!==2)return fallback(...arguments);const context=(needsContext||(Number(c0!==__identity&&a0!==null&&typeof a0==='object')+Number(c1!==__identity&&a1!==null&&typeof a1==='object'))>1)?new WeakMap():null;const v0=c0(a0,context);const v1=c1(a1,context);return __fn3(v0,v1);};})()],
["pool_one",(()=>{const c0=__representation(__inputTypes[4].types[0],false,__inputTypes[4].capture[0]);const c1=__representation(__inputTypes[4].types[1],false,__inputTypes[4].capture[1]);const c2=__representation(__inputTypes[4].types[2],false,__inputTypes[4].capture[2]);const c3=__representation(__inputTypes[4].types[3],false,__inputTypes[4].capture[3]);const c4=__representation(__inputTypes[4].types[4],false,__inputTypes[4].capture[4]);const input=[c0,c1,c2,c3,c4],needsInput=input.some(c=>c!==__identity);const needsContext=(c0!==__identity||c1!==__identity||c2!==__identity||c3!==__identity);if(c0===__identity&&c1===__identity&&c2===__identity&&c3===__identity&&c4===__identity)return __fn4;const fallback=(...args)=>{const context=new WeakMap();const values=needsInput?args.map((v,i)=>input[i](v,context)):args;return __fn4(...values);};return function(a0,a1,a2,a3,a4){if(arguments.length!==5)return fallback(...arguments);const context=(needsContext||(Number(c0!==__identity&&a0!==null&&typeof a0==='object')+Number(c1!==__identity&&a1!==null&&typeof a1==='object')+Number(c2!==__identity&&a2!==null&&typeof a2==='object')+Number(c3!==__identity&&a3!==null&&typeof a3==='object')+Number(c4!==__identity&&a4!==null&&typeof a4==='object'))>1)?new WeakMap():null;const v0=c0(a0,context);const v1=c1(a1,context);const v2=c2(a2,context);const v3=c3(a3,context);const v4=c4(a4,context);return __fn4(v0,v1,v2,v3,v4);};})()],
["pool_batch",(()=>{const c0=__representation(__inputTypes[5].types[0],false,__inputTypes[5].capture[0]);const c1=__representation(__inputTypes[5].types[1],false,__inputTypes[5].capture[1]);const c2=__representation(__inputTypes[5].types[2],false,__inputTypes[5].capture[2]);const c3=__representation(__inputTypes[5].types[3],false,__inputTypes[5].capture[3]);const c4=__representation(__inputTypes[5].types[4],false,__inputTypes[5].capture[4]);const input=[c0,c1,c2,c3,c4],needsInput=input.some(c=>c!==__identity);const needsContext=(c0!==__identity||c1!==__identity||c2!==__identity||c3!==__identity||c4!==__identity);if(c0===__identity&&c1===__identity&&c2===__identity&&c3===__identity&&c4===__identity)return __fn5;const fallback=(...args)=>{const context=new WeakMap();const values=needsInput?args.map((v,i)=>input[i](v,context)):args;return __fn5(...values);};return function(a0,a1,a2,a3,a4){if(arguments.length!==5)return fallback(...arguments);const context=(needsContext||(Number(c0!==__identity&&a0!==null&&typeof a0==='object')+Number(c1!==__identity&&a1!==null&&typeof a1==='object')+Number(c2!==__identity&&a2!==null&&typeof a2==='object')+Number(c3!==__identity&&a3!==null&&typeof a3==='object')+Number(c4!==__identity&&a4!==null&&typeof a4==='object'))>1)?new WeakMap():null;const v0=c0(a0,context);const v1=c1(a1,context);const v2=c2(a2,context);const v3=c3(a3,context);const v4=c4(a4,context);return __fn5(v0,v1,v2,v3,v4);};})()],
["norm_one",(()=>{const c0=__representation(__inputTypes[6].types[0],false,__inputTypes[6].capture[0]);const c1=__representation(__inputTypes[6].types[1],false,__inputTypes[6].capture[1]);const input=[c0,c1],needsInput=input.some(c=>c!==__identity);const needsContext=(c0!==__identity);if(c0===__identity&&c1===__identity)return __fn6;const fallback=(...args)=>{const context=new WeakMap();const values=needsInput?args.map((v,i)=>input[i](v,context)):args;return __fn6(...values);};return function(a0,a1){if(arguments.length!==2)return fallback(...arguments);const context=(needsContext||(Number(c0!==__identity&&a0!==null&&typeof a0==='object')+Number(c1!==__identity&&a1!==null&&typeof a1==='object'))>1)?new WeakMap():null;const v0=c0(a0,context);const v1=c1(a1,context);return __fn6(v0,v1);};})()],
["norm_batch",(()=>{const c0=__representation(__inputTypes[7].types[0],false,__inputTypes[7].capture[0]);const c1=__representation(__inputTypes[7].types[1],false,__inputTypes[7].capture[1]);const input=[c0,c1],needsInput=input.some(c=>c!==__identity);const needsContext=(c0!==__identity||c1!==__identity);if(c0===__identity&&c1===__identity)return __fn7;const fallback=(...args)=>{const context=new WeakMap();const values=needsInput?args.map((v,i)=>input[i](v,context)):args;return __fn7(...values);};return function(a0,a1){if(arguments.length!==2)return fallback(...arguments);const context=(needsContext||(Number(c0!==__identity&&a0!==null&&typeof a0==='object')+Number(c1!==__identity&&a1!==null&&typeof a1==='object'))>1)?new WeakMap():null;const v0=c0(a0,context);const v1=c1(a1,context);return __fn7(v0,v1);};})()],
["normalize_batch",(()=>{const c0=__representation(__inputTypes[8].types[0],false,__inputTypes[8].capture[0]);const c1=__representation(__inputTypes[8].types[1],false,__inputTypes[8].capture[1]);const c2=__representation(__inputTypes[8].types[2],false,__inputTypes[8].capture[2]);const input=[c0,c1,c2],needsInput=input.some(c=>c!==__identity);const needsContext=(c0!==__identity||c1!==__identity||c2!==__identity);if(c0===__identity&&c1===__identity&&c2===__identity)return __fn8;const fallback=(...args)=>{const context=new WeakMap();const values=needsInput?args.map((v,i)=>input[i](v,context)):args;return __fn8(...values);};return function(a0,a1,a2){if(arguments.length!==3)return fallback(...arguments);const context=(needsContext||(Number(c0!==__identity&&a0!==null&&typeof a0==='object')+Number(c1!==__identity&&a1!==null&&typeof a1==='object')+Number(c2!==__identity&&a2!==null&&typeof a2==='object'))>1)?new WeakMap():null;const v0=c0(a0,context);const v1=c1(a1,context);const v2=c2(a2,context);return __fn8(v0,v1,v2);};})()]]));

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
function __privateCapture2(value,budget,depth=0){budget.enter(depth,4);if(!Array.isArray(value)&&!(ArrayBuffer.isView(value)&&!(value instanceof DataView))){throw Error('invalid value for wire schema');}const n=value.length;if(n>budget.remaining){throw Error('invalid value for wire schema');}budget.add(4);const out=new Array(n);for(let i=0;i<n;i++)out[i]=__privateCapture3(value[i],budget,depth+1);return out.every(x=>typeof x==='number')?Float32Array.from(out):out;}
function __privateCapture0(value,budget,depth=0){budget.enter(depth,4);if(!Array.isArray(value)&&!(ArrayBuffer.isView(value)&&!(value instanceof DataView))){throw Error('invalid value for wire schema');}const n=value.length;if(n>budget.remaining){throw Error('invalid value for wire schema');}budget.add(4);const out=new Array(n);for(let i=0;i<n;i++)out[i]=__privateCapture1(value[i],budget,depth+1);return out;}
function __privateCapture3(value,budget,depth=0){budget.enter(depth,4);let bits;if(typeof value==='number'&&Number.isFinite(value)){bits=__bits(value);if(!Number.isFinite(__float(bits))){throw Error('invalid value for wire schema');}}else{if(!(value!==null&&typeof value==='object'&&Object.hasOwn(value,'F32Bits')&&Object.keys(value).length===1)){throw Error('invalid value for wire schema');}bits=value.F32Bits;if(!Number.isInteger(bits)||bits<0||bits>4294967295){throw Error('invalid value for wire schema');}}budget.add(4);return __nfFromBits(bits);}
function __privateCapture1(value,budget,depth=0){budget.enter(depth,4);if(typeof value!=='number'||!Number.isInteger(value)||value<0||value>4294967295){throw Error('invalid value for wire schema');}budget.add(4);return value===0?0:value;}
function __privateWireValue3(reader){const end=reader.frame();const n=reader.count(),value=new Array(n);for(let i=0;i<n;i++)value[i]=__privateWireValue4(reader);reader.finish(end);return value;}
function __privateWireValue0(reader){const end=reader.frame();const n=reader.count(),value=new Array(n);for(let i=0;i<n;i++)value[i]=__privateWireValue1(reader);reader.finish(end);return value;}
function __privateWireValue2(reader){const end=reader.frame();const value={};reader.finish(end);return value;}
function __privateWireValue10(reader){const end=reader.frame();const value={["means"]:__privateWireValue3(reader),["document"]:__privateWireValue1(reader)};reader.finish(end);return value;}
function __privateWireValue11(reader){const end=reader.frame();const value={["means"]:__privateWireValue3(reader),["documents"]:__privateWireValue0(reader)};reader.finish(end);return value;}
function __privateWireValue12(reader){const end=reader.frame();const value={["means"]:__privateWireValue3(reader),["norms"]:__privateWireValue3(reader),["positions"]:__privateWireValue0(reader)};reader.finish(end);return value;}
function __privateWireValue6(reader){const end=reader.frame();const value={["weights"]:__privateWireValue3(reader),["ids"]:__privateWireValue0(reader),["dimension"]:__privateWireValue1(reader)};reader.finish(end);return value;}
function __privateWireValue7(reader){const end=reader.frame();const value={["weights"]:__privateWireValue3(reader),["ids"]:__privateWireValue0(reader)};reader.finish(end);return value;}
function __privateWireValue5(reader){const end=reader.frame();const value={["weights"]:__privateWireValue3(reader),["position"]:__privateWireValue1(reader)};reader.finish(end);return value;}
function __privateWireValue8(reader){const end=reader.frame();const value={["weights"]:__privateWireValue3(reader),["tokens"]:__privateWireValue0(reader),["starts"]:__privateWireValue0(reader),["lengths"]:__privateWireValue0(reader),["position"]:__privateWireValue1(reader)};reader.finish(end);return value;}
function __privateWireValue9(reader){const end=reader.frame();const value={["weights"]:__privateWireValue3(reader),["tokens"]:__privateWireValue0(reader),["starts"]:__privateWireValue0(reader),["lengths"]:__privateWireValue0(reader),["positions"]:__privateWireValue0(reader)};reader.finish(end);return value;}
function __privateWireValue4(reader){const end=reader.frame();const value=__nfFromBits(reader.word());reader.finish(end);return value;}
function __privateWireValue1(reader){const end=reader.frame();const value=reader.word();reader.finish(end);return value;}
function __compiledOwnedValue2(value,budget,depth){budget.enter(depth,8);const n=value.length;if(n>budget.remaining)throw Error('wire sequence size');const out=new Array(n);for(let i=0;i<n;i++)out[i]=__compiledOwnedValue3(value[i],budget,depth+1);return out;}
function __compiledOwnedValue0(value,budget,depth){budget.enter(depth,8);const n=value.length;if(n>budget.remaining)throw Error('wire sequence size');const out=new Array(n);for(let i=0;i<n;i++)out[i]=__compiledOwnedValue1(value[i],budget,depth+1);return out;}
function __compiledOwnedValue3(value,budget,depth){budget.enter(depth,8);const bits=typeof value==='number'?__bits(value):value.F32Bits;return {F32Bits:bits===0?0:bits};}
function __compiledOwnedValue1(value,budget,depth){budget.enter(depth,8);return value>>>0;}
function __destinationOwnedValue1(value,budget,depth){budget.enter(depth,8);return __nfOutput(value);}
function __destinationOwnedValue0(value,budget,depth){budget.enter(depth,8);return value>>>0;}
function __privateWireWrite2(writer,value,compact){const frame=writer.openFrame();writer.count(value.length);for(let i=0;i<value.length;i++)__privateWireWrite3(writer,value[i],compact);writer.closeFrame(frame);}
function __privateWireWrite0(writer,value,compact){const frame=writer.openFrame();writer.count(value.length);for(let i=0;i<value.length;i++)__privateWireWrite1(writer,value[i],compact);writer.closeFrame(frame);}
function __privateWireWrite3(writer,value,compact){const frame=writer.openFrame();writer.word(__nfBits(value));writer.closeFrame(frame);}
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
let __constructorNodesValue;function __constructorNodes(){return __constructorNodesValue??=[{kind:"list",patterns:[{bytes:8,label:"sequence",children:[1],childDepth:1,sequence:true,charge:(budget,depth)=>{budget.enter(depth,8);},make:values=>(values)}]},{kind:"u32",scalar:__privateCapture1},{kind:"list",patterns:[{bytes:8,label:"sequence",children:[3],childDepth:1,sequence:true,charge:(budget,depth)=>{budget.enter(depth,8);},make:values=>(values)}]},{kind:"f32",scalar:__privateCapture3}];}
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
function __reduceValue3(value,r,b,d,c){b.enter(d,8);return r[3]({F32Bits:__nfBits(value)},c);}
let __reductionNodeCache;function __reductionNodes(){return __reductionNodeCache??=Object.freeze([Object.freeze({"children":Object.freeze([1]),"kind":"list"}),Object.freeze({"children":Object.freeze([]),"kind":"u32"}),Object.freeze({"children":Object.freeze([3]),"kind":"list"}),Object.freeze({"children":Object.freeze([]),"kind":"f32"})]);}
function __compiledNamed0(){return {};}
let __compiledCodec0Value;function __compiledCodec0(){return __compiledCodec0Value??=__compiledCodec({"format":"ink-value-wire-v1","identity":"69ebf947aa59a2546656d1976b0baa6e56e7182d989425379b31e3bff74168ca","named":__compiledNamed0(),"root":{"element":{"kind":"u32"},"kind":"list"}},__privateCapture0,__privateWireValue0,__privateWireWrite0,__compiledOwnedValue0,0,0,__reduceValue0,false,false);}
let __compiledCodec1Value;function __compiledCodec1(){return __compiledCodec1Value??=__compiledCodec({"format":"ink-value-wire-v1","identity":"0cbb9d1ff6b72318080ea11a6297b384d97178624f821e3901cca51ec8ad4477","named":__compiledNamed0(),"root":{"element":{"kind":"f32"},"kind":"list"}},__privateCapture2,__privateWireValue3,__privateWireWrite2,__compiledOwnedValue2,2,2,__reduceValue2,false,false);}
let __compiledCodec2Value;function __compiledCodec2(){return __compiledCodec2Value??=__compiledCodec({"format":"ink-value-wire-v1","identity":"51f75af7953a9d922f9ada927ffd8d0c8c476597ed69294f0a0425f75b052cff","named":__compiledNamed0(),"root":{"kind":"u32"}},__privateCapture1,__privateWireValue1,__privateWireWrite1,__compiledOwnedValue1,1,1,__reduceValue1,false,false);}
let __compiledCodec3Value;function __compiledCodec3(){return __compiledCodec3Value??=__compiledCodec({"format":"ink-value-wire-v1","identity":"fde3b27ba939906c22dbea906c407580e89648dd4d5a55c4f4001e45157ebe45","named":__compiledNamed0(),"root":{"kind":"f32"}},__privateCapture3,__privateWireValue4,__privateWireWrite3,__compiledOwnedValue3,3,3,__reduceValue3,false,false);}
const __compiledEntries=new Map([["coordinates",{index:0,params:[],result:__compiledCodec0,destination:{copy:__destinationOwnedValue0,direct:__into0},arguments:__privateWireValue2,argumentCodecs:[null,null],boundaryReaders:[false,false],onlyTypeGuards:false,needsInvariants:[],precondition:null}],["lookup",{index:1,params:[__compiledCodec1,__compiledCodec2],result:__compiledCodec3,destination:null,arguments:__privateWireValue5,argumentCodecs:[null,null],boundaryReaders:[false,false],onlyTypeGuards:false,needsInvariants:[false,false],precondition:null}],["coordinate",{index:2,params:[__compiledCodec1,__compiledCodec0,__compiledCodec2],result:__compiledCodec3,destination:null,arguments:__privateWireValue6,argumentCodecs:[null,null],boundaryReaders:[false,false],onlyTypeGuards:false,needsInvariants:[false,false,false],precondition:null}],["encode",{index:3,params:[__compiledCodec1,__compiledCodec0],result:__compiledCodec1,destination:{copy:__destinationOwnedValue1,direct:__into3},arguments:__privateWireValue7,argumentCodecs:[null,null],boundaryReaders:[false,false],onlyTypeGuards:false,needsInvariants:[false,false],precondition:null}],["pool_one",{index:4,params:[__compiledCodec1,__compiledCodec0,__compiledCodec0,__compiledCodec0,__compiledCodec2],result:__compiledCodec3,destination:null,arguments:__privateWireValue8,argumentCodecs:[null,null],boundaryReaders:[false,false],onlyTypeGuards:false,needsInvariants:[false,false,false,false,false],precondition:null}],["pool_batch",{index:5,params:[__compiledCodec1,__compiledCodec0,__compiledCodec0,__compiledCodec0,__compiledCodec0],result:__compiledCodec1,destination:{copy:__destinationOwnedValue1,direct:__into5},arguments:__privateWireValue9,argumentCodecs:[null,null],boundaryReaders:[false,false],onlyTypeGuards:false,needsInvariants:[false,false,false,false,false],precondition:null}],["norm_one",{index:6,params:[__compiledCodec1,__compiledCodec2],result:__compiledCodec3,destination:null,arguments:__privateWireValue10,argumentCodecs:[null,null],boundaryReaders:[false,false],onlyTypeGuards:false,needsInvariants:[false,false],precondition:null}],["norm_batch",{index:7,params:[__compiledCodec1,__compiledCodec0],result:__compiledCodec1,destination:{copy:__destinationOwnedValue1,direct:__into7},arguments:__privateWireValue11,argumentCodecs:[null,null],boundaryReaders:[false,false],onlyTypeGuards:false,needsInvariants:[false,false],precondition:null}],["normalize_batch",{index:8,params:[__compiledCodec1,__compiledCodec1,__compiledCodec0],result:__compiledCodec1,destination:{copy:__destinationOwnedValue1,direct:__into8},arguments:__privateWireValue12,argumentCodecs:[null,null],boundaryReaders:[false,false],onlyTypeGuards:false,needsInvariants:[false,false,false],precondition:null}]]);

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
const __intoOutput3=__representation(metadata.functions[3].result.element,true);
const __intoOutput5=__representation(metadata.functions[5].result.element,true);
const __intoOutput7=__representation(metadata.functions[7].result.element,true);
const __intoOutput8=__representation(metadata.functions[8].result.element,true);
const __intoImplementations=[__into0,null,null,__into3,null,__into5,null,__into7,__into8];
export const functionsInto=Object.freeze(Object.fromEntries([["coordinates",(()=>{const input=[],needsInput=input.some(c=>c!==__identity);const needsContext=false;if(true)return __into0;const fallback=(...args)=>{const context=new WeakMap();const values=input.map((convert,i)=>convert(args[i],context));return __into0(...values,args[0]);};return function(destination){if(arguments.length!==1)return fallback(...arguments);const context=(needsContext)?new WeakMap():null;return __into0(destination);};})()],
["encode",(()=>{const c0=__representation(__inputTypes[3].types[0],false,__inputTypes[3].capture[0]);const c1=__representation(__inputTypes[3].types[1],false,__inputTypes[3].capture[1]);const input=[c0,c1],needsInput=input.some(c=>c!==__identity);const needsContext=(c0!==__identity||c1!==__identity);if(c0===__identity&&c1===__identity)return __into3;const fallback=(...args)=>{const context=new WeakMap();const values=input.map((convert,i)=>convert(args[i],context));return __into3(...values,args[2]);};return function(a0,a1,destination){if(arguments.length!==3)return fallback(...arguments);const context=(needsContext||(Number(c0!==__identity&&a0!==null&&typeof a0==='object')+Number(c1!==__identity&&a1!==null&&typeof a1==='object'))>1)?new WeakMap():null;const v0=c0(a0,context);const v1=c1(a1,context);return __into3(v0,v1,destination);};})()],
["pool_batch",(()=>{const c0=__representation(__inputTypes[5].types[0],false,__inputTypes[5].capture[0]);const c1=__representation(__inputTypes[5].types[1],false,__inputTypes[5].capture[1]);const c2=__representation(__inputTypes[5].types[2],false,__inputTypes[5].capture[2]);const c3=__representation(__inputTypes[5].types[3],false,__inputTypes[5].capture[3]);const c4=__representation(__inputTypes[5].types[4],false,__inputTypes[5].capture[4]);const input=[c0,c1,c2,c3,c4],needsInput=input.some(c=>c!==__identity);const needsContext=(c0!==__identity||c1!==__identity||c2!==__identity||c3!==__identity||c4!==__identity);if(c0===__identity&&c1===__identity&&c2===__identity&&c3===__identity&&c4===__identity)return __into5;const fallback=(...args)=>{const context=new WeakMap();const values=input.map((convert,i)=>convert(args[i],context));return __into5(...values,args[5]);};return function(a0,a1,a2,a3,a4,destination){if(arguments.length!==6)return fallback(...arguments);const context=(needsContext||(Number(c0!==__identity&&a0!==null&&typeof a0==='object')+Number(c1!==__identity&&a1!==null&&typeof a1==='object')+Number(c2!==__identity&&a2!==null&&typeof a2==='object')+Number(c3!==__identity&&a3!==null&&typeof a3==='object')+Number(c4!==__identity&&a4!==null&&typeof a4==='object'))>1)?new WeakMap():null;const v0=c0(a0,context);const v1=c1(a1,context);const v2=c2(a2,context);const v3=c3(a3,context);const v4=c4(a4,context);return __into5(v0,v1,v2,v3,v4,destination);};})()],
["norm_batch",(()=>{const c0=__representation(__inputTypes[7].types[0],false,__inputTypes[7].capture[0]);const c1=__representation(__inputTypes[7].types[1],false,__inputTypes[7].capture[1]);const input=[c0,c1],needsInput=input.some(c=>c!==__identity);const needsContext=(c0!==__identity||c1!==__identity);if(c0===__identity&&c1===__identity)return __into7;const fallback=(...args)=>{const context=new WeakMap();const values=input.map((convert,i)=>convert(args[i],context));return __into7(...values,args[2]);};return function(a0,a1,destination){if(arguments.length!==3)return fallback(...arguments);const context=(needsContext||(Number(c0!==__identity&&a0!==null&&typeof a0==='object')+Number(c1!==__identity&&a1!==null&&typeof a1==='object'))>1)?new WeakMap():null;const v0=c0(a0,context);const v1=c1(a1,context);return __into7(v0,v1,destination);};})()],
["normalize_batch",(()=>{const c0=__representation(__inputTypes[8].types[0],false,__inputTypes[8].capture[0]);const c1=__representation(__inputTypes[8].types[1],false,__inputTypes[8].capture[1]);const c2=__representation(__inputTypes[8].types[2],false,__inputTypes[8].capture[2]);const input=[c0,c1,c2],needsInput=input.some(c=>c!==__identity);const needsContext=(c0!==__identity||c1!==__identity||c2!==__identity);if(c0===__identity&&c1===__identity&&c2===__identity)return __into8;const fallback=(...args)=>{const context=new WeakMap();const values=input.map((convert,i)=>convert(args[i],context));return __into8(...values,args[3]);};return function(a0,a1,a2,destination){if(arguments.length!==4)return fallback(...arguments);const context=(needsContext||(Number(c0!==__identity&&a0!==null&&typeof a0==='object')+Number(c1!==__identity&&a1!==null&&typeof a1==='object')+Number(c2!==__identity&&a2!==null&&typeof a2==='object'))>1)?new WeakMap():null;const v0=c0(a0,context);const v1=c1(a1,context);const v2=c2(a2,context);return __into8(v0,v1,v2,destination);};})()]]));
export function callInto(name,args,destination){return functionsInto[name](...args,destination);}

function __preparedPart(mask,path){
 for(const field of path){
  if(mask===true)return true;
  if(!mask || typeof mask!=="object")return false;
  mask=Object.hasOwn(mask.fields,field)?mask.fields[field]:false;
 }
 return mask;
}
function __preparedStable(mask,path){const part=__preparedPart(mask,path);return part===true || (!!part && part.all===true);}
function __prepareFn2(fixed,depth=0){if(depth>=16||!((__preparedStable(fixed[0],[])&&__preparedStable(fixed[1],[])&&__preparedStable(fixed[2],[]))))return __fn2;const v1243=__preparedStable(fixed[0],[])&&__preparedStable(fixed[1],[])&&__preparedStable(fixed[2],[]);
let v1242=false,v1241;
return function(v1237,v1238,v1239){let v1240;if(v1243&&v1242){v1240=v1241;}else{
const v1244=v1238.length;
const v1245=new Array(v1244);
for(let v1246=0;v1246<v1244;v1246++){
const v1247=(v1238[v1246]>>>0);
const v1248=256;
const v1249=(Math.imul(v1247,v1248) >>> 0);
const v1250=(((v1249) + (v1239)) >>> 0);
let v1251;if(v1250<v1237.length){v1251=v1237[v1250];}else{
v1251=0.0;}
v1245[v1246]=__nfValue(v1251);
}
let v1252=0.0;
for(let v1253=0;v1253<v1245.length;v1253++){
const v1254=v1245[v1253];
const v1255=v1252;
const v1256=__nfValue(v1254);
v1252=Math.fround(__nfNumber(v1255) + __nfNumber(v1256));
}
v1240=v1252;if(v1243){v1241=v1240;v1242=true;}}
return Math.fround((__nfNumber(__nfValue(v1240)))/(__nfNumber(Math.fround((v1238).length))));};}
function __prepareFn3(fixed,depth=0){if(depth>=16||!((true)))return __fn3;let v1261=false,v1260;
const v1273=__preparedStable(fixed[0],[])&&__preparedStable(fixed[1],[]);
let v1272=false,v1271;
let v1294=false,v1293;
return function(v1257,v1258){let v1259;if(true&&v1261){v1259=v1260;}else{
v1259=__fn0();if(true){v1260=v1259;v1261=true;}}
const v1262=(v1258).length;
const v1263=0;
const v1264=(v1262===v1263);
let v1265;if(v1264){
const v1266=v1259;
const v1267=[];for(let v1268=0;v1268<v1266.length;v1268++){
const v1269=(v1266[v1268]>>>0);
v1267.push(0.0);}
v1265=v1267;}else{
let v1270;if(v1273&&v1272){v1270=v1271;}else{
const v1274=v1259;
const v1275=[];for(let v1276=0;v1276<v1274.length;v1276++){
const v1277=(v1274[v1276]>>>0);
const v1278=v1258.length;
const v1279=new Array(v1278);
for(let v1280=0;v1280<v1278;v1280++){
const v1281=(v1258[v1280]>>>0);
const v1282=256;
const v1283=(Math.imul(v1281,v1282) >>> 0);
const v1284=(((v1283) + (v1277)) >>> 0);
let v1285;if(v1284<v1257.length){v1285=v1257[v1284];}else{
v1285=0.0;}
v1279[v1280]=__nfValue(v1285);
}
let v1286=0.0;
for(let v1287=0;v1287<v1279.length;v1287++){
const v1288=v1279[v1287];
const v1289=v1286;
const v1290=__nfValue(v1288);
v1286=Math.fround(__nfNumber(v1289) + __nfNumber(v1290));
}
const v1291=v1286;
v1275.push(Math.fround((__nfNumber(v1291))/(__nfNumber(Math.fround((v1258).length)))));}
v1270=v1275;if(v1273){v1271=v1270;v1272=true;}}
let v1292;if(v1273&&v1294){v1292=v1293;}else{
const v1295=v1270;
const v1296=v1295.length;
const v1297=new Array(v1296);
for(let v1298=0;v1298<v1296;v1298++){
const v1299=v1295[v1298];
const v1300=__nfValue(v1299);
const v1301=__nfValue(v1299);
v1297[v1298]=Math.fround(__nfNumber(v1300) * __nfNumber(v1301));
}
let v1302=0.0;
for(let v1303=v1297.length-1;v1303>=0;v1303--){
const v1304=v1297[v1303];
const v1305=__nfValue(v1304);
const v1306=v1302;
v1302=Math.fround(__nfNumber(v1305) + __nfNumber(v1306));
}
const v1307=Math.fround(Math.sqrt(__nfNumber(v1302)));
const v1308=1.000000023742228e-32;
v1292=Math.fround(v1307 + v1308);if(v1273){v1293=v1292;v1294=true;}}
const v1309=v1270;
const v1310=[];for(let v1311=0;v1311<v1309.length;v1311++){
const v1312=v1309[v1311];
v1310.push(Math.fround((__nfNumber(__nfValue(v1312)))/(__nfNumber(__nfValue(v1292)))));}
v1265=v1310;}
return v1265;};}
function __prepareFn4(fixed,depth=0){if(depth>=16||!((__preparedStable(fixed[0],[])&&__preparedStable(fixed[1],[])&&__preparedStable(fixed[2],[])&&__preparedStable(fixed[3],[])&&__preparedStable(fixed[4],[]))))return __fn4;const v1333=__preparedStable(fixed[0],[])&&__preparedStable(fixed[1],[])&&__preparedStable(fixed[2],[])&&__preparedStable(fixed[3],[])&&__preparedStable(fixed[4],[]);
let v1332=false,v1331;
return function(v1313,v1314,v1315,v1316,v1317){const v1319=256;
let v1320;if(v1319===0 ){
v1320=0;}else{
v1320=(Math.trunc(v1317/v1319)+0);}
const v1318=v1320;
const v1322=256;
let v1323;if(v1322===0 ){
v1323=0;}else{
v1323=((v1317%v1322)+0);}
const v1321=v1323;
const v1325=v1318;
let v1326;if(v1325<v1316.length){v1326=v1316[v1325];}else{
v1326=0;}
const v1324=v1326;
const v1328=v1318;
let v1329;if(v1328<v1315.length){v1329=v1315[v1328];}else{
v1329=0;}
const v1327=v1329;
let v1330;if(v1333&&v1332){v1330=v1331;}else{
const v1334=4096;
const v1335=0;
const v1336=0.0;
let v1337=v1335;
let v1338=v1336;
for(let v1340=0;v1340<v1334;v1340++){
const v1341=v1337;
const v1342=v1324;
if(((v1341) >= (v1342)))break;
const v1343=(v1340>>>0);
const v1344=v1337;
const v1345=1;
const v1346=(((v1344) + (v1345)) >>> 0);
const v1347=__nfValue(v1338);
const v1348=v1327;
const v1349=(((v1348) + (v1343)) >>> 0);
let v1350;if(v1349<v1314.length){v1350=v1314[v1349];}else{
v1350=0;}
const v1351=v1350;
const v1352=256;
const v1353=(Math.imul(v1351,v1352) >>> 0);
const v1354=v1321;
const v1355=(((v1353) + (v1354)) >>> 0);
let v1356;if(v1355<v1313.length){v1356=v1313[v1355];}else{
v1356=0.0;}
const v1357=__nfValue(v1356);
const v1358=Math.fround(__nfNumber(v1347) + __nfNumber(v1357));
v1337=v1346;
v1338=v1358;
}
v1330=({["index"]:v1337,["total"]:v1338});if(v1333){v1331=v1330;v1332=true;}}
const v1359=v1324;
const v1360=0;
const v1361=(v1359===v1360);
let v1362;if(v1361){
v1362=0.0;}else{
const v1363=v1330;
v1362=Math.fround((__nfNumber(__nfValue(v1363["total"])))/(__nfNumber(Math.fround(v1324))));}
return v1362;};}
const __preparedFactories=new Map([[2,__prepareFn2],[3,__prepareFn3],[4,__prepareFn4]]);
