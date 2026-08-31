export type WorkerLog = {
  level: "info" | "error";
  event: string;
  workerId: string;
  runId?: string;
  [key: string]: unknown;
};

export type WorkerLogger = (entry: WorkerLog) => void;

export const jsonWorkerLogger: WorkerLogger = (entry) => {
  const output = JSON.stringify({ timestamp: new Date().toISOString(), ...entry });
  if (entry.level === "error") console.error(output);
  else console.log(output);
};
