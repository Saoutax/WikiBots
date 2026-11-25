import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { runtime } from '../../../helpers/bot';

interface PostParams {
    list?: string;
    prop?: string;
    titles?: string;
    srsearch?: string;
}

interface FixturePage {
    content: string;
    revid: number;
    redirect?: boolean;
}

const PAGES: Record<string, FixturePage> = {
    'Template:DocCase': {
        content:
            '<includeonly><templatestyles src="DocCase/styles.css" /></includeonly><noinclude>{{doc}}</noinclude>',
        revid: 11,
    },
    'Template:DocCase/doc': { content: '文档内容', revid: 12 },
    'Template:NoDocCase': {
        content:
            '<includeonly><templatestyles src="NoDocCase/style.css" /></includeonly><noinclude>{{doc}}</noinclude>',
        revid: 13,
    },
    'Template:PlainCase': {
        content:
            '<includeonly><templatestyles src="Shared/styles.css" /></includeonly><noinclude>说明</noinclude>',
        revid: 14,
    },
    'Template:SharedCase': {
        content:
            '<includeonly><templatestyles src="Shared/styles.css" /></includeonly><noinclude>说明</noinclude>',
        revid: 15,
    },
    'Template:RemoveCase': {
        content: '<noinclude>{{TemplateStyles|Old/styles.css}}</noinclude>',
        revid: 16,
    },
    'Template:BareCase': {
        content:
            '<includeonly><templatestyles src="BareCase/styles.css" /></includeonly><noinclude>{{TemplateStyles}}</noinclude>',
        revid: 17,
    },
    'Template:MismatchCase': {
        content:
            '<includeonly><templatestyles src="Human/styles.css" /></includeonly><noinclude>{{TemplateStyles|Stale.css}}</noinclude>',
        revid: 18,
    },
    'Template:HumanCase': {
        content:
            '<includeonly><templatestyles src="Human/styles.css" /></includeonly><noinclude>说明</noinclude>',
        revid: 19,
    },
    'Template:DocCase/styles.css': { content: '.doccase{}', revid: 21 },
    'Template:NoDocCase/style.css': { content: '.nodoc{}', revid: 22 },
    'Template:BareCase/styles.css': { content: '.bare{}', revid: 23 },
    'Template:Human/styles.css': {
        content: '/* Only for [[Template:HumanCase]] */\n.human{}',
        revid: 24,
    },
    'Template:Shared/styles.css': { content: '.shared{}', revid: 25 },
    'Template:Nested/sandbox/sub': {
        content: '<includeonly><templatestyles src="Nested/styles.css" /></includeonly>',
        revid: 26,
    },
    'Template:RedirectStyleCase': {
        content:
            '<includeonly><templatestyles src="RedirectStyle/styles.css" /></includeonly><noinclude>{{TemplateStyles|RedirectStyle/styles.css}}</noinclude>',
        revid: 27,
    },
    'Template:RedirectStyle/styles.css': {
        content: '#REDIRECT [[Template:Shared/styles.css]]',
        revid: 28,
        redirect: true,
    },
    'Template:Orphan/styles.css': {
        content: '/* for [[Template:OldA]]、[[Template:OldB]] */\n.orphan{}',
        revid: 29,
    },
};

const SEARCH: Record<string, string[]> = {
    'insource:"TemplateStyles"': [
        'Template:DocCase',
        'Template:NoDocCase',
        'Template:PlainCase',
        'Template:SharedCase',
        'Template:RemoveCase',
        'Template:BareCase',
        'Template:MismatchCase',
        'Template:HumanCase',
        'Template:Nested/sandbox/sub',
        'Template:RedirectStyleCase',
    ],
    'insource:"{{CSS"': [],
    'insource:"{{模板样式"': [],
    'insource:"/* for"': ['Template:Orphan/styles.css'],
};

const resolve = (title: string): string | undefined => {
    const candidates = [title, title.replaceAll('_', ' ')];

    return candidates.find(candidate => PAGES[candidate] !== undefined);
};

const configureStub = () => {
    const stub = runtime.stubs['zh']!;

    stub.post.mockImplementation((params: PostParams) => {
        if (params.list === 'search') {
            const titles = SEARCH[params.srsearch ?? ''] ?? [];

            return Promise.resolve({
                data: { query: { search: titles.map(title => ({ title })) } },
            });
        }

        if (params.prop === 'info') {
            const titles = String(params.titles).split('|');

            return Promise.resolve({
                data: {
                    query: {
                        pages: titles.map(title => {
                            const real = resolve(title);

                            if (real === undefined) {
                                return { title, missing: true };
                            }

                            const page = PAGES[real]!;

                            return {
                                title: real,
                                missing: false,
                                ...(page.redirect !== undefined ? { redirect: page.redirect } : {}),
                            };
                        }),
                    },
                },
            });
        }

        if (params.prop === 'revisions') {
            const titles = String(params.titles).split('|');

            return Promise.resolve({
                data: {
                    query: {
                        pages: titles.flatMap(title => {
                            const real = resolve(title);
                            if (real === undefined) {
                                return [];
                            }

                            const page = PAGES[real]!;

                            return [
                                {
                                    title: real,
                                    revisions: [{ content: page.content, revid: page.revid }],
                                },
                            ];
                        }),
                    },
                },
            });
        }

        return Promise.reject(new Error(`Unexpected request: ${JSON.stringify(params)}`));
    });
    stub.postWithToken.mockResolvedValue({ data: { edit: { result: 'Success' } } });

    return stub;
};

beforeEach(() => {
    delete process.env.DRY_RUN;
    vi.resetModules();
    runtime.reset();
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
    vi.restoreAllMocks();
});

it('同步标记与样式页注释，跳过一致的裸标记与人工注释', async () => {
    const stub = configureStub();

    await import('@/bot/mgp/templateStyles');
    const result = await runtime.drain();

    expect(result.errors).toEqual([]);

    expect(stub.post).toHaveBeenCalledWith(
        expect.objectContaining({
            action: 'query',
            list: 'search',
            srsearch: 'insource:"TemplateStyles"',
            srnamespace: '10',
            srlimit: 'max',
        }),
    );

    const bodies = stub.postWithToken.mock.calls.map(([, body]) => body),
        byTitle = new Map(bodies.map((body: { title: string }) => [body.title, body]));

    // 有文档页：写到文档顶部
    expect(byTitle.get('Template:DocCase/doc')).toEqual(
        expect.objectContaining({
            text: '{{TemplateStyles|DocCase/styles.css}}\n文档内容',
            baserevid: 12,
            summary: '添加{{[[T:TemplateStyles|TemplateStyles]]}}标记',
            tags: 'Bot',
        }),
    );

    // 无文档页且 noinclude 内有 doc：写进 content
    expect(byTitle.get('Template:NoDocCase')).toEqual(
        expect.objectContaining({
            text: '<includeonly><templatestyles src="NoDocCase/style.css" /></includeonly><noinclude>{{doc|content={{TemplateStyles|NoDocCase/style.css}}}}</noinclude>',
            baserevid: 13,
        }),
    );

    // 无文档页且无 doc 模板：写进 noinclude 开头
    expect(byTitle.get('Template:PlainCase')).toEqual(
        expect.objectContaining({
            text: '<includeonly><templatestyles src="Shared/styles.css" /></includeonly><noinclude>{{TemplateStyles|Shared/styles.css}}\n说明</noinclude>',
        }),
    );

    // 没有标签但存在标记：移除标记
    expect(byTitle.get('Template:RemoveCase')).toEqual(
        expect.objectContaining({
            text: '<noinclude></noinclude>',
            summary: '移除{{[[T:TemplateStyles|TemplateStyles]]}}标记',
        }),
    );

    // 参数与标签不一致：改写参数
    expect(byTitle.get('Template:MismatchCase')).toEqual(
        expect.objectContaining({
            text: '<includeonly><templatestyles src="Human/styles.css" /></includeonly><noinclude>{{TemplateStyles|Human/styles.css}}</noinclude>',
            summary: '更新{{[[T:TemplateStyles|TemplateStyles]]}}标记',
        }),
    );

    // 无标记的模板补标记
    expect(byTitle.get('Template:HumanCase')).toEqual(
        expect.objectContaining({
            text: '<includeonly><templatestyles src="Human/styles.css" /></includeonly><noinclude>{{TemplateStyles|Human/styles.css}}\n说明</noinclude>',
        }),
    );
    expect(byTitle.get('Template:SharedCase')).toEqual(
        expect.objectContaining({
            text: '<includeonly><templatestyles src="Shared/styles.css" /></includeonly><noinclude>{{TemplateStyles|Shared/styles.css}}\n说明</noinclude>',
        }),
    );

    // 被两个模板使用的样式页补充注释；有人工注释的样式页跳过
    expect(byTitle.get('Template:Shared/styles.css')).toEqual(
        expect.objectContaining({
            text: '/* for [[Template:PlainCase]]、[[Template:SharedCase]] */\n.shared{}',
            baserevid: 25,
            summary: '更新模板样式表使用情况',
        }),
    );
    expect(byTitle.has('Template:Human/styles.css')).toBe(false);

    // 无使用者的受管样式页清理旧注释
    expect(byTitle.get('Template:Orphan/styles.css')).toEqual(
        expect.objectContaining({
            text: '.orphan{}',
            baserevid: 29,
            summary: '更新模板样式表使用情况',
        }),
    );

    // 嵌套沙盒页面、重定向样式页、裸标记与自动推断一致时不编辑
    expect(byTitle.has('Template:Nested/sandbox/sub')).toBe(false);
    expect(byTitle.has('Template:RedirectStyle/styles.css')).toBe(false);
    expect(byTitle.has('Template:BareCase')).toBe(false);
    expect(byTitle.has('Template:DocCase')).toBe(false);
    expect(byTitle.has('Template:BareCase/styles.css')).toBe(false);

    expect(bodies).toHaveLength(9);
});
