import { load, dump } from 'js-yaml';
import { z } from 'zod';
import { readGHFile, writeGHFile } from './github';

const timeRecordSchema = z.record(z.string(), z.string());

const parseTimeRecord = (content: string): Record<string, string> => {
    if (content.trim() === '') {
        return {};
    }
    const parsed = load(content);
    if (parsed === undefined || parsed === null) {
        return {};
    }
    return timeRecordSchema.parse(parsed);
};

/**
 * 获取时间戳记录
 *
 * @param name 任务名称
 * @returns 时间戳，未记录时返回 undefined
 */
const getTimeData = async (name: string): Promise<string | undefined> => {
    const { content } = await readGHFile('data/time.yaml'),
        record = parseTimeRecord(content);
    return record[name];
};

/**
 * 更新时间戳记录
 *
 * @param name 任务名称
 * @param time 时间戳
 */
const updateTimeData = async (name: string, time: string): Promise<void> => {
    const { content, sha } = await readGHFile('data/time.yaml'),
        record = parseTimeRecord(content);
    record[name] = time;
    await writeGHFile(
        'data/time.yaml',
        dump(record),
        `chore: auto record last run time of ${name}`,
        sha,
    );
};

export { getTimeData, updateTimeData };
