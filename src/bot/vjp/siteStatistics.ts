import type { ApiQueryResponseWithResult } from 'types-mediawiki-response';
import { vjpapi as api } from '@/api';
import { dayjs } from '@/infra';
import { BotInstance, collectRecentChanges } from '@/lib';
import { run } from '@/runner';

const bot = new BotInstance(api);

const getLastDayEditCount = async () => {
    const end = dayjs().tz().startOf('day').toISOString(),
        start = dayjs().tz().subtract(1, 'day').startOf('day').toISOString();

    let count = 0;
    await collectRecentChanges(
        api,
        {
            rcprop: 'timestamp',
            rctype: 'edit|new',
            rclimit: 'max',
            rcstart: end,
            rcend: start,
        },
        list => {
            count += list.length;
        },
    );

    return count;
};

(async () => {
    await run({ api, site: 'vjp' }, async () => {
        const {
            data: {
                query: { statistics: siteStats },
            },
        } = await api.get<ApiQueryResponseWithResult>({
            meta: 'siteinfo',
            siprop: 'statistics',
        });
        const { articles, edits, users, activeusers } = siteStats!;

        const editCount = await getLastDayEditCount(),
            title = 'Template:站点数据.json',
            statistics = await bot.getJson<{ dataset: { source: (string | number)[][] } }>(title);

        statistics.dataset.source.push([
            dayjs().tz().subtract(1, 'day').format('YYYY-MM-DD'),
            users,
            activeusers,
            editCount,
            articles,
            edits,
        ]);

        const text = JSON.stringify(statistics, null, 4);

        await bot.edit({
            title,
            text,
            summary: '更新统计数据',
            tags: 'Bot',
            nocreate: true,
        });
    });
})();
