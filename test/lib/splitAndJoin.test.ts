import { describe, expect, it } from 'vitest';
import { splitAndJoin } from '@/lib/splitAndJoin';

const makeItems = (count: number) => Array.from({ length: count }, (_, index) => `item${index}`);

describe('splitAndJoin', () => {
    it('默认按 500 个一组分割', () => {
        const items = makeItems(501);
        const result = splitAndJoin(items);

        expect(result).toHaveLength(2);
        expect(result).toEqual([items.slice(0, 500).join('|'), 'item500']);
    });

    it('整除边界不产生空分组', () => {
        const items = makeItems(1000);
        const result = splitAndJoin(items);

        expect(result).toHaveLength(2);
        expect(result).toEqual([items.slice(0, 500).join('|'), items.slice(500).join('|')]);
    });

    it('按指定大小分组并将空格替换为下划线', () => {
        expect(splitAndJoin(['hello world', 'foo bar', 'baz'], 2)).toEqual([
            'hello_world|foo_bar',
            'baz',
        ]);
    });

    it('非字符串元素用 String() 强转', () => {
        expect(splitAndJoin([1, null, true], 3)).toEqual(['1|null|true']);
    });

    it('空数组返回空数组', () => {
        expect(splitAndJoin([])).toEqual([]);
    });

    it('块大小为 1 时每个元素单独成组', () => {
        expect(splitAndJoin(['a b', 'c'], 1)).toEqual(['a_b', 'c']);
    });
});
