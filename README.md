# linjiang-dev —— 临江项目源仓库

这是临江状态栏、正文美化、开局页、辅助计算脚本和相关素材的当前源仓库。

## 在线地址

GitHub Pages：

```text
https://tangquanghuy.github.io/linjiang-dev/
```

jsDelivr 素材与壳层：

```text
https://testingcf.jsdelivr.net/gh/tangquanghuy/linjiang-dev@main/
```

## 本地开发

```bash
npm ci
npm run dev
npm run build
```

## 主要目录

- `src/`：HUD 源码
- `public/`：Pages 静态资源、壳层和阅读器外链资源
- `外部部署/V20260906/`：当前酒馆粘贴文件
- `酒馆变量/`：变量初始化、Schema 和变量更新规则
- `scripts/`：构建、生成与回归检查

## 发布

推送到 `main` 后，`.github/workflows/pages.yml` 会构建并发布 GitHub Pages。
部署时大型素材使用同一仓库的 jsDelivr 地址，并由 `ASSET_CDN_REF` 钉在当前提交，避免代码和素材版本漂移。

正文外链版修改后运行：

```bash
node scripts/build-reading-external.mjs --deploy=V20260906
```

生成的新 `public/reading/reading.<hash>.css` 必须与外链 HTML 一起提交和发布。

## 归档

`外部部署/V20260826/` 和 `外部部署/V20260831/` 是历史部署归档，其中可能保留旧地址，不作为当前 V20260906 的运行源。
