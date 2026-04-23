export const IPC = {
  CAMPAIGN: {
    LIST:   'campaign:list',
    GET:    'campaign:get',
    CREATE: 'campaign:create',
    UPDATE: 'campaign:update',
    DELETE: 'campaign:delete',
  },
  DEAL: {
    LIST:   'deal:list',
    CREATE: 'deal:create',
    UPDATE: 'deal:update',
    DELETE: 'deal:delete',
  },
  PERFORMANCE: {
    QUERY:  'performance:query',
    IMPORT: 'performance:import',
  },
  DIALOG: {
    OPEN_FILE: 'dialog:open-file',
    SAVE_FILE: 'dialog:save-file',
  },
  DB: {
    BACKUP: 'db:backup',
  },
} as const