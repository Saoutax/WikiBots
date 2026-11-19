import { describe, expect, it } from 'vitest';
import { dayjs } from '@/utils/time';

describe('time', () => {
    it('dayjs.tz 默认使用 Asia/Shanghai', () => {
        const date = dayjs.tz('2024-01-01 00:00');

        expect(date.utcOffset()).toBe(480);
        expect(date.format('Z')).toBe('+08:00');
    });

    it('默认时区与显式 Asia/Shanghai 一致', () => {
        expect(dayjs.tz('2024-01-01 00:00').valueOf()).toBe(
            dayjs.tz('2024-01-01 00:00', 'Asia/Shanghai').valueOf(),
        );
    });

    it('默认时区的本地时间对应 UTC 偏移', () => {
        expect(dayjs.tz('2024-01-01 00:00').valueOf()).toBe(Date.UTC(2023, 11, 31, 16, 0));
    });
});
