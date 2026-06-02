import { uewapi as api, Login } from '@/api';
import { BotInstance } from '@/lib';
import { dayjs, parseThread } from '@/utils';

const bot = new BotInstance(api);

(async () => {
    console.log(`Start time: ${new Date().toISOString()}`);

    await new Login(api).login({ site: 'uew', account: 'bot' });

    if (dayjs.tz().date() === 1) {
        const content = await bot.getContent('地球联合百科讨论:会议大厅');

        const currentThread = parseThread(content);

        let archive = '';
        Object.entries(currentThread)
            .filter(([key]) => !isNaN(Number(key)))
            .sort(([a], [b]) => Number(a) - Number(b))
            .forEach(([key, value]) => {
                const today = dayjs.tz().startOf('day'),
                    lastComment = dayjs(value.timestamp);
                if (today.diff(lastComment, 'day') >= 5) {
                    archive += `${value.thread}\n`;
                    delete currentThread[Number(key)];
                    console.log(`Need archive: ${value.title}`);
                }
            });

        const newDiscussion =
            currentThread.preface +
            Object.keys(currentThread)
                .filter(k => k !== 'preface')
                .sort((a, b) => Number(a) - Number(b))
                .map(k => currentThread[Number(k)]?.thread)
                .join('');

        const archiveTitle = `地球联合百科讨论:会议大厅/存档/${dayjs().tz().subtract(1, 'month').format('YYYY年MM月')}`;
        await Promise.all(
            Object.entries({
                '地球联合百科讨论:会议大厅': newDiscussion,
                [archiveTitle]: archive,
            }).map(async ([title, text]) => {
                await api.postWithToken('csrf', {
                    action: 'edit',
                    title,
                    text,
                    summary: '存档过期讨论串',
                    tags: 'Bot',
                    bot: true,
                });
                console.log(`Done: ${title}`);
            }),
        );

        await api.postWithToken('csrf', {
            action: 'protect',
            title: archiveTitle,
            protections: 'edit=sysop|move=sysop',
            reason: '会议大厅存档',
            tags: 'Bot',
            bot: true,
        });
        console.log('Protect success.');
    } else {
        console.log('Not archive day, skipped.');
    }

    console.log(`End time: ${new Date().toISOString()}`);
})();
