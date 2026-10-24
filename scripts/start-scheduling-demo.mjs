// Local-only launcher: no inherited service credentials, env files or external providers.
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import {spawn} from 'node:child_process';
const root=process.env.RECIRCUIT_DEMO_ROOT,repo=process.cwd();
if(!root||!path.isAbsolute(root)||!process.env.ADMIN_TOKEN?.trim())throw Error('Absolute RECIRCUIT_DEMO_ROOT and explicit local ADMIN_TOKEN required');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'demo-manifest.json'),'utf8'));
if(manifest.kind!=='recircuit-fictional-demo-v1')throw Error('Demo manifest required');
const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>/^(SystemRoot|windir|PATH|PATHEXT|ComSpec|APPDATA|LOCALAPPDATA|TEMP|TMP|USERPROFILE|PROGRAMFILES|PROGRAMFILES\(X86\)|HOMEDRIVE|HOMEPATH)$/i.test(key)));
Object.assign(env,{NODE_ENV:'development',NEXT_TELEMETRY_DISABLED:'1',RECIRCUIT_PERSISTENCE:'local',RECIRCUIT_DEMO_MODE:'true',RECIRCUIT_DEMO_ROOT:root,ADMIN_TOKEN:process.env.ADMIN_TOKEN,CAPTCHA_SECRET:'fictional-local-demo-only',LLM_PROVIDER:'fake',BROWSER_MODE:'local',STORAGE_DIR:path.join(root,'portal'),RECIRCUIT_DATA_DIR:path.join(root,'household-app'),ROUTING_HOUSEHOLD_EVIDENCE_DIR:path.join(root,'household'),ROUTING_DATA_DIR:path.join(root,'planning'),ROUTING_ENABLED:'true',ROUTING_MATRIX_PROVIDER:'synthetic',ROUTING_GEOCODER_PROVIDER:'disabled',ROUTING_EXTERNAL_PUBLIC_ENABLED:'false',ROUTING_MAP_ENABLED:'false',PORTAL_DECCAN_URL:'http://127.0.0.1:3260',PORTAL_PAPERPLUS_URL:'http://127.0.0.1:3261',PORTAL_QUICKSCRAP_URL:'http://127.0.0.1:3262'});
const specs=[['portals',3260,'deccan'],['portals',3261,'paperplus'],['portals',3262,'quickscrap'],['web',3263,'']];
for(const [,port]of specs)await new Promise((resolve,reject)=>{const server=net.createServer();server.once('error',reject);server.listen(port,'127.0.0.1',()=>server.close(resolve));});
const children=[];
for(const [app,port,tenant]of specs){const log=fs.openSync(path.join(root,`server-${port}.log`),'a');const child=spawn(process.execPath,[path.join(repo,'node_modules/next/dist/bin/next'),'dev','--webpack','-H','127.0.0.1','-p',String(port)],{cwd:path.join(repo,'apps',app),env:{...env,NEXT_DIST_DIR:'.next-scheduling-demo-'+port,...(tenant?{RECYCLER_ID:tenant}:{})},stdio:['ignore',log,log],windowsHide:true});children.push(child);console.log(`${app} ${tenant||'household'} http://127.0.0.1:${port}`);}
console.log(`Fictional demo service date: ${manifest.serviceDate}. No external provider calls. Stop with Ctrl+C.`);
const stop=()=>{for(const child of children)child.kill();};process.on('SIGINT',stop);process.on('SIGTERM',stop);
if(process.env.RECIRCUIT_DEMO_STOP_FILE){const interval=setInterval(()=>{if(fs.existsSync(process.env.RECIRCUIT_DEMO_STOP_FILE)){stop();clearInterval(interval);}},1000);}
