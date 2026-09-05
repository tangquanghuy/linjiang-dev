# 临江 HUD 预览镜像

这个仓库是 [`tangquanghuy/linjiang-dev`](https://github.com/tangquanghuy/linjiang-dev) 的临时预览镜像，只用于真机或模拟器验证。

镜像内容由源仓库中的 `scripts/publish-hud-preview.mjs` 生成，历史可能被强制覆盖。
代码修改应在 `linjiang-dev` 中完成。

Pages 地址由镜像仓库名决定：

```text
https://<owner>.github.io/<repo>/
```

发布示例：

```bash
node scripts/publish-hud-preview.mjs --repo=<owner>/<repo>
node scripts/make-preview-deploy.mjs --repo=<owner>/<repo> --verify
```
