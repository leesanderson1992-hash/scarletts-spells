import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";

import ts from "typescript";

type LoaderOptions = {
  stubModules: Record<string, unknown>;
  globals?: Record<string, unknown>;
};

function resolveLocalModule(fromFile: string, specifier: string) {
  const basePath = path.resolve(path.dirname(fromFile), specifier);
  const candidates = [
    basePath,
    `${basePath}.ts`,
    `${basePath}.tsx`,
    path.join(basePath, "index.ts"),
    path.join(basePath, "index.tsx"),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(`Unable to resolve local module ${specifier} from ${fromFile}`);
}

export function loadTsModule<TModule = Record<string, unknown>>(
  entryPath: string,
  options: LoaderOptions,
): TModule {
  const moduleCache = new Map<string, Record<string, unknown>>();

  function loadModule(modulePath: string): Record<string, unknown> {
    const cached = moduleCache.get(modulePath);
    if (cached) {
      return cached;
    }

    const source = readFileSync(modulePath, "utf8");
    const transpiled = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
      fileName: modulePath,
    }).outputText;

    const module = { exports: {} as Record<string, unknown> };
    moduleCache.set(modulePath, module.exports);

    const context = vm.createContext({
      module,
      exports: module.exports,
      require(specifier: string) {
        if (specifier in options.stubModules) {
          return options.stubModules[specifier];
        }

        if (specifier.startsWith(".")) {
          return loadModule(resolveLocalModule(modulePath, specifier));
        }

        if (
          specifier ===
          "@/lib/writing-engine/persistence/returned-correction-route-bridge"
        ) {
          return loadModule(
            path.resolve(
              process.cwd(),
              "lib/writing-engine/persistence/returned-correction-route-bridge.ts",
            ),
          );
        }

        throw new Error(`Missing stub module for ${specifier}`);
      },
      __dirname: path.dirname(modulePath),
      __filename: modulePath,
      console,
      process,
      FormData,
      URLSearchParams,
      setTimeout,
      clearTimeout,
      ...options.globals,
    });

    vm.runInContext(transpiled, context, { filename: modulePath });
    moduleCache.set(modulePath, module.exports);

    return module.exports;
  }

  return loadModule(entryPath) as TModule;
}
