import { FileViewStore } from "../persistence/views.js";

export async function rebuildViewsCommand(rootDir: string): Promise<void> {
  const views = new FileViewStore({ rootDir });
  await views.rebuildAll();
  process.stdout.write("views rebuilt\n");
}