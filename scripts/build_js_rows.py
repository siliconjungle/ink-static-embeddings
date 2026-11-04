"""Compile a readable row-oriented Ink layout without embedding weight values."""
import argparse
import json
from pathlib import Path
import subprocess

from ink_static_embeddings.javascript import emit_rows, row_layout
from ink_static_embeddings.static_model import digest


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--build',type=Path,required=True)
    p.add_argument('--compiler',type=Path,default=Path('work/row-toolchain/ink'))
    args=p.parse_args();build=args.build.resolve();ink=args.compiler.resolve()
    m=json.loads((build/'model.json').read_text())
    if m['schema']!=2:raise ValueError('Row layout requires a schema-2 import')
    layout=row_layout(m);dest=build/'javascript/packed-rows';dest.mkdir(parents=True,exist_ok=True)
    (dest/'model.ink').write_text(emit_rows(m,layout))
    r=subprocess.run([str(ink),'build',str(dest/'model.ink'),'--target','javascript','-o',str(dest/'model.mjs')],capture_output=True,text=True)
    (dest/'build.log').write_text(r.stdout+r.stderr)
    if r.returncode:raise RuntimeError(r.stderr[-3000:])
    layout.update(source_sha256=digest(dest/'model.ink'),module_sha256=digest(dest/'model.mjs'),compiler_sha256=digest(ink))
    (dest/'layout.json').write_text(json.dumps(layout,indent=2)+'\n')
    print(json.dumps({'model_id':m['model_id'],'dimensions':m['dimensions'],'row_shards':len(layout['shards']),'source':str(dest/'model.ink')},indent=2))


if __name__=='__main__':main()
