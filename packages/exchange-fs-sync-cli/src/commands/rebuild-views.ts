import { resolve } from "node:path";
import { loadConfig, FileViewStore } from "exchange-fs-sync";

export interface RebuildViewsOptions {
  config: string;
  verbose?: boolean;
}

export async function rebuildViewsCommand(options: RebuildViewsOptions): Promise<void> {
  const configPath = resolve(options.config);
  
  if (options.verbose) {
    console.error(`Loading config from: ${configPath}`);
  }
  
  const config = await loadConfig({ path: configPath });
  const rootDir = resolve(config.root_dir);
  
  const viewStore = new FileViewStore({
    rootDir,
  });
  
  if (options.verbose) {
    console.error("Rebuilding views...");
  }
  
  const startTime = Date.now();
  await viewStore.rebuildAll();
  const duration = Date.now() - startTime;
  
  const result = {
    status: "success",
    duration_ms: duration,
    message: "Views rebuilt successfully",
  };
  
  console.log(JSON.stringify(result, null, 2));
}
