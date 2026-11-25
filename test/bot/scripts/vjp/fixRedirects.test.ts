import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { runtime } from '../../../helpers/bot';

const LIST_CATEGORY = 'Category:尚未清空的已重定向分类',
    OLD_CATEGORY = 'Category:V flower',
    NEW_CATEGORY = 'Category:flower',
    FIX_SUMMARY = `修复分类重定向：[[${OLD_CATEGORY}]] → [[${NEW_CATEGORY}]]`;

interface PostParams {
    list?: string;
    prop?: string;
    titles?: string;
    cmtitle?: string;
    cmtype?: string;
    redirects?: boolean;
}

interface FixturePage {
    title: string;
    revisions: { content: string; revid: number }[];
}

interface StubOptions {
    /** 分类重定向列表中的子分类 */
    categories?: string[];
    /** prop=redirects 返回的重定向映射 */
    redirects?: { from: string; to: string }[];
    /** from 分类下需要检查正文的页面 */
    pages?: FixturePage[];
}

const configureStub = ({
    categories = [OLD_CATEGORY],
    redirects = [{ from: OLD_CATEGORY, to: NEW_CATEGORY }],
    pages = [],
}: StubOptions = {}) => {
    const stub = runtime.stubs['vjp']!;

    stub.post.mockImplementation(async (params: PostParams) => {
        if (params.list === 'categorymembers') {
            const isList = params.cmtitle === LIST_CATEGORY,
                members = isList ? categories : pages.map(({ title }) => title);
            return {
                data: {
                    query: {
                        categorymembers: members.map(title => ({ ns: isList ? 14 : 0, title })),
                    },
                },
            };
        }

        if (params.redirects === true) {
            return { data: { query: { redirects } } };
        }

        if (params.prop === 'revisions') {
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

it('把含空格的旧分类名（含大小写变体）改为重定向目标，保留排序键', async () => {
    const stub = configureStub({
        pages: [
            { title: 'Page A', revisions: [{ content: '[[Category:V flower]]', revid: 41 }] },
            {
                title: 'Page B',
                revisions: [{ content: '文本 [[Category:v flower|排序]] 尾', revid: 42 }],
            },
            {
                title: 'Page C',
                revisions: [
                    { content: '[[Category:V flowermore]] [[Category:其他分类]]', revid: 43 },
                ],
            },
        ],
    });

    await import('@/bot/vjp/fixRedirects');
    const result = await runtime.drain();

    expect(result.errors).toEqual([]);

    // 先查已重定向分类列表，再解析分类重定向映射，最后查 from 分类成员
    expect(stub.post).toHaveBeenCalledWith({
        action: 'query',
        list: 'categorymembers',
        cmtitle: LIST_CATEGORY,
        cmprop: 'title',
        cmnamespace: '*',
        cmtype: 'subcat',
        cmcontinue: undefined,
        cmlimit: 'max',
    });
    expect(stub.post).toHaveBeenCalledWith({
        action: 'query',
        titles: OLD_CATEGORY.replaceAll(' ', '_'),
        redirects: true,
    });
    expect(stub.post).toHaveBeenCalledWith({
        action: 'query',
        list: 'categorymembers',
        cmtitle: OLD_CATEGORY,
        cmprop: 'title',
        cmnamespace: '*',
        cmtype: 'file|page|subcat',
        cmcontinue: undefined,
        cmlimit: 'max',
    });
    expect(stub.post).toHaveBeenCalledWith({
        action: 'query',
        prop: 'revisions',
        rvprop: 'content|revid',
        titles: 'Page_A|Page_B|Page_C',
    });

    expect(stub.postWithToken).toHaveBeenCalledTimes(2);
    const [first, second] = stub.postWithToken.mock.calls;

    expect(first![0]).toBe('csrf');
    expect(first![1].title).toBe('Page A');
    expect(first![1].text).toBe('[[Category:flower]]');
    expect(first![1].baserevid).toBe(41);
    expect(first![1].summary).toBe(FIX_SUMMARY);
    expect(first![1].tags).toBe('Bot');
    expect(first![2]).toEqual({ retry: 10, noCache: true });

    expect(second![1].title).toBe('Page B');
    expect(second![1].text).toBe('文本 [[Category:flower|排序]] 尾');
    expect(second![1].baserevid).toBe(42);

    // 不含旧分类名的 Page C 不被编辑
    expect(stub.postWithToken.mock.calls.map(([, body]) => body.title)).toEqual([
        'Page A',
        'Page B',
    ]);
    expect(console.log).toHaveBeenCalledWith(`[[${OLD_CATEGORY}]] → [[${NEW_CATEGORY}]]：3 个页面`);
    expect(console.log).toHaveBeenCalledWith(`Page A: ${OLD_CATEGORY} → ${NEW_CATEGORY}`);
    expect(console.log).toHaveBeenCalledWith(`Page B: ${OLD_CATEGORY} → ${NEW_CATEGORY}`);
});

it('分类名不含空格时同样匹配，且简繁变体都能识别', async () => {
    const stub = configureStub({
        categories: ['Category:旧分类'],
        redirects: [{ from: 'Category:旧分类', to: 'Category:新分类' }],
        pages: [
            { title: 'Page D', revisions: [{ content: '[[Category:旧分类]]', revid: 61 }] },
            { title: 'Page E', revisions: [{ content: '[[Category:舊分類|排序]]', revid: 62 }] },
        ],
    });

    await import('@/bot/vjp/fixRedirects');
    const result = await runtime.drain();

    expect(result.errors).toEqual([]);
    expect(stub.postWithToken.mock.calls.map(([, body]) => [body.title, body.text])).toEqual([
        ['Page D', '[[Category:新分类]]'],
        ['Page E', '[[Category:新分类|排序]]'],
    ]);
});

it('正文没有旧分类名时不编辑，并记录可能由模板引入的提示', async () => {
    const stub = configureStub({
        pages: [
            {
                title: 'Page A',
                revisions: [{ content: '[[Category:其他分类]] [[Category:flower]]', revid: 51 }],
            },
        ],
    });

    await import('@/bot/vjp/fixRedirects');
    const result = await runtime.drain();

    expect(result.errors).toEqual([]);
    expect(stub.postWithToken).not.toHaveBeenCalled();
    expect(console.log).toHaveBeenCalledWith(
        `未找到需修复的分类链接（可能由模板引入）：[[${OLD_CATEGORY}]]`,
    );
});

it('分类本身已空时不编辑，也不提示', async () => {
    const stub = configureStub({ pages: [] });

    await import('@/bot/vjp/fixRedirects');
    const result = await runtime.drain();

    expect(result.errors).toEqual([]);
    expect(stub.postWithToken).not.toHaveBeenCalled();
    expect(console.log).toHaveBeenCalledWith(`[[${OLD_CATEGORY}]] → [[${NEW_CATEGORY}]]：0 个页面`);
    expect(console.log).not.toHaveBeenCalledWith(
        `未找到需修复的分类链接（可能由模板引入）：[[${OLD_CATEGORY}]]`,
    );
});

it('已重定向分类列表为空时不查询分类重定向，也不编辑', async () => {
    const stub = configureStub({ categories: [] });

    await import('@/bot/vjp/fixRedirects');
    const result = await runtime.drain();

    expect(result.errors).toEqual([]);
    expect(stub.postWithToken).not.toHaveBeenCalled();
    expect(stub.post).toHaveBeenCalledTimes(1);
    expect(stub.post.mock.calls.some(([params]) => (params as PostParams).redirects === true)).toBe(
        false,
    );
});
