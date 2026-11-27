import { describe, expect, it } from 'vitest';
import { formatNamespace } from '@/lib/formatNamespace';

describe('formatNamespace', () => {
    it('空数组返回 *', () => {
        expect(formatNamespace([])).toBe('*');
    });

    it('单个命名空间', () => {
        expect(formatNamespace([0])).toBe('0');
        expect(formatNamespace([4])).toBe('4');
    });

    it('多个命名空间用竖线连接', () => {
        expect(formatNamespace([0, 2, 4])).toBe('0|2|4');
    });

    it('包含 0 时不省略主命名空间', () => {
        expect(formatNamespace([0, 14])).toBe('0|14');
    });
});
