import { describe, expect, it } from 'vitest';
import {
    extractTemplateStyles,
    findTemplateStylesMarker,
    syncStylePageComment,
    syncTemplateStylesDoc,
    syncTemplateStylesPage,
} from '@/tasks/templateStyles';

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

    it('忽略注释、nowiki、没有 src 或含非法字符的标签', () => {
        const text =
            '<!-- <templatestyles src="X.css" /> --><nowiki><templatestyles src="Y.css" /></nowiki><templatestyles /><templatestyles src="A.css|evil=1" /><templatestyles src="B.css}}" />';

        expect(extractTemplateStyles(text)).toEqual([]);
    });
});

describe('findTemplateStylesMarker', () => {
    it('返回匿名参数与裸标记信息', () => {
        const marker = findTemplateStylesMarker('{{TemplateStyles|A.css|B.css}}');

        expect(marker?.styles).toEqual(['A.css', 'B.css']);
        expect(marker?.bare).toBe(false);
        expect(marker?.index).toBe(0);
    });

    it('识别裸标记', () => {
        expect(findTemplateStylesMarker('{{TemplateStyles}}')?.bare).toBe(true);
    });

    it('识别文档模板 content 中的标记', () => {
        const marker = findTemplateStylesMarker('{{doc|content={{TemplateStyles|A.css}}\n说明}}');

        expect(marker?.styles).toEqual(['A.css']);
    });

    it('不把链接模板、注释和 nowiki 当作标记', () => {
        expect(findTemplateStylesMarker('{{tl|TemplateStyles}}')).toBeUndefined();
        expect(findTemplateStylesMarker('<!-- {{TemplateStyles|A.css}} -->')).toBeUndefined();
        expect(
            findTemplateStylesMarker('<nowiki>{{TemplateStyles|A.css}}</nowiki>'),
        ).toBeUndefined();
    });
});

describe('syncTemplateStylesDoc', () => {
    it('在文档开头插入标记', () => {
        expect(syncTemplateStylesDoc('文档内容', ['A.css', 'B.css'])).toBe(
            '{{TemplateStyles|A.css|B.css}}\n文档内容',
        );
    });

    it('已有标记时同步参数', () => {
        expect(syncTemplateStylesDoc('{{CSS|A.css}}\n文档', ['B.css'])).toBe('{{CSS|B.css}}\n文档');
    });

    it('参数一致时原样返回', () => {
        const doc = '{{TemplateStyles|A.css}}\n文档';

        expect(syncTemplateStylesDoc(doc, ['A.css'])).toBe(doc);
    });

    it('没有样式时移除标记', () => {
        expect(syncTemplateStylesDoc('{{TemplateStyles|A.css}}\n文档', [])).toBe('文档');
    });

    it('没有标记也没有样式时原样返回', () => {
        expect(syncTemplateStylesDoc('文档', [])).toBe('文档');
    });

    it('存在多个标记时保留首个并移除后续多余标记', () => {
        expect(
            syncTemplateStylesDoc('{{TemplateStyles|Old.css}}\n说明\n{{CSS|Stale.css}}\n结尾', [
                'A.css',
            ]),
        ).toBe('{{TemplateStyles|A.css}}\n说明\n结尾');

        expect(
            syncTemplateStylesDoc('{{TemplateStyles|Old.css}}\n说明\n{{CSS|Stale.css}}', []),
        ).toBe('说明\n');
    });
});

describe('syncTemplateStylesPage', () => {
    it('写入 noinclude 内文档模板的 content', () => {
        expect(
            syncTemplateStylesPage('<includeonly>x</includeonly><noinclude>{{doc}}</noinclude>', [
                'A.css',
            ]),
        ).toBe(
            '<includeonly>x</includeonly><noinclude>{{doc|content={{TemplateStyles|A.css}}}}</noinclude>',
        );
    });

    it('文档模板已有 content 时把标记放在内容之前', () => {
        expect(
            syncTemplateStylesPage(
                '<includeonly>x</includeonly><noinclude>\n{{Documentation|content=\n说明}}\n[[Cat]]\n</noinclude>',
                ['B.css'],
            ),
        ).toBe(
            '<includeonly>x</includeonly><noinclude>\n{{Documentation|content={{TemplateStyles|B.css}}\n说明}}\n[[Cat]]\n</noinclude>',
        );
    });

    it('文档模板引用其它页文档时写在 noinclude 开头', () => {
        expect(
            syncTemplateStylesPage(
                '<includeonly>x</includeonly><noinclude>{{doc|Template:Other/doc}}</noinclude>',
                ['D.css'],
            ),
        ).toBe(
            '<includeonly>x</includeonly><noinclude>{{TemplateStyles|D.css}}\n{{doc|Template:Other/doc}}</noinclude>',
        );
    });

    it('没有文档模板时写入 noinclude 开头', () => {
        expect(
            syncTemplateStylesPage('<includeonly>x</includeonly><noinclude>\n说明\n</noinclude>', [
                'A.css',
            ]),
        ).toBe(
            '<includeonly>x</includeonly><noinclude>{{TemplateStyles|A.css}}\n说明\n</noinclude>',
        );
    });

    it('没有 noinclude 时在页尾补充', () => {
        expect(syncTemplateStylesPage('正文', ['A.css'])).toBe(
            '正文\n<noinclude>{{TemplateStyles|A.css}}</noinclude>\n',
        );
    });

    it('禁止写入文档模板时写在 noinclude 开头', () => {
        expect(
            syncTemplateStylesPage('<noinclude>{{doc}}</noinclude>', ['A.css'], {
                allowDocContent: false,
            }),
        ).toBe('<noinclude>{{TemplateStyles|A.css}}\n{{doc}}</noinclude>');
    });

    it('把 noinclude 内的标记移进文档模板', () => {
        expect(
            syncTemplateStylesPage(
                '<includeonly>x</includeonly><noinclude>{{TemplateStyles|A.css}}\n{{doc}}</noinclude>',
                ['A.css'],
            ),
        ).toBe(
            '<includeonly>x</includeonly><noinclude>{{doc|content={{TemplateStyles|A.css}}}}</noinclude>',
        );
    });

    it('同步已有标记的参数并保留命名参数', () => {
        expect(
            syncTemplateStylesPage('<noinclude>{{CSS|X.css|nocat=true}}</noinclude>', ['A.css']),
        ).toBe('<noinclude>{{CSS|A.css|nocat=true}}</noinclude>');
    });

    it('没有样式时移除标记并清理空行', () => {
        expect(
            syncTemplateStylesPage(
                '<includeonly>x</includeonly><noinclude>{{TemplateStyles|A.css}}\n[[Cat]]</noinclude>',
                [],
            ),
        ).toBe('<includeonly>x</includeonly><noinclude>[[Cat]]</noinclude>');
    });

    it('重复调用结果不变', () => {
        const page =
                '<includeonly><templatestyles src="A.css" /></includeonly><noinclude>{{doc}}</noinclude>',
            once = syncTemplateStylesPage(page, ['A.css']);

        expect(syncTemplateStylesPage(once, ['A.css'])).toBe(once);
    });

    it('存在多个标记时同步首个并移除后续多余标记', () => {
        expect(
            syncTemplateStylesPage(
                '<noinclude>{{TemplateStyles|Old.css}}\n说明\n{{CSS|Stale.css}}\n</noinclude>',
                ['A.css'],
            ),
        ).toBe('<noinclude>{{TemplateStyles|A.css}}\n说明\n</noinclude>');
    });
});

describe('syncStylePageComment', () => {
    it('被多个模板使用时在顶部添加注释', () => {
        expect(syncStylePageComment('.a{}', ['Template:B', 'Template:A'])).toBe(
            '/* for [[Template:A]]、[[Template:B]] */\n.a{}',
        );
    });

    it('注释一致时原样返回', () => {
        const css = '/* for [[Template:A]]、[[Template:B]] */\n.a{}';

        expect(syncStylePageComment(css, ['Template:A', 'Template:B'])).toBe(css);
    });

    it('使用者变化时改写注释', () => {
        expect(
            syncStylePageComment('/* for [[Template:A]] */\n.a{}', ['Template:A', 'Template:B']),
        ).toBe('/* for [[Template:A]]、[[Template:B]] */\n.a{}');
    });

    it('没有使用者或只剩一个使用者时移除受管注释', () => {
        expect(syncStylePageComment('/* for [[Template:A]] */\n\n.a{}', [])).toBe('.a{}');
        expect(
            syncStylePageComment('/* for [[Template:A]]、[[Template:B]] */\n.a{}', ['Template:A']),
        ).toBe('.a{}');
    });

    it('只有一个使用者时不添加注释', () => {
        expect(syncStylePageComment('.a{}', ['Template:A'])).toBe('.a{}');
    });

    it('跳过人工维护的说明注释', () => {
        expect(
            syncStylePageComment('/* Only for [[Template:Quote]] */\n.a{}', [
                'Template:A',
                'Template:B',
            ]),
        ).toBe('/* Only for [[Template:Quote]] */\n.a{}');
        expect(
            syncStylePageComment('/* for {{文字模糊}} */\n.a{}', ['Template:A', 'Template:B']),
        ).toBe('/* for {{文字模糊}} */\n.a{}');
    });

    it('分类注释不影响添加', () => {
        expect(
            syncStylePageComment('/* [[Category:在模板命名空间下的CSS页面]] */\n.a{}', [
                'Template:A',
                'Template:B',
            ]),
        ).toBe(
            '/* for [[Template:A]]、[[Template:B]] */\n/* [[Category:在模板命名空间下的CSS页面]] */\n.a{}',
        );
    });
});
