import { describe, expect, it } from 'vitest';
import { variantConverter } from '@/wikitext/variantConverter';

describe('variantConverter', () => {
    it('返回简繁变体且保持顺序与去重', () => {
        expect(variantConverter('简体中文测试 裏')).toEqual([
            '简体中文测试 里',
            '簡體中文測試 裡',
            '簡體中文測試 裏',
            '简体中文测试 裏',
        ]);
    });

    it('全简体输入时集合去重', () => {
        const result = variantConverter('简体中文测试');

        expect(result).toEqual(['简体中文测试', '簡體中文測試']);
        expect(new Set(result).size).toBe(result.length);
    });
});
