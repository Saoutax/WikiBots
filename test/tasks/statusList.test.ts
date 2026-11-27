import { describe, it, expect } from 'vitest';
import data from '@/config/status_data.json';
import { statusList } from '@/tasks/statusList';

const expected = [
    ...new Set([
        ...data.done.status,
        ...data.nd.status,
        ...data.wd.status,
        ...data.ad.status,
        ...data.rd.status,
    ]),
];

describe('statusList', () => {
    it('与 status_data.json 中 done/nd/wd/ad/rd 的并集去重顺序一致', () => {
        expect(statusList).toEqual(expected);
    });

    it('不含重复元素', () => {
        expect(new Set(statusList).size).toBe(statusList.length);
    });
});
