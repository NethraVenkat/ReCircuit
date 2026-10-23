// Synthetic, browser-local API responses only. No live mutations are allowed.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { household, requestId } from './ui-audit-fixtures.mjs';
const out=path.resolve('../evidence/interactions');fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch();const results=[];
async function check(name,run){try{await run();results.push({name,passed:true});}catch(e){results.push({name,passed:false,error:e.message});}finally{fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));}}
const context=await browser.newContext({viewport:{width:1366,height:768},reducedMotion:'reduce'});
const page=await context.newPage();let state='comparison',posts=[];
await page.route('**/*',async route=>{const r=route.request(),u=new URL(r.url());if(u.origin!=='http://127.0.0.1:3400')return route.abort();if(!u.pathname.startsWith('/api/'))return route.continue();
 const json=(b,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(b)});
 if(r.method()==='POST')posts.push({url:u.pathname,body:r.postDataJSON()});
 if(u.pathname.startsWith('/api/requests/'))return json(household(state));
 if(u.pathname==='/api/runtime')return json({provider:'groq',model:'openai/gpt-oss-20b',selection:'explicit',available:true});
 if(u.pathname==='/api/approve'){state=r.postDataJSON().decision==='rejected'?'declined':'approved';return json({success:true});}
 return route.abort();
});
await check('keyboard navigation, visible focus, evidence modal, Escape and focus restoration',async()=>{
 await page.goto('http://127.0.0.1:3400/r/'+requestId);const trigger=page.getByRole('button',{name:'Sources & evidence',exact:true});await trigger.waitFor();
 await page.keyboard.press('Tab');assert.equal(await page.locator(':focus').textContent(),'Skip to content');
 const focus=await page.locator(':focus').evaluate(el=>({style:getComputedStyle(el).outlineStyle,width:getComputedStyle(el).outlineWidth}));assert.notEqual(focus.style,'none');assert.notEqual(focus.width,'0px');
 await trigger.focus();await page.keyboard.press('Enter');const dialog=page.getByRole('dialog');await dialog.waitFor();
 assert.match(await dialog.innerText(),/groq/i);await dialog.getByText('Extraction diagnostics',{exact:true}).click();assert.match(await dialog.innerText(),/Historical Gemini HTTP 503/);
 const close=dialog.getByRole('button',{name:'Close drawer'});await close.focus();await page.keyboard.press('Shift+Tab');assert.ok(await page.locator(':focus').evaluate(el=>Boolean(el.closest('dialog'))));
 await page.keyboard.press('Escape');await dialog.waitFor({state:'detached'});assert.equal(await trigger.evaluate(el=>el===document.activeElement),true);
 assert.equal(await page.evaluate(()=>matchMedia('(prefers-reduced-motion: reduce)').matches),true);
});
await check('explicit acknowledgements gate approval; declining never books and both badges remain Declined',async()=>{
 await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'Review recommended plan',exact:true}).click();const approve=page.getByTestId('approve-plan-button');assert.equal(await approve.isDisabled(),true);
 const checks=page.locator('#approval input[type=checkbox]');await checks.nth(0).check();assert.equal(await approve.isDisabled(),true);await checks.nth(1).check();assert.equal(await approve.isEnabled(),true);
 await page.getByRole('button',{name:'Decline plan',exact:true}).click();await page.getByRole('heading',{name:'Pickup plan declined'}).waitFor();
 assert.equal(await page.locator('.rc-badge').filter({hasText:/^Declined$/}).count(),2);assert.equal(await page.getByRole('button',{name:'Start booking',exact:true}).count(),0);
 assert.deepEqual(posts.map(p=>p.url),['/api/approve']);assert.equal(posts[0].body.decision,'rejected');await page.screenshot({path:path.join(out,'declined-both-badges-1366x768.png'),fullPage:true});
});
await check('approval remains separate from booking and uses the saved plan hash',async()=>{
 state='comparison';posts=[];await page.reload();await page.getByRole('button',{name:'Review recommended plan',exact:true}).click();await page.locator('#approval input[type=checkbox]').nth(0).check();await page.locator('#approval input[type=checkbox]').nth(1).check();await page.getByTestId('approve-plan-button').click();await page.getByRole('button',{name:'Start booking',exact:true}).waitFor();
 assert.equal(posts.length,1);assert.equal(posts[0].body.decision,'approved');assert.equal(posts[0].body.planHash,household().plan.planHash);assert.equal(await page.getByRole('heading',{name:'Compare recyclers',exact:true}).count(),0);
});
await context.close();
const portal=await browser.newContext({viewport:{width:1366,height:768}});const p=await portal.newPage();let submitted=0;
await p.route('**/*',route=>{const r=route.request(),u=new URL(r.url());if(u.origin!=='http://127.0.0.1:3401')return route.abort();if(!u.pathname.startsWith('/api/'))return route.continue();if(r.method()==='POST')submitted++;return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'LOCAL FIXTURE: temporarily unavailable'})});});
await check('fee failure is visible, never displayed as free, and blocks submission',async()=>{await p.goto('http://127.0.0.1:3401/book-pickup');await p.getByText('The pickup fee is unavailable.',{exact:false}).first().waitFor();assert.equal(await p.getByTestId('confirm-booking').isDisabled(),true);assert.equal(submitted,0);await p.screenshot({path:path.join(out,'fee-failure-1366x768.png'),fullPage:true});});
await check('tracking service failure is distinct from booking not found',async()=>{await p.goto('http://127.0.0.1:3401/track?ref=DEC-90001');await p.getByRole('alert').first().waitFor();assert.doesNotMatch(await p.locator('main').innerText(),/No booking found/i);assert.match(await p.locator('main').innerText(),/unavailable|could not|unable/i);});
await portal.close();await browser.close();console.log(JSON.stringify(results,null,2));process.exitCode=results.some(r=>!r.passed)?1:0;
