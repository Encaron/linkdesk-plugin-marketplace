# 插件市场（marketplace）· 本仓档案集

> 🏠 **本插件的缺陷立案与修复档住在这里**（`docs/`）。**平台层（SDK / 壳）的正典立案住壳仓** [docs/02-Electron架构/插件生态与发布/](https://github.com/Encaron/linkdesk/tree/electron/docs/02-Electron%E6%9E%B6%E6%9E%84/%E6%8F%92%E4%BB%B6%E7%94%9F%E6%80%81%E4%B8%8E%E5%8F%91%E5%B8%83)——两处互相指认，各写自己那一层，⛔ 不互相复制正文。
> ⚠️ 进度唯一真相源 = 各档案自己的「状态」行；E6 主线真相源不动：[E6-执行清单.md](https://github.com/Encaron/linkdesk/blob/electron/docs/02-Electron%E6%9E%B6%E6%9E%84/%E6%8F%92%E4%BB%B6%E7%94%9F%E6%80%81%E4%B8%8E%E5%8F%91%E5%B8%83/E6-%E6%89%A7%E8%A1%8C%E6%B8%85%E5%8D%95.md)。
> ⚠️ **源码位置**：本插件源码自 2026-09-14 起住在**仓外** `Encaron/linkdesk-plugin-marketplace`（本地工作区 `E:\linkdesk-plugins\official\marketplace`）。壳仓只留 `bundled-plugins/marketplace.linkdesk-plugin`（出厂首启种子）与文档指针。

| 档案 | 状态 | 内容 |
|:--|:--|:--|
| [01-多表面共享状态塌缩-立案与修复.md](./01-多表面共享状态塌缩-立案与修复.md) | ✅ **已修（1.1.6，2026-09-30）** ＋ 平台层正典另立案（壳仓 12 号） | 用户实机立案：「检查更新」后侧栏行翻新、主区详情页不翻新（须重启）。根因 = SDK 多表面打包把模块级单例在表面间各复制一份 ⇒「模块级 = 跨视图唯一真相」失效。修 = `src/services/realmSlot.ts` 地基 + 8 处模块级可变状态入 realm 槽（含搜索跨表面过滤一条静默失效同笔修复） |

## 发布路径（改本插件源码前先读这条）

marketplace 是 `distribution: builtin` ＋ `core: true` 的随包插件 ⇒ 修缺陷走**插件版本轴**（1.1.x），不占软件版本号。四件事必须同笔（顺序固定）：

① bump **`plugin.json` version**（版本真源；`package.json` 同值跟进）＋ `CHANGELOG.md` 一笔；
② `npm run verify` 六段绿 ＋ `test` ＋ **`build`**（⚠️ publish 不 build、复用 dist——改了代码不 build 会发 stale 资产）；
③ 发 GitHub Release（`npm run publish -- --yes`）→ 下载资产复核包内 `plugin.json.version` == 目录版本 → 官方目录收录（`npm run catalog:official` 出候选，只增改自己那行；目录仓 = `E:\linkdesk-marketplace`，**这一条才是已装用户的更新通道**）；
④ `sync:bundled --latest`（本仓是出厂种子之一 ⇒ 壳仓 `bundled-plugins/marketplace.linkdesk-plugin` 同笔刷新）＋ `release:mark` 基线。

⚠️ **装了新版但界面没变？先重启再看**——壳池按 URL `import()` 表面 bundle、不做 cache-bust：**同 URL 的模块图不随磁盘替换而重载**，运行中的旧副本会一直活到重启（2026-09-30 实机复验的判据，细节 → 01 档 §七）。
