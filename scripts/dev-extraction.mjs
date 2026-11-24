// Starts the local extraction API with the credentials it needs.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const venvPython = resolve(root, ".venv/bin/python");
const envFile = resolve(root, "services/recipe-extraction/.env");

const child = spawn(
  existsSync(venvPython) ? venvPython : "python3",
  [
    "-m", "uvicorn", "main:app", "--host", "127.0.0.1", "--port", "8001",
    ...(existsSync(envFile) ? ["--env-file", envFile] : []),
  ],
  { cwd: resolve(root, "services/recipe-extraction"), stdio: "inherit" },
);
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
child.on("exit", (code) => process.exit(code ?? 0));
