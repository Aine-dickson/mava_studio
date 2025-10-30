#!/usr/bin/env bun

/**
 * save-svg-to-txt.ts
 *
 * Usage:
 *   bun run save-svg-to-txt.ts <source> [output-file]
 *
 * <source> can be:
 *   - a http/https URL (e.g. "https://example.com/image.svg")
 *   - a local file path (e.g. "./icon.svg")
 *   - a single dash "-" to read from stdin
 *
 * [output-file] defaults to "svg-output.txt"
 */

import { readFile } from "fs/promises";
import { writeFile } from "fs/promises";

async function readFromStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", (err) => reject(err));
  });
}

async function main() {
  const [, , source, out = "svg-output.txt"] = process.argv;

  if (!source) {
    console.error("Error: missing <source> argument. See usage in file header.");
    process.exit(2);
  }

  let svgText = "";

  try {
    if (source === "-") {
      // Read raw SVG data from stdin
      svgText = await readFromStdin();
    } else if (/^https?:\/\//i.test(source)) {
      // Fetch from URL
      const res = await fetch(source);
      if (!res.ok) {
        throw new Error(`Failed to fetch ${source}: ${res.status} ${res.statusText}`);
      }
      svgText = await res.text();
    } else {
      // Read local file
      const buf = await readFile(source);
      svgText = buf.toString("utf8");
    }

    // Optional: you could validate that it looks like SVG, but we just write raw data as requested.
    await writeFile(out, svgText, "utf8");
    console.log(`Saved ${svgText.length} bytes to ${out}`);
  } catch (err: any) {
    console.error("Error:", err.message ?? err);
    process.exit(1);
  }
}

await main();
