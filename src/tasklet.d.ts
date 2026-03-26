/* eslint-disable @typescript-eslint/no-explicit-any */
interface TaskletAPI {
  writeFileToDisk(path: string, content: string): Promise<any>;
  readFileFromDisk(path: string): Promise<string>;
  runCommand(cmd: string, options?: any): Promise<{ exitCode: number; log: string }>;
  sendMessageToAgent(msg: string): Promise<any>;
  runTool(name: string, args: any): Promise<any>;
}

declare global {
  interface Window {
    tasklet?: TaskletAPI;
  }
}

export {};
