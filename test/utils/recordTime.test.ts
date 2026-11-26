import { load } from 'js-yaml';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getTimeData, updateTimeData } from '@/utils/recordTime';

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

const stubTimeYaml = (yamlText: string, sha = 'sha-1') => {
    mocks.getContent.mockResolvedValue({
        data: { type: 'file', content: encode(yamlText), sha },
    });
};

interface WriteArgs {
    owner: string;
    repo: string;
    path: string;
    message: string;
    content: string;
    sha?: string;
}

describe('getTimeData', () => {
    it('读取已有任务记录', async () => {
        stubTimeYaml("lastRun: '2024-01-01'\nother: 'x'\n");

        await expect(getTimeData('lastRun')).resolves.toBe('2024-01-01');
    });

    it('未知任务返回 undefined', async () => {
        stubTimeYaml("lastRun: '2024-01-01'\n");

        await expect(getTimeData('missing')).resolves.toBeUndefined();
    });

    it('空 YAML 文件安全返回 undefined', async () => {
        stubTimeYaml('');

        await expect(getTimeData('anyTask')).resolves.toBeUndefined();
    });
});

describe('updateTimeData', () => {
    it('合并新记录、保留其他键并透传提交信息与 sha', async () => {
        const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => undefined);
        stubTimeYaml("lastRun: '2024-01-01'\nother: 'x'\n", 'sha-9');
        mocks.createOrUpdateFileContents.mockResolvedValue({});

        await updateTimeData('newTask', '2024-02-02 10:00');

        expect(mocks.createOrUpdateFileContents).toHaveBeenCalledTimes(1);
        const args = mocks.createOrUpdateFileContents.mock.lastCall?.[0] as WriteArgs;

        expect(args.owner).toBe('Saoutax');
        expect(args.repo).toBe('WikiBots');
        expect(args.path).toBe('data/time.yaml');
        expect(args.message).toBe('chore: auto record last run time of newTask');
        expect(args.sha).toBe('sha-9');
        expect(load(Buffer.from(args.content, 'base64').toString('utf-8'))).toEqual({
            lastRun: '2024-01-01',
            other: 'x',
            newTask: '2024-02-02 10:00',
        });
        expect(consoleLog).toHaveBeenCalledWith('Update success.');
    });
});

afterEach(() => {
    vi.restoreAllMocks();
});
