/**
 * repoOfficialImage — 官方目录仓「仓库头像」的**唯一出处**（2026-11-23 引入；2026-11-28 改内联）。
 *
 * 为什么内联（data URL）而不再是 `linkdesk://marketplace/resources/repo-official.svg`：
 *   这张图只被**代码**按字符串 URL 引用（本文件 + RepoSlot），既不在 plugin.json 声明面、
 *   也不被 README 引用 ⇒ SDK build 通道的随包白名单（i18n / README 引用 / 声明图标 /
 *   CHANGELOG / LICENSE）够不着它 ⇒ 发布 zip 里根本没有这个文件，每台安装版都对它 404
 *   （官方仓卡片头像裂图；protocol-debug.log 实证 `404 NOT FOUND — marketplace/resources/repo-official.svg`）。
 *   SDK 白名单是**有意的**（E6#93b 明令禁止按文件位置猜测打包）——⛔ 不为一张图开洞；
 *   插件侧正解 = 构建期内联：`?raw` 进 bundle，包里不再需要独立文件，这一类 404 整类消失。
 *   资产真源仍是 `resources/repo-official.svg`（单一份，改图只改那里）。
 *
 * 消费链兼容：`useRepoAvatarSrc` → `resolveRepoAvatar` 对非 `http(s)` src **原样直通**
 *   （avatarCache.ts:262），data URL 直接进 `<img src>`，不进缓存、零网络。
 */
import raw from "../../resources/repo-official.svg?raw";

export const repoOfficialImage = `data:image/svg+xml;utf8,${encodeURIComponent(raw)}`;
