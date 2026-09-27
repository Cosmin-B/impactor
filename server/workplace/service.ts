import { brainCall, jev, type ProviderKeys } from "../ops/providers";
import {
  rememberWork,
  scheduleWork,
  validateWork,
  type WorkMemory,
} from "../../shared/workplace/engine";
import question from "../../shared/workplace/question.json";
export async function workplace(
  action: string,
  body: any,
  keys: ProviderKeys,
) {
  if (typeof body.id !== "string" || !/^[a-f0-9-]{36}$/.test(body.id))
    throw Error("Start a workplace session.");
  if (!keys.GBRAIN_TOKEN) throw Error("GBrain is not configured.");
  const entity = `impactor-workplace-${body.id}`;
  if (action === "recall" || action === "remember") {
    if (action === "remember") {
      const settings = validateWork(body.settings);
      const memory = rememberWork(scheduleWork(settings));
      await brainCall(keys.GBRAIN_TOKEN, "remember", {
        entity,
        fact: JSON.stringify({ schema: "impactor.workplace.v1", memory }),
        kind: "fact",
        provenance:
          "Completed synthetic workplace simulation and its dependency scopes",
        visibility: "world",
      });
    }
    const found = await brainCall(keys.GBRAIN_TOKEN, "recall", {
      entity,
      grep: "impactor.workplace.v1",
      limit: 20,
    });
    const memories = (found.facts || [])
      .filter((f: any) => !f.expired_at && !f.superseded_by)
      .map((f: any) => {
        try {
          return JSON.parse(f.fact).memory;
        } catch {
          return null;
        }
      })
      .filter((m: any) => m?.records && m?.savedAt)
      .sort((a: any, b: any) => b.savedAt.localeCompare(a.savedAt));
    return {
      memory: memories[0]
        ? ({ ...memories[0], source: "gbrain" } as WorkMemory)
        : null,
    };
  }
  if (action === "decide") {
    if (
      !body.state ||
      typeof body.state !== "object" ||
      JSON.stringify(body.state).length > 10000
    )
      throw Error("Provide a small work context.");
    if (!keys.TYPESAFE_API_KEY) throw Error("Jev is not configured.");
    const result = await jev(keys.TYPESAFE_API_KEY, body.state, question);
    return { ...result, provider: "jev" };
  }
  throw Error("Unknown workplace action.");
}
