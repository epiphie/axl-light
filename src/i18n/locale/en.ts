const en = {
  ribbon: {
    tooltip: "Open Axl Light",
  },
  command: {
    highlightSelection: "Highlight selected text",
    addStickyNote: "Add sticky note to selection",
    toggleAnnotationPopovers: "Toggle annotation popovers",
    openAnnotationOverview: "Open annotation overview",
  },
  notice: {
    selectTextFirst: "Select text first.",
    copiedSelection: "Copied selection",
  },
  modal: {
    stickyNoteTitle: "Sticky note",
    typeLabel: "Type",
    noteLabel: "Note",
    notePlaceholder: "Write your thoughts...",
    save: "Save",
    cancel: "Cancel",
  },
  settings: {
    heading: "Axl Light",
    defaultHighlightColor: {
      name: "Default highlight color",
    },
    stickyNoteWidth: {
      name: "Sticky note width",
    },
    stickyNoteSide: {
      name: "Sticky note side",
      desc: "Right is the intended reader layout; left is kept as an advanced preference.",
      optionRight: "Right",
      optionLeft: "Left",
    },
    collapseStickyLane: {
      name: "Collapse sticky lane below width",
      desc: "When the editor pane is narrower than this, notes open as popovers instead of a permanent lane.",
    },
    showLeaderLines: {
      name: "Show leader lines",
    },
    defaultAuthor: {
      name: "Default author",
      fallbackAuthor: "Reader",
    },
    dataBackupFrequency: {
      name: "Data backup frequency",
      desc: "Minutes between future backup hooks. The sidecar files are still saved immediately.",
    },
    migrateOnRename: {
      name: "Migrate annotations on rename",
    },
  },
  sidebar: {
    viewName: "Axl Light",
    emptyState: "Open a Markdown or PDF file to inspect annotations.",
    countTemplate: "{highlightCount} highlights · {noteCount} notes",
    noMatches: "No matching annotations.",
    header: {
      title: "Axl Light",
      closeTitle: "Close panel",
      closeAriaLabel: "Close Axl Light panel",
    },
    search: {
      placeholder: "Search annotations...",
      filterTitle: "Filter",
    },
    filter: {
      allColors: "All colors",
      allTypes: "All types",
      typeHighlight: "highlight",
      typeNote: "note",
    },
    sort: {
      document: "document",
      newest: "newest",
      oldest: "oldest",
    },
    card: {
      modeMarkdown: "Markdown",
      pdfPage: "p.{page}",
      editNoteTitle: "Edit note",
      addNote: "Add note",
      jump: "Jump",
      delete: "Delete",
      annotationDeleted: "Annotation deleted",
      showMore: "Show more",
      showLess: "Show less",
    },
    inlineEditor: {
      placeholder: "Write your thoughts...",
      save: "Save",
      cancel: "Cancel",
    },
    export: {
      buttonLabel: "↑ Export annotations",
      exportedNotice: "Exported notes to {path}",
      footnote: "Export as Markdown summary",
    },
  },
  popover: {
    title: "Annotation",
    closeTooltip: "Close annotation popover",
    highlightOnly: "highlight only",
    fallbackAuthor: "Reader",
    emptyNote: "No sticky note attached yet.",
  },
  stickyNote: {
    modeLabel: "md",
    editTooltip: "Edit note",
    expand: "Expand",
    collapse: "Collapse",
    deleteTooltip: "Delete note",
    moreTooltip: "More",
    titlePlaceholder: "Title",
    editorPlaceholder: "Write a Markdown note...",
    save: "Save",
    cancel: "Cancel",
  },
  toolbar: {
    highlightAriaLabel: "Highlight {color}",
    addStickyNote: "Add sticky note",
    copy: "Copy",
    openOverview: "Open overview",
  },
  pdf: {
    selectTextFirst: "Select text in a PDF first.",
    pageTitle: "PDF page {page}",
    close: "Close",
  },
  export: {
    notesHeading: "Notes for {path}",
    exportedLabel: "Exported: {date}",
    highlightsHeading: "Highlights",
    stickyNotesHeading: "Sticky Notes",
    colorLabel: "Color: {color}",
    createdLabel: "Created: {date}",
    highlightItem: "- =={text}== ({color}, {date})",
    pdfPageItem: "- =={text}== (PDF page {page}, {color}, {date})",
  },
  noteTitle: {
    Insight: "💡 Insight",
    Question: "❓ Question",
    Reminder: "🔔 Reminder",
  },
  color: {
    yellow: "yellow",
    green: "green",
    blue: "blue",
    pink: "pink",
    orange: "orange",
    purple: "purple",
  },
} as const;

export default en;
