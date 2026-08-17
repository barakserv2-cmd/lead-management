// Ad-hoc smoke test: runs the assistant tools + model directly (no HTTP/auth).
// Usage: npx tsx --env-file=.env.local scripts/test-assistant.ts "שאלה"
import Anthropic from "@anthropic-ai/sdk";
import { assistantTools } from "../src/lib/assistant/tools";

async function main() {
  const q = process.argv[2] ?? "איפה אני צריכה מלצרים?";
  const client = new Anthropic();
  const runner = client.beta.messages.toolRunner({
    model: "claude-opus-5",
    max_tokens: 4096,
    output_config: { effort: "medium" },
    system: "את עוזרת של מגייסת במערכת לידים. עני בעברית קצר. השתמשי בכלים לנתונים. צרפי קישורים markdown ללידים.",
    messages: [{ role: "user", content: q }],
    tools: assistantTools,
    max_iterations: 8,
  });
  for await (const msg of runner) {
    for (const b of msg.content) {
      if (b.type === "tool_use") console.log("TOOL:", b.name, JSON.stringify(b.input));
      if (b.type === "text") console.log("TEXT:", b.text);
    }
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
