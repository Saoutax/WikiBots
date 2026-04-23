import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import { zhapi, cmapi, Login } from '@/api';
import { BotInstance } from '@/lib';
import { booleanFilter } from '@/utils';
import { getTimeData, updateTimeData } from '@/utils';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.tz.setDefault('Asia/Shanghai');

const now = dayjs().utc(),
    lestart = now.toString(),
    leend = await getTimeData('deleteRedirect');

const getRecentMoves = async () => {
    try {
        const res = await cmapi.post({
            action: 'query',
            list: 'logevents',
            letype: 'move',
            lenamespace: 6,
            lelimit: 500,
            lestart,
            leend,
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

    await updateTimeData('deleteRedirect', leend);

    console.log(`End time: ${new Date().toISOString()}`);
})();
