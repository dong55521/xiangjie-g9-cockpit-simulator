# 本地 Git（版本管理）交付

本次交付为独立本地仓库，尚未创建或上传 GitHub（代码托管平台）远程仓库。初始分支为 `codex/initial-release`。源码、文档、预览图、测试与依赖锁定文件均纳入版本管理。

## 压缩包与仓库恢复

交付压缩包包含项目目录及 `.git` 历史；解压后即为可继续提交的完整仓库。随附 `.bundle` 文件为独立的 Git 仓库备份，也可在终端恢复：

```sh
git clone xiangjie-g9-cockpit-simulator.bundle g9-cockpit-lab
cd g9-cockpit-lab
```

安装依赖、运行和配置说明见项目根目录的 `README.md`。密钥与依赖目录不在交付包中；需要自行安装依赖，并按 `.env.example` 新建私密 `.env.local`。

## 设置个人提交署名

本机没有配置个人 Git 署名，本次首次提交使用项目署名“G9 座舱实验室”和本地占位邮箱 `g9-cockpit-lab@localhost`，并未宣称这是用户个人邮箱。在项目目录设置自己的署名：

```sh
git config user.name "你的署名"
git config user.email "你的公开邮箱或代码托管平台提供的隐私邮箱"
```

若希望首次提交也归属自己，且仓库尚未推送，可以在设置后改写首次提交署名：

```sh
git commit --amend --reset-author --no-edit
```

此命令会产生新的提交编号；原交付备份保留本次首次提交。

## 上传到个人远程仓库

创建一个不含初始化文件的空远程仓库，取得其仓库地址。在本项目目录执行，先将占位文字替换为真实仓库地址：

```sh
git remote add origin "你的远程仓库地址"
git push -u origin HEAD
```

提交前可检查当前状态和已跟踪文件：

```sh
git status
git ls-files
```

`.env.local`、依赖目录、构建输出和临时文件已排除。首次交付已按当前私密配置的实际密钥值扫描提交内容，未发现这些密钥值；扫描只是一项针对已知配置的检查，不是所有未来内容的保证。
