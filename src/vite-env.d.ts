/** `?raw` 后缀导入（Vite 内建）：文件内容作为字符串带进 bundle——本仓目前仅 repo-official.svg 用。 */
declare module "*.svg?raw" {
  const content: string;
  export default content;
}
