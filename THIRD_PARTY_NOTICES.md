# 第三方依赖与资料声明

本声明对应 `package.json` 中的直接依赖及本项目实际引用的公开资料。项目根目录的 [MIT 许可](LICENSE) 适用于本项目原创部分，不改变第三方软件、品牌、官方资料或服务的权利与使用条件。

## Three.js（三维图形库）

- 包名：`three`
- 当前固定依赖版本：`0.180.0`
- 用途：三维渲染；`OrbitControls`（轨道视角控制器）和 `RoundedBoxGeometry`（圆角几何体）均来自该包。
- 上游：[Three.js 项目](https://github.com/mrdoob/three.js)
- 许可：MIT，以下通知按本项目已安装依赖的 `LICENSE` 文件保留。重新分发依赖或构建产物时，应同时保留相应通知。

```text
The MIT License

Copyright © 2010-2025 three.js authors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
```

## 浏览器能力与运行环境

本项目调用 WebGL（网页图形接口）、浏览器语音识别和语音合成等接口，没有把浏览器或其语音服务作为本项目软件重新许可。接口是否可用及音频如何处理，由所用浏览器、系统和服务提供方决定。真实麦克风链路尚未完成实测，文字解析及车辆仿真不构成该链路的验证。

运行需要 Node.js（JavaScript 运行环境）；项目使用其内置静态服务、文件和测试模块。Node.js、包管理工具、浏览器、系统字体及语音由使用者的环境提供，其许可不由本项目替代。

## 官方资料、品牌与模型

资料入口：[鸿蒙智行享界服务页](https://hima.auto/xiangjie/service/)、[享界 G9 介绍](https://hima.auto/xiangjie/g9/)、[享界 G9 配置表](https://hima.auto/xiangjie/g9/configuration/)。具体功能出处与限制见 [证据说明](docs/evidence.md)。

享界 G9 官方手册属于其权利人；本项目保留自行整理的摘要、功能线索、页码及链接，不附带完整手册，不将手册内容视为 MIT 授权素材。华为、享界、鸿蒙智行、小艺及相关商标、产品名称和标识归相应权利人所有。提及这些名称只是说明研究与参考对象，不授予商标权，也不表示官方关系或背书。

三维座舱为本项目自建的参数化近似展示模型，没有附带原厂工程模型、商业车机软件、官方音色或完整界面素材。其代码许可不能被理解为对厂商产品设计、品牌或官方资料的授权。

用户提供的飞书参考文档为阅读线索，其访问权限由文档所有者控制，本项目许可不授予读取、复制或再分发该文档的权利。

## 许可文本来源

根目录 `LICENSE` 保留标准 MIT 英文条款，中文使用说明不替代原文。标准文本可参见 [Open Source Initiative（开源促进会）的 MIT 页面](https://opensource.org/license/mit)。
