import { gdaPromptNames, gdaToolNames } from '@gemini-data-agents/core';
import { z } from 'zod';

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

const configuredAgentNameDescription = 'Name of the configured Gemini Data Agent.';

export function registerPrompts(server: McpServer): void {
  registerSwitchIntent(server);
  registerForkSession(server);
  registerResumeSession(server);
  registerHandoffSummary(server);
  registerAnalyzeDataQuestion(server);
  registerInvestigateDataIssue(server);
  registerExplainGeneratedQuery(server);
  registerCompareSegments(server);
  registerFindAnomalies(server);
  registerPrepareDataAnalysisReport(server);
}

function registerSwitchIntent(server: McpServer): void {
  server.prompt(
    gdaPromptNames.switchIntent,
    `Guide an intentional session intent transition before calling ${gdaToolNames.sessions.switchIntent}.`,
    {
      current_intent: z.enum(['explore', 'debug', 'report', 'ad-hoc']),
      target_intent: z.enum(['explore', 'debug', 'report', 'ad-hoc']),
      constraints: z.string().optional(),
    },
    ({ current_intent, target_intent, constraints }) => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: `Prepare an intent switch from ${current_intent} to ${target_intent}.

${constraints ? `Constraints:\n${constraints}\n` : ''}
Return:
1. Why the switch is needed.
2. What context should be preserved.
3. What should be deprioritized after switching.
4. A concise reason string suitable for ${gdaToolNames.sessions.switchIntent}.reason.`,
          },
        },
      ],
    }),
  );
}

function registerForkSession(server: McpServer): void {
  server.prompt(
    gdaPromptNames.forkSession,
    'Prepare a controlled session fork with explicit branching rationale.',
    {
      session_id: z.string(),
      branch_goal: z.string(),
      branch_name_hint: z.string().optional(),
    },
    ({ session_id, branch_goal, branch_name_hint }) => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: `You are preparing to fork session ${session_id}.
Goal of branch: ${branch_goal}
${branch_name_hint ? `Branch name hint: ${branch_name_hint}\n` : ''}
Return:
1. What to preserve from the parent.
2. What to experiment with in the child branch.
3. A one-line branch rationale for audit logs.`,
          },
        },
      ],
    }),
  );
}

function registerResumeSession(server: McpServer): void {
  server.prompt(
    gdaPromptNames.resumeSession,
    'Resume a session with a compact recap and next-turn proposal.',
    {
      session_id: z.string(),
      latest_intent: z.enum(['explore', 'debug', 'report', 'ad-hoc']),
      latest_revision: z.number().int().positive(),
    },
    ({ session_id, latest_intent, latest_revision }) => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: `Resume session ${session_id} at revision ${latest_revision} with current intent ${latest_intent}.
Provide:
1. A 3-bullet recap of current context.
2. One safe next question to ask.
3. One alternate path if the main path stalls.`,
          },
        },
      ],
    }),
  );
}

function registerHandoffSummary(server: McpServer): void {
  server.prompt(
    gdaPromptNames.handoffSummary,
    'Generate a concise handoff summary for another client or user.',
    {
      session_id: z.string(),
      handoff_payload: z.string(),
    },
    ({ session_id, handoff_payload }) => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: `Create a handoff summary for session ${session_id}.

Payload:
${handoff_payload}

Format:
1. Current objective
2. Confirmed facts
3. Open questions
4. Immediate next action`,
          },
        },
      ],
    }),
  );
}

function registerAnalyzeDataQuestion(server: McpServer): void {
  server.prompt(
    gdaPromptNames.analyzeDataQuestion,
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
    gdaPromptNames.investigateDataIssue,
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
    gdaPromptNames.explainGeneratedQuery,
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
    gdaPromptNames.compareSegments,
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
    gdaPromptNames.findAnomalies,
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
    gdaPromptNames.prepareDataAnalysisReport,
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
