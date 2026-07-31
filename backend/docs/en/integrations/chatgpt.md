# ChatGPT

ChatGPT connections require a remotely reachable MCP endpoint. A ChatGPT session cannot call `localhost` on your computer.

## 1. Publish OpenKB safely

Run OpenKB on a host with an HTTPS URL, for example:

```text
https://kb.example.com/mcp
```

Keep the web dashboard and MCP endpoint behind HTTPS and use an OpenKB API token. Sign in to the dashboard, open **Settings → MCP tokens**, create a token, and copy its value (Settings can show it again later). Browser login sessions and MCP bearer tokens are separate.

## 2. Add the MCP server in ChatGPT

1. Open ChatGPT **Settings**.
2. Open **Plugins**.
3. Open **MCP**.
4. Choose **Add server**.
5. Enter a name such as `OpenKB`.
6. Select **Streamable HTTP** as the transport.
7. Set the MCP server URL to `https://kb.example.com/mcp`.
8. Set the bearer token to the full `okb_...` token copied from OpenKB.
9. Save the server and start a new conversation so ChatGPT discovers the tools.

The URL must end in `/mcp`; do not use the OpenKB web URL by itself. Do not paste the token into the URL or into a chat message.

Do not select **stdio**. Stdio is for an MCP server launched as a local command; OpenKB is a remote HTTP service.

## 3. Verify

Ask ChatGPT to list the OpenKB knowledge types, then ask it to retrieve context for a project. To let ChatGPT record memories, ask it to use `openkb_remember`; the resulting proposal must be approved in the OpenKB dashboard.
