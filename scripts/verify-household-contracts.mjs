import "./redesign-reporting.mjs";
import { chromium } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs";
const base="http://localhost:3200";const checks=[];
const browser=await chromium.launch();const context=await browser.newContext({extraHTTPHeaders:{}});
const post=async(route,data,ctx=context)=>{const response=await ctx.request.post(`${base}/api/${route}`,{data,timeout:180000});return {status:response.status(),body:await response.json()};};
const pass=name=>{checks.push(name);console.log(`PASS ${name}`);};
const customer={fullName:"Contract Fixture",phone:"9000000001",addressLine:"24 Fictional Lane",locality:"Madhapur",pincode:"500081"};
let input={text:"Contract fixture laptop",customer,feeCapInr:500,slotDay:"earliest",slotWindow:"any",items:[{id:crypto.randomUUID(),rawText:"Laptop A",category:"laptop",quantity:1,declaredWeightKg:2.5,weightSource:"user_declared",hazardClass:"battery_li_ion",confidence:1}]};
try{
 const created=await post("plan",input);assert.equal(created.status,200,JSON.stringify(created.body));let current=created.body;const id=current.requestId;
 const sibling=await browser.newContext({storageState:await context.storageState()});
 for(const [name,mutate] of [
  ["quantity",v=>({...v,items:v.items.map(i=>({...i,quantity:2}))})],
  ["weight",v=>({...v,items:v.items.map(i=>({...i,declaredWeightKg:4.999}))})],
  ["item identity",v=>({...v,items:v.items.map(i=>({...i,id:crypto.randomUUID(),rawText:"Replacement laptop"}))})],
  ["fee cap",v=>({...v,feeCapInr:0})],
  ["pickup address",v=>({...v,customer:{...v.customer,addressLine:"25 Revised Fictional Lane"}})],
  ["requested slot",v=>({...v,slotWindow:"afternoon"})],
 ]){
   const approved=await post("approve",{requestId:id,planHash:current.plan.planHash,decision:"approved",dataWipeConfirmed:true});assert.equal(approved.status,200);const oldHash=approved.body.plan.planHash;
   input=mutate(input);const edited=await post("plan",{...input,requestId:id,expectedHash:oldHash});assert.equal(edited.status,200,JSON.stringify(edited.body));current=edited.body;assert.equal(current.request.state,"AWAITING_APPROVAL");
   const read=await (await context.request.get(`${base}/api/requests/${id}`)).json();assert.equal(read.approval,null);
   for(const ctx of [context,sibling]){assert.equal((await post("book",{requestId:id,planHash:oldHash},ctx)).status,400);assert.equal((await post("approve",{requestId:id,planHash:oldHash,decision:"approved",dataWipeConfirmed:true},ctx)).status,409);}
   pass(`${name} edit clears approval and blocks both stale sessions after reload`);
 }
 input={...input,items:[{...input.items[0],quantity:2,declaredWeightKg:5}]};let result=await post("plan",input);assert.equal(result.status,200);assert.equal(result.body.plan.totalEstimatedFee,0);assert.equal(result.body.plan.legs[0].items[0].estimatedWeightKg,5);assert.equal(result.body.plan.legs[0].items[0].quantity,2);pass("5 kg threshold and total-row semantics without quantity multiplication");
 result=await post("plan",{...input,items:[{...input.items[0],quantity:1,declaredWeightKg:2.5},{...input.items[0],id:crypto.randomUUID(),rawText:"Laptop B",quantity:1,declaredWeightKg:2.5}]});assert.equal(result.status,200);const allIds=result.body.plan.legs.flatMap(l=>l.itemIds);assert.equal(allIds.length,2);assert.equal(new Set(allIds).size,2);assert.equal(result.body.plan.totalEstimatedFee,0);pass("same-type items retain distinct IDs and allocation");
 for(const bad of [{...input,items:[input.items[0],input.items[0]]},{...input,items:[{...input.items[0],quantity:0}]},{...input,feeCapInr:.5},{...input,items:[{...input.items[0],declaredWeightKg:0}]}])assert.equal((await post("plan",bad)).status,400);pass("runtime schema rejects duplicate identities, invalid quantities, fee precision and zero weight");
 const before=await (await context.request.get(`${base}/api/requests`)).json();for(let tc=1;tc<=4;tc++){const response=await context.request.get(`${base}/api/test-cases/run?tc=${tc}`);assert.equal(response.status(),200);}const after=await (await context.request.get(`${base}/api/requests`)).json();assert.equal(before.requests.length,after.requests.length);pass("reviewer examples leave persisted requests unchanged");
 const cross=await context.request.post(`${base}/api/book`,{headers:{origin:"https://untrusted.example"},data:{requestId:id,planHash:current.plan.planHash}});assert.equal(cross.status(),400);pass("cross-origin mutation rejected");await sibling.close();
}finally{fs.writeFileSync("docs/redesign/contract-results.json",JSON.stringify({completed:checks},null,2));await browser.close();}
