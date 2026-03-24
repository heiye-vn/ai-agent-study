/** @type {import('prettier').Config & import('prettier-plugin-tailwindcss').PluginOptions} */
export default {
    plugins: ["prettier-plugin-tailwindcss"],
    // --- 基础布局 ---
    printWidth: 100,   // 单行最大长度：100字符 (现代屏幕宽，80太窄，120太长，100刚好)
    tabWidth: 2,  // 缩进空格数：2个空格 (前端主流标准)
    useTabs: false,   // 是否使用 Tab 缩进：false (使用空格，保证不同编辑器显示一致)
    semi: true,   // 语句末尾是否加分号：true (推荐加上，避免 ASI 自动分号推断导致的潜在 Bug)
    singleAttributePerLine: true, // 当 HTML/JSX 标签属性超过 1 个时，是否强制每个属性独占一行

    // --- 引号风格 ---
    singleQuote: true,  // 字符串使用单引号：true (JS/TS 社区习惯，双引号留给 JSX 属性)
    quoteProps: 'as-needed',    // 对象属性名何时加引号：'as-needed' (只有当属性名包含特殊字符或关键字时才加引号)
    jsxSingleQuote: false,   // JSX 中的属性是否使用单引号：false (React 惯例，JSX 属性通常用双引号，如 className="box")

    // --- 逗号与括号 ---
    trailingComma: 'es5',   // 尾随逗号：'es5' (在多行对象/数组最后一项后加逗号，方便 Git 对比，ES5 兼容)
    bracketSpacing: true,    // 对象大括号内是否加空格：true ({ foo: bar } 比 {foo: bar} 更易读)
    bracketSameLine: false, // JSX 标签的闭合括号是否换行：false (<div>\n  content\n</div> 更紧凑)

    // --- 箭头函数 ---
    arrowParens: 'always',  // 箭头函数参数是否始终加括号：'always' ((x) => x 而非 x => x，方便以后加类型注解)

    // --- 其他 ---
    htmlWhitespaceSensitivity: 'css',  // HTML 空白敏感度按 CSS 规则处理
    endOfLine: 'lf',    // 换行符：'lf' (Unix 风格，Git 默认，避免 Windows 下出现 ^M 问题)
    proseWrap: 'preserve',  // Markdown 文本换行策略：'preserve' (保持原文换行，不强制合并)
    embeddedLanguageFormatting: 'auto' // 自动格式化模板字符串中的 CSS/HTML 等嵌入语言
};