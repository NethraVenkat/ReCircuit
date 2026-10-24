// Local operator preview only. Production configuration and production booking repositories are not used.
import fs from 'node:fs';import path from 'node:path';import net from 'node:net';import {spawn,execFileSync} from 'node:child_process';import {parseEnv} from 'node:util';import {fileURLToPath} from 'node:url';
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),data=process.env.ROUTING_TEST_DATA_DIR;
if(!data||!path.isAbsolute(data)||!process.env.ADMIN_TOKEN?.trim())throw Error('Absolute ROUTING_TEST_DATA_DIR and explicit ADMIN_TOKEN are required');
const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>/^(SystemRoot|windir|PATH|PATHEXT|ComSpec|APPDATA|LOCALAPPDATA|TEMP|TMP|USERPROFILE|PROGRAMFILES|PROGRAMFILES\(X86\)|HOMEDRIVE|HOMEPATH)$/i.test(key)));
const envFile=process.env.ROUTING_ENV_FILE;
if(envFile){if(!path.isAbsolute(envFile))throw Error('ROUTING_ENV_FILE must be absolute');const directory=path.dirname(envFile),name=path.basename(envFile);execFileSync('git',['check-ignore','--quiet',name],{cwd:directory});if(execFileSync('git',['ls-files',name],{cwd:directory,encoding:'utf8'}).trim())throw Error('Provider env file must not be tracked');const bytes=fs.readFileSync(envFile),values=parseEnv(bytes.toString(bytes[0]===255&&bytes[1]===254?'utf16le':'utf8').replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n'));for(const name of['HEIGIT_API_KEY','MAPTILER_API_KEY'])if(values[name])env[name]=values[name];}
Object.assign(env,{NODE_ENV:'development',NEXT_TELEMETRY_DISABLED:'1',LLM_PROVIDER:'fake',RECYCLER_ID:'deccan',RECIRCUIT_PERSISTENCE:'local',ADMIN_TOKEN:process.env.ADMIN_TOKEN,CAPTCHA_SECRET:'synthetic-preview-only',ROUTING_ENABLED:'true',STORAGE_DIR:path.join(data,'portal'),ROUTING_HOUSEHOLD_EVIDENCE_DIR:path.join(data,'household'),ROUTING_DATA_DIR:path.join(data,'planning'),NEXT_DIST_DIR:'.next-routing-preview',ROUTING_MATRIX_PROVIDER:process.env.ROUTING_MATRIX_PROVIDER||'synthetic',ROUTING_EXTERNAL_PUBLIC_ENABLED:process.env.ROUTING_EXTERNAL_PUBLIC_ENABLED||'false',MAPTILER_ALLOWED_ORIGINS:'http://localhost:3200,http://127.0.0.1:3200',MAPTILER_ORIGIN_RESTRICTIONS_VERIFIED:'false'});
env.ROUTING_GEOCODER_PROVIDER=process.env.ROUTING_GEOCODER_PROVIDER||'synthetic';
env.ROUTING_FREE_QUOTA_CONFIRMED=process.env.ROUTING_FREE_QUOTA_CONFIRMED==='true'?'true':'false';
if(process.env.ROUTING_STORE_BACKEND==='supabase-local-test'){
 const url=new URL(process.env.ROUTING_TEST_SUPABASE_URL||'https://invalid.example');
 if(url.protocol!=='http:'||!['127.0.0.1','localhost'].includes(url.hostname)||url.origin!==process.env.ROUTING_TEST_SUPABASE_URL)throw Error('Explicit loopback test RPC origin required');
 Object.assign(env,{ROUTING_STORE_BACKEND:'supabase-local-test',ROUTING_SHARED_TEST_MODE:'true',SUPABASE_URL:url.origin,SUPABASE_SERVICE_ROLE_KEY:'synthetic-local-test-service-role'});
 if(process.env.ROUTING_NATIVE_POSTGREST_TEST_MODE==='true'){
  if(!process.env.ROUTING_TEST_POSTGREST_TOKEN?.trim())throw Error('Explicit isolated PostgREST test token required');
  Object.assign(env,{ROUTING_NATIVE_POSTGREST_TEST_MODE:'true',ROUTING_NATIVE_POSTGREST_TOKEN:process.env.ROUTING_TEST_POSTGREST_TOKEN});
 }
}
await new Promise((resolve,reject)=>{const s=net.createServer();s.once('error',reject);s.listen(3200,'127.0.0.1',()=>s.close(resolve));});
console.log('Local routing preview: http://127.0.0.1:3200/admin/routing; MapTiler browser exposure disabled');
const child=spawn(process.execPath,[path.join(repo,'node_modules/next/dist/bin/next'),'dev','--webpack','-H','127.0.0.1','-p','3200'],{cwd:path.join(repo,'apps/portals'),env,stdio:'inherit',windowsHide:true});
child.on('exit',code=>process.exitCode=code??1);process.on('SIGINT',()=>child.kill());process.on('SIGTERM',()=>child.kill());
if(process.env.ROUTING_STOP_FILE)setInterval(()=>{if(fs.existsSync(process.env.ROUTING_STOP_FILE)){child.kill();process.exit(0);}},1000);
