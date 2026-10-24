import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const out=path.resolve('.data/ui-cleanup-20261024/states-'+Date.now());
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true}),context=await browser.newContext({viewport:{width:1366,height:768}}),page=await context.newPage(),results=[];
await context.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
async function shot(name){await page.screenshot({path:path.join(out,name+'.png'),fullPage:true,timeout:90000});}
try {
 for(const [port,tenant,route] of [[3460,'deccan','/track'],[3461,'paperplus','/status'],[3462,'quickscrap','/track-order']]) {
  const origin='http://127.0.0.1:'+port;
  await page.goto(origin+route,{timeout:150000,waitUntil:'domcontentloaded'}); await page.waitForLoadState('load',{timeout:90000});
  await page.waitForFunction(()=>Object.keys(document.querySelector('[data-testid=submit-track]') || {}).some(key=>key.startsWith('__reactProps$')));
  await page.getByTestId('submit-track').click();
  assert.equal(await page.getByTestId('input-reference').evaluate(el=>el.validity.valueMissing),true);
  let release; const hold=new Promise(resolve=>release=resolve);
  await page.route('**/api/bookings?*',async r=>{await hold;await r.fulfill({status:404,json:{error:'NOT_FOUND'}});});
  await page.getByTestId('input-reference').fill('INVALID-REFERENCE');
  await page.getByTestId('input-reference').focus(); await page.keyboard.press('Tab');
  assert.equal(await page.getByTestId('submit-track').evaluate(el=>el===document.activeElement),true);
  await page.keyboard.press('Enter'); await page.locator('.ui-recycling-loader').waitFor();
  assert.equal(await page.getByTestId('submit-track').innerText(),'Checking…');
  assert.equal(await page.locator('.ui-recycling-loader').getAttribute('aria-busy'),'true');
  await shot(tenant+'-loading');
  await page.emulateMedia({reducedMotion:'reduce'});
  assert.equal(await page.locator('.ui-recycling-loader svg').evaluate(el=>getComputedStyle(el).animationName),'none');
  await shot(tenant+'-loading-reduced-motion');
  await page.emulateMedia({reducedMotion:'no-preference'});
  assert.equal(await page.locator('.ui-recycling-loader svg').evaluate(el=>getComputedStyle(el).animationName),'recycling-turn');
  release(); await page.getByTestId('not-found-message').waitFor(); await shot(tenant+'-invalid-reference');
  await page.unroute('**/api/bookings?*');
  const data=await (await context.request.get(origin+'/api/admin',{headers:{'x-admin-token':'ui-cleanup-local-review'},timeout:150000})).json();
  await page.getByTestId('input-reference').fill(data.bookings[0].bookingReference);
  await page.getByTestId('submit-track').click(); await page.getByTestId('tracking-result').waitFor();
  let finish;const refresh=new Promise(resolve=>finish=resolve);
  await page.route('**/api/bookings?*',async r=>{await refresh;await r.fulfill({status:500,json:{error:'unavailable'}});});
  await page.getByTestId('submit-track').click();await page.locator('.ui-recycling-loader').waitFor();
  assert.equal(await page.getByTestId('tracking-result').isVisible(),true);await shot(tenant+'-background-refresh');
  finish();await page.getByRole('alert').waitFor();assert.equal(await page.locator('.ui-recycling-loader').count(),0);await shot(tenant+'-service-error');
  await page.unroute('**/api/bookings?*');
  const weighed=data.bookings.find(booking=>booking.status==='WEIGHED');
  if(weighed) {
    await page.getByTestId('input-reference').fill(weighed.bookingReference); await page.getByTestId('submit-track').click();
    await page.getByTestId('tracking-result').waitFor();
    assert.match(await page.getByTestId('tracking-status').innerText(),/^weight recorded$/i);
    assert.ok(await page.getByTestId('simulated-event-badge').count()>0); await shot(tenant+'-weight-recorded');
  }
  results.push({tenant,requiredValidation:true,keyboardSubmit:true,visiblePendingLabel:true,reducedMotion:true,normalRotation:true,invalidReference:true,backgroundResultPreserved:true,errorStopsLoader:true});
 }
 // Test read failures and empty state without modifying persisted records.
 await page.route('**/api/requests',r=>r.fulfill({json:{requests:[]}}));
 await page.goto('http://127.0.0.1:3463/');await page.getByRole('heading',{name:'No pickups yet'}).waitFor();await shot('household-empty');
 await page.unroute('**/api/requests');let finish;const held=new Promise(resolve=>finish=resolve);
 await page.route('**/api/requests',async r=>{await held;await r.fulfill({status:500,json:{error:'Local read unavailable'}});});
 await page.reload();await page.locator('.ui-recycling-loader').waitFor();await shot('household-loading');finish();await page.getByRole('alert').waitFor();await shot('household-error');
 assert.equal(await page.locator('.ui-recycling-loader').count(),0);results.push({householdEmpty:true,householdReadError:true});
 await page.unroute('**/api/requests');
 await page.route('**/api/routing?*',r=>r.fulfill({status:503,json:{error:'ROUTING_SERVICE_UNAVAILABLE'}}));
 await page.goto('http://127.0.0.1:3460/admin/routing?date=2026-10-24');await page.getByLabel('Operator token').fill('ui-cleanup-local-review');await page.getByRole('button',{name:'Unlock routing workspace'}).click();await page.getByRole('alert').waitFor();await shot('routing-read-error');assert.equal(await page.locator('.ui-recycling-loader').count(),0);results.push({routingErrorStopsLoader:true});
} catch(e) {results.push({error:e.message});throw e;} finally {await fs.writeFile(path.join(out,'results.json'),JSON.stringify(results,null,2));await browser.close();}
