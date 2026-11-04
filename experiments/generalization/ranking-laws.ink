module certified_ranking;
// Scores and bounds use exact integer units. These laws certify separation;
// they do not grant an error bound to an approximate evaluator.
law interval_separation(a:Int,b:Int,lower:Int,upper:Int){
 requires inside:lower<=a;
 requires outside:b<=upper;
 requires separated:upper<lower;
 (b<a)==true;
 proof by provided;
}
law approximate_separation(a:Int,b:Int,estimate_a:Int,estimate_b:Int,error_a:Int,error_b:Int){
 requires inside:estimate_a-error_a<=a;
 requires outside:b<=estimate_b+error_b;
 requires separated:estimate_b+error_b<estimate_a-error_a;
 (b<a)==true;
 proof by provided;
}
