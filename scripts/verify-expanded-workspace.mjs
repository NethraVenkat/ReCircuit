import fs from 'node:fs/promises';import path from 'node:path';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {spawnSync} from 'node:child_process';
import {pickupFee} from '../apps/portals/src/lib/fees.ts';
const root=process.env.RECIRCUIT_DEMO_ROOT,out=process.env.WORKSPACE_CHECK_REPORT;
if(!root||!path.isAbsolute(root)||!out||!path.isAbsolute(out))throw Error('Absolute isolated workspace and report paths required');
const manifest=JSON.parse(await fs.readFile(path.join(root,'demo-manifest.json'),'utf8'));assert.equal(manifest.scenarioVersion,'rich-v2');
async function snapshot(dir){const result={};for(const item of await fs.readdir(dir,{withFileTypes:true})){const p=path.join(dir,item.name);if(item.isDirectory())Object.assign(result,await snapshot(p));else if(p.endsWith('.json'))result[path.relative(root,p)]=createHash('sha256').update(await fs.readFile(p)).digest('hex');}return result;}
const requests=await Promise.all((await fs.readdir(path.join(root,'household-app/requests'))).filter(n=>n.endsWith('.json')).map(n=>fs.readFile(path.join(root,'household-app/requests',n),'utf8').then(JSON.parse)));
assert.equal(requests.length,54);const counts={};
for(const tenant of manifest.tenants){const bookings=JSON.parse(await fs.readFile(path.join(root,'portal',tenant+'.json'),'utf8')).bookings,owned=requests.filter(r=>r.plan.legs[0].recyclerId===tenant);assert.equal(bookings.length,16);assert.equal(owned.length,18);
 assert.equal(new Set(bookings.map(b=>b.bookingReference)).size,16);
 for(const r of owned){const leg=r.plan.legs[0],b=bookings.find(b=>b.bookingReference===leg.bookingReference);assert.equal(r.household.provenance.isSimulated,true);assert.ok(!/synthetic|fictional|demo/i.test(r.household.customer.fullName));
  if(['AWAITING_APPROVAL','REJECTED'].includes(r.request.state)){assert.equal(b,undefined);assert.equal(leg.bookingReference,undefined);continue;}
  assert.ok(b);assert.equal(b.fullName,r.household.customer.fullName);assert.equal(r.household.bookingStatus,b.status);assert.equal(leg.estimatedFee,b.chargedFeeInr);assert.equal(r.plan.totalEstimatedFee,b.chargedFeeInr);assert.equal(b.chargedFeeInr,pickupFee(tenant,b.items.reduce((sum,item)=>sum+item.weightKg,0)));assert.equal(r.request.items[0].quantity,b.items[0].quantity);assert.equal(r.request.items[0].estimatedWeightKg,b.items[0].weightKg);assert.equal(b.provenance.isSimulated,true);assert.ok(b.events.every(e=>e.isSimulated));
 }
 counts[tenant]={requests:owned.length,bookings:bookings.length,awaitingApproval:owned.filter(r=>r.request.state==='AWAITING_APPROVAL').length,declinedWithoutBooking:owned.filter(r=>r.request.state==='REJECTED').length,lifecycle:Object.fromEntries([...new Set(bookings.map(b=>b.status))].map(status=>[status,bookings.filter(b=>b.status===status).length])),pickupFeesInr:bookings.reduce((sum,b)=>sum+b.chargedFeeInr,0),totalRowWeightKg:bookings.reduce((sum,b)=>sum+b.items.reduce((n,item)=>n+item.weightKg,0),0)};
}
const before=await snapshot(root),run=spawnSync(process.execPath,['scripts/seed-expanded-workspace.mjs'],{env:process.env,stdio:'inherit',windowsHide:true});assert.equal(run.status,0);const after=await snapshot(root);assert.deepEqual(after,before);
const report={recordedAt:new Date().toISOString(),root,serviceDate:manifest.serviceDate,totalRequests:54,totalBookings:48,counts,unchangedJsonFilesOnRepeat:Object.keys(before).length,sourceHashes:after,noProviderCalls:true,provenance:'Sample records and simulated verification/operations/travel; implemented policy and fee rules, not live extraction'};
await fs.writeFile(out,JSON.stringify(report,null,2));console.log(JSON.stringify({totalRequests:54,totalBookings:48,counts,unchangedJsonFilesOnRepeat:report.unchangedJsonFilesOnRepeat}));
