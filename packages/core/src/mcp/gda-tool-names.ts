/** Canonical MCP tool names (gda = Gemini Data Analytics API namespace). */
export const gdaToolNames = {
  dataAgents: {
    list: 'gda.data_agents.list',
    get: 'gda.data_agents.get',
    create: 'gda.data_agents.create',
    patch: 'gda.data_agents.patch',
    patchStaging: 'gda.data_agents.patch_staging',
    delete: 'gda.data_agents.delete',
    setIamPolicy: 'gda.data_agents.set_iam_policy',
    getIamPolicy: 'gda.data_agents.get_iam_policy',
    listAccessible: 'gda.data_agents.list_accessible',
    inventory: 'gda.data_agents.inventory',
    datasources: 'gda.data_agents.datasources',
    usage: 'gda.data_agents.usage',
    query: 'gda.data_agents.query',
  },
  conversations: {
    list: 'gda.conversations.list',
    create: 'gda.conversations.create',
  },
  conversationMessages: {
    list: 'gda.conversation_messages.list',
  },
  locations: {
    chat: 'gda.locations.chat',
    chatStaging: 'gda.locations.chat_staging',
  },
  operations: {
    get: 'gda.operations.get',
  },
  governanceReports: {
    generate: 'gda.governance_reports.generate',
  },
  registry: {
    generateAnalystYaml: 'gda.registry.generate_analyst_yaml',
    validateAnalystYaml: 'gda.registry.validate_analyst_yaml',
    diffAnalystYaml: 'gda.registry.diff_analyst_yaml',
    dryRunAgentChange: 'gda.registry.dry_run_agent_change',
    listAgents: 'gda.registry.list_agents',
    getAgent: 'gda.registry.get_agent',
  },
  auth: {
    inspect: 'gda.auth.inspect',
  },
  offlineEval: {
    validateCases: 'gda.offline_eval.validate_cases',
    summarizeResult: 'gda.offline_eval.summarize_result',
    run: 'gda.offline_eval.run',
  },
  sessions: {
    create: 'gda.sessions.create',
    chat: 'gda.sessions.chat',
    switchIntent: 'gda.sessions.switch_intent',
    fork: 'gda.sessions.fork',
    reset: 'gda.sessions.reset',
    handoff: 'gda.sessions.handoff',
  },
} as const;

/** Canonical MCP prompt names (analyst-mcp). */
export const gdaPromptNames = {
  switchIntent: 'gda.prompt.switch_intent',
  forkSession: 'gda.prompt.fork_session',
  resumeSession: 'gda.prompt.resume_session',
  handoffSummary: 'gda.prompt.handoff_summary',
  analyzeDataQuestion: 'gda.prompt.analyze_data_question',
  investigateDataIssue: 'gda.prompt.investigate_data_issue',
  explainGeneratedQuery: 'gda.prompt.explain_generated_query',
  compareSegments: 'gda.prompt.compare_segments',
  findAnomalies: 'gda.prompt.find_anomalies',
  prepareDataAnalysisReport: 'gda.prompt.prepare_data_analysis_report',
} as const;
