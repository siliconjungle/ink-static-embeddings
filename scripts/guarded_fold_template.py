"""Proof-preserving shape guards; measured thresholds are proposal data only."""
import copy


def templates(map_fusion,profile):
    from ink_knowledge import entry,identity
    from producers.captured_fold_batching import templates as captured
    from producers.semantic_laws import value,op,word
    row=captured(map_fusion)[0];original=row['object'];payload=copy.deepcopy(original['payload']);law=payload['law']
    params=law['params'];xs={'sort':params['xs'],'node':{'Free':'xs'}};envs={'sort':params['envs'],'node':{'Free':'envs'}}
    boolean=value('Bool');count=value('U32')
    clauses=[]
    for sequence,minimum,maximum in [(xs,profile['minimum_items'],profile['maximum_items']),(envs,profile['minimum_lanes'],profile['maximum_lanes'])]:
        length=op(count,'call:length',sequence)
        clauses += [op(boolean,'binary:>=',length,word('U32',minimum)),op(boolean,'binary:<=',length,word('U32',maximum))]
    predicate=clauses[0]
    for clause in clauses[1:]:predicate=op(boolean,'binary:&&',predicate,clause)
    batched=copy.deepcopy(law['to'])
    law['to']=op(law['from']['sort'],'call:choose',predicate,batched,law['from'])
    use={'Use':dict(law='$batched',arguments={n:{'sort':s,'node':{'Free':n}}for n,s in params.items()},premises=[])}
    law['proof']={'Cases':dict(condition=predicate,on_true={'Trans':dict(middle=batched,left=use,right='Normalize')},on_false='Normalize')}
    law['semantics']='ink-conditional-laws-v1'
    payload['definitions']=dict(functions=[],ids=[],records={},enums={})
    payload['imports']={'$batched':dict(algorithm=identity(original),types={n:{'Named':'$'+n}for n in ['A','E','S']},exports={'Lane':'Lane'})}
    return [dict(name='guarded-captured-independent-folds',object=entry('definition','ink-source-algorithm-v1',payload,[*law['dependencies'],identity(original)]))]
