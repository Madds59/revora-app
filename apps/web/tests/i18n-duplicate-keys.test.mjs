// Release gate: locale files must contain no duplicate sibling keys.
//
// Why the existing parity tests cannot catch this: they call JSON.parse first,
// and the parser silently keeps the LAST occurrence of a duplicated key. By the
// time parity compares two objects the evidence is gone, so en.json and ar.json
// can both carry the same duplicate and still look perfectly in sync.
//
// This is not hypothetical. `retainerCalculator.context.vehicles` was defined
// twice in both files: once as a card description and once as a field label. The
// last-wins rule meant the description string was unreachable, so the scenario
// card rendered "Vehicles covered" where a sentence belonged -- a live UI bug
// that every parity test passed straight over.
//
// The detector therefore walks the RAW source as a token stream and tracks the
// key set per object scope, which is the only place the duplication is visible.

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const MESSAGES_DIR = fileURLToPath(new URL("../src/messages", import.meta.url));

/**
 * Find duplicate sibling keys in raw JSON text.
 *
 * A minimal scanner rather than a dependency: it tracks string state so a brace
 * or colon inside a value cannot desynchronise scope tracking, and it records a
 * path plus line number so a failure is actionable rather than just "somewhere".
 */
export function findDuplicateKeys(source) {
  const duplicates = [];
  const scopes = [{ keys: new Set(), path: "" }];
  let index = 0;
  let inString = false;
  let escaped = false;
  let buffer = "";
  let pendingKey = null;
  let capturing = false;

  const lineAt = (pos) => source.slice(0, pos).split("\n").length;

  while (index < source.length) {
    const char = source[index];

    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') {
        inString = false;
        if (capturing) {
          pendingKey = buffer;
          buffer = "";
        }
      } else if (capturing) buffer += char;
      index++;
      continue;
    }

    if (char === '"') {
      inString = true;
      capturing = true;
      buffer = "";
      index++;
      continue;
    }

    if (char === ":") {
      if (pendingKey !== null) {
        const scope = scopes[scopes.length - 1];
        if (scope.keys.has(pendingKey)) {
          const path = scope.path ? `${scope.path}.${pendingKey}` : pendingKey;
          duplicates.push(`${path} (line ${lineAt(index)})`);
        }
        scope.keys.add(pendingKey);
      }
      capturing = false;
      index++;
      continue;
    }

    if (char === "{") {
      const parent = scopes[scopes.length - 1];
      const path = pendingKey ? (parent.path ? `${parent.path}.${pendingKey}` : pendingKey) : parent.path;
      scopes.push({ keys: new Set(), path });
      pendingKey = null;
      index++;
      continue;
    }

    if (char === "}") {
      if (scopes.length > 1) scopes.pop();
      pendingKey = null;
      index++;
      continue;
    }

    index++;
  }

  return duplicates;
}

const localeFiles = readdirSync(MESSAGES_DIR).filter((f) => f.endsWith(".json"));

test("locale files exist to scan", () => {
  assert.ok(localeFiles.length >= 2, `expected at least en/ar, found ${localeFiles.join(", ") || "none"}`);
});

for (const file of localeFiles) {
  test(`${file}: no duplicate sibling keys`, () => {
    const duplicates = findDuplicateKeys(readFileSync(join(MESSAGES_DIR, file), "utf8"));
    assert.deepEqual(
      duplicates,
      [],
      `${file} defines the same key twice in one object; JSON.parse keeps only the last, so the other value is unreachable: ${duplicates.join(", ")}`,
    );
  });
}

test("positive control: the detector finds a planted duplicate", () => {
  // Without this, a refactor that broke the scanner would leave every file
  // "passing" and the gate would be silently worthless.
  const planted = '{\n  "a": {\n    "x": "1",\n    "y": "2",\n    "x": "3"\n  }\n}';
  const found = findDuplicateKeys(planted);
  assert.equal(found.length, 1, `expected exactly one duplicate, got ${JSON.stringify(found)}`);
  assert.match(found[0], /a\.x/, `expected the path a.x, got ${found[0]}`);
});

test("negative control: braces and colons inside values do not desync scope tracking", () => {
  // A naive scanner would treat these as structure and mis-scope the key set,
  // producing false positives that would get the gate disabled.
  const tricky =
    '{\n  "a": "a value with { and } and : inside",\n  "b": "another \\" escaped quote",\n  "c": { "d": "1" }\n}';
  assert.deepEqual(findDuplicateKeys(tricky), []);
});
