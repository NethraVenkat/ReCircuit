import "./redesign-reporting.mjs";
import { spawn } from "node:child_process";
import path from "node:path";
const root=process.cwd();
const launch=spawn(process.execPath,["scripts/redesign-local.mjs"],{cwd:root,stdio:"inherit",windowsHide:true});
const run=script=>new Promise((resolve,reject)=>{const child=spawn(process.execPath,[script],{cwd:root,stdio:"inherit",windowsHide:true});child.on("error",reject);child.on("exit",code=>code===0?resolve():reject(new Error(`${script} exited ${code}`)));});
try{
  await run("scripts/verify-household-layout.mjs");
  await run("scripts/verify-household-warm.mjs");
  if(!process.argv.includes("--checks-only"))await run("scripts/verify-household-redesign.mjs");
  await run("scripts/verify-household-contracts.mjs");
  await run("scripts/verify-household-partial.mjs");
}finally{
  if(process.platform==="win32")await new Promise(resolve=>{const stop=spawn("taskkill",["/pid",String(launch.pid),"/f","/t"],{stdio:"ignore",windowsHide:true});stop.on("exit",resolve);stop.on("error",resolve);});
  else launch.kill("SIGTERM");
  console.log(`Local verification finished; artifacts remain under ${path.join(root,"docs/redesign")}`);
}
