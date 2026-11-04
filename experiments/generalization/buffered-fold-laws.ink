module buffered_fold_laws;
// Exact logical observation; no associativity or numeric-range assumption.
law buffer_fold_map<A,S>(xs:List<A>,states:List<S>,step:fn(A,S)->S){
 foldl(xs,buffer(states),fn(item,current)=>current.map(fn(state)=>step(item,state))).freeze()
 ==foldl(xs,states,fn(item,current)=>current.map(fn(state)=>step(item,state)));
 proof by induction xs generalizing(states){
  nil=>normalize;
  cons(head,tail)=>calc{
   _==foldl(tail,buffer(states.map(fn(state)=>step(head,state))),fn(item,current)=>current.map(fn(state)=>step(item,state))).freeze() by normalize;
   ==foldl(tail,states.map(fn(state)=>step(head,state)),fn(item,current)=>current.map(fn(state)=>step(item,state))) by ih(states=states.map(fn(state)=>step(head,state)));
   ==_ by normalize;
  };
 };
}
