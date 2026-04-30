import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import { readGHFile, writeGHFile } from '@/utils';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.tz.setDefault('Asia/Shanghai');

(async () => {
    const filepath = 'data/inUsedRedirect.json',
        { content, sha } = await readGHFile(filepath),
        data = JSON.parse(content) as Record<string, string[]>,
        original = JSON.stringify(data, null, 4);

    const count = dayjs().tz().subtract(14, 'day');

    const filteredData: Record<string, string[]> = {};
    let removedCount = 0;

    Object.keys(data).forEach(timestamp => {
        const recordDate = dayjs(timestamp);

        if (recordDate.isAfter(count)) {
            filteredData[timestamp] = data[timestamp]!;
        } else {
            removedCount++;
            console.log(`移除超过14天的记录: ${timestamp} (${data[timestamp]?.length} 个项目)`);
        }
    });

    console.log(`总共移除了 ${removedCount} 个超过14天的记录`);

    const newContent = JSON.stringify(filteredData, null, 4);

    if (newContent === original) {
        console.log('没有需要移除的记录，跳过更新');
        return;
    }
    await writeGHFile(filepath, newContent, 'chore: auto remove outdate record', sha);

    console.log('文件更新完成');
})();
