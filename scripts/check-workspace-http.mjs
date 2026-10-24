import fs from 'node:fs/promises';import path from 'node:path';import assert from 'node:assert/strict';
const root=process.env.RECIRCUIT_DEMO_ROOT,token=process.env.ADMIN_TOKEN,base=Number(process.env.RECIRCUIT_WORKSPACE_BASE_PORT||3360),out=process.env.WORKSPACE_HTTP_REPORT;
if(!root||!token||!out)throw Error('Explicit isolated workspace configuration required');
const manifest=JSON.parse(await fs.readFile(path.join(root,'demo-manifest.json'),'utf8')),results=[];
for(const [i,tenant]of manifest.tenants.entries()){
 const origin='http://127.0.0.1:'+(base+i),headers={'x-admin-token':token};
 const response=await fetch(origin+'/api/routing?date='+manifest.serviceDate,{headers});assert.equal(response.status,200);const preview=await response.json();assert.equal(preview.tenant,tenant);assert.equal(preview.conversions.length,10);assert.equal(preview.conversions.filter(c=>c.eligible).length,9);
 const bookings=JSON.parse(await fs.readFile(path.join(root,'portal',tenant+'.json'),'utf8')).bookings,scheduled=new Set(bookings.filter(b=>b.status==='SCHEDULED').map(b=>b.id));assert.ok(preview.conversions.every(c=>scheduled.has(c.eligible?c.pickup.id:c.id)));
 const before=await fs.readFile(path.join(root,'planning',tenant,'proposals/00000002.json'),'utf8'),proposal=JSON.parse(before);
 const same=await fetch(origin+'/api/routing',{method:'POST',headers:{...headers,origin,'content-type':'application/json'},body:JSON.stringify({action:'generate',payload:{serviceDate:manifest.serviceDate,requestKey:proposal.requestKey}})});assert.equal(same.status,200);const saved=await same.json();assert.equal(saved.id,proposal.id);assert.equal(saved.independentValidation.valid,true);assert.equal(saved.optimization.solution.served,6);assert.equal(saved.optimization.solution.routes.length,2);assert.equal(await fs.readFile(path.join(root,'planning',tenant,'proposals/00000002.json'),'utf8'),before);
 const catalog=await (await fetch(origin+'/api/routing?view=proposals',{headers})).json();assert.equal(catalog.proposals[0].current,false);assert.equal(catalog.proposals[1].current,true);
 const unauthorized=await fetch(origin+'/api/routing?date='+manifest.serviceDate);assert.equal(unauthorized.status,401);
 const wrongOrigin=await fetch(origin+'/api/routing',{method:'POST',headers:{...headers,origin:'https://example.invalid','content-type':'application/json'},body:JSON.stringify({action:'generate',payload:{serviceDate:manifest.serviceDate,requestKey:proposal.requestKey}})});assert.equal(wrongOrigin.status,403);
 results.push({tenant,preparation:10,readyForCalculation:9,served:6,vehicles:2,unassigned:saved.optimization.solution.unassigned.map(p=>p.reason),proposalFreshness:catalog.proposals.map(p=>p.current),idempotentPost:true,unauthorized:401,foreignOrigin:403});
}
const foreign=JSON.parse(await fs.readFile(path.join(root,'planning/paperplus/proposals/00000002.json'),'utf8'));const cross=await fetch('http://127.0.0.1:'+base+'/api/routing?id='+foreign.id,{headers:{'x-admin-token':token}});assert.equal(cross.status,404);
await fs.writeFile(out,JSON.stringify({recordedAt:new Date().toISOString(),results,crossTenant:404,noNewProposalHistory:true,simulatedTravel:true},null,2));console.log(JSON.stringify(results));
