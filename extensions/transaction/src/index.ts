import snapshotExtension from '@harlem/extension-snapshot';

import {
    SENDER,
    EVENTS,
    MUTATIONS,
} from './constants';

import {
    BaseState,
    EventPayload,
    InternalStore,
    Mutator,
} from '@harlem/core';

import type {
    Transactor,
    Transaction,
    TransactionEventData,
    TransactionHookHandler,
} from './types';

export * from './types';

export default function transactionExtension<TState extends BaseState>() {
    return (store: InternalStore<TState>) => {
        store.register('extensions', 'transaction', () => ({}));

        const {
            snapshot,
        } = snapshotExtension({
            mutationName: MUTATIONS.rollback,
        })(store);

        function transaction<TPayload>(name: string, transactor: Transactor<TState, TPayload>): Transaction<TPayload> {
            const mutate = (mutator: Mutator<TState, undefined, void>) => store.write(name, SENDER, mutator);

            return ((payload: TPayload) => {
                const snap = snapshot();

                const emit = (event: string) => store.emit(event, SENDER, {
                    transaction: name,
                    payload,
                } as TransactionEventData);

                emit(EVENTS.transaction.before);

                try {
                    const providedPayload = store.providers.payload(payload) ?? payload;

                    transactor(providedPayload, mutate);
                    emit(EVENTS.transaction.success);
                } catch (error) {
                    snap.apply();
                    emit(EVENTS.transaction.error);

                    throw error;
                } finally {
                    emit(EVENTS.transaction.after);
                }
            }) as Transaction<TPayload>;
        }

        function getTransactionTrigger(eventName: string) {
            return <TPayload = any>(actionName: string | string[], handler: TransactionHookHandler<TPayload>) => {
                const transactions = ([] as string[]).concat(actionName);

                return store.on(eventName, (event?: EventPayload<TransactionEventData>) => {
                    if (event && transactions.includes(event.data.transaction)) {
                        handler(event.data);
                    }
                });
            };
        }

        const onBeforeTransaction = getTransactionTrigger(EVENTS.transaction.before);
        const onAfterTransaction = getTransactionTrigger(EVENTS.transaction.after);
        const onTransactionSuccess = getTransactionTrigger(EVENTS.transaction.success);
        const onTransactionError = getTransactionTrigger(EVENTS.transaction.error);

        return {
            transaction,
            onBeforeTransaction,
            onAfterTransaction,
            onTransactionSuccess,
            onTransactionError,
        };
    };
}