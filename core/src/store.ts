import eventEmitter from './event-emitter';

import {
    EVENTS,
    SENDER,
    PROVIDERS,
} from './constants';

import {
    reactive,
    readonly,
    computed,
    effectScope,
    ComputedRef,
    EffectScope,
} from 'vue';

import type {
    BaseState,
    EventHandler,
    EventListener,
    EventPayload,
    Getter,
    InternalStore,
    InternalStoreOptions,
    Mutation,
    MutationEventData,
    Mutator,
    ReadState,
    WriteState,
    StoreProvider,
    StoreProviders,
    StoreRegistrations,
    RegistrationValueProducer,
    RegistrationType,
    StoreRegistration,
} from './types';

function localiseHandler(name: string, handler: EventHandler): EventHandler {
    return payload => {
        if (payload && payload.store === name) {
            handler(payload);
        }
    };
}

export default class Store<TState extends BaseState = any> implements InternalStore<TState> {

    private options: InternalStoreOptions<TState>;
    private flags: Map<string, unknown>;
    private scope: EffectScope;
    private stack: Set<string>;
    private isSuppressing: boolean;
    private readState: ReadState<TState>;
    private writeState: WriteState<TState>;

    public name: string;
    public registrations: StoreRegistrations;

    constructor(name: string, state: TState, options?: Partial<InternalStoreOptions<TState>>) {
        this.options = {
            allowOverwrite: true,
            ...options,

            providers: {
                ...PROVIDERS,
                ...options?.providers,
            },
        };

        this.name = name;
        this.registrations = {};
        this.flags = new Map();
        this.stack = new Set();
        this.isSuppressing = false;
        this.scope = effectScope();
        this.writeState = reactive(state) as WriteState<TState>;
        this.readState = readonly(this.writeState) as ReadState<TState>;
    }

    public get allowsOverwrite(): boolean {
        return this.options.allowOverwrite;
    }

    public get providers(): StoreProviders<TState> {
        return {
            ...PROVIDERS,
            ...this.options.providers,
        };
    }

    public get state(): ReadState<TState> {
        return this.providers.read(this.readState) ?? this.readState;
    }

    public emit(event: string, sender: string, data: any): void {
        if (!this.scope.active || this.isSuppressing) {
            return;
        }

        const payload: EventPayload = {
            data,
            sender,
            store: this.name,
        };

        eventEmitter.emit(event, payload);
    }

    public on(event: string, handler: EventHandler): EventListener {
        return eventEmitter.on(event, localiseHandler(this.name, handler));
    }

    public once(event: string, handler: EventHandler): EventListener {
        return eventEmitter.once(event, localiseHandler(this.name, handler));
    }

    public getFlag(key: string): unknown {
        return this.flags.get(key);
    }

    public setFlag(key: string, value: unknown) {
        this.flags.set(key, value);
    }

    public provider<TKey extends StoreProvider<TState>>(key: TKey, value: StoreProviders<TState>[TKey]): void {
        this.options.providers[key] = value;
    }

    public track<TResult>(callback: () => TResult): TResult {
        return this.scope.run(callback)!;
    }

    public hasRegistration(group: string, name: string): boolean {
        return !!this.registrations[group]?.has(name);
    }

    public getRegistration(group: string, name: string): StoreRegistration | undefined {
        return this.registrations[group]?.get(name);
    }

    public register(group: string, name: string, producer: RegistrationValueProducer, type: RegistrationType = 'other'): void {
        if (!(group in this.registrations)) {
            this.registrations[group] = new Map();
        }

        if (!this.allowsOverwrite && this.hasRegistration(group, name)) {
            throw new Error(`A ${group} named ${name} has already been registered on this store`);
        }

        this.registrations[group].set(name, {
            type,
            producer,
        });
    }

    public unregister(group: string, name: string): void {
        this.registrations[group]?.delete(name);
    }

    public suppress<TResult = void>(callback: () => TResult): TResult {
        this.isSuppressing = true;

        try {
            return callback();
        } finally {
            this.isSuppressing = false;
        }
    }

    public getter<TResult>(name: string, getter: Getter<TState, TResult>): ComputedRef<TResult> {
        const output = this.track(() => computed(() => getter(this.state)));

        this.register('getters', name, () => output.value, 'computed');

        return output;
    }

    private mutate<TPayload, TResult = void>(name: string, sender: string, mutator: Mutator<TState, TPayload, TResult>, payload: TPayload): TResult {
        if (!this.scope.active) {
            throw new Error('The current store has been destroyed. Mutations can no longer take place.');
        }

        if (this.stack.has(name)) {
            throw new Error('Circular mutation reference detected. Avoid calling mutations inside other mutations to prevent circular references.');
        }

        this.stack.add(name);

        let result: TResult;

        const emit = (event: string) => this.emit(event, sender, {
            mutation: name,
            payload,
            result,
        } as MutationEventData<TPayload, TResult>);

        emit(EVENTS.mutation.before);

        try {
            const providedState = this.providers.write(this.writeState) ?? this.writeState;
            const providedPayload = this.providers.payload(payload) ?? payload;

            result = mutator(providedState, providedPayload);

            emit(EVENTS.mutation.success);
        } catch (error) {
            emit(EVENTS.mutation.error);
            throw error;
        } finally {
            this.stack.delete(name);
            emit(EVENTS.mutation.after);
        }

        return result;
    }

    public mutation<TPayload, TResult = void>(name: string, mutator: Mutator<TState, TPayload, TResult>): Mutation<TPayload, TResult> {
        const mutation = ((payload: TPayload) => {
            return this.mutate(name, SENDER, mutator, payload);
        }) as Mutation<TPayload, TResult>;

        this.register('mutations', name, () => mutation);

        return mutation;
    }

    public write<TResult = void>(name: string, sender: string, mutator: Mutator<TState, undefined, TResult>, suppress?: boolean): TResult {
        const mutation = () => this.mutate(name, sender, mutator, undefined);

        return (suppress ? () => this.suppress(mutation) : mutation)();
    }

    public destroy(): void {
        this.scope.stop();
    }

}