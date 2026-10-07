import type { Project } from "../project.js";
import { buildPlanProject } from "../usecases.js";
import { PROJECT_TEMPLATES } from "./templates.js";

/**
 * Cheques to online payments, the reference template (A12). It is the "cheques" recipe with every answer at the
 * worked example's figures and the environments and lease decision ticked, so a project made from it and a project
 * made by the wizard with the same answers are the same project. Every figure is an illustrative assumption to replace.
 * Production resources use catalogue SKUs (an App Service plan and an Azure SQL database), so their price is the
 * catalogue's, not the C$1,800 a month of the plan's worked example (see cheque-template.test.ts, which swaps in that price).
 */
export function chequesTemplate(name: string): Project {
  const { project } = buildPlanProject({
    name, deployment: "dataZone", quality: "balanced", batchAllowed: false, build: { people: 0, months: 6 }, devKinds: [],
    selections: [{ recipeId: "cheques", label: "Cheques to online payments", values: { envs: "dev,test,uat", leaseEnded: "yes" }, types: ["newApp", "automation"] }],
  });
  return project;
}

const CHEQUES = { id: "cheques", label: "Cheques to online payments", detail: "Stop printing and posting cheques: gateway, portal, current-state savings, environments and a scorecard (illustrative figures)", make: chequesTemplate };

/**
 * Every template the app offers. `PROJECT_TEMPLATES` stays the five templates of schema version 5, because the v5 golden
 * test pins exactly that list; templates added since are listed here, before "Blank" (which the store uses as its fallback).
 */
export const ALL_PROJECT_TEMPLATES: typeof PROJECT_TEMPLATES = [...PROJECT_TEMPLATES.filter((t) => t.id !== "blank"), CHEQUES, ...PROJECT_TEMPLATES.filter((t) => t.id === "blank")];
