/**
 * types — 目录域的数据形状（零实现，纯声明）。
 * E6#86（第 3.6.3 轮）feature-folder 拆分：自 `marketCatalog.ts` 原样搬出，零行为变更。
 */

/** 市场目录单条目——marketplace.json plugins[] 元素（作者侧声明，sourceId 为合并时注入） */
export interface CatalogEntry {
  id: string;
  name: string;
  version: string;
  description?: string;
  /** author 兼容两种形态：文档形态 {name,url} / 旧平铺 string */
  author?: { name?: string; url?: string } | string;
  icon?: string;
  /** "lucide" | "codicon" | "url"——url 形态 = 作者自制彩色图以 img 元素直载（E6#29c/06-图标.md） */
  iconSource?: "lucide" | "codicon" | "url";
  /** E6#106：插件身份彩色图（Type-2）——**图标栏插件的 `icon` 是 Type-1 剪影，市场展示位必须读这一张**。
   *  现实形态一律 `iconSource:"url"` + 绝对 URL（publish 自动 URL 化：包内相对路径在未装态不可达，
   *  见 @linkdesk/plugin-sdk 的 `withCatalogIdentity`）。缺省 → 落 `icon` → 再缺 → 统一默认彩色块。
   *  ⚠️ 与「已装」不是一回事：已装插件读**包内** manifest（本地、断网可用）；本条只服务**未装态**。 */
  marketIcon?: string;
  marketIconSource?: "lucide" | "codicon" | "url";
  category?: string;
  categories?: string[];
  /** Marketplace-Store v2：作者身份聚合键——接 authors/<authorId>.json 作者块与 vendors.json 注册表
   *  （判定链唯一：命中 ⇒「官方 ✓」，未命中 ⇒「社区」；09 §一·补2）。展示名不参与判定（重名合法）。 */
  authorId?: string;
  /** Marketplace-Store v2：定价声明——只展示不裁决（购买走外链、验签在壳；09 §三·补3） */
  pricing?: PricingDecl;
  downloadUrl?: string;
  size?: number;
  publishedAt?: string;
  minAppVersion?: string;
  /** 版本历史（最新在前）——版本下拉数据源（E6#29c） */
  versions?: Array<{ version: string; downloadUrl?: string; publishedAt?: string; changelog?: string }>;
  readmeUrl?: string;
  /** R4-0.2（06 §二·2 媒体契约向后兼容扩宽）：string = 图片 URL（旧数据原样可读）；
   *  视频项 {type:"video",url,poster?} 至多 1 段且必须排第一（封面视频）——多段/越位的解析期丢弃并
   *  在来源页记声明提示（⛔ 不静默降级成图）；播放语义照 README 视频（controls 强制/preload=metadata/
   *  剥 autoplay/poster 优先；⛔ 不托管）。渲染器分支消费属棒 10（I12）。 */
  screenshots?: CatalogScreenshot[];
  license?: string;
  /** 合并注入：厂商注册表命中键（vendors.json 的 vendorId ↔ 条目 authorId）——命中即「官方 ✓」。
   *  判定链唯一在合并期（09 §一·补2）：UI 读本字段即可，⛔ 不许拿作者名再判一次。 */
  vendorId?: string;
  /** 合并注入：条目来源仓库名（owner/repo）——用户知道装的是谁的（E6#30c 来源标注） */
  sourceName?: string;
  /** 合并注入：该胜出条目来自官方默认源（E6#30.8f「官方发布」徽标——官方身份随条目携带，UI 零再判） */
  official?: boolean;
  /** 合并注入：该胜出条目来源的可 fetch URL——判 http 明文源用（E6#71k：http 源信任不可记忆，
   *  见 08-信任与安全 §四.2。sourceName 对 http/https 同形，判不出明文，故恒带 URL） */
  sourceUrl?: string;
  /** 作者显式声明的**插件自己的**主页（E6#77 乙）——完整 URL。非 GitHub 托管 / CDN / 自有官网的
   *  唯一出口；缺省则由 downloadUrl / readmeUrl 推（见 pluginRepoUrl），推不出 → 详情页不渲染该行 */
  repository?: string;
}

/** 画廊媒体项：string = 图片 URL（旧形态）；视频对象至多 1 段且必须排第一（06 §二·2） */
export type CatalogScreenshot = string | { type: "video"; url: string; poster?: string };

/** 定价声明（Marketplace-Store v2 · 09 §三·补3）——市场只渲染；subscription/channel 为 B3 预留枚举位 */
export interface PricingDecl {
  model: "paid" | "subscription";
  price?: number;
  currency?: string;
  period?: string;
  /** 销售页——购买流 openExternal 目标；model:"paid" 时 schema 必填 */
  licenseUrl?: string;
  refundUrl?: string;
  /** 试用天数 = 详情页静态说明（真试用门在作者代码，壳不管） */
  trialDays?: number;
  /** B3 双轨预留：self = 自销（离线签名 0 抽成）· managed = 托管（我们签发/收款/抽成） */
  channel?: "self" | "managed";
}

/** 已审核第三方源清单条目（官方目录根级 sources[]；收录 = 背书，⛔ 不收条目副本） */
export interface SourceLink {
  url: string;
  authorId: string;
  addedAt: string;
}

/** 合集声明（06 §二·3；作者数据直显不走 t()） */
export interface CollectionDecl {
  id: string;
  title: string;
  subtitle?: string;
  /** 板块副题说明字——不声明不渲染（09 §五） */
  hint?: string;
  cover?: string;
  /** 卡片原型映射：banner→hero · strip→sm 横排 · duo→lg×2 · grid→md 网格（05 §四） */
  layout?: "banner" | "strip" | "duo" | "grid";
  /** 成员 pluginId 引用——缺失条目静默跳过（照目录 merge 防御语义） */
  items: string[];
  order?: number;
}

/** 分类 rail 展示顺序声明（06 §二·3）——未注册 slug 落「其他」桶，不报错 */
export interface CategoryRailDecl {
  order: string[];
  icons?: Record<string, string>;
}

/** 厂商注册表行（vendors.json，官方目录仓根；09 §一·补2）——只有官方运营者可写 */
export interface VendorRecord {
  vendorId: string;
  name: string;
  domains?: string[];
  githubOrgs?: string[];
  verifiedBy?: string;
  verifiedAt?: string;
}

/** parse 期声明警告（06 §三/09 §二：非致命问题 ⛔ 不静默吞——来源页「N 条声明提示」数据源） */
export interface CatalogWarning {
  /** 警告类别（封闭集合；新增类别 = 改本联合 + 来源页文案） */
  code:
    | "unknown-category"
    | "unknown-subcategory"
    | "unknown-rail-category"
    | "screenshot-video-restricted"
    | "invalid-source-link"
    | "invalid-collection";
  /** 条目级警告的 pluginId；根级（rail/来源/合集）留空 */
  entryId?: string;
  /** 原值（作者自查要看得到自己写了什么） */
  detail?: string;
  /** 来源仓库名（合并期回填，作者自查定位） */
  source?: string;
}

/** marketplace.json 根结构（v2 根级字段全部可选——旧目录天然合法，06 §二·3「可选字段纪律」） */
export interface MarketplaceCatalog {
  version?: string;
  updatedAt?: string;
  plugins: CatalogEntry[];
  /** v2：官方目录的已审核第三方源清单（只有官方运营者可写） */
  sources?: SourceLink[];
  /** v2：合集声明（作者仓 marketplace.json 亦可声明） */
  collections?: CollectionDecl[];
  /** v2：分类 rail 展示顺序 */
  categoryRail?: CategoryRailDecl;
}

/** parse 结果——失败给原因（#30f 目录损坏空态判断依据，不抛）；成功附声明警告（06 §三） */
export type ParseResult =
  | { ok: true; catalog: MarketplaceCatalog; warnings: CatalogWarning[] }
  | { ok: false; reason: string };

/** 版本下拉可选单条（E6#33c——05 §四：下拉每条 {version, downloadUrl, publishedAt?, changelog?}，选中哪条拉哪条） */
export interface CatalogVersionChoice {
  version: string;
  downloadUrl: string;
  publishedAt?: string;
  changelog?: string;
}
