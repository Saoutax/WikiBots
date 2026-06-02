import { vjpapi as api, Login } from '@/api';
import { BotInstance } from '@/lib';
import { dayjs } from '@/utils';

const bot = new BotInstance(api);

const getLastDayEditCount = async () => {
    let count = 0;

    const end = dayjs().tz().startOf('day').toISOString(),
        start = dayjs().tz().subtract(1, 'day').startOf('day').toISOString();

    let rccontinue: string | undefined;
    do {
        const {
            data,
            data: {
                query: { recentchanges: list },
            },
        } = await api.get({
            list: 'recentchanges',
            rcprop: 'timestamp',
            rctype: 'edit|new',
            rclimit: 'max',
            rcstart: end,
            rcend: start,
            rccontinue,
        });

        if (!list?.length) {
            break;
        }

        count += list.length;
        rccontinue = data.continue?.rccontinue;
    } while (rccontinue);

    return count;
};

(async () => {
    console.log(`Start time: ${new Date().toISOString()}`);

    await new Login(api).login({ site: 'vjp', account: 'bot' });

    const {
        data: {
            query: {
                statistics: { articles, edits, users, activeusers },
            },
        },
    } = await api.get({
        meta: 'siteinfo',
        siprop: 'statistics',
    });

    const editCount = await getLastDayEditCount(),
        title = 'Template:站点数据.json',
        statistics = await bot.getJson<{ dataset: { source: string[] } }>(title);

    statistics.dataset.source.push([
        dayjs().tz().subtract(1, 'day').format('YYYY-MM-DD'),
        users,
        activeusers,
        editCount,
        articles,
        edits,
    ] as unknown as string);

    const text = JSON.stringify(statistics, null, 4);

    await api.postWithToken('csrf', {
        action: 'edit',
        title,
        text,
        summary: '更新统计数据',
        tags: 'Bot',
        bot: true,
        minor: true,
        nocreate: true,
        watchlist: 'nochange',
    });

    console.log(`End time: ${new Date().toISOString()}`);
})();
