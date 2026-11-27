import { describe, expect, it } from 'vitest';
import { parseListEntries, removeListEntries } from '@/tasks/archiveList';

describe('parseListEntries', () => {
    it('顶级列表行与其缩进回复归为一条提报', () => {
        const content = '* [[Foo]] 理由\n*: 回复内容\n';
        const entries = parseListEntries(content);

        expect(entries).toHaveLength(1);
        expect(entries[0]).toMatchObject({
            text: '* [[Foo]] 理由\n*: 回复内容',
            start: 0,
            end: content.length,
            links: [{ title: 'Foo', ns: 0 }],
        });
    });

    it('多条提报按顺序切分，end 为下一条起点', () => {
        const content = '* [[Foo]]\n*: 回复\n* [[Bar]]\n';
        const entries = parseListEntries(content);

        expect(entries).toHaveLength(2);
        expect(entries[0]?.text).toBe('* [[Foo]]\n*: 回复');
        expect(entries[0]?.start).toBe(0);
        expect(entries[0]?.end).toBe(16);
        expect(entries[0]?.links).toEqual([{ title: 'Foo', ns: 0 }]);
        expect(entries[1]?.text).toBe('* [[Bar]]');
        expect(entries[1]?.start).toBe(16);
        expect(entries[1]?.end).toBe(content.length);
        expect(entries[1]?.links).toEqual([{ title: 'Bar', ns: 0 }]);
    });

    it('收集提报行内的链接（含 File: 命名空间）', () => {
        const content = '* [[Foo]] [[:File:Bar.png]] [[Baz|Qux]] [https://example.com 外部链接]\n';
        const entries = parseListEntries(content);

        expect(entries).toHaveLength(1);
        expect(entries[0]?.links).toEqual([
            { title: 'Foo', ns: 0 },
            { title: 'File:Bar.png', ns: 6 },
            { title: 'Baz', ns: 0 },
        ]);
    });

    it('** 缩进行属于上一条提报，不作为新条目', () => {
        const content = '* [[Foo]]\n** [[Nested]]\n*: 回复\n* [[Bar]]\n';
        const entries = parseListEntries(content);

        expect(entries).toHaveLength(2);
        expect(entries[0]?.text).toBe('* [[Foo]]\n** [[Nested]]\n*: 回复');
        expect(entries[0]?.end).toBe(30);
        expect(entries[0]?.links).toEqual([{ title: 'Foo', ns: 0 }]);
        expect(entries[1]?.text).toBe('* [[Bar]]');
        expect(entries[1]?.start).toBe(30);
    });

    it('注释、空行与缩进文本不截断条目', () => {
        const content = '* [[Foo]]\n<!-- 注释 -->\n\n:缩进文本\n* [[Bar]]\n';
        const entries = parseListEntries(content);

        expect(entries).toHaveLength(2);
        expect(entries[0]?.text).toBe('* [[Foo]]\n<!-- 注释 -->\n\n:缩进文本');
        expect(entries[0]?.end).toBe(29);
        expect(entries[1]?.text).toBe('* [[Bar]]');
    });

    it('非列表内容与空串返回空数组', () => {
        expect(parseListEntries('普通文本\n没有列表\n')).toEqual([]);
        expect(parseListEntries('')).toEqual([]);
    });
});

describe('removeListEntries', () => {
    const content = '前言\n* [[A]]\n*: 回复 A\n* [[B]]\n*: 回复 B\n* [[C]]\n尾注\n';
    const entries = parseListEntries(content);

    it('删除首尾两条提报并保留其余原文与换行', () => {
        expect(removeListEntries(content, [entries[0]!, entries[2]!])).toBe(
            '前言\n* [[B]]\n*: 回复 B\n\n尾注\n',
        );
    });

    it('删除中间条目时保留前后文本', () => {
        expect(removeListEntries(content, [entries[1]!])).toBe(
            '前言\n* [[A]]\n*: 回复 A\n* [[C]]\n尾注\n',
        );
    });

    it('删除全部条目后只留下前言与尾注', () => {
        expect(removeListEntries(content, entries)).toBe('前言\n\n尾注\n');
    });

    it('空数组原样返回', () => {
        expect(removeListEntries(content, [])).toBe(content);
    });

    it('完整页面：删除到期条目前的页面内容可还原为“讨论页剩余 + 存档条目”', () => {
        const before = '页面说明。\n\n* [[A]] 理由\n*: 回复 A\n* [[B]] 理由\n\n尾注。\n';
        const parsed = parseListEntries(before);

        // 讨论页在移除到期条目前的完整内容 → 移除后的完整内容
        const discussionAfter = removeListEntries(before, parsed);
        expect(discussionAfter).toBe('页面说明。\n\n\n\n尾注。\n');

        // archiveList 写入存档页的条目（按 \n 拼接并 trimEnd）
        const archive = parsed
            .map(entry => entry.text)
            .join('\n')
            .trimEnd();
        expect(archive).toBe('* [[A]] 理由\n*: 回复 A\n* [[B]] 理由');

        // 存档页（新建时）的完整内容 = {{talkarchive}} + 空行 + 归档条目
        expect(`{{talkarchive}}\n\n${archive}`).toBe(
            '{{talkarchive}}\n\n* [[A]] 理由\n*: 回复 A\n* [[B]] 理由',
        );
    });
});
