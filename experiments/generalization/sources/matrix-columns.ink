module matrix_columns;
pub fn run(table:List<f32>,rows:List<u32>,columns:List<u32>,width:u32)->List<f32>{
 return columns.map(fn(column)=>foldl(rows,0.0,fn(row,acc)=>acc+table.at_or(row*width+column,0.0)));
}
