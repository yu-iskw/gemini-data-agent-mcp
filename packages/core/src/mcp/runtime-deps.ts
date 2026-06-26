import { createRoleGoogleClients } from './role-clients.js';

/** Indirection for role client creation so integration tests can inject fake transport. */
export const mcpRuntimeDeps = {
  createRoleGoogleClients,
};
