# 授权查询静态站

这是一个纯前端的授权信息查询页，部署在 GitHub Pages。

## 当前数据读取方式

页面运行时读取的是 `data/authorizations.json`，不是直接在浏览器里解析 `authorization.xlsx`。

原因很简单：

- GitHub Pages 只有静态托管，没有后端
- 浏览器直接解析 `xlsx` 需要额外前端库
- 当前实现用 Python 预处理 Excel，前端更轻，部署更稳

## 日常维护

维护人员只需要更新仓库根目录的 `authorization.xlsx` 并推送到 GitHub。

仓库内已经配置了 GitHub Actions：

- 当 `authorization.xlsx` 更新时
- 会自动运行 `scripts/extract_authorizations.py`
- 自动刷新 `data/authorizations.json`
- 自动提交生成后的 JSON

这样 GitHub Pages 页面就会使用最新数据。
