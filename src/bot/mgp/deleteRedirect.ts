import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import { zhapi, cmapi, Login } from '@/api';
import { BotInstance } from '@/lib';
import { booleanFilter, getTimeData, updateTimeData, readGHFile, writeGHFile } from '@/utils';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.tz.setDefault('Asia/Shanghai');

const now = dayjs().tz(),
    lestart = now.toISOString(),
    leend = await getTimeData('deleteRedirect');

const cmbot = new BotInstance(cmapi);

const getRecentMoves = async (): Promise<string[]> => {
    try {
        const { data } = await cmapi.post({
            action: 'query',
            list: 'logevents',
            letype: 'move',
            lenamespace: 6,
            lelimit: 500,
            lestart,
            leend,
        });

        const files = data?.query?.logevents || [];
        return files.map((e: { title: string }) => e.title);
    } catch (err) {
        console.error('获取移动日志出错:', err);
        return [];
    }
};

const recordInUsed = async (inUsed: string[]) => {
    const today = now.format('YYYY年MM月DD日 HH时');
    const text = inUsed.map(item => `* [[cm:${item}|${item}]]`).join('\n');

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

    const filepath = 'data/inUsedRedirect.json',
        { content, sha } = await readGHFile(filepath),
        record = JSON.parse(content) as Record<string, string[]>;
    record[lestart] = inUsed;
    await writeGHFile(
        filepath,
        JSON.stringify(record, null, 4),
        'chore: auto record redirect for in-use files',
        sha,
    );
};

const processRecent = async (lgusername: string) => {
    const filepath = 'data/inUsedRedirect.json',
        { content, sha } = await readGHFile(filepath),
        record = JSON.parse(content) as Record<string, string[]>;

    for (const [timestamp, files] of Object.entries(record)) {
        if (files.length === 0) {
            delete record[timestamp];
            continue;
        }

        const usage = await cmbot.checkGlobalUsage(files);
        const { isFalse: notInUsed, isTrue: inUsed } = booleanFilter(usage);

        if (notInUsed.length > 0) {
            await cmbot.flagDelete(
                notInUsed,
                '移动残留重定向',
                lgusername,
                '自动挂删文件移动残留重定向',
            );
            console.log(`挂删记录中的 ${notInUsed.length} 个新无使用重定向`);
        }

        if (inUsed.length > 0) {
            record[timestamp] = inUsed;
        } else {
            delete record[timestamp];
        }
    }

    await writeGHFile(
        filepath,
        JSON.stringify(record, null, 4),
        'chore: update inUsedRedirect record',
        sha,
    );
};

(async () => {
    console.log(`Start time: ${new Date().toISOString()}`);

    await new Login(zhapi).login({ site: 'zh', account: 'bot' });
    const { lgusername } = await new Login(cmapi).login({ site: 'cm', account: 'bot' });

    const movedFiles = await getRecentMoves();

    const redirects = await cmbot.checkRedirect(movedFiles),
        { isTrue: isRedirect } = booleanFilter(redirects);

    const usage = await cmbot.checkGlobalUsage(isRedirect),
        { isFalse, isTrue } = booleanFilter(usage);

    if (isTrue.length > 0) {
        console.log(`共 ${isTrue.length} 个重定向仍存在使用：\n${isTrue.join('\n')}`);
        await recordInUsed(isTrue);
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

    console.log('执行记录挂删。');
    await processRecent(lgusername);

    await updateTimeData('deleteRedirect', lestart);

    console.log(`End time: ${new Date().toISOString()}`);
})();
