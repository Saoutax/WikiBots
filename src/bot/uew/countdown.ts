import { run, uewapi as api } from '@/api';
import { BotInstance } from '@/lib';
import { dayjs } from '@/utils';

const bot = new BotInstance(api);

(async () => {
    await run({ api, site: 'uew' }, async () => {
        const target = dayjs.tz('2027-02-06', 'Asia/Shanghai'),
            today = dayjs.tz().startOf('day'),
            diff = target.diff(today, 'day');

        await bot.edit({
            title: 'Template:上映倒计时',
            text: diff,
            summary: '更新倒计时',
            tags: 'Bot',
        });
        console.log('Update success.');
    });
})();
