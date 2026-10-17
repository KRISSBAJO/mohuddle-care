import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { once } from "node:events";

// Keep Next's normal production server and chat in the existing Render service, with one public port.
const reservation = createServer();
reservation.listen(0, "127.0.0.1");
await once(reservation, "listening");
const nextPort = reservation.address().port;
await new Promise(resolve => reservation.close(resolve));

const children = [];
let stopping = false;
function stop(code) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  for (const child of children) if (child.exitCode === null) child.kill("SIGTERM");
  const timeout = setTimeout(() => process.exit(code), 8000);
  timeout.unref();
}
function start(args, extra = {}) {
  const child = spawn(process.execPath, args, { env: { ...process.env, ...extra }, stdio: "inherit", windowsHide: true });
  children.push(child);
  child.on("error", error => { console.error("Hosted process could not start:", error.message); stop(1); });
  child.on("exit", () => { if (!stopping) stop(1); });
}
process.on("SIGTERM", () => stop(0));
process.on("SIGINT", () => stop(0));
start(["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(nextPort)]);
start(["node_modules/tsx/dist/cli.mjs", "--conditions=react-server", "src/realtime/gateway.ts"], { CHAT_HTTP_UPSTREAM: `http://127.0.0.1:${nextPort}`, PORT: process.env.PORT || "3400" });
