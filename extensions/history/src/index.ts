import {
    COMMAND_MAP,
} from './constants';

import {
    EventPayload,
    EVENTS,
    MutationEventData,
    InternalStore,
    BaseState,
} from '@harlem/core';

import traceExtension, {
    TraceResult,
} from '@harlem/extension-trace';

import {
    fromPath,
} from '@harlem/utilities';

import type {
    CommandType,
    HistoryCommand,
    MutationPayload,
    Options,
} from './types';

export * from './types';

export default function historyExtension<TState extends BaseState>(options?: Partial<Options>) {
    const {
        max,
        mutations,
    } = {
        max: 50,
        mutations: [],
        ...options,
    } as Options;

    const mutationLookup = new Map(mutations.map(({ name, description }) => [name, description]));
    const createTraceExtension = traceExtension<TState>({
        autoStart: true,
    });

    return (store: InternalStore<TState>) => {
        const {
            startTrace,
            stopTrace,
            onTraceResult,
        } = createTraceExtension(store);

        let position = 0;
        let commands = [] as HistoryCommand[];
        let results = [] as TraceResult<any>[];

        const mutation = store.mutation('$history', (state, { type, command }: MutationPayload) => {
            const tasks = COMMAND_MAP[type];

            const {
                results,
            } = command;

            results.forEach(({ gate, nodes, prop, newValue, oldValue }) => {
                const target = fromPath(state, nodes);

                if (target && prop) {
                    tasks[gate]?.(target, prop, newValue, oldValue);
                }
            });
        });

        function processResults(name: string) {
            if (results.length === 0) {
                return;
            }

            if (commands.length >= max) {
                commands.shift();
            }

            commands.push({
                name,
                results: Array.from(results),
            });

            results = [];
            position = commands.length - 1;
        }

        store.on(EVENTS.mutation.before, (event?: EventPayload<MutationEventData>) => {
            if (!event || event.data.mutation.startsWith('$') || (mutationLookup.size > 0 && !mutationLookup.has(event.data.mutation))) {
                return;
            }

            startTrace([
                'set',
                'deleteProperty',
            ]);

            const listener = onTraceResult(result => results.push(result));

            store.once(EVENTS.mutation.after, () => {
                stopTrace();
                processResults(event.data.mutation);

                listener.dispose();
            });
        });

        function run(type: CommandType, offset: number) {
            const command = commands[position];

            if (!command) {
                return;
            }

            mutation({
                type,
                command,
            });

            position = Math.max(0, Math.min(commands.length - 1, position + offset));
        }

        function undo() {
            run('undo', -1);
        }

        function redo() {
            run('exec', 1);
        }

        function clearHistory() {
            position = 0;
            commands = [];
            results = [];
        }

        return {
            undo,
            redo,
            clearHistory,
        };
    };
}