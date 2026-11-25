import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { runtime } from '../../../helpers/bot';

interface PostParams {
    list?: string;
    prop?: string;
    titles?: string;
}

interface FixturePage {
    content: string;
    revid: number;
}

const PAGES: Record<string, FixturePage> = {
    'Template:DocCase': {
        content:
            '<includeonly><templatestyles src="DocCase/styles.css" /></includeonly><noinclude>{{doc}}</noinclude>',
        revid: 11,
    },
    'Template:DocCase/doc': {
        content: '文档内容',
        revid: 21,
    },
    'Template:NoDocCase': {
        content:
            '<noinclude>说明</noinclude><includeonly><templatestyles src="NoDocCase/style.css" /></includeonly>',
        revid: 12,
    },
    'Template:MarkedDocCase': {
        content:
            '<includeonly><templatestyles src="Marked/styles.css" /></includeonly><noinclude>{{doc}}</noinclude>',
        revid: 13,
    },
    'Template:MarkedDocCase/doc': {
        content: '{{CSS|Marked/styles.css}}\n文档',
        revid: 14,
    },
    'Template:RedirectDocCase': {
        content:
            '<includeonly><templatestyles src="Redirect/styles.css" /></includeonly><noinclude>{{doc}}</noinclude>',
        revid: 15,
    },
    'Template:RedirectDocCase/doc': {
        content: '#重定向 [[Template:Other/doc]]',
        revid: 16,
    },
    'Template:RedirectCase': {
        content: '#重定向 [[Template:Other]]',
        revid: 20,
    },
    'Template:EmptyCase': {
        content: '{{doc}}',
        revid: 17,
    },
    'Template:EmptyCase/doc': {
        content: '没有样式',
        revid: 18,
    },
    'Template:Foo/doc': {
        content: '<templatestyles src="Foo/doc.css" />',
        revid: 19,
    },
};

const INFO: Record<string, { missing?: boolean; redirect?: boolean }> = {
    'Template:RedirectCase': { redirect: true },
    'Template:RedirectDocCase/doc': { redirect: true },
    'Template:NoDocCase/doc': { missing: true },
};

const SEARCH_TITLES = [
    'Template:DocCase',
    'Template:NoDocCase',
    'Template:MarkedDocCase',
    'Template:RedirectDocCase',
    'Template:RedirectCase',
    'Template:EmptyCase',
    'Template:Foo/doc',
];

const configureStub = () => {
    const stub = runtime.stubs['zh']!;

    stub.post.mockImplementation(async (params: PostParams) => {
        if (params.list === 'search') {
            return { data: { query: { search: SEARCH_TITLES.map(title => ({ title })) } } };
        }

        if (params.prop === 'info') {
            const titles = String(params.titles).split('|');

            return {
                data: {
                    query: {
                        pages: titles.map(title => ({ title, ...INFO[title] })),
                    },
                },
            };
        }

        if (params.prop === 'revisions') {
            const titles = String(params.titles).split('|');

            return {
                data: {
                    query: {
                        pages: titles.map(title => {
                            const page = PAGES[title];

                            return page
                                ? {
                                      title,
                                      revisions: [{ content: page.content, revid: page.revid }],
                                  }
                                : { title, missing: true };
                        }),
                    },
                },
            };
        }

        throw new Error(`Unexpected request: ${JSON.stringify(params)}`);
    });
    stub.postWithToken.mockResolvedValue({ data: { edit: { result: 'Success' } } });

    return stub;
};

beforeEach(() => {
    delete process.env.DRY_RUN;
    vi.resetModules();
    runtime.reset();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
    vi.restoreAllMocks();
});

it('为有文档和无文档的模板补充 TemplateStyles 标记，跳过已有标记与重定向', async () => {
    const stub = configureStub();

    await import('@/bot/mgp/templateStyles');
    const result = await runtime.drain();

    expect(result.errors).toEqual([]);

    expect(stub.post).toHaveBeenCalledWith(
        expect.objectContaining({
            action: 'query',
            list: 'search',
            srsearch: 'insource:"<templatestyles"',
            srnamespace: '10',
            srlimit: 'max',
        }),
    );
    expect(stub.post).toHaveBeenCalledWith(
        expect.objectContaining({
            action: 'query',
            prop: 'info',
        }),
    );

    expect(stub.postWithToken).toHaveBeenCalledTimes(2);
    const bodies = stub.postWithToken.mock.calls.map(([, body]) => body);

    expect(bodies).toContainEqual(
        expect.objectContaining({
            title: 'Template:DocCase/doc',
            text: '{{TemplateStyles|DocCase/styles.css}}\n文档内容',
            baserevid: 21,
            summary: '添加{{TemplateStyles}}标记',
            tags: 'Bot',
        }),
    );
    expect(bodies).toContainEqual(
        expect.objectContaining({
            title: 'Template:NoDocCase',
            text: '<noinclude>{{TemplateStyles|NoDocCase/style.css}}\n说明</noinclude><includeonly><templatestyles src="NoDocCase/style.css" /></includeonly>',
            baserevid: 12,
            summary: '添加{{TemplateStyles}}标记',
            tags: 'Bot',
        }),
    );

    // 已有标记、文档重定向、模板重定向、无样式页面与 /doc 页面本身都不编辑
    expect(bodies.map(body => body.title)).not.toContain('Template:MarkedDocCase/doc');
    expect(bodies.map(body => body.title)).not.toContain('Template:RedirectDocCase/doc');
    expect(bodies.map(body => body.title)).not.toContain('Template:RedirectCase');
    expect(bodies.map(body => body.title)).not.toContain('Template:EmptyCase');
    expect(bodies.map(body => body.title)).not.toContain('Template:Foo/doc');
});
