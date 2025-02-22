import InternalStore from './store';

import eventEmitter from './event-emitter';

import {
    EVENTS,
    SENDER,
} from './constants';

import {
    lock,
} from '@harlem/utilities';

import type {
    App,
    Plugin,
} from 'vue';

import type {
    BaseState,
    EventPayload,
    ExtendedStore,
    Extension,
    HarlemPlugin,
    InternalStores,
    MutationEventData,
    MutationTriggerHandler,
    PluginOptions,
    Store,
    StoreOptions,
} from './types';

export {
    EVENTS,
    INTERNAL,
} from './constants';

export * from './types';

const stores: InternalStores = new Map();

let installed = false;

function validateStoreCreation(name: string): void {
    const store = stores.get(name);

    if (store && !store.allowsOverwrite) {
        throw new Error(`A store named ${name} has already been registered.`);
    }
}

function emitCreated(store: InternalStore, state: any): void {
    /*
    This is necessary because the stores may be
    created before the plugin has been installed.
    */
    const created = () => {
        store.emit(EVENTS.ssr.initClient, SENDER, state);
        store.emit(EVENTS.store.created, SENDER, state);
        store.emit(EVENTS.ssr.initServer, SENDER, state);
        store.emit(EVENTS.devtools.update, SENDER, state);
    };

    if (installed) {
        return created();
    }

    eventEmitter.once(EVENTS.core.installed, created);
}

function getExtendedStore<TState extends BaseState, TExtensions extends Extension<TState>[]>(store: InternalStore, extensions: TExtensions): ReturnType<Extension<TState>> {
    return extensions.reduce((output, extension) => {
        let result = {};

        try {
            result = extension(store) || {};
        } catch {
            result = {};
        }

        return {
            ...output,
            ...result,
        };
    }, {});
}

function installPlugin(plugin: HarlemPlugin, app: App): void {
    if (!plugin || typeof plugin.install !== 'function') {
        return;
    }

    const {
        name,
        install,
    } = plugin;

    const lockedStores = lock(stores, [
        'set',
        'delete',
        'clear',
    ]);

    try {
        install(app, eventEmitter, lockedStores);
    } catch (error) {
        console.warn(`Failed to install Harlem plugin: ${name}. Skipping.`);
    }
}

export const on = eventEmitter.on.bind(eventEmitter);
export const once = eventEmitter.once.bind(eventEmitter);

export function createStore<TState extends BaseState, TExtensions extends Extension<TState>[]>(name: string, state: TState, options?: Partial<StoreOptions<TState, TExtensions>>): Store<TState> & ExtendedStore<TExtensions> {
    const {
        allowOverwrite,
        providers,
        extensions,
    } = {
        allowOverwrite: true,
        extensions: [store => ({})] as TExtensions,
        ...options,
    };

    validateStoreCreation(name);

    const store = new InternalStore(name, state, {
        allowOverwrite,
        providers,
    });

    const destroy = () => {
        stores.delete(name);
        store.destroy();
        store.emit(EVENTS.store.destroyed, SENDER, state);
        store.emit(EVENTS.devtools.update, SENDER, state);
    };

    const getMutationTrigger = (eventName: string) => {
        return <TPayload = any, TResult = any>(mutationName: string | string[], handler: MutationTriggerHandler<TPayload, TResult>) => {
            const mutations = ([] as string[]).concat(mutationName);

            return store.on(eventName, (event?: EventPayload<MutationEventData<TPayload, TResult>>) => {
                if (event && mutations.includes(event.data.mutation)) {
                    handler(event.data);
                }
            });
        };
    };

    const onBeforeMutation = getMutationTrigger(EVENTS.mutation.before);
    const onAfterMutation = getMutationTrigger(EVENTS.mutation.after);
    const onMutationSuccess = getMutationTrigger(EVENTS.mutation.success);
    const onMutationError = getMutationTrigger(EVENTS.mutation.error);

    const extendedStore = getExtendedStore<TState, TExtensions>(store, extensions);

    stores.set(name, store);
    emitCreated(store, state);

    return {
        destroy,
        onBeforeMutation,
        onAfterMutation,
        onMutationSuccess,
        onMutationError,
        state: store.state,
        getter: store.getter.bind(store),
        mutation: store.mutation.bind(store),
        suppress: store.suppress.bind(store),
        on: store.on.bind(store),
        once: store.once.bind(store),
        ...extendedStore,
    } as any;
}

export default {

    install(app, options?: PluginOptions) {
        const {
            plugins,
        } = {
            plugins: [],
            ...options,
        };

        if (plugins) {
            plugins.forEach(plugin => installPlugin(plugin, app));
        }

        installed = true;
        eventEmitter.emit(EVENTS.core.installed);
    },

} as Plugin;