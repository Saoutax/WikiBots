import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import { uewapi as api, Login } from '@/api';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.tz.setDefault('Asia/Shanghai');

const target = dayjs.tz('2027-02-06', 'Asia/Shanghai'),
    today = dayjs.tz().startOf('day'),
    diff = target.diff(today, 'day');

(async () => {
    console.log(`Start time: ${new Date().toISOString()}`);

    await new Login(api).login({ site: 'uew', account: 'bot' });

    await api.postWithToken('csrf', {
        action: 'edit',
        title: 'Template:上映倒计时',
        text: diff,
        summary: '更新倒计时',
        tags: 'Bot',
        minor: true,
        bot: true,
    });
    console.log('Update success.');

    console.log(`End time: ${new Date().toISOString()}`);
})();
