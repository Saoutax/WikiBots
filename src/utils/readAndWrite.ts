import { Buffer } from 'buffer';
import process from 'node:process';
import { Octokit } from 'octokit';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const octokit = new Octokit({
    auth: process.env.GITHUB_TOKEN,
});

const owner = 'Saoutax',
    repo = 'WikiBots';

/**
 * 从 Github 仓库获取文件
 *
 * @param path 文件路径
 * @returns 内容及其 SHA
 */
const readFile = async (path: string) => {
    try {
        const { data } = await octokit.rest.repos.getContent({ owner, repo, path });

        if (Array.isArray(data) || data.type !== 'file') {
            throw new Error(`Path "${path}" is not a file.`);
        }

        const content = Buffer.from(data.content, 'base64').toString('utf-8');
        return { content, sha: data.sha };
    } catch (err) {
        console.error(err);
        throw new Error();
    }
};

/**
 * 更新 Github 仓库中文件
 *
 * @param path 文件路径
 * @param content 内容
 * @param message 提交信息
 * @param sha - 文件已存在时需提供，新建文件可省略
 */
const writeFile = async (path: string, content: string, message: string, sha?: string) => {
    try {
        await octokit.rest.repos.createOrUpdateFileContents({
            owner,
            repo,
            path,
            message,
            content: Buffer.from(content, 'utf-8').toString('base64'),
            ...(sha !== undefined && { sha }),
        });
        console.log('Update success.');
    } catch (err) {
        console.error(err);
        throw new Error();
    }
};

export { readFile, writeFile };
