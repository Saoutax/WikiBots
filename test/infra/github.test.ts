import { afterEach, describe, expect, it, vi } from 'vitest';
import { readGHFile, writeGHFile } from '@/infra/github';

const mocks = vi.hoisted(() => {
    const getContent = vi.fn();
    const createOrUpdateFileContents = vi.fn();
    class MockOctokit {
        rest = { repos: { getContent, createOrUpdateFileContents } };
    }
    return { getContent, createOrUpdateFileContents, MockOctokit };
});

vi.mock('octokit', () => ({ Octokit: mocks.MockOctokit }));

const encode = (text: string) => Buffer.from(text, 'utf-8').toString('base64');

describe('readGHFile', () => {
    it('读取 file 类型响应并解码 base64', async () => {
        const content = '简体中文内容\n第二行';
        mocks.getContent.mockResolvedValue({
            data: { type: 'file', content: encode(content), sha: 'sha-1' },
        });

        await expect(readGHFile('data/time.yaml')).resolves.toEqual({ content, sha: 'sha-1' });
        expect(mocks.getContent).toHaveBeenCalledWith({
            owner: 'Saoutax',
            repo: 'WikiBots',
            path: 'data/time.yaml',
        });
    });

    it('目录列表响应抛错并输出 console.error', async () => {
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        mocks.getContent.mockResolvedValue({ data: [] });

        await expect(readGHFile('some/dir')).rejects.toThrow('Path "some/dir" is not a file.');
        expect(consoleError).toHaveBeenCalled();
    });

    it('非 file 类型响应抛错', async () => {
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        mocks.getContent.mockResolvedValue({ data: { type: 'dir', sha: 'sha-2' } });

        await expect(readGHFile('some/dir')).rejects.toThrow('is not a file');
        expect(consoleError).toHaveBeenCalled();
    });

    it('底层错误原样透传并输出 console.error', async () => {
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const error = new Error('network down');
        mocks.getContent.mockRejectedValue(error);

        await expect(readGHFile('data/time.yaml')).rejects.toBe(error);
        expect(consoleError).toHaveBeenCalledWith(error);
    });
});

describe('writeGHFile', () => {
    it('省略 sha 时提交且不携带 sha 字段', async () => {
        const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => undefined);
        mocks.createOrUpdateFileContents.mockResolvedValue({});

        await writeGHFile('data/time.yaml', '新内容', 'chore: update time');

        expect(mocks.createOrUpdateFileContents).toHaveBeenCalledWith({
            owner: 'Saoutax',
            repo: 'WikiBots',
            path: 'data/time.yaml',
            message: 'chore: update time',
            content: encode('新内容'),
        });
        expect(consoleLog).toHaveBeenCalledWith('Update success.');
    });

    it('携带 sha 时透传', async () => {
        vi.spyOn(console, 'log').mockImplementation(() => undefined);
        mocks.createOrUpdateFileContents.mockResolvedValue({});

        await writeGHFile('data/time.yaml', '新内容', 'chore: update time', 'sha-1');

        expect(mocks.createOrUpdateFileContents).toHaveBeenCalledWith({
            owner: 'Saoutax',
            repo: 'WikiBots',
            path: 'data/time.yaml',
            message: 'chore: update time',
            content: encode('新内容'),
            sha: 'sha-1',
        });
    });

    it('写入失败透传错误并输出 console.error', async () => {
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => undefined);
        const error = new Error('forbidden');
        mocks.createOrUpdateFileContents.mockRejectedValue(error);

        await expect(writeGHFile('path', 'content', 'message')).rejects.toBe(error);
        expect(consoleError).toHaveBeenCalledWith(error);
        expect(consoleLog).not.toHaveBeenCalled();
    });
});

afterEach(() => {
    vi.restoreAllMocks();
});
