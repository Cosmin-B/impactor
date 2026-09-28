"""Authenticated demo relay. Model inference runs on River, never locally."""
import hmac,json,os,threading,time
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from pathlib import Path
import river_client as river
ROOT=Path(__file__).resolve().parents[1]
REPORT=json.loads((ROOT/'training/result.json').read_text())
TOKEN=os.environ['RIVER_RELAY_TOKEN']
CLIENT=river.Client(api_key=os.environ['RIVER_API_KEY'],timeout=45)
LOCK=threading.Lock()
PREFIX='Choose the next robot dispatch action: normal, charge, or detour. Deliver safely, then minimize arrival time. Charge adds 11 minutes. Detour avoids the bridge.'
class Handler(BaseHTTPRequestHandler):
 def log_message(self,*args): pass
 def reply(self,status,data):
  body=json.dumps(data).encode();self.send_response(status);self.send_header('Content-Type','application/json');self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body)
 def do_POST(self):
  if self.path!='/decide':return self.reply(404,{'error':'Unknown route'})
  if not hmac.compare_digest(self.headers.get('Authorization',''),'Bearer '+TOKEN):return self.reply(401,{'error':'Unauthorized'})
  try:
   size=int(self.headers.get('Content-Length','0'))
   if size<=0 or size>8192:return self.reply(413,{'error':'Invalid payload size'})
   state=json.loads(self.rfile.read(size))['state']
   fields=['rain_pct','parcel_kg','battery_pct','bridge_capacity_kg','planned_route','normal_outcome','normal_reason']
   if set(state)!=set(fields):raise ValueError('Unexpected state fields')
   for field in fields[:4]:
    if not isinstance(state[field],(int,float)) or not 0<=state[field]<=100:raise ValueError('Invalid numeric state')
   if state['normal_outcome'] not in ['delivered','late','stranded','overload','blocked']:raise ValueError('Invalid preflight outcome')
   if not isinstance(state['planned_route'],list) or len(state['planned_route'])>20 or any(not isinstance(x,str) or len(x)>40 for x in state['planned_route']):raise ValueError('Invalid route')
   if not isinstance(state['normal_reason'],str) or len(state['normal_reason'])>600:raise ValueError('Invalid reason')
  except (ValueError,KeyError,TypeError):return self.reply(400,{'error':'Invalid dispatch state'})
  if not LOCK.acquire(timeout=25):return self.reply(429,{'error':'River controller is handling another shift. Retry shortly.'})
  try:
   start=time.monotonic()
   prompt=PREFIX+'\nState: '+json.dumps(state,separators=(',',':'))+'\nAction:'
   with CLIENT.session(project='impactor-live-dispatch',timeout=45) as session:
    out=session.sample([prompt],base_model=REPORT['base_model'],checkpoint=REPORT['checkpoint'],max_tokens=12,temperature=0,stop=['\n'],timeout=45)
   action=out[0][0].text.strip()
   if action not in ['normal','charge','detour']:return self.reply(502,{'error':'The River adapter returned an invalid action. No fallback was used.'})
   self.reply(200,{'action':action,'provider':'river','model':REPORT['base_model'],'checkpoint':'impactor-dispatch-v1','latencyMs':round((time.monotonic()-start)*1000),'confidence':None})
  except Exception as e:
   print('River inference failed:',type(e).__name__,flush=True)
   self.reply(502,{'error':'River inference failed. No fallback was used.'})
  finally:LOCK.release()
PORT=int(os.environ.get('RIVER_RELAY_PORT','8791'))
print(f'River relay listening on 127.0.0.1:{PORT}; remote inference only',flush=True)
ThreadingHTTPServer(('127.0.0.1',PORT),Handler).serve_forever()
