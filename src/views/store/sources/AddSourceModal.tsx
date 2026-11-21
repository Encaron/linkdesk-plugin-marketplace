/**
 * AddSourceModal — 主区「添加来源」弹窗（R4-3.15 / I17；09 §三·补2）。
 *
 * 两个页签：
 *   - **网络地址**：先拉后入——校验（复用 `decideAddSource` 的同一判据）→ 拉取预览（`previewRemoteSource`，
 *     K5 回落链同源）→ 确认才调命令 `marketplace.addSource` 落盘；拉不到不落盘；
 *   - **本地文件夹**：系统目录选择器 → 读 `plugin.json` 预览 → 确认调命令 `marketplace.addLocalPlugin`
 *     （壳 `installFromDirectory` 复制安装＋记 `localInstalls` 溯源）。
 *
 * 🔴 浮空覆盖层必进 `#ld-float-layer`（硬性规定）：本件用 `@linkdesk/ui` 的 `OverlayPortal`
 *   （默认 `#overlay-root`，坐落浮层权威容器内；壳侧 DOM 自动回退 body）。⛔ 层外自绘。
 */

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { OverlayPortal } from "@linkdesk/ui";
import { Icon } from "../../../ui";
import { openExternal, showToast } from "../../../services/hostApi";

/** 作者模板（K5 末档「未找到…＋模板链接」的落点；模板 = 官方脚手架） */
export const PLUGIN_TEMPLATE_URL = "https://www.npmjs.com/package/create-linkdesk-plugin";
import { decideAddSource } from "../../../services/marketSourceAdd";
import { readConfiguredAuthorSources } from "../../../services/marketSources";
import { previewRemoteSource } from "../../../services/sourceAdmin";

export type AddSourceMode = "remote" | "local";

interface Message {
  kind: "ok" | "bad";
  text: string;
}

function localPathOk(raw: string): boolean {
  const p = raw.trim();
  return /[\\/]/.test(p) && p.length >= 3;
}

export function AddSourceModal({
  open,
  initialMode = "remote",
  onClose,
}: {
  open: boolean;
  initialMode?: AddSourceMode;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<AddSourceMode>(initialMode);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState<"check" | "confirm">("check");
  const [message, setMessage] = useState<Message | null>(null);
  const [preview, setPreview] = useState<{ title: string; sub: string } | null>(null);
  const [showTemplate, setShowTemplate] = useState(false);

  useEffect(() => {
    if (!open) return;
    setMode(initialMode);
    setValue("");
    setBusy(false);
    setStage("check");
    setMessage(null);
    setPreview(null);
    setShowTemplate(false);
  }, [open, initialMode]);

  if (!open) return null;

  const setModeClean = (m: AddSourceMode) => {
    setMode(m);
    setValue("");
    setStage("check");
    setMessage(null);
    setPreview(null);
    setShowTemplate(false);
    setBusy(false);
  };

  const validate = async (): Promise<boolean> => {
    const v = value.trim();
    if (mode === "local") {
      if (!localPathOk(v)) {
        setMessage({ kind: "bad", text: t("填完整文件夹路径，例如 E:\\tools\\my-plugin") });
        return false;
      }
      return true;
    }
    const current = await readConfiguredAuthorSources();
    const decision = decideAddSource(v, current);
    if (decision.ok) return true;
    const text =
      decision.reason === "empty"
        ? ""
        : decision.reason === "bad-url"
          ? t("只认 GitHub 仓库主页（github.com/owner/repo）或 marketplace.json 直链")
          : decision.reason === "official"
            ? t("官方来源已内置，无需添加")
            : t("该源已在列表中");
    setMessage(text ? { kind: "bad", text } : null);
    return false;
  };

  const browseLocal = async () => {
    const dialog = (window.linkdesk as unknown as { dialog?: { open?: (o: unknown) => Promise<string | null> } } | undefined)?.dialog;
    if (!dialog?.open) return;
    try {
      const picked = await dialog.open({
        directory: true,
        title: t("选择插件文件夹（含 plugin.json）"),
      });
      if (picked) {
        setValue(picked);
        setStage("check");
        setPreview(null);
        setMessage(null);
      }
    } catch {
      /* 取消/不可用——保持输入态 */
    }
  };

  const previewLocal = async (): Promise<boolean> => {
    const path = value.trim();
    const fs = (window.linkdesk as unknown as {
      filesystem?: { readTextFile?: (p: string) => Promise<string> };
      path?: { join?: (...p: string[]) => string };
    } | undefined);
    const join = fs?.path?.join;
    const manifestPath = join ? join(path, "plugin.json") : `${path.replace(/[\\/]+$/, "")}\\plugin.json`;
    try {
      const text = await fs?.filesystem?.readTextFile?.(manifestPath);
      if (!text) throw new Error("no-fs");
      const json = JSON.parse(text) as { name?: unknown; version?: unknown; author?: unknown };
      const name = typeof json.name === "string" ? json.name : path.split(/[\\/]/).filter(Boolean).pop() ?? "";
      const version = typeof json.version === "string" ? json.version : "";
      const author = typeof json.author === "string" ? json.author : "";
      setPreview({
        title: name,
        sub: `${t("本地文件夹")} · ${path}${version ? ` · v${version}` : ""}${author ? ` · ${author}` : ""}`,
      });
      setMessage({ kind: "ok", text: t("已读取 plugin.json——确认后复制安装到本机插件目录，原文件夹不受影响") });
      return true;
    } catch {
      setPreview(null);
      setMessage({ kind: "bad", text: t("该文件夹里没有可读的 plugin.json") });
      return false;
    }
  };

  const previewRemote = async (): Promise<boolean> => {
    setBusy(true);
    try {
      const r = await previewRemoteSource(value);
      if (!r.ok) {
        const text =
          r.reason === "official"
            ? t("官方来源已内置，无需添加")
            : r.reason === "duplicate"
              ? t("该源已在列表中")
              : r.reason === "network"
                ? t("拉取失败——检查网络后重试（拉不到不落盘）")
                : t("未找到 marketplace.json 或 plugin.json——仓库根需有其一");
        setMessage({ kind: "bad", text });
        setPreview(null);
        setShowTemplate(r.reason === "missing");
        return false;
      }
      const owner = r.existingAuthorId
        ? t("已存在作者「{{name}}」——将并入该作者：仓库数 +1", { name: r.existingAuthorId })
        : t("新作者 · {{count}} 个插件", { count: r.count ?? 0 });
      setPreview({
        title: r.name ?? value.trim(),
        sub: `${r.kind === "plugin" ? t("单插件仓（plugin.json 合成 1 条）") : t("市场源（marketplace.json）")} · ${owner}`,
      });
      setMessage({ kind: "ok", text: t("目录获取成功——确认后写入市场源（与设置页同一配置项）") });
      return true;
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (stage === "check") {
        if (!(await validate())) return;
        const ok = mode === "local" ? await previewLocal() : await previewRemote();
        if (ok) setStage("confirm");
        return;
      }
      const cmd = window.linkdesk?.commands?.executeCommand;
      if (mode === "local") {
        const r = (await cmd?.("marketplace.addLocalPlugin", { path: value.trim() })) as
          | { ok?: boolean; reason?: string }
          | undefined;
        if (r?.ok) {
          const name = preview?.title ?? value.trim();
          onClose();
          showToast(t("已添加本地插件 · {{name}}", { name }), {
            severity: "success",
            key: "add-local-plugin",
          });
          return;
        }
        setMessage({
          kind: "bad",
          text:
            r?.reason === "exists"
              ? t("同 id 插件已安装——先卸载或换一个文件夹")
              : r?.reason === "core-forbidden"
                ? t("本地插件不得声明 core:true")
                : t("本地安装失败（{{reason}}）", { reason: r?.reason ?? "io" }),
        });
        setStage("check");
        return;
      }
      const r = (await cmd?.("marketplace.addSource", { url: value.trim() })) as
        | { ok?: boolean; added?: string; noop?: boolean; reason?: string }
        | undefined;
      if (r?.ok && r.added) {
        onClose();
        showToast(t("已添加来源 · {{url}}", { url: r.added }), {
          severity: "success",
          key: "add-source",
        });
        return;
      }
      setMessage({
        kind: "bad",
        text:
          r?.reason === "official"
            ? t("官方来源已内置，无需添加")
            : r?.reason === "duplicate"
              ? t("该源已在列表中")
              : t("添加失败（{{reason}}）", { reason: r?.reason ?? "io" }),
      });
      setStage("check");
    } catch (e) {
      setMessage({ kind: "bad", text: e instanceof Error ? e.message : String(e) });
      setStage("check");
    } finally {
      setBusy(false);
    }
  };

  return (
    <OverlayPortal onClose={busy ? undefined : onClose} trapFocus>
      <div
        className="marketplace-store-modal-bg"
        role="presentation"
        onClick={(e) => {
          if (e.target === e.currentTarget && !busy) onClose();
        }}
      >
        <div className="marketplace-store-modal" role="dialog" aria-modal="true" aria-label={t("添加来源")}>
          <h2>{t("添加来源")}</h2>
          <div className="marketplace-store-m-tabs" role="tablist" aria-label={t("来源类型")}>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "remote"}
              className={`marketplace-store-m-tab ${mode === "remote" ? "is-on" : ""}`}
              onClick={() => setModeClean("remote")}
            >
              {t("网络地址")}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "local"}
              className={`marketplace-store-m-tab ${mode === "local" ? "is-on" : ""}`}
              onClick={() => setModeClean("local")}
            >
              {t("本地文件夹")}
            </button>
          </div>
          <div className="marketplace-store-m-sub">
            {mode === "remote"
              ? t("粘贴 GitHub 仓库主页，或 marketplace.json 直链——官方源已内置，无需添加。")
              : t("选择一个插件文件夹（含 plugin.json）或 .linkdesk-plugin 离线包——确认后复制安装到本机插件目录，原路径只作溯源。")}
          </div>
          <div className="marketplace-store-m-field">
            <Icon name={mode === "remote" ? "link" : "folder"} size="sm" />
            <input
              type="text"
              value={value}
              placeholder={mode === "remote" ? "https://github.com/owner/repo" : "E:\\tools\\my-plugin"}
              aria-label={mode === "remote" ? t("来源地址") : t("插件文件夹路径")}
              onChange={(e) => {
                setValue(e.target.value);
                setStage("check");
                setMessage(null);
                setPreview(null);
                setShowTemplate(false);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") void submit();
              }}
            />
            {mode === "local" && (
              <button type="button" className="marketplace-store-sbtn" onClick={() => void browseLocal()}>
                {t("浏览…")}
              </button>
            )}
          </div>
          <div className="marketplace-store-m-hint">
            {mode === "remote"
              ? t("支持 github.com/owner/repo 或 raw.githubusercontent.com/…/marketplace.json")
              : t("只收单个插件（文件夹内有 plugin.json）或 .linkdesk-plugin 包；⛔ 多插件目录暂不支持")}
          </div>
          {message && <div className={`marketplace-store-m-msg is-${message.kind}`}>{message.text}</div>}
          {showTemplate && (
            <button
              type="button"
              className="marketplace-store-m-link"
              onClick={() => void openExternal(PLUGIN_TEMPLATE_URL)}
            >
              {t("打开插件模板（npx create-linkdesk-plugin@latest）")}
            </button>
          )}
          {preview && (
            <div className="marketplace-store-m-preview">
              <span className="marketplace-store-mp-av">
                <Icon name="folder" size="sm" />
              </span>
              <div>
                <div className="marketplace-store-mp-n">{preview.title}</div>
                <div className="marketplace-store-mp-s">{preview.sub}</div>
              </div>
            </div>
          )}
          <div className="marketplace-store-m-foot">
            <button type="button" className="marketplace-ui-btn is-secondary" onClick={onClose} disabled={busy}>
              {t("取消")}
            </button>
            <button
              type="button"
              className="marketplace-ui-btn is-primary"
              disabled={busy || !value.trim()}
              onClick={() => void submit()}
            >
              {busy
                ? t("处理中…")
                : stage === "confirm"
                  ? mode === "local"
                    ? t("确认安装")
                    : t("确认添加")
                  : mode === "local"
                    ? t("选择文件夹")
                    : t("添加")}
            </button>
          </div>
        </div>
      </div>
    </OverlayPortal>
  );
}

export default AddSourceModal;
