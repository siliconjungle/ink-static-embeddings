"""Prototype knowledge data: compose two ordinary checked generic equalities."""
import copy


def templates(map_fusion,buffer_fold_map,buffer_law):
    from ink_knowledge import entry
    from ink_planner.semantic_search import map_children,substitute
    from producers.captured_fold_batching import templates as captured
    from producers.semantic_laws import value,op,lam
    row=captured(map_fusion)[0];payload=copy.deepcopy(row['object']['payload']);law=payload['law']
    previous=copy.deepcopy(law['to']);fold,project=previous['node']['Op'][1]
    xs,seed,batch=fold['node']['Op'][1];LP=fold['sort'];BP=value({'Buffer':{'Named':'Lane'}})
    def owned(v):
        if v==LP:return copy.deepcopy(BP)
        if isinstance(v,dict):return {k:owned(x)for k,x in v.items()}
        if isinstance(v,list):return [owned(x)for x in v]
        return v
    callback=batch['node']['Lambda']['node']['Lambda']['node']['Op'][1][1]
    def remove_current(t,depth=0):
        node=t['node']
        if isinstance(node,dict)and 'Bound'in node:
            index=node['Bound']
            if index==depth:raise ValueError('Lane update captures complete current list')
            return dict(sort=t['sort'],node={'Bound':index-1 if index>depth else index})
        return map_children(t,lambda child:remove_current(child,depth+int(isinstance(node,dict)and 'Lambda'in node)))
    step=lam(batch['sort']['Arrow'][0],remove_current(callback))
    buffer=op(BP,'call:buffer',seed)
    replacement=op(LP,'method:freeze',op(BP,'call:foldl',xs,buffer,owned(batch)))
    law['to']=op(previous['sort'],'method:map',replacement,project)
    use={'Use':dict(law=buffer_fold_map,types={'A':{'Named':'$A'},'S':{'Named':'Lane'}},arguments=dict(xs=xs,states=seed,step=step),premises=[])}
    def types(v):
        if v=={'Named':'A'}:return {'Named':'$A'}
        if v=={'Named':'S'}:return {'Named':'Lane'}
        if isinstance(v,dict):return {k:types(x)for k,x in v.items()}
        if isinstance(v,list):return [types(x)for x in v]
        return v
    arguments=dict(xs=xs,states=seed,step=step)
    before=op(previous['sort'],'method:map',substitute(types(buffer_law['to']),arguments),project)
    after=op(previous['sort'],'method:map',substitute(types(buffer_law['from']),arguments),project)
    bridge={'Trans':dict(middle=before,left='Normalize',right={'Trans':dict(middle=after,left={'Congruence':[{'Sym':use},'Normalize']},right='Normalize')})}
    law['proof']={'Trans':dict(middle=previous,left=law['proof'],right=bridge)}
    law['dependencies']=sorted(set(law['dependencies'])|{buffer_fold_map})
    return [dict(name='buffered-captured-independent-folds',object=entry('definition','ink-source-algorithm-v1',payload,law['dependencies']))]
