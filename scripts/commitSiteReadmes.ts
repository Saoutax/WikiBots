import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import process from 'node:process';
import { Octokit } from 'octokit';
import { commitReadmes, type ReadmeFile } from './lib/readmeCommit';

const OWNER = 'Saoutax';
const REPO = 'WikiBots';
const COMMIT_MESSAGE = 'chore: auto generate site READMEs';

const isNotFound = (error: unknown) =>
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    (error as { status?: number }).status === 404;

/** 读取本地已生成的站点 README，按站点名排序。 */
const readLocalReadmes = async (): Promise<ReadmeFile[]> => {
    const root = resolve(process.cwd(), 'src/bot');
    const entries = await readdir(root, { withFileTypes: true });
    const files: ReadmeFile[] = [];

    for (const entry of entries
        .filter(item => item.isDirectory())
        .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
        const path = `src/bot/${entry.name}/README.md`;
        try {
            files.push({ path, content: await readFile(resolve(process.cwd(), path), 'utf-8') });
        } catch {
            continue;
        }
    }

    return files;
};

(async () => {
    const token = process.env.GITHUB_TOKEN,
        branch = process.env.GITHUB_REF_NAME;

    if (!token) {
        throw new Error('缺少 GITHUB_TOKEN 环境变量');
    }
    if (!branch) {
        throw new Error('缺少 GITHUB_REF_NAME 环境变量');
    }

    const octokit = new Octokit({ auth: token });
    const client = {
        read: async (path: string) => {
            try {
                const { data } = await octokit.rest.repos.getContent({
                    owner: OWNER,
                    repo: REPO,
                    path,
                    ref: branch,
                });

                if (Array.isArray(data) || data.type !== 'file') {
                    throw new Error(`Path "${path}" is not a file.`);
                }

                return {
                    content: Buffer.from(data.content, 'base64').toString('utf-8'),
                    sha: data.sha,
                };
            } catch (error) {
                if (isNotFound(error)) {
                    return undefined;
                }
                throw error;
            }
        },
        write: async (path: string, content: string, message: string, sha?: string) => {
            await octokit.rest.repos.createOrUpdateFileContents({
                owner: OWNER,
                repo: REPO,
                path,
                branch,
                message,
                content: Buffer.from(content, 'utf-8').toString('base64'),
                ...(sha !== undefined ? { sha } : {}),
            });
        },
    };

    const files = await readLocalReadmes();
    const committed = await commitReadmes(client, files, COMMIT_MESSAGE);

    for (const file of files) {
        console.log(`${committed.includes(file.path) ? '提交' : '无变化'}：${file.path}`);
    }
    console.log(`完成，共提交 ${committed.length} 个文件。`);
})();
