# 语雀开发者文档

来源：https://www.yuque.com/yuque/developer

生成时间：2026-04-26

说明：本文档按语雀原知识库目录顺序整理，章节标题来自目录，正文来自各文档公开 `/markdown` 页面；复杂表格或自定义卡片保留为 Markdown 兼容的原始 HTML。

## 目录

- OpenAPI
  - [Overview](#overview)
  - [语雀开放 API 接口文档](#语雀开放-api-接口文档)
  - 语雀编辑器组件
    - [开始使用](#开始使用)
    - [demo需求收集](https://www.yuque.com/forms/share/70d20ffc-0f7c-4aba-ac59-c4d05547e547)
    - demos
    - [配置工具栏](#配置工具栏)
      - [自定义工具栏（高级用法）](#自定义工具栏（高级用法）)
    - [配置上传](#配置上传)
    - [API与事件](#api与事件)
    - [命令列表](#命令列表)
    - [markdown流展示](#markdown流展示)
    - 配置
      - [通用配置](#通用配置)
      - [适配器（envAdapter）](#适配器（envadapter）)
      - [占位文案（placeholder）](#占位文案（placeholder）)
      - [公式（math）](#公式（math）)
      - [提及（mention）](#提及（mention）)
      - [日期卡片（dateCard）](#日期卡片（datecard）)
      - [多级标题（heading）](#多级标题（heading）)
      - [kernel-assistant](#kernel-assistant)
      - [斜杠命令（slash）](#斜杠命令（slash）)
      - [链接（link）](#链接（link）)
      - [日历（calendar）](#日历（calendar）)
      - [html数据（htmlDataSource)](#html数据（htmldatasource))
      - [布局（layout）](#布局（layout）)
      - [输入（input)](#输入（input))
      - [默认字号（defaultFontsize）](#默认字号（defaultfontsize）)
      - [图片（image）](#图片（image）)
      - [附件（file）](#附件（file）)
      - [异常卡片 （fallbackcard）](#异常卡片-（fallbackcard）)
      - [大纲（toc)](#大纲（toc))
      - [代码块（codeblock）](#代码块（codeblock）)
      - [音频（audio）](#音频（audio）)
      - [视频（video）](#视频（video）)
    - [开发自定义卡片](#开发自定义卡片)
- [❤️ 嵌入文档阅读页及问题](#❤️-嵌入文档阅读页及问题)
- [Webhooks 消息推送](#webhooks-消息推送)
  - [空间级别的 Webhook](#空间级别的-webhook)
- 常见问题
  - [文档 HTML 格式说明](#文档-html-格式说明)
  - [使用 API 获取空间内文档](#使用-api-获取空间内文档)
- 公告
  - [语雀开放 API 访问范围变更](#语雀开放-api-访问范围变更)

## OpenAPI

### Overview

原文链接：https://www.yuque.com/yuque/developer/api
更新时间：2024-01-18T07:25:04.000Z
字数：397

> ⚠️ 注意事项：语雀开放 API 仅用于对语雀内容的正常读写，请合理使用语雀开放 API。系统识别异常行为后会进行屏蔽处理，可能会导致用户不可用等情形。


#### 身份认证

> 语雀所有的开放 API 都需要 Token 验证之后才能访问。

在请求的 HTTP Headers 传入 `X-Auth-Token` 带入您的身份 Token 信息，用于完成认证。


##### 个人用户认证 超级会员专享权益

获取 Token 可通过点击语雀的个人头像，并进入 [个人设置](https://www.yuque.com/settings/tokens) 页面拿到，如下图：

![image](https://cdn.nlark.com/yuque/0/2023/png/84151/1680345283904-509c590e-b0b3-45a6-a9ff-aedde629b0c9.png)


`X-Auth-Token` 依据用户有的权限，决定了能获取到的数据，例如，假如 “小明” 这个账号是 “[语雀/帮助](https://www.yuque.com/yuque/help)” 这个文档仓库的 `Owner`，那么通过他的 Token 可以获取到这个仓库的所有信息。


其他情况由具体的功能权限设定来决定能获取到什么样的数据，以及那些数据有修改权限。

##### 企业团队身份认证 旗舰版空间专享权益

空间内的团队，可进入团队设置页面进行获取（仅[旗舰版空间](https://www.yuque.com/about/price)可使用）。

![image](https://cdn.nlark.com/yuque/0/2023/png/84151/1680345436472-0dce9c77-252c-4154-b562-522f43e845b8.png)


通过 `X-Auth-Token` ，语雀能够识别到当前访问的是哪个团队，可获取到该团队内的知识库、文档、以及成员等相关的数据。


#### API 列表

此处为语雀内容卡片，点击链接查看：[https://www.yuque.com/yuque/developer/fadm9di79hgo6ggw](https://www.yuque.com/yuque/developer/fadm9di79hgo6ggw)

### 语雀开放 API 接口文档

原文链接：https://www.yuque.com/yuque/developer/openapi
更新时间：2025-11-21T08:13:01.000Z
字数：639

#### 最新消息

| **日期** | **公告** |
| --- | --- |
| 2023/11/24 | 我们更新了接口文档，现在更容易使用，并且还能直接导入到 Postman 等流行工具中。 |
| 2022/04/10 | [语雀开放 API 访问范围变更](https://www.yuque.com/yuque/developer/vzippmige58g7r9t) |

#### 如何使用接口

-   接口域名为 `https://www.yuque.com`，但要注意访问空间内资源需要使用该空间的子域名。
-   请注意，我们的服务有使用次数的限制：每小时最多 5000 次请求，每秒最多 100 次请求。如果请求太频繁，可能需要稍后重试。
-   当您调用我们的接口时，会看到 `X-RateLimit-Limit`（总次数限制）和 `X-RateLimit-Remaining`（剩余次数）这样的信息，这有助于您了解当前的使用情况。
-   最后请注意，个人或团队下的所有 Token 共享同一个使用次数限制。

#### 重要的概念

-   日期和时间：我们使用标准的格式（[ISO 8601](https://en.wikipedia.org/wiki/ISO_8601)）通常是 UTC 时间，所以在处理这些值时请确保格式正确。
-   网址路径：我们的网址有一定的格式，比如`https://www.yuque.com/yuque/developer/api`。这里面包含了用户或团队的名称、知识库的标识，以及文档的标识。


```plain
https://www.yuque.com/yuque/developer/api        [文档完整访问路径]
                        |
                        +-- yuque/               [团队或用户的登录名(group_login)]
                                |
                                +-- developer/   [知识库的标识(book_slug)]
                                       |
                                       +-- api   [文档的标识(doc_slug)]
```


#### 字段解释

-   我们的接口文档里有一些常用字段，了解它们将帮助您高效使用我们的服务，例如：

-   `group_login`代表团队的网址路径。
-   `book_slug`代表知识库的路径。
-   `doc_slug`代表文档的路径。
-   `book_id`代表知识库的 ID。
-   `doc_id`代表文档的 ID。

-   我们的部分 API 有进行重载, 例如:

-   不知道 `book_id`的时候可以根据文档 url 路径 **获取文档详情**:

-   `GET /api/v2/repos/{group_login}/{book_slug}/docs/{doc_slug}`

-   使用 `book_id` 和 `doc_id` 可以更快捷的 **获取文档详情**:

-   `GET /api/v2/repos/{book_id}/docs/{doc_id}`

-   文档里有很多类似的重载接口, 方便您应对不同的使用场景。

#### 接口文档更新记录

想了解最新的接口文档，请点击以下链接进行下载

-   **点击此处下载最新接口文档**：

-   OAS: [📎yuque_openapi_20251121_green.yaml](https://www.yuque.com/attachments/yuque/0/2025/yaml/35160816/1763712767741-dfc6b260-2c10-41ac-8064-275eb9bf7c39.yaml)
-   HTML: [📎yuque_openapi_20251121_green.html](https://www.yuque.com/attachments/yuque/0/2025/html/35160816/1763712778856-d6084d77-1872-42cc-99e9-7b7526823103.html)

-   最近的更新包括了获取数据表详情、批量变更知识库目录、搜索 API 的改进，以及其他一些优化和修复。

### 语雀编辑器组件

#### 开始使用

原文链接：https://www.yuque.com/yuque/developer/gfoax065u2v72isu
更新时间：2024-05-24T11:43:52.000Z
字数：354

##### 介绍

语雀富文本编辑器 LakexEditor 是由`yuque`开发的所见即所得富文本web编辑器。

> 有相关的问题可以在[反馈区](https://www.yuque.com/feedbacks/new)留言

> 文档不完善，谨慎用于生产

##### 浏览器支持

1.  Chrome 62， 68+
2.  IOS Safari 11+
3.  Mac Safari 13+
4.  Firefox 100+

##### CDN地址

> cdn 的地址只有 `VERSION` 的位置会变化，目前最新版本是 `1.32.0`
> https://gw.alipayobjects.com/render/p/yuyan_npm/@alipay_lakex-doc/`VERSION`/umd/doc.css
> https://gw.alipayobjects.com/render/p/yuyan_npm/@alipay_lakex-doc/`VERSION`/umd/doc.umd.js

[https://gw.alipayobjects.com/render/p/yuyan_npm/@alipay_lakex-doc/1.24.0/umd/doc.css](https://gw.alipayobjects.com/render/p/yuyan_npm/@alipay_lakex-doc/1.24.0/umd/doc.css)

[https://gw.alipayobjects.com/render/p/yuyan_npm/@alipay_lakex-doc/1.24.0/umd/doc.umd.js](https://gw.alipayobjects.com/render/p/yuyan_npm/@alipay_lakex-doc/1.24.0/umd/doc.umd.js)

需要引入react的cdn地址

[https://unpkg.com/react@18/umd/react.production.min.js](https://unpkg.com/react@18/umd/react.production.min.js"></script>)

[https://unpkg.com/react-dom@18/umd/react-dom.production.min.js](https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>)

需要引入antd的样式cdn地址

[https://unpkg.com/antd@4.24.13/dist/antd.css](https://unpkg.com/antd@4.24.13/dist/antd.css)

##### 创建demo

###### 编辑器

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>yuque编辑器</title>
  <link rel="stylesheet" type="text/css" href="https://gw.alipayobjects.com/render/p/yuyan_npm/@alipay_lakex-doc/1.24.0/umd/doc.css"/>
  <link rel="stylesheet" type="text/css" href="https://unpkg.com/antd@4.24.13/dist/antd.css"/>
</head>
<body>
  <div id="root" class="ne-doc-major-editor"></div>
  <script>
    window.onload = function () {
      const { createOpenEditor } = window.Doc;
      // 创建编辑器
      const editor = createOpenEditor(document.getElementById('root'), {
        input: {},
        image: {
          isCaptureImageURL() {
            return false;
          },
        },
      });
      // 设置内容
    	editor.setDocument('text/lake', '<p><span style="color: rgb(255, 111, 4),rgb(243, 48, 171)">欢迎来到yuque编辑器</span></p>');
      // 监听内容变动
      editor.on('contentchange', () => {
        console.info(editor.getDocument('text/lake'));
      });
    }
  </script>
  <script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
  <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>\
  <script src="https://gw.alipayobjects.com/render/p/yuyan_npm/@alipay_lakex-doc/1.24.0/umd/doc.umd.js"></script>
</body>
</html>
```

###### 阅读器

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>yuque编辑器</title>
  <link rel="stylesheet" type="text/css" href="https://gw.alipayobjects.com/render/p/yuyan_npm/@alipay_lakex-doc/1.24.0/umd/doc.css"/>
  <link rel="stylesheet" type="text/css" href="https://unpkg.com/antd@4.24.13/dist/antd.css"/>
</head>
<body>
  <div id="root" class="ne-doc-major-viewer"></div>
  <script>
    window.onload = function () {
      const { createOpenViewer } = window.Doc;
      // 创建阅读器
      const viewer = createOpenViewer(document.getElementById('root'), {
      });
      // 设置内容
      viewer.setDocument('text/lake', '<p><span style="color: rgb(255, 111, 4),rgb(243, 48, 171)">欢迎来到yuque编辑器</span></p>');
    }
  </script>
  <script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
  <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
  <script src="https://gw.alipayobjects.com/render/p/yuyan_npm/@alipay_lakex-doc/1.24.0/umd/doc.umd.js"></script>
</body>
</html>
```

###### 在线demo

[https://codepen.io/hugehard/embed/YzdWQVb?editors=1000](https://codepen.io/hugehard/embed/YzdWQVb?editors=1000)

###### 其它 demo

[GitHub - ilimei/vscode-plugin-lake-editor: yuque editor for vscode local file](https://github.com/ilimei/vscode-plugin-lake-editor)

[GitHub - yuque/yuque-chrome-extension: 🚀🚀🚀 语雀浏览器插件](https://github.com/yuque/yuque-chrome-extension)

#### demo需求收集

[打开链接](https://www.yuque.com/forms/share/70d20ffc-0f7c-4aba-ac59-c4d05547e547)

#### demos

#### 配置工具栏

原文链接：https://www.yuque.com/yuque/developer/ratg8q2cdsdvpp1t
更新时间：2024-08-27T03:28:19.000Z
字数：352

修改工具栏的方法是在创建编辑器的时候传入配置。工具栏分`table`选区的工具栏和默认工具栏，`table`选区工具栏只有光标位于`table`的时候才展示。

`"|"`表示分隔符

```javascript
const { createOpenEditor, toolbarItems } = window.Doc;
// 创建编辑器
const editor = createOpenEditor(document.getElementById('root'), {
  input: {},
  image: {
    isCaptureImageURL() {
      return false;
    },
  },
  toolbar: {
    agentConfig: {
      default: {
        items: [
          toolbarItems.cardSelect,
          '|',
          toolbarItems.undo,
          toolbarItems.redo,
          toolbarItems.formatPainter,
          toolbarItems.clearFormat,
          '|',
          toolbarItems.style,
          toolbarItems.fontsize,
          toolbarItems.bold,
          toolbarItems.italic,
          toolbarItems.strikethrough,
          toolbarItems.underline,
          toolbarItems.mixedTextStyle,
          '|',
          toolbarItems.color,
          toolbarItems.bgColor,
          '|',
          toolbarItems.alignment,
          toolbarItems.unorderedList,
          toolbarItems.orderedList,
          toolbarItems.indent,
          toolbarItems.lineHeight,
          '|',
          toolbarItems.taskList,
          toolbarItems.link,
          toolbarItems.quote,
          toolbarItems.hr,
        ]
      },
      // table选区工具栏
      table: {
        items: [
          toolbarItems.cardSelect,
          '|',
          toolbarItems.undo,
          toolbarItems.redo,
          toolbarItems.formatPainter,
          toolbarItems.clearFormat,
          '|',
          toolbarItems.style,
          toolbarItems.fontsize,
          toolbarItems.bold,
          toolbarItems.italic,
          toolbarItems.strikethrough,
          toolbarItems.underline,
          toolbarItems.mixedTextStyle,
          '|',
          toolbarItems.color,
          toolbarItems.bgColor,
          toolbarItems.tableCellBgColor,
          toolbarItems.tableBorderVisible,
          '|',
          toolbarItems.alignment,
          toolbarItems.tableVerticalAlign,
          toolbarItems.tableMergeCell,
          '|',
          toolbarItems.unorderedList,
          toolbarItems.orderedList,
          toolbarItems.indent,
          toolbarItems.lineHeight,
          '|',
          toolbarItems.taskList,
          toolbarItems.link,
          toolbarItems.quote,
          toolbarItems.hr,
        ],
      }
    }
  }
});
```

###### 完整的工具栏按钮

```javascript
toolbarItems.cardSelect // 插入面板
toolbarItems.undo // 撤销
toolbarItems.redo // 重做
toolbarItems.formatPainter // 格式刷
toolbarItems.clearFormat // 清除格式
toolbarItems.style // 设置标题和正文
toolbarItems.fontsize // 字号
toolbarItems.bold // 加粗
toolbarItems.italic // 斜体
toolbarItems.strikethrough // 删除线
toolbarItems.underline // 下划线
toolbarItems.mixedTextStyle // 更多文本样式
toolbarItems.color // 字体颜色
toolbarItems.bgColor // 背景颜色
toolbarItems.alignment // 对齐样式
toolbarItems.unorderedList // 无序列表
toolbarItems.orderedList // 有序列表
toolbarItems.indent // 缩进调整
toolbarItems.lineHeight // 行高
toolbarItems.taskList // 任务列表
toolbarItems.link // 超链接
toolbarItems.quote // 引用
toolbarItems.hr // 分割线

// 表格专用
toolbarItems.tableCellBgColor // 单元格背景颜色
toolbarItems.tableBorderVisible // 单元格是否显示边框
toolbarItems.tableVerticalAlign // 垂直对齐
toolbarItems.tableMergeCell // 合并单元格
```

##### 自定义工具栏（高级用法）

原文链接：https://www.yuque.com/yuque/developer/irpl19xzy1o4zmnn
更新时间：2024-08-27T03:30:50.000Z
字数：1436

目前编辑器带有默认的工具栏配置，如果只是更改部分或者追加，则需要把全部配置拷贝一份，过于复杂，这个时候可以使用 toolbarOptionHelper 对默认的配置进行调整

###### 简单使用

```typescript
{
  toolbar: ToolbarOptionHelper.start().getOption(),
}
```

###### 删除某些项

```typescript
import { toolbarItems } from '@alipay/lakex-doc/esm/app-open-editor/combine/toolbar';

const options = {
  toolbar: ToolbarOptionHelper
    	.start()
    	.removeItems([toolbarItems.cardSelect])
    	.getOption(),
}
```

###### 追加一些项在某项之前

![image](https://cdn.nlark.com/yuque/0/2024/png/184565/1724729312019-92967b4d-df0d-4b5b-9287-b41e20a97645.png)

```typescript
import { toolbarItems } from '@alipay/lakex-doc/esm/app-open-editor/combine/toolbar';

const options = {
  toolbar: ToolbarOptionHelper
    	.start()
    	.removeItems([toolbarItems.cardSelect])
      // 插入到bold前面
      .insertBefore([toolbarItems.cardSelect], toolbarItems.bold),
    	.getOption(),
}
```

###### 自定义 toolbar

在不改变原来的 toolbar 的情况下追加新的 `toolbar`。继承`ToolbarUIDescriptor`指定 `UI`类型就可以自定义一个`toolbar`

要实现以下方法

1.  **getInitUIState** 返回初始状态
2.  **getState** 选区变动后会重新获取状态，只要返回变动的状态即可
3.  **onEvent** 产生了交互行为 (点击），调用该方法执行对应的编辑器命令。

###### 1\. button 简单按钮

工具栏注册一个按钮，并在点击的时候执行命令。

下面是实现了一个行内代码块的按钮。

```typescript
import React from 'react';
import { ToolbarUIDescriptor } from '@alipay/lakex-doc/plugin-toolbar/public/toolbar-ui-descriptor';
import { CodeOutlined } from '@ant-design/icons';

export default class InlineCodeToolbarDescriptor extends ToolbarUIDescriptor<'Button'> {
  static override Type = 'Button';

  // 点击事件回调
  override onEvent(eventName: string, payload: any): void {
    // 当前光标位置插入行内代码
    // @ts-expect-error not error
    this.editor.execCommand('code');
  }

  getInitUIState() {
    return {
      disabled: this.disabled, // 是否处于禁用状态
      // 自定义图标，自行调节lineHeight让它视觉居中，字号一般是16
      icon: () => {
        return (
          <CodeOutlined
            style={{ fontSize: 16, color: 'black', lineHeight: 0.7 }}
          />
        );
      },
      className: 'ne-ui-toolbar-inline-code',
      // 展示tooltip
      tooltip: ToolbarUIDescriptor.getTooltip(
        this.editor,
        '行内代码',
        this.name,
      ),
    };
  }

  getUIState() {
    const { editor } = this;

    return {
      // @ts-expect-error not error
      disabled: this.disabled || !editor.queryCommandEnabled('code'),
    };
  }
}
```

插入到`分割线`前方

```typescript
{
  toolbar: ToolbarOptionHelper.start()
        // 插入到hr前面
        .insertBefore([InlineCodeToolbarDescriptor], toolbarItems.hr)
        .getOption(),
}
```

最终效果

![image](https://cdn.nlark.com/yuque/0/2024/png/184565/1724729312024-41222d42-f760-4590-8372-6930746e0134.png)

###### 2\. StatusButton 带有状态的按钮

跟 button 很像，多了一个状态指示当前是否处于某种状态，加粗、斜体就是这类的按钮

下面将行内代码的状态携带上

```typescript
import React from 'react';
import { COMMAND_EXECUTED } from '@alipay/lakex-doc/framework-public/constants/command-state';
import { ToolbarUIDescriptor } from '@alipay/lakex-doc/plugin-toolbar/public/toolbar-ui-descriptor';
import { CodeOutlined } from '@ant-design/icons';

export default class InlineCodeToolbarDescriptor extends ToolbarUIDescriptor<'StatusButton'> {
  static override Type = 'StatusButton';

  // 点击事件回调
  override onEvent(eventName: string, payload: any): void {
    // 当前光标位置插入行内代码
    // @ts-expect-error not error
    this.editor.execCommand('code');
  }

  getInitUIState() {
    return {
      // 光标是否位于行内代码
      checked: false,
      disabled: this.disabled, // 是否处于禁用状态
      // 自定义图标，自行调节lineHeight让它视觉居中，字号一般是16
      icon: () => {
        return (
          <CodeOutlined
            style={{ fontSize: 16, color: 'black', lineHeight: 0.7 }}
          />
        );
      },
      className: 'ne-ui-toolbar-inline-code',
      // 展示tooltip
      tooltip: ToolbarUIDescriptor.getTooltip(
        this.editor,
        '行内代码',
        this.name,
      ),
    };
  }

  getUIState() {
    const { editor } = this;

    return {
      checked: editor.queryCommandState('code') === COMMAND_EXECUTED,
      // @ts-expect-error not error
      disabled: this.disabled || !editor.queryCommandEnabled('code'),
    };
  }
}
```

插入到`分割线`前方

```typescript
{
  toolbar: ToolbarOptionHelper.start()
        // 插入到hr前面
        .insertBefore([InlineCodeToolbarDescriptor], toolbarItems.hr)
        .getOption(),
}
```

最终效果

![image](https://cdn.nlark.com/yuque/0/2024/png/184565/1724729312032-bdc761a3-2b93-4cf0-9c72-9bb9dc6bee89.png)![image](https://cdn.nlark.com/yuque/0/2024/png/184565/1724729312369-972272ad-c417-46ea-8bca-70cbaf05687d.png)

###### 3\. DropDownButton 下拉选择的按钮

点击后回弹出一个下拉选择框，可以方便将一组类似的命令放到一起

下面是缩进的实现

```typescript
import { i18n } from '@alipay/lakex-doc/framework-infra/locale';
import { assert } from '@alipay/lakex-doc/framework-utils/assert';
import type { IEditor } from '@alipay/lakex-doc/framework-editor/public/i-editor';
import { COMMAND_UNAVAILABLE } from '@alipay/lakex-doc/framework-public/constants/command-state';
import { ToolbarUIDescriptor } from '@alipay/lakex-doc/plugin-toolbar/public/toolbar-ui-descriptor';

const ICONS = {
  indent: 'editor-indent',
  outdent: 'editor-outdent',
};

function getItems(editor: IEditor) {
  const TEXT = {
    indent: i18n('增加缩进'),
    outdent: i18n('减少缩进'),
  };

  return [
    {
      icon: ICONS.indent,
      label: TEXT.indent,
      value: 'indent',
      tooltip: ToolbarUIDescriptor.getTooltip(editor, '', 'indent'),
    },
    {
      icon: ICONS.outdent,
      label: TEXT.outdent,
      value: 'outdent',
      tooltip: ToolbarUIDescriptor.getTooltip(editor, '', 'outdent'),
    },
  ];
}

export default class IndentToolbarDescriptor extends ToolbarUIDescriptor<'DropdownButton'> {
  static override Type = 'DropdownButton';

  override onEvent(eventName: string, type: 'indent' | 'outdent') {
    assert(eventName === 'select');
    assert(['indent', 'outdent'].includes(type));
    // @ts-expect-error TS(2345) FIXME-声明executeCommand所属类在该调用处以来的plugin class作为其PluginRelayList的范型值: Argument of type 'string' is not assignable to parameter of type 'never'.
    this.editor.execCommand(type);
  }

  getInitUIState() {
    return {
      disabled: this.disabled,
      allowCheck: false,
      value: null,
      icon: ICONS.indent,
      tooltip: i18n('缩进调整'),
      className: 'ne-ui-toolbar-indent',
      dropdownClassName: 'ne-ui-toolbar-indent-dropdown',
      items: getItems(this.editor),
    };
  }

  getUIState() {
    const { editor } = this;

    return {
      disabled:
        this.disabled ||
        // @ts-expect-error TS(2345) FIXME-传递调用command方法的类依赖的plugin范型值：https://yuque.antfin-inc.com/forces/lakex/omedms5k638u9iu5#xntvH
        editor.queryCommandState('indent') === COMMAND_UNAVAILABLE,
    };
  }
}
```

![image](https://cdn.nlark.com/yuque/0/2024/png/184565/1724729312340-4efc1051-a71e-4d33-a70f-02cc4d9c06af.png)

###### 4\. StatusDropdownButton 带有状态的下拉选择按钮

可以使用 React 组件自定义下拉框内容，并带有一个下拉的图标

下面是自定义一个表情插入的 toolbar

```typescript
import React from 'react';
import { ToolbarUIDescriptor } from '@alipay/lakex-doc/plugin-toolbar/public/toolbar-ui-descriptor';
import { CodeOutlined } from '@ant-design/icons';

const emojiData = [
  {
    alt: '[+1]',
    src: 'https://aliwork-files.oss-accelerate.aliyuncs.com/aliway/emoji/TB1h6l7lfzO3e4jSZFxXXaP_FXa-96-96.gif',
  },
  {
    alt: '[比心]',
    src: 'https://aliwork-files.oss-accelerate.aliyuncs.com/aliway/emoji/TB1hHYEl8Bh1e4jSZFhXXcC9VXa-96-96.gif',
  },
];

export function DingEmoji(props: { onSelect: (src: string) => void }) {
  return (
    <div
      style={{
        width: 100,
        padding: 5,
      }}
    >
      {emojiData.map(v => (
        <span
          key={v.alt}
          style={{
            cursor: 'pointer',
            display: 'inline-block',
          }}
          onClick={() => props.onSelect(v.src)}
        >
          <img
            src={v.src}
            alt={v.alt}
            style={{
              width: 22,
              height: 22,
            }}
          />
        </span>
      ))}
    </div>
  );
}

export default class DingEmojiToolbarDescriptor extends ToolbarUIDescriptor<'StatusDropdownButton'> {
  static override Type = 'StatusDropdownButton';

  // 自定义组件 不需要此事件
  override onEvent(eventName: string, payload: any): void {
    // not use
  }

  handleSelectEmoji = (src: string) => {
    // @ts-expect-error not error
    this.editor.execCommand('image', {
      src,
      original: {
        width: 22,
        height: 22,
      },
      // 用户手动设置的宽度
      width: 44,
    });
  };

  getInitUIState() {
    return {
      // 下拉图标与图标是否同步
      sync: true,
      overlay: <DingEmoji onSelect={this.handleSelectEmoji} />,
      disabled: this.disabled, // 是否处于禁用状态
      // 自定义图标，自行调节lineHeight让它视觉居中，字号一般是16
      icon: () => {
        return (
          <CodeOutlined
            style={{ fontSize: 16, color: 'black', lineHeight: 0.7 }}
          />
        );
      },
      className: 'ne-ui-toolbar-ding-emoji-code',
      // 支持隐藏下拉按钮
      hideArrow: false,
      // Antd的dropdown props
      dropdownProps: {},
      // 展示tooltip
      tooltip: ToolbarUIDescriptor.getTooltip(this.editor, '表情', this.name),
    };
  }

  getUIState() {
    const { editor } = this;

    return {
      // @ts-expect-error not error
      disabled: this.disabled || !editor.queryCommandEnabled('image'),
    };
  }
}
```

插入到`分割线`前方

```typescript
{
  toolbar: ToolbarOptionHelper.start()
        // 插入到hr前面
        .insertBefore([DingEmojiToolbarDescriptor], toolbarItems.hr)
        .getOption(),
}
```

最终效果

![image](https://cdn.nlark.com/yuque/0/2024/png/184565/1724729312481-78088911-63cb-4af7-bdb0-ac1f1e8f5113.png)

![image](https://cdn.nlark.com/yuque/0/2024/png/184565/1724729312514-940b7347-d1b4-4040-b078-3f599bf5be3d.png)

###### 使用 UMD 的场景

上述的 import 语法需要修改。在 UMD 场景下，windows 上会挂载一个`DOC`对象，所以使用变量需要更改为下面列举的方式

```typescript
ToolbarUIDescriptor = Doc.Plugins.Toolbar.ToolbarUIDescriptor
toolbarItems = Doc.toolbarItems
ToolbarOptionHelper = Doc.ToolbarOptionHelper
COMMAND_EXECUTED = Doc.FrameworkPublic.COMMAND_EXECUTED
```

#### 配置上传

原文链接：https://www.yuque.com/yuque/developer/gv1px9exihgr2yh1
更新时间：2024-08-28T01:15:51.000Z
字数：423

有很多卡片（图片，附件等）是需要后台支持上传文件的，上传方法都需要自定义配置。

###### 图片配置上传

```javascript
const { createOpenEditor } = window.Doc;

const editor = createOpenEditor(document.getElementById('root'), {
  image: {
    isCaptureImageURL:(url) => {
      // 判断当前url是否需要转存
      // return true表示需要转存，会调用createUploadPromise
      // return false表示不需要转存，直接用于展示
      return false;
    },
		// 配置上传接口,要返回一个promise对象
    createUploadPromise: (request) => {
      const {type, data} = request;
      if(type === 'url') {
        // data 是一个url，表示需要转存
      } else if(type === 'file') {
        // data是一个File
      }

      return Promise.resolve({
        url: '上传成功后的图片url地址',
        size: 100, // 文件大小
        filename: '图片名称，例如image.png'
      });
    },
  },
})
```

###### 附件配置上传

```javascript
const { createOpenEditor } = window.Doc;

const editor = createOpenEditor(document.getElementById('root'), {
  file: {
    // 配置上传接口,要返回一个promise对象
    createUploadPromise: (file) => {
      // file是一个File对象

      return Promise.resolve({
        url: '上传成功后的文件地址',
        size: 100, // 文件大小
        filename: '文件名称，例如attachment.zip'
      });
    },
  },
})
```

###### 视频配置上传

```javascript
const { createOpenEditor } = window.Doc;

const editor = createOpenEditor(document.getElementById('root'), {
  video: {
    // 配置上传接口,要返回一个promise对象
    createUploadPromise: (file) => {
      // file是一个File对象

      return Promise.resolve({
        url: '上传成功后的视频地址',
        size: 100, // 文件大小
        filename: '文件名称，例如test.mp4',
        cover: '视频封面图片地址',
      });
    },
  },
})
```

###### 下载

没有内置的下载方法，下载功能需要自行实现，根据卡片数据构造下载地址。参考文档：[附件（file）](https://www.yuque.com/yuque/developer/mkkq8a1h7h8nxwvb#G3jDB "附件（file）")。

#### API与事件

原文链接：https://www.yuque.com/yuque/developer/gs2pzrozqvlvacff
更新时间：2024-06-06T06:58:40.000Z
字数：303

##### API

###### 1\. getDocument 方法

获取指定的api内容

###### 1.1. 参数列表

1.  type 可选参数， 内容类型,

1.  text/lake 语雀的格式
2.  text/html html格式
3.  text/plain 文本格式
4.  text/markdown markdown 格式
5.  json（**默认值）** 返回json格式的内容，

###### 1.2. 返回类型

返回对应`**type**`的字符串，如果`type`是`json`则返回`json`格式的内容

###### 1.3. demo

```javascript
editor.getDocument('text/lake');
editor.getDocument('text/html');
editor.getDocument('text/plain');
```

* * *

###### 2\. setDocument

设置编辑器内容

###### 2.1. 参数列表

1.  type 内容类型

1.  text/lake
2.  text/html
3.  text/plain
4.  text/markdown
5.  json

2.  content 内容，根据type不同要符合对应格式要求

###### 2.2. demo

```javascript
editor.setDocument('text/plain', '123\n123');
```


* * *

###### 3\. destory

销毁当前文档

###### 3.1. demo

```javascript
editor.destroy();
```

##### 事件

编辑器会在使用过程中触发不同的事件

###### 1.1. contentchange

文档内容变化后会触发该事件

```javascript
editor.on('contentchange', () => {
  engine.getDocument('text/lake'); // 获取文档的最新内容
});
```

###### 1.2. selectionchange

内容变化的选区变化事件不包含在内，文档选区变化事件

```javascript
editor.on('selectionchange', () => {
  console.info(document.getSelection()); // 获取最新选区
});
```

###### 1.3. focusstatuschange

焦点变化事件

```javascript
editor.on('focusstatuschange', ({ focused }) => {
  console.info('文档焦点状态', focused);
});
```

###### 1.4. focus

聚焦事件

###### 1.5. blur

失焦事件

###### 1.6. beforedestroy

文档卸载前执行的事件

```javascript
editor.on('beforedestroy', () => {
	console.info('文档卸载');
});
```

#### 命令列表

原文链接：https://www.yuque.com/yuque/developer/ndflcx5eprg7gbdl
更新时间：2024-05-23T01:24:11.000Z
字数：2285

##### 前言

可以通过`editor.execCommand('commandName', 参数)`的方式调用文档的命令

##### 1\. focus 聚焦编辑器

<table id="Nkdcj" class="ne-table" style="width: 750px"><tbody><tr style="height: 33px"><td width="250"><p id="u93f45bdb" class="ne-p"><span class="ne-text">方法名称</span></p></td><td width="250"><p id="u72274932" class="ne-p"><span class="ne-text">参数列表</span></p></td><td width="250"><p id="u8ca721f7" class="ne-p"><span class="ne-text">返回结果</span></p></td></tr><tr style="height: 33px"><td width="250"><p id="u9cf4f538" class="ne-p"><span class="ne-text">execCommand</span></p></td><td width="250"><ol class="ne-ol"><li id="u28afa631" data-lake-index-type="0"><span class="ne-text">position： </span><code class="ne-code"><span class="ne-text">'start' | 'end'</span></code><span class="ne-text">聚焦到内容尾部或者头部</span></li></ol></td><td width="250"><p id="u78e102f4" class="ne-p"><span class="ne-text">true | false 表示成功或者失败</span></p></td></tr></tbody></table>

```javascript
import FocusCommand from "@alipay/lakex-doc/esm/plugin-focus/kernel/commands/focus-command";

// 聚焦到文档尾部
editor.execCommand<typeof FocusCommand>("focus", "end");
```


##### 2\. style 设置当前段落的样式

<table id="WAAz3" class="ne-table" style="width: 750px"><tbody><tr style="height: 33px"><td width="250"><p id="u61889c77" class="ne-p"><span class="ne-text">方法名称</span></p></td><td width="250"><p id="ueaba5db5" class="ne-p"><span class="ne-text">参数列表</span></p></td><td width="250"><p id="u2eff578c" class="ne-p"><span class="ne-text">返回结果</span></p></td></tr><tr style="height: 33px"><td width="250"><p id="u184886a4" class="ne-p"><span class="ne-text">execCommand</span></p></td><td width="250"><ol class="ne-ol"><li id="u4da35b18" data-lake-index-type="0"><span class="ne-text">target </span><code class="ne-code"><span class="ne-text">'p'|'h1'|'h2'|'h3|'h4'|'h5'|'h6'</span></code></li></ol></td><td width="250"><p id="u0c0cb55b" class="ne-p"><span class="ne-text">true | false 表示成功或者失败</span></p></td></tr><tr style="height: 64px"><td width="250"><p id="u7c46ae85" class="ne-p"><span class="ne-text">queryCommandValue</span></p></td><td width="250"><p id="u4a2b0e75" class="ne-p"><span class="ne-text">-</span></p></td><td width="250"><p id="ue8593812" class="ne-p"><span class="ne-text">返回当前style </span><code class="ne-code"><span class="ne-text">'p'|'h1'|'h2'|'h3|'h4'|'h5'|'h6'</span></code></p></td></tr><tr style="height: 64px"><td width="250"><p id="u41f40cdd" class="ne-p"><span class="ne-text">queryCommandState</span></p></td><td width="250"><p id="u9bbb4f7c" class="ne-p"><span class="ne-text">-</span></p></td><td width="250"><p id="u9372bd7e" class="ne-p"><code class="ne-code"><span class="ne-text">-1 | 0</span></code><span class="ne-text"> 表示当前命令是否可用</span></p></td></tr></tbody></table>

```javascript
// 选中段落变成h1
editor.execCommand('style', 'h1');
```

##### 3\. insertText 插入文本

<table id="zZIrN" class="ne-table" style="width: 750px"><tbody><tr style="height: 33px"><td width="250"><p id="u96be9e51" class="ne-p"><span class="ne-text">方法名称</span></p></td><td width="250"><p id="u2800d567" class="ne-p"><span class="ne-text">参数列表</span></p></td><td width="250"><p id="u9df57515" class="ne-p"><span class="ne-text">返回结果</span></p></td></tr><tr style="height: 33px"><td width="250"><p id="u4c1b1b8c" class="ne-p"><span class="ne-text">execCommand</span></p></td><td width="250"><ol class="ne-ol"><li id="u04ddc5b4" data-lake-index-type="0"><code class="ne-code"><span class="ne-text">text</span></code><span class="ne-text">要插入的普通文本</span></li></ol></td><td width="250"><p id="u75234907" class="ne-p"><span class="ne-text">true | false 表示成功或者失败</span></p></td></tr><tr style="height: 64px"><td width="250"><p id="ucd565981" class="ne-p"><span class="ne-text">queryCommandValue</span></p></td><td width="250"><p id="uc3c9243a" class="ne-p"><span class="ne-text">-</span></p></td><td width="250"><p id="u4fd36919" class="ne-p"><span class="ne-text">-</span></p></td></tr><tr style="height: 64px"><td width="250"><p id="ue814cb8a" class="ne-p"><span class="ne-text">queryCommandState</span></p></td><td width="250"><p id="u5f6bbe5b" class="ne-p"><span class="ne-text">-</span></p></td><td width="250"><p id="u718f42fd" class="ne-p"><code class="ne-code"><span class="ne-text">-1 | 0</span></code><span class="ne-text"> 表示当前命令是否可用</span></p></td></tr></tbody></table>

```javascript
// 在当前选区插入文本，如果是非闭合选区，则会替换选区内容
editor.execCommand('insertText', '123');
```

##### 4\. alignment 设置段落对齐方式

<table id="baL4z" class="ne-table" style="width: 750px"><tbody><tr style="height: 33px"><td width="250"><p id="u68bca266" class="ne-p"><span class="ne-text">方法名称</span></p></td><td width="250"><p id="u9acb1a01" class="ne-p"><span class="ne-text">参数列表</span></p></td><td width="250"><p id="u72bcedaa" class="ne-p"><span class="ne-text">返回结果</span></p></td></tr><tr style="height: 33px"><td width="250"><p id="u84ef1190" class="ne-p"><span class="ne-text">execCommand</span></p></td><td width="250"><ol class="ne-ol"><li id="u9ad2128d" data-lake-index-type="0"><code class="ne-code"><span class="ne-text">value</span></code><span class="ne-text">对齐方式</span><code class="ne-code"><span class="ne-text">left|right|center|justify|distributed</span></code></li></ol></td><td width="250"><p id="u17bb936a" class="ne-p"><span class="ne-text">true | false 表示成功或者失败</span></p></td></tr><tr style="height: 64px"><td width="250"><p id="u9d776962" class="ne-p"><span class="ne-text">queryCommandValue</span></p></td><td width="250"><p id="ud4c81ae2" class="ne-p"><span class="ne-text">-</span></p></td><td width="250"><p id="u46dbb96a" class="ne-p"><span class="ne-text">返回当前段落的</span><code class="ne-code"><span class="ne-text">left|right|center|justify|distributed</span></code></p></td></tr><tr style="height: 64px"><td width="250"><p id="ud3f3b440" class="ne-p"><span class="ne-text">queryCommandState</span></p></td><td width="250"><p id="u11c27288" class="ne-p"><span class="ne-text">-</span></p></td><td width="250"><p id="u383027e8" class="ne-p"><code class="ne-code"><span class="ne-text">-1 | 0</span></code><span class="ne-text"> 表示当前命令是否可用</span></p></td></tr></tbody></table>

```javascript
// 设置当前选区的段落居中对齐
editor.execCommand('alignment', 'center');
```

##### 5\. bold 切换选中文本的加粗

| 方法名称 | 参数列表 | 返回结果 |
| --- | --- | --- |
| execCommand | \- | true \| false 表示成功或者失败 |
| queryCommandValue | \- | 返回当前选中文本是否加粗 |
| queryCommandState | \- | `-1 \| 0` 表示当前命令是否可用 |

```javascript
// 切换当前选中文本加粗
editor.execCommand('bold');
```

##### 6\. italic 切换选中文本的斜体

| 方法名称 | 参数列表 | 返回结果 |
| --- | --- | --- |
| execCommand | \- | true \| false 表示成功或者失败 |
| queryCommandValue | \- | 返回当前选中文本是否斜体 |
| queryCommandState | \- | `-1 \| 0` 表示当前命令是否可用 |

```javascript
// 切换当前选中文本斜体
editor.execCommand('italic');
```

##### 7\. underline 切换选中文本的下划线

| 方法名称 | 参数列表 | 返回结果 |
| --- | --- | --- |
| execCommand | \- | true \| false 表示成功或者失败 |
| queryCommandValue | \- | 返回当前选中文本是否下划线 |
| queryCommandState | \- | `-1 \| 0` 表示当前命令是否可用 |

```javascript
// 切换当前选中文下划线
editor.execCommand('underline');
```

##### 8\. strikethrough 切换选中文本的中划线

| 方法名称 | 参数列表 | 返回结果 |
| --- | --- | --- |
| execCommand | \- | true \| false 表示成功或者失败 |
| queryCommandValue | \- | 返回当前选中文本是否中划线 |
| queryCommandState | \- | `-1 \| 0` 表示当前命令是否可用 |

```javascript
// 切换当前选中文本中划线
editor.execCommand('strikethrough');
```

##### 9\. bgColor 设置选中文本的背景颜色

<table id="MrJYF" class="ne-table" style="width: 750px"><tbody><tr style="height: 33px"><td width="250"><p id="u92eacc86" class="ne-p"><span class="ne-text" style="color: var(--color-syntax-1)">方法名称</span></p></td><td width="250"><p id="u79fc36b4" class="ne-p"><span class="ne-text" style="color: var(--color-syntax-1)">参数列表</span></p></td><td width="250"><p id="u6da9b261" class="ne-p"><span class="ne-text" style="color: var(--color-syntax-1)">返回结果</span></p></td></tr><tr style="height: 33px"><td width="250"><p id="u9182c14c" class="ne-p"><span class="ne-text" style="color: var(--color-syntax-1)">execCommand</span></p></td><td width="250"><ol class="ne-ol"><li id="u5cee226c" data-lake-index-type="0"><code class="ne-code"><span class="ne-text" style="color: var(--color-syntax-1)">color</span></code><span class="ne-text" style="color: var(--color-syntax-1)"> 颜色值，例如： ’#ff0000‘</span></li></ol></td><td width="250"><p id="u8b3e4e45" class="ne-p"><span class="ne-text" style="color: var(--color-syntax-1)">true | false 表示成功或者失败</span></p></td></tr><tr style="height: 64px"><td width="250"><p id="u1effe404" class="ne-p"><span class="ne-text" style="color: var(--color-syntax-1)">queryCommandValue</span></p></td><td width="250"><p id="u7187055b" class="ne-p"><span class="ne-text" style="color: var(--color-syntax-1)">-</span></p></td><td width="250"><p id="u0797df58" class="ne-p"><span class="ne-text" style="color: var(--color-syntax-1)">返回当前选中文本背景颜色</span></p></td></tr><tr style="height: 64px"><td width="250"><p id="u353f7908" class="ne-p"><span class="ne-text" style="color: var(--color-syntax-1)">queryCommandState</span></p></td><td width="250"><p id="u2abd3bd6" class="ne-p"><span class="ne-text" style="color: var(--color-syntax-1)">-</span></p></td><td width="250"><p id="ubf325374" class="ne-p"><code class="ne-code"><span class="ne-text" style="color: var(--color-syntax-1)">-1 | 0</span></code><span class="ne-text" style="color: var(--color-syntax-1)"> 表示当前命令是否可用</span></p></td></tr></tbody></table>

```javascript
// 设置当前选中文本背景颜色
editor.execCommand('bgColor', '#ff0000');
```

##### 10\. clearBgColor 清除选区的背景颜色

| 方法名称 | 参数列表 | 返回结果 |
| --- | --- | --- |
| execCommand | \- | true \| false 表示成功或者失败 |
| queryCommandState | \- | `-1 \| 0` 表示当前命令是否可用 |

```javascript
// 清除当前选中文本的背景颜色
editor.execCommand('clearBgColor');
```

##### 11\. breakLine 删除选区内容并换行

| 方法名称 | 参数列表 | 返回结果 |
| --- | --- | --- |
| execCommand | \- | true \| false 表示成功或者失败 |
| queryCommandState | \- | `-1 \| 0` 表示当前命令是否可用 |

```javascript
// 删除当前选区内容，并插入一个换行符
editor.execCommand('breakLine');
```

##### 12\. clearFormat 清除选中文本的格式

| 方法名称 | 参数列表 | 返回结果 |
| --- | --- | --- |
| execCommand | \- | true \| false 表示成功或者失败 |
| queryCommandState | \- | `-1 \| 0` 表示当前命令是否可用 |

```javascript
// 清空选中文本的颜色，背景颜色，下划线，中划线，加粗，斜体等
editor.execCommand('clearFormat');
```

##### 13\. code 创建行内代码块

<table id="srPjQ" class="ne-table" style="width: 750px"><tbody><tr style="height: 33px"><td width="250"><p id="uafb1b081" class="ne-p"><span class="ne-text" style="color: var(--color-syntax-1)">方法名称</span></p></td><td width="250"><p id="u0b756222" class="ne-p"><span class="ne-text" style="color: var(--color-syntax-1)">参数列表</span></p></td><td width="250"><p id="ue8a33e40" class="ne-p"><span class="ne-text" style="color: var(--color-syntax-1)">返回结果</span></p></td></tr><tr style="height: 33px"><td width="250"><p id="uba1c8ebb" class="ne-p"><span class="ne-text" style="color: var(--color-syntax-1)">execCommand</span></p></td><td width="250"><ol class="ne-ol"><li id="u2a32b2c8" data-lake-index-type="0"><code class="ne-code"><span class="ne-text" style="color: var(--color-syntax-1)">text</span></code><span class="ne-text" style="color: var(--color-syntax-1)"> 可选参数，行内代码块文本，如果是闭合选区则必传，如果不是闭合选区，默认取选中的文本</span></li></ol></td><td width="250"><p id="uf2f306f2" class="ne-p"><span class="ne-text" style="color: var(--color-syntax-1)">true | false 表示成功或者失败</span></p></td></tr><tr style="height: 64px"><td width="250"><p id="ua3116f91" class="ne-p"><span class="ne-text" style="color: var(--color-syntax-1)">queryCommandState</span></p></td><td width="250"><p id="uc8f2706c" class="ne-p"><span class="ne-text" style="color: var(--color-syntax-1)">-</span></p></td><td width="250"><p id="u8d0df403" class="ne-p"><code class="ne-code"><span class="ne-text" style="color: var(--color-syntax-1)">-1 | 0</span></code><span class="ne-text" style="color: var(--color-syntax-1)"> 表示当前命令是否可用</span></p></td></tr></tbody></table>

```javascript
// 根据当前选中文本创建一个行内代码块
editor.execCommand('code');
```

##### 14\. color 设置选中文本的颜色

<table id="q1ipH" class="ne-table" style="width: 750px"><tbody><tr style="height: 33px"><td width="250"><p id="ubb7c060b" class="ne-p"><span class="ne-text" style="color: var(--color-syntax-1)">方法名称</span></p></td><td width="250"><p id="u3b14a9f6" class="ne-p"><span class="ne-text" style="color: var(--color-syntax-1)">参数列表</span></p></td><td width="250"><p id="u359daae5" class="ne-p"><span class="ne-text" style="color: var(--color-syntax-1)">返回结果</span></p></td></tr><tr style="height: 33px"><td width="250"><p id="ue6dd7d25" class="ne-p"><span class="ne-text" style="color: var(--color-syntax-1)">execCommand</span></p></td><td width="250"><ol class="ne-ol"><li id="udcb043ee" data-lake-index-type="0"><span class="ne-text" style="color: var(--color-syntax-1)">color 颜色 ，例如：</span><code class="ne-code"><span class="ne-text" style="color: var(--color-syntax-1)">'#ff0000'</span></code><span class="ne-text" style="color: var(--color-syntax-1)">，支持渐变色(1.10.0 之后)：</span><code class="ne-code"><span class="ne-text" style="color: var(--color-syntax-1)">'#ff0,#0ff'</span></code></li></ol></td><td width="250"><p id="ued587b59" class="ne-p"><span class="ne-text" style="color: var(--color-syntax-1)">true | false 表示成功或者失败</span></p></td></tr><tr style="height: 64px"><td width="250"><p id="uc41e4de6" class="ne-p"><span class="ne-text" style="color: var(--color-syntax-1)">queryCommandValue</span></p></td><td width="250"><p id="ue7168c90" class="ne-p"><span class="ne-text" style="color: var(--color-syntax-1)">-</span></p></td><td width="250"><p id="ud5f2f6e9" class="ne-p"><span class="ne-text" style="color: var(--color-syntax-1)">返回当前选中文本的颜色</span></p></td></tr><tr style="height: 64px"><td width="250"><p id="ub08ea964" class="ne-p"><span class="ne-text" style="color: var(--color-syntax-1)">queryCommandState</span></p></td><td width="250"><p id="u43b27737" class="ne-p"><span class="ne-text" style="color: var(--color-syntax-1)">-</span></p></td><td width="250"><p id="u54135da4" class="ne-p"><code class="ne-code"><span class="ne-text" style="color: var(--color-syntax-1)">-1 | 0</span></code><span class="ne-text" style="color: var(--color-syntax-1)"> 表示当前命令是否可用</span></p></td></tr></tbody></table>

```javascript
// 设置当前选中文本的颜色
editor.execCommand('color', '#ff0000');
```

##### 15\. clearColor 清除文本的前景色

| 方法名称 | 参数列表 | 返回结果 |
| --- | --- | --- |
| execCommand | \- | true \| false 表示成功或者失败 |
| queryCommandState | \- | `-1 \| 0` 表示当前命令是否可用 |

```javascript
// 清空选中文本的颜色
editor.execCommand('clearColor');
```

##### 16\. wordCount 获取当前文档的字数统计

| 方法名称 | 参数列表 | 返回结果 |
| --- | --- | --- |
| queryCommandValue | \- | 获取当前文档的字数统计 |
| queryCommandState | \- | `-1 \| 0` 表示当前命令是否可用 |

```javascript
// 在当前选区进行全选操作，默认会选择容器，再次执行全选会向上继续全选
editor.queryCommandValue('wordCount');
```

##### 17\. isEmpty 判断当前文档是否为空

| 方法名称 | 参数列表 | 返回结果 |
| --- | --- | --- |
| queryCommandValue | \- | `true\|false` 文档是否是空 |
| queryCommandState | \- | `-1 \| 0` 表示当前命令是否可用 |

```javascript
// 判断当前文档是否是空
editor.queryCommandValue('isEmpty');
```

##### 18\. delete 删除选区内容

| 方法名称 | 参数列表 | 返回结果 |
| --- | --- | --- |
| execCommand | \- | true \| false 表示成功或者失败 |
| queryCommandState | \- | `-1 \| 0` 表示当前命令是否可用 |

```javascript
// 删除选区的内容
editor.execCommand('delete');
```

##### 19\. fontsize 设置选中文字的字号

<table id="N1r9s" class="ne-table" style="width: 750px"><tbody><tr style="height: 33px"><td width="250"><p id="u2794d231" class="ne-p"><span class="ne-text" style="color: var(--color-syntax-1)">方法名称</span></p></td><td width="250"><p id="ua14e5d11" class="ne-p"><span class="ne-text" style="color: var(--color-syntax-1)">参数列表</span></p></td><td width="250"><p id="uba227845" class="ne-p"><span class="ne-text" style="color: var(--color-syntax-1)">返回结果</span></p></td></tr><tr style="height: 33px"><td width="250"><p id="u5fccf63f" class="ne-p"><span class="ne-text" style="color: var(--color-syntax-1)">execCommand</span></p></td><td width="250"><ol class="ne-ol"><li id="u53f7f4da" data-lake-index-type="0"><code class="ne-code"><span class="ne-text" style="color: var(--color-syntax-1)">fontSize</span></code><span class="ne-text" style="color: var(--color-syntax-1)">字号大小 ，例如： 12，取值区间</span><code class="ne-code"><span class="ne-text" style="color: var(--color-syntax-1)">[12, 13,14,15,16,19,22,24,29,32,40]</span></code></li></ol></td><td width="250"><p id="u4e7129f8" class="ne-p"><span class="ne-text" style="color: var(--color-syntax-1)">true | false 表示成功或者失败</span></p></td></tr><tr style="height: 64px"><td width="250"><p id="u9cc1df5d" class="ne-p"><span class="ne-text" style="color: var(--color-syntax-1)">queryCommandValue</span></p></td><td width="250"><p id="u920f8cca" class="ne-p"><span class="ne-text" style="color: var(--color-syntax-1)">-</span></p></td><td width="250"><p id="u9c575ac6" class="ne-p"><span class="ne-text" style="color: var(--color-syntax-1)">返回当前选中文本的字号</span></p><p id="u52596a59" class="ne-p"><code class="ne-code"><span class="ne-text" style="color: var(--color-syntax-1)">[12, 13,14,15,16,19,22,24,29,32,40]</span></code></p></td></tr><tr style="height: 64px"><td width="250"><p id="u345f6112" class="ne-p"><span class="ne-text" style="color: var(--color-syntax-1)">queryCommandState</span></p></td><td width="250"><p id="u7c6f373c" class="ne-p"><span class="ne-text" style="color: var(--color-syntax-1)">-</span></p></td><td width="250"><p id="ubdcea9fd" class="ne-p"><code class="ne-code"><span class="ne-text" style="color: var(--color-syntax-1)">-1 | 0</span></code><span class="ne-text" style="color: var(--color-syntax-1)"> 表示当前命令是否可用</span></p></td></tr></tbody></table>

```javascript
// 设置当前选中文本的字号
editor.execCommand('fontsize', 22);
```

##### 20\. defaultFontsize 设置正文的默认字号

> 需要注意，如果执行`setDocument`会重新读取参数中的`meta`信息覆盖掉当前的默认字号。通常不需要执行该命令，建议默认字号通过配置传入。参考：[默认字号（defaultFontsize）](https://yuque.antfin-inc.com/lark/lakex-doc/hax78tz7qkt1odvy "默认字号（defaultFontsize）")

<table id="RdJCt" class="ne-table" style="width: 750px"><tbody><tr style="height: 33px"><td width="250"><p id="ud4c75051" class="ne-p"><span class="ne-text" style="color: var(--color-syntax-1)">方法名称</span></p></td><td width="250"><p id="uc0d651ca" class="ne-p"><span class="ne-text" style="color: var(--color-syntax-1)">参数列表</span></p></td><td width="250"><p id="u682911ff" class="ne-p"><span class="ne-text" style="color: var(--color-syntax-1)">返回结果</span></p></td></tr><tr style="height: 33px"><td width="250"><p id="uabe596ef" class="ne-p"><span class="ne-text" style="color: var(--color-syntax-1)">execCommand</span></p></td><td width="250"><ol class="ne-ol"><li id="uce73a2ad" data-lake-index-type="0"><code class="ne-code"><span class="ne-text" style="color: var(--color-syntax-1)">fontSize</span></code><span class="ne-text" style="color: var(--color-syntax-1)">字号大小 ，例如： 12，取值区间</span><code class="ne-code"><span class="ne-text" style="color: var(--color-syntax-1)">[12, 13,14,15,16,19,22,24,29,32,40]</span></code></li></ol></td><td width="250"><p id="u475bae45" class="ne-p"><span class="ne-text" style="color: var(--color-syntax-1)">true | false 表示成功或者失败</span></p></td></tr><tr style="height: 64px"><td width="250"><p id="u412a2a5d" class="ne-p"><span class="ne-text" style="color: var(--color-syntax-1)">queryCommandValue</span></p></td><td width="250"><p id="u3e1d4110" class="ne-p"><span class="ne-text" style="color: var(--color-syntax-1)">-</span></p></td><td width="250"><p id="u2d7634d4" class="ne-p"><span class="ne-text" style="color: var(--color-syntax-1)">返回当前文档的默认字号</span></p><p id="ue4f3d63e" class="ne-p"><code class="ne-code"><span class="ne-text" style="color: var(--color-syntax-1)">[12, 13,14,15,16,19,22,24,29,32,40]</span></code></p></td></tr><tr style="height: 64px"><td width="250"><p id="u4925593a" class="ne-p"><span class="ne-text" style="color: var(--color-syntax-1)">queryCommandState</span></p></td><td width="250"><p id="ueb2f26b6" class="ne-p"><span class="ne-text" style="color: var(--color-syntax-1)">-</span></p></td><td width="250"><p id="u3f204fe7" class="ne-p"><code class="ne-code"><span class="ne-text" style="color: var(--color-syntax-1)">-1 | 0</span></code><span class="ne-text" style="color: var(--color-syntax-1)"> 表示当前命令是否可用</span></p></td></tr></tbody></table>

```javascript
// 设置当前文档的默认字号
editor.execCommand('defaultFontsize', 22);
```

##### 21\. clearDefaultFontsize 清除默认字号

| 方法名称 | 参数列表 | 返回结果 |
| --- | --- | --- |
| execCommand | \- | true \| false 表示成功或者失败 |
| queryCommandState | \- | `-1 \| 0` 表示当前命令是否可用 |

```javascript
// 清空文档的默认字号
editor.execCommand('clearDefaultFontsize');
```

##### 22\. redo 重做撤销的命令

| 方法名称 | 参数列表 | 返回结果 |
| --- | --- | --- |
| execCommand | \- | true \| false 表示成功或者失败 |
| queryCommandState | \- | `-1 \| 0` 表示当前命令是否可用 |

```javascript
// 执行重做撤销的命令
editor.execCommand('redo');
```

##### 23\. undo 撤销命令

| 方法名称 | 参数列表 | 返回结果 |
| --- | --- | --- |
| execCommand | \- | true \| false 表示成功或者失败 |
| queryCommandState | \- | `-1 \| 0` 表示当前命令是否可用 |

```javascript
// 撤销最近执行的命令
editor.execCommand('undo');
```

##### 24\. indent 增加缩进和行首缩进

| 方法名称 | 参数列表 | 返回结果 |
| --- | --- | --- |
| execCommand | \- | true \| false 表示成功或者失败 |
| queryCommandState | \- | `-1 \| 0` 表示当前命令是否可用 |

```javascript
// 如果段落未行首缩进，首先执行行首缩进，如果已经行首缩进，则执行段落缩进
editor.execCommand('indent');
```

##### 25\. outdent 减少缩进和段落头部空两个字符

| 方法名称 | 参数列表 | 返回结果 |
| --- | --- | --- |
| execCommand | \- | true \| false 表示成功或者失败 |
| queryCommandState | \- | `-1 \| 0` 表示当前命令是否可用 |

```javascript
// 有缩进优先减少缩进，没有缩进有行首缩进，则去除行首缩进
editor.execCommand('outdent');
```

##### 26\. selectAll 全选

| 方法名称 | 参数列表 | 返回结果 |
| --- | --- | --- |
| execCommand | \- | true \| false 表示成功或者失败 |
| queryCommandState | \- | `-1 \| 0` 表示当前命令是否可用 |

```javascript
// 在当前选区进行全选操作，默认会选择容器，再次执行全选会向上继续全选
editor.execCommand('selectAll');
```

##### 27\. insertAtSelection 在当前选区插入1.3.0-beta.8

如果选区非折叠，被选中的内容将会被替换为插入内容。

<table id="IRIly" class="ne-table" style="width: 750px"><tbody><tr style="height: 33px"><td width="250"><p id="u0a3db1ff" class="ne-p"><span class="ne-text" style="color: var(--color-syntax-1)">方法名称</span></p></td><td width="250"><p id="u9f4359cd" class="ne-p"><span class="ne-text" style="color: var(--color-syntax-1)">参数列表</span></p></td><td width="250"><p id="u6cc812b2" class="ne-p"><span class="ne-text" style="color: var(--color-syntax-1)">返回结果</span></p></td></tr><tr style="height: 33px"><td width="250"><p id="uf7d7fdac" class="ne-p"><span class="ne-text" style="color: var(--color-syntax-1)">execCommand</span></p></td><td width="250"><ol class="ne-ol"><li id="u6e6c98f3" data-lake-index-type="0"><code class="ne-code"><span class="ne-text" style="color: #117CEE">string</span></code><span class="ne-text" style="color: var(--color-syntax-1)">数据格式，例如： 支持格式</span><code class="ne-code"><span class="ne-text" style="color: var(--color-syntax-1)">text/html</span></code><span class="ne-text" style="color: var(--color-syntax-1)">、</span><code class="ne-code"><span class="ne-text" style="color: var(--color-syntax-1)">text/markdown</span></code><span class="ne-text" style="color: var(--color-syntax-1)">，</span><code class="ne-code"><span class="ne-text" style="color: var(--color-syntax-1)">text/plain</span></code><span class="ne-text" style="color: var(--color-syntax-1)">，</span><code class="ne-code"><span class="ne-text" style="color: var(--color-syntax-1)">text/lake</span></code><span class="ne-text" style="color: var(--color-syntax-1)">等</span></li><li id="u28777836" data-lake-index-type="0"><code class="ne-code"><span class="ne-text" style="color: #117CEE">string</span></code><span class="ne-text" style="color: var(--color-syntax-1)">数据字符串</span></li></ol></td><td width="250"><p id="u46e98fe0" class="ne-p"><span class="ne-text" style="color: var(--color-syntax-1)">插入的节点对象。</span></p><p id="u7341df1e" class="ne-p"><span class="ne-text" style="color: var(--color-syntax-1)">如果失败将返回</span><code class="ne-code"><span class="ne-text" style="color: var(--color-syntax-1)">null</span></code></p></td></tr><tr style="height: 64px"><td width="250"><p id="u2372a758" class="ne-p"><span class="ne-text" style="color: var(--color-syntax-1)">queryCommandValue</span></p></td><td width="250"><p id="u76dbfec5" class="ne-p"><span class="ne-text" style="color: var(--color-syntax-1)">-</span></p></td><td width="250"><p id="uabbd64bc" class="ne-p"><span class="ne-text">-</span></p></td></tr><tr style="height: 64px"><td width="250"><p id="u4fafeb58" class="ne-p"><span class="ne-text" style="color: var(--color-syntax-1)">queryCommandState</span></p></td><td width="250"><p id="u0aa4677e" class="ne-p"><span class="ne-text" style="color: var(--color-syntax-1)">-</span></p></td><td width="250"><p id="u7d19ea58" class="ne-p"><span class="ne-text">-</span></p></td></tr></tbody></table>

```javascript
editor.execCommand(
      'insertAtSelection',
      'text/html',
      '<b>strong</b>',
    );
```

##### 28\. getNodeContent 获取节点指定格式数据1.3.0-beta.8

<table id="mzNE8" class="ne-table" style="width: 750px"><tbody><tr style="height: 33px"><td width="250"><p id="u01d09294" class="ne-p"><span class="ne-text" style="color: var(--color-syntax-1)">方法名称</span></p></td><td width="250"><p id="u1295e71c" class="ne-p"><span class="ne-text" style="color: var(--color-syntax-1)">参数列表</span></p></td><td width="250"><p id="ua048b7ad" class="ne-p"><span class="ne-text" style="color: var(--color-syntax-1)">返回结果</span></p></td></tr><tr style="height: 33px"><td width="250"><p id="ueb06517c" class="ne-p"><span class="ne-text" style="color: var(--color-syntax-1)">execCommand</span></p></td><td width="250"><ol class="ne-ol"><li id="u760e2c3c" data-lake-index-type="0"><code class="ne-code"><span class="ne-text" style="color: #117CEE">string</span></code><span class="ne-text" style="color: var(--color-syntax-1)">节点id</span></li><li id="u3ac8fd32" data-lake-index-type="0"><code class="ne-code"><span class="ne-text" style="color: #117CEE">string</span></code><span class="ne-text" style="color: var(--color-syntax-1)">数据格式，例如： 支持格式</span><code class="ne-code"><span class="ne-text" style="color: var(--color-syntax-1)">text/html</span></code><span class="ne-text" style="color: var(--color-syntax-1)">、</span><code class="ne-code"><span class="ne-text" style="color: var(--color-syntax-1)">text/markdown</span></code><span class="ne-text" style="color: var(--color-syntax-1)">，</span><code class="ne-code"><span class="ne-text" style="color: var(--color-syntax-1)">text/plain</span></code><span class="ne-text" style="color: var(--color-syntax-1)">，</span><code class="ne-code"><span class="ne-text" style="color: var(--color-syntax-1)">text/lake</span></code><span class="ne-text" style="color: var(--color-syntax-1)">等</span></li></ol></td><td width="250"><p id="u0b3461d5" class="ne-p"><span class="ne-text" style="color: var(--color-syntax-1)">对应格式的字符串</span></p><p id="u557bcfec" class="ne-p"><span class="ne-text" style="color: var(--color-syntax-1)">如果失败将返回空字符串</span></p></td></tr><tr style="height: 64px"><td width="250"><p id="u82b04ca0" class="ne-p"><span class="ne-text" style="color: var(--color-syntax-1)">queryCommandValue</span></p></td><td width="250"><p id="u1e7b2ef2" class="ne-p"><span class="ne-text" style="color: var(--color-syntax-1)">-</span></p></td><td width="250"><p id="u30d7c261" class="ne-p"><span class="ne-text">-</span></p></td></tr><tr style="height: 64px"><td width="250"><p id="u4e03fda3" class="ne-p"><span class="ne-text" style="color: var(--color-syntax-1)">queryCommandState</span></p></td><td width="250"><p id="uad9a3e30" class="ne-p"><span class="ne-text" style="color: var(--color-syntax-1)">-</span></p></td><td width="250"><p id="u13df6845" class="ne-p"><span class="ne-text">-</span></p></td></tr></tbody></table>

```javascript
editor.execCommand(
      'getNodeContent',
      '123',
      'text/html',
    );
```

#### markdown流展示

原文链接：https://www.yuque.com/yuque/developer/wr034t6x3kk8whz5
更新时间：2024-09-05T13:47:22.000Z
字数：708

> `1.48.0` 后支持

在完成阅读器的创建之后，您可以使用 markdownStream 命令来实现 markdown 的流展示。如果接入了 AI 则可以通过此命令来展示 AI 的输出结果。

下面是 **demo**

```typescript
const markdown = `高等数学是大学数学的一个基础而重要的分支，它涵盖了微积分、级数、多元函数微分学、常微分方程等多个部分。以下是一些高数中常用的数学公式，这些公式在解决各种数学问题时非常关键：

###### 微积分基础

1. **导数的基本公式**：
   - $ (x^n)' = nx^{n-1} $ （$ n $为常数）
   - $ (e^x)' = e^x $
   - $ (\\ln|x|)' = \\frac{1}{x} $
   - $ (\\sin{x})' = \\cos{x} $
   - $ (\\cos{x})' = -\\sin{x} $
   - $ (\\tan{x})' = \\sec^2{x} $

2. **不定积分的基本公式**：
   - $ \\int x^n dx = \\frac{x^{n+1}}{n+1} + C $ （$ n \\neq -1 $）
   - $ \\int e^x dx = e^x + C $
   - $ \\int \\frac{1}{x} dx = \\ln|x| + C $
   - $ \\int \\sin{x} dx = -\\cos{x} + C $
   - $ \\int \\cos{x} dx = \\sin{x} + C $
   - $ \\int \\sec^2{x} dx = \\tan{x} + C $

3. **定积分的计算**：
   - 基本定理：如果函数 $ f(x) $ 在区间 $[a, b]$ 上连续，则 $\\int_{a}^{b} f(x) dx = F(b) - F(a)$，其中 $F(x)$ 是 $f(x)$ 的一个原函数。

4. **微分方程**：
   - 一阶线性微分方程：$ \\frac{dy}{dx} + P(x)y = Q(x) $，其解的形式为 $ y = e^{-\\int P(x)dx} \\left[ \\int Q(x)e^{\\int P(x)dx} dx + C \\right] $

###### 级数

1. **几何级数**：
   - $ \\sum_{n=0}^{\\infty} ar^n = \\frac{a}{1-r} $，当 $ |r| < 1 $

2. **调和级数**（不收敛）：
   - $ \\sum_{n=1}^{\\infty} \\frac{1}{n} $

3. **泰勒级数与麦克劳林级数**：
   - $ f(x) = f(a) + f'(a)(x-a) + \\frac{f''(a)}{2!}(x-a)^2 + \\cdots $

###### 多元函数微分学

1. **偏导数**：
   - $ \\frac{\\partial}{\\partial x}f(x,y) $，$ \\frac{\\partial}{\\partial y}f(x,y) $

2. **梯度**：
   - $ \\nabla f = \\left( \\frac{\\partial f}{\\partial x}, \\frac{\\partial f}{\\partial y}, \\ldots \\right) $

3. **多元函数的链式法则**：
   - 若 $ z = f(x, y), x = g(t), y = h(t) $，则 $ \\frac{dz}{dt} = \\frac{\\partial z}{\\partial x}\\frac{dx}{dt} + \\frac{\\partial z}{\\partial y}\\frac{dy}{dt} $

这只是高数中的一部分常用公式，实际上还有更多复杂的概念和公式，如重积分、曲线积分、曲面积分、级数的敛散性判断等。掌握这些基本公式是学习高等数学的基础，通过练习和应用可以更深入地理解它们。`;

let i = 0;
const loop = () => {
  i++;
  viewer.execCommand('markdownStream', markdown.slice(0, i));
  if (i < markdown.length) {
    requestAnimationFrame(loop);
  }
};

requestAnimationFrame(loop);
```

> 如果需要多次展示，也不用重新创建阅读器，只要 markdown 内容有变动，markdownStream 命令可以让阅读器跟着 markdown 更新。


#### 配置

##### 通用配置

原文链接：https://www.yuque.com/yuque/developer/hrz4raqhg9bsv9g9
更新时间：2024-10-26T16:05:14.000Z
字数：436

在创建编辑器的时候需要传递的配置，已经带有一个开箱即用的配置，如果有修改的地方可以参考子文档进行更改。

> **除通用配置外**
> **其余各插件配置：插件名**是配置项的一级`key`，每个插件名就是**文档标题**里的英文单词

###### 配置方式

`createOpenEditor/createOpenViewer`第二个参数支持一个对象

```typescript
const { createOpenEditor } = window.Doc;

const editor = createOpenEditor(document.body, {
  // 通用配置
  disabledPlugins:[],
  // 插件配置，参考各插件文档，key为插件名
  image:{...},
  clipboard:{...},
})
```

###### 禁用插件

`disabledPlugins: Array<string>`

支持传入一个插件列表，列表项为插件的名称字符串。

###### 标题组件

`header: React.Component | React.FunctionComponent`

在文档上方渲染一个组件

###### 编辑器类型

`uiSwitch: { default: 'simple' | 'default' | 'small' }`

小窗口编辑器传入 simple 即可或者 small

###### 当前页面链接

`currentURL: string`

输出 html 的时候一些卡片会用到

###### 适配器（envAdapter）

`envAdapter: null | EnvAdapter`

适配器是为了满足某些交互的响应在不同的设备环境下、或者不同业务场景下需要有不同的表现的需求。编辑模式和阅读模式都有自己的适配器。

###### 虚拟渲染 (1.6.0 之后支持)

`virtualRendering: boolean`

###### 暗黑模式（1.12.0 之后支持）

`darkMode: boolean`

###### scrollNode

`scrollNode: HTMLElement| () => HTMLElement`

配置滚动容器，某些默认行为需要指定正确的滚动容器才能生效。未配置 scrollNode 建议直接让编辑器固定高度。

阅读器大纲需求配置真实的滚动容器。

###### boundaryTopOffset `阅读器配置`

`number`

目前会影响大纲的滚动偏移量。

##### 适配器（envAdapter）

原文链接：https://www.yuque.com/yuque/developer/ggspapip2fvgao1w
更新时间：2024-03-14T08:12:55.000Z
字数：687

适配器是为了满足某些交互的响应在不同的设备环境下、或者不同业务场景下需要有不同的表现的需求。编辑模式和阅读模式都有自己的适配器。

###### 原理

用户如果触发了编辑器节点上的DOMUI事件，编辑器会根据当前用户行为向外抛出事件，在阅读模式下事件通过`viewer`抛出，编辑模式下则通过`editor`抛出。`EnvAdapter`在被初始化时会去监听这些事件从而调用对应的方法。

###### 阅读模式适配器

阅读模式支持下面几种交互自定义

| **方法** | **参数及类型** | **方法描述** |
| --- | --- | --- |
| `**openLink**`(url: string, isExternal: boolean) | `url: string`<br>链接URL  <br>`isExternal: boolean`<br>是否要在新窗口中打开 | 打开链接。可以在打开链接前执行一些安全策略。 |
| `**openMentionLink**`(url: string, isExternal: boolean) | `url: string`<br>链接 URL  <br>`isExternal`<br>是否是在新窗口中打开 | 打开提及人的链接 |
| `**previewImgs**`(imgs: IPreviewImgInfo[], index: number) | `{Array<{src:string; msrc:string; w:number; h:number}>}`<br>图片信息数组  <br>`{number}`<br>index 索引 | 预览图片，会获取到文档内所有图片，可以在此实现图片查看器。`src`为图片原始地址，`msrc`为图片压缩图地址。用户点击图片会触发该方法执行。 |
| `**longPressCard**`(params: Record<string, unknown>) | `{object}`<br>params 参数，不同卡片长按可能需要不同的参数，业务自行约定 | 卡片长按事件。提供给移动端使用。入参需要自定义，可以参考[editUI和viewerUI](https://yuque.antfin-inc.com/lark/laphzd/vh3vxs011i3kbged "editUI和viewerUI")实现一个UI，然后在UI中通过`this.viewer.emitEvent('longPressCard', args);`传递参数、触发该方法的执行。 |

###### 编辑模式适配器

编辑模式支持下面几种交互自定义

| **方法** | **参数及类型** | **方法描述** |
| --- | --- | --- |
| `**openLink**`(url: string, isExternal: boolean) | `url: string`<br>链接URL  <br>`isExternal: boolean`<br>是否要在新窗口中打开 | 打开超链接 |
| `**openMentionLink**`(url: string, isExternal: boolean) | `url: string`<br>链接 URL  <br>`isExternal`<br>是否是在新窗口中打开 | 打开 mention 链接 |
| `**openLocalLink**`(url: string) | `url: string`<br>链接 URL | 在本地打开链接 |
| `**openBookmarkLink**`(url: string) | `url: string`<br>书签链接 URL | 打开书签链接 |
| `**openThirdpartyLink**`(url: string) | `url: string`<br>三方服务链接 URL | 打开三方服务链接 |
| `**previewImgs**`(imgs: Array<{src:string; msrc:string; w:number; h:number; layoutSlef?:() => void;size?:number}>, index: number) | `imgs`<br>图片信息的数组  <br>`index`<br>当前打开的图片在数组中的索引 | 预览图片 |
| `**longPressCard**`(params: any) | `{object}`<br>params 参数，不同卡片长按可能需要不同的参数，业务自行约定 | 卡片长按事件处理 |

###### demo

```javascript
window.onload = function () {
  const { createOpenEditor } = window.Doc;
  // 创建编辑器
  const editor = createOpenEditor(document.getElementById('root'), {
    envAdapter: {
      openLink: (url, isExternal) => {
        console.info(url, isExternal);
        window.open(url, isExternal ? '__blank': '__self');
      }
    },
  });
}
```

##### 占位文案（placeholder）

原文链接：https://www.yuque.com/yuque/developer/xtks4cc7gqmvgrun
更新时间：2024-03-14T08:16:13.000Z
字数：134

![image](https://cdn.nlark.com/yuque/0/2024/png/525935/1710404063817-ef17e02e-d3e9-48a9-bbae-0369e7b63b17.png)

仅支持编辑模式。

###### 编辑模式配置项

可以只传一个字符串，如

```typescript
const option = {
  placeholder: "请输入文字"
};
```

也支持配置一个对象

###### tip

`string`

编辑器空内容时展示的提示文案。配置效果等价于直接配置一个字符串。

###### emptyParagraphTip

`string`

在光标聚焦的空段落首的提示文案。单独配置不生效。

```javascript
const option = {
  placeholder: {
    tip: '请输入文字',
    emptyParagraphTip: '输入 / 唤起更多',
  },
};
```

##### 公式（math）

原文链接：https://www.yuque.com/yuque/developer/huo0d65g1qdlupia
更新时间：2024-08-01T01:52:13.000Z
字数：66

阅读器和编辑器配置项相同

###### 配置项

###### KaTexURL

`string`

katex的umd资源地址。不建议配置该项。

###### hideOnInvisible

`boolean`

根据`intersectobserver`判断公式卡片不可见时是否隐藏节点以提升渲染性能。默认为`false`

##### 提及（mention）

原文链接：https://www.yuque.com/yuque/developer/hh1d9edpslrlv33g
更新时间：2024-08-01T01:51:08.000Z
字数：770

![image](https://cdn.nlark.com/yuque/0/2024/png/525935/1722477016789-5b278957-a6a0-4436-8729-0ed5d2bb7c90.png)

###### 提及项

> 目前还不支持内容，配置时忽略相关配置

提及的内容可以是人或者文档。对应的接口如下。参数的UI含义可以参考头图。默认只支持提及人。如果想要支持两种，需要配置`[multiTypes](https://yuque.antfin-inc.com/lark/lakex-doc/sk5fri38i6lz4ae3#multiTypes)`

人

```typescript
export type MentionUserData = {
  id: string;
  nickName: Nullable<string>;
  name: string;
  avatar: string;
  avatar_url?: string;
  dep: string;
  login: string;
};
```

内容

```typescript
export type MentionContentData = {
  url: string;
  id: string;
  title: string;
  /** 目前支持各种文档类型，会展示相应UI */
  type: string;
  updated_at: string;
  group: string;
  book: string;
};
```

###### 配置项

###### avatarOrigin

`string`

补全头像的完整url所需的origin。在提及列表项的头像图片资源前追加的链接信息，通常不需要配置，默认为空字符串。

###### defaultList

`(MentionResponse | (() => Promise<MentionResponse>))`

默认列表内容。类型如下。结合`[multiTypes](https://yuque.antfin-inc.com/lark/lakex-doc/sk5fri38i6lz4ae3#multiTypes)`配置选择正确的默认列表。也支持配置一个异步函数，以满足通过接口获取默认列表内容的能力。

```typescript
type MentionResponse =
	| {
      docs: Array<MentionContentData>;
      users: Array<MentionUserData>;
  	}
	| Array<MentionUserData>
```

###### editUI

`Class<any, IEditCardUI<any>>`

详见卡片UI配置部分。

###### enableQuickInput

`boolean`

是否支持快捷键输入，默认为`true`。快捷键为`@`。

###### externalOpen

`boolean`

跳转提及人的链接是否新开标签页，默认为`false`。

###### generateMentionInfo

`(detail: { login?: Nullable<string>; nickName?: Nullable<string>; name?: Nullable<string>; }) => { text: Nullable<string>; url: Nullable<string>; externalOpen: boolean; }`

根据人项的值，获取提及人时与UI相关的数据：文本、跳转链接和是否新开页跳转。如果不传则使用内置的一套逻辑。

###### mentionURL

`string`

获取提及列表的接口。接口使用get请求，要求接口返回内容与`[defaultList](https://yuque.antfin-inc.com/lark/lakex-doc/sk5fri38i6lz4ae3#defaultList)`中定义的响应数据结构一致

<table id="P8oYc" class="ne-table" style="width: 744px"><tbody><tr style="height: 37px"><td width="107" style="background-color: #F4F5F5"><p id="u07872b16" class="ne-p" style="text-align: center"><strong><span class="ne-text" style="font-size: 14px">请求方式</span></strong></p></td><td width="637"><p id="u4d72b815" class="ne-p"><code class="ne-code"><span class="ne-text">GET</span></code></p></td></tr><tr style="height: 33px"><td width="107" style="background-color: #F4F5F5"><p id="u53cc4a53" class="ne-p" style="text-align: center"><strong><span class="ne-text">请求值</span></strong></p></td><td width="637"><p id="udb816a95" class="ne-p"><a href="https://yuque.antfin-inc.com/lark/lakex-doc/sk5fri38i6lz4ae3#mentionURLParams" data-href="https://yuque.antfin-inc.com/lark/lakex-doc/sk5fri38i6lz4ae3#mentionURLParams" class="ne-link"><span class="ne-text">#mentionURLParams</span></a></p></td></tr><tr style="height: 33px"><td width="107" style="background-color: #F4F5F5"><p id="u0fdba039" class="ne-p" style="text-align: center"><strong><span class="ne-text">响应值</span></strong></p></td><td width="637"><p id="u56401e73" class="ne-p"><span class="ne-text">参考</span><a href="https://yuque.antfin-inc.com/lark/lakex-doc/sk5fri38i6lz4ae3#defaultList" data-href="https://yuque.antfin-inc.com/lark/lakex-doc/sk5fri38i6lz4ae3#defaultList" class="ne-link"><span class="ne-text">#defaultList</span></a></p><pre data-language="json" id="BwowG" class="ne-codeblock language-json"><code>{
  "data": {
    /** MentionResponse */
	}
}</code></pre></td></tr></tbody></table>

###### mentionURLParams

`object | (input: string, tab?: 'users' | 'docs') => object`

提及接口的入参，支持一个函数。函数的第一个入参为当前用户输入的字符。

###### multiTypes

`boolean`

是否支持提及内容，默认为`false`。

###### onAfterKernelPluginInit

`(kernel: IKernel) => void`

kernel插件初始化之后的钩子，可以在此实现一些业务逻辑

###### onMentionSearch

`(input: string, tab: 'users' | 'docs') => Promise<MentionResponse>`

提及的查询接口，这个配置可以替代[#mentionURLParams](https://yuque.antfin-inc.com/lark/lakex-doc/sk5fri38i6lz4ae3#mentionURLParams)和[#mentionURL](https://yuque.antfin-inc.com/lark/lakex-doc/sk5fri38i6lz4ae3#mentionURL)。而且如果有了该配置，另外两个配置也是无效的。

###### origin

`Nullable<string>`

内置的[#generateMentionInfo](https://yuque.antfin-inc.com/lark/lakex-doc/sk5fri38i6lz4ae3#generateMentionInfo)逻辑会使用这个参数生成跳转链接的路径：``encodeURI(`${origin}/${login}`)``。默认会使用`location.origin`

###### recordURL

`string`

记录提及人的行为接口。用户从提及列表中选中了一个人之后随即向该api发起请求。请求方式为`POST`

<table id="W4Qoq" class="ne-table" style="width: 744px"><tbody><tr style="height: 37px"><td width="107" style="background-color: #F4F5F5"><p id="u2f5fbb31" class="ne-p" style="text-align: center"><strong><span class="ne-text" style="font-size: 14px">请求方式</span></strong></p></td><td width="637"><p id="ua1165777" class="ne-p"><code class="ne-code"><span class="ne-text">POST</span></code></p></td></tr><tr style="height: 33px"><td width="107" style="background-color: #F4F5F5"><p id="u487088ff" class="ne-p" style="text-align: center"><strong><span class="ne-text">请求值</span></strong></p></td><td width="637"><pre data-language="json" id="B7MU3" class="ne-codeblock language-json"><code>{
  "action_type": "mention",
  "target_type": "User",
  "target_id": "人的ID",
}</code></pre></td></tr><tr style="height: 33px"><td width="107" style="background-color: #F4F5F5"><p id="u1b0140e2" class="ne-p" style="text-align: center"><strong><span class="ne-text">响应值</span></strong></p></td><td width="637"><p id="u49696fa3" class="ne-p"><code class="ne-code"><span class="ne-text">void</span></code></p></td></tr></tbody></table>

###### viewerUI

`Class<any, IViewerCardUI<any>>`

阅读态的卡片UI配置，详细参考卡片UI部分内容。

###### popupContainer1.7.0

`() => HTMLELement`

配置编辑模式下弹层的父容器，默认在编辑器内部，可以配置在body上

##### 日期卡片（dateCard）

原文链接：https://www.yuque.com/yuque/developer/mb90vi84myfbg0gh
更新时间：2024-08-01T01:57:18.000Z
字数：45

###### 简介

03月29日

1.  支持 mention 选择日期

![image](https://cdn.nlark.com/yuque/0/2024/png/525935/1722477430802-e6b9762b-8d6c-4b1e-9e30-77d286a97d77.png)

2.  支持斜杆选择日期
3.  ![image](https://cdn.nlark.com/yuque/0/2024/png/525935/1722477431213-912c92c2-5ffc-41c3-8693-7cd5fbb01f0e.png)

###### 配置

###### supportMention

`boolean`

是否支持 mention，默认是 true ，不需要可以配置成 false

##### 多级标题（heading）

原文链接：https://www.yuque.com/yuque/developer/agi4m356u4vempmw
更新时间：2024-08-01T01:55:37.000Z
字数：170

![image](https://cdn.nlark.com/yuque/0/2024/png/525935/1722477334236-027b9968-e163-4050-897c-fc84a750dcd4.png)

阅读模式和编辑模式配置项相同。

###### 配置项

###### generateHashLink

`(url: string | URL, id: string) => string | null`

根据当前页面地址和标题节点id生成hash链接。需自行处理链接的跳转行为，通常用于分享给别人快速跳转到指定文档位置。

###### anchor

`boolean`

标题锚点，点击锚点会**复制**当前标题的hash链接，默认为false。如果需要该功能，则必须配置`generateHashLink`，否则将会提示复制失败。

###### folding

`boolean`

标题折叠，点击会收起当前层级标题下的所有内容。默认启用该功能。

##### kernel-assistant

原文链接：https://www.yuque.com/yuque/developer/ynvwrd7i51ctg7kc
更新时间：2024-08-01T01:54:19.000Z
字数：48

> **1.7.0 以后的版本支持**

###### supportEmoji

`boolean`

emoji 使用独立的字体，让以前会渲染错误的 emoji 可以尽量正确的渲染

```javascript
const opt = {
  kernelAssistant: {
    supportEmoji: true,
  },
};
```

##### 斜杠命令（slash）

原文链接：https://www.yuque.com/yuque/developer/fs6f9kh3mugn70xv
更新时间：2024-07-15T08:56:45.000Z
字数：568

![image](https://cdn.nlark.com/yuque/0/2024/png/525935/1721033717878-1729069f-f573-4cb3-b9cd-f2d1de5eb07a.png)

* * *

在编辑页提供给用户快捷插入节点的快捷键，业界主流编辑器几乎都支持了这个操作。行首按下`/`或`\`，任意位置按下`ctrl(⌘) + /(\)`可以唤起该面板。

仅支持编辑模式的配置。

###### 编辑模式配置项

###### disableQuickInput

`boolean`

是否禁用快捷键，默认为false，不禁用。某些情况下你可能不想开启斜杠面板，可以设为true。

###### cardSelect

`Record<string, ICardSelectOptionConfig>`

```typescript
const config = {
  general: {
    groups: [
      {
        type: 'icon',
        show: 'slash',
        items: ['p', 'h1', 'h2', 'h3'],
      },
      {
        title: '基础',
        name: 'group-base',
        type: 'column',
        items: [
          'image',
          {
            name: 'table',
            allowSelector: true,
          },
          'file',
          'label',
        ],
      },
      {
        title: '画板类',
        name: 'group-board',
        type: 'normal',
        items: ['board', 'mindmap', 'flowchart'],
      },
    ],
  },
  table: {
    groups: [
      {
        type: 'icon',
        show: 'slash',
        items: [
          'p',
          'h1',
          'h2',
          'h3',
          'h4',
          'h5',
          'h6',
          'unorderedList',
          'orderedList',
          'taskList',
          'link',
          'code',
        ],
      },
      {
        title: '基础',
        name: 'group-base',
        type: 'column',
        items: ['image', 'file', 'label'],
      },
    ],
  },
};
```

菜单项配置，类型为一个对象，key为唤起斜杠面板的当前环境，支持下面几个值：

-   `general`：正文内唤起
-   `table`：单元格内唤起
-   `collapse`：折叠块和分栏内唤起
-   `simple`：在mini编辑器下正文内唤起（即配置了`uiSwitch`为`simple`的编辑器实例）


`ICardSelectOptionConfig`类型比较复杂，通常只需要配置`groups`字段即可。

`groups`即面板的分组，支持以下属性：

-   `title`：展示名称
-   `name`：唯一key
-   `type`：当前组的布局样式，支持下面几种

`normal`：普通流式布局。包含图标、标题和描述信息。

![image](https://cdn.nlark.com/yuque/0/2024/png/525935/1721033717760-88b8ed44-102a-4266-b50c-ebd7c755297c.png)

`icon`：小图标布局。

![image](https://cdn.nlark.com/yuque/0/2024/png/525935/1721033717743-a383e6b8-ff52-4299-a1ed-dd89fcbb35cd.png)

`column`：两栏布局。包含图标和标题信息。

![image](https://cdn.nlark.com/yuque/0/2024/png/525935/1721033717804-76475059-cd32-4b04-8677-575b2a446bcf.png)

-   `items`：当前组的菜单项，为一个数组。

-   每一项可配置为一个字符串，支持的字符串可引入

```typescript
const { cardSelectItems } = window.Doc;
```

-   或者配置成一个带有二级菜单的对象，举个例子：

```typescript
const { cardSelectItems } = window.Doc;

const config = {
  groups:[
    {
      get title() {
        return i18n('布局和样式');
      },
      name: 'group-layout',
      type: 'normal',
      items: [
        cardSelectItems.quote,
        cardSelectItems.hr,
        cardSelectItems.alert,
        // 配置分栏带有二级菜单，可选两栏、三栏、四栏
        {
          name: cardSelectItems.columns,
          childMenus: [
            cardSelectItems.columns2,
            cardSelectItems.columns3,
            cardSelectItems.columns4,
          ],
        },
        cardSelectItems.collapse,
      ],
    },
  ]
}
```

##### 链接（link）

原文链接：https://www.yuque.com/yuque/developer/qh43l8i71b2m7bky
更新时间：2024-08-01T01:53:42.000Z
字数：106

链接跳转的逻辑并没有内置在编辑器内，![image](https://cdn.nlark.com/yuque/0/2024/png/525935/1722477198579-8437e056-a0b0-4b8b-aa68-501a1a37bdcc.png)按钮点击默认没有跳转行为。请参考EnvAdapter进行配置：[适配器（envAdapter）](https://www.yuque.com/yuque/developer/ggspapip2fvgao1w "适配器（envAdapter）")

###### 阅读模式配置项

###### vMiniToolbar

`(node: VLinkElement) => VLinkMiniToolbarItem[]`

配置鼠标hover的情景工具栏。

![image](https://cdn.nlark.com/yuque/0/2024/png/525935/1722477198548-1c70055d-2d44-405b-8106-ed7b2eac777b.png)

入参为当前hover的link元素。返回值类型如下：

```typescript
export type VLinkMiniToolbarItem = {
  tooltip: string;
  icon: React.ReactNode | string;
  onClick: (node: VBoxNode) => void;
};
```

##### 日历（calendar）

原文链接：https://www.yuque.com/yuque/developer/iie49uog5uh2r836
更新时间：2024-08-01T01:58:04.000Z
字数：139

> 1.14.0 后支持

此处为语雀日历卡片，点击链接查看：[https://www.yuque.com/yuque/developer/iie49uog5uh2r836#nR3ly](https://www.yuque.com/yuque/developer/iie49uog5uh2r836#nR3ly)

###### startWeekDay可选

`number` 0 - 6 表示周日到周六

以星期几作为开头，默认值是`0`表示周日。

```typescript
options = {
  calendar: {
    startWeekDay: 1, // 周一作为第一列
  }
}
```


###### getDocReadURL可选

`(currentURL: string, cardId: string) => string`

输出 html 的时候生成当前日历卡片的链接

`currentURL`取自通用配置中 [currenURL](https://yuque.antfin.com/lark/lakex-doc/ape08vkqhi6570lb#KtWEh)

```typescript
options = {
  calendar: {
    getDocReadURL: (currentURL: string, cardId: string) => {
      // html的超链接跳转会本页
      return currentURL + '#' + cardId;
    },
  }
}
```

##### html数据（htmlDataSource)

原文链接：https://www.yuque.com/yuque/developer/gut72wwo0o4fpigp
更新时间：2024-08-01T01:55:08.000Z
字数：123

###### 编辑模式配置项

###### readEmptyLine

`boolean`

是否读取空行，默认为`false`，即使用html渲染文档会忽略空行。举个例子：

编辑器内容有一个空行

![image](https://cdn.nlark.com/yuque/0/2024/png/525935/1722477294822-e71bd9c3-0dc5-48bd-ac08-f86d6abc2c81.png)

得到的html数据如下

```html
<div class="lake-content" typography="classic">
  <p id="u3468eb57" class="ne-p"><span class="ne-text">123</span></p>
  <p id="u53cb9d54" class="ne-p"><span class="ne-text"></span></p>
  <p id="uc3165bef" class="ne-p"><span class="ne-text">123</span></p>
</div>
```

如果没有配置该项，直接使用`text/html`格式初始化文档时，第二个空`p`会被忽略，渲染结果如下（和编辑模式不一致）

![image](https://cdn.nlark.com/yuque/0/2024/png/525935/1722477294839-2c943bb0-acda-4c3b-9954-4f8312bf61f5.png)

##### 布局（layout）

原文链接：https://www.yuque.com/yuque/developer/faedpqdio02v88xp
更新时间：2024-03-14T08:21:15.000Z
字数：126

编辑模式和阅读模式配置项相同。

> 编辑器的容器需要带有样式
> -   阅读器 `ne-doc-major-viewer`
> -   编辑器 `ne-doc-major-editor`

###### 配置项

###### layout

`'fixed' | 'adapt'`

布局模式，默认为`adapt`

-   fixed：标宽模式，编辑器最大宽度`750px`
-   adapt：超宽模式，编辑器自适应容器宽度。

###### demo

```typescript
window.onload = function () {
  const { createOpenEditor } = window.Doc;
  // 创建编辑器
  const dom = document.getElementById('root');
  // 需要确保容器包含ne-doc-major-editor
  dom.classList.add('ne-doc-major-editor');
  const editor = createOpenEditor(dom, {
    layout: 'fixed',
  });
}
```

##### 输入（input)

原文链接：https://www.yuque.com/yuque/developer/nsq0b5sgow9z384p
更新时间：2024-06-04T00:14:46.000Z
字数：140

###### autoSpacing

当配置成 true 的时候，输入过程中，中英文之间会自动追加空格。

```typescript
createOpenEditor(document.querySelector('#root'), {
  input: {
    autoSpacing: true,
  },
});
```

###### autoClosing1.34.0

当配置成 true 的时候，非闭合选区输入特定成对符号，会自动补全。

```typescript
createOpenEditor(document.querySelector('#root'), {
  input: {
    autoClosing: true,
  },
});
```

成对符号

```typescript
export const CLOSING_PAIR: Record<string, string> = {
  "'": "'",
  '"': '"',
  '(': ')',
  '[': ']',
  '{': '}',
  '【': '】',
  '‘': '’',
  '“': '”',
  '《': '》',
  '〈': '〉',
  '「': '」',
  '『': '』',
};
```

##### 默认字号（defaultFontsize）

原文链接：https://www.yuque.com/yuque/developer/xa4y3zazufce8gvb
更新时间：2024-03-14T08:24:48.000Z
字数：75

阅读器和编辑器都支持该配置。

###### defaultFontsize

`number`

默认字号。但不会对标题、卡片等的字号生效。

需要注意默认字号是有设定限制的，目前支持的字号如下：

```javascript
export const DEFAULT_FONTSIZES = [12, 13, 14, 15, 16, 19, 22, 24];
```

##### 图片（image）

原文链接：https://www.yuque.com/yuque/developer/ndc8rsu3hyqtnext
更新时间：2024-03-14T08:29:44.000Z
字数：679

###### 编辑模式配置项

###### 上传相关

插件内置了上传任务的处理，仅配置`crawURL`和`uploadFileURL`即可基本满足上传需求，但对于接口格式有一定要求。

###### crawlURL

`string | (() => string) | null;`

服务端抓取图片转存接口。主要用在复制粘贴其它文档、html等场景下，数据源为图片链接。接口入参为图片链接地址字符串。要求服务端能从图片url中抓取图片进行转存，并返回图片预览地址`{data:{url:string}}`、

<table id="P8oYc" class="ne-table" style="width: 744px"><tbody><tr style="height: 37px"><td width="107" style="background-color: #F4F5F5"><p id="u07872b16" class="ne-p" style="text-align: center"><strong><span class="ne-text" style="font-size: 14px">请求方式</span></strong></p></td><td width="637"><p id="u4d72b815" class="ne-p"><code class="ne-code"><span class="ne-text">POST</span></code></p></td></tr><tr style="height: 33px"><td width="107" style="background-color: #F4F5F5"><p id="u53cc4a53" class="ne-p" style="text-align: center"><strong><span class="ne-text">请求值</span></strong></p></td><td width="637"><pre data-language="json" id="mRdqY" class="ne-codeblock language-json"><code>{
  "url": "图片原始链接"
}</code></pre><p id="udb816a95" class="ne-p"><span class="ne-text"></span></p></td></tr><tr style="height: 33px"><td width="107" style="background-color: #F4F5F5"><p id="u0fdba039" class="ne-p" style="text-align: center"><strong><span class="ne-text">响应值</span></strong></p></td><td width="637"><pre data-language="json" id="sG1UN" class="ne-codeblock language-json"><code>{
  "data": {
    "url":"转存后的图片预览地址",
	}
}</code></pre></td></tr></tbody></table>

###### uploadFileURL

`string | (() => string) | null;`

上传图片文件接口。主要用在从系统文件选择上传的场景下，数据源为图片文件。接口入参为`FormData`，并且具有`file`字段，值为`Blob`类型。要求服务端返回图片预览地址`{data:{url:string}}`。

<table id="iiT1X" class="ne-table" style="width: 744px"><tbody><tr style="height: 37px"><td width="107" style="background-color: #F4F5F5"><p id="ua38d84ad" class="ne-p" style="text-align: center"><strong><span class="ne-text" style="font-size: 14px">请求方式</span></strong></p></td><td width="637"><p id="u6c0b528c" class="ne-p"><code class="ne-code"><span class="ne-text" style="font-size: 14px">POST</span></code></p></td></tr><tr style="height: 33px"><td width="107" style="background-color: #F4F5F5"><p id="u0de741f3" class="ne-p" style="text-align: center"><strong><span class="ne-text">请求值</span></strong></p></td><td width="637"><p id="u400d9d21" class="ne-p"><code class="ne-code"><span class="ne-text" style="font-size: 14px">FormData</span></code></p></td></tr><tr style="height: 33px"><td width="107" style="background-color: #F4F5F5"><p id="u179cf0e2" class="ne-p" style="text-align: center"><strong><span class="ne-text">响应值</span></strong></p></td><td width="637"><pre data-language="json" id="KzgA8" class="ne-codeblock language-json"><code>{
  "data": {
    "url":"转存后的图片预览地址",
	}
}</code></pre></td></tr></tbody></table>

###### createUploadPromise

`Nullable<(request: {type: 'url' | 'file' | 'base64', file: File | string}) => Promise<{url:string; size:number; filename:string}>>`

自定义上传任务方法, 需要配合 **isCaptureImageURL ，判断哪些图片需要转存。**

```javascript
const option = {
  image: {
    // 配置上传接口,要返回一个promise对象
    createUploadPromise: (request) => {
      const { type, data } = request;
      if(type === 'url') {
        // data 是一个url，表示需要转存
      } else if(type === 'file') {
        // data是一个File
      }

      return Promise.resolve({
        url: '上传成功后的图片url地址',
        size: 100, // 文件大小
        filename: '图片名称，例如image.png'
      });
    },
  },
};
```

###### accept

`string | string[] | null;`

可以被识别为图片类型的文件后缀。没有命中的将会处理为文件类型，将由`File`插件处理其编辑、展示行为。如果没有配置，则斜杠面板中的按钮也将会“置灰”。使用`createOpenEditor`创建编辑器，默认的配置中已经包含了下面这些后缀。

```typescript
image: [
    '.svg',
    '.png',
    '.bmp',
    '.jpg',
    '.jpeg',
    '.gif',
    '.tif',
    '.tiff',
    '.emf',
    '.webp',
    '.heic',
    '.heif',
  ],
```

###### isCaptureImageURL

`(url: string, patterns: RegExp[], excludePatterns: RegExp[]) => boolean`

默认所有图片链接都会被抓取，进入`crawURL`的处理逻辑。该方法接收待抓取的图片链接、命中匹配、排除匹配对于不需要转存的链接可以返回`false`。

> **⚠️****注意：** 此配置会影响图片是否在阅读页可以展示出来。

###### capturePatterns

`RegExp[]`

将作为`isCaptureImageURL`的第一个参数

###### excludeCapturePatterns

`RegExp[]`

将作为`isCaptureImageURL`的第二个参数

##### 附件（file）

原文链接：https://www.yuque.com/yuque/developer/mkkq8a1h7h8nxwvb
更新时间：2024-03-14T08:33:08.000Z
字数：295

###### 编辑模式配置项

###### getFileDownloadURL

`Nullable<(src: string) => string>`

获取文件下载的链接，入参为文件远程保存的地址，返回值为文件下载链接地址

###### getPreviewUrl

`Nullable<(src: string) => string>`

获取文件预览地址，入参为文件远程保存的地址，返回值为文件预览地址

###### uploadFileURL

`string`

文件上传地址，接口要求如下

<table id="P8oYc" class="ne-table" style="width: 744px"><tbody><tr style="height: 37px"><td width="107" style="background-color: #F4F5F5"><p id="u07872b16" class="ne-p" style="text-align: center"><strong><span class="ne-text" style="font-size: 14px">请求方式</span></strong></p></td><td width="637"><p id="u4d72b815" class="ne-p"><code class="ne-code"><span class="ne-text">POST</span></code></p></td></tr><tr style="height: 33px"><td width="107" style="background-color: #F4F5F5"><p id="u53cc4a53" class="ne-p" style="text-align: center"><strong><span class="ne-text">请求值</span></strong></p></td><td width="637"><p id="u84713862" class="ne-p"><code class="ne-code"><span class="ne-text">FormData</span></code><span class="ne-text">，具有字段</span><code class="ne-code"><span class="ne-text">file</span></code><span class="ne-text">，类型为</span><code class="ne-code"><span class="ne-text">File</span></code></p></td></tr><tr style="height: 33px"><td width="107" style="background-color: #F4F5F5"><p id="u0fdba039" class="ne-p" style="text-align: center"><strong><span class="ne-text">响应值</span></strong></p></td><td width="637"><pre data-language="json" id="sG1UN" class="ne-codeblock language-json"><code>{
  "data": {
    "url": "附件远程地址",
    "size": "附件体积",
    "filename": "附件名",
    "extname": "附件扩展",
	}
}</code></pre></td></tr></tbody></table>

###### createUploadPromise新

`Nullable<(file: File) => Promise<{url:string; size:number; filename:string}>>`

自定义上传任务方法。

###### canDownload

`(cardData: FileCardData) => boolean`

是否允许下载

###### canPreview

`(cardData: FileCardData) => boolean`

是否允许预览

###### 阅读模式配置项

###### viewerTooltip

`(ui: IViewerCardUI<VLocalDocCardNode> | IViewerCardUI<VFileCardNode>)=>React.ReactNode`

阅读态的卡片tooltip，鼠标hover到卡片节点能展示自定义react组件。

###### canDownload

`(cardData: FileCardData) => boolean`

是否允许下载

###### canPreview

`(cardData: FileCardData) => boolean`

是否允许预览

###### onViewerInlineFileClick1.5.0

`(e: MouseEvent, ui: IViewerCardUI<VFileCardNode>) => void`

行内附件节点的点击会调用该方法，可以在这个方法里实现下载逻辑。

##### 异常卡片 （fallbackcard）

原文链接：https://www.yuque.com/yuque/developer/dgfcot6w1gqunzsk
更新时间：2024-03-14T08:41:27.000Z
字数：66

![image](https://cdn.nlark.com/yuque/0/2024/png/525935/1710405673335-4d03ad05-7f9e-45d8-89bf-c3b1a0549dae.png)对于不支持的卡片将会使用异常卡片作为占位`UI`。支持配置提示文案

###### 编辑模式配置项

###### mainTipHTML

`string`

默认值为`该卡片暂时无法显示`

###### subTipHTML

`string`

默认值为`请刷新页面后再试`

##### 大纲（toc)

原文链接：https://www.yuque.com/yuque/developer/xq5sqnuoi4ubc27w
更新时间：2024-05-22T06:10:18.000Z
字数：236

大纲会出现在编辑器/阅读器右侧，默认不开启。

###### 编辑模式配置项

###### enable

`boolean`

是否开启，默认为false。

###### normalView

`boolean`

是否为展开状态，默认为true。不过需要注意的是，大纲在用户手动执行过展开或收起的操作后，会将当前状态保存在localstorage里，这种情况下会优先采用用户的上次行为而不是该配置项。

###### allowModifyHash

`boolean`

大纲被点击后是否允许改变 hash，默认为true。

###### 阅读模式配置项

###### enable

`boolean`

是否开启，默认为false。

###### allowModifyHash

`boolean`

大纲被点击后是否允许改变 hash，默认为true。

###### getContainer

`(() => HTMLElement) | null`

指定挂载的TOC节点。

###### 常见问题

###### 编辑模式下大纲没有展示出来

执行`editor.setDocument`的时候要异步一下，可以包在`setTimeout`回调内。

##### 代码块（codeblock）

原文链接：https://www.yuque.com/yuque/developer/lfe0zgbvdx8rpr4g
更新时间：2024-05-23T01:15:14.000Z
字数：21

`1.24.0` 之后支持

###### 配置项

###### supportCustomStyle 支持自定义样式

`boolean`

默认是 `false`

##### 音频（audio）

原文链接：https://www.yuque.com/yuque/developer/hfviet0iqgt1ohat
更新时间：2024-05-23T01:17:12.000Z
字数：380

1.23.0支持

由于一些历史原因，audio的lake格式数据目前没有持久化播放url，每一次渲染前都会根据audio现有信息去查询最新的播放地址。所以相比于图片、视频等其他多媒体插件额外需要配置查询播放链接的配置项。

编辑和阅读模式配置项相同，注意两者都要配置。

###### 配置项

###### createUploadPromise

`(data: File, progress: (value: number) => void) => Promise<AudioUploadResponse>`

可以在上传过程中调用`progress`， `value`需要在 `0-1` 范围内

音频上传，需要返回下面的对象

```typescript
/** 上传响应值 */
export interface AudioUploadResponse {
  audioId: string;
  audioUrl: string;
  downloadUrl: string;
  filesize: number;
  filename: string;
}
```

###### queryAudioUrl

`(cardData: AudioCardData) => Promise<{ audioUrl: string; downloadUrl: string; }>`

获取音频的播放地址，建议有配套服务端能够根据`audioId`查询到播放地址和下载地址，如果没有服务能力，可以尝试通过将`audioId`配置成播放地址，这里就可以依靠纯前端拿到播放地址。

###### allowAudioPlayer

`boolean`

是否允许音频播放。默认阅读页不允许。

###### playerComponent

`React.FC<AudioPlayerComponentProps>`

自定义音频播放组件。默认提供原生audio标签的视图（props接口可自行console查看）

###### errorComponent

`React.FC<AudioErrorComponentProps>`

自定义音频异常组件。在上传失败时会展示该组件（props接口可自行console查看）

###### getDocReadURL

`(currentURL: string, cardId: string) => string`

输出html时候使用的跳转地址。

##### 视频（video）

原文链接：https://www.yuque.com/yuque/developer/zpgag8tzyngarar1
更新时间：2024-05-23T01:27:24.000Z
字数：255

###### 1.30.0自定义组件

支持自定义组件配置，包含上传中、上传成功、上传失败三种状态的自定义组件。

###### accept

`Nullable<string[]>`

配置可以接受的后缀名

###### uploadFileURL

`Nullable<string>`

默认上传的URL，如果未配置`createUploadTask`，则会使用该url进行上传

<table id="Vn87j" class="ne-table" style="width: 744px"><tbody><tr style="height: 37px"><td width="107" style="background-color: #F4F5F5"><p id="u82700f20" class="ne-p" style="text-align: center"><strong><span class="ne-text" style="font-size: 14px">请求方式</span></strong></p></td><td width="637"><p id="u8b170a43" class="ne-p"><code class="ne-code"><span class="ne-text">POST</span></code></p></td></tr><tr style="height: 33px"><td width="107" style="background-color: #F4F5F5"><p id="uc5264489" class="ne-p" style="text-align: center"><strong><span class="ne-text">请求值</span></strong></p></td><td width="637"><p id="u170ddab3" class="ne-p"><code class="ne-code"><span class="ne-text">FormData</span></code><span class="ne-text">，具有字段</span><code class="ne-code"><span class="ne-text">file</span></code><span class="ne-text">，类型为</span><code class="ne-code"><span class="ne-text">File</span></code></p></td></tr><tr style="height: 33px"><td width="107" style="background-color: #F4F5F5"><p id="ufc93a0b8" class="ne-p" style="text-align: center"><strong><span class="ne-text">响应值</span></strong></p></td><td width="637"><pre data-language="json" id="Z6phN" class="ne-codeblock language-json"><code>{
  "data": {
    "url": "视频远程地址",
    "size": "视频体积",
    "filename": "视频名称"
	}
}</code></pre></td></tr></tbody></table>

###### createUploadPromise

`Nullable<(data: File) => Promise<{url: string; size: number; filename: string;}>>`

简化版本的上传逻辑

```typescript
createOpenEditor(document.body, {
  video: {
    // 自定义上传逻辑
    createUploadPromise: file => {
      return Promise.resolve({
        url: URL.createObjectURL(file),
        size: file.size,
        filename: file.name,
      })
    },
  },
});
```

###### crawlVideo

`Nullable<(src: string) => Promise<{url: string; size: number; filename: string;}>>`

视频转存。对老版本的lake数据和html数据的读取，**对阅读器不生效**。

###### useOriginSrc

`(src: string) => boolean`

是否使用原始资源地址。和`crawlVideo`配置类似，如果**不需要转存**可以仅配置该项。

#### 开发自定义卡片

原文链接：https://www.yuque.com/yuque/developer/tik01se6xtqp6h3w
更新时间：2024-06-28T12:12:30.000Z
字数：1166

开发自定义卡片有两种途径，一种是自己创建一个插件，可以参考现有的卡片插件的写法，这种方法可以最大程度地利用所有编辑器内部的api完成丰富的功能，但较为复杂。

所以编辑器也提供了另一种**配置式的方法**，只需要简单配置即可实现一个基于`React`UI的自定义卡片。

##### 配置项

和插件配置方式相同，要分别在创建编辑器和阅读器的时候传入`customCard`配置，**编辑器和阅读器可以使用同一份配置**。

```typescript
createOpenEditor(node, {
  customCard: { cards: [] }
})
```

`cards`：注册的所有卡片，每一种卡片的定义参考卡片描述

##### 卡片描述

###### name

`string`

卡片名称。会被内部存储在卡片的`cardValue`的`$name`字段上，应确保唯一性，在读取数据时会根据该字段渲染自定义的react组件

###### cardType

`'inline' | 'block'`

卡片类型。分为行内和区块卡片，行内卡片布局时会和文本处于一行连续布局，区块卡片则独占一行。这和浏览器技术的概念是一致的[常规流中的块和内联布局 - CSS：层叠样式表 | MDN](https://developer.mozilla.org/zh-CN/docs/Web/CSS/CSS_flow_layout/Block_and_inline_layout_in_normal_flow)。

###### slash

`object`

配置斜杠命令面板以及工具栏的`cardselect`菜单面板

```typescript
 {
    /** 图标 */
    icon: React.ReactNode;
    /**
     * 斜杆面板的搜索提示，提示用户搜索，例如：/glk
     */
    mainSearch?: string;
    /**
     * 关键字，搜索的时候根据关键字进行查找
     */
    keywords?: string | string[];
    /**
     * 选项名称，例如：高亮块
     */
    label: string;
    /**
     * 选项描述，例如：高亮文本
     */
    description?: string | (() => string | null);
  };
```

slash配置好了并不会直接展示在面板中，斜杠命令面板的展示依然遵循编辑器的`slash`配置项，你可以直接修改lakex提供的默认配置项，要注意的是自定义斜杠命令菜单名称为`` `custom-${name}` ``，其中`name`是你配置的自定义卡片的名称。

```typescript
// 此处有问题 等待补充。

// 向现有的菜单面板中追加一组
// @ts-ignore
slashOption!.cardSelect!.general.groups.push({
  title: '自定义',
  name: 'group-custom',
  type: 'normal',
  items: ['custom-bookmark', 'custom-bookmarkTitle'],
});
```

![image](https://cdn.nlark.com/yuque/0/2024/png/525935/1719576623178-d89ca36e-2451-4e5e-93a8-bd8af6dbae3d.png)

之后就能在命令面板中看到这个`自定义`组的菜单项了

###### initValue

`Record<string, any> | null`

创建自定义卡片的初始数据，如果不需要初始数据请传null。**自定义卡片数据请不要使用**`**$name**`**保留字段。也不要定义复杂的卡片数据如函数、循环引用等，复杂数据在序列化过程中会丢失。**

###### editorComponent

`ReactCtorLike<ICustomEditorCardProps<TCardValue>>`

编辑模式的组件的构造函数，支持函数式和类组件。组件的props接口如下

```typescript
export interface ICustomEditorCardProps<TCardValue = any> {
  editor: IEditor;
  cardValue: TCardValue;
  /** 更新数据，会触发组件重新渲染 */
  updateCardValue: (value: TCardValue) => void;
  cardType: 'inline' | 'block';
}
```

通常你可能需要在没有`cardValue`的情况下渲染一个支持编辑的组件用于将数据写入到卡片内部

###### viewerComponent

`ReactCtorLike<ICustomViewerCardProps<TCardValue>>`

阅读模式的组件的构造函数，支持函数式和类组件。组件的props接口如下

```typescript
export interface ICustomEditorCardProps<TCardValue = any> {
  viewer: IViewer;
  cardValue: TCardValue;
  /** 更新数据，会触发组件重新渲染 */
  updateCardValue: (value: TCardValue) => void;
  cardType: 'inline' | 'block';
}
```

在阅读模式下要谨慎调用`updateCardValue`更新数据，可能需要做鉴权操作。

###### writeText

`(value: TCardValue | null) => string;`

配置这个方法可以在复制数据、获取指定格式的文档内容的场景下，自定义`text/plain`格式的数据内容，以便粘贴到其他应用中或导出数据。**默认为空字符串。**

###### writeHtml

`(value: TCardValue | null) => string;`

配置这个方法可以在复制数据、获取指定格式的文档内容的场景下，自定义`text/html`格式的数据内容，以便粘贴到其他应用中或导出数据。返回值为html字符串。**默认为空字符串。**

实际上写出的html格式数据如下

```typescript
<div
  data-name="customInline"
  data-value="%7B%22%24name%22%3A%22bookmarkTitle%22%2C%22title%22%3A%22d%22%2C%22desc%22%3A%22f%22%2C%22url%22%3A%22g%22%7D"
  data-custom-name="bookmarkTitle"
  id="C8RWF"
  class="ne-custom-card"
>
    /** 这里是自定义的html内容 */
</div>
```

###### readHtml

暂未支持

##### 特别注意

由于数据可能会被持久化在你的数据库中，对于数据格式的定义和写出一定要谨慎，尽量做到向后兼容。否则你可能需要做数据订正了。

## ❤️ 嵌入文档阅读页及问题

原文链接：https://www.yuque.com/yuque/developer/embed
更新时间：2024-04-23T07:12:15.000Z
字数：579

> ‼️ 受 [浏览器安全策略](https://developers.google.cn/privacy-sandbox/blog/cookie-countdown-2024jan?authuser=3&hl=zh-cn%E8%BF%99%E4%B8%AA%E6%96%87%E6%A1%A3%E5%8F%91%E7%BB%99%E7%94%A8%E6%88%B7%E4%B9%88) 影响，嵌入模式只支持公开文档页，私密文档如需集成展示，可通过 [API](https://www.yuque.com/yuque/developer) 获取内容。

#### 接口说明

语雀文档提供了嵌入式的阅读器供三方使用，可以用过 iframe 的方式把嵌入式阅读器集成到第三方的系统中去来使用语雀的展示能力，在语雀的文档页url中加上这样的参数 `view=doc_embed` 和 `from={your_appname}` 就可以得到一个纯展示功能的文档阅读器。最简单的用法请参照下面这个例子：

```plain
https://www.yuque.com/yuque/blog/digital_garden?view=doc_embed&from=asite
```

传入 `view=doc_embed` 和 `from={your_appname}` 两个参数即可启用嵌入式文档阅读器，打开之后就是 [这样](https://www.yuque.com/yuque/blog/digital_garden?view=doc_embed&from=asite) 的。

your_appname: 无需申请，建议填写你团队/应用的英文名

![image](https://cdn.nlark.com/yuque/0/2022/png/84145/1651208952411-3be089eb-7172-4f9b-8316-871b469e31f7.png)


**更加详细的使用方法请参照下面的表格：**

| 参数名 | 描述 | 类型 | 值 |
| --- | --- | --- | --- |
| view | 开启嵌入式文档阅读器，必传项 | 字符串 | view=doc_embed |
| from | 调用方的名字，必传项 | 字符串 | from=your_appname |
| title | 是否显示标题 | 布尔值 | title=1: 显示标题<br>title=0：隐藏标题 |
| outline | 是否显示右侧大纲 | 布尔值 | outline=1：显示大纲<br>outline=0：隐藏大纲 |
| translate | 根据参数进行翻译 | 字符串 | 支持多语种<br>translate=en<br>translate=zh |


翻译支持的语种:

| en | 英语 | English |
| --- | --- | --- |
| zh | 中文 | Chinese |
| ru | 俄罗斯语 | Russian |
| pt | 葡萄牙语 | Portuguese |
| es | 西班牙语 | Spanish |
| fr | 法语 | French |
| ja | 日语 | Japanese |
| ar | 阿拉伯语 | Arabic |
| de | 德语 | German |
| it | 意大利语 | Italian |
| ko | 韩语 | Korean |
| tr | 土耳其语 | Turkish |
| vi | 越南语 | Vietnamese |
| pl | 波兰语 | Polish |
| he | 希伯来语 | Hebrew |
| id | 印尼语 | Indonesian |
| hi | 印地语 | Hindi |
| nl | 荷兰语 | Dutch |
| th | 泰语 | Thai |


#### 页面发送给父页面的消息

嵌入页面和父页面会通过 postMessage 的方式通信，目前开放了下边几种消息：

```javascript
// 高度发生变化
const heightChangeMessage = {
  type: 'doc_height_change',
  payload: {
    height: 2048,
  },
};
window.parent.postMessage(heightChangeMessage, '*');

// 文档准备好
const docReadyMessage = {
  url: document.location.href,
  type: 'doc_ready',
  payload: {
    height,
    outline: data.outline,
  },
};

// 点击大纲触发
const hashChangeMessage = {
  url: document.location.href,
  type: 'hashchange',
  message: {
    newURL,
    oldURL,
    href,
  },
};
```

在 iframe 的窗口大小发生变化时，会重触发计算高度并发送高度变化的消息。

## Webhooks 消息推送

原文链接：https://www.yuque.com/yuque/developer/doc-webhook
更新时间：2026-03-17T08:51:07.000Z
字数：1779

### 概况

通过配置知识库或团队的 Webhooks，开发者能够在文档发生变动时**自动**获取到通知。

> ⚠️ **知识库** 如果配置了 「自动发布」功能后，文档的 更新/推送 操作暂不会发送 Webhook 通知。


### 配置方式

在 **知识库** -> **设置 ->** 开发者设置 页面，会出现 Webhooks 配置地址。

![image](https://cdn.nlark.com/yuque/0/2023/png/236800/1703046042579-fe831155-7ccf-47f0-a3f8-f8410f4ecbe3.png)


要给整个团队的文档添加 Webhook，可以在团队设置页进行设置：

![image](https://cdn.nlark.com/yuque/0/2023/png/236800/1703046042565-867cdef9-becf-4518-92e7-fd61b349e2eb.png)

> 确保 WebHook 配置的 URL 地址能够被语雀访问到，即要求它能够被互联网网络访问到。


### 推送给钉钉群

语雀 Webhooks 对[钉钉自定义机器人](https://ding-doc.dingtalk.com/doc#/serverapi2/qf2nxq)做了数据适配，如果添加的 Webhooks URL 是钉钉自定义机器人地址，那么会以 [钉钉 link 消息格式](https://ding-doc.dingtalk.com/doc#/serverapi2/qf2nxq#404d04c3)发送该知识库的文档 **发布** 和 **更新** 信息给机器人。由于钉钉开启了机器人的安全设置，需要在“自定义关键词”中添加“语雀”。

![image](https://cdn.nlark.com/yuque/0/2020/png/84137/1580627939339-bc8c71eb-9fb1-47c0-b2d8-bf6e2b66d04b.png)

![image](https://cdn.nlark.com/yuque/0/2018/png/84137/1537246359489-dfae7658-3bab-4f11-8941-d031d28e4792.png)

### 推送给其他渠道


在文档发生变动时，语雀会**自动**使用 `HTTP POST` 请求已配置的 Webhook URL，具体的 `body` 是一个 JSON 数据结构，示例如下：

```json
POST http://someone.com/yuque/webhook

{
  "data": DataSerializer
}
```


#### 推送数据格式说明

##### 文档消息

```json
{
  "data": {
    "action_type": "publish",  					// Enum,			- publish:文档发布
                                        //						- update:文档更新
                                        //						- delete:文档删除
    "webhook_subject_type": "",					// Enum,			同上, 兼容字段
    "path": "",													// String,		文档相对路径 (不含域名)
    "url": "",													// String,		文档路径 (包含域名)
    "id": 123,													// Long,    	文档 ID
    "slug": "doc1",											// String,		文档路径
    "title": "标题",										  // String,		文档标题
    "body": "正文 Markdown 内容",				// String,		正文 Markdown 内容
    "body_html": "正文 HTML 内容",				// String,		正文 HTML 内容
    "created_at": "",										// String,		创建时间
    "updated_at": "",										// String,		更新时间
    "deleted_at": "",										// String,		删除时间
    "published_at": "",									// String,		发布时间
    "first_published_at": "",						// String,		首次发布时间
    "content_updated_at": "",						// String,		正文最近更新时间
    "user": {														// [文档所属用户/团队]
      "id": 123,												// Long,			ID
      "login": "账号",									  // String,		账号
      "name": "名称",										// String,		名称
      "avatar_url": "头像",							// String,		头像
    },
    "book": {														// [文档所属知识库]
      "id": 456,												// Long,			ID
      "slug": "book1",									// String,		路径
      "name": "知识库名称",								// String,		名称
      "description": "简介",							// String,		简介
    },
    "actor": {													// [消息触发者]
      "id": 123,												// Long,			ID
      "login": "账号",									  // String,		账号
      "name": "名称",										// String,		名称
      "avatar_url": "头像",							// String,		头像
    },
    "tags": [														// [文档自定义标签]
      {
        "id": 123,											// Long,			ID
        "title": "tag_name_1",					// String,		标签名称
        "created_at": "",								// String,		创建时间
        "updated_at": "",								// String,		更新时间
      },
      {
        "id": 124,
        "title": "tag_name_2",
        "created_at": "",
        "updated_at": "",
      },
    ],
	}
}
```

###### 表格正文内容格式

表格 body 字段 JSON 反序列化后格式如下：

```json
{
  "version": "1.0",
  "data": [
    {
      "name": "Sheet1",
      "index": 0,
      "rowCount": 100,
      "colCount": 4,
      "table": [
        ["参数名", "类型", "必填", "默认值"],
        ["name", "string", "1", ""],
        ["flag", "boolean", "0", "false"]
      ]
    },
    {
      "name": "Sheet2",
      "index": 0,
      "rowCount": 100,
      "colCount": 8,
      "table": []
    }
  ]
}
```

##### 评论消息

```json
{
  "data": {
    "action_type": "comment_create",  	// Enum,			- comment_create:新增评论
                                        //						- comment_update:修改评论
                                        //						- comment_reply_create:回复评论
                                        //						- comment_reply_update:修改回复的评论
    "webhook_subject_type": "",					// Enum,			同上, 兼容字段
    "path": "",													// String,		评论相对路径 (不含域名)
    "url": "",													// String,		评论路径 (包含域名)
    "id": 123,													// Long,    	评论 ID
    "body_html": "正文 HTML 内容",				// String,		评论 HTML 内容
    "created_at": "",										// String,		创建时间
    "updated_at": "",										// String,		更新时间
    "user": {														// [创建评论的用户]
      "id": 123,												// Long,			ID
      "login": "账号",									  // String,		账号
      "name": "名称",										// String,		名称
      "avatar_url": "头像",							// String,		头像
    },
    "commentable": {										// [评论的文档]
      "path": "",													// String,		文档相对路径 (不含域名)
      "id": 123,													// Long,    	文档 ID
      "slug": "doc1",											// String,		文档路径
      "title": "标题",										  // String,		文档标题
      "body": "正文 Markdown 内容",				// String,		正文 Markdown 内容
      "body_html": "正文 HTML 内容",				// String,		正文 HTML 内容
      "created_at": "",										// String,		创建时间
      "updated_at": "",										// String,		更新时间
      "deleted_at": "",										// String,		删除时间
      "published_at": "",									// String,		发布时间
      "first_published_at": "",						// String,		首次发布时间
      "content_updated_at": "",						// String,		正文最近更新时间
      "user": {														// [文档所属用户/团队]
        "id": 123,												// Long,			ID
        "login": "账号",									  // String,		账号
        "name": "名称",										// String,		名称
        "avatar_url": "头像",							// String,		头像
      },
      "book": {														// [文档所属知识库]
        "id": 456,												// Long,			ID
        "slug": "book1",									// String,		路径
        "name": "知识库名称",								// String,		名称
        "description": "简介",							// String,		简介
      },
      "tags": [														// [文档自定义标签]
        {
          "id": 123,											// Long,			ID
          "title": "tag_name_1",					// String,		标签名称
          "created_at": "",								// String,		创建时间
          "updated_at": "",								// String,		更新时间
        },
        {
          "id": 124,
          "title": "tag_name_2",
          "created_at": "",
          "updated_at": "",
        },
      ],
    },
    "actor": {													// [消息触发者]
      "id": 123,												// Long,			ID
      "login": "账号",									  // String,		账号
      "name": "名称",										// String,		名称
      "avatar_url": "头像",							// String,		头像
    },
	}
}
```

##### 评审消息

```json
{
  "data": {
    "action_type": "new_review",  			// Enum,			- new_review:发起评审
                                        //						- complete_review:完成评审
                                        //						- cancel_review:取消评审
    "webhook_subject_type": "",					// Enum,			同上, 兼容字段
    "path": "",													// String,		评审相对路径 (不含域名)
    "url": "",													// String,		评审路径 (包含域名)
    "id": 123,													// Long,    	评审 ID
    "name": "标题",											// String,		评审标题
    "body": "留言",											// String,		评审留言
    "created_at": "",										// String,		创建时间
    "updated_at": "",										// String,		更新时间
    "user": {														// [发起评审的用户]
      "id": 123,												// Long,			ID
      "login": "账号",									  // String,		账号
      "name": "名称",										// String,		名称
      "avatar_url": "头像",							// String,		头像
    },
    "target": {													// [评审的文档]
      "path": "",													// String,		文档相对路径 (不含域名)
      "id": 123,													// Long,    	文档 ID
      "slug": "doc1",											// String,		文档路径
      "title": "标题",										  // String,		文档标题
      "body": "正文 Markdown 内容",				// String,		正文 Markdown 内容
      "body_html": "正文 HTML 内容",				// String,		正文 HTML 内容
      "created_at": "",										// String,		创建时间
      "updated_at": "",										// String,		更新时间
      "deleted_at": "",										// String,		删除时间
      "published_at": "",									// String,		发布时间
      "first_published_at": "",						// String,		首次发布时间
      "content_updated_at": "",						// String,		正文最近更新时间
      "user": {														// [文档所属用户/团队]
        "id": 123,												// Long,			ID
        "login": "账号",									  // String,		账号
        "name": "名称",										// String,		名称
        "avatar_url": "头像",							// String,		头像
      },
      "book": {														// [文档所属知识库]
        "id": 456,												// Long,			ID
        "slug": "book1",									// String,		路径
        "name": "知识库名称",								// String,		名称
        "description": "简介",							// String,		简介
      },
      "tags": [														// [文档自定义标签]
        {
          "id": 123,											// Long,			ID
          "title": "tag_name_1",					// String,		标签名称
          "created_at": "",								// String,		创建时间
          "updated_at": "",								// String,		更新时间
        },
        {
          "id": 124,
          "title": "tag_name_2",
          "created_at": "",
          "updated_at": "",
        },
      ],
    },
    "actor": {													// [消息触发者]
      "id": 123,												// Long,			ID
      "login": "账号",									  // String,		账号
      "name": "名称",										// String,		名称
      "avatar_url": "头像",							// String,		头像
    },
	}
}
```

### 空间级别的 Webhook

原文链接：https://www.yuque.com/yuque/developer/lunx6h
更新时间：2024-04-08T08:47:27.000Z
字数：797

为了让空间管理员可以实时关注空间内的安全操作日志，我们提供了基于 Webhook 的实时推送方式，让空间管理员可以接入自身的安全审计系统。

![image](https://cdn.nlark.com/yuque/0/2023/png/84151/1675414710472-f8262498-2383-41e8-94c0-20524f93409f.png)

###### 功能描述

当语雀空间中有安全相关的操作日志产生时，语雀系统会实时向您添加的 webhook 地址上推送消息数据。其实质为一个包含[指定格式数据](https://www.yuque.com/yuque/developer/lunx6h#RdVzW)的 POST 请求。

此功能需要您自实现可接收 webhook 消息推送的服务。此功能暂不支持钉钉机器人推送。


###### 推送数据格式


```json
{
  "data": {
    "action_type": "audit_log_create",  // Enum,			- audit_log_create:审计日志
    "webhook_subject_type": "",					// Enum,			同上, 兼容字段

    "action": "",												// Enum,			审计日志行为类型
                                        //						- public_share:对空间外分享
                                        //						- export:导出
                                        //						- invite:邀请加入空间
                                        //						- apply:申请加入空间
                                        //						- join:确认加入空间
                                        //						- delete:删除空间成员

    "organization_id": 123,							// Long,    	空间 ID
    "group_id": 777,							      // Long,    	团队 ID
    "actor_id": 666,							      // Long,    	操作人 ID
    "auditable_id": 456,							  // Long,		  审计对象 ID
    "auditable_type": "Doc",						// Enum,		  审计对象类型
                                        //						- Doc:文档
                                        //						- Book:知识库
                                        //						- GroupUser:团队成员
                                        //						- OrganizationUser:空间成员

    "ip": "",				                    // String,		操作人 IP
    "trace_id": "",				              // String,		Trace ID
    "created_at": "",										// String,		创建时间
    "updated_at": "",										// String,		更新时间

    "group": {													// [所属团队]
      "id": 123,												// Long,			ID
      "login": "账号",									  // String,		账号
      "name": "名称",										// String,		名称
    },
    "actor": {													// [操作人]
      "id": 123,												// Long,			ID
      "login": "账号",									  // String,		账号
      "name": "名称",										// String,		名称
      "avatar_url": "头像",							// String,		头像
    },
    "auditable": {											// [审计对象]
    },
	}
}
```


###### 关键字段说明

auditable 审计对象存在以下几种类型：

```json
// 文档, auditable_type === 'Doc'
{
  "id": 123,													// Long,    	文档 ID
  "slug": "doc1",											// String,		文档路径
  "title": "标题",										  // String,		文档标题
  "body": "正文 Markdown 内容",				// String,		正文 Markdown 内容
  "body_html": "正文 HTML 内容",				// String,		正文 HTML 内容
  "created_at": "",										// String,		创建时间
  "updated_at": "",										// String,		更新时间
  "deleted_at": "",										// String,		删除时间
  "published_at": "",									// String,		发布时间
  "first_published_at": "",						// String,		首次发布时间
  "content_updated_at": "",						// String,		正文最近更新时间
}


// 知识库, auditable_type === 'Book'
{
  "id": 456,												// Long,			知识库ID
  "slug": "book1",									// String,		知识库路径
  "name": "知识库名称",								// String,		知识库名称
  "description": "简介",							// String,		知识库简介
}

// 团队成员, auditable_type === 'GroupUser'
{
  "group_id": 1,										// Long,			团队 ID
  "user_id": 123,										// Long,			用户 ID
  "role": 0,												// Enum,			权限
                                    //						- 0:管理员
                                    //						- 1:成员
                                    //						- 2:只读成员
  "status": 0,											// Enum,			状态
                                    //						- 0:已邀请
                                    //						- 1:已加入
                                    //						- 2:正在申请
}

// 空间成员, auditable_type === 'OrganizationUser'
{
  "organization_id": 1,							// Long,			空间 ID
  "user_id": 123,										// Long,			用户 ID
  "role": 0,												// Enum,			权限
                                    //						- 0:管理员
                                    //						- 1:成员
                                    //						- 2:外部联系人
  "status": 0,											// Enum,			状态
                                    //						- 0:已邀请
                                    //						- 1:已加入
                                    //						- 2:正在申请
  "name": "",												// String,		自定义昵称
  "avatar": "",											// String,		自定义头像
}
```

## 常见问题

### 文档 HTML 格式说明

原文链接：https://www.yuque.com/yuque/developer/yr938f
更新时间：2023-02-23T09:38:29.000Z
字数：932

本文档描述的内容，适用于 2021年 4 月 13 日之后**创建**的或者**重新编辑**过的文档。在此之前创建并未发生编辑的文档，返回结果不变。


基于各种原因，我们对文档的 HTML 格式进行了优化，主要包含以下两个方面。


##### 内联css样式

之前的返回结果中，HTML 标签中携带了大量的样式信息，以下是对比效果。


###### 阅读效果

![image](https://cdn.nlark.com/yuque/0/2021/png/405557/1619509870852-4bfd9f2d-dd19-4e30-a25a-4c2028962f45.png)

###### 原 HTML 结果

![image](https://cdn.nlark.com/yuque/0/2021/png/405557/1619510085178-39219c01-b834-4bf3-a41e-5cf44c8b8d51.png)


###### 现 HTML 结果

![image](https://cdn.nlark.com/yuque/0/2021/png/405557/1619510004264-3c4b0464-4419-4f8b-a792-5c031c8282e3.png)

以上示例，只设置了：字体颜色、加粗以及背景色，原有的HTML数据中除了这些用户明确设置的信息之外，还携带了很多其他样式信息，在更新之后，返回结果将变更为仅包含用户设置过的样式信息。


##### 代码高亮


本次变更生效之后，我们在返回的 html 格式中将不再对代码进行高亮，如有需要，请使用方自己实现代码高亮。

下面是代码块变化的对比图。


###### 阅读效果

![image](https://cdn.nlark.com/yuque/0/2021/png/405557/1619509533892-38720c38-f477-4f60-ac83-76d493e547c4.png)


###### 原 HTML 结果


![image](https://cdn.nlark.com/yuque/0/2021/png/405557/1619509159045-285ae404-8d70-457d-9be6-bae68310e885.png)


###### 现 HTML 结果

![image](https://cdn.nlark.com/yuque/0/2021/png/405557/1621502842673-693faa3c-c3c4-4d05-b97d-3998f0709791.png)

在新的 HTML 结果中，`<pre>` 标签对应了原始文档中的代码块，其 `data-language`属性表示用户选择的语言。使用方可以使用代码高亮库在前端对 pre 标签内的代码进行高亮处理。


##### 应对样式变化带来的影响


由于新的策略会省略掉非用户设置的样式信息，所以会导致部分依赖这些样式的使用方的页面出现非预期的表现，为应对这种问题，我们提供了一份css 来解决该问题，使用方在自己的页面中引入我们的 CSS 即可。


注1：由于 css 源码会随着时间的推移而变更升级，为了避免使用方需要经常 check 我们变更的成本，我们会保持 css 的路径名不随着源码的变更而变更。这就意味着，在我们更新了 css 代码之后，由于最终用户的浏览器缓存，可能会有一段时间内新变更的样式不会生效，由此带来的影响需要使用方自己评估。


注2：由于 css 源码较少，我们提供的 CDN 地址中的源码是未压缩的。


注3：css 不能解决代码高亮的问题，代码高亮仍需要使用方自行解决。


CDN地址为：

[http://editor.yuque.com/ne-editor/lake-content-v1.css](http://editor.yuque.com/ne-editor/lake-content-v1.css)

下表记录 css 文件更新历史：

| **日期** | **详情** | **是否兼容** |
| --- | --- | --- |
| 2020-05-20 | 完善细节 | 兼容升级，使用方无感知 |
| 2023-02-23 | 更新部分涉及颜色和分栏结构的样式 | 部分颜色值有变化 |


##### 代码块支持的语言列表

目前，语雀的代码块支持的语言如下：

```plain
[
    "Plain Text",
    "Bash",
    "Basic",
    "C",
    "C++",
    "C#",
    "CSS",
    "Dart",
    "Diff",
    "Dockerfile",
    "Erlang",
    "Git",
    "Go",
    "GraphQL",
    "Groovy",
    "HTML",
    "HTTP",
    "Java",
    "JavaScript",
    "JSON",
    "JSX",
    "KaTeX",
    "Kotlin",
    "Less",
    "Makefile",
    "Markdown",
    "MATLAB",
    "Nginx",
    "Objective-C",
    "Pascal",
    "Perl",
    "PHP",
    "PowerShell",
    "Protobuf",
    "Python",
    "R",
    "Ruby",
    "Rust",
    "Scala",
    "Shell",
    "SQL",
    "PL/SQL",
    "Swift",
    "TypeScript",
    "VB.net",
    "Velocity",
    "XML",
    "YAML",
    "sTeX",
    "LaTeX",
    "SystemVerilog",
    "Tcl",
    "Verilog",
    "Vue",
    "Lua"
]
```


##### 如何区别新旧数据格式


新数据格式的内容区域被包含在一个 className 为 `lake-content` 的 div 中，如下所示：

```html
<h1>示例</h1>
<div class="lake-content" typography="classic">
  <p class="ne-p"><span class="ne-text">测试</span></p>
</div>
```


旧数据格式的的内容区域被包含在一个 className 为 `lake-engine` 的 div 中，如下所示：

```html
<h1>示例</h1>
<div class="lake-content-editor-core lake-engine lake-typography-classic" data-lake-element="root" data-selection-undefined="%7B%22path%22%3A%5B%5B0%2C0%2C0%2C2%5D%2C%5B0%2C0%2C0%2C2%5D%5D%2C%22active%22%3Atrue%7D">
  <p data-lake-id="uedf6b7ae" id="uedf6b7ae" style="font-size: 14px; color: rgb(38, 38, 38); line-height: 1.74; letter-spacing: 0.05em; outline-style: none; overflow-wrap: break-word; margin: 0px;"><span>测试</span></p>
</div>
```

### 使用 API 获取空间内文档

原文链接：https://www.yuque.com/yuque/developer/gyht993a76zg54mv
更新时间：2023-11-28T02:24:45.000Z
字数：262

当前功能仅[旗舰版空间](https://www.yuque.com/about/price)可使用

通过调用语雀开放 API，可以获取到空间内的团队、知识库以及文档。基于此，可以拉取语雀内容自行搭建服务进行访问或者保存。

方法如下：

> 1.  创建团队 Token，通过团队 Token 访问语雀开放接口
> 2.  获取特定团队下的知识库列表
> 3.  获取特定知识库下的文档列表
> 4.  获取特定文档的内容详情

###### 1\. 身份认证

开放 API 需要通过身份认证才能访问，获取团队 Token 的方式：进入团队设置页面，创建团队 Token（需要有团队管理权限）。

![image](https://cdn.nlark.com/yuque/0/2023/png/84151/1680345436472-0dce9c77-252c-4154-b562-522f43e845b8.png)


Token 详细使用方式见：[https://www.yuque.com/yuque/developer/api#sAVSW](https://www.yuque.com/yuque/developer/api#sAVSW)

###### 2\. 获取团队下的知识库

接口地址： `/api/v2/groups/{login}/repos`


###### 3\. 获取知识库下的文档

接口地址： `/api/v2/repos/{book_id}/docs`


###### 4\. 获取文档详情

接口地址：`/api/v2/repos/{book_id}/docs/{id}`


> 上述接口的具体出入参请参考 [接口列表](https://www.yuque.com/yuque/developer/openapi#H1GNu) 文档。

## 公告

### 语雀开放 API 访问范围变更

原文链接：https://www.yuque.com/yuque/developer/vzippmige58g7r9t
更新时间：2026-04-08T01:49:52.000Z
字数：167

> ⚠️ 从 2022.4.10 开始，所有个人 token 将只可访问 token 有权限的文档。


<table id="vcpnt" class="ne-table" style="width: 1036px"><tbody><tr style="height: 33px"><td width="188" style="background-color: #F4F5F5"><p id="uaac8ef0e" class="ne-p"><br></p></td><td width="480" style="background-color: #F4F5F5"><p id="ub3bfbba2" class="ne-p"><span class="ne-text">变更前</span></p></td><td width="368" style="background-color: #F4F5F5"><p id="u8e68cd7e" class="ne-p"><span class="ne-text">变更后</span></p></td></tr><tr style="height: 33px"><td width="188"><p id="u07a7e966" class="ne-p"><span class="ne-text">个人 token</span></p></td><td width="480"><ul class="ne-ul"><li id="u76ec3777" data-lake-index-type="0"><span class="ne-text">可以阅读和编辑个人下所有文档</span></li><li id="u54134ddb" data-lake-index-type="0"><span class="ne-text" style="background-color: #FBE4E7">可以阅读语雀上所有公开分享的文档</span></li></ul></td><td width="368"><ul class="ne-ul"><li id="u3b230593" data-lake-index-type="0"><span class="ne-text">可以阅读和编辑个人下所有文档</span></li></ul></td></tr><tr style="height: 33px"><td width="188"><p id="u9948a70b" class="ne-p"><span class="ne-text" style="text-decoration: line-through">个人 token 在空间内</span></p></td><td width="480"><ul class="ne-ul"><li id="u3cf8fb72" data-lake-index-type="0"><span class="ne-text" style="text-decoration: line-through">可以阅读和编辑账号所在团队下所有文档</span></li><li id="u86c9e423" data-lake-index-type="0"><span class="ne-text" style="background-color: #FBE4E7; text-decoration: line-through">可以阅读所在空间内所有公开文档</span></li></ul></td><td width="368"><ul class="ne-ul"><li id="ue28994a9" data-lake-index-type="0"><span class="ne-text" style="text-decoration: line-through">可以阅读和编辑账号所在团队下所有文档</span></li></ul></td></tr><tr style="height: 33px"><td width="188"><p id="u87d5e932" class="ne-p"><span class="ne-text">团队 token</span></p></td><td width="480"><ul class="ne-ul"><li id="uc7a2c8fe" data-lake-index-type="0"><span class="ne-text">可以阅读和编辑团队内所有文档</span></li></ul></td><td width="368"><ul class="ne-ul"><li id="u2392507b" data-lake-index-type="0"><span class="ne-text">可以阅读和编辑团队内所有文档</span></li></ul></td></tr></tbody></table>
