# Aittco GPT Chat Completions Design

Date: 2026-08-02
Status: approved for specification review

## Goal

Route the three Aittco GPT product models through the relay's OpenAI Chat
Completions endpoint instead of its non-responsive Responses endpoint.

## Scope

The affected product models are `GPT-5.6-sol`, `GPT-5.6-terra`, and `GPT-5.5`.
Their product model keys, upstream model names, route keys, prices, display
metadata, CredentialVault credential, and `https://api.aittco.com` base URL
remain unchanged. Gemini continues to use GenerateContent and Claude continues
to use Messages.

## Design

The Aittco plugin manifest will label the GPT routes with protocol
`chat-completions` and path `/v1/chat/completions`. The Aittco text relay
adapter will add this protocol to its dispatch type and build a request body:

```json
{
  "model": "<upstream model>",
  "messages": [{ "role": "user", "content": "..." }],
  "max_tokens": 2048,
  "temperature": 0.7
}
```

System messages remain system messages. Assistant and user messages retain
their roles. The adapter omits optional fields only when they are not supplied.
It parses generated text from `choices[].message.content`, accepting either a
string or content-part arrays, and maps standard Chat Completions usage fields:
`prompt_tokens`, `completion_tokens`, and `total_tokens`.

The existing request summary remains secret-free and continues to report only
the protocol, upstream model, route key, URL, and message count.

## Error Handling

Existing error classification remains unchanged: 401/403 become
`PROVIDER_AUTH_FAILED`, 429 becomes `PROVIDER_RATE_LIMIT`, other 4xx become
`PROVIDER_BAD_REQUEST`, 5xx become `PROVIDER_INTERNAL_ERROR`, and timeout
becomes `PROVIDER_TIMEOUT`. A successful response without parseable assistant
text becomes `PROVIDER_INVALID_RESPONSE`.

## Validation

Tests will first assert the Chat Completions URL, body, string/content-array
response parsing, and usage mapping. The prior Responses-specific test will be
replaced. Gemini and Claude regression tests will remain unchanged. The plugin
registry test will assert that all three GPT routes use `chat-completions` and
`/v1/chat/completions`.

No database migration, browser-side API key, or Compose environment variable is
required. The deployment will update existing plugin routes through the
authenticated plugin install API and test all eight routes with the shared key.
