import { ENGINEERING_TOOL_KINDS } from "@roi-calculator/engine";

/** Add-menu entries for the tools list: the five tool kinds plus the AI coding tools activity. */
export const TOOL_MENU = [
  ...ENGINEERING_TOOL_KINDS.map((k) => ({ kind: k.kind as string, label: k.label, detail: k.detail })),
  { kind: "aiAssisted", label: "AI-assisted development", detail: "Copilot seats and coding-agent tokens, with hours saved per role" },
];
