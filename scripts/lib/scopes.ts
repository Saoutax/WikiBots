// Directories under src/ that keep lowercase prefix as-is
const LOWERCASE_SRC_DIRS = new Set(['lib', 'utils', 'api']);

// Directories under src/bot/ that keep lowercase prefix
const LOWERCASE_BOT_DIRS = new Set(['modules']);

/**
 * Resolves the scope prefix for a given path expressed as directory segments relative to src/.
 * Note: segments contains only directories, not the filename itself.
 *
 * Rules:
 *  - src/lib/, src/utils/, src/api/  → lowercase  (e.g. "lib/getJson")
 *  - src/bot/modules/                → lowercase  (e.g. "modules/cleanSandbox")
 *  - src/bot/<other>/                → UPPERCASE  (e.g. "MGP/monthly")
 */
const resolvePrefix = (segments: string[]): string | null => {
    const topDir = segments[0];

    if (topDir === undefined) {
        return null;
    }

    if (LOWERCASE_SRC_DIRS.has(topDir)) {
        // Only direct children: segments must be exactly [dirName]
        return segments.length === 1 ? topDir : null;
    }

    if (topDir === 'bot') {
        const botSubDir = segments[1];
        // Only one level under bot: segments must be exactly ['bot', subDir]
        if (botSubDir === undefined || segments.length !== 2) {
            return null;
        }
        return LOWERCASE_BOT_DIRS.has(botSubDir) ? botSubDir : botSubDir.toUpperCase();
    }

    return null;
};

/**
 * Returns true for plain .ts source files.
 * Excludes .d.ts declaration files and all other extensions.
 */
const isSourceFile = (filename: string): boolean =>
    filename.endsWith('.ts') && !filename.endsWith('.d.ts');

/**
 * Returns true when the generated scopes differ from the currently configured ones.
 * A non-array value in settings.json is treated as changed.
 */
const scopesChanged = (oldScopes: string[], newScopes: string[]): boolean => {
    if (!Array.isArray(oldScopes)) {
        return true;
    }
    if (oldScopes.length !== newScopes.length) {
        return true;
    }
    return oldScopes.some((scope, i) => scope !== newScopes[i]);
};

export { resolvePrefix, isSourceFile, scopesChanged };
