import { load } from 'js-yaml';

/**
 * 站点 README 的生成逻辑
 *
 * workflow 是任务清单与调度时间的唯一来源，job 上方的 `# 说明: ` 注释提供「内容」列。
 * 本模块只处理字符串，不访问文件系统，便于单元测试。
 */

/** 徽章使用的仓库地址，与 `src/utils/readAndWrite.ts` 中的硬编码保持一致。 */
const REPO_URL = 'https://github.com/Saoutax/WikiBots';

/** 中国标准时间相对 UTC 的分钟偏移。 */
const CST_OFFSET_MINUTES = 480;

/** 一天的分钟数。 */
const MINUTES_PER_DAY = 1440;

/** 星期名称，索引与 `Date#getDay` 一致。 */
const WEEKDAY_NAMES = ['日', '一', '二', '三', '四', '五', '六'];

/** 显示与排序时按周一在前排列。 */
const WEEKDAY_RANK: Record<number, number> = { 1: 0, 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 0: 6 };

/** job 说明注释的标记，兼容全角与半角冒号。 */
const DESCRIPTION_PATTERN = /^\s*#\s*说明\s*[:：]\s*(.+?)\s*$/;

/** YAML 中形如 `key:` 的行，缩进不超过 4 个空格时视为 job 或顶层键。 */
const KEY_LINE_PATTERN = /^\s{0,4}[^\s#][^:]*:\s*(#.*)?$/;

/** 缩进不超过 4 个空格的注释属于 job 级，标志当前 job 块结束。 */
const JOB_LEVEL_COMMENT_PATTERN = /^\s{0,4}#/;

/** 站点脚本路径，如 `src/bot/mgp/deleteRedirect.ts`。 */
const SCRIPT_PATH_PATTERN = /^src\/bot\/([^/]+)\/([^/]+)\.ts$/;

/** job 步骤中的脚本入口。 */
const TSX_PATTERN = /npx\s+tsx\s+(\S+)/;

interface WorkflowFile {
    /** workflow 文件名，如 `MGP daily.yaml` */
    fileName: string;
    /** 文件原文 */
    raw: string;
}

interface CronTime {
    /** 本地星期，`null` 表示每天执行 */
    weekday: number | null;
    /** 本地时间在一天中的分钟数 */
    minutes: number;
}

interface JobTask {
    site: string;
    task: string;
    scriptPath: string;
    description: string;
    scheduleLabel: string;
    /** 渲染顺序比较键：定时/手动、每天/每周、星期、时间 */
    sortKey: [number, number, number, number];
}

interface SiteReadme {
    site: string;
    /** 相对仓库根目录的路径 */
    path: string;
    content: string;
}

interface ReadmeResult {
    readmes: SiteReadme[];
    /** 生成过程中发现但不阻断的问题 */
    warnings: string[];
    /** 引用的脚本路径，调用方可据此检查文件是否存在 */
    scripts: string[];
}

interface ScheduleEntry {
    cron?: string;
}

interface JobStep {
    run?: string;
}

interface JobDefinition {
    if?: string;
    steps?: JobStep[];
}

interface WorkflowDoc {
    name?: string;
    on?: { schedule?: ScheduleEntry[] };
    jobs?: Record<string, JobDefinition>;
}

interface JobRecord {
    site: string;
    task: string;
    scriptPath: string;
    workflow: string;
    crons: string[];
    description: string;
}

interface ParsedWorkflow {
    fileName: string;
    name: string;
    /** workflow 是否声明了定时调度，决定是否生成徽章 */
    scheduled: boolean;
    /** `on.schedule` 中声明的 cron */
    schedule: string[];
    jobs: JobRecord[];
}

interface Badge {
    name: string;
    fileName: string;
}

const parseInteger = (value: string, min: number, max: number, label: string, cron: string) => {
    if (!/^\d+$/.test(value)) {
        throw new Error(`${label}不是整数：${cron}`);
    }

    const parsed = Number(value);
    if (parsed < min || parsed > max) {
        throw new Error(`${label}超出 ${min} 到 ${max} 的范围：${cron}`);
    }

    return parsed;
};

/**
 * 解析 cron 表达式，返回 UTC 时间换算成 CST 后的执行时刻
 *
 * 只支持「分钟 小时 * * 星期」这一形态，小时可以是逗号分隔的列表。
 */
const parseCron = (cron: string): CronTime[] => {
    const fields = cron.trim().split(/\s+/);
    if (fields.length !== 5) {
        throw new Error(`cron 需要 5 个字段：${cron}`);
    }

    const [minuteField, hourField, dayField, monthField, weekdayField] = fields;
    if (!minuteField || !hourField || !dayField || !monthField || !weekdayField) {
        throw new Error(`cron 存在空字段：${cron}`);
    }

    if (dayField !== '*' || monthField !== '*') {
        throw new Error(`不支持指定日期或月份的 cron：${cron}`);
    }

    const minute = parseInteger(minuteField, 0, 59, '分钟', cron);
    const hours = hourField.split(',').map(hour => parseInteger(hour, 0, 23, '小时', cron));
    const weekday =
        weekdayField === '*' ? null : parseInteger(weekdayField, 0, 7, '星期', cron) % 7;

    return hours.map(hour => {
        const total = hour * 60 + minute + CST_OFFSET_MINUTES;

        return {
            weekday: weekday === null ? null : (weekday + Math.floor(total / MINUTES_PER_DAY)) % 7,
            minutes: total % MINUTES_PER_DAY,
        };
    });
};

const formatMinutes = (minutes: number) =>
    `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

const weekdaySortValue = (weekday: number | null) =>
    weekday === null ? -1 : (WEEKDAY_RANK[weekday] ?? 0);

/**
 * 把一组 cron 渲染成 README 的时间列，未传 cron 视为手动执行
 *
 * 同一任务存在多条 cron 时按日标签分组，例如「每天 01:00, 09:00」。
 */
const formatSchedule = (crons: string[]): string => {
    const times = crons.flatMap(cron => parseCron(cron));
    if (times.length === 0) {
        return '手动执行';
    }

    const groups = new Map<number | null, Set<number>>();
    for (const { weekday, minutes } of times) {
        const group = groups.get(weekday) ?? new Set<number>();
        group.add(minutes);
        groups.set(weekday, group);
    }

    return [...groups.keys()]
        .sort((a, b) => weekdaySortValue(a) - weekdaySortValue(b))
        .map(weekday => {
            const label = weekday === null ? '每天' : `每周${WEEKDAY_NAMES[weekday] ?? ''}`;
            const list = [...(groups.get(weekday) ?? [])].sort((a, b) => a - b);

            return `${label} ${list.map(formatMinutes).join(', ')}`;
        })
        .join('；');
};

/** 渲染顺序的比较键，定时任务在前，每天先于每周，手动任务最后。 */
const buildSortKey = (crons: string[]): JobTask['sortKey'] => {
    const ranked = crons
        .flatMap(cron => parseCron(cron))
        .map(({ weekday, minutes }): [number, number, number] =>
            weekday === null ? [0, 0, minutes] : [1, WEEKDAY_RANK[weekday] ?? 0, minutes],
        )
        .sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);

    const first = ranked[0];
    if (!first) {
        return [1, 0, 0, 0];
    }

    return [0, first[0], first[1], first[2]];
};

const compareTasks = (a: JobTask, b: JobTask) => {
    for (let index = 0; index < a.sortKey.length; index++) {
        const diff = (a.sortKey[index] ?? 0) - (b.sortKey[index] ?? 0);
        if (diff !== 0) {
            return diff;
        }
    }

    return a.task < b.task ? -1 : a.task > b.task ? 1 : 0;
};

const readCrons = (condition: string | undefined): string[] => {
    const pattern = /github\.event\.schedule\s*==\s*['"]([^'"]+)['"]/g;

    return [...(condition ?? '').matchAll(pattern)].flatMap(match => (match[1] ? [match[1]] : []));
};

const findJobLine = (lines: string[], jobName: string) => {
    for (let index = 0; index < lines.length; index++) {
        const line = lines[index] ?? '';
        const match = /^(\s*)([^\s#][^:]*):\s*$/.exec(line);
        if (match && match[2] === jobName && (match[1] ?? '').length < 8) {
            return index;
        }
    }

    return -1;
};

/**
 * 读取 job 的说明注释
 *
 * 注释可以写在 job 上方，也可以写在 job 块内；两处内容不一致时报错。
 */
const readDescription = (raw: string, jobName: string, fileName: string) => {
    const lines = raw.split(/\r?\n/);
    const start = findJobLine(lines, jobName);
    if (start === -1) {
        throw new Error(`${fileName} → ${jobName}：没有找到 job 定义`);
    }

    const candidates: string[] = [];
    const pushCandidate = (line: string) => {
        const value = DESCRIPTION_PATTERN.exec(line)?.[1]?.trim();
        if (value) {
            candidates.push(value);
        }
    };

    for (let index = start - 1; index >= 0; index--) {
        const line = lines[index] ?? '';
        if (!line.trimStart().startsWith('#')) {
            break;
        }
        pushCandidate(line);
    }

    for (let index = start + 1; index < lines.length; index++) {
        const line = lines[index] ?? '';
        if (KEY_LINE_PATTERN.test(line) || JOB_LEVEL_COMMENT_PATTERN.test(line)) {
            break;
        }
        pushCandidate(line);
    }

    const unique = [...new Set(candidates)];
    if (unique.length === 0) {
        throw new Error(`${fileName} → ${jobName}：缺少 "# 说明: " 注释`);
    }
    if (unique.length > 1) {
        throw new Error(`${fileName} → ${jobName}：存在多条不同的 "# 说明: " 注释`);
    }

    return unique[0]!;
};

/**
 * 从 job 的步骤中找出站点脚本路径
 *
 * 非 `src/bot/` 下的脚本属于仓库级任务，返回 `undefined`。
 */
const readScript = (definition: JobDefinition, fileName: string, jobName: string) => {
    const paths: string[] = [];
    for (const step of definition.steps ?? []) {
        const run = step.run?.trim();
        if (!run) {
            continue;
        }

        const match = TSX_PATTERN.exec(run);
        if (match?.[1]?.startsWith('src/bot/')) {
            paths.push(match[1]);
        }
    }

    if (paths.length === 0) {
        return undefined;
    }
    if (paths.length > 1) {
        throw new Error(`${fileName} → ${jobName}：一个 job 运行了多个站点脚本`);
    }

    const path = paths[0]!;
    const match = SCRIPT_PATH_PATTERN.exec(path);
    if (!match) {
        throw new Error(`${fileName} → ${jobName}：无法解析脚本路径 ${path}`);
    }

    return { path, site: match[1]!, task: match[2]! };
};

const parseWorkflow = ({ fileName, raw }: WorkflowFile): ParsedWorkflow => {
    const doc = (load(raw) as WorkflowDoc | undefined) ?? {};
    const schedule = (doc.on?.schedule ?? [])
        .map(entry => entry.cron)
        .filter((cron): cron is string => typeof cron === 'string' && cron.trim() !== '');
    const name = doc.name?.trim() || fileName.replace(/\.ya?ml$/i, '');
    const jobs: JobRecord[] = [];

    for (const [jobName, definition] of Object.entries(doc.jobs ?? {})) {
        const script = readScript(definition, fileName, jobName);
        if (!script) {
            continue;
        }

        jobs.push({
            site: script.site,
            task: script.task,
            scriptPath: script.path,
            workflow: fileName,
            crons: readCrons(definition.if),
            description: readDescription(raw, jobName, fileName),
        });
    }

    return { fileName, name, scheduled: schedule.length > 0, schedule, jobs };
};

const escapeCell = (text: string) => text.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');

const renderReadme = (badges: Badge[], tasks: JobTask[]): string => {
    const blocks: string[] = [];

    if (badges.length > 0) {
        blocks.push(
            badges
                .map(({ name, fileName }) => {
                    const url = `${REPO_URL}/actions/workflows/${encodeURIComponent(fileName)}`;

                    return `[![${name}](${url}/badge.svg)](${url})`;
                })
                .join('\n'),
        );
    }

    const rows = tasks.map(
        task =>
            `| [${task.task}](./${task.task}.ts) | ${task.scheduleLabel} | ${escapeCell(task.description)} |`,
    );
    blocks.push(['| 任务 | 时间 | 内容 |', '| :---: | :---: | :---: |', ...rows].join('\n'));

    return `${blocks.join('\n\n')}\n`;
};

/**
 * 解析 workflow 文件，生成各站点的 README 内容
 *
 * 缺少说明注释或 cron 不受支持时抛出错误；cron 未在 `on.schedule` 中声明时只记录警告。
 */
const buildSiteReadmes = (files: WorkflowFile[]): ReadmeResult => {
    const warnings: string[] = [];
    const parsedFiles = files.map(file => parseWorkflow(file));
    const merged = new Map<string, JobRecord>();

    for (const parsed of parsedFiles) {
        for (const record of parsed.jobs) {
            for (const cron of record.crons) {
                if (!parsed.schedule.includes(cron)) {
                    warnings.push(
                        `${record.workflow} → ${record.task}：cron "${cron}" 未出现在 on.schedule 中`,
                    );
                }
            }

            const key = `${record.site}/${record.task}`;
            const existing = merged.get(key);
            if (!existing) {
                merged.set(key, { ...record, crons: [...record.crons] });
                continue;
            }
            if (existing.description !== record.description) {
                throw new Error(
                    `${key}：${existing.workflow} 与 ${record.workflow} 的说明注释不一致`,
                );
            }
            for (const cron of record.crons) {
                if (!existing.crons.includes(cron)) {
                    existing.crons.push(cron);
                }
            }
        }
    }

    const sites = new Map<string, JobRecord[]>();
    for (const record of merged.values()) {
        const records = sites.get(record.site) ?? [];
        records.push(record);
        sites.set(record.site, records);
    }

    const readmes: SiteReadme[] = [];
    const scripts = new Set<string>();

    for (const site of [...sites.keys()].sort()) {
        const records = sites.get(site) ?? [];
        const tasks = records.map((record): JobTask => ({
            site,
            task: record.task,
            scriptPath: record.scriptPath,
            description: record.description,
            scheduleLabel: formatSchedule(record.crons),
            sortKey: buildSortKey(record.crons),
        }));

        tasks.sort(compareTasks);
        tasks.forEach(task => scripts.add(task.scriptPath));

        const badges = parsedFiles
            .filter(
                parsed =>
                    parsed.scheduled && records.some(record => record.workflow === parsed.fileName),
            )
            .sort((a, b) => (a.fileName < b.fileName ? -1 : a.fileName > b.fileName ? 1 : 0))
            .map(parsed => ({ name: parsed.name, fileName: parsed.fileName }));

        readmes.push({
            site,
            path: `src/bot/${site}/README.md`,
            content: renderReadme(badges, tasks),
        });
    }

    return { readmes, warnings, scripts: [...scripts].sort() };
};

export { buildSiteReadmes, formatSchedule };
export type { ReadmeResult, SiteReadme, WorkflowFile };
