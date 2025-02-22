import {
    clone,
} from '@harlem/utilities';

import type {
    StoreProviders,
} from './types';

export const SENDER = 'core';

export const EVENTS = {
    core: {
        installed: 'core:installed',
    },
    store: {
        created: 'store:created',
        destroyed: 'store:destroyed',
    },
    mutation: {
        before: 'mutation:before',
        after: 'mutation:after',
        success: 'mutation:success',
        error: 'mutation:error',
    },
    ssr: {
        initServer: 'ssr:init:server',
        initClient: 'ssr:init:client',
    },
    devtools: {
        update: 'devtools:update',
    },
} as const;

export const PROVIDERS = {
    read: value => value,
    write: value => value,
    payload: value => clone(value),
} as StoreProviders<any>;

export const INTERNAL = {
    prefix: '$harlem:',
    pattern: /^\$harlem:/,
} as const;