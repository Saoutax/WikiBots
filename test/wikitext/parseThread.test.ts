import { describe, expect, it } from 'vitest';
import { parseThread, parsedToString } from '@/wikitext/parseThread';

const multiLevelText = [
    '== 甲 ==',
    '正文甲 2024年1月1日 (星期一) 12:00 (UTC)',
    '=== 甲一 ===',
    '正文甲一 2024年2月1日 08:00 (CST)',
    '== 乙 ==',
    '正文乙',
    '',
].join('\n');

describe('parseThread', () => {
    it('切分多个一级章节', () => {
        const result = parseThread(multiLevelText);

        expect(result.preface).toBe('');
        expect(result.sections.map(section => section.title)).toEqual(['甲', '乙']);
        expect(result.sections).toHaveLength(2);
    });

    it('子标题归属到所属一级章节 content', () => {
        const result = parseThread(multiLevelText);
        const first = result.sections[0]!;

        expect(first.content).toBe(
            '\n正文甲 2024年1月1日 (星期一) 12:00 (UTC)\n' +
                '=== 甲一 ===\n正文甲一 2024年2月1日 08:00 (CST)\n',
        );
        expect(first.thread).toBe('== 甲 ==' + first.content);
        expect(result.sections[1]?.content).toBe('\n正文乙\n');
        expect(result.sections[1]?.thread).toBe('== 乙 ==\n正文乙\n');
    });

    it('取最小标题层级作为切分依据', () => {
        const text = [
            '=== 先出现的三级 ===',
            '三级正文',
            '== 一级章节甲 ==',
            '甲正文',
            '==== 四级 ====',
            '四级正文',
            '== 一级章节乙 ==',
            '乙正文',
            '',
        ].join('\n');
        const result = parseThread(text);

        expect(result.preface).toBe('=== 先出现的三级 ===\n三级正文\n');
        expect(result.sections.map(section => section.title)).toEqual(['一级章节甲', '一级章节乙']);
        expect(result.sections[0]?.content).toContain('==== 四级 ====');
    });

    it('时间戳取章节正文内最新（含子标题正文）', () => {
        const text = [
            '== 章节 ==',
            '早 2024年1月1日 12:00 (CST)',
            '晚 2024年6月1日 18:00 (CST)',
            '=== 子 ===',
            '更晚 2024年12月31日 23:00 (UTC)',
            '',
        ].join('\n');
        const result = parseThread(text);

        expect(result.sections[0]?.timestamp?.toISOString()).toBe('2024-12-31T23:00:00.000Z');
    });

    it('parsedToString 往返等于原文', () => {
        expect(parsedToString(parseThread(multiLevelText))).toBe(multiLevelText);
    });

    it('空串返回空前言与空章节', () => {
        expect(parseThread('')).toEqual({ preface: '', sections: [] });
    });

    it('只有前言时 sections 为空', () => {
        const text = '只有前言\n没有标题\n';

        expect(parseThread(text)).toEqual({ preface: text, sections: [] });
    });
});
