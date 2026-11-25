import { describe, expect, it } from 'vitest';
import {
    extractTemplateStyles,
    hasTemplateStylesMarker,
    markTemplateStylesDoc,
    markTemplateStylesPage,
} from '@/bot/modules/templateStyles';

describe('extractTemplateStyles', () => {
    it('提取 includeonly 中的样式', () => {
        expect(
            extractTemplateStyles(
                '<includeonly><templatestyles src="A/styles.css" /></includeonly>',
            ),
        ).toEqual(['A/styles.css']);
    });

    it('提取正文与 noinclude 中的样式并去重', () => {
        const text =
            '<templatestyles src="A.css" /><templatestyles src="A.css" /><noinclude><templatestyles src="B.css" /></noinclude>';

        expect(extractTemplateStyles(text)).toEqual(['A.css', 'B.css']);
    });

    it('忽略注释、nowiki 与没有 src 的标签', () => {
        const text =
            '<!-- <templatestyles src="X.css" /> --><nowiki><templatestyles src="Y.css" /></nowiki><templatestyles />';

        expect(extractTemplateStyles(text)).toEqual([]);
    });

    it('去掉样式名首尾空白', () => {
        expect(extractTemplateStyles('<templatestyles src=" A.css " />')).toEqual(['A.css']);
    });
});

describe('hasTemplateStylesMarker', () => {
    it.each([
        '{{TemplateStyles|A.css}}',
        '{{templatestyles|A.css}}',
        '{{CSS|A.css}}',
        '{{模板样式|A.css}}',
        '{{模板样式表|A.css}}',
    ])('识别标记 %s', text => {
        expect(hasTemplateStylesMarker(text)).toBe(true);
    });

    it('识别 includeonly 中的标记', () => {
        expect(hasTemplateStylesMarker('<includeonly>{{TemplateStyles|A.css}}</includeonly>')).toBe(
            true,
        );
    });

    it('不把链接模板、注释和 nowiki 当作标记', () => {
        expect(hasTemplateStylesMarker('{{tl|TemplateStyles}}')).toBe(false);
        expect(hasTemplateStylesMarker('<!-- {{TemplateStyles|A.css}} -->')).toBe(false);
        expect(hasTemplateStylesMarker('<nowiki>{{TemplateStyles|A.css}}</nowiki>')).toBe(false);
    });
});

describe('markTemplateStylesDoc', () => {
    it('在文档开头插入标记', () => {
        expect(markTemplateStylesDoc('文档内容', ['A.css', 'B.css'])).toBe(
            '{{TemplateStyles|A.css|B.css}}\n文档内容',
        );
    });

    it('已有标记时原样返回', () => {
        const doc = '{{CSS|A.css}}\n文档内容';

        expect(markTemplateStylesDoc(doc, ['B.css'])).toBe(doc);
    });

    it('没有样式时原样返回', () => {
        expect(markTemplateStylesDoc('文档', [])).toBe('文档');
    });
});

describe('markTemplateStylesPage', () => {
    it('插入第一个 noinclude 的开头', () => {
        expect(
            markTemplateStylesPage(
                '<includeonly>正文</includeonly><noinclude>{{doc}}</noinclude>',
                ['A.css'],
            ),
        ).toBe(
            '<includeonly>正文</includeonly><noinclude>{{TemplateStyles|A.css}}\n{{doc}}</noinclude>',
        );
    });

    it('noinclude 后已有换行时不重复换行', () => {
        expect(markTemplateStylesPage('<noinclude>\n说明</noinclude>', ['A.css'])).toBe(
            '<noinclude>{{TemplateStyles|A.css}}\n说明</noinclude>',
        );
    });

    it('没有 noinclude 时在末尾补充', () => {
        expect(markTemplateStylesPage('正文\n', ['A.css'])).toBe(
            '正文\n<noinclude>{{TemplateStyles|A.css}}</noinclude>\n',
        );
    });

    it('没有结尾换行时在末尾补充', () => {
        expect(markTemplateStylesPage('正文', ['A.css'])).toBe(
            '正文\n<noinclude>{{TemplateStyles|A.css}}</noinclude>\n',
        );
    });

    it('忽略注释中的 noinclude', () => {
        expect(
            markTemplateStylesPage('<!-- <noinclude> --><noinclude>正文</noinclude>', ['A.css']),
        ).toBe('<!-- <noinclude> --><noinclude>{{TemplateStyles|A.css}}\n正文</noinclude>');
    });

    it('已有标记时原样返回', () => {
        const page = '<noinclude>{{TemplateStyles|A.css}}</noinclude>';

        expect(markTemplateStylesPage(page, ['B.css'])).toBe(page);
    });
});
