// Final formatting pass for emitted source. Runs Prettier so downloaded /
// displayed code is consistently and idiomatically formatted (the "presentable"
// finish). Uses Prettier's STANDALONE build + explicit plugins so it works in the
// browser (the editor / Storybook) as well as in Node. Best-effort: a Prettier
// failure returns the unformatted source rather than breaking artifact delivery.
// Prettier is a legitimate codegen dependency, so this stays inside the
// extractable `codegen/` boundary (the lint rule permits bare `prettier/*`).
import { format } from 'prettier/standalone';
import type { Plugin } from 'prettier';
import * as babel from 'prettier/plugins/babel';
import * as estree from 'prettier/plugins/estree';
import * as typescript from 'prettier/plugins/typescript';

// The plugin namespaces are valid Prettier plugins at runtime, but their
// `import * as` types don't structurally line up with `Plugin` — cast once here.
const plugins = [babel, estree, typescript] as unknown as Plugin[];

/** Prettier-format generated JS/TS source; on any error, return it unformatted. */
async function formatSource(
  source: string,
  language: 'javascript' | 'typescript',
): Promise<string> {
  try {
    return await format(source, {
      parser: language === 'typescript' ? 'typescript' : 'babel',
      plugins,
    });
  } catch {
    return source;
  }
}

export { formatSource };
