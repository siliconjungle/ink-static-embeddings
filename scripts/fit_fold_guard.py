"""Fit a bounded proposal guard using ONLY the frozen development program."""
import hashlib
import json
from pathlib import Path


def main():
    source=Path('results/generalization/folds/rust-report.json');report=json.loads(source.read_text())
    cases=[c for c in report['summary']if c['name']=='matrix-columns']
    baseline=sum(c['median_ns']['literal']for c in cases)
    proposals=[]
    for items in [1,8,64,512,513]:
        for lanes in [1,4,16,64,65]:
            enabled=lambda c:items<=c['length']<=512 and lanes<=c['lanes']<=64
            predicted=sum(c['median_ns']['batched_0'if enabled(c)else'literal']for c in cases)
            proposals.append(dict(minimum_items=items,minimum_lanes=lanes,maximum_items=512,maximum_lanes=64,predicted_ns=predicted,enabled_cases=sum(enabled(c)for c in cases)))
    best=min(proposals,key=lambda x:x['predicted_ns'])
    profile={'schema':1,'target':'rust','status':'untrusted source-algorithm proposal, not an installed profitability model',
             'training_program':'matrix-columns','held_out_programs':['filter-bank','channel-energy'],
             'training_report_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),
             **best,'baseline_ns':baseline,'predicted_gain':baseline/best['predicted_ns'],
             'scope':'Thresholds only propose an exact conditional alternative. Both branches require ordinary kernel proof replay; new source/ABI lifecycle measurements and independent held-out checks must establish profitability. Unknown feature extents fall back to the original source.'}
    out=Path('results/generalization/guarded-folds');out.mkdir(parents=True,exist_ok=True)
    (out/'profile.json').write_text(json.dumps(profile,indent=2)+'\n');(out/'proposals.json').write_text(json.dumps(proposals,indent=2)+'\n')
    print(json.dumps(profile,indent=2))


if __name__=='__main__':main()
