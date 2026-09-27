import assert from 'node:assert/strict';
const base='https://impactor.cosminbararu.com';let cookie='';
async function post(path,body={}){const r=await fetch(base+path,{method:'POST',headers:{'content-type':'application/json',...(cookie?{Cookie:cookie}:{})},body:JSON.stringify(body)});if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];const d=await r.json();assert(r.ok,JSON.stringify(d));return d;}
const start=await post('/api/session');const sessionId=start.session.id;const world={packageMass:2,bridgeCapacity:6,bridgeColor:'coral'};
assert.equal((await post('/api/run',{sessionId,world})).run.outcome,'delivered');world.packageMass=8;assert.equal((await post('/api/run',{sessionId,world})).run.outcome,'fell');
assert((await post('/api/teach',{sessionId})).recalled);const fixed=await post('/api/run',{sessionId,world});assert.equal(fixed.run.outcome,'delivered');assert(fixed.run.procedureUsed);assert.equal(fixed.run.route,'detour');console.log('Public bridge: failure, correction, Memorable procedure replay and delivery passed.');
