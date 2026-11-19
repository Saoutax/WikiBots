import { readGHFile, writeGHFile } from '@/utils';
import { filterOutdatedRecords } from './lib/outdatedRecords';

(async () => {
    const filepath = 'data/inUsedRedirect.json',
        { content, sha } = await readGHFile(filepath),
        data = JSON.parse(content) as Record<string, string[]>,
        original = JSON.stringify(data, null, 4);

    const { filtered, removed } = filterOutdatedRecords(data);

    removed.forEach(timestamp => {
        console.log(`移除超过14天的记录: ${timestamp} (${data[timestamp]?.length} 个项目)`);
    });

    console.log(`总共移除了 ${removed.length} 个超过14天的记录`);

    const newContent = JSON.stringify(filtered, null, 4);

    if (newContent === original) {
        console.log('没有需要移除的记录，跳过更新');
        return;
    }
    await writeGHFile(filepath, newContent, 'chore: auto remove outdate record', sha);

    console.log('文件更新完成');
})();
