import json, os, time
from pathlib import Path
import river_client as river
from transformers import AutoTokenizer
BASE='Qwen/Qwen3.6-35B-A3B-FP8'
client=river.Client(api_key=os.environ['RIVER_API_KEY'],timeout=180)
data=json.loads(Path('training/dispatch-dataset.json').read_text())
report={'base_model':BASE,'started_at':time.time(),'train_count':len(data['train']),'heldout_count':len(data['test']),'steps':[],'status':'initializing'}
def save():
 Path('training/result.json').write_text(json.dumps(report,indent=2))
def event(message):
 print(message,flush=True);save()
event('Loading tokenizer')
tok=AutoTokenizer.from_pretrained(BASE);EOS=tok.eos_token_id
batch=[]
for row in data['train']:
 p=tok(row['prompt'],add_special_tokens=False)['input_ids'];c=tok(' '+row['completion'],add_special_tokens=False)['input_ids']+[EOS];ids=p+c
 batch.append({'input_ids':ids,'target_tokens':ids[1:]+[EOS],'weights':[0.]*(len(p)-1)+[1.]*(len(c)+1)})
try:
 with client.session(project='impactor-dispatch') as session:
  event('Creating rank-8 LoRA model')
  model=session.create_model(base_model=BASE,lora=river.LoraConfig(rank=8));report['model_id']=model.model_id;event('Model ready')
  def evaluate():
   out=model.sample([x['prompt'] for x in data['test']],max_tokens=12,temperature=0.,stop=['\n'])
   rows=[{'expected':x['completion'],'generated':y[0].text.strip()} for x,y in zip(data['test'],out)]
   return {'correct':sum(r['generated']==r['expected'] for r in rows),'total':len(rows),'rows':rows}
  report['before']=evaluate();event({'baseline':report['before']['correct']})
  report['status']='training'
  for step in range(12):
   fb=model.forward_backward(batch,loss_fn='cross_entropy');model.optim_step(lr=2e-4,grad_clip_norm=1.)
   report['steps'].append({'step':model.step,'loss':fb.metrics['loss'],'at':time.time()});event(report['steps'][-1])
  ckpt=model.save_weights('impactor-dispatch-v1',mode='inference');report['checkpoint']=ckpt.path;event('Checkpoint saved')
  report['after']=evaluate();report['status']='complete';report['finished_at']=time.time();event({'after':report['after']['correct'],'total':report['after']['total']})
except Exception as e:
 report['status']='failed';report['error']=str(e);event({'error':str(e)});raise
