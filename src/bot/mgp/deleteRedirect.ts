import type { ApiDeleteResponse, ApiQueryResponseWithResult } from 'types-mediawiki-response';
import { z } from 'zod';
import { run, zhapi, cmapi } from '@/api';
import { BotInstance } from '@/lib';
import {
    booleanFilter,
    createRateLimiter,
    getTimeData,
    updateTimeData,
    readGHFile,
    writeGHFile,
    dayjs,
} from '@/utils';

const inUsedRedirectSchema = z.record(z.string(), z.array(z.string()));

const cmbot = new BotInstance(cmapi);

const getRecentMoves = async (lestart: string, leend: string | undefined): Promise<string[]> => {
    try {
        const { data } = await cmapi.post<ApiQueryResponseWithResult>({
            action: 'query',
            list: 'logevents',
            letype: 'move',
            lenamespace: 6,
            lelimit: 500,
            lestart,
            leend,
        });

        const files = data?.query?.logevents ?? [];
        return files.map(e => e.title).filter((title): title is string => Boolean(title));
    } catch (err) {
        console.error('获取移动日志出错:', err);
        return [];
    }
};

const deleteRedirect = async (titles: string[]): Promise<void> => {
    const limiter = createRateLimiter();
    await limiter.map(titles, async title => {
        await cmapi.postWithToken<ApiDeleteResponse>('csrf', {
            action: 'delete',
            title,
            reason: '自动删除文件移动残留重定向',
            tags: 'Bot',
            bot: true,
        });
    });
};

const processRecord = async (lestart: string, inUsed: string[]): Promise<void> => {
    const filepath = 'data/inUsedRedirect.json',
        { content, sha } = await readGHFile(filepath),
        record = inUsedRedirectSchema.parse(JSON.parse(content)),
        original = JSON.stringify(record);

    if (inUsed.length > 0) {
        record[lestart] = inUsed;
    }

    for (const [timestamp, files] of Object.entries(record)) {
        if (files.length === 0) {
            delete record[timestamp];
            continue;
        }

        const usage = await cmbot.checkGlobalUsage(files),
            { isFalse: notInUsed, isTrue: stillInUsed } = booleanFilter(usage);

        if (notInUsed.length > 0) {
            await deleteRedirect(notInUsed);
            console.log(`删除记录中的 ${notInUsed.length} 个新无使用重定向`);
        }

        if (stillInUsed.length > 0) {
            record[timestamp] = stillInUsed;
        } else {
            delete record[timestamp];
        }
    }

    if (JSON.stringify(record) !== original) {
        await writeGHFile(
            filepath,
            JSON.stringify(record, null, 4),
            'chore: auto update inUsedRedirect record',
            sha,
        );
    }
};

(async () => {
    await run(
        [
            { api: zhapi, site: 'zh' },
            { api: cmapi, site: 'cm' },
        ],
        async () => {
            const now = dayjs.tz(),
                lestart = now.toISOString(),
                leend = await getTimeData('deleteRedirect');

            const movedFiles = await getRecentMoves(lestart, leend);

            const redirects = await cmbot.checkRedirect(movedFiles),
                { isTrue: isRedirect } = booleanFilter(redirects);

            const usage = await cmbot.checkGlobalUsage(isRedirect),
                { isFalse, isTrue } = booleanFilter(usage);

            if (isTrue.length > 0) {
                console.log(`共 ${isTrue.length} 个重定向仍存在使用：\n${isTrue.join('\n')}`);
            }

            if (isFalse.length > 0) {
                await deleteRedirect(isFalse);
            } else {
                console.log('没有需要删除的重定向');
            }

            await processRecord(lestart, isTrue);

            await updateTimeData('deleteRedirect', lestart);
        },
    );
})();
