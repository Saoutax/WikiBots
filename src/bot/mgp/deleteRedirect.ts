import dayjs from 'dayjs';
import { zhapi, cmapi, Login } from '@/api';
import { BotInstance } from '@/lib';
import { booleanFilter } from '@/utils';

const now = dayjs();
const day = now.day() === 1 ? 7 : 1;
const time = now.subtract(day, 'day');

const getRecentMoves = async () => {
    try {
        const res = await cmapi.post({
            action: 'query',
            list: 'logevents',
            letype: 'move',
            lenamespace: 6,
            lelimit: 500,
            lestart: time.toISOString(),
            ledir: 'newer',
        });

        const files = res.data?.query?.logevents || [];
        return files.map((e: { title: string }) => e.title);
    } catch (err) {
        console.error('获取移动日志出错:', err);
        return [];
    }
};

(async () => {
    console.log(`Start time: ${new Date().toISOString()}`);

    await new Login(zhapi).login({ site: 'zh', account: 'bot' });
    const { lgusername } = await new Login(cmapi).login({ site: 'cm', account: 'bot' });

    const cmbot = new BotInstance(cmapi);

    const movedFiles = await getRecentMoves();

    if (!movedFiles.length) {
        console.log(`最近 ${day} 日无文件移动记录`);
        console.log(`End time: ${new Date().toISOString()}`);
        return;
    }

    const redirects = await cmbot.checkRedirect(movedFiles),
        isRedirect = Object.keys(redirects).filter(key => redirects[key] === true);

    const usage = await cmbot.checkGlobalUsage(isRedirect),
        { isFalse, isTrue } = booleanFilter(usage);

    if (isTrue.length > 0) {
        const today = dayjs().format('YYYY年MM月DD日');
        const text = isTrue.map(item => `* [[cm:${item}|${item}]]`).join('\n');

        await zhapi.postWithToken(
            'csrf',
            {
                action: 'edit',
                title: 'User:SaoMikoto/Bot/log/deleteRedirect',
                appendtext: `\n\n== ${today} ==\n${text}`,
                summary: '记录仍有使用的重定向',
                minor: true,
                bot: true,
                tags: 'Bot',
            },
            { retry: 10 },
        );

        console.log(`共 ${isTrue.length} 个重定向仍存在使用：\n${isTrue.join('\n')}`);
    }

    const success = await cmbot.flagDelete(
        isFalse,
        '移动残留重定向',
        lgusername,
        '自动挂删文件移动残留重定向',
    );

    if (success.length > 0) {
        console.log(`成功挂删 ${success.length} 个重定向：\n${success.join('\n')}`);
    } else {
        console.log('没有需要挂删的重定向');
    }

    console.log(`End time: ${new Date().toISOString()}`);
})();
