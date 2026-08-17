export type LogLevel = "info" | "warn" | "error" | "debug" | "rust";

export interface LogEntry {
  id: number;
  timestamp: string;
  level: LogLevel;
  message: string;
  source?: string;
}

type LogListener = (logs: LogEntry[]) => void;

class AppLogger {
  private logs: LogEntry[] = [];
  private listeners: Set<LogListener> = new Set();
  private nextId = 1;
  private maxLogs = 500;

  constructor() {
    if (typeof window !== "undefined") {
      this.hookConsole();
    }
  }

  private hookConsole(): void {
    const origLog = console.log.bind(console);
    const origWarn = console.warn.bind(console);
    const origError = console.error.bind(console);

    console.log = (...args: unknown[]) => {
      origLog(...args);
      this.add("info", args.map(String).join(" "), "JS");
    };

    console.warn = (...args: unknown[]) => {
      origWarn(...args);
      this.add("warn", args.map(String).join(" "), "JS");
    };

    console.error = (...args: unknown[]) => {
      origError(...args);
      this.add("error", args.map(String).join(" "), "JS");
    };
  }

  public add(level: LogLevel, message: string, source: string = "App"): void {
    const d = new Date();
    const timeStr = `${d.getHours().toString().padStart(2, "0")}:${d
      .getMinutes()
      .toString()
      .padStart(2, "0")}:${d.getSeconds().toString().padStart(2, "0")}.${d
      .getMilliseconds()
      .toString()
      .padStart(3, "0")}`;

    const entry: LogEntry = {
      id: this.nextId++,
      timestamp: timeStr,
      level,
      message,
      source,
    };

    this.logs.push(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }

    this.notify();
  }

  public info(message: string, source: string = "App"): void {
    this.add("info", message, source);
  }

  public warn(message: string, source: string = "App"): void {
    this.add("warn", message, source);
  }

  public error(message: string, source: string = "App"): void {
    this.add("error", message, source);
  }

  public debug(message: string, source: string = "App"): void {
    this.add("debug", message, source);
  }

  public addRustLogs(rustLogs: string[]): void {
    for (const log of rustLogs) {
      let level: LogLevel = "rust";
      if (log.includes("❌") || log.includes("Error") || log.includes("falló")) {
        level = "error";
      } else if (log.includes("⚠️")) {
        level = "warn";
      } else if (log.includes("✅") || log.includes("🎉")) {
        level = "info";
      }
      this.add(level, log, "Rust");
    }
  }

  public getLogs(): LogEntry[] {
    return [...this.logs];
  }

  public clear(): void {
    this.logs = [];
    this.notify();
  }

  public subscribe(listener: LogListener): () => void {
    this.listeners.add(listener);
    listener([...this.logs]);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    const snapshot = [...this.logs];
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }
}

export const appLogger = new AppLogger();
