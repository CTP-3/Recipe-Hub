// Runs before `pnpm dev`: checks ports and settings, then starts Panoscribe.
// It never stops a process and never prints a setting's value.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createConnection } from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PORTS = {
  3000: "the web app", 5433: "the database", 8001: "the extraction API",
  10000: "Azurite blobs", 10001: "Azurite queues", 10002: "Azurite tables",
};

function inUse(port) {
  return new Promise((done) => {
    const socket = createConnection({ port, host: "127.0.0.1" });
    socket.once("connect", () => { socket.destroy(); done(true); });
    socket.once("error", () => done(false));
  });
}

function hasSetting(files, name) {
  if (process.env[name]) return true;
  return files.some((file) => {
    const path = resolve(root, file);
    return existsSync(path) && new RegExp(`^${name}=\\S`, "m").test(readFileSync(path, "utf8"));
  });
}

const busy = [];
for (const [port, use] of Object.entries(PORTS)) {
  if (await inUse(Number(port))) busy.push(`  ${port} (${use})`);
}
if (busy.length) {
  console.error(`These ports are already in use:\n${busy.join("\n")}\nRecipe Hub may already be running in another terminal. Stop it there with Ctrl+C.\nTo see what uses a port: lsof -nP -iTCP:3000 -sTCP:LISTEN`);
  process.exit(1);
}

const settings = [
  ["SMVD_RAPIDAPI_KEY", ["apps/web/.env.local"], "video links will not work"],
  ["CLASSROOM_AI_URL", ["services/recipe-extraction/.env"], "recipes cannot be generated"],
  ["CLASSROOM_AI_KEY", ["services/recipe-extraction/.env"], "recipes cannot be generated"],
  ["AUTH_SECRET", ["apps/web/.env.local"], "sign-in will not work"],
  ["AUTH_GOOGLE_ID", ["apps/web/.env.local"], "sign-in will not work"],
  ["AUTH_GOOGLE_SECRET", ["apps/web/.env.local"], "sign-in will not work"],
];
for (const [name, files, effect] of settings) {
  if (!hasSetting(files, name)) console.warn(`Warning: ${name} is not set in ${files[0]}; ${effect}.`);
}

const docker = spawnSync("docker", ["compose", "up", "-d", "--wait", "panoscribe-api"], { cwd: root, stdio: "inherit" });
if (docker.status !== 0) {
  console.warn("Warning: Panoscribe did not start, so new videos cannot be processed. Open Docker Desktop, wait until it is running, then run: docker compose up -d panoscribe-api");
}
