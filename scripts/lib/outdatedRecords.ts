import type { Dayjs } from 'dayjs';
import { dayjs } from '@/utils/time';

/**
 * Splits records into kept ones and removed ones, keeping the original key order.
 * A record is kept only when its timestamp is strictly after now - days.
 */
const filterOutdatedRecords = (
    data: Record<string, string[]>,
    now: Dayjs = dayjs().tz(),
    days = 14,
): { filtered: Record<string, string[]>; removed: string[] } => {
    const threshold = now.subtract(days, 'day');

    const filtered: Record<string, string[]> = {};
    const removed: string[] = [];

    Object.entries(data).forEach(([timestamp, records]) => {
        if (dayjs(timestamp).isAfter(threshold)) {
            filtered[timestamp] = records;
        } else {
            removed.push(timestamp);
        }
    });

    return { filtered, removed };
};

export { filterOutdatedRecords };
