import type { Dayjs } from 'dayjs';
import { dayjs } from './time';

const timestampRegex =
    /([1-9]\d{3}年(?:0?[1-9]|1[012])月(?:0?[1-9]|[12]\d|3[01])日 *(?:[(（](?:[金木水火土日月]|(?:星期)?[一二三四五六日])[)）])? *(?:[01]\d|2[0-3]):(?:[0-5]\d)(?::[0-5]\d)? *[(（](?:[CJ]ST|UTC(?:[+-](?:[1-9]|1[012]))?)[)）])/gmu;

const getLatestTimestamp = (content: string): Dayjs | undefined => {
    const timestamps = [...content.matchAll(timestampRegex)].map(m =>
        dayjs.utc(m[1], 'YYYY年M月D日 HH:mm').valueOf(),
    );
    if (!timestamps.length) {
        return undefined;
    }
    return dayjs.utc(Math.max(...timestamps));
};

export { getLatestTimestamp };
