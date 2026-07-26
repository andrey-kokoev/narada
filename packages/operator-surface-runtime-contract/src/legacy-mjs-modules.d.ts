declare module '*.mjs' {
  export const parseLaunchRegistry: (path: string) => Array<Record<string, any>>;
  export const loadSiteMcpFabric: (...args: Array<any>) => any;
  export const projectFabricForAgentTui: (...args: Array<any>) => any;
}
