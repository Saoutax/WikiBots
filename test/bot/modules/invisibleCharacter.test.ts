import { describe, it, expect } from 'vitest';
import { stripInvisible } from '@/bot/modules/invisibleCharacter';

describe('stripInvisible', () => {
    describe('页首 BOM', () => {
        it('移除文首 BOM 并记入 removed', () => {
            const { text, removed, kept } = stripInvisible('\uFEFFabc');

            expect(text).toBe('abc');
            expect(removed.get('U+FEFF')).toBe(1);
            expect(kept.size).toBe(0);
        });

        it('正文中的 BOM 原样保留并记入 kept', () => {
            const { text, removed, kept } = stripInvisible('a\uFEFFb');

            expect(text).toBe('a\uFEFFb');
            expect(removed.size).toBe(0);
            expect(kept.get('U+FEFF 零宽不换行空格')).toBe(1);
        });
    });

    describe('零宽空格', () => {
        it('删除普通上下文中的零宽空格', () => {
            const { text, removed, kept } = stripInvisible('a\u200Bb');

            expect(text).toBe('ab');
            expect(removed.get('U+200B')).toBe(1);
            expect(kept.size).toBe(0);
        });

        it('保留标记内部的零宽空格', () => {
            const source = '{\u200B{';
            const { text, removed } = stripInvisible(source);

            expect(text).toBe(source);
            expect(removed.size).toBe(0);
        });

        it('保留行首用于阻断标题语法的零宽空格', () => {
            const source = '\u200B== 标题 ==';
            const { text, removed } = stripInvisible(source);

            expect(text).toBe(source);
            expect(removed.size).toBe(0);
        });
    });

    describe('字面量标签与注释保护', () => {
        it.each([
            ['nowiki', '<nowiki>\u200B</nowiki>'],
            ['pre', '<pre>a\u200Bb</pre>'],
            ['注释', '<!-- \u200B -->'],
            ['未闭合的 pre', '<pre>a\u200Bb'],
        ])('原样保留 %s 中的零宽空格', (_case, source) => {
            const { text, removed } = stripInvisible(source);

            expect(text).toBe(source);
            expect(removed.size).toBe(0);
        });
    });

    describe('承载语义的敏感码位', () => {
        it('保留码位并在 kept 中标注名称', () => {
            const source = 'a\u200Eb\u3164c';
            const { text, removed, kept } = stripInvisible(source);

            expect(text).toBe(source);
            expect(removed.size).toBe(0);
            expect(kept.get('U+200E 从左到右标记')).toBe(1);
            expect(kept.get('U+3164 谚文填充符')).toBe(1);
            expect(kept.size).toBe(2);
        });
    });
});
