# 感知研究 · 观看实验

正式网址：[打开实验网站](https://perception-study-20261005.fannyxiao815.chatgpt.site)。持有链接即可访问，无需登录。2026-10-06 已完成线上流程、全部素材与 Range 检查，临时上传入口已关闭。

实验逻辑为纯前端、无数据收集后端。被试输入编号后，随机观看 3 张图片和 2 个视频，最后下载 JSON、事件 CSV、素材汇总 CSV。每轮内部不重复，不同被试之间允许相同素材。不采集问卷、摄像头或鼠标轨迹。

## 本地使用

GitHub 仓库包含源码、网页播放素材、原始 `photos` 和自动化验证结果。原始 MP4 使用 Git LFS：安装 Git LFS 后执行 `git lfs install`、`git clone https://github.com/Xiaohui-815/affective-computing-test.git`，进入仓库后执行 `git lfs pull`。临时工具、依赖缓存、重复发布包和本机发布工作副本不纳入仓库；文中 `.sites-runtime` 路径指原开发电脑的本地生成目录。

需要 Node.js 20 或更新版本，无需安装 npm 依赖。在本目录运行 `node scripts/serve.mjs`，浏览器打开 http://localhost:4173 。不要双击 HTML：视频适配依赖 Service Worker，需要 HTTPS 或 localhost。

主要面向新版 Chrome/Edge。视频使用经授权生成的 H.264 / SDR BT.709 兼容副本，原始素材保留不变。无痕模式、禁用 Service Worker 或禁用存储会限制使用。支持响应式移动布局，但正式研究应统一设备、浏览器、音量和网络条件。

## 文件与发布

- `dist/`：可静态部署的网站。`.openai/hosting.json` 绑定 Sites 项目及静态目录。
- `photos/`：原始素材，始终保留，不纳入网站源代码版本库。
- `scripts/prepare-media.mjs`：扫描 photos、复制图片、无损分割 MP4 并生成素材清单。
- `dist/media-manifest.json`：素材 ID、类型、原始文件名、SHA-256、大小和相对 URL。
- `dist/sw.js`：在被试浏览器中将 Range 请求映射为静态分块读取，不是服务器代码。

本次发布遇到 Git 单次 HTTP 上传大小限制，采用分批推送。正式发布仓库位于 `.sites-runtime/publish-source/`，进度记录在 `.sites-runtime/publish-state.json`，原工作目录及其本地历史保持保留。后续修改后，应将修改同步到该正式发布目录，再对同一个 Sites 项目运行标准发布工作流；不要创建第二个 Site。上传凭据只通过内存/stdin 传递，未保存在文件中。

最终托管把网页与大素材分开：正式发布目录的 `frontend/` 保存前端源码和素材；`scripts/build-worker.mjs` 将小体积网页资源构建到 `dist/server/index.js`。Sites 的 `BUCKET` 对象存储保存按 SHA-256 标识的素材，托管层仅提供静态网页和媒体读取，不接收实验记录。前端的本地记录、抽样和下载逻辑没有移到服务器。

初始化素材时使用临时密钥保护的上传入口，限定素材清单、字节长度和 SHA-256；上传完毕后必须删除 `MEDIA_UPLOAD_KEY`，不带 `--allow-upload` 重新构建并发布，关闭上传入口。普通维护发布只运行 `node scripts/build-worker.mjs`。不要再运行早期的 `publish-batches.mjs`，它仅用于最初静态方案的传输恢复。对象存储上传脚本 `scripts/upload-media.mjs` 从 stdin 接收地址和临时密钥，支持已上传素材跳过与重试。

原视频为 HEVC Main10、HLG HDR，当前 Edge 环境只能播放音频。经用户授权，网页使用 H.264 高质量兼容副本：CRF 18、veryfast、8 位 yuv420p，使用 Mobius 将 HLG BT.2020 映射为 SDR BT.709，不缩放或裁剪，保留源时间戳与 AAC 音频码流。原文件在 photos 中保持不变；这不是逐像素无损转换。`playbackVersion`、原文件 SHA-256、播放文件 SHA-256 与处理说明保存在 JSON 和汇总 CSV 中，论文应说明这一素材处理步骤。

兼容视频仍较大，因此按 4 MiB 字节无损分块。浏览器 Service Worker 按需返回 206/Content-Range，最多保留三个分块的内存缓存。不将实验记录上传到服务器。素材通过网站公开加载，持有地址的人可访问播放内容。

更新素材：将 JPG/JPEG/PNG/WebP/MP4 放入 photos。对于本批 HLG HDR 视频，先运行 `node scripts/transcode.mjs` 生成 `.sites-runtime/compatible-sdr/` 副本，再运行 `node scripts/prepare-media.mjs` 和 `npm test`，最后通过 Sites 技能发布。转码工具可通过环境变量 `FFMPEG_PATH` 指定；本地准备的工具位于 `.sites-runtime/pydeps/imageio_ffmpeg/binaries/`。转码脚本是针对本批 HLG HDR 的配置，新批次若为 SDR 或其他 HDR 标准，应先检查编码和色彩信息再调整，不能盲用。

替换同名原视频时，须移走该视频的旧兼容副本再重新转码，脚本会跳过已经完成的副本。素材清单决定使用哪些素材；移除公开素材时还需明确删除相应旧部署文件再发布。进行中的实验应保持素材不变，研究批次结束后再更新。

## 记录含义

所有记录保存在当前浏览器 localStorage。刷新会提示继续原会话；其他设备或浏览器无法恢复。结束后自行下载并提交给研究人员。开始新被试会替换本机上一轮记录，请先保存文件。可提前结束并下载未完成记录。Web Locks 防止同源多个标签页同时写入记录（支持该 API 的浏览器）。

JSON：会话、素材原始清单、汇总数据、全部事件。事件 CSV：每行一个事件，含序号、时间、相对毫秒、素材、类型、JSON 详情。汇总 CSV：每行一个素材，含停留/可见/加载/缓冲/播放毫秒、最后视频位置及是否曾播放结束。CSV 使用 UTF-8 BOM 并对潜在公式文本进行保护。

总停留时间包含加载；可见时间是素材呈现且标签页可见的时间；播放时间是播放状态下非缓冲、非跳转的墙钟时间，**不是去重观看覆盖率**。隐藏标签页中继续播放仍计入播放时间。播放进度每秒记录一次。加载与缓冲单独记录。完成状态只表示依次经过全部素材，不代表视频完整看完。页面关闭至恢复之间的间隙不计入素材时长，并标记为不可观测间隙。崩溃时最多丢失最后一次保存后的活动；浏览器计时节流也会影响精度。

原生视频控件不保证暴露每次点击和按键，因此同时记录语义播放事件。网站无法记录浏览器外操作、确认真实注视或确认文件落盘；下载事件仅表示发起下载。加载失败显式重试/跳过，禁止静默换素材。

## 验证

先运行 `node scripts/build-worker.mjs --local --allow-upload`，再运行 `npm test`：抽样顺序、不重复、CSV 转义与公式安全、Range 解析、全部视频分块 SHA-256 一致性，以及临时素材入口的鉴权和校验。此处的 `--local --allow-upload` 只生成本地测试产物，不会开启线上上传。

正式招募前请在实际被试网络/浏览器执行一轮：播放和拖动视频、暂停、切标签页、刷新恢复、提前结束及三种导出，确认媒体加载和音量。开发验证结果见 `VALIDATION.md`。
