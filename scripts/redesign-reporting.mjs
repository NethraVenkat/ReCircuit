// Playwright network errors include request headers. Never print household access cookies.
export function redact(value) { return String(value).replace(/rc-household=[a-f0-9]+/gi,"rc-household=[REDACTED]").replace(/(cookie:)[^\r\n]*/gi,"$1 [REDACTED]"); }
function report(error){console.error(redact(error?.stack||error));process.exitCode=1;setTimeout(()=>process.exit(1),20);}
process.on("uncaughtException",report);
process.on("unhandledRejection",report);
