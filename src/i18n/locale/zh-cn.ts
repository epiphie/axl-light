import type en from "./en";

const zhCN: Record<keyof typeof en, unknown> = {
  ribbon: {
    tooltip: "打开 Axl Light",
  },
  command: {
    highlightSelection: "高亮选中文本",
    addStickyNote: "为选中文本添加便签",
    toggleAnnotationPopovers: "切换批注弹窗",
    openAnnotationOverview: "打开批注总览",
  },
  notice: {
    selectTextFirst: "请先选择文本。",
    copiedSelection: "已复制选中内容",
  },
  modal: {
    stickyNoteTitle: "便签",
    typeLabel: "类型",
    noteLabel: "备注",
    notePlaceholder: "写下你的想法...",
    save: "保存",
    cancel: "取消",
  },
  settings: {
    heading: "Axl Light",
    defaultHighlightColor: {
      name: "默认高亮颜色",
    },
    stickyNoteWidth: {
      name: "便签宽度",
    },
    stickyNoteSide: {
      name: "便签侧边",
      desc: "右侧是推荐的阅读布局；左侧保留为高级偏好。",
      optionRight: "右侧",
      optionLeft: "左侧",
    },
    collapseStickyLane: {
      name: "便签栏折叠宽度阈值",
      desc: "当编辑器窗口宽度低于此值时，便签将以弹窗而非常驻侧栏的形式显示。",
    },
    showLeaderLines: {
      name: "显示连接线",
    },
    defaultAuthor: {
      name: "默认作者",
      fallbackAuthor: "读者",
    },
    dataBackupFrequency: {
      name: "数据备份频率",
      desc: "未来备份钩子之间的分钟数。边车文件仍会立即保存。",
    },
    migrateOnRename: {
      name: "重命名时迁移批注",
    },
  },
  sidebar: {
    viewName: "Axl Light",
    emptyState: "打开 Markdown 或 PDF 文件以查看批注。",
    countTemplate: "{highlightCount} 条高亮 · {noteCount} 条笔记",
    noMatches: "没有匹配的批注。",
    header: {
      title: "Axl Light",
      closeTitle: "关闭面板",
      closeAriaLabel: "关闭 Axl Light 面板",
    },
    search: {
      placeholder: "搜索批注...",
      filterTitle: "筛选",
    },
    filter: {
      allColors: "所有颜色",
      allTypes: "所有类型",
      typeHighlight: "高亮",
      typeNote: "笔记",
    },
    sort: {
      document: "文档顺序",
      newest: "最新优先",
      oldest: "最早优先",
    },
    card: {
      modeMarkdown: "Markdown",
      pdfPage: "第{page}页",
      editNoteTitle: "编辑笔记",
      addNote: "添加笔记",
      jump: "跳转",
      delete: "删除",
      annotationDeleted: "批注已删除",
      showMore: "展开更多",
      showLess: "收起",
    },
    inlineEditor: {
      placeholder: "写下你的想法...",
      save: "保存",
      cancel: "取消",
    },
    export: {
      buttonLabel: "↑ 导出批注",
      exportedNotice: "已导出批注至 {path}",
      footnote: "导出为 Markdown 摘要",
    },
  },
  popover: {
    title: "批注",
    closeTooltip: "关闭批注弹窗",
    highlightOnly: "仅高亮",
    fallbackAuthor: "读者",
    emptyNote: "尚无附加便签。",
  },
  stickyNote: {
    modeLabel: "md",
    editTooltip: "编辑笔记",
    expand: "展开",
    collapse: "折叠",
    deleteTooltip: "删除笔记",
    moreTooltip: "更多",
    titlePlaceholder: "标题",
    editorPlaceholder: "写下 Markdown 笔记...",
    save: "保存",
    cancel: "取消",
  },
  toolbar: {
    highlightAriaLabel: "以{color}高亮",
    addStickyNote: "添加便签",
    copy: "复制",
    openOverview: "打开总览",
  },
  pdf: {
    selectTextFirst: "请先在 PDF 中选择文本。",
    pageTitle: "PDF 第{page}页",
    close: "关闭",
  },
  export: {
    notesHeading: "批注：{path}",
    exportedLabel: "导出时间：{date}",
    highlightsHeading: "高亮",
    stickyNotesHeading: "便签",
    colorLabel: "颜色：{color}",
    createdLabel: "创建时间：{date}",
    highlightItem: "- =={text}== ({color}, {date})",
    pdfPageItem: "- =={text}== (PDF 第{page}页, {color}, {date})",
  },
  noteTitle: {
    Insight: "💡 洞见",
    Question: "❓ 问题",
    Reminder: "🔔 提醒",
  },
  color: {
    yellow: "黄色",
    green: "绿色",
    blue: "蓝色",
    pink: "粉色",
    orange: "橙色",
    purple: "紫色",
  },
};

export default zhCN;
