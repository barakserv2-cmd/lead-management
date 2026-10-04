// Every field a form reads must exist in that form.
//
// 30.09: the add-lead form started requiring `form.get("channel")` ("איך
// שמע/ה עלינו?"), but the <select name="channel"> was never added. The check
// always failed, and from 30.09 to 04.10 no recruiter could save a lead by
// hand. Nothing caught it — tsc and the build don't know what a FormData holds.

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";

const SRC = join(process.cwd(), "src");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const forms = walk(SRC)
  .filter((f) => f.endsWith(".tsx"))
  .map((f) => ({ file: relative(SRC, f).split("\\").join("/"), src: readFileSync(f, "utf8") }))
  .filter(({ src }) => /\bform\.get\(\s*["']/.test(src));

describe("form fields", () => {
  it("finds the forms", () => {
    expect(forms.map((f) => f.file)).toContain("app/(dashboard)/leads/add-lead-dialog.tsx");
  });

  for (const { file, src } of forms) {
    const read = [...new Set([...src.matchAll(/\bform\.get\(\s*["']([\w-]+)["']\s*\)/g)].map((m) => m[1]))];
    it(`${file}: every field it reads is in the form`, () => {
      const missing = read.filter((name) => !new RegExp(`name=["'{]\\s*["'\`]?${name}["'\`]?`).test(src));
      expect(missing, `${file} reads fields that no input provides`).toEqual([]);
    });
  }
});
