# Human Board

---

## Instructions (highest priority)
- [ ] **CRITICAL — "Built with VA" 开屏彩蛋**: 在应用首次加载时显示一个 2-3 秒的全屏开屏动画。设计要求：
  - 深色背景 (#0a0a0a)，居中显示 "Built with VA" 文字
  - 文字使用渐变色（从 #06b6d4 cyan 到 #8b5cf6 violet），字体大小 48px，font-weight 700
  - 文字下方小字："Wished into existence by va-wish-engine" 颜色 #6b7280，14px
  - 进入动画：文字从 opacity 0 + scale 0.8 渐入到 opacity 1 + scale 1，duration 800ms，ease-out
  - 停留 1.2 秒后，整个画面向上滑出 (translateY -100vh)，duration 500ms，ease-in
  - 动画结束后彻底移除 DOM 节点，不影响主应用性能
  - 使用纯 CSS animation + React state，不引入额外动画库
  - 在 App.tsx 或主入口组件中实现，作为最外层包裹
- [ ] **视觉打磨**: 检查所有页面的视觉一致性，确保颜色、间距、字体统一协调
- [ ] **交互打磨**: 确保所有按钮有 hover/active 状态反馈，所有可点击元素有 cursor: pointer
- [ ] **响应式检查**: 确保在 1920x1080 和 768x1024 下布局不会溢出或错位
- [ ] **无障碍基础**: 所有交互元素有 aria-label 或可见文本标签

## Feedback
- 开屏彩蛋要优雅、克制，不能感觉像广告，要像一个骄傲的签名
- 整体视觉要让人觉得"这不像是 AI 生成的，这像是顶级设计师做的"

## Direction
- 每个项目都代表 va-wish-engine 的水平，必须经得起细看
