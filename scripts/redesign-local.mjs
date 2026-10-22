// Isolated local-only household verification environment. No .env loader or cloud services.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import net from "node:net";
const root = process.cwd();
const data = path.join(root, ".data", "household-redesign-local");
fs.mkdirSync(data, { recursive: true });
const webOnly = process.argv.includes("--web-only");
const portalsOnly = process.argv.includes("--portals-only");
for (const port of webOnly ? [3200] : portalsOnly ? [3101,3102,3103] : [3200, 3101, 3102, 3103]) {
  await new Promise((resolve, reject) => { const server = net.createServer(); server.once("error", () => reject(new Error(`Port ${port} already in use. Refusing to reuse an unknown server.`))); server.listen(port, () => server.close(resolve)); });
}
const env = { ...process.env, CI: "1", BROWSER_MODE: "local", LLM_PROVIDER: "fake", RECIRCUIT_DATA_DIR: path.join(data, "household"), STORAGE_DIR: path.join(data, "portals"), CAPTCHA_SECRET: "isolated-local-reviewer-captcha-secret", ADMIN_TOKEN: "isolated-local-reviewer-admin" };
for (const key of Object.keys(env)) if (/SUPABASE|BROWSERBASE|OPENAI_API|ANTHROPIC_API|PORTAL.*URL|DECCAN.*URL|PAPERPLUS.*URL|QUICKSCRAP.*URL/.test(key)) delete env[key];
const children = [];
for (const [app, port, recycler] of (webOnly ? [["web",3200,null]] : portalsOnly ? [["portals",3101,"deccan"],["portals",3102,"paperplus"],["portals",3103,"quickscrap"]] : [["web",3200,null],["portals",3101,"deccan"],["portals",3102,"paperplus"],["portals",3103,"quickscrap"]])) {
  const log = fs.openSync(path.join(data, `${app}-${port}.log`), "a");
  const child = spawn(process.execPath, [path.join(root,"node_modules/next/dist/bin/next"), app === "web" ? "start" : "dev", "-p", String(port)], { cwd:path.join(root,"apps",app), env:{...env,...(recycler?{RECYCLER_ID:recycler,NEXT_DIST_DIR:`.next-${port}`}:{NEXT_DIST_DIR:".next-household-redesign"})}, stdio:["pipe",log,log], windowsHide:true });
  child.on("exit",code=>console.log(`${app} ${port} exited ${code}`));
  children.push(child); console.log(`${app} ${port} pid=${child.pid}`);
}
fs.writeFileSync(path.join(data,webOnly?"web-processes.json":portalsOnly?"portal-processes.json":"processes.json"),JSON.stringify(children.map(c=>c.pid)));
function stop(){for(const child of children)child.kill();}
process.on("SIGINT",stop);process.on("SIGTERM",stop);
