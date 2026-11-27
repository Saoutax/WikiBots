import { describe, expect, it } from 'vitest';
import { buildSiteReadmes, formatSchedule } from '../../scripts/lib/readmes';

interface JobOptions {
    name: string;
    description?: string;
    /** job 的 if 中引用的 cron，省略表示手动执行 */
    cron?: string;
    site?: string;
    script?: string;
    /** 把说明注释写到 job 块内，默认写在 job 上方 */
    inline?: boolean;
}

const buildJob = ({ name, description, cron, site = 'mgp', script, inline }: JobOptions) => {
    const scriptPath = script ?? `src/bot/${site}/${name}.ts`;
    const lines: string[] = [];

    if (description && !inline) {
        lines.push(`    # 说明: ${description}`);
    }
    lines.push(`    ${name}:`);
    if (description && inline) {
        lines.push(`        # 说明: ${description}`);
    }
    lines.push(
        cron
            ? `        if: github.event.schedule == '${cron}'`
            : `        if: github.event.inputs.task == '${name}'`,
        '        runs-on: ubuntu-latest',
        '        steps:',
        '            - name: Run Script',
        `              run: npx tsx ${scriptPath}`,
    );

    return lines.join('\n');
};

interface WorkflowOptions {
    name?: string;
    schedule?: string[];
    jobs: string[];
}

const buildWorkflow = ({ name = 'MGP daily', schedule = [], jobs }: WorkflowOptions) => {
    const scheduleBlock = schedule.length
        ? `    schedule:\n${schedule.map(cron => `        - cron: '${cron}'`).join('\n')}\n`
        : '';

    return `name: '${name}'

on:
${scheduleBlock}    workflow_dispatch:

jobs:
${jobs.join('\n\n')}
`;
};

describe('formatSchedule', () => {
    it('把每天执行的 cron 换算成 CST', () => {
        expect(formatSchedule(['00 17 * * *'])).toBe('每天 01:00');
        expect(formatSchedule(['20 1,13 * * *'])).toBe('每天 09:20, 21:20');
    });

    it('星期随 CST 顺延', () => {
        expect(formatSchedule(['10 16 * * 5'])).toBe('每周六 00:10');
        expect(formatSchedule(['10 17 * * 1'])).toBe('每周二 01:10');
        expect(formatSchedule(['00 19 * * 3'])).toBe('每周四 03:00');
        expect(formatSchedule(['30 16 * * 2'])).toBe('每周三 00:30');
        expect(formatSchedule(['00 8 * * 0'])).toBe('每周日 16:00');
    });

    it('把 0 和 7 都当作周日', () => {
        expect(formatSchedule(['00 16 * * 0'])).toBe('每周一 00:00');
        expect(formatSchedule(['00 16 * * 7'])).toBe('每周一 00:00');
    });

    it('多个时刻按日标签分组', () => {
        expect(formatSchedule(['00 20,8 * * 5'])).toBe('每周五 16:00；每周六 04:00');
        expect(formatSchedule(['00 17 * * *', '10 16 * * 5'])).toBe('每天 01:00；每周六 00:10');
    });

    it('没有 cron 时视为手动执行', () => {
        expect(formatSchedule([])).toBe('手动执行');
    });

    it('拒绝不支持的 cron 写法', () => {
        expect(() => formatSchedule(['*/5 17 * * *'])).toThrow('分钟只支持单个整数');
        expect(() => formatSchedule(['00 17 * * 1-5'])).toThrow('星期只支持单个整数或 *');
        expect(() => formatSchedule(['00 17 * * 1,3'])).toThrow('星期只支持单个整数或 *');
        expect(() => formatSchedule(['00 17 1 * *'])).toThrow('不支持指定日期或月份');
        expect(() => formatSchedule(['00 17 * 2 *'])).toThrow('不支持指定日期或月份');
        expect(() => formatSchedule(['00 24 * * *'])).toThrow(/expected range 0-23/);
        expect(() => formatSchedule(['60 17 * * *'])).toThrow(/expected range 0-59/);
    });
});

describe('buildSiteReadmes', () => {
    it('按 workflow 生成站点 README', () => {
        const raw = buildWorkflow({
            schedule: ['00 17 * * *', '10 17 * * 1'],
            jobs: [
                buildJob({ name: 'weekly', description: '每周任务', cron: '10 17 * * 1' }),
                buildJob({ name: 'manual', description: '手动任务' }),
                buildJob({ name: 'dailyLate', description: '每天任务', cron: '00 17 * * *' }),
            ],
        });

        const { readmes, scripts, warnings } = buildSiteReadmes([
            { fileName: 'MGP daily.yaml', raw },
        ]);

        expect(warnings).toEqual([]);
        expect(scripts).toEqual([
            'src/bot/mgp/dailyLate.ts',
            'src/bot/mgp/manual.ts',
            'src/bot/mgp/weekly.ts',
        ]);
        expect(readmes).toHaveLength(1);
        expect(readmes[0]).toEqual({
            site: 'mgp',
            path: 'src/bot/mgp/README.md',
            content: `[![MGP daily](https://github.com/Saoutax/WikiBots/actions/workflows/MGP%20daily.yaml/badge.svg)](https://github.com/Saoutax/WikiBots/actions/workflows/MGP%20daily.yaml)

| 任务 | 时间 | 内容 |
| :---: | :---: | :---: |
| [dailyLate](./dailyLate.ts) | 每天 01:00 | 每天任务 |
| [weekly](./weekly.ts) | 每周二 01:10 | 每周任务 |
| [manual](./manual.ts) | 手动执行 | 手动任务 |
`,
        });
    });

    it('读取 job 块内的说明', () => {
        const raw = buildWorkflow({
            schedule: ['00 17 * * *'],
            jobs: [
                buildJob({
                    name: 'inline',
                    description: '块内说明',
                    cron: '00 17 * * *',
                    inline: true,
                }),
            ],
        });

        const { readmes } = buildSiteReadmes([{ fileName: 'MGP daily.yaml', raw }]);

        expect(readmes[0]?.content).toContain('| [inline](./inline.ts) | 每天 01:00 | 块内说明 |');
    });

    it('缺少说明时报错并指出位置', () => {
        const raw = buildWorkflow({
            schedule: ['00 17 * * *'],
            jobs: [buildJob({ name: 'missing', cron: '00 17 * * *' })],
        });

        expect(() => buildSiteReadmes([{ fileName: 'MGP daily.yaml', raw }])).toThrow(
            'MGP daily.yaml → missing：缺少 "# 说明: " 注释',
        );
    });

    it('两处说明不一致时报错', () => {
        const raw = buildWorkflow({
            schedule: ['00 17 * * *'],
            jobs: [
                `    # 说明: 上方说明
${buildJob({ name: 'conflict', description: '块内说明', cron: '00 17 * * *', inline: true })}`,
            ],
        });

        expect(() => buildSiteReadmes([{ fileName: 'MGP daily.yaml', raw }])).toThrow(
            '存在多条不同的 "# 说明: " 注释',
        );
    });

    it('合并多个 workflow 中的同一任务，只为定时 workflow 生成徽章', () => {
        const daily = buildWorkflow({
            name: 'MGP daily',
            schedule: ['30 20 * * *'],
            jobs: [
                buildJob({ name: 'cleanSandbox', description: '清理沙盒', cron: '30 20 * * *' }),
            ],
        });
        const manually = buildWorkflow({
            name: 'Manually',
            jobs: [buildJob({ name: 'cleanSandbox', description: '清理沙盒' })],
        });

        const { readmes } = buildSiteReadmes([
            { fileName: 'MGP daily.yaml', raw: daily },
            { fileName: 'Manually.yaml', raw: manually },
        ]);

        expect(readmes[0]?.content).not.toContain('Manually');
        expect(readmes[0]?.content.match(/\| \[cleanSandbox\]/g)).toHaveLength(1);
        expect(readmes[0]?.content).toContain(
            '| [cleanSandbox](./cleanSandbox.ts) | 每天 04:30 | 清理沙盒 |',
        );
    });

    it('跳过不属于站点的仓库级任务', () => {
        const raw = buildWorkflow({
            jobs: [
                buildJob({
                    name: 'removeOutdateRecord',
                    description: '移除过期记录',
                    script: 'scripts/removeOutdateRecord.ts',
                }),
            ],
        });

        const { readmes, scripts } = buildSiteReadmes([{ fileName: 'Repository.yaml', raw }]);

        expect(readmes).toEqual([]);
        expect(scripts).toEqual([]);
    });

    it('cron 未在 on.schedule 中声明时给出警告', () => {
        const raw = buildWorkflow({
            schedule: ['00 17 * * *'],
            jobs: [buildJob({ name: 'drift', description: '时间漂移', cron: '30 20 * * *' })],
        });

        const { readmes, warnings } = buildSiteReadmes([{ fileName: 'MGP daily.yaml', raw }]);

        expect(warnings).toEqual([
            'MGP daily.yaml → drift：cron "30 20 * * *" 未出现在 on.schedule 中',
        ]);
        expect(readmes[0]?.content).toContain('| [drift](./drift.ts) | 每天 04:30 | 时间漂移 |');
    });

    it('转义表格中的竖线', () => {
        const raw = buildWorkflow({
            schedule: ['00 17 * * *'],
            jobs: [buildJob({ name: 'escape', description: 'A | B', cron: '00 17 * * *' })],
        });

        const { readmes } = buildSiteReadmes([{ fileName: 'MGP daily.yaml', raw }]);

        expect(readmes[0]?.content).toContain('| [escape](./escape.ts) | 每天 01:00 | A \\| B |');
    });

    it('支持非 4 空格缩进且不误判多行脚本内的注释', () => {
        const raw = `name: 'MGP daily'
on:
  schedule:
    - cron: '00 17 * * *'
jobs:
  # 说明: 两空格缩进任务
  twoSpaces:
    if: github.event.schedule == '00 17 * * *'
    runs-on: ubuntu-latest
    steps:
      - run: |
          # 说明: 这是脚本里的注释，不应被当作 job 说明
          npx tsx src/bot/mgp/twoSpaces.ts
`;

        const { readmes } = buildSiteReadmes([{ fileName: 'MGP daily.yaml', raw }]);

        expect(readmes[0]?.content).toContain(
            '| [twoSpaces](./twoSpaces.ts) | 每天 01:00 | 两空格缩进任务 |',
        );
    });
});
