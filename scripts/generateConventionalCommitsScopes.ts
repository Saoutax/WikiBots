import { Buffer } from 'buffer';
import { readFile, readdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import process from 'node:process';
import { Octokit } from 'octokit';

const octokit = new Octokit({
    auth: process.env.GITHUB_TOKEN,
});

const REPO_OWNER = 'Saoutax';
const REPO_NAME = 'WikiBots';

/** Path relative to the repository root - used for both local read and remote commit. */
const SETTINGS_REPO_PATH = '.vscode/settings.json';

/** Absolute path for local filesystem access. */
const SETTINGS_LOCAL_PATH = resolve(process.cwd(), SETTINGS_REPO_PATH);

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
const resolvePrefix = (segments: string[]) => {
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
const isSourceFile = (filename: string) => {
    return filename.endsWith('.ts') && !filename.endsWith('.d.ts');
};

const getScopes = async () => {
    const SRC = resolve(process.cwd(), 'src');
    const scopes: string[] = [];

    async function walk(dir: string, segments: string[]): Promise<void> {
        const entries = await readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
            if (entry.isDirectory()) {
                await walk(join(dir, entry.name), [...segments, entry.name]);
                continue;
            }

            if (!isSourceFile(entry.name)) {
                continue;
            }

            const stem = entry.name.replace(/\.ts$/, '');

            if (stem === 'index') {
                continue;
            }

            const prefix = resolvePrefix(segments);
            if (prefix !== null) {
                scopes.push(`${prefix}/${stem}`);
            }
        }
    }

    await walk(SRC, []);
    return scopes.sort();
};

interface RepoSettings {
    [key: string]: unknown;
    'conventionalCommits.scopes'?: string[];
}

interface LocalData {
    settings: RepoSettings;
}

/**
 * Strips JSONC features (comments, trailing commas) to produce valid JSON.
 */
const stripJsonc = (raw: string) => {
    return raw
        .replace(/\\"|"(?:\\"|[^"])*"|(\/\/[^\n]*|\/\*[\s\S]*?\*\/)/g, (m, c) => (c ? '' : m))
        .replace(/,(\s*[}\]])/g, '$1');
};

/**
 * Reads .vscode/settings.json from the local filesystem.
 */
const readLocalSettings = async (): Promise<LocalData> => {
    const raw = await readFile(SETTINGS_LOCAL_PATH, 'utf-8');

    return {
        settings: JSON.parse(stripJsonc(raw)) as RepoSettings,
    };
};

/**
 * Fetches the current SHA of the remote file, then commits updated settings.
 */
const commitSettings = async (settings: RepoSettings) => {
    const { data } = await octokit.request('GET /repos/{owner}/{repo}/contents/{path}', {
        owner: REPO_OWNER,
        repo: REPO_NAME,
        path: SETTINGS_REPO_PATH,
        ref: 'main',
    });

    if (Array.isArray(data) || data.type !== 'file') {
        throw new Error(`Unexpected response type for ${SETTINGS_REPO_PATH}`);
    }

    const content = Buffer.from(JSON.stringify(settings, null, 4), 'utf-8').toString('base64');

    await octokit.request('PUT /repos/{owner}/{repo}/contents/{path}', {
        owner: REPO_OWNER,
        repo: REPO_NAME,
        path: SETTINGS_REPO_PATH,
        message: 'chore: auto generate conventionalCommits.scopes',
        content,
        sha: data.sha,
        branch: 'main',
    });
};

const scopesChanged = (oldScopes: string[], newScopes: string[]) => {
    if (!Array.isArray(oldScopes)) {
        return true;
    }
    if (oldScopes.length !== newScopes.length) {
        return true;
    }
    return oldScopes.some((scope, i) => scope !== newScopes[i]);
};

(async () => {
    const { settings } = await readLocalSettings();
    const scopes = await getScopes();

    const oldScopes = settings['conventionalCommits.scopes'] as string[];

    if (!scopesChanged(oldScopes, scopes)) {
        console.log('No changes in scopes, skipping commit.');
        return;
    }

    settings['conventionalCommits.scopes'] = scopes;

    await commitSettings(settings);

    console.log('Updated conventionalCommits.scopes and committed.');
})();
