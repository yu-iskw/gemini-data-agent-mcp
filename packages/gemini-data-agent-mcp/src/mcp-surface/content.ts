import type { GoogleApiResponse } from '../types.js';

interface DiagnosticsInfo {
  agent: string;
  api_version: string;
  latency_ms: number;
  operation_name?: string;
}

export function formatQueryDataResponse(
  response: GoogleApiResponse,
  diagnostics: DiagnosticsInfo,
): string {
  const normalizedResponse = normalizeQueryLikeResponse(response);
  const sections: string[] = [];

  const answer = normalizedResponse['naturalLanguageAnswer'] as string | undefined;
  if (answer) {
    sections.push(`Answer\n------\n${answer}`);
  }

  const query = normalizedResponse['generatedQuery'] as string | undefined;
  if (query) {
    sections.push(`Generated Query\n---------------\n${query}`);
  }

  const explanation = normalizedResponse['intentExplanation'] as string | undefined;
  if (explanation) {
    sections.push(`Intent Explanation\n------------------\n${explanation}`);
  }

  const queryResult = normalizedResponse['queryResult'];
  if (queryResult !== undefined && queryResult !== null) {
    const resultText =
      typeof queryResult === 'string' ? queryResult : JSON.stringify(queryResult, null, 2);
    sections.push(`Result\n------\n${resultText}`);
  }

  const disambiguation = normalizedResponse['disambiguationQuestion'];
  if (disambiguation !== undefined && disambiguation !== null) {
    const disText =
      typeof disambiguation === 'string' ? disambiguation : JSON.stringify(disambiguation, null, 2);
    sections.push(`Disambiguation Questions\n------------------------\n${disText}`);
  } else {
    sections.push(`Disambiguation Questions\n------------------------\nNone returned.`);
  }

  sections.push(
    `Diagnostics\n-----------\nagent: ${diagnostics.agent}\napi_version: ${diagnostics.api_version}\nlatency_ms: ${diagnostics.latency_ms}${
      diagnostics.operation_name ? `\noperation_name: ${diagnostics.operation_name}` : ''
    }`,
  );

  return sections.join('\n\n');
}

function normalizeQueryLikeResponse(response: GoogleApiResponse): GoogleApiResponse {
  if (!Array.isArray(response)) {
    return response;
  }

  const chatEvents = response as Array<Record<string, unknown>>;
  const textParts: string[] = [];

  for (const event of chatEvents) {
    const systemMessage = event['systemMessage'] as Record<string, unknown> | undefined;
    const text = systemMessage?.['text'] as Record<string, unknown> | undefined;
    const parts = text?.['parts'] as unknown[] | undefined;
    if (!parts) {
      continue;
    }
    for (const part of parts) {
      if (typeof part === 'string' && part.length > 0) {
        textParts.push(part);
      }
    }
  }

  return {
    naturalLanguageAnswer: textParts.join('\n').trim(),
    queryResult: chatEvents,
  };
}

export function formatOperationResponse(
  response: GoogleApiResponse,
  diagnostics: DiagnosticsInfo,
): string {
  const sections: string[] = [];

  const name = response['name'] as string | undefined;
  if (name) {
    sections.push(`Operation Name\n--------------\n${name}`);
  }

  const done = response['done'] as boolean | undefined;
  sections.push(`Status\n------\n${done ? 'Done' : 'In Progress'}`);

  const metadata = response['metadata'];
  if (metadata) {
    sections.push(`Metadata\n--------\n${JSON.stringify(metadata, null, 2)}`);
  }

  const error = response['error'];
  if (error) {
    sections.push(`Error\n-----\n${JSON.stringify(error, null, 2)}`);
  }

  const opResponse = response['response'];
  if (opResponse) {
    sections.push(`Result\n------\n${JSON.stringify(opResponse, null, 2)}`);
  }

  sections.push(
    `Diagnostics\n-----------\nagent: ${diagnostics.agent}\napi_version: ${diagnostics.api_version}\nlatency_ms: ${diagnostics.latency_ms}`,
  );

  return sections.join('\n\n');
}

export function formatConfigResponse(agentName: string, config: Record<string, unknown>): string {
  return `Agent: ${agentName}\n\n${JSON.stringify(config, null, 2)}`;
}

export function formatAgentList(
  agents: Array<{ name: string; display_name?: string; description?: string; api_version: string }>,
): string {
  if (agents.length === 0) {
    return 'No agents configured.';
  }

  const lines = agents.map((a) => {
    const displayName = a.display_name ? ` (${a.display_name})` : '';
    const desc = a.description ? `\n    ${a.description}` : '';
    return `- ${a.name}${displayName} [${a.api_version}]${desc}`;
  });

  return `Configured Agents (${agents.length})\n\n${lines.join('\n')}`;
}

export function formatConversationCreated(
  response: GoogleApiResponse,
  diagnostics: DiagnosticsInfo,
): string {
  const conversationName = response['name'] as string | undefined;
  const sections: string[] = [];

  if (conversationName) {
    sections.push(`Conversation\n------------\n${conversationName}`);
  }
  sections.push(`Response\n--------\n${JSON.stringify(response, null, 2)}`);
  sections.push(
    `Diagnostics\n-----------\nagent: ${diagnostics.agent}\napi_version: ${diagnostics.api_version}\nlatency_ms: ${diagnostics.latency_ms}`,
  );
  return sections.join('\n\n');
}

export function formatConversationMessages(
  response: GoogleApiResponse,
  diagnostics: DiagnosticsInfo,
): string {
  const messages = (response['messages'] as unknown[]) ?? [];
  const nextPageToken = response['nextPageToken'] as string | undefined;
  const sections: string[] = [];

  sections.push(`Message Count\n-------------\n${messages.length}`);
  sections.push(`Messages\n--------\n${JSON.stringify(messages, null, 2)}`);
  if (nextPageToken) {
    sections.push(`Next Page Token\n---------------\n${nextPageToken}`);
  }
  sections.push(
    `Diagnostics\n-----------\nagent: ${diagnostics.agent}\napi_version: ${diagnostics.api_version}\nlatency_ms: ${diagnostics.latency_ms}`,
  );
  return sections.join('\n\n');
}
