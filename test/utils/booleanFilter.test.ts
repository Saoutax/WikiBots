import { describe, expect, it } from 'vitest';
import { booleanFilter } from '@/utils/booleanFilter';

describe('booleanFilter', () => {
    it('按键序保留顺序分组', () => {
        const result = booleanFilter({
            active: true,
            deleted: false,
            verified: true,
            archived: false,
        });

        expect(result.isTrue).toEqual(['active', 'verified']);
        expect(result.isFalse).toEqual(['deleted', 'archived']);
    });

    it('空对象返回两个空数组', () => {
        expect(booleanFilter({})).toEqual({ isTrue: [], isFalse: [] });
    });

    it('全部为 true 时 isFalse 为空', () => {
        const result = booleanFilter({ a: true, b: true, c: true });

        expect(result.isTrue).toEqual(['a', 'b', 'c']);
        expect(result.isFalse).toEqual([]);
    });

    it('全部为 false 时 isTrue 为空', () => {
        const result = booleanFilter({ a: false, b: false, c: false });

        expect(result.isTrue).toEqual([]);
        expect(result.isFalse).toEqual(['a', 'b', 'c']);
    });
});
