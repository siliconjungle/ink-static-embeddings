module ink.experiments.upstream_execution_patterns;

// Move an already evaluated, iteration-independent flag outside the fold.
// Both paths retain the exact step order, including non-associative F32 work.
law fold_unswitch<A,S>(xs:List<A>,initial:S,flag:Bool,yes:fn(A,S)->S,no:fn(A,S)->S){
 foldl(xs,initial,fn(item,state)=>choose(flag,yes(item,state),no(item,state)))
 ==choose(flag,foldl(xs,initial,yes),foldl(xs,initial,no));
 proof by cases flag {true=>normalize;false=>normalize;};
}

law fold_concat<A,S>(left:List<A>,right:List<A>,initial:S,step:fn(A,S)->S){
 foldl(left.concat(right),initial,step)==foldl(right,foldl(left,initial,step),step);
 proof by induction left generalizing(initial){
  nil=>normalize;
  cons(head,tail)=>ih(initial=step(head,initial));
 };
}

// Ordered block execution is fold composition, not associativity of arithmetic.
// A concrete blocking/layout proposal must separately prove its codec and tails.
law ordered_chunks<A,S>(chunks:List<List<A>>,empty:List<A>,initial:S,step:fn(A,S)->S){
 requires empty==[];
 foldl(foldr(chunks,empty,fn(block,rest)=>block.concat(rest)),initial,step)
 ==foldl(chunks,initial,fn(block,state)=>foldl(block,state,step));
 proof by induction chunks generalizing(initial){
  nil=>normalize;
  cons(head,tail)=>calc{
   _==foldl(foldr(tail,empty,fn(block,rest)=>block.concat(rest)),foldl(head,initial,step),step)
    by use fold_concat<A,S>(head,foldr(tail,empty,fn(block,rest)=>block.concat(rest)),initial,step);
   ==_ by ih(initial=foldl(head,initial,step));
  };
 };
}
