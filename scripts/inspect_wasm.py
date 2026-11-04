"""Record actual Wasm SIMD opcodes using Rust's llvm-tools component."""
import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path
import re
import subprocess


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('models',nargs='+',type=Path)
    p.add_argument('--objdump',type=Path)
    p.add_argument('--output',type=Path,default=Path('results/wasm/instructions.json'))
    args=p.parse_args()
    tool=args.objdump
    if tool is None:
        sysroot=Path(subprocess.check_output(['rustc','--print','sysroot'],text=True).strip())
        host=re.search(r'^host: (.+)$',subprocess.check_output(['rustc','-vV'],text=True),re.M).group(1)
        tool=sysroot/'lib/rustlib'/host/'bin/llvm-objdump'
    if not tool.exists():raise ValueError('Install rustup component add llvm-tools, or pass --objdump')
    rows=[]
    for directory in args.models:
        binary=directory/'wasm/model.wasm'
        asm=subprocess.check_output([str(tool),'-d',str(binary)],text=True)
        counts=Counter(re.findall(r'\b(f32x4\.[a-z0-9_]+)\b',asm))
        rows.append({'model_id':json.loads((directory/'model.json').read_text())['model_id'],
                     'wasm_sha256':hashlib.sha256(binary.read_bytes()).hexdigest(),
                     'f32x4_instruction_counts':dict(sorted(counts.items())),
                     'f32x4_add_instructions':counts['f32x4.add'],
                     'f32x4_div_instructions':counts['f32x4.div']})
    report={'scope':'Static instruction counts in the complete two-variant module, not dynamic execution counts or speedup attribution.',
            'interpretation':'SIMD division is emitted. No SIMD pooling addition is present in these builds; do not describe pooling as SIMD-vectorized.',
            'llvm_objdump_version':subprocess.check_output([str(tool),'--version'],text=True).splitlines()[0],'models':rows}
    args.output.parent.mkdir(parents=True,exist_ok=True);args.output.write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps(report,indent=2))


if __name__=='__main__':main()
