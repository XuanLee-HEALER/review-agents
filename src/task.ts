import {
  mkdirSync,
  openSync,
  closeSync,
  readFileSync,
  writeFileSync,
  renameSync,
  unlinkSync,
  chmodSync,
  readdirSync,
  fsyncSync,
} from "node:fs";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";

export function liveLocks(dir: string, reclaim = false) {
  return readdirSync(dir)
    .filter((name) => name === "lock" || name.startsWith("lock-"))
    .filter((name) => {
      let pid: number;
      try {
        pid = Number(readFileSync(resolve(dir, name), "utf8"));
      } catch (e: any) {
        if (e.code === "ENOENT") return false;
        throw e;
      }
      if (!Number.isInteger(pid) || pid <= 0)
        throw Error("Invalid task lock; inspect before recovery");
      try {
        process.kill(pid, 0);
        return true;
      } catch (e: any) {
        if (e.code === "ESRCH") {
          if (reclaim) {
            try {
              unlinkSync(resolve(dir, name));
            } catch (error: any) {
              if (error.code !== "ENOENT") throw error;
            }
          }
          return false;
        }
        return true;
      }
    });
}
export class Task {
  dir: string;
  private lock?: string;
  constructor(path: string) {
    this.dir = resolve(path);
    mkdirSync(this.dir, { recursive: true, mode: 0o700 });
  }
  acquire() {
    // Unique claims avoid deleting a lock another recovering process just acquired.
    const name = `lock-${process.pid}-${randomUUID()}`;
    const path = resolve(this.dir, name);
    writeFileSync(path, String(process.pid), { flag: "wx", mode: 0o600 });
    try {
      if (liveLocks(this.dir, true).some((other) => other !== name))
        throw Error("Task is already running");
      this.lock = path;
    } catch (e) {
      unlinkSync(path);
      throw e;
    }
  }
  read(): any {
    const value = JSON.parse(
      readFileSync(resolve(this.dir, "state.json"), "utf8"),
    );
    if (value.version !== 1) throw Error("Unsupported task version");
    return value;
  }
  save(value: unknown) {
    const temp = resolve(this.dir, `state.${process.pid}.tmp`);
    const fd = openSync(temp, "w", 0o600);
    try {
      writeFileSync(fd, JSON.stringify(value));
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    chmodSync(temp, 0o600);
    renameSync(temp, resolve(this.dir, "state.json"));
  }
  release() {
    if (this.lock) {
      unlinkSync(this.lock);
      this.lock = undefined;
    }
  }
}
