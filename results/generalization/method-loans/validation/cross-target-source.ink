module variant_ownership;
record Item{value:u32,}
record Image{values:List<Item>,tag:u32,}
fn propagated(xs:List<Item>,ok:Bool)->Result<List<Item>,u32>{
 let result:Result<u32,u32>=choose(ok,Ok(9),Err(7));let value=result?;
 return Ok(buffer(xs).push(Item{value:value}).freeze());
}
fn branches(xs:List<Item>,ok:Bool)->List<Item>{
 let result:Result<u32,u32>=choose(ok,Ok(9),Err(7));
 return result.fold(fn(value)=>buffer(xs).push(Item{value:value}).freeze(),fn(error)=>buffer(xs).push(Item{value:error}).freeze());
}
fn shared(xs:List<Item>,ok:Bool)->List<List<Item>>{
 let result:Result<u32,u32>=choose(ok,Ok(9),Err(7));
 let first=result.fold(fn(value)=>xs,fn(error)=>xs);return [first,xs];
}
fn fields(x:Image,ok:Bool)->List<Item>{
 let result:Option<u32>=choose(ok,Some(9),None);
 let values=result.fold(fn(value)=>x.values,fn(unit)=>x.values);
 return buffer(values).push(Item{value:x.tag}).freeze();
}
fn repeated(xs:List<Item>,ok:Bool)->List<List<Item>>{
 let result:Result<u32,u32>=choose(ok,Ok(9),Err(7));
 return result.fold(fn(value)=>[1,2,3].map(fn(i)=>xs),fn(error)=>[xs]);
}
fn given(xs:List<Item>)->List<Item>{return xs;}
fn final_call(xs:List<Item>,ok:Bool)->List<Item>{return given(xs);}
fn computed_call(xs:List<Item>,ok:Bool)->List<Item>{return given(choose(ok,xs,xs));}
fn shared_call(xs:List<Item>,ok:Bool)->List<List<Item>>{return [given(xs),xs];}
fn after_map(xs:List<Item>,ok:Bool)->List<List<Item>>{
 let indices:List<u32>=[0,1];let counts=indices.map(fn(i)=>length(xs)+i);
 return [xs,counts.map(fn(n)=>Item{value:n})];
}
fn method_branch(xs:List<Item>,ok:Bool)->List<Item>{
 let indices:List<u32>=[0,1];return choose(ok,xs,indices.map(fn(i)=>Item{value:length(xs)+i}));
}
fn receiver_capture(xs:List<Item>,ok:Bool)->List<Item>{
 return xs.map(fn(item)=>Item{value:item.value+length(xs)});
}
fn after_filter(xs:List<Item>,ok:Bool)->List<Item>{
 let indices:List<u32>=[0,1];let seen=indices.filter(fn(i)=>i<length(xs));
 return buffer(xs).push(Item{value:length(seen)}).freeze();
}
fn after_indexed(xs:List<Item>,ok:Bool)->List<Item>{
 let indices:List<u32>=[0,1];let seen=indices.map_indexed(fn(i)=>fn(x)=>x+i+length(xs));
 return buffer(xs).push(Item{value:sum(seen)}).freeze();
}
fn after_zip(xs:List<Item>,ok:Bool)->List<Item>{
 let a:List<u32>=[0,1];let b:List<u32>=[2,3];let seen=a.zip(b,fn(a)=>fn(b)=>a+b+length(xs));
 return buffer(xs).push(Item{value:sum(seen)}).freeze();
}
fn after_variant(xs:List<Item>,ok:Bool)->List<Item>{
 let seen:Result<u32,u32>=Err(1);let mapped=seen.map_err(fn(error)=>error+length(xs));
 return buffer(xs).push(Item{value:mapped.fold(fn(value)=>value,fn(error)=>error)}).freeze();
}
record Particle{position:u32,velocity:u32,active:Bool,}
fn particles(xs:List<Particle>)->List<Particle>{return xs.map(fn(p)=>Particle{position:p.position+p.velocity,velocity:p.velocity,active:p.active});}
