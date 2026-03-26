# Paperclip Plugins

Plugins for the [Paperclip](https://github.com/paperclipai/paperclip) AI agent platform.

## Plugins

| Plugin | Description |
|--------|-------------|
| [`knowledge-base`](plugins/knowledge-base) | Agent knowledge base — store and query documents, grants per agent |
| [`system-garden`](plugins/system-garden) | System health dashboard — visualize agent activity and issue flow |
| [`tool-registry`](plugins/tool-registry) | Register external CLI tools and grant access per agent |
| [`work-board`](plugins/work-board) | Mission Board — kanban-style issue tracking by label groups |
| [`workflow-engine`](plugins/workflow-engine) | DAG-based workflow automation — schedule, trigger, and orchestrate multi-step agent tasks |

## Usage

Each plugin is a self-contained Paperclip plugin package. To install:

```bash
cd plugins/<plugin-name>
npm install
npm run build
```

Then load the built plugin via the Paperclip UI or CLI.

## Requirements

- [Paperclip](https://github.com/paperclipai/paperclip) instance
- Node.js 18+
- `@paperclipai/plugin-sdk`
