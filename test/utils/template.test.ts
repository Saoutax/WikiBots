import { describe, expect, it } from 'vitest';
import Parser from 'wikiparser-node';
import { findTemplates, normalizeTemplateName } from '@/utils/template';

describe('normalizeTemplateName', () => {
    it('去掉 Template: 前缀并转小写', () => {
        expect(normalizeTemplateName('Template:Archive_top')).toBe('archive top');
    });

    it('保留中文模板名', () => {
        expect(normalizeTemplateName('template:存档至')).toBe('存档至');
        expect(normalizeTemplateName('Template:存檔至')).toBe('存檔至');
    });

    it('去除首尾空白', () => {
        expect(normalizeTemplateName(' Article2 ')).toBe('article2');
    });
});

describe('findTemplates', () => {
    const root = Parser.parse('{{Archive top|status=+}}{{存档至|Talk:条目甲}}{{archive bottom}}');

    it('按规范化名称查找模板', () => {
        expect(findTemplates(root, 'archive top')).toHaveLength(1);
        expect(findTemplates(root, 'Archive_Bottom')).toHaveLength(1);
        expect(findTemplates(root, 'article2', '存档至')).toHaveLength(1);
    });

    it('未命中时返回空数组', () => {
        expect(findTemplates(root, 'make public')).toEqual([]);
    });
});
