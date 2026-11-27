import { describe, expect, it } from 'vitest';
import { extractChineseDate } from '@/wikitext/extractChineseDate';

describe('extractChineseDate', () => {
    it('从句子中提取第一处中文日期', () => {
        expect(
            extractChineseDate(
                '评选期：2026年8月19日 (三) 20:31（CST）至2026年9月16日 (三) 20:31（CST）',
            ),
        ).toBe('2026-08-19');
    });

    it('月份与日期补零', () => {
        expect(extractChineseDate('2026年9月3日')).toBe('2026-09-03');
    });

    it('没有中文日期时返回 undefined', () => {
        expect(extractChineseDate('2026-09-03')).toBeUndefined();
    });

    it('年份不足四位时返回 undefined', () => {
        expect(extractChineseDate('26年9月3日')).toBeUndefined();
    });
});
