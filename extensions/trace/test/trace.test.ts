import traceExtension from '../src';

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
    vi,
} from 'vitest';

describe('Trace Extension', () => {

    const getInstance = () => getStore({
        extensions: [
            traceExtension(),
        ],
    });

    let instance = getInstance();

    beforeAll(() => bootstrap());
    beforeEach(() => {
        instance = getInstance();
    });

    afterEach(() => instance.store.destroy());

    test('Run a trace', () => {
        const {
            store,
            setUserID,
            setUserDetails,
        } = instance;

        const {
            startTrace,
            stopTrace,
            onTraceResult,
        } = store;

        const callback = vi.fn();

        onTraceResult(callback);
        startTrace();

        setUserID(5);
        setUserDetails({
            firstName: 'John',
            lastName: 'Smith',
            age: 35,
        });

        stopTrace();

        expect(callback).toHaveBeenCalledTimes(4);
    });

});