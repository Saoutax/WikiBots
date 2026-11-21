import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { runtime } from '../../../helpers/bot';

const TARGET = 'Qiuwen_talk:内容评选';
const ARCHIVE_TITLE = 'Qiuwen_talk:内容评选/存档/2026年11月';
const SUMMARY = '机器人：存档讨论';
const MAIN_REVID = 201;

const HEADER = '<noinclude>{{/header}}</noinclude>';

const THREAD_A = `== 条目甲 ==
{{存档至|Talk:条目甲}}
{{Archive top|status=+|result=当选。}}
{{article2|条目甲}}，分类：，'''提名类型：'''[[Qiuwen:好文章|'''好文章''']]，提名人：Example 2026年10月1日 (四) 12:00 (CST)
{{Archive bottom}}`;

const THREAD_B = `== File:图片乙.jpg ==
{{Archive top|status=+|result=通过。}}
{{Make public|1=3|status=|note=|end=yes|endtime=2026年11月10日 (二) 12:00（CST）}}
{{article2|File:图片乙.jpg}}，分类：，'''提名类型：'''[[Qiuwen:每日影像|'''每日影像''']]，提名人：Example 2026年10月1日 (四) 12:00 (CST)
{{Archive bottom}}`;

const THREAD_C = `== 条目丙 ==
{{存档至}}
{{Archive top|status=-|result=落选。}}
{{article2|条目丙}}，分类：，'''提名类型：'''[[Qiuwen:特色条目|'''特色条目''']]，提名人：Example 2026年10月1日 (四) 12:00 (CST)
{{Archive bottom}}`;

const THREAD_D = `== 进行中 ==
{{article2|条目丁}}，分类：，'''提名类型：'''[[Qiuwen:好文章|'''好文章''']]，提名人：Example 2026年10月1日 (四) 12:00 (CST)`;

const CLAIM = `== 第一批特色条目认领 ==
本章节长期有效。

=== User:Example ===
{{Talkendh|通过}}
示例认领。
{{Talkendf}}`;

const CONTENT = [HEADER, THREAD_A, THREAD_B, THREAD_C, THREAD_D, CLAIM].join('\n\n') + '\n';

const ARCHIVE = [THREAD_A, THREAD_B, THREAD_C].join('\n\n');

const DISCUSSION = [HEADER, THREAD_D, CLAIM].join('\n\n') + '\n';

const BODY_A = `{{Archive top|status=+|result=当选。}}
{{article2|条目甲}}，分类：，'''提名类型：'''[[Qiuwen:好文章|'''好文章''']]，提名人：Example 2026年10月1日 (四) 12:00 (CST)
{{Archive bottom}}`;

const BODY_B = `{{Archive top|status=+|result=通过。}}
{{Make public|1=3|status=|note=|end=yes|endtime=2026年11月10日 (二) 12:00（CST）}}
{{article2|File:图片乙.jpg}}，分类：，'''提名类型：'''[[Qiuwen:每日影像|'''每日影像''']]，提名人：Example 2026年10月1日 (四) 12:00 (CST)
{{Archive bottom}}`;

const BLOCK_A = `== 条目甲 ==
{{移动自|Qiuwen talk:内容评选}}
${BODY_A}`;

const BLOCK_B = `== File:图片乙.jpg ==
{{移动自|Qiuwen talk:内容评选}}
${BODY_B}`;

const PAGE_A_REVID = 301;

const PAGE_A_BEFORE = `{{Article history
| action1 = FAC
| action1date = 2026-01-01
| action1link = #旧评选
| action1result = pass
}}
旧讨论。2026年1月2日 (五) 12:00 (CST)`;

const PAGE_A_AFTER = `{{Article history
| action1 = FAC
| action1date = 2026-01-01
| action1link = #旧评选
| action1result = pass
|action2=GA
|action2date=2026-10-01
|action2link=Special:固定链接/201#条目甲
|action2result=pass}}
旧讨论。2026年1月2日 (五) 12:00 (CST)`;

const PAGE_B_AFTER = `{{Article history
|action1=POTD
|action1date=2026-11-10
|action1link=Special:固定链接/201#File:图片乙.jpg
|action1result=pass}}`;

interface PageFixture {
    content: string;
    revid: number;
}

interface StubOptions {
    mainContent: string;
    pages?: Record<string, PageFixture>;
    archiveExists?: boolean;
}

const setup = ({ mainContent, pages = {}, archiveExists = false }: StubOptions) => {
    const stub = runtime.stubs['qw']!;

    stub.post.mockImplementation(async (params: { prop?: string; titles?: string }) => {
        const title = params.titles;

        if (params.prop === 'revisions') {
            if (title === TARGET) {
                return {
                    data: {
                        query: {
                            pages: [
                                {
                                    title,
                                    revisions: [{ content: mainContent, revid: MAIN_REVID }],
                                },
                            ],
                        },
                    },
                };
            }

            const page = title ? pages[title] : undefined;
            if (!page) {
                throw new Error(`Unexpected revisions request: ${title}`);
            }

            return {
                data: {
                    query: {
                        pages: [
                            {
                                title,
                                revisions: [{ content: page.content, revid: page.revid }],
                            },
                        ],
                    },
                },
            };
        }

        if (params.prop === 'info') {
            const exists =
                title === TARGET ||
                (title !== undefined && pages[title] !== undefined) ||
                (title === ARCHIVE_TITLE && archiveExists);

            return {
                data: { query: { pages: [exists ? { title } : { title, missing: true }] } },
            };
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
    vi.useFakeTimers({ now: new Date('2026-11-20T00:00:00+08:00') });
});

afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
});

it('存档已结案讨论串，补写目标页 Article history 并更新当月存档页', async () => {
    const stub = setup({
        mainContent: CONTENT,
        pages: { 'Talk:条目甲': { content: PAGE_A_BEFORE, revid: PAGE_A_REVID } },
    });

    await import('@/bot/qw/archiveFAC');
    const result = await runtime.drain();

    expect(result.errors).toEqual([]);
    expect(stub.postWithToken).toHaveBeenCalledTimes(4);

    const pageA = stub.postWithToken.mock.calls[0]![1];
    expect(pageA['title']).toBe('Talk:条目甲');
    expect(pageA['text']).toBe(`${PAGE_A_AFTER}\n\n${BLOCK_A}\n`);
    expect(pageA['baserevid']).toBe(PAGE_A_REVID);
    expect(pageA['summary']).toBe(SUMMARY);

    const pageB = stub.postWithToken.mock.calls[1]![1];
    expect(pageB['title']).toBe('File_talk:图片乙.jpg');
    expect(pageB['text']).toBe(`${PAGE_B_AFTER}\n\n${BLOCK_B}\n`);
    expect(pageB['baserevid']).toBeUndefined();

    const archive = stub.postWithToken.mock.calls[2]![1];
    expect(archive['title']).toBe(ARCHIVE_TITLE);
    expect(archive['text']).toBe(`{{talkarchive}}\n\n${ARCHIVE}`);
    expect(archive['appendtext']).toBeUndefined();

    const discussion = stub.postWithToken.mock.calls[3]![1];
    expect(discussion['title']).toBe(TARGET);
    expect(discussion['text']).toBe(DISCUSSION);
    expect(discussion['baserevid']).toBe(MAIN_REVID);

    expect(console.log).toHaveBeenCalledWith('Archive 条目甲: Talk:条目甲.');
    expect(console.log).toHaveBeenCalledWith('Archive 条目丙: no target page.');
    expect(console.log).toHaveBeenCalledWith('Skip 进行中: not closed.');
    expect(console.log).toHaveBeenCalledWith('Skip 第一批特色条目认领: claim section.');
    expect(console.log).toHaveBeenCalledWith('Archived 3 threads.');
});

it('存档页已存在时追加，支持繁体存檔至与无链接的重选类型', async () => {
    const thread = `== 条目戊 ==
{{存檔至|Talk:条目戊}}
{{Archive top|status=-|result=落选。}}
{{article2|条目戊}}，分类：，提名类型：'''特色条目重选'''，提名人：Example 2026年10月5日 (一) 12:00 (CST)
{{Archive bottom}}`;

    const stub = setup({
        mainContent: `${HEADER}\n\n${thread}\n`,
        archiveExists: true,
    });

    await import('@/bot/qw/archiveFAC');
    const result = await runtime.drain();

    expect(result.errors).toEqual([]);
    expect(stub.postWithToken).toHaveBeenCalledTimes(3);

    const page = stub.postWithToken.mock.calls[0]![1];
    expect(page['title']).toBe('Talk:条目戊');
    expect(page['text']).toContain('|action1=FAR');
    expect(page['text']).toContain('|action1result=fail');
    expect(page['text']).toContain('|action1date=2026-10-05');
    expect(page['text']).toContain('|action1link=Special:固定链接/201#条目戊');
    expect(page['text']).toContain('== 条目戊 ==');

    const archive = stub.postWithToken.mock.calls[1]![1];
    expect(archive['title']).toBe(ARCHIVE_TITLE);
    expect(archive['appendtext']).toBe(`\n\n${thread}`);
    expect(archive['text']).toBeUndefined();

    const discussion = stub.postWithToken.mock.calls[2]![1];
    expect(discussion['title']).toBe(TARGET);
    expect(discussion['text']).toBe(`${HEADER}\n`);
});

it('没有已结案讨论串时不产生编辑', async () => {
    const stub = setup({ mainContent: `${HEADER}\n\n${THREAD_D}\n`, archiveExists: true });

    await import('@/bot/qw/archiveFAC');
    const result = await runtime.drain();

    expect(result.errors).toEqual([]);
    expect(stub.postWithToken).not.toHaveBeenCalled();
    expect(console.log).toHaveBeenCalledWith('No threads need to be archived.');
});

it('空存档至与无法判定的类型只写当月存档页', async () => {
    const thread = `== 无效评选 ==
{{存档至}}
{{Archive top|status=-|result=快速删除。}}
{{Archive bottom}}`;

    const stub = setup({ mainContent: `${HEADER}\n\n${thread}\n` });

    await import('@/bot/qw/archiveFAC');
    const result = await runtime.drain();

    expect(result.errors).toEqual([]);
    expect(stub.postWithToken).toHaveBeenCalledTimes(2);

    const archive = stub.postWithToken.mock.calls[0]![1];
    expect(archive['text']).toBe(`{{talkarchive}}\n\n${thread}`);

    const discussion = stub.postWithToken.mock.calls[1]![1];
    expect(discussion['text']).toBe(`${HEADER}\n`);
});

it('目标页已包含讨论串正文时不重复写入', async () => {
    const page = `${PAGE_A_BEFORE}\n\n${BLOCK_A}\n`;
    const stub = setup({
        mainContent: `${HEADER}\n\n${THREAD_A}\n`,
        pages: { 'Talk:条目甲': { content: page, revid: PAGE_A_REVID } },
    });

    await import('@/bot/qw/archiveFAC');
    const result = await runtime.drain();

    expect(result.errors).toEqual([]);
    expect(stub.postWithToken).toHaveBeenCalledTimes(2);
    expect(stub.postWithToken.mock.calls[0]![1]['title']).toBe(ARCHIVE_TITLE);
    expect(console.log).toHaveBeenCalledWith('Skip Talk:条目甲: 条目甲 already archived.');
});

it('同一目标页的两条讨论串合并写入并依次续号', async () => {
    const first = `== 条目己 ==
{{存档至|Talk:条目己}}
{{Archive top|status=+|result=当选。}}
{{article2|条目己}}，分类：，'''提名类型：'''[[Qiuwen:好文章|'''好文章''']]，提名人：Example 2026年10月5日 (一) 12:00 (CST)
{{Archive bottom}}`;

    const second = `== 条目庚 ==
{{存档至|Talk:条目己}}
{{Archive top|status=+|result=当选。}}
{{article2|条目庚}}，分类：，'''提名类型：'''[[Qiuwen:特色条目|'''特色条目''']]，提名人：Example 2026年10月6日 (二) 12:00 (CST)
{{Archive bottom}}`;

    const stub = setup({ mainContent: `${HEADER}\n\n${first}\n\n${second}\n` });

    await import('@/bot/qw/archiveFAC');
    const result = await runtime.drain();

    expect(result.errors).toEqual([]);
    expect(stub.postWithToken).toHaveBeenCalledTimes(3);

    const page = stub.postWithToken.mock.calls[0]![1];
    expect(page['title']).toBe('Talk:条目己');
    expect(page['text']).toContain('|action1=GA');
    expect(page['text']).toContain('|action2=FAC');
    expect(page['text']).toContain('== 条目己 ==');
    expect(page['text']).toContain('== 条目庚 ==');
});

it('status 缺失时按 result 文本判定结果', async () => {
    const thread = `== 条目辛 ==
{{存档至|Talk:条目辛}}
{{Archive top|result=净支持票不足，落选。}}
{{article2|条目辛}}，分类：，'''提名类型：'''[[Qiuwen:特色条目|'''特色条目''']]，提名人：Example 2026年10月5日 (一) 12:00 (CST)
{{Archive bottom}}`;

    const stub = setup({ mainContent: `${HEADER}\n\n${thread}\n` });

    await import('@/bot/qw/archiveFAC');
    const result = await runtime.drain();

    expect(result.errors).toEqual([]);

    const page = stub.postWithToken.mock.calls[0]![1];
    expect(page['title']).toBe('Talk:条目辛');
    expect(page['text']).toContain('|action1=FAC');
    expect(page['text']).toContain('|action1result=fail');
});

it('无法判定评选类型时仍存档讨论串但不写 Article history', async () => {
    const thread = `== 无类型 ==
{{存档至|Talk:无类型}}
{{Archive top|status=+|result=当选。}}
{{Archive bottom}}`;

    const stub = setup({ mainContent: `${HEADER}\n\n${thread}\n` });

    await import('@/bot/qw/archiveFAC');
    const result = await runtime.drain();

    expect(result.errors).toEqual([]);

    const page = stub.postWithToken.mock.calls[0]![1];
    expect(page['title']).toBe('Talk:无类型');
    expect(page['text']).toBe(
        `== 无类型 ==\n{{移动自|Qiuwen talk:内容评选}}\n{{Archive top|status=+|result=当选。}}\n{{Archive bottom}}\n`,
    );
    expect(page['text']).not.toContain('Article history');
    expect(console.log).toHaveBeenCalledWith(
        'Skip Article history for 无类型: unknown type or result.',
    );
});

it('已登记相同评选链接时不再新增 action 参数', async () => {
    const page = `{{Article history
|action1=GA
|action1date=2026-10-01
|action1link=Special:固定链接/201#条目甲
|action1result=pass}}`;

    const stub = setup({
        mainContent: `${HEADER}\n\n${THREAD_A}\n`,
        pages: { 'Talk:条目甲': { content: page, revid: PAGE_A_REVID } },
    });

    await import('@/bot/qw/archiveFAC');
    const result = await runtime.drain();

    expect(result.errors).toEqual([]);

    const pageEdit = stub.postWithToken.mock.calls[0]![1];
    expect(pageEdit['title']).toBe('Talk:条目甲');
    expect(pageEdit['text']).toBe(`${page}\n\n${BLOCK_A}\n`);
    expect(pageEdit['text']).not.toContain('action2');
});
