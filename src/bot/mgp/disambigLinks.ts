import { pinyin } from 'pinyin-pro';
import { toRomaji } from 'wanakana';
import { zhapi as api } from '@/api';
import { createRateLimiter } from '@/infra';
import { BotInstance } from '@/lib';
import { run } from '@/runner';

const bot = new BotInstance(api);

const processObject = (arr: string[], obj: Record<string, string[]>) => {
    const setArr = new Set(arr),
        result: Record<string, string[]> = {};
    for (const [key, value] of Object.entries(obj)) {
        const filter = value.filter(item => !setArr.has(item));
        if (filter.length > 0) {
            result[key] = filter;
        }
    }
    return result;
};

const format = (text: string) => {
    const py = pinyin(text, { toneType: 'none', separator: '' }),
        rm = toRomaji(py, { passRomaji: true });
    return rm.toUpperCase();
};

const grouping = (obj: Record<string, string[]>) => {
    const ranges = [
        ['A', 'C', 'A-C'],
        ['D', 'F', 'D-F'],
        ['G', 'I', 'G-I'],
        ['J', 'L', 'J-L'],
        ['M', 'O', 'M-O'],
        ['P', 'R', 'P-R'],
        ['S', 'U', 'S-U'],
        ['V', 'X', 'V-X'],
        ['Y', 'Z', 'Y-Z'],
    ] as const;

    const result: Record<string, Record<string, string[]>> = {};

    for (const originalKey of Object.keys(obj)) {
        const formatted = format(originalKey);
        const firstChar = formatted.charAt(0) || '';

        const isEnglish = /^[A-Za-z]$/.test(firstChar);
        let groupLabel = '其它';

        if (isEnglish) {
            const up = firstChar.toUpperCase();
            for (const [start, end, label] of ranges) {
                if (up >= start && up <= end) {
                    groupLabel = label;
                    break;
                }
            }
        }

        if (!result[groupLabel]) {
            result[groupLabel] = {};
        }
        result[groupLabel]![originalKey] = obj[originalKey]!;
    }

    return result;
};

const generateReport = (
    obj: Record<string, Record<string, string[]>>,
): { title: string; text: string }[] => {
    const reports: { title: string; text: string }[] = [];

    for (const [page, entries] of Object.entries(obj)) {
        let text = '* 本页面是由[[U:机娘亚衣琴|机器人]]生成的疑似链入消歧义页面的条目报告。\n';
        text += '* 生成时间：{{subst:#time:Y年n月j日 (D) H:i (T)|||1}}\n\n';
        text += '{| class="wikitable"\n';
        text += '|+\n! width="10%" | 消歧义页面\n! width="90%" | 链入消歧义页面的条目\n';
        for (const [key, arr] of Object.entries(entries)) {
            const values = arr.map(v => `[[${v}]]`).join('、');
            text += '|-\n';
            text += `| [[${key}]] || ${values}\n`;
        }
        text += '|}\n\n[[Category:萌娘百科数据报告]]';
        reports.push({ title: page, text });
    }

    return reports;
};

(async () => {
    await run({ api, site: 'zh' }, async () => {
        const disambig = await bot.queryCategory('Category:消歧义页', false, ['page']);
        console.log(`Found ${disambig.length} disambiguation page(s).`);

        const linkPages = await bot.getLinked(disambig, [0], false);

        const deDuplicate = processObject(disambig, linkPages);
        console.log(`共计${Object.keys(deDuplicate).length}个消歧义页存在链入页面`);

        const reports = generateReport(grouping(deDuplicate));
        console.log(`Generated ${reports.length} report page(s) to update.`);
        const limiter = createRateLimiter();

        await limiter.map(reports, async ({ title, text }) => {
            await bot.edit({
                title: `萌娘百科:疑似链入消歧义页面的条目/${title}`,
                text,
                summary: '更新数据报告',
                tags: 'Bot',
            });
            console.log(`Done: ${title}`);
        });
    });
})();
