// Run the occupied-port preflight once, before Playwright creates servers or workers.
import net from 'node:net';
import { spawn } from 'node:child_process';
for (const port of [3000, 3101, 3102, 3103]) {
  await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', () => reject(new Error(`Occupied port ${port}; refusing reuse`)));
    server.listen(port, '127.0.0.1', () => server.close(resolve));
  });
}
const child = spawn(process.execPath, ['node_modules/@playwright/test/cli.js', 'test', '--config=scripts/playwright-household-local.config.mjs', 'household-journey.spec.ts'], { stdio: 'inherit', windowsHide: true });
child.once('error', error => { console.error(error.message); process.exitCode = 1; });
child.once('exit', code => { process.exitCode = code ?? 1; });
