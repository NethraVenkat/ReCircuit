import {chromium} from 'playwright';import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
const evidence=path.resolve(process.env.ROUTING_AUDIT_EVIDENCE_DIR),out=path.join(evidence,'native-zoom-'+Date.now()),extension=path.join(out,'extension');fs.mkdirSync(extension,{recursive:true});
fs.writeFileSync(path.join(extension,'manifest.json'),JSON.stringify({manifest_version:3,name:'Isolated routing zoom verification',version:'1.0',permissions:['tabs'],background:{service_worker:'background.js'}}));fs.writeFileSync(path.join(extension,'background.js'),'chrome.runtime.onInstalled.addListener(()=>{});');
const context=await chromium.launchPersistentContext(path.join(out,'profile'),{channel:'chromium',headless:true,viewport:{width:1366,height:768},args:['--disable-extensions-except='+extension,'--load-extension='+extension]}),page=await context.newPage(),results=[];
await context.route('**/*',route=>new URL(route.request().url()).origin==='http://127.0.0.1:3200'?route.continue():route.abort());
try{
 const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker',{timeout:10000});
 await page.goto('http://127.0.0.1:3200/admin/routing');await page.getByLabel('Operator token').fill('synthetic-routing-test-token');await page.getByRole('button',{name:'Read eligible bookings',exact:true}).click();await page.getByRole('heading',{name:'Eligibility and coordinate review'}).waitFor();
 for(const [width,height]of[[1366,768],[1440,900],[1920,1080]]){
  await worker.evaluate(async()=>{const [tab]=await chrome.tabs.query({url:'http://127.0.0.1:3200/*'});await chrome.tabs.setZoom(tab.id,1);});await page.setViewportSize({width,height});const before=await page.evaluate(()=>({innerWidth,devicePixelRatio}));
  const factor=await worker.evaluate(async()=>{const [tab]=await chrome.tabs.query({url:'http://127.0.0.1:3200/*'});await chrome.tabs.setZoom(tab.id,2);return chrome.tabs.getZoom(tab.id);});assert.equal(factor,2);
  await page.waitForFunction(previous=>devicePixelRatio>previous, before.devicePixelRatio);
  const after=await page.evaluate(()=>({innerWidth,devicePixelRatio,overflow:document.documentElement.scrollWidth>innerWidth+1}));assert.ok(!after.overflow);assert.ok(Math.abs(after.innerWidth-width/2)<=1);
  await page.screenshot({path:path.join(out,'actual-200percent-'+width+'x'+height+'.png'),fullPage:true});results.push({viewport:{width,height},before,chromeZoomFactor:factor,after});
 }
 fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({method:'Documented chrome.tabs.setZoom/getZoom via isolated test extension',results},null,2));console.log(JSON.stringify({out,results}));
}catch(error){fs.writeFileSync(path.join(out,'failed.json'),JSON.stringify({error:error.message,results},null,2));throw error;}finally{await context.close();}
