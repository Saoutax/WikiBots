import { describe, expect, it } from 'vitest';
import { normalizeHeadingSpacing } from '@/wikitext/normalizeHeadingSpacing';

describe('normalizeHeadingSpacing', () => {
    it('二级标题前保留且仅保留一个空行', () => {
        expect(normalizeHeadingSpacing('前言\n\n\n== 甲 ==\n内容\n== 乙 ==\n')).toBe(
            '前言\n\n== 甲 ==\n内容\n\n== 乙 ==\n',
        );
    });

    it('首个二级标题位于开头时不添加空行', () => {
        expect(normalizeHeadingSpacing('== 甲 ==\n内容')).toBe('== 甲 ==\n内容');
    });

    it('没有二级标题时原样返回', () => {
        expect(normalizeHeadingSpacing('只有正文\n')).toBe('只有正文\n');
    });
});
