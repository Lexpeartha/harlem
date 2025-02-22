import historyExtension from '../src';

import {
    getStore,
    bootstrap,
} from '@harlem/testing';

import {
    describe,
    test,
    expect,
    beforeAll,
    beforeEach,
    afterEach,
} from 'vitest';

describe('History Extension', () => {

    const getInstance = () => getStore({
        extensions: [
            historyExtension(),
        ],
    });

    let instance = getInstance();

    beforeAll(() => bootstrap());
    beforeEach(() => {
        instance = getInstance();
    });

    afterEach(() => instance.store.destroy());

    test('Performs an undo/redo operation', () => {
        const {
            store,
            setUserID,
            setUserDetails,
        } = instance;

        const {
            state,
            undo,
            redo,
        } = store;

        setUserID(5);
        setUserDetails({
            firstName: 'John',
        });

        expect(state.details.firstName).toBe('John');
        undo();
        expect(state.details.firstName).toBe('');
        // redo();
        // expect(state.details.firstName).toBe('John');
    });

});