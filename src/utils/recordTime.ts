import { load, dump } from 'js-yaml';
import { readFile, writeFile } from './readAndWrite';

/**
 * 获取时间戳记录
 *
 * @param name 任务名称
 * @returns 时间戳
 */
const getTimeData = async (name: string) => {
    const { content } = await readFile('data/time.yaml'),
        record = load(content) as Record<string, string>;
    if (record[name]) {
        return record[name];
    } else {
        throw new Error(`Failed to find ${name} time record.`);
    }
};

/**
 * 更新时间戳记录
 *
 * @param name 任务名称
 * @param time 时间戳
 */
const updateTimeData = async (name: string, time: string) => {
    const { content, sha } = await readFile('data/time.yaml'),
        record = load(content) as Record<string, string>;
    record[name] = time;
    await writeFile(
        'data/time.yaml',
        dump(record),
        `chore: auto record last run time of ${name}`,
        sha,
    );
};

export { getTimeData, updateTimeData };
