import { describe, expect, it } from 'vitest';
import { deriveTalkPage, normalizeTitleKey, sameTitle } from '@/wikitext/title';

describe('sameTitle', () => {
    it('忽略下划线、空格与首尾空白', () => {
        expect(sameTitle('Talk:标题_甲', ' Talk:标题 甲 ')).toBe(true);
    });

    it('不同标题返回 false', () => {
        expect(sameTitle('Talk:甲', 'Talk:乙')).toBe(false);
    });
});

describe('deriveTalkPage', () => {
    it('条目推导为 Talk:', () => {
        expect(deriveTalkPage('条目甲')).toBe('Talk:条目甲');
    });

    it('文件推导为 File_talk:', () => {
        expect(deriveTalkPage('File:图片乙.jpg')).toBe('File_talk:图片乙.jpg');
    });

    it('去掉前导冒号', () => {
        expect(deriveTalkPage(':File:图片乙.jpg')).toBe('File_talk:图片乙.jpg');
    });

    it('空标题返回 undefined', () => {
        expect(deriveTalkPage('  ')).toBeUndefined();
    });
});

describe('normalizeTitleKey', () => {
    it.each([
        ['ps/styles.css', 'Template:Ps/styles.css'],
        ['Template:Link/page.css', 'Template:Link/page.css'],
        [':Template:渐变发光/style.css', 'Template:渐变发光/style.css'],
        ['T:Mjs/styles.css', 'Template:Mjs/styles.css'],
        ['用户_用户页/styles.css', 'Template:用户 用户页/styles.css'],
        [':盲盒派对/styles.css', '盲盒派对/styles.css'],
    ])('把 %s 归一化为 %s', (title, expected) => {
        expect(normalizeTitleKey(title)).toBe(expected);
    });
});
