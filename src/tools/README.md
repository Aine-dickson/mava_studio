# Mava tooling

## Declaration generator

The script `generate-mava-dts.ts` produces the ambient typings that power the Monaco editor completions for user scripts. It compiles the shared runtime type definitions in `Terminal/runtime/mava.types.ts` and writes the generated output to `Terminal/mava.api.d.ts`.

### Usage

Regenerate the declarations whenever the runtime API changes:

```bash
bun tools/generate-mava-dts.ts
```

The script runs TypeScript in declaration-only mode, strips module syntax, and emits comments explaining how the file was produced. It expects the Workspace-level dependencies (TypeScript and friends) that already live in the main project; no extra `package.json` is needed inside `src/`. Never edit `Terminal/mava.api.d.ts` by hand—update `mava.types.ts` instead.
