import { pinyin } from 'pinyin-pro';
import { toRomaji } from 'wanakana';
import { zhapi as api, Login } from '@/api';
import { BotInstance } from '@/lib';

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

const generateReport = (obj: Record<string, Record<string, string[]>>) => {
    const result: Record<string, string> = {};

    for (const page of Object.keys(obj)) {
        const entries = obj[page] || {};
        let text = '* 本页面是由[[U:机娘亚衣琴|机器人]]生成的疑似链入消歧义页面的条目报告。\n';
        text += '* 生成时间：{{subst:#time:Y年n月j日 (D) H:i (T)|||1}}\n\n';
        text += '{| class="wikitable"\n';
        text += '|+\n! width="10%" | 消歧义页面\n! width="90%" | 链入消歧义页面的条目\n';
        for (const key of Object.keys(entries)) {
            const arr = Array.isArray(entries[key]) ? entries[key] : [];
            const values = arr.map(v => `[[${v}]]`).join('、');
            text += '|-\n';
            text += `| [[${key}]] || ${values}\n`;
        }
        text += '|}\n\n[[Category:萌娘百科数据报告]]';
        result[page] = text;
    }

    return result;
};

(async () => {
    console.log(`Start time: ${new Date().toISOString()}`);

    await new Login(api).login({ site: 'zh', account: 'bot' });

    const bot = new BotInstance(api);

    const disambig = await bot.queryCategory('Category:消歧义页', false, ['page']);

    const linkPages = await bot.getLinked(disambig, [0], false);

    const deDuplicate = processObject(disambig, linkPages);
    console.log(`共计${Object.keys(deDuplicate).length}个消歧义页存在链入页面`);

    const report = generateReport(grouping(deDuplicate));

    for (const [title, text] of Object.entries(report)) {
        await api.postWithToken('csrf', {
            action: 'edit',
            title: `萌娘百科:疑似链入消歧义页面的条目/${title}`,
            text,
            summary: '更新数据报告',
            minor: true,
            tags: 'Bot',
            bot: true,
        });
        console.log(`Done: ${title}`);
    }

    console.log(`End time: ${new Date().toISOString()}`);
})();
