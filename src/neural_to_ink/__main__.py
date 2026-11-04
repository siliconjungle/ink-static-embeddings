import argparse
import json
from pathlib import Path
from .converter import convert


def main():
    p=argparse.ArgumentParser(description='Convert a normalized Model2Vec model into Ink plus complete F32 weights.')
    p.add_argument('model_directory',type=Path);p.add_argument('output',type=Path)
    p.add_argument('--model-id',required=True);p.add_argument('--revision',required=True)
    args=p.parse_args()
    print(json.dumps(convert(args.model_directory,args.output,args.model_id,args.revision),indent=2))


if __name__=='__main__':main()
