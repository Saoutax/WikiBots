import { describe, expect, it } from 'vitest';
import { getLatestTimestamp } from '@/utils/getLatestTimestamp';
import { dayjs } from '@/utils/time';

/**
 * 现行为：解析时间戳时忽略时区后缀，一律按 UTC 处理。
 */
const expectParsedAsUtc = (input: string, expected: string) => {
    expect(getLatestTimestamp(input)?.valueOf()).toBe(
        dayjs.utc(expected, 'YYYY-MM-DD HH:mm').valueOf(),
    );
};

describe('getLatestTimestamp', () => {
    it('解析 CST 时间戳', () => {
        expectParsedAsUtc('2024年1月1日 12:00 (CST)', '2024-01-01 12:00');
    });

    it('忽略星期后缀', () => {
        expectParsedAsUtc('2024年1月1日 (星期一) 12:00 (UTC)', '2024-01-01 12:00');
    });

    it('忽略 (月) 星期缩写与 UTC+8 时区后缀', () => {
        expectParsedAsUtc('2024年1月1日 (月) 12:00 (UTC+8)', '2024-01-01 12:00');
    });

    it('秒为可选部分', () => {
        expectParsedAsUtc('2024年1月1日 12:00:30 (CST)', '2024-01-01 12:00');
    });

    it('解析 JST 时间戳', () => {
        expectParsedAsUtc('2024年1月1日 12:00 (JST)', '2024-01-01 12:00');
    });

    it('不同时区后缀一律按 UTC 处理', () => {
        const timestamps = [
            getLatestTimestamp('2024年1月1日 12:00 (CST)'),
            getLatestTimestamp('2024年1月1日 12:00 (UTC)'),
            getLatestTimestamp('2024年1月1日 12:00 (UTC+8)'),
            getLatestTimestamp('2024年1月1日 12:00 (JST)'),
        ].map(timestamp => timestamp?.valueOf());

        expect(new Set(timestamps).size).toBe(1);
        expect(timestamps[0]).toBe(dayjs.utc('2024-01-01 12:00', 'YYYY-MM-DD HH:mm').valueOf());
    });

    it('多个时间戳取最新', () => {
        const content = [
            '2024年1月1日 12:00 (CST)',
            '2024年6月1日 12:00 (CST)',
            '2024年3月1日 12:00 (CST)',
        ].join('\n');

        expectParsedAsUtc(content, '2024-06-01 12:00');
    });

    it('无匹配时返回 undefined', () => {
        expect(getLatestTimestamp('这里没有任何签名时间戳')).toBeUndefined();
    });

    it('非法月份不匹配', () => {
        expect(getLatestTimestamp('2024年13月1日 12:00 (CST)')).toBeUndefined();
    });
});
