import { z } from 'zod';

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

const configuredAgentNameDescription = 'Name of the configured Gemini Data Agent.';

export function registerPrompts(server: McpServer): void {
  registerAnalyzeDataQuestion(server);
  registerInvestigateDataIssue(server);
  registerExplainGeneratedQuery(server);
  registerCompareSegments(server);
  registerFindAnomalies(server);
  registerPrepareDataAnalysisReport(server);
}

function registerAnalyzeDataQuestion(server: McpServer): void {
  server.prompt(
    'analyze_data_question',
    'Use a configured Gemini Data Agent to answer a direct analytical question.',
    {
      agent: z.string().describe(configuredAgentNameDescription),
      question: z.string().describe('The analytical question to answer.'),
    },
    ({ agent, question }) => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: `Use the configured Gemini Data Agent named ${agent} to answer the following analytical question:

${question}

After receiving the response:
1. Report the natural-language answer.
2. Inspect the generated query if present.
3. Explain whether the query appears aligned with the question.
4. Mention disambiguation questions if the data agent returned any.
5. Avoid inventing facts not present in the response.`,
          },
        },
      ],
    }),
  );
}

function registerInvestigateDataIssue(server: McpServer): void {
  server.prompt(
    'investigate_data_issue',
    'Multi-step investigation of a data issue using a Gemini Data Agent.',
    {
      agent: z.string().describe(configuredAgentNameDescription),
      issue: z.string().describe('The data issue to investigate.'),
    },
    ({ agent, issue }) => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: `Investigate the issue using the Gemini Data Agent named ${agent}.

Issue:
${issue}

Recommended workflow:
1. Ask the data agent for the primary drivers.
2. Review generated query and result fields.
3. Ask one follow-up question if the answer is ambiguous.
4. Summarize findings, evidence, and remaining uncertainty.`,
          },
        },
      ],
    }),
  );
}

function registerExplainGeneratedQuery(server: McpServer): void {
  server.prompt(
    'explain_generated_query',
    'Explain a generated query from a Gemini Data Agent response and assess whether it supports the answer.',
    {
      response: z.string().describe('The full Gemini Data Agent response text.'),
    },
    ({ response }) => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: `Given the Gemini Data Agent response below, explain the generated query and whether it supports the answer.

Response:
${response}`,
          },
        },
      ],
    }),
  );
}

function registerCompareSegments(server: McpServer): void {
  server.prompt(
    'compare_segments',
    'Compare two segments using a Gemini Data Agent.',
    {
      agent: z.string().describe(configuredAgentNameDescription),
      segment_a: z.string().describe('First segment to compare.'),
      segment_b: z.string().describe('Second segment to compare.'),
      metric: z.string().describe('Metric to compare across segments.'),
      time_period: z.string().describe('Time period for the comparison.'),
    },
    ({ agent, segment_a, segment_b, metric, time_period }) => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: `Use the Gemini Data Agent named ${agent} to compare these segments:

Segment A: ${segment_a}
Segment B: ${segment_b}
Metric: ${metric}
Time period: ${time_period}

Return key differences, likely drivers, and any caveats from the response.`,
          },
        },
      ],
    }),
  );
}

function registerFindAnomalies(server: McpServer): void {
  server.prompt(
    'find_anomalies',
    'Identify anomalies in a metric using a Gemini Data Agent.',
    {
      agent: z.string().describe(configuredAgentNameDescription),
      metric: z.string().describe('Metric to analyze for anomalies.'),
      time_period: z.string().describe('Time period to check.'),
      dimensions: z.string().describe('Dimensions to check for anomalies.'),
    },
    ({ agent, metric, time_period, dimensions }) => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: `Use the Gemini Data Agent named ${agent} to identify anomalies in:

Metric: ${metric}
Time period: ${time_period}
Dimensions to check: ${dimensions}

Return anomalies, supporting evidence, and recommended follow-up questions.`,
          },
        },
      ],
    }),
  );
}

function registerPrepareDataAnalysisReport(server: McpServer): void {
  server.prompt(
    'prepare_data_analysis_report',
    'Prepare a structured data analysis report from Gemini Data Agent outputs.',
    {
      outputs: z.string().describe('The Gemini Data Agent outputs to summarize into a report.'),
    },
    ({ outputs }) => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: `Prepare a concise data-analysis report from the Gemini Data Agent outputs below.

Outputs:
${outputs}

Report sections:
1. Executive summary
2. Evidence
3. Generated queries reviewed
4. Caveats and ambiguity
5. Recommended next steps`,
          },
        },
      ],
    }),
  );
}
