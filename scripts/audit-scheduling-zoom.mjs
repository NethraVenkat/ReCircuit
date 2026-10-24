import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const out=process.env.SCHEDULING_ZOOM_EVIDENCE_DIR,source=process.env.SCHEDULING_SCREEN_RESULTS;
if(!out||!source||!path.isAbsolute(out)||!path.isAbsolute(source))throw Error('Absolute evidence paths required');
const extension=path.join(out,'extension');await fs.mkdir(extension,{recursive:true});
await fs.writeFile(path.join(extension,'manifest.json'),JSON.stringify({manifest_version:3,name:'Isolated demo zoom check',version:'1.0',permissions:['tabs'],background:{service_worker:'background.js'}}));
await fs.writeFile(path.join(extension,'background.js'),'chrome.runtime.onInstalled.addListener(()=>{});');
const context=await chromium.launchPersistentContext(path.join(out,'profile'),{channel:'chromium',headless:true,viewport:{width:1366,height:768},args:['--disable-extensions-except='+extension,'--load-extension='+extension]}),page=await context.newPage(),rows=[];
await context.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
try{
 const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker',{timeout:10000});
 await page.goto('http://127.0.0.1:3263/api/demo-session',{timeout:120000});
 for(const sourceRow of JSON.parse(await fs.readFile(source,'utf8'))){const row={name:sourceRow.name,url:sourceRow.url};rows.push(row);try{
  await page.goto(row.url,{timeout:120000});
  if(row.name.endsWith('-operator')){await page.evaluate(()=>sessionStorage.setItem('rc_admin_token','fictional-demo-local-operator'));await page.reload();await page.getByRole('table').first().waitFor({timeout:60000});}
  if(row.name.includes('-routing')){await page.getByLabel('Operator token').fill('fictional-demo-local-operator');await page.getByRole('button',{name:'Unlock routing workspace'}).click();await page.getByText('Connected to',{exact:false}).waitFor({timeout:60000});}
  await page.waitForFunction(()=>!(/Loading your pickup|Loading your requests|Reading your saved request/.test(document.body.innerText)),null,{timeout:60000});
  row.factor=await worker.evaluate(async()=>{const tabs=await chrome.tabs.query({});const tab=tabs.find(t=>t.url?.startsWith('http://127.0.0.1:'));await chrome.tabs.setZoom(tab.id,2);return chrome.tabs.getZoom(tab.id);});assert.equal(row.factor,2);
  await page.waitForFunction(()=>innerWidth===683);
  row.layout=await page.evaluate(()=>({width:innerWidth,devicePixelRatio,overflow:document.documentElement.scrollWidth>innerWidth+1}));assert.equal(row.layout.overflow,false);
  await page.screenshot({path:path.join(out,row.name+'-native-200.png'),fullPage:true});
  await worker.evaluate(async()=>{const tabs=await chrome.tabs.query({});const tab=tabs.find(t=>t.url?.startsWith('http://127.0.0.1:'));await chrome.tabs.setZoom(tab.id,1);});
 }catch(e){row.error=e.message;}await fs.writeFile(path.join(out,'results.json'),JSON.stringify(rows,null,2));console.log(row.name,row.error||'native 200% passed');}
}finally{await context.close();await fs.writeFile(path.join(out,'summary.json'),JSON.stringify({method:'chrome.tabs.setZoom/getZoom, 1366×768 browser viewport',screens:rows.length,failed:rows.filter(r=>r.error)},null,2));}
