[![MGP daily](https://github.com/Saoutax/WikiBots/actions/workflows/MGP%20daily.yaml/badge.svg)](https://github.com/Saoutax/WikiBots/actions/workflows/MGP%20daily.yaml)

|                   任务                    |       时间        |                                        内容                                        |
| :---------------------------------------: | :---------------: | :--------------------------------------------------------------------------------: |
|    [disambigLinks](./disambigLinks.ts)    |   每周六 00:10    | 更新[萌娘百科:疑似链入消歧义页面的条目](https://mzh.moegirl.org.cn/_?curid=545554) |
|  [removeExtraPipe](./removeExtraPipe.ts)  |    每天 01:00     |                           扫描最近更改，移除多余的管道符                           |
|    [highRiskCount](./highRiskCount.ts)    |   每周四 03:00    |                        更新被标记{{Highrisk}}的模板使用数量                        |
|          [markImg](./markImg.ts)          |    每天 04:00     |              根据`#疑似外链调用内部文件`为文件添加{{非链入使用}}模板               |
|     [deleteUnused](./deleteUnused.ts)     |   每周六 05:00    |                             删除特定分类下的无使用文件                             |
|   [deleteRedirect](./deleteRedirect.ts)   | 每天 09:20, 21:20 |                        删除昨日无使用的共享站移动残留重定向                        |
| [correctNavFormat](./correctNavFormat.ts) |   每周三 02:00    |                             修复{{Navbox}}常见错误排版                             |
|     [linkModifier](./linkModifier.ts)     |     手动执行      |                          根据配置文件替换页面中的链接目标                          |
|          [monthly](./monthly.ts)          |     手动执行      |                             向订阅用户发送萌娘百科月报                             |
