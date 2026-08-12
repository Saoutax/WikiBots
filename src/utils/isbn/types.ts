/** ISBN 号段规则（registrant 长度规则） */
interface Rule {
    start: number;
    end: number;
    registrantLength: number;
}

/** ISBN 注册分组（如 978-0、978-7） */
interface Group {
    gs1: string;
    group: string;
    rules: Rule[];
}

/** 模板规范化改动统计 */
interface ChangeReport {
    booksourceLinks: number;
    isbnNormalised: number;
    isbn10Converted: number;
    isbntMerged: number;
    isbnReformatted: number;
}

/** 模板名映射：canonical 片段 → 首选模板名 */
interface TemplatePreferences {
    [key: string]: string;
}

/** ISBN 模板规范化选项 */
interface TemplateNormaliseOptions {
    convert10To13?: boolean;
    rehyphenateEqualLabel?: boolean;
    templatePreferences?: TemplatePreferences;
}

/** RangeMessage.xml 中 Group 的原始结构 */
interface RawGroup {
    Prefix?: string;
    Rules?: { Rule?: RawRule[] };
}

/** RangeMessage.xml 中 Rule 的原始结构 */
interface RawRule {
    Range?: string;
    Length?: string;
}

export {
    type Rule,
    type Group,
    type ChangeReport,
    type TemplatePreferences,
    type TemplateNormaliseOptions,
    type RawGroup,
    type RawRule,
};
