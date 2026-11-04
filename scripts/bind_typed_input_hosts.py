"""Bind each codec ablation to its actual existing whole-host profile scope."""
import hashlib
import json
from pathlib import Path


def main():
    root=Path('build/generalization/typed-input');report=[]
    names=['ink-gpu.mjs','complete-session.mjs','pipeline-contract.mjs','backend-selection.mjs','prepared-wasm.mjs','ink-abi.mjs','ink-selection.mjs','ink-selection.wasm.sha256','pipeline-workers.mjs','pipeline-worker.mjs','ink-device.mjs']
    for folder in sorted(p.parent for p in root.glob('*/manifest.json')):
        manifest=json.loads((folder/'manifest.json').read_text());identities={}
        for label in ['before','control','after']:
            hosts=[]
            for name in names:
                if name=='ink-abi.mjs':text=Path('artifacts/generalization/typed-input',label+'.mjs').read_text()
                elif name=='ink-gpu.mjs'and label=='before':text=Path('artifacts/generalization/typed-input/before-host.mjs').read_text()
                elif name=='ink-selection.wasm.sha256':text=hashlib.sha256((folder/'ink-selection.wasm').read_bytes()).hexdigest()
                else:text=(folder/name).read_text()
                hosts.append([name,text])
            identity=hashlib.sha256(json.dumps(hosts,ensure_ascii=False,separators=(',',':')).encode()).hexdigest()
            if label=='after':assert identity==manifest['runtime_host_sha256'],folder
            identities[label]=identity
            bound=manifest|{'runtime_host_sha256':identity}
            (folder/('manifest.'+label+'.json')).write_text(json.dumps(bound,indent=2)+'\n')
        report.append({'name':folder.name,'runtime_host_sha256':identities,'scope':'Existing ink-complete-call-v2 aggregate binds every host asset, including the exact packed codec. No price is transferable between the two scopes.'})
    (root/'execution-identities.json').write_text(json.dumps(report,indent=2)+'\n');print('bound',len(report),'pairs of exact host identities')


if __name__=='__main__':main()
