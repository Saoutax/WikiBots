import type { ApiQueryResponseWithResult } from 'types-mediawiki-response';
import Parser from 'wikiparser-node';
import { run, vjpapi as api } from '@/api';
import { BotInstance } from '@/lib';
import { createRateLimiter, splitAndJoin, variantConverter } from '@/utils';

const bot = new BotInstance(api);

/**
 * 规范化为解析器中 `CategoryToken.name` 的形式（空格写作下划线、首字母大写等）
 * @param title - 分类标题
 * @returns 规范化后的完整标题
 */
const normalize = (title: string) => Parser.normalizeTitle(title).title;

(async () => {
    await run(
        { api, site: 'vjp' },
        async () => {
            const original = await bot.queryCategory('Category:尚未清空的已重定向分类', false, [
                'subcat',
            ]);
            const limiter = createRateLimiter();

            for (const titles of splitAndJoin(original)) {
                const {
                    data: {
                        query: { redirects = [] },
                    },
                } = await api.post<ApiQueryResponseWithResult>({
                    action: 'query',
                    titles,
                    redirects: true,
                });

                for (const { from, to } of redirects) {
                    if (!from || !to) {
                        continue;
                    }
                    const pages = await bot.queryCategory(from, false, ['file', 'page', 'subcat']),
                        pageContent = await bot.batchQuery(pages),
                        names = new Set(variantConverter(from).map(normalize)),
                        edits: { title: string; text: string; revid: number }[] = [];

                    console.log(`[[${from}]] → [[${to}]]：${pages.length} 个页面`);

                    for (const [title, { content, revid }] of Object.entries(pageContent)) {
                        const root = Parser.parse(content),
                            targets = root
                                .querySelectorAll<Parser.CategoryToken>('category')
                                .filter(oldCat => names.has(oldCat.name));
                        targets.forEach(oldCat => oldCat.setTarget(to));
                        const text = root.toString();
                        if (content !== text) {
                            edits.push({ title, text, revid });
                        }
                    }

                    if (pages.length > 0 && edits.length === 0) {
                        console.log(`未找到需修复的分类链接（可能由模板引入）：[[${from}]]`);
                    }

                    await limiter.map(edits, async ({ title, text, revid }) => {
                        await bot.edit({
                            title,
                            text,
                            baserevid: revid,
                            summary: `修复分类重定向：[[${from}]] → [[${to}]]`,
                            tags: 'Bot',
                        });
                        console.log(`${title}: ${from} → ${to}`);
                    });
                }
            }
        },
        true,
    );
})();
