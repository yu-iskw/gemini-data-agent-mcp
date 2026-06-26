export type OfficialToolAnnotations = {
  title: string;
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
};

export const annotations = {
  readOnlyExternal(title: string): OfficialToolAnnotations {
    return {
      title,
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    };
  },

  destructiveExternal(title: string): OfficialToolAnnotations {
    return {
      title,
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
    };
  },

  mutatingExternal(title: string): OfficialToolAnnotations {
    return {
      title,
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    };
  },

  localValidation(title: string): OfficialToolAnnotations {
    return {
      title,
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    };
  },
};
