// UI-only network fixtures supplement the real vertical-slice browser audit; never claim these are live provider responses.
import {chromium} from 'playwright';import AxeBuilder from '@axe-core/playwright';import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
const base='http://127.0.0.1:3200',out=path.resolve('../evidence/browser-states-'+Date.now());fs.mkdirSync(out);const browser=await chromium.launch(),rows=[];
try{for(const name of['no-eligible-pickups','ambiguous-coordinate','feature-disabled','provider-disabled','long-reference-address','loading']){
 const context=await browser.newContext({viewport:{width:1366,height:768}}),page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await context.route('**/*',async route=>{const r=route.request(),url=new URL(r.url());if(url.origin!==base)return route.abort();if(!url.pathname.startsWith('/api/routing'))return route.continue();
  const respond=(body,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
  if(name==='loading')return new Promise(()=>{});
  if(name==='feature-disabled')return respond({error:'ROUTING_DISABLED'},503);
  if(name==='provider-disabled'&&r.method()==='POST')return respond({error:'HEIGIT_DISABLED_OR_KEY_MISSING'},503);
  const response=await route.fetch();const data=await response.json();
  if(name==='no-eligible-pickups'||name==='ambiguous-coordinate')data.conversions=data.conversions.map(c=>({eligible:false,id:c.eligible?c.pickup.id:c.id,reasons:[name==='ambiguous-coordinate'?'COORDINATE_REVIEW_REQUIRED':'INDEPENDENT_VERIFICATION_REQUIRED']}));
  if(name==='long-reference-address')data.addresses=data.addresses.map(a=>({...a,reference:'SYNTHETIC-'+ 'R'.repeat(145),address:'SYNTHETIC PUBLIC FIXTURE '+ 'W'.repeat(2000)}));
  return respond(data);
 });
 const row={name,fixture:true,errors,screens:[],violations:[]};rows.push(row);
 await page.goto(base+'/admin/routing');await page.getByLabel('Operator token').fill('synthetic-routing-test-token');await page.getByRole('button',{name:'Read eligible bookings',exact:true}).click();
 if(name==='feature-disabled')await page.getByRole('alert').waitFor();else if(name!=='loading')await page.getByRole('heading',{name:'Eligibility and coordinate review'}).waitFor();else await page.getByRole('status').waitFor();
 if(name==='provider-disabled'){await page.getByRole('button',{name:'Generate proposal',exact:true}).click();await page.getByRole('alert').waitFor();}
 if(name==='long-reference-address')await page.getByText('Review address and planning assumptions',{exact:true}).first().click();
 if(name==='no-eligible-pickups'||name==='ambiguous-coordinate')assert.equal(await page.getByRole('button',{name:'Generate proposal',exact:true}).isDisabled(),true);
 for(const [width,height]of[[1366,768],[1440,900],[1920,1080],[390,844],[768,1024],[683,384],[720,450],[960,540]]){await page.setViewportSize({width,height});await page.screenshot({path:path.join(out,name+'-'+width+'x'+height+'.png'),fullPage:true});row.screens.push({width,overflow:await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1)});if(width===1366||width===390){const scan=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();row.violations.push(...scan.violations.map(v=>({id:v.id,width,nodes:v.nodes.map(n=>n.target)})));}}
 await context.close();fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(rows,null,2));console.log(JSON.stringify({name,errors,overflow:row.screens.filter(s=>s.overflow),violations:row.violations}));
}}finally{await browser.close();fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(rows,null,2));if(rows.length!==6||rows.some(r=>r.errors.length||r.violations.length||r.screens.some(s=>s.overflow)))process.exitCode=1;}
