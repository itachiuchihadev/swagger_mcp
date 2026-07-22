# @abhishekkumar00019/swagger-mcp

[![npm version](https://img.shields.io/npm/v/@abhishekkumar00019/swagger-mcp.svg)](https://www.npmjs.com/package/@abhishekkumar00019/swagger-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![MCP Compatible](https://img.shields.io/badge/MCP-Compatible-blue.svg)](https://modelcontextprotocol.io)

> A dynamic [Model Context Protocol (MCP)](https://modelcontextprotocol.io) server that converts any Swagger 2.0 or OpenAPI 3.x specification into callable MCP tools on the fly.

Point it at any OpenAPI/Swagger JSON or YAML spec URL, and every API endpoint automatically becomes an interactive tool for Claude, Copilot, ChatGPT, Cursor, Windsurf, and other MCP-enabled clients.

---

## ✨ Features

- 🔄 **Dynamic Tool Generation** — Automatically parses Swagger 2.0 & OpenAPI 3.x specs at startup.
- 🛠️ **Zero Boilerplate** — Give it a spec URL and every endpoint is instantly exposed as an MCP tool.
- 🔐 **Flexible Auth Support** — Bearer Tokens, API Keys, and Basic Auth configured effortlessly via env vars or CLI flags.
- 🌐 **Smart Base URL Resolution** — Auto-derives base URL from config → spec server definition → spec origin URL.
- 🔁 **Hot Reloading** — Re-fetch and re-parse the spec live at runtime using the `_swagger_mcp_reload` tool.
- 📝 **Rich Schemas & Descriptions** — Translates OpenAPI parameters and request bodies into strict JSON schemas for precise LLM tool calling.
- ⏱️ **Configurable Timeouts & Custom Headers** — Easily set custom request headers and request timeout thresholds.

---

## 🚀 Quick Start

### Option A: Direct via `npx` (No Installation Required)

```bash
SWAGGER_MCP_SPEC_URL=https://petstore.swagger.io/v2/swagger.json npx @abhishekkumar00019/swagger-mcp
```

### Option B: Global NPM Installation

```bash
npm install -g @abhishekkumar00019/swagger-mcp

SWAGGER_MCP_SPEC_URL=https://petstore.swagger.io/v2/swagger.json swagger-mcp
```

### Option C: Local Repository Setup

1. **Clone & Install Dependencies:**
   ```bash
   git clone https://github.com/itachiuchihadev/swagger-mcp.git
   cd swagger-mcp
   npm install
   ```

2. **Build the Project:**
   ```bash
   npm run build
   ```

3. **Run locally:**
   ```bash
   SWAGGER_MCP_SPEC_URL=https://petstore.swagger.io/v2/swagger.json node dist/index.js
   ```

---

## ⚙️ MCP Client Configurations

Below are sample configurations for popular MCP clients using `npx @abhishekkumar00019/swagger-mcp`.

### 1. Claude Desktop

Add to your `claude_desktop_config.json`:
- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "swagger-mcp": {
      "command": "npx",
      "args": ["-y", "@abhishekkumar00019/swagger-mcp"],
      "env": {
        "SWAGGER_MCP_SPEC_URL": "https://petstore.swagger.io/v2/swagger.json",
        "SWAGGER_MCP_BEARER_TOKEN": "your-api-token-here"
      }
    }
  }
}
```

---

### 2. Claude Code (CLI)

Add directly via the Claude Code CLI:

```bash
claude mcp add swagger-mcp -- npx -y @abhishekkumar00019/swagger-mcp --spec-url https://petstore.swagger.io/v2/swagger.json
```

Or add to `.mcp.json` in your project root:

```json
{
  "mcpServers": {
    "swagger-mcp": {
      "command": "npx",
      "args": ["-y", "@abhishekkumar00019/swagger-mcp"],
      "env": {
        "SWAGGER_MCP_SPEC_URL": "https://petstore.swagger.io/v2/swagger.json"
      }
    }
  }
}
```

---

### 3. GitHub Copilot / VS Code

Add to `.vscode/mcp.json` in your workspace or global VS Code settings:

```json
{
  "mcpServers": {
    "swagger-mcp": {
      "command": "npx",
      "args": ["-y", "@abhishekkumar00019/swagger-mcp"],
      "env": {
        "SWAGGER_MCP_SPEC_URL": "https://petstore.swagger.io/v2/swagger.json",
        "SWAGGER_MCP_API_KEY": "your-api-key"
      }
    }
  }
}
```

---

### 4. Cursor

Add to `.cursor/mcp.json` or configure in **Cursor Settings → Features → MCP**:

```json
{
  "mcpServers": {
    "swagger-mcp": {
      "command": "npx",
      "args": ["-y", "@abhishekkumar00019/swagger-mcp"],
      "env": {
        "SWAGGER_MCP_SPEC_URL": "https://petstore.swagger.io/v2/swagger.json"
      }
    }
  }
}
```

---

### 5. Windsurf

Add to `~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "swagger-mcp": {
      "command": "npx",
      "args": ["-y", "@abhishekkumar00019/swagger-mcp"],
      "env": {
        "SWAGGER_MCP_SPEC_URL": "https://petstore.swagger.io/v2/swagger.json"
      }
    }
  }
}
```

---

### 6. Roo Code / Cline (VS Code Extension)

Add to `cline_mcp_settings.json` (or `roo_code_mcp_settings.json`):

```json
{
  "mcpServers": {
    "swagger-mcp": {
      "command": "npx",
      "args": ["-y", "@abhishekkumar00019/swagger-mcp"],
      "env": {
        "SWAGGER_MCP_SPEC_URL": "https://petstore.swagger.io/v2/swagger.json"
      }
    }
  }
}
```

---

### 7. ChatGPT & OpenAI (Custom GPTs / Assistants / API)

**Direct OpenAPI Spec Import (Native Custom GPT Actions):**
ChatGPT Custom GPTs support OpenAPI specifications natively. You can directly import your Swagger/OpenAPI JSON/YAML spec URL in the **Actions** section of the Custom GPT Builder without needing an intermediate server.

**Via MCP HTTP/SSE Gateway:**
If connecting ChatGPT or OpenAI agents to this MCP server via an HTTP/SSE bridge (e.g., using `supergateway` or `mcp-remote`), start `swagger-mcp` with an SSE proxy:

```bash
npx supergateway --stdio "npx -y @abhishekkumar00019/swagger-mcp --spec-url https://petstore.swagger.io/v2/swagger.json" --port 8000
```

---

### 8. Zed Editor

Add to `~/.config/zed/settings.json`:

```json
{
  "context_servers": {
    "swagger-mcp": {
      "command": {
        "path": "npx",
        "args": ["-y", "@abhishekkumar00019/swagger-mcp"]
      },
      "env": {
        "SWAGGER_MCP_SPEC_URL": "https://petstore.swagger.io/v2/swagger.json"
      }
    }
  }
}
```

---

## 🔧 Configuration Reference

All configuration parameters can be supplied via environment variables or CLI arguments. **`SWAGGER_MCP_SPEC_URL` is the only required parameter.**

| Environment Variable | CLI Argument | Required | Default | Description |
|---|---|---|---|---|
| `SWAGGER_MCP_SPEC_URL` | `--spec-url` | Yes | — | Swagger/OpenAPI spec URL |
| `SWAGGER_MCP_BASE_URL` | `--base-url` | No | Auto-derived | Override target API base URL |
| `SWAGGER_MCP_BEARER_TOKEN` | `--bearer-token` | No | — | Bearer token for `Authorization: Bearer <token>` |
| `SWAGGER_MCP_API_KEY` | `--api-key` | No | — | API Key header value |
| `SWAGGER_MCP_API_KEY_HEADER` | `--api-key-header` | No | `X-API-Key` | Custom header name for API Key |
| `SWAGGER_MCP_BASIC_USER` | `--basic-user` | No | — | Username for Basic Auth |
| `SWAGGER_MCP_BASIC_PASS` | `--basic-pass` | No | — | Password for Basic Auth |
| `SWAGGER_MCP_TIMEOUT` | `--timeout` | No | `30000` | HTTP request timeout in milliseconds |
| `SWAGGER_MCP_HEADERS` | `--headers` | No | `{}` | Extra HTTP headers as JSON string |

---

### 🔑 Authentication Examples

Multiple authentication methods can be set simultaneously:

```bash
# Bearer Token
SWAGGER_MCP_BEARER_TOKEN=sk-your-token-here

# API Key (Custom Header)
SWAGGER_MCP_API_KEY=your-api-key
SWAGGER_MCP_API_KEY_HEADER=X-Custom-Key

# Basic Auth
SWAGGER_MCP_BASIC_USER=admin
SWAGGER_MCP_BASIC_PASS=secret123
```

> [!NOTE]
> If both Bearer and Basic Auth are specified, Basic Auth will overwrite the `Authorization` header. Combine Bearer Token with API Key headers if multiple headers are required.

---

## 🏷️ Tool Naming Strategy

Endpoints from your OpenAPI spec are converted into MCP tools using the following priority order:

| Priority | Source | Example |
|---|---|---|
| **1st** | `operationId` defined in spec | `getUserById` |
| **2nd** | Tag + Method + Path | `users_get_by_id` |
| **3rd** | Method + Path | `get_api_v1_users_by_id` |

---

## 🧰 Built-in Meta Tools

| Tool | Description |
|---|---|
| `_swagger_mcp_reload` | Re-fetches and parses the Swagger spec live. Useful when developing or updating APIs without restarting the server. |

---

## 📁 Project Structure

```text
swagger-mcp/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts              # Entry point & CLI argument parser
│   ├── server.ts             # MCP server initialization & tool registration
│   ├── swagger-parser.ts     # OpenAPI 2.0/3.x spec fetcher & parser
│   ├── tool-builder.ts       # Converts OpenAPI operations -> JSON Schema tools
│   ├── request-handler.ts    # Proxies MCP tool calls to HTTP endpoints
│   ├── auth.ts               # Authentication header builder
│   ├── config.ts             # Environment & CLI configuration manager
│   └── types.ts              # Shared TypeScript interfaces
└── dist/                     # Compiled JavaScript output
```

---

## 📄 License

[MIT](LICENSE)