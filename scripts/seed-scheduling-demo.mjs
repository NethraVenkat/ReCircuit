import fs from 'node:fs/promises';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {household,requestId} from './ui-audit-fixtures.mjs';
import {FileRepository} from '../packages/db/dist/file-store.js';
const root=process.env.RECIRCUIT_DEMO_ROOT;
if(!root||!path.isAbsolute(root)||process.env.NODE_ENV==='production')throw Error('Absolute isolated local RECIRCUIT_DEMO_ROOT required');
const result=spawnSync(process.execPath,['node_modules/vitest/vitest.mjs','run','apps/portals/src/lib/geospatial/demo-seed.test.ts'],{env:{...process.env,RECIRCUIT_DEMO_SEED_ROOT:root},stdio:'inherit',windowsHide:true});
if(result.status!==0)process.exit(result.status||1);
const repo=new FileRepository(path.join(root,'household-app'));
const states=['comparison','declined','approved','requested','verified','collected','stale','failed'];
for(const [i,state]of states.entries()){
 const id=`10000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`;
 if(await repo.getRequest(id))continue;
 const record=JSON.parse(JSON.stringify(household(state)).replaceAll(requestId,id).replaceAll('LOCAL FIXTURE old laptop','Laptop').replaceAll('LOCAL FIXTURE: ','').replaceAll('LOCAL UI FIXTURE','Demo').replaceAll('LOCAL FIXTURE Laptop','Laptop'));
 record.request.userId=createHash('sha256').update('recircuit-fictional-household-demo-v1').digest('hex');
 record.request.description=`Fictional household collection — ${state}`;
 record.household.customer.fullName=['Mira Rao','Arjun Shah','Leela Menon','Dev Kapoor','Tara Nair','Rohan Das','Anika Sen','Kabir Iyer'][i];
 record.household.customer.addressLine='KBR Park public entrance — fictional collection';
 record.household.demo={isSimulated:true,explanation:'Isolated fictional demo; historical evidence retains original timestamps'};
 for(const item of record.items)item.description='Fictional laptop';
 for(const item of record.request.items)item.description='Fictional laptop';
 if(record.household.intakeResult)for(const item of record.household.intakeResult.items)item.rawText='Fictional laptop';
 for(const leg of record.plan.legs)for(const item of leg.items)item.description='Fictional laptop';
 await repo.saveRequest(record);
}
console.log('Fictional demo ready. Household: http://127.0.0.1:3263/api/demo-session. Historical household evidence remains expired where applicable.');
