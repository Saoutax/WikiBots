import { describe, it, expect, vi } from 'vitest';
import { collectRecentChanges } from '@/bot/modules/recentChanges';
import { createApiStub, type ApiStub } from '../../helpers/api';

interface Change {
    title: string;
}

const paramsAt = (stub: ApiStub, index: number): Record<string, unknown> =>
    stub.post.mock.calls[index]?.[0] as Record<string, unknown>;

describe('collectRecentChanges', () => {
    it('按 rccontinue 分页收集，直到响应不再返回 continue', async () => {
        const stub = createApiStub();
        stub.post
            .mockResolvedValueOnce({
                data: {
                    query: { recentchanges: [{ title: 'A' }] },
                    continue: { rccontinue: '20260101000000|42' },
                },
            })
            .mockResolvedValueOnce({ data: { query: { recentchanges: [{ title: 'B' }] } } });
        const batches: Change[][] = [];
        const collect = (list: Change[]) => {
            batches.push(list);
        };

        await collectRecentChanges<Change>(stub.api, { rcnamespace: '0' }, collect);

        expect(batches).toEqual([[{ title: 'A' }], [{ title: 'B' }]]);
        expect(stub.post).toHaveBeenCalledTimes(2);
        expect(paramsAt(stub, 0)['rccontinue']).toBeUndefined();
        expect(paramsAt(stub, 1)['rccontinue']).toBe('20260101000000|42');
    });

    it('首页为空列表时提前终止且不调用 collect', async () => {
        const stub = createApiStub();
        stub.post.mockResolvedValue({ data: { query: { recentchanges: [] } } });
        const collect = vi.fn();

        await collectRecentChanges<Change>(stub.api, {}, collect);

        expect(collect).not.toHaveBeenCalled();
        expect(stub.post).toHaveBeenCalledTimes(1);
    });

    it('响应没有 continue 时只请求一次', async () => {
        const stub = createApiStub();
        stub.post.mockResolvedValue({ data: { query: { recentchanges: [{ title: 'A' }] } } });
        const collect = vi.fn();

        await collectRecentChanges<Change>(stub.api, {}, collect);

        expect(collect).toHaveBeenCalledTimes(1);
        expect(collect).toHaveBeenCalledWith([{ title: 'A' }]);
        expect(stub.post).toHaveBeenCalledTimes(1);
    });

    it('透传参数并把 list 固定为 recentchanges', async () => {
        const stub = createApiStub();
        stub.post.mockResolvedValue({ data: { query: { recentchanges: [] } } });

        await collectRecentChanges<Change>(
            stub.api,
            { rcnamespace: '0|1', rcprop: 'title|ids', rclimit: 'max' },
            vi.fn(),
        );

        expect(stub.post).toHaveBeenCalledWith({
            list: 'recentchanges',
            rcnamespace: '0|1',
            rcprop: 'title|ids',
            rclimit: 'max',
            rccontinue: undefined,
        });
    });
});
