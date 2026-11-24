import { describe, expect, it } from 'vitest';
import { commitReadmes } from '../../scripts/lib/readmeCommit';
import type { ReadmeClient, RemoteFile } from '../../scripts/lib/readmeCommit';

interface WrittenFile {
    path: string;
    content: string;
    message: string;
    sha?: string;
}

const createClient = (remote: Record<string, RemoteFile>) => {
    const writes: WrittenFile[] = [];

    const client: ReadmeClient = {
        read: async path => remote[path],
        write: async (path, content, message, sha) => {
            writes.push({ path, content, message, ...(sha !== undefined ? { sha } : {}) });
        },
    };

    return { client, writes };
};

const file = (path: string, content: string) => ({ path, content });

describe('commitReadmes', () => {
    it('内容不同的文件带 sha 提交', async () => {
        const { client, writes } = createClient({
            'src/bot/mgp/README.md': { content: '旧内容', sha: 'sha-mgp' },
        });

        await expect(
            commitReadmes(client, [file('src/bot/mgp/README.md', '新内容')], '提交信息'),
        ).resolves.toEqual(['src/bot/mgp/README.md']);
        expect(writes).toEqual([
            {
                path: 'src/bot/mgp/README.md',
                content: '新内容',
                message: '提交信息',
                sha: 'sha-mgp',
            },
        ]);
    });

    it('新增文件不携带 sha', async () => {
        const { client, writes } = createClient({});

        await expect(
            commitReadmes(client, [file('src/bot/new/README.md', '内容\n')], '提交信息'),
        ).resolves.toEqual(['src/bot/new/README.md']);
        expect(writes).toEqual([
            { path: 'src/bot/new/README.md', content: '内容\n', message: '提交信息' },
        ]);
    });

    it('内容相同的文件跳过', async () => {
        const content = '| 任务 | 时间 | 内容 |\n';
        const { client, writes } = createClient({
            'src/bot/qw/README.md': { content, sha: 'sha-qw' },
        });

        await expect(
            commitReadmes(client, [file('src/bot/qw/README.md', content)], '提交信息'),
        ).resolves.toEqual([]);
        expect(writes).toEqual([]);
    });

    it('末尾换行不同的内容视为有变化', async () => {
        const { client, writes } = createClient({
            'src/bot/qw/README.md': { content: '内容\n', sha: 'sha-qw' },
        });

        await expect(
            commitReadmes(client, [file('src/bot/qw/README.md', '内容')], '提交信息'),
        ).resolves.toEqual(['src/bot/qw/README.md']);
        expect(writes).toHaveLength(1);
    });

    it('按传入顺序返回已提交的路径', async () => {
        const { client } = createClient({});

        await expect(
            commitReadmes(
                client,
                [file('src/bot/vjp/README.md', 'a'), file('src/bot/elaina/README.md', 'b')],
                '提交信息',
            ),
        ).resolves.toEqual(['src/bot/vjp/README.md', 'src/bot/elaina/README.md']);
    });

    it('读取失败时向上抛出', async () => {
        const error = new Error('network down');
        const client: ReadmeClient = {
            read: async () => {
                throw error;
            },
            write: async () => undefined,
        };

        await expect(commitReadmes(client, [file('path', 'content')], '提交信息')).rejects.toBe(
            error,
        );
    });

    it('写入失败时向上抛出', async () => {
        const error = new Error('forbidden');
        const client: ReadmeClient = {
            read: async () => undefined,
            write: async () => {
                throw error;
            },
        };

        await expect(commitReadmes(client, [file('path', 'content')], '提交信息')).rejects.toBe(
            error,
        );
    });
});
