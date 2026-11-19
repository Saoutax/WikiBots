import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { runtime } from '../../../helpers/bot';

const CONFIG_TITLE = 'User:SaoMikoto/Bot/config/linkModifier.json',
    CONTENT =
        '[[Foo]] [[Foo|Foo]] [[Foo|other]] [[Foo#frag]] [[Foo#frag|Foo]] [[Foo#frag|other]] [[Other]]',
    /** 目标换成 Bar 后，显示文本为 Foo 的链接保留原显示文本，锚点保留 */
    MODIFIED_CONTENT =
        '[[Bar|Foo]] [[Bar|Foo]] [[Bar|other]] [[Bar#frag]] [[Bar#frag|Foo]] [[Bar#frag|other]] [[Other]]';

interface PostParams {
    list?: string;
    prop?: string;
    titles?: string;
}

interface Config {
    from: string;
    to: string;
    excludepages: string[];
    excludecategory: string[];
    extendsummary: string;
}

interface FixturePage {
    title: string;
    revisions: { content: string; revid: number }[];
}

interface StubOptions {
    config: Config;
    /** prop=linkshere 返回的链入页面 */
    linkshere: string[];
    /** 批量查询返回的页面正文 */
    pages: FixturePage[];
    /** list=categorymembers 返回的排除页面 */
    categoryMembers?: string[];
}

const configureStub = ({ config, linkshere, pages, categoryMembers = [] }: StubOptions) => {
    const stub = runtime.stubs['zh']!;

    stub.post.mockImplementation(async (params: PostParams) => {
        if (params.list === 'categorymembers') {
            return {
                data: {
                    query: { categorymembers: categoryMembers.map(title => ({ ns: 0, title })) },
                },
            };
        }

        if (params.prop === 'linkshere') {
            return {
                data: {
                    query: {
                        pages: [
                            {
                                title: params.titles,
                                linkshere: linkshere.map(title => ({ title })),
                            },
                        ],
                    },
                },
            };
        }

        if (params.prop === 'revisions') {
            if (params.titles === CONFIG_TITLE) {
                return {
                    data: {
                        query: {
                            pages: [
                                {
                                    title: CONFIG_TITLE,
                                    revisions: [{ content: JSON.stringify(config), revid: 1 }],
                                },
                            ],
                        },
                    },
                };
            }

            return { data: { query: { pages } } };
        }

        throw new Error(`Unexpected request: ${JSON.stringify(params)}`);
    });
    stub.postWithToken.mockResolvedValue({ data: { edit: { result: 'Success' } } });

    return stub;
};

beforeEach(() => {
    vi.resetModules();
    runtime.reset();
    vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
    vi.restoreAllMocks();
});

it('替换正文中的链接目标，保留显示文本与锚点，并跳过排除页面与无变化页面', async () => {
    const stub = configureStub({
        config: {
            from: 'Foo',
            to: 'Bar',
            excludepages: ['Excluded Page'],
            excludecategory: ['Category:排除'],
            extendsummary: '扩展摘要',
        },
        linkshere: [
            'Page A',
            'Page B',
            'Excluded Page',
            'Category Excluded Page',
            'Unchanged Page',
        ],
        categoryMembers: ['Category Excluded Page'],
        pages: [
            { title: 'Page A', revisions: [{ content: CONTENT, revid: 11 }] },
            {
                title: 'Page B',
                revisions: [{ content: '[[Foo|Other]] [[Foo#frag]]', revid: 12 }],
            },
            { title: 'Unchanged Page', revisions: [{ content: '[[Other]]', revid: 13 }] },
        ],
    });

    await import('@/bot/mgp/linkModifier');
    const result = await runtime.drain();

    expect(result.errors).toEqual([]);

    // 配置页通过 prop=revisions 读取
    expect(stub.post).toHaveBeenCalledWith({
        action: 'query',
        prop: 'revisions',
        rvprop: 'content|revid',
        titles: CONFIG_TITLE,
    });
    // 分类排除页面与手写排除页面都不参与批量查询
    expect(stub.post).toHaveBeenCalledWith({
        action: 'query',
        prop: 'revisions',
        rvprop: 'content|revid',
        titles: 'Page_A|Page_B|Unchanged_Page',
    });

    expect(stub.postWithToken).toHaveBeenCalledTimes(2);
    const [first, second] = stub.postWithToken.mock.calls;

    expect(first![0]).toBe('csrf');
    expect(first![1].title).toBe('Page A');
    expect(first![1].text).toBe(MODIFIED_CONTENT);
    expect(first![1].baserevid).toBe(11);
    expect(first![1].summary).toBe('替换链接：[[Foo]] → [[Bar]]：扩展摘要');
    expect(first![1].tags).toBe('Bot');
    expect(first![2]).toEqual({ retry: 10, noCache: true });

    expect(second![1].title).toBe('Page B');
    expect(second![1].text).toBe('[[Bar|Other]] [[Bar#frag]]');
    expect(second![1].baserevid).toBe(12);

    // 排除页面与无变化页面不会被编辑
    expect(stub.postWithToken.mock.calls.map(([, body]) => body.title)).toEqual([
        'Page A',
        'Page B',
    ]);
    expect(console.log).toHaveBeenCalledWith('Total: 2');
});

it('没有可替换的链接时不编辑', async () => {
    const stub = configureStub({
        config: {
            from: 'Foo',
            to: 'Bar',
            excludepages: [],
            excludecategory: [],
            extendsummary: '',
        },
        linkshere: ['Page A'],
        pages: [{ title: 'Page A', revisions: [{ content: '[[Other]] [[Bar]]', revid: 21 }] }],
    });

    await import('@/bot/mgp/linkModifier');
    const result = await runtime.drain();

    expect(result.errors).toEqual([]);
    expect(stub.postWithToken).not.toHaveBeenCalled();
    // 未配置排除分类时不查询分类成员
    expect(
        stub.post.mock.calls.some(([params]) => (params as PostParams).list === 'categorymembers'),
    ).toBe(false);
    expect(console.log).toHaveBeenCalledWith('Total: 0');
});

it('未配置扩展摘要时摘要不带冒号后缀', async () => {
    const stub = configureStub({
        config: {
            from: 'Foo',
            to: 'Bar',
            excludepages: [],
            excludecategory: [],
            extendsummary: '',
        },
        linkshere: ['Page A'],
        pages: [{ title: 'Page A', revisions: [{ content: '[[Foo]]', revid: 31 }] }],
    });

    await import('@/bot/mgp/linkModifier');
    const result = await runtime.drain();

    expect(result.errors).toEqual([]);
    expect(stub.postWithToken).toHaveBeenCalledTimes(1);
    const [first] = stub.postWithToken.mock.calls;
    expect(first![1].text).toBe('[[Bar|Foo]]');
    expect(first![1].summary).toBe('替换链接：[[Foo]] → [[Bar]]');
});
