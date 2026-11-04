"""Deterministic frozen-shape inputs and an independent ordered F32 oracle."""
import json
from pathlib import Path

import numpy as np


def cases():
    manifest=json.loads(Path('experiments/generalization/manifest.json').read_text())
    spec=manifest['frozen_cases'];rng=np.random.default_rng(spec['seed']);result=[]
    for name,workload in manifest['frozen_workloads'].items():
        widths=spec['matrix_widths'] if name=='matrix-columns' else [None]
        for width in widths:
            table=rng.normal(size=129*width).astype(np.float32) if width else None
            for length in spec['input_lengths']:
                for lanes in spec['independent_lanes']:
                    if name=='matrix-columns':
                        rows=rng.integers(0,129,size=length,dtype=np.uint32).tolist();columns=[i%width for i in range(lanes)]
                        args=[table.tolist(),rows,columns,width]
                        changed=[args,[args[0],rows[::-1],columns,width]]
                    elif name=='filter-bank':
                        samples=rng.normal(size=length).astype(np.float32).tolist();coefficients=rng.uniform(-.95,.95,size=lanes).astype(np.float32).tolist()
                        args=[samples,coefficients];changed=[args,[samples[::-1],coefficients]]
                    else:
                        pixels=[dict(zip(['red','green','blue'],row)) for row in rng.normal(size=(length,3)).astype(np.float32).tolist()]
                        channels=[i%4 for i in range(lanes)];args=[pixels,channels];changed=[args,[pixels[::-1],channels]]
                    result.append(dict(name=name,role=workload['role'],length=length,lanes=lanes,width=width,stable_parameters=workload['stable_parameters'],args=changed,expected_bits=[oracle(name,a) for a in changed],edge=False))
        extreme=float(np.finfo(np.float32).max);tiny=float(np.nextafter(np.float32(0),np.float32(1)))
        if name=='matrix-columns':
            inputs=[[[1e20,-1e20,3.0],[0,1,2],[0],1],[[extreme,-extreme,tiny,-0.0],[0,0,1],[0,0,9],1],[[],[999],[0,1],2]]
        elif name=='filter-bank':
            inputs=[[[1e20,-1e20,3.0],[1.0,-1.0,.5]],[[extreme,extreme],[1.0,-1.0]],[[tiny,-0.0,tiny],[1.0,-1.0]]]
        else:
            inputs=[[[{'red':extreme,'green':tiny,'blue':-0.0}],[0,1,2,3,0]], [[],[0,2]],[[{'red':1e20,'green':-1e20,'blue':3.0}]*3,[2,1,0]]]
        for index,a in enumerate(inputs):
            result.append(dict(name=name,role=workload['role'],length=len(a[0]),lanes=len(a[2] if name=='matrix-columns' else a[1]),width=None,stable_parameters=workload['stable_parameters'],args=[a,a],expected_bits=[oracle(name,a)]*2,edge=True,edge_index=index))
    return result


def oracle(name,args):
    values=[]
    with np.errstate(all='ignore'):
        if name=='matrix-columns':
            table,rows,columns,width=args
            for column in columns:
                acc=np.float32(0)
                for row in rows:
                    index=(row*width+column)&0xffffffff
                    acc=np.float32(acc+np.float32(table[index] if index<len(table) else 0))
                values.append(acc)
        elif name=='filter-bank':
            samples,coefficients=args
            for coefficient in coefficients:
                acc=np.float32(0)
                for sample in samples:acc=np.float32(np.float32(acc*np.float32(coefficient))+np.float32(sample))
                values.append(acc)
        else:
            pixels,channels=args
            for channel in channels:
                acc=np.float32(0)
                for pixel in pixels:
                    value=np.float32(pixel['red' if channel==0 else 'green' if channel==1 else 'blue'])
                    acc=np.float32(acc+np.float32(value*value))
                values.append(np.float32(acc/np.float32(len(pixels)+1)))
    array=np.asarray(values,dtype=np.float32);bits=array.view(np.uint32);bits[np.isnan(array)]=0x7fc00000
    return bits.tolist()


if __name__=='__main__':
    destination=Path('work/generalization/inputs.json');destination.parent.mkdir(parents=True,exist_ok=True)
    destination.write_text(json.dumps(cases(),separators=(',',':'))+'\n');print(destination)
