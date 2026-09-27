import os
import json,re,time
from pathlib import Path
import river_client as river
r=json.loads(Path('training/result.json').read_text())
if r['status']!='complete':raise RuntimeError('Training has not finished')
d=json.loads(Path('training/dispatch-dataset.json').read_text())
client=river.Client(api_key=os.environ['RIVER_API_KEY'],timeout=180)
report={'method':'Greedy completion, 32 generated tokens, no newline stop. Exact match after whitespace stripping. Same held-out prompts for base and saved checkpoint.','base_model':r['base_model'],'checkpoint':r['checkpoint']}
with client.session(project='impactor-dispatch-evaluation') as s:
 for name,checkpoint in [('base',None),('trained',r['checkpoint'])]:
  out=s.sample([x['prompt'] for x in d['test']],base_model=r['base_model'],checkpoint=checkpoint,max_tokens=32,temperature=0.)
  rows=[{'expected':x['completion'],'generated':y[0].text.strip()}for x,y in zip(d['test'],out)]
  report[name]={'correct':sum(x['generated']==x['expected'] for x in rows),'total':len(rows),'rows':rows}
  Path('training/checkpoint-evaluation.json').write_text(json.dumps(report,indent=2));print(name,report[name]['correct'],flush=True)
