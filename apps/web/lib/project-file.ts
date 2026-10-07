import type { Project } from "@roi-calculator/engine";

/** Downloads a project as a .aicost.json file the user can open again later. */
export function downloadProject(project: Project): void {
  const blob = new Blob([JSON.stringify(project, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${project.name.replace(/[^\w-]+/g, "-").toLowerCase()}.aicost.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}
